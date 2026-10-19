import { z } from 'zod';
import { amountSchema, selectRules } from './rules.ts';
import { cents, money, min, nonnegative } from './money.ts';
import { checkScope, scopeSchema } from './scope.ts';
export const incomeSchema = z.strictObject({
  employment: amountSchema, business_net: amountSchema, interest: amountSchema,
  apit_credit: amountSchema, ait_wht_credit: amountSchema, instalments_paid: amountSchema,
  other_income_or_claims: z.boolean(),
});
export type IncomeFacts = z.infer<typeof incomeSchema>;
export const returnSchema = z.strictObject({ ya: z.string(), scope: scopeSchema, income: incomeSchema });
export function progressiveTax(taxable: bigint, ya: string) {
  const r = selectRules(ya);
  if (taxable < 0n) throw new Error('INVALID_MONEY');
  let remaining = taxable;
  let numerator = 0n;
  for (const band of r.progressive_bands.bands) {
    const slice = band.width === null ? remaining : min(remaining, cents(band.width));
    numerator += slice * BigInt(band.rate_bps);
    remaining -= slice;
  }
  // Preview convention: round the combined tax once to cents, half up.
  // Official whole-rupee filing policy still needs verification.
  return (numerator + 5000n) / 10000n;
}
export function computeReturn(input: z.infer<typeof returnSchema>) {
  const { ya, scope, income } = returnSchema.parse(input);
  const r = selectRules(ya);
  const checked = checkScope(scope);
  if (checked.status === 'out_of_scope') throw new Error('OUT_OF_SCOPE');
  if (scope.qualifying_foreign_income || scope.multiple_foreign_tax_countries || scope.foreign_credit_exceeds_cap || scope.preparing_for_clients || income.other_income_or_claims)
    throw new Error('FEATURE_NOT_IMPLEMENTED');
  const assessable = cents(income.employment) + cents(income.business_net) + cents(income.interest);
  const relief = min(assessable, cents(r.personal_relief.amount));
  const taxable = assessable - relief;
  const tax = progressiveTax(taxable, ya);
  const credits = cents(income.apit_credit) + cents(income.ait_wht_credit) + cents(income.instalments_paid);
  const figures = {
    assessable_income: money(assessable), personal_relief: money(relief), taxable_income: money(taxable),
    tax: money(tax), credits: money(credits), balance_payable: money(nonnegative(tax - credits)),
    potential_overpayment: money(nonnegative(credits - tax)),
  };
  const trace = [
    { line: 'assessable_income', rule_id: r.credits.id, formula: 'employment + business_net + interest', inputs: { employment: income.employment, business_net: income.business_net, interest: income.interest }, value: figures.assessable_income, sources: r.credits.sources },
    { line: 'personal_relief', rule_id: r.personal_relief.id, formula: 'min(assessable_income, personal_relief_limit)', inputs: { assessable_income: figures.assessable_income, personal_relief_limit: r.personal_relief.amount }, value: figures.personal_relief, sources: r.personal_relief.sources },
    { line: 'taxable_income', rule_id: r.personal_relief.id, formula: 'assessable_income - personal_relief', inputs: { assessable_income: figures.assessable_income, personal_relief: figures.personal_relief }, value: figures.taxable_income, sources: r.personal_relief.sources },
    { line: 'tax', rule_id: r.progressive_bands.id, formula: 'sum(band_slice * rate_bps / 10000); round once to cents half up', inputs: { taxable_income: figures.taxable_income }, value: figures.tax, sources: r.progressive_bands.sources },
    { line: 'credits', rule_id: r.credits.id, formula: 'apit_credit + ait_wht_credit + instalments_paid', inputs: { apit_credit: income.apit_credit, ait_wht_credit: income.ait_wht_credit, instalments_paid: income.instalments_paid }, value: figures.credits, sources: r.credits.sources },
    { line: 'balance_payable', rule_id: r.credits.id, formula: 'max(0, tax - credits)', inputs: { tax: figures.tax, credits: figures.credits }, value: figures.balance_payable, sources: r.credits.sources },
    { line: 'potential_overpayment', rule_id: r.credits.id, formula: 'max(0, credits - tax); not a validated refund claim', inputs: { tax: figures.tax, credits: figures.credits }, value: figures.potential_overpayment, sources: r.credits.sources },
  ].map(t => ({ ...t, version: r.version, children: [] }));
  return {
    status: 'complete' as const, estimate: true, filing_ready: false,
    needs_professional_review: true, scope: checked, figures, trace,
    display_summary: `Preview estimate for YA ${ya}. Tax: LKR ${figures.tax}. Credits: LKR ${figures.credits}. Balance payable: LKR ${figures.balance_payable}. Potential overpayment: LKR ${figures.potential_overpayment}. Verify before filing. Not IRD-approved; not tax advice.`,
  };
}
