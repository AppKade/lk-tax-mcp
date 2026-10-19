import test from 'node:test';
import { z } from 'zod';
import { privateSchema } from '../src/schema.ts';
import assert from 'node:assert/strict';
import { cents, money } from '../src/money.ts';
import { computeReturn, progressiveTax } from '../src/engine.ts';
import { rules, rulesSchema, selectRules } from '../src/rules.ts';
import { scopeSchema, checkScope, type ScopeFacts } from '../src/scope.ts';
import { TaxSession, DISCLAIMER_VERSION, errorResult, envelope } from '../src/service.ts';
import { assertPrivateOutput } from '../src/privacy.ts';

export const cleanScope: ScopeFacts = {
  resident_full_year: true, residency_special_case: false, investment_asset_gains: false,
  partnership_or_trust: false, restricted_business: false, terminal_benefits_or_arrears: false,
  business_profit_needs_computation: false, losses: false, multiple_foreign_tax_countries: false,
  foreign_credit_exceeds_cap: false, qualifying_foreign_income: false, local_taxable_below_first_band: false,
  amendment_assessment_or_appeal: false, preparing_for_clients: false,
};
export const income = {
  employment: '2880000', business_net: '0', interest: '140000', apit_credit: '74400',
  ait_wht_credit: '14000', instalments_paid: '0', other_income_or_claims: false,
};
const calculate = (i = income, scope = cleanScope) => computeReturn({ ya: '2025/26', scope, income: i });

