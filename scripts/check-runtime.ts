import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { checkRuntimeSource } from './runtime-policy.ts';

const paths = new Set(readdirSync('src', { recursive: true, encoding: 'utf8' }).filter(p => p.endsWith('.ts')).map(p => `src/${p.replaceAll('\\', '/')}`));
for (const path of paths) {
  const findings = checkRuntimeSource(path, readFileSync(path, 'utf8'), paths);
  assert.deepEqual(findings, [], `${path}: runtime capability policy changed`);
}
process.stdout.write(`Application runtime capability check passed: ${paths.size} source files\n`);
