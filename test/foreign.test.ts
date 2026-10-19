import test from 'node:test';
import assert from 'node:assert/strict';
import { computeReturn } from '../src/engine.ts';
import { cappedForeignTax } from '../src/foreign.ts';
import { cents } from '../src/money.ts';
import { cleanScope, income, zeroDeductions, noForeign } from './fixtures.ts';
import { TaxSession, DISCLAIMER_VERSION, envelope } from '../src/service.ts';
import cases from './fixtures/ird-foreign-2025-26.json' with { type: 'json' };

const zeroIncome = { ...income, employment: '0', interest: '0', apit_credit: '0', ait_wht_credit: '0' };
const qualifying = { ...noForeign, service_net_lkr: '3600000', received_in_foreign_currency: true,
  remitted_via_licensed_bank: true, services_used_outside_lk: true, fx_conversion_confirmed: true };
function compute(foreign = qualifying, local = zeroIncome) {
  return computeReturn({ ya: '2025/26', scope: cleanScope, income: local, deductions: zeroDeductions, foreign });
}
for (const fixture of cases) {
  test(`${fixture.id}: ${fixture.source.locator}, exact published balance`, () => {
    const result = computeReturn({ ya: '2025/26', scope: cleanScope, income: fixture.income, deductions: fixture.deductions, foreign: fixture.foreign });
    for (const [line, value] of Object.entries(fixture.expected)) {
      assert.equal(result.figures[line as keyof typeof result.figures], value, `${fixture.id}.${line}`);
    }
    assert.equal(result.trace.length, Object.keys(result.figures).length);
    assert.ok(result.trace.every(t => t.sources.length && t.version === '2025.26.3'));
    assert.equal(result.alternatives.length, 0);
    assert.doesNotThrow(() => envelope(result));
  });
}
test('G8 and G9 arithmetic regression cases; primary Annexure 7 verifies standalone bands', () => {
  const g8 = compute();
  assert.equal(g8.figures.tax, '180000.00');
  assert.equal(g8.alternatives[0].figures.tax, '270000.00');
  const g9 = compute({ ...qualifying, service_net_lkr: '0', employment_lkr: '23916000', foreign_employer_confirmed: true });
  assert.equal(g9.figures.tax, '3227400.00');
  assert.equal(g9.alternatives[0].figures.tax, '3317400.00');
  assert.ok(g8.display_summary.includes('270000.00'));
  assert.ok(g8.flags.includes('INTERP_15PCT'));
});
test('capped foreign slices cross each band with exact arithmetic and are monotone', () => {
  assert.equal(cappedForeignTax(100000000n, 0n, '2025/26'), 6000000n);
  assert.equal(cappedForeignTax(100000100n, 0n, '2025/26'), 6000015n);
  assert.equal(cappedForeignTax(100000000n, 50000000n, '2025/26'), 10500000n);
  for (const local of [0n, 99999999n, 100000000n, 150000000n, 250000000n, 10000000000n]) {
    let previous = 0n;
    for (let foreign = 0n; foreign <= 300000000n; foreign += 501001n) {
      const tax = cappedForeignTax(foreign, local, '2025/26');
      assert.ok(tax >= previous);
      assert.ok(tax <= (foreign * 1500n + 5000n) / 10000n);
      previous = tax;
    }
  }
});
test('derived SC-08 and capped-credit flags cannot be suppressed by scope hints', () => {
  const low = compute();
  assert.equal(cleanScope.qualifying_foreign_income, false);
  assert.ok(low.scope.reasons.some(r => r.code === 'SC-08'));
  const capped = compute({ ...qualifying, foreign_tax_paid: '300000', credit_eligibility_confirmed: true, single_source_confirmed: true });
  assert.ok(capped.scope.reasons.some(r => r.code === 'SC-07'));
  assert.ok(capped.flags.includes('FOREIGN_CREDIT_CAPPED'));
});
test('foreign credit is capped, never refundable, and recomputed per interpretation', () => {
  for (const paid of ['179999', '180000', '180001', '300000']) {
    const r = compute({ ...qualifying, foreign_tax_paid: paid, credit_eligibility_confirmed: true, single_source_confirmed: true });
    assert.ok(cents(r.figures.foreign_tax_credit) <= cents(r.figures.tax_foreign));
    assert.equal(r.figures.potential_overpayment, '0.00');
    const a = r.alternatives[0].figures;
    assert.ok(cents(a.foreign_tax_credit) <= cents(a.tax_foreign));
    assert.equal(a.potential_overpayment, '0.00');
    assert.equal(cents(r.figures.foreign_tax_credit) + cents(r.figures.foreign_tax_uncredited), cents(paid));
  }
  const both = compute({ ...qualifying, foreign_tax_paid: '250000', credit_eligibility_confirmed: true, single_source_confirmed: true });
  assert.equal(both.figures.foreign_tax_credit, '180000.00');
  assert.equal(both.alternatives[0].figures.foreign_tax_credit, '250000.00');
  assert.equal(both.alternatives[0].figures.balance_payable, '20000.00');
});
test('eligibility, manual conversion, orphan tax and multiple-country claims fail closed', () => {
  for (const key of ['received_in_foreign_currency', 'remitted_via_licensed_bank', 'services_used_outside_lk', 'fx_conversion_confirmed'] as const)
    assert.throws(() => compute({ ...qualifying, [key]: false }), /FOREIGN_ELIGIBILITY_REVIEW/);
  assert.throws(() => compute({ ...qualifying, service_net_lkr: '0', employment_lkr: '3600000' }), /FOREIGN_ELIGIBILITY_REVIEW/);
  assert.throws(() => compute({ ...qualifying, foreign_tax_paid: '1000' }), /FOREIGN_CREDIT_REVIEW/);
  assert.throws(() => compute({ ...noForeign, foreign_tax_paid: '1000' }), /FOREIGN_TAX_WITHOUT_INCOME/);
  assert.throws(() => computeReturn({ ya: '2025/26', scope: { ...cleanScope, multiple_foreign_tax_countries: true }, income: zeroIncome, deductions: zeroDeductions, foreign: qualifying }), /FEATURE_NOT_IMPLEMENTED/);
});
test('mixed low-income allocation is an explicit preview policy, not an optimum guarantee', () => {
  const r = compute(qualifying, { ...zeroIncome, employment: '2000000' });
  assert.equal(r.figures.local_taxable_income, '200000.00');
  assert.equal(r.figures.foreign_taxable_income, '3600000.00');
  assert.equal(r.allocation_policy.status, 'assumed');
  assert.ok(r.flags.includes('ALLOCATION_REVIEW'));
  assert.ok(r.display_summary.includes('not an optimal-allocation guarantee'));
});
test('all official examples conserve income, credits and non-refundable foreign caps', () => {
  for (const fixture of cases) {
    const r = computeReturn({ ya: '2025/26', scope: cleanScope, income: fixture.income, deductions: fixture.deductions, foreign: fixture.foreign });
    const f = r.figures;
    assert.equal(cents(f.taxable_income), cents(f.local_taxable_income) + cents(f.foreign_taxable_income));
    assert.equal(cents(f.assessable_income), cents(f.local_assessable_income) + cents(f.foreign_assessable_income));
    assert.equal(cents(f.tax), cents(f.tax_progressive) + cents(f.tax_foreign));
    assert.equal(cents(f.tax) + cents(f.potential_overpayment), cents(f.credits) + cents(f.balance_payable));
    assert.ok(cents(f.foreign_tax_credit) <= cents(f.tax_foreign));
  }
});
test('session asks for explicit foreign facts and revalidates edited eligibility', () => {
  const s = new TaxSession(); s.start('2025/26'); s.accept(DISCLAIMER_VERSION, true);
  s.setFacts({ scope: cleanScope, income: zeroIncome, deductions: zeroDeductions });
  assert.throws(() => s.compute(), /MISSING_FOREIGN_FACTS/);
  assert.ok(s.nextQuestions().missing_facts.includes('foreign.employment_lkr'));
  s.setFacts({ foreign: qualifying });
  assert.equal(s.compute().figures.tax, '180000.00');
  s.setFacts({ foreign: { remitted_via_licensed_bank: false } });
  assert.throws(() => s.compute(), /FOREIGN_ELIGIBILITY_REVIEW/);
  assert.throws(() => s.explain('tax'), /FOREIGN_ELIGIBILITY_REVIEW/);
});

