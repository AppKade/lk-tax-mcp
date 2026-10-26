# Optional local documents and encrypted drafts

These capabilities address the document-led user journey. They are **disabled by default** and do not make an estimate filing-ready. Configure directories in the local MCP host environment, not through chat. No runtime network calls or new npm dependencies are introduced.

## Configure the local host

Install Poppler (`pdfinfo`, `pdftotext`, `pdftoppm`) and Tesseract with English data on the device running the server. On Ubuntu: `sudo apt install poppler-utils tesseract-ocr tesseract-ocr-eng`. On macOS the corresponding Homebrew packages are `poppler` and `tesseract`. Install supported Windows builds locally and put their executable directories on PATH. The required integration gate runs on Linux; native Windows/macOS document binaries require separate host validation. The server never installs binaries or downloads language data.

Set `LK_TAX_DOCUMENT_ROOT` to a dedicated existing local directory containing only documents selected for this workflow. `lk_documents` accepts relative paths only, refuses file symlinks, traversal and resolved paths outside the root, and limits inputs to regular files of at most ten MiB. PDFs are limited to ten pages; the adapter rejects larger PDFs instead of silently processing a subset. Extraction has a shared time budget and bounded output. Operators must trust the installed native binaries and filesystem: this is not an OS sandbox or protection against a malicious local user racing filesystem changes.

Use neutral filenames. Relative paths and category selections are tool arguments visible to the host; do not put names or account identifiers in them. Documents themselves remain local. Raw extracted text stays in process memory and is never returned to the host or retained as a session record. OCR creates images in a private temporary directory and attempts cleanup after success or failure. This does not establish physical erasure from disk, swap, crashes or backups. Use a trusted device and encrypted storage where appropriate.

## Review and apply evidence

1. Obtain current disclaimer consent, check `lk_local_capabilities` and obtain separate user confirmation for the selected file read.
2. Call `lk_documents` with `action: review_file`, the relative file and its explicit category (`employment`, `interest`, `rent`, `dividend`). Supported inputs are PDF, PNG, JPEG and the salary CSV below. No URL, raw upload, free-text notes or identity fields are accepted.
3. The result contains a pseudonymous document handle, byte fingerprint, extracted years, page references, candidates, missing fields and warnings. Text extraction uses a conservative label catalogue, not bank-specific legal interpretation. Scanned PDFs and images use English OCR. There is no calibrated OCR confidence score; all OCR is marked for review and missing or ambiguous values stay unset. Unknown layouts and multilingual labels require manual confirmed values or aggregate entry.
4. Discuss documents using their readable labels, review questions and notes rather than internal hashes. If the category was wrong, use `reclassify` to re-read the same explicitly selected file against its existing handle. The byte fingerprint must match; an updated file must be reviewed as a new document. Category changes across a replacement chain are refused rather than silently rewiring it. Other documents are preserved. Previously applied categories remain tracked so their old contribution cannot survive silently: preview all affected totals and include any other sources before confirming. Confirm every included value and year from the actual local record. A candidate is never automatically a tax fact. The parser does not evaluate embedded instructions; instruction-like content is only flagged. A forged document can still contain plausible monetary labels, so confirmation and independent evidence review remain essential.
5. Exact byte duplicates return the existing handle. Matching category amounts surface as possible duplicates and require a deliberate distinct-source decision to include both. Matching totals are not proof that two banks or employers are the same source. Exclude genuine duplicates and wrong-year evidence. Link a revised certificate to the original handle using `replaces`; self-replacement, invalid links, cycles and re-including an actively superseded source are refused.
6. Resolve every pending document. Call `preview_apply` and show proposed totals alongside current income. Explicitly confirm that they cover every source in those categories, including zero totals after exclusions. Call `apply` with that preview digest. This **replaces** covered categories and invalidates worksheet approval; never add the totals to existing amounts again. Any intervening change makes the digest stale.
7. Calculation checks applied totals against current facts. A later conflicting manual edit blocks calculation until the sources are corrected/reapplied. Clearing the ledger requires explicit confirmation and preserves current income totals; it is not a mechanism for hiding genuine income.

The salary CSV has the exact header `month,gross_regular,bonus,employee_deductions,apit`. Months use `YYYY-MM`; monetary cells use ungrouped decimal strings. Each row must have five cells and a unique month. Regular salary and bonus are added; APIT is separate, and employee deductions are not subtracted from gross employment. Only the simple documented format is supported. Partial-year ledgers are flagged for review. Certificates and their underlying monthly ledger must not be included as separate income sources.

