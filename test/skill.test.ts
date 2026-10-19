import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import contract from './fixtures/mcp-contract.json' with { type: 'json' };

const text = readFileSync(new URL('../skills/lk-tax/SKILL.md', import.meta.url), 'utf8');
const [, frontmatter, body] = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)!;
const tools: string[] = contract.contract.tools.map((t: { name: string }) => t.name);
const resources: string[] = contract.contract.resources.map((r: { uri: string }) => r.uri);

test('skill has valid frontmatter and stays within the size budget', () => {
  assert.match(frontmatter, /^name: lk-tax$/m);
  const description = frontmatter.match(/^description: (.+)$/m)![1];
  assert.ok(description.length > 0 && description.length <= 1024);
  assert.ok(description.includes('Not tax advice'));
  assert.ok(text.split('\n').length < 500);
});

test('skill names only published tools and resources, and covers every tool', () => {
  const named = new Set(body.match(/\blk_[a-z_]+\b/g));
  for (const name of named) assert.ok(tools.includes(name), `unknown tool ${name}`);
  for (const tool of tools) assert.ok(named.has(tool), `skill never mentions ${tool}`);
  for (const uri of body.match(/lktax:\/\/[\w\/.-]+/g) ?? []) assert.ok(resources.includes(uri), `unknown resource ${uri}`);
});

test('skill contains no tax rates or amounts and keeps the verbatim and consent guardrails', () => {
  assert.ok(!/%/.test(body), 'no percentages');
  assert.ok(!/(?:Rs\.?|LKR)\s*\d/.test(body), 'no currency amounts');
  assert.ok(!/\d[\d,]{3,}/.test(body.replace(/20\d\d\/\d\d/g, '')), 'no large numbers');
  for (const phrase of ['display_summary', 'verbatim', 'user_confirmed: true', 'Never infer consent', 'isError', 'not_applicable_facts', 'qualified'])
    assert.ok(body.includes(phrase), phrase);
  assert.ok(/never ask for or accept names, NIC, TIN/i.test(body));
});
