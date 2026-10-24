# Manual first-time-user walkthrough

Date: 24 October 2026. Started from merged main `b9ef2b0810bda80422b83f98aee222069cde75af`, then repeated the affected steps against preview.13.

This was an interactive, adaptive walkthrough of the compiled stdio MCP. The tester supplied synthetic user situations and chose each next tool call from the published prompts and actual responses. It was not just another run of the existing happy-path script. Across the before-and-after sessions, 49 protocol requests were recorded locally. No real taxpayer information or documents were used.

It is still an agent-driven walkthrough, not an independent human usability study or a test of an installed ChatGPT/Claude desktop interface. The native host setup and visual presentation remain separately unverified.

## User situations and observed outcomes

| Ordinary user situation | Observation before the fixes | Result after the fixes |
|---|---|---|
| "I have salary and bank documents. What do I do?" | Capability discovery gave configuration flags, without a beginner route. | It explains the supported period, offers manual entry, and gives the next step without requiring tool commands or schema knowledge. |
| "I do not know what a document root is. Can I read the totals to you?" | The protocol could accept totals, but disabled-feature guidance emphasized technical setup. | Manual entry is explicitly available without file setup. Questions explain pay before deductions, tax already withheld and unknown amounts. |
| "The bank letter says Rs. 84,000.00." | Formatting normalization worked. | It still proposes a canonical amount for confirmation and does not change facts by itself. |
| "Save this; I need to find another letter tomorrow." | The disabled-save error advised setup and restart, risking loss of current answers. | It explicitly says no draft was saved/restored, keeps the session open and offers review of entered totals for secure preservation before closing or setup. |
| "Sorry, that second document is a bank letter, not salary." | Re-reading identical bytes under a new category returned the old employment record as a duplicate. No targeted recovery was available. | Authorized reclassification re-reads the same file, checks the fingerprint, resets only that record for review and preserves the already confirmed salary source. |
| "It says ready. Can I get the answer?" | Financial intake said complete/ready, but calculation immediately failed because an imported document was still pending. | The combined progress directs the user to document review or totals confirmation and keeps calculation_ready false. |
| "This other letter is last year." | Year validation already prevented inclusion. | A plain review note now explicitly says to exclude a different-year letter rather than change its year. |
| "I can read the amount the scan missed." | OCR returned gross interest but no readable withholding value. | The missing amount stays unset; a readable question requests confirmation/correction from the local record, not an assumed zero. |
| "I came back to the same open conversation." | There was no safe session-status view for deciding whether to continue. | Coarse status booleans show an existing consented session; the assistant is instructed not to reset it. No financial answers are disclosed by this pre-consent metadata call. |
| "Does the worksheet mean this was filed?" | The existing filing boundary was correctly enforced. | It still reports filing_ready false and official_filing_supported false, with remaining external preparation steps. |

## Completed manual routes

The manual-entry route used different synthetic employment and interest totals from the document fixture. It returned tax 32040.00, credits 30400.00 and a preview balance 1640.00. Normalization did not mutate facts, and the failed disabled save left the answers available for review.

The document route used a replacement salary certificate, a bank letter deliberately misclassified as employment, an old-year letter and a scanned second-bank letter. The category correction preserved the salary source; the old-year letter was explicitly excluded. The scan proposed gross interest but left withholding and the year for user confirmation. After the tester explicitly confirmed those from the synthetic record, previewed all source totals and completed the remaining explicit questions, the server returned the expected balance **5800.00**.

Worksheet generation was initially refused until every checklist statement was shown and explicitly confirmed. The generated worksheet retained the expected balance and filing-ready false. Source corrections, decisions, terms and checklist confirmations in this walkthrough are synthetic test-persona actions, not consent or tax claims by the repository owner.

## Regression and remaining limits

`test/novice-recovery.test.ts` covers beginner and returning-user guidance, per-document category correction, preservation of unrelated sources, reconciliation of formerly applied categories, draft-metadata roundtrip, readable unknown/warning messages, pending-document readiness and disabled-save preservation through both protocol versions. Existing document/OCR/restart and installed-package checks still apply.

The assistant must use the published plain-language guidance, ask a few questions at a time and keep internal tool names, field ids and hashes out of the ordinary user conversation. Required disclaimers, deterministic summaries and requested worksheets remain verbatim. The test does not establish universal OCR/layout recognition, multilingual support, official filing completeness or practitioner approval.
