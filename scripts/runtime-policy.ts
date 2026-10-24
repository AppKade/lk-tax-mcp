import ts from 'typescript';
import { posix } from 'node:path';

const modules = new Set(['zod', '@modelcontextprotocol/server', '@modelcontextprotocol/server/stdio']);
const data = new Set(['package.json', 'rules/2025-26.json', 'rules/instalments-2026-27.json', 'rules/cages-2025-26.json']);
// Explicitly reviewed opt-in adapter only; all other application modules retain the no-I/O policy.
const localImports: Record<string, string[]> = {
  'node:fs': ['realpathSync', 'lstatSync', 'readFileSync', 'mkdtempSync', 'rmSync', 'writeFileSync', 'chmodSync', 'openSync', 'closeSync', 'renameSync', 'unlinkSync'],
  'node:path': ['join', 'relative', 'isAbsolute', 'extname'], 'node:os': ['tmpdir'], 'node:child_process': ['execFileSync'],
  'node:crypto': ['createHash', 'randomBytes', 'createCipheriv', 'createDecipheriv'],
};
const blocked = new Set(['require', 'eval', 'Function', 'fetch', 'WebSocket', 'XMLHttpRequest', 'Worker', 'SharedWorker',
  'global', 'globalThis', 'console', 'Deno', 'Bun']);

// Review aid for accidental application-source capability changes, not a sandbox or malicious-code detector.
export function checkRuntimeSource(path: string, text: string, sourcePaths: Set<string>) {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const findings = new Set<string>();
  function moduleAllowed(node: ts.ImportDeclaration | ts.ExportDeclaration) {
    const specifier = node.moduleSpecifier;
    if (!specifier) return;
    if (!ts.isStringLiteral(specifier)) { findings.add('Nonliteral module'); return; }
    const name = specifier.text;
    if (path === 'src/local-files.ts' && ts.isImportDeclaration(node) && localImports[name]) {
      const bindings = node.importClause?.namedBindings;
      if (!node.importClause?.name && bindings && ts.isNamedImports(bindings) &&
          bindings.elements.every(e => localImports[name].includes((e.propertyName ?? e.name).text))) return;
    }
    if (modules.has(name)) return;
    if (name === 'node:crypto' && ts.isImportDeclaration(node)) {
      const bindings = node.importClause?.namedBindings;
      if (!node.importClause?.name && bindings && ts.isNamedImports(bindings) && bindings.elements.length === 1 &&
        (bindings.elements[0].propertyName ?? bindings.elements[0].name).text === 'createHash') return;
    }
    const target = posix.normalize(posix.join(posix.dirname(path), name));
    if (name.startsWith('.') && (sourcePaths.has(target) || data.has(target))) return;
    findings.add(`Unapproved runtime module: ${name}`);
  }
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) moduleAllowed(node);
    if (ts.isImportEqualsDeclaration(node)) findings.add('CommonJS import');
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) findings.add('Dynamic import');
    if (ts.isIdentifier(node) && blocked.has(node.text)) findings.add(`Restricted runtime identifier: ${node.text}`);
    if (ts.isIdentifier(node) && node.text === 'process') {
      const access = node.parent, call = access.parent;
      const localSetting = path === 'src/local-files.ts' && ts.isPropertyAccessExpression(access) && access.expression === node &&
        (access.name.text === 'platform' || (access.name.text === 'env' && ts.isPropertyAccessExpression(call) && call.expression === access &&
          ['LK_TAX_DOCUMENT_ROOT', 'LK_TAX_DRAFT_ROOT', 'LK_TAX_DRAFT_KEY_FILE'].includes(call.name.text)));
      if (localSetting) return;
      if (!(path === 'src/cli.ts' && ts.isPropertyAccessExpression(access) && access.expression === node && access.name.text === 'on' &&
        ts.isCallExpression(call) && call.expression === access && call.arguments.length === 2 && ts.isStringLiteral(call.arguments[0]) &&
        ['SIGINT', 'SIGTERM'].includes(call.arguments[0].text))) findings.add('Process access outside approved shutdown hooks');
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return [...findings].sort();
}
