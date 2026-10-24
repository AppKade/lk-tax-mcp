# User-validation follow-up

The 24 October 2026 synthetic document evaluation exercised the actual local stdio runtime with salary certificates, bank letters, duplicate/revised/wrong-year evidence and an image-only PDF. Reconciled totals calculated correctly, but input meaning and evidence reconciliation needed improvement. No real taxpayer documents belong in fixtures.

## Delivered in preview.11

| Report gap | Change | Remaining limit |
|---|---|---|
| Technical intake questions | Eleven required plain-language scope questions; three calculation-dependent legacy hints are optional and never requested. Monetary questions explain gross employment/interest and net business profit. | Exclusions and unknown monetary values still require explicit confirmation. |
| Inspect existing entries | `lk_next_questions` returns a detached `confirmed_facts` snapshot and plain-language `questions`. Missing values remain absent. | Memory only; no saved drafts. |
| Duplicate/year/gross mistakes | Host instructions require reviewing totals before computing. A mandatory worksheet checklist statement covers year, gross amounts, duplicates and replacement certificates. | This is manual confirmation, not document inspection, automatic detection or source provenance. |
| Implausible credits | `input_warnings` cover APIT above reported employment, advance withholding above assessable income and credits without income. Warnings survive summary, review and worksheet; a specific adviser-reconciliation acknowledgement is required. | These are evidence warnings, not legal credit caps or refund decisions. Other mistakes may remain undetected. |
| Wrong instalment basis | Required `basis_source`; declared annual net balance is refused. Method 1 can explicitly match a supplied amount against current complete prior-year preview gross tax and rejects mismatches or unresolved warnings. | External source values remain unverified; no current-year annual calculator or automatic year-to-year transfer. |
| Repeated unchanged facts | Identical normalized writes preserve worksheet acknowledgement. | Actual changes, re-consent, restart and wipe still invalidate approval. |

All outputs remain unreviewed estimates and `filing_ready: false`. No tax-rule JSON, rate, relief, bracket, allocation or tax arithmetic changed.

## Compatibility

Clients must now supply `basis_source` to `lk_plan_instalments`. Use `external_gross_tax` only after confirming an independently prepared gross-tax amount. `session_annual_gross_tax` requires explicit user selection and Method 1; the service recomputes current YA 2025/26 facts and compares gross tax, not the net balance. `annual_net_balance` returns `INSTALMENT_BASIS_REVIEW`. The source match never validates underlying evidence, legal accuracy or the final return.

The existing three scope hint properties remain valid inputs, preserving old confirmed fact sets. They do not substitute for final amount-derived flags. No new tool or dependency was added.

## Regression coverage

`test/user-intake.test.ts` reproduces the synthetic employee/two-bank journey, current-fact review, derived hint omission, missing exclusions, credit anomaly acknowledgements, normalized no-op writes, stale gross-tax selections, explicit external-source limits and both legacy and modern stdio hosts. Existing IRD golden fixtures still verify unchanged arithmetic. Invalid inputs remain atomic, privacy errors do not echo free text, and consent gates still apply.

## Next work

1. Design a consented local evidence ledger with pseudonymous source handles, period, gross/net/withholding fields, document fingerprints and revision relationships. Define redaction and untrusted-document boundaries before adding file APIs.
2. Add actual PDF/image extraction, confidence review and source-linked confirmations. Test duplicate and wrong-year detection, revisions, poor scans, missing pages and embedded instruction attacks. Do not claim OCR coverage from the current manual journey.
3. Design optional encrypted local drafts with explicit retention, restore and wipe behavior. Keep no-persistence as the default.
4. Improve copied-money input feedback without weakening canonical decimal strings or echoing arbitrary input in errors.
5. Expand detailed credit schedules, disclosures, assets/liabilities and declarations with cited rules and qualified review. Complete filing preparation and practitioner sign-off are still release gates.

The current contribution rules prohibit raw documents, identifiers and persistence in the runtime. The next work requires explicit boundary changes, updated threat review and corresponding acceptance tests rather than silently adding upload or disk access.
