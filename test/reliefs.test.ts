import test from 'node:test';
import assert from 'node:assert/strict';
import { computeReturn } from '../src/engine.ts';
import { cents } from '../src/money.ts';
import { TaxSession, DISCLAIMER_VERSION, envelope } from '../src/service.ts';
import { cleanScope, income, zeroDeductions } from './fixtures.ts';
import cases from './fixtures/ird-local-2025-26.json' with { type: 'json' };

for (const fixture of cases) {
  test(`${fixture.id}: ${fixture.source.locator}, exact source match`, () => {
    const result = computeReturn({ ya: '2025/26', scope: cleanScope, income: fixture.income, deductions: fixture.deductions });
    for (const [line, value] of Object.entries(fixture.expected)) {
      assert.equal(result.figures[line as keyof typeof result.figures], value, `${fixture.id}.${line}`);
    }
    assert.equal(result.trace.length, Object.keys(result.figures).length);
    const lines = new Set(result.trace.map(t => t.line));
    assert.equal(lines.size, result.trace.length);
    assert.ok(result.trace.every(t => t.sources.length && t.children.every(c => lines.has(c as typeof t.line))));
    assert.equal(result.filing_ready, false);
    assert.doesNotThrow(() => envelope(result));
  });
}
const baseIncome = { ...income, employment: '5000000', interest: '0', apit_credit: '0', ait_wht_credit: '0' };
function compute(i = baseIncome, d = zeroDeductions) {
  return computeReturn({ ya: '2025/26', scope: cleanScope, income: i, deductions: d });
}
test('solar limit minus/exact/plus one, unused balance and income cap', () => {
  for (const [available, used, unused] of [['599999', '599999.00', '0.00'], ['600000', '600000.00', '0.00'], ['600001', '600000.00', '1.00']]) {
    const r = compute(baseIncome, { ...zeroDeductions, solar_available: available });
    assert.equal(r.figures.solar_relief, used);
    assert.equal(r.figures.solar_unused_balance, unused);
  }
  const r = compute({ ...baseIncome, employment: '1800001' }, { ...zeroDeductions, solar_available: '600000' });
  assert.equal(r.figures.solar_relief, '1.00');
  assert.equal(r.figures.solar_unused_balance, '599999.00');
  assert.equal(r.figures.taxable_income, '0.00');
});
test('charity annual cap minus/exact/plus one and ambiguous low-income refusal', () => {
  for (const [donated, used, unused] of [['74999', '74999.00', '0.00'], ['75000', '75000.00', '0.00'], ['75001', '75000.00', '1.00']]) {
    const r = compute(baseIncome, { ...zeroDeductions, approved_charity_cash: donated });
    assert.equal(r.figures.charity_deduction, used);
    assert.equal(r.figures.charity_unclaimed, unused);
  }
  assert.throws(() => compute({ ...baseIncome, employment: '1900000' }, { ...zeroDeductions, approved_charity_cash: '60000' }), /CHARITY_CAP_REVIEW/);
  // Both readings agree if the actual donation is below both limits.
  assert.equal(compute({ ...baseIncome, employment: '1900000' }, { ...zeroDeductions, approved_charity_cash: '1000' }).figures.charity_deduction, '1000.00');
  assert.throws(() => compute({ ...baseIncome, employment: '2099999' }, { ...zeroDeductions, approved_charity_cash: '75000' }), /CHARITY_CAP_REVIEW/);
  assert.equal(compute({ ...baseIncome, employment: '2100000' }, { ...zeroDeductions, approved_charity_cash: '75000' }).figures.charity_deduction, '75000.00');
});
test('government donation deduction has no annual monetary cap; unused amount carried', () => {
  const r = compute({ ...baseIncome, employment: '2000000' }, {
    ...zeroDeductions, government_donations: '250000', government_donations_brought_forward: '100000',
  });
  assert.equal(r.figures.government_donation_deduction, '200000.00');
  assert.equal(r.figures.government_donations_carry_forward, '150000.00');
  assert.equal(r.figures.taxable_income, '0.00');
});
test('rent relief uses gross investment rent and correct relief ordering', () => {
  const r = compute({ ...baseIncome, employment: '0', rent: '1000000' });
  assert.equal(r.figures.rent_relief, '250000.00');
  assert.equal(r.figures.personal_relief, '750000.00');
  assert.equal(r.figures.total_reliefs, '1000000.00');
  assert.equal(r.figures.taxable_income, '0.00');
});
test('final dividend withholding is neither assessable income nor a credit', () => {
  const r = compute({ ...baseIncome, final_wht_dividends_gross: '500000', final_wht_dividends_deducted: '75000' });
  assert.equal(r.figures.assessable_income, '5000000.00');
  assert.equal(r.figures.credits, '0.00');
  assert.equal(r.figures.tax, compute().figures.tax);
  assert.throws(() => compute({ ...baseIncome, final_wht_dividends_gross: '500000', final_wht_dividends_deducted: '0' }), /DIVIDEND_WHT_REVIEW/);
});
test('deductions are explicit, patchable and explanations use the latest facts', () => {
  const s = new TaxSession(); s.start('2025/26'); s.accept(DISCLAIMER_VERSION, true);
  s.setFacts({ scope: cleanScope, income: baseIncome });
  assert.throws(() => s.compute(), /MISSING_DEDUCTION_FACTS/);
  assert.ok(s.nextQuestions().missing_facts.includes('deductions.solar_available'));
  s.setFacts({ deductions: zeroDeductions });
  s.setFacts({ deductions: { solar_available: '200000' } });
  assert.equal(s.explain('solar_relief').trace.value, '200000.00');
  assert.ok(!s.nextQuestions().missing_facts.length);
  assert.throws(() => s.setFacts({ deductions: { solar_available: '-1' } }), /INVALID_FACTS/);
  assert.equal(s.compute().figures.solar_relief, '200000.00');
});
test('deductions and credits reconcile without negative taxable amounts', () => {
  for (const fixture of cases) {
    const f = computeReturn({ ya: '2025/26', scope: cleanScope, income: fixture.income, deductions: fixture.deductions }).figures;
    assert.equal(cents(f.assessable_income), cents(f.total_reliefs) + cents(f.qualifying_payments) + cents(f.taxable_income));
    assert.equal(cents(f.tax) + cents(f.potential_overpayment), cents(f.credits) + cents(f.balance_payable));
    assert.equal(cents(f.government_donation_deduction) + cents(f.government_donations_carry_forward), cents(fixture.deductions.government_donations) + cents(fixture.deductions.government_donations_brought_forward));
  }
});
