import { DEFAULT_PROOF_LEVEL, type ReportReconciliation, reportReconciliation } from '@tp/ledger';
import { formatCents, formatUsd, parseCents } from '@tp/money';
import { UNPRICED_REASONS } from '@tp/pricing';
import { STAGE_LABELS } from '@tp/triage';
import { z } from 'zod';

import { type FigureColumns, brandedDocument, figureColumns } from './brand';
import { type CsvCell, csvDocument } from './csv';
import { escapeHtml, escapeWithFigures } from './escape';
import { UNPRICED_REMEDIES } from './remedies';

/**
 * The v1 reports' printed documents (PRD 5, J12; PRD 6, Reports and exports; PRD 7, Reports;
 * docs/adr/0040 and 0045): the coverage report (the Coverage screen of the run in effect) and a
 * month's variance summary. A person generates one in the web app, which reads its figures with the
 * screens' own queries and stores them as generated (report_document.content); the worker prints the
 * stored figures to PDF through the audit report's Chromium pipeline, and the CSV is computed from the
 * same stored figures on every download, so the PDF, the CSV and the document's page always agree.
 *
 * Counts and integer cents as text only, with codes and the payers' and plans' names the 835s carry; no
 * patient, claim or line identifier fits, so neither file is a line-level export. Every figure carries
 * its stage or its coverage label; no figure adds one stage to another, and "recovered" names only
 * stage five, whose dollars (with payer approved's) are the recovery ledger's and never this document's.
 */

export const COVERAGE_REPORT_FORMAT = 'tp-coverage-report/1';
export const MONTHLY_SUMMARY_FORMAT = 'tp-monthly-summary/1';

const count = z.number().int().nonnegative();
const centsText = z.string().regex(/^-?(?:0|[1-9]\d*)$/);
const nonNegativeCents = z.string().regex(/^(?:0|[1-9]\d*)$/);
const day = z.iso.date();
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const name = z.string().max(200);

const totals = z.strictObject({ lines: count, claims: count, charge_cents: nonNegativeCents, paid_cents: centsText });

export const coverageReportSchema = z.strictObject({
  format: z.literal(COVERAGE_REPORT_FORMAT),
  /** The day (UTC) its figures were read. */
  generated_on: day,
  /** The run in effect its shares and reasons come from; null before any run took effect. */
  run: z.strictObject({ id: z.uuid(), period_from: day, period_to: day, release_no: z.number().int().positive(), completed_at: z.string() }).nullable(),
  /** Every line the practice holds. */
  lines: totals,
  /** The run's lines priced, and the lines and billed dollars they are a share of (the run's, or every line's before a run). */
  priced: z.strictObject({ lines: count, charge_cents: nonNegativeCents }),
  of: z.strictObject({ lines: count, charge_cents: nonNegativeCents }),
  /** Every reason of the closed list, in its order, with the run's count of it (zero before a run). */
  reasons: z.array(z.strictObject({ reason: z.enum(UNPRICED_REASONS), lines: count })).length(UNPRICED_REASONS.length),
  /** Lines with no mapping on their service date, in all and by plan, the most billed first. */
  waiting: totals,
  waiting_plans: z.array(z.strictObject({ plan_id: z.uuid(), payer_name: name, plan_key: name, lines: count, claims: count, charge_cents: nonNegativeCents, paid_cents: centsText })),
  /** Whether a run over every line would start now (MAP-01), by the run's own guard. */
  readiness: z.strictObject({ allowed: z.boolean(), unmapped_plans: count }),
  pricing_runs: count,
});
export type CoverageReportContent = z.infer<typeof coverageReportSchema>;

/** The summary's buckets: the five stages, then the month's other lines (the monthly summary's own). */
export const SUMMARY_BUCKET_CODES = ['flagged', 'validated', 'actionable', 'payer_approved', 'recovered', 'priced', 'overpaid', 'unpriced', 'not_priced'] as const;
export type SummaryBucketCode = (typeof SUMMARY_BUCKET_CODES)[number];

