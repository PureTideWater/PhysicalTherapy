import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ActionForm, RefusalFallback, RefusalTakeover, noteRefusal, summaryLead, takesFocus, takesOrphanedRefusal } from './action-form';

/**
 * A refused form's first line, and the hand-off of the focus from a refused form to the explanation that takes its
 * place after the refresh (UX review of PR #50, UX-3 and UX-6). The browser behaviour itself is the e2e pricing
 * step's; these are its rules.
 */

const INVALID = { error: 'Check the fields marked below.', invalid: true, issues: [{ field: 'runId', message: 'can no longer be accepted' }] } as const;

describe('a refusal’s first line', () => {
  it('is the generic line of an invalid form only when an issue marked a control the person can see', () => {
    expect(summaryLead(INVALID, true)).toBe('Check the fields marked below.');
    // Every issue on a hidden field (the run an Accept button carries): nothing is marked below, so the issues stand alone.
    expect(summaryLead(INVALID, false)).toBeNull();
  });

  it('is every other error as the action gave it, marked or not', () => {
    expect(summaryLead({ error: 'Not available to your role: mapping.edit.' }, false)).toBe('Not available to your role: mapping.edit.');
    expect(summaryLead({ error: 'Check the fields marked below.', invalid: true, issues: [] }, false)).toBe('Check the fields marked below.');
    expect(summaryLead({}, true)).toBeNull();
  });
});

describe('the focus after a refused form’s refresh', () => {
  it('moves to an explanation naming the refused form, once, only when the form took the focus with it', () => {
    noteRefusal('accept:run-1', 1_000);
    expect(takesFocus(['rerun:run-1'], 1_100, true)).toBe(false);
    expect(takesFocus(['accept:run-1'], 1_100, false)).toBe(false);
    expect(takesFocus(['accept:run-1', 'rerun-from:run-1'], 1_200, true)).toBe(true);
    // The first explanation to take it ends the hand-off.
    expect(takesFocus(['accept:run-1'], 1_300, true)).toBe(false);
  });

  it('expires: an explanation mounting long after the refusal, on a page the person moved to, leaves the focus alone', () => {
    noteRefusal('rerun:run-2', 1_000);
    expect(takesFocus(['rerun:run-2'], 1_000 + 16_000, true)).toBe(false);
  });

  it('is offered by a focusable wrapper with no live region of its own', () => {
    const html = renderToStaticMarkup(
      <RefusalTakeover keys={['accept:run-3']}>
        <p>Why</p>
      </RefusalTakeover>,
    );
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('data-takes-over="accept:run-3"');
    expect(html).not.toContain('role=');
  });
});

describe('a refused row that leaves the list on the refresh (UX recheck of PR #50, N6)', () => {
  it('hands its refusal, as the form showed it, to the note after the list, once, only when no row of it is left', () => {
    noteRefusal('rerun:run-4', 1_000, ['This run: is not the run in effect for its service dates.']);
    // Its row is still listed: the row's own explanation (or the form itself) is offered, never the note.
    expect(takesOrphanedRefusal('rerun:', ['rerun:run-4', 'rerun:run-5'], 1_100, true)).toBeNull();
    expect(takesOrphanedRefusal('accept:', ['accept:run-5'], 1_100, true)).toBeNull();
    expect(takesOrphanedRefusal('rerun:', ['rerun:run-5'], 1_100, false)).toBeNull();
    expect(takesOrphanedRefusal('rerun:', ['rerun:run-5'], 1_200, true)).toEqual(['This run: is not the run in effect for its service dates.']);
    // Taken once.
    expect(takesOrphanedRefusal('rerun:', ['rerun:run-5'], 1_300, true)).toBeNull();
  });

  it('expires as the hand-off does, and renders nothing until it takes a refusal', () => {
    noteRefusal('rerun:run-6', 1_000, []);
    expect(takesOrphanedRefusal('rerun:', [], 1_000 + 16_000, true)).toBeNull();
    const idle = renderToStaticMarkup(<RefusalFallback prefix="rerun:" present={[]} lead="Gone." />);
    expect(idle).not.toContain('Gone.');
    expect(idle).not.toContain('tabindex');
    expect(idle).not.toContain('data-takes-over');
  });
});

describe('a long button label (UX recheck of PR #50, N1)', () => {
  const action = async () => Promise.resolve({});

  it('wraps inside its card at a phone’s width when the form asks, and stays one line otherwise', () => {
    const wrapped = renderToStaticMarkup(<ActionForm action={action} submit="Re-run the run in effect under release 900001" wrapSubmit />);
    expect(wrapped).toMatch(/<button[^>]*class="[^"]*\bwhitespace-normal\b/);
    // The size's fixed height gives way, so a second line grows the button instead of running out of it.
    expect(wrapped).not.toMatch(/<button[^>]*class="(?:[^"]* )?h-9[ "]/);
    expect(wrapped).toMatch(/<button[^>]*class="[^"]*\bh-auto\b/);
    expect(wrapped).not.toMatch(/<button[^>]*class="[^"]*\bwhitespace-nowrap\b/);
    const plain = renderToStaticMarkup(<ActionForm action={action} submit="Accept this run" />);
    expect(plain).toMatch(/<button[^>]*class="[^"]*\bwhitespace-nowrap\b/);
  });
});
