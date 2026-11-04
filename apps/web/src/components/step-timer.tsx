'use client';

import { AlertDescription, AlertTitle, alertVariants, buttonVariants, cn } from '@tp/ui';
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';

import { counted } from '../lib/copy/words';
import { PendingStatus } from './form-issues';

/**
 * A sign-in step's time limit (docs/adr/0081; test matrix SGN-01, SGN-02): the limit stated once before the work, then
 * one polite status below it, present and empty from the first render, that speaks twice over the step's life: at the
 * warning and when the step has closed, each time with Start again, a POST that ends the step before the sign-in page
 * opens. No ticking count, no focus moved, nothing animated, no redirect and no disabled form: the server closes the
 * step itself (lib/routes/sign-in.ts), and the next press or a reload lands on the sign-in page with the email kept.
 * The sentence above the work shows the same state in a few words, in a cell sized from the first render, so a phone
 * with its keyboard up sees it beside the field and nothing moves; a page rendered after the step began (a reload, a
 * return) states the time left as the server counted it. The page gives plain numbers from the server; the browser
 * counts on the smaller of its wall and monotonic clocks and never compares the server's deadline with its own clock.
 */

/** Where a step stands: open, within its warning, or closed. */
export type StepPhase = 'open' | 'warning' | 'closed';

export interface StepTimerProps {
  readonly limitSeconds: number;
  readonly warningSeconds: number;
  /** Milliseconds left when the server rendered the page; absent for a step sealed before the deploy (no countdown). */
  readonly closesIn?: number;
  /** The server's deadline, epoch ms on the server's clock: only a key tying a re-render to its first count. */
  readonly closesAt?: number;
  /**
   * Start again: the form action that ends the step and goes to the sign-in page with the email kept (a server action).
   * null leaves Start again and its pending row out, for a step whose page has its own ways on below the work (the
   * forgotten password's Send a new code and Use a different email, review UXR-01); the status still speaks.
   */
  readonly restart: ((form: FormData) => void | Promise<void>) | null;
  /** This step's own words, said with the warning and with the closed notice (enrolment's new key). */
  readonly notes?: { readonly warning?: string; readonly closed?: string };
  /**
   * This step's own words in place of the default sentence, which says the email is kept and the password typed again:
   * false on a step that keeps nothing (the forgotten password's, review UXR-02). With them, `notes` is not said.
   */
  readonly words?: { readonly warning: string; readonly closed: string };
  /**
   * This step's own sentence above the work once closed, in place of "This step has closed." (enrolment names its setup
   * key, which sits right below it). It shares the sentence's cell, so it must fit on one line at 390 px, as the others do.
   */
  readonly cue?: { readonly closed?: string };
  readonly children: ReactNode;
}

/** When a step closes on each of the browser's clocks: `Date.now()` and `performance.now()`, both in milliseconds. */
export interface StepAnchor {
  readonly wall: number;
  readonly monotonic: number;
}

/** A step's phase from the milliseconds left: closed at or below 0, within its warning at or below `warningMs`. */
export function stepPhase(leftMs: number, warningMs: number): StepPhase {
  return leftMs <= 0 ? 'closed' : leftMs <= warningMs ? 'warning' : 'open';
}

/**
 * The milliseconds left on the two clocks, the smaller answer: a machine that slept ran the wall clock on (the wall's
 * answer), a wall clock set back leaves the monotonic one running (its answer), and a wall clock set forward closes
 * the step early by the jump, on the safe side.
 */
export function timeLeft(anchor: StepAnchor, wallNow: number, monotonicNow: number): number {
  return Math.min(anchor.wall - wallNow, anchor.monotonic - monotonicNow);
}

/** "within a minute", or "within 2 minutes": the minutes rounded up, so it is true for as long as it is on screen. */
function within(seconds: number): string {
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? 'within a minute' : `within ${counted(minutes, 'minute')}`;
}

/**
 * How far below the full limit a step's first render may be and still state the limit: the time from the challenge to
 * the page, so a fresh step reads "stays open for 3 minutes" and a reload a minute in does not.
 */
