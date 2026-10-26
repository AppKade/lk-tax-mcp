import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pkg from '../package.json' with { type: 'json' };

const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const run = (args: string[]) => spawnSync(process.execPath, [cli, ...args], {
  encoding: 'utf8', timeout: 5000,
  env: { ...process.env, LK_TAX_DOCUMENT_ROOT: 'SyntheticPrivateMarker', LK_TAX_DRAFT_KEY_FILE: 'SyntheticSecretMarker' },
});
test('CLI help and version exit without starting a tax session or leaking configuration', () => {
  for (const flag of ['--help', '-h', '--version']) {
    const r = run([flag]);
    assert.equal(r.error, undefined); assert.equal(r.status, 0); assert.equal(r.stderr, '');
    assert.ok(r.stdout.includes(pkg.version));
    assert.ok(!r.stdout.includes('SyntheticPrivateMarker') && !r.stdout.includes('SyntheticSecretMarker'));
    if (flag !== '--version') assert.match(r.stdout, /not an interactive terminal tax interview/);
  }
});
test('CLI config uses exact executable paths and does not include optional environment grants', () => {
  const r = run(['--print-config']);
  assert.equal(r.status, 0); assert.equal(r.stderr, '');
  assert.deepEqual(JSON.parse(r.stdout), { mcpServers: { 'lk-tax': { command: process.execPath, args: [realpathSync(cli)] } } });
});
test('CLI configuration from a symlinked directory points to the real executable', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'lk-tax-cli-path-'));
  try {
    const alias = join(temporary, 'linked checkout');
    symlinkSync(fileURLToPath(new URL('../', import.meta.url)), alias, process.platform === 'win32' ? 'junction' : 'dir');
    const r = spawnSync(process.execPath, [join(alias, 'src/cli.ts'), '--print-config'], { encoding: 'utf8', timeout: 5000 });
    assert.equal(r.error, undefined); assert.equal(r.status, 0); assert.equal(r.stderr, '');
    assert.deepEqual(JSON.parse(r.stdout), { mcpServers: { 'lk-tax': { command: process.execPath, args: [realpathSync(cli)] } } });
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});
test('unsupported and extra arguments fail with fixed errors, never echoed private input', () => {
  for (const args of [['SyntheticPrivateMarker'], ['--help', 'SyntheticPrivateMarker'], ['--version', '--print-config'], ['--unknown']]) {
    const r = run(args);
    assert.equal(r.error, undefined); assert.equal(r.status, 2); assert.equal(r.stdout, '');
    assert.match(r.stderr, /Unsupported arguments/); assert.ok(!r.stderr.includes('SyntheticPrivateMarker'));
  }
});
