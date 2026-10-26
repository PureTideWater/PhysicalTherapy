import { type Cents } from '@tp/money';
import { describe, expect, it } from 'vitest';

import { STAGE_LABELS, headline } from './headline';

describe('the headline (PRD 12)', () => {
  it('shows three numbers, actionable, payer approved and recovered, with flagged and validated below and labelled', () => {
    const shown = headline({
      actionableCents: 55200n as Cents,
      actionableLines: 16,
      payerApprovedCents: 0n as Cents,
      recoveredCents: 0n as Cents,
      flaggedLines: 4,
      flaggedRangeLowCents: 4000n as Cents,
      flaggedRangeHighCents: 8000n as Cents,
      validatedLines: 19,
      validatedCents: 61000n as Cents,
    });
    expect(shown.figures.map((figure) => [figure.stage, figure.label, figure.cents])).toEqual([
      ['actionable', 'Actionable', 55200n],
      ['payer_approved', 'Payer approved', 0n],
      ['recovered', 'Recovered (posted or deposited)', 0n],
    ]);
    // Payer approved is what payers have agreed to pay, never the patient's share (PRD 12; docs/adr/0067).
    expect(shown.figures[1]?.note).toBe('what payers have agreed to pay on the lines they corrected');
    expect(shown.flagged).toMatchObject({ label: 'Flagged (investigatory)', lines: 4, rangeLowCents: 4000n, rangeHighCents: 8000n });
    expect(shown.validated).toMatchObject({ label: 'Validated', lines: 19, cents: 61000n });
    // "Recovered" names stage five only, and never without the cash that proves it (docs/brand/BRAND.md, section 7).
    expect(Object.entries(STAGE_LABELS).filter(([, label]) => /recovered/i.test(label))).toEqual([['recovered', 'Recovered (posted or deposited)']]);
    expect(JSON.stringify([shown.flagged, shown.validated, shown.figures[0], shown.figures[1]], (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value))).not.toMatch(/recover/i);
  });
});
