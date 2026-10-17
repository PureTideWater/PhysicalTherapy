import { readFileSync } from 'node:fs';
import path from 'node:path';

import { independenceClaim } from '@paidwhole/brand';
import { readDocumentPages } from '@tp/contracts/pages';
import { UNPRICED_REASONS } from '@tp/pricing';
import { STAGE_LABELS } from '@tp/triage';
import { describe, expect, it } from 'vitest';

import type { AuditReportContent, ReportLine } from './content';
import { CSV_COLUMNS, auditCsv, csvDocument, csvNumber, csvText } from './csv';
import { auditHtml, auditReconciliation, escapeHtml } from './html';
import { ChromiumPdfRenderer, chromiumInstalled } from './pdf';
import { UNPRICED_REMEDIES } from './remedies';
import { amountsNotInMono } from './test-support/figures';

/** A report's numbers as the report job stores them, written by hand (SYNTHETIC). */
const CONTENT: AuditReportContent = {
  format: 'tp-audit-report/1',
  report_id: '5f0d3b63-7a1e-4c8e-9a51-0f8a1c2b3d4e',
  practice: { name: 'SYNTHETIC PRACTICE <A&B>' },
  run: {
    pricing_run_id: '0b6e2a7c-3f4d-4e5a-8b9c-1d2e3f4a5b03',
    period_from: '2026-03-01',
    period_to: '2026-03-31',
    release_no: 900001,
    manifest_sha256: 'a'.repeat(64),
    engine_version: 'phase-two/1',
    completed_at: '2026-10-15T10:00:00.000Z',
  },
  as_of: '2026-10-15',
  settings: { line_materiality_cents: '500', case_materiality_cents: '25000', anomaly_minimum_cohort: 30, anomaly_threshold_cents: '1000' },
  headline: {
    actionable_cents: '55200',
    actionable_lines: 16,
    payer_approved_cents: '0',
    recovered_cents: '0',
    flagged_lines: 4,
    flagged_range_low_cents: '4000',
    flagged_range_high_cents: '8000',
    validated_lines: 17,
    validated_cents: '55500',
    labels: STAGE_LABELS,
  },
  coverage: { lines: 50, charge_cents: '500000', priced_lines: 17, priced_charge_cents: '200000', reasons: [{ reason: 'NO_AGREEMENT', lines: 33, charge_cents: '300000', remedy: 'None; anomaly screening only' }] },
  anomalies: [
    {
      anomaly_id: '9c1b2f9e-1a2b-4c3d-8e4f-5a6b7c8d9e0f',
      label: 'investigatory',
      payer: 'SYNTHETIC PAYER N',
      plan: 'SYNPLAN-OON-CAS',
      procedure_code: '97110',
      modifiers: [],
      place_of_service: '11',
      quarter: '2026-Q2',
      cohort_size: 32,
      modal_allowed_cents: '9000',
      flagged_lines: 4,
      range_low_cents: '4000',
      range_high_cents: '8000',
      reviewed: false,
      validation_requested: false,
    },
  ],
  validated: {
    lines: 17,
    variance_cents: '55500',
    patterns: [
      {
        payer: 'SYNTHETIC PAYER Q',
        plan: 'SYNPLAN-FIX-ONE',
        mapping_kind: 'contract',
        contract_version_id: '1e4b8f8a-2c1d-4f7e-8b3a-5d6c7e8f9a02',
        rate_record_id: '7d0c3d0e-8a64-4c1b-9d6f-0b8f4f0f6a01',
        behavior: 'BELOW_CONTRACT_RATE',
        behavior_text: 'Paid below the contract rate',
        lines: 9,
        variance_cents: '28300',
      },
    ],
    not_actionable: [{ reason: 'BELOW_LINE_MATERIALITY', lines: 1, variance_cents: '300' }],
  },
  overpaid: { lines: 1, variance_cents: '-1200' },
  cases: [
    {
      case_id: '3a4b5c6d-7e8f-4a1b-9c2d-3e4f5a6b7c8d',
      payer: 'SYNTHETIC PAYER Q',
      plan: 'SYNPLAN-FIX-ONE',
      mapping_kind: 'contract',
      rate_record_id: '7d0c3d0e-8a64-4c1b-9d6f-0b8f4f0f6a01',
      behavior: 'BELOW_CONTRACT_RATE',
      behavior_text: 'Paid below the contract rate',
      state: 'open',
      deadline_on: '2027-01-15',
      lines: 8,
      actionable_lines: 8,
      actionable_cents: '28000',
      written_off_lines: 0,
      written_off_cents: '0',
      case_lines: 11,
      case_actionable_cents: '34000',
      case_deadline_on: '2026-12-01',
      materiality_cents: '25000',
      pursuit_cost_cents: '8250',
      net_expected_cents: '19750',
      owner: null,
    },
  ],
  pursuit: { estimated: true, cost_cents: '8250', net_expected_cents: '19750' },
  evidence_gaps: [{ kind: 'unpriced', reason: 'NO_AGREEMENT', lines: 33, charge_cents: '300000', detail: 'Mapped as out of network or no agreement', remedy: 'None; anomaly screening only' }],
};

