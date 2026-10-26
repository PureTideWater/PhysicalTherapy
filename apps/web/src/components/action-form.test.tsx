import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { RefusalTakeover, noteRefusal, summaryLead, takesFocus } from './action-form';

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
