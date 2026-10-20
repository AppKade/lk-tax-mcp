import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import contract from '../test/fixtures/mcp-contract.json' with { type: 'json' };
import pkg from '../package.json' with { type: 'json' };
import { canonical, digest } from './contract.ts';

const launcher = fileURLToPath(new URL('../tools/inspector/node_modules/@modelcontextprotocol/inspector/clients/launcher/build/index.js', import.meta.url));
const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const storage = mkdtempSync(join(tmpdir(), 'lk-tax-inspector-'));
const sorted = (items: { name: string }[]) => [...items].sort((a, b) => a.name.localeCompare(b.name, 'en'));
let checks = 0;
try {
  for (const era of ['legacy', 'modern']) {
    function request(method: string, args: string[] = [], exitCode = 0) {
      const result = spawnSync(process.execPath, [launcher, '--cli', process.execPath, cli,
        '--protocol-era', era, '--method', method, '--format', 'json', ...args], {
        encoding: 'utf8', timeout: 30000, maxBuffer: 2 * 1024 * 1024,
        env: { ...process.env, MCP_STORAGE_DIR: storage },
      });
      assert.equal(result.error, undefined, `Inspector failed to execute ${method}`);
      assert.equal(result.status, exitCode, `Inspector ${era} ${method}: ${result.stderr}`);
      const response = JSON.parse(result.stdout);
      assert.ok(response.result, 'Inspector must return its JSON result envelope');
      checks++;
      return response.result;
    }
    const hello = request('initialize');
    assert.equal(hello.serverInfo.version, pkg.version);
    assert.equal(hello.instructions, contract.contract.instructions);
    assert.equal(hello.protocolVersion, era === 'legacy' ? '2025-11-25' : '2026-07-28');
    const tools = request('tools/list', ['--strict']).tools;
    assert.equal(canonical(sorted(tools)), canonical(contract.contract.tools));
    assert.equal(digest(sorted(tools)), digest(contract.contract.tools));
    assert.equal(canonical(sorted(request('resources/list').resources)), canonical(contract.contract.resources));
    assert.equal(canonical(sorted(request('prompts/list').prompts).map(({ name }) => name)),
      canonical(contract.contract.prompts.map(p => p.name)));
    for (const prompt of contract.contract.prompts) {
      const fetched = request('prompts/get', ['--prompt-name', prompt.name]);
      // The Inspector SDK unwraps resultType; the raw wire contract retains it.
      const { resultType, ...modernPrompt } = prompt.result;
      if (era === 'legacy') {
        const { _meta, ...legacy } = modernPrompt;
        assert.equal(canonical(fetched), canonical(legacy));
      } else assert.equal(canonical(fetched), canonical(modernPrompt));
    }
    const resource = request('resources/read', ['--uri', 'lktax://supported-scenarios']);
    const scenarios = JSON.parse(resource.contents[0].text);
    assert.ok(scenarios.unsupported.includes('Non-qualifying foreign income and multi-country foreign tax credits'));
    const disclaimer = request('tools/call', ['--tool-name', 'lk_get_disclaimer']);
    assert.deepEqual(JSON.parse(disclaimer.content[0].text), disclaimer.structuredContent);
    assert.equal(disclaimer.isError, undefined);
    assert.match(disclaimer.structuredContent.disclaimer, /not tax advice/);
    // Each CLI command starts a new server: a prior disclaimer probe must not establish consent/session state.
    const refused = request('tools/call', ['--tool-name', 'lk_generate_worksheet'], 5);
    assert.equal(refused.isError, true);
    assert.equal(refused.structuredContent.error.code, 'SESSION_REQUIRED');
    assert.deepEqual(JSON.parse(refused.content[0].text), refused.structuredContent);
    process.stdout.write(`Inspector 2.11.0 ${era}: discovery, contract, prompts, resource and refusal passed\n`);
  }
  process.stdout.write(`Inspector CLI passed ${checks} probes; tool schema digest ${digest(contract.contract.tools)}\n`);
} finally { rmSync(storage, { recursive: true, force: true }); }