test('SC-08 interpretation boundary at local first-band minus/exact/plus one rupee', () => {
  for (const [employment, alternative] of [['2799999', true], ['2800000', false], ['2800001', false]] as const) {
    const r = compute(qualifying, { ...zeroIncome, employment });
    assert.equal(r.flags.includes('INTERP_15PCT'), alternative);
    assert.equal(r.alternatives.length > 0, alternative);
  }
});
test('splitting qualifying totals between salary and services does not double-count income', () => {
  const service = compute();
  const split = compute({ ...qualifying, service_net_lkr: '1800000', employment_lkr: '1800000', foreign_employer_confirmed: true });
  assert.deepEqual(split.figures, service.figures);
});


test('statutory average-rate credit ceiling can be lower than foreign-bucket tax', () => {
  const r = compute({ ...qualifying, service_net_lkr: '10000000', foreign_tax_paid: '2000000', credit_eligibility_confirmed: true, single_source_confirmed: true }, { ...zeroIncome, employment: '2000000' });
  assert.equal(r.figures.tax, '1440000.00');
  assert.equal(r.figures.tax_foreign, '1428000.00');
  assert.equal(r.figures.foreign_credit_average_limit, '1411764.70');
  assert.equal(r.figures.foreign_tax_credit, '1411764.70');
  assert.ok(cents(r.figures.foreign_tax_credit) * cents(r.figures.taxable_income) <= cents(r.figures.tax) * cents(r.figures.foreign_assessable_income));
});
test('foreign credits never pool unrelated employment and service sources', () => {
  assert.throws(() => compute({ ...qualifying, foreign_tax_paid: '1000', credit_eligibility_confirmed: true }), /FOREIGN_CREDIT_SOURCE_REVIEW/);
  assert.throws(() => compute({ ...qualifying, employment_lkr: '1000000', foreign_employer_confirmed: true, foreign_tax_paid: '1000', credit_eligibility_confirmed: true, single_source_confirmed: true }), /FOREIGN_CREDIT_SOURCE_REVIEW/);
});
