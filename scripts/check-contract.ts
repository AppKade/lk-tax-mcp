import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { captureContract, digest } from './contract.ts';
import pkg from '../package.json' with { type: 'json' };

const actual = await captureContract();
assert.equal(actual.version, pkg.version, 'SDK server identity must match package version');
const text = JSON.stringify(actual, null, 2) + '\n';
if (process.argv.includes('--update')) {
  writeFileSync('test/fixtures/mcp-contract.json', text);
  process.stdout.write(`Updated public MCP contract ${actual.sha256}\n`);
} else {
  // Static metadata only, captured without sending any session facts or accepting consent.
  mkdirSync('artifacts', { recursive: true });
  writeFileSync('artifacts/mcp-contract.actual.json', text);
  const expected = JSON.parse(readFileSync('test/fixtures/mcp-contract.json', 'utf8'));
  assert.equal(expected.sha256, digest(expected.contract), 'Stored manifest digest is invalid');
  assert.deepEqual(actual, expected, 'MCP interface changed: review the diff, bump the version and run npm run contract:update');
  process.stdout.write(`Verified public MCP contract ${actual.sha256}\n`);
}
