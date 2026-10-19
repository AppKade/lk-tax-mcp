import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewReturn, cageMap, cageMapSchema, checkReviewInvariants } from '../src/return-review.ts';
import { cents, money } from '../src/money.ts';
import { computeReturn, figureNames } from '../src/engine.ts';
import { TaxSession, DISCLAIMER_VERSION, envelope } from '../src/service.ts';
import { assertPrivateOutput } from '../src/privacy.ts';
import { cleanScope, income, zeroDeductions, noForeign } from './fixtures.ts';
import localCases from './fixtures/ird-local-2025-26.json' with { type: 'json' };
import foreignCases from './fixtures/ird-foreign-2025-26.json' with { type: 'json' };
const input = { ya: '2025/26', scope: cleanScope, income, deductions: zeroDeductions, foreign: noForeign };
const amount = (review: ReturnType<typeof reviewReturn>, area: string, cage: string) => review.cages.find(r => r.area === area && r.cage === cage)!.amount;

test('primary return form: G1 uses solar cage 70 and personal cage 80, with conserved main totals', () => {
  const r = reviewReturn(input);
  const expected = { '10': '2880000.00', '20': '0.00', '30': '140000.00', '40': '0.00', '50': '3020000.00',
    '60': '0.00', '70': '0.00', '80': '1800000.00', '90': '1800000.00', '100': '0.00', '110': '1800000.00',
    '120': '1220000.00', '130': '0.00', '140': '0.00', '150': '99600.00', '160': '0.00', '170': '99600.00',
    '180': '88400.00', '190': '11200.00' };
  for (const [cage, value] of Object.entries(expected)) assert.equal(amount(r, 'return', cage), value, cage);
  assert.equal(amount(r, 'schedule_8', '809A.1'), '1220000.00');
  assert.equal(amount(r, 'schedule_8', '809A.3'), '99600.00');
  assert.equal(r.checks.length, 11); assert.ok(r.checks.every(c => c.status === 'passed'));
  assert.equal(r.return_format.suggestion, 'simplified_candidate');
  assert.equal(r.return_format.eligibility_confirmed, false);
});
test('all six IRD annual examples preserve published balances and supported Schedule 8 invariants', () => {
  const cases = [...localCases.map(c => ({ ...c, foreign: noForeign })), ...foreignCases.map(c => ({ ...c, expected: { ...c.expected, taxable_income: money(cents(c.expected.local_taxable_income) + cents(c.expected.foreign_taxable_income)) } }))];
  for (const c of cases) {
    const r = reviewReturn({ ...input, income: c.income, deductions: c.deductions, foreign: c.foreign });
    assert.equal(amount(r, 'return', '190'), c.expected.balance_payable, c.id);
    assert.equal(amount(r, 'return', '170'), c.expected.tax, c.id);
    assert.equal(amount(r, 'schedule_8', '801'), c.expected.taxable_income, c.id);
    assert.equal(r.checks.length, 11);
    assert.equal(amount(r, 'return', '200'), null);
  }
  const g6 = foreignCases.find(c => c.id === 'G6')!;
  const r = reviewReturn({ ...input, income: g6.income, deductions: g6.deductions, foreign: g6.foreign });
  assert.equal(amount(r, 'return', '10'), '16380000.00');
  assert.equal(amount(r, 'return', '30'), '4680000.00');
  assert.equal(amount(r, 'schedule_8', '809B.1'), '16380000.00');
  assert.equal(amount(r, 'schedule_8', '809B.3'), '2457000.00');
});
test('G5 final dividend withholding belongs to Schedule 6A, never unpaid tax or advance credits', () => {
  const g5 = localCases.find(c => c.id === 'G5')!;
  const r = reviewReturn({ ...input, income: g5.income, deductions: g5.deductions });
  assert.equal(amount(r, 'schedule_6A', '607'), '75000.00');
  assert.equal(amount(r, 'return', '160'), '0.00');
  assert.equal(amount(r, 'schedule_8', '811'), '0.00');
  assert.equal(amount(r, 'return', '170'), '5886600.00');
  assert.equal(amount(r, 'return', '180'), '5342000.00');
  assert.equal(amount(r, 'return', '70'), '400000.00');
  assert.equal(amount(r, 'schedule_5C', '513'), null);
  assert.ok(r.review_gaps.some(g => g.code === 'SOLAR_HISTORY_REQUIRED'));
  assert.ok(r.review_gaps.some(g => g.code === 'DIVIDEND_DETAILS_REQUIRED'));
  assert.equal(r.return_format.suggestion, 'standard');
});
test('refund, gross remittance and detailed credit claims are never invented from aggregates', () => {
  const r = reviewReturn({ ...input, income: { ...income, employment: '0', interest: '0' } });
  assert.equal(amount(r, 'return', '200'), null);
  assert.equal(r.cages.find(c => c.area === 'return' && c.cage === '200')!.reference_amount, '88400.00');
  assert.equal(amount(r, 'return', '210'), null); assert.equal(amount(r, 'return', '210A'), null);
  assert.ok(r.review_gaps.some(g => g.code === 'APIT_BREAKDOWN_REQUIRED'));
  assert.ok(r.review_gaps.some(g => g.code === 'ADVANCE_CREDIT_DETAILS_REQUIRED'));
  assert.ok(!r.cages.some(c => ['903A', '903B', '904A', '908', '911'].includes(c.cage)));
  assert.equal(r.return_format.suggestion, 'manual_review');
  assert.equal(r.filing_ready, false); assert.equal(r.export_available, false); assert.equal(r.mapping_complete, false);
});
test('every engine figure has a trace and an explicit mapped, reference-only or working disposition', () => {
  const r = reviewReturn(input);
  assert.deepEqual(r.coverage.map(c => c.figure), [...figureNames]);
  assert.ok(r.coverage.every(c => c.trace.sources.length && c.trace.value === c.value));
  assert.ok(r.cages.every(c => c.trace.sources.length && c.trace.mapping_version === cageMap.version));
  assert.equal(r.coverage.find(c => c.figure === 'foreign_credit_average_limit')!.disposition, 'working_only_no_verified_direct_cage');
  assert.equal(r.coverage.find(c => c.figure === 'potential_overpayment')!.disposition, 'reference_only_manual_review');
  assert.doesNotThrow(() => assertPrivateOutput(envelope(r)));
});
test('review recomputes current facts and preserves consent, scope and financial refusals', () => {
  const s = new TaxSession(); assert.throws(() => s.review(), /SESSION_REQUIRED/);
  s.start('2025/26'); assert.throws(() => s.review(), /CONSENT_REQUIRED/);
  s.accept(DISCLAIMER_VERSION, true); assert.throws(() => s.review(), /MISSING_SCOPE_FACTS/);
  s.setFacts({ scope: cleanScope, income, deductions: zeroDeductions, foreign: { employment_lkr: '0', service_net_lkr: '0', foreign_tax_paid: '0' } });
  assert.equal(amount(s.review(), 'return', '190'), '11200.00');
  s.setFacts({ income: { employment: '0', interest: '0' } });
  assert.equal(amount(s.review(), 'return', '190'), '0.00');
  s.setFacts({ income: { employment: '1900000' }, deductions: { approved_charity_cash: '60000' } });
  assert.throws(() => s.review(), /CHARITY_CAP_REVIEW/);
  s.setFacts({ scope: { losses: true } }); assert.throws(() => s.review(), /OUT_OF_SCOPE/);
  s.wipe(); assert.throws(() => s.review(), /SESSION_REQUIRED/);
});
test('foreign interpretation alternatives survive mapping and never fill gross remittance disclosures', () => {
  const facts = { ...input, income: { ...income, employment: '0', interest: '0', apit_credit: '0', ait_wht_credit: '0' },
    foreign: { ...noForeign, service_net_lkr: '3600000', received_in_foreign_currency: true, remitted_via_licensed_bank: true, services_used_outside_lk: true, fx_conversion_confirmed: true } };
  const calculation = computeReturn(facts), r = reviewReturn(facts);
  assert.deepEqual(r.alternatives, calculation.alternatives);
  assert.deepEqual(r.flags, calculation.flags);
  assert.ok(r.flags.includes('INTERP_15PCT'));
  assert.ok(r.review_gaps.some(g => g.code === 'CALCULATION_FLAGS_REQUIRE_REVIEW'));
  assert.equal(amount(r, 'return', '210A'), null);
  assert.ok(r.display_summary.includes(calculation.display_summary));
});
test('cage schema, unsupported year and corrupted mapped transfers fail closed', () => {
  assert.throws(() => reviewReturn({ ...input, ya: '2026/27' }), /NOT_COVERED/);
  const duplicate = structuredClone(cageMap); duplicate.rows.push(duplicate.rows[0]);
  assert.equal(cageMapSchema.safeParse(duplicate).success, false);
  const claim = structuredClone(cageMap); claim.rows.find(r => r.cage === '200')!.binding = 'potential_overpayment';
  assert.equal(cageMapSchema.safeParse(claim).success, false);
  const uncited = structuredClone(cageMap); uncited.rows[0].locator = '';
  assert.equal(cageMapSchema.safeParse(uncited).success, false);
  const r = reviewReturn(input);
  const broken = structuredClone(r.cages); broken.find(c => c.area === 'return' && c.cage === '170')!.amount = '1.00';
  assert.throws(() => checkReviewInvariants(broken), /REVIEW_MAPPING_MISMATCH/);
  assert.throws(() => checkReviewInvariants(r.cages.filter(c => c.cage !== '801')), /REVIEW_MAPPING_MISMATCH/);
});
