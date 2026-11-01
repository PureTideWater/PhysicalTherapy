import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { ActionState } from '../../lib/http/next';
import type { MonthAwaitingMappings, MonthToPriceAgain, PriceAgainState } from '../../lib/pricing/mapped-plan';
import type { MonthsToPrice } from '../../lib/routes/mapping';
import { brandOrderProblems, repeatedIds } from '../stacked-rows';
import {
  EveryPlanMappedAlert,
  LAST_FAILURE_TEXT,
  MONTH_COLUMNS,
  MONTHS_NOTICES,
  MappedNotPricedAlert,
  MonthsToPriceAgainRegion,
  MonthsWaitingRegion,
  UnmappedPlansAlert,
  monthFields,
  monthsWaitingText,
  priceAgainStateText,
  toTriageText,
} from './months';

/**
 * What a plan's mapping leaves to price, on the mapping screens, and the two live figures (combined audit #32;
 * docs/adr/0075; design 4.1 to 4.3, 5 and 9; test matrix MAP-06 to MAP-08, PRC-31). Server components, so their markup
 * is proven here; the 390 px switch between the table and the stacked rows is the e2e suite's. Every ID, date and
 * amount is SYNTHETIC, written by hand.
 */

// The form that refreshes the page after a refusal (refreshOnError) reads the router, which no test mounts.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => undefined }) }));