const figure = z.strictObject({ lines: count, billed_cents: nonNegativeCents, variance_cents: centsText.nullable() });
const summaryRow = z.strictObject({
  payer_id: z.uuid().nullable(),
  payer_name: name.nullable(),
  figures: z.strictObject(Object.fromEntries(SUMMARY_BUCKET_CODES.map((bucket) => [bucket, figure])) as Record<SummaryBucketCode, typeof figure>),
  written_off: figure,
});

/**
 * A packet version approved by its own writer in a single-user practice, after the 24-hour delay (PRD 12,
 * Approval: "a 24-hour delay and an audit flag instead, and the gap is shown in the report"; CAS-10):
 * opaque IDs, the day it was approved and how long after it was written.
 */
const approvedAlone = z.strictObject({ packet_version_id: z.uuid(), case_id: z.uuid(), approved_on: day, hours_waited: count });
export type ApprovedAloneRow = z.infer<typeof approvedAlone>;

export const monthlySummarySchema = z.strictObject({
  format: z.literal(MONTHLY_SUMMARY_FORMAT),
  generated_on: day,
  month,
  total: summaryRow,
  by_payer: z.array(summaryRow),
  /** Every packet of the practice approved alone, as of the day generated (absent in a summary generated before it was recorded). */
  approved_alone: z.array(approvedAlone).optional(),
});
export type MonthlySummaryContent = z.infer<typeof monthlySummarySchema>;
export type MonthlySummaryRow = z.infer<typeof summaryRow>;

export type ReportDocumentContent = CoverageReportContent | MonthlySummaryContent;
export type ReportDocumentKind = 'coverage' | 'monthly_summary';

/** Reads a stored document's figures for its kind; throws a ZodError naming the field that fails. */
export function parseReportDocument(kind: 'coverage', content: unknown): CoverageReportContent;
export function parseReportDocument(kind: 'monthly_summary', content: unknown): MonthlySummaryContent;
export function parseReportDocument(kind: ReportDocumentKind, content: unknown): ReportDocumentContent;
export function parseReportDocument(kind: ReportDocumentKind, content: unknown): ReportDocumentContent {
  return kind === 'coverage' ? coverageReportSchema.parse(content) : monthlySummarySchema.parse(content);
}

/** The words for a monthly summary's buckets: the plan's five stage labels, then the month's other lines. */
export const SUMMARY_BUCKET_LABELS: Readonly<Record<SummaryBucketCode, string>> = {
  ...STAGE_LABELS,
  priced: 'Priced, no shortfall in a stage',
  overpaid: 'Overpaid (recorded, not pursued)',
  unpriced: 'Unpriced (a reason on file)',
  not_priced: 'Not priced by a run yet',
};

/** Stages whose dollars this document carries (variance of the priced line the stage names); payer approved and recovered are the ledger's. */
export const SUMMARY_DOLLAR_BUCKETS: ReadonlySet<SummaryBucketCode> = new Set(['validated', 'actionable']);

/** A share of a whole as a percentage with one decimal, from integers (no float on an amount), as the Coverage screen shows it. */
export function shareText(part: number | string, whole: number | string): string {
  const total = BigInt(whole);
  if (total === 0n) {
    return '0%';
  }
  const tenths = (BigInt(part) * 1000n + total / 2n) / total;
  return `${(tenths / 10n).toString()}.${(tenths % 10n).toString()}%`;
}

const usd = (cents: string) => formatUsd(parseCents(cents));
const plural = (value: number, noun: string) => `${String(value)} ${noun}${value === 1 ? '' : 's'}`;

// ---------------------------------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------------------------------

export const COVERAGE_CSV_COLUMNS = ['section', 'item', 'name', 'lines', 'claims', 'billed', 'paid', 'share'] as const;
export const MONTHLY_CSV_COLUMNS = ['month', 'payer', 'stage', 'lines', 'billed', 'variance'] as const;

