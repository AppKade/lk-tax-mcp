import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

// Test/development host only. The server itself never spawns processes.
export function stdioHost(modern = false, launch?: { command: string; args: string[]; cwd?: string; env?: NodeJS.ProcessEnv; requestTimeoutMs?: number }) {
  const child = spawn(launch?.command ?? process.execPath, launch?.args ?? [fileURLToPath(new URL('../src/cli.ts', import.meta.url))],
    { stdio: ['pipe', 'pipe', 'pipe'], cwd: launch?.cwd, env: launch?.env });
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  let nextId = 0;
  let protocolError: Error | undefined;
  let stderr = '';
  child.stderr.on('data', c => { stderr += c.toString(); });
  const lines = createInterface({ input: child.stdout });
  function fail(error: Error) {
    protocolError = error;
    for (const p of pending.values()) p.reject(error);
    pending.clear();
  }
  lines.on('line', line => {
    try {
      const value = JSON.parse(line);
      const waiter = pending.get(value.id);
      if (waiter) { pending.delete(value.id); waiter.resolve(value); }
    } catch { fail(new Error('Non-JSON stdout')); }
  });
  child.on('error', () => fail(new Error('Could not start stdio server')));
  child.on('exit', () => fail(new Error(`Server exited: ${stderr}`)));
  child.stdin.on('error', () => fail(new Error('Stdio input closed')));
  return {
    async request(method: string, params: Record<string, unknown> = {}) {
      if (protocolError) throw protocolError;
      const id = ++nextId;
      const meta = modern ? {
        'io.modelcontextprotocol/protocolVersion': '2026-07-28',
        'io.modelcontextprotocol/clientInfo': { name: 'lk-tax-test-host', version: '1' },
        'io.modelcontextprotocol/clientCapabilities': {},
      } : {};
      return await new Promise<any>((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, launch?.requestTimeoutMs ?? 5000);
        pending.set(id, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params: modern ? { ...params, _meta: meta } : params }) + '\n');
      });
    },
    notify(method: string) { child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n'); },
    assertClean() { assert.equal(protocolError, undefined); assert.equal(stderr, ''); },
    async close() {
      lines.close();
      if (child.exitCode !== null || child.signalCode !== null) return;
      // EOF also reaches a server launched through npm; wait for wrappers to close their child.
      await new Promise<void>(resolve => {
        const timer = setTimeout(() => { child.kill(); resolve(); }, 3000);
        child.once('exit', () => { clearTimeout(timer); resolve(); });
        child.stdin.end();
      });
    },
  };
}
