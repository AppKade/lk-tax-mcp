# Threat model

Reviewed against the current private preview on 2026-10-20. This is an application design review, not a penetration-test report, OS sandbox guarantee or practitioner assessment of tax law.

## Assets and trust boundaries

The sensitive assets are user-confirmed amounts, eligibility answers, derived tax figures, consent and checklist acknowledgements. Rule data, source evidence, tool descriptions and installed package integrity also affect decisions. The server accepts no taxpayer identifiers or raw documents in chat/facts; optional local review reads selected documents without returning raw text. Amounts can still reveal private financial circumstances.

| Boundary | What crosses it | Control and limit |
|---|---|---|
| User to AI host/provider | Chat, user confirmations and tool results | The host sees amounts. A cloud provider or another installed server may receive the conversation. This server cannot enforce their retention or permissions. |
| Host to local stdio process | JSON-RPC requests and responses | Strict inputs, consent/scope checks and fixed errors. Possession of the process pipes is the access boundary; there is no independent user identity verification. |
| Application to dependencies/OS | Imported SDK/Zod code, static JSON and memory | No application network, arbitrary-file or shell APIs. The process still runs with the user's OS permissions and is not sandboxed. Dependencies and the Node runtime require separate review. |
| Repository/build/install to executable | Rule JSON, compiled JS and dependency packages | Version-history/contract checks, locked installs, restricted tarballs, installed-package tests and an SBOM. These do not prevent an authorized malicious maintainer or compromised compiler. |

Each server process has a separate in-memory session. A new session, restart or wipe drops facts, consent and checklist references. Garbage collection does not establish physical erasure; OS swap, crash dumps and host logs remain outside this guarantee. Optional encrypted local drafts are separately configured; there is no remote tenant isolation or multi-user service.

The 2026-10-24 intake follow-up returns a detached `confirmed_facts` snapshot through the existing consent-gated progress tool. It contains only the typed aggregates actually entered; this makes the already permitted amounts easier for the host to inspect and increases no identifier, file or network capability. Credit anomaly acknowledgements and source-reconciliation statements are host assertions, not independent evidence checks. Identical normalized writes preserve a checklist acknowledgement; substantive fact changes, re-consent, restart and wipe still clear it. Instalment Method 1 may explicitly match a supplied basis to recomputed prior-year session gross tax, without writing planner facts or automatically selecting a source. External amounts and final-return accuracy remain unverified.

## Capabilities and current mitigations

The application exposes computation, explanation, static guidance and local session mutations. Starting or wiping a session is destructive to its memory state and has the corresponding tool annotation. A worksheet is text returned to the host; it is not a file write, submission or refund entitlement. Static source URLs are evidence labels, not runtime fetch targets. Node loads package code and static JSON from disk, and optional user-directed document/draft operations are constrained to the configured local adapter.

The runtime contains no application shell execution, dynamic evaluation, network fetch or telemetry. `scripts/check-runtime.ts` uses the pinned TypeScript parser to check every application `.ts` file. It allows current local modules and active JSON, the named SDK/Zod entry points and `createHash`. It rejects new module imports/re-exports, dynamic imports, CommonJS loading and selected code-execution/network/global/logging identifiers. Process access is limited to the entry point's SIGINT/SIGTERM shutdown hooks.

This is a regression check for accidental capability additions. It is not full data-flow analysis and cannot detect every obfuscated JavaScript technique, dependency side effect, malicious tool description or build-time injection. A policy change needs review alongside the implementation; passing it does not prove that a process cannot access the network or files. Development scripts intentionally build files, spawn test processes, install dependencies and use npm; they are outside the runtime policy and are excluded from the tarball.

Inputs cannot contain arbitrary free-text documents or identifiers. Missing money and eligibility are explicit unknowns; known exclusions block every derived output. Invalid patches are atomic. Consent requires the current disclaimer version and an explicit confirmation flag. Checklist acknowledgements bind to the current review and are cleared after edits, re-consent, restart or wipe. A host can lie about confirmation: these flags record the host's statement, not independently authenticated human agreement.

The model is instructed to repeat deterministic summaries and refuse unsupported estimates. It cannot be forced by this server to obey those instructions, avoid typing private data into chat, or avoid using other tools. Schema validation blocks instruction-like values in monetary/boolean fields, but does not make all host context trusted. Real document ingestion, OCR and free-text notes would add a new untrusted-content boundary and require a new threat review.

## OWASP MCP risk mapping

