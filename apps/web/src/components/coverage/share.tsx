import type { ReactNode } from 'react';

import type { LineShare } from '../../lib/coverage/in-effect';
import { shareOf } from '../../lib/pricing/view';
import { Money } from '../remittances/display';

/**
 * Coverage shares in words (PRD 5, J7: "priced lines and dollars as a share of all"; lib/coverage/in-effect.ts):
 * every count and share in the mono face with tabular numerals, every amount through Money. The shares are
 * computed from integers by shareOf (tenths of a percent, never a float on an amount).
 */

/** A count, a share or a code, set as a figure (mono, tabular numerals). */
export function Figure({ children }: { readonly children: ReactNode }) {
  return <span className="font-mono tabular-nums">{children}</span>;
}

/** "4 of 36 lines priced (11.1%), $600.00 of $3,000.00 billed (20.0%)". */
export function PricedShare({ priced, of }: { readonly priced: LineShare; readonly of: LineShare }) {
  return (
    <>
      <Figure>{priced.lines}</Figure> of <Figure>{of.lines}</Figure> {of.lines === 1 ? 'line' : 'lines'} priced (<Figure>{shareOf(priced.lines, of.lines)}</Figure>), <Money value={priced.chargeCents} /> of{' '}
      <Money value={of.chargeCents} /> billed (<Figure>{shareOf(priced.chargeCents, of.chargeCents)}</Figure>)
    </>
  );
}
