# lk-tax-mcp

Local Sri Lankan individual income tax assistance over MCP (stdio). Development preview: not IRD-approved, not tax advice, not filing-ready. Read `README.md` for scope and `docs/implementation-status.md` for what is and is not built.

## Git and commits

- **Never commit as, or mention, an Anthropic identity.** Do not author or commit with an `@anthropic.com` email (for example `noreply@anthropic.com`). Do not add `Co-Authored-By`, `Claude-Session` or similar trailers, and do not put any Anthropic email address in a commit message, PR title or PR body.
- Before the first commit in a checkout, confirm the identity with `git config user.name && git config user.email`. If it is an Anthropic address, set the repository's own identity (`git config user.name ...`, `git config user.email ...`) to the maintainer's before committing. Use the maintainer's details from `git log`, not a guess.
- Check the author of what you made with `git log -1 --format='%an <%ae> | %cn <%ce>'` before pushing. If an Anthropic address appears, fix it with `git commit --amend --reset-author --no-edit` (unpushed commits only).
- Do not push or open a PR unless asked. Never rewrite published history. Keep commit messages short and descriptive of the change.

## Commands

Node.js 22.18 or newer. Development source runs directly with `npm run dev`. Build compiled JavaScript with `npm run build` before `npm start` or local packaging; installed packages must not rely on TypeScript stripping inside node_modules.

```sh
npm ci --ignore-scripts       # install; scripts are never needed
npm run check                 # tsc --noEmit
npm run security:check        # application runtime capability regression check
npm run payments:check        # development payment evidence, not payment instructions
npm test                      # node --test test/*.test.ts
npm run test:documents         # required real PDF/OCR/draft gate with local Poppler/Tesseract
npm run test:core             # engine tests only
npm run rules:check           # validate rule JSON and archived history
npm run contract:check        # compare public MCP interface with test/fixtures/mcp-contract.json
npm run build                 # compile runtime JS to dist/
npm start                     # compiled stdio MCP server
npm run dev                   # source stdio server
npm run package:check         # pack, isolated install and both protocol journeys
```

CI (`.github/workflows/ci.yml`) runs check, test, rules:check and contract:check on Node 22 and 24. On pull requests it also runs `rules:check -- <base-sha>` and `contract:version -- <base-sha>`. Run the first four before you finish a change.

## Layout

- `src/server.ts` registers tools, prompts and resources; `src/cli.ts` serves it over stdio. `scripts/build.ts` emits runtime JS into ignored `dist/`; the package executable is `dist/cli.js`.
- `src/service.ts` holds sessions, consent and the tool handlers. `src/guidance.ts` holds host instructions and the four prompts.
- `src/engine.ts` is the annual computation. `src/foreign.ts`, `src/instalments.ts`, `src/return-review.ts`, `src/scope.ts` and `src/interview.ts` cover foreign income, YA 2026/27 instalments, cage review, scope checks and the dependency-aware interview.
- `src/money.ts` is decimal-string and bigint-cents arithmetic. `src/rules.ts` loads rule JSON. `src/privacy.ts` and `src/schema.ts` guard output and validation errors. `src/evidence.ts` is the typed source ledger; `src/local-files.ts` is the explicitly configured local document/encrypted-draft adapter. `src/support.ts` lists known issues and supported scenarios.
- `rules/` holds versioned rule data (`2025-26.json`, `instalments-2026-27.json`, `cages-2025-26.json`), the `history/` archive and `history.json`.
- `skills/lk-tax/SKILL.md` is the Agent Skill. Keep it in step with the tools, prompts and instructions; `test/skill.test.ts` checks it. It must never contain tax rates or amounts.
- `test/` holds the suites and fixtures, including `test/fixtures/mcp-contract.json`. `scripts/` holds the rules and contract checks. `docs/` holds the policy documents.

## Rules that must not be broken

- **Exact arithmetic.** Money is a decimal string at the boundary and bigint cents inside (`src/money.ts`). Never use `Number`, floats or JSON numbers for money.
- **Code calculates, the model explains.** Tax figures come only from deterministic code with cited traces. Host instructions and prompts must not contain tax rates or computed amounts.
- **No guessing.** Missing facts never default to zero or false. Zeros and booleans need explicit user confirmation. Unsupported income or claims refuse computation; do not drop or relabel them to get a result.
- **Consent and privacy.** Computation stays behind the disclaimer gate and re-checks scope every time. Accept no identifiers, credentials, keys or raw documents in chat or tax facts, and no arbitrary free-text fact fields. Optional local-file review and encrypted drafts require configured roots and per-action confirmation; only whitelisted structured candidates leave extraction. Keep them disabled by default, never expose raw text/paths/keys, and never restore consent or worksheet approval. Document source code must stay within the explicit local adapter capability allowlist. All other data remains memory-only. Errors come from a fixed catalogue and never echo input. See `SECURITY.md`.
- **Estimates only.** Results stay `estimate: true` and `filing_ready: false`. Never describe a rule or output as practitioner-reviewed or IRD-approved without recorded approval.
- **Never use real taxpayer documents** in fixtures, tests or docs.

## Changing rules

Follow `docs/rules-governance.md`. In short: cite the primary source URL (HTTPS, `www.ird.gov.lk`) with an exact locator and verification date; raise the family revision; copy the full payload to `rules/history/<family>/<version>.json`; append a `rules/history.json` entry with the canonical digest and a reason; add golden and boundary tests; update `docs/implementation-status.md`. Archived history is immutable. Fill in the rule section of the PR template and obtain qualified tax review before merging.

## Changing the public MCP interface

Any change to tool schemas, descriptions, annotations, prompts, resources or instructions changes the contract hash. Bump the package version (and the server identity that must match it), run `npm run contract:update`, review the full snapshot diff, then run `npm run contract:check` and `npm run contract:version -- <base-sha>`. Never update the snapshot to silence a failure you have not understood. See `docs/mcp-contract.md`.

## Style

Match the surrounding code: terse TypeScript with ES modules, explicit `.ts` import extensions, Zod for validation, no new dependencies without a reason. Add or update tests with every behaviour change and keep docs in step (`README.md`, `docs/implementation-status.md`, `src/support.ts` known issues).

Package preparation remains private. Run `npm run package:check` after packaging/build changes. It enforces the tarball allowlist and tests the installed npm executable without checkout dependencies. No public registry publish, provenance or signing workflow is configured.

Security boundary changes must update `docs/threat-model.md`. The source capability lint is not a sandbox. Package checks validate the production SBOM against the lockfile and isolated installation; do not describe SBOM metadata as a vulnerability scan or signed provenance.
