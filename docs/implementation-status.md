# Implementation status

Updated: 2026-10-19. Foundation, local-reliefs, qualifying foreign-income and instalment milestones implemented; P0 remains incomplete. The original requirements and CSV remain the planning baseline.

| Backlog | Delivered in this slice | Remaining acceptance criteria |
|---|---|---|
| T1.1, T1.2 | Strict JSON rule validation, dated evidence, YA 2025/26 reliefs, donation parameters, dividend finality and progressive bands | TOML compatibility, full rule catalogue, reviewer sign-off and version-history lint |
| T2.1 | Bigint cents and exact percentage accumulation; unsupported YA fails | Official filing rounding policy and upstream APIT fixtures |
| T2.2 | Writable fact dictionary, dependency-aware intake readiness, conditional foreign questions, early blockers and edit re-evaluation | Partial financial-node evaluation and unsupported income categories |
| T2.3, T2.6, T2.7 | Local and qualifying foreign totals, supported deductions, final-WHT dividends, single-source, single-country capped foreign credits, balances, interpretation alternatives and cited traces | Remaining categories, credits and comprehensive cage mapping |
| T2.8 | YA 2026/27 Methods 1 and 2(i)-(iv), externally supplied A, reconciled credits, dated schedule, SET and revision guards | Independent computation/validation of A, foreign credits, employment exception decisions and professional sign-off |
| T3.2 | SC-01 through SC-09 checks and server-enforced refusal | Professional review of scope text; calculation support for partial cases |
| T5.2, T5.3 | Identifier-free schema, output guard and consent gate | Local identifier configuration, handles for documents and durable encrypted acceptance |
| T6.1, T6.2 | Official SDK stdio server, nine tools, shared instructions, four prompts, seven resources, output schema and error envelopes | Full core catalogue, Inspector CLI and interactive host matrix |
| T6.4, T7.2 | Shared host workflow instructions, four argument-free prompts, manual document checklist and rule-specific source catalogue | Verified cage-map resource, installed Skill parity and interactive host evaluations |
| T10.1 | All six annual IRD examples and all six instalment arithmetic examples match; G8/G9 arithmetic regression checks | G7 and independent source verification of remaining non-IRD cases; practitioner review |
| T10.2, T10.4 | Band boundaries, monotonicity, consent/privacy regressions and real stdio test | Inspector CLI, full properties and agent behaviour evaluation |

No full backlog task above is marked complete when its original acceptance criteria remain unmet.

## Evidence correction

Primary IRD guide, Annexure 7, printed page 37 explicitly lists a lower first band and a capped balance for qualifying foreign-source income. The research note saying the low-income treatment lacks an IRD primary source is therefore incomplete. This does not establish how local and foreign buckets share that band in mixed-income cases. The current preview implements the requirements local-first stacked interpretation and a flat-cap comparison. Mixed-income allocation and shared-band stacking remain unreviewed assumptions.

Source: https://www.ird.gov.lk/en/Downloads/IT_Individuals_Doc/Asmt_IIT_004_2025_2026_E.pdf

## Deliberate first-slice limits

- Annual returns only for YA 2025/26; separate instalment planning only for YA 2026/27. No copied annual rules.
- Local employment, local user-computed business net profit, interest and gross investment rent; supported local deductions and final-WHT resident-company dividends; qualifying foreign salary/services and eligible single-source, single-country foreign income tax credit. Unimplemented scenarios still block calculation.
- Credits are user-confirmed aggregates, not reconciled evidence. Potential overpayment is not a validated refund claim.
- Tax fractions accumulate exactly; each tax bucket is rounded to cents, half up, then summed. Do not present this as verified RAMIS whole-rupee rounding.
- In-memory state only. Consent is re-required after restart, wipe or new session; no cleartext session storage exists.
- No Schedule 7, worksheet, payment output, document parsing, FX, encrypted draft, bundled Skill, npm release or signed extension yet.
- SDK and transitive dependencies are pinned in package-lock.json with integrity hashes, captured from successful GitHub CI. CI uses npm ci. Type checking and the foundation tests passed on Node 22 and 24; the expanded milestone adds source fixtures, deduction boundaries and a full stdio G5 workflow.
- Scope and intake mutations use accurate mutation annotations, despite the research suggesting every tool be read-only. No tool alters external services.

