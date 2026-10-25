import { z } from 'zod';
import { amountSchema, selectRules } from './rules.ts';
import { cents, min } from './money.ts';
export const foreignSchema = z.strictObject({
  employment_lkr: amountSchema.describe('Annual foreign-employer salary already converted to LKR; do not include it again in local employment.'),
  service_net_lkr: amountSchema.describe('Annual net foreign service business income already computed and converted to LKR; exclude it from local business_net.'),
  foreign_tax_paid: amountSchema.describe('Eligible foreign income tax actually paid on this same qualifying income in ONE country. Exclude foreign VAT and Sri Lankan APIT.'),
  received_in_foreign_currency: z.boolean().describe('Was this foreign income received in a foreign currency? Say if you are unsure; do not infer this just because the customer is overseas.'),
  remitted_via_licensed_bank: z.boolean().describe('Was this income remitted to Sri Lanka through a licensed bank? Check the receipt records; an overseas invoice alone does not confirm this.'),
  foreign_employer_confirmed: z.boolean().describe('Is this salary paid by a foreign employer? Do not classify freelance customer payments as an employment salary.'),
  services_used_outside_lk: z.boolean().describe('Were the services used outside Sri Lanka? An overseas customer alone does not establish where the services were used.'),
  fx_conversion_confirmed: z.boolean().describe('Have all foreign amounts already been converted to LKR using an independently checked conversion for the relevant records? This tool does not convert currencies.'),
  credit_eligibility_confirmed: z.boolean().describe('Eligible income tax on the same YA income, paid within the statutory time limit or a permitted extension, with evidence.'),
  single_source_confirmed: z.boolean().describe('The claimed foreign tax and ALL foreign income in this credit calculation belong to one source and one country; no pooling across jobs/businesses.'),
});
export type ForeignFacts = z.infer<typeof foreignSchema>;
// A refusal may be established by confirmed facts even while other answers are unknown.
export function knownForeignBlock(f: Partial<ForeignFacts>): string | undefined {
  const employment = f.employment_lkr === undefined ? undefined : cents(f.employment_lkr);
  const services = f.service_net_lkr === undefined ? undefined : cents(f.service_net_lkr);
  const paid = f.foreign_tax_paid === undefined ? undefined : cents(f.foreign_tax_paid);
  const positive = (v: bigint | undefined) => v !== undefined && v > 0n;
  if (employment === 0n && services === 0n && positive(paid)) return 'FOREIGN_TAX_WITHOUT_INCOME';
  if ((positive(employment) || positive(services)) &&
      (f.received_in_foreign_currency === false || f.remitted_via_licensed_bank === false || f.fx_conversion_confirmed === false ||
       (positive(employment) && f.foreign_employer_confirmed === false) ||
       (positive(services) && f.services_used_outside_lk === false))) return 'FOREIGN_ELIGIBILITY_REVIEW';
  if (positive(paid) && f.credit_eligibility_confirmed === false) return 'FOREIGN_CREDIT_REVIEW';
  if (positive(paid) && (f.single_source_confirmed === false || (positive(employment) && positive(services))))
    return 'FOREIGN_CREDIT_SOURCE_REVIEW';
}
export function validateForeign(f: ForeignFacts) {
  f = foreignSchema.parse(f);
  const block = knownForeignBlock(f);
  if (block) throw new Error(block);
  return { total: cents(f.employment_lkr) + cents(f.service_net_lkr), paid: cents(f.foreign_tax_paid) };
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
