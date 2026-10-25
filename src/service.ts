import { z } from 'zod';
import { createHash } from 'node:crypto';
import { EvidenceLedger, evidenceKind, evidenceValues, normalizeAmount } from './evidence.ts';
import { readDocument, localCapabilities, saveDraft, loadDraft, deleteDraft } from './local-files.ts';
import { reviewReturn, cageMap } from './return-review.ts';
import { evaluateInterview, resolveForeign, foreignRequirements, interviewPolicy } from './interview.ts';
import { planInstalments, instalmentRules, instalmentSchema } from './instalments.ts';
import { foreignSchema, knownForeignBlock } from './foreign.ts';
import { assertPrivateOutput } from './privacy.ts';
import { rules, sources, selectRules } from './rules.ts';
import { scopeSchema, checkScope, checkKnownScope } from './scope.ts';
import { incomeSchema, deductionsSchema, computeReturn } from './engine.ts';
import { buildChecklist, renderWorksheet } from './worksheet.ts';
export const DISCLAIMER_VERSION = '2026-10-24.2';
export const CAUTION = 'Development preview. Verify before filing. Not IRD-approved; not tax advice.';
export const DISCLAIMER = `${CAUTION} This preview only estimates local employment, user-supplied local business net profit, interest, gross investment rent, final-WHT resident-company dividends and supported local reliefs and donations plus qualifying foreign-employer salary and net foreign service income for resident individuals. Foreign aggregates must already be converted to LKR and eligibility must be confirmed. Only eligible foreign income tax for one confirmed source in one country on that same income is supported, with both attributable-tax and statutory average-rate ceilings. Mixed-income allocation and stacking are preview assumptions; comparison figures are shown where needed. Eligibility and evidence must be confirmed by you. Ambiguous donation caps and unsupported scenarios are refused. A separate YA 2026/27 instalment planner requires an explicitly selected gross-tax basis source, confirmed method eligibility and reconciled credits. External source amounts remain unverified; only an explicit Method 1 selection can match a supplied basis to current prior-year preview gross tax, without verifying evidence or the final return. Credit anomaly warnings are evidence checks, not legal credit limits. Its rounding is a preview assumption; foreign tax credits in the instalment basis are unsupported. It does not file returns or access RAMIS. Amounts, facts and tool results reach your AI host and may reach its provider. Do not type names, NIC, TIN, employer names, account numbers, certificates or credentials into chat or tool inputs. Raw documents and identifiers are never accepted in chat or tax facts. Optional local document review reads explicitly selected files only under a configured root, after separate confirmation, and returns structured candidates for review; never raw text. The local tools require installed Poppler/Tesseract, may create temporary OCR images and are not an OS sandbox. Optional drafts save typed facts and redacted evidence metadata encrypted with a private locally configured key file for a selected retention period. Never send keys or ciphertext through chat. These features are disabled by default. A memory wipe does not delete saved ciphertext; use the draft delete action separately. Without an explicitly saved draft, restart loses the session. No runtime network access is used. Other tools installed in your host may access your conversation. Obtain professional review before relying on any figure. Accept this exact version only after the user agrees.`;
export const partialFactsSchema = z.strictObject({
  scope: scopeSchema.partial().optional(), income: incomeSchema.partial().optional(), deductions: deductionsSchema.partial().optional(), foreign: foreignSchema.partial().optional(),
});
type Facts = z.infer<typeof partialFactsSchema>;
export const documentActionSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('review_file'), file: z.string().min(1).max(240), kind: evidenceKind, user_confirmed: z.boolean() }),
  z.strictObject({ action: z.literal('reclassify'), id: z.string().regex(/^doc_[a-f0-9]{16}$/), file: z.string().min(1).max(240), kind: evidenceKind, user_confirmed: z.boolean() }),
  z.strictObject({ action: z.literal('list') }),
  z.strictObject({ action: z.literal('confirm'), id: z.string().regex(/^doc_[a-f0-9]{16}$/), include: z.boolean(), values: evidenceValues.optional(),
    year: z.literal('2025/26').optional(), replaces: z.string().regex(/^doc_[a-f0-9]{16}$/).optional(),
    duplicate_resolution: z.enum(['distinct_source', 'exclude_duplicate']).optional(), user_confirmed: z.boolean() }),
  z.strictObject({ action: z.literal('preview_apply') }),
  z.strictObject({ action: z.literal('apply'), digest: z.string().regex(/^[a-f0-9]{64}$/), user_confirmed: z.boolean() }),
  z.strictObject({ action: z.literal('clear'), user_confirmed: z.boolean() }),
]);
export const draftActionSchema = z.strictObject({ action: z.enum(['save', 'restore', 'delete']), slot: z.enum(['draft_1', 'draft_2', 'draft_3', 'draft_4', 'draft_5']),
  user_confirmed: z.boolean(), retention_days: z.number().int().min(1).max(30).default(7), overwrite: z.boolean().default(false) });
