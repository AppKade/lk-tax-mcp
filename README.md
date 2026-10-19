# lk-tax-mcp

Local Sri Lankan individual income tax assistance for MCP hosts. Tax arithmetic belongs to deterministic code; the assistant asks questions and explains cited results.

**Development preview. Not IRD-approved. Not tax advice. Not ready for filing.**

This repository is implementing the [requirements](Sri%20Lanka%20tax%20plugin%20requirements.md) and [backlog](Sri%20Lanka%20tax%20plugin%20backlog.csv) in stages. The current implementation is the foundation, local-reliefs and qualifying foreign-income milestones, not the complete P0 release.

## Available now

- TypeScript stdio MCP server using the official SDK.
- Versioned consent, memory-only sessions, explicit fact entry and missing-fact questions.
- Deterministic SC-01 through SC-09 scope checks; computation rechecks current scope every time.
- YA 2025/26 local employment, user-supplied local business **net profit**, interest and gross investment rent estimates with personal, rent and solar relief, eligible donations, progressive bands and manually confirmed APIT/AIT/WHT/instalment credits. Final-WHT resident-company dividends are informational and excluded from both assessable income and advance credits.
- Decimal strings and bigint arithmetic, cited traces, text and structured tool results, identifier output checks.
- All six IRD worked-example computations match their published balances exactly. Fixture notes record aggregation, eligibility assumptions, source-table ambiguities and inferred opening solar balances. Other release cases and practitioner sign-off remain pending.
- Confirmed qualifying foreign salary and net foreign services in manually converted LKR, with an eligible single-source, single-source, single-country foreign income tax credit capped at tax attributable to that income.

Non-qualifying foreign income, multi-country foreign credits, other dividends, rent expense deductions, loan-funded solar claims, film/cinema deductions, legacy qualifying-payment balances, filing-obligation triage, instalment planning, ingestion, persistence and filing outputs are **not implemented**. Mark `income.other_income_or_claims` true if any unsupported income or claim exists; computation will refuse. Do not enter such income under a local category.

## Run locally

Node.js 22.18 or newer is required. This private development package is not published to npm.

```sh
npm ci --ignore-scripts
npm run check
npm test
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
3. Use `lk_next_questions` and `lk_set_facts` to collect only missing scope, income, foreign and deduction facts. Every scope flag needs an explicit answer. Amounts are nonnegative LKR decimal strings, never JSON numbers. Ask the user to confirm zeros.
4. Call `lk_check_scope`. Stop for out-of-scope cases. Partial status does not guarantee implementation support.
5. Confirm each `deductions` fact, including zeros, then call `lk_compute_return` for the supported local and qualifying foreign-income preview. Display `display_summary` verbatim; never redo arithmetic in the model. Use `lk_explain` for a returned line.
6. `lk_session` with `action: "wipe"` clears all facts and consent. Starting again also clears the prior session.

No names, NIC, TIN, employer names, account numbers, documents or credentials are accepted. There are no arbitrary-text fact fields. Tool amounts and user messages still reach the host and possibly its AI provider. Data lives only in this server process; restarting loses it. Other host tools can access the same conversation. See [SECURITY.md](SECURITY.md).

Rule evidence is available at `lktax://rules/2025-26`; exclusions and unresolved issues are at `lktax://supported-scenarios` and `lktax://known-issues`. A `confirmed` source status means the value was checked against a primary source; it does not mean practitioner approval. All rules remain `unreviewed` and all computations are estimates with `filing_ready: false`.

## Local reliefs and donations

All deduction amounts must be eligible and confirmed by the user. The tool does not verify institutions or documents:

- `solar_available`: unused eligible expenditure after prior relief claims, for panels on own premises connected to the grid. Do not enter total historical expenditure again. Loan-funded claims remain unsupported.
- `approved_charity_cash`: cash donations to approved charitable institutions, subject to the annual and income caps. Differing literal readings of the guide's income limits return `CHARITY_CAP_REVIEW`; do not remove a genuine claim to bypass it.
- `government_donations` and `government_donations_brought_forward`: eligible current donations and independently verified eligible carry-forward. The latter does not cover legacy qualifying-payment balances.
- `samurdhi_shop_contributions`: only contributions recommended and confirmed by the relevant department. Unused charity and Samurdhi amounts are reported without asserting carry-forward rights.

Rent is gross local investment rent without an expense deduction claim. Enter the gross and actual deducted final WHT for supported resident-company dividends, and keep that WHT out of advance credits. A mismatch stops computation for review. The tool cannot detect a dividend amount incorrectly included in an aggregate credit, so those totals must be reconciled externally.

Schema expansion is intentional: earlier sessions now need explicit rent/dividend and deduction facts; missing fields never default to zero. The disclaimer version is updated to reflect the expanded scope.

## Qualifying foreign income and credits

Enter foreign amounts in `foreign`, never again in local `income` totals. Every field is explicit, including zeros and false answers when there is no foreign income:

- `employment_lkr` and `service_net_lkr`: annual qualifying foreign salary and user-computed net service profit already converted to LKR. FX lookup and per-receipt capture are not implemented.
- Confirm receipt in foreign currency, remittance through a licensed bank, and LKR conversion. Foreign salary additionally needs confirmation of the foreign employer; service income needs confirmation of use outside Sri Lanka. Unconfirmed eligibility refuses calculation instead of assuming a concession or omitting the income.
- `foreign_tax_paid` is eligible foreign **income tax actually paid on the same qualifying income from one confirmed source in one country**. Confirm eligibility, statutory payment timing and single-source status separately. Credit claims pooling salary and service sources are refused. Do not include foreign VAT or Sri Lankan APIT here. Keep foreign tax out of Sri Lankan advance-credit fields.

Foreign credit cannot exceed either the calculated Sri Lankan tax on that foreign bucket or the statutory average-rate ceiling (pre-credit tax divided by taxable income, applied to assessable foreign income). The latter is floored to cents to avoid exceeding the exact limit. Uncredited foreign tax is reported without claiming a refund or carry-forward. Multi-country credit allocation and non-qualifying foreign income remain unsupported.

The preview applies rent relief to local rent, then other deductions to local income first. It fills progressive bands with local taxable income and caps each foreign slice. This allocation and shared-band interpretation remain labelled assumptions, not a tax-minimisation guarantee. A low-local-income result shows `INTERP_15PCT`, derived SC-08 and a flat-cap comparison with independently recalculated foreign credits, balances and potential overpayment. The flat comparison is not presented as equally supported by Annexure 7's explicit standalone foreign bands. Mixed low-income allocations also carry `ALLOCATION_REVIEW`.

`lk_check_scope` uses triage answers. Computation derives final foreign-credit and interpretation flags from actual amounts, so manually supplied false scope hints cannot suppress them. The summary includes the assumptions and comparison figures for verbatim display. All results remain unreviewed, `estimate: true` and `filing_ready: false`.

## Contributing

See [implementation progress and release blockers](docs/implementation-status.md). Contributions must preserve exact arithmetic, consent gates, explicit missing facts and identifier minimisation. Never use real taxpayer documents in fixtures. Rule changes require source locators and regression tests. The original research remains preserved; corrections are recorded separately.
