# lk-tax-mcp

Local Sri Lankan individual income tax assistance for MCP hosts. Tax arithmetic belongs to deterministic code; the assistant asks questions and explains cited results.

**Development preview. Not IRD-approved. Not tax advice. Not ready for filing.**

This repository is implementing the [requirements](Sri%20Lanka%20tax%20plugin%20requirements.md) and [backlog](Sri%20Lanka%20tax%20plugin%20backlog.csv) in stages. The current implementation is the foundation, local-reliefs, qualifying foreign-income and instalment milestones, not the complete P0 release.

## Available now

- TypeScript stdio MCP server using the official SDK, with legacy handshake and modern discovery regression tests.
- Four guided MCP prompts, shared host instructions, a manual document checklist and rule-specific source catalogue.
- Versioned public interface snapshot and SHA-256 check for tool schemas, descriptions, annotations, prompts and resources.
- Versioned consent, memory-only sessions, explicit fact entry and dependency-aware interview progress. Confirmed monetary zeros prune irrelevant foreign eligibility questions; known exclusions stop intake early.
- Deterministic SC-01 through SC-09 scope checks; computation rechecks current scope every time.
- YA 2025/26 local employment, user-supplied local business **net profit**, interest and gross investment rent estimates with personal, rent and solar relief, eligible donations, progressive bands and manually confirmed APIT/AIT/WHT/instalment credits. Final-WHT resident-company dividends are informational and excluded from both assessable income and advance credits.
- YA 2026/27 quarterly instalment estimates under Methods 1 and 2(i)-(iv), using a confirmed gross-tax basis prepared externally, with payment dates and administrative deadlines from the 12 August 2026 re-revised circular.
- Source-verified YA 2025/26 cage references and a consent-gated return review with consistency checks and explicit manual review gaps.
- Pre-export verification checklist and a text-only, cage-mapped Markdown worksheet. The worksheet is refused until the user explicitly acknowledges the current checklist; any fact change requires a new acknowledgement. No file is written.
- Decimal strings and bigint arithmetic, cited traces, text and structured tool results, identifier output checks.
- All six IRD worked-example computations match their published balances exactly. Fixture notes record aggregation, eligibility assumptions, source-table ambiguities and inferred opening solar balances. Other release cases and practitioner sign-off remain pending.
- Confirmed qualifying foreign salary and net foreign services in manually converted LKR, with an eligible single-source, single-country foreign income tax credit capped at tax attributable to that income.

Non-qualifying foreign income, multi-country foreign credits, other dividends, rent expense deductions, loan-funded solar claims, film/cinema deductions, legacy qualifying-payment balances, filing-obligation triage, general ingestion layouts, complete filing outputs and submission are **not implemented**. Optional local evidence and encrypted drafts are available as described below. Mark `income.other_income_or_claims` true if any unsupported income or claim exists; computation will refuse. Do not enter such income under a local category.

## Run locally

