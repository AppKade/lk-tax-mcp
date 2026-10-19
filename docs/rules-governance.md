# Rules governance

`npm run rules:check` validates all registered active rule payloads and every archived version. PR CI also runs `npm run rules:check -- <base-commit-sha>` to compare published history with the target branch. Both checks run on Node 22 and 24.

The current catalogue covers `rules/2025-26.json`, `rules/instalments-2026-27.json` and `rules/cages-2025-26.json`. Runtime Zod schemas validate active and historical payloads. Evidence URLs must use HTTPS on `www.ird.gov.lk`, without credentials, custom ports or fragments. Rule citations retain nonempty locators and validated evidence dates. This is offline metadata validation; it does not establish that a URL is live or that its text supports a claim.

`rules/history.json` is a versioned index of archives, canonical SHA-256 digests and human-readable change reasons. Hashing sorts object keys and preserves array order, using the same implementation as the public MCP contract. Cosmetic JSON whitespace does not create a new rule version. Each family's numeric final revision increases strictly. Active data must equal the latest archived payload, including citations and review metadata. Historical entries and their payloads cannot be rewritten or deleted in a subsequent PR, even if their hashes are updated. New JSON files under `rules/` must be explicitly registered or archived.

The initial entries baseline annual `2025.26.3`, instalment `2026.27.1` and cage map `2025.26.cages.1`. They do not reconstruct older releases. The instalment payload was extracted unchanged from its previous TypeScript object; the existing protocol contract and source examples check that extraction. During first adoption, the PR gate also checks that annual and cage-map baselines match their existing base-branch JSON.

For a rule change:

1. Record primary source URL, exact page/section, effective dates, verification date and archived source hash when available. Retain the evidence status and never imply professional approval from a source being confirmed.
2. Update the active payload with a higher family revision. Copy the entire payload to `rules/history/<family>/<version>.json`.
3. Append an index entry with its canonical digest and a meaningful reason. To calculate a digest, run `node --input-type=module -e "import fs from 'node:fs'; import {digest} from './scripts/contract.ts'; console.log(digest(JSON.parse(fs.readFileSync('rules/2025-26.json','utf8'))))"`, replacing the active path as needed.
4. Add source-backed golden and boundary coverage, document prior-YA impact and update implementation status. Run the rules check and the complete test suite. Public interface changes also require the separate contract/version checks.
5. Complete the rule-change PR template and obtain qualified tax review before merging tax-rule changes. The archive is evidence of code history, not reviewer approval.

The current schemas are specific to the supported years. A new YA or schema shape requires an explicit catalogue/schema change and tests that continue accepting old archives. These checks do not freeze golden files or engine code, enforce CODEOWNERS approval, download/hash remote evidence, compile upstream TOML, or establish a filing-ready release. Those remain separate acceptance criteria. Tax values, assumptions, consent and supported scenarios are unchanged in this milestone.
