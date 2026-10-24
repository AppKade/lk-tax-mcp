// Opt-in local-only boundary. Never expose raw text, paths, keys or subprocess diagnostics in results.
import { realpathSync, lstatSync, readFileSync, mkdtempSync, rmSync, writeFileSync, chmodSync, openSync, closeSync, renameSync, unlinkSync } from 'node:fs';
import { join, relative, isAbsolute, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { extractEvidence, evidenceKind } from './evidence.ts';
import { cents, money } from './money.ts';
import { normalizeAmount } from './evidence.ts';

export function localCapabilities() {
  return { documents_enabled: Boolean(process.env.LK_TAX_DOCUMENT_ROOT),
    encrypted_drafts_enabled: Boolean(process.env.LK_TAX_DRAFT_ROOT && process.env.LK_TAX_DRAFT_KEY_FILE),
    raw_document_output: false, network_access: false, max_document_bytes: 10485760, max_pages: 10 };
}
function rootPath(kind: 'documents' | 'drafts') {
  const configured = kind === 'documents' ? process.env.LK_TAX_DOCUMENT_ROOT : process.env.LK_TAX_DRAFT_ROOT;
  if (!configured) throw new Error('LOCAL_FEATURE_DISABLED');
  try { const p = realpathSync(configured); if (!lstatSync(p).isDirectory()) throw new Error(); return p; }
  catch { throw new Error('LOCAL_CONFIGURATION'); }
}
function inside(root: string, file: string) {
  const rel = relative(root, file); if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('LOCAL_FILE_REFUSED');
}
export function readDocument(file: string, kind: ReturnType<typeof evidenceKind.parse>) {
  const root = rootPath('documents');
  if (isAbsolute(file) || file.includes('\0') || file.split(/[\\/]/).some(p => p === '..')) throw new Error('LOCAL_FILE_REFUSED');
  let path: string; let bytes: Buffer;
  try {
    const requested = join(root, file); if (lstatSync(requested).isSymbolicLink()) throw new Error();
    path = realpathSync(requested); inside(root, path);
    const stat = lstatSync(path); if (!stat.isFile() || stat.size > 10485760) throw new Error(); bytes = readFileSync(path);
  } catch { throw new Error('LOCAL_FILE_REFUSED'); }
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const ext = extname(path).toLowerCase(); const deadline = Date.now() + 25000;
  const run = (command: 'pdfinfo' | 'pdftotext' | 'pdftoppm' | 'tesseract', args: string[]) => {
    try { return execFileSync(command, args, { encoding: 'utf8', timeout: Math.max(1, deadline - Date.now()), maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { if ((e as { code?: string }).code === 'ENOENT') throw new Error('DOCUMENT_DEPENDENCY'); throw new Error('DOCUMENT_EXTRACTION'); }
  };
  if (ext === '.csv') {
    if (kind !== 'employment') throw new Error('DOCUMENT_FORMAT');
    const rows = bytes.toString('utf8').trim().split(/\r?\n/).map(l => l.split(','));
    if (rows[0].join(',') !== 'month,gross_regular,bonus,employee_deductions,apit' || rows.length < 2 || rows.length > 25) throw new Error('DOCUMENT_FORMAT');
    let salary = 0n, apit = 0n; const years = new Set<string>(); const months = new Set<string>();
    for (const row of rows.slice(1)) {
      if (row.length !== 5 || !/^20\d\d-(?:0[1-9]|1[0-2])$/.test(row[0]) || months.has(row[0])) throw new Error('DOCUMENT_FORMAT');
      months.add(row[0]); const y = parseInt(row[0].slice(0, 4)) - (parseInt(row[0].slice(5)) < 4 ? 1 : 0); years.add(`${y}/${String(y + 1).slice(-2)}`);
      salary += cents(normalizeAmount(row[1])) + cents(normalizeAmount(row[2])); apit += cents(normalizeAmount(row[4])); normalizeAmount(row[3]);
    }
    const result = extractEvidence([`Year of assessment: ${[...years].join(' ')}\nGross employment income: LKR ${money(salary)}\nAPIT deducted: LKR ${money(apit)}`], kind, sha256, 'csv');
    if (months.size !== 12) result.warnings.push('PARTIAL_LEDGER'); return result;
  }
  if (!['.pdf', '.png', '.jpg', '.jpeg'].includes(ext)) throw new Error('DOCUMENT_FORMAT');
  const temporary = mkdtempSync(join(tmpdir(), 'lk-tax-ocr-')); chmodSync(temporary, 0o700);
  try {
    if (ext !== '.pdf') return extractEvidence([run('tesseract', [path, 'stdout', '-l', 'eng', '--psm', '6'])], kind, sha256, 'ocr');
    if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('DOCUMENT_FORMAT');
    const info = run('pdfinfo', [path]); const count = parseInt(info.match(/^Pages:\s+(\d+)/m)?.[1] ?? '0');
    if (count < 1 || count > 10) throw new Error('DOCUMENT_LIMIT');
    const pages: string[] = []; let ocr = 0;
    for (let page = 1; page <= count; page++) {
      let text = run('pdftotext', ['-f', String(page), '-l', String(page), '-layout', path, '-']);
      if (!text.trim()) {
        const image = join(temporary, `page-${page}`);
        run('pdftoppm', ['-f', String(page), '-l', String(page), '-scale-to', '2400', '-singlefile', '-png', path, image]);
        text = run('tesseract', [`${image}.png`, 'stdout', '-l', 'eng', '--psm', '6']); ocr++;
      }
      pages.push(text);
    }
    return extractEvidence(pages, kind, sha256, ocr === 0 ? 'text' : ocr === count ? 'ocr' : 'mixed');
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}

const aad = Buffer.from('lk-tax-local-draft-v1');
function draftKey() {
  const file = process.env.LK_TAX_DRAFT_KEY_FILE; if (!file) throw new Error('LOCAL_FEATURE_DISABLED');
  try {
    const stat = lstatSync(file); if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== 32 || (process.platform !== 'win32' && (stat.mode & 0o077) !== 0)) throw new Error();
    return readFileSync(file);
  } catch { throw new Error('LOCAL_CONFIGURATION'); }
}
function slotPath(slot: string) { if (!/^draft_[1-5]$/.test(slot)) throw new Error('DRAFT_INVALID'); return join(rootPath('drafts'), `${slot}.enc`); }
export function saveDraft(slot: string, payload: unknown, days: number, overwrite: boolean) {
  if (!Number.isInteger(days) || days < 1 || days > 30) throw new Error('DRAFT_INVALID');
  const file = slotPath(slot), key = draftKey(), iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv); cipher.setAAD(aad);
  const expires = new Date(Date.now() + days * 86400000).toISOString();
  const plain = Buffer.from(JSON.stringify({ format: 1, expires, payload }));
  if (plain.length > 524288) throw new Error('DRAFT_INVALID');
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]); plain.fill(0); key.fill(0);
  const body = JSON.stringify({ format: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: encrypted.toString('base64') });
  const temp = `${file}.${randomBytes(8).toString('hex')}.tmp`;
  try {
    if (!overwrite) { const fd = openSync(file, 'wx', 0o600); try { writeFileSync(fd, body); } finally { closeSync(fd); } }
    else { writeFileSync(temp, body, { flag: 'wx', mode: 0o600 }); renameSync(temp, file); }
  } catch { throw new Error('DRAFT_WRITE'); }
  finally { rmSync(temp, { force: true }); }
  return { saved: true, slot, expires, expiry_policy: 'restore_deadline_not_automatic_deletion', encrypted: true, consent_saved: false, worksheet_approval_saved: false };
}
export function loadDraft(slot: string) {
  const key = draftKey(); let plain: Buffer | undefined;
  try {
    const file = slotPath(slot), stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1048576) throw new Error();
    const blob = JSON.parse(readFileSync(file, 'utf8'));
    if (blob.format !== 1) throw new Error();
    const iv = Buffer.from(blob.iv, 'base64'), tag = Buffer.from(blob.tag, 'base64'); if (iv.length !== 12 || tag.length !== 16) throw new Error();
    const decipher = createDecipheriv('aes-256-gcm', key, iv); decipher.setAAD(aad); decipher.setAuthTag(tag);
    plain = Buffer.concat([decipher.update(Buffer.from(blob.data, 'base64')), decipher.final()]); const decoded = JSON.parse(plain.toString());
    if (decoded.format !== 1 || !Number.isFinite(Date.parse(decoded.expires)) || Date.parse(decoded.expires) <= Date.now()) throw new Error();
    return decoded.payload as unknown;
  } catch { throw new Error('DRAFT_INVALID'); }
  finally { key.fill(0); plain?.fill(0); }
}
export function deleteDraft(slot: string) {
  const file = slotPath(slot); try { if (lstatSync(file).isSymbolicLink()) throw new Error(); unlinkSync(file); }
  catch { throw new Error('DRAFT_INVALID'); }
  return { deleted: true, slot, notice: 'The ciphertext file was removed. This does not guarantee physical erasure or remove backups.' };
}
