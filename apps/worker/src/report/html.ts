import { DEFAULT_PROOF_LEVEL, type ProofLevel, type ReportReconciliation, recoveredLabel, reportReconciliation } from '@tp/ledger';
import { formatUsd, parseCents } from '@tp/money';
import { STAGE_LABELS, WRITE_OFF_TEXT, type WriteOffReason } from '@tp/triage';

import { type FigureColumns, brandedDocument, figureColumns } from './brand';
import type { AuditReportContent } from './content';
import { escapeHtml, escapeWithFigures } from './escape';

/**
 * The audit report as one self-contained HTML document, which the worker prints to PDF with Chromium
 * (PRD 15, Documents: "Playwright and Chromium for PDF export of reports and packets, in the worker
 * only"), set in the PaidWhole report frame (report/brand.ts): a Paper cover, then white pages with the
 * running header. Every figure carries its stage label; the headline is three numbers (actionable, payer
 * approved, recovered) with flagged and validated below them; anomalies are labelled investigatory and
 * sit in no total; the word "recovered" names only stage five (PRD 7). No claim number, patient or
 * date of birth appears: the PDF counts and totals; the line CSV beside it names the lines. Nothing
 * loads from outside the document.
 */

export { escapeHtml };

const usd = (value: string | null) => (value === null ? 'not estimated' : formatUsd(parseCents(value)));
const count = (value: number, noun: string) => `${String(value)} ${noun}${value === 1 ? '' : 's'}`;

/** A case's state in words, as the Cases screen says it. */
const CASE_STATE_WORDS: Readonly<Record<string, string>> = {
  open: 'open',
  submitted: 'submitted',
  awaiting_response: 'awaiting response',
  partially_resolved: 'partially resolved',
  resolved: 'resolved',
  closed_written_off: 'closed (written off)',
};

const REASON_TEXT: Readonly<Record<string, string>> = {
  BELOW_LINE_MATERIALITY: 'Below the per-line materiality',
  WINDOW_PASSED: 'Dispute window passed on the triage date',
  NO_WINDOW: 'No dispute window known',
  DEADLINE_UNVERIFIED: 'Deadline not verified',
  CLAIM_REVERSED: 'Claim reversed since it was priced',
  CLAIM_SUPERSEDED: 'Claim corrected since it was priced',
  MAPPING_NOT_IN_FORCE: 'Plan mapping corrected since it was priced (another agreement applies on the service date)',
  VERSION_NOT_SIGNED_OFF: 'Contract version corrected since it was priced',
  VERSION_NOT_IN_FORCE: 'Contract version no longer covers the service date (amended since it was priced)',
  RELEASE_WITHDRAWN: 'Rule release withdrawn since it was priced',
  PER_VISIT_REVIEW: 'Per-visit line, judged with its visit: held for the specialist’s review',
  NCCI_REVIEW: 'An NCCI procedure-to-procedure edit stands: held for review',
  BELOW_CASE_MATERIALITY: 'Pattern below the case materiality (accumulating)',
  CASE_LINE_FROM_OTHER_RUN: 'In a case through another run’s pricing of the line (counted in that run’s report)',
};

/** Why a validated line is not actionable, in words (the report and the Reports screen say it the same way). */
export function reasonText(reason: string): string {
  if (reason.startsWith('written_off:')) {
    return `Written off: ${WRITE_OFF_TEXT[reason.slice('written_off:'.length) as WriteOffReason]}`;
  }
  return REASON_TEXT[reason] ?? reason;
}

