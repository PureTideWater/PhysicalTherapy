import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { downloadRefusal, refusalLocation } from './download-refusal';
import { DOWNLOAD_REFUSALS, MAX_RETRY_MINUTES, type RefusedDownload, minutesWords, refusedDownloadOf, waitMinutes } from './download-refusal-words';
import { ResponseCookies, outcomeResponse } from './handler';
import { retryMinutes } from './rate-limit';
import type { Outcome } from './route';

/**
 * A refused download's closed codes and words, as a page and a client component both read them (docs/adr/0079): a
 * script's JSON refusal reads as the page reads the 303's query, only the closed codes come out of a body, the wait is
 * rounded as a refused form's is, and the module imports nothing, so a client component takes it without the server's
 * modules. SYNTHETIC opaque IDs, written by hand.
 */

const ORIGIN = 'https://app.synthetic.test';
const PAGE = { path: '/p/3f0b8c1e-5d2a-4e7f-9a6b-1c2d3e4f5a60/reports' };

/** One refusal of each status a page shows, as a route returns it. */
const REFUSALS: Readonly<Record<RefusedDownload['status'], Exclude<Outcome<unknown>, { status: 'ok' }>>> = {
  invalid: { status: 'invalid', issues: [{ field: 'codes', message: 'procedure codes of five letters or digits, separated by commas' }] },
  not_found: { status: 'not_found' },
  forbidden: { status: 'forbidden', permission: 'phi.export', message: 'Viewer cannot export PHI', roles: ['viewer'] },
  rate_limited: { status: 'rate_limited', retryAfterSeconds: 125 },
  suspended: { status: 'suspended', reason: 'the organization is suspended for nonpayment' },
  duplicate: { status: 'duplicate' },
  csrf_refused: { status: 'csrf_refused' },
};

describe('a refused download read from its outcome', () => {
  it.each(DOWNLOAD_REFUSALS)('reads a script’s JSON refusal (%s) as the page reads the 303’s query', async (status) => {
    const outcome = REFUSALS[status];
    const body: unknown = await outcomeResponse(outcome, new ResponseCookies(null)).json();
    const query = Object.fromEntries(new URL(refusalLocation(outcome, PAGE, ORIGIN), ORIGIN).searchParams);
    expect(refusedDownloadOf(body)).toEqual(downloadRefusal(query));
    expect(refusedDownloadOf(outcome)).toEqual(downloadRefusal(query));
  });

  it('is none for a success, a status a navigation settles, or a body that is not an outcome', () => {
    for (const body of [null, undefined, 'invalid', 3, [], {}, { status: 'ok', data: {} }, { status: 'unauthenticated', reason: 'idle' }, { status: 'maintenance' }, { status: 'terms_required' }, { status: 'INVALID' }, { status: ['invalid'] }]) {
      expect(refusedDownloadOf(body), JSON.stringify(body)).toBeNull();
    }
  });

  it('takes only the closed codes from a body: field names, never a message, and a wait only when it is a number', () => {
    const issues = [{ field: 'codes', message: 'Call 555-0100' }, { field: 'lines.0.code' }, { field: 5 }, 'codes', null, { field: 'codes' }, { field: 'contract' }];
    expect(refusedDownloadOf({ status: 'invalid', issues })).toEqual({ status: 'invalid', fields: ['codes', 'contract'], retryMinutes: null });
    expect(refusedDownloadOf({ status: 'invalid', issues: 'codes' })).toEqual({ status: 'invalid', fields: [], retryMinutes: null });
    expect(refusedDownloadOf({ status: 'invalid' })).toEqual({ status: 'invalid', fields: [], retryMinutes: null });
    expect(refusedDownloadOf({ status: 'rate_limited', retryAfterSeconds: 61 })).toEqual({ status: 'rate_limited', fields: [], retryMinutes: 2 });
    for (const retryAfterSeconds of ['60', null, undefined]) {
      expect(refusedDownloadOf({ status: 'rate_limited', retryAfterSeconds })).toEqual({ status: 'rate_limited', fields: [], retryMinutes: null });
    }
    expect(refusedDownloadOf({ status: 'not_found', retryAfterSeconds: 60, issues: [{ field: 'codes' }], message: 'Your account is locked' })).toEqual({ status: 'not_found', fields: [], retryMinutes: null });
  });

  it('rounds the wait as a refused form’s, one minute to a day', () => {
    for (let seconds = -60; seconds <= 90_000; seconds += 7) {
      expect(waitMinutes(seconds), String(seconds)).toBe(Math.min(MAX_RETRY_MINUTES, retryMinutes(seconds)));
    }
    expect([waitMinutes(0), waitMinutes(60), waitMinutes(61), waitMinutes(86_400), waitMinutes(Number.POSITIVE_INFINITY), waitMinutes(Number.NaN)]).toEqual([1, 1, 2, 1440, 1440, 1440]);
    expect([minutesWords(1), minutesWords(3)]).toEqual(['1 minute', '3 minutes']);
  });

  it('imports nothing, so a client component takes the codes and the words without the server’s modules', () => {
    const source = readFileSync(new URL('./download-refusal-words.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/^\s*import\b|\brequire\(|\bimport\(/m);
  });
});