Node.js 22.18 or newer is required. This private development package is not published to npm.

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run contract:check
npm run build
npm start
```

Example local MCP host configuration, replacing the path with your checkout:

```json
{
  "mcpServers": {
    "lk-tax": {
      "command": "node",
      "args": ["/absolute/path/lk-tax-mcp/dist/cli.js"]
    }
  }
}
```

The server uses stdio only. Host compatibility beyond automated protocol tests must be verified before release. No web server, API key, RAMIS login or database is needed.

## Workflow

1. `lk_session` with `action: "start"` and `ya: "2025/26"`.
2. Show `lk_get_disclaimer` verbatim, ask the user to agree, then call `lk_accept_disclaimer` with its version and `user_confirmed: true`.
3. Use `lk_next_questions` and `lk_set_facts` to collect only missing scope, income, foreign and deduction facts. Progress includes plain-language `questions` and a detached `confirmed_facts` snapshot for reviewing existing entries without resetting. Every requested scope flag needs an explicit answer; three legacy calculation-dependent hints are optional and never requested. A confirmed exclusion stops intake. Amounts are nonnegative LKR decimal strings, never JSON numbers. Ask the user to confirm zeros, the correct year, gross versus net income, and exclusion of duplicate or superseded evidence.
4. Call `lk_check_scope`. Stop for out-of-scope cases. Partial status does not guarantee implementation support.
5. Confirm each `deductions` fact, including zeros, then call `lk_compute_return` for the supported local and qualifying foreign-income preview. Display `display_summary` verbatim; never redo arithmetic in the model. Use `lk_explain` for a returned line and `lk_review_return` to inspect mapped preview cages and unresolved review gaps.
6. For a manual-entry worksheet, call `lk_get_checklist`, show each statement verbatim, and call `lk_acknowledge_checklist` only with statements the user explicitly confirms. The checklist includes evidence reconciliation; suspicious credits add a separate adviser-reconciliation acknowledgement. Then `lk_generate_worksheet` returns Markdown text to present verbatim. Unresolved cages stay unset. Reconfirming identical normalized facts preserves acknowledgement; substantive edits, re-consent, restart and wipe invalidate it.
7. `lk_session` with `action: "wipe"` clears all facts and consent. Starting again also clears the prior session.

No names, NIC, TIN, employer names, account numbers, raw documents, keys or credentials are accepted in chat or tax facts. There are no arbitrary-text fact fields. Optional local document review reads selected files under a configured root and returns structured candidates only; encrypted local drafts require separate configuration and explicit confirmation. Both features are disabled by default. User messages and tool amounts still reach the host and possibly its provider. Memory wipe does not delete saved ciphertext. See [local workflow and setup](docs/local-workflow.md) and [SECURITY.md](SECURITY.md).

Rule evidence is available at `lktax://rules/2025-26`; exclusions and unresolved issues are at `lktax://supported-scenarios` and `lktax://known-issues`. A `confirmed` source status means the value was checked against a primary source; it does not mean practitioner approval. All rules remain `unreviewed` and all computations are estimates with `filing_ready: false`.

## Agent Skill

`skills/lk-tax/SKILL.md` is an Agent Skill for hosts that load skills. It mirrors the server's consent, interview, compute, review and worksheet workflow and carries no tax rates or amounts. A test checks that it names only published tools and resources, mentions every tool, stays under 500 lines and contains no rates. Installing it as a bundled plugin or extension is not done yet; copy the folder into a host's skills directory to try it. The server remains fully usable without it.

## Guided host workflows

Hosts with MCP prompt support can select `file_my_return`, `do_i_need_to_file`, `plan_my_instalments` or `explain_my_tax`. Prompts share consent, privacy and scope instructions and accept no taxpayer arguments. The filing prompt prepares only a supported development estimate. Filing-obligation decisions remain unavailable, including automatic exemptions for zero payable.

Read `lktax://checklist/documents` for the manual evidence checklist and `lktax://sources/2025-26` for rule-specific source evidence. Keep evidence locally and enter only confirmed aggregate facts. Raw document uploads, filing exports and RAMIS submission remain unavailable; optional local-file evidence review is separately configured.

Read `lktax://cagemap/2025-26` for the supported cage map, source hashes and unresolved bindings. See [MCP contract verification](docs/mcp-contract.md) for the public interface hash, version-bump policy and protocol coverage. Interactive host testing, Inspector CLI and a separately installable Agent Skill remain pending.

## Dependency-aware interview

`lk_next_questions` now returns the active `stage`, next missing writable facts and a graph of derived intake-readiness states. `placeholder` means foreign selector amounts are still unknown; it never carries a provisional tax figure. `complete` intake means the required answers are present, while computation still checks financial validity. `calculation_performed` and `filing_ready` remain false on progress responses.

Confirm all three foreign monetary amounts. When all are zero, seven foreign eligibility booleans become irrelevant and are skipped. Positive salary, services and foreign tax each activate their own required confirmations. Changing an amount re-evaluates those dependencies. Neutral values for skipped booleans are used only in the computation input, never saved as user answers. Explicit user answers are retained and require genuine corrections if new facts contradict them.

