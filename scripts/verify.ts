import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pkg from '../package.json' with { type: 'json' };

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--full')) throw new Error('Supported option: --full');
const full = args[0] === '--full';
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run with npm run verify or npm run verify:full');
const root = fileURLToPath(new URL('../', import.meta.url));
const reportPath = fileURLToPath(new URL('../artifacts/verification.json', import.meta.url));
// A failed run must not leave an earlier passing summary looking current.
rmSync(reportPath, { force: true });
const checks = ['check', 'security:check', 'audit:production', 'payments:check', 'test', 'rules:check', 'contract:check', 'package:check',
  ...(full ? ['test:inspector'] : [])];
const passed: string[] = [];
for (const check of checks) {
  const command = ['run', check, ...(full && check === 'package:check' ? ['--', '--documents'] : [])];
  const result = spawnSync(process.execPath, [npm, ...command], { cwd: root, stdio: 'inherit', timeout: 600000 });
  if (result.error || result.status !== 0) {
    process.stderr.write(`Verification stopped at ${check}. No passing report was written.\n`);
    process.exitCode = 1;
    break;
  }
  passed.push(check);
}
if (passed.length === checks.length) {
  mkdirSync(fileURLToPath(new URL('../artifacts/', import.meta.url)), { recursive: true });
  writeFileSync(reportPath, JSON.stringify({ version: pkg.version, checked_at: new Date().toISOString(),
    platform: process.platform, node: process.version, mode: full ? 'full' : 'standard', checks: passed,
    installed_document_workflow: full, inspector: full, filing_ready: false,
    note: 'Engineering checks only. External tax review and installed desktop/model evaluations remain required.' }, null, 2) + '\n');
  process.stdout.write(`Preview ${pkg.version}: ${passed.length} verification gates passed. This does not establish filing readiness.\n`);
}