const text = (value: string): CsvCell => ({ text: value });
const number = (value: number): CsvCell => ({ number: String(value) });
const dollars = (cents: string | null): CsvCell => ({ number: cents === null ? '' : formatCents(parseCents(cents)) });

/**
 * The coverage report as CSV: the priced share, each unpriced reason with its count, the dollars
 * waiting on mappings in all and by plan, and the run they come from. Counts and dollars stay numbers;
 * payer and plan names go through the exports' one text encoder.
 */
export function coverageReportCsv(content: CoverageReportContent): string {
  const rows: CsvCell[][] = [
    [
      text('run'),
      text(content.run?.id ?? ''),
      text(content.run === null ? 'no run in effect' : `${content.run.period_from} to ${content.run.period_to}, rule release ${String(content.run.release_no)}`),
      { number: '' },
      { number: '' },
      { number: '' },
      { number: '' },
      { number: '' },
    ],
    [text('priced'), text('lines'), text('priced lines'), number(content.priced.lines), { number: '' }, dollars(content.priced.charge_cents), { number: '' }, text(shareText(content.priced.lines, content.of.lines))],
    [text('priced'), text('of'), text('lines in the share'), number(content.of.lines), { number: '' }, dollars(content.of.charge_cents), { number: '' }, text(shareText(content.priced.charge_cents, content.of.charge_cents))],
    [text('practice'), text('lines'), text('every line held'), number(content.lines.lines), number(content.lines.claims), dollars(content.lines.charge_cents), dollars(content.lines.paid_cents), text('')],
    ...content.reasons.map((entry): CsvCell[] => [text('unpriced'), text(entry.reason), text(UNPRICED_REMEDIES[entry.reason].remedy), number(entry.lines), { number: '' }, { number: '' }, { number: '' }, text('')]),
    [text('waiting'), text('total'), text('waiting on mappings'), number(content.waiting.lines), number(content.waiting.claims), dollars(content.waiting.charge_cents), dollars(content.waiting.paid_cents), text('')],
    ...content.waiting_plans.map((plan): CsvCell[] => [
      text('waiting'),
      text(plan.plan_id),
      text(`${plan.payer_name} ${plan.plan_key}`),
      number(plan.lines),
      number(plan.claims),
      dollars(plan.charge_cents),
      dollars(plan.paid_cents),
      text(''),
    ]),
  ];
  return csvDocument(COVERAGE_CSV_COLUMNS, rows);
}

/**
 * A month's summary as CSV: one row per payer (and "all payers") and stage, counts and totals only,
 * never a stage added to another. A stage without dollars of its own here (flagged, payer approved,
 * recovered, the unstaged lines) leaves variance blank. Last, the count of the practice's packets
 * approved alone (the single-user audit flag), where the summary recorded them.
 */
export function monthlySummaryCsv(content: Pick<MonthlySummaryContent, 'month' | 'total' | 'by_payer' | 'approved_alone'>): string {
  const rows: CsvCell[][] = [];
  const write = (payer: string, row: MonthlySummaryRow) => {
    for (const bucket of SUMMARY_BUCKET_CODES) {
      const entry = row.figures[bucket];
      rows.push([text(content.month), text(payer), text(bucket), number(entry.lines), dollars(entry.billed_cents), dollars(entry.variance_cents)]);
    }
    rows.push([text(content.month), text(payer), text('actionable_written_off'), number(row.written_off.lines), dollars(row.written_off.billed_cents), dollars(row.written_off.variance_cents)]);
  };
  write('all payers', content.total);
  for (const payer of content.by_payer) {
    write(payer.payer_name ?? payer.payer_id ?? 'unknown payer', payer);
  }
  // The single-user approval gap, counted (the document's page and PDF list each one).
  if (content.approved_alone !== undefined) {
    rows.push([text(content.month), text('all payers'), text('packets_approved_alone'), number(content.approved_alone.length), dollars(null), dollars(null)]);
  }
  return csvDocument(MONTHLY_CSV_COLUMNS, rows);
}

