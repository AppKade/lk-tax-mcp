import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import captured from '../docs/evidence/payments.json' with { type: 'json' };
import { paymentReference, validatePaymentEvidence, verifyPaymentSource } from '../scripts/payment-reference.ts';

test('captured payment rows match the supported-year IIT tables, keeping payment separate from filing', () => {
  const data = validatePaymentEvidence(captured);
  assert.deepEqual(data.payments.map(p => [p.ya, p.instalment, p.due_date, p.period_code]), [
    ['2025/26', '1', '2025-08-15', '25261'], ['2025/26', '2', '2025-11-15', '25262'],
    ['2025/26', '3', '2026-02-15', '25263'], ['2025/26', '4', '2026-05-15', '25264'],
    ['2025/26', 'final', '2026-09-30', '25260'], ['2026/27', '1', '2026-08-15', '26271'],
    ['2026/27', '2', '2026-11-15', '26272'], ['2026/27', '3', '2027-02-15', null],
    ['2026/27', '4', '2027-05-15', null],
  ]);
  assert.equal(data.tax_type.code, '05');
  assert.equal(paymentReference(data, '2025/26', 'final').code_evidence?.source, 'final-notice');
});
test('unknown codes and unsupported periods are never inferred from adjacent years or quarters', () => {
  const data = validatePaymentEvidence(captured);
  for (const quarter of ['3', '4']) {
    const result = paymentReference(data, '2026/27', quarter);
    assert.equal(result.period_code, null);
    assert.ok(result.blockers.includes('PERIOD_CODE_UNVERIFIED'));
  }
  for (const [ya, period] of [['2026/27', 'final'], ['2024/25', '1'], ['2027/28', '2'], ['2025/26', 'return']])
    assert.throws(() => paymentReference(data, ya, period), /Unsupported payment reference/);
});
test('verified codes do not authorize amounts, liability, rounding or practitioner approval', () => {
  const result = paymentReference(validatePaymentEvidence(captured), '2025/26', 'final');
  assert.equal(result.payment_amount, null);
  assert.equal(result.actionable, false); assert.equal(result.filing_ready, false);
  assert.deepEqual(result.blockers, ['ROUNDING_UNVERIFIED', 'PRACTITIONER_REVIEW_REQUIRED', 'OTPP_FIELD_MAPPING_UNVERIFIED', 'BANK_FLOW_NOT_TESTED', 'LIABILITY_NOT_ASSESSED']);
  for (const extra of [{ payment_amount: '100' }, { tin: 'synthetic' }, { review_status: 'approved' }])
    assert.throws(() => validatePaymentEvidence({ ...captured, ...extra }));
});
test('catalogue rejects ambiguous records, filing codes, orphan citations and untrusted URLs', () => {
  for (const mutate of [
    (d: typeof captured) => { d.payments.push(d.payments[0]); },
    (d: typeof captured) => { d.payments[0].period_code = '2526'; },
    (d: typeof captured) => { d.payments[0].code_evidence = null; },
    (d: typeof captured) => { d.payments[0].period_code = null; },
    (d: typeof captured) => { d.payments[0].date_evidence.source = 'missing'; },
    (d: typeof captured) => { d.payments[0].date_evidence.page = 100; },
    (d: typeof captured) => { d.sources[0].url = 'https://www.ird.gov.lk.example.test/guide.pdf'; },
    (d: typeof captured) => { d.sources[0].filename = '../source.pdf'; },
    (d: typeof captured) => { d.channels[0].url = 'https://bank.example.test'; },
    (d: typeof captured) => { d.tax_type.code = '03'; },
  ]) { const data = structuredClone(captured); mutate(data); assert.throws(() => validatePaymentEvidence(data)); }
});
test('optional source-byte validation catches incomplete and same-size replaced downloads', () => {
  const bytes = new TextEncoder().encode('synthetic source bytes');
  const source = { ...captured.sources[0], bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  assert.doesNotThrow(() => verifyPaymentSource(source, bytes));
  assert.throws(() => verifyPaymentSource(source, bytes.slice(1)), /size changed/);
  assert.throws(() => verifyPaymentSource(source, new Uint8Array(bytes.length)), /digest changed/);
});