const LINE: ReportLine = {
  priced_line_id: '11111111-2222-4333-8444-555555555555',
  service_line_id: '66666666-7777-4888-8999-000000000000',
  payer_claim_control_number: 'SYNCCN,"CAS03"0001',
  line_no: 1,
  service_date: '2026-03-02',
  procedure_code: '97110',
  modifiers: ['GP', 'KX'],
  units: '2',
  payer: '=SYNTHETIC PAYER Q',
  plan: 'SYNPLAN-FIX-ONE',
  charge_cents: '15000',
  observed_allowed_cents: '6500',
  expected_allowed_cents: '10000',
  variance_cents: '3500',
  validated_cents: '3500',
  visit_variance_cents: null,
  unpriced_reason: null,
  window_ends_on: '2027-01-15',
  stage: 'actionable',
  status: 'actionable',
  reasons: [],
  review_flags: [],
  behavior: 'BELOW_CONTRACT_RATE',
  case_id: '3a4b5c6d-7e8f-4a1b-9c2d-3e4f5a6b7c8d',
  anomaly_id: null,
};

describe('the line CSV', () => {
  it('writes a header and one row per line, amounts in dollars, CRLF line ends', () => {
    const csv = auditCsv([
      LINE,
      { ...LINE, variance_cents: '-1200', validated_cents: null, status: 'overpaid', stage: '', case_id: null, behavior: null, expected_allowed_cents: '5300' },
      { ...LINE, payer_claim_control_number: "-2+3+cmd|' /C calc'!A0", status: 'not_actionable', reasons: ['NCCI_REVIEW'], review_flags: [{ flag: 'NCCI_PTP', column1_line_no: 3 }], case_id: null },
    ]);
    const rows = csv.split('\r\n');
    expect(rows[0]).toBe(CSV_COLUMNS.join(','));
    expect(rows[1]).toBe(
      `'=SYNTHETIC PAYER Q,SYNPLAN-FIX-ONE,"SYNCCN,""CAS03""0001",1,2026-03-02,97110,GP KX,2,150.00,65.00,100.00,35.00,35.00,,,2027-01-15,actionable,actionable,,,BELOW_CONTRACT_RATE,3a4b5c6d-7e8f-4a1b-9c2d-3e4f5a6b7c8d,,11111111-2222-4333-8444-555555555555`,
    );
    // A negative amount stays a number; a text field starting with a minus is defused.
    expect(rows[2]).toContain(',-12.00,,,');
    expect(rows[3]).toContain(`,'-2+3+cmd|' /C calc'!A0,`);
    expect(rows[3]).toContain(',not_actionable,NCCI_REVIEW,NCCI_PTP:3,');
    expect(rows.at(-1)).toBe('');
  });

  it('quotes what CSV needs quoted and defuses spreadsheet formulas in text, never in a figure', () => {
    expect(csvText('plain')).toBe('plain');
    expect(csvText('a,b')).toBe('"a,b"');
    expect(csvText('a\nb')).toBe('"a\nb"');
    for (const formula of ['=1+1', '+1', '-1', '@x', '\tx', '\rx']) {
      expect(csvText(formula)).toBe(/[\r]/.test(formula) ? `"'${formula}"` : `'${formula}`);
    }
    expect(csvText('=HYPERLINK("http://attacker.example/","Open")')).toBe(`"'=HYPERLINK(""http://attacker.example/"",""Open"")"`);
    expect(csvNumber('-12.00')).toBe('-12.00');
    expect(csvNumber('')).toBe('');
    expect(() => csvNumber('=1')).toThrow('a CSV number');
    expect(csvDocument(['a', 'b'], [[{ text: '-x' }, { number: '-1' }]])).toBe("a,b\r\n'-x,-1\r\n");
  });
});

