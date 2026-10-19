export const knownIssues = [
  { id: 'KI-CHARITY-CAP', status: 'open', updated_on: '2026-10-19',
    detail: 'Annexure 3(a) uses assessable-income and taxable-income charity limits. The engine refuses when their literal readings produce different deductions. Professional clarification is pending.' },
  { id: 'KI-ROUNDING', status: 'open', updated_on: '2026-10-19',
    detail: 'Preview tax rounds to cents, half up. Official RAMIS whole-rupee rounding is not verified.' },
  { id: 'KI-PRACTITIONER-REVIEW', status: 'open', updated_on: '2026-10-19',
    detail: 'Rule values were checked against the IRD guide; qualified practitioner sign-off remains pending. All outputs are estimates, not filing-ready.' },
  { id: 'KI-FOREIGN-INCOME', status: 'not_implemented', updated_on: '2026-10-19',
    detail: 'Foreign income, foreign credits and mixed-income allocation are not implemented. Do not relabel them as local income.' },
];
export const supportedScenarios = {
  supported: ['Full-year resident individual with local employment, local user-supplied net business profit, interest or gross investment rent',
    'Confirmed eligible unused solar expenditure, approved cash charity donations where cap readings agree, Government donations and eligible Samurdhi shop contributions',
    'Resident-company dividends where final WHT was already deducted at the supported rate; informational only'],
  unsupported: ['Foreign income and tax credits', 'Rent expense deductions', 'Loan-funded solar claims',
    'Other final-withholding income, exempt income or special-rate income', 'Legacy qualifying-payment balances',
    'Film and cinema deductions', 'Business profit computation and losses', 'Non-residency, special residency, investment asset gains, partnerships, trusts, terminal benefits and arrears',
    'Amendments, assessments, appeals and practitioner client preparation', 'Other years of assessment',
    'Filing obligation decisions, ingestion, FX, instalment planning, persistence, filing outputs and submission'],
};