const FRESH_MS = 5_000;

/**
 * The sentence before the work, in each phase: the limit while open, then the same state the status says. A page
 * rendered later in the step (`closesIn` more than a few seconds below the limit) states the time left instead, in
 * whole minutes rounded up after "within", so it stays true for as long as it is on screen without a ticking count.
 */
export function limitPhrases(limitSeconds: number, warningSeconds: number, closesIn?: number, cue?: StepTimerProps['cue']): Readonly<Record<StepPhase, string>> {
  const underWay = closesIn !== undefined && closesIn < limitSeconds * 1000 - FRESH_MS;
  return {
    open: underWay ? `This step closes ${within(Math.ceil(closesIn / 1000))}.` : `This step stays open for ${counted(Math.floor(limitSeconds / 60), 'minute')}.`,
    warning: `This step closes ${within(warningSeconds)}.`,
    closed: cue?.closed ?? 'This step has closed.',
  };
}

/**
 * What the status says at the warning and once closed: its title, and its words with the step's own note after them,
 * or the step's own words alone in place of both.
 */
export function spokenWords(
  phase: 'warning' | 'closed',
  warningSeconds: number,
  notes: StepTimerProps['notes'] = {},
  own?: StepTimerProps['words'],
): { readonly title: string; readonly words: string } {
  const title = phase === 'warning' ? `This step closes ${within(warningSeconds)}` : 'This step has closed';
  if (own !== undefined) {
    return { title, words: own[phase] };
  }
  const [words, note] =
    phase === 'warning' ? ['If you need more time, start again: your email is kept, and you type your password again.', notes.warning] : ['Start again: your email is kept, and you type your password again.', notes.closed];
  return { title, words: note === undefined ? words : `${words} ${note}` };
}

const ORDER: Readonly<Record<StepPhase, number>> = { open: 0, warning: 1, closed: 2 };

/**
 * Each step's first count, by its deadline, so a remount (Next's history cache, a refresh after a refusal) with a
 * staler `closesIn` keeps it, and a new step starts its own. A full reload starts the module, and the count, afresh.
 */
const anchors = new Map<number, StepAnchor>();

/** Whether a timer has mounted in this document yet: only the first can have had its props in the document's HTML. */
let mountedBefore = false;

/**
 * The step's anchor: its first count, or a new one from `closesIn`. On a full page load (the first timer of the
 * document, whose navigation entry names the current URL, so the props came in this document's HTML) the time from the
 * first byte to now is taken off, which can only err early; a client navigation's payload stays uncorrected.
 */
function anchorOf(closesIn: number, closesAt: number | undefined, firstInDocument: boolean): StepAnchor {
  const kept = closesAt === undefined ? undefined : anchors.get(closesAt);
  if (kept !== undefined) {
    return kept;
  }
  const monotonic = performance.now();
  const entry = performance.getEntriesByType('navigation')[0];
  const late = firstInDocument && entry !== undefined && entry.name === window.location.href && entry instanceof PerformanceNavigationTiming ? Math.max(0, monotonic - entry.responseStart) : 0;
  const anchor = { wall: Date.now() + closesIn - late, monotonic: monotonic + closesIn - late };
  if (closesAt !== undefined) {
    anchors.set(closesAt, anchor);
  }
  return anchor;
}

/**
 * The step's limit around its work (on enrolment the setup key, its link and the form; elsewhere the form), and the
 * status below them, outside the form. The status takes the Alert's look only while it speaks, and is never hidden, so
 * it stays in the accessibility tree from the first render. Start again is one form and button in both phases, so a
 * person who reached it during the warning still holds it once the step has closed.
 */