export class TaxSession {
  private active = false;
  private acceptedVersion: string | undefined;
  private facts: Facts = {};
  private acknowledged: { digest: string; items: string[] } | undefined;
  private evidence = new EvidenceLedger();
  private manualPreparation: string[] = [];
  start(ya: string) {
    selectRules(ya);
    this.active = true;
    this.acceptedVersion = undefined;
    this.acknowledged = undefined;
    this.facts = {};
    this.evidence.clear(); this.manualPreparation = [];
    return { started: true, persistence: 'memory_only', consent_required: true };
  }
  wipe() {
    this.active = false;
    this.acceptedVersion = undefined;
    this.acknowledged = undefined;
    this.facts = {};
    this.evidence.clear(); this.manualPreparation = [];
    return { wiped: true, saved_drafts_deleted: false, notice: 'Memory was cleared. Saved encrypted drafts and backups were not deleted; delete saved slots separately when requested.' };
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
    const changed = Object.entries(patch).some(([group, values]) => Object.entries(values).some(([key, value]) =>
      value !== (this.facts[group as keyof Facts] as Record<string, unknown> | undefined)?.[key]));
    if (changed) { this.acknowledged = undefined; this.manualPreparation = []; }
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
    const evidenceProgress = this.evidence.progress(this.facts.income ?? {});
    const reviewDocuments = !progress.blocking_error && progress.stage !== 'scope' && evidenceProgress.calculation_blocked;
    return { ...progress, ...(reviewDocuments ? { status: 'incomplete' as const, stage: 'documents', missing_facts: [], questions: [], guidance: evidenceProgress.message } : {}),
      evidence_progress: evidenceProgress, calculation_ready: progress.status === 'complete' && !evidenceProgress.calculation_blocked,
      readiness_note: 'The evaluations describe financial intake. calculation_ready also checks document reconciliation; calculation still validates financial rules and never establishes filing readiness.',
      confirmed_facts: structuredClone(this.facts), persistence: 'memory_only',
      facts_note: 'These are the aggregate facts actually entered, not verified evidence. Missing values stay absent. Optional legacy scope hints do not establish computed tax flags. Review year, gross amounts, duplicates and revisions before calculation.',
      ...(progress.blocking_error ? { blocking_guidance: errors[progress.blocking_error] } : {}) };
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
    if (this.facts.scope?.business_profit_needs_computation) throw new Error('BUSINESS_PROFIT_REQUIRED');
    if (this.facts.scope?.multiple_foreign_tax_countries || this.facts.scope?.preparing_for_clients || this.facts.income?.other_income_or_claims)
      throw new Error('FEATURE_NOT_IMPLEMENTED');
    const foreignBlock = knownForeignBlock(this.facts.foreign ?? {});
    if (foreignBlock) throw new Error(foreignBlock);
    this.evidence.check(this.facts.income ?? {});
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
      needs_professional_review: true, checklist_digest: checklist.digest,
      worksheet: renderWorksheet(review, this.acknowledged.items) + '\n## Remaining external preparation\n\n' +
        review.review_gaps.map(g => `- ${g.code}: ${this.manualPreparation.includes(g.code) ? 'User reports completed externally; not independently verified.' : 'Needs external review.'} ${g.detail}`).join('\n') + '\n' };
  }
  planInstalments(input: unknown) {
    this.requireConsent();
    const parsed = instalmentSchema.safeParse(input);
    if (!parsed.success) throw new Error('INVALID_INSTALMENT_FACTS');
    if (parsed.data.basis_source !== 'session_annual_gross_tax') return planInstalments(parsed.data);
    if (parsed.data.basis.method !== '1') throw new Error('INSTALMENT_BASIS_REVIEW');
    const annual = this.compute();
    if (annual.flags.length || annual.input_warnings.length) throw new Error('INSTALMENT_BASIS_REVIEW');
    return planInstalments(parsed.data, annual.figures.tax);
  }
  localCapabilities() {
    const capabilities = localCapabilities();
    return { ...capabilities, session: { active: this.active, consent_required: this.acceptedVersion !== DISCLAIMER_VERSION,
      has_answers: Object.values(this.facts).some(group => Object.keys(group).length > 0), has_documents: this.evidence.list().documents.length > 0 },
      getting_started: {
        introduction: 'I can help you prepare a tax estimate. I will ask a few questions, help you find the right amounts in your salary and bank records, and explain the result.',
        assessment_period: { year: rules.ya, from: rules.effective_from, to: rules.effective_to },
        manual_entry_available: true,
        choose_your_route: {
          question: 'Is this for your personal salary, freelance work or sole-trader business, or for a separate company or partnership?',
          employee: 'Use your annual taxable-pay and employment-tax certificates. Include every job and distinguish replacement certificates from additional employers.',
          freelancer: 'First obtain taxable net profit prepared outside this tool. Invoices, receipts, fees and bank deposits are not net profit. Overseas work needs separate income and eligibility questions, with amounts already converted to LKR.',
          sole_trader: 'Use externally prepared taxable net profit for your individual business, not sales, accounting profit or personal drawings. Business accounts and losses cannot be prepared here.',
          company_or_partnership: 'Company accounts, company tax and partnership returns are unsupported. Do not enter a company profit or owner drawings as personal business profit. A separate personal estimate may cover supported salary or dividends paid to you.',
        },
        document_categories: 'Local extraction supports salary, bank-interest, rent and final-withholding dividend records only. Business accounts, freelance invoices, foreign-service statements and business payment receipts need external review and manual entry of confirmed supported totals. Do not relabel them as salary or interest.',
        documents: capabilities.documents_enabled ? 'Local document review is available. Choose a file only after agreeing to the terms and authorizing that read.' : 'You can read the totals from your documents instead. Local document reading is not set up; no upload or technical setup is needed for manual entry.',
        saving: capabilities.encrypted_drafts_enabled ? 'Encrypted saving is available only when you explicitly request it.' : 'Saving is not set up. Keep this session open because a restart loses unsaved answers. You can ask to review your entered totals and keep your own secure copy before closing.',
        next_step: !this.active ? 'Explain the estimate limits, show the terms and ask for agreement before starting a fresh session.' : this.acceptedVersion !== DISCLAIMER_VERSION ? 'Show the current terms and ask for agreement; do not reset the existing session.' : 'Continue the current session with the next missing questions. Do not start over unless asked.',
        limit: 'This is a development estimate, not an official filing or a decision that you do not need to file.',
      } };
  }
  normalizeAmount(value: string) {
    this.requireConsent(); return { canonical_amount: normalizeAmount(value), user_confirmation_required: true, facts_changed: false };
  }
  documents(input: z.infer<typeof documentActionSchema>) {
    this.requireConsent();
    if (input.action === 'list') return this.evidence.list();
    if (input.action === 'preview_apply') {
      const totals = this.evidence.totals();
      const digest = createHash('sha256').update(JSON.stringify({ evidence: this.evidence.snapshot(), current: this.facts.income })).digest('hex');
      return { totals, current_income: structuredClone(this.facts.income ?? {}), digest, user_confirmation_required: true,
        statement: 'Confirm these totals cover every source in the affected categories, including explicit zero totals for excluded documents. They replace existing category amounts; do not combine them again with manually entered totals.' };
    }
    if (!input.user_confirmed) throw new Error('EVIDENCE_CONFIRMATION');
    if (input.action === 'apply') {
      const preview = this.documents({ action: 'preview_apply' });
      if (!('digest' in preview) || preview.digest !== input.digest) throw new Error('EVIDENCE_STALE');
      this.setFacts({ income: this.evidence.totals() }); this.evidence.markApplied(); return this.evidence.list();
    }
    let result: Record<string, unknown>;
    if (input.action === 'review_file') result = this.evidence.add(readDocument(input.file, input.kind));
    else if (input.action === 'reclassify') result = this.evidence.reclassify(input.id, readDocument(input.file, input.kind));
    else if (input.action === 'confirm') result = this.evidence.decide(input.id, input.include, input.values, input.year, input.replaces, input.duplicate_resolution, input.user_confirmed);
    else { this.evidence.clear(); result = { cleared: true, income_totals_preserved: true }; }
    this.acknowledged = undefined; this.manualPreparation = []; return result;
  }
  draft(input: z.infer<typeof draftActionSchema>) {
    this.requireConsent(); if (!input.user_confirmed) throw new Error('DRAFT_CONFIRMATION');
    if (input.action !== 'delete' && !localCapabilities().encrypted_drafts_enabled) throw new Error('DRAFT_FEATURE_DISABLED');
    if (input.action === 'save') return saveDraft(input.slot, { ya: rules.ya, ruleset_version: rules.version, facts: this.facts, evidence: this.evidence.snapshot() }, input.retention_days, input.overwrite);
    if (input.action === 'delete') return deleteDraft(input.slot);
    const parsed = z.strictObject({ ya: z.literal('2025/26'), ruleset_version: z.literal(rules.version), facts: partialFactsSchema, evidence: z.unknown() }).safeParse(loadDraft(input.slot));
    if (!parsed.success) throw new Error('DRAFT_INVALID');
    const ledger = new EvidenceLedger(); ledger.restore(parsed.data.evidence);
    if (ledger.snapshot().applied) ledger.check(parsed.data.facts.income ?? {});
    this.facts = parsed.data.facts; this.evidence = ledger; this.acknowledged = undefined; this.manualPreparation = [];
    return { restored: true, approval_restored: false, review_required: true, progress: this.nextQuestions() };
  }
  preparation(confirm: string[] = [], userConfirmed = false) {
    this.requireConsent(); const review = this.review();
    const steps = review.review_gaps.map(g => ({ id: g.code, targets: g.targets, required_action: g.detail }));
    if (confirm.length) {
      if (!userConfirmed || confirm.some(id => !steps.some(step => step.id === id))) throw new Error('PREPARATION_CONFIRMATION');
      this.manualPreparation = [...new Set([...this.manualPreparation, ...confirm])];
    }
    return { status: 'preparation_only', filing_ready: false, practitioner_review: 'pending', official_filing_supported: false,
      steps: steps.map(s => ({ ...s, status: this.manualPreparation.includes(s.id) ? 'user_reports_completed_externally' : 'needs_external_review' })),
      notice: 'External completion is a user assertion. No official filing output, assets/liabilities statement, portal validation or practitioner approval is produced.' };
  }
  explain(line: string) {
    const result = this.compute();
    const trace = result.trace.find(t => t.line === line);
    if (!trace) throw new Error('UNKNOWN_LINE');
    return { trace, estimate: true, filing_ready: false };
  }
}
const errors: Record<string, string> = {
  DRAFT_FEATURE_DISABLED: 'Encrypted drafts are not set up, so this request did not save or restore a draft. Keep this session open: restarting loses unsaved answers. Ask to review the entered totals and keep your own secure copy before closing or arranging local setup. Never share keys or ciphertext in chat.',
  EVIDENCE_SOURCE_CHANGED: 'This file is different from the selected document. Review it as a new document and explicitly resolve any replacement; no existing record was changed.',
  EVIDENCE_CATEGORY: 'Choose the corrected document category. For a correction within the same category, confirm the corrected amounts instead; the document record was not reset.',
  AMOUNT_FORMAT: 'Use an unambiguous nonnegative LKR amount with at most two decimal places. Optional LKR/Rs prefix and correctly grouped commas are accepted by lk_normalize_amount only. No signs, exponent notation or blank values. Confirm the canonical result before setting a fact.',
  LOCAL_FEATURE_DISABLED: 'This optional local feature is not set up. You can still enter confirmed totals from your documents manually. Keep the current session open; restarting loses unsaved answers. Review and securely preserve the entered totals before arranging setup. Never share keys or raw documents in chat.',
  LOCAL_CONFIGURATION: 'Check the configured local directories and private 32-byte draft key file on your device. Never put the key or configuration contents in chat.',
  LOCAL_FILE_REFUSED: 'Select a regular file within the configured document directory. Absolute paths, traversal, symbolic links, oversized files and files outside the directory are refused.',
  DOCUMENT_FORMAT: 'Use a supported PDF, PNG, JPEG or the documented salary CSV format. Other layouts need manual aggregate entry; do not paste raw text or identifiers.',
  DOCUMENT_DEPENDENCY: 'Install local Poppler tools and Tesseract with English language data to use PDF/image extraction. The server does not install or download them.',
  DOCUMENT_EXTRACTION: 'Local document extraction failed or exceeded its resource/time limit. Check the file locally; no text, paths or subprocess diagnostics are returned.',
  DOCUMENT_LIMIT: 'Documents are limited to ten pages. No pages were silently omitted. Split the evidence deliberately and reconcile all parts.',
  EVIDENCE_LIMIT: 'The session supports at most one hundred document records. Reconcile or clear records before adding more.',
  EVIDENCE_CONFIRMATION: 'Explicitly confirm every included amount, the year and source completeness from your local records. Extractions are candidates only; exclusions and file reads also require confirmation.',
  EVIDENCE_NOT_FOUND: 'Choose a document handle returned by lk_documents list. Do not send a certificate number or taxpayer identifier.',
  EVIDENCE_YEAR: 'This evidence does not match YA 2025/26. Exclude wrong-year documents; never relabel them to include their totals.',
  EVIDENCE_DUPLICATE: 'An included source has matching amounts. Exclude the duplicate or explicitly confirm that these are distinct sources. Do not count the same certificate twice.',
  EVIDENCE_REPLACEMENT: 'Choose an existing same-category document to replace. Self-replacement, cycles and re-including a superseded source are refused.',
  EVIDENCE_PENDING: 'Resolve every imported document as included or excluded before applying or calculating. Confirm gross amounts and replace superseded sources.',
  EVIDENCE_TOTALS_CHANGED: 'Imported evidence has not been applied or current category facts differ from its confirmed totals. Preview and confirm the evidence totals again, or correct the source record. Do not clear genuine income to bypass review.',
  EVIDENCE_STALE: 'Evidence or entered income changed after the totals preview. Fetch preview_apply again and obtain fresh confirmation.',
  DRAFT_CONFIRMATION: 'Saving, replacing, restoring or deleting an encrypted local draft requires explicit user confirmation. Restore replaces current facts and never restores consent or worksheet approval.',
  DRAFT_WRITE: 'The encrypted draft could not be written, or that slot already exists. Select another slot or explicitly confirm overwrite.',
  DRAFT_INVALID: 'The draft is missing, expired, incompatible, malformed or failed authentication. Current session facts were not replaced. Never send ciphertext, keys or file contents through chat.',
  PREPARATION_CONFIRMATION: 'Confirm only preparation step ids returned for the current facts, after completing them externally. This does not establish filing readiness.',
  REVIEW_MAPPING_MISMATCH: 'Return review mapping failed its consistency checks. Do not use or reconstruct these fields. Report the mapping problem without personal data.',
  NOT_COVERED: 'Annual return calculations support only YA 2025/26. The separate instalment planner supports only YA 2026/27. Do not substitute another year.',
  INVALID_INSTALMENT_FACTS: 'Use the published instalment schema, explicit eligibility answers and nonnegative decimal LKR strings. Only YA 2026/27 is supported.',
  INSTALMENT_BASIS_REVIEW: 'Use gross tax before credits, never the annual net balance. Explicitly select its source. A session annual gross-tax match requires Method 1, complete current YA 2025/26 facts without unresolved calculation or credit warnings, and the exact current gross-tax value. External source amounts remain unverified. Foreign-credit bases are unsupported. Do not remove genuine facts to bypass this refusal.',
  INSTALMENT_CREDIT_REVIEW: 'Reconcile eligible current-year credits without overlap. Separate already deducted and expected remaining withholding. Include only actual earlier instalments, with zero earlier instalments in quarter one. Exclude final withholding and future instalments.',
  INSTALMENT_METHOD_REVIEW: 'The confirmed facts do not establish eligibility for the selected method. Check the circular and obtain professional review; do not change genuine facts to bypass this refusal.',
  INSTALMENT_SET_REVIEW: 'Final SET is permitted only for quarter one under Method 2(ii) or 2(iii) when the prior return is not finalised. Quarter two onwards must use the prior return. Confirm the first-quarter basis and the single SET-to-return revision.',
  INSTALMENT_REVISION_REVIEW: 'A switch from the standard method requires a later quarter, confirmed lower-income eligibility and a timely revision notice. This preview supports that switch only to Method 2(iii).',
  SESSION_REQUIRED: 'Start a session with lk_session before continuing.',
  CONSENT_REQUIRED: 'Show lk_get_disclaimer verbatim and obtain user agreement before accepting the current version.',
  CONSENT_VERSION_MISMATCH: 'Fetch the current disclaimer and obtain explicit user agreement to that version.',
  INVALID_FACTS: 'Use only published fact names, booleans and nonnegative decimal LKR strings with at most two decimal places. Do not send identifiers.',
  MISSING_SCOPE_FACTS: 'Use lk_next_questions and complete every requested required scope fact before computation; optional calculation-dependent legacy hints need no answer.',
  BUSINESS_PROFIT_REQUIRED: 'You still need a taxable business net profit prepared outside this tool. Pause the estimate and obtain a prepared profit figure; invoices, receipts, revenue, bank deposits, accounting profit and personal drawings are not substitutes. Do not enter zero or calculate profit here to bypass this stop. Resume only after you confirm the externally prepared amount and genuinely correct the outstanding-profit answer.',
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
