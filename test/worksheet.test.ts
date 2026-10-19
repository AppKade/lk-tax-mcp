import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewReturn, cageMap } from '../src/return-review.ts';
import { buildChecklist, renderWorksheet } from '../src/worksheet.ts';
import { TaxSession, DISCLAIMER_VERSION, envelope } from '../src/service.ts';
import { assertPrivateOutput } from '../src/privacy.ts';
import { cleanScope, income, zeroDeductions, noForeign } from './fixtures.ts';

const input = { ya: '2025/26', scope: cleanScope, income, deductions: zeroDeductions, foreign: noForeign };
const facts = { scope: cleanScope, income, deductions: zeroDeductions, foreign: { employment_lkr: '0', service_net_lkr: '0', foreign_tax_paid: '0' } };
const ids = (r: ReturnType<typeof reviewReturn>) => buildChecklist(r).items.map(i => i.id);
function ready() {
  const s = new TaxSession(); s.start('2025/26'); s.accept(DISCLAIMER_VERSION, true); s.setFacts(facts);
  return s;
}

test('worksheet is refused until the current checklist is explicitly acknowledged', () => {
  const s = ready();
  assert.throws(() => s.worksheet(), /CHECKLIST_REQUIRED/);
  const checklist = s.checklist();
  assert.equal(checklist.acknowledged, false);
  assert.equal(checklist.filing_export_available, false);
  const all = checklist.items.map(i => i.id);
  assert.throws(() => s.acknowledgeChecklist(checklist.digest, all, false), /CHECKLIST_INCOMPLETE/);
  assert.throws(() => s.acknowledgeChecklist(checklist.digest, all.slice(1), true), /CHECKLIST_INCOMPLETE/);
  assert.throws(() => s.acknowledgeChecklist(checklist.digest, [], true), /CHECKLIST_INCOMPLETE/);
  assert.throws(() => s.acknowledgeChecklist('0'.repeat(64), all, true), /CHECKLIST_STALE/);
  assert.throws(() => s.worksheet(), /CHECKLIST_REQUIRED/);
  assert.equal(s.acknowledgeChecklist(checklist.digest, all, true).acknowledged, true);
  assert.equal(s.checklist().acknowledged, true);
  const out = s.worksheet();
  assert.equal(out.file_written, false); assert.equal(out.filing_export_available, false);
  assert.equal(out.estimate, true); assert.equal(out.filing_ready, false);
  assert.equal(out.checklist_digest, checklist.digest);
});

test('any fact change, new consent, restart or wipe invalidates the acknowledgement', () => {
  const s = ready();
  const acknowledge = () => { const c = s.checklist(); s.acknowledgeChecklist(c.digest, c.items.map(i => i.id), true); };
  acknowledge(); assert.ok(s.worksheet());
  s.setFacts({ income: { employment: '2900000' } });
  assert.throws(() => s.worksheet(), /CHECKLIST_REQUIRED/);
  acknowledge(); assert.ok(s.worksheet());
  const stale = s.checklist().digest;
  s.setFacts({ income: { employment: '2880000' } });
  assert.throws(() => s.acknowledgeChecklist(stale, s.checklist().items.map(i => i.id), true), /CHECKLIST_STALE/);
  acknowledge(); s.accept(DISCLAIMER_VERSION, true);
  assert.throws(() => s.worksheet(), /CHECKLIST_REQUIRED/);
  acknowledge(); s.wipe();
  assert.throws(() => s.worksheet(), /SESSION_REQUIRED/);
  s.start('2025/26'); assert.throws(() => s.checklist(), /CONSENT_REQUIRED/);
});

test('checklist inherits consent, scope and financial refusals from the review', () => {
  const s = new TaxSession();
  assert.throws(() => s.checklist(), /SESSION_REQUIRED/);
  assert.throws(() => s.worksheet(), /SESSION_REQUIRED/);
  s.start('2025/26'); s.accept(DISCLAIMER_VERSION, true);
  assert.throws(() => s.checklist(), /MISSING_SCOPE_FACTS/);
  s.setFacts(facts);
  const c = s.checklist();
  s.acknowledgeChecklist(c.digest, c.items.map(i => i.id), true);
  s.setFacts({ scope: { losses: true } });
  assert.throws(() => s.worksheet(), /OUT_OF_SCOPE/);
  assert.throws(() => s.checklist(), /OUT_OF_SCOPE/);
});