describe('the report HTML', () => {
  const html = auditHtml(CONTENT);

  it('shows the headline as three numbers with flagged and validated below, each with its stage label', () => {
    const headline = html.slice(html.indexOf('aria-label="Headline"'), html.indexOf('aria-label="Coverage"'));
    expect(headline).toContain('Actionable</div><div class="amount">$552.00');
    expect(headline).toContain('Payer approved</div><div class="amount">$0.00');
    // Recovered names the proof level it was judged under, never "Recovered" alone.
    expect(headline).toContain('Recovered (posted)</div><div class="amount">$0.00');
    expect(headline).toContain('<div class="note">posted, net of recoupments and reversals; nothing has posted yet</div>');
    expect(auditHtml(CONTENT, auditReconciliation(CONTENT, 'deposited'))).toContain('Recovered (deposited)</div><div class="amount">$0.00');
    expect(headline).toContain('a range of <span class="figure-amount">$40.00</span> to <span class="figure-amount">$80.00</span>');
    expect(headline).toContain('Flagged (investigatory):</strong> 4 lines');
    expect(headline).toContain('<span class="figure-amount">$80.00</span>; investigatory, never a claim and in no total');
    expect(headline).toContain('Validated:</strong> <span class="figure-amount">$555.00</span> across 17 lines');
  });

  it.skipIf(!chromiumInstalled())('sets every dollar figure in IBM Plex Mono, in the headline, the boxes below it and running text as in tables (skipped without Chromium)', async () => {
    expect(await amountsNotInMono(html)).toEqual([]);
  }, 60_000);

  it('prints the independence claim on its cover, in the brand’s words (CO-11, decision D11)', () => {
    const cover = html.slice(html.indexOf('<section class="cover"'), html.indexOf('<table class="pages"'));
    expect(cover).toContain(`<p class="claim">PaidWhole is ${independenceClaim}.</p>`);
    expect(html.split(independenceClaim)).toHaveLength(2);
  });

  it('shows today’s stage labels, not the ones the report stored when it was written', () => {
    // A report written before the labels named their cash stored a bare "Recovered".
    const stored = auditHtml({ ...CONTENT, headline: { ...CONTENT.headline, labels: { ...STAGE_LABELS, recovered: 'Recovered', actionable: 'Stored actionable' } } as unknown as typeof CONTENT.headline });
    expect(stored).toContain(`${STAGE_LABELS.actionable}</div><div class="amount">$552.00`);
    expect(stored).not.toContain('Stored actionable');
    expect(stored).not.toMatch(/Recovered(?! \((posted|deposited)\))/);
  });

  it('keeps the word recovered beside stage five only', () => {
    const withoutHeadline = html.replace(/<div class="figure"><div class="label">Recovered \(posted\)<\/div>.*?<\/div><\/div>/, '').replace(/Recovered \(posted\) counts only cash posted/, '');
    expect(withoutHeadline).not.toMatch(/recover/i);
    // And never without the cash that proves it.
    expect(html).not.toMatch(/Recovered(?! \((posted|deposited)\))/);
  });

  it('labels every anomaly investigatory and puts it in no total', () => {
    const anomalies = html.slice(html.indexOf('aria-label="Anomalies"'), html.indexOf('aria-label="Validated discrepancies"'));
    expect(anomalies).toContain('(investigatory)');
    expect(anomalies).toContain('<td>investigatory</td><td>SYNTHETIC PAYER N</td>');
    expect(anomalies).toContain('$90.00');
  });

  it('shows the cases with their totals, deadlines, pursuit cost and net expected value, and the evidence gaps', () => {
    expect(html).toContain('<td>$280.00</td><td>2027-01-15</td><td>11 lines, $340.00</td><td>$82.50</td><td>$197.50</td>');
    expect(html).toContain('Pursuit cost of the open cases: <span class="figure-amount">$82.50</span>; net expected value <span class="figure-amount">$197.50</span>.');
    expect(html).toContain('Below the per-line materiality');
    expect(html).toContain('Overpayments: 1 line, <span class="figure-amount">-$12.00</span>; recorded and shown, never pursued.');
    expect(html).toContain('<td>NO_AGREEMENT</td><td>33</td><td>$3,000.00</td>');
  });

  it('escapes every text it shows and loads nothing from outside the document', () => {
    expect(html).toContain('SYNTHETIC PRACTICE &lt;A&amp;B&gt;');
    expect(html).not.toMatch(/<(script|link|img)\b|src=|href=/);
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });

  it('says the report is released only once a reviewer attests it, and says so without a pursuit estimate', () => {
    expect(html).toContain('released only after a reimbursement reviewer signs an attestation');
    const without = auditHtml({ ...CONTENT, cases: [], pursuit: { estimated: false, cost_cents: null, net_expected_cents: null }, anomalies: [], coverage: { ...CONTENT.coverage, reasons: [] } });
    expect(without).toContain('Pursuit cost is not estimated');
    expect(without).toContain('No pattern reaches the case materiality yet.');
    expect(without).toContain('No cohort reaches the minimum size');
    expect(without).toContain('Every line priced.');
  });
});

