import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { paymentReference, validatePaymentEvidence, verifyPaymentSource } from './payment-reference.ts';
import captured from '../docs/evidence/payments.json' with { type: 'json' };
import instalments from '../rules/instalments-2026-27.json' with { type: 'json' };

const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--source-dir'), 'Usage: npm run payments:check -- [--source-dir DIRECTORY]');
const data = validatePaymentEvidence(captured);
for (const [index, due] of instalments.payment_dates.entries())
  assert.equal(paymentReference(data, instalments.ya, String(index + 1)).due_date, due, 'Payment reference contradicts planner dates');
if (args.length) for (const source of data.sources) verifyPaymentSource(source, readFileSync(join(args[1], source.filename)));
process.stdout.write(JSON.stringify({ verified_on: data.verified_on, development_only: true,
  source_bytes_checked: args.length > 0, references: data.payments.map(p => paymentReference(data, p.ya, p.instalment)) }, null, 2) + '\n');
