import { type LedgerEntry, entriesById, reportReconciliation } from '@tp/ledger';
import { cents } from '@tp/money';
import { insertIdentifiers, type RowIdentifiers } from '@tp/packets';
import { describe, expect, it } from 'vitest';

import { packetHtml } from '../packets/html';
import { content as packetContent, exported, payerCopy } from '../packets/test-support/exported-packet';
import { statementHtml } from '../reconcile/statement-html';
import { brandedDocument, figureColumns } from './brand';
import { coverageReportHtml, monthlySummaryHtml } from './documents';
import { auditHtml } from './html';
import { ChromiumPdfRenderer, chromiumInstalled } from './pdf';
import { CONTENT } from './test-support/audit-content';
import { PINS, coverage, monthly } from './test-support/document-content';
import { insideLayout, insidePageWidthPx } from './test-support/print-layout';
import { type PrintedText, printedText } from './test-support/printed-text';

/**
 * No printed document is wider than its inside pages (docs/brand/BRAND.md, section 7). Chromium shrinks the
 * whole PDF to fit anything wider than the page's content box, the Paper cover with it, so one wide table
 * would print the cover short of the page's foot and the 16 px running-header mark under the brand's 16 px
 * minimum (section 2). Every template the worker prints is laid out under print media at the inside pages'
 * width, with the figures its tests use and with the widest a practice's documents plausibly hold: totals in
 * the millions, a case's figures in six digits, a unit rate in four, five-digit line counts, long payer names
 * and plan keys, and identifiers as long as an 835 allows. SYNTHETIC data only.
 */

/** A total: $1,234,567.89. */
const TOTAL = '123456789';
/** A case's or a pattern's figure: $123,456.78. */
const CASE = '12345678';
/** A unit rate: $1,234.56. */
const RATE = '123456';
const LINES = 12345;
const UUID = (n: number) => `${String(n).padStart(8, '0')}-4a4b-4c4d-8e8f-${String(n).padStart(12, '0')}`;
const LONG_NAME = 'SYNTHETIC REGIONAL HEALTH PLAN OF THE NORTHERN AND SOUTHERN TERRITORIES';
const LONG_KEY = 'CE:SYNPLAN-MEDICARE-ADVANTAGE-PPO-REGIONAL-0001';

/** The audit report with its figures, names and keys as wide as plausible and the pursuit cost not estimated. */
const WIDE_AUDIT = {
  ...CONTENT,
  practice: { name: LONG_NAME },
  headline: { ...CONTENT.headline, actionable_cents: TOTAL, actionable_lines: LINES, payer_approved_cents: TOTAL, recovered_cents: TOTAL, validated_cents: TOTAL, validated_lines: LINES, flagged_range_low_cents: RATE, flagged_range_high_cents: RATE },
  coverage: { ...CONTENT.coverage, charge_cents: TOTAL, priced_charge_cents: TOTAL, reasons: CONTENT.coverage.reasons.map((reason) => ({ ...reason, lines: LINES, charge_cents: TOTAL })) },
  anomalies: CONTENT.anomalies.map((item) => ({ ...item, payer: LONG_NAME, plan: LONG_KEY, modifiers: ['GP', 'KX', '59', 'XU'], cohort_size: LINES, modal_allowed_cents: RATE, flagged_lines: LINES, range_low_cents: RATE, range_high_cents: RATE })),
  validated: {
    ...CONTENT.validated,
    variance_cents: TOTAL,
    patterns: CONTENT.validated.patterns.map((item) => ({ ...item, payer: LONG_NAME, plan: LONG_KEY, lines: LINES, variance_cents: TOTAL })),
    not_actionable: CONTENT.validated.not_actionable.map((item) => ({ ...item, reason: 'CASE_LINE_FROM_OTHER_RUN', lines: LINES, variance_cents: TOTAL })),
  },
  cases: CONTENT.cases.map((item) => ({
    ...item,
    payer: LONG_NAME,
    plan: LONG_KEY,
    state: 'partially_resolved',
    lines: LINES,
    actionable_lines: LINES,
    actionable_cents: CASE,
    case_lines: LINES,
    case_actionable_cents: CASE,
    pursuit_cost_cents: null,
    net_expected_cents: null,
    actionable_now_lines: LINES,
    actionable_now_cents: CASE,
    payer_approved_cents: CASE,
    recovered_cents: CASE,
  })),
  pursuit: { estimated: false, cost_cents: null, net_expected_cents: null },
  evidence_gaps: CONTENT.evidence_gaps.map((gap) => ({ ...gap, lines: LINES, charge_cents: TOTAL })),
};

