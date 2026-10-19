import test from 'node:test';
import assert from 'node:assert/strict';
import { stdioHost } from './stdio-host.ts';
import { hostInstructions, workflowPrompts, promptText } from '../src/guidance.ts';
import { cleanScope, income, zeroDeductions } from './fixtures.ts';
import pkg from '../package.json' with { type: 'json' };

test('2026 discovery without initialize advertises static guidance and completes the consent-gated journey', { timeout: 20000 }, async t => {
  const host = stdioHost(true); t.after(() => host.close());
  const discovery = await host.request('server/discover');
  assert.equal(discovery.error, undefined);
  assert.equal(discovery.result.resultType, 'complete');
  assert.ok(discovery.result.supportedVersions.includes('2026-07-28'));
  assert.equal(discovery.result._meta['io.modelcontextprotocol/serverInfo'].version, pkg.version);
  assert.equal(discovery.result.instructions, hostInstructions);
  for (const capability of ['tools', 'resources', 'prompts']) assert.ok(discovery.result.capabilities[capability]);
  const tools = (await host.request('tools/list')).result.tools;
  assert.equal(tools.length, 10);
  const prompts = (await host.request('prompts/list')).result.prompts;
  assert.deepEqual(prompts.map((p: any) => p.name).sort(), workflowPrompts.map(p => p.name).sort());
  for (const prompt of workflowPrompts) {
    const fetched = await host.request('prompts/get', { name: prompt.name, arguments: {} });
    assert.equal(fetched.error, undefined);
    assert.equal(fetched.result.messages[0].content.text, promptText(prompt));
    const advertised = prompts.find((p: any) => p.name === prompt.name);
    assert.ok(!advertised.arguments?.length); // No arbitrary text or taxpayer arguments.
  }
  const invalid = await host.request('prompts/get', { name: 'file_my_return', arguments: { tin: '123456789V', name: 'Secret Name' } });
  assert.ok(invalid.error);
  assert.ok(!JSON.stringify(invalid).includes('123456789V'));
  assert.ok(!JSON.stringify(invalid).includes('Secret Name'));
  const resources = (await host.request('resources/list')).result.resources;
  assert.equal(resources.length, 8);
  for (const uri of ['lktax://checklist/documents', 'lktax://sources/2025-26', 'lktax://facts/2025-26', 'lktax://cagemap/2025-26']) {
    const response = await host.request('resources/read', { uri });
    assert.equal(response.error, undefined);
    const data = JSON.parse(response.result.contents[0].text);
    assert.equal(data.ya, '2025/26');
    assert.equal(data.review_status, 'unreviewed');
    if (data.facts) assert.ok(data.facts.every((f: any) => f.kind === 'writable'));
    if (data.checklist) assert.equal(data.checklist.ingestion_available, false);
    if (data.evidence) assert.ok(data.evidence.some((r: any) => r.status === 'assumed'));
  }
  async function call(name: string, args = {}) {
    const response = await host.request('tools/call', { name, arguments: args });
    assert.equal(response.error, undefined);
    const result = response.result;
    assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
    return result;
  }
  // Discovery, resources and prompt retrieval never create a session or accept consent.
  assert.equal((await call('lk_compute_return')).structuredContent.error.code, 'SESSION_REQUIRED');
  assert.equal((await call('lk_review_return')).structuredContent.error.code, 'SESSION_REQUIRED');
  await call('lk_session', { action: 'start' });
  assert.equal((await call('lk_compute_return')).structuredContent.error.code, 'CONSENT_REQUIRED');
  const disclaimer = (await call('lk_get_disclaimer')).structuredContent;
  await call('lk_accept_disclaimer', { version: disclaimer.version, user_confirmed: true });
  const intake = (await call('lk_set_facts', { scope: cleanScope, income, deductions: zeroDeductions, foreign: { employment_lkr: '0', service_net_lkr: '0', foreign_tax_paid: '0' } })).structuredContent;
  assert.equal(intake.status, 'complete');
  assert.equal(intake.calculation_performed, false);
  assert.equal(intake.not_applicable_facts.length, 7);
  const calculated = (await call('lk_compute_return')).structuredContent;
  assert.equal(calculated.figures.balance_payable, '11200.00');
  assert.equal(calculated.filing_ready, false);
  const reviewed = (await call('lk_review_return')).structuredContent;
  assert.equal(reviewed.status, 'review_only');
  assert.equal(reviewed.cages.find((r: any) => r.area === 'return' && r.cage === '80').amount, '1800000.00');
  assert.equal(reviewed.cages.find((r: any) => r.area === 'return' && r.cage === '200').amount, null);
  assert.equal(reviewed.filing_ready, false);
  const changed = (await call('lk_set_facts', { foreign: { employment_lkr: '3000000' } })).structuredContent;
  assert.ok(changed.missing_facts.includes('foreign.foreign_employer_confirmed'));
  assert.equal((await call('lk_compute_return')).structuredContent.error.code, 'MISSING_FOREIGN_FACTS');
  await call('lk_session', { action: 'wipe' });
  assert.equal((await call('lk_compute_return')).structuredContent.error.code, 'SESSION_REQUIRED');
  assert.equal((await call('lk_review_return')).structuredContent.error.code, 'SESSION_REQUIRED');
  host.assertClean();
});
