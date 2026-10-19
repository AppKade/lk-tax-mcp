import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { validateRuleHistory, validateRuleTransition, ruleFamilies } from './rule-governance.ts';
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const history = validateRuleHistory(read('rules/history.json'), read);
// New rule files cannot silently bypass governance.
const registered = new Set([...Object.values(ruleFamilies).map(f => f.path), 'rules/history.json', ...history.entries.map(e => e.archive)]);
for (const file of readdirSync('rules', { recursive: true })) {
  const path = `rules/${file}`;
  if (path.endsWith('.json') && !registered.has(path)) throw new Error(`Unregistered rule file: ${path}`);
}
const base = process.argv[2];
if (base) {
  if (!/^[a-f0-9]{40}$/.test(base) || /^0+$/.test(base)) throw new Error('Supply a valid existing base commit SHA');
  const previousRead = (path: string) => JSON.parse(execFileSync('git', ['show', `${base}:${path}`], { encoding: 'utf8' }));
  const exists = execFileSync('git', ['ls-tree', '--name-only', base, 'rules/history.json'], { encoding: 'utf8' }).trim();
  if (exists) validateRuleTransition(validateRuleHistory(previousRead('rules/history.json'), previousRead), history);
  else {
    // First adoption must preserve every previously governed active value.
    for (const family of ['annual', 'cages'] as const) {
      const old = previousRead(ruleFamilies[family].path);
      const initial = history.entries.find(e => e.family === family)!;
      const { digest } = await import('./contract.ts');
      if (digest(old) !== initial.sha256) throw new Error('Initial history must preserve base rules');
    }
  }
}
process.stdout.write(`Rule governance passed: ${history.entries.length} archived versions\n`);
