import test from 'node:test';
import assert from 'node:assert/strict';
import g7 from './fixtures/aat-answer7-2025-26.json' with { type: 'json' };
import { progressiveTax } from '../src/engine.ts';
import { cents, money } from '../src/money.ts';
import { rules } from '../src/rules.ts';

test('G7: independent AAT Answer 7 matches published tax and balance, with no invented intake', () => {
  assert.equal(g7.ya, rules.ya);
  assert.equal(g7.validation_scope, 'published taxable-income band calculation and balance arithmetic only');
  const p = g7.published;
  assert.equal(cents(p.employment_income) + cents(p.investment_income), cents(p.assessable_income));
  assert.equal(cents(p.assessable_income) - cents(p.personal_relief) - cents(p.rent_relief) - cents(p.qualifying_payments), cents(p.taxable_income));
  const tax = progressiveTax(cents(p.taxable_income), g7.ya);
  assert.equal(money(tax), p.tax);
  assert.equal(money(tax - cents(p.apit_credit) - cents(p.instalments_paid)), p.balance_payable);
  assert.match(g7.source.sha256, /^[a-f0-9]{64}$/);
});
