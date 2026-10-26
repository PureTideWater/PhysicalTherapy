import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { MonthsWaitingOnLocation } from './location';
import type { DiffLine, DiffRun, DiffSide, DiffSummary } from '@tp/worker/pricing';

import { DiffSummaryText, DiffTable, acceptingChanges, splitChangeText, SplitChangeText } from './diff';

/**
 * What a re-run's diff says when the runs pinned different place-of-service splits (docs/adr/0064), and the months
 * waiting on the billing ZIP as a table a keyboard reaches at a phone's width. SYNTHETIC values.
 */

/** A run's pinned split: its ID, and when it was approved (null with no split). */
const split = (id: string | null, approvedAt: string | null = id === null ? null : '2026-10-01T09:30:00Z') => ({
  placeOfServiceSplitId: id,
  placeOfServiceSplitApprovedAt: approvedAt === null ? null : new Date(approvedAt),
});
const text = (html: string) => html.replace(/<[^>]+>/g, '');

describe('the split a re-run’s diff names', () => {
  it('says nothing when both runs pinned the same split, or neither pinned one', () => {
    expect(renderToStaticMarkup(<SplitChangeText before={split('a')} after={split('a')} />)).toBe('');
    expect(renderToStaticMarkup(<SplitChangeText before={split(null)} after={split(null)} />)).toBe('');
  });

  it('never says the runs priced under different approvals when the earlier run had no split at all', () => {
    const added = renderToStaticMarkup(<SplitChangeText before={split(null)} after={split('b', '2026-10-20T14:05:00Z')} />);
    expect(text(added)).toBe(splitChangeText('added', null, new Date('2026-10-20T14:05:00Z')));
    expect(added).toContain('data-split-change="added"');
    expect(text(added)).not.toContain('different approvals');
    expect(text(renderToStaticMarkup(<SplitChangeText before={split('a')} after={split(null)} />))).toBe(splitChangeText('removed', new Date('2026-10-01T09:30:00Z'), null));
    expect(text(renderToStaticMarkup(<SplitChangeText before={split('a')} after={split('b', '2026-10-20T14:05:00Z')} />))).toBe(
      splitChangeText('both', new Date('2026-10-01T09:30:00Z'), new Date('2026-10-20T14:05:00Z')),
    );
  });

  it('names when each split was approved (review of PR 6b-2, finding 16)', () => {
    const before = new Date('2026-10-01T09:30:00Z');
    const after = new Date('2026-10-20T14:05:00Z');
    expect(splitChangeText('both', before, after)).toBe(
      'Places of service set from the approved split: the earlier run priced under the split approved 2026-10-01 09:30 UTC and this run under the one approved 2026-10-20 14:05 UTC, so a place the practice has not set may price at the other rate.',
    );
    expect(splitChangeText('added', null, after)).toBe(
      'The earlier run priced with no approved split; this run takes the split approved 2026-10-20 14:05 UTC for every place the practice has not set, so such a place may now price, or price at the other rate.',
    );
    expect(splitChangeText('removed', before, null)).toBe(
      'The earlier run took the split approved 2026-10-01 09:30 UTC for every place the practice had not set; this run priced with no approved split, so such a place may no longer price, or price at the other rate.',
    );
  });
});

describe('the months waiting on the billing ZIP', () => {
  it('scroll sideways inside a named region the keyboard reaches (scrollable-region-focusable)', () => {
    const html = renderToStaticMarkup(
      <MonthsWaitingOnLocation
        label="Months waiting on the billing ZIP"
        months={[
          {
            periodFrom: '2026-03-01',
            periodTo: '2026-03-31',
            kind: 'location_not_ready',
            status: 'zip_plus_four_needed',
            text: 'Medicare splits ZIP 00012 between payment localities. Add its ZIP+4.',
            totals: { lines: 3, claims: 1, chargeCents: '45000', paidCents: '16800' },
          },
        ]}
      />,
    );
    expect(html).toMatch(/^<div role="region" aria-label="Months waiting on the billing ZIP, scrolls sideways" tabindex="0"/);
    expect(html).toContain('<table class="w-full min-w-[36rem] text-left text-sm" aria-label="Months waiting on the billing ZIP">');
  });
});

