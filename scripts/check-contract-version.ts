import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { validateVersion } from './contract.ts';
const base = process.argv[2];
if (!base || !/^[a-f0-9]{40}$/.test(base) || /^0+$/.test(base)) throw new Error('Supply a valid existing base commit SHA');
const previousPackage = JSON.parse(execFileSync('git', ['show', `${base}:package.json`], { encoding: 'utf8' }));
// The first manifest is still an interface change and requires a version bump.
let previousDigest: string | undefined;
const paths = execFileSync('git', ['ls-tree', '--name-only', base, 'test/fixtures/mcp-contract.json'], { encoding: 'utf8' }).trim();
if (paths) previousDigest = JSON.parse(execFileSync('git', ['show', `${base}:test/fixtures/mcp-contract.json`], { encoding: 'utf8' })).sha256;
const current = JSON.parse(readFileSync('test/fixtures/mcp-contract.json', 'utf8'));
validateVersion({ version: previousPackage.version, sha256: previousDigest }, current);
process.stdout.write('MCP contract version gate passed\n');
