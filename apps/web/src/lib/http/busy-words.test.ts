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

  it('never says a password or a code is still here: a refusal empties them, so the words ask for them again, and say nothing stays where nothing does', () => {
    expect(busyWords('records', { kept: true, secrets: true })).toBe(`${RECORDS} What you typed is still here, except passwords and codes: type them again, then try again in a few minutes.`);
    expect(busyWords('ledger', { kept: true, secrets: true })).toBe(`${LEDGER} What you typed is still here, except passwords and codes: type them again, then try again in a few minutes.`);
    // A form whose only field is a password or a code: nothing typed is still here.
    expect(busyWords('records', { kept: false, secrets: true })).toBe(`${RECORDS} Passwords and codes are not kept: type them again, then try again in a few minutes.`);
    expect(busyWords('records', { kept: false, secrets: true })).not.toContain('still here');
  });

  it('never says nothing was saved of a form whose earlier send is still running, and has it sent again unchanged: a changed one would lose its changes once the first has saved', () => {
    expect(busyWords('request', { kept: true, secrets: false })).toBe(`${REQUEST} Send it again in a few minutes, changing nothing, to see whether it saved: nothing is saved twice.`);
    expect(busyWords('request', { kept: false, secrets: false })).toBe(busyWords('request', { kept: true, secrets: false }));
    expect(busyWords('request', { kept: true, secrets: true })).toBe(
      `${REQUEST} Type passwords and codes again, then send it again in a few minutes, changing nothing else, to see whether it saved: nothing is saved twice.`,
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
