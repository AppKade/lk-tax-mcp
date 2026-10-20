# Contributing

This is a local development preview, not filing software. Start with [implementation status](docs/implementation-status.md), [installation](docs/installation.md), and [SECURITY.md](SECURITY.md). Open an issue for a large proposal and send focused pull requests to `main`.

## Setup and validation

Use Node.js 22.18+ or 24. Install with lifecycle scripts disabled:

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run security:check
npm run rules:check
npm run contract:check
npm run payments:check
npm run build
```

For packaging changes, also run `npm run package:check`. It installs a private tarball in a temporary directory and checks actual MCP journeys. Package installation may need registry access. Inspector has its own pinned development installation under `tools/inspector/`.

## Contribution boundaries

- Use original synthetic facts or cited public examples. Never commit taxpayer documents, identifiers, credentials or real financial records.
- Keep money as decimal strings at boundaries and bigint cents inside. Preserve explicit confirmation of zeros and booleans, consent, scope refusal, and error redaction.
- Add a focused runnable regression check for behavior changes. Run the suites above before review.
- Explain what changed, why, and how to reproduce the check in the pull request. Note remaining limitations and evidence gaps.
- Use [rules governance](docs/rules-governance.md) for tax rule changes. Keep archived history immutable; cite primary evidence and obtain qualified review before merge. Passing arithmetic tests alone does not validate tax interpretation.
- Use [MCP contract governance](docs/mcp-contract.md) for public interface changes. Review the contract diff and bump package/server identity when required. Do not refresh snapshots just to remove an unexplained failure.
- Update [the threat model](docs/threat-model.md) for capability or security-boundary changes. The runtime lint is a regression guard, not a sandbox.

Public publishing remains blocked on source/review evidence, host evaluations, license selection, registry ownership and reviewed release configuration. Do not remove `private: true` or present a preview as IRD-approved. See the current [release gates](docs/installation.md#package-boundary-and-release-gates).

Report vulnerabilities through [SECURITY.md](SECURITY.md), without posting personal data in public issues.
