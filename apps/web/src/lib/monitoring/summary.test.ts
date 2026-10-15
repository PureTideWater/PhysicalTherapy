import { describe, expect, it } from 'vitest';

import { SUMMARY_LABELS, monthlySummaryCsv } from '../routes/monitoring';
import { type MonthlySummary, SUMMARY_BUCKETS, type SummaryBucket, type SummaryFigure, lastMonth } from './queries';

const zero = (dollars: boolean): SummaryFigure => ({ lines: 0, billedCents: '0', varianceCents: dollars ? '0' : null });
const figures = (overrides: Partial<Record<SummaryBucket, SummaryFigure>> = {}) =>
  Object.fromEntries(SUMMARY_BUCKETS.map((bucket) => [bucket, overrides[bucket] ?? zero(['validated', 'actionable', 'payer_approved', 'recovered'].includes(bucket))])) as Record<SummaryBucket, SummaryFigure>;

describe('the monthly variance summary as CSV', () => {
  it('writes one row per payer and stage, counts and totals only, never a stage added to another', () => {
    const summary: MonthlySummary = {
      month: '2026-03',
      total: { payerId: null, payerName: null, figures: figures({ actionable: { lines: 16, billedCents: '240000', varianceCents: '55200' }, validated: { lines: 1, billedCents: '7500', varianceCents: '-5' } }), writtenOff: zero(true) },
      byPayer: [{ payerId: '7d0c3d0e-8a64-4c1b-9d6f-0b8f4f0f6a01', payerName: 'SYNTHETIC PAYER, "Q"', figures: figures(), writtenOff: { lines: 2, billedCents: '15000', varianceCents: '7' } }],
    };
    const lines = monthlySummaryCsv(summary).split('\r\n');
    expect(lines[0]).toBe('month,payer,stage,lines,billed,variance');
    expect(lines).toContain('2026-03,all payers,actionable,16,2400.00,552.00');
    expect(lines).toContain('2026-03,all payers,validated,1,75.00,-0.05');
    expect(lines).toContain('2026-03,all payers,flagged,0,0.00,');
    expect(lines).toContain('2026-03,"SYNTHETIC PAYER, ""Q""",actionable_written_off,2,150.00,0.07');
    // Ten rows for each of the two groupings, the header and the final line break.
    expect(lines).toHaveLength(1 + 2 * (SUMMARY_BUCKETS.length + 1) + 1);
    expect(lines.at(-1)).toBe('');
    const unnamed = monthlySummaryCsv({ ...summary, byPayer: [{ ...summary.byPayer[0], payerName: null } as MonthlySummary['byPayer'][number]] });
    expect(unnamed).toContain('2026-03,7d0c3d0e-8a64-4c1b-9d6f-0b8f4f0f6a01,flagged,0,0.00,');
  });

  it('labels every stage as the rest of the product does, and the lines with no stage by how their run left them', () => {
    expect(SUMMARY_LABELS).toMatchObject({ flagged: 'Flagged (investigatory)', validated: 'Validated', actionable: 'Actionable', payer_approved: 'Payer approved', recovered: 'Recovered' });
    expect(Object.keys(SUMMARY_LABELS).sort()).toEqual([...SUMMARY_BUCKETS].sort());
  });

  it('defaults to the month before the current one', () => {
    expect(lastMonth(new Date('2026-10-15T12:00:00Z'))).toBe('2026-09');
    expect(lastMonth(new Date('2027-01-01T00:00:00Z'))).toBe('2026-12');
  });
});
