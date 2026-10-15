import { formatUsd, parseCents } from '@tp/money';
import { WRITE_OFF_TEXT, type WriteOffReason } from '@tp/triage';

import type { AuditReportContent } from './content';

/**
 * The audit report as one self-contained HTML document, which the worker prints to PDF with Chromium
 * (PRD 15, Documents: "Playwright and Chromium for PDF export of reports and packets, in the worker
 * only"). Every figure carries its stage label; the headline is three numbers (actionable, payer
 * approved, recovered) with flagged and validated below them; anomalies are labelled investigatory and
 * sit in no total; the word "recovered" names only stage five (PRD 7). No claim number, patient or
 * date of birth appears: the PDF counts and totals; the line CSV beside it names the lines. Nothing
 * loads from outside the document.
 */

const ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
}

const usd = (value: string | null) => (value === null ? 'not estimated' : formatUsd(parseCents(value)));
const count = (value: number, noun: string) => `${String(value)} ${noun}${value === 1 ? '' : 's'}`;

const REASON_TEXT: Readonly<Record<string, string>> = {
  BELOW_LINE_MATERIALITY: 'Below the per-line materiality',
  WINDOW_PASSED: 'Dispute window passed on the triage date',
  NO_WINDOW: 'No dispute window known',
  CLAIM_REVERSED: 'Claim reversed since it was priced',
  CLAIM_SUPERSEDED: 'Claim corrected since it was priced',
  VERSION_NOT_SIGNED_OFF: 'Contract version corrected since it was priced',
  BELOW_CASE_MATERIALITY: 'Pattern below the case materiality (accumulating)',
};

/** Why a validated line is not actionable, in words (the report and the Reports screen say it the same way). */
export function reasonText(reason: string): string {
  if (reason.startsWith('written_off:')) {
    return `Written off: ${WRITE_OFF_TEXT[reason.slice('written_off:'.length) as WriteOffReason]}`;
  }
  return REASON_TEXT[reason] ?? reason;
}

