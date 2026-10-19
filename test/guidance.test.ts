import test from 'node:test';
import assert from 'node:assert/strict';
import { hostInstructions, workflowPrompts, promptText, documentChecklist } from '../src/guidance.ts';
import { assertPrivateOutput } from '../src/privacy.ts';
import { TaxSession } from '../src/service.ts';
import { canonical, digest, validateVersion } from '../scripts/contract.ts';

test('all four host workflows share consent, privacy and deterministic calculation guardrails', () => {
  assert.deepEqual(workflowPrompts.map(p => p.name), ['file_my_return', 'do_i_need_to_file', 'plan_my_instalments', 'explain_my_tax']);
  for (const prompt of workflowPrompts) {
    const text = promptText(prompt);
    assert.ok(text.startsWith(hostInstructions));
    for (const term of ['lk_get_disclaimer', 'lk_accept_disclaimer', 'lk_next_questions', 'lk_check_scope', 'display_summary', 'isError']) assert.ok(text.includes(term));
    assert.ok(!/\d+(?:\.\d+)?\s*(?:%|percent|LKR|rupees)/i.test(text));
    assert.doesNotThrow(() => assertPrivateOutput(text));
  }
  assert.ok(promptText(workflowPrompts[1]).includes('cannot determine whether I must register'));
  assert.ok(promptText(workflowPrompts[2]).includes('independently prepared gross-tax basis'));
});
test('manual checklist never accepts documents, identifiers or implicit consent', () => {
  assert.equal(documentChecklist.ingestion_available, false);
  assert.equal(documentChecklist.status, 'manual_reference_only');
  assert.ok(documentChecklist.instructions.includes('Do not upload files'));
  assert.ok(documentChecklist.items.some(i => i.category === 'credits'));
  assert.doesNotThrow(() => assertPrivateOutput(documentChecklist));
  const session = new TaxSession();
  for (const prompt of workflowPrompts) promptText(prompt);
  assert.throws(() => session.compute(), /SESSION_REQUIRED/);
});
test('public contract hash ignores object order, preserves schema array order, and rejects unversioned changes', () => {
  assert.equal(canonical({ z: 2, a: { c: 1, b: 0 } }), canonical({ a: { b: 0, c: 1 }, z: 2 }));
  assert.equal(digest({ y: ['a', 'b'], x: 1 }), digest({ x: 1, y: ['a', 'b'] }));
  assert.notEqual(digest(['a', 'b']), digest(['b', 'a']));
  assert.throws(() => validateVersion({ version: '1', sha256: 'old' }, { version: '1', sha256: 'new' }), /version bump/);
  assert.throws(() => validateVersion({ version: '1' }, { version: '1', sha256: 'new' }), /version bump/);
  assert.doesNotThrow(() => validateVersion({ version: '1', sha256: 'old' }, { version: '2', sha256: 'new' }));
  assert.doesNotThrow(() => validateVersion({ version: '1', sha256: 'same' }, { version: '1', sha256: 'same' }));
});
