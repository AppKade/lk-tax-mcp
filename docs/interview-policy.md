# Interview dependency policy

Policy `2025.26.intake.2` applies to the implemented YA 2025/26 annual interview. It changes question selection, not tax rates or legal eligibility rules. The existing calculation pipeline and all its financial refusals remain authoritative.

The writable dictionary is generated from the accepted scope, income, foreign and deduction schemas and published at `lktax://facts/2025-26`. Derived readiness cannot be set through `lk_set_facts`. The order is scope, income, foreign and deductions. Only missing writable facts of the active dependency are returned as the next questions; confirmed facts are not re-asked.

Progress includes plain-language `questions` and a detached `confirmed_facts` snapshot. Missing values stay absent; only actually entered aggregate values are returned. The caller cannot mutate session facts through the snapshot. This is an existing-session review feature, not persisted drafts or evidence verification.

The three legacy scope hints `foreign_credit_exceeds_cap`, `qualifying_foreign_income` and `local_taxable_below_first_band` remain accepted for compatibility but are optional and never requested. They are not defaulted or saved as answers. Computation derives the final flags from actual confirmed amounts. All eleven other scope fields remain explicit, as do every required monetary zero and relevant eligibility confirmation.

Before computation, the host reviews year, gross versus net income, duplicate documents and replacement certificates with the user. The pre-worksheet checklist requires a matching evidence-reconciliation statement. The server still has no document ingestion or verification capability.

| Readiness status | Meaning |
|---|---|
| `complete` | The current input set is confirmed. A false value means a confirmed blocking condition decides that branch. |
| `incomplete` | The required dependency set is known, but some of its writable inputs are unanswered. |
| `placeholder` | Foreign monetary selectors are unanswered, so the eligibility dependency set cannot yet be determined. Value is null; there is no provisional tax figure. |

`return_ready` describes intake readiness only. Every progress response has `calculation_performed: false` and `filing_ready: false`. Complete intake may still produce a financial refusal, such as ambiguous charity caps. The engine recomputes scope, amounts, eligibility, credits and financial constraints when asked to calculate.

## Conditional foreign questions

Always confirm `employment_lkr`, `service_net_lkr` and `foreign_tax_paid`, including explicit zeros. Unknown money is never treated as zero.

| Confirmed condition | Additional confirmations |
|---|---|
| Any positive foreign employment or services | Receipt in foreign currency, licensed-bank remittance and LKR conversion |
| Positive foreign employment | Foreign employer |
| Positive foreign services | Services used outside Sri Lanka |
| Positive foreign tax paid | Credit eligibility and single-source status |

When all three amounts are zero, none of the seven foreign boolean questions decides the result. The response lists those paths as `not_applicable_facts`. The strict annual engine still receives a full input object: neutral false values for skipped booleans exist only inside this ephemeral computation input. They are not represented as user-confirmed facts and are never saved to the session. Computation returns `intake_context` identifying inapplicable paths and the exact uncollected booleans materialised as neutral values. Existing explicit answers are distinguished from those neutral defaults.

Editing a zero amount to a positive amount reactivates unanswered eligibility questions. If the user previously answered a boolean explicitly, that answer is retained. A contradictory false eligibility answer then requires professional review or a genuine user-confirmed correction. The server never silently deletes or flips an answer to make a case pass.

## Early blockers

A confirmed scope exclusion can determine an out-of-scope result even while other scope answers remain unknown. Likewise, unsupported income/claims, unsupported client preparation or multi-country credit scope, and known foreign eligibility failures stop intake before unrelated facts are requested. The same scope and foreign predicates serve intake and computation to prevent conflicting eligibility logic.

`blocked` and `out_of_scope` responses have empty `missing_facts`, a false root readiness value and fixed `blocking_guidance`. Stop collecting facts. Do not erase income, credits or claims to get past a refusal. A legitimate correction re-evaluates dependencies from the remaining confirmed answers.

No financial defaults, no optional monetary zeros, no tax calculation from placeholder data, no automatic consent and no persistence are introduced. Full partial evaluation of the monetary fact graph, broader income categories and installed-host behaviour evaluation remain future work.
