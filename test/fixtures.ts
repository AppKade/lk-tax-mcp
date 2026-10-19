import type { ScopeFacts } from '../src/scope.ts';
export const cleanScope: ScopeFacts = {
  resident_full_year: true, residency_special_case: false, investment_asset_gains: false,
  partnership_or_trust: false, restricted_business: false, terminal_benefits_or_arrears: false,
  business_profit_needs_computation: false, losses: false, multiple_foreign_tax_countries: false,
  foreign_credit_exceeds_cap: false, qualifying_foreign_income: false, local_taxable_below_first_band: false,
  amendment_assessment_or_appeal: false, preparing_for_clients: false,
};
export const zeroDeductions = { solar_available: '0', approved_charity_cash: '0', government_donations: '0', government_donations_brought_forward: '0', samurdhi_shop_contributions: '0' };
export const income = {
  rent: '0', final_wht_dividends_gross: '0', final_wht_dividends_deducted: '0',
  employment: '2880000', business_net: '0', interest: '140000', apit_credit: '74400',
  ait_wht_credit: '14000', instalments_paid: '0', other_income_or_claims: false,
};