describe('what accepting a re-run changes (payment-engine review of PR #50, F4)', () => {
  const PRACTICE = '00000000-0000-4000-8000-000000000001';
  const run = (id: string, periodFrom: string, periodTo: string): DiffRun => ({
    id,
    periodFrom,
    periodTo,
    releaseNo: 900001,
    engineVersion: 'engine-synthetic',
    rerunOfId: null,
    acceptedAt: null,
    completedAt: new Date('2026-10-26T02:09:20Z'),
    placeOfServiceSplitId: null,
    placeOfServiceSplitApprovedAt: null,
  });
  const quarter = run('00000000-0000-4000-8000-0000000000b1', '2026-01-01', '2026-03-31');
  const rerun = run('00000000-0000-4000-8000-0000000000b2', '2026-01-01', '2026-03-31');
  const february = run('00000000-0000-4000-8000-0000000000b3', '2026-02-01', '2026-02-28');
  const side = (pricingRunId: string, unpricedReason: string | null): DiffSide => ({
    pricedLineId: `${pricingRunId}-line`,
    pricingRunId,
    method: unpricedReason === null ? 'MA_NONCONTRACTED' : null,
    expectedAllowedCents: unpricedReason === null ? '5000' : null,
    varianceCents: null,
    unpricedReason,
    adjustments: [],
    windowEndsOn: null,
    reviewFlags: [],
    mappingId: 'mapping',
    contractVersionId: null,
    rateRecordId: null,
  });
  const line: DiffLine = {
    serviceLineId: '00000000-0000-4000-8000-0000000000c1',
    kind: 'changed',
    procedureCode: '97110',
    modifiers: [],
    units: '1',
    before: side(february.id, 'NO_AGREEMENT'),
    after: side(rerun.id, null),
    changes: ['expected_allowed', 'unpriced_reason'],
    causes: [],
  };
  const summary: DiffSummary = {
    compared: 4,
    changed: 1,
    pricedChanged: 1,
    pricedToUnpriced: 0,
    unpricedToPriced: 0,
    unpricedChanged: 0,
    pricedToUnpricedReasons: [],
    unpricedToPricedReasons: [],
    onlyBefore: 1,
    onlyAfter: 0,
    mappingChanged: 0,
    versionChanged: 0,
    windowChanged: 0,
    reviewFlagsChanged: 0,
    beforeExpectedCents: '0',
    afterExpectedCents: '5000',
  };

  it('compares each line’s pricing in effect now with its pricing once accepted, naming a run of other dates that holds a side', () => {
    const html = renderToStaticMarkup(<DiffTable practiceId={PRACTICE} lines={[line]} beforeRunId={quarter.id} afterRunId={rerun.id} heldBy={[february]} />);
    expect(text(html)).toContain('In effect now');
    expect(text(html)).toContain('Once accepted');
    expect(text(html)).toContain('From Pricing run, 2026-02-01 to 2026-02-28, rule release 900001, priced 2026-10-26 02:09:20 UTC');
    expect(html).toContain(`data-held-by="${february.id}"`);
    // Each trace opens under the run that priced that side, the February run's for the line it holds.
    expect(html).toContain(`?run=${february.id}`);
    expect(html).toContain(`?run=${rerun.id}`);
    expect(html).not.toContain(`?run=${quarter.id}`);
  });

  it('says so when accepting changes no line, and keeps the two-run wording for a plain comparison', () => {
    expect(text(renderToStaticMarkup(<DiffTable practiceId={PRACTICE} lines={[]} beforeRunId={quarter.id} afterRunId={rerun.id} heldBy={[]} />))).toContain(
      'Accepting this re-run changes no line',
    );
    const plain = renderToStaticMarkup(<DiffTable practiceId={PRACTICE} lines={[line]} beforeRunId={february.id} afterRunId={rerun.id} />);
    expect(text(plain)).toContain('First run');
    expect(plain).not.toContain('data-held-by');
  });

  it('counts the lines whose pricing in effect accepting changes first, then the totals (UX recheck N2)', () => {
    expect(text(renderToStaticMarkup(<DiffSummaryText summary={summary} accepting />))).toBe(
      'Accepting this re-run changes the pricing in effect of 2 lines: 1 priced differently and 1 no longer priced. Expected allowed on the 4 lines priced both now and once accepted: $0.00 now, $50.00 once accepted.',
    );
    expect(text(renderToStaticMarkup(<DiffSummaryText summary={{ ...summary, onlyBefore: 0, windowChanged: 1 }} accepting />))).toBe(
      'Accepting this re-run changes the pricing in effect of 1 line: 1 priced differently (1 with another dispute window). Expected allowed on the 4 lines priced both now and once accepted: $0.00 now, $50.00 once accepted.',
    );
    expect(text(renderToStaticMarkup(<DiffSummaryText summary={{ ...summary, compared: 0, changed: 0, pricedChanged: 0, onlyBefore: 1, onlyAfter: 2 }} accepting />))).toBe(
      'Accepting this re-run changes the pricing in effect of 3 lines: 1 no longer priced and 2 priced only once accepted.',
    );
  });

  it('says nothing when the diff lists no line, in either wording, leaving the table’s one no-changes line (UX recheck N2; UX confirm, N2 residual)', () => {
    const none = { ...summary, changed: 0, pricedChanged: 0, onlyBefore: 0, onlyAfter: 0 };
    expect(acceptingChanges(none)).toBe(0);
    expect(renderToStaticMarkup(<DiffSummaryText summary={none} accepting />)).toBe('');
    expect(renderToStaticMarkup(<DiffSummaryText summary={none} />)).toBe('');
  });

  it('never counts a line unpriced on one side as priced, nor totals it as $0.00, naming the reasons by code (UX confirm, NEW-B)', () => {
    // A re-run whose three lines, priced now, are NO_AGREEMENT once accepted: no line is priced on both sides.
    const unpriced: DiffSummary = {
      ...summary,
      compared: 0,
      changed: 3,
      pricedChanged: 0,
      pricedToUnpriced: 3,
      pricedToUnpricedReasons: ['NO_AGREEMENT'],
      onlyBefore: 0,
      beforeExpectedCents: '0',
      afterExpectedCents: '0',
    };
    const accepting = renderToStaticMarkup(<DiffSummaryText summary={unpriced} accepting />);
    expect(text(accepting)).toBe('Accepting this re-run changes the pricing in effect of 3 lines: 3 priced now and unpriced once accepted (NO_AGREEMENT).');
    expect(accepting).toContain('<span class="font-mono text-xs">NO_AGREEMENT</span>');
    expect(text(renderToStaticMarkup(<DiffSummaryText summary={unpriced} />))).toBe('No line is priced by both runs; 3 priced by the first run and unpriced by the second (NO_AGREEMENT).');
    // And back, beside lines priced on both sides, whose totals alone are summed.
    const mixed: DiffSummary = {
      ...summary,
      compared: 2,
      changed: 4,
      pricedChanged: 1,
      unpricedToPriced: 2,
      unpricedToPricedReasons: ['NO_AGREEMENT', 'NO_MAPPING'],
      unpricedChanged: 1,
      onlyBefore: 0,
      beforeExpectedCents: '7567',
      afterExpectedCents: '8000',
    };
    expect(text(renderToStaticMarkup(<DiffSummaryText summary={mixed} accepting />))).toBe(
      'Accepting this re-run changes the pricing in effect of 4 lines: 1 priced differently, 2 unpriced now (NO_AGREEMENT, NO_MAPPING) and priced once accepted and 1 unpriced both now and once accepted, under another reason or terms. Expected allowed on the 2 lines priced both now and once accepted: $75.67 now, $80.00 once accepted.',
    );
    expect(text(renderToStaticMarkup(<DiffSummaryText summary={mixed} />))).toBe(
      '1 of 2 lines both runs priced is priced differently; 2 unpriced by the first run (NO_AGREEMENT, NO_MAPPING) and priced by the second; 1 unpriced by both, under another reason or terms. Expected allowed over the lines both priced: $75.67 before, $80.00 after.',
    );
  });

  it('scrolls sideways inside a named region the keyboard reaches at a phone’s width (UX recheck N3)', () => {
    const html = renderToStaticMarkup(<DiffTable practiceId={PRACTICE} lines={[line]} beforeRunId={quarter.id} afterRunId={rerun.id} heldBy={[february]} />);
    expect(html).toMatch(/^<div role="region" aria-label="Changed lines, scrolls sideways" tabindex="0"/);
    expect(html).toContain('<table class="w-full min-w-[40rem] text-left text-sm" aria-label="Changed lines">');
  });
});
