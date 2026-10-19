# Instalment rule evidence

Verified: 2026-10-19. Rule version: 2026.27.1. Review status: unreviewed.

Primary source: [IRD SEC/2026/E/06, re-revised 12 August 2026](https://www.ird.gov.lk/en/publications/Circulars_Circulars/SEC_2026_E_06_ReRiv_E.pdf).

The official circular index lists this revision after the 6 August version linked in the original research. It applies only to YA 2026/27. The complete 16-page PDF was retrieved through an ephemeral GitHub Actions evidence capture, then SHA-256 checked. The PDF contains scanned pages; OCR was supplemented by visual inspection of the highlighted rules on printed pages 4, 5, 7, 10 and 11. The capture workflow is removed from the implementation branch. No taxpayer documents were used.

- Bytes: 2,281,315.
- SHA-256: `4889d4b3647ef0d0d397e1669edd8db7c17611f27ea75087d7e73e2c5b98de23`.

| Rule | Printed page locator | Implementation |
|---|---|---|
| Quarterly formula and B | 1-2, section 1 | Gross-tax A minus reconciled current-year C, divided by remaining instalments including the current one |
| Standard basis | 2-4, Method 1 | User-confirmed preceding-year gross tax, before credits |
| No income and alternatives | 4-8, Method 2(i)-(iv) | Method-specific confirmations; A calculated independently under the prescribed basis |
| Final SET concession | Highlighted text, 5 and 7 | Quarter one only before return finalisation; return basis from quarter two; one SET-to-return revision |
| Credit schedules | 9, section 3(1) | Month-end deadlines remain distinct from attachment deadline |
| Full-year APIT and employee exceptions | 9-10, section 3(2), Example 6 | Deducted plus expected remaining APIT/AIT; no automatic exception decision |
| Foreign credits | 10, section 3(3) | Unsupported in this planner pending eligibility and basis review |
| Attachments | Highlighted text, 11, section 3(5) | 30 November 2026 for required Attachments 1/2 and revised Attachment 1 |
| Mid-year switch | 11, section 3(6) | Confirm timely CDMU notice before 31 October, 31 January or 30 April; preview supports switch to 2(iii) |

The six source examples are recorded in `test/fixtures/ird-instalments-2026-27.json` with page locators. Corporate tables use thousands of rupees and are converted to LKR for arithmetic fixtures only. No corporate computation is exposed through MCP.

All A amounts are explicitly supplied and confirmed under the selected method. The planner does not establish loss availability, exemption expiry, a valid new-taxpayer status, rates for a current-year estimate or a properly filed notice. SET revision history is confirmed by the user, not persisted or verified. Other scope exclusions still apply, including unsupported losses and special-rate business. If the facts cannot establish eligibility or A, obtain professional assistance rather than treating this as an annual tax engine.

Preview cent ceiling, zero-flooring of an excess-credit balance and restricting mid-year switching to Method 2(iii) are explicit implementation policies. Cent ceiling is conservative but has no verified official rounding authority. Excess credits are not a refund decision. Payment dates reproduce the circular without an inferred weekend extension. No payment codes are inferred from older research. Supporting-document submission, employment exception eligibility, Method 3 requests and filing obligations remain manual.