An already confirmed scope exclusion or unsupported condition returns `out_of_scope` or `blocked`, no further questions and `blocking_guidance`. Stop gathering facts, show the guidance and seek professional review. Never remove real income or claims to bypass a block. See `lktax://facts/2025-26` and [interview policy](docs/interview-policy.md). This milestone covers intake dependencies; partial monetary-node evaluation remains future work.

## Return review

`lk_review_return` recomputes current confirmed annual facts through the same validation path as `lk_compute_return`. It maps supported preview amounts to cited main-return and schedule cages, checks transfers and totals, and lists unresolved review gaps. Every engine figure has an explicit mapped, reference-only or working-only disposition.

Null cage amounts stay unset. Reference amounts are not filing values: potential overpayment is not an approved refund, and an unused solar balance is not an independently verified historical carry-forward. The tool does not infer primary/secondary APIT or Table 08 allocations, detailed advance-credit/payment rows, exempt disclosures or gross foreign remittances from aggregates.

Final dividend WHT already deducted is shown at Schedule 6A cage 607. It is never added to unpaid final withholding, total tax or advance credits. All interpretation flags and alternatives remain visible; mapping does not confirm a preferred interpretation. Format hints require portal confirmation and do not establish a filing obligation.

This is an in-memory development review, with no files, identifiers or filing export. The separate checklist and worksheet tools below give a manual-entry aid, not an export. See [cage evidence and review limits](docs/return-review.md).

## Local reliefs and donations

All deduction amounts must be eligible and confirmed by the user. The tool does not verify institutions or documents:

- `solar_available`: unused eligible expenditure after prior relief claims, for panels on own premises connected to the grid. Do not enter total historical expenditure again. Loan-funded claims remain unsupported.
- `approved_charity_cash`: cash donations to approved charitable institutions, subject to the annual and income caps. Differing literal readings of the guide's income limits return `CHARITY_CAP_REVIEW`; do not remove a genuine claim to bypass it.
- `government_donations` and `government_donations_brought_forward`: eligible current donations and independently verified eligible carry-forward. The latter does not cover legacy qualifying-payment balances.
- `samurdhi_shop_contributions`: only contributions recommended and confirmed by the relevant department. Unused charity and Samurdhi amounts are reported without asserting carry-forward rights.

Rent is gross local investment rent without an expense deduction claim. Enter the gross and actual deducted final WHT for supported resident-company dividends, and keep that WHT out of advance credits. A mismatch stops computation for review. The tool cannot detect a dividend amount incorrectly included in an aggregate credit, so those totals must be reconciled externally.

Rent/dividend and deduction amounts remain explicit; missing monetary fields never default to zero. The disclaimer version is updated to reflect the expanded scope.

## Qualifying foreign income and credits

Enter foreign amounts in `foreign`, never again in local `income` totals. Every monetary amount requires explicit confirmation, including zeros. Use `lk_next_questions` for currently relevant boolean questions; do not invent answers for booleans marked `not_applicable_facts`:

- `employment_lkr` and `service_net_lkr`: annual qualifying foreign salary and user-computed net service profit already converted to LKR. FX lookup and per-receipt capture are not implemented.
- Confirm receipt in foreign currency, remittance through a licensed bank, and LKR conversion. Foreign salary additionally needs confirmation of the foreign employer; service income needs confirmation of use outside Sri Lanka. Unconfirmed eligibility refuses calculation instead of assuming a concession or omitting the income.
- `foreign_tax_paid` is eligible foreign **income tax actually paid on the same qualifying income from one confirmed source in one country**. Confirm eligibility, statutory payment timing and single-source status separately. Credit claims pooling salary and service sources are refused. Do not include foreign VAT or Sri Lankan APIT here. Keep foreign tax out of Sri Lankan advance-credit fields.

Foreign credit cannot exceed either the calculated Sri Lankan tax on that foreign bucket or the statutory average-rate ceiling (pre-credit tax divided by taxable income, applied to assessable foreign income). The latter is floored to cents to avoid exceeding the exact limit. Uncredited foreign tax is reported without claiming a refund or carry-forward. Multi-country credit allocation and non-qualifying foreign income remain unsupported.

