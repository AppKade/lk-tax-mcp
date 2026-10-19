# MCP host workflows and contract verification

The server publishes shared instructions, four argument-free prompts and six resources. This supplies a guided interview to MCP hosts that support prompts without requiring an Agent Skill. Prompt retrieval is static: it cannot start a session, accept consent, write facts or calculate tax. All four prompts reuse the same consent, privacy, scope and deterministic calculation instructions. Prompt arguments reject unexpected fields through the same sanitised validation used for tools.

| Prompt | Behaviour |
|---|---|
| `file_my_return` | Supported annual interview and development estimate; explains that filing and exports are unavailable |
| `do_i_need_to_file` | Explains that filing-obligation triage is unavailable; never applies remembered thresholds or infers an exemption |
| `plan_my_instalments` | Separately confirmed instalment year, method, gross-tax basis, credits and administrative requirements |
| `explain_my_tax` | Current annual line via `lk_explain`, or the returned instalment trace; preserves warnings |

`lktax://checklist/documents` is a manual preparation aid. Evidence stays with the user; ingestion is unavailable. `lktax://sources/2025-26` exposes rule-specific citations, locators, dates and evidence status, including assumed interpretation policies. The existing annual and instalment rule resources, supported scenarios and known issues remain available. A cage-map resource is deferred until primary verification is complete.

## Protocol checks

Automated stdio tests exercise both the legacy `2025-11-25` initialise handshake and `2026-07-28` discovery with per-request metadata. Both complete server-enforced consent and calculation journeys. Discovery tests also verify prompt retrieval, resource availability, sanitised prompt-argument errors and that reading static guidance never accepts consent. This is automated protocol coverage, not certification of Claude Desktop, Cursor, VS Code or local-model behaviour. Interactive host testing and Inspector CLI coverage remain pending.

SDK references checked on 2026-10-19:

- [MCP discovery specification](https://modelcontextprotocol.io/specification/2026-07-28/server/discover).
- [Official TypeScript SDK prompt registration](https://ts.sdk.modelcontextprotocol.io/v2/servers/prompts).

## Public interface snapshot

`test/fixtures/mcp-contract.json` records the actual SDK-advertised tool input/output schemas, descriptions, annotations, resource metadata, prompt metadata and bodies, shared instructions and discovery capabilities. Its SHA-256 hashes recursively sorted JSON object keys while preserving array order. Package version is checked separately against the server identity. This hash detects interface drift; it is not a signature or practitioner approval.

```sh
npm run contract:check
# After an intentional interface change and package/server version bump:
npm run contract:update
npm run contract:version -- <base-commit-sha>
```

The capture process launches a fresh stdio server, reads only static interfaces and never starts a session or submits taxpayer facts. These development scripts may spawn the server and write the public snapshot; they are not runtime tools exposed by the tax server. Snapshot update is an explicit maintainer action. Review the complete diff before committing it, including tool descriptions and prompt bodies.

CI checks the snapshot on Node 22 and 24. Pull-request CI also compares its hash with the base commit and rejects interface changes without a package version change. On failure, CI may upload the actual public candidate for inspection; it never commits or approves it automatically. The first snapshot also requires a version change from the base package. Dependency updates that alter generated JSON schemas require the same review.

No tax-rule review status, disclaimer acceptance or filing readiness is changed by a matching contract hash. Full distribution signing, SBOMs, native host tests, agent behaviour evals and practitioner review remain future work.
