'use client';

import { AlertDescription, AlertTitle, alertVariants, buttonVariants, cn } from '@tp/ui';
import Link from 'next/link';
import { type ReactNode, useEffect, useState } from 'react';

import { counted } from '../lib/copy/words';

/**
 * A sign-in step's time limit (docs/adr/0081; test matrix SGN-01, SGN-02): the limit stated once before the work, then
 * one polite status below it, present and empty from the first render, that speaks twice over the step's life: at the
 * warning and when the step has closed, each time with Start again. No ticking count, no focus moved, nothing animated,
 * no redirect and no disabled form: the server closes the step itself (lib/routes/sign-in.ts), and the next press or a
 * reload lands on the sign-in page with the email kept. The sentence above the work shows the same state in a few
 * words, in a cell sized from the first render, so a phone with its keyboard up sees it beside the field and nothing
 * moves. The page gives plain numbers from the server; the browser counts on the smaller of its wall and monotonic
 * clocks and never compares the server's deadline with its own clock.
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
  /** Where Start again goes: a fixed path with a reason code. */
  readonly restartHref: string;
  /** This step's own words, said with the warning and with the closed notice (enrolment's new key). */
  readonly notes?: { readonly warning?: string; readonly closed?: string };
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

/** "within a minute", or "within 2 minutes": true for as long as the warning is on screen. */
function within(seconds: number): string {
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? 'within a minute' : `within ${counted(minutes, 'minute')}`;
}

/** The sentence before the work, in each phase: the limit while open, then the same state the status says. */
export function limitPhrases(limitSeconds: number, warningSeconds: number): Readonly<Record<StepPhase, string>> {
  return {
    open: `This step stays open for ${counted(Math.floor(limitSeconds / 60), 'minute')}.`,
    warning: `This step closes ${within(warningSeconds)}.`,
    closed: 'This step has closed.',
  };
}

/** What the status says at the warning and once closed: its title, and its words with the step's own note after them. */
export function spokenWords(phase: 'warning' | 'closed', warningSeconds: number, notes: StepTimerProps['notes'] = {}): { readonly title: string; readonly words: string } {
  const [title, words, note] =
    phase === 'warning'
      ? [`This step closes ${within(warningSeconds)}`, 'If you need more time, start again: your email is kept, and you type your password again.', notes.warning]
      : ['This step has closed', 'Start again: your email is kept, and you type your password again.', notes.closed];
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
 * it stays in the accessibility tree from the first render. Start again is one element in both phases, so a person who
 * reached it during the warning still holds it once the step has closed.
 */
export function StepTimer({ limitSeconds, warningSeconds, closesIn, closesAt, restartHref, notes, children }: StepTimerProps) {
  // The phase shown, with the step it belongs to: a new deadline is a new step, whose count starts again.
  const [shown, setShown] = useState<{ readonly closesAt: number | undefined; readonly phase: StepPhase } | null>(null);
  const phase = shown !== null && shown.closesAt === closesAt ? shown.phase : undefined;

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

  const phrases = limitPhrases(limitSeconds, warningSeconds);
  const visible = phase ?? 'open';
  const speaking = phase === 'warning' || phase === 'closed';
  const said = speaking ? spokenWords(phase, warningSeconds, notes) : null;
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
        {said === null ? null : (
          <Link href={restartHref} className={cn(buttonVariants({ variant: 'outline' }), 'mt-2 justify-self-start')}>
            Start again
          </Link>
        )}
      </div>
    </div>
  );
}
