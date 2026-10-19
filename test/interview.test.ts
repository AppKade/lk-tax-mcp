import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateInterview, factDictionary, foreignRequirements, resolveForeign } from '../src/interview.ts';
import { checkScope, checkKnownScope, scopeSchema } from '../src/scope.ts';
import { foreignSchema } from '../src/foreign.ts';
import { incomeSchema, deductionsSchema } from '../src/engine.ts';
import { TaxSession, DISCLAIMER_VERSION, envelope } from '../src/service.ts';
import { cleanScope, income, zeroDeductions, noForeign } from './fixtures.ts';
import { assertPrivateOutput } from '../src/privacy.ts';
const amounts = { employment_lkr: '0', service_net_lkr: '0', foreign_tax_paid: '0' };
function session() { const s = new TaxSession(); s.start('2025/26'); s.accept(DISCLAIMER_VERSION, true); return s; }

test('readiness graph asks only the active missing writable facts and exposes no provisional amounts', () => {
  const s = session();
  const start = s.nextQuestions();
  assert.equal(start.stage, 'scope');
  assert.ok(start.missing_facts.every(p => p.startsWith('scope.')));
  assert.equal(start.calculation_performed, false);
  assert.equal(start.filing_ready, false);
  assert.ok(start.evaluations.every(n => n.value === null || typeof n.value === 'boolean'));
  s.setFacts({ scope: cleanScope });
  assert.ok(s.nextQuestions().missing_facts.every(p => p.startsWith('income.')));
  const foreign = s.setFacts({ income });
  assert.equal(foreign.stage, 'foreign');
  assert.equal(foreign.evaluations.find(n => n.id === 'foreign_ready')!.status, 'placeholder');
  assert.deepEqual(foreign.missing_facts, ['foreign.employment_lkr', 'foreign.service_net_lkr', 'foreign.foreign_tax_paid']);
  assert.deepEqual(foreign.evaluations.at(-1)!.trace.children, ['foreign_ready']);
  const partial = s.setFacts({ foreign: { employment_lkr: '0', service_net_lkr: '0' } });
  assert.deepEqual(partial.missing_facts, ['foreign.foreign_tax_paid']);
  assert.throws(() => s.compute(), /MISSING_DEDUCTION_FACTS/);
  const deductions = s.setFacts({ foreign: { foreign_tax_paid: '0' } });
  assert.ok(deductions.missing_facts.every(p => p.startsWith('deductions.')));
  const ready = s.setFacts({ deductions: zeroDeductions });
  assert.equal(ready.status, 'complete');
  assert.equal(ready.evaluations.at(-1)!.value, true);
  assert.equal(s.compute().figures.balance_payable, '11200.00');
  assert.equal(ready.not_applicable_facts.length, 7);
  assert.ok(ready.evaluations.find(n => n.id === 'foreign_ready')!.trace.children.every(p => !p.endsWith('confirmed')));
});
test('all monetary zeros remain explicit; no absent amount becomes a default', () => {
  for (const key of Object.keys(amounts)) {
    const missing = { ...amounts } as Record<string, string>; delete missing[key];
    assert.throws(() => resolveForeign(missing), /MISSING_FOREIGN_FACTS/);
    const p = evaluateInterview({ scope: cleanScope, income, deductions: zeroDeductions, foreign: missing });
    assert.deepEqual(p.missing_facts, [`foreign.${key}`]);
    assert.equal(p.not_applicable_facts.length, 0);
  }
  const s = session(); s.setFacts({ scope: cleanScope, income, deductions: zeroDeductions, foreign: { employment_lkr: '0', service_net_lkr: '0' } });
  assert.throws(() => s.compute(), /MISSING_FOREIGN_FACTS/);
});
test('foreign dependencies are specific to employment, services and a genuine credit claim', () => {
  const salary = { ...amounts, employment_lkr: '3000000' };
  const p = evaluateInterview({ scope: cleanScope, income, foreign: salary });
  assert.deepEqual(p.missing_facts, ['foreign.received_in_foreign_currency', 'foreign.remitted_via_licensed_bank', 'foreign.fx_conversion_confirmed', 'foreign.foreign_employer_confirmed']);
  assert.ok(p.not_applicable_facts.includes('foreign.services_used_outside_lk'));
  assert.ok(p.not_applicable_facts.includes('foreign.single_source_confirmed'));
  const service = foreignRequirements({ ...amounts, service_net_lkr: '3000000', foreign_tax_paid: '50000' });
  assert.ok(service.required.includes('services_used_outside_lk'));
  assert.ok(service.required.includes('credit_eligibility_confirmed'));
  assert.ok(service.required.includes('single_source_confirmed'));
  assert.ok(!service.required.includes('foreign_employer_confirmed'));
  assert.throws(() => resolveForeign(salary), /MISSING_FOREIGN_FACTS/);
});
test('edits reactivate skipped conditions; neutral computation booleans never become stored answers', () => {
  const s = session(); s.setFacts({ scope: cleanScope, income, deductions: zeroDeductions, foreign: amounts });
  assert.equal(s.compute().figures.balance_payable, '11200.00');
  const changed = s.setFacts({ foreign: { employment_lkr: '3000000' } });
  assert.equal(changed.status, 'incomplete');
  assert.ok(changed.missing_facts.includes('foreign.foreign_employer_confirmed'));
  assert.throws(() => s.compute(), /MISSING_FOREIGN_FACTS/);
  const confirmed = s.setFacts({ foreign: { received_in_foreign_currency: true, remitted_via_licensed_bank: true, fx_conversion_confirmed: true, foreign_employer_confirmed: true } });
  assert.equal(confirmed.status, 'complete');
  assert.ok(s.compute().figures.foreign_assessable_income === '3000000.00');
  const service = s.setFacts({ foreign: { service_net_lkr: '100000' } });
  assert.deepEqual(service.missing_facts, ['foreign.services_used_outside_lk']);
  s.setFacts({ foreign: { services_used_outside_lk: true } });
  const pooled = s.setFacts({ foreign: { foreign_tax_paid: '1' } });
  assert.equal(pooled.status, 'blocked');
  assert.equal(pooled.blocking_error, 'FOREIGN_CREDIT_SOURCE_REVIEW');
  const explicit = session();
  explicit.setFacts({ scope: cleanScope, income, deductions: zeroDeductions, foreign: noForeign });
  const contradiction = explicit.setFacts({ foreign: { employment_lkr: '1' } });
  assert.equal(contradiction.blocking_error, 'FOREIGN_ELIGIBILITY_REVIEW'); // Actual false answers are retained; only genuine corrections may change them.
});
test('known scope exclusions stop immediately without inventing remaining scope answers', () => {
  const s = session(); const blocked = s.setFacts({ scope: { resident_full_year: false } });
  assert.equal(blocked.status, 'out_of_scope'); assert.deepEqual(blocked.missing_facts, []);
  assert.equal(blocked.evaluations.at(-1)!.value, false);
  assert.equal(s.checkScope().status, 'out_of_scope');
  assert.throws(() => s.compute(), /OUT_OF_SCOPE/);
  const corrected = s.setFacts({ scope: { resident_full_year: true } });
  assert.equal(corrected.status, 'incomplete');
  assert.ok(corrected.missing_facts.includes('scope.residency_special_case'));
  assert.throws(() => s.compute(), /MISSING_SCOPE_FACTS/);
  assert.equal(checkKnownScope({}).status, 'undetermined');
  // For every complete single-flag variation, known-scope blocking agrees with the full guard.
  for (const key of Object.keys(cleanScope)) {
    const f = { ...cleanScope, [key]: !cleanScope[key as keyof typeof cleanScope] };
    assert.equal(checkKnownScope(f).status === 'out_of_scope', checkScope(f).status === 'out_of_scope');
  }
});
test('unsupported claims and foreign failures stop intake before unrelated deductions are collected', () => {
  for (const facts of [
    { income: { other_income_or_claims: true } },
    { scope: { preparing_for_clients: true } },
    { scope: { multiple_foreign_tax_countries: true } },
    { foreign: { employment_lkr: '1', remitted_via_licensed_bank: false } },
    { foreign: { ...amounts, foreign_tax_paid: '1' } },
    { foreign: { foreign_tax_paid: '1', credit_eligibility_confirmed: false } },
  ]) {
    const s = session(); const p = s.setFacts(facts);
    assert.equal(p.status, 'blocked'); assert.deepEqual(p.missing_facts, []);
    assert.ok(p.blocking_guidance);
    assert.ok(p.evaluations.at(-1)!.trace.children.every(child => p.evaluations.some(n => n.id === child)));
    assert.throws(() => s.compute(), new RegExp(p.blocking_error!));
  }
});
test('ready intake still preserves financial refusals, consent, atomic updates and wipe', () => {
  const s = session(); s.setFacts({ scope: cleanScope, income: { ...income, employment: '1900000', interest: '0' }, foreign: amounts,
    deductions: { ...zeroDeductions, approved_charity_cash: '60000' } });
  assert.equal(s.nextQuestions().status, 'complete');
  assert.throws(() => s.compute(), /CHARITY_CAP_REVIEW/);
  const before = s.nextQuestions();
  assert.throws(() => s.setFacts({ foreign: { employment_lkr: '-1' } }), /INVALID_FACTS/);
  assert.deepEqual(s.nextQuestions(), before);
  assert.doesNotThrow(() => assertPrivateOutput(envelope(before)));
  s.wipe(); assert.throws(() => s.nextQuestions(), /SESSION_REQUIRED/);
  s.start('2025/26'); assert.throws(() => s.nextQuestions(), /CONSENT_REQUIRED/);
});
test('published writable dictionary exactly matches accepted input fields and cannot include derived facts', () => {
  const expected = Object.entries({ scope: scopeSchema, income: incomeSchema, foreign: foreignSchema, deductions: deductionsSchema })
    .flatMap(([group, schema]) => Object.keys(schema.shape).map(k => `${group}.${k}`));
  assert.deepEqual(factDictionary.map(f => f.path), expected);
  const permitted = new Set(expected);
  for (const f of [{}, { scope: cleanScope }, { scope: cleanScope, income }, { scope: cleanScope, income, foreign: amounts }]) {
    assert.ok(evaluateInterview(f).missing_facts.every(path => permitted.has(path)));
  }
  assert.ok(factDictionary.every(f => f.kind === 'writable' && f.description));
  assert.doesNotThrow(() => assertPrivateOutput(factDictionary));
});
