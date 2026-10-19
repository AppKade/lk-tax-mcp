import { cleanScope } from './fixtures.ts';
export const instalmentInput = {
  ya: '2026/27' as const, quarter: 1, scope: cleanScope,
  basis: { method: '1' as const, prior_taxable_income_exists: true },
  gross_tax_basis: '270000', basis_prepared_under_method_confirmed: true, foreign_credit_in_basis: false,
  prior_instalments_paid: '0', apit_already_deducted: '0', apit_expected_remaining: '0',
  ait_wht_already_deducted: '0', ait_wht_expected_remaining: '0', credits_reconciled_without_overlap: true,
  switched_from_standard: false, revision_notice_submitted_on_time: false,
};