test('strict money boundary, exact cents and large values', () => {
  for (const invalid of ['-1', '1e6', 'NaN', 'Infinity', '1,000', ' 1', '01', '1.234', '', '1000000000000000'])
    assert.throws(() => cents(invalid));
  assert.equal(cents('0.01'), 1n);
  assert.equal(money(cents('999999999999999.99')), '999999999999999.99');
  assert.equal(money(cents('0.10') + cents('0.20')), '0.30');
});
test('G1: IRD 2025/26 guide example 1, printed page 39 (zero tolerance)', () => {
  const result = calculate();
  assert.deepEqual(result.figures, {
    assessable_income: '3020000.00', personal_relief: '1800000.00', taxable_income: '1220000.00',
    tax: '99600.00', credits: '88400.00', balance_payable: '11200.00', potential_overpayment: '0.00',
  });
  assert.equal(result.filing_ready, false);
  assert.equal(result.trace.length, Object.keys(result.figures).length);
  assert.ok(result.trace.every(t => t.sources.length && t.version === rules.version));
});
test('G11 and G12: requirements summary cases, not independent source-verified golden cases', () => {
  assert.equal(money(progressiveTax(cents('2500000'), '2025/26')), '420000.00');
  assert.equal(calculate({ ...income, employment: '3300000', interest: '0', apit_credit: '0', ait_wht_credit: '0' }).figures.tax, '150000.00');
});
test('all band boundaries at minus/exact/plus one rupee and monotonicity', () => {
  for (const [at, expected, beforeRate, afterRate] of [
    [1000000n, 6000000n, 6n, 18n], [1500000n, 15000000n, 18n, 24n],
    [2000000n, 27000000n, 24n, 30n], [2500000n, 42000000n, 30n, 36n],
  ]) {
    assert.equal(progressiveTax(at * 100n, '2025/26'), expected);
    assert.equal(progressiveTax((at - 1n) * 100n, '2025/26'), expected - beforeRate);
    assert.equal(progressiveTax((at + 1n) * 100n, '2025/26'), expected + afterRate);
  }
  let previous = 0n;
  for (let taxable = 0n; taxable <= 1000000000n; taxable += 99731n) {
    const next = progressiveTax(taxable, '2025/26');
    assert.ok(next >= previous);
    previous = next;
  }
});
test('relief cap, potential overpayment and cent rounding', () => {
  assert.equal(calculate({ ...income, employment: '1', interest: '0' }).figures.personal_relief, '1.00');
  assert.equal(calculate({ ...income, employment: '0', interest: '0' }).figures.potential_overpayment, '88400.00');
  assert.equal(progressiveTax(1n, '2025/26'), 0n);
  assert.equal(progressiveTax(9n, '2025/26'), 1n);
});
test('scope SC-01 through SC-09 and missing-answer refusal', () => {
  const cases: [Partial<ScopeFacts>, string, string][] = [
    [{ resident_full_year: false }, 'SC-01', 'out_of_scope'],
    [{ residency_special_case: true }, 'SC-01', 'out_of_scope'],
    [{ investment_asset_gains: true }, 'SC-02', 'out_of_scope'],
    [{ partnership_or_trust: true }, 'SC-03', 'out_of_scope'],
    [{ restricted_business: true }, 'SC-04', 'out_of_scope'],
    [{ terminal_benefits_or_arrears: true }, 'SC-05', 'out_of_scope'],
    [{ losses: true }, 'SC-06', 'out_of_scope'],
    [{ business_profit_needs_computation: true }, 'SC-06', 'partial'],
    [{ multiple_foreign_tax_countries: true }, 'SC-07', 'partial'],
    [{ qualifying_foreign_income: true, local_taxable_below_first_band: true }, 'SC-08', 'partial'],
    [{ amendment_assessment_or_appeal: true }, 'SC-09', 'out_of_scope'],
    [{ preparing_for_clients: true }, 'SC-09', 'partial'],
  ];
  for (const [patch, code, expected] of cases) {
    const scope = { ...cleanScope, ...patch };
    const result = checkScope(scope);
    assert.equal(result.status, expected);
    assert.ok(result.reasons.some(r => r.code === code));
    if (expected === 'out_of_scope') assert.throws(() => calculate(income, scope), /OUT_OF_SCOPE/);
  }
  assert.equal(checkScope(cleanScope).status, 'in_scope');
  assert.equal(scopeSchema.safeParse({ resident_full_year: true }).success, false);
  assert.throws(() => calculate(income, { ...cleanScope, qualifying_foreign_income: true }), /FEATURE_NOT_IMPLEMENTED/);
  assert.throws(() => calculate({ ...income, other_income_or_claims: true }), /FEATURE_NOT_IMPLEMENTED/);
});
test('consent, selective interview, atomic updates, current-fact scope and wipe', () => {
  const s = new TaxSession();
  assert.throws(() => s.compute(), /SESSION_REQUIRED/);
  s.start('2025/26');
  assert.throws(() => s.setFacts({}), /CONSENT_REQUIRED/);
  assert.throws(() => s.accept('old', true), /CONSENT_VERSION_MISMATCH/);
  assert.throws(() => s.accept(DISCLAIMER_VERSION, false), /CONSENT_VERSION_MISMATCH/);
  s.accept(DISCLAIMER_VERSION, true);
  s.setFacts({ scope: { resident_full_year: true } });
  assert.ok(!s.nextQuestions().missing_facts.includes('scope.resident_full_year'));
  assert.throws(() => s.compute(), /MISSING_SCOPE_FACTS/);
  s.setFacts({ scope: cleanScope, income });
  assert.equal(s.compute().figures.balance_payable, '11200.00');
  assert.throws(() => s.setFacts({ income: { employment: '-1' } }), /INVALID_FACTS/);
  assert.equal(s.compute().figures.balance_payable, '11200.00');
  s.setFacts({ scope: { investment_asset_gains: true } });
  assert.equal(s.nextQuestions().status, 'out_of_scope');
  assert.throws(() => s.compute(), /OUT_OF_SCOPE/);
  s.start('2025/26');
  assert.throws(() => s.compute(), /CONSENT_REQUIRED/);
  s.wipe();
  assert.throws(() => s.compute(), /SESSION_REQUIRED/);
});
test('rule validation and unsupported years fail closed', () => {
  assert.throws(() => selectRules('2026/27'), /NOT_COVERED/);
  const uncited = structuredClone(rules); uncited.personal_relief.sources = [];
  assert.equal(rulesSchema.safeParse(uncited).success, false);
  const unordered = structuredClone(rules); unordered.progressive_bands.bands[0].rate_bps = '9000';
  assert.equal(rulesSchema.safeParse(unordered).success, false);
  const unbounded = structuredClone(rules); unbounded.progressive_bands.bands[0].width = null;
  assert.equal(rulesSchema.safeParse(unbounded).success, false);
});
test('private data rejected and errors never echo arbitrary exception messages', () => {
  for (const value of ['123456789', '123456789V', '123456789012', { tin: 'anything' }, { nested: ['123456789X'] }])
    assert.throws(() => assertPrivateOutput(value), /PRIVATE_OUTPUT_BLOCKED/);
  assert.doesNotThrow(() => assertPrivateOutput(envelope(calculate())));
  assert.doesNotThrow(() => assertPrivateOutput({ amount: '123456789.00' }));
  const s = new TaxSession(); s.start('2025/26'); s.accept(DISCLAIMER_VERSION, true);
  assert.throws(() => s.setFacts({ name: 'Secret Name', tin: '123456789' }), /INVALID_FACTS/);
  const output = JSON.stringify(errorResult(new Error('Secret Name 123456789V')));
  assert.ok(!output.includes('Secret Name') && !output.includes('123456789'));
});

test('SDK boundary validation sanitises unknown keys and enum values', () => {
  const schema = privateSchema(z.strictObject({ line: z.enum(['tax']) }));
  for (const input of [{ '123456789V': 'Secret Name' }, { line: '123456789012' }]) {
    const result = schema['~standard'].validate(input);
    assert.ok(result.issues);
    assert.ok(!JSON.stringify(result).includes('123456789'));
    assert.ok(!JSON.stringify(result).includes('Secret Name'));
  }
});