test('conditional checklist items follow the credits and flags actually present', () => {
  assert.deepEqual(ids(reviewReturn(input)), ['preview_limits_understood', 'scope_and_issues_read', 'review_gaps_read', 'credits_reconciled']);
  const bare = reviewReturn({ ...input, income: { ...income, apit_credit: '0', ait_wht_credit: '0' } });
  assert.deepEqual(ids(bare), ['preview_limits_understood', 'scope_and_issues_read', 'review_gaps_read']);
  const foreign = reviewReturn({ ...input, income: { ...income, employment: '0', interest: '0', apit_credit: '0', ait_wht_credit: '0' },
    foreign: { ...noForeign, service_net_lkr: '3600000', received_in_foreign_currency: true, remitted_via_licensed_bank: true, services_used_outside_lk: true, fx_conversion_confirmed: true } });
  assert.ok(ids(foreign).includes('calculation_flags_read'));
  assert.ok(!ids(foreign).includes('credits_reconciled'));
});

test('digest is stable for identical facts and changes with figures, flags or credits', () => {
  const base = buildChecklist(reviewReturn(input)).digest;
  assert.match(base, /^[a-f0-9]{64}$/);
  assert.equal(buildChecklist(reviewReturn(input)).digest, base);
  assert.notEqual(buildChecklist(reviewReturn({ ...input, income: { ...income, interest: '140001' } })).digest, base);
  assert.notEqual(buildChecklist(reviewReturn({ ...input, income: { ...income, apit_credit: '0', ait_wht_credit: '0' } })).digest, base);
});

test('worksheet shows engine cages only, leaves unresolved cages unset and carries every banner and gap', () => {
  const review = reviewReturn(input);
  const text = renderWorksheet(review, ids(review));
  assert.match(text, /^# YA 2025\/26 return worksheet \(development preview\)/);
  assert.ok(text.includes('Not IRD-approved, not tax advice and not filing-ready'));
  assert.ok(text.includes(`Cage mapping ${cageMap.version}`));
  assert.ok(text.includes('| 190 |') && text.includes('11200.00'));
  for (const cage of ['200', '210', '210A']) assert.match(text, new RegExp(`\\| ${cage} \\|[^\\n]*enter manually`));
  for (const gap of review.review_gaps) assert.ok(text.includes(gap.code), gap.code);
  assert.equal(text.split('\n').filter(l => /^\| [\dA-C.]+ \|/.test(l)).length, cageMap.rows.length);
  assert.ok(text.includes(`## Arithmetic checks (${review.checks.length} passed)`));
  assert.ok(ids(review).every(id => text.includes(`- ${id}`)));
  assert.ok(!text.includes('null') && !text.includes('undefined'));
  assert.equal(renderWorksheet(review, ids(review)), text);
});

test('worksheet text preserves interpretation alternatives and passes the private-output guard', () => {
  const foreign = reviewReturn({ ...input, income: { ...income, employment: '0', interest: '0', apit_credit: '0', ait_wht_credit: '0' },
    foreign: { ...noForeign, service_net_lkr: '3600000', received_in_foreign_currency: true, remitted_via_licensed_bank: true, services_used_outside_lk: true, fx_conversion_confirmed: true } });
  const text = renderWorksheet(foreign, ids(foreign));
  assert.ok(text.includes('INTERP_15PCT') && text.includes('flat_foreign_cap'));
  assert.ok(text.includes('Comparative interpretation only'));
  const s = ready();
  const c = s.checklist(); s.acknowledgeChecklist(c.digest, c.items.map(i => i.id), true);
  assert.doesNotThrow(() => assertPrivateOutput(envelope(s.worksheet(), 'review')));
  assert.doesNotThrow(() => assertPrivateOutput(envelope(s.checklist(), 'review')));
});
