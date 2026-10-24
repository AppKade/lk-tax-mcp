import { z } from 'zod';
import data from '../rules/cages-2025-26.json' with { type: 'json' };
import { computeReturn, returnSchema, figureNames } from './engine.ts';
import { cents, money, nonnegative } from './money.ts';
const bindings = [...figureNames, 'employment_total', 'business_total', 'investment_total', 'deductions_total', 'scope_zero', 'unresolved'] as const;
const source = z.strictObject({ url: z.url().refine(s => s.startsWith('https://www.ird.gov.lk/')), sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().positive() });
export const cageMapSchema = z.strictObject({
  ya: z.literal('2025/26'), version: z.string().regex(/^2025\.26\.cages\.[1-9]\d*$/), verified_on: z.iso.date(),
  evidence_status: z.literal('confirmed'), review_status: z.literal('unreviewed'),
  sources: z.strictObject({ return: source, schedules: source, guide: source }),
  rows: z.array(z.strictObject({ area: z.enum(['return', 'schedule_5C', 'schedule_6A', 'schedule_8', 'schedule_9']),
    cage: z.string().regex(/^\d{2,3}[A-C]?(?:\.\d)?$/), label: z.string().min(1), binding: z.enum(bindings),
    source_doc: z.enum(['return', 'schedules', 'guide']), locator: z.string().min(1), note: z.string(), reference_figure: z.enum(figureNames).optional(),
  })).min(1),
}).superRefine((map, ctx) => {
  const ids = map.rows.map(r => `${r.area}:${r.cage}`);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'Duplicate cage mapping' });
  for (const cage of ['200', '210', '210A']) if (map.rows.find(r => r.area === 'return' && r.cage === cage)?.binding !== 'unresolved')
    ctx.addIssue({ code: 'custom', message: 'Unverified claims/disclosures must stay unresolved' });
});
export const cageMap = cageMapSchema.parse(data);

