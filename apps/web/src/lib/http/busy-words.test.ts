import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { busyWords } from './busy-words';

/**
 * A busy refusal's words (docs/adr/0092 and its amendment of 2026-11-11; CAS-56, CAS-57), as the server's adapter and
 * the form's own lead both take them: true of whatever was held, and of the form only where the form is known.
 */
describe('what a busy refusal says', () => {
  it('names the ledger, or the records the form needs, says nothing was saved, and gives a wait of minutes, claiming nothing about a form it has not seen', () => {
    expect(busyWords('ledger', null)).toBe('The recovery ledger is being updated, so nothing was saved. Try again in a few minutes.');
    expect(busyWords('records', null)).toBe('The records this form needs are being updated, so nothing was saved. Try again in a few minutes.');
  });

  it('never says nothing was saved of a form whose earlier send is still running: that send may yet save, so nothing new was', () => {
    expect(busyWords('request', null)).toBe('This form was already sent and is still being processed, so nothing new was saved. Try again in a few minutes.');
    expect(busyWords('request', { fields: true, secrets: false })).toBe(
      'This form was already sent and is still being processed, so nothing new was saved. What you typed is still here: try again in a few minutes.',
    );
    expect(busyWords('request', { fields: true, secrets: true })).toBe(
      'This form was already sent and is still being processed, so nothing new was saved. What you typed is still here, except passwords and codes: type them again, then try again in a few minutes.',
    );
  });

  it('says what was typed is still here only of a form that holds a field', () => {
    expect(busyWords('ledger', { fields: true, secrets: false })).toBe('The recovery ledger is being updated, so nothing was saved. What you typed is still here: try again in a few minutes.');
    expect(busyWords('records', { fields: true, secrets: false })).toBe('The records this form needs are being updated, so nothing was saved. What you typed is still here: try again in a few minutes.');
    // A form that is one button holds nothing typed, whatever else is known of it.
    expect(busyWords('records', { fields: false, secrets: false })).toBe(busyWords('records', null));
    expect(busyWords('ledger', { fields: false, secrets: true })).toBe(busyWords('ledger', null));
  });

  it('never says a password or a code is still here: a refusal empties them, so the words ask for them again', () => {
    expect(busyWords('records', { fields: true, secrets: true })).toBe(
      'The records this form needs are being updated, so nothing was saved. What you typed is still here, except passwords and codes: type them again, then try again in a few minutes.',
    );
    expect(busyWords('ledger', { fields: true, secrets: true })).toBe(
      'The recovery ledger is being updated, so nothing was saved. What you typed is still here, except passwords and codes: type them again, then try again in a few minutes.',
    );
  });

  it('imports no module at run time, so the form’s client component takes the words without the server’s modules', () => {
    const source = readFileSync(path.join(import.meta.dirname, 'busy-words.ts'), 'utf8');
    expect([...source.matchAll(/^import (?!type )/gm)]).toEqual([]);
  });
});