export function StepTimer({ limitSeconds, warningSeconds, closesIn, closesAt, restart, notes, words, cue, children }: StepTimerProps) {
  // The phase shown, with the step it belongs to: a new deadline is a new step, whose count starts again.
  const [shown, setShown] = useState<{ readonly closesAt: number | undefined; readonly phase: StepPhase } | null>(null);
  const phase = shown !== null && shown.closesAt === closesAt ? shown.phase : undefined;
  // The sentence's words come from the step's first render: a render in place (a refusal's cookie rewrite) has a smaller
  // `closesIn` for the same deadline, and changes nothing above the work. Kept in state, never in a module (the server's
  // modules serve every request).
  const [first, setFirst] = useState<{ readonly closesAt: number | undefined; readonly closesIn: number | undefined }>({ closesAt, closesIn });
  if (first.closesAt !== closesAt) {
    setFirst({ closesAt, closesIn });
  }
  const firstIn = first.closesAt === closesAt ? first.closesIn : closesIn;
  // Start again, once pressed: "Working…" beside it, outside the region, and a second press sends nothing. The ref stops
  // two presses in one frame; the press always leaves the page (the sign-in page, or the error boundary), so nothing
  // lets it go.
  const restarting = useRef(false);
  const [restartPending, setRestartPending] = useState(false);
  const onRestart = (event: FormEvent<HTMLFormElement>) => {
    if (restarting.current) {
      event.preventDefault();
      return;
    }
    restarting.current = true;
    setRestartPending(true);
  };

  useEffect(() => {
    const firstInDocument = !mountedBefore;
    mountedBefore = true;
    if (closesIn === undefined) {
      return undefined;
    }
    const anchor = anchorOf(closesIn, closesAt, firstInDocument);
    // Said only while the page is visible: a person who comes back hears the state then, and after zero only that it closed.
    const check = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      const next = stepPhase(timeLeft(anchor, Date.now(), performance.now()), warningSeconds * 1000);
      // The phase never goes back; the same phase sets nothing, so React writes nothing between the two moments.
      setShown((current) => (current !== null && current.closesAt === closesAt && ORDER[current.phase] >= ORDER[next] ? current : { closesAt, phase: next }));
    };
    check();
    const interval = window.setInterval(check, 1000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('pageshow', check);
    window.addEventListener('focus', check);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('pageshow', check);
      window.removeEventListener('focus', check);
    };
  }, [closesIn, closesAt, warningSeconds]);

  const phrases = limitPhrases(limitSeconds, warningSeconds, firstIn, cue);
  // Before the first count, the phase the server's time left gives, which the server and the browser render alike; the
  // status stays empty until the count, so nothing is said at load.
  const visible = phase ?? (closesIn === undefined ? 'open' : stepPhase(closesIn, warningSeconds * 1000));
  const speaking = phase === 'warning' || phase === 'closed';
  const said = speaking ? spokenWords(phase, warningSeconds, notes, words) : null;
  return (
    <div data-slot="step-timer-frame">
      <div className="flex flex-col gap-4">
        <p data-slot="step-limit" className="grid">
          {(['open', 'warning', 'closed'] as const).map((each) => (
            <span key={each} className={each === visible ? 'col-start-1 row-start-1' : 'invisible col-start-1 row-start-1'} aria-hidden={each === visible ? undefined : true}>
              {phrases[each]}
            </span>
          ))}
        </p>
        {children}
      </div>
      <div role="status" aria-atomic="true" data-slot="step-timer" data-phase={phase} className={speaking ? cn(alertVariants({ variant: 'default' }), 'mt-4') : undefined}>
        {said === null ? null : (
          <>
            <AlertTitle>{said.title}</AlertTitle>
            <AlertDescription>{said.words}</AlertDescription>
          </>
        )}
        {said === null || restart === null ? null : (
          <form action={restart} onSubmit={onRestart} className="mt-2 justify-self-start">
            <button type="submit" aria-disabled={restartPending ? true : undefined} className={buttonVariants({ variant: 'outline' })}>
              Start again
            </button>
          </form>
        )}
      </div>
      {said === null || restart === null ? null : (
        <div className="mt-2" data-slot="restart-pending">
          <PendingStatus pending={restartPending} />
        </div>
      )}
    </div>
  );
}