## Local-reliefs milestone

- Added rent relief; personal, then solar relief; Government and supported Samurdhi contributions; approved cash charity deductions where the guide's cap readings agree.
- Added unused solar balance and eligible Government-donation carry-forward outputs. No carry-forward entitlement is asserted for charity or Samurdhi excess.
- Final-withholding resident-company dividends are informational, with rate reconciliation, and never contribute to assessable income or advance credits.
- Expanded the fact schema without zero defaults; deductions must be explicitly confirmed. Disclaimer version increased because supported scope changed.
- Source-backed G4 and G5 fixtures reproduce the published taxable income, tax and balance. G5's opening solar balance follows the worked illustration; its prior deduction is inferred and recorded. G4's impossible April date is not used.
- Added known-issues and scenario resources. `CHARITY_CAP_REVIEW` blocks disagreement between literal cap readings; the formula is documented in its trace and a written clarification remains required.
- New rules are version 2025.26.2 and remain unreviewed. The original requirements and backlog are unchanged.

## Qualifying foreign-income milestone

- Added explicit manual LKR foreign employment and net service facts, eligibility/remittance/conversion confirmations and eligible foreign income tax paid on that same income in one country. No FX rates or receipt dates are invented.
- Foreign eligibility failures, tax without foreign income, unconfirmed credit eligibility and multi-country allocation refuse computation. Unsupported foreign income must never be relabelled as local.
- The requirements local-first deduction policy is explicit and `assumed`; shared-band stacking is also `assumed`. Low-local-income results show a flat-cap comparison and review flags, not a claim of optimal allocation.
- SC-07 excess-credit and SC-08 interpretation flags in computation are derived from actual amounts. Triage scope hints cannot suppress them.
- Foreign tax credit is limited to both the foreign bucket's computed tax and the section 81 average-rate ceiling, with a single-source guard, and recalculated for each interpretation; excess cannot become a refund or an asserted carry-forward.
- Added G2, G3 and G6 fixtures. G2 records the source-table ambiguity and the credit necessary to reconcile its published balance. Eligibility facts absent from the published narrative are fixture assumptions, not facts to assume for users.
- Rule version 2025.26.3 and disclaimer version 2026-10-19.3. All rules remain unreviewed. Original requirements and backlog are unchanged. Type checking and all 36 tests passed on Node 22 and 24, including the expanded stdio journey.

## Statutory correction to the credit summary

The research summary described only an attributable-foreign-tax cap. IRD's consolidated Act, sections 80-81, also specifies separate source calculations and an average-rate ceiling. This milestone therefore accepts a foreign credit only for one confirmed source in one country, blocks pooled employment/business claims, and enforces the lesser of paid tax, foreign-bucket tax and the average-rate ceiling. Eligibility confirmation includes statutory payment timing. Full source allocation remains future work.

Source: https://www.ird.gov.lk/si/publications/Acts_Income%20Tax_2017/IRA_Cons_Act_-_2025_Changes.pdf (sections 80 and 81). The full PDF retrieval timed out; the cited clauses were available from the official source's indexed text. Full-text and amendment review remain required for practitioner sign-off.

## Next implementation work

1. Independently validate instalment gross-tax bases and payment rounding, then validate installed hosts and Inspector CLI behaviour against the protocol regression suite.
2. Add remaining primary-source golden fixtures; resolve the low-income charity-cap ambiguity before broadening donation support.
3. Obtain professional review of foreign qualification, deduction allocation, stacking, FTC eligibility and low-local-income interpretations; extend per-country/per-source credit allocation only with appropriate evidence.
4. Verify filing-obligation law from primary sources before exposing a no-return-required decision.
5. Obtain IRD Schedule 7 verifier/template and validate cage map and rounding.
6. Add export verification checklist, then worksheet/payment summaries after all P0 golden cases pass.
7. Package npm and signed desktop extension only after release gates pass.