/** A table; `figures` names its columns (1-based) of codes and of amounts or counts, set in the mono face. */
function table(caption: string, headers: readonly string[], rows: readonly (readonly string[])[], empty: string, figures: FigureColumns = {}): string {
  if (rows.length === 0) {
    return `<p class="empty">${escapeHtml(empty)}</p>`;
  }
  const head = headers.map((header) => `<th scope="col">${escapeHtml(header)}</th>`).join('');
  const body = rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('');
  return `<table${figureColumns(figures)}><caption>${escapeHtml(caption)}</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

// The template's own pieces, in tokens (the frame's stylesheet sets the type, tables and colors).
const STYLE = `
  .pins { color: var(--pw-slate); font-size: 9pt; }
  .headline { display: flex; gap: 8pt; margin: 10pt 0 4pt; }
  .figure { flex: 1; border: 1px solid var(--pw-line); border-radius: 4px; padding: 8pt 10pt; }
  .figure .label { font-size: 8pt; font-weight: 500; color: var(--pw-slate); letter-spacing: 0.02em; }
  .figure .amount { font-family: var(--pw-font-mono); font-weight: 500; font-variant-numeric: tabular-nums; font-size: 15pt; margin-top: 2pt; }
  .figure .note { font-size: 7.5pt; color: var(--pw-slate); margin-top: 2pt; }
  .below { display: flex; gap: 8pt; }
  .below div { flex: 1; border: 1px dashed var(--pw-border-strong); border-radius: 4px; padding: 6pt 8pt; font-size: 9pt; }
  table { margin: 4pt 0 8pt; font-size: 8.5pt; }
  th, td { padding: 5pt 4pt; }
  .label-investigatory { font-weight: 600; }
  .empty { color: var(--pw-slate); font-style: italic; }
  footer { margin-top: 18pt; font-size: 8pt; color: var(--pw-slate); border-top: 1px solid var(--pw-line); padding-top: 4pt; }
`;

/**
 * The Verified gate for an audit report, from the ledger (docs/adr/0057): the report states its recovered
 * total (the recovery ledger's, for its cases' lines) and links no ledger entries, so the seal never prints
 * on it: a recovered total above zero with no linked entries is refused as differing from them.
 */
export function auditReconciliation(content: AuditReportContent, proofLevel: ProofLevel = DEFAULT_PROOF_LEVEL): ReportReconciliation {
  return reportReconciliation({
    report: { kind: 'audit_report', id: content.report_id },
    proofLevel,
    statedRecoveredCents: parseCents(content.headline.recovered_cents),
    recoveredEntryIds: [],
    ledger: new Map(),
  });
}

export function auditHtml(content: AuditReportContent, reconciliation: ReportReconciliation = auditReconciliation(content)): string {
  const { headline, run } = content;
  // Today's stage labels, not the ones the report stored when it was written.
  const labels = STAGE_LABELS;
  // Recovered names the practice's proof level, the one the gate judged it under: never "Recovered" alone.
  const level = reconciliation.proofLevel;
  const recovered = recoveredLabel(level);
  const approvedNone = parseCents(headline.payer_approved_cents) === 0n;
  const recoveredNone = parseCents(headline.recovered_cents) === 0n;
  const figures = [
    { label: labels.actionable, amount: headline.actionable_cents, note: `${count(headline.actionable_lines, 'line')} in cases still actionable, inside their dispute windows and above materiality` },
    { label: labels.payer_approved, amount: headline.payer_approved_cents, note: approvedNone ? 'accepted by the payer; no payer approval is recorded yet' : 'accepted by the payer, from the ledger’s entries; not cash until it posts' },
    {
      label: recovered,
      amount: headline.recovered_cents,
      note: recoveredNone ? `${level}, net of recoupments and reversals; nothing has ${level === 'deposited' ? 'been deposited' : 'posted'} yet` : `cash ${level}, from the ledger’s entries, net of recoupments and reversals`,
    },
  ];
  const sections: string[] = [];
  sections.push(`<section aria-label="Headline"><div class="headline">${figures
    .map((figure) => `<div class="figure"><div class="label">${escapeWithFigures(figure.label)}</div><div class="amount">${escapeHtml(usd(figure.amount))}</div><div class="note">${escapeWithFigures(figure.note)}</div></div>`)
    .join('')}</div><div class="below"><div><strong>${escapeWithFigures(labels.flagged)}:</strong> ${escapeWithFigures(count(headline.flagged_lines, 'line'))} short of their cohort's mode, a range of ${escapeWithFigures(usd(headline.flagged_range_low_cents))} to ${escapeWithFigures(usd(headline.flagged_range_high_cents))}; investigatory, never a claim and in no total.</div><div><strong>${escapeWithFigures(labels.validated)}:</strong> ${escapeWithFigures(usd(headline.validated_cents))} across ${escapeWithFigures(count(headline.validated_lines, 'line'))} priced under signed-off terms with a trace and paid below them; the actionable amount is the part of it in cases.</div></div></section>`);

  const coverageRows = content.coverage.reasons.map((entry) => [entry.reason, String(entry.lines), usd(entry.charge_cents), entry.remedy]);
  sections.push(
    `<section aria-label="Coverage"><h2>Coverage</h2><p>${escapeWithFigures(`${String(content.coverage.priced_lines)} of ${count(content.coverage.lines, 'line')} priced, ${usd(content.coverage.priced_charge_cents)} of ${usd(content.coverage.charge_cents)} billed.`)}</p>${table('Lines left unpriced, by reason', ['Reason', 'Lines', 'Billed', 'Remedy'], coverageRows, 'Every line priced.', { code: [1], amount: [2, 3] })}</section>`,
  );

  const anomalyRows = content.anomalies.map((item) => [
    'investigatory',
    item.payer,
    item.plan,
    [item.procedure_code, ...item.modifiers].join(' '),
    item.place_of_service ?? '',
    item.quarter,
    String(item.cohort_size),
    usd(item.modal_allowed_cents),
    String(item.flagged_lines),
    `${usd(item.range_low_cents)} to ${usd(item.range_high_cents)}`,
    item.reviewed ? 'yes' : 'no',
  ]);
  sections.push(
    `<section aria-label="Anomalies"><h2>Anomalies <span class="label-investigatory">(investigatory)</span></h2><p>Lines that cannot be priced yet, compared with their cohort: the same payer and plan, code and modifiers, place of service and quarter, at least ${escapeWithFigures(String(content.settings.anomaly_minimum_cohort))} lines. A line short of the modal allowed amount by more than ${escapeWithFigures(usd(content.settings.anomaly_threshold_cents))} is counted. The mode is not a contract rate: validate a cohort by obtaining its agreement, mapping its plan and pricing it.</p>${table('Cohorts', ['Label', 'Payer', 'Plan', 'Code', 'Place', 'Quarter', 'Lines', 'Modal allowed per unit', 'Short of the mode', 'Range', 'Reviewed'], anomalyRows, 'No cohort reaches the minimum size with a line short of its mode.', { code: [4, 5], id: [3], date: [6], amount: [7, 8, 9, 10] })}</section>`,
  );

  const patternRows = content.validated.patterns.map((item) => [item.payer, item.plan, item.mapping_kind === 'ma_noncontracted' ? 'Medicare Advantage non-contracted' : 'Contract', item.behavior_text, String(item.lines), usd(item.variance_cents)]);
  const notActionableRows = content.validated.not_actionable.map((item) => [reasonText(item.reason), String(item.lines), usd(item.variance_cents)]);
  sections.push(
    `<section aria-label="Validated discrepancies"><h2>${escapeWithFigures(labels.validated)} discrepancies</h2><p>${escapeWithFigures(`${count(content.validated.lines, 'line')} priced under signed-off terms and paid below them, ${usd(content.validated.variance_cents)} in all (expected allowed less observed allowed).`)}</p>${table('By payer pattern', ['Payer', 'Plan', 'Agreement', 'Adjustment behavior', 'Lines', 'Variance'], patternRows, 'No line was paid below its terms.', { id: [2], amount: [5, 6] })}${table('Validated, not actionable', ['Why', 'Lines', 'Variance'], notActionableRows, 'Every validated line is actionable.', { amount: [2, 3] })}<p>${escapeWithFigures(`Overpayments: ${count(content.overpaid.lines, 'line')}, ${usd(content.overpaid.variance_cents)}; recorded and shown, never pursued.`)}</p></section>`,
  );

  const caseRows = content.cases.map((item) => [
    item.payer,
    item.plan,
    item.behavior_text,
    // Its lines still actionable and their variance, the lines the headline sums (a report stored before the stages were read shows its share).
    `${String(item.actionable_now_lines ?? item.actionable_lines)} of ${String(item.lines)}`,
    usd(item.actionable_now_cents ?? item.actionable_cents),
    item.deadline_on ?? 'none open',
    `${count(item.case_lines, 'line')}, ${usd(item.case_actionable_cents)}`,
    usd(item.pursuit_cost_cents),
    usd(item.net_expected_cents),
  ]);
  sections.push(
    `<section aria-label="Actionable cases"><h2>${escapeWithFigures(labels.actionable)}: cases by payer pattern</h2><p>${escapeWithFigures(`A case groups the lines of one payer pattern (payer and plan, rate record, adjustment behavior) once they reach ${usd(content.settings.case_materiality_cents)}; a line counts at ${usd(content.settings.line_materiality_cents)} of variance or more, inside its dispute window. A case's total is the sum of its lines not written off; its deadline is the earliest open window among them. A pattern accumulates across runs, so a case may hold lines other runs priced: this report counts the lines this run priced, and the whole case is shown beside them. A line counts here while it is still actionable; once its payer approves it, it counts in the next section, beside its case's state.`)}</p>${table('Cases', ['Payer', 'Plan', 'Adjustment behavior', 'Lines counted (this run)', `${labels.actionable} (this run)`, 'Deadline (this run)', 'Whole case', 'Pursuit cost', 'Net expected'], caseRows, 'No pattern reaches the case materiality yet.', { id: [2], date: [6], amount: [4, 5, 7, 8, 9] })}<p>${escapeWithFigures(content.pursuit.estimated ? `Pursuit cost of the cases still actionable: ${usd(content.pursuit.cost_cents)}; net expected value ${usd(content.pursuit.net_expected_cents)}.` : 'Pursuit cost is not estimated: the practice has not set its staff rate and times.')}</p></section>`,
  );

  // Payer approved and recovered by case: the headline's two figures from the same cases' lines, the ledger's entries for them.
  const ledgerRows = content.cases.map((item) => [item.payer, item.plan, CASE_STATE_WORDS[item.state] ?? item.state, usd(item.payer_approved_cents ?? '0'), usd(item.recovered_cents ?? '0')]);
  const ledgerNone = approvedNone && recoveredNone;
  sections.push(
    `<section aria-label="${escapeHtml(`${labels.payer_approved} and ${recovered.toLowerCase()}`)}"><h2>${escapeWithFigures(`${labels.payer_approved} and ${recovered.toLowerCase()}`)}</h2><p>${escapeWithFigures(
      ledgerNone
        ? `Both come from the ledger's entries for these cases' lines: payer approved once a payer accepts a case's lines, ${recovered.toLowerCase()} only once their cash is ${level}. Neither had an entry when the report was generated.`
        : `Both come from the ledger's entries for these cases' lines this run priced: payer approved once a payer accepts them, ${recovered.toLowerCase()} only once their cash is ${level}, net of recoupments and reversals. The headline is the sum of each column.`,
    )}</p>${table('By case', ['Payer', 'Plan', 'State', `${labels.payer_approved} (this run)`, `${recovered} (this run)`], ledgerRows, 'No pattern reaches the case materiality yet.', { id: [2], amount: [4, 5] })}</section>`,
  );

  const gapRows = content.evidence_gaps.map((gap) => [gap.reason ?? gap.kind.replaceAll('_', ' '), gap.lines === 0 ? '' : String(gap.lines), gap.charge_cents === null ? '' : usd(gap.charge_cents), gap.detail, gap.remedy]);
  sections.push(`<section aria-label="Evidence gaps"><h2>Evidence gaps</h2>${table('What to obtain', ['Gap', 'Lines', 'Billed', 'What it means', 'Remedy'], gapRows, 'No evidence gap.', { code: [1], amount: [2, 3] })}</section>`);

  const pins = `Practice: ${content.practice.name}. Service dates ${run.period_from} to ${run.period_to}; pricing run ${run.pricing_run_id}, rule release ${String(run.release_no)} (manifest ${run.manifest_sha256.slice(0, 16)}), engine ${run.engine_version}. Windows and deadlines judged on ${content.as_of}.`;
  return brandedDocument(
    {
      title: 'Audit report',
      kicker: 'Contract-payment audit',
      heading: 'Audit report',
      subheading: `Service dates ${run.period_from} to ${run.period_to}`,
      practiceName: content.practice.name,
      meta: [`Service dates ${run.period_from} to ${run.period_to}`, `Pricing run ${run.pricing_run_id}`, `Rule release ${String(run.release_no)}, manifest ${run.manifest_sha256.slice(0, 16)}`, `Judged on ${content.as_of}`, `Report ${content.report_id}`],
      reference: `Report ${content.report_id}`,
      reconciliation,
      independenceClaim: true,
    },
    STYLE,
    `<header><p class="pins">${escapeWithFigures(pins)}</p></header>${sections.join('')}<footer>Every figure carries its stage. ${escapeWithFigures(recovered)} counts only cash ${escapeWithFigures(level)}, net of recoupments and reversals. This report is released only after a reimbursement reviewer signs an attestation naming this file's SHA-256. Report ${escapeWithFigures(content.report_id)}.</footer>`,
  );
}