function table(caption: string, headers: readonly string[], rows: readonly (readonly string[])[], empty: string): string {
  if (rows.length === 0) {
    return `<p class="empty">${escapeHtml(empty)}</p>`;
  }
  const head = headers.map((header) => `<th scope="col">${escapeHtml(header)}</th>`).join('');
  const body = rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('');
  return `<table><caption>${escapeHtml(caption)}</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

const STYLE = `
  @page { size: Letter; }
  * { box-sizing: border-box; }
  body { font-family: "Helvetica Neue", Arial, sans-serif; font-size: 10pt; color: #111; margin: 0; }
  h1 { font-size: 18pt; margin: 0 0 4pt; }
  h2 { font-size: 12.5pt; margin: 18pt 0 6pt; border-bottom: 1px solid #999; padding-bottom: 2pt; }
  p { margin: 4pt 0; }
  .pins { color: #444; font-size: 9pt; }
  .headline { display: flex; gap: 8pt; margin: 10pt 0 4pt; }
  .figure { flex: 1; border: 1.5px solid #111; padding: 8pt; }
  .figure .label { font-size: 9pt; text-transform: uppercase; letter-spacing: 0.04em; }
  .figure .amount { font-size: 17pt; font-weight: bold; margin-top: 2pt; }
  .figure .note { font-size: 8pt; color: #444; }
  .below { display: flex; gap: 8pt; }
  .below div { flex: 1; border: 1px dashed #777; padding: 6pt; font-size: 9pt; }
  table { width: 100%; border-collapse: collapse; margin: 4pt 0 8pt; font-size: 8.5pt; }
  caption { text-align: left; font-weight: bold; padding: 2pt 0; }
  th, td { border: 1px solid #bbb; padding: 3pt 4pt; text-align: left; vertical-align: top; }
  th { background: #eee; }
  .label-investigatory { font-weight: bold; text-transform: uppercase; }
  .empty { color: #555; font-style: italic; }
  footer { margin-top: 18pt; font-size: 8pt; color: #444; border-top: 1px solid #999; padding-top: 4pt; }
`;

export function auditHtml(content: AuditReportContent): string {
  const { headline, run } = content;
  const labels = headline.labels;
  const figures = [
    { label: labels.actionable, amount: headline.actionable_cents, note: `${count(headline.actionable_lines, 'line')} in cases, inside their dispute windows and above materiality` },
    { label: labels.payer_approved, amount: headline.payer_approved_cents, note: 'accepted by the payer; no payer response is recorded yet' },
    { label: labels.recovered, amount: headline.recovered_cents, note: 'posted, net of recoupments and reversals; nothing has posted yet' },
  ];
  const sections: string[] = [];
  sections.push(`<section aria-label="Headline"><div class="headline">${figures
    .map((figure) => `<div class="figure"><div class="label">${escapeHtml(figure.label)}</div><div class="amount">${escapeHtml(usd(figure.amount))}</div><div class="note">${escapeHtml(figure.note)}</div></div>`)
    .join('')}</div><div class="below"><div><strong>${escapeHtml(labels.flagged)}:</strong> ${escapeHtml(count(headline.flagged_lines, 'line'))} short of their cohort's mode, a range of ${escapeHtml(usd(headline.flagged_range_low_cents))} to ${escapeHtml(usd(headline.flagged_range_high_cents))}; investigatory, never a claim and in no total.</div><div><strong>${escapeHtml(labels.validated)}:</strong> ${escapeHtml(usd(headline.validated_cents))} across ${escapeHtml(count(headline.validated_lines, 'line'))} priced under signed-off terms with a trace and paid below them; the actionable amount is the part of it in cases.</div></div></section>`);

  const coverageRows = content.coverage.reasons.map((entry) => [entry.reason, String(entry.lines), usd(entry.charge_cents), entry.remedy]);
  sections.push(
    `<section aria-label="Coverage"><h2>Coverage</h2><p>${escapeHtml(`${String(content.coverage.priced_lines)} of ${count(content.coverage.lines, 'line')} priced, ${usd(content.coverage.priced_charge_cents)} of ${usd(content.coverage.charge_cents)} billed.`)}</p>${table('Lines left unpriced, by reason', ['Reason', 'Lines', 'Billed', 'Remedy'], coverageRows, 'Every line priced.')}</section>`,
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
    `<section aria-label="Anomalies"><h2>Anomalies <span class="label-investigatory">(investigatory)</span></h2><p>Lines that cannot be priced yet, compared with their cohort: the same payer and plan, code and modifiers, place of service and quarter, at least ${escapeHtml(String(content.settings.anomaly_minimum_cohort))} lines. A line short of the modal allowed amount by more than ${escapeHtml(usd(content.settings.anomaly_threshold_cents))} is counted. The mode is not a contract rate: validate a cohort by obtaining its agreement, mapping its plan and pricing it.</p>${table('Cohorts', ['Label', 'Payer', 'Plan', 'Code', 'Place', 'Quarter', 'Lines', 'Modal allowed per unit', 'Short of the mode', 'Range', 'Reviewed'], anomalyRows, 'No cohort reaches the minimum size with a line short of its mode.')}</section>`,
  );

  const patternRows = content.validated.patterns.map((item) => [item.payer, item.plan, item.mapping_kind === 'ma_noncontracted' ? 'Medicare Advantage non-contracted' : 'Contract', item.behavior_text, String(item.lines), usd(item.variance_cents)]);
  const notActionableRows = content.validated.not_actionable.map((item) => [reasonText(item.reason), String(item.lines), usd(item.variance_cents)]);
  sections.push(
    `<section aria-label="Validated discrepancies"><h2>${escapeHtml(labels.validated)} discrepancies</h2><p>${escapeHtml(`${count(content.validated.lines, 'line')} priced under signed-off terms and paid below them, ${usd(content.validated.variance_cents)} in all (expected allowed less observed allowed).`)}</p>${table('By payer pattern', ['Payer', 'Plan', 'Agreement', 'Adjustment behavior', 'Lines', 'Variance'], patternRows, 'No line was paid below its terms.')}${table('Validated, not actionable', ['Why', 'Lines', 'Variance'], notActionableRows, 'Every validated line is actionable.')}<p>${escapeHtml(`Overpayments: ${count(content.overpaid.lines, 'line')}, ${usd(content.overpaid.variance_cents)}; recorded and shown, never pursued.`)}</p></section>`,
  );

  const caseRows = content.cases.map((item) => [
    item.payer,
    item.plan,
    item.behavior_text,
    item.state === 'open' ? 'open' : 'closed (written off)',
    `${String(item.actionable_lines)} of ${String(item.lines)}`,
    usd(item.actionable_cents),
    item.deadline_on ?? 'none open',
    usd(item.pursuit_cost_cents),
    usd(item.net_expected_cents),
  ]);
  sections.push(
    `<section aria-label="Actionable cases"><h2>${escapeHtml(labels.actionable)}: cases by payer pattern</h2><p>${escapeHtml(`A case groups the lines of one payer pattern (payer and plan, rate record, adjustment behavior) once they reach ${usd(content.settings.case_materiality_cents)}; a line counts at ${usd(content.settings.line_materiality_cents)} of variance or more, inside its dispute window. A case's total is the sum of its lines not written off; its deadline is the earliest open window among them.`)}</p>${table('Cases', ['Payer', 'Plan', 'Adjustment behavior', 'State', 'Lines counted', labels.actionable, 'Deadline', 'Pursuit cost', 'Net expected'], caseRows, 'No pattern reaches the case materiality yet.')}<p>${escapeHtml(content.pursuit.estimated ? `Pursuit cost of the open cases: ${usd(content.pursuit.cost_cents)}; net expected value ${usd(content.pursuit.net_expected_cents)}.` : 'Pursuit cost is not estimated: the practice has not set its staff rate and times.')}</p></section>`,
  );

  const gapRows = content.evidence_gaps.map((gap) => [gap.reason ?? gap.kind.replaceAll('_', ' '), gap.lines === 0 ? '' : String(gap.lines), gap.charge_cents === null ? '' : usd(gap.charge_cents), gap.detail, gap.remedy]);
  sections.push(`<section aria-label="Evidence gaps"><h2>Evidence gaps</h2>${table('What to obtain', ['Gap', 'Lines', 'Billed', 'What it means', 'Remedy'], gapRows, 'No evidence gap.')}</section>`);

  const pins = `Practice: ${content.practice.name}. Service dates ${run.period_from} to ${run.period_to}; pricing run ${run.pricing_run_id}, rule release ${String(run.release_no)} (manifest ${run.manifest_sha256.slice(0, 16)}), engine ${run.engine_version}. Windows and deadlines judged on ${content.as_of}.`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Audit report</title><style>${STYLE}</style></head><body><header><h1>Audit report</h1><p class="pins">${escapeHtml(pins)}</p></header>${sections.join('')}<footer>Every figure carries its stage. ${escapeHtml(labels.recovered)} counts only cash posted, net of recoupments and reversals. This report is released only after a reimbursement reviewer signs an attestation naming this file's SHA-256. Report ${escapeHtml(content.report_id)}.</footer></body></html>`;
}
