import { UNPRICED_REASONS } from '@tp/pricing';
import { COVERAGE_FORMAT, type RunCoverage } from '@tp/worker/pricing';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { RerunAcceptanceView, RunSummary } from '../../lib/pricing/queries';
import {
  FAILURE_TEXT,
  HeldByLimitNote,
  NotInEffectAlert,
  PatternTable,
  PendingRunsAlert,
  QueuedRunsNote,
  RerunBlockedAlert,
  RerunBlockedBody,
  RunFailureText,
  RunStateBadges,
  RunStatusBadge,
  UnpricedReasons,
  nothingMoreToAccept,
  rerunBlockedTitle,
  runName,
  unacceptedRerunText,
  waitingLabel,
} from './display';

/**
 * A pricing run's coverage card (PRD 7, Pricing runs) as the screen tour found it (C3): a run that priced every line
 * showed the unpriced reasons' header over no rows. SYNTHETIC counts, written by hand.
 */

function coverage(unpriced: Partial<Record<(typeof UNPRICED_REASONS)[number], number>> = {}): RunCoverage {
  const reasons = UNPRICED_REASONS.map((reason) => ({ reason, lines: unpriced[reason] ?? 0, charge_cents: String((unpriced[reason] ?? 0) * 7500) }));
  const unpricedLines = reasons.reduce((sum, entry) => sum + entry.lines, 0);
  return {
    format: COVERAGE_FORMAT,
    lines: 4 + unpricedLines,
    charge_cents: String(60000 + unpricedLines * 7500),
    priced: { lines: 4, charge_cents: '60000' },
    reasons,
    engine_errors: [],
    versions: [],
    patterns: [],
  };
}