const PRACTICE = '00000000-0000-4000-8000-0000000000c1';
const PLAN = '00000000-0000-4000-8000-0000000000d1';
const RUN = (n: number) => `00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;
const RERUN = '00000000-0000-4000-8000-0000000002f1';

const action = (state: ActionState): Promise<ActionState> => Promise.resolve(state);
const formKeys = (): ReactNode => <input type="hidden" name="requestKey" value="synthetic-request-key" />;

/** The words, tags dropped. */
function words(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&#x27;/g, '’')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ');
}

const month = (n: number, state: PriceAgainState, lines = 3, chargeCents = '27000'): MonthToPriceAgain => ({
  pricingRunId: RUN(n),
  periodFrom: `2026-0${String(n)}-01`,
  periodTo: `2026-0${String(n)}-28`,
  releaseNo: 900001,
  lines,
  chargeCents,
  newestMappingAt: '2026-10-30T12:00:00.000Z',
  state,
});

const awaiting = (n: number, unmappedPlanIds: readonly string[]): MonthAwaitingMappings => ({
  periodFrom: `2026-0${String(n)}-01`,
  periodTo: `2026-0${String(n)}-28`,
  planIds: [PLAN, ...unmappedPlanIds],
  unmappedPlanIds,
  unmappedPlans: unmappedPlanIds.length,
  mappedPlans: 1,
  held: null,
});

function toPrice(changes: Partial<MonthsToPrice> = {}): MonthsToPrice {
  const priceAgain = changes.priceAgain ?? [];
  return {
    waiting: { months: [], plans: 0 },
    priceAgain,
    readyRunIds: priceAgain.filter((entry) => entry.state.kind === 'ready').map((entry) => entry.pricingRunId),
    toTriage: [],
    releaseNo: 900001,
    ...changes,
  };
}

function region(months: MonthsToPrice, options: { readonly planId?: string | null; readonly canMap?: boolean; readonly canWorkCases?: boolean } = {}): string {
  return renderToStaticMarkup(
    <MonthsToPriceAgainRegion
      practiceId={PRACTICE}
      planId={options.planId === undefined ? PLAN : options.planId}
      months={months}
      canMap={options.canMap ?? true}
      canWorkCases={options.canWorkCases ?? true}
      action={action}
      formKeys={formKeys}
    />,
  );
}

describe('the plans with no mapping (figure 1; MAP-06)', () => {
  const totals = { plans: 2, lines: 14, chargeCents: '123400' };

  it('say on Coverage how many plans have no mapping, their lines and billed dollars, and that every other plan prices', () => {
    const html = renderToStaticMarkup(<UnmappedPlansAlert practiceId={PRACTICE} totals={totals} canMap place="coverage" />);
    expect(words(html)).toBe('2 plans have no mapping; their lines are not priced14 lines, $1,234.00 billed. Lines of every other plan price as usual. Map them on Payer and plan mapping.');
    expect(html).toContain('data-state="unmapped"');
    expect(html).toContain(`href="/p/${PRACTICE}/mapping"`);
  });

  it('are a default Alert on the unpriced tint, never the destructive one (nothing failed: D7), with the figures in the mono face', () => {
    const html = renderToStaticMarkup(<UnmappedPlansAlert practiceId={PRACTICE} totals={totals} canMap place="coverage" />);
    expect(html).not.toContain('destructive');
    expect(html).toContain('bg-status-unpriced-bg');
    expect(html).toContain('<span class="font-mono tabular-nums">2</span>');
    expect(html).toContain('<span class="font-mono tabular-nums">$1,234.00</span>');
  });

  it('say on Pricing runs that the lines wait in every run, and that only a line the engine reaches is NO_MAPPING, in the mono face', () => {
    const html = renderToStaticMarkup(<UnmappedPlansAlert practiceId={PRACTICE} totals={totals} canMap place="pricing_runs" />);
    expect(words(html)).toContain('14 lines, $1,234.00 billed, are not priced in any run until their plans are mapped; a line the engine reaches is left as NO_MAPPING. Map them.');
    expect(html).toContain('<span class="font-mono tabular-nums">NO_MAPPING</span>');
  });

  it('say on the home page how the queue below counts differently (12g)', () => {
    expect(words(renderToStaticMarkup(<UnmappedPlansAlert practiceId={PRACTICE} totals={totals} canMap place="home" />))).toContain(
      '14 lines, $1,234.00 billed. Lines of every other plan price as usual. The queue “Plans waiting on a mapping” below also counts plans mapped for only some dates. Map them.',
    );
  });

  it('link a person who may not map plans to see them instead (D6)', () => {
    const text = words(renderToStaticMarkup(<UnmappedPlansAlert practiceId={PRACTICE} totals={totals} canMap={false} place="coverage" />));
    expect(text).toContain('Lines of every other plan price as usual. See them on Payer and plan mapping.');
    expect(text).not.toContain('Map them');
  });

  it('use the singular for one plan and one line', () => {
    const one = { plans: 1, lines: 1, chargeCents: '7500' };
    expect(words(renderToStaticMarkup(<UnmappedPlansAlert practiceId={PRACTICE} totals={one} canMap place="coverage" />))).toBe(
      '1 plan has no mapping; its lines are not priced1 line, $75.00 billed. Lines of every other plan price as usual. Map it on Payer and plan mapping.',
    );
    expect(words(renderToStaticMarkup(<UnmappedPlansAlert practiceId={PRACTICE} totals={one} canMap={false} place="pricing_runs" />))).toContain(
      '1 line, $75.00 billed, is not priced in any run until its plan is mapped; a line the engine reaches is left as NO_MAPPING. See it on Payer and plan mapping.',
    );
  });

  it('say nothing when every plan has a mapping, where Coverage says so instead', () => {
    expect(renderToStaticMarkup(<UnmappedPlansAlert practiceId={PRACTICE} totals={{ plans: 0, lines: 0, chargeCents: '0' }} canMap place="home" />)).toBe('');
    const html = renderToStaticMarkup(<EveryPlanMappedAlert />);
    expect(words(html)).toBe('Every plan has a mappingLines outside every mapping’s dates are left unpriced as NO_MAPPING, one by one.');
    expect(html).toContain('data-state="mapped"');
  });
});

describe('the lines of mapped plans still not priced (figure 2; PRC-31)', () => {
  const totals = { lines: 9, chargeCents: '81200', runs: 2 };

  it('say how many, their billed dollars and priced months, why, and link to the months to price again', () => {
    const html = renderToStaticMarkup(<MappedNotPricedAlert practiceId={PRACTICE} totals={totals} canMap />);
    expect(words(html)).toBe(
      '9 lines of mapped plans are still not priced$812.00 billed, in 2 priced months, are still NO_MAPPING in the pricing in effect: their plans were mapped after those months were priced. Price their months again on Payer and plan mapping.',
    );
    expect(html).toContain('data-state="mapped_not_priced"');
    expect(html).toContain(`href="/p/${PRACTICE}/mapping#months-to-price-again"`);
    expect(html).not.toContain('destructive');
  });

  it('link a person who may not map plans to see them (C9), use the singular, and say nothing at zero', () => {
    expect(words(renderToStaticMarkup(<MappedNotPricedAlert practiceId={PRACTICE} totals={totals} canMap={false} />))).toContain('were priced. See them on Payer and plan mapping.');
    expect(words(renderToStaticMarkup(<MappedNotPricedAlert practiceId={PRACTICE} totals={{ lines: 1, chargeCents: '7500', runs: 1 }} canMap />))).toBe(
      '1 line of a mapped plan is still not priced$75.00 billed, in 1 priced month, is still NO_MAPPING in the pricing in effect: its plan was mapped after that month was priced. Price its month again on Payer and plan mapping.',
    );
    expect(renderToStaticMarkup(<MappedNotPricedAlert practiceId={PRACTICE} totals={{ lines: 0, chargeCents: '0', runs: 0 }} canMap />)).toBe('');
  });
});

describe('months waiting for a first run (MAP-07)', () => {
  const OTHER = ['00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000d3'];

  it('say, on a plan’s page, how many months holding its lines wait for how many other plans, and what pricing now costs', () => {
    expect(monthsWaitingText({ months: [awaiting(2, OTHER), awaiting(3, OTHER), awaiting(4, OTHER)], plans: 2 }, true)).toBe(
      '3 months holding this plan’s lines wait for 2 other plans’ mappings. Map those plans first, so each month is priced once. Or price them now: the lines of plans still with no mapping stay unpriced as NO_MAPPING, and those months need pricing again once their plans are mapped. Monitoring prices them anyway at its next daily run.',
    );
  });

  it('say it for the practice on the list, and in the singular for one month and one plan', () => {
    expect(monthsWaitingText({ months: [awaiting(2, OTHER), awaiting(3, OTHER), awaiting(4, OTHER)], plans: 2 }, false)).toMatch(/^3 months wait for 2 plans’ mappings\. Map those plans first/);
    expect(monthsWaitingText({ months: [awaiting(2, OTHER.slice(0, 1))], plans: 1 }, true)).toBe(
      '1 month holding this plan’s lines waits for 1 other plan’s mapping. Map that plan first, so each month is priced once. Or price it now: the lines of plans still with no mapping stay unpriced as NO_MAPPING, and that month needs pricing again once their plans are mapped. Monitoring prices it anyway at its next daily run.',
    );
  });

  it('offer "Price them now" to a person who may map plans, naming the plan field "This plan" on its page, and to nobody else', () => {
    const waiting = { months: [awaiting(2, OTHER)], plans: 2 };
    const html = renderToStaticMarkup(<MonthsWaitingRegion practiceId={PRACTICE} planId={PLAN} waiting={waiting} canMap action={action} formKeys={formKeys} />);
    expect(html).toContain('Price them now');
    expect(html).toContain(`<input type="hidden" data-error-name="This plan" name="planId" value="${PLAN}"/>`);
    expect(html).toContain(`<input type="hidden" name="practiceId" value="${PRACTICE}"/>`);
    expect(html).toContain('2026-02-01');
    expect(renderToStaticMarkup(<MonthsWaitingRegion practiceId={PRACTICE} planId={null} waiting={waiting} canMap action={action} formKeys={formKeys} />)).not.toContain('name="planId"');
    expect(renderToStaticMarkup(<MonthsWaitingRegion practiceId={PRACTICE} planId={PLAN} waiting={waiting} canMap={false} action={action} formKeys={formKeys} />)).not.toContain('<form');
    expect(renderToStaticMarkup(<MonthsWaitingRegion practiceId={PRACTICE} planId={PLAN} waiting={{ months: [], plans: 0 }} canMap action={action} formKeys={formKeys} />)).toBe('');
  });
});

describe('the months to price again, each in its state (MAP-08; design 4.2, 9)', () => {
  it('say each state in the design’s words', () => {
    expect(priceAgainStateText({ kind: 'ready', lastFailure: null })).toBe('Ready to price again');
    expect(priceAgainStateText({ kind: 'being_priced', rerunId: RERUN })).toBe('Being priced again');
    expect(priceAgainStateText({ kind: 'to_accept', rerunId: RERUN })).toBe('Priced again: review and accept');
    expect(priceAgainStateText({ kind: 'waiting', rerunId: null })).toBe('Waits for a newer run of these dates to finish; it is listed again then, or priced by it');
    expect(toTriageText(true)).toBe('Priced again and accepted: triage it on Cases');
    expect(toTriageText(false)).toBe('Priced again and accepted: waits for triage by a person who works cases');
  });

  it('say a re-run that failed on the billing ZIP or on Medicare content waits, with its label, and link to the re-run (D21)', () => {
    const location = region(toPrice({ priceAgain: [month(3, { kind: 'rerun_failed', rerunId: RERUN, failureCode: 'location_not_ready', wait: 'location' })] }));
    expect(words(location)).toContain(
      'Waiting on the billing ZIP: The re-run stopped on the practice’s billing ZIP or ZIP+4. Fix it in Pricing settings; this month is offered here again once it is saved. See the re-run',
    );
    expect(location).toContain(`href="/p/${PRACTICE}/pricing-runs/${RERUN}"`);
    expect(location).toContain(`href="/p/${PRACTICE}/settings/pricing"`);
    const content = region(toPrice({ priceAgain: [month(3, { kind: 'rerun_failed', rerunId: RERUN, failureCode: 'waiting_on_content_mppr', wait: 'content' })] }));
    expect(words(content)).toContain(
      'Waiting on Medicare content: The re-run needs Medicare content PaidWhole has not loaded for these dates yet, so no line was kept. This month is offered here again once that content is loaded or a mapping or contract version changes. See the re-run',
    );
    // Neither is offered: a press would create a re-run that fails the same way.
    expect(location).not.toContain('<form');
    expect(content).not.toContain('<form');
  });

  it('say a month ready again after a failed re-run why that one failed, for each reason, with a link to it, and never that it is priced by itself', () => {
    for (const reason of ['job_failed', 'release_read_outside_fetch', 'engine_version_mismatch', 'location', 'content'] as const) {
      const html = region(toPrice({ priceAgain: [month(3, { kind: 'ready', lastFailure: { rerunId: RERUN, failureCode: reason, reason } })] }));
      expect(words(html)).toContain(`Ready to price again. The last re-run failed: ${LAST_FAILURE_TEXT[reason]}. See the re-run`);
      expect(html).toContain(`href="/p/${PRACTICE}/pricing-runs/${RERUN}"`);
      expect(words(html)).not.toContain('by itself');
    }
    expect(LAST_FAILURE_TEXT.job_failed).toBe('its price job failed three times and the operator was alerted');
    expect(LAST_FAILURE_TEXT.location).toBe('it waited on the billing ZIP, which has been saved since');
  });

  it('link a re-run to accept, and the Cases screen for an accepted one only to a person who works cases', () => {
    const triage = { pricingRunId: RUN(5), periodFrom: '2026-05-01', periodTo: '2026-05-31', lines: 2, chargeCents: '15000' };
    const accept = region(toPrice({ priceAgain: [month(3, { kind: 'to_accept', rerunId: RERUN })], toTriage: [triage] }));
    expect(accept).toContain(`<a class="underline" href="/p/${PRACTICE}/pricing-runs/${RERUN}">Priced again: review and accept</a>`);
    expect(accept).toContain(`<a class="underline" href="/p/${PRACTICE}/cases">Priced again and accepted: triage it on Cases</a>`);
    const viewer = region(toPrice({ toTriage: [triage] }), { canWorkCases: false });
    expect(viewer).not.toContain(`href="/p/${PRACTICE}/cases"`);
    expect(words(viewer)).toContain('Priced again and accepted: waits for triage by a person who works cases');
  });

  it('offer "Price these months again (N)" over the ready months, each a hidden runIds[] named for the summary, with the release and the plan', () => {
    const html = region(toPrice({ priceAgain: [month(2, { kind: 'ready', lastFailure: null }), month(3, { kind: 'being_priced', rerunId: RERUN }), month(4, { kind: 'ready', lastFailure: null })] }));
    expect(words(html)).toContain('Price these months again (2)');
    expect(html.match(/name="runIds\[\]"/g)).toHaveLength(2);
    expect(html).toContain(`<input type="hidden" data-error-name="The months to price again" name="runIds[]" value="${RUN(2)}"/>`);
    expect(html).not.toContain(`name="runIds[]" value="${RUN(3)}"`);
    expect(html).toContain('<input type="hidden" data-error-name="Rule release" name="releaseNo" value="900001"/>');
    expect(html).toContain(`<input type="hidden" data-error-name="This plan" name="planId" value="${PLAN}"/>`);
    expect(words(html)).toContain('Creates a re-run of each month in your name. Nothing changes until you accept each re-run on its page, after its list of changes.');
    // The button wraps at 320 px (wrapSubmit), and spans the card's width on a phone.
    expect(html).toMatch(/<button[^>]*class="[^"]*\bwhitespace-normal\b/);
    expect(html).toContain('[&amp;_button[type=submit]]:w-full');
  });

  it('show a person who may not map plans the states with no button, and offer none while nothing is ready or no release is in force', () => {
    const ready = [month(2, { kind: 'ready', lastFailure: null })];
    expect(region(toPrice({ priceAgain: ready }), { canMap: false })).not.toContain('<form');
    expect(words(region(toPrice({ priceAgain: ready }), { canMap: false }))).toContain('Ready to price again');
    expect(region(toPrice({ priceAgain: [month(2, { kind: 'waiting', rerunId: null })] }))).not.toContain('<form');
    expect(region(toPrice({ priceAgain: ready, releaseNo: null }))).not.toContain('<form');
  });

  it('say on a mapped plan’s page that no priced month holds its lines without a mapping, and nothing on the list when none does', () => {
    expect(words(region(toPrice()))).toContain('No priced month holds this plan’s lines without a mapping.');
    expect(region(toPrice(), { planId: null })).toBe('');
  });

  it('name one table per page: "Months to price again" on the list, the plan’s own on its page', () => {
    const months = toPrice({ priceAgain: [month(2, { kind: 'ready', lastFailure: null })] });
    expect(region(months, { planId: null })).toContain('aria-label="Months to price again"');
    expect(region(months, { planId: null })).toContain('id="months-to-price-again"');
    expect(region(months)).toContain('aria-label="Months holding this plan’s lines that are not priced"');
  });
});

describe('the table and its stacked rows (docs/adr/0078)', () => {
  const months = toPrice({
    priceAgain: [month(2, { kind: 'ready', lastFailure: null }), month(3, { kind: 'to_accept', rerunId: RERUN })],
    toTriage: [{ pricingRunId: RUN(5), periodFrom: '2026-05-01', periodTo: '2026-05-31', lines: 2, chargeCents: '15000' }],
  });
  const html = region(months);

  it('read one constant of column labels, in order, for the table’s headers and the stacked rows’ terms', () => {
    const headers = [...html.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map((match) => match[1]);
    expect(headers).toEqual(Object.values(MONTH_COLUMNS));
    const terms = [...html.matchAll(/<dt[^>]*>([^<]*)<\/dt>/g)].map((match) => match[1]);
    expect(terms.slice(0, 3)).toEqual([MONTH_COLUMNS.lines, MONTH_COLUMNS.billed, MONTH_COLUMNS.state]);
    expect(terms).toHaveLength(9);
  });

  it('stack below 32rem, each month’s dates its heading, with no id or hook repeated between the copies', () => {
    expect(html).toContain('min-w-[32rem]');
    expect(html).toContain('@min-[32rem]:hidden');
    expect(html).toMatch(/<h3[^>]*>.*2026-02-01.*2026-02-28.*<\/h3>/);
    expect(repeatedIds(html)).toEqual([]);
    expect(html).toContain(`data-month="${RUN(2)}" data-state="ready"`);
    expect(html).toContain(`data-stacked-month="${RUN(2)}" data-stacked-state="ready"`);
    expect(html).toContain(`data-stacked-month="${RUN(5)}" data-stacked-state="to_triage"`);
  });

  it('give its figures in the mono face, and none of the brand’s three numbers out of order', () => {
    const fields = monthFields({ lines: 3, billed: '$270.00', state: 'Ready to price again' });
    expect(fields.filter((field) => field.mono === true).map((field) => field.label)).toEqual([MONTH_COLUMNS.lines, MONTH_COLUMNS.billed]);
    expect(brandOrderProblems(fields)).toEqual([]);
  });
});

describe('the mapping screens’ notices (design 5.3; C2)', () => {
  it('say what each press did, in the design’s words', () => {
    expect(MONTHS_NOTICES.priced_again).toEqual({ title: 'Re-runs created', text: 'Accept each on its page after its list of changes.' });
    expect(MONTHS_NOTICES.pricing_requested).toEqual({ title: 'Pricing requested', text: 'Monitoring is pricing the waiting months now; they show on Pricing runs when done.' });
  });
});
