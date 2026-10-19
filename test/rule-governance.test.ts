import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { digest } from '../scripts/contract.ts';
import { validateRuleHistory, validateRuleTransition, type RuleHistory } from '../scripts/rule-governance.ts';
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const baseline: RuleHistory = read('rules/history.json');
function scenario() {
  const history = structuredClone(baseline);
  const files = new Map([...history.entries.map(e => e.archive), 'rules/2025-26.json', 'rules/cages-2025-26.json', 'rules/instalments-2026-27.json'].map(p => [p, read(p)]));
  return { history, files, validate: () => validateRuleHistory(history, p => files.get(p)) };
}
function append(s: ReturnType<typeof scenario>) {
  const entry = { ...s.history.entries.find(e => e.family === 'annual')!, version: '2025.26.4', archive: 'rules/history/annual/2025.26.4.json', reason: 'Test-only parameter revision' };
  const value = structuredClone(s.files.get('rules/2025-26.json'));
  value.version = entry.version; value.personal_relief.amount = '1900000.00';
  entry.sha256 = digest(value); s.history.entries.push(entry); s.files.set(entry.archive, value); s.files.set('rules/2025-26.json', value);
}
test('current catalogue and archives validate; runtime instalment data is covered', () => {
  assert.equal(validateRuleHistory(baseline, read).entries.length, 3);
});
test('changing an active value without an archived revision fails', () => {
  const s = scenario(); s.files.get('rules/2025-26.json').personal_relief.amount = '1900000.00';
  assert.throws(s.validate, /latest archive/);
});
test('even rehashed historic rewrites and removed history fail the base gate', () => {
  const s = scenario(), entry = s.history.entries[0], value = s.files.get(entry.archive);
  value.personal_relief.amount = '1900000.00'; entry.sha256 = digest(value); s.files.set('rules/2025-26.json', value);
  s.validate(); assert.throws(() => validateRuleTransition(baseline, s.history), /immutable/);
  assert.throws(() => validateRuleTransition(baseline, { ...baseline, entries: [] }), /immutable/);
});
test('new cited version appends successfully and preserves historical data', () => {
  const s = scenario(); append(s); s.validate(); validateRuleTransition(baseline, s.history);
  assert.equal(s.files.get(baseline.entries[0].archive).personal_relief.amount, '1800000.00');
});
test('stale active versions, duplicate versions, ordering and archive paths fail', () => {
  const stale = scenario(); append(stale); stale.files.set('rules/2025-26.json', read('rules/2025-26.json'));
  assert.throws(stale.validate, /latest archive/);
  const duplicate = scenario(); duplicate.history.entries.push(duplicate.history.entries[0]); assert.throws(duplicate.validate, /Duplicate/);
  const order = scenario(); append(order); order.history.entries.reverse(); assert.throws(order.validate, /increase/);
  const path = scenario(); path.history.entries[0].archive = '../escape.json'; assert.throws(path.validate, /archive path/);
});
test('uncited rules and deceptive/non-primary source URLs fail even when rehashed', () => {
  for (const url of ['http://www.ird.gov.lk/file.pdf', 'https://www.ird.gov.lk.evil.test/file.pdf', 'https://www.ird.gov.lk@evil.test/file.pdf', 'https://www.ird.gov.lk:444/file.pdf']) {
    const s = scenario(), e = s.history.entries[0], value = s.files.get(e.archive);
    value.personal_relief.sources[0].url = url; e.sha256 = digest(value); s.files.set('rules/2025-26.json', value);
    assert.throws(s.validate);
  }
  const s = scenario(), e = s.history.entries[0], value = s.files.get(e.archive);
  value.personal_relief.sources = []; e.sha256 = digest(value); assert.throws(s.validate);
});
test('invalid evidence dates, duplicate IDs and blank locators fail', () => {
  for (const mutate of [
    (v: any) => { v.personal_relief.verified_on = '2026-02-30'; },
    (v: any) => { v.personal_relief.id = v.progressive_bands.id; },
    (v: any) => { v.personal_relief.sources[0].locator = ' '; },
  ]) {
    const s = scenario(), e = s.history.entries[0], value = s.files.get(e.archive);
    mutate(value); e.sha256 = digest(value); assert.throws(s.validate);
  }
});
test('corrupt or missing historical payloads fail before transition checks', () => {
  const corrupt = scenario(); corrupt.files.get(corrupt.history.entries[0].archive).personal_relief.amount = '1.00'; assert.throws(corrupt.validate, /digest/);
  const missing = scenario(); missing.files.delete(missing.history.entries[0].archive); assert.throws(missing.validate);
});
