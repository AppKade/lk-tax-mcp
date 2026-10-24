import { z } from 'zod';
import { amountSchema } from './rules.ts';
import { cents, money } from './money.ts';

export function normalizeAmount(value: string) {
  const s = value.trim().replace(/^(?:LKR|Rs\.?)\s*/i, '');
  if (!/^(?:0|[1-9]\d{0,14}|[1-9]\d{0,2}(?:,\d{3}){1,4})(?:\.\d{1,2})?$/.test(s)) throw new Error('AMOUNT_FORMAT');
  const parsed = amountSchema.safeParse(s.replaceAll(',', ''));
  if (!parsed.success) throw new Error('AMOUNT_FORMAT');
  return parsed.data;
}
export const evidenceKind = z.enum(['employment', 'interest', 'rent', 'dividend']);
export const evidenceValues = z.strictObject({ employment: amountSchema.optional(), apit_credit: amountSchema.optional(),
  interest: amountSchema.optional(), ait_wht_credit: amountSchema.optional(), rent: amountSchema.optional(),
  final_wht_dividends_gross: amountSchema.optional(), final_wht_dividends_deducted: amountSchema.optional() });
type Values = z.infer<typeof evidenceValues>;
const fields = ['employment', 'apit_credit', 'interest', 'ait_wht_credit', 'rent', 'final_wht_dividends_gross', 'final_wht_dividends_deducted'] as const;
const fieldLabels: Record<keyof Values, string> = { employment: 'Pay before tax and employee deductions', apit_credit: 'Tax already deducted or paid on employment (APIT)',
  interest: 'Bank interest before withholding tax', ait_wht_credit: 'Advance tax already withheld by the bank or payer (AIT/WHT)', rent: 'Rent before any expenses',
  final_wht_dividends_gross: 'Dividend before final withholding', final_wht_dividends_deducted: 'Final tax already withheld on that dividend' };
