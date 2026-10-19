# Return review and cage evidence

Verified on 2026-10-19. Mapping version: `2025.26.cages.1`. Primary mapping evidence is confirmed; practitioner review remains pending. This does not change the unreviewed tax interpretation policies or filing readiness.

| Official IRD source | Bytes | SHA-256 |
|---|---|---|
| [Main return](https://www.ird.gov.lk/en/Downloads/IT_Individuals_Doc/Asmt_IIT_001_2025_2026_E.pdf) | 778937 | `d89252750a27800e82139de8543eaa5be0f48236f3c61df47c95dea01aab6161` |
| [Schedules](https://www.ird.gov.lk/en/Downloads/IT_Individuals_Doc/Asmt_IIT_002_2025_2026_E.pdf) | 3107459 | `13941f60b8f45824eb5eb5d6d97387dd25c7078ee86c4e35a555b84fbcbb0264` |
| [Guide](https://www.ird.gov.lk/en/Downloads/IT_Individuals_Doc/Asmt_IIT_004_2025_2026_E.pdf) | 1982988 | `7e789b520538b45750d874fd67b6fc0ab277fad8b8597d7f01f4934979fa64d6` |

All three complete files were retrieved and hashed. The main form and schedules are blank official forms. Main page 1 and schedules pages 7, 9 and 10 were rendered and visually inspected alongside their extracted text. Return and guide retrieval was independently captured by an ephemeral GitHub Actions workflow; the schedules were retrieved directly. The capture workflow is removed from the implementation branch. No taxpayer documents were used or stored in the repository.

## Implemented review

`lk_review_return` uses the same consent, current facts, scope, eligibility and financial validation as annual computation. It recomputes rather than accepting a caller-supplied result. The static resource `lktax://cagemap/2025-26` exposes the validated JSON mapping and source locators. The tool exposes no paths, arbitrary text, identifiers or file-writing arguments.

Main income totals include supported qualifying foreign salary in employment and net foreign services in business. Rent and interest form investment income. Final-WHT dividends are excluded from those totals. Unsupported categories are represented as zero only after the existing scope and income guards have accepted the facts; the server must refuse genuine unsupported income rather than omit it.

The mapping preserves the actual form ordering: rent relief 60, solar relief 70 and personal relief 80. Schedule 8's supported progressive/foreign taxable buckets sum to 801, and their tax buckets transfer through 810 to main 150. Other taxable categories are excluded by scope. Main reliefs, deductions, taxable income, tax, credits and payable balance are checked for consistency. A mismatch refuses the review.

Final withholding already deducted is informational in Schedule 6A, cage 607. The guide's printed pages 17 and 24 and schedules page 7 distinguish it from undeducted final withholding at 614, which transfers to 811 and then main 160. The supported final-dividend scenario therefore has zero unpaid final withholding, while its already-deducted tax never becomes an advance credit. This conclusion is limited to the implemented supported scenario.

Each mapped cage has its calculation binding, source locator, mapping version and trace. Every engine figure has explicit coverage: mapped preview, reference-only manual review, or working-only with no verified direct cage. The review preserves every engine flag and comparison alternative. Cage placement does not establish the correctness or optimality of the assumed local-first allocation.

## Unresolved fields and gaps

- Main 200 remains null. A potential overpayment is displayed only as a reference and is never approved as a refund claim.
- Main 210 and 210A remain null. The engine does not collect a complete exempt/excluded-income disclosure or all gross remittance categories. Taxable salary and net service income are not substitutes for gross remittance disclosures.
- Solar 513 remains null with the unused eligible balance as a reference. Historical acquisition cost at 511 and prior claims must be reconciled before preparing filing carry-forward values. The current eligible claim at 512 maps to main 70.
- APIT remains an aggregate input. Primary/secondary certificate and Table 08/self-paid allocations are not guessed. Advance-credit timing, withholding-agent/withholdee distinctions and individual payment rows also need manual reconciliation. Schedule 9's aggregate 912 is shown, but no assertion is made that its unpopulated detailed cages have been reconciled.
- Assets, liabilities, declarations, evidence, official filing rounding and practitioner approval are not captured. Format hints are conservative and require portal confirmation; no no-return-required decision is made.

Eleven passed arithmetic checks establish only internal consistency for the supported estimate. `mapping_complete`, `filing_ready` and `export_available` remain false. A review gap is not an instruction to send identifiers or unsupported documents to chat. There is no checklist acknowledgement, filing file, RAMIS interaction, payment or submission.

Original requirements and golden-case release gates remain unchanged. Full cage coverage, prior-year comparison, Schedule 7 verifier testing, the remaining independent golden cases and practitioner sign-off are still required before filing outputs can ship.
