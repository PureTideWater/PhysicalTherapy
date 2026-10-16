import { UNPRICED_REASONS } from '@tp/pricing';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import {
  COVERAGE_CSV_COLUMNS,
  COVERAGE_REPORT_FORMAT,
  type CoverageReportContent,
  MONTHLY_SUMMARY_FORMAT,
  type MonthlySummaryContent,
  type MonthlySummaryRow,
  SUMMARY_BUCKET_CODES,
  coverageReportHtml,
  monthlySummaryHtml,
  parseReportDocument,
  reportDocumentCsv,
  reportDocumentHtml,
  shareText,
} from './documents';

/**
 * The v1 reports' documents (docs/adr/0045): their stored formats, their CSV and their printed HTML,
 * from SYNTHETIC figures. The PDF, the CSV and the page read the same stored figures, so these tests
 * fix what each says; the print job's database test prints one.
 */

const RUN = '0b6e2a7c-3f4d-4e5a-8b9c-1d2e3f4a5b03';
const PLAN = '1e4b8f8a-2c1d-4f7e-8b3a-5d6c7e8f9a02';
const PAYER = '7d0c3d0e-8a64-4c1b-9d6f-0b8f4f0f6a01';
const PINS = { documentId: '5a1f0e3e-6c9b-4d7a-9f3b-2e1d0c9b8a07', practiceName: 'SYNTHETIC PHYSICAL THERAPY', generatedBy: 'billing-manager@synthetic.test', generatedAt: '2026-10-16 09:00:00' };

function coverage(overrides: Partial<CoverageReportContent> = {}): CoverageReportContent {
  return {
    format: COVERAGE_REPORT_FORMAT,
    generated_on: '2026-10-16',
    run: { id: RUN, period_from: '2026-03-01', period_to: '2026-03-31', release_no: 900001, completed_at: '2026-10-16T08:00:00.000Z' },
    lines: { lines: 4, claims: 3, charge_cents: '40000', paid_cents: '21000' },
    priced: { lines: 3, charge_cents: '30000' },
    of: { lines: 4, charge_cents: '40000' },
    reasons: UNPRICED_REASONS.map((reason) => ({ reason, lines: reason === 'NO_MAPPING' ? 1 : 0 })),
    waiting: { lines: 1, claims: 1, charge_cents: '10000', paid_cents: '5000' },
    waiting_plans: [{ plan_id: PLAN, payer_name: 'SYNTHETIC PAYER M', plan_key: 'CE:SYNPLAN-UNMAPPED-01', lines: 1, claims: 1, charge_cents: '10000', paid_cents: '5000' }],
    readiness: { allowed: false, unmapped_plans: 1 },
    pricing_runs: 1,
    ...overrides,
  };
}

const figure = (lines: number, billed: string, variance: string | null) => ({ lines, billed_cents: billed, variance_cents: variance });

function row(payerId: string | null, payerName: string | null): MonthlySummaryRow {
  const figures = Object.fromEntries(SUMMARY_BUCKET_CODES.map((bucket) => [bucket, figure(0, '0', bucket === 'validated' || bucket === 'actionable' ? '0' : null)])) as MonthlySummaryRow['figures'];
  return {
    payer_id: payerId,
    payer_name: payerName,
    figures: { ...figures, validated: figure(2, '20000', '4000'), actionable: figure(3, '30000', '9000'), recovered: figure(1, '10000', null) },
    written_off: figure(1, '10000', '3000'),
  };
}

function monthly(): MonthlySummaryContent {
  return { format: MONTHLY_SUMMARY_FORMAT, generated_on: '2026-10-16', month: '2026-03', total: row(null, null), by_payer: [row(PAYER, '=SYNTHETIC PAYER Q')] };
}

