import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { FigureView } from '../../lib/reconciliation/queries';
import { RoiFigure } from './roi';

/**
 * An ROI statement's figure on screen (PRD 13; the screen tour's C1: "its 1 linked entries"): the count of the
 * entries it is recomputed from takes its noun in the singular for one. SYNTHETIC entries, written by hand.
 */

const ENTRY = { id: '5e1d0000-0000-4000-8000-000000000001', caseId: '5e1d0000-0000-4000-8000-0000000000c1', stage: 'deposited', amountCents: '3000', effectiveOn: '2026-08-14', allocated: false };

function recomputed(entries: FigureView['entries'], matches = true): string {
  const total = entries.reduce((sum, entry) => sum + BigInt(entry.amountCents), 0n).toString();
  const html = renderToStaticMarkup(<RoiFigure id="recovered" label="Recovered principal, net (deposited)" note="Deposited in the period." figure={{ storedCents: total, recomputedCents: total, matches, entries }} practiceId="p" empty="None." />);
  const span = /<span data-recomputed="recovered"[^>]*>([\s\S]*?)<\/span><\/p>/.exec(html)?.[1] ?? '';
  return span.replace(/<[^>]+>/g, '');
}

describe('an ROI statement’s figure', () => {
  it('counts one linked entry in the singular and any other count in the plural', () => {
    expect(recomputed([ENTRY])).toBe('Recomputed from its 1 linked entry: $30.00, the figure stored.');
    expect(recomputed([ENTRY, { ...ENTRY, id: '5e1d0000-0000-4000-8000-000000000002', amountCents: '-1800', stage: 'recouped' }])).toBe('Recomputed from its 2 linked entries: $12.00, the figure stored.');
    expect(recomputed([])).toBe('Recomputed from its 0 linked entries: $0.00, the figure stored.');
  });

  it('says its entries give another amount when they do not match, with no count', () => {
    expect(recomputed([ENTRY], false)).toBe('Its linked entries give $30.00, not the figure stored.');
  });
});
