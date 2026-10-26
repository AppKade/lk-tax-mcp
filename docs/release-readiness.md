# Preview release readiness

Updated 26 October 2026 for 2026.25.0-preview.15. This is a local, single-user estimate and preparation preview. It does not file a return, connect to RAMIS, authorize a payment or determine a filing obligation. `filing_ready` remains false.

## What a user can install and test

Node.js 22.18+ is required. Install from a checkout or a locally verified tarball using [installation.md](installation.md). Run the installed executable with `--help` before connecting a host, or `--print-config` to get configuration containing the actual Node and entry-point paths. The latter deliberately prints local executable paths to the terminal; review them before sharing. It never prints environment configuration, document paths or tax facts. Launch without arguments only through a local stdio MCP host.

Start the conversation with: "Help me estimate my Sri Lankan individual income tax for 2025/26. Start by checking supported scenarios and ask for my agreement before collecting facts." The host should call `lk_local_capabilities`, preserve any existing session, show the disclaimer and obtain consent. It must ask about every required fact rather than assuming zero income or eligibility. Review every entered total and the returned summary.

| User | Supported starting point | Boundary |
|---|---|---|
| Employee | Confirm gross employment, APIT and any other supported income | Payslip deductions are not automatically tax deductions; terminal benefits and arrears are unsupported |
| Freelancer | Confirm qualifying foreign or supported local aggregates | Already converted LKR and externally prepared net taxable profit; invoices are not salary certificates |
| Sole trader | Confirm externally prepared local net taxable business profit | No bookkeeping, loss computation, company or partnership return |
| Document-led user | Opt in to supported local salary/interest/rent/dividend evidence | Review every candidate, year, duplicate and replacement; apply reconciled totals explicitly |
| Returning user | Continue the same process, or explicitly restore an encrypted draft | Restore requires current consent and never restores worksheet approval |

Documents and saving are disabled by default. [local-workflow.md](local-workflow.md) describes native tools, local grants, supported formats and the separate deletion of saved drafts. Never put real taxpayer documents in repository fixtures, bug reports or CI artifacts. Do not upload credentials, identity numbers or keys into chat.

## Reproducible engineering verification

From a checkout with locked dependencies installed:

```sh
npm ci --ignore-scripts
npm run verify
```

This runs types, runtime capability checks, a production dependency advisory audit, payment-evidence checks, tests, immutable-rule checks, MCP contract checks and isolated installed-package verification. Package verification builds the runtime, checks the exact tarball contents and license, compares production dependency inventories, checks CLI help/version/config and exercises both protocol modes from the installed executable.

For the full Linux document and Inspector evaluation, first install Poppler and Tesseract as described in local-workflow.md, then:

```sh
npm ci --ignore-scripts --prefix tools/inspector
npm run verify:full
```

The full command adds actual PDF, PNG/image-only PDF OCR, revision/duplicate/year/injected-text checks, source reconciliation, worksheet generation, encrypted restart/restore/delete and stale-provenance refusal against the isolated installed package in both protocol modes. It also runs the pinned real Inspector CLI. Windows/macOS native document tools require separate validation. No LLM or installed desktop UI is certified by these scripts.

A successful run writes `artifacts/verification.json`; it identifies standard versus full coverage and the tested platform/version. The advisory audit and isolated dependency installation require the configured npm registry; an unavailable audit does not count as a pass. A clean advisory result only describes known reports at check time, not a vulnerability-free guarantee. A new run removes an old success report before starting and stops at its first failure. `artifacts/package/validation.json` records the tarball digest, exact files, SBOM/lockfile digests and whether installed document tests ran. These are local engineering reports, not signed provenance or tax approval.

CI independently runs the standard tests under Node 22/24, package checks on Linux/Windows/macOS and the actual installed document workflow on Linux. Check the workflow results for the exact commit you intend to use.

## Remaining external acceptance gates

| Gate | Evidence needed | Current status |
|---|---|---|
| Tax interpretation and rounding | Qualified review of charity caps, foreign allocation/stacking/credits and annual/instalment rounding, tied to the exact rule versions | Unresolved; rules remain unreviewed |
| Complete filing preparation | Verified supported-year schedules, missing disclosures and credits, assets/liabilities, declarations, official verifier acceptance and portal field mapping | Partial; worksheets are preparation text only |
| Human host/model behaviour | Synthetic employee, freelancer and sole-trader journeys in the actual host and model, including consent, verbatim summaries, refusals and restart handling | Automated protocol/Inspector coverage only |
| Distribution | Owner-controlled registry, reviewed release configuration and provenance; signing/platform evidence if offering a desktop bundle | Package stays private and unpublished |

The maintainer selected MIT for original AppKade code on 26 October 2026. Dependency licenses and externally referenced tax publications retain their own terms. License selection does not resolve any tax-accuracy or distribution gate.

Do not infer success of one gate from another. Passing arithmetic fixtures does not validate every legal interpretation; a passing protocol test does not prove that a model obtained consent. Keep unresolved fields and unsupported cases explicit. Source notes and implementation history are available in the repository at https://github.com/AppKade/lk-tax-mcp/tree/main/docs.
