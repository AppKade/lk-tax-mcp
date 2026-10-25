import { z } from 'zod';
import { foreignSchema, validateForeign, cappedForeignTax } from './foreign.ts';
import { amountSchema, selectRules } from './rules.ts';
import { cents, money, min, nonnegative } from './money.ts';
import { checkScope, scopeSchema } from './scope.ts';
export const incomeSchema = z.strictObject({
  employment: amountSchema.describe('Your total local employment pay for this tax year before tax and employee deductions, including taxable bonuses and benefits. Use the annual taxable-employment certificate, not take-home pay. Exclude foreign salary entered separately and do not add an old certificate to its replacement.'),
  business_net: amountSchema.describe('Local taxable business net profit prepared outside this tool, not revenue or bank deposits. Do not include foreign services entered separately. Losses and account preparation are unsupported.'),
  interest: amountSchema.describe('Total taxable local bank interest for this year before the bank withheld tax. Use gross interest, not the net amount credited. We ask about the tax withheld separately.'),
  rent: amountSchema.describe('Total local rental income before any expenses. Tell the assistant if you want to claim repairs or other rental expenses, which this preview cannot calculate.'),
  final_wht_dividends_gross: amountSchema.describe('Total resident-company dividends before final tax already withheld. If final tax was not already deducted, tell the assistant so it can check whether the case is supported.'),
  final_wht_dividends_deducted: amountSchema.describe('Actual final WHT deducted on these dividends. Informational only, never an advance tax credit.'),
  apit_credit: amountSchema.describe('Tax already deducted or paid on your employment for this year, shown as APIT/PAYE on the employer certificate, including any separately paid Table 08 tax. Do not infer it from take-home pay or other employee deductions. If the tax amount is not stated, say it is unknown rather than zero. Exclude foreign income tax and duplicate certificates.'),
  ait_wht_credit: amountSchema.describe('Eligible advance tax already withheld by your bank or another local payer for this year, shown as AIT/WHT on certificates. Exclude final dividend tax, foreign income tax and duplicate certificates. If it is not stated, say it is unknown rather than zero.'),
  instalments_paid: amountSchema.describe('Actual income-tax instalments paid for this year from payment records. Exclude projected payments and payments for another year.'),
  other_income_or_claims: z.boolean().describe('Do you have any other income or claim outside the supported categories, including unsupported or exempt income, rent expenses, other dividends or loan-funded solar claims? Do not omit genuine income to bypass a refusal.'),
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
export const returnSchema = z.strictObject({ ya: z.string(), scope: scopeSchema, income: incomeSchema, deductions: deductionsSchema, foreign: foreignSchema });
export const figureNames = [
  'local_assessable_income', 'foreign_assessable_income', 'local_taxable_income', 'foreign_taxable_income', 'foreign_deductions',
  'tax_progressive', 'tax_foreign', 'foreign_credit_average_limit', 'foreign_tax_credit', 'foreign_tax_uncredited',
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
  const { ya, scope, income, deductions: d, foreign } = returnSchema.parse(input);
  const r = selectRules(ya);
  let checked = checkScope(scope);
  if (checked.status === 'out_of_scope') throw new Error('OUT_OF_SCOPE');
  if (scope.business_profit_needs_computation) throw new Error('BUSINESS_PROFIT_REQUIRED');
  if (scope.multiple_foreign_tax_countries || scope.preparing_for_clients || income.other_income_or_claims)
    throw new Error('FEATURE_NOT_IMPLEMENTED');
  const dividendGross = cents(income.final_wht_dividends_gross);
  const dividendWht = cents(income.final_wht_dividends_deducted);
  if (dividendWht !== roundRatio(dividendGross * BigInt(r.dividends.rate_bps), 10000n))
    throw new Error('DIVIDEND_WHT_REVIEW');
  const foreignAmounts = validateForeign(foreign);
  const localAssessable = cents(income.employment) + cents(income.business_net) + cents(income.interest) + cents(income.rent);
  const assessable = localAssessable + foreignAmounts.total;
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
  // Rent relief belongs to local rent. Other deductions use the preview's local-first policy.
  const localTaxable = nonnegative(localAssessable - rentRelief - (totalReliefs - rentRelief + qualifyingPayments));
  const foreignTaxable = taxable - localTaxable;
  const progressive = progressiveTax(localTaxable, ya);
  const foreignTax = cappedForeignTax(foreignTaxable, localTaxable, ya);
  const tax = progressive + foreignTax;
  // Section 81 average-rate ceiling, floored to cents so the exact ceiling is never exceeded.
  const averageCreditLimit = taxable === 0n ? 0n : tax * foreignAmounts.total / taxable;
  const foreignCredit = min(foreignAmounts.paid, min(foreignTax, averageCreditLimit));
  const domesticCredits = cents(income.apit_credit) + cents(income.ait_wht_credit) + cents(income.instalments_paid);
  const credits = domesticCredits + foreignCredit;
  // Evidence warnings, not tax rules or legal credit caps. Arithmetic remains unchanged.
  const inputWarnings: { code: string; message: string }[] = [];
  if (cents(income.apit_credit) > cents(income.employment) + cents(foreign.employment_lkr))
    inputWarnings.push({ code: 'APIT_EXCEEDS_REPORTED_EMPLOYMENT', message: 'APIT exceeds all reported local and foreign employment income. Check for a mistyped amount, duplicated certificate, missing employment or wrong year. This is an evidence warning, not a legal credit cap.' });
  if (cents(income.ait_wht_credit) > assessable)
    inputWarnings.push({ code: 'AIT_WHT_EXCEEDS_REPORTED_INCOME', message: 'Advance AIT/WHT exceeds all reported assessable income. Reconcile source amounts, year and final versus advance withholding before relying on the estimate. This is not a legal credit cap.' });
  if (assessable === 0n && domesticCredits > 0n)
    inputWarnings.push({ code: 'CREDITS_WITHOUT_REPORTED_INCOME', message: 'Domestic credits were entered with no reported assessable income. Check income, year and payment records; an overpayment is not a validated refund claim.' });
  const firstBand = cents(r.progressive_bands.bands[0].width!);
  const interpretationReview = foreignTaxable > 0n && localTaxable < firstBand;
  checked = checkScope({ ...scope, qualifying_foreign_income: foreignAmounts.total > 0n,
    local_taxable_below_first_band: localTaxable < firstBand, foreign_credit_exceeds_cap: foreignAmounts.paid > foreignCredit });
  const flags = [
    ...(interpretationReview ? ['INTERP_15PCT'] : []),
    ...(foreignAmounts.paid > foreignCredit ? ['FOREIGN_CREDIT_CAPPED'] : []),
    ...(foreignAmounts.total > 0n ? ['ASSUMED_FOREIGN_ALLOCATION'] : []),
    ...(interpretationReview && localAssessable > 0n && totalReliefs + qualifyingPayments > rentRelief ? ['ALLOCATION_REVIEW'] : []),
  ];
  const figures = {
    local_assessable_income: money(localAssessable), foreign_assessable_income: money(foreignAmounts.total),
    local_taxable_income: money(localTaxable), foreign_taxable_income: money(foreignTaxable),
    foreign_deductions: money(foreignAmounts.total - foreignTaxable),
    tax_progressive: money(progressive), tax_foreign: money(foreignTax), foreign_credit_average_limit: money(averageCreditLimit), foreign_tax_credit: money(foreignCredit),
    foreign_tax_uncredited: money(foreignAmounts.paid - foreignCredit),
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
  explain('assessable_income', r.income, 'local_assessable_income + foreign_assessable_income; exclude final-WHT dividends', { local_assessable_income: figures.local_assessable_income, foreign_assessable_income: figures.foreign_assessable_income }, ['local_assessable_income', 'foreign_assessable_income']);
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
  explain('local_assessable_income', r.income, 'employment + business_net + interest + rent', { employment: income.employment, business_net: income.business_net, interest: income.interest, rent: income.rent });
  explain('foreign_assessable_income', r.foreign_income, 'confirmed qualifying foreign employment_lkr + service_net_lkr; manually converted to LKR', { employment_lkr: foreign.employment_lkr, service_net_lkr: foreign.service_net_lkr });
  explain('local_taxable_income', r.foreign_allocation, 'max(0, local_assessable_income - rent_relief - other_reliefs - qualifying_payments); local-first preview assumption', { local_assessable_income: figures.local_assessable_income, total_reliefs: figures.total_reliefs, qualifying_payments: figures.qualifying_payments }, ['local_assessable_income', 'total_reliefs', 'qualifying_payments']);
  explain('foreign_taxable_income', r.foreign_allocation, 'taxable_income - local_taxable_income', { taxable_income: figures.taxable_income, local_taxable_income: figures.local_taxable_income }, ['taxable_income', 'local_taxable_income']);
  explain('foreign_deductions', r.foreign_allocation, 'foreign_assessable_income - foreign_taxable_income', { foreign_assessable_income: figures.foreign_assessable_income, foreign_taxable_income: figures.foreign_taxable_income }, ['foreign_assessable_income', 'foreign_taxable_income']);
  explain('tax_progressive', r.progressive_bands, 'sum(local band slices * band rates); round to cents half up', { local_taxable_income: figures.local_taxable_income }, ['local_taxable_income']);
  explain('tax_foreign', r.foreign_stacking, 'local income occupies progressive bands first; foreign slices use min(band rate, foreign cap); round to cents half up', { foreign_taxable_income: figures.foreign_taxable_income, local_taxable_income: figures.local_taxable_income, cap_bps: r.foreign_income.cap_bps }, ['local_taxable_income', 'foreign_taxable_income']);
  explain('foreign_credit_average_limit', r.foreign_credit, 'floor_to_cents(tax_before_foreign_credit * assessable_foreign_income / taxable_income); zero when taxable income is zero', { tax_before_foreign_credit: figures.tax, assessable_foreign_income: figures.foreign_assessable_income, taxable_income: figures.taxable_income }, ['tax', 'foreign_assessable_income', 'taxable_income']);
  explain('foreign_tax_credit', r.foreign_credit, 'min(eligible foreign income tax actually paid for one source in one country, tax_foreign, foreign_credit_average_limit); non-refundable', { eligible_foreign_tax_paid: foreign.foreign_tax_paid, tax_foreign: figures.tax_foreign, average_limit: figures.foreign_credit_average_limit }, ['tax_foreign', 'foreign_credit_average_limit']);
  explain('foreign_tax_uncredited', r.foreign_credit, 'eligible foreign tax paid - foreign_tax_credit; no refund or carry-forward claimed', { eligible_foreign_tax_paid: foreign.foreign_tax_paid, foreign_tax_credit: figures.foreign_tax_credit }, ['foreign_tax_credit']);
  explain('tax', r.foreign_income, 'tax_progressive + tax_foreign; each bucket rounded to cents', { tax_progressive: figures.tax_progressive, tax_foreign: figures.tax_foreign }, ['tax_progressive', 'tax_foreign']);
  explain('credits', r.credits, 'apit_credit + ait_wht_credit + instalments_paid + foreign_tax_credit; exclude final dividend WHT', { apit_credit: income.apit_credit, ait_wht_credit: income.ait_wht_credit, instalments_paid: income.instalments_paid, foreign_tax_credit: figures.foreign_tax_credit }, ['foreign_tax_credit']);
  explain('balance_payable', r.credits, 'max(0, tax - credits)', { tax: figures.tax, credits: figures.credits }, ['tax', 'credits']);
  explain('potential_overpayment', r.credits, 'max(0, credits - tax); not a validated refund claim', { tax: figures.tax, credits: figures.credits }, ['tax', 'credits']);
  explain('final_wht_dividends_gross', r.dividends, 'confirmed gross resident-company dividends; informational, excluded from assessable income', { gross: income.final_wht_dividends_gross });
  explain('final_wht_dividends_deducted', r.dividends, 'actual deducted final WHT must match gross * rate_bps / 10000; informational, never a credit', { gross: income.final_wht_dividends_gross, actual_deducted: income.final_wht_dividends_deducted, rate_bps: r.dividends.rate_bps }, ['final_wht_dividends_gross']);
  const flatForeignTax = roundRatio(foreignTaxable * BigInt(r.foreign_income.cap_bps), 10000n);
  const flatTotal = progressive + flatForeignTax;
  const flatAverageLimit = taxable === 0n ? 0n : flatTotal * foreignAmounts.total / taxable;
  const flatCredit = min(foreignAmounts.paid, min(flatForeignTax, flatAverageLimit));
  const flatCredits = domesticCredits + flatCredit;
  const alternatives = interpretationReview ? [{
    interpretation: 'flat_foreign_cap', rule_id: r.foreign_stacking.id, version: r.version,
    sources: r.foreign_stacking.sources,
    formula: 'Same local-first income allocation; foreign taxable income * cap rate; recompute capped credit and balance. Comparative interpretation, not a confirmed rule.',
    figures: { tax_progressive: money(progressive), tax_foreign: money(flatForeignTax), tax: money(flatTotal),
      foreign_credit_average_limit: money(flatAverageLimit), foreign_tax_credit: money(flatCredit), foreign_tax_uncredited: money(foreignAmounts.paid - flatCredit),
      credits: money(flatCredits), balance_payable: money(nonnegative(flatTotal - flatCredits)),
      potential_overpayment: money(nonnegative(flatCredits - flatTotal)) },
  }] : [];
  const foreignSummary = foreignAmounts.total > 0n ? ' Qualifying foreign income uses capped progressive preview tax and assumed local-first deductions; the allocation is not practitioner-reviewed.' : '';
  const alternativeSummary = interpretationReview
    ? ` Interpretation review required. Flat-cap comparison: tax LKR ${money(flatTotal)}, foreign credit LKR ${money(flatCredit)}, balance payable LKR ${money(nonnegative(flatTotal - flatCredits))}, potential overpayment LKR ${money(nonnegative(flatCredits - flatTotal))}. Both use the assumed local-first deduction allocation; it is not an optimal-allocation guarantee.` : '';
  return {
    status: 'complete' as const, estimate: true, filing_ready: false,
    needs_professional_review: true, scope: checked, figures, trace, flags, alternatives, input_warnings: inputWarnings,
    allocation_policy: { policy: r.foreign_allocation.policy, status: r.foreign_allocation.status, rule_id: r.foreign_allocation.id, sources: r.foreign_allocation.sources },
    foreign_eligibility: { received_in_foreign_currency: foreign.received_in_foreign_currency, remitted_via_licensed_bank: foreign.remitted_via_licensed_bank, foreign_employer_confirmed: foreign.foreign_employer_confirmed, services_used_outside_lk: foreign.services_used_outside_lk, fx_conversion_confirmed: foreign.fx_conversion_confirmed, credit_eligibility_confirmed: foreign.credit_eligibility_confirmed, single_source_confirmed: foreign.single_source_confirmed },
    display_summary: `Preview estimate for YA ${ya}. Tax: LKR ${figures.tax}. Credits: LKR ${figures.credits}. Balance payable: LKR ${figures.balance_payable}. Potential overpayment: LKR ${figures.potential_overpayment}. Verify before filing. Not IRD-approved; not tax advice.${foreignSummary}${alternativeSummary}${inputWarnings.map(w => ` Input review ${w.code}: ${w.message}`).join('')}`,
  };
}
