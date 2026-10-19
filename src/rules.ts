import { z } from 'zod';
import data from '../rules/2025-26.json' with { type: 'json' };
import { MONEY_PATTERN, cents, money } from './money.ts';
export const amountSchema = z.string().regex(MONEY_PATTERN).transform(v => money(cents(v)));
const evidence = {
  id: z.string().min(1), status: z.enum(['confirmed', 'secondary', 'assumed']),
  verified_on: z.iso.date(),
  sources: z.array(z.strictObject({ url: z.url().refine(v => v.startsWith('https://')), locator: z.string().min(1) })).min(1),
};
export const rulesSchema = z.strictObject({
  ya: z.literal('2025/26'), version: z.string().regex(/^2025\.26\.\d+$/),
  effective_from: z.iso.date(), effective_to: z.iso.date(),
  review_status: z.enum(['unreviewed', 'reviewed']),
  personal_relief: z.strictObject({ ...evidence, amount: amountSchema }),
  progressive_bands: z.strictObject({ ...evidence, bands: z.array(z.strictObject({
    width: amountSchema.nullable(), rate_bps: z.string().regex(/^\d{1,4}$/),
  })).min(1) }),
  credits: z.strictObject(evidence),
  income: z.strictObject(evidence),
  rent_relief: z.strictObject({ ...evidence, rate_bps: z.literal('2500') }),
  solar_relief: z.strictObject({ ...evidence, annual_limit: amountSchema }),
  charity: z.strictObject({ ...evidence, annual_limit: amountSchema, assessable_divisor: z.literal('4'), taxable_divisor: z.literal('3') }),
  government_donations: z.strictObject(evidence),
  samurdhi: z.strictObject(evidence),
  dividends: z.strictObject({ ...evidence, rate_bps: z.literal('1500') }),
}).superRefine((r, ctx) => {
  if (r.effective_from >= r.effective_to) ctx.addIssue({ code: 'custom', message: 'Invalid effective dates' });
  const bands = r.progressive_bands.bands;
  bands.forEach((b, i) => {
    if ((b.width === null) !== (i === bands.length - 1) || (b.width !== null && cents(b.width) === 0n))
      ctx.addIssue({ code: 'custom', message: 'Only the final band must be open; widths must be positive' });
    if (BigInt(b.rate_bps) > 10000n || (i > 0 && BigInt(b.rate_bps) < BigInt(bands[i - 1].rate_bps)))
      ctx.addIssue({ code: 'custom', message: 'Rates must be ordered and at most 100 percent' });
  });
});
export const rules = rulesSchema.parse(data);
export function selectRules(ya: string) {
  if (ya !== rules.ya) throw new Error('NOT_COVERED');
  return rules;
}
export const sources = [...new Set([rules.personal_relief, rules.progressive_bands, rules.credits, rules.income, rules.rent_relief, rules.solar_relief, rules.charity, rules.government_donations, rules.samurdhi, rules.dividends]
  .flatMap(r => r.sources.map(s => s.url)))];
