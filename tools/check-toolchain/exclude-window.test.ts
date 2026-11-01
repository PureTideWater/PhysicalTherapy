import { describe, expect, it } from 'vitest';

import { ageWords, excludeWindowProblems, expiredExclude, releaseAgeMinutes } from './exclude-window';
import { MINIMUM_RELEASE_AGE_MINUTES } from './policy';

/**
 * The floor and the exclude window every release-age list shares, called directly. The npm list's cases stay in
 * check.test.ts, unchanged, which is what shows the extraction changed nothing; these are the bounds as the action and
 * image lists will call them. Now is 2026-10-26T00:00Z throughout; owners and pins are synthetic.
 */
const NOW = new Date('2026-10-26T00:00:00.000Z');

/** A young version published 2026-10-25T06:00Z, so three days old from 2026-10-28T06:00Z. */
const PUBLISHED = { what: 'the version', at: '2026-10-25T06:00:00.000Z', as: 'published' };
const FIX = { added: '2026-10-25T12:00:00.000Z', expires: '2026-10-29T00:00:00.000Z' };
const SUBJECT = '@scope/fix@3.0.0';
const PIN = `synthetic-owner/synthetic-action@${'1'.repeat(40)}`;

describe('the exclude window', () => {
  it('holds a security-fix exclude between the known time + the floor and its added date + 7 days, added no later than now', () => {
    const window = { kind: 'security-fix', known: PUBLISHED, minutes: MINIMUM_RELEASE_AGE_MINUTES } as const;
    expect(excludeWindowProblems(SUBJECT, FIX, window, NOW)).toEqual([]);
    // Each bound holds at its own instant.
    expect(excludeWindowProblems(SUBJECT, { added: NOW.toISOString(), expires: '2026-10-28T06:00:00.000Z' }, window, NOW)).toEqual([]);
    expect(excludeWindowProblems(SUBJECT, { ...FIX, expires: '2026-11-01T12:00:00.000Z' }, window, NOW)).toEqual([]);
    expect(excludeWindowProblems(SUBJECT, { ...FIX, expires: '2026-10-28T05:59:59.000Z' }, window, NOW)).toEqual([
      '@scope/fix@3.0.0: expires 2026-10-28T05:59:59.000Z, before the version is three days old (2026-10-28T06:00:00.000Z; published 2026-10-25T06:00:00.000Z), so it would lapse while still needed',
    ]);
    expect(excludeWindowProblems(SUBJECT, { ...FIX, expires: '2026-11-01T12:00:01.000Z' }, window, NOW)).toEqual([
      '@scope/fix@3.0.0: expires 2026-11-01T12:00:01.000Z, more than 7 days after it was added (2026-10-25T12:00:00.000Z); F2 (b) allows seven',
    ]);
    expect(excludeWindowProblems(SUBJECT, { ...FIX, added: '2026-10-26T00:00:01.000Z' }, window, NOW)).toEqual(['@scope/fix@3.0.0: added 2026-10-26T00:00:01.000Z, a time in the future']);
    // All three at once, in that order: a version known only from 2026-11-10 cannot be excused by an entry that ends sooner.
    const late = { ...window, known: { ...PUBLISHED, at: '2026-11-10T00:00:00.000Z' } };
    expect(excludeWindowProblems(SUBJECT, { added: '2026-10-27T00:00:00.000Z', expires: '2026-11-04T00:00:00.000Z' }, late, NOW)).toEqual([
      '@scope/fix@3.0.0: added 2026-10-27T00:00:00.000Z, a time in the future',
      '@scope/fix@3.0.0: expires 2026-11-04T00:00:00.000Z, more than 7 days after it was added (2026-10-27T00:00:00.000Z); F2 (b) allows seven',
      '@scope/fix@3.0.0: expires 2026-11-04T00:00:00.000Z, before the version is three days old (2026-11-13T00:00:00.000Z; published 2026-11-10T00:00:00.000Z), so it would lapse while still needed',
    ]);
    // Another list's words and a raised floor: an action pin, by its youngest signal, under four days.
    const committed = { kind: 'security-fix', known: { what: 'the pin', at: '2026-10-24T00:00:00.000Z', as: 'committed' }, minutes: 5760 } as const;
    expect(excludeWindowProblems(PIN, { ...FIX, expires: '2026-10-27T23:59:59.000Z' }, committed, NOW)).toEqual([
      `${PIN}: expires 2026-10-27T23:59:59.000Z, before the pin is 5760 minutes (4.00 days) old (2026-10-28T00:00:00.000Z; committed 2026-10-24T00:00:00.000Z), so it would lapse while still needed`,
    ]);
    // A time the caller could not read leaves the other two bounds, and the caller says why.
    const unknown = { ...window, known: null };
    expect(excludeWindowProblems(SUBJECT, { ...FIX, expires: '2026-10-26T00:00:01.000Z' }, unknown, NOW)).toEqual([]);
    expect(excludeWindowProblems(SUBJECT, { ...FIX, added: '2026-10-27T00:00:00.000Z' }, unknown, NOW)).toEqual(['@scope/fix@3.0.0: added 2026-10-27T00:00:00.000Z, a time in the future']);
    // An instant that does not parse is refused, never read as inside the window.
    expect(excludeWindowProblems(SUBJECT, { added: 'yesterday', expires: '2026-13-01T00:00:00Z' }, window, NOW)).toEqual([
      '@scope/fix@3.0.0: added yesterday, not an instant (ISO 8601, UTC)',
      '@scope/fix@3.0.0: expires 2026-13-01T00:00:00Z, not an instant (ISO 8601, UTC)',
    ]);
  });

  it('holds a reasoned exclude (age-unprovable, off-default-branch) to its added date alone: no later than now, and an expiry within 7 days of it', () => {
    const reasoned = { kind: 'reasoned' } as const;
    // No known time bounds it: it waives no age, so a short entry is as good as a long one.
    expect(excludeWindowProblems(PIN, { added: '2026-10-25T12:00:00.000Z', expires: '2026-10-26T00:00:01.000Z' }, reasoned, NOW)).toEqual([]);
    expect(excludeWindowProblems(PIN, { added: NOW.toISOString(), expires: '2026-11-02T00:00:00.000Z' }, reasoned, NOW)).toEqual([]);
    expect(excludeWindowProblems(PIN, { added: '2026-10-27T00:00:00.000Z', expires: '2026-10-28T00:00:00.000Z' }, reasoned, NOW)).toEqual([`${PIN}: added 2026-10-27T00:00:00.000Z, a time in the future`]);
    expect(excludeWindowProblems(PIN, { added: '2026-10-25T00:00:00.000Z', expires: '2026-11-02T00:00:00.000Z' }, reasoned, NOW)).toEqual([
      `${PIN}: expires 2026-11-02T00:00:00.000Z, more than 7 days after it was added (2026-10-25T00:00:00.000Z); F2 (b) allows seven`,
    ]);
  });

  it('fails an expired entry on a pull request that edits its list, and warns on a push or a pull request that leaves the list alone', () => {
    const expires = '2026-10-26T00:00:00.000Z';
    const message = '@scope/fix@3.0.0: expired 2026-10-26T00:00:00.000Z; remove it from both lists (the weekly triage, docs/runbooks/dependency-upgrades.md)';
    expect(expiredExclude(SUBJECT, expires, NOW, { event: 'pull_request', edited: true, list: 'both lists' })).toEqual({ level: 'error', message });
    expect(expiredExclude(SUBJECT, expires, NOW, { event: 'pull_request', edited: false, list: 'both lists' })).toEqual({ level: 'warning', message });
    expect(expiredExclude(SUBJECT, expires, NOW, { event: 'push', edited: true, list: 'both lists' })).toEqual({ level: 'warning', message });
    expect(expiredExclude(SUBJECT, expires, NOW, { event: 'push', edited: false, list: 'both lists' })).toEqual({ level: 'warning', message });
    // Live until its expiry: a millisecond before, nothing.
    expect(expiredExclude(SUBJECT, '2026-10-26T00:00:00.001Z', NOW, { event: 'pull_request', edited: true, list: 'both lists' })).toBeNull();
    // Another list names its own file.
    expect(expiredExclude(PIN, expires, NOW, { event: 'pull_request', edited: true, list: 'tools/check-action-pins/age-exceptions.json' })).toEqual({
      level: 'error',
      message: `${PIN}: expired 2026-10-26T00:00:00.000Z; remove it from tools/check-action-pins/age-exceptions.json (the weekly triage, docs/runbooks/dependency-upgrades.md)`,
    });
  });

  it('reads the floor from minimumReleaseAge, never under MINIMUM_RELEASE_AGE_MINUTES, and says it in words', () => {
    expect(MINIMUM_RELEASE_AGE_MINUTES).toBe(4320);
    expect(releaseAgeMinutes({})).toBe(4320);
    expect(releaseAgeMinutes({ minimumReleaseAge: 1440 })).toBe(4320);
    expect(releaseAgeMinutes({ minimumReleaseAge: -1 })).toBe(4320);
    expect(releaseAgeMinutes({ minimumReleaseAge: 4320 })).toBe(4320);
    expect(releaseAgeMinutes({ minimumReleaseAge: 10080 })).toBe(10080);
    // A setting that is not a finite number, which the workspace's schema refuses, reads as the minimum, never as NaN.
    expect(releaseAgeMinutes({ minimumReleaseAge: Number.NaN })).toBe(4320);
    expect(releaseAgeMinutes({ minimumReleaseAge: Number.POSITIVE_INFINITY })).toBe(4320);
    expect(ageWords(4320)).toBe('three days');
    expect(ageWords(10080)).toBe('10080 minutes (7.00 days)');
  });
});
