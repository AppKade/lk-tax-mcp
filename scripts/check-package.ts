import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stdioHost } from '../test/stdio-host.ts';
import { canonical } from './contract.ts';
import { cleanScope, income, zeroDeductions } from '../test/fixtures.ts';
import { instalmentInput } from '../test/instalment-fixture.ts';
import snapshot from '../test/fixtures/mcp-contract.json' with { type: 'json' };
import pkg from '../package.json' with { type: 'json' };
import lock from '../package-lock.json' with { type: 'json' };
import { verifyProductionBom, verifyInstalledBom, type Bom } from './supply-chain.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const npm = process.env.npm_execpath;
assert.ok(npm, 'Run with npm run package:check');
const temporary = mkdtempSync(join(tmpdir(), 'lk-tax-package-'));
const consumer = join(temporary, 'isolated consumer'); // Exercise spaces in installed paths on every platform.
const output = join(root, 'artifacts/package');
const env = { ...process.env, NODE_PATH: undefined, NODE_OPTIONS: undefined,
  npm_config_loglevel: 'error', npm_config_update_notifier: 'false', npm_config_audit: 'false', npm_config_fund: 'false' };
function npmRun(args: string[], cwd: string) {
  return execFileSync(process.execPath, [npm!, ...args], { cwd, env, encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
}
const sort = (items: { name: string }[]) => [...items].sort((a, b) => a.name.localeCompare(b.name, 'en'));
try {
  assert.equal(pkg.private, true, 'This milestone prepares a private preview; publishing needs a separate reviewed change');
  execFileSync(process.execPath, [join(root, 'scripts/build.ts')], { cwd: root, stdio: 'inherit' });
  rmSync(output, { recursive: true, force: true }); mkdirSync(output, { recursive: true });
  const [packed] = JSON.parse(npmRun(['pack', '--ignore-scripts', '--json', '--pack-destination', output], root));
  assert.equal(packed.name, pkg.name); assert.equal(packed.version, pkg.version);
  const expected = ['package.json', 'README.md', 'SECURITY.md', 'docs/installation.md', 'skills/lk-tax/SKILL.md',
    'rules/2025-26.json', 'rules/instalments-2026-27.json', 'rules/cages-2025-26.json',
    ...readdirSync(join(root, 'src')).filter(p => p.endsWith('.ts')).map(p => `dist/${p.replace(/\.ts$/, '.js')}`)].sort();
  assert.deepEqual(packed.files.map((f: { path: string }) => f.path).sort(), expected,
    'Tarball must contain exactly the runtime allowlist, not sources, tests, history, private configuration or developer tools');
  const tarball = join(output, packed.filename);
  mkdirSync(consumer);
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({ name: 'lk-tax-package-validation', version: '0.0.0', private: true }));
  // No source symlinks, TypeScript compiler, Inspector or install lifecycle scripts are available to this consumer.
  npmRun(['install', '--ignore-scripts', '--omit=dev', '--no-audit', '--no-fund', tarball], consumer);
  const productionBom: Bom = JSON.parse(npmRun(['sbom', '--sbom-format=cyclonedx', '--omit=dev', '--package-lock-only'], root));
  const productionComponents = verifyProductionBom(productionBom, lock, pkg);
  const installedBom: Bom = JSON.parse(npmRun(['sbom', '--sbom-format=cyclonedx', '--omit=dev'], consumer));
  verifyInstalledBom(productionBom, installedBom, packed.integrity);
  const bomText = JSON.stringify(productionBom, null, 2) + '\n';
  writeFileSync(join(output, 'production.cdx.json'), bomText);
  const installed = join(consumer, 'node_modules/@appkade/lk-tax-mcp');
  assert.ok(realpathSync(installed).startsWith(realpathSync(consumer)));
  const metadata = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'));
  assert.deepEqual(metadata.bin, { 'lk-tax-mcp': 'dist/cli.js' });
  assert.equal(metadata.version, pkg.version); assert.equal(metadata.private, true);
  const executable = join(installed, metadata.bin['lk-tax-mcp']);
  assert.ok(readFileSync(executable, 'utf8').startsWith('#!/usr/bin/env node\n'));
  assert.ok(!existsSync(join(installed, 'src')));
  for (const tool of ['typescript', '@modelcontextprotocol/inspector'])
    assert.ok(!existsSync(join(consumer, 'node_modules', tool)), `${tool} must not be installed`);
  for (const path of expected)
    assert.deepEqual(readFileSync(join(installed, path)), readFileSync(join(root, path)), `Installed bytes differ: ${path}`);
  const shim = join(consumer, 'node_modules/.bin', process.platform === 'win32' ? 'lk-tax-mcp.cmd' : 'lk-tax-mcp');
  assert.ok(existsSync(shim), 'npm must create the executable shim');
  if (process.platform !== 'win32') assert.equal(realpathSync(shim), realpathSync(executable));
  else assert.ok(readFileSync(shim, 'utf8').replaceAll('\\', '/').includes('@appkade/lk-tax-mcp/dist/cli.js'));

  for (const modern of [false, true]) {
    // npm exec uses the installed bin/shim, with registry fallback disabled during the workflow.
    const host = stdioHost(modern, { command: process.execPath, args: [npm, 'exec', '--offline', '--no', '--', 'lk-tax-mcp'], cwd: consumer, env, requestTimeoutMs: 15000 });
    try {
      if (modern) {
        const hello = (await host.request('server/discover')).result;
        assert.equal(hello._meta['io.modelcontextprotocol/serverInfo'].version, pkg.version);
        assert.equal(hello.instructions, snapshot.contract.instructions);
      } else {
        const hello = (await host.request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'package-validation', version: '1' } })).result;
        assert.equal(hello.serverInfo.version, pkg.version);
        host.notify('notifications/initialized');
      }
      const tools = (await host.request('tools/list')).result.tools;
      assert.equal(canonical(sort(tools)), canonical(snapshot.contract.tools));
      const resources = (await host.request('resources/list')).result.resources;
      assert.equal(canonical(sort(resources)), canonical(snapshot.contract.resources));
      const cageMap = JSON.parse((await host.request('resources/read', { uri: 'lktax://cagemap/2025-26' })).result.contents[0].text);
      assert.equal(cageMap.cage_map.version, '2025.26.cages.1');
      async function call(name: string, args = {}) {
        const response = await host.request('tools/call', { name, arguments: args });
        assert.equal(response.error, undefined);
        assert.deepEqual(JSON.parse(response.result.content[0].text), response.result.structuredContent);
        return response.result;
      }
      assert.equal((await call('lk_generate_worksheet')).structuredContent.error.code, 'SESSION_REQUIRED');
      await call('lk_session', { action: 'start' });
      assert.equal((await call('lk_compute_return')).structuredContent.error.code, 'CONSENT_REQUIRED');
      const disclaimer = (await call('lk_get_disclaimer')).structuredContent;
      await call('lk_accept_disclaimer', { version: disclaimer.version, user_confirmed: true });
      await call('lk_set_facts', { scope: cleanScope, income, deductions: zeroDeductions,
        foreign: { employment_lkr: '0', service_net_lkr: '0', foreign_tax_paid: '0' } });
      const estimate = (await call('lk_compute_return')).structuredContent;
      assert.equal(estimate.figures.balance_payable, '11200.00'); assert.equal(estimate.filing_ready, false);
      assert.equal((await call('lk_generate_worksheet')).structuredContent.error.code, 'CHECKLIST_REQUIRED');
      const checklist = (await call('lk_get_checklist')).structuredContent;
      await call('lk_acknowledge_checklist', { digest: checklist.digest, items: checklist.items.map((i: { id: string }) => i.id), user_confirmed: true });
      const sheet = (await call('lk_generate_worksheet')).structuredContent;
      assert.ok(sheet.worksheet.includes('| 190 |') && sheet.worksheet.includes('11200.00'));
      assert.equal(sheet.file_written, false); assert.equal(sheet.filing_ready, false);
      const plan = (await call('lk_plan_instalments', instalmentInput)).structuredContent;
      assert.equal(plan.figures.instalment_payable, '67500.00'); assert.equal(plan.ya, '2026/27');
      await call('lk_set_facts', { income: { employment: '2900000' } });
      assert.equal((await call('lk_generate_worksheet')).structuredContent.error.code, 'CHECKLIST_REQUIRED');
      await call('lk_session', { action: 'wipe' });
      assert.equal((await call('lk_compute_return')).structuredContent.error.code, 'SESSION_REQUIRED');
      host.assertClean();
    } finally { await host.close(); }
    process.stdout.write(`Installed npm executable passed ${modern ? 'modern' : 'legacy'} stdio journey\n`);
  }
  const report = { name: pkg.name, version: pkg.version, private: true, published: false, filing_ready: false,
    platform: process.platform, node: process.version, filename: packed.filename,
    sha256: createHash('sha256').update(readFileSync(tarball)).digest('hex'), integrity: packed.integrity,
    contract_sha256: snapshot.sha256, production_components: productionComponents,
    sbom: { filename: 'production.cdx.json', format: productionBom.bomFormat, spec_version: productionBom.specVersion,
      sha256: createHash('sha256').update(bomText).digest('hex') },
    lockfile_sha256: createHash('sha256').update(readFileSync(join(root, 'package-lock.json'))).digest('hex'), files: expected };
  writeFileSync(join(output, 'validation.json'), JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(`Verified private package: ${expected.length} allowed files, SHA-256 ${report.sha256}\n`);
} finally { rmSync(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
