import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { z } from 'zod';

// Development evidence only. Never import this catalogue into the MCP runtime.
const officialUrl = z.url().refine(s => { const u = new URL(s); return u.protocol === 'https:' && u.hostname === 'www.ird.gov.lk' && !u.username && !u.password && !u.port; });
const citation = z.strictObject({ source: z.string().min(1), page: z.number().int().positive(), section: z.string().min(1) });
const schema = z.strictObject({
  schema_version: z.literal(1), verified_on: z.iso.date(), review_status: z.literal('unreviewed'),
  sources: z.array(z.strictObject({ id: z.string().min(1), filename: z.string().regex(/^[a-z0-9-]+\.pdf$/),
    url: officialUrl, bytes: z.number().int().positive(), sha256: z.string().regex(/^[a-f0-9]{64}$/), pages: z.number().int().positive() })).min(1),
  tax_type: z.strictObject({ code: z.literal('05'), evidence: z.array(citation).min(1) }),
  payments: z.array(z.strictObject({ ya: z.enum(['2025/26', '2026/27']), instalment: z.enum(['1', '2', '3', '4', 'final']),
    due_date: z.iso.date(), period_code: z.string().regex(/^\d{5}$/).nullable(), date_evidence: citation, code_evidence: citation.nullable() })).min(1),
  channels: z.array(z.strictObject({ id: z.enum(['otpp', 'boc_din']), url: z.url(), evidence: z.array(citation).min(1), notes: z.string().min(1) })).length(2),
});

export function validatePaymentEvidence(input: unknown) {
  const data = schema.parse(input);
  for (const values of [data.sources.map(s => s.id), data.sources.map(s => s.filename), data.channels.map(c => c.id),
    data.payments.map(p => `${p.ya}:${p.instalment}`), data.payments.flatMap(p => p.period_code === null ? [] : [p.period_code])])
    assert.equal(new Set(values).size, values.length, 'Duplicate payment evidence entry');
  function check(c: z.infer<typeof citation>) {
    const source = data.sources.find(s => s.id === c.source);
    assert.ok(source && c.page <= source.pages, 'Invalid payment evidence citation');
  }
  data.tax_type.evidence.forEach(check);
  for (const row of data.payments) {
    check(row.date_evidence);
    assert.equal(row.period_code === null, row.code_evidence === null, 'A period code needs its own evidence');
    if (row.code_evidence) check(row.code_evidence);
  }
  for (const channel of data.channels) {
    channel.evidence.forEach(check);
    const url = new URL(channel.url);
    assert.ok(url.protocol === 'https:' && ['www.ird.gov.lk', 'eservices.ird.gov.lk'].includes(url.hostname)
      && !url.username && !url.password && !url.port, 'Unexpected payment channel URL');
  }
  return data;
}
export type PaymentEvidence = ReturnType<typeof validatePaymentEvidence>;

export function verifyPaymentSource(source: PaymentEvidence['sources'][number], bytes: Uint8Array) {
  assert.equal(bytes.length, source.bytes, 'Payment source size changed');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256, 'Payment source digest changed');
}

export function paymentReference(data: PaymentEvidence, ya: string, instalment: string) {
  const row = data.payments.find(p => p.ya === ya && p.instalment === instalment);
  assert.ok(row, 'Unsupported payment reference');
  return { ...row, tax_type_code: data.tax_type.code, review_status: data.review_status,
    development_only: true, actionable: false, filing_ready: false, payment_amount: null,
    blockers: [...(row.period_code === null ? ['PERIOD_CODE_UNVERIFIED'] : []),
      'ROUNDING_UNVERIFIED', 'PRACTITIONER_REVIEW_REQUIRED', 'OTPP_FIELD_MAPPING_UNVERIFIED', 'BANK_FLOW_NOT_TESTED', 'LIABILITY_NOT_ASSESSED'] };
}
