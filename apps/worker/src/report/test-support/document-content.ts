import { UNPRICED_REASONS } from '@tp/pricing';

import { COVERAGE_REPORT_FORMAT, type CoverageReportContent, MONTHLY_SUMMARY_FORMAT, type MonthlySummaryContent, type MonthlySummaryRow, SUMMARY_BUCKET_CODES } from '../documents';

/** The v1 reports' stored figures, written by hand (SYNTHETIC). */

export const RUN = '0b6e2a7c-3f4d-4e5a-8b9c-1d2e3f4a5b03';
export const PLAN = '1e4b8f8a-2c1d-4f7e-8b3a-5d6c7e8f9a02';
export const PAYER = '7d0c3d0e-8a64-4c1b-9d6f-0b8f4f0f6a01';
export const PINS = { documentId: '5a1f0e3e-6c9b-4d7a-9f3b-2e1d0c9b8a07', practiceName: 'SYNTHETIC PHYSICAL THERAPY', generatedBy: 'billing-manager@synthetic.test', generatedAt: '2026-10-16 09:00:00' };

export function coverage(overrides: Partial<CoverageReportContent> = {}): CoverageReportContent {
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

export function monthly(): MonthlySummaryContent {
  return { format: MONTHLY_SUMMARY_FORMAT, generated_on: '2026-10-16', month: '2026-03', total: row(null, null), by_payer: [row(PAYER, '=SYNTHETIC PAYER Q')] };
}
