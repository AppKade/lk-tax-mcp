import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyProductionBom, verifyInstalledBom, type Bom } from '../scripts/supply-chain.ts';
import pkg from '../package.json' with { type: 'json' };
import lock from '../package-lock.json' with { type: 'json' };

// Captured from npm itself, then checked against the real lock in every package job.
const captured: Bom = JSON.parse(readFileSync(new URL('./fixtures/production-bom.json', import.meta.url), 'utf8'));
function fixture() {
  const bom = structuredClone(captured);
  const old = bom.metadata.component['bom-ref'];
  bom.metadata.component.version = pkg.version;
  bom.metadata.component.purl = `pkg:npm/%40appkade/lk-tax-mcp@${pkg.version}`;
  bom.metadata.component['bom-ref'] = `${pkg.name}@${pkg.version}`;
  bom.dependencies.find(d => d.ref === old)!.ref = bom.metadata.component['bom-ref'];
  return bom;
}
const validate = (b: Bom) => verifyProductionBom(b, lock, pkg);
test('production SBOM includes exactly the pinned non-development inventory and graph', () => {
  assert.equal(validate(fixture()), 3);
});
test('missing, added, duplicated or wrong-version components fail', () => {
  for (const mutate of [
    (b: Bom) => { b.components.pop(); },
    (b: Bom) => { b.components.push({ ...b.components[0], purl: 'pkg:npm/rogue@1.0.0', 'bom-ref': 'rogue' }); },
    (b: Bom) => { b.components.push(b.components[0]); },
    (b: Bom) => { b.components[0].version = '0.0.0'; },
    (b: Bom) => { b.components[0].name = 'wrong-package'; },
    (b: Bom) => { b.metadata.component.version = '0.0.0'; },
  ]) { const b = fixture(); mutate(b); assert.throws(() => validate(b)); }
});
test('integrity tampering and graph corruption fail', () => {
  for (const mutate of [
    (b: Bom) => { b.components[0].hashes![0].content = '0'.repeat(128); },
    (b: Bom) => { b.dependencies[0].dependsOn = []; },
    (b: Bom) => { b.dependencies[1].dependsOn = ['missing']; },
    (b: Bom) => { b.dependencies[1].dependsOn = []; },
    (b: Bom) => { b.dependencies.push(b.dependencies[0]); },
    (b: Bom) => { b.specVersion = 'unsupported'; },
  ]) { const b = fixture(); mutate(b); assert.throws(() => validate(b)); }
});
test('installed inventory must contain the actual tarball and the same production graph and hashes', () => {
  const production = fixture();
  const integrity = `sha512-${Buffer.alloc(64, 1).toString('base64')}`;
  const app = structuredClone(production.metadata.component);
  app.hashes = [{ alg: 'SHA-512', content: '01'.repeat(64) }];
  const wrapper = { name: 'validation-consumer', version: '0.0.0', purl: 'pkg:npm/validation-consumer@0.0.0', 'bom-ref': 'consumer' };
  const installed: Bom = { ...structuredClone(production), metadata: { component: wrapper },
    components: [app, ...structuredClone(production.components)],
    dependencies: [{ ref: 'consumer', dependsOn: [app['bom-ref']] }, ...structuredClone(production.dependencies)] };
  assert.doesNotThrow(() => verifyInstalledBom(production, installed, integrity));
  installed.dependencies[0].dependsOn = [];
  assert.throws(() => verifyInstalledBom(production, installed, integrity));
  installed.dependencies[0].dependsOn = [app['bom-ref']];
  installed.components[0].hashes![0].content = '0'.repeat(128);
  assert.throws(() => verifyInstalledBom(production, installed, integrity));
  installed.components[0].hashes![0].content = '01'.repeat(64);
  installed.components[1].version = 'wrong-version';
  assert.throws(() => verifyInstalledBom(production, installed, integrity));
  installed.components[1].version = production.components[0].version;
  installed.dependencies[1].dependsOn = [];
  assert.throws(() => verifyInstalledBom(production, installed, integrity));
});
