import { z } from 'zod';
import { rulesSchema } from '../src/rules.ts';
import { instalmentRulesSchema } from '../src/instalments.ts';
import { cageMapSchema } from '../src/return-review.ts';
import { digest } from './contract.ts';

export const ruleFamilies = {
  annual: { path: 'rules/2025-26.json', schema: rulesSchema },
  instalments: { path: 'rules/instalments-2026-27.json', schema: instalmentRulesSchema },
  cages: { path: 'rules/cages-2025-26.json', schema: cageMapSchema },
} as const;
export type Family = keyof typeof ruleFamilies;
const familyNames = Object.keys(ruleFamilies) as Family[];
const entrySchema = z.strictObject({
  family: z.enum(familyNames), version: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  archive: z.string(), reason: z.string().trim().min(1),
});
const historySchema = z.strictObject({ format_version: z.literal(1), entries: z.array(entrySchema).min(3) });
export type RuleHistory = z.infer<typeof historySchema>;
type Read = (path: string) => unknown;
function requireRule(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
function officialURL(value: string) {
  const url = new URL(value);
  requireRule(url.protocol === 'https:' && url.hostname === 'www.ird.gov.lk' && url.port === '' &&
    !url.username && !url.password && !url.hash && url.pathname !== '/', 'Invalid primary-source URL');
}
function citations(value: unknown) {
  if (Array.isArray(value)) { value.forEach(citations); return; }
  if (value === null || typeof value !== 'object') return;
  const obj = value as Record<string, unknown>;
  for (const [key, child] of Object.entries(obj)) {
    if (key === 'url' || key === 'source') { requireRule(typeof child === 'string', 'Missing source URL'); officialURL(child); }
    if (key === 'locator') requireRule(typeof child === 'string' && child.trim(), 'Empty source locator');
    citations(child);
  }
}
export function validateRuleHistory(input: unknown, read: Read): RuleHistory {
  const history = historySchema.parse(input);
  const seen = new Set<string>();
  for (const family of familyNames) {
    const entries = history.entries.filter(e => e.family === family);
    requireRule(entries.length, `Missing rule family: ${family}`);
    let previousRevision = -1;
    for (const entry of entries) {
      const key = `${family}:${entry.version}`;
      requireRule(!seen.has(key), `Duplicate rule version: ${key}`); seen.add(key);
      requireRule(entry.archive === `rules/history/${family}/${entry.version}.json`, 'Invalid archive path');
      const archived = read(entry.archive);
      const parsed = ruleFamilies[family].schema.parse(archived);
      requireRule(parsed.version === entry.version, 'Archive version mismatch');
      requireRule(digest(archived) === entry.sha256, 'Archive digest mismatch');
      const revision = Number(entry.version.split('.').at(-1));
      requireRule(Number.isSafeInteger(revision) && revision > previousRevision, 'Rule versions must increase');
      previousRevision = revision;
      citations(archived);
      if (family === 'annual') {
        const ids = Object.values(archived as Record<string, unknown>).filter(v => v && typeof v === 'object' && 'id' in v)
          .map(v => (v as { id: string }).id);
        requireRule(new Set(ids).size === ids.length, 'Duplicate rule ID');
      }
    }
    const active = read(ruleFamilies[family].path);
    ruleFamilies[family].schema.parse(active);
    requireRule(digest(active) === entries.at(-1)!.sha256, `Active ${family} must match latest archive`);
  }
  return history;
}
export function validateRuleTransition(previous: RuleHistory, current: RuleHistory) {
  for (const family of familyNames) {
    const oldEntries = previous.entries.filter(e => e.family === family);
    const newEntries = current.entries.filter(e => e.family === family);
    requireRule(newEntries.length >= oldEntries.length && oldEntries.every((e, i) => digest(e) === digest(newEntries[i])),
      `Published ${family} history is immutable; append a new version`);
  }
}
