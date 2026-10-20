import { execFileSync } from 'node:child_process';
import { chmodSync, cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'lk-tax-build-'));
try {
  execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', join(root, 'tsconfig.build.json'), '--outDir', temporary], { stdio: 'inherit' });
  // Emit with the repository layout, then keep only runtime JS. Its ../rules and ../package.json imports still resolve.
  const dist = join(root, 'dist');
  rmSync(dist, { recursive: true, force: true });
  cpSync(join(temporary, 'src'), dist, { recursive: true });
  chmodSync(join(dist, 'cli.js'), 0o755);
  process.stdout.write('Built JavaScript runtime in dist/\n');
} finally { rmSync(temporary, { recursive: true, force: true }); }
