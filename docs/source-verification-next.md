# Remaining source verification

Checked 2026-10-20. This is a development evidence note, not payment advice or a validated Schedule 7 export specification.

## Schedule verifier

The official [Tools index](https://www.ird.gov.lk/en/Downloads/SitePages/Tools.aspx?menuid=1605), last updated 01-04-2026, currently links two packages. Both were downloaded completely and inspected as ZIP archives without executing binaries or macros.

| Linked package | Archive bytes | SHA-256 |
|---|---|---|
| [V 5_13](https://www.ird.gov.lk/en/Downloads/Lists/Tools/Attachments/7/Schedule_File_Verifier_V_5_13.zip) | 5,141,223 | `bd23b7b26083123bb2d22dfa592acf3289e2cab8788b5ec69fe6e665c941c37e` |
| [V 5_20](https://www.ird.gov.lk/en/Downloads/Lists/Tools/Attachments/1/Schedule_File_Verifier_V_5_20.zip) | 5,256,336 | `aed7129da611ef07fc57860b83233ab43db10ddca971f19f87c9b44c263a7bf4` |

Both contain `ScheduleFileVerifier.exe`, DLLs and a configuration targeting **.NET Framework 4.5**. The 5_13 archive additionally contains IIT CSV/XLSM templates. The 5_20 archive contains no template directory. The index alone does not prove which build is correct for the intended year and schedule. Do not select a build only because its number looks newer.

The original IIT CSV template in 5_13 is `Templates/TIN_IIT_WHTSCHEDULE_PERIOCODE_YYYYMMDD_ORIGINAL_V1.csv` (254 bytes, SHA-256 `00cb4edfad228157c7416b60e9bc0eed1843932c1e0178d1a6ad624b1c3443f6`). It contains only one header row with these 11 columns, in order:

1. Serial No
2. Type of Payment (source has a trailing space)
3. Name of Withholder
4. Withholding agent's TIN
5. Year of Assessment
6. Amount Received (Rs.)
7. Rate of WHT (%)
8. WHT deducted by withholding Agent (Rs) (A)
9. Claimed during the Period (Rs.) (B)
10. C/F Value (Rs.)(C= A - B )
11. WHT Certificate No.

The header's actual dash in column 10 is byte `0x96`, which decodes as an en dash in Windows-1252 and is invalid UTF-8. The file ends with CRLF. The list above uses an ASCII hyphen for readability. This observes the downloaded template's bytes, not an assertion that the verifier requires that encoding or exact header text. The amendment CSV adds `Amendment Indicator` before these columns (274 bytes, SHA-256 `7b9b89822561232a9fd3b363ae06f2d610becbe83594cba8ba51e207013dd314`). Neither header-only CSV establishes data-row date syntax or accepted type codes. The source filename itself spells `PERIOCODE`; do not infer a filename generator from that placeholder.

The current [Schedules index](https://www.ird.gov.lk/en/Downloads/SitePages/Schedules.aspx?menuid=1604) separately links an [IIT XLSM workbook](https://www.ird.gov.lk/en/Downloads/Schedules_IIT_1819/TIN_IIT_WHTSCHEDULE_PERIODCODE_YYYYMMDD_ORIGINAL_V1.xlsm) under the section effective 01-04-2020. That separate workbook has not been validated here. No macros were run and no taxpayer sample was created.

**Still required:** run the appropriate official GUI on Windows with entirely synthetic original/amendment cases, capture accepted filenames, payment-type codes, date/decimal/encoding rules and actual error messages, then record a passing sample. This Linux workspace has no Windows GUI, Wine, Mono or .NET runtime available. No pass through the official verifier is claimed. T14.1 remains partial and T8.2 remains blocked.

## Rounding and payments

The complete [YA 2025/26 return guide](https://www.ird.gov.lk/en/Downloads/IT_Individuals_Doc/Asmt_IIT_004_2025_2026_E.pdf) was searched for an explicit rounding instruction; that search did not establish one. Existing cent rounding remains an unreviewed assumption. A guide search is not proof that no rounding rule exists elsewhere.

The official [OTPP page](https://www.ird.gov.lk/en/publications/SitePages/Online_Pay_OTP.aspx?menuid=1416) links an [online payment guide](https://www.ird.gov.lk/en/eServices/Lists/PaymentRefund/Attachments/7/User_Guide_for_IRD_Online_Payment_E.pdf) and a [DIN page](https://www.ird.gov.lk/en/publications/SitePages/ramis_pay_din.aspx?menuid=141602). The retrieved DIN page lists historical 2021/22 periods, not current supported-year codes. Do not extrapolate current payment periods or produce a taxpayer DIN from those examples. The OTPP page carries a 2023 update date, so bank/channel instructions need a current source check before implementation.

T8.4 still needs current supported-year period codes, tax-type confirmation, a complete current payment guide, rounding evidence and practitioner review before presenting an actionable payment summary. No payment tool, credentials, DIN retrieval, banking interaction or automated payment is introduced.

## Release sequence

1. Complete primary-source cases and rounding/payment verification. Obtain qualified review for the recorded charity and foreign-income interpretation issues.
2. Finish installed-host and model-driven evaluations. Automated Inspector support does not certify a desktop host or its model.
3. The npm executable, package allowlist and installed-package check are now prepared in the private preview (see [installation](installation.md)). Complete license/registry decisions, provenance and signed desktop bundles after release gates pass. No registry publish or signing step is configured.

Original requirements and backlog remain the planning baseline. Source downloads and versioned tests do not constitute professional sign-off.