/** The ROI statement over ledger entries with real-length IDs. */
function statement(entryId: (n: number) => string, amount: bigint): string {
  const entries: LedgerEntry[] = [
    { id: entryId(1), caseId: UUID(11), serviceLineId: 'line-1', stage: 'deposited', amountCents: cents(amount), evidenceKind: 'eft_row', evidenceId: 'eft-1', allocated: true, effectiveOn: '2026-08-14' },
    { id: entryId(2), caseId: UUID(12), serviceLineId: 'line-1', stage: 'recouped', amountCents: cents(-amount / 2n), evidenceKind: 'provider_adjustment', evidenceId: 'plb-1', allocated: false, effectiveOn: '2026-09-02' },
  ];
  const recovered = amount - amount / 2n;
  const none = { storedCents: cents(0n), recomputedCents: cents(0n), matches: true, entries: [] };
  return statementHtml({
    statementId: UUID(1),
    practiceName: LONG_NAME,
    statement: {
      periodFrom: '2026-04-01',
      periodTo: '2026-09-30',
      proofLevel: 'deposited',
      feesCents: cents(amount),
      recoveredCents: cents(recovered),
      interestCents: cents(0n),
      approvedUnpostedCents: cents(0n),
      actionableOpenCents: cents(amount),
      pursuitHours: '0.00',
      links: { recovered: entries.map((entry) => entry.id), interest: [], approvedUnposted: [], actionableOpen: [UUID(11), UUID(12), UUID(13)] },
    },
    check: { matches: true, recovered: { storedCents: cents(recovered), recomputedCents: cents(recovered), matches: true, entries }, interest: none, approvedUnposted: none },
    generatedBy: 'billing-manager-with-a-long-address@synthetic-practice.test',
    generatedAt: '2026-10-01 09:00:00',
    reconciliation: reportReconciliation({ report: { kind: 'roi_statement', id: UUID(1) }, proofLevel: 'deposited', statedRecoveredCents: cents(recovered), recoveredEntryIds: entries.map((entry) => entry.id), ledger: entriesById(entries) }),
  });
}

const WIDE_FIGURE = { lines: LINES, billed_cents: TOTAL, variance_cents: TOTAL };

function wideMonthly() {
  const base = monthly();
  const widen = (row: typeof base.total) => ({ ...row, payer_name: row.payer_name === null ? null : LONG_NAME, figures: Object.fromEntries(Object.entries(row.figures).map(([bucket, entry]) => [bucket, { ...WIDE_FIGURE, variance_cents: entry.variance_cents === null ? null : TOTAL }])) as typeof row.figures, written_off: WIDE_FIGURE });
  return { ...base, total: widen(base.total), by_payer: [...base.by_payer.map(widen), widen({ ...base.total, payer_id: UUID(5), payer_name: LONG_NAME })], approved_alone: [{ packet_version_id: UUID(21), case_id: UUID(22), approved_on: '2026-04-02', hours_waited: LINES }] };
}

function wideCoverage() {
  const base = coverage();
  return coverage({
    lines: { lines: LINES, claims: LINES, charge_cents: TOTAL, paid_cents: TOTAL },
    priced: { lines: LINES, charge_cents: TOTAL },
    of: { lines: LINES, charge_cents: TOTAL },
    reasons: base.reasons.map((entry) => ({ ...entry, lines: LINES })),
    waiting: { lines: LINES, claims: LINES, charge_cents: TOTAL, paid_cents: TOTAL },
    waiting_plans: [{ plan_id: UUID(3), payer_name: LONG_NAME, plan_key: LONG_KEY, lines: LINES, claims: LINES, charge_cents: TOTAL, paid_cents: TOTAL }],
  });
}

