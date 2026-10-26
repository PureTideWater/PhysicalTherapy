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

const row = (family: FamilyThrough['family'], title: string, state: Pick<FamilyThrough, 'through' | 'open' | 'loaded' | 'partly' | 'from'> & { readonly ended?: boolean }): FamilyThrough => ({
  family,
  title,
  ended: false,
  ...state,
});

describe('what the release in force covers', () => {
  it('lists every family it is given, a family not loaded, one partly loaded and one loaded only later included, in words', () => {
    const html = renderToStaticMarkup(
      <ReleaseLoadedThrough
        coverageHref="/p/synthetic-practice/coverage"
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
    const date = (value: string) => `<span class="whitespace-nowrap font-mono tabular-nums">${value}</span>`;
    expect(html.match(/<li /g)).toHaveLength(6);
    expect(html).toContain('data-family="fee_schedule" data-through="2026-12-31"');
    expect(html).toContain(`Medicare fee schedule: loaded through ${date('2026-12-31')}</li>`);
    expect(html).toContain('data-through="open">Conversion factor: in force, no end date');
    expect(html).toContain('data-family="therapy_thresholds" data-through="not_loaded">Therapy threshold: not loaded in this release');
    expect(html).toContain(`data-through="later">Medicare unit limits (MUE): loaded only from ${date('2027-01-01')}`);
    expect(html).toContain('Code-pair edits (PTP): loaded only from a later date');
  });

  it('says what waits for a family partly loaded, with a link to Coverage, and that the lines after an ended family are not priced (UX-8)', () => {
    const html = renderToStaticMarkup(
      <ReleaseLoadedThrough
        coverageHref="/p/synthetic-practice/coverage"
        families={[
          row('zip_locality', 'ZIP to locality', { through: null, open: false, loaded: false, partly: true, from: null }),
          row('ncci_mue', 'Medicare unit limits (MUE)', { through: '2026-12-31', open: false, loaded: true, partly: false, from: null, ended: true }),
        ]}
      />,
    );
    const plain = html.replaceAll(/<[^>]+>/g, '').replaceAll('<!-- -->', '');
    expect(html).toContain('data-family="zip_locality" data-through="partly">');
    expect(plain).toContain('ZIP to locality: only partly loaded in this release. Lines that need the rest of it are not priced until it is loaded; Coverage lists them.');
    expect(html).toContain('<a class="underline" href="/p/synthetic-practice/coverage">Coverage</a>');
    expect(plain).toContain('Medicare unit limits (MUE): loaded through 2026-12-31 (ended; lines after that date are not priced until PaidWhole loads what follows)');
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

  it('shows each month in the location card’s shape, its status last, named apart from the card, with the quarter in words and the codes and release in the mono face (UX-4, UX-5, UX-6, UX-15)', () => {
    const waiting = month('2026-12-01', { quarters: ['2026-Q4'] });
    const repricing = month('2027-01-01', { kind: 'repricing', releaseInForce: 900_007 });
    const noQuarter = month('2027-02-01', { quarters: [], families: ['mue'] });
    const changed = month('2027-03-01', { kind: 'terms_changed' });
    const html = renderToStaticMarkup(<MonthsWaitingOnContent months={[waiting, repricing, noQuarter, changed]} label="Months and the Medicare content each waits on" />);
    const mono = (text: string) => `<span class="font-mono tabular-nums">${text}</span>`;
    expect([...html.matchAll(/<th class="[^"]*">([^<]*)<\/th>/g)].map((match) => match[1])).toEqual(['Month', 'Lines', 'Claims', 'Billed', 'Paid', 'Status']);
    expect(html).toContain('aria-label="Months and the Medicare content each waits on, scrolls sideways"');
    expect(html).toContain('<table class="w-full min-w-[36rem] text-left text-sm" aria-label="Months and the Medicare content each waits on">');
    expect(html).toContain(`Waiting on the Q4 2026 (Oct–Dec) Medicare content (${mono('MPPR')}, ${mono('MUE')})`);
    expect(html).toContain(`Being priced again under release ${mono('900007')}`);
    expect(html).toContain(`Waiting on the Medicare content (${mono('MUE')})`);
    expect(html).toContain('Being priced again under the practice’s changed terms');
    expect(html).not.toContain('2026-Q4');
    // Claims and paid, as the location card shows them.
    expect(html).toMatch(/data-waiting-month="2026-12"[\s\S]*?>2<\/td>[\s\S]*?>1<\/td>[\s\S]*?\$123\.45[\s\S]*?\$60\.00/);
    // The same words as waitingOnText, once the tags are gone.
    const cells = [...html.matchAll(/<td class="py-1">(.*?)<\/td>/g)].map((match) => (match[1] ?? '').replaceAll(/<[^>]+>/g, '').replaceAll('<!-- -->', ''));
    expect(cells).toEqual([waitingOnText(waiting), waitingOnText(repricing), waitingOnText(noQuarter), waitingOnText(changed)]);
  });

  it('adds lines and dollars across months for the headline, never claims, which a claim spanning two months would count twice (int-surfaces improvement 3)', () => {
    const headline = contentHeadline([month('2026-12-01'), month('2027-01-01', { totals: { lines: 3, claims: 1, chargeCents: '900719925474099300', paidCents: '1' } })]);
    expect(headline).toEqual({ lines: 5, chargeCents: '900719925474111645', paidCents: '6001' });
    expect(Object.keys(headline)).not.toContain('claims');
  });
});
