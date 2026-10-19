import { z } from 'zod';
import { reviewReturn, cageMap } from './return-review.ts';
import { evaluateInterview, resolveForeign, foreignRequirements, interviewPolicy } from './interview.ts';
import { planInstalments, instalmentRules } from './instalments.ts';
import { foreignSchema, knownForeignBlock } from './foreign.ts';
import { assertPrivateOutput } from './privacy.ts';
import { rules, sources, selectRules } from './rules.ts';
import { scopeSchema, checkScope, checkKnownScope } from './scope.ts';
import { incomeSchema, deductionsSchema, computeReturn } from './engine.ts';
import { buildChecklist, renderWorksheet } from './worksheet.ts';
export const DISCLAIMER_VERSION = '2026-10-19.4';
export const CAUTION = 'Development preview. Verify before filing. Not IRD-approved; not tax advice.';
export const DISCLAIMER = `${CAUTION} This preview only estimates local employment, user-supplied local business net profit, interest, gross investment rent, final-WHT resident-company dividends and supported local reliefs and donations plus qualifying foreign-employer salary and net foreign service income for resident individuals. Foreign aggregates must already be converted to LKR and eligibility must be confirmed. Only eligible foreign income tax for one confirmed source in one country on that same income is supported, with both attributable-tax and statutory average-rate ceilings. Mixed-income allocation and stacking are preview assumptions; comparison figures are shown where needed. Eligibility and evidence must be confirmed by you. Ambiguous donation caps and unsupported scenarios are refused. A separate YA 2026/27 instalment planner uses an externally prepared gross-tax basis, confirmed method eligibility and reconciled credits. Its rounding is a preview assumption; foreign tax credits in the instalment basis are unsupported. It does not file returns or access RAMIS. Amounts, facts and tool results reach your AI host and may reach its provider. Do not type names, NIC, TIN, employer names, account numbers, certificates or credentials into chat or tool inputs. No documents or identifiers are accepted. Session data stays in process memory and is lost on restart or wipe. No draft is saved. The server has no network or file tools. Other tools installed in your host may access your conversation. Obtain professional review before relying on any figure. Accept this exact version only after the user agrees.`;
export const partialFactsSchema = z.strictObject({
  scope: scopeSchema.partial().optional(), income: incomeSchema.partial().optional(), deductions: deductionsSchema.partial().optional(), foreign: foreignSchema.partial().optional(),
});
type Facts = z.infer<typeof partialFactsSchema>;
export class TaxSession {
  private active = false;
  private acceptedVersion: string | undefined;
  private facts: Facts = {};
  private acknowledged: { digest: string; items: string[] } | undefined;
  start(ya: string) {
    selectRules(ya);
    this.active = true;
    this.acceptedVersion = undefined;
    this.acknowledged = undefined;
    this.facts = {};
    return { started: true, persistence: 'memory_only', consent_required: true };
  }
  wipe() {
    this.active = false;
    this.acceptedVersion = undefined;
    this.acknowledged = undefined;
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
    this.acknowledged = undefined;
    return { accepted: true, version: DISCLAIMER_VERSION, persistence: 'memory_only' };
  }
  setFacts(input: unknown) {
    this.requireConsent();
    const parsed = partialFactsSchema.safeParse(input);
    if (!parsed.success) throw new Error('INVALID_FACTS');
    const patch = parsed.data;
    this.acknowledged = undefined;
    this.facts = {
      scope: { ...this.facts.scope, ...patch.scope },
      income: { ...this.facts.income, ...patch.income },
      deductions: { ...this.facts.deductions, ...patch.deductions },
      foreign: { ...this.facts.foreign, ...patch.foreign },
    };
    return this.nextQuestions();
  }
  nextQuestions() {
    this.requireConsent();
    const progress = evaluateInterview(this.facts);
    return { ...progress, ...(progress.blocking_error ? { blocking_guidance: errors[progress.blocking_error] } : {}) };
  }
  checkScope() {
    this.requireConsent();
    const known = checkKnownScope(this.facts.scope ?? {});
    if (known.status === 'out_of_scope') return { ...known, assessment_basis: 'confirmed_scope_exclusions; other scope answers remain unknown' };
    const parsed = scopeSchema.safeParse(this.facts.scope);
    if (!parsed.success) throw new Error('MISSING_SCOPE_FACTS');
    return { ...checkScope(parsed.data), assessment_basis: 'scope_answers_only; computation derives foreign credit and interpretation flags from actual amounts' };
  }
  private currentReturnInput() {
    this.requireConsent();
    const known = checkKnownScope(this.facts.scope ?? {});
    if (known.status === 'out_of_scope') throw new Error('OUT_OF_SCOPE');
    if (this.facts.scope?.multiple_foreign_tax_countries || this.facts.scope?.preparing_for_clients || this.facts.income?.other_income_or_claims)
      throw new Error('FEATURE_NOT_IMPLEMENTED');
    const foreignBlock = knownForeignBlock(this.facts.foreign ?? {});
    if (foreignBlock) throw new Error(foreignBlock);
    const scope = scopeSchema.safeParse(this.facts.scope);
    if (!scope.success) throw new Error('MISSING_SCOPE_FACTS');
    if (checkScope(scope.data).status === 'out_of_scope') throw new Error('OUT_OF_SCOPE');
    const income = incomeSchema.safeParse(this.facts.income);
    if (!income.success) throw new Error('MISSING_INCOME_FACTS');
    const deductions = deductionsSchema.safeParse(this.facts.deductions);
    if (!deductions.success) throw new Error('MISSING_DEDUCTION_FACTS');
    const foreign = resolveForeign(this.facts.foreign ?? {});
    return { ya: rules.ya, scope: scope.data, income: income.data, deductions: deductions.data, foreign };
  }
  compute() {
    const input = this.currentReturnInput();
    const result = computeReturn(input);
    const notApplicable = foreignRequirements(this.facts.foreign ?? {}).not_applicable;
    return { ...result, intake_context: { policy_version: interviewPolicy.version, foreign_not_applicable_facts: notApplicable,
      foreign_neutral_default_facts: notApplicable.filter(path => this.facts.foreign?.[path.slice('foreign.'.length) as keyof typeof input.foreign] === undefined),
      defaults_saved: false, note: 'Not-applicable foreign flags do not establish eligibility. Neutral false values for uncollected flags exist only in this computation input, not as user-confirmed facts.' } };
  }
  review() { return reviewReturn(this.currentReturnInput()); }
  checklist() {
    const checklist = buildChecklist(this.review());
    return { ...checklist, status: 'checklist_only', acknowledged: this.acknowledged?.digest === checklist.digest, filing_export_available: false };
  }
  acknowledgeChecklist(digest: string, items: string[], userConfirmed: boolean) {
    const checklist = buildChecklist(this.review());
    if (digest !== checklist.digest) throw new Error('CHECKLIST_STALE');
    if (!userConfirmed || !checklist.items.every(item => items.includes(item.id))) throw new Error('CHECKLIST_INCOMPLETE');
    this.acknowledged = { digest, items: checklist.items.map(item => item.id) };
    return { acknowledged: true, digest, items: this.acknowledged.items, persistence: 'memory_only' };
  }
  worksheet() {
    const review = this.review();
    const checklist = buildChecklist(review);
    if (this.acknowledged?.digest !== checklist.digest) throw new Error('CHECKLIST_REQUIRED');
    return { export_type: 'worksheet_text', format: 'markdown', file_written: false, filing_export_available: false, estimate: true, filing_ready: false,
      needs_professional_review: true, checklist_digest: checklist.digest, worksheet: renderWorksheet(review, this.acknowledged.items) };
  }
  planInstalments(input: unknown) {
    this.requireConsent();
    return planInstalments(input);
  }
  explain(line: string) {
    const result = this.compute();
    const trace = result.trace.find(t => t.line === line);
    if (!trace) throw new Error('UNKNOWN_LINE');
    return { trace, estimate: true, filing_ready: false };
  }
}
const errors: Record<string, string> = {
  REVIEW_MAPPING_MISMATCH: 'Return review mapping failed its consistency checks. Do not use or reconstruct these fields. Report the mapping problem without personal data.',
  NOT_COVERED: 'Annual return calculations support only YA 2025/26. The separate instalment planner supports only YA 2026/27. Do not substitute another year.',
  INVALID_INSTALMENT_FACTS: 'Use the published instalment schema, explicit eligibility answers and nonnegative decimal LKR strings. Only YA 2026/27 is supported.',
  INSTALMENT_BASIS_REVIEW: 'Confirm that gross tax was independently prepared under the selected circular method, before credits. Foreign tax credits in this instalment basis require professional review and are unsupported. Do not remove a genuine claim to bypass this refusal.',
  INSTALMENT_CREDIT_REVIEW: 'Reconcile eligible current-year credits without overlap. Separate already deducted and expected remaining withholding. Include only actual earlier instalments, with zero earlier instalments in quarter one. Exclude final withholding and future instalments.',
  INSTALMENT_METHOD_REVIEW: 'The confirmed facts do not establish eligibility for the selected method. Check the circular and obtain professional review; do not change genuine facts to bypass this refusal.',
  INSTALMENT_SET_REVIEW: 'Final SET is permitted only for quarter one under Method 2(ii) or 2(iii) when the prior return is not finalised. Quarter two onwards must use the prior return. Confirm the first-quarter basis and the single SET-to-return revision.',
  INSTALMENT_REVISION_REVIEW: 'A switch from the standard method requires a later quarter, confirmed lower-income eligibility and a timely revision notice. This preview supports that switch only to Method 2(iii).',
  SESSION_REQUIRED: 'Start a session with lk_session before continuing.',
  CONSENT_REQUIRED: 'Show lk_get_disclaimer verbatim and obtain user agreement before accepting the current version.',
  CONSENT_VERSION_MISMATCH: 'Fetch the current disclaimer and obtain explicit user agreement to that version.',
  INVALID_FACTS: 'Use only published fact names, booleans and nonnegative decimal LKR strings with at most two decimal places. Do not send identifiers.',
  MISSING_SCOPE_FACTS: 'Use lk_next_questions and complete every scope fact before computation.',
  MISSING_INCOME_FACTS: 'Use lk_next_questions and complete the missing income facts. Confirm zero values with the user.',
  MISSING_FOREIGN_FACTS: 'Use lk_next_questions and confirm all foreign amounts, including zeros, and the eligibility facts currently required by those amounts. Missing amounts are never zero; inapplicable booleans need no answer.',
  FOREIGN_ELIGIBILITY_REVIEW: 'This foreign income is not confirmed as qualifying for the supported concession or its LKR conversion is unconfirmed. Computation is refused. Do not relabel it as local income or guess eligibility; obtain professional review.',
  FOREIGN_CREDIT_SOURCE_REVIEW: 'Foreign tax credit requires separate source calculations. This preview accepts only one confirmed source in one country and does not pool employment and business credit claims. Obtain a source-specific calculation; do not remove genuine income to bypass the refusal.',
  FOREIGN_CREDIT_REVIEW: 'Confirm that foreign tax was actually paid, is income tax on the same qualifying income from one source in one country and is eligible under the applicable credit rules. No foreign credit is calculated without this confirmation.',
  FOREIGN_TAX_WITHOUT_INCOME: 'Foreign tax was supplied without supported foreign income. Reconcile the amounts rather than applying it to domestic tax.',
  MISSING_DEDUCTION_FACTS: 'Use lk_next_questions and confirm every deduction amount, including zeros. Never assume eligibility.',
  CHARITY_CAP_REVIEW: 'The assessable-income and taxable-income charity limits in Annexure 3(a) give different deductions. Obtain professional clarification; do not choose a cap or erase a genuine claim to bypass this refusal.',
  DIVIDEND_WHT_REVIEW: 'The actual final withholding on resident-company dividends does not match the supported rate. Reconcile the certificate with a qualified adviser; do not claim final WHT as an advance tax credit.',
  OUT_OF_SCOPE: 'Computation refused by the submitted scope facts. Check the scope exclusions for this calculation and consult a qualified tax adviser.',
  FEATURE_NOT_IMPLEMENTED: 'This scenario is not implemented in this development slice. Do not estimate it yourself. Consult a qualified tax adviser.',
  CHECKLIST_REQUIRED: 'Call lk_get_checklist, show each statement to the user verbatim and call lk_acknowledge_checklist only with statements the user explicitly confirms. Any change to facts requires a new acknowledgement.',
  CHECKLIST_STALE: 'The facts, figures or flags changed since this checklist was issued. Call lk_get_checklist again and obtain fresh confirmation.',
  CHECKLIST_INCOMPLETE: 'Every checklist item must be explicitly confirmed by the user. Do not confirm on their behalf or omit an item.',
  UNKNOWN_LINE: 'Choose a line returned in the computation trace.',
};
export function envelope(payload: Record<string, unknown>, context: 'annual' | 'instalments' | 'review' = 'annual') {
  const output = { ...payload, ya: rules.ya, ruleset_version: rules.version, verified_on: rules.personal_relief.verified_on,
    review_status: rules.review_status, caution: CAUTION, sources, known_issues_uri: 'lktax://known-issues',
    ...(context === 'review' ? { mapping_version: cageMap.version, sources: [...new Set([...sources, ...Object.values(cageMap.sources).map(s => s.url)])] } : {}),
    ...(context === 'instalments' ? { ya: instalmentRules.ya, ruleset_version: instalmentRules.version, verified_on: instalmentRules.verified_on,
      review_status: instalmentRules.review_status, sources: [instalmentRules.source] } : {}) };
  assertPrivateOutput(output);
  return output;
}
export function errorResult(error: unknown, context: 'annual' | 'instalments' | 'review' = 'annual') {
  const code = error instanceof Error && Object.hasOwn(errors, error.message) ? error.message : 'INTERNAL_ERROR';
  return envelope({ error: { code, message: errors[code] ?? 'Request failed. Retry with the published schema. Do not send identifiers.' } }, context);
}