describe('the evidence gaps’ remedies', () => {
  it('are the unpriced reasons table, word for word', () => {
    const table = readFileSync(path.resolve(import.meta.dirname, '../../../../docs/product/unpriced-reasons.md'), 'utf8')
      .split('\n')
      .map((line) => /^\| `([A-Z_]+)` \| (.*) \| (.*) \|$/.exec(line))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => [match[1], match[2], match[3]]);
    expect(table.map(([reason]) => reason).sort()).toEqual([...UNPRICED_REASONS].sort());
    for (const [reason, meaning, remedy] of table) {
      expect(UNPRICED_REMEDIES[reason as keyof typeof UNPRICED_REMEDIES]).toEqual({ meaning, remedy });
    }
  });
});

describe('printing to PDF with Chromium', () => {
  it.skipIf(!chromiumInstalled())('prints the report’s HTML to a PDF whose text carries its figures and labels (skipped where Playwright’s Chromium is not installed)', async () => {
    const pdf = await new ChromiumPdfRenderer().render(auditHtml(CONTENT));
    expect(Buffer.from(pdf.subarray(0, 5)).toString('latin1')).toBe('%PDF-');
    const read = await readDocumentPages({ bytes: pdf, contentType: 'application/pdf' });
    expect(read.ok).toBe(true);
    const text = read.ok ? read.pages.join('\n') : '';
    expect(text).toContain('Audit report');
    expect(text).toContain('$552.00');
    expect(text).toMatch(/Flagged \(investigatory\)/);
    expect(text).toContain('investigatory');
  }, 60_000);
});
