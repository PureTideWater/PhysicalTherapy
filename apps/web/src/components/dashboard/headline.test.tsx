import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { Dashboard, Headline } from '../../lib/dashboard/queries';
import { NO_BAA } from '../../lib/uploads/gate';
import { ActionableNote, FirstUpload, HeadlineTiles, actionableNote, recoveredPeriodWords, uploadGate } from './headline';

/**
 * The practice home's headline in words (test matrix HOM-02) and its empty state (HOM-03): the Actionable tile
 * counts its lines and names those out of the figure only when there are any; Payer approved says it is cumulative and
 * which cash counts as recovered at the proof level; Recovered reads to date since its first counted entry, or none
 * yet, with this quarter beside it and no stage number; and before the first file the home says the gate Uploads uses.
 */

const text = (html: string) => html.replace(/<[^>]+>/g, '').replaceAll('&#x27;', '’').replaceAll('&amp;', '&');

const QUARTER: Dashboard['recoveredQuarter'] = { quarter: '2026-Q4', from: '2026-10-01', to: '2026-12-31', cents: '0' };

function headline(overrides: Partial<Headline> = {}): Headline {
  return {
    actionable: { lines: 0, cents: '0', outOfFigure: { movedOn: 0, stale: 0 } },
    payerApprovedCents: '0',
    recoveredCents: '1200',
    recoveredSince: '2026-06-09',
    proofLevel: 'deposited',
    flagged: { lines: 0 },
    validated: { lines: 0, cents: '0' },
    ...overrides,
  };
}

const tiles = (value: Headline, quarter = QUARTER) => renderToStaticMarkup(<HeadlineTiles practiceId="p1" headline={value} recoveredQuarter={quarter} />);

describe('the Actionable tile', () => {
  it('counts its lines with counted(): 0, 1 and 2', () => {
    expect(actionableNote({ lines: 0, cents: '0', outOfFigure: { movedOn: 0, stale: 0 } })).toBe('what the packets ask for: 0 lines in cases still being worked');
    expect(actionableNote({ lines: 1, cents: '3000', outOfFigure: { movedOn: 0, stale: 0 } })).toBe('what the packets ask for: 1 line in cases still being worked');
    expect(actionableNote({ lines: 2, cents: '6000', outOfFigure: { movedOn: 0, stale: 0 } })).toBe('what the packets ask for: 2 lines in cases still being worked');
  });

  it('names the lines out of the figure, each cause only when it counts one: 0, 1 and 2 of each', () => {
    const note = (movedOn: number, stale: number) => actionableNote({ lines: 0, cents: '0', outOfFigure: { movedOn, stale } });
    expect(note(0, 1)).toBe('what the packets ask for: 0 lines in cases still being worked; out of the figure: 1 line whose pricing is no longer current');
    expect(note(0, 2)).toBe('what the packets ask for: 0 lines in cases still being worked; out of the figure: 2 lines whose pricing is no longer current');
    expect(note(1, 0)).toBe('what the packets ask for: 0 lines in cases still being worked; out of the figure: 1 line moved on past actionable');
    expect(note(2, 0)).toBe('what the packets ask for: 0 lines in cases still being worked; out of the figure: 2 lines moved on past actionable');
    expect(note(2, 1)).toBe('what the packets ask for: 0 lines in cases still being worked; out of the figure: 1 line whose pricing is no longer current and 2 lines moved on past actionable');
  });

  it('renders the note’s words exactly, every count in the mono face (docs/brand/BRAND.md: every unit count)', () => {
    for (const [lines, movedOn, stale] of [
      [0, 0, 0],
      [1, 0, 1],
      [1204, 2, 1],
    ] as const) {
      const actionable = { lines, cents: '0', outOfFigure: { movedOn, stale } };
      const html = renderToStaticMarkup(<ActionableNote actionable={actionable} />);
      expect(text(html)).toBe(actionableNote(actionable));
      expect(html.replace(/<span class="font-mono tabular-nums">[^<]*<\/span>/g, '').replace(/\D/g, '')).toBe('');
    }
  });

  it('shows its dollars and its note in the tile that opens Cases', () => {
    const html = tiles(headline({ actionable: { lines: 0, cents: '0', outOfFigure: { movedOn: 0, stale: 1 } } }));
    expect(html).toContain('href="/p/p1/cases"');
    expect(text(html)).toContain('Actionable$0.00what the packets ask for: 0 lines in cases still being worked; out of the figure: 1 line whose pricing is no longer current');
  });
});