/** The packet with identifiers as long as an 835 allows them (CLP01 38, CLP07 50, NM109 80 characters). */
function widePacket(): string {
  const identifiers = new Map<number, RowIdentifiers>(
    packetContent.lines.map((line) => [line.row, { claim_control_number: 'SYNCCN'.padEnd(38, '0'), patient_control_number: 'SYNPCN'.padEnd(38, '9'), patient_name: 'SYNTHETIC-HYPHENATED-SURNAME, PATIENT WITH SEVERAL GIVEN NAMES', member_id: 'SYNMBR'.padEnd(50, '7') }]),
  );
  return packetHtml(insertIdentifiers(packetContent, exported.narrative, identifiers), payerCopy);
}

/** Each printed template, its cover's headline and its running header's title (BRAND.md, section 7). */
interface Printed {
  readonly name: string;
  readonly html: () => string;
  /** The cover's headline (26 pt in the report stylesheet). */
  readonly heading: string;
  /** The running header's title on the inside pages (10 pt). */
  readonly title: string;
}

const DOCUMENTS: readonly Printed[] = [
  { name: 'the audit report (report.test’s content)', html: () => auditHtml(CONTENT), heading: 'Audit report', title: 'Audit report' },
  { name: 'the audit report, widest figures and names', html: () => auditHtml(WIDE_AUDIT), heading: 'Audit report', title: 'Audit report' },
  { name: 'the ROI statement (short entry IDs)', html: () => statement((n) => `entry-${String(n)}`, 3000n), heading: 'ROI statement', title: 'ROI statement' },
  { name: 'the ROI statement, real-length IDs and the widest figures', html: () => statement(UUID, BigInt(TOTAL)), heading: 'ROI statement', title: 'ROI statement' },
  { name: 'the coverage report (documents.test’s content)', html: () => coverageReportHtml(coverage(), PINS), heading: 'Coverage report', title: 'Coverage report' },
  { name: 'the coverage report, widest figures and names', html: () => coverageReportHtml(wideCoverage(), { ...PINS, practiceName: LONG_NAME }), heading: 'Coverage report', title: 'Coverage report' },
  { name: 'the monthly summary (documents.test’s content)', html: () => monthlySummaryHtml(monthly(), PINS), heading: 'Monthly variance summary', title: 'Monthly variance summary' },
  { name: 'the monthly summary, widest figures and names', html: () => monthlySummaryHtml(wideMonthly(), { ...PINS, practiceName: LONG_NAME }), heading: 'Monthly variance summary', title: 'Monthly variance summary' },
  { name: 'the dispute packet (export.test’s version)', html: () => packetHtml(exported, payerCopy), heading: 'Request to reprocess underpaid claims', title: `${packetContent.practice.name} · Payment dispute` },
  { name: 'the dispute packet, the longest identifiers', html: widePacket, heading: 'Request to reprocess underpaid claims', title: `${packetContent.practice.name} · Payment dispute` },
];

const PROBE_FRAME = { title: 'Probe', kicker: 'Probe', heading: 'Probe', practiceName: 'SYNTHETIC', meta: [], reference: 'Probe', reconciliation: { reconciledToCash: false, source: 'probe' } } as const;
/** A table no inside page holds: ten cells kept on one line, as the reports' figure columns once were. */
const TOO_WIDE = brandedDocument(PROBE_FRAME, '', `<table><tbody><tr>${Array.from({ length: 10 }, () => '<td style="white-space: nowrap">3 lines, $90.00</td>').join('')}</tr></tbody></table>`);

