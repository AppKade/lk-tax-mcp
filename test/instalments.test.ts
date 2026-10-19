import test from 'node:test';
import assert from 'node:assert/strict';
import { instalmentSchema, instalmentAmount, instalmentRules, planInstalments } from '../src/instalments.ts';
import { cents, money } from '../src/money.ts';
import { TaxSession, DISCLAIMER_VERSION, envelope, errorResult } from '../src/service.ts';
import { assertPrivateOutput } from '../src/privacy.ts';
import { privateSchema } from '../src/schema.ts';
import fixtures from './fixtures/ird-instalments-2026-27.json' with { type: 'json' };
import { instalmentInput as input } from './instalment-fixture.ts';
const adjusted = { calculation_basis: 'previous_return', previous_return_finalised: true, first_quarter_used_set: false, set_return_revision_count: 0 };
const alternative = { method: '2_iii', prior_assessable_income_exists: true, lower_assessable_income_expected: true, lower_taxable_income_expected: true, ...adjusted };

test('G10: all six primary circular payment examples match exactly; companies are arithmetic only', () => {
  assert.equal(fixtures.source_sha256, instalmentRules.source_sha256);
  for (const f of fixtures.cases) {
    assert.equal(money(instalmentAmount(cents(f.gross_tax), cents(f.credits), BigInt(f.remaining))), f.payable, f.id);
  }
  assert.equal(planInstalments(input).figures.instalment_payable, '67500.00');
  const p = planInstalments({ ...input, gross_tax_basis: '1032000', apit_already_deducted: '300000', apit_expected_remaining: '660000', ait_wht_already_deducted: '30000', ait_wht_expected_remaining: '60000' });
  assert.equal(p.figures.total_credits, '1050000.00');
  assert.equal(p.figures.instalment_payable, '0.00');
  assert.equal(p.credit_schedule.status, 'review_employment_exception');
  assert.equal(p.filing_ready, false);
  assert.throws(() => planInstalments({ ...input, scope: { ...input.scope, restricted_business: true } }), /OUT_OF_SCOPE/);
});
test('B=4,3,2,1 uses actual paid instalments, not presumed future payments', () => {
  let paid = 0n;
  for (let quarter = 1; quarter <= 4; quarter++) {
    const p = planInstalments({ ...input, quarter, gross_tax_basis: '100.01', prior_instalments_paid: money(paid) });
    assert.equal(p.remaining_instalments, 5 - quarter);
    assert.equal(p.payment_due_date, instalmentRules.payment_dates[quarter - 1]);
    assert.equal(p.schedule.length, 4);
    paid += cents(p.figures.instalment_payable);
  }
  assert.equal(paid, cents('100.01'));
  const unpaid = planInstalments({ ...input, quarter: 2, prior_instalments_paid: '0' });
  assert.equal(unpaid.figures.instalment_payable, '90000.00');
});
test('cent ceiling is explicit, exact for large amounts, and excess credits never become a refund', () => {
  assert.equal(instalmentAmount(1n, 0n, 4n), 1n);
  assert.equal(instalmentAmount(cents('999999999999999.99'), 0n, 3n), 33333333333333333n);
  const p = planInstalments({ ...input, gross_tax_basis: '0.01' });
  assert.deepEqual(p.rounding, { status: 'assumed', policy: 'ceiling_to_cent', division_remainder_cents: '1' });
  assert.equal(planInstalments({ ...input, apit_expected_remaining: '270001' }).figures.instalment_payable, '0.00');
  for (const b of [0n, 5n]) assert.throws(() => instalmentAmount(1n, 0n, b));
  assert.throws(() => instalmentAmount(-1n, 0n, 4n));
});
test('each alternative has explicit eligibility and proper administrative requirements', () => {
  const zero = planInstalments({ ...input, gross_tax_basis: '0', basis: { method: '2_i', no_prior_taxable_income: true, no_current_assessable_income_expected: true } });
  assert.equal(zero.figures.instalment_payable, '0.00');
  assert.equal(zero.attachment.required, 'Attachment 1');
  assert.equal(zero.attachment.deadline, '2026-11-30');
  const ii = { method: '2_ii', no_prior_taxable_income: true, current_assessable_income_expected: true, reason: 'expired_exemption', ...adjusted };
  assert.equal(planInstalments({ ...input, basis: ii }).method, '2_ii');
  assert.equal(planInstalments({ ...input, basis: alternative }).attachment.required, 'Attachment 1');
  assert.equal(planInstalments({ ...input, basis: { method: '2_iv', first_year_new_taxpayer: true } }).attachment.required, 'Attachment 2');
  for (const basis of [
    { method: '1', prior_taxable_income_exists: false },
    { method: '2_i', no_prior_taxable_income: true, no_current_assessable_income_expected: true },
    { ...ii, no_prior_taxable_income: false }, { ...ii, current_assessable_income_expected: false },
    { ...alternative, lower_taxable_income_expected: false }, { ...alternative, lower_assessable_income_expected: false },
    { ...alternative, prior_assessable_income_exists: false }, { method: '2_iv', first_year_new_taxpayer: false },
  ]) assert.throws(() => planInstalments({ ...input, basis }), /INSTALMENT_METHOD_REVIEW/);
});
test('final SET is first-quarter only and return revision is mandatory thereafter, at most once', () => {
  for (const base of [alternative, { method: '2_ii', no_prior_taxable_income: true, current_assessable_income_expected: true, reason: 'expired_exemption', ...adjusted }]) {
    const set = { ...base, calculation_basis: 'previous_final_set', previous_return_finalised: false };
    const first = planInstalments({ ...input, basis: set });
    assert.equal(first.attachment.set_revision_required_by_second_instalment, true);
    assert.throws(() => planInstalments({ ...input, quarter: 2, basis: set }), /INSTALMENT_SET_REVIEW/);
    assert.throws(() => planInstalments({ ...input, basis: { ...set, previous_return_finalised: true } }), /INSTALMENT_SET_REVIEW/);
    assert.throws(() => planInstalments({ ...input, basis: { ...base, previous_return_finalised: false } }), /INSTALMENT_SET_REVIEW/);
    const revised = { ...base, first_quarter_used_set: true, set_return_revision_count: 1 };
    assert.equal(planInstalments({ ...input, quarter: 2, basis: revised }).attachment.required, 'Attachment 1 (Revised)');
    assert.throws(() => planInstalments({ ...input, basis: revised }), /INSTALMENT_SET_REVIEW/);
    assert.throws(() => planInstalments({ ...input, quarter: 2, basis: { ...revised, set_return_revision_count: 0 } }), /INSTALMENT_SET_REVIEW/);
    assert.throws(() => planInstalments({ ...input, quarter: 3, basis: { ...revised, set_return_revision_count: 2 } }), /INVALID_INSTALMENT_FACTS/);
  }
});
test('mid-year standard-to-lower-income switch requires timely notice and verified deadlines', () => {
  const switched = { ...input, quarter: 2, basis: alternative, switched_from_standard: true, revision_notice_submitted_on_time: true };
  assert.equal(planInstalments(switched).revision_notice_deadline, '2026-10-31');
  assert.equal(planInstalments({ ...switched, quarter: 3 }).revision_notice_deadline, '2027-01-31');
  assert.equal(planInstalments({ ...switched, quarter: 4 }).revision_notice_deadline, '2027-04-30');
  assert.throws(() => planInstalments({ ...switched, revision_notice_submitted_on_time: false }), /INSTALMENT_REVISION_REVIEW/);
  assert.throws(() => planInstalments({ ...switched, quarter: 1 }), /INSTALMENT_REVISION_REVIEW/);
  assert.throws(() => planInstalments({ ...input, revision_notice_submitted_on_time: true }), /INSTALMENT_REVISION_REVIEW/);
  assert.deepEqual(instalmentRules.credit_schedule_dates, ['2026-08-31', '2026-11-30', '2027-02-28', '2027-05-31']);
});
test('basis and credit attestations fail closed; outputs contain cited traces for every amount', () => {
  assert.throws(() => planInstalments({ ...input, basis_prepared_under_method_confirmed: false }), /INSTALMENT_BASIS_REVIEW/);
  assert.throws(() => planInstalments({ ...input, foreign_credit_in_basis: true }), /INSTALMENT_BASIS_REVIEW/);
  assert.throws(() => planInstalments({ ...input, credits_reconciled_without_overlap: false }), /INSTALMENT_CREDIT_REVIEW/);
  assert.throws(() => planInstalments({ ...input, prior_instalments_paid: '1' }), /INSTALMENT_CREDIT_REVIEW/);
  const p = planInstalments(input);
  assert.equal(p.trace.length, Object.keys(p.figures).length);
  assert.ok(p.trace.every(t => t.sources[0] === fixtures.source && t.version === '2026.27.1'));
  assert.equal(p.attachment.required, 'none');
  assert.equal(p.attachment.deadline, null);
  // Taxable income can still yield zero rounded gross tax; Method 1 has no minimum-A rule.
  assert.equal(planInstalments({ ...input, gross_tax_basis: '0' }).figures.instalment_payable, '0.00');
});
test('planner session consent and output metadata do not reuse annual YA or bypass privacy', () => {
  const s = new TaxSession();
  assert.throws(() => s.planInstalments(input), /SESSION_REQUIRED/);
  s.start('2025/26');
  assert.throws(() => s.planInstalments(input), /CONSENT_REQUIRED/);
  s.accept(DISCLAIMER_VERSION, true);
  const p = envelope(s.planInstalments(input), 'instalments');
  assert.equal(p.ya, '2026/27'); assert.equal(p.ruleset_version, '2026.27.1');
  assert.equal(errorResult(new Error('INSTALMENT_SET_REVIEW'), 'instalments').ya, '2026/27');
  assert.doesNotThrow(() => assertPrivateOutput(p));
  assert.equal(s.nextQuestions().status, 'incomplete'); // Planner never stores annual facts.
  s.wipe(); assert.throws(() => s.planInstalments(input), /SESSION_REQUIRED/);
  for (const patch of [{ ya: '2027/28' }, { quarter: 5 }, { gross_tax_basis: '-1' }, { gross_tax_basis: 270000 }, { scope: {} }, { tin: '123456789' }, { basis: { method: '3' } }]) {
    assert.throws(() => planInstalments({ ...input, ...patch }), /INVALID_INSTALMENT_FACTS/);
    const invalid = privateSchema(instalmentSchema)['~standard'].validate({ ...input, ...patch });
    assert.ok(invalid.issues); assert.ok(!JSON.stringify(invalid).includes('123456789'));
  }
});