## Encrypted drafts

Optional drafts require an existing private directory in `LK_TAX_DRAFT_ROOT` and a private local key file in `LK_TAX_DRAFT_KEY_FILE`. Create the key once outside chat, for example:

```sh
mkdir -m 700 /absolute/private/tax-drafts
node -e 'require("node:fs").writeFileSync("/absolute/private/tax-draft.key", require("node:crypto").randomBytes(32), { mode: 0o600, flag: "wx" })'
```

Never paste keys, passwords, ciphertext or their contents into chat. The key must be a regular, non-symlink file of exactly 32 bytes, with no group/other permissions on POSIX. Protect Windows access with OS ACLs. Losing the key loses the drafts; anyone who obtains both ciphertext and key can decrypt them. The key-file path is host configuration, not a tool input or output.

`lk_draft` supports five fixed slots. Save, restore, overwrite and delete all require current consent and explicit confirmation. AES-256-GCM uses a fresh random nonce, a full authentication tag and a version-bound associated-data label. Only typed facts and redacted evidence metadata are encrypted. Raw documents, document paths, consent, worksheet approvals and external-completion assertions are not stored. Restore checks authentication, size, format, expiry, active rule version, schemas and ledger consistency before replacing current facts. Failure preserves the current session. Restored facts must be reviewed and the worksheet checklist acknowledged again.

The selected one-to-thirty-day period controls **restore expiry**, not guaranteed automatic deletion. Expired ciphertext remains on disk until explicitly deleted or removed by the operator; no hidden scheduler is installed. `lk_session wipe` clears memory only. Delete the saved slots separately when requested; deleting ciphertext does not remove backups or guarantee physical erasure.

## Copied money and remaining preparation

`lk_normalize_amount` accepts an optional LKR/Rs prefix, correctly grouped commas and outer whitespace, and proposes a canonical decimal string. It never mutates facts. Show the result and obtain confirmation before `lk_set_facts`. Blank, signed, exponent, malformed-grouping and ambiguous values fail with a fixed, actionable error. This is formatting, not currency conversion.

`lk_preparation` lists case-specific unresolved credit, disclosure, asset/liability, declaration and other review work from the supported return. Users may report completing a step externally; that assertion never verifies a statement, source, portal entry or professional review. Changes to facts or evidence clear recorded completion. This addresses the missing next-step guidance; complete official schedules, legal interpretations, portal rounding and qualified practitioner sign-off remain external release gates. `filing_ready` remains false throughout.

## Verification

Run `npm run test:documents` after installing the local tools for checkout verification, or `npm run package:check -- --documents` for the isolated installed package in both protocol modes. This required gate generates synthetic text PDFs, a PNG and an image-only PDF, then drives the compiled MCP through original/revised salary certificates, duplicate bank letters, stale years, embedded instructions, reviewed OCR corrections, exact totals, worksheet, encrypted save, process restart, restore, stale-provenance refusal and deletion. It does not use real taxpayer documents. CI runs this on Linux in addition to the normal unit, protocol, package and security checks.

Primary implementation references: [Node crypto](https://nodejs.org/api/crypto.html), [Tesseract command-line usage](https://tesseract-ocr.github.io/tessdoc/Command-Line-Usage.html), [Poppler pdftotext manual](https://manpages.debian.org/bookworm/poppler-utils/pdftotext.1.en.html). No new tax rule is derived from these software references.

## First-time and returning users

`lk_local_capabilities` now returns a plain-language getting_started route, assessment dates and safe session-status booleans. It never returns entered amounts before consent. Manual entry stays available when files or saving are not configured. Do not tell a user to restart an unsaved session simply to enable a feature: first let them review and preserve their entered aggregate totals securely.

Progress reports include `evidence_progress` and combined `calculation_ready`. Once scope is resolved, pending document review, unapplied totals or a provenance mismatch take priority over repeated monetary questions. Financial intake evaluations remain separate; actual computation still validates eligibility and financial rules. The readiness flag never establishes filing readiness.

Business accounts, freelance invoices, foreign-service statements and business payment receipts have no extraction category. Do not relabel them as salary or bank interest. Use externally reviewed supported aggregates for manual entry; business taxable profit must already be prepared. Company accounts and company tax are outside this individual estimate.
