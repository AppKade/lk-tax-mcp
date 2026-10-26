#!/usr/bin/env node
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createServer } from './server.ts';
import { fileURLToPath } from 'node:url';
import pkg from '../package.json' with { type: 'json' };

const args = process.argv.slice(2);
if (args.length === 0) {
  const handle = serveStdio(createServer);
  process.on('SIGINT', () => { void handle.close(); });
  process.on('SIGTERM', () => { void handle.close(); });
} else if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
  process.stdout.write(`lk-tax-mcp ${pkg.version}
Local Sri Lankan individual income tax estimates over MCP stdio.
Development preview. Not IRD-approved, not tax advice, not filing-ready.

Usage: lk-tax-mcp [--help | --version | --print-config]
  No arguments    Start the MCP server, waiting for JSON-RPC on stdin.
  --help, -h      Show this help and exit.
  --version       Print the installed version and exit.
  --print-config  Print local MCP host configuration for this executable.

This is not an interactive terminal tax interview. Connect an MCP host,
then ask it to start with lk_local_capabilities and the consent workflow.
Annual estimates: 2025/26. Separate instalment planning: 2026/27.
Documents and encrypted drafts are optional and disabled by default.
Never pass tax facts, document contents, identifiers or keys as CLI arguments.
See docs/installation.md and docs/local-workflow.md in the package.
`);
} else if (args.length === 1 && args[0] === '--version') {
  process.stdout.write(`${pkg.version}\n`);
} else if (args.length === 1 && args[0] === '--print-config') {
  // Deliberate local CLI output, never an MCP tool result. No environment or tax data.
  process.stdout.write(JSON.stringify({ mcpServers: { 'lk-tax': {
    command: process.execPath, args: [fileURLToPath(import.meta.url)],
  } } }, null, 2) + '\n');
} else {
  // Do not reflect arguments: a mistaken invocation could contain private data.
  process.stderr.write('Unsupported arguments. Use --help. Tax facts belong in the consented MCP workflow.\n');
  process.exitCode = 2;
}
