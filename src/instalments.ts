import instalmentData from '../rules/instalments-2026-27.json' with { type: 'json' };
import { z } from 'zod';
import { cents, money, MONEY_PATTERN, nonnegative } from './money.ts';
import { scopeSchema, checkScope } from './scope.ts';

export const instalmentRulesSchema = z.strictObject({
  ya: z.literal('2026/27'), version: z.string().regex(/^2026\.27\.[1-9]\d*$/),
  verified_on: z.iso.date(), review_status: z.literal('unreviewed'),
  source: z.url(), source_date: z.iso.date(), source_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  payment_dates: z.array(z.iso.date()).length(4), credit_schedule_dates: z.array(z.iso.date()).length(4),
  revision_notice_dates: z.tuple([z.null(), z.iso.date(), z.iso.date(), z.iso.date()]),
  attachment_deadline: z.iso.date(),
});
export const instalmentRules = instalmentRulesSchema.parse(instalmentData);
const amount = z.string().regex(MONEY_PATTERN);
const adjustedBasis = {
  calculation_basis: z.enum(['previous_return', 'previous_final_set']),
  previous_return_finalised: z.boolean(), first_quarter_used_set: z.boolean(),
  set_return_revision_count: z.number().int().min(0).max(1),
};
export const instalmentSchema = z.strictObject({
  ya: z.literal('2026/27'), quarter: z.number().int().min(1).max(4), scope: scopeSchema,
  basis: z.discriminatedUnion('method', [
    z.strictObject({ method: z.literal('1'), prior_taxable_income_exists: z.boolean() }),
    z.strictObject({ method: z.literal('2_i'), no_prior_taxable_income: z.boolean(), no_current_assessable_income_expected: z.boolean() }),
    z.strictObject({ method: z.literal('2_ii'), no_prior_taxable_income: z.boolean(), current_assessable_income_expected: z.boolean(),
      reason: z.enum(['reduced_losses', 'expired_exemption']), ...adjustedBasis }),
    z.strictObject({ method: z.literal('2_iii'), prior_assessable_income_exists: z.boolean(), lower_assessable_income_expected: z.boolean(),
      lower_taxable_income_expected: z.boolean(), ...adjustedBasis }),
    z.strictObject({ method: z.literal('2_iv'), first_year_new_taxpayer: z.boolean() }),
  ]),
  gross_tax_basis: amount, basis_prepared_under_method_confirmed: z.boolean(), foreign_credit_in_basis: z.boolean(),
  prior_instalments_paid: amount,
  apit_already_deducted: amount, apit_expected_remaining: amount,
  ait_wht_already_deducted: amount, ait_wht_expected_remaining: amount,
  credits_reconciled_without_overlap: z.boolean(),
  switched_from_standard: z.boolean(), revision_notice_submitted_on_time: z.boolean(),
});