The mapping below uses the v0.1 project categories and 2025 IDs observed on 2026-10-20 in the [OWASP MCP Top 10](https://github.com/OWASP/www-project-mcp-top-10/blob/main/tab_top10.md). It is a design mapping, not an OWASP certification.

| ID | Risk considered here | Evidence or residual exposure |
|---|---|---|
| MCP1 | Secret leakage | No credential fields/storage; fixed errors and identifier guard. Host chat and other tools remain outside control. |
| MCP2 | Excess capabilities | Limited tools, truthful mutation annotations and runtime capability policy. OS permissions and dependency capabilities remain broader. |
| MCP03 | Manipulated tool interfaces | Reviewed contract hash and version gate. A changed hash alone does not establish safe wording or trusted authorship. |
| MCP4 | Dependency compromise | Locked integrity, production SBOM, installed inventory comparison and package allowlist. No signed provenance or vulnerability-free claim. |
| MCP5 | Executing supplied commands | No command/file/URL arguments or runtime execution APIs. Source lint supplements review, rather than sandboxing code. |
| MCP6 | Injected context | Typed inputs, atomic rejection and refusal tests. Host conversations and co-installed tools can still carry hostile instructions. |
| MCP07 | Unauthorized access | Local process-pipe access, consent and scope gates. No independent identity/authentication; unsuitable as a hosted multi-user endpoint. |
| MCP8 | Investigation gaps | No tax-data logs/telemetry by design. This limits forensics; adding audit logs requires a privacy and retention decision. |
| MCP9 | Unreviewed installations | Private packages, archive hashes and exact installed contract checks. Users still choose which host and other MCP servers to trust. |
| MCP10 | Shared-context exposure | Process isolation, wipe and no identifiers. Amounts and worksheet text still enter the host's context. |

## Supply chain evidence

`npm run package:check` creates `production.cdx.json` beside the private tarball. It runs npm's lockfile-only CycloneDX generation with development dependencies omitted, then checks exact package identities, versions, recorded SHA-512 integrity and dependency edges against the lock. A second npm SBOM from the isolated consumer must match those dependencies and the installed application's tarball integrity. The consumer's temporary paths are not copied into the distributed SBOM. The validation report includes SBOM/archive hashes and the lockfile digest.

This inventories recorded package metadata. It does not independently rehash every installed dependency file, scan for vulnerabilities, validate license obligations or establish that a dependency is benign. npm's download integrity verification is a separate control. Generated timestamps/serial numbers vary, so SBOM digests are specific to each validation run. Compiler/Inspector/development dependencies are intentionally outside this production SBOM and need their own review.

Reference: [npm SBOM command](https://docs.npmjs.com/cli/commands/npm-sbom/), inspected 2026-10-20. Public registry provenance, signing, license selection and release approval remain pending. These development artifacts must not be presented as signed or practitioner-reviewed releases.

## Open risks and review triggers

Professional review, full independent golden-case evidence, filing rounding and source verification still gate reliance on tax results. The security controls cannot detect a false eligibility answer or correct an unreviewed interpretation. SBOM and contract hashes do not improve legal correctness by themselves.

Untrusted local clients can submit oversized JSON before application validation; no hardened transport quota or remote-service denial-of-service protection is claimed. Compromised hosts, dependencies, OS accounts and build tools remain trusted-computing-base risks. New document input, persistence, identifiers, network transport, file output, payments, tool plugins or authentication would change these boundaries and require updated implementation, tests and this review before release.

Regression evidence: `test/host-guardrails.test.ts`, `test/worksheet.test.ts`, `test/runtime-policy.test.ts`, `test/supply-chain.test.ts`, both raw stdio journeys, the real Inspector gate and installed-package CI. Use synthetic/source-example facts only. Never put personal data in security reports or CI artifacts; follow `SECURITY.md` for private reporting.

## Opt-in adapter boundary, preview.12

`src/local-files.ts` alone may import the reviewed filesystem, path, OS temporary-directory, native subprocess and encryption functions. Selected relative files are checked against a configured canonical document root, size/type/page/time/output limits and symlink rules; no directory browsing, URL reads, shell strings or arbitrary executable selection is exposed. Fixed Poppler/Tesseract commands run with the process OS permissions, not a sandbox. Native binaries and local filesystem races remain independent trust boundaries. No calibrated OCR score is claimed; all OCR requires confirmation and missing values remain unset.

Only typed monetary candidates, years, pages, fixed warnings and hashed source handles leave extraction. Duplicate detection distinguishes byte matches from possibly equal sources; explicit confirmations, replacement relationships and digest-bound aggregate application prevent silent double counting. Current facts are checked against applied provenance. Embedded instructions are never executed; plausible forged values still need human evidence review. Temporary raster images are private and cleaned up on normal success/failure, with crash/physical-erasure limits.

Drafts use a private operator-configured 32-byte key file, a random nonce per write, AES-256-GCM, an authentication tag and version-bound associated data. Plaintext contains typed facts and redacted ledger metadata only. Restore validates authentication, expiration, rules, schemas and ledger integrity before replacing current state. Consent and approvals are never restored. Key and path contents are never tool outputs. Ciphertext restore expiry does not install a deletion scheduler; explicit deletion and backup handling remain required. Manual preparation completion is a user assertion and never grants filing-ready status.

Coverage includes unit tests for rejected paths, source/year/duplicate/revision guards, formatting, authenticated encryption/tampering/expiry/wrong keys and atomic restore, plus an actual compiled-MCP PDF/image/OCR/encrypted-restart journey in Linux CI. Installed Windows/macOS native extractor compatibility and independent security review remain separate gates.
