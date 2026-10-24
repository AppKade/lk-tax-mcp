import { z } from 'zod';
// Every exclusion must be answered. Missing answers can never become false.
export const scopeSchema = z.strictObject({
  resident_full_year: z.boolean().describe('Were you resident in Sri Lanka throughout this year of assessment?'),
  residency_special_case: z.boolean().describe('Does your residency need special review, such as a move into or out of Sri Lanka during the year?'),
  investment_asset_gains: z.boolean().describe('Do you have gains from selling investment assets that need a capital-gains calculation?'),
  partnership_or_trust: z.boolean().describe('Do you have income allocated from a partnership or trust?'),
  restricted_business: z.boolean().describe('Do you have business income subject to special rates, such as betting, gaming, liquor or tobacco?'),
  terminal_benefits_or_arrears: z.boolean().describe('Did you receive retirement or termination benefits, or salary arrears?'),
  business_profit_needs_computation: z.boolean().describe('Do you need help calculating business net profit from receipts and expenses? This tool accepts only a net profit prepared outside it.'),
  losses: z.boolean().describe('Do you need to claim or carry forward a business or other tax loss?'),
  multiple_foreign_tax_countries: z.boolean().describe('Does your foreign income tax credit claim involve more than one country?'),
  foreign_credit_exceeds_cap: z.boolean().optional().describe('Optional legacy hint. Do not ask the user to calculate a credit ceiling; computation derives this from amounts.'),
  qualifying_foreign_income: z.boolean().optional().describe('Optional legacy hint. Foreign income and eligibility are collected separately; computation derives this flag.'),
  local_taxable_below_first_band: z.boolean().optional().describe('Optional legacy hint. Do not ask the user to calculate a tax-band position; computation derives this from amounts.'),
  amendment_assessment_or_appeal: z.boolean().describe('Is this an amendment to a filed return, an assessment dispute or an appeal?'),
  preparing_for_clients: z.boolean().describe('Are you preparing this estimate for a client rather than yourself?'),
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
