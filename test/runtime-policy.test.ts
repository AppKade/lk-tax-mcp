import test from 'node:test';
import assert from 'node:assert/strict';
import { checkRuntimeSource } from '../scripts/runtime-policy.ts';
const sources = new Set(['src/cli.ts', 'src/server.ts', 'src/engine.ts']);
const check = (code: string, path = 'src/server.ts') => checkRuntimeSource(path, code, sources);

test('runtime policy allows current package imports, active JSON and hashing without treating text as code', () => {
  assert.deepEqual(check(`import { z } from 'zod'; import { createHash } from 'node:crypto';
    import pkg from '../package.json' with { type: 'json' };
    import rules from '../rules/2025-26.json' with { type: 'json' };
    export { computeReturn } from './engine.ts';
    const note = 'Never fetch documents, eval input or use a shell';`), []);
});
test('runtime policy rejects file, network, subprocess and new dependency imports/re-exports', () => {
  for (const specifier of ['node:fs', 'fs', 'node:child_process', 'node:http', 'node:https', 'node:net', 'node:module', 'undici',
    '../../outside.ts', '../rules/history.json', '../.env', 'https://example.test/code.js'])
    for (const code of [`import x from '${specifier}';`, `export * from '${specifier}';`]) assert.ok(check(code).length, code);
});
test('runtime policy rejects dynamic import, CommonJS and dangerous globals including aliases', () => {
  for (const code of [`import('node:fs')`, `import(moduleName)`, `const r = require;`, `import fs = require('fs');`,
    `const e = eval;`, `new Function('return 1')`, `globalThis['fetch']('https://example.test')`, `const f = fetch;`,
    `new WebSocket('wss://example.test')`, `new Worker('x')`, `console.log('facts')`, `process.env.TOKEN`, `const p = process;`])
    assert.ok(check(code).length, code);
});
test('runtime process exception permits only the entry point shutdown hooks', () => {
  for (const signal of ['SIGINT', 'SIGTERM']) {
    const code = `process.on('${signal}', () => { void handle.close(); });`;
    assert.deepEqual(check(code, 'src/cli.ts'), []);
    assert.ok(check(code).length);
  }
  for (const code of [`process.on('uncaughtException', handler)`, `process.exit(0)`, `process['on']('SIGINT', handler)`, `process.stdout.write('facts')`])
    assert.ok(check(code, 'src/cli.ts').length);
  assert.ok(check(`import { createHash, webcrypto } from 'node:crypto'`).length);
});
