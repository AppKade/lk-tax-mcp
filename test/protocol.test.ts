import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

test('real stdio host: initialize, schemas, consent, estimate, scope invalidation and wipe', { timeout: 20000 }, async t => {
  const child = spawn(process.execPath, ['src/cli.ts'], { stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(() => { child.stdin.end(); child.kill(); });
  let nextId = 0;
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  const lines = createInterface({ input: child.stdout });
  let stdoutError: Error | undefined;
  let stderr = '';
  child.stderr.on('data', c => { stderr += c.toString(); });
  lines.on('line', line => {
    try {
      const value = JSON.parse(line);
      const waiter = pending.get(value.id);
      if (waiter) { pending.delete(value.id); waiter.resolve(value); }
    } catch { stdoutError = new Error('Non-JSON stdout'); }
  });
  child.on('exit', () => {
    for (const p of pending.values()) p.reject(new Error(`Server exited: ${stderr}`));
    pending.clear();
  });
  async function request(method: string, params: Record<string, unknown> = {}) {
    const id = ++nextId;
    return await new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 5000);
      pending.set(id, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }
  async function call(name: string, args = {}) {
    const response = await request('tools/call', { name, arguments: args });
    assert.equal(response.error, undefined, JSON.stringify(response));
    const result = response.result;
    assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
    assert.equal(result.structuredContent.ya, '2025/26');
    assert.ok(result.structuredContent.caution && result.structuredContent.sources.length);
    return result;
  }
  const hello = await request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test-host', version: '1' } });
  assert.equal(hello.error, undefined);
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const listed = await request('tools/list');
  assert.equal(listed.result.tools.length, 8);
  for (const tool of listed.result.tools) {
    assert.ok(tool.inputSchema && tool.outputSchema);
    assert.equal(tool.annotations.openWorldHint, false);
  }
  assert.equal((await call('lk_compute_return')).isError, true);
  await call('lk_session', { action: 'start' });
  assert.equal((await call('lk_set_facts', { income: { employment: '1' } })).structuredContent.error.code, 'CONSENT_REQUIRED');
  const disclaimer = (await call('lk_get_disclaimer')).structuredContent;
  await call('lk_accept_disclaimer', { version: disclaimer.version, user_confirmed: true });
  // Deliberately not imported from core.test.ts: protocol test must not run that suite twice.
  await call('lk_set_facts', { scope: {
    resident_full_year: true, residency_special_case: false, investment_asset_gains: false,
    partnership_or_trust: false, restricted_business: false, terminal_benefits_or_arrears: false,
    business_profit_needs_computation: false, losses: false, multiple_foreign_tax_countries: false,
    foreign_credit_exceeds_cap: false, qualifying_foreign_income: false, local_taxable_below_first_band: false,
    amendment_assessment_or_appeal: false, preparing_for_clients: false,
  }, income: {
    employment: '2880000', business_net: '0', interest: '140000', apit_credit: '74400',
    ait_wht_credit: '14000', instalments_paid: '0', other_income_or_claims: false,
  } });
  const computed = (await call('lk_compute_return')).structuredContent;
  assert.equal(computed.figures.balance_payable, '11200.00');
  assert.equal(computed.filing_ready, false);
  assert.equal((await call('lk_explain', { line: 'tax' })).structuredContent.trace.value, '99600.00');
  await call('lk_set_facts', { scope: { losses: true } });
  assert.equal((await call('lk_compute_return')).structuredContent.error.code, 'OUT_OF_SCOPE');
  await call('lk_session', { action: 'wipe' });
  assert.equal((await call('lk_compute_return')).structuredContent.error.code, 'SESSION_REQUIRED');
  assert.equal(stdoutError, undefined);
});