Practitioner review, unresolved allocation questions and verifier samples need human evidence. They do not block this foundation work, but they block claiming a filing-ready release. No message has been sent to IRD or an external contributor.

## Instalment milestone

- Verified the complete primary IRD SEC/2026/E/06 re-revised circular dated 12 August 2026, including highlighted SET revisions and the 30 November attachment deadline. The requirements linked the superseded 6 August revision; the original research is preserved. Source digest and page locators are recorded separately.
- Added a stateless, consent-gated YA 2026/27 planner. Method eligibility is explicitly confirmed; A is independently prepared, not computed by the annual YA 2025/26 engine. Actual earlier instalments and deducted/expected withholding are separated and reconciled before computing `(A-C)/B`.
- Added method, SET-to-return revision and timely-notice guards, dated payment/credit-schedule/attachment requirements, cited traces and correct planner-year success/error metadata. Future payment amounts are never presumed.
- G10 covers all six published arithmetic cases; corporate cases use the arithmetic helper only, while resident-individual scope remains enforced. Mr X and Mrs P run through the full planner. No automatic employment exemption is inferred from a zero payable amount.
- Cent ceiling remains an explicitly assumed preview policy. Foreign-credit instalment bases, Method 3, underlying loss/exemption calculations, professional sign-off and payment processing remain unsupported. This is partial T2.8 delivery, not a filing-ready P0 release.
- Disclaimer version is 2026-10-19.4; instalment rule version is 2026.27.1.

Validation: all 44 tests, including real SDK stdio interactions, and TypeScript checking pass in GitHub CI on Node 22 and 24. Corporate instalment fixtures establish arithmetic only, not corporate tax eligibility or rate correctness.

## Host workflow and contract milestone

- Added four static, argument-free MCP prompts and shared instructions. Retrieval never accepts consent or creates a session; prompts reuse guardrails and do not carry numeric tax rates. A filing-obligation request explicitly receives an unavailable-feature explanation, not a remembered tax threshold decision.
- Added a manual evidence checklist and rule-specific source catalogue. No ingestion, identifier collection, filing output or cage mapping is introduced.
- Expanded stdio coverage to current discovery with per-request metadata as well as legacy initialisation, including prompt validation, source access and consent-gated calculation journeys.
- Added an SDK-generated public contract snapshot and SHA-256 check covering tools, schemas, annotations, resources, prompts and shared instructions. PR CI rejects a changed contract without a package version change. Updates remain explicit and reviewable.
- SDK identity derives from the package version to avoid drift. Package preview version advances to 2026.25.0-preview.5; annual rules, instalment rules and consent version remain unchanged.
- This delivers host guidance and contract regression coverage, not installed-host certification or practitioner review. Agent Skill packaging, Inspector CLI, agent behaviour evals and the verified cage-map resource remain pending.

Host milestone validation: TypeScript checking and all 48 tests pass, including both stdio protocol journeys. The generated contract candidate is identical on Node 22 and 24; its reviewed snapshot is now committed and checked in CI.

## Dependency-aware interview milestone

- Implemented T2.2 intake dependencies and a published writable fact dictionary. Readiness nodes report complete, incomplete or placeholder with their active dependencies. No partial tax amounts are emitted or implied.
- Monetary facts, including all three foreign amounts and every deduction, still require explicit confirmation. Foreign salary, service and credit amounts determine the required eligibility booleans. Confirmed zero foreign amounts skip seven irrelevant flags.
- Neutral booleans for proven-inapplicable branches are materialised only for the validated computation input and never stored. Edits reactivate missing eligibility questions; actual user-confirmed answers remain intact.
- Known scope exclusions, unsupported claims and foreign eligibility failures short-circuit intake and provide fixed blocking guidance. Missing scope answers remain unknown; no additional facts are requested after a known block. Financial validations still run in the unchanged annual calculation pipeline.
- Added modern SDK coverage for pruned intake and reactivation, and regression checks for zero handling, early refusals, privacy, consent, state reset and dictionary/schema parity. All prior golden computations remain unchanged.
- Package version is 2026.25.0-preview.6; annual and instalment rule values and consent version are unchanged. This is an intake milestone, not complete partial evaluation of every financial node or a filing-ready release.