type ReviewRow = { area: string; cage: string; amount: string | null };
export function checkReviewInvariants(rows: ReviewRow[]) {
  const get = (id: string) => {
    const matches = rows.filter(row => `${row.area}:${row.cage}` === id);
    if (matches.length !== 1 || matches[0].amount === null) throw new Error('REVIEW_MAPPING_MISMATCH');
    return cents(matches[0].amount);
  };
  const checks: { id: string; status: 'passed'; formula: string; left: string; right: string }[] = [];
  const equal = (id: string, formula: string, a: bigint, b: bigint) => {
    if (a !== b) throw new Error('REVIEW_MAPPING_MISMATCH');
    checks.push({ id, status: 'passed', formula, left: money(a), right: money(b) });
  };
  const sum = (...ids: string[]) => ids.reduce((total, id) => total + get(id), 0n);
  equal('main_income', '50 = 10 + 20 + 30 + 40', get('return:50'), sum('return:10', 'return:20', 'return:30', 'return:40'));
  equal('main_reliefs', '90 = 60 + 70 + 80', get('return:90'), sum('return:60', 'return:70', 'return:80'));
  equal('main_deductions', '110 = 90 + 100', get('return:110'), sum('return:90', 'return:100'));
  equal('main_taxable', '50 = 110 + 120', get('return:50'), sum('return:110', 'return:120'));
  equal('schedule8_taxable', '801 = 808.1 + 809A.1 + 809B.1 + 809C.1 within supported scope', get('schedule_8:801'), sum('schedule_8:808.1', 'schedule_8:809A.1', 'schedule_8:809B.1', 'schedule_8:809C.1'));
  equal('taxable_transfer', 'return 120 = schedule 8 801', get('return:120'), get('schedule_8:801'));
  equal('schedule8_tax', '810 = 808.3 + 809A.3 + 809B.3 + 809C.3', get('schedule_8:810'), sum('schedule_8:808.3', 'schedule_8:809A.3', 'schedule_8:809B.3', 'schedule_8:809C.3'));
  equal('tax_transfer', 'return 150 = schedule 8 810', get('return:150'), get('schedule_8:810'));
  equal('main_tax', '170 = 130 + 140 + 150 + 160', get('return:170'), sum('return:130', 'return:140', 'return:150', 'return:160'));
  equal('main_credits', 'return 180 = schedule 9 912; details still require reconciliation', get('return:180'), get('schedule_9:912'));
  equal('main_balance', '190 = max(0, 170 - 180)', get('return:190'), nonnegative(get('return:170') - get('return:180')));
  return checks;
}
export function reviewReturn(input: z.infer<typeof returnSchema>) {
  const facts = returnSchema.parse(input);
  const calculation = computeReturn(facts);
  const { income, foreign, deductions } = facts;
  const aggregates = {
    employment_total: money(cents(income.employment) + cents(foreign.employment_lkr)),
    business_total: money(cents(income.business_net) + cents(foreign.service_net_lkr)),
    investment_total: money(cents(income.interest) + cents(income.rent)),
    deductions_total: money(cents(calculation.figures.total_reliefs) + cents(calculation.figures.qualifying_payments)),
    scope_zero: '0.00', unresolved: null,
  };
  const values = { ...calculation.figures, ...aggregates };
  const cages = cageMap.rows.map(row => {
    const origin = calculation.trace.find(t => t.line === row.binding);
    return { area: row.area, cage: row.cage, label: row.label, amount: values[row.binding],
      status: row.binding === 'unresolved' ? 'manual_review_required' : row.binding === 'scope_zero' ? 'zero_within_supported_scope' : 'computed_preview',
      reference_figure: row.reference_figure ?? null, reference_amount: row.reference_figure ? calculation.figures[row.reference_figure] : null,
      note: row.note, trace: { binding: row.binding, formula: origin?.formula ?? (row.binding === 'unresolved' ? 'No filing value derived' : row.binding === 'scope_zero' ? 'Zero only after supported scope and input validation' : 'Sum of confirmed category amounts; see inputs'),
        inputs: row.binding === 'employment_total' ? { employment: income.employment, foreign_employment: foreign.employment_lkr } :
          row.binding === 'business_total' ? { business_net: income.business_net, foreign_services_net: foreign.service_net_lkr } :
          row.binding === 'investment_total' ? { interest: income.interest, rent: income.rent } :
          row.binding === 'deductions_total' ? { reliefs: calculation.figures.total_reliefs, qualifying_payments: calculation.figures.qualifying_payments } : origin?.inputs ?? {},
        mapping_version: cageMap.version, sources: [{ url: cageMap.sources[row.source_doc].url, locator: row.locator }], calculation_trace_line: origin?.line ?? null } };
  });
  const checks = checkReviewInvariants(cages);
  const mappedFigures = new Set(cageMap.rows.map(r => r.binding));
  const coverage = figureNames.map(figure => ({ figure, value: calculation.figures[figure], disposition: cageMap.rows.some(r => r.reference_figure === figure) ? 'reference_only_manual_review' : mappedFigures.has(figure) ? 'mapped_preview' : 'working_only_no_verified_direct_cage',
    destinations: cageMap.rows.filter(r => r.binding === figure).map(r => `${r.area}:${r.cage}`),
    trace: calculation.trace.find(t => t.line === figure)! }));
  const gaps = [
    { code: 'REFUND_CLAIM_UNVERIFIED', targets: ['return:200'], detail: 'Potential overpayment is not a validated refund entitlement; the claim cage remains unset.' },
    { code: 'EXEMPT_DISCLOSURES_UNCOLLECTED', targets: ['return:210'], detail: 'A complete exempt/excluded-income disclosure was not collected.' },
    { code: 'REMITTANCE_DISCLOSURES_UNCOLLECTED', targets: ['return:210A'], detail: 'Gross remittance categories and receipt totals were not collected. Net service income is not a substitute.' },
    { code: 'COMPLETE_RETURN_UNAVAILABLE', targets: [], detail: 'Assets, liabilities, declarations, supporting detail, official filing rounding and practitioner approval remain outside this review. This is not an export checklist acknowledgement.' },
    ...calculation.input_warnings.map(w => ({ code: w.code, targets: ['schedule_9:912'], detail: w.message })),
    ...(cents(income.apit_credit) > 0n ? [{ code: 'APIT_BREAKDOWN_REQUIRED', targets: ['schedule_9:903A-903C', 'schedule_9:904A-904C'], detail: 'The APIT aggregate does not identify primary/secondary certificates or Table 08/self-paid allocations. No split or credit cage is invented.' }] : []),
    ...(cents(income.ait_wht_credit) > 0n || cents(income.instalments_paid) > 0n ? [{ code: 'ADVANCE_CREDIT_DETAILS_REQUIRED', targets: ['schedule_7A:710', 'schedule_9:908', 'schedule_9:911', 'schedule_9B:927-934'], detail: 'Advance credits and instalments need source, timing, withholding-agent/withholdee and payment-row reconciliation. Only the supported aggregate total is shown.' }] : []),
    ...(cents(deductions.solar_available) > 0n ? [{ code: 'SOLAR_HISTORY_REQUIRED', targets: ['schedule_5C:511', 'schedule_5C:513'], detail: 'Available unused expenditure does not establish total historical acquisition expenditure.' }] : []),
    ...(cents(income.final_wht_dividends_gross) > 0n ? [{ code: 'DIVIDEND_DETAILS_REQUIRED', targets: ['schedule_6A:601-606'], detail: 'The final-WHT total is informational; certificate-level details remain manual. Never put it in unpaid final withholding or advance credits.' }] : []),
    ...(calculation.flags.length ? [{ code: 'CALCULATION_FLAGS_REQUIRE_REVIEW', targets: [], detail: 'Read all engine flags, allocation assumptions and alternatives. Mapping does not resolve an interpretation or select an alternative.' }] : []),
  ];
  const hasNonSimpleIncome = [income.business_net, foreign.service_net_lkr, income.rent, income.final_wht_dividends_gross].some(v => cents(v) > 0n);
  const specialReview = cents(foreign.employment_lkr) > 0n || Object.values(deductions).some(v => cents(v) > 0n);
  const anyIncome = cents(calculation.figures.assessable_income) > 0n;
  const suggestion = hasNonSimpleIncome ? 'standard' : specialReview || !anyIncome ? 'manual_review' : 'simplified_candidate';
  return { status: 'review_only', estimate: true, filing_ready: false, export_available: false, needs_professional_review: true,
    mapping_version: cageMap.version, mapping_evidence_status: cageMap.evidence_status, mapping_review_status: cageMap.review_status,
    mapping_complete: false, cages, checks, coverage, review_gaps: gaps, flags: calculation.flags, alternatives: calculation.alternatives,
    input_warnings: calculation.input_warnings,
    return_format: { suggestion, eligibility_confirmed: false, note: 'Guide printed page 2 permits employment-and-interest-only electronic filers to use the simplified option. This is a conservative hint, not a filing obligation or portal eligibility decision.', source: cageMap.sources.guide.url },
    display_summary: `${calculation.display_summary} Return review only. Cage mapping version ${cageMap.version} is unreviewed. Unresolved refund, disclosure and supporting-detail fields remain unset. Review every gap and engine alternative. No filing output, submission or refund approval is produced.` };
}