describe('the report documents (docs/adr/0045)', () => {
  it('reads each kind in its own format, and refuses figures that are not', () => {
    expect(parseReportDocument('coverage', coverage())).toEqual(coverage());
    expect(parseReportDocument('monthly_summary', monthly())).toEqual(monthly());
    expect(() => parseReportDocument('coverage', monthly())).toThrow(ZodError);
    expect(() => parseReportDocument('monthly_summary', coverage())).toThrow(ZodError);
    // A float, a missing reason or a stray field never reads.
    expect(() => parseReportDocument('coverage', { ...coverage(), priced: { lines: 3, charge_cents: '300.00' } })).toThrow(ZodError);
    expect(() => parseReportDocument('coverage', { ...coverage(), reasons: coverage().reasons.slice(1) })).toThrow(ZodError);
    expect(() => parseReportDocument('coverage', { ...coverage(), patient: 'SYNTHETIC' })).toThrow(ZodError);
  });

  it('gives a share with one decimal from integers, half up, as the Coverage screen does', () => {
    expect(shareText(3, 4)).toBe('75.0%');
    expect(shareText(1, 3)).toBe('33.3%');
    expect(shareText(2, 3)).toBe('66.7%');
    expect(shareText('30000', '40000')).toBe('75.0%');
    expect(shareText(0, 0)).toBe('0%');
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000 }), fc.integer({ min: 0, max: 1_000_000 }), (whole, raw) => {
        const part = raw % (whole + 1);
        const [integer = '', tenth = ''] = shareText(part, whole).replace('%', '').split('.');
        const tenths = Number(integer) * 10 + Number(tenth);
        // Within half a tenth of a percent of the exact share, never above 100%.
        expect(Math.abs(tenths * whole - part * 1000)).toBeLessThanOrEqual(whole / 2);
        expect(tenths).toBeLessThanOrEqual(1000);
      }),
    );
  });

  it('writes the coverage report CSV: the run, the share, every reason in order, the waiting dollars by plan', () => {
    const csv = reportDocumentCsv(coverage());
    const rows = csv.split('\r\n');
    expect(rows[0]).toBe(COVERAGE_CSV_COLUMNS.join(','));
    expect(rows[1]).toBe(`run,${RUN},"2026-03-01 to 2026-03-31, rule release 900001",,,,,`);
    expect(rows[2]).toBe('priced,lines,priced lines,3,,300.00,,75.0%');
    expect(rows[3]).toBe('priced,of,lines in the share,4,,400.00,,75.0%');
    expect(rows[4]).toBe('practice,lines,every line held,4,3,400.00,210.00,');
    expect(rows.slice(5, 5 + UNPRICED_REASONS.length).map((line) => line.split(',')[1])).toEqual([...UNPRICED_REASONS]);
    expect(rows).toContain('unpriced,NO_MAPPING,Map the plan,1,,,,');
    expect(rows.at(-3)).toBe('waiting,total,waiting on mappings,1,1,100.00,50.00,');
    expect(rows.at(-2)).toBe(`waiting,${PLAN},SYNTHETIC PAYER M CE:SYNPLAN-UNMAPPED-01,1,1,100.00,50.00,`);
    expect(rows.at(-1)).toBe('');
    expect(reportDocumentCsv(coverage({ run: null })).split('\r\n')[1]).toBe('run,,no run in effect,,,,,');
  });

  it('writes the monthly summary CSV: every stage per payer, dollars only where the stage carries them, names defused', () => {
    const rows = reportDocumentCsv(monthly()).split('\r\n');
    expect(rows[0]).toBe('month,payer,stage,lines,billed,variance');
    expect(rows).toContain('2026-03,all payers,actionable,3,300.00,90.00');
    expect(rows).toContain('2026-03,all payers,recovered,1,100.00,');
    expect(rows).toContain('2026-03,all payers,flagged,0,0.00,');
    expect(rows).toContain('2026-03,all payers,actionable_written_off,1,100.00,30.00');
    // A payer name a spreadsheet would run as a formula is defused.
    expect(rows).toContain("2026-03,'=SYNTHETIC PAYER Q,validated,2,200.00,40.00");
    expect(rows).toHaveLength(1 + 2 * (SUMMARY_BUCKET_CODES.length + 1) + 1);
  });

  it('prints the coverage report as self-contained HTML with its labels, every reason and its remedy, and nothing from outside', () => {
    const html = coverageReportHtml(coverage(), PINS);
    expect(html).toContain('Coverage report, 2026-10-16');
    expect(html).toContain('Priced: 3 of 4 lines (75.0%); $300.00 of $400.00 billed (75.0%)');
    expect(html).toContain('1 plan had no mapping at all');
    expect(html).toContain('Dollars waiting on mappings: $100.00 billed');
    for (const reason of UNPRICED_REASONS) {
      expect(html).toContain(`<td>${reason}</td>`);
    }
    expect(html).toContain('billing-manager@synthetic.test');
    expect(html).not.toMatch(/<script|<link|src=|href=/i);
    expect(coverageReportHtml(coverage({ readiness: { allowed: true, unmapped_plans: 0 }, waiting_plans: [] }), PINS)).toContain('Nothing was waiting on a mapping.');
    expect(coverageReportHtml(coverage({ run: null, pricing_runs: 0 }), { ...PINS, generatedBy: null })).toContain('No pricing run has priced this practice’s lines yet');
    expect(coverageReportHtml(coverage({ run: null, pricing_runs: 2 }), PINS)).toContain('No pricing run had completed');
  });

  it('shows the single-user approval gap: each packet approved alone in the PDF, their count in the CSV (CAS-10)', () => {
    const alone = {
      ...monthly(),
      approved_alone: [{ packet_version_id: '7d0c3d0e-8a64-4c1b-9d6f-0b8f4f0f6a02', case_id: '7d0c3d0e-8a64-4c1b-9d6f-0b8f4f0f6a03', approved_on: '2026-04-02', hours_waited: 25 }],
    };
    expect(parseReportDocument('monthly_summary', alone)).toEqual(alone);
    const html = monthlySummaryHtml(alone, PINS);
    expect(html).toContain('Packets approved alone');
    expect(html).toContain('7d0c3d0e-8a64-4c1b-9d6f-0b8f4f0f6a02');
    expect(html).toContain('<td class="amount">25</td>');
    expect(reportDocumentCsv(alone).split('\r\n')).toContain('2026-03,all payers,packets_approved_alone,1,,');
    expect(monthlySummaryHtml({ ...alone, approved_alone: [] }, PINS)).toContain('No packet of the practice was approved by its own writer.');
    // A summary stored before the gap was recorded shows neither.
    expect(monthlySummaryHtml(monthly(), PINS)).not.toContain('Packets approved alone');
    expect(reportDocumentCsv(monthly())).not.toContain('packets_approved_alone');
  });

  it('prints the monthly summary with every stage on its own, recovered a count whose dollars are the ledger’s, and escapes names', () => {
    const html = monthlySummaryHtml(monthly(), PINS);
    expect(html).toContain('Monthly variance summary, 2026-03');
    expect(html).toContain('a count, never a dollar claim');
    expect(html).toContain('3 lines, $90.00');
    expect(html).toContain('<td>1 line</td>');
    expect(html).toContain('their dollars are the recovery ledger’s');
    expect(html).toContain('Written off from a case (not in the actionable total)');
    expect(reportDocumentHtml({ ...monthly(), by_payer: [] }, PINS)).toContain('No line has a service date in 2026-03.');
    expect(reportDocumentHtml(monthly(), { ...PINS, practiceName: '<b>SYNTHETIC</b>' })).toContain('&lt;b&gt;SYNTHETIC&lt;/b&gt;');
  });
});