// Arithmetic helper also permits testing corporate source examples without exposing corporate scope.
export function instalmentAmount(a: bigint, c: bigint, b: bigint) {
  if (a < 0n || c < 0n || b < 1n || b > 4n) throw new Error('INVALID_INSTALMENT_FACTS');
  const remaining = nonnegative(a - c);
  // Conservative cent ceiling is a preview assumption, not verified payment-system rounding.
  return (remaining + b - 1n) / b;
}
export function planInstalments(input: unknown) {
  const parsed = instalmentSchema.safeParse(input);
  if (!parsed.success) throw new Error('INVALID_INSTALMENT_FACTS');
  const f = parsed.data;
  const scope = checkScope(f.scope);
  if (scope.status === 'out_of_scope') throw new Error('OUT_OF_SCOPE');
  if (!f.basis_prepared_under_method_confirmed || f.foreign_credit_in_basis)
    throw new Error('INSTALMENT_BASIS_REVIEW');
  if (!f.credits_reconciled_without_overlap) throw new Error('INSTALMENT_CREDIT_REVIEW');
  const basis = f.basis;
  const a = cents(f.gross_tax_basis);
  if ((basis.method === '1' && !basis.prior_taxable_income_exists) ||
      (basis.method === '2_i' && (!basis.no_prior_taxable_income || !basis.no_current_assessable_income_expected || a !== 0n)) ||
      (basis.method === '2_ii' && (!basis.no_prior_taxable_income || !basis.current_assessable_income_expected)) ||
      (basis.method === '2_iii' && (!basis.prior_assessable_income_exists || !basis.lower_assessable_income_expected || !basis.lower_taxable_income_expected)) ||
      (basis.method === '2_iv' && !basis.first_year_new_taxpayer)) throw new Error('INSTALMENT_METHOD_REVIEW');
  let attachment = basis.method === '1' ? 'none' : basis.method === '2_iv' ? 'Attachment 2' : 'Attachment 1';
  let setRevisionRequired = false;
  if (basis.method === '2_ii' || basis.method === '2_iii') {
    if (basis.calculation_basis === 'previous_final_set') {
      if (f.quarter !== 1 || basis.previous_return_finalised || basis.first_quarter_used_set || basis.set_return_revision_count !== 0)
        throw new Error('INSTALMENT_SET_REVIEW');
      setRevisionRequired = true;
    } else {
      if (!basis.previous_return_finalised || (f.quarter === 1 && basis.first_quarter_used_set) ||
          basis.set_return_revision_count !== (basis.first_quarter_used_set ? 1 : 0)) throw new Error('INSTALMENT_SET_REVIEW');
      if (basis.first_quarter_used_set) attachment = 'Attachment 1 (Revised)';
    }
  }
  if (f.switched_from_standard && (f.quarter === 1 || !['2_iii'].includes(basis.method) || !f.revision_notice_submitted_on_time))
    throw new Error('INSTALMENT_REVISION_REVIEW');
  if (!f.switched_from_standard && f.revision_notice_submitted_on_time) throw new Error('INSTALMENT_REVISION_REVIEW');
  const paid = cents(f.prior_instalments_paid);
  if (f.quarter === 1 && paid !== 0n) throw new Error('INSTALMENT_CREDIT_REVIEW');
  const apitPaid = cents(f.apit_already_deducted), apitExpected = cents(f.apit_expected_remaining);
  const aitPaid = cents(f.ait_wht_already_deducted), aitExpected = cents(f.ait_wht_expected_remaining);
  const c = paid + apitPaid + apitExpected + aitPaid + aitExpected;
  const b = BigInt(5 - f.quarter);
  const payable = instalmentAmount(a, c, b);
  const figures = {
    gross_tax_basis: money(a), prior_instalments_paid: money(paid),
    apit_already_deducted: money(apitPaid), apit_expected_remaining: money(apitExpected),
    ait_wht_already_deducted: money(aitPaid), ait_wht_expected_remaining: money(aitExpected),
    total_credits: money(c), remaining_tax_basis: money(nonnegative(a - c)), instalment_payable: money(payable),
  };
  const formulas: Record<keyof typeof figures, string> = {
    gross_tax_basis: 'User-confirmed gross tax prepared under the selected method; never the net balance payable',
    prior_instalments_paid: 'Actual earlier instalments for YA 2026/27 paid before this due date; never projected payments',
    apit_already_deducted: 'Eligible YA 2026/27 APIT already deducted', apit_expected_remaining: 'Eligible YA 2026/27 APIT expected later; excludes APIT already deducted',
    ait_wht_already_deducted: 'Eligible YA 2026/27 AIT/WHT already deducted; excludes final withholding',
    ait_wht_expected_remaining: 'Eligible YA 2026/27 AIT/WHT expected later; excludes amounts already deducted and final withholding',
    total_credits: 'C = prior instalments + APIT already deducted + APIT expected remaining + AIT/WHT already deducted + AIT/WHT expected remaining',
    remaining_tax_basis: 'max(0, A - C); excess credits do not establish a refund',
    instalment_payable: 'ceil_to_cent(max(0, A - C) / B), B = 5 - quarter',
  };
  const trace = Object.entries(figures).map(([line, value]) => ({ line, value, formula: formulas[line as keyof typeof figures],
    inputs: { A: money(a), C: money(c), B: b.toString() }, version: instalmentRules.version,
    sources: [instalmentRules.source], locator: 'Sections 1-2 and 3(1)-(2), printed pages 1-10' }));
  const notes = [
    'A is supplied and confirmed externally under the selected method. This tool does not estimate YA 2026/27 annual tax or validate the underlying accounts.',
    'C uses actual earlier instalments plus reconciled full-year eligible withholding split between already deducted and expected remaining. Future instalment payments are excluded.',
    'Cent ceiling is an unreviewed preview assumption. Confirm official payment rounding before paying. No refund, penalty, interest or filing-obligation decision is made.',
    'Credit schedules generally fall due at month end. Section 3(2) exempts certain employees; zero payable alone does not establish that exception. Confirm eligibility separately.',
  ];
  if (setRevisionRequired) notes.push('Recalculate on the YA 2025/26 return for the second instalment. Submit Attachment 1 and Attachment 1 (Revised); only one SET-to-return revision is permitted.');
  return { method: basis.method, scope, quarter: f.quarter, remaining_instalments: Number(b), figures, trace,
    estimate: true, filing_ready: false, payment_due_date: instalmentRules.payment_dates[f.quarter - 1],
    schedule: instalmentRules.payment_dates.map((due_date, i) => ({ quarter: i + 1, due_date })),
    credit_schedule: { status: payable === 0n && apitPaid + apitExpected + aitPaid + aitExpected > 0n ? 'review_employment_exception' : 'required',
      due_date: instalmentRules.credit_schedule_dates[f.quarter - 1] },
    attachment: { required: attachment, deadline: attachment === 'none' ? null : instalmentRules.attachment_deadline,
      set_revision_required_by_second_instalment: setRevisionRequired },
    revision_notice_deadline: instalmentRules.revision_notice_dates[f.quarter - 1],
    rounding: { status: 'assumed', policy: 'ceiling_to_cent', division_remainder_cents: (nonnegative(a - c) % b).toString() }, notes,
    display_summary: `YA 2026/27 development instalment estimate. Method ${basis.method}, quarter ${f.quarter}: LKR ${money(payable)} by ${instalmentRules.payment_dates[f.quarter - 1]}. A = ${money(a)}, C = ${money(c)}, B = ${b}. ${notes.join(' ')}`,
  };
}
