import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { StepTimer, type StepTimerProps, limitPhrases, spokenWords, stepPhase, timeLeft } from './step-timer';

/**
 * A sign-in step's time limit (docs/adr/0081; test matrix SGN-01, SGN-02). The unit project has no DOM, so the server
 * render is read here and the count is pure functions, tested on their own; the browser harness
 * (step-timer.browser.test.tsx) runs the live timer on a clock it moves. Synthetic values only.
 */

const MINUTE = 60_000;

function server(props: Partial<StepTimerProps> = {}): string {
  return renderToStaticMarkup(
    <StepTimer limitSeconds={180} warningSeconds={60} closesIn={180_000} closesAt={1_800_000_000_000} restartHref="/sign-in?reason=restarted" {...props}>
      <form data-work="">SYNTHETIC form</form>
    </StepTimer>,
  );
}

/** The status region's element, as the server renders it. */
function region(markup: string): string {
  return /<div role="status"[^>]*>.*?<\/div>/.exec(markup)?.[0] ?? '';
}

describe('a step’s phase', () => {
  it('SGN-02: is open above the warning, warning at or below it, and closed at or below zero', () => {
    expect(stepPhase(180_000, MINUTE)).toBe('open');
    expect(stepPhase(60_001, MINUTE)).toBe('open');
    expect(stepPhase(60_000, MINUTE)).toBe('warning');
    expect(stepPhase(1, MINUTE)).toBe('warning');
    expect(stepPhase(0, MINUTE)).toBe('closed');
    expect(stepPhase(-5, MINUTE)).toBe('closed');
  });

  it('SGN-02: is counted on the smaller of the wall and monotonic clocks', () => {
    // Anchored at wall 1,000,000 and monotonic 500 with three minutes left.
    const anchor = { wall: 1_000_000 + 3 * MINUTE, monotonic: 500 + 3 * MINUTE };
    // A machine that slept: the wall clock 5 minutes on, the monotonic one not.
    expect(stepPhase(timeLeft(anchor, 1_000_000 + 5 * MINUTE, 500), MINUTE)).toBe('closed');
    // A wall clock set back 10 minutes while 2 minutes passed: the monotonic clock's minute left.
    expect(timeLeft(anchor, 1_000_000 - 8 * MINUTE, 500 + 2 * MINUTE)).toBe(MINUTE);
    // A wall clock set forward 2 minutes 30: the step closes early by the jump, on purpose (the safe side).
    expect(timeLeft(anchor, 1_000_000 + 2.5 * MINUTE, 500)).toBe(MINUTE / 2);
    expect(stepPhase(timeLeft(anchor, 1_000_000 + 2.5 * MINUTE, 500), MINUTE)).toBe('warning');
  });
});

describe('the server render', () => {
  it('SGN-01, SGN-02: states the limit before the work, then one empty polite atomic status with no link, no phase and no box', () => {
    const markup = server();
    const sentence = markup.indexOf('This step stays open for 3 minutes.');
    expect(sentence).toBeGreaterThan(-1);
    expect(sentence).toBeLessThan(markup.indexOf('data-work'));
    expect(markup.match(/role="status"/g)).toHaveLength(1);
    expect(region(markup)).toBe('<div role="status" aria-atomic="true" data-slot="step-timer"></div>');
    expect(markup.indexOf('data-slot="step-timer"')).toBeGreaterThan(markup.indexOf('</form>'));
    expect(markup).not.toContain('<a ');
    expect(markup).not.toContain('data-phase');
    for (const box of ['border', 'px-4', 'py-3', 'mt-4']) {
      expect(region(markup)).not.toContain(box);
    }
    for (const assertive of ['role="alert"', 'aria-live="assertive"', 'data-slot="alert"']) {
      expect(markup).not.toContain(assertive);
    }
  });

  it('SGN-02: sizes the sentence’s cell from the first render, the warning and closed phrases invisible and hidden from a screen reader', () => {
    const markup = server();
    expect(markup).toContain(
      '<p data-slot="step-limit" class="grid">' +
        '<span class="col-start-1 row-start-1">This step stays open for 3 minutes.</span>' +
        '<span class="invisible col-start-1 row-start-1" aria-hidden="true">This step closes within a minute.</span>' +
        '<span class="invisible col-start-1 row-start-1" aria-hidden="true">This step has closed.</span></p>',
    );
    // The frame has no flex of its own: the sentence and the work are its column, the status a block after it.
    expect(markup).toMatch(/^<div data-slot="step-timer-frame"><div class="flex flex-col gap-4"><p data-slot="step-limit"/);
  });

  it('SGN-01: says the limit from its seconds, one minute in the singular, and the same without a countdown', () => {
    expect(server({ limitSeconds: 900, warningSeconds: 120 })).toContain('This step stays open for 15 minutes.');
    expect(server({ limitSeconds: 60 })).toContain('This step stays open for 1 minute.');
    const unstamped = renderToStaticMarkup(
      <StepTimer limitSeconds={180} warningSeconds={60} restartHref="/sign-in?reason=restarted">
        <form>SYNTHETIC form</form>
      </StepTimer>,
    );
    expect(unstamped).toContain('This step stays open for 3 minutes.');
    expect(region(unstamped)).toBe('<div role="status" aria-atomic="true" data-slot="step-timer"></div>');
  });
});

describe('the words', () => {
  it('SGN-02: the sentence’s place says the warning within a minute, or within 2 minutes, and then that the step has closed', () => {
    expect(limitPhrases(180, 60)).toEqual({ open: 'This step stays open for 3 minutes.', warning: 'This step closes within a minute.', closed: 'This step has closed.' });
    expect(limitPhrases(900, 120)).toEqual({ open: 'This step stays open for 15 minutes.', warning: 'This step closes within 2 minutes.', closed: 'This step has closed.' });
  });

  it('SGN-02: the status says what Start again costs and keeps, with the step’s own note after it', () => {
    expect(spokenWords('warning', 60)).toEqual({
      title: 'This step closes within a minute',
      words: 'If you need more time, start again: your email is kept, and you type your password again.',
    });
    expect(spokenWords('warning', 120).title).toBe('This step closes within 2 minutes');
    expect(spokenWords('closed', 60)).toEqual({ title: 'This step has closed', words: 'Start again: your email is kept, and you type your password again.' });
    const notes = {
      warning: 'Starting again gives you a new setup key: replace this one in your authenticator app.',
      closed: 'This setup key no longer works: starting again gives you a new one.',
    };
    expect(spokenWords('warning', 60, notes).words).toBe(
      'If you need more time, start again: your email is kept, and you type your password again. Starting again gives you a new setup key: replace this one in your authenticator app.',
    );
    expect(spokenWords('closed', 60, notes).words).toBe('Start again: your email is kept, and you type your password again. This setup key no longer works: starting again gives you a new one.');
    // A note for one phase is never said in the other.
    expect(spokenWords('closed', 60, { warning: notes.warning }).words).toBe('Start again: your email is kept, and you type your password again.');
  });

  it('SGN-02: no word names an address, and none is an exclamation or a please', () => {
    const notes = { warning: 'SYNTHETIC note.', closed: 'SYNTHETIC note.' };
    const all = [...Object.values(limitPhrases(180, 60)), ...Object.values(spokenWords('warning', 60, notes)), ...Object.values(spokenWords('closed', 60, notes))];
    for (const words of all) {
      expect(words).not.toMatch(/@|!|please/i);
    }
  });
});
