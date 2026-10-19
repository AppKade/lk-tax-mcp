import test from 'node:test';
import { instalmentInput } from './instalment-fixture.ts';
import { noForeign, income, zeroDeductions } from './fixtures.ts';
import foreignCases from './fixtures/ird-foreign-2025-26.json' with { type: 'json' };
import cases from './fixtures/ird-local-2025-26.json' with { type: 'json' };
import assert from 'node:assert/strict';
import { stdioHost } from './stdio-host.ts';
import { hostInstructions } from '../src/guidance.ts';
import pkg from '../package.json' with { type: 'json' };

test('real stdio host: initialize, schemas, consent, estimate, scope invalidation and wipe', { timeout: 20000 }, async t => {
  const host = stdioHost();
  t.after(() => host.close());
  const { request } = host;
  async function call(name: string, args = {}) {
    const response = await request('tools/call', { name, arguments: args });
    assert.equal(response.error, undefined, JSON.stringify(response));
    const result = response.result;
    assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
    assert.equal(result.structuredContent.ya, name === 'lk_plan_instalments' ? '2026/27' : '2025/26');
    assert.ok(result.structuredContent.caution && result.structuredContent.sources.length);
    return result;
  }
  const hello = await request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test-host', version: '1' } });
  assert.equal(hello.error, undefined);
  assert.equal(hello.result.protocolVersion, '2025-11-25');
  assert.equal(hello.result.serverInfo.version, pkg.version);
  assert.equal(hello.result.instructions, hostInstructions);
  assert.ok(hello.result.capabilities.prompts);
  host.notify('notifications/initialized');
  const listed = await request('tools/list');
  assert.equal(listed.result.tools.length, 13);
  for (const tool of listed.result.tools) {
    assert.ok(tool.inputSchema && tool.outputSchema);
    assert.equal(tool.annotations.openWorldHint, false);
  }
  const invalid = await request('tools/call', { name: 'lk_set_facts', arguments: { '123456789V': 'Secret Name' } });
  assert.ok(invalid.error || invalid.result?.isError);
  assert.ok(!JSON.stringify(invalid).includes('123456789V'));
  assert.ok(!JSON.stringify(invalid).includes('Secret Name'));
  assert.equal((await call('lk_compute_return')).isError, true);
  assert.equal((await call('lk_plan_instalments', instalmentInput)).structuredContent.error.code, 'SESSION_REQUIRED');
  await call('lk_session', { action: 'start' });
  assert.equal((await call('lk_plan_instalments', instalmentInput)).structuredContent.error.code, 'CONSENT_REQUIRED');
  assert.equal((await call('lk_set_facts', { income: { employment: '1' } })).structuredContent.error.code, 'CONSENT_REQUIRED');
  const disclaimer = (await call('lk_get_disclaimer')).structuredContent;
  await call('lk_accept_disclaimer', { version: disclaimer.version, user_confirmed: true });
  const planned = (await call('lk_plan_instalments', instalmentInput)).structuredContent;
  assert.equal(planned.ruleset_version, '2026.27.1');
  assert.equal(planned.figures.instalment_payable, '67500.00');
  assert.equal(planned.payment_due_date, '2026-08-15');
  assert.equal(planned.trace.length, Object.keys(planned.figures).length);
  assert.equal(planned.filing_ready, false);
  const instalmentResource = await request('resources/read', { uri: 'lktax://rules/instalments/2026-27' });
  assert.equal(JSON.parse(instalmentResource.result.contents[0].text).ya, '2026/27');
  assert.equal((await call('lk_plan_instalments', { ...instalmentInput, credits_reconciled_without_overlap: false })).structuredContent.error.code, 'INSTALMENT_CREDIT_REVIEW');
  const invalidPlan = await request('tools/call', { name: 'lk_plan_instalments', arguments: { ...instalmentInput, tin: '123456789V' } });
  assert.ok(invalidPlan.error || invalidPlan.result?.isError);
  assert.ok(!JSON.stringify(invalidPlan).includes('123456789V'));
  // Deliberately not imported from core.test.ts: protocol test must not run that suite twice.
  await call('lk_set_facts', { scope: {
    resident_full_year: true, residency_special_case: false, investment_asset_gains: false,
    partnership_or_trust: false, restricted_business: false, terminal_benefits_or_arrears: false,
    business_profit_needs_computation: false, losses: false, multiple_foreign_tax_countries: false,
    foreign_credit_exceeds_cap: false, qualifying_foreign_income: false, local_taxable_below_first_band: false,
    amendment_assessment_or_appeal: false, preparing_for_clients: false,
  }, income: {
    employment: '2880000', business_net: '0', interest: '140000', rent: '0', final_wht_dividends_gross: '0', final_wht_dividends_deducted: '0', apit_credit: '74400',
    ait_wht_credit: '14000', instalments_paid: '0', other_income_or_claims: false,
  }, foreign: noForeign, deductions: { solar_available: '0', approved_charity_cash: '0', government_donations: '0', government_donations_brought_forward: '0', samurdhi_shop_contributions: '0' } });
  const computed = (await call('lk_compute_return')).structuredContent;
  assert.equal(computed.figures.balance_payable, '11200.00');
  assert.equal(computed.filing_ready, false);
  const review = (await call('lk_review_return')).structuredContent;
  assert.equal(review.cages.find((r: any) => r.area === 'return' && r.cage === '190').amount, '11200.00');
  assert.equal(review.export_available, false);
  const sheetChecklist = (await call('lk_get_checklist')).structuredContent;
  await call('lk_acknowledge_checklist', { digest: sheetChecklist.digest, items: sheetChecklist.items.map((i: { id: string }) => i.id), user_confirmed: true });
  assert.ok((await call('lk_generate_worksheet')).structuredContent.worksheet.includes('| 190 |'));
  const rejected = await request('tools/call', { name: 'lk_acknowledge_checklist', arguments: { digest: sheetChecklist.digest, items: [], user_confirmed: true, tin: '123456789V' } });
  assert.ok(rejected.error || rejected.result?.isError);
  assert.ok(!JSON.stringify(rejected).includes('123456789V'));
  assert.equal((await call('lk_explain', { line: 'tax' })).structuredContent.trace.value, '99600.00');
  const g5 = cases.find(c => c.id === 'G5')!;
  await call('lk_set_facts', { income: g5.income, deductions: g5.deductions });
  const expanded = (await call('lk_compute_return')).structuredContent;
  assert.equal(expanded.figures.balance_payable, '544600.00');
  assert.equal(expanded.figures.charity_deduction, '75000.00');
  assert.equal(expanded.figures.credits, '5342000.00');
  assert.equal((await call('lk_explain', { line: 'charity_deduction' })).structuredContent.trace.value, '75000.00');
  const known = await request('resources/read', { uri: 'lktax://known-issues' });
  assert.ok(JSON.parse(known.result.contents[0].text).issues.some((i: { id: string }) => i.id === 'KI-CHARITY-CAP'));
  const supported = await request('resources/read', { uri: 'lktax://supported-scenarios' });
  assert.ok(JSON.parse(supported.result.contents[0].text).unsupported.includes('Non-qualifying foreign income and multi-country foreign tax credits'));
  const g2 = foreignCases.find(c => c.id === 'G2')!;
  await call('lk_set_facts', { income: g2.income, deductions: g2.deductions, foreign: g2.foreign });
  const foreignComputed = (await call('lk_compute_return')).structuredContent;
  assert.equal(foreignComputed.figures.balance_payable, '22000.00');
  assert.equal(foreignComputed.figures.foreign_tax_credit, '1350000.00');
  assert.ok(foreignComputed.scope.reasons.some((r: { code: string }) => r.code === 'SC-07'));
  assert.equal((await call('lk_explain', { line: 'foreign_tax_credit' })).structuredContent.trace.value, '1350000.00');
  await call('lk_set_facts', { income: { ...income, employment: '0', interest: '0', apit_credit: '0', ait_wht_credit: '0' }, deductions: zeroDeductions,
    foreign: { ...g2.foreign, service_net_lkr: '3600000', foreign_tax_paid: '250000' } });
  const dual = (await call('lk_compute_return')).structuredContent;
  assert.equal(dual.figures.tax, '180000.00');
  assert.equal(dual.alternatives[0].figures.tax, '270000.00');
  assert.equal(dual.alternatives[0].figures.foreign_tax_credit, '250000.00');
  assert.equal(dual.alternatives[0].figures.balance_payable, '20000.00');
  assert.ok(dual.flags.includes('INTERP_15PCT'));
  await call('lk_set_facts', { foreign: noForeign, income: { employment: '1900000', business_net: '0', interest: '0', rent: '0' }, deductions: { solar_available: '0', approved_charity_cash: '60000', government_donations: '0' } });
  assert.equal((await call('lk_compute_return')).structuredContent.error.code, 'CHARITY_CAP_REVIEW');
  await call('lk_set_facts', { scope: { losses: true } });
  assert.equal((await call('lk_compute_return')).structuredContent.error.code, 'OUT_OF_SCOPE');
  await call('lk_session', { action: 'wipe' });
  assert.equal((await call('lk_compute_return')).structuredContent.error.code, 'SESSION_REQUIRED');
  assert.equal((await call('lk_plan_instalments', instalmentInput)).structuredContent.error.code, 'SESSION_REQUIRED');
  host.assertClean();
});
