import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { type ContentWaitMonth, contentHeadline, waitingOnText } from '../../lib/pricing/content';
import type { FamilyThrough } from '../../lib/releases/content-through';
import { MonthsWaitingOnContent, ReleaseLoadedThrough } from './content';

/**
 * The Releases page's "What this release covers" (audit #59; docs/adr/0071; test matrix RCC-08; review S1): every family
 * of the release in force, one it does not load, loads only in part or loads only from a later day included, in words. SYNTHETIC rows,
 * written by hand.
 */

const row = (family: FamilyThrough['family'], title: string, state: Pick<FamilyThrough, 'through' | 'open' | 'loaded' | 'partly' | 'from'>): FamilyThrough => ({ family, title, ...state });

describe('what the release in force covers', () => {
  it('lists every family it is given, a family not loaded, one partly loaded and one loaded only later included, in words', () => {
    const html = renderToStaticMarkup(
      <ReleaseLoadedThrough
        families={[
          row('fee_schedule', 'Medicare fee schedule', { through: '2026-12-31', open: false, loaded: true, partly: false, from: null }),
          row('conversion_factor', 'Conversion factor', { through: null, open: true, loaded: true, partly: false, from: null }),
          row('zip_locality', 'ZIP to locality', { through: null, open: false, loaded: false, partly: true, from: null }),
          row('therapy_thresholds', 'Therapy threshold', { through: null, open: false, loaded: false, partly: false, from: null }),
          row('ncci_mue', 'Medicare unit limits (MUE)', { through: null, open: false, loaded: true, partly: false, from: '2027-01-01' }),
          row('ncci_ptp', 'Code-pair edits (PTP)', { through: null, open: false, loaded: true, partly: false, from: null }),
        ]}
      />,
    );
    expect(html.match(/<li /g)).toHaveLength(6);
    expect(html).toContain('data-family="fee_schedule" data-through="2026-12-31"');
    expect(html).toContain('Medicare fee schedule: loaded through <span class="font-mono tabular-nums">2026-12-31</span>');
    expect(html).toContain('data-through="open">Conversion factor: in force, no end date');
    expect(html).toContain('data-family="zip_locality" data-through="partly">ZIP to locality: only partly loaded in this release');
    expect(html).toContain('data-family="therapy_thresholds" data-through="not_loaded">Therapy threshold: not loaded in this release');
    expect(html).toContain('data-through="later">Medicare unit limits (MUE): loaded only from <span class="font-mono tabular-nums">2027-01-01</span>');
    expect(html).toContain('Code-pair edits (PTP): loaded only from a later date');
  });
});

describe('the months waiting on Medicare content', () => {
  const month = (periodFrom: string, changes: Partial<ContentWaitMonth> = {}): ContentWaitMonth => ({
    periodFrom,
    periodTo: `${periodFrom.slice(0, 8)}28`,
    kind: 'waiting',
    failureCode: 'waiting_on_content_mppr_mue',
    failedReleaseNo: 900_001,
    families: ['mppr', 'mue'],
    quarters: ['2026-Q4', '2027-Q1'],
    releaseInForce: 900_001,
    totals: { lines: 2, claims: 1, chargeCents: '12345', paidCents: '6000' },
    ...changes,
  });

  it('sets the quarters, the family codes and the release number in the mono face, in the words waitingOnText gives (review S9)', () => {
    const waiting = month('2026-12-01');
    const html = renderToStaticMarkup(<MonthsWaitingOnContent months={[waiting, month('2027-01-01', { kind: 'repricing', releaseInForce: 900_007 }), month('2027-02-01', { quarters: [], families: ['mue'] })]} label="Months waiting" />);
    const mono = (text: string) => `<span class="font-mono tabular-nums">${text}</span>`;
    expect(html).toContain(`the ${mono('2026-Q4')}, ${mono('2027-Q1')} Medicare content (${mono('MPPR')}, ${mono('MUE')})`);
    expect(html).toContain(`being priced again under release ${mono('900007')}`);
    expect(html).toContain(`the Medicare content (${mono('MUE')})`);
    // The same words as waitingOnText, once the tags are gone.
    const cells = [...html.matchAll(/<td class="py-1 pr-3">(.*?)<\/td>/g)].map((match) => (match[1] ?? '').replaceAll(/<[^>]+>/g, '').replaceAll('<!-- -->', ''));
    expect(cells.filter((cell) => cell.includes('Medicare content') || cell.includes('priced again'))).toEqual([
      waitingOnText(waiting),
      waitingOnText(month('2027-01-01', { kind: 'repricing', releaseInForce: 900_007 })),
      waitingOnText(month('2027-02-01', { quarters: [], families: ['mue'] })),
    ]);
  });

  it('adds lines and dollars across months for the headline, never claims, which a claim spanning two months would count twice (int-surfaces improvement 3)', () => {
    const headline = contentHeadline([month('2026-12-01'), month('2027-01-01', { totals: { lines: 3, claims: 1, chargeCents: '900719925474099300', paidCents: '1' } })]);
    expect(headline).toEqual({ lines: 5, chargeCents: '900719925474111645', paidCents: '6001' });
    expect(Object.keys(headline)).not.toContain('claims');
  });
});
