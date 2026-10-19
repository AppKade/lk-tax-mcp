import { z } from 'zod';
import { amountSchema, selectRules } from './rules.ts';
import { cents, money, min, nonnegative } from './money.ts';
import { checkScope, scopeSchema } from './scope.ts';
export const incomeSchema = z.strictObject({
  employment: amountSchema, business_net: amountSchema, interest: amountSchema,
  rent: amountSchema.describe('Gross local investment rent, with no repair or other expense deduction claimed.'),
  final_wht_dividends_gross: amountSchema.describe('Resident-company dividends with final withholding already deducted; otherwise mark other_income_or_claims true.'),
  final_wht_dividends_deducted: amountSchema.describe('Actual final WHT deducted on these dividends. Informational only, never an advance tax credit.'),
  apit_credit: amountSchema, ait_wht_credit: amountSchema, instalments_paid: amountSchema,
  other_income_or_claims: z.boolean(),
});
export const deductionsSchema = z.strictObject({
  solar_available: amountSchema.describe('Confirmed eligible expenditure remaining after all prior relief claims for panels on own premises connected to the national grid. Loan-funded claims are not supported.'),
  approved_charity_cash: amountSchema.describe('Cash donations to approved charitable institutions only; exclude in-kind donations.'),
  government_donations: amountSchema.describe('Eligible current-year donations to Government or qualifying specified institutions, including in-kind donations.'),
  government_donations_brought_forward: amountSchema.describe('Only an eligible and independently verified Government-donation carry-forward under Annexure 3(f); legacy qualifying-payment balances are unsupported.'),
  samurdhi_shop_contributions: amountSchema.describe('Confirmed eligible contributions to a shop for a female Samurdhi beneficiary, recommended and confirmed by the department.'),
});
export type IncomeFacts = z.infer<typeof incomeSchema>;
export type DeductionFacts = z.infer<typeof deductionsSchema>;
export const returnSchema = z.strictObject({ ya: z.string(), scope: scopeSchema, income: incomeSchema, deductions: deductionsSchema });
export const figureNames = [
  'assessable_income', 'rent_relief', 'personal_relief', 'solar_relief', 'solar_unused_balance',
  'government_donation_deduction', 'government_donations_carry_forward',
  'samurdhi_deduction', 'samurdhi_unclaimed', 'charity_deduction', 'charity_unclaimed',
  'total_reliefs', 'qualifying_payments', 'taxable_income', 'tax', 'credits',
  'balance_payable', 'potential_overpayment', 'final_wht_dividends_gross', 'final_wht_dividends_deducted',
] as const;
const roundRatio = (numerator: bigint, denominator: bigint) => (numerator + denominator / 2n) / denominator;
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
  // Preview convention: round combined tax once to cents, half up.
  // Official whole-rupee filing policy still needs verification.
  return roundRatio(numerator, 10000n);
}
export function computeReturn(input: z.infer<typeof returnSchema>) {
  const { ya, scope, income, deductions: d } = returnSchema.parse(input);
  const r = selectRules(ya);
  const checked = checkScope(scope);
  if (checked.status === 'out_of_scope') throw new Error('OUT_OF_SCOPE');
  if (scope.qualifying_foreign_income || scope.multiple_foreign_tax_countries || scope.foreign_credit_exceeds_cap || scope.preparing_for_clients || income.other_income_or_claims)
    throw new Error('FEATURE_NOT_IMPLEMENTED');
  const dividendGross = cents(income.final_wht_dividends_gross);
  const dividendWht = cents(income.final_wht_dividends_deducted);
  if (dividendWht !== roundRatio(dividendGross * BigInt(r.dividends.rate_bps), 10000n))
    throw new Error('DIVIDEND_WHT_REVIEW');
  const assessable = cents(income.employment) + cents(income.business_net) + cents(income.interest) + cents(income.rent);
  const rentRelief = min(assessable, roundRatio(cents(income.rent) * BigInt(r.rent_relief.rate_bps), 10000n));
  const personalRelief = min(assessable - rentRelief, cents(r.personal_relief.amount));
  const solar = min(min(cents(d.solar_available), cents(r.solar_relief.annual_limit)), assessable - rentRelief - personalRelief);
  const totalReliefs = rentRelief + personalRelief + solar;
  let remaining = assessable - totalReliefs;
  const governmentAvailable = cents(d.government_donations) + cents(d.government_donations_brought_forward);
  const government = min(remaining, governmentAvailable);
  remaining -= government;
  const samurdhi = min(remaining, cents(d.samurdhi_shop_contributions));
  remaining -= samurdhi;
  const charityAvailable = min(cents(d.approved_charity_cash), cents(r.charity.annual_limit));
  // Annexure 3(a) gives two bases. Do not silently choose when they differ.
  // If c <= taxable_income/3 and taxable_income = remaining-c, c <= remaining/4.
  const assessableCap = min(charityAvailable, assessable / BigInt(r.charity.assessable_divisor));
  const taxableCap = min(charityAvailable, remaining / (BigInt(r.charity.taxable_divisor) + 1n));
  if (assessableCap !== taxableCap) throw new Error('CHARITY_CAP_REVIEW');
  const charity = taxableCap;
  const qualifyingPayments = government + samurdhi + charity;
  const taxable = remaining - charity;
  const tax = progressiveTax(taxable, ya);
  const credits = cents(income.apit_credit) + cents(income.ait_wht_credit) + cents(income.instalments_paid);
  const figures = {
    assessable_income: money(assessable), rent_relief: money(rentRelief), personal_relief: money(personalRelief),
    solar_relief: money(solar), solar_unused_balance: money(cents(d.solar_available) - solar),
    government_donation_deduction: money(government), government_donations_carry_forward: money(governmentAvailable - government),
    samurdhi_deduction: money(samurdhi), samurdhi_unclaimed: money(cents(d.samurdhi_shop_contributions) - samurdhi),
    charity_deduction: money(charity), charity_unclaimed: money(cents(d.approved_charity_cash) - charity),
    total_reliefs: money(totalReliefs), qualifying_payments: money(qualifyingPayments), taxable_income: money(taxable),
    tax: money(tax), credits: money(credits), balance_payable: money(nonnegative(tax - credits)),
    potential_overpayment: money(nonnegative(credits - tax)),
    final_wht_dividends_gross: money(dividendGross), final_wht_dividends_deducted: money(dividendWht),
  };
  const trace: { line: typeof figureNames[number]; rule_id: string; formula: string; inputs: Record<string, string>; value: string; sources: typeof r.credits.sources; version: string; children: string[] }[] = [];
  function explain(line: typeof figureNames[number], rule: typeof r.credits, formula: string, inputs: Record<string, string>, children: string[] = []) {
    trace.push({ line, rule_id: rule.id, formula, inputs, value: figures[line], sources: rule.sources, version: r.version, children });
  }
  explain('assessable_income', r.income, 'employment + business_net + interest + rent; exclude final-WHT dividends', { employment: income.employment, business_net: income.business_net, interest: income.interest, rent: income.rent });
  explain('rent_relief', r.rent_relief, 'gross local investment rent * rate_bps / 10000; preview rounding to cents', { rent: income.rent, rate_bps: r.rent_relief.rate_bps });
  explain('personal_relief', r.personal_relief, 'min(assessable_income - rent_relief, personal_relief_limit)', { assessable_income: figures.assessable_income, rent_relief: figures.rent_relief, personal_relief_limit: r.personal_relief.amount }, ['assessable_income', 'rent_relief']);
  explain('solar_relief', r.solar_relief, 'min(eligible unused expenditure, annual_limit, income remaining after rent and personal relief)', { solar_available: d.solar_available, annual_limit: r.solar_relief.annual_limit }, ['assessable_income', 'rent_relief', 'personal_relief']);
  explain('solar_unused_balance', r.solar_relief, 'solar_available - solar_relief', { solar_available: d.solar_available, solar_relief: figures.solar_relief }, ['solar_relief']);
  explain('total_reliefs', r.personal_relief, 'rent_relief + personal_relief + solar_relief', { rent_relief: figures.rent_relief, personal_relief: figures.personal_relief, solar_relief: figures.solar_relief }, ['rent_relief', 'personal_relief', 'solar_relief']);
  explain('government_donation_deduction', r.government_donations, 'min(current + eligible brought forward, income remaining after reliefs)', { government_donations: d.government_donations, brought_forward: d.government_donations_brought_forward }, ['assessable_income', 'total_reliefs']);
  explain('government_donations_carry_forward', r.government_donations, 'current + eligible brought forward - government_donation_deduction', { current: d.government_donations, brought_forward: d.government_donations_brought_forward, used: figures.government_donation_deduction }, ['government_donation_deduction']);
  explain('samurdhi_deduction', r.samurdhi, 'min(eligible contributions, remaining income after reliefs and government donations)', { eligible_contributions: d.samurdhi_shop_contributions }, ['total_reliefs', 'government_donation_deduction']);
  explain('samurdhi_unclaimed', r.samurdhi, 'eligible contributions - samurdhi_deduction; no carry-forward asserted', { contributions: d.samurdhi_shop_contributions, used: figures.samurdhi_deduction }, ['samurdhi_deduction']);
  explain('charity_deduction', r.charity, 'min(cash donation, annual_limit, assessable_income/4) must equal min(cash donation, annual_limit, remaining_income/4); otherwise refuse for review', { cash_donation: d.approved_charity_cash, annual_limit: r.charity.annual_limit, assessable_income: figures.assessable_income, remaining_income: money(remaining) }, ['assessable_income', 'total_reliefs', 'government_donation_deduction', 'samurdhi_deduction']);
  explain('charity_unclaimed', r.charity, 'cash donation - charity_deduction; no carry-forward asserted', { cash_donation: d.approved_charity_cash, used: figures.charity_deduction }, ['charity_deduction']);
  explain('qualifying_payments', r.government_donations, 'government_donation_deduction + samurdhi_deduction + charity_deduction', { government: figures.government_donation_deduction, samurdhi: figures.samurdhi_deduction, charity: figures.charity_deduction }, ['government_donation_deduction', 'samurdhi_deduction', 'charity_deduction']);
  explain('taxable_income', r.income, 'assessable_income - total_reliefs - qualifying_payments', { assessable_income: figures.assessable_income, total_reliefs: figures.total_reliefs, qualifying_payments: figures.qualifying_payments }, ['assessable_income', 'total_reliefs', 'qualifying_payments']);
  explain('tax', r.progressive_bands, 'sum(band_slice * rate_bps / 10000); round once to cents half up', { taxable_income: figures.taxable_income }, ['taxable_income']);
  explain('credits', r.credits, 'apit_credit + ait_wht_credit + instalments_paid; exclude final dividend WHT', { apit_credit: income.apit_credit, ait_wht_credit: income.ait_wht_credit, instalments_paid: income.instalments_paid });
  explain('balance_payable', r.credits, 'max(0, tax - credits)', { tax: figures.tax, credits: figures.credits }, ['tax', 'credits']);
  explain('potential_overpayment', r.credits, 'max(0, credits - tax); not a validated refund claim', { tax: figures.tax, credits: figures.credits }, ['tax', 'credits']);
  explain('final_wht_dividends_gross', r.dividends, 'confirmed gross resident-company dividends; informational, excluded from assessable income', { gross: income.final_wht_dividends_gross });
  explain('final_wht_dividends_deducted', r.dividends, 'actual deducted final WHT must match gross * rate_bps / 10000; informational, never a credit', { gross: income.final_wht_dividends_gross, actual_deducted: income.final_wht_dividends_deducted, rate_bps: r.dividends.rate_bps }, ['final_wht_dividends_gross']);
  return {
    status: 'complete' as const, estimate: true, filing_ready: false,
    needs_professional_review: true, scope: checked, figures, trace,
    display_summary: `Preview estimate for YA ${ya}. Tax: LKR ${figures.tax}. Credits: LKR ${figures.credits}. Balance payable: LKR ${figures.balance_payable}. Potential overpayment: LKR ${figures.potential_overpayment}. Verify before filing. Not IRD-approved; not tax advice.`,
  };
}
