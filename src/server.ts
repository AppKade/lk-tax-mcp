import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { privateSchema } from './schema.ts';
import { TaxSession, envelope, errorResult, partialFactsSchema } from './service.ts';
import { knownIssues, supportedScenarios } from './support.ts';
import { figureNames } from './engine.ts';
import { rules } from './rules.ts';

export function createServer() {
  const session = new TaxSession();
  const server = new McpServer({ name: 'lk-tax-mcp', version: '2026.25.0-preview.2' });
  const outputSchema = z.object({
    ya: z.literal('2025/26'), ruleset_version: z.string(), verified_on: z.string(),
    review_status: z.string(), caution: z.string(), sources: z.array(z.string()),
  }).passthrough();
  function result(action: () => Record<string, unknown>) {
    try {
      const structuredContent = envelope(action());
      return { content: [{ type: 'text' as const, text: JSON.stringify(structuredContent) }], structuredContent };
    } catch (error) {
      const structuredContent = errorResult(error);
      return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(structuredContent) }], structuredContent };
    }
  }
  const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
  const localMutation = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
  server.registerTool('lk_session', {
    description: 'Start a fresh memory-only YA 2025/26 session or wipe it. Starting discards all prior facts and consent. No identifiers, files or credentials. No data persists after shutdown.',
    inputSchema: privateSchema(z.strictObject({ action: z.enum(['start', 'wipe']), ya: z.string().max(7).default('2025/26') })),
    outputSchema, annotations: { ...localMutation, destructiveHint: true },
  }, ({ action, ya }) => result(() => action === 'start' ? session.start(ya) : session.wipe()));
  server.registerTool('lk_get_disclaimer', {
    description: 'Show this versioned disclaimer verbatim before asking for any tax facts. English development preview only. Then ask the user to agree.',
    inputSchema: privateSchema(z.strictObject({})), outputSchema, annotations: readOnly,
  }, () => result(() => session.disclaimer()));
  server.registerTool('lk_accept_disclaimer', {
    description: 'Record explicit user agreement to the exact current disclaimer in memory. Never infer consent. Required before fact entry and calculation.',
    inputSchema: privateSchema(z.strictObject({ version: z.string().max(30), user_confirmed: z.boolean() })), outputSchema, annotations: localMutation,
  }, ({ version, user_confirmed }) => result(() => session.accept(version, user_confirmed)));
  server.registerTool('lk_set_facts', {
    description: 'Set only user-confirmed facts, with LKR amounts as decimal strings. Never send identifiers or arbitrary text. Confirm zero amounts; do not guess missing answers. business_net is local net profit computed outside this tool. Collect deductions separately. Every amount must be user-confirmed and eligible. Do not enter final dividend WHT as ait_wht_credit. other_income_or_claims is true for foreign income, unsupported dividends, loan-funded solar claims, rent expense deductions or any other unsupported income or claim. Scope answers are mandatory, including explicit false answers.',
    inputSchema: privateSchema(partialFactsSchema), outputSchema, annotations: localMutation,
  }, facts => result(() => session.setFacts(facts)));
  server.registerTool('lk_next_questions', {
    description: 'Get missing scope facts first, then missing income facts. Ask only for listed facts. Never ask for names, TIN, NIC or credentials.',
    inputSchema: privateSchema(z.strictObject({})), outputSchema, annotations: readOnly,
  }, () => result(() => session.nextQuestions()));
  server.registerTool('lk_check_scope', {
    description: 'Evaluate all confirmed scope facts deterministically. Out-of-scope cases must stop. Partial status is not a promise that computation is implemented.',
    inputSchema: privateSchema(z.strictObject({})), outputSchema, annotations: readOnly,
  }, () => result(() => session.checkScope()));
  server.registerTool('lk_compute_return', {
    description: 'Compute a development estimate for local employment, local business net profit, interest, investment rent and supported local reliefs/donations; final-WHT resident-company dividends are informational only. Rechecks consent, facts and scope every time. Not a full return. Show display_summary verbatim. Never recompute or bypass an error. Exports are unavailable.',
    inputSchema: privateSchema(z.strictObject({})), outputSchema, annotations: readOnly,
  }, () => result(() => session.compute()));
  server.registerTool('lk_explain', {
    description: 'Explain a computed line using deterministic inputs, formula, rule version and source. Recomputes from current facts to avoid stale results. Never invent arithmetic.',
    inputSchema: privateSchema(z.strictObject({ line: z.enum(figureNames) })),
    outputSchema, annotations: readOnly,
  }, ({ line }) => result(() => session.explain(line)));
  server.registerResource('rules', 'lktax://rules/2025-26', {
    description: 'Cited, unreviewed YA 2025/26 rules for the implemented local-income slice.', mimeType: 'application/json',
  }, () => ({ contents: [{ uri: 'lktax://rules/2025-26', mimeType: 'application/json', text: JSON.stringify(envelope({ rules })) }] }));
  server.registerResource('known-issues', 'lktax://known-issues', {
    description: 'Dated unresolved rules, unavailable features and release blockers.', mimeType: 'application/json',
  }, () => ({ contents: [{ uri: 'lktax://known-issues', mimeType: 'application/json', text: JSON.stringify(envelope({ issues: knownIssues })) }] }));
  server.registerResource('supported-scenarios', 'lktax://supported-scenarios', {
    description: 'Current supported scenarios and explicit exclusions. Partial scope status does not imply calculation support.', mimeType: 'application/json',
  }, () => ({ contents: [{ uri: 'lktax://supported-scenarios', mimeType: 'application/json', text: JSON.stringify(envelope(supportedScenarios)) }] }));
  return server;
}
