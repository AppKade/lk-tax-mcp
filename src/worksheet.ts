import { createHash } from 'node:crypto';
import type { reviewReturn } from './return-review.ts';
import { rules } from './rules.ts';

type Review = ReturnType<typeof reviewReturn>;
const gapCodes = (review: Review) => new Set(review.review_gaps.map(g => g.code));

// Acknowledgements bind to this digest, so any change to figures, gaps or flags requires a fresh acknowledgement.
export function checklistDigest(review: Review) {
  return createHash('sha256').update(JSON.stringify({
    rules: rules.version, mapping: review.mapping_version,
    cages: review.cages.map(c => [c.area, c.cage, c.amount, c.status]),
    gaps: review.review_gaps.map(g => g.code), flags: review.flags, alternatives: review.alternatives,
  })).digest('hex');
}

export function buildChecklist(review: Review) {
  const gaps = gapCodes(review);
  const items = [
    { id: 'preview_limits_understood', statement: 'I understand this is an unreviewed development preview estimate. It is not IRD-approved, not tax advice and not filing-ready, and official rounding is unverified. I will check every figure against the official return and portal.' },
    { id: 'scope_and_issues_read', statement: 'I have read the supported scenarios and known issues, and none of my circumstances is excluded or unsupported.' },
    { id: 'review_gaps_read', statement: 'I have read every unresolved review gap listed and will complete those fields manually from my own records. The worksheet leaves them unset.' },
    ...(gaps.has('APIT_BREAKDOWN_REQUIRED') || gaps.has('ADVANCE_CREDIT_DETAILS_REQUIRED') ? [
      { id: 'credits_reconciled', statement: 'I have reconciled APIT, AIT/WHT and instalment credits against my certificates and payment records, without overlap or final withholding.' }] : []),
    ...(review.flags.length ? [
      { id: 'calculation_flags_read', statement: 'I have read every calculation flag and interpretation alternative. The worksheet does not choose between interpretations.' }] : []),
  ];
  return { digest: checklistDigest(review), items };
}

const areaTitles: Record<string, string> = {
  return: 'Main return', schedule_5C: 'Schedule 5C', schedule_6A: 'Schedule 6A', schedule_8: 'Schedule 8', schedule_9: 'Schedule 9',
};
const cell = (text: string) => text.replaceAll('|', '/').replaceAll('\n', ' ');

// Plain text only: no identifiers, no file output. Cages follow the verified cage-map order, not a verified portal screen order.
export function renderWorksheet(review: Review, acknowledged: string[]) {
  const lines = [
    `# YA ${rules.ya} return worksheet (development preview)`, '',
    '> Unreviewed development preview estimate. Not IRD-approved, not tax advice and not filing-ready. Enter nothing from this worksheet without checking it against the official return and portal.', '',
    `Rule version ${rules.version} (${rules.review_status}). Cage mapping ${review.mapping_version} (${review.mapping_review_status}). Return format hint: ${review.return_format.suggestion}; portal eligibility is not confirmed.`, '',
    review.display_summary, '',
  ];
  for (const area of [...new Set(review.cages.map(c => c.area))]) {
    lines.push(`## ${areaTitles[area] ?? area}`, '', '| Cage | Label | Amount (LKR) | Status |', '|---|---|---|---|');
    for (const c of review.cages.filter(row => row.area === area))
      lines.push(`| ${c.cage} | ${cell(c.label)} | ${c.amount ?? 'enter manually'} | ${c.status} |`);
    lines.push('');
    const notes = review.cages.filter(c => c.area === area && (c.status === 'manual_review_required' || c.reference_amount !== null));
    for (const c of notes) lines.push(`- ${cell(c.cage)}: ${cell(c.note)}${c.reference_amount !== null ? ` Reference only, not a filing value: ${c.reference_amount}.` : ''}`);
    if (notes.length) lines.push('');
  }
  lines.push(`## Arithmetic checks (${review.checks.length} passed)`, '');
  for (const check of review.checks) lines.push(`- ${check.formula}: ${check.left} = ${check.right}`);
  lines.push('', '## Manual review gaps', '');
  for (const gap of review.review_gaps) lines.push(`- ${gap.code}${gap.targets.length ? ` (${gap.targets.join(', ')})` : ''}: ${cell(gap.detail)}`);
  if (review.flags.length) {
    lines.push('', '## Calculation flags and alternatives', '', `Flags: ${review.flags.join(', ')}.`);
    for (const alt of review.alternatives) lines.push(`- ${alt.interpretation}: tax ${alt.figures.tax}, foreign credit ${alt.figures.foreign_tax_credit}, balance payable ${alt.figures.balance_payable}, potential overpayment ${alt.figures.potential_overpayment}. Comparative interpretation only.`);
  }
  lines.push('', '## Acknowledged before generation', '', ...acknowledged.map(id => `- ${id}`), '');
  return lines.join('\n');
}
