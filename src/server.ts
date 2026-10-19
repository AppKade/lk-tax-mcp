import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { privateSchema } from './schema.ts';
import { TaxSession, envelope, errorResult, partialFactsSchema } from './service.ts';
import { knownIssues, supportedScenarios } from './support.ts';
import { figureNames } from './engine.ts';
import { rules } from './rules.ts';
import { instalmentSchema, instalmentRules } from './instalments.ts';
import { hostInstructions, workflowPrompts, promptText, documentChecklist } from './guidance.ts';
import { cageMap } from './return-review.ts';
import { factDictionary, interviewPolicy } from './interview.ts';
import { assertPrivateOutput } from './privacy.ts';
import pkg from '../package.json' with { type: 'json' };

export function createServer() {
  const session = new TaxSession();
  const server = new McpServer({ name: 'lk-tax-mcp', version: pkg.version }, { instructions: hostInstructions });
  const outputSchema = z.object({
    ya: z.enum(['2025/26', '2026/27']), ruleset_version: z.string(), verified_on: z.string(),
    review_status: z.string(), caution: z.string(), sources: z.array(z.string()),
  }).passthrough();
  function result(action: () => Record<string, unknown>, context: 'annual' | 'instalments' | 'review' = 'annual') {
    try {
      const structuredContent = envelope(action(), context);
      return { content: [{ type: 'text' as const, text: JSON.stringify(structuredContent) }], structuredContent };
    } catch (error) {
      const structuredContent = errorResult(error, context);
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
    description: 'Set only user-confirmed facts, with LKR amounts as decimal strings. Never send identifiers or arbitrary text. Confirm zero amounts; do not guess missing answers. business_net is local net profit computed outside this tool. Collect deductions separately. Every amount must be user-confirmed and eligible. Do not enter final dividend WHT as ait_wht_credit. Collect foreign aggregates and eligibility in the foreign object, never in local income. Foreign amounts must already be converted to LKR. Foreign tax paid must be eligible income tax on that same income from one confirmed source in one country; do not include Sri Lankan APIT or pool sources. other_income_or_claims is true for non-qualifying or otherwise unsupported foreign income, unsupported dividends, loan-funded solar claims, rent expense deductions or any other unsupported income or claim. Scope answers are required unless an already confirmed exclusion stops intake. Confirm explicit false answers when requested. Use lk_next_questions to determine relevant foreign eligibility booleans; never invent answers for inapplicable facts. Scope foreign hints cannot override flags derived from computation amounts.',
    inputSchema: privateSchema(partialFactsSchema), outputSchema, annotations: localMutation,
  }, facts => result(() => session.setFacts(facts)));
  server.registerTool('lk_next_questions', {
    description: 'Get dependency-aware interview progress and only the next missing writable facts. All monetary amounts, including zeros, require confirmation. Foreign eligibility booleans are requested only when confirmed amounts make them relevant. Placeholder readiness means selector amounts are unanswered; it is not a provisional tax estimate. Stop collecting facts for blocked or out_of_scope status and show blocking_guidance. Intake completeness does not establish filing readiness. Never ask for names, TIN, NIC or credentials.',
    inputSchema: privateSchema(z.strictObject({})), outputSchema, annotations: readOnly,
  }, () => result(() => session.nextQuestions()));
  server.registerTool('lk_check_scope', {
    description: 'Evaluate confirmed triage scope answers deterministically. Final foreign-credit and interpretation flags are derived from actual amounts by computation. Out-of-scope cases must stop. Partial status is not a promise that computation is implemented.',
    inputSchema: privateSchema(z.strictObject({})), outputSchema, annotations: readOnly,
  }, () => result(() => session.checkScope()));
  server.registerTool('lk_compute_return', {
    description: 'Compute a development estimate for local employment, local business net profit, interest, investment rent and supported local reliefs/donations; final-WHT resident-company dividends are informational only. Also supports confirmed qualifying foreign salary and net foreign services with single-source, single-country capped foreign credits. Uses an assumed local-first deduction allocation and capped progressive stacking. Show every interpretation warning and alternative summary; never select a preferred interpretation or claim the allocation is optimal. Rechecks consent, facts and scope every time. Not a full return. Show display_summary verbatim. Never recompute or bypass an error. Exports are unavailable.',
    inputSchema: privateSchema(z.strictObject({})), outputSchema, annotations: readOnly,
  }, () => result(() => session.compute()));
  server.registerTool('lk_review_return', {
    description: 'Review the current supported annual estimate against verified YA 2025/26 return and schedule cage references. Recomputes current facts and enforces the same consent, scope, eligibility and financial validations as lk_compute_return. Returns mapped preview amounts, arithmetic checks, trace coverage, manual review gaps and a conservative return-format hint. Null cage amounts must remain unset. Reference amounts are not filing values: potential overpayment is not an approved refund, and unused solar amounts require historical reconciliation. Never invent primary/secondary APIT, Table 08, withholding or payment-row splits, exempt disclosures or gross remittances from aggregate facts. Final dividend WHT already deducted is informational at Schedule 6A, never additional unpaid tax or an advance credit. Preserve every flag and interpretation alternative; do not select one. Show display_summary verbatim. This is not a complete return, export, filing obligation or pre-export checklist approval. No files, identifiers, payments or RAMIS access.',
    inputSchema: privateSchema(z.strictObject({})), outputSchema, annotations: readOnly,
  }, () => result(() => session.review(), 'review'));
  server.registerTool('lk_get_checklist', {
    description: 'Get the pre-export verification checklist for the current supported estimate. Recomputes current facts with the same consent, scope and validation gates as lk_review_return. Show every statement to the user verbatim. The digest changes whenever facts, figures, gaps or flags change.',
    inputSchema: privateSchema(z.strictObject({})), outputSchema, annotations: readOnly,
  }, () => result(() => session.checklist(), 'review'));
  server.registerTool('lk_acknowledge_checklist', {
    description: 'Record in memory that the user explicitly confirmed every statement in the current checklist. Pass the digest from lk_get_checklist and the ids of the statements the user confirmed. Never confirm on the user\'s behalf. Any later fact change invalidates the acknowledgement.',
    inputSchema: privateSchema(z.strictObject({ digest: z.string().regex(/^[a-f0-9]{64}$/), items: z.array(z.string().max(40)).max(10), user_confirmed: z.boolean() })),
    outputSchema, annotations: localMutation,
  }, ({ digest, items, user_confirmed }) => result(() => session.acknowledgeChecklist(digest, items, user_confirmed), 'review'));
  server.registerTool('lk_generate_worksheet', {
    description: 'Generate a Markdown worksheet of the current supported estimate by return and schedule cage, with arithmetic checks, unresolved gaps, flags and banners. Refused until the current checklist is acknowledged. Returns text only: no file is written and it is neither a RAMIS submission nor a filing output. Present the worksheet verbatim and never fill unset cages.',
    inputSchema: privateSchema(z.strictObject({})), outputSchema, annotations: readOnly,
  }, () => result(() => session.worksheet(), 'review'));
  server.registerTool('lk_plan_instalments', {
    description: 'Plan one YA 2026/27 quarterly instalment under the 12 August 2026 re-revised IRD circular. Requires active session and current explicit consent. Confirm current-year scope separately in this input. A must be gross tax prepared externally under the selected method, not an annual net balance or a copied current-year estimate. Method 1 uses YA 2025/26 gross tax; 2(i) uses zero; 2(ii)/(iii) use adjusted previous-year figures, with final SET allowed only for quarter one before return finalisation and exactly one return revision thereafter; 2(iv) uses an independently prepared current-year estimate in the first year only. Never infer eligibility. C includes actual earlier instalments and eligible full-year APIT/AIT/WHT, split into deducted and expected remaining, without overlap or final WHT. No foreign-credit basis, Method 3, corporate cases, payments or identifiers. Confirm timely notice when switching from Method 1 to 2(iii). Display display_summary and administrative requirements verbatim. Zero payable is not a filing exemption. Recompute each quarter with actual paid credits; schedule dates do not assume future payments.',
    inputSchema: privateSchema(instalmentSchema), outputSchema, annotations: readOnly,
  }, input => result(() => session.planInstalments(input), 'instalments'));
  server.registerTool('lk_explain', {
    description: 'Explain a computed line using deterministic inputs, formula, rule version and source. Recomputes from current facts to avoid stale results. Never invent arithmetic.',
    inputSchema: privateSchema(z.strictObject({ line: z.enum(figureNames) })),
    outputSchema, annotations: readOnly,
  }, ({ line }) => result(() => session.explain(line)));
  server.registerResource('rules', 'lktax://rules/2025-26', {
    description: 'Cited, unreviewed YA 2025/26 rules for the implemented local and qualifying foreign-income preview.', mimeType: 'application/json',
  }, () => ({ contents: [{ uri: 'lktax://rules/2025-26', mimeType: 'application/json', text: JSON.stringify(envelope({ rules })) }] }));
  server.registerResource('instalment-rules', 'lktax://rules/instalments/2026-27', {
    description: 'YA 2026/27 instalment source, verified dates and unreviewed rule version. Does not supply annual return rates.', mimeType: 'application/json',
  }, () => ({ contents: [{ uri: 'lktax://rules/instalments/2026-27', mimeType: 'application/json', text: JSON.stringify(envelope({ rules: instalmentRules }, 'instalments')) }] }));
  server.registerResource('known-issues', 'lktax://known-issues', {
    description: 'Dated unresolved rules, unavailable features and release blockers.', mimeType: 'application/json',
  }, () => ({ contents: [{ uri: 'lktax://known-issues', mimeType: 'application/json', text: JSON.stringify(envelope({ issues: knownIssues })) }] }));
  server.registerResource('supported-scenarios', 'lktax://supported-scenarios', {
    description: 'Current supported scenarios and explicit exclusions. Partial scope status does not imply calculation support.', mimeType: 'application/json',
  }, () => ({ contents: [{ uri: 'lktax://supported-scenarios', mimeType: 'application/json', text: JSON.stringify(envelope(supportedScenarios)) }] }));
  for (const prompt of workflowPrompts) {
    server.registerPrompt(prompt.name, {
      title: prompt.title, description: prompt.description, argsSchema: privateSchema(z.strictObject({})),
    }, () => {
      const text = promptText(prompt);
      assertPrivateOutput(text);
      return { messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }] };
    });
  }
  server.registerResource('document-checklist', 'lktax://checklist/documents', {
    description: 'Manual evidence checklist. Do not upload documents or identifiers; ingestion and filing remain unavailable.', mimeType: 'application/json',
  }, () => ({ contents: [{ uri: 'lktax://checklist/documents', mimeType: 'application/json', text: JSON.stringify(envelope({ checklist: documentChecklist })) }] }));
  server.registerResource('annual-sources', 'lktax://sources/2025-26', {
    description: 'Annual rule citations and evidence status, including explicitly assumed interpretation policies.', mimeType: 'application/json',
  }, () => {
    const evidence = Object.values(rules).filter((value): value is { id: string; status: 'confirmed' | 'secondary' | 'assumed'; verified_on: string; sources: { url: string; locator: string }[] } =>
      typeof value === 'object' && value !== null && 'id' in value && 'sources' in value);
    return { contents: [{ uri: 'lktax://sources/2025-26', mimeType: 'application/json', text: JSON.stringify(envelope({ evidence })) }] };
  });
  server.registerResource('fact-dictionary', 'lktax://facts/2025-26', {
    description: 'Writable fact dictionary and dependency-aware intake policy. Derived readiness is not a monetary estimate or filing decision.', mimeType: 'application/json',
  }, () => ({ contents: [{ uri: 'lktax://facts/2025-26', mimeType: 'application/json', text: JSON.stringify(envelope({ facts: factDictionary, policy: interviewPolicy })) }] }));
  server.registerResource('cage-map', 'lktax://cagemap/2025-26', {
    description: 'Verified source references for supported annual cage mappings. Practitioner-unreviewed; unsupported or insufficiently evidenced filing fields remain unresolved.', mimeType: 'application/json',
  }, () => ({ contents: [{ uri: 'lktax://cagemap/2025-26', mimeType: 'application/json', text: JSON.stringify(envelope({ cage_map: cageMap }, 'review')) }] }));
  return server;
}