describe('the Payer approved tile', () => {
  it('says it is cumulative, never the patient’s share, and which cash counts as recovered at the proof level', () => {
    expect(text(tiles(headline({ proofLevel: 'deposited' })))).toContain(
      'what payers agreed to pay to date on the lines they corrected, deposited or not, never the patient’s share; only deposited cash counts as recovered',
    );
    expect(text(tiles(headline({ proofLevel: 'posted', recoveredSince: null })))).toContain(
      'what payers agreed to pay to date on the lines they corrected, posted or not, never the patient’s share; only posted cash counts as recovered',
    );
  });

  it('reads as all that was approved, not money still to come, beside a smaller Recovered after a takeback (UX-R1-02)', () => {
    // Approved $30.00, deposited $30.00, $18.00 taken back: Payer approved stays $30.00, Recovered is $12.00.
    const shown = text(tiles(headline({ payerApprovedCents: '3000', recoveredCents: '1200' })));
    expect(shown).toContain('Payer approved$30.00what payers agreed to pay to date on the lines they corrected, deposited or not,');
    expect(shown).toContain('Recovered (deposited)$12.00');
    expect(shown).not.toMatch(/only once it is|until it is|not yet/);
  });
});

describe('the Recovered tile', () => {
  it('reads to date since its first counted entry, then this quarter, the to-date value its own figure', () => {
    const html = tiles(headline(), { ...QUARTER, cents: '500' });
    expect(html).toContain('data-figure="recovered-total"');
    expect(html).toMatch(/data-figure="recovered-to-date"><span class="font-mono tabular-nums">\$12\.00<\/span><\/span>/);
    expect(text(html)).toContain('Recovered (deposited)$12.00to date, since 2026-06-09: cash deposited, proved by the bank export, net of recoupments and reversals');
    expect(text(html)).toContain('This quarter (2026-Q4): $5.00');
    // The date and the quarter key stay whole at a phone's and a tablet's width (docs/adr/0078 Decision 1; UX-R1-04).
    expect(html).toContain('<span class="whitespace-nowrap">2026-06-09</span>');
    expect(html).toContain('<span class="whitespace-nowrap">2026-Q4</span>');
  });

  it('reads none yet before its first counted entry, with no cash verb before the cash words', () => {
    expect(recoveredPeriodWords({ recoveredSince: null })).toBe('to date, none yet');
    expect(text(tiles(headline({ proofLevel: 'posted', recoveredSince: null, recoveredCents: '0' })))).toContain(
      'Recovered (posted)$0.00to date, none yet: cash posted, proved by the posting export, as no deposit data is supplied, net of recoupments and reversals',
    );
    expect(text(tiles(headline({ proofLevel: 'deposited', recoveredSince: null, recoveredCents: '0' })))).toContain(
      'Recovered (deposited)$0.00to date, none yet: cash deposited, proved by the bank export, net of recoupments and reversals',
    );
  });

  it('refuses a quarter that is not a quarter key', () => {
    expect(() => tiles(headline(), { ...QUARTER, quarter: '2026-10' })).toThrow('Not a quarter key');
  });

  it('says no stage number in any tile', () => {
    for (const proofLevel of ['posted', 'deposited'] as const) {
      expect(text(tiles(headline({ proofLevel })))).not.toMatch(/stage[\s-]*(five|5)/i);
    }
  });
});

describe('the home before its first file', () => {
  it('reads the gate as Uploads does: no BAA first, then a suspension', () => {
    expect(uploadGate({ baaOnFile: true }, false)).toBe('open');
    expect(uploadGate({ baaOnFile: true }, true)).toBe('paused');
    expect(uploadGate({ baaOnFile: false }, false)).toBe('no_baa');
    expect(uploadGate({ baaOnFile: false }, true)).toBe('no_baa');
  });

  it('open: the upload sentence and Go to Uploads', () => {
    const html = renderToStaticMarkup(<FirstUpload practiceId="p1" gate="open" agreements />);
    expect(text(html)).toContain('Upload your first 835 files');
    expect(text(html)).toContain('Each file’s receipt follows it from received to loaded, and this page counts what it finds.');
    expect(html).toContain('href="/p/p1/uploads"');
    expect(text(html)).toContain('Go to Uploads');
  });

  it('no BAA: the BAA sentence, the agreement chain for a role that works the practice, never Uploads', () => {
    const html = renderToStaticMarkup(<FirstUpload practiceId="p1" gate="no_baa" agreements />);
    expect(text(html)).toContain('Waiting for the business associate agreement');
    expect(text(html)).toContain(NO_BAA);
    expect(html).toContain('href="/p/p1/settings/agreements"');
    expect(text(html)).toContain('See the agreement chain');
    expect(html).not.toContain('/uploads');
    const viewer = renderToStaticMarkup(<FirstUpload practiceId="p1" gate="no_baa" agreements={false} />);
    expect(text(viewer)).toContain(NO_BAA);
    expect(viewer).not.toContain('href=');
  });

  it('paused: the suspension sentence, no link', () => {
    const html = renderToStaticMarkup(<FirstUpload practiceId="p1" gate="paused" agreements />);
    expect(text(html)).toContain('Uploads are paused');
    expect(text(html)).toContain('They start again once the suspension above is resolved.');
    expect(html).not.toContain('href=');
  });
});
