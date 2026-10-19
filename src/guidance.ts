// Shared host guidance contains workflow instructions, never tax rates or calculated amounts.
export const hostInstructions = [
  'Development preview, not IRD-approved, not tax advice and not filing-ready. Read lktax://supported-scenarios and lktax://known-issues before offering help.',
  'Before collecting tax facts, show lk_get_disclaimer verbatim and obtain explicit agreement to its current version. Start a fresh lk_session only after explaining that it discards existing facts and consent; never reset an existing session silently. Then use lk_accept_disclaimer only after the user agrees.',
  'Never collect names, NIC, TIN, employer names, bank or account details, raw documents or credentials. The server has no document ingestion or export tools. Amounts and tool results reach the host and possibly its provider.',
  'Ask only for missing facts reported by lk_next_questions, confirm every requested zero and boolean, and use lk_set_facts only for user-confirmed facts. Follow the dependency-aware interview: skip only booleans explicitly marked not_applicable_facts, never infer an absent amount as zero, and stop gathering facts for blocked or out_of_scope status. Show blocking_guidance and obtain professional review; only change a fact after a genuine user-confirmed correction. Readiness states describe intake, not provisional tax amounts or filing readiness. Use lk_check_scope and stop for out-of-scope cases. Partial status requires reading the reasons; it does not guarantee computation support.',
  'Annual calculations support only the published annual rules year. Instalment planning has its own year and requires separate current-year scope, confirmed method eligibility, an independently prepared gross-tax basis and reconciled credits. Never copy annual facts or results into another year automatically.',
  'Let deterministic tools perform every tax calculation. Present display_summary verbatim with all warnings and interpretation alternatives. Never add, multiply, round or invent a tax amount, choose an interpretation for the user, or bypass isError by estimating it yourself. Ask for genuinely missing facts or refer unresolved cases for professional review.',
  'Filing-obligation decisions, filing outputs, payments and submission are unavailable. Zero payable is not a no-return-required decision. Never access RAMIS or ask for its credentials. Use lk_session wipe only on the user request; it discards facts and consent.',
].join('\n\n');

export const workflowPrompts = [
  {
    name: 'file_my_return', title: 'Prepare an annual tax estimate',
    description: 'Guide the supported annual interview and estimate. Filing and exports are unavailable.',
    workflow: 'Help me prepare a supported annual tax estimate. Explain the preview limits first. After the consent workflow, follow lk_next_questions and lk_set_facts, check scope, and call lk_compute_return only when the required facts are complete. Use lk_explain for returned lines. Read lktax://checklist/documents as a manual evidence checklist; do not request uploads or identifiers. Do not claim that this prepares or submits a complete return.',
  },
  {
    name: 'do_i_need_to_file', title: 'Understand filing guidance limits',
    description: 'Explain that a deterministic filing-obligation decision is not implemented and refer for confirmation.',
    workflow: 'Help me understand the filing guidance available here. Read lktax://supported-scenarios and lktax://known-issues. Explain that the server cannot determine whether I must register, activate a tax type or file. Do not infer an exemption from employment type, income, withholding or zero tax payable, and do not collect facts to apply remembered thresholds. Refer me to current official IRD guidance or a qualified adviser. A supported tax estimate, if I separately request it, still requires the full consent and scope workflow.',
  },
  {
    name: 'plan_my_instalments', title: 'Plan a quarterly instalment estimate',
    description: 'Guide confirmed method selection and credits for the separately supported instalment year.',
    workflow: 'Help me plan a supported quarterly instalment. After the consent workflow, read lktax://rules/instalments/2026-27 and the lk_plan_instalments schema. Confirm current-year scope separately, the quarter, method eligibility, the independently prepared gross-tax basis and the non-overlapping credit components. Do not calculate the gross-tax basis yourself or reuse an annual net balance as gross tax. Never invent notice submission or revision history. Call lk_plan_instalments and show its display_summary and administrative requirements verbatim. Schedule dates do not establish payments; zero payable does not establish an exemption.',
  },
  {
    name: 'explain_my_tax', title: 'Explain a computed tax line',
    description: 'Explain a line from the current deterministic estimate without inventing arithmetic.',
    workflow: 'Help me understand my current tax estimate. Confirm the session and consent state without silently starting a new session. If the estimate is incomplete, use lk_next_questions and obtain only the missing confirmed facts before computing. Ask which returned annual line I want explained, call lk_explain with that published line name, and explain its formula, inputs, sources and rule version. lk_explain recomputes current annual facts. Instalment explanations use the trace returned by lk_plan_instalments instead. Preserve all assumptions and warnings; never reconstruct a result from memory.',
  },
] as const;

export function promptText(prompt: typeof workflowPrompts[number]) {
  return `${hostInstructions}\n\n${prompt.workflow}`;
}

export const documentChecklist = {
  status: 'manual_reference_only', ingestion_available: false, updated_on: '2026-10-19',
  instructions: 'Keep evidence on your device. Reconcile it yourself or with a qualified adviser and enter only confirmed aggregate amounts through the published schemas. Do not upload files, paste certificate text or send identifiers to this server or chat. This is a preparation aid, not an exhaustive legal document list or a filing-obligation decision.',
  items: [
    { category: 'employment', evidence: 'Annual employment and APIT certificates for every employer; separate local and qualifying foreign employment.' },
    { category: 'business', evidence: 'Net-profit computation prepared outside this tool; unsupported losses and special-rate activities need professional assistance.' },
    { category: 'investment', evidence: 'Gross interest and rent totals, eligible advance withholding and separately identified final dividend withholding. Avoid counting final withholding as an advance credit.' },
    { category: 'foreign', evidence: 'Receipt, licensed-bank remittance, service-use and employer eligibility evidence, manual LKR conversions, and eligible foreign tax paid on the same source in one country.' },
    { category: 'reliefs_and_donations', evidence: 'Eligibility evidence and prior claims for supported reliefs and donations; independently verified unused and carry-forward balances.' },
    { category: 'credits', evidence: 'Reconcile APIT, eligible AIT/WHT, actual instalments and eligible foreign credits without overlap. Potential overpayment is not a verified refund claim.' },
    { category: 'instalments', evidence: 'Gross-tax computation under the selected method, current-year credit reconciliation, actual payments and any required SET revision or timely notice. An estimate is not evidence of submission.' },
  ],
};