const warningHelp: Record<EvidenceRow['warnings'][number], string> = {
  WRONG_YEAR: 'This document mentions a different assessment year. Exclude it from this estimate rather than changing its year.',
  YEAR_UNRESOLVED: 'Check the assessment year on the document. It could not be determined uniquely.',
  REVISION_WORDING: 'This document mentions a revision or replacement. Check which earlier letter it replaces; do not add both.',
  INSTRUCTIONS_IGNORED: 'Instruction-like text in the document was ignored. Check the financial values against your own record.',
  AMBIGUOUS_AMOUNTS: 'More than one value was found for the same field. Confirm the correct annual total from the document.',
  GROSS_NET_MISMATCH: 'The gross interest, tax withheld and net interest do not reconcile. Check all three amounts.',
  OCR_REVIEW: 'This document was read from an image. Check every amount and year; missing or misread values need your correction.',
  PARTIAL_LEDGER: 'This ledger does not contain twelve distinct months. Confirm that the period and total cover your actual employment.',
};
const required: Record<z.infer<typeof evidenceKind>, (keyof Values)[]> = {
  employment: ['employment', 'apit_credit'], interest: ['interest', 'ait_wht_credit'], rent: ['rent', 'ait_wht_credit'],
  dividend: ['final_wht_dividends_gross', 'final_wht_dividends_deducted'],
};
export const evidenceRow = z.strictObject({ id: z.string().regex(/^doc_[a-f0-9]{16}$/), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  kind: evidenceKind, years: z.array(z.string().regex(/^20\d\d\/\d\d$/)).max(10), pages: z.number().int().min(1).max(10),
  method: z.enum(['text', 'ocr', 'mixed', 'csv']), values: evidenceValues,
  candidates: z.array(z.strictObject({ field: z.enum(['employment', 'apit_credit', 'interest', 'ait_wht_credit', 'rent', 'final_wht_dividends_gross', 'final_wht_dividends_deducted']), value: amountSchema, page: z.number().int().min(1).max(10) })).max(100),
  warnings: z.array(z.enum(['YEAR_UNRESOLVED', 'WRONG_YEAR', 'REVISION_WORDING', 'INSTRUCTIONS_IGNORED', 'AMBIGUOUS_AMOUNTS', 'GROSS_NET_MISMATCH', 'OCR_REVIEW', 'PARTIAL_LEDGER'])).max(10),
  status: z.enum(['pending', 'included', 'excluded']), replaces: z.string().regex(/^doc_[a-f0-9]{16}$/).optional(),
  duplicate_resolution: z.enum(['distinct_source', 'exclude_duplicate']).optional(), confirmed_year: z.literal('2025/26').optional(),
});
export type EvidenceRow = z.infer<typeof evidenceRow>;
const labels: [keyof Values, RegExp][] = [
  ['employment', /^(?:corrected\s+)?gross (?:taxable )?employment income/i], ['apit_credit', /^APIT (?:deducted|paid)/i],
  ['interest', /^gross (?:taxable )?interest/i], ['ait_wht_credit', /^(?:advance withholding|AIT(?:\/WHT)?|WHT) (?:deducted|paid)/i],
  ['rent', /^gross (?:local |investment )?rent(?:al income)?/i],
  ['final_wht_dividends_gross', /^gross (?:resident.company )?dividends/i], ['final_wht_dividends_deducted', /^final (?:dividend )?(?:WHT|withholding) (?:deducted|paid)/i],
];
// Raw text stays inside local extraction. Never return snippets, identifiers or document instructions.
export function extractEvidence(pages: string[], kind: z.infer<typeof evidenceKind>, sha256: string, method: EvidenceRow['method']): EvidenceRow {
  const joined = pages.join('\n');
  const years = [...new Set([...joined.matchAll(/\b(20\d{2})\s*\/\s*(20\d{2}|\d{2})\b/g)].map(m => `${m[1]}/${m[2].slice(-2)}`))];
  const candidates: EvidenceRow['candidates'] = [];
  let net: string | undefined;
  pages.forEach((page, p) => page.split(/\r?\n/).forEach(raw => {
    const line = raw.trim(); const v = line.match(/(?:[:：]|\s)\s*((?:LKR|Rs\.?)\s*[\d,]+(?:\.\d{1,2})?)\s*$/i);
    if (!v) return;
    let value: string; try { value = normalizeAmount(v[1]); } catch { return; }
    if (/^net interest credited/i.test(line)) net = value;
    const label = line.slice(0, v.index).toLowerCase().replace(/[^a-z]/g, '');
    const ocrAliases: Partial<Record<keyof Values, string[]>> = { interest: ['grossnterest', 'grosslnterest'],
      ait_wht_credit: ['advancewithholdingdeducted', 'advancewithhohingdeducted'] };
    for (const [field, pattern] of labels) if (required[kind].includes(field) &&
      (pattern.test(line) || ((method === 'ocr' || method === 'mixed') && ocrAliases[field]?.includes(label)))) candidates.push({ field, value, page: p + 1 });
  }));
  const values: Values = {}; let ambiguous = false;
  for (const field of required[kind]) {
    const amounts = [...new Set(candidates.filter(c => c.field === field).map(c => c.value))];
    if (amounts.length === 1) values[field] = amounts[0];
    if (amounts.length > 1) ambiguous = true;
  }
  const warnings: EvidenceRow['warnings'] = [];
  if (years.length !== 1) warnings.push('YEAR_UNRESOLVED');
  if (years.some(y => y !== '2025/26')) warnings.push('WRONG_YEAR');
  if (/\b(?:revised|superseded|replaces|replacement)\b/i.test(joined)) warnings.push('REVISION_WORDING');
  if (/ignore.{0,40}(?:instructions|consent)|\b(?:system|assistant)\s*:/i.test(joined)) warnings.push('INSTRUCTIONS_IGNORED');
  if (ambiguous) warnings.push('AMBIGUOUS_AMOUNTS');
  if (method === 'ocr' || method === 'mixed') warnings.push('OCR_REVIEW');
  if (net && values.interest && values.ait_wht_credit && cents(values.interest) - cents(net) !== cents(values.ait_wht_credit)) warnings.push('GROSS_NET_MISMATCH');
  return evidenceRow.parse({ id: `doc_${sha256.slice(0, 16)}`, sha256, kind, years, pages: pages.length, method, values, candidates, warnings, status: 'pending' });
}

