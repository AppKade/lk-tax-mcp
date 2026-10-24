# Private preview installation

This package is not published to npm. It remains `private: true`, a development preview, not IRD-approved, not tax advice and not filing-ready. These instructions prepare and test a local tarball. No npm account, token or signing key is needed, and no publish workflow is configured.

## Run from a checkout

Use Node 22.18 or newer and npm:

```sh
npm ci --ignore-scripts
npm run build
npm start
```

The build uses the pinned TypeScript compiler to emit JavaScript into `dist/` and rewrite relative `.ts` imports to `.js`. Rule JSON stays in `rules/` and package identity stays in the root `package.json`. No compiler, source files or build hooks are needed by the installed runtime. `npm run dev` still runs the TypeScript source directly for development.

Node does not strip TypeScript types in dependencies under `node_modules`; shipping the source-only entry point would therefore fail after npm installation even though it works from a checkout. See [Node's TypeScript documentation](https://nodejs.org/api/typescript.html#type-stripping-in-dependencies) and [TypeScript import rewriting](https://www.typescriptlang.org/tsconfig/rewriteRelativeImportExtensions.html).

An MCP host can launch the compiled checkout directly:

```json
{
  "mcpServers": {
    "lk-tax": {
      "command": "node",
      "args": ["/absolute/path/lk-tax-mcp/dist/cli.js"]
    }
  }
}
```

Starting the process does not accept consent. The host must obtain user agreement and call the consent tools before collecting facts. Each process has its own in-memory session; restarting loses facts and acknowledgements. No credentials, identifiers, network service or database are required.

## Build and check a local package

```sh
npm run package:check
```

This builds fresh runtime JS, creates the actual tarball with lifecycle scripts disabled, checks its exact file inventory, installs it into a temporary directory outside the checkout and runs both legacy and modern MCP journeys through `npm exec --offline --no -- lk-tax-mcp`. Installation may fetch the declared production dependencies from the configured npm registry. Registry fallback is disabled during the subsequent workflow probes. No real taxpayer facts are used.

The validation consumer has no source symlinks, TypeScript compiler or Inspector dependency. It checks installed file bytes and npm's executable shim, full tool schemas and resource metadata against the reviewed contract, consent refusals, a source-example calculation, cage resource loading, a confirmed worksheet, an instalment calculation, edit invalidation and wipe. Temporary installation files are removed after the check.

The local build products are `artifacts/package/appkade-lk-tax-mcp-2026.25.0-preview.12.tgz`, `artifacts/package/production.cdx.json` and `artifacts/package/validation.json`. The report records the archive/SBOM SHA-256, npm integrity, lockfile digest, file inventory, contract hash and tested platform/Node version. The CycloneDX production inventory is checked against the lockfile and isolated installation's recorded versions, hashes and dependency edges; it is not a vulnerability scan or independent file-by-file dependency audit. These are development artifacts, not signed release assets. CI repeats the check on Linux, Windows and macOS under Node 22 and 24 and retains passing artifacts for seven days.

To test the tarball yourself, replace the paths below with absolute paths on your machine:

```sh
npm install --prefix /absolute/path/tax-preview --ignore-scripts --omit=dev /absolute/path/appkade-lk-tax-mcp-2026.25.0-preview.12.tgz
npm exec --prefix /absolute/path/tax-preview --offline --no -- lk-tax-mcp
```

The command waits for MCP stdio messages. It is not an interactive tax interview in the terminal. For a host configuration, the installed entry point is `/absolute/path/tax-preview/node_modules/@appkade/lk-tax-mcp/dist/cli.js`. Use that path with `command: "node"` and the same `args` structure shown above. Configure Windows paths with JSON escaping where needed.

The [npm package configuration](https://docs.npmjs.com/cli/configuring-npm/package-json/) documents executable shims, file lists and the private publishing guard. [npm exec](https://docs.npmjs.com/cli/commands/npm-exec/) is the command runner underlying current npx.

## Package boundary and release gates

The tarball includes only compiled runtime JS, the three active rule JSON payloads, the existing Agent Skill, README, SECURITY policy, installation instructions and package metadata. It excludes TypeScript sources, tests and fixtures, Inspector, development scripts, archived rules, repository workflows and private configuration. The installed runtime still validates its active rules when loading them; immutable history and contract checks run in repository CI.

The Agent Skill is included as an existing file. npm installation does not automatically register it with a host. Follow your host's Skill installation process; installed-host behaviour remains separately unverified.

Public distribution still requires the documented source/review gates, installed-host evaluations, license selection, registry ownership and a reviewed provenance/release configuration. Signed desktop bundles additionally need manifest/platform testing and signing setup. This milestone neither publishes a package nor changes tax rules, consent, privacy policy or filing readiness. See [release blockers on GitHub](https://github.com/AppKade/lk-tax-mcp/blob/main/docs/implementation-status.md).

Optional local document/OCR and encrypted drafts require configuration and native tools described in [local-workflow.md](local-workflow.md). Without configuration the normal memory-only protocol journey is unchanged.
