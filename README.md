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
- Decimal strings and bigint arithmetic, cited traces, text and structured tool results, identifier output checks.
- All six IRD worked-example computations match their published balances exactly. Fixture notes record aggregation, eligibility assumptions, source-table ambiguities and inferred opening solar balances. Other release cases and practitioner sign-off remain pending.
- Confirmed qualifying foreign salary and net foreign services in manually converted LKR, with an eligible single-source, single-country foreign income tax credit capped at tax attributable to that income.

Non-qualifying foreign income, multi-country foreign credits, other dividends, rent expense deductions, loan-funded solar claims, film/cinema deductions, legacy qualifying-payment balances, filing-obligation triage, ingestion, persistence and filing outputs are **not implemented**. Mark `income.other_income_or_claims` true if any unsupported income or claim exists; computation will refuse. Do not enter such income under a local category.

## Run locally

Node.js 22.18 or newer is required. This private development package is not published to npm.

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run contract:check
npm start
```

Example local MCP host configuration, replacing the path with your checkout:

```json
{
  "mcpServers": {
    "lk-tax": {
      "command": "node",
      "args": ["/absolute/path/lk-tax-mcp/src/cli.ts"]
    }
  }
}
```

The server uses stdio only. Host compatibility beyond automated protocol tests must be verified before release. No web server, API key, RAMIS login or database is needed.

## Workflow

1. `lk_session` with `action: "start"` and `ya: "2025/26"`.
2. Show `lk_get_disclaimer` verbatim, ask the user to agree, then call `lk_accept_disclaimer` with its version and `user_confirmed: true`.
3. Use `lk_next_questions` and `lk_set_facts` to collect only missing scope, income, foreign and deduction facts. Every requested scope flag needs an explicit answer; a confirmed exclusion stops further intake. Amounts are nonnegative LKR decimal strings, never JSON numbers. Ask the user to confirm zeros.
4. Call `lk_check_scope`. Stop for out-of-scope cases. Partial status does not guarantee implementation support.
5. Confirm each `deductions` fact, including zeros, then call `lk_compute_return` for the supported local and qualifying foreign-income preview. Display `display_summary` verbatim; never redo arithmetic in the model. Use `lk_explain` for a returned line.
6. `lk_session` with `action: "wipe"` clears all facts and consent. Starting again also clears the prior session.

No names, NIC, TIN, employer names, account numbers, documents or credentials are accepted. There are no arbitrary-text fact fields. Tool amounts and user messages still reach the host and possibly its AI provider. Data lives only in this server process; restarting loses it. Other host tools can access the same conversation. See [SECURITY.md](SECURITY.md).

Rule evidence is available at `lktax://rules/2025-26`; exclusions and unresolved issues are at `lktax://supported-scenarios` and `lktax://known-issues`. A `confirmed` source status means the value was checked against a primary source; it does not mean practitioner approval. All rules remain `unreviewed` and all computations are estimates with `filing_ready: false`.

## Guided host workflows

Hosts with MCP prompt support can select `file_my_return`, `do_i_need_to_file`, `plan_my_instalments` or `explain_my_tax`. Prompts share consent, privacy and scope instructions and accept no taxpayer arguments. The filing prompt prepares only a supported development estimate. Filing-obligation decisions remain unavailable, including automatic exemptions for zero payable.

Read `lktax://checklist/documents` for the manual evidence checklist and `lktax://sources/2025-26` for rule-specific source evidence. Keep evidence locally and enter only confirmed aggregate facts. Document uploads, filing exports and RAMIS submission remain unavailable.

See [MCP contract verification](docs/mcp-contract.md) for the public interface hash, version-bump policy and protocol coverage. Interactive host testing, Inspector CLI and a separately installable Agent Skill remain pending.

## Dependency-aware interview

`lk_next_questions` now returns the active `stage`, next missing writable facts and a graph of derived intake-readiness states. `placeholder` means foreign selector amounts are still unknown; it never carries a provisional tax figure. `complete` intake means the required answers are present, while computation still checks financial validity. `calculation_performed` and `filing_ready` remain false on progress responses.

Confirm all three foreign monetary amounts. When all are zero, seven foreign eligibility booleans become irrelevant and are skipped. Positive salary, services and foreign tax each activate their own required confirmations. Changing an amount re-evaluates those dependencies. Neutral values for skipped booleans are used only in the computation input, never saved as user answers. Explicit user answers are retained and require genuine corrections if new facts contradict them.

An already confirmed scope exclusion or unsupported condition returns `out_of_scope` or `blocked`, no further questions and `blocking_guidance`. Stop gathering facts, show the guidance and seek professional review. Never remove real income or claims to bypass a block. See `lktax://facts/2025-26` and [interview policy](docs/interview-policy.md). This milestone covers intake dependencies; partial monetary-node evaluation remains future work.

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

After starting the session and accepting the current disclaimer, call `lk_plan_instalments` with `ya: "2026/27"` and separate current-year scope answers. This stateless tool does not read or update annual return facts. The session's annual return profile remains YA 2025/26. Planner success and error results carry YA 2026/27 and rule version `2026.27.1`. Evidence is at `lktax://rules/instalments/2026-27`.

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

See [implementation progress and release blockers](docs/implementation-status.md). Contributions must preserve exact arithmetic, consent gates, explicit missing facts and identifier minimisation. Never use real taxpayer documents in fixtures. Rule changes require source locators and regression tests. The original research remains preserved; corrections are recorded separately.
