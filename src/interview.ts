import { scopeSchema, checkKnownScope, type ScopeFacts } from './scope.ts';
import { incomeSchema, deductionsSchema, type IncomeFacts, type DeductionFacts } from './engine.ts';
import { foreignSchema, knownForeignBlock, type ForeignFacts } from './foreign.ts';
import { cents } from './money.ts';

export type InterviewFacts = {
  scope?: Partial<ScopeFacts>; income?: Partial<IncomeFacts>;
  foreign?: Partial<ForeignFacts>; deductions?: Partial<DeductionFacts>;
};
const foreignAmounts = ['employment_lkr', 'service_net_lkr', 'foreign_tax_paid'] as const;
const foreignFlags = ['received_in_foreign_currency', 'remitted_via_licensed_bank', 'foreign_employer_confirmed',
  'services_used_outside_lk', 'fx_conversion_confirmed', 'credit_eligibility_confirmed', 'single_source_confirmed'] as const;
const commonEligibility = ['received_in_foreign_currency', 'remitted_via_licensed_bank', 'fx_conversion_confirmed'] as const;

export function foreignRequirements(f: Partial<ForeignFacts>) {
  const missingAmounts = foreignAmounts.filter(k => f[k] === undefined);
  // Resolve every monetary selector first. No absent amount is ever interpreted as zero.
  if (missingAmounts.length) return { status: 'placeholder' as const, required: [...foreignAmounts] as (keyof ForeignFacts)[], not_applicable: [] as string[] };
  const required: (keyof ForeignFacts)[] = [...foreignAmounts];
  const employment = cents(f.employment_lkr!), services = cents(f.service_net_lkr!), paid = cents(f.foreign_tax_paid!);
  if (employment + services > 0n) required.push(...commonEligibility);
  if (employment > 0n) required.push('foreign_employer_confirmed');
  if (services > 0n) required.push('services_used_outside_lk');
  if (paid > 0n) required.push('credit_eligibility_confirmed', 'single_source_confirmed');
  return { status: 'resolved' as const, required, not_applicable: foreignFlags.filter(k => !required.includes(k)).map(k => `foreign.${k}`) };
}
export function resolveForeign(f: Partial<ForeignFacts>): ForeignFacts {
  const requirements = foreignRequirements(f);
  if (requirements.required.some(k => f[k] === undefined)) throw new Error('MISSING_FOREIGN_FACTS');
  // Neutral booleans for proven-inapplicable conditions exist only in this computation input.
  // They are not stored as user answers. Monetary values never receive defaults.
  const flags = Object.fromEntries(foreignFlags.map(k => [k, f[k] ?? false]));
  return foreignSchema.parse({ ...f, ...flags });
}

