import assert from 'node:assert/strict';
import { canonical } from './contract.ts';

type Component = { 'bom-ref': string; name: string; version: string; purl: string; hashes?: { alg: string; content: string }[] };
export type Bom = { bomFormat: string; specVersion: string; metadata: { component: Component }; components: Component[];
  dependencies: { ref: string; dependsOn: string[] }[] };
type Entry = { version: string; dev?: boolean; integrity?: string; dependencies?: Record<string, string> };
type Lock = { lockfileVersion: number; version: string; packages: Record<string, Entry> };
type Package = { name: string; version: string; dependencies: Record<string, string> };
const purl = (name: string, version: string) => `pkg:npm/${encodeURIComponent(name).replaceAll('%2F', '/')}@${version}`;
function hash(integrity: string | undefined) {
  assert.ok(integrity && /^sha512-[A-Za-z0-9+/]+={0,2}$/.test(integrity), 'Production packages need SHA-512 integrity');
  const bytes = Buffer.from(integrity.slice(7), 'base64');
  assert.equal(bytes.length, 64, 'Invalid SHA-512 integrity');
  return bytes.toString('hex');
}
function checkShape(bom: Bom) {
  assert.equal(bom.bomFormat, 'CycloneDX');
  assert.equal(bom.specVersion, '1.5', 'Review a changed npm SBOM format explicitly');
  assert.ok(bom.metadata.component && Array.isArray(bom.components) && Array.isArray(bom.dependencies));
  const all = [bom.metadata.component, ...bom.components];
  assert.equal(new Set(all.map(c => c['bom-ref'])).size, all.length, 'Duplicate SBOM references');
  assert.equal(new Set(all.map(c => c.purl)).size, all.length, 'Duplicate SBOM packages');
  for (const c of all) assert.ok(c['bom-ref'] && c.purl && c.name && c.version, 'Incomplete SBOM component');
  const refs = new Set(all.map(c => c['bom-ref']));
  assert.equal(bom.dependencies.length, all.length, 'Duplicate or missing dependency records');
  assert.equal(new Set(bom.dependencies.map(d => d.ref)).size, all.length, 'Every component needs one dependency record');
  for (const d of bom.dependencies) {
    assert.ok(refs.has(d.ref), 'Unknown dependency source');
    assert.equal(new Set(d.dependsOn).size, d.dependsOn.length, 'Duplicate dependency edge');
    for (const target of d.dependsOn) assert.ok(refs.has(target), 'Dangling dependency edge');
  }
}
export function verifyProductionBom(bom: Bom, lock: Lock, pkg: Package) {
  checkShape(bom);
  assert.equal(lock.lockfileVersion, 3);
  assert.equal(lock.version, pkg.version);
  assert.equal(canonical(lock.packages[''].dependencies), canonical(pkg.dependencies), 'Manifest and lock dependencies differ');
  const root = bom.metadata.component;
  assert.equal(root.purl, purl(pkg.name, pkg.version));
  assert.equal(root.version, pkg.version);
  assert.ok([pkg.name, pkg.name.split('/').at(-1)].includes(root.name), 'Root component name differs');
  const entries = Object.entries(lock.packages).filter(([path, e]) => path && !e.dev);
  const expected = new Map(entries.map(([path, e]) => {
    const name = path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
    return [path, { entry: e, name, url: purl(name, e.version) }];
  }));
  assert.deepEqual(bom.components.map(c => c.purl).sort(), [...new Set([...expected.values()].map(e => e.url))].sort(), 'Production inventory differs from lockfile');
  const components = new Map(bom.components.map(c => [c.purl, c]));
  for (const { entry, name, url } of expected.values()) {
    const component = components.get(url)!;
    assert.equal(component.name, name);
    assert.equal(component.version, entry.version);
    assert.ok(component.hashes?.some(h => h.alg === 'SHA-512' && h.content === hash(entry.integrity)), 'Production integrity mismatch');
  }
  function dependency(from: string, name: string) {
    let directory = from;
    while (true) {
      const found = expected.get(`${directory ? directory + '/' : ''}node_modules/${name}`);
      if (found) return components.get(found.url)!['bom-ref'];
      if (!directory) throw new Error('Unresolved production dependency');
      directory = directory.includes('/') ? directory.slice(0, directory.lastIndexOf('/')) : '';
    }
  }
  const graph = new Map(bom.dependencies.map(d => [d.ref, [...d.dependsOn].sort()]));
  assert.deepEqual(graph.get(root['bom-ref']), Object.keys(pkg.dependencies).map(n => dependency('', n)).sort(), 'Root dependency edges differ');
  for (const [path, { entry, url }] of expected)
    assert.deepEqual(graph.get(components.get(url)!['bom-ref']), Object.keys(entry.dependencies ?? {}).map(n => dependency(path, n)).sort(), 'Transitive dependency edges differ');
  return bom.components.length;
}
export function verifyInstalledBom(production: Bom, installed: Bom, tarballIntegrity: string) {
  checkShape(installed);
  const app = production.metadata.component;
  const expected = new Map([app, ...production.components].map(c => [c.purl, c]));
  assert.deepEqual(installed.components.map(c => c.purl).sort(), [...expected.keys()].sort(), 'Installed dependency inventory differs');
  const installedByRef = new Map(installed.components.map(c => [c['bom-ref'], c.purl]));
  const installedByUrl = new Map(installed.components.map(c => [c.purl, c]));
  const productionByRef = new Map([app, ...production.components].map(c => [c['bom-ref'], c.purl]));
  assert.deepEqual(installed.dependencies.find(d => d.ref === installed.metadata.component['bom-ref'])!.dependsOn,
    [installedByUrl.get(app.purl)!['bom-ref']], 'Validation consumer must depend only on the installed application');
  for (const [url, component] of expected) assert.equal(installedByUrl.get(url)!.version, component.version, 'Installed component version differs');
  for (const c of production.components) {
    assert.equal(installedByUrl.get(c.purl)!.name, c.name, 'Installed component name differs');
    assert.equal(canonical(installedByUrl.get(c.purl)!.hashes), canonical(c.hashes), 'Installed dependency integrity differs');
  }
  assert.ok(installedByUrl.get(app.purl)!.hashes?.some(h => h.alg === 'SHA-512' && h.content === hash(tarballIntegrity)), 'Installed package does not match tarball integrity');
  const edges = new Map(installed.dependencies.map(d => [d.ref, d.dependsOn.map(r => installedByRef.get(r)).sort()]));
  for (const d of production.dependencies) {
    const component = installedByUrl.get(productionByRef.get(d.ref)!)!;
    assert.deepEqual(edges.get(component['bom-ref']), d.dependsOn.map(r => productionByRef.get(r)).sort(), 'Installed dependency edges differ');
  }
}
