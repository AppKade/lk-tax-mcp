# Implementation status

Updated: 2026-10-19. Foundation slice only. The original requirements and CSV remain the planning baseline.

| Backlog | Delivered in this slice | Remaining acceptance criteria |
|---|---|---|
| T1.1, T1.2 | Strict JSON rule validation, dated evidence, YA 2025/26 relief and progressive bands | TOML compatibility, full rule catalogue, reviewer sign-off and version-history lint |
| T2.1 | Bigint cents and exact percentage accumulation; unsupported YA fails | Official filing rounding policy and upstream APIT fixtures |
| T2.2 | Explicit writable facts; missing scope facts precede income; confirmed values not re-asked | Full dependency graph, placeholder semantics and all categories |
| T2.3, T2.6, T2.7 | Local salary/net profit/interest totals, confirmed credits, balance/overpayment, cited traces | Remaining categories, credits and comprehensive cage mapping |
| T3.2 | SC-01 through SC-09 checks and server-enforced refusal | Professional review of scope text; calculation support for partial cases |
| T5.2, T5.3 | Identifier-free schema, output guard and consent gate | Local identifier configuration, handles for documents and durable encrypted acceptance |
| T6.1, T6.2 | Official SDK stdio server, eight tools, output schema and error envelopes | Full core catalogue, current-protocol discovery conformance and host matrix |
| T10.1 | G1 verified against IRD Example 1, printed page 39 | G2 through G10 and full source verification of G11/G12 |
| T10.2, T10.4 | Band boundaries, monotonicity, consent/privacy regressions and real stdio test | Inspector CLI, full properties and schema hash governance |

No full backlog task above is marked complete when its original acceptance criteria remain unmet.

## Evidence correction

Primary IRD guide, Annexure 7, printed page 37 explicitly lists a lower first band and a capped balance for qualifying foreign-source income. The research note saying the low-income treatment lacks an IRD primary source is therefore incomplete. This does not establish how local and foreign buckets share that band in mixed-income cases. The initial local-income-only slice does not implement either foreign allocation interpretation.

Source: https://www.ird.gov.lk/en/Downloads/IT_Individuals_Doc/Asmt_IIT_004_2025_2026_E.pdf

## Deliberate first-slice limits

- Only YA 2025/26; no provisional copying into YA 2026/27.
- Local employment, local user-computed business net profit and interest only. All other income/claims block calculation.
- Credits are user-confirmed aggregates, not reconciled evidence. Potential overpayment is not a validated refund claim.
- Tax fractions accumulate exactly; the preview rounds once to cents, half up. Do not present this as verified RAMIS whole-rupee rounding.
- In-memory state only. Consent is re-required after restart, wipe or new session; no cleartext session storage exists.
- No Schedule 7, worksheet, payment output, document parsing, FX, encrypted draft, bundled Skill, npm release or signed extension yet.
- SDK and transitive dependencies are pinned in package-lock.json with integrity hashes, captured from successful GitHub CI. CI uses npm ci. Type checking and all ten tests passed on Node 22 and 24, including the stdio host workflow.
- Scope and intake mutations use accurate mutation annotations, despite the research suggesting every tool be read-only. No tool alters external services.

## Next implementation work

1. Expand protocol tests to current-protocol discovery and verify supported host behaviour.
2. Add remaining primary-source golden fixtures and complete local reliefs/QPs before expanding calculations.
3. Implement and review foreign buckets, both mixed-income interpretations and FTC limits.
4. Verify filing-obligation law from primary sources before exposing a no-return-required decision.
5. Obtain IRD Schedule 7 verifier/template and validate cage map and rounding.
6. Add export verification checklist, then worksheet/payment summaries after all P0 golden cases pass.
7. Package npm and signed desktop extension only after release gates pass.

Practitioner review, unresolved allocation questions and verifier samples need human evidence. They do not block this foundation work, but they block claiming a filing-ready release. No message has been sent to IRD or an external contributor.
