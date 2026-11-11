import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { busyWords } from './busy-words';

/**
 * A busy refusal's words (docs/adr/0092 and its amendment of 2026-11-11; CAS-56, CAS-57), as the server's adapter and
 * the form's own lead both take them: true of whatever was held, and of the form only where the browser has read it.
 */
const LEDGER = 'The recovery ledger is being updated, so nothing was saved.';
const RECORDS = 'The records this form needs are being updated, so nothing was saved.';
const REQUEST = 'This form was already sent and is still being processed, so nothing new was saved.';

describe('what a busy refusal says', () => {
  it('names the ledger, or the records the form needs, says nothing was saved, and gives a wait of minutes, claiming nothing about a form it has not seen', () => {
    expect(busyWords('ledger', null)).toBe(`${LEDGER} Try again in a few minutes.`);
    expect(busyWords('records', null)).toBe(`${RECORDS} Try again in a few minutes.`);
  });

  it('says what was typed is still here only of a form that holds a field a refusal keeps', () => {
    expect(busyWords('ledger', { kept: true, secrets: false })).toBe(`${LEDGER} What you typed is still here: try again in a few minutes.`);
    expect(busyWords('records', { kept: true, secrets: false })).toBe(`${RECORDS} What you typed is still here: try again in a few minutes.`);
    // A form that is one button keeps nothing typed.
    expect(busyWords('records', { kept: false, secrets: false })).toBe(busyWords('records', null));
    expect(busyWords('ledger', { kept: false, secrets: false })).toBe(busyWords('ledger', null));
  });

  it('never says a password or a code is still here: a refusal empties them, so the words ask for the password again and for a new code (the one typed has passed), and say nothing stays where nothing does', () => {
    expect(busyWords('records', { kept: true, secrets: true })).toBe(`${RECORDS} What you typed is still here, except passwords and codes: in a few minutes, type your password again or enter a new code, then try again.`);
    expect(busyWords('ledger', { kept: true, secrets: true })).toBe(`${LEDGER} What you typed is still here, except passwords and codes: in a few minutes, type your password again or enter a new code, then try again.`);
    // A form whose only field is a password or a code: nothing typed is still here.
    expect(busyWords('records', { kept: false, secrets: true })).toBe(`${RECORDS} Passwords and codes are not kept: in a few minutes, type your password again or enter a new code, then try again.`);
    expect(busyWords('records', { kept: false, secrets: true })).not.toContain('still here');
  });

  it('never says nothing was saved of a form whose earlier send is still running, has it sent again unchanged, and says what that send does whether the first saved or not', () => {
    expect(busyWords('request', { kept: true, secrets: false })).toBe(`${REQUEST} Send it again in a few minutes, changing nothing. If the first send saved, PaidWhole says so; if not, this one saves it. Nothing is saved twice.`);
    expect(busyWords('request', { kept: false, secrets: false })).toBe(busyWords('request', { kept: true, secrets: false }));
    expect(busyWords('request', { kept: true, secrets: true })).toBe(
      `${REQUEST} In a few minutes, type your password again or enter a new code, and send it again, changing nothing else. If the first send saved, PaidWhole says so; if not, this one saves it. Nothing is saved twice.`,
    );
    // Without the form (a post without JavaScript keeps no request key), sending again could save twice: the page is read instead.
    expect(busyWords('request', null)).toBe(`${REQUEST} Reload the page in a few minutes to see whether it saved.`);
    for (const form of [null, { kept: true, secrets: false }, { kept: true, secrets: true }]) {
      expect(busyWords('request', form)).not.toContain('still here');
      expect(busyWords('request', form)).not.toContain('Try again');
    }
  });

  it('imports no module at run time, so the form’s client component takes the words without the server’s modules', () => {
    const source = readFileSync(path.join(import.meta.dirname, 'busy-words.ts'), 'utf8');
    expect([...source.matchAll(/^import (?!type )/gm)]).toEqual([]);
  });
});
