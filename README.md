# lk-tax-mcp

Local Sri Lankan individual income tax assistance for MCP hosts. Tax arithmetic belongs to deterministic code; the assistant asks questions and explains cited results.

**Development preview. Not IRD-approved. Not tax advice. Not ready for filing.**

This repository is implementing the [requirements](Sri%20Lanka%20tax%20plugin%20requirements.md) and [backlog](Sri%20Lanka%20tax%20plugin%20backlog.csv) in stages. The current implementation is the foundation and local-reliefs milestones, not the complete P0 release.

## Available now

- TypeScript stdio MCP server using the official SDK.
- Versioned consent, memory-only sessions, explicit fact entry and missing-fact questions.
- Deterministic SC-01 through SC-09 scope checks; computation rechecks current scope every time.
- YA 2025/26 local employment, user-supplied local business **net profit**, interest and gross investment rent estimates with personal, rent and solar relief, eligible donations, progressive bands and manually confirmed APIT/AIT/WHT/instalment credits. Final-WHT resident-company dividends are informational and excluded from both assessable income and advance credits.
- Decimal strings and bigint arithmetic, cited traces, text and structured tool results, identifier output checks.
- Three primary-source golden cases verified: IRD Examples 1, 4 and 5, with exact balances **LKR 11,200.00**, **LKR 5,910,084.00** and **LKR 544,600.00**. Fixture notes record aggregation and inferred opening solar balances. Remaining release cases are pending.

Foreign income/credits, other dividends, rent expense deductions, loan-funded solar claims, film/cinema deductions, legacy qualifying-payment balances, filing-obligation triage, instalment planning, ingestion, persistence and filing outputs are **not implemented**. Mark `income.other_income_or_claims` true if any unsupported income or claim exists; computation will refuse. Do not enter such income under a local category.

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
3. Use `lk_next_questions` and `lk_set_facts` to collect only missing facts. Every scope flag needs an explicit answer. Amounts are nonnegative LKR decimal strings, never JSON numbers. Ask the user to confirm zeros.
4. Call `lk_check_scope`. Stop for out-of-scope cases. Partial status does not guarantee implementation support.
5. Confirm each `deductions` fact, including zeros, then call `lk_compute_return` for the supported local-income slice. Display `display_summary` verbatim; never redo arithmetic in the model. Use `lk_explain` for a returned line.
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

## Contributing

See [implementation progress and release blockers](docs/implementation-status.md). Contributions must preserve exact arithmetic, consent gates, explicit missing facts and identifier minimisation. Never use real taxpayer documents in fixtures. Rule changes require source locators and regression tests. The original research remains preserved; corrections are recorded separately.
