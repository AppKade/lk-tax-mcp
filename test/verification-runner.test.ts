import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('verification stops on failure and removes stale success without executing later checks', () => {
  const root = mkdtempSync(join(tmpdir(), 'lk-tax-verify-runner-'));
  try {
    mkdirSync(join(root, 'scripts')); mkdirSync(join(root, 'artifacts'));
    copyFileSync(new URL('../scripts/verify.ts', import.meta.url), join(root, 'scripts/verify.ts'));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ type: 'module', version: 'synthetic-test' }));
    const report = join(root, 'artifacts/verification.json');
    writeFileSync(report, JSON.stringify({ stale: true }));
    const trace = join(root, 'trace.jsonl');
    const stub = join(root, 'npm-test.mjs');
    writeFileSync(stub, `import {appendFileSync} from 'node:fs';
      appendFileSync(process.env.VERIFY_TEST_TRACE, JSON.stringify(process.argv.slice(2))+'\\n');
      if (process.argv[3] === 'security:check') process.exitCode = 7;`);
    const r = spawnSync(process.execPath, [join(root, 'scripts/verify.ts')], { cwd: root, encoding: 'utf8', timeout: 15000,
      env: { ...process.env, npm_execpath: stub, VERIFY_TEST_TRACE: trace } });
    assert.equal(r.error, undefined); assert.equal(r.status, 1);
    assert.match(r.stderr, /stopped at security:check/);
    assert.equal(existsSync(report), false);
    assert.deepEqual(readFileSync(trace, 'utf8').trim().split('\n').map(line => JSON.parse(line)),
      [['run', 'check'], ['run', 'security:check']]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
