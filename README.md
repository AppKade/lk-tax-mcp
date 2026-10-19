# lk-tax-mcp

Local Sri Lankan individual income tax assistance for MCP hosts. Tax arithmetic belongs to deterministic code; the assistant asks questions and explains cited results.

**Development preview. Not IRD-approved. Not tax advice. Not ready for filing.**

This repository is implementing the [requirements](Sri%20Lanka%20tax%20plugin%20requirements.md) and [backlog](Sri%20Lanka%20tax%20plugin%20backlog.csv) in stages. The current implementation is the first foundation slice, not the complete P0 release.

## Available now

- TypeScript stdio MCP server using the official SDK.
- Versioned consent, memory-only sessions, explicit fact entry and missing-fact questions.
- Deterministic SC-01 through SC-09 scope checks; computation rechecks current scope every time.
- YA 2025/26 local employment, user-supplied local business **net profit**, and interest estimate with personal relief, progressive bands and manually confirmed APIT/AIT/WHT/instalment credits.
- Decimal strings and bigint arithmetic, cited traces, text and structured tool results, identifier output checks.
- One primary-source golden case verified: IRD Example 1, balance **LKR 11,200.00**. The remaining release golden cases are pending.

Foreign income, rent, dividends, additional reliefs, qualifying payments, foreign credits, filing-obligation triage, instalment planning, ingestion, persistence and filing outputs are **not implemented**. Mark `income.other_income_or_claims` true if any unsupported income or claim exists; computation will refuse. Do not enter such income under a local category.

## Run locally

Node.js 22.18 or newer is required. This private development package is not published to npm.

```sh
npm install --ignore-scripts
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
5. Call `lk_compute_return` for the supported local-income slice. Display `display_summary` verbatim; never redo arithmetic in the model. Use `lk_explain` for a returned line.
6. `lk_session` with `action: "wipe"` clears all facts and consent. Starting again also clears the prior session.

No names, NIC, TIN, employer names, account numbers, documents or credentials are accepted. There are no arbitrary-text fact fields. Tool amounts and user messages still reach the host and possibly its AI provider. Data lives only in this server process; restarting loses it. Other host tools can access the same conversation. See [SECURITY.md](SECURITY.md).

Rule evidence is available at `lktax://rules/2025-26`. A `confirmed` source status means the value was checked against a primary source; it does not mean practitioner approval. All rules remain `unreviewed` and all computations are estimates with `filing_ready: false`.

## Contributing

See [implementation progress and release blockers](docs/implementation-status.md). Contributions must preserve exact arithmetic, consent gates, explicit missing facts and identifier minimisation. Never use real taxpayer documents in fixtures. Rule changes require source locators and regression tests. The original research remains preserved; corrections are recorded separately.