/** The document's CSV, from its stored figures. */
export function reportDocumentCsv(content: ReportDocumentContent): string {
  return content.format === COVERAGE_REPORT_FORMAT ? coverageReportCsv(content) : monthlySummaryCsv(content);
}

// ---------------------------------------------------------------------------------------------------
// HTML, for the PDF
// ---------------------------------------------------------------------------------------------------

// The template's own pieces, in tokens (the frame's stylesheet sets the type, tables and colors).
const STYLE = `
  h2 { border-bottom: 1px solid var(--pw-line); padding-bottom: 3pt; }
  .pins { color: var(--pw-slate); font-size: 9pt; }
  table { margin: 4pt 0 8pt; font-size: 8.5pt; }
  .empty { color: var(--pw-slate); font-style: italic; }
  footer { margin-top: 18pt; font-size: 8pt; color: var(--pw-slate); border-top: 1px solid var(--pw-line); padding-top: 4pt; }
`;

interface Cell {
  readonly value: string;
  readonly amount?: boolean;
}

/** A table; amount cells are classed, and `figures` names its columns (1-based) of codes, identifiers and dates, all in the mono face. */
function table(caption: string, headers: readonly Cell[], rows: readonly (readonly Cell[])[], empty: string, figures: Pick<FigureColumns, 'code' | 'id' | 'date'> = {}): string {
  if (rows.length === 0) {
    return `<p class="empty">${escapeHtml(empty)}</p>`;
  }
  const head = headers.map((header) => `<th scope="col"${header.amount === true ? ' class="amount"' : ''}>${escapeHtml(header.value)}</th>`).join('');
  const body = rows.map((row) => `<tr>${row.map((cell) => `<td${cell.amount === true ? ' class="amount"' : ''}>${escapeHtml(cell.value)}</td>`).join('')}</tr>`).join('');
  return `<table${figureColumns(figures)}><caption>${escapeHtml(caption)}</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/** Who generated a document, and when (for its PDF's header line). */
export interface DocumentPins {
  readonly documentId: string;
  readonly practiceName: string;
  /** A person's email where the job's scope may read it, else null ("a member of the practice"). */
  readonly generatedBy: string | null;
  /** UTC, ISO 8601 without the zone. */
  readonly generatedAt: string;
}

/**
 * The Verified gate for a v1 report document (docs/adr/0057): neither the coverage report nor the monthly
 * summary states a recovered dollar total (recovered is a count there; its dollars are the ledger's), so
 * reportReconciliation finds none and the seal never prints on them.
 */
export function documentReconciliation(kind: ReportDocumentKind, documentId: string): ReportReconciliation {
  return reportReconciliation({ report: { kind, id: documentId }, proofLevel: DEFAULT_PROOF_LEVEL, statedRecoveredCents: null, recoveredEntryIds: [], ledger: new Map() });
}

function document(kind: ReportDocumentKind, title: string, short: string, covers: string, pins: DocumentPins, body: string): string {
  return brandedDocument(
    {
      title: short,
      kicker: kind === 'coverage' ? 'Coverage' : 'Monitoring',
      heading: short,
      subheading: covers,
      practiceName: pins.practiceName,
      meta: [`Document ${pins.documentId}`, `Figures fixed ${pins.generatedAt} UTC`, `By ${pins.generatedBy ?? 'a member of the practice'}`],
      reference: `Document ${pins.documentId}`,
      reconciliation: documentReconciliation(kind, pins.documentId),
    },
    STYLE,
    `<h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(pins.practiceName)}</p>
  <p class="pins">Document ${escapeHtml(pins.documentId)}; figures fixed ${escapeHtml(pins.generatedAt)} UTC by ${escapeHtml(pins.generatedBy ?? 'a member of the practice')}. Every figure is as it stood then; a later document is generated anew.</p>
  ${body}
  <footer>Amounts are computed in integer cents; no figure adds two stages together, and recovered (posted or deposited) is only ever the recovery ledger’s.</footer>`,
  );
}

/** The coverage report as one self-contained HTML document: what the Coverage screen showed when it was generated. */
export function coverageReportHtml(content: CoverageReportContent, pins: DocumentPins): string {
  const run =
    content.run === null
      ? content.pricing_runs === 0
        ? 'No pricing run has priced this practice’s lines yet, so every line counts as unpriced.'
        : 'No pricing run had completed when this report was generated; the shares count every line as unpriced.'
      : `From the pricing run in effect, service ${content.run.period_from} to ${content.run.period_to}, priced under rule release ${String(content.run.release_no)}.`;
  const readiness = content.readiness.allowed
    ? 'Every plan with lines has a mapping: a pricing run can start.'
    : `${plural(content.readiness.unmapped_plans, 'plan')} had no mapping at all: a pricing run over them is refused until they are mapped.`;
  return document(
    'coverage',
    `Coverage report, ${content.generated_on}`,
    'Coverage report',
    content.generated_on,
    pins,
    `<p>${escapeHtml(run)} The practice holds ${escapeHtml(plural(content.lines.lines, 'line'))} in ${escapeHtml(plural(content.lines.claims, 'claim'))}, ${escapeWithFigures(usd(content.lines.charge_cents))} billed.</p>
  <h2>Priced: ${escapeWithFigures(`${String(content.priced.lines)} of ${String(content.of.lines)} lines (${shareText(content.priced.lines, content.of.lines)}); ${usd(content.priced.charge_cents)} of ${usd(content.of.charge_cents)} billed (${shareText(content.priced.charge_cents, content.of.charge_cents)})`)}</h2>
  <p>${escapeHtml(readiness)}</p>
  <h2>Unpriced reasons</h2>
  ${table(
    'Unpriced reasons and their remedies',
    [{ value: 'Reason' }, { value: 'Meaning' }, { value: 'Lines', amount: true }, { value: 'Remedy' }],
    content.reasons.map((entry) => [{ value: entry.reason }, { value: UNPRICED_REMEDIES[entry.reason].meaning }, { value: String(entry.lines), amount: true }, { value: UNPRICED_REMEDIES[entry.reason].remedy }]),
    'No reason applies.',
    { code: [1] },
  )}
  <h2>Dollars waiting on mappings: ${escapeWithFigures(usd(content.waiting.charge_cents))} billed</h2>
  <p>${escapeWithFigures(`${plural(content.waiting.lines, 'line')} in ${plural(content.waiting.claims, 'claim')} had no mapping on their service date, ${usd(content.waiting.paid_cents)} paid.`)}</p>
  ${table(
    'Plans waiting on mapping',
    [{ value: 'Payer' }, { value: 'Plan' }, { value: 'Lines', amount: true }, { value: 'Claims', amount: true }, { value: 'Billed', amount: true }, { value: 'Paid', amount: true }],
    content.waiting_plans.map((plan) => [
      { value: plan.payer_name },
      { value: plan.plan_key },
      { value: String(plan.lines), amount: true },
      { value: String(plan.claims), amount: true },
      { value: usd(plan.charge_cents), amount: true },
      { value: usd(plan.paid_cents), amount: true },
    ]),
    'Nothing was waiting on a mapping.',
    { code: [2] },
  )}`,
  );
}

/** A payer's count (and, for a stage with dollars, its variance) at one stage: a figure cell, in the mono face. */
function summaryCell(row: MonthlySummaryRow, bucket: SummaryBucketCode): Cell {
  const entry = row.figures[bucket];
  return { value: SUMMARY_DOLLAR_BUCKETS.has(bucket) && entry.variance_cents !== null ? `${plural(entry.lines, 'line')}, ${usd(entry.variance_cents)}` : plural(entry.lines, 'line'), amount: true };
}

/** A month's variance summary as one self-contained HTML document: the month's lines, each counted once at the furthest stage it reached. */
export function monthlySummaryHtml(content: MonthlySummaryContent, pins: DocumentPins): string {
  const stageRows = SUMMARY_BUCKET_CODES.map((bucket) => {
    const entry = content.total.figures[bucket];
    return [
      { value: SUMMARY_BUCKET_LABELS[bucket] },
      { value: String(entry.lines), amount: true },
      { value: usd(entry.billed_cents), amount: true },
      { value: bucket === 'flagged' ? 'a count, never a dollar claim' : SUMMARY_DOLLAR_BUCKETS.has(bucket) && entry.variance_cents !== null ? usd(entry.variance_cents) : '—', amount: true },
    ];
  });
  stageRows.splice(5, 0, [
    { value: 'Written off from a case (not in the actionable total)' },
    { value: String(content.total.written_off.lines), amount: true },
    { value: usd(content.total.written_off.billed_cents), amount: true },
    { value: content.total.written_off.variance_cents === null ? '—' : usd(content.total.written_off.variance_cents), amount: true },
  ]);
  return document(
    'monthly_summary',
    `Monthly variance summary, ${content.month}`,
    'Monthly variance summary',
    content.month,
    pins,
    `<p>Lines with a service date in ${escapeHtml(content.month)}, each counted once at the furthest stage it has reached, as of ${escapeHtml(content.generated_on)}. Variance is expected allowed less observed allowed on the priced line the stage names. Payer approved and recovered (posted or deposited) are counts here: their dollars are the recovery ledger’s, on the practice’s Reconciliation screen and ROI statements.</p>
  <h2>By stage</h2>
  ${table('Lines by stage', [{ value: 'Stage' }, { value: 'Lines', amount: true }, { value: 'Billed', amount: true }, { value: 'Variance', amount: true }], stageRows, 'No line.')}
  <h2>By payer</h2>
  ${table(
    'Stages by payer',
    [{ value: 'Payer' }, ...(['flagged', 'validated', 'actionable', 'payer_approved', 'recovered'] as const).map((bucket) => ({ value: SUMMARY_BUCKET_LABELS[bucket], amount: true }))],
    content.by_payer.map((row) => [{ value: row.payer_name ?? 'Unnamed payer' }, ...(['flagged', 'validated', 'actionable', 'payer_approved', 'recovered'] as const).map((bucket) => summaryCell(row, bucket))]),
    `No line has a service date in ${content.month}.`,
  )}${content.approved_alone === undefined ? '' : approvedAloneHtml(content.approved_alone)}`,
  );
}

/** The single-user approval gap (CAS-10): every packet its own writer approved, with no one else to approve it. */
function approvedAloneHtml(rows: readonly ApprovedAloneRow[]): string {
  return `
  <h2>Packets approved alone</h2>
  <p>With no second person to approve its packets, the practice's writer of a version approved it alone, at least 24 hours after writing it; each carries the audit flag.</p>
  ${table(
    'Packets approved by their own writer',
    [{ value: 'Packet version' }, { value: 'Case' }, { value: 'Approved on' }, { value: 'Hours after it was written', amount: true }],
    rows.map((row) => [{ value: row.packet_version_id }, { value: row.case_id }, { value: row.approved_on }, { value: String(row.hours_waited), amount: true }]),
    'No packet of the practice was approved by its own writer.',
    { id: [1, 2], date: [3] },
  )}`;
}

/** The document's HTML, from its stored figures. */
export function reportDocumentHtml(content: ReportDocumentContent, pins: DocumentPins): string {
  return content.format === COVERAGE_REPORT_FORMAT ? coverageReportHtml(content, pins) : monthlySummaryHtml(content, pins);
}
