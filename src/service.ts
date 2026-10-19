import { z } from 'zod';
import { assertPrivateOutput } from './privacy.ts';
import { rules, sources, selectRules } from './rules.ts';
import { scopeSchema, checkScope } from './scope.ts';
import { incomeSchema, deductionsSchema, computeReturn } from './engine.ts';
export const DISCLAIMER_VERSION = '2026-10-19.2';
export const CAUTION = 'Development preview. Verify before filing. Not IRD-approved; not tax advice.';
export const DISCLAIMER = `${CAUTION} This preview only estimates local employment, user-supplied local business net profit, interest, gross investment rent, final-WHT resident-company dividends and supported local reliefs and donations for resident individuals. Eligibility and evidence must be confirmed by you. Ambiguous donation caps and unsupported scenarios are refused. It does not file returns or access RAMIS. Amounts, facts and tool results reach your AI host and may reach its provider. Do not type names, NIC, TIN, employer names, account numbers, certificates or credentials into chat or tool inputs. No documents or identifiers are accepted. Session data stays in process memory and is lost on restart or wipe. No draft is saved. The server has no network or file tools. Other tools installed in your host may access your conversation. Obtain professional review before relying on any figure. Accept this exact version only after the user agrees.`;
export const partialFactsSchema = z.strictObject({
  scope: scopeSchema.partial().optional(), income: incomeSchema.partial().optional(), deductions: deductionsSchema.partial().optional(),
});
type Facts = z.infer<typeof partialFactsSchema>;
export class TaxSession {
  private active = false;
  private acceptedVersion: string | undefined;
  private facts: Facts = {};
  start(ya: string) {
    selectRules(ya);
    this.active = true;
    this.acceptedVersion = undefined;
    this.facts = {};
    return { started: true, persistence: 'memory_only', consent_required: true };
  }
  wipe() {
    this.active = false;
    this.acceptedVersion = undefined;
    this.facts = {};
    return { wiped: true };
  }
  private requireActive() { if (!this.active) throw new Error('SESSION_REQUIRED'); }
  private requireConsent() {
    this.requireActive();
    if (this.acceptedVersion !== DISCLAIMER_VERSION) throw new Error('CONSENT_REQUIRED');
  }
  disclaimer() { return { version: DISCLAIMER_VERSION, disclaimer: DISCLAIMER }; }
  accept(version: string, userConfirmed: boolean) {
    this.requireActive();
    if (!userConfirmed || version !== DISCLAIMER_VERSION) throw new Error('CONSENT_VERSION_MISMATCH');
    this.acceptedVersion = version;
    return { accepted: true, version: DISCLAIMER_VERSION, persistence: 'memory_only' };
  }
  setFacts(input: unknown) {
    this.requireConsent();
    const parsed = partialFactsSchema.safeParse(input);
    if (!parsed.success) throw new Error('INVALID_FACTS');
    const patch = parsed.data;
    this.facts = {
      scope: { ...this.facts.scope, ...patch.scope },
      income: { ...this.facts.income, ...patch.income },
      deductions: { ...this.facts.deductions, ...patch.deductions },
    };
    return this.nextQuestions();
  }
  nextQuestions() {
    this.requireConsent();
    const scopeMissing = Object.keys(scopeSchema.shape).filter(k => this.facts.scope?.[k as keyof typeof scopeSchema.shape] === undefined);
    if (scopeMissing.length) return { status: 'incomplete', missing_facts: scopeMissing.map(k => `scope.${k}`) };
    // Stop gathering income if scope already excludes the user.
    if (this.checkScope().status === 'out_of_scope') return { status: 'out_of_scope', missing_facts: [] };
    const incomeMissing = Object.keys(incomeSchema.shape).filter(k => this.facts.income?.[k as keyof typeof incomeSchema.shape] === undefined);
    if (incomeMissing.length) return { status: 'incomplete', missing_facts: incomeMissing.map(k => `income.${k}`) };
    const deductionMissing = Object.keys(deductionsSchema.shape).filter(k => this.facts.deductions?.[k as keyof typeof deductionsSchema.shape] === undefined);
    return { status: deductionMissing.length ? 'incomplete' : 'complete', missing_facts: deductionMissing.map(k => `deductions.${k}`) };
  }
  checkScope() {
    this.requireConsent();
    const parsed = scopeSchema.safeParse(this.facts.scope);
    if (!parsed.success) throw new Error('MISSING_SCOPE_FACTS');
    return checkScope(parsed.data);
  }
  compute() {
    this.requireConsent();
    const scope = scopeSchema.safeParse(this.facts.scope);
    if (!scope.success) throw new Error('MISSING_SCOPE_FACTS');
    if (checkScope(scope.data).status === 'out_of_scope') throw new Error('OUT_OF_SCOPE');
    const income = incomeSchema.safeParse(this.facts.income);
    if (!income.success) throw new Error('MISSING_INCOME_FACTS');
    const deductions = deductionsSchema.safeParse(this.facts.deductions);
    if (!deductions.success) throw new Error('MISSING_DEDUCTION_FACTS');
    return computeReturn({ ya: rules.ya, scope: scope.data, income: income.data, deductions: deductions.data });
  }
  explain(line: string) {
    const result = this.compute();
    const trace = result.trace.find(t => t.line === line);
    if (!trace) throw new Error('UNKNOWN_LINE');
    return { trace, estimate: true, filing_ready: false };
  }
}
const errors: Record<string, string> = {
  NOT_COVERED: 'Only YA 2025/26 is implemented. Do not substitute another year.',
  SESSION_REQUIRED: 'Start a session with lk_session before continuing.',
  CONSENT_REQUIRED: 'Show lk_get_disclaimer verbatim and obtain user agreement before accepting the current version.',
  CONSENT_VERSION_MISMATCH: 'Fetch the current disclaimer and obtain explicit user agreement to that version.',
  INVALID_FACTS: 'Use only published fact names, booleans and nonnegative decimal LKR strings with at most two decimal places. Do not send identifiers.',
  MISSING_SCOPE_FACTS: 'Use lk_next_questions and complete every scope fact before computation.',
  MISSING_INCOME_FACTS: 'Use lk_next_questions and complete the missing income facts. Confirm zero values with the user.',
  MISSING_DEDUCTION_FACTS: 'Use lk_next_questions and confirm every deduction amount, including zeros. Never assume eligibility.',
  CHARITY_CAP_REVIEW: 'The assessable-income and taxable-income charity limits in Annexure 3(a) give different deductions. Obtain professional clarification; do not choose a cap or erase a genuine claim to bypass this refusal.',
  DIVIDEND_WHT_REVIEW: 'The actual final withholding on resident-company dividends does not match the supported rate. Reconcile the certificate with a qualified adviser; do not claim final WHT as an advance tax credit.',
  OUT_OF_SCOPE: 'Computation refused. Read lk_check_scope reasons and consult a qualified tax adviser.',
  FEATURE_NOT_IMPLEMENTED: 'This scenario is not implemented in this development slice. Do not estimate it yourself. Consult a qualified tax adviser.',
  UNKNOWN_LINE: 'Choose a line returned in the computation trace.',
};
export function envelope(payload: Record<string, unknown>) {
  const output = { ...payload, ya: rules.ya, ruleset_version: rules.version, verified_on: rules.personal_relief.verified_on,
    review_status: rules.review_status, caution: CAUTION, sources, known_issues_uri: 'lktax://known-issues' };
  assertPrivateOutput(output);
  return output;
}
export function errorResult(error: unknown) {
  const code = error instanceof Error && Object.hasOwn(errors, error.message) ? error.message : 'INTERNAL_ERROR';
  return envelope({ error: { code, message: errors[code] ?? 'Request failed. Retry with the published schema. Do not send identifiers.' } });
}
