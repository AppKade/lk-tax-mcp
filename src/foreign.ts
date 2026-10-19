import { z } from 'zod';
import { amountSchema, selectRules } from './rules.ts';
import { cents, min } from './money.ts';
export const foreignSchema = z.strictObject({
  employment_lkr: amountSchema.describe('Annual foreign-employer salary already converted to LKR; do not include it again in local employment.'),
  service_net_lkr: amountSchema.describe('Annual net foreign service business income already computed and converted to LKR; exclude it from local business_net.'),
  foreign_tax_paid: amountSchema.describe('Eligible foreign income tax actually paid on this same qualifying income in ONE country. Exclude foreign VAT and Sri Lankan APIT.'),
  received_in_foreign_currency: z.boolean(),
  remitted_via_licensed_bank: z.boolean(),
  foreign_employer_confirmed: z.boolean(),
  services_used_outside_lk: z.boolean(),
  fx_conversion_confirmed: z.boolean(),
  credit_eligibility_confirmed: z.boolean().describe('Eligible income tax on the same YA income, paid within the statutory time limit or a permitted extension, with evidence.'),
  single_source_confirmed: z.boolean().describe('The claimed foreign tax and ALL foreign income in this credit calculation belong to one source and one country; no pooling across jobs/businesses.'),
});
export type ForeignFacts = z.infer<typeof foreignSchema>;
export function validateForeign(f: ForeignFacts) {
  const total = cents(f.employment_lkr) + cents(f.service_net_lkr);
  const paid = cents(f.foreign_tax_paid);
  if (total === 0n && paid > 0n) throw new Error('FOREIGN_TAX_WITHOUT_INCOME');
  if (total > 0n && (!f.received_in_foreign_currency || !f.remitted_via_licensed_bank || !f.fx_conversion_confirmed ||
    (cents(f.employment_lkr) > 0n && !f.foreign_employer_confirmed) ||
    (cents(f.service_net_lkr) > 0n && !f.services_used_outside_lk))) throw new Error('FOREIGN_ELIGIBILITY_REVIEW');
  if (paid > 0n && !f.credit_eligibility_confirmed) throw new Error('FOREIGN_CREDIT_REVIEW');
  if (paid > 0n && (!f.single_source_confirmed || (cents(f.employment_lkr) > 0n && cents(f.service_net_lkr) > 0n)))
    throw new Error('FOREIGN_CREDIT_SOURCE_REVIEW');
  return { total, paid };
}
export function cappedForeignTax(taxable: bigint, localTaxable: bigint, ya: string) {
  if (taxable < 0n || localTaxable < 0n) throw new Error('INVALID_MONEY');
  const r = selectRules(ya);
  let remaining = taxable;
  let localRemaining = localTaxable;
  let numerator = 0n;
  for (const band of r.progressive_bands.bands) {
    const occupied = band.width === null ? localRemaining : min(localRemaining, cents(band.width));
    localRemaining -= occupied;
    const available = band.width === null ? remaining : cents(band.width) - occupied;
    const slice = min(remaining, available);
    numerator += slice * min(BigInt(band.rate_bps), BigInt(r.foreign_income.cap_bps));
    remaining -= slice;
  }
  return (numerator + 5000n) / 10000n;
}