const groups = { scope: scopeSchema, income: incomeSchema, foreign: foreignSchema, deductions: deductionsSchema };
export const factDictionary = Object.entries(groups).flatMap(([group, schema]) => Object.entries(schema.shape).map(([key, field]) => ({
  path: `${group}.${key}`, kind: 'writable' as const,
  required_by_schema: !field.isOptional(),
  type: group === 'scope' || (group === 'income' && key === 'other_income_or_claims') || (group === 'foreign' && !foreignAmounts.includes(key as typeof foreignAmounts[number])) ? 'boolean' : 'lkr_decimal_string',
  description: field.description ?? 'Explicitly confirmed fact; missing is not false or zero.',
})));
export const interviewPolicy = {
  version: '2025.26.intake.2',
  states: {
    complete: 'All currently required inputs are confirmed, or confirmed facts establish a blocking result. Inspect the boolean value.',
    incomplete: 'The active dependency set is known but contains unanswered writable facts.',
    placeholder: 'Foreign monetary selectors are unanswered, so the eligibility dependency set is not yet resolved. No provisional tax amount is returned.',
  },
  order: ['scope_ready', 'income_ready', 'foreign_ready', 'deductions_ready'],
  result: 'return_ready is intake readiness only. Financial validation and professional review still apply during computation.',
  foreign_conditions: [
    'All three foreign amounts always require confirmation, including zeros.',
    'Positive foreign income requires receipt, remittance and LKR conversion confirmations.',
    'Positive salary additionally requires foreign employer confirmation; positive services require use-outside-LK confirmation.',
    'Positive foreign tax requires credit eligibility and single-source confirmations.',
    'Unneeded booleans are not collected or stored; zero amounts are never inferred.',
  ],
  scope_hints: 'Legacy calculation-dependent hints are optional and never requested. Computation derives foreign income, first-band position and credit ceilings from confirmed amounts.',
};
type Evaluation = {
  id: string; kind: 'derived'; status: 'complete' | 'placeholder' | 'incomplete'; value: boolean | null;
  missing_facts: string[]; trace: { policy_version: string; formula: string; children: string[] };
};
export function evaluateInterview(facts: InterviewFacts) {
  function node(id: string, paths: string[], missing: string[], placeholder = false): Evaluation {
    return { id, kind: 'derived', status: placeholder ? 'placeholder' : missing.length ? 'incomplete' : 'complete',
      value: placeholder || missing.length ? null : true, missing_facts: missing,
      trace: { policy_version: interviewPolicy.version, formula: 'all currently required writable facts are confirmed', children: missing.length ? missing : paths } };
  }
  const knownScope = checkKnownScope(facts.scope ?? {});
  const scopeBlock = knownScope.status === 'out_of_scope';
  const blockingError = scopeBlock ? 'OUT_OF_SCOPE' :
    facts.scope?.business_profit_needs_computation ? 'BUSINESS_PROFIT_REQUIRED' :
    facts.scope?.multiple_foreign_tax_countries || facts.scope?.preparing_for_clients || facts.income?.other_income_or_claims ? 'FEATURE_NOT_IMPLEMENTED' :
    knownForeignBlock(facts.foreign ?? {});
  const requirements = foreignRequirements(facts.foreign ?? {});
  const evaluations = Object.entries(groups).map(([group, schema]) => {
    const values = facts[group as keyof InterviewFacts] as Record<string, unknown> | undefined;
    const keys = group === 'foreign' ? requirements.required : Object.entries(schema.shape).filter(([, field]) => !field.isOptional()).map(([key]) => key);
    const paths = keys.map(k => `${group}.${k}`);
    return node(`${group}_ready`, paths, keys.filter(k => values?.[k] === undefined).map(k => `${group}.${k}`), group === 'foreign' && requirements.status === 'placeholder');
  });
  const blockingNode = scopeBlock || facts.scope?.business_profit_needs_computation || facts.scope?.multiple_foreign_tax_countries || facts.scope?.preparing_for_clients ? 'scope_ready' :
    facts.income?.other_income_or_claims ? 'income_ready' : 'foreign_ready';
  if (blockingError) {
    const blocked = evaluations.find(n => n.id === blockingNode)!;
    const group = blockingNode.replace('_ready', '') as keyof InterviewFacts;
    blocked.status = 'complete'; blocked.value = false; blocked.missing_facts = [];
    blocked.trace = { policy_version: interviewPolicy.version, formula: 'confirmed facts establish a blocking condition; remaining answers cannot make this condition supported',
      children: Object.keys(facts[group] ?? {}).map(k => `${group}.${k}`) };
  }
  const active = evaluations.find(n => n.status !== 'complete');
  const root = node('return_ready', evaluations.map(n => n.id), active?.missing_facts ?? [], active?.status === 'placeholder');
  if (active) root.trace.children = [active.id];
  if (blockingError) {
    root.status = 'complete'; root.value = false; root.missing_facts = [];
    root.trace = { policy_version: interviewPolicy.version, formula: 'a confirmed exclusion or unsupported condition blocks intake; no more facts requested',
      children: [blockingNode] };
  }
  return {
    status: scopeBlock ? 'out_of_scope' as const : blockingError ? 'blocked' as const : active ? 'incomplete' as const : 'complete' as const,
    calculation_performed: false, filing_ready: false, interview_policy_version: interviewPolicy.version,
    missing_facts: blockingError ? [] : active?.missing_facts ?? [],
    questions: (blockingError ? [] : active?.missing_facts ?? []).map(path => {
      const fact = factDictionary.find(f => f.path === path)!;
      return { path, type: fact.type, question: fact.description };
    }),
    stage: blockingError ? 'blocked' : active?.id.replace('_ready', '') ?? 'ready',
    blocking_error: blockingError ?? null,
    not_applicable_facts: requirements.not_applicable,
    evaluations: [...evaluations, root],
    guidance: blockingError ? 'Stop collecting facts. Read the corresponding error guidance and seek professional review. Only correct a fact when the user confirms a genuine correction; do not erase income or claims to bypass this block.' :
      'Ask only for missing_facts. Confirm every requested zero and boolean. Readiness is not a tax estimate or filing decision; computation revalidates financial rules.',
  };
}
