import { z } from 'zod';
// Every exclusion must be answered. Missing answers can never become false.
export const scopeSchema = z.strictObject({
  resident_full_year: z.boolean(), residency_special_case: z.boolean(),
  investment_asset_gains: z.boolean(), partnership_or_trust: z.boolean(),
  restricted_business: z.boolean(), terminal_benefits_or_arrears: z.boolean(),
  business_profit_needs_computation: z.boolean(), losses: z.boolean(),
  multiple_foreign_tax_countries: z.boolean(), foreign_credit_exceeds_cap: z.boolean(),
  qualifying_foreign_income: z.boolean(), local_taxable_below_first_band: z.boolean(),
  amendment_assessment_or_appeal: z.boolean(), preparing_for_clients: z.boolean(),
});
export type ScopeFacts = z.infer<typeof scopeSchema>;
export function checkScope(input: ScopeFacts) {
  return scopeResult(scopeSchema.parse(input));
}
// Missing answers stay unknown. Known exclusions can stop intake before more facts are collected.
export function checkKnownScope(input: Partial<ScopeFacts>) {
  const result = scopeResult(scopeSchema.partial().parse(input));
  return { ...result, status: result.status === 'out_of_scope' ? 'out_of_scope' as const : 'undetermined' as const };
}
function scopeResult(f: Partial<ScopeFacts>) {
  const reasons: { code: string; severity: 'partial' | 'out_of_scope'; message: string }[] = [];
  const add = (condition: boolean | undefined, code: string, severity: 'partial' | 'out_of_scope', message: string) => {
    if (condition) reasons.push({ code, severity, message });
  };
  add(f.resident_full_year === false || f.residency_special_case === true, 'SC-01', 'out_of_scope', 'Residency requires professional review.');
  add(f.investment_asset_gains, 'SC-02', 'out_of_scope', 'Investment asset gains require a separate calculation and return.');
  add(f.partnership_or_trust, 'SC-03', 'out_of_scope', 'Partnership and trust shares are unsupported.');
  add(f.restricted_business, 'SC-04', 'out_of_scope', 'Special-rate business income is unsupported.');
  add(f.terminal_benefits_or_arrears, 'SC-05', 'out_of_scope', 'Terminal benefits and salary arrears are unsupported.');
  add(f.losses, 'SC-06', 'out_of_scope', 'Loss adjustments are unsupported.');
  add(f.business_profit_needs_computation && !f.losses, 'SC-06', 'partial', 'Supply net profit calculated outside this tool; business accounts are not computed.');
  add(f.multiple_foreign_tax_countries || f.foreign_credit_exceeds_cap, 'SC-07', 'partial', 'Foreign tax credits need professional review.');
  add(f.qualifying_foreign_income && f.local_taxable_below_first_band, 'SC-08', 'partial', 'Foreign-income stacking has unresolved interpretations.');
  add(f.amendment_assessment_or_appeal, 'SC-09', 'out_of_scope', 'Amendments, assessments and appeals require professional assistance.');
  add(f.preparing_for_clients, 'SC-09', 'partial', 'Client preparation requires review of controller and professional obligations.');
  const status = reasons.some(r => r.severity === 'out_of_scope') ? 'out_of_scope' : reasons.length ? 'partial' : 'in_scope';
  return { status, reasons, needs_professional_review: status !== 'in_scope' };
}
