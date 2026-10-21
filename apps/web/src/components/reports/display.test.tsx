import { type AuditReportContent, unattestedSubmissionsNote } from '@tp/worker/reports';
import { STAGE_LABELS } from '@tp/triage';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Headline, ReportSections } from './display';

/**
 * The audit report on screen after a recovery (the screen tour's N4): the headline's notes say what the
 * stored figures hold, and the cases' payer approved and recovered (posted or deposited) sit by case beside
 * the headline that sums them. SYNTHETIC figures, written by hand.
 */

const CASE: AuditReportContent['cases'][number] = {
  case_id: '3a4b5c6d-7e8f-4a1b-9c2d-3e4f5a6b7c8d',
  payer: 'SYNTHETIC PAYER L',
  plan: 'CE:SYNPLAN-FIX-LED',
  mapping_kind: 'contract',
  rate_record_id: '7d0c3d0e-8a64-4c1b-9d6f-0b8f4f0f6a01',
  behavior: 'BELOW_CONTRACT_RATE',
  behavior_text: 'Paid below the contract rate',
  state: 'resolved',
  deadline_on: '2036-03-29',
  lines: 1,
  actionable_lines: 1,
  actionable_cents: '3000',
  written_off_lines: 0,
  written_off_cents: '0',
  case_lines: 1,
  case_actionable_cents: '3000',
  case_deadline_on: '2036-03-29',
  materiality_cents: '1000',
  pursuit_cost_cents: null,
  net_expected_cents: null,
  owner: null,
  actionable_now_lines: 0,
  actionable_now_cents: '0',
  payer_approved_cents: '3000',
  recovered_cents: '3000',
};

const CONTENT: AuditReportContent = {
  format: 'tp-audit-report/1',
  report_id: '5f0d3b63-7a1e-4c8e-9a51-0f8a1c2b3d4e',
  practice: { name: 'SYNTHETIC PRACTICE' },
  run: {
    pricing_run_id: '0b6e2a7c-3f4d-4e5a-8b9c-1d2e3f4a5b03',
    period_from: '2026-03-01',
    period_to: '2026-03-31',
    release_no: 900001,
    manifest_sha256: 'a'.repeat(64),
    engine_version: 'phase-two/1',
    completed_at: '2026-10-15T10:00:00.000Z',
  },
  as_of: '2026-10-17',
  settings: { line_materiality_cents: '500', case_materiality_cents: '1000', anomaly_minimum_cohort: 30, anomaly_threshold_cents: '1000' },
  headline: {
    actionable_cents: '0',
    actionable_lines: 0,
    payer_approved_cents: '3000',
    recovered_cents: '3000',
    flagged_lines: 0,
    flagged_range_low_cents: '0',
    flagged_range_high_cents: '0',
    validated_lines: 1,
    validated_cents: '3000',
    labels: STAGE_LABELS,
  },
  coverage: { lines: 1, charge_cents: '15000', priced_lines: 1, priced_charge_cents: '15000', reasons: [] },
  anomalies: [],
  validated: { lines: 1, variance_cents: '3000', patterns: [], not_actionable: [] },
  overpaid: { lines: 0, variance_cents: '0' },
  cases: [CASE],
  pursuit: { estimated: false, cost_cents: null, net_expected_cents: null },
  evidence_gaps: [],
};

const text = (html: string) => html.replace(/<[^>]+>/g, '').replaceAll('&#x27;', '’').replaceAll('&amp;', '&');

describe('the audit report on screen after a recovery (N4)', () => {
  it('notes payer approved as the ledger’s when it holds any, and says none was recorded only when none was', () => {
    const shown = text(renderToStaticMarkup(<Headline headline={CONTENT.headline} practiceId="p" base="/r" />));
    expect(shown).toContain('Payer approved$30.00what payers accepted, from the recovery ledger; not cash until it posts');
    expect(shown).toContain(`${STAGE_LABELS.recovered}$30.00`);
    expect(shown).not.toContain('recorded yet');
    const none = text(renderToStaticMarkup(<Headline headline={{ ...CONTENT.headline, payer_approved_cents: '0', recovered_cents: '0' }} practiceId="p" base="/r" />));
    expect(none).toContain('no payer approval was recorded yet');
  });

  it('shows each case still actionable in the cases table and its payer approved and recovered by case, the headline’s sums', () => {
    const shown = text(renderToStaticMarkup(<ReportSections content={CONTENT} practiceId="p" />));
    // The cases table: the case's state in words, nothing still actionable.
    // Its lines still actionable beside their variance, the lines the headline counts: none of its one line.
    expect(shown).toContain('Paid below the contract rateResolved0 of 1$0.002036-03-29');
    // By case: approved and recovered from the ledger's entries.
    expect(shown).toContain('SYNTHETIC PAYER LCE:SYNPLAN-FIX-LEDResolved$30.00$30.00');
    expect(shown).toContain('the headline is the sum of each column');
    expect(shown).not.toContain('Neither had an entry');
  });

  it('shows a report stored before the stages were read as it was: its share, and no entry', () => {
    const { actionable_now_lines: _lines, actionable_now_cents: _cents, payer_approved_cents: _approved, recovered_cents: _recovered, ...stored } = CASE;
    const before = { ...CONTENT, headline: { ...CONTENT.headline, actionable_cents: '3000', actionable_lines: 1, payer_approved_cents: '0', recovered_cents: '0' }, cases: [{ ...stored, state: 'open' }] };
    const shown = text(renderToStaticMarkup(<ReportSections content={before} practiceId="p" />));
    expect(shown).toContain('Paid below the contract rateOpen1 of 1$30.002036-03-29');
    expect(shown).toContain('SYNTHETIC PAYER LCE:SYNPLAN-FIX-LEDOpen$0.00$0.00');
    expect(shown).toContain('Neither had an entry for these cases’ lines when the report was generated.');
  });
});

describe('the submissions sent without sign-off on the Reports screen (the founder’s ruling of 2026-10-20)', () => {
  it('says beside the case’s state how many there were, and under By case the report’s own sentence, only when there are any', () => {
    const sent = { ...CONTENT, cases: [{ ...CASE, state: 'awaiting_response', unattested_submissions: 2 }] };
    const markup = renderToStaticMarkup(<ReportSections content={sent} practiceId="p" />);
    const shown = text(markup);
    expect(shown).toContain('Awaiting response; 2 submissions sent without sign-off: pricing went stale after export');
    expect(markup).toContain('data-unattested-submissions="2"');
    // The PDF's own sentence (the markup's apostrophes read back as the text helper reads them).
    expect(shown).toContain(unattestedSubmissionsNote(2).replaceAll("'", '’'));
    expect(unattestedSubmissionsNote(2)).toBe(
      "2 submissions sent without sign-off: pricing went stale after export. Each sent an export whose pricing went stale after it was made, so no reimbursement reviewer attested it; the payer's answer to it counts here as any other's.",
    );
    // None: no sentence.
    expect(renderToStaticMarkup(<ReportSections content={CONTENT} practiceId="p" />)).not.toContain('data-unattested-submissions');
  });
});