describe('the inside pages’ width', () => {
  it('is letter less the report stylesheet’s left and right margins: 672 CSS px', () => {
    expect(insidePageWidthPx()).toBe(672);
  });

  it('is checked wherever the tests run in CI: Chromium is installed there (the checks below skip only on a machine without it)', () => {
    if (process.env.CI === 'true') {
      expect(chromiumInstalled()).toBe(true);
    }
  });
});

describe.skipIf(!chromiumInstalled())('every printed document fits its inside pages, so Chromium never shrinks it (skipped where Playwright’s Chromium is not installed)', () => {
  for (const document of DOCUMENTS) {
    it(document.name, async () => {
      const layout = await insideLayout(document.html());
      expect(layout.wide).toEqual([]);
      expect(layout.scrollWidthPx).toBeLessThanOrEqual(layout.widthPx);
      // And it fits without breaking a figure: every amount and date stays on one line.
      expect(layout.brokenFigures).toEqual([]);
    }, 60_000);
  }

  it('and the check sees a table that is too wide, and a figure broken across two lines', async () => {
    const wide = await insideLayout(TOO_WIDE);
    expect(wide.scrollWidthPx).toBeGreaterThan(wide.widthPx);
    expect(wide.wide.some((entry) => entry.startsWith('table '))).toBe(true);
    // An amount, negative or not, has no break opportunity of its own and stays whole even in a box one
    // character wide; a date breaks at its hyphens unless its column keeps it on one line (data-date); and
    // a rule that breaks inside words splits all of them, which the check sees.
    const narrow = (wrap: string) => brandedDocument(PROBE_FRAME, '', `<table${figureColumns({ date: [2] })}><tbody><tr><td><div style="width: 1ch; overflow-wrap: ${wrap}">-$61,728,394.50 $90.00 2026-03-01</div></td><td><div style="width: 1ch">2026-03-02</div></td></tr></tbody></table>`);
    expect((await insideLayout(narrow('normal'))).brokenFigures).toEqual([expect.stringMatching(/^2026-03-01 on \d+ lines in <div>$/)]);
    expect((await insideLayout(narrow('anywhere'))).brokenFigures).toEqual([
      expect.stringMatching(/^-\$61,728,394\.50 on \d+ lines in <div>$/),
      expect.stringMatching(/^\$90\.00 on \d+ lines in <div>$/),
      expect.stringMatching(/^2026-03-01 on \d+ lines in <div>$/),
    ]);
  }, 60_000);
});

/** The size a run of text printed at on a page, the first run that reads exactly so. */
function sizeOf(runs: readonly PrintedText[], page: number, text: string): number | undefined {
  return runs.find((run) => run.page === page && run.text === text)?.size;
}

describe.skipIf(!chromiumInstalled())('every printed document prints at full size: its Paper cover to the page’s foot, its running header at the brand’s sizes (skipped where Playwright’s Chromium is not installed)', () => {
  const renderer = new ChromiumPdfRenderer();
  for (const document of DOCUMENTS.filter((entry) => !entry.name.includes('widest') && !entry.name.includes('longest'))) {
    it(document.name, async () => {
      const runs = await printedText(await renderer.render(document.html()));
      // The cover is the full page (11 in of Paper, BRAND.md section 7) only when nothing shrank: its headline
      // prints at the stylesheet's 26 pt, 0.85 in from the page's edge.
      const headline = runs.find((run) => run.page === 1 && document.heading.startsWith(run.text) && run.size > 20);
      expect(headline?.size).toBeCloseTo(26, 1);
      expect(headline?.x).toBeCloseTo(0.85 * 72, 0);
      // The inside pages' running header: the title at 10 pt beside the 16 px mark, at the page's 0.75 in margin.
      expect(sizeOf(runs, 2, document.title)).toBeCloseTo(10, 1);
    }, 60_000);
  }

  it('and the check sees a print that shrank to fit', async () => {
    const runs = await printedText(await renderer.render(TOO_WIDE));
    expect(sizeOf(runs, 1, 'Probe')).toBeLessThan(25);
    expect(sizeOf(runs, 2, 'Probe')).toBeLessThan(9.5);
  }, 60_000);
});