The preview applies rent relief to local rent, then other deductions to local income first. It fills progressive bands with local taxable income and caps each foreign slice. This allocation and shared-band interpretation remain labelled assumptions, not a tax-minimisation guarantee. A low-local-income result shows `INTERP_15PCT`, derived SC-08 and a flat-cap comparison with independently recalculated foreign credits, balances and potential overpayment. The flat comparison is not presented as equally supported by Annexure 7's explicit standalone foreign bands. Mixed low-income allocations also carry `ALLOCATION_REVIEW`.

`lk_check_scope` uses triage answers. Computation derives final foreign-credit and interpretation flags from actual amounts, so manually supplied false scope hints cannot suppress them. The summary includes the assumptions and comparison figures for verbatim display. All results remain unreviewed, `estimate: true` and `filing_ready: false`.

## YA 2026/27 instalment planner

After starting the session and accepting the current disclaimer, call `lk_plan_instalments` with `ya: "2026/27"` and separate current-year scope answers. `basis_source` is now required: `external_gross_tax` keeps the externally prepared basis unverified; `annual_net_balance` is refused. `session_annual_gross_tax` explicitly opts in to matching the supplied gross-tax amount to the current YA 2025/26 preview for Method 1 only. This recomputes annual facts and refuses mismatches, unresolved interpretation flags or input warnings. It never copies an amount automatically or stores current-year planner facts in the annual session. Matching a preview is not evidence or final-return verification. The session's annual profile remains YA 2025/26. Planner success and error results carry YA 2026/27 and rule version `2026.27.1`. Evidence is at `lktax://rules/instalments/2026-27`.

`gross_tax_basis` must be prepared independently under the selected method, before credits. Never enter the net balance payable or assume the previous year's tax rates apply to a new taxpayer. The tool checks explicit eligibility confirmations but does not validate underlying accounts, losses, exemptions or annual rate calculations. Unsupported scope still refuses calculation.

| Method | Required basis and conditions |
|---|---|
| 1 | Prior YA 2025/26 gross tax, with prior taxable income |
| 2(i) | Zero, with no preceding taxable income and no current assessable income expected |
| 2(ii) | Adjusted preceding-year figures for reduced losses or an expired exemption, with no prior taxable income and current assessable income expected |
| 2(iii) | Recalculated preceding-year gross tax reflecting the expected reduction; confirm both lower assessable and taxable income |
| 2(iv) | Current-year estimate applying current rules, only in the first year for a newly registered taxpayer |

Methods 2(ii)/(iii) permit a final prior SET only in quarter one if the prior return is not finalised. From quarter two the prior return basis is required. Confirm whether quarter one used SET and that exactly one SET-to-return revision occurred. The tool reports Attachment 1 (Revised) where applicable. A later switch from Method 1 to 2(iii) requires confirmation of timely notice; the notice dates are 31 October, 31 January and 30 April.

`C` combines actual earlier YA 2026/27 instalments and eligible full-year withholding. Enter APIT and AIT/WHT separately as **already deducted** and **expected remaining**. Reconcile these totals without overlap, foreign credits, final dividend WHT or projected future instalments. Recompute each quarter with actual payments. The dated schedule contains no assumed future payment amounts.

Payment dates remain 15 August 2026, 15 November 2026, 15 February 2027 and 15 May 2027. Required Attachments 1/2 are due 30 November 2026 under the latest circular. Credit schedules generally remain due at the relevant month end. Employment exceptions require separate confirmation; zero payable alone does not establish an exemption from credit schedules or filing.

The preview ceilings fractional cents and labels that policy `assumed`; official payment rounding remains unverified. Every amount has a cited trace. The six circular examples are exact arithmetic fixtures, with Mr X and Mrs P also tested through the complete planner. Corporate examples test arithmetic only and do not expand supported scope. Foreign-credit instalment bases and Method 3 requests are unsupported. No payment codes, penalties, interest, submissions or notifications are generated. See [source verification and limitations](docs/instalment-source.md).

## Contributing

