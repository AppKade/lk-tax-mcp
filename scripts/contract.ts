import { createHash } from 'node:crypto';
import { stdioHost } from '../test/stdio-host.ts';

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
export function digest(value: unknown) { return createHash('sha256').update(canonical(value)).digest('hex'); }
export function validateVersion(previous: { version: string; sha256?: string }, current: { version: string; sha256: string }) {
  if (previous.sha256 !== current.sha256 && previous.version === current.version)
    throw new Error('MCP contract changed without a package version bump');
}
export async function captureContract() {
  const host = stdioHost(true);
  try {
    async function request(method: string, params = {}) {
      const response = await host.request(method, params);
      if (response.error) throw new Error(`${method} failed: ${JSON.stringify(response.error)}`);
      return response.result;
    }
    const discovery = await request('server/discover');
    const sortByName = (items: any[]) => [...items].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    const tools = sortByName((await request('tools/list')).tools);
    const resources = sortByName((await request('resources/list')).resources);
    const prompts = [];
    for (const prompt of sortByName((await request('prompts/list')).prompts)) {
      prompts.push({ ...prompt, result: await request('prompts/get', { name: prompt.name, arguments: {} }) });
    }
    host.assertClean();
    const serverInfo = discovery._meta['io.modelcontextprotocol/serverInfo'];
    // Version is checked separately; the contract hash covers the actual public interface.
    const contract = { server_name: serverInfo.name, supportedVersions: discovery.supportedVersions, capabilities: discovery.capabilities,
      instructions: discovery.instructions, tools, resources, prompts };
    return { format_version: 1, version: serverInfo.version as string, sha256: digest(contract), contract };
  } finally { host.close(); }
}