export class EvidenceLedger {
  private rows: EvidenceRow[] = [];
  private applied: Values | undefined;
  private managedFields: (keyof Values)[] = [];
  list() {
    return { documents: this.rows.map((r,i) => ({ ...structuredClone(r), display_label: `${r.kind === 'employment' ? 'Salary' : r.kind === 'interest' ? 'Bank interest' : r.kind === 'rent' ? 'Rent' : 'Dividend'} document ${i + 1}`,
      review_questions: required[r.kind].map(field => ({ field, label: fieldLabels[field], candidate: r.values[field] ?? null, confirmation_required: true })),
      review_notes: r.warnings.map(code => ({ code, message: warningHelp[code] })),
      missing_fields: required[r.kind].filter(k => r.values[k] === undefined),
      possible_duplicate_of: this.rows.filter(other => other.id !== r.id && other.kind === r.kind && Object.keys(r.values).length > 0 && JSON.stringify(other.values) === JSON.stringify(r.values)).map(other => other.id) })), applied_values: this.applied ? { ...this.applied } : null,
      notice: 'Candidates are untrusted extraction results. Confirm every value and year from your local records. Matching amounts may be distinct sources. Raw text is never returned.' };
  }
  add(row: EvidenceRow) {
    const existing = this.rows.find(r => r.sha256 === row.sha256);
    if (existing) return { ...this.list(), duplicate_of: existing.id };
    if (this.rows.length >= 100) throw new Error('EVIDENCE_LIMIT');
    this.rows.push(evidenceRow.parse(row)); this.applied = undefined;
    return this.list();
  }
  reclassify(id: string, fresh: EvidenceRow) {
    const index = this.rows.findIndex(r => r.id === id); if (index < 0) throw new Error('EVIDENCE_NOT_FOUND');
    const prior = this.rows[index];
    if (prior.sha256 !== fresh.sha256) throw new Error('EVIDENCE_SOURCE_CHANGED');
    if (prior.kind === fresh.kind) throw new Error('EVIDENCE_CATEGORY');
    if (prior.replaces || this.rows.some(r => r.replaces === id)) throw new Error('EVIDENCE_REPLACEMENT');
    // Previously applied categories remain managed so their old contribution cannot silently survive a category correction.
    this.rows[index] = evidenceRow.parse(fresh); this.applied = undefined;
    return { ...this.list(), reclassified: { id, from: prior.kind, to: fresh.kind, review_required: true },
      correction_notice: 'Review the corrected document and preview all affected totals again. Previously applied categories may now total zero; include any other sources before confirming.' };
  }
  progress(income: Values) {
    const pending = this.rows.filter(r => r.status === 'pending').length;
    if (!this.rows.length) return { status: 'not_used', calculation_blocked: false, pending_documents: 0, message: 'You can continue with confirmed totals from your own records.' };
    if (pending) return { status: 'needs_review', calculation_blocked: true, pending_documents: pending, message: 'Review the imported documents first. Confirm each amount and year, correct a wrong category, or exclude a duplicate or old-year letter.' };
    if (!this.applied) return { status: 'needs_apply', calculation_blocked: true, pending_documents: 0, message: 'The document decisions are recorded. Preview the combined totals and confirm that they cover every source before using them.' };
    if (Object.entries(this.applied).some(([k,v]) => income[k as keyof Values] !== v)) return { status: 'needs_reconciliation', calculation_blocked: true, pending_documents: 0, message: 'An entered total differs from the confirmed documents. Check the correction and preview the totals again before calculating.' };
    return { status: 'reconciled', calculation_blocked: false, pending_documents: 0, message: 'The document totals match the entered facts. Complete any remaining questions.' };
  }
  decide(id: string, include: boolean, values: Values | undefined, year: string | undefined, replaces: string | undefined,
    resolution: EvidenceRow['duplicate_resolution'], confirmed: boolean) {
    if (!confirmed) throw new Error('EVIDENCE_CONFIRMATION');
    if (include && resolution === 'exclude_duplicate') throw new Error('EVIDENCE_CONFIRMATION');
    const row = this.rows.find(r => r.id === id); if (!row) throw new Error('EVIDENCE_NOT_FOUND');
    if (!include) { row.status = 'excluded'; this.applied = undefined; return this.list(); }
    replaces ??= row.replaces;
    if (row.years.some(y => y !== '2025/26') || year !== '2025/26') throw new Error('EVIDENCE_YEAR');
    const parsed = evidenceValues.safeParse(values);
    if (!parsed.success || required[row.kind].some(k => parsed.data[k] === undefined) || Object.keys(parsed.data).some(k => !required[row.kind].includes(k as keyof Values)))
      throw new Error('EVIDENCE_CONFIRMATION');
    if (this.rows.some(r => r.status === 'included' && r.replaces === id)) throw new Error('EVIDENCE_REPLACEMENT');
    if (this.rows.some(r => r.id !== id && r.id !== replaces && r.status === 'included' && r.kind === row.kind &&
        JSON.stringify(r.values) === JSON.stringify(parsed.data)) && resolution !== 'distinct_source') throw new Error('EVIDENCE_DUPLICATE');
    const prior = replaces ? this.rows.find(r => r.id === replaces) : undefined;
    if (replaces && (!prior || prior.id === row.id || prior.kind !== row.kind || this.rows.some(r => r.replaces === row.id) ||
        this.rows.some(r => r.id !== row.id && r.status === 'included' && r.replaces === replaces))) throw new Error('EVIDENCE_REPLACEMENT');
    if (prior) prior.status = 'excluded';
    row.values = parsed.data; row.confirmed_year = '2025/26'; row.status = 'included'; row.duplicate_resolution = resolution; row.replaces = replaces;
    this.applied = undefined; return this.list();
  }
  totals() {
    if (this.rows.some(r => r.status === 'pending')) throw new Error('EVIDENCE_PENDING');
    const totals: Values = {};
    for (const field of this.managedFields) totals[field] = '0.00';
    for (const r of this.rows) for (const field of required[r.kind]) totals[field] = '0.00';
    for (const r of this.rows.filter(r => r.status === 'included')) for (const [key, value] of Object.entries(r.values))
      totals[key as keyof Values] = money(cents(totals[key as keyof Values] ?? '0') + cents(value));
    return totals;
  }
  markApplied() { this.applied = this.totals(); this.managedFields = Object.keys(this.applied) as (keyof Values)[]; }
  check(income: Values) {
    if (!this.rows.length) return;
    this.totals();
    if (!this.applied || Object.entries(this.applied).some(([k, v]) => income[k as keyof Values] !== v)) throw new Error('EVIDENCE_TOTALS_CHANGED');
  }
  snapshot() { return { rows: structuredClone(this.rows), applied: this.applied ? { ...this.applied } : undefined, managed_fields: [...this.managedFields] }; }
  restore(value: unknown) {
    const p = z.strictObject({ rows: z.array(evidenceRow).max(100), applied: evidenceValues.optional(), managed_fields: z.array(z.enum(fields)).max(7).optional() }).safeParse(value);
    if (!p.success || new Set(p.data.rows.map(r => r.id)).size !== p.data.rows.length || p.data.rows.some(r => r.id !== `doc_${r.sha256.slice(0, 16)}` ||
      (r.status === 'included' && (r.confirmed_year !== '2025/26' || r.years.some(y => y !== '2025/26') || required[r.kind].some(k => r.values[k] === undefined))) ||
      Object.keys(r.values).some(k => !required[r.kind].includes(k as keyof Values)) ||
      (r.replaces && (!p.data.rows.some(prior => prior.id === r.replaces && prior.kind === r.kind && prior.id !== r.id) ||
        (r.status === 'included' && p.data.rows.some(prior => prior.id === r.replaces && prior.status === 'included')))))) throw new Error('DRAFT_INVALID');
    const candidate = new EvidenceLedger(); candidate.rows = p.data.rows;
    candidate.managedFields = p.data.managed_fields ?? Object.keys(p.data.applied ?? {}) as (keyof Values)[];
    if (p.data.applied) {
      let totals: Values; try { totals = candidate.totals(); } catch { throw new Error('DRAFT_INVALID'); }
      if (Object.keys(totals).length !== Object.keys(p.data.applied).length || Object.entries(totals).some(([k,v]) => p.data.applied![k as keyof Values] !== v)) throw new Error('DRAFT_INVALID');
    }
    this.rows = p.data.rows; this.applied = p.data.applied; this.managedFields = candidate.managedFields;
  }
  clear() { this.rows = []; this.applied = undefined; this.managedFields = []; }
}