User-test follow-up: [intake and evidence review changes](docs/user-validation.md) records what was addressed and the remaining document, draft and filing gaps. Annual estimates expose `input_warnings` for APIT above reported employment, advance withholding above assessable income and credits without reported income. These warnings propagate through summaries, return review and worksheets. They are evidence checks, not legal credit limits, and leave tax arithmetic unchanged.

See [implementation progress and release blockers](docs/implementation-status.md). Contributions must preserve exact arithmetic, consent gates, explicit missing facts and identifier minimisation. Never use real taxpayer documents in fixtures. Rule changes require source locators and regression tests. The original research remains preserved; corrections are recorded separately.

Rule data and version-history checks: `npm run rules:check`. See [rules governance](docs/rules-governance.md) for the archive and PR process.


For the real MCP Inspector CLI gate, install the isolated development tools with `npm ci --ignore-scripts --prefix tools/inspector`, then run `npm run test:inspector` (Node 22.19+). See [validation and compatibility](docs/validation.md) and [remaining source verification](docs/source-verification-next.md). This supplements the raw stdio journeys; installed desktop hosts and model-driven behaviour still require their own evaluations.


The private npm preview now has a compiled `lk-tax-mcp` executable and a restricted tarball inventory. Run `npm run package:check` to build, install and exercise that tarball outside the checkout. See [private preview installation](docs/installation.md). The package remains unpublished; registry provenance, licensing and signed desktop release preparation are separate release work.

Security review: `npm run security:check` checks application runtime capabilities. Private package artifacts include a production CycloneDX SBOM checked against the lockfile and isolated installation. See the [threat model](docs/threat-model.md) for host/dependency boundaries and limitations.

Payment groundwork: `npm run payments:check` validates the [development payment reference](docs/payment-reference.md) and reports remaining blockers. This catalogue is excluded from the installed runtime; no payment summary tool or payable amount is enabled.

## Local document workflow and drafts

`lk_local_capabilities` reports optional configuration without exposing paths. `lk_documents` reads a confirmed relative file under the local document root, proposes whitelisted amounts, and enforces source/year/duplicate/revision review before applying a digest-bound category total. Text PDFs, image-only PDFs, PNG/JPEG and a documented salary CSV are supported; unknown labels and degraded OCR need manual confirmation or correction. Extracted text never becomes instructions or leaves the extractor.

`lk_normalize_amount` proposes canonical copied-money values without changing facts. `lk_draft` uses a private local key file and AES-256-GCM for explicit save/restore/delete slots; restore expiry does not automatically erase ciphertext. Consent and worksheet approval are never restored. `lk_preparation` tracks case-specific external preparation steps without claiming official filing readiness. Setup, limits, examples and the actual document/OCR/restart integration gate are in [docs/local-workflow.md](docs/local-workflow.md).

## First-time use

Once connected, ask: "Help me estimate my tax using my salary and bank records." The assistant checks which features are available, explains the supported period and asks a few ordinary questions at a time. You do not need to write tool commands or understand tax-form codes. Manual entry works without document or draft setup; read the requested totals from your own records and do not share identifiers or credentials.

Imported documents have readable labels and review questions. If a letter was assigned the wrong category, ask to correct that document; unrelated records remain intact. Pending document decisions and totals now appear as the next step rather than a misleading ready state. Unknown amounts remain unknown until confirmed. If saving is not configured, keep the session open and review your entered totals for secure preservation before closing or changing setup.

See the [manual first-time walkthrough](docs/first-time-walkthrough.md) for observed failures, corrections and test limits.

## Employee, freelancer and business-owner journeys

Start with the personal employee, freelancer or sole-trader route. Business income requires externally prepared taxable net profit; unfinished preparation stops the estimate. Company accounts, company tax and partnership returns are unsupported. Owners may separately estimate supported personal salary/dividends. Local extraction does not support business accounts, freelance invoices, foreign-service statements or business payment receipts; use externally reviewed manual aggregates for supported cases. See the [multi-level walkthrough](docs/persona-walkthrough.md) for the tested cases and remaining limits.