describe('a run’s unpriced reasons', () => {
  it('are an empty state, with no table, when the run priced every line (the March run of the tour: 4 of 4)', () => {
    const html = renderToStaticMarkup(<UnpricedReasons coverage={coverage()} />);
    expect(html).not.toContain('<table');
    expect(html).not.toContain('<th');
    expect(html).toContain('data-slot="empty-state"');
    expect(html).toContain('No line of this run is unpriced');
  });

  it('list each reason that left a line unpriced, with its remedy, lines and billed, and no reason without one', () => {
    const html = renderToStaticMarkup(<UnpricedReasons coverage={coverage({ NO_AGREEMENT: 32 })} />);
    expect(html).not.toContain('data-slot="empty-state"');
    expect(html.match(/<tr [^>]*data-reason=/g)).toHaveLength(1);
    expect(html).toContain('data-reason="NO_AGREEMENT"');
    expect(html).toContain('None; anomaly screening only');
    expect(html).toContain('$2,400.00');
  });

  it('scroll sideways inside their own named region, so neither widens a phone-width page (UX confirm of PR #50, NEW-A)', () => {
    expect(renderToStaticMarkup(<UnpricedReasons coverage={coverage({ NO_AGREEMENT: 1 })} />)).toMatch(/^<div role="region" aria-label="Unpriced reasons, scrolls sideways" tabindex="0" class="relative /);
    expect(renderToStaticMarkup(<PatternTable practiceId="p" coverage={{ ...coverage(), patterns: [pattern()] }} names={{ payers: {}, plans: {}, versions: {} }} />)).toMatch(
      /^<div role="region" aria-label="Variance by payer pattern, scrolls sideways" tabindex="0" class="relative /,
    );
  });

  it('give every header but the last the right padding its column’s cells have, so no two headers run together (C2)', () => {
    for (const html of [renderToStaticMarkup(<UnpricedReasons coverage={coverage({ NO_AGREEMENT: 1 })} />), renderToStaticMarkup(<PatternTable practiceId="p" coverage={{ ...coverage(), patterns: [pattern()] }} names={{ payers: {}, plans: {}, versions: {} }} />)]) {
      const headers = [...html.matchAll(/<th class="([^"]*)"/g)].map((match) => match[1] ?? '');
      expect(headers.length).toBeGreaterThan(1);
      expect(headers.slice(0, -1).filter((classes) => !/\bpr-3\b/.test(classes))).toEqual([]);
    }
  });
});

function pattern(): RunCoverage['patterns'][number] {
  return {
    payer_id: '1f0e0000-0000-4000-8000-000000000001',
    plan_id: '1f0e0000-0000-4000-8000-000000000002',
    mapping_kind: 'contract',
    contract_version_id: null,
    rate_record_id: null,
    lines: 3,
    underpaid_lines: 3,
    underpaid_cents: '9000',
    overpaid_lines: 0,
    overpaid_cents: '0',
  };
}

describe('a failed run’s words', () => {
  it('never tell the customer the operator was alerted of a read outside the fetch, which no alarm reads yet, and say the month prices by itself', () => {
    // The worker logs RELEASE_READ_OUTSIDE_FETCH; its alarm comes with the later pull request (docs/adr/0071).
    const text = FAILURE_TEXT.release_read_outside_fetch ?? '';
    expect(text).not.toMatch(/alerted/);
    expect(text).toContain('logged for PaidWhole’s team');
    expect(text).not.toContain('operator');
    expect(text).not.toContain('create a new run');
    expect(text).toContain('priced again by itself');
  });

  it('say what PaidWhole has not loaded the Medicare content for (UX-13)', () => {
    expect(FAILURE_TEXT.waiting_on_content_mppr).toContain('Medicare’s multiple-procedure reduction list (MPPR) for dates PaidWhole has not loaded it for yet');
    expect(FAILURE_TEXT.waiting_on_content_mue).toContain('Medicare’s unit limits (MUE) for dates PaidWhole has not loaded them for yet');
    expect(FAILURE_TEXT.waiting_on_content_mppr_mue).toContain('(MPPR) and unit limits (MUE) for dates PaidWhole has not loaded them for yet');
  });
});

describe('a run whose month waits (UX-9)', () => {
  it('shows a month waiting on Medicare content or the billing ZIP neutrally, labelled, and a failure in the danger colour', () => {
    for (const code of ['waiting_on_content_mppr', 'waiting_on_content_mue', 'waiting_on_content_mppr_mue'] as const) {
      const html = renderToStaticMarkup(<RunFailureText code={code} />);
      expect(html).toBe(`<p class="pt-2 text-sm" data-state="waiting" data-code="${code}"><span class="font-medium">Waiting on Medicare content:</span> ${FAILURE_TEXT[code] ?? ''}</p>`);
      expect(html).not.toContain('destructive');
      expect(waitingLabel(code)).toBe('Waiting on Medicare content');
      const badge = renderToStaticMarkup(<RunStatusBadge status="failed" failureCode={code} />);
      expect(badge).toContain('Waiting');
      expect(badge).toContain('data-status="failed"');
      expect(badge).not.toContain('destructive');
    }
    expect(renderToStaticMarkup(<RunFailureText code="location_not_ready" />)).toContain('<span class="font-medium">Waiting on the billing ZIP:</span>');
    const failed = renderToStaticMarkup(<RunFailureText code="job_failed" />);
    expect(failed).toContain('text-destructive');
    expect(failed).not.toContain('Waiting');
    expect(waitingLabel('job_failed')).toBeNull();
    expect(waitingLabel(null)).toBeNull();
    expect(renderToStaticMarkup(<RunStatusBadge status="failed" failureCode="job_failed" />)).toContain('Failed');
    expect(renderToStaticMarkup(<RunStatusBadge status="failed" />)).toContain('Failed');
  });
});

/**
 * Why a re-run can or cannot be accepted, and why a run is not re-run, in every variant the screens show (combined
 * audit #10; docs/adr/0037, amendment of 2026-10-26; the fix round of PR #50): the badges, the re-runs list's words,
 * the run names that tell runs of the same dates apart, and each explanation, singular and plural. SYNTHETIC runs.
 */

const PRACTICE = '00000000-0000-4000-8000-000000000001';

/** A complete February run under release 900001, priced at the given second of 2026-10-26, as a page reads it. */
function runOf(id: string, second: number, overrides: Partial<RunSummary> = {}): RunSummary {
  const at = `2026-10-26T02:09:${String(second).padStart(2, '0')}.000Z`;
  return {
    id,
    periodFrom: '2026-02-01',
    periodTo: '2026-02-28',
    releaseNo: 900001,
    engineVersion: 'engine-synthetic',
    status: 'complete',
    failureCode: null,
    createdAt: at,
    completedAt: at,
    createdBy: 'manager@example.test',
    monitoring: false,
    coverage: null,
    rerun: [],
    rerunOfId: null,
    acceptedAt: null,
    acceptedBy: null,
    inEffect: false,
    withdrawal: null,
    acceptance: null,
    ...overrides,
  };
}

const ORIGINAL = runOf('00000000-0000-4000-8000-0000000000a1', 1, { inEffect: false });
const RERUN = runOf('00000000-0000-4000-8000-0000000000a2', 10, { rerunOfId: ORIGINAL.id, acceptance: 'superseded' });
const NEWER = runOf('00000000-0000-4000-8000-0000000000a3', 20, { inEffect: true });
const OTHER = runOf('00000000-0000-4000-8000-0000000000a4', 30, { inEffect: true, periodFrom: '2026-01-01', periodTo: '2026-03-31' });
const QUEUED = runOf('00000000-0000-4000-8000-0000000000a5', 40, { status: 'queued', completedAt: null });
const RUNNING = runOf('00000000-0000-4000-8000-0000000000a6', 41, { status: 'running', completedAt: null });

/** The markup's text, tags dropped and the few entities React writes read back. */
const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');

type Superseded = Extract<RerunAcceptanceView, { state: 'superseded' }>;

function superseded(overrides: Partial<Superseded> = {}): Superseded {
  return { state: 'superseded', kind: 'same_period', superseding: [NEWER], newerBy: { [NEWER.id]: 'priced_after' }, original: ORIGINAL, inEffect: NEWER, inEffectPending: [], ...overrides };
}

const body = (acceptance: Exclude<RerunAcceptanceView, { state: 'acceptable' }>, original?: string) =>
  textOf(renderToStaticMarkup(<RerunBlockedBody practiceId={PRACTICE} acceptance={acceptance} original={original} />));

describe('a run’s name as a link reads', () => {
  it('tells two runs of the same dates and release apart by when each was priced, to the second, or created while not complete', () => {
    expect(runName(NEWER)).toBe('Pricing run, 2026-02-01 to 2026-02-28, rule release 900001, priced 2026-10-26 02:09:20 UTC');
    expect(runName(RERUN)).not.toBe(runName(NEWER));
    expect(runName(NEWER, false)).toBe('Pricing run, 2026-02-01 to 2026-02-28, priced 2026-10-26 02:09:20 UTC');
    expect(runName(QUEUED)).toBe('Pricing run, 2026-02-01 to 2026-02-28, rule release 900001, created 2026-10-26 02:09:40 UTC');
  });
});

describe('a run’s state badges and a re-run’s words in a list', () => {
  const badges = (run: RunSummary) => renderToStaticMarkup(<RunStateBadges run={run} />);

  it('say in effect, awaiting, waiting, can no longer be accepted (superseded or withdrawn), or not in effect', () => {
    expect(badges(NEWER)).toContain('data-state="in-effect"');
    expect(textOf(badges(runOf('r', 1, { rerunOfId: ORIGINAL.id, acceptance: 'awaiting' })))).toBe('Re-run awaiting acceptance');
    expect(textOf(badges(runOf('r', 1, { rerunOfId: ORIGINAL.id, acceptance: 'newer_run_pending' })))).toBe('Re-run waiting for a newer run');
    expect(badges(RERUN)).toContain('data-state="rerun-superseded"');
    expect(textOf(badges(RERUN))).toBe('Can no longer be accepted');
    const withdrawn = badges(
      runOf('r', 1, { rerunOfId: ORIGINAL.id, acceptance: 'release_withdrawn', withdrawal: { reinstatedReleaseNo: 900000, withdrawnAt: '2026-10-26T03:00:00Z', reason: 'SYNTHETIC' } }),
    );
    // Never "awaiting acceptance" beside a withdrawn release (payment-engine review of PR #50, F6).
    expect(withdrawn).toContain('data-state="rerun-withdrawn"');
    expect(textOf(withdrawn)).toBe('Can no longer be acceptedRelease 900001 withdrawn');
    expect(textOf(badges(ORIGINAL))).toBe('Not in effect');
    expect(badges(QUEUED)).toBe('');
  });

  it('state an unaccepted re-run in the re-runs list by where its acceptance stands', () => {
    expect(['awaiting', 'superseded', 'newer_run_pending', 'release_withdrawn'].map((acceptance) => unacceptedRerunText(runOf('r', 1, { acceptance: acceptance as RunSummary['acceptance'] })))).toEqual([
      'awaiting acceptance',
      'can no longer be accepted',
      'waiting for a newer run to finish',
      'can no longer be accepted, its rule release withdrawn',
    ]);
  });
});

describe('the notes in a Re-run button’s place', () => {
  it('name the run waiting, and send the person to the run that will be in effect once it finishes (UX-7, recheck N5)', () => {
    // A run of the same dates takes effect in the run in effect's place: that run is the one to re-run, never this one.
    const one = textOf(renderToStaticMarkup(<PendingRunsAlert practiceId={PRACTICE} runs={[QUEUED]} inEffect={NEWER} self />));
    expect(one).toBe(`A newer run of these service dates is waiting to be priced: ${runName(QUEUED)}. Once it finishes, re-run that run.`);
    expect(textOf(renderToStaticMarkup(<PendingRunsAlert practiceId={PRACTICE} runs={[RUNNING]} inEffect={NEWER} />))).toContain('is being priced: ');
    const two = textOf(renderToStaticMarkup(<PendingRunsAlert practiceId={PRACTICE} runs={[QUEUED, RUNNING]} inEffect={NEWER} />));
    expect(two).toBe(
      `Newer runs of these service dates are waiting to be priced or being priced: ${runName(QUEUED)} and ${runName(RUNNING)}. Once they finish, re-run the run in effect for these service dates.`,
    );
  });

  it('send the person back to the run in effect when the run waiting is of other dates, which leaves it in effect (recheck N5)', () => {
    // OTHER (the quarter) is in effect; QUEUED prices February only.
    expect(textOf(renderToStaticMarkup(<PendingRunsAlert practiceId={PRACTICE} runs={[QUEUED]} inEffect={OTHER} self />))).toBe(
      `A newer run of these service dates is waiting to be priced: ${runName(QUEUED)}. Once it finishes, re-run this run.`,
    );
    const elsewhere = renderToStaticMarkup(<PendingRunsAlert practiceId={PRACTICE} runs={[QUEUED]} inEffect={OTHER} />);
    expect(textOf(elsewhere)).toBe(`A newer run of these service dates is waiting to be priced: ${runName(QUEUED)}. Once it finishes, re-run ${runName(OTHER)}, which stays in effect for its service dates.`);
    expect(elsewhere).toContain(`data-run-link="${OTHER.id}"`);
  });

  it('name the run in effect instead of a run that is not, or say only the rule when none is', () => {
    expect(textOf(renderToStaticMarkup(<NotInEffectAlert practiceId={PRACTICE} inEffect={NEWER} />))).toBe(`Only the run in effect for these service dates is priced again: ${runName(NEWER)}.`);
    expect(textOf(renderToStaticMarkup(<NotInEffectAlert practiceId={PRACTICE} inEffect={null} />))).toBe('Only the run in effect for these service dates is priced again.');
  });

  it('are status notes, not alerts: on the page from the start, they are never announced on load (UX-5)', () => {
    for (const html of [
      renderToStaticMarkup(<PendingRunsAlert practiceId={PRACTICE} runs={[QUEUED]} inEffect={NEWER} />),
      renderToStaticMarkup(<NotInEffectAlert practiceId={PRACTICE} inEffect={NEWER} />),
      renderToStaticMarkup(<RerunBlockedAlert practiceId={PRACTICE} acceptance={superseded()} />),
    ]) {
      expect(html).toContain('role="status"');
      expect(html).not.toContain('role="alert"');
    }
  });

  it('tell the person, before accepting, that runs still queued take effect in the re-run’s place once priced (recheck N5)', () => {
    expect(textOf(renderToStaticMarkup(<QueuedRunsNote practiceId={PRACTICE} runs={[QUEUED]} />))).toBe(
      `A newer run of these service dates is waiting to be priced: ${runName(QUEUED)}. This re-run can be accepted now. Once that run is priced, it takes effect in place of this re-run.`,
    );
    expect(textOf(renderToStaticMarkup(<QueuedRunsNote practiceId={PRACTICE} runs={[QUEUED, QUEUED]} />))).toContain('Once those runs are priced, they take effect in place of this re-run.');
  });

  it('say why no Accept form is offered past the runs one acceptance names, a status note (re-review N1)', () => {
    const html = renderToStaticMarkup(<HeldByLimitNote count={201} limit={200} />);
    expect(html).toContain('role="status"');
    expect(html).toContain('data-state="held-by-limit"');
    expect(textOf(html)).toContain('This re-run cannot be accepted here');
    expect(textOf(html)).toContain('Accepting it would replace pricing that 201 runs of other service dates hold, and one acceptance names at most 200.');
  });
});

describe('why a re-run cannot be accepted', () => {
  it('is titled by its state and kind, and by whether every run of other dates was priced after it', () => {
    expect(rerunBlockedTitle({ state: 'newer_run_pending', running: [RUNNING] })).toBe('A newer run of these service dates is being priced');
    expect(rerunBlockedTitle(superseded())).toBe('A newer run of these service dates is in effect');
    expect(rerunBlockedTitle(superseded({ kind: 'original_not_in_effect' }))).toBe('This re-run prices a run that was never in effect');
    const other = superseded({ kind: 'other_period', superseding: [OTHER], newerBy: { [OTHER.id]: 'priced_after' }, inEffect: ORIGINAL });
    expect(rerunBlockedTitle(other)).toBe('A run of some of these service dates was priced after this re-run');
    expect(rerunBlockedTitle({ ...other, superseding: [OTHER, NEWER], newerBy: { [OTHER.id]: 'priced_after', [NEWER.id]: 'priced_after' } })).toBe(
      'Runs of some of these service dates were priced after this re-run',
    );
    expect(rerunBlockedTitle({ ...other, newerBy: { [OTHER.id]: 'later_release' } })).toBe('A run of some of these service dates holds newer pricing than this re-run');
    expect(rerunBlockedTitle({ ...other, superseding: [OTHER, NEWER], newerBy: { [OTHER.id]: 'later_split', [NEWER.id]: 'priced_after' } })).toBe(
      'Runs of some of these service dates hold newer pricing than this re-run',
    );
  });

  it('waiting: names the runs being priced, one or several', () => {
    expect(body({ state: 'newer_run_pending', running: [RUNNING] })).toBe(
      `${runName(RUNNING, false)} is being priced. Wait until it finishes: once it completes, re-run the run in effect for these service dates; if it fails, this re-run can still be accepted.`,
    );
    expect(body({ state: 'newer_run_pending', running: [RUNNING, QUEUED] })).toBe(
      `${runName(RUNNING, false)} and ${runName(QUEUED, false)} are being priced. Wait until they finish: once they complete, re-run the run in effect for these service dates; if they fail, this re-run can still be accepted.`,
    );
  });

  it('same dates, priced after it and nothing changed since: there is nothing more to accept, and no re-run is offered', () => {
    const acceptance = superseded();
    expect(nothingMoreToAccept(acceptance)).toBe(true);
    expect(body(acceptance)).toBe(
      `${runName(NEWER)} took effect after the run this re-run prices again, and it was priced after this re-run. It already prices these lines under rule release 900001 and the mappings and contract versions in force now. There is nothing more to accept.`,
    );
  });

  it('same dates, priced after it with something changed since: re-run that run', () => {
    const acceptance = superseded({ inEffect: { ...NEWER, rerun: ['mapping_changed'] }, superseding: [{ ...NEWER, rerun: ['mapping_changed'] }] });
    expect(nothingMoreToAccept(acceptance)).toBe(false);
    expect(body(acceptance)).toBe(
      `${runName(NEWER)} took effect after the run this re-run prices again, and it was priced after this re-run. Accepting this re-run would replace newer pricing, so it can no longer be accepted. Re-run that run, the run in effect for these service dates, to price its lines under what is in force now.`,
    );
  });

  it('same dates, newer by its cut-off, release or split alone: says which, and offers the re-run even when nothing changed since (F5, UX-8)', () => {
    const why: [Superseded['newerBy'][string], string][] = [
      ['later_lines', ', and it takes in lines loaded later than this re-run does.'],
      ['later_release', ', and it is pinned to rule release 900001, later than this re-run’s.'],
      ['later_split', ', and it is pinned to a place-of-service split approved after this re-run’s.'],
      [null, '.'],
    ];
    for (const [reason, clause] of why) {
      const acceptance = superseded({ newerBy: { [NEWER.id]: reason } });
      expect(nothingMoreToAccept(acceptance)).toBe(false);
      expect(body(acceptance)).toBe(
        `${runName(NEWER)} took effect after the run this re-run prices again${clause} Accepting this re-run would replace newer pricing, so it can no longer be accepted. Re-run that run, the run in effect for these service dates, to price its lines under what is in force now.`,
      );
    }
  });

  it('same dates, the run in effect not one that superseded it: names both, and the run in effect as the one to re-run', () => {
    const inEffect = runOf('00000000-0000-4000-8000-0000000000a7', 50, { inEffect: true });
    const acceptance = superseded({ inEffect, newerBy: { [NEWER.id]: 'priced_after' } });
    expect(nothingMoreToAccept(acceptance)).toBe(false);
    expect(body(acceptance)).toBe(
      `${runName(NEWER)} took effect after the run this re-run prices again, and it was priced after this re-run. Accepting this re-run would replace newer pricing, so it can no longer be accepted. Re-run ${runName(inEffect)}, the run in effect for these service dates, to price its lines under what is in force now.`,
    );
    expect(body(superseded({ superseding: [], inEffect: null }))).toBe(
      'A newer run of these service dates took effect after the run this re-run prices again. Accepting this re-run would replace newer pricing, so it can no longer be accepted.',
    );
  });

  it('other dates, one run: says why it is newer, the lines both runs price, and names the run to re-run again', () => {
    const one = superseded({ kind: 'other_period', superseding: [OTHER], newerBy: { [OTHER.id]: 'priced_after' }, inEffect: ORIGINAL });
    expect(body(one)).toBe(
      `${runName(OTHER)} was priced after this re-run, so accepting this re-run would put older pricing back on the lines both runs price. This re-run can no longer be accepted. Re-run ${runName(ORIGINAL)}, the run in effect for these service dates, again: the new re-run is priced after that run, and can then be accepted.`,
    );
    expect(body({ ...one, newerBy: { [OTHER.id]: 'later_split' }, inEffect: null })).toBe(
      `${runName(OTHER)} is pinned to a place-of-service split approved after this re-run’s, so accepting this re-run would put older pricing back on the lines both runs price. This re-run can no longer be accepted.`,
    );
  });

  it('other dates, several runs: lists each with why it is newer', () => {
    const second = { ...OTHER, id: '00000000-0000-4000-8000-0000000000a8', releaseNo: 900004 };
    const several = superseded({ kind: 'other_period', superseding: [OTHER, second], newerBy: { [OTHER.id]: 'priced_after', [second.id]: 'later_release' }, inEffect: ORIGINAL });
    expect(body(several)).toBe(
      `These runs of some of the same service dates hold newer pricing than this re-run:${runName(OTHER)}, which was priced after this re-run${runName(second)}, which is pinned to rule release 900004, later than this re-run’sAccepting this re-run would put older pricing back on the lines it shares with them. This re-run can no longer be accepted. Re-run ${runName(ORIGINAL)}, the run in effect for these service dates, again: the new re-run is priced after those runs, and can then be accepted.`,
    );
  });

  it('original never in effect: names the run in effect to re-run instead, as the comparison names the first run', () => {
    const legacy = superseded({ kind: 'original_not_in_effect', superseding: [], newerBy: {} });
    expect(body(legacy)).toBe(
      `The run this re-run prices again was never accepted, so this re-run’s changes are not listed against the pricing it would replace. This re-run can no longer be accepted. Re-run ${runName(NEWER)}, the run in effect for these service dates, instead.`,
    );
    expect(body({ ...legacy, inEffect: null }, 'the first run')).toBe(
      'The first run was never accepted, so this re-run’s changes are not listed against the pricing it would replace. This re-run can no longer be accepted.',
    );
    expect(body(superseded(), 'the first run')).toContain('took effect after the first run, and it was priced after this re-run.');
  });

  it('links every run it names to that run’s page', () => {
    const html = renderToStaticMarkup(<RerunBlockedBody practiceId={PRACTICE} acceptance={superseded({ kind: 'other_period', superseding: [OTHER], newerBy: { [OTHER.id]: 'priced_after' }, inEffect: ORIGINAL })} />);
    expect(html).toContain(`href="/p/${PRACTICE}/pricing-runs/${OTHER.id}"`);
    expect(html).toContain(`href="/p/${PRACTICE}/pricing-runs/${ORIGINAL.id}"`);
  });
});
