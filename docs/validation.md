# Validation and compatibility

The project has deterministic computation tests, raw stdio protocol tests and an independent MCP Inspector CLI gate. This is automated compatibility evidence, not certification of installed desktop clients or model behaviour.

## Run the checks

`npm run verify` combines standard checks with isolated package validation. `npm run verify:full` adds installed PDF/OCR/encrypted-draft journeys in both protocol modes and the pinned Inspector. Install the native tools and Inspector dependencies first; see [release readiness](release-readiness.md). A fresh success report identifies the selected coverage without certifying legal or model behaviour.


```sh
npm ci --ignore-scripts
npm run check
npm test
npm run rules:check
npm run contract:check
npm ci --ignore-scripts --prefix tools/inspector
npm run test:inspector
```

The Inspector is pinned to **2.11.0** in a separate private development package with its own integrity lockfile. Its dependencies are not added to the tax server's runtime package. Inspector requires Node 22.19 or later; the server's own minimum stays 22.18. CI uses current Node 22 and 24 releases. No browser UI, HTTP tax endpoint or remote server is started by this gate.

`scripts/check-inspector.ts` launches the real Inspector CLI and the actual server over stdio. It runs 11 probes per protocol era: initialization, strict tool-schema discovery, resources/prompts discovery, all four prompt bodies, a scenario resource, the disclaimer and a refused worksheet request. Tool descriptions, annotations and input/output schemas match the reviewed contract exactly and share its canonical hashing algorithm. The independent full contract gate remains in place.

The probes check the CLI's process exit code as well as its JSON result. A fresh worksheet request must exit with tool-error code 5 and return `SESSION_REQUIRED`, rather than merely fail to connect. Every CLI invocation starts a fresh in-memory server; a disclaimer call in another invocation cannot establish consent. Inspector's client unwraps modern `resultType`, and legacy prompt responses also omit modern server metadata. The gate compares the era-appropriate envelope while retaining exact prompt content. Raw wire tests independently check modern discovery and metadata.

Reference behaviour: [Inspector CLI](https://github.com/modelcontextprotocol/inspector/blob/main/clients/cli/README.md) and [server configuration](https://github.com/modelcontextprotocol/inspector/blob/main/docs/mcp-server-configuration.md), inspected 2026-10-20. The pin, rather than moving documentation, defines the tested executable.

| Client path | Protocol | Coverage |
|---|---|---|
| Raw persistent stdio host | 2025-11-25 | Full estimate, review, checklist, worksheet and refusal journeys |
| Raw persistent stdio host | 2026-07-28 | Discovery, per-request metadata and full guarded journeys |
| Inspector 2.11.0 CLI | legacy | Schema/content parity and safe single-call probes |
| Inspector 2.11.0 CLI | modern | Schema/content parity and safe single-call probes |
| Claude Desktop, Cursor, VS Code and local-model hosts | Installed clients | Manual testing pending |

All four automated paths run on Linux CI under Node 22 and 24. This does not establish Windows/macOS host installation support.

## Adversarial host regressions

`test/host-guardrails.test.ts` runs six scenarios in each protocol era. It verifies that static discovery and prompts never create consent, missing money never becomes zero, edits activate foreign eligibility questions, stale/partial/declined checklist confirmations cannot produce worksheets, unsupported circumstances block every derived output, invalid injection-like values cannot mutate valid facts or be echoed, and separate processes/new sessions cannot inherit state.

These are scripted client regressions. No LLM is invoked or graded. The server can check an explicit confirmation flag, but it cannot prove that a host actually obtained the user's agreement. Model-driven evaluation of tool order, verbatim summaries, refusal wording, multilingual requests and confirmation provenance remains required before broader host claims. Real taxpayer documents must never be used in these tests.

## Independent AAT oracle

`test/fixtures/aat-answer7-2025-26.json` records the YA 2025/26 Answer 7 table from AAT's current [supplement](https://www.aatsl.lk/images/pdf/corporate-and-personal-taxation-supplementary-en.pdf), reached through its [syllabus page](https://www.aatsl.lk/index.php/en/examination/syllabus). The cover and PDF page 11 confirm the year and answer. The full PDF has 27 pages and 510,727 bytes; SHA-256 is `39603ddaf539453ae331c1530f757e6195bbc5faa2f38a8362b6141d5441e054`. The calculation table was visually inspected on 2026-10-20.

The oracle independently checks tax **424,140.00** on published taxable income **2,511,500.00**, and balance **369,140.00** after the published credits. It also reconciles the source's aggregate income and deductions. The supplement does not reproduce the full original question and investment schedule. The test therefore does not invent investment composition, donation classification or unreported eligibility facts to force a complete annual intake. Full G7 intake validation remains pending. The similarly named `cpt-2025-supplementary.pdf` has a YA 2024/25 cover and is not this answer's source.

The six annual IRD source examples remain exact end-to-end computation fixtures. G8/G9 are labelled arithmetic/interpretation regressions, and G11/G12 remain requirements-summary cases rather than newly verified independent sources. Tax rules, rounding conventions, supported scenarios, consent and the public MCP interface are unchanged by this validation work.
