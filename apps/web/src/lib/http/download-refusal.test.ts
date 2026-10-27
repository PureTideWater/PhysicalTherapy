import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { urlPhiFindings } from '@tp/observability';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { LETTER_CODES_PATTERN, letterCodes } from '../contracts/letter';
import * as registry from '../routes/index';
import { opaqueId, optionalText } from '../routes/schemas';
import type { Services } from '../server/services';
import {
  DOWNLOAD_REFUSALS,
  MAX_REFUSED_FIELDS,
  SIGNED_OUT_REFUSALS,
  cameFrom,
  downloadRefusal,
  keptCodes,
  keptId,
  keptMonth,
  pagePath,
  refusalLocation,
  returnPage,
  safeReturnPath,
} from './download-refusal';
import { PRIVATE_NO_STORE, ResponseCookies, downloadHandler, isNavigation, outcomeResponse } from './handler';
import { practiceRoute, publicRoute } from './invoke';
import { type Download, InputError, NotFoundError, type Outcome, type ReturnPage, type Route, type RouteRequest } from './route';

/**
 * A refused download comes back to its page, never a JSON page (UX-010; docs/adr/0079; test matrix DLR-01 to DLR-03):
 * a browser navigation's refusal is a 303 to the route's page in closed codes, a script's is today's JSON outcome byte
 * for byte, no input makes the Location leave the application's origin or carry an identifier's shape, the page's
 * parser reads only the closed codes, every download route declares its page, and the letter's codes field's pattern
 * accepts exactly what the route accepts. Fake routes and SYNTHETIC opaque IDs, written by hand.
 */

const ORIGIN = 'https://app.synthetic.test';
const services = { origin: ORIGIN, trustedProxyHops: 0 } as Services;
const PRACTICE = '3f0b8c1e-5d2a-4e7f-9a6b-1c2d3e4f5a60';
const PAYER = '3f0b8c1e-5d2a-4e7f-9a6b-1c2d3e4f5a61';
const CONTRACT = '3f0b8c1e-5d2a-4e7f-9a6b-1c2d3e4f5a62';
const REPORT = '3f0b8c1e-5d2a-4e7f-9a6b-1c2d3e4f5a63';
const FILE = { download: { filename: `request-to-payer-${PAYER}.txt`, contentType: 'text/plain; charset=utf-8', body: 'REQUEST FOR A FEE SCHEDULE\n' } };

/** A browser opening a link or a GET form: Fetch Metadata's navigate mode for a document, and a browser's Accept. */
const NAVIGATION = { 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document', 'sec-fetch-site': 'same-origin', accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' };

/** A letter-like download (Coverage's form): its page is Coverage, which keeps the payer, the contract and the codes. */
const letterRoute: Route<Download> = practiceRoute({
  id: 'test.letter',
  kind: 'handler',
  method: 'GET',
  path: '/p/[practiceId]/coverage/letter',
  phi: true,
  permission: 'practice.open',
  rateLimit: 'export',
  params: z.object({ practiceId: opaqueId, payer: opaqueId, contract: optionalText(opaqueId), codes: optionalText(z.string().max(400)) }),
  returnTo: (params) => returnPage('/p/[practiceId]/coverage', params, { payer: keptId(params.payer), contract: keptId(params.contract), codes: keptCodes(params.codes) }),
  handle: (): Promise<Download> => Promise.resolve(FILE),
});

/** A link download linked from two pages (R05): the report's own page by default, the list with ?from=list. */
const reportRoute: Route<Download> = practiceRoute({
  id: 'test.report_csv',
  kind: 'handler',
  method: 'GET',
  path: '/p/[practiceId]/reports/[reportId]/csv',
  phi: true,
  permission: 'report.read',
  params: z.object({ practiceId: opaqueId, reportId: opaqueId }),
  returnTo: (params) => returnPage(cameFrom(params, ['list']) === 'list' ? '/p/[practiceId]/reports' : '/p/[practiceId]/reports/[reportId]', params),
  handle: (): Promise<Download> => Promise.resolve(FILE),
});

/** The monthly CSV (R07): its page keeps the month only when the page's own schema takes it. */
const monthlyRoute: Route<Download> = practiceRoute({
  id: 'test.monthly_csv',
  kind: 'handler',
  method: 'GET',
  path: '/p/[practiceId]/reports/monthly/csv',
  phi: true,
  permission: 'report.read',
  params: z.object({ practiceId: opaqueId, month: optionalText(z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)) }),
  returnTo: (params) => returnPage('/p/[practiceId]/reports/monthly', params, { month: keptMonth(params.month) }),
  handle: (): Promise<Download> => Promise.resolve(FILE),
});

/** The route as the handler sees it, answering with `outcome` (the wrapper's own refusals need a database). */
function answering<R>(route: Route<R>, outcome: Outcome<R> | ((request: RouteRequest) => Outcome<R>)): Route<R> {
  return { ...route, invoke: (request) => Promise.resolve(typeof outcome === 'function' ? outcome(request) : outcome) };
}

/** A GET of the download's URL with the headers given, served with its path parameters. */
async function fetchDownload(route: Route<Download>, url: string, headers: Readonly<Record<string, string>>, params: Readonly<Record<string, string>> = { practiceId: PRACTICE }): Promise<Response> {
  return downloadHandler(route, () => services)(new Request(`${ORIGIN}${url}`, { headers }), { params: Promise.resolve(params) });
}

/** The 303's Location, after holding the response to the rules every refusal's redirect keeps (relative, on the origin, no identifier). */
async function redirected(response: Response): Promise<string> {
  expect(response.status).toBe(303);
  expect(response.headers.get('cache-control')).toBe(PRIVATE_NO_STORE);
  expect(response.headers.get('content-type')).toBeNull();
  expect(response.headers.get('content-disposition')).toBeNull();
  expect(await response.text()).toBe('');
  return located(response.headers.get('location') ?? '');
}

/** A Location held to the same rules: relative, on the application's origin, and no finding of the PHI guard. */
function located(location: string): string {
  expect(location, location).toMatch(/^\/(?![/\\])/);
  expect(new URL(location, ORIGIN).origin, location).toBe(ORIGIN);
  expect(urlPhiFindings(location), location).toEqual([]);
  return location;
}

/** Every refusal an outcome carries, by status (a status added to Outcome fails to compile here until it is placed). */
const REFUSALS: Readonly<Record<Exclude<Outcome<unknown>['status'], 'ok'>, Exclude<Outcome<Download>, { status: 'ok' }>>> = {
  invalid: { status: 'invalid', issues: [{ field: 'codes', message: 'procedure codes of five letters or digits, separated by commas' }] },
  unauthenticated: { status: 'unauthenticated', reason: 'idle' },
  mfa_required: { status: 'mfa_required' },
  hardware_key_required: { status: 'hardware_key_required' },
  forbidden: { status: 'forbidden', permission: 'phi.export', message: 'Viewer cannot export PHI', roles: ['viewer'] },
  not_found: { status: 'not_found' },
  duplicate: { status: 'duplicate' },
  suspended: { status: 'suspended', reason: 'the organization is suspended for nonpayment' },
  csrf_refused: { status: 'csrf_refused' },
  rate_limited: { status: 'rate_limited', retryAfterSeconds: 125 },
  terms_required: { status: 'terms_required' },
  maintenance: { status: 'maintenance' },
};

describe('a download route records its page (docs/adr/0079)', () => {
  it('copies returnTo from its definition, and records null for a route without one', () => {
    expect(letterRoute.returnTo).toBeTypeOf('function');
    expect(publicRoute({ id: 'test.page', kind: 'page', path: '/sign-in', phi: false, params: z.object({}), handle: () => Promise.resolve({}) }).returnTo).toBeNull();
  });

  it('places every refusal: back to the page, or where a page’s refusal goes', () => {
    expect([...DOWNLOAD_REFUSALS, ...SIGNED_OUT_REFUSALS].sort()).toEqual(Object.keys(REFUSALS).sort());
  });
});

describe('a navigation’s refused download (DLR-01)', () => {
  const LETTER = `/p/${PRACTICE}/coverage/letter?payer=${PAYER}&contract=${CONTRACT}&codes=ABC`;

  it.each(DOWNLOAD_REFUSALS)('answers %s with 303 to the route’s page, the status in closed codes and the page’s kept values', async (status) => {
    const location = await redirected(await fetchDownload(answering(letterRoute, REFUSALS[status]), LETTER, NAVIGATION));
    const url = new URL(location, ORIGIN);
    expect(url.pathname).toBe(`/p/${PRACTICE}/coverage`);
    expect(url.hash).toBe('');
    expect(url.searchParams.get('refused')).toBe(status);
    expect(url.searchParams.get('fields')).toBe(status === 'invalid' ? 'codes' : null);
    // 125 seconds is three minutes, rounded up as the refusal's sentence says it.
    expect(url.searchParams.get('retry')).toBe(status === 'rate_limited' ? '3' : null);
    expect([url.searchParams.get('payer'), url.searchParams.get('contract'), url.searchParams.get('codes')]).toEqual([PAYER, CONTRACT, 'ABC']);
  });

  it.each([
    ['unauthenticated', { status: 'unauthenticated', reason: 'none' }, '/sign-in'],
    ['an idle session', REFUSALS.unauthenticated, '/sign-in?reason=idle'],
    ['mfa_required', REFUSALS.mfa_required, '/sign-in?reason=mfa_required'],
    ['hardware_key_required', REFUSALS.hardware_key_required, '/sign-in/hardware-key?reason=hardware_key_required'],
    ['terms_required', REFUSALS.terms_required, '/terms'],
    ['maintenance', REFUSALS.maintenance, '/maintenance'],
  ] as const)('sends %s where a page’s refusal goes, whatever the route’s page', async (_name, outcome, target) => {
    expect(await redirected(await fetchDownload(answering(letterRoute, outcome), LETTER, NAVIGATION))).toBe(target);
    const noPage = answering({ ...letterRoute, returnTo: null }, outcome);
    expect(await redirected(await fetchDownload(noPage, LETTER, NAVIGATION))).toBe(target);
  });

  it('carries the cookies the request wrote, private and never cached', async () => {
    const ended = answering(letterRoute, (request): Outcome<Download> => {
      request.cookies.delete('tp_session');
      return REFUSALS.unauthenticated;
    });
    const response = await fetchDownload(ended, LETTER, { ...NAVIGATION, cookie: 'tp_session=v1.synthetic' });
    expect(response.headers.getSetCookie()).toEqual(['tp_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0']);
    expect(await redirected(response)).toBe('/sign-in?reason=idle');
  });

  it('names each refused field once, a parameter name only, at most eight', async () => {
    const issues = ['codes', 'codes', 'versionId', 'lines.0.code', 'Codes', '1x', 'a'.repeat(41), 'x-y', ...'abcdefghij'].map((field) => ({ field, message: 'a message is never carried' }));
    const location = await redirected(await fetchDownload(answering(letterRoute, { status: 'invalid', issues }), LETTER, NAVIGATION));
    const fields = new URL(location, ORIGIN).searchParams.get('fields')?.split(',');
    expect(fields).toEqual(['codes', 'versionId', 'a', 'b', 'c', 'd', 'e', 'f']);
    expect(fields).toHaveLength(MAX_REFUSED_FIELDS);
    expect(location).not.toContain('carried');
  });

  it('says the wait in whole minutes, one to a day', async () => {
    const retry = async (retryAfterSeconds: number) =>
      new URL(await redirected(await fetchDownload(answering(letterRoute, { status: 'rate_limited', retryAfterSeconds }), LETTER, NAVIGATION)), ORIGIN).searchParams.get('retry');
    expect([await retry(1), await retry(60), await retry(61), await retry(86_400), await retry(10_000_000), await retry(Number.NaN)]).toEqual(['1', '1', '2', '1440', '1440', '1440']);
  });

  it('refuses through the wrapper: the domain’s refusal of the codes and a malformed ID, with no session needed', async () => {
    const refusing: Route<Download> = publicRoute({
      id: 'test.refusing_letter',
      kind: 'handler',
      path: '/p/[practiceId]/coverage/letter',
      phi: false,
      params: z.object({ practiceId: opaqueId }),
      returnTo: letterRoute.returnTo ?? undefined,
      handle: () => Promise.reject(new InputError([{ field: 'codes', message: 'procedure codes of five letters or digits, separated by commas' }])),
    });
    const location = await redirected(await fetchDownload(refusing, `/p/${PRACTICE}/coverage/letter?payer=${PAYER}&codes=ABC`, NAVIGATION));
    expect(location).toBe(`/p/${PRACTICE}/coverage?refused=invalid&fields=codes&payer=${PAYER}&codes=ABC`);
    // A path parameter that is no opaque ID is not found before any session is read, and names no page.
    expect(await redirected(await fetchDownload(letterRoute, `/p/SYN-1/coverage/letter?payer=${PAYER}`, NAVIGATION, { practiceId: 'SYN-1' }))).toBe('/');
    const gone: Route<Download> = publicRoute({
      id: 'test.gone',
      kind: 'handler',
      path: '/p/[practiceId]/reports/[reportId]/csv',
      phi: false,
      params: z.object({}),
      returnTo: reportRoute.returnTo ?? undefined,
      handle: () => Promise.reject(new NotFoundError()),
    });
    expect(await redirected(await fetchDownload(gone, `/p/${PRACTICE}/reports/${REPORT}/csv`, NAVIGATION, { practiceId: PRACTICE, reportId: REPORT }))).toBe(`/p/${PRACTICE}/reports/${REPORT}?refused=not_found`);
  });

  it('returns a link’s refusal to the page it was on, from its closed ?from=, and to the route’s default for anything else (R05)', async () => {
    const forbidden = answering(reportRoute, REFUSALS.forbidden);
    const params = { practiceId: PRACTICE, reportId: REPORT };
    const at = async (query: string) => redirected(await fetchDownload(forbidden, `/p/${PRACTICE}/reports/${REPORT}/csv${query}`, NAVIGATION, params));
    expect(await at('?from=list')).toBe(`/p/${PRACTICE}/reports?refused=forbidden`);
    expect(await at('')).toBe(`/p/${PRACTICE}/reports/${REPORT}?refused=forbidden`);
    expect(await at('?from=evil')).toBe(`/p/${PRACTICE}/reports/${REPORT}?refused=forbidden`);
    expect(await at('?from=list&from=review')).toBe(`/p/${PRACTICE}/reports/${REPORT}?refused=forbidden`);
  });

  it('keeps a month only when the monthly page takes it, so a bad month returns to the page without it (R07)', async () => {
    const refused = answering(monthlyRoute, REFUSALS.not_found);
    expect(await redirected(await fetchDownload(refused, `/p/${PRACTICE}/reports/monthly/csv?month=2026-03`, NAVIGATION))).toBe(`/p/${PRACTICE}/reports/monthly?refused=not_found&month=2026-03`);
    for (const month of ['2026-13', '2026-3', '1950-01-01', 'March', '2026-03%0D%0ASet-Cookie:%20x=y']) {
      expect(await redirected(await fetchDownload(refused, `/p/${PRACTICE}/reports/monthly/csv?month=${month}`, NAVIGATION))).toBe(`/p/${PRACTICE}/reports/monthly?refused=not_found`);
    }
  });
});

describe('a script’s refused download (DLR-02)', () => {
  const SCRIPTS: readonly (readonly [string, Readonly<Record<string, string>>])[] = [
    ['a fetch() (mode cors)', { 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty', 'sec-fetch-site': 'same-origin', accept: '*/*' }],
    ['a same-origin fetch() asking for HTML', { 'sec-fetch-mode': 'same-origin', 'sec-fetch-dest': 'empty', accept: 'text/html' }],
    ['a download link or “Save link as” (navigate, Dest empty)', { ...NAVIGATION, 'sec-fetch-dest': 'empty' }],
    ['a frame', { ...NAVIGATION, 'sec-fetch-dest': 'iframe' }],
    ['no Fetch Metadata and Accept */* (curl, Playwright’s request API)', { accept: '*/*' }],
    ['no Fetch Metadata and JSON first', { accept: 'application/json, text/html' }],
    ['no Fetch Metadata and HTML ranked below JSON', { accept: 'text/html;q=0.5, application/json' }],
    ['no Fetch Metadata and HTML ranked below the wildcard', { accept: 'text/html;q=0.8, */*' }],
    ['no Fetch Metadata and the wildcard first at the same weight', { accept: '*/*, text/html' }],
    ['no Fetch Metadata and HTML refused', { accept: 'text/html;q=0' }],
    ['no Fetch Metadata and any text', { accept: 'text/*' }],
    ['no Accept at all', {}],
  ];

  it.each(SCRIPTS)('%s: not a navigation', (_name, headers) => {
    expect(isNavigation(new Request(ORIGIN, { headers }))).toBe(false);
  });

  it.each([
    ['a link or a GET form', NAVIGATION],
    ['navigate with no destination named', { 'sec-fetch-mode': 'navigate' }],
    ['no Fetch Metadata and a browser’s Accept', { accept: NAVIGATION.accept }],
    ['no Fetch Metadata and HTML above JSON', { accept: 'TEXT/HTML, application/json;q=0.9' }],
    ['no Fetch Metadata and HTML first at the wildcard’s weight', { accept: 'text/html, */*' }],
  ] as const)('%s: a navigation', (_name, headers) => {
    expect(isNavigation(new Request(ORIGIN, { headers }))).toBe(true);
  });

  it.each(SCRIPTS)('%s: every refusal is today’s JSON outcome and status, byte for byte', async (_name, headers) => {
    for (const outcome of Object.values(REFUSALS)) {
      const response = await fetchDownload(answering(letterRoute, outcome), `/p/${PRACTICE}/coverage/letter?payer=${PAYER}`, headers);
      const before = outcomeResponse(outcome, new ResponseCookies(null));
      expect(response.status, outcome.status).toBe(before.status);
      expect([...response.headers], outcome.status).toEqual([...before.headers]);
      expect(await response.text(), outcome.status).toBe(await before.text());
    }
  });

  it('serves a success as the same attachment to a navigation and a script', async () => {
    const served = answering(letterRoute, { status: 'ok', data: FILE });
    for (const headers of [NAVIGATION, { accept: '*/*' }]) {
      const response = await fetchDownload(served, `/p/${PRACTICE}/coverage/letter?payer=${PAYER}`, headers);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-disposition')).toBe(`attachment; filename="request-to-payer-${PAYER}.txt"`);
      expect(response.headers.get('cache-control')).toBe(PRIVATE_NO_STORE);
      expect(await response.text()).toBe(FILE.download.body);
    }
  });

  it.each(['HEAD', 'POST'])('refuses a navigation’s %s with 405 before the route runs', async (method) => {
    let ran = 0;
    const counted = answering(letterRoute, () => {
      ran += 1;
      return { status: 'ok', data: FILE };
    });
    const response = await downloadHandler(counted, () => services)(new Request(`${ORIGIN}/p/${PRACTICE}/coverage/letter`, { method, headers: NAVIGATION, ...(method === 'POST' ? { body: '{}' } : {}) }));
    expect(response.status).toBe(405);
    expect(response.headers.get('location')).toBeNull();
    expect(ran).toBe(0);
  });
});

describe('every download route has a safe page (DLR-03)', () => {
  const HOSTILE_PATHS = [
    '//evil.example',
    '//evil.example/p',
    '/\\evil.example',
    '\\\\evil.example',
    'javascript:alert(1)',
    'https://evil.example/p',
    '/%2F%2Fevil.example',
    '/%2f%2fevil.example',
    '/p/\u0000',
    '/p\r\nSet-Cookie: tp_session=x',
    '/p/ x',
    '/p/../../evil',
    '/p/./coverage',
    '/p?x=1',
    '/p#x',
    '/p/:x',
    '/p@evil.example',
    ' /p',
    '',
    '/',
  ];

  it.each(HOSTILE_PATHS)('sends a navigation to / when the route names %j', async (hostile) => {
    expect(safeReturnPath(hostile, ORIGIN)).toBe(false);
    const route = answering({ ...letterRoute, returnTo: () => ({ path: hostile }) }, REFUSALS.not_found);
    expect(await redirected(await fetchDownload(route, `/p/${PRACTICE}/coverage/letter`, NAVIGATION))).toBe('/');
  });

  it('sends a navigation to / when the route names no page, has no returnTo, or its returnTo throws', async () => {
    const thrown = answering(
      {
        ...letterRoute,
        returnTo: () => {
          throw new Error('a return page that cannot be built');
        },
      },
      REFUSALS.forbidden,
    );
    for (const route of [answering({ ...letterRoute, returnTo: () => null }, REFUSALS.forbidden), answering({ ...letterRoute, returnTo: null }, REFUSALS.forbidden), thrown]) {
      expect(await redirected(await fetchDownload(route, `/p/${PRACTICE}/coverage/letter`, NAVIGATION))).toBe('/');
    }
  });

  it.each([
    ['//evil.example'],
    ['/\\evil'],
    ['javascript:alert(1)'],
    ['%2F%2Fevil.example'],
    ['..'],
    [`${PRACTICE}/../../evil`],
    [`${PRACTICE}\u0000`],
    ['SYN-0000000001'],
    [PRACTICE.replaceAll('-', '')],
  ])('builds no page from the path parameter %j: it is no opaque ID', async (practiceId) => {
    expect(pagePath('/p/[practiceId]/coverage', { practiceId })).toBeNull();
    const route = answering(letterRoute, REFUSALS.not_found);
    expect(await redirected(await fetchDownload(route, `/p/x/coverage/letter`, NAVIGATION, { practiceId }))).toBe('/');
  });

  it('builds a page from opaque IDs, lowercased, and refuses a template that is not route words and [id] parameters', () => {
    expect(pagePath('/p/[practiceId]/reports/[reportId]', { practiceId: PRACTICE.toUpperCase(), reportId: REPORT })).toBe(`/p/${PRACTICE}/reports/${REPORT}`);
    expect(pagePath('/p/[practiceId]/reports/[reportId]', { practiceId: PRACTICE })).toBeNull();
    for (const template of ['p/[practiceId]', '/', '//evil.example/[practiceId]', '/p/[practiceId]/Coverage', '/p/[practiceId]/a b', '/p/[practiceId]/x?y=1']) {
      expect(() => pagePath(template, { practiceId: PRACTICE }), template).toThrow(Error);
    }
  });

  it('keeps only validated values, under lowercase names that are not the refusal’s, and never an identifier’s shape', async () => {
    const keeping = (keep: Readonly<Record<string, string>>): Route<Download> => answering({ ...letterRoute, returnTo: () => ({ path: `/p/${PRACTICE}/coverage`, keep }) }, REFUSALS.not_found);
    const location = await redirected(
      await fetchDownload(
        keeping({ refused: 'forbidden', fields: 'x', retry: '9', Payer: PAYER, 'a.b': 'c', codes: '97110\r\nSet-Cookie: x', month: '2026-03', ssn: '123456789', dob: '1950-01-01', phone: '919 555 0100', email: 'twin@synthetic.test' }),
        `/p/${PRACTICE}/coverage/letter`,
        NAVIGATION,
      ),
    );
    expect(location).toBe(`/p/${PRACTICE}/coverage?refused=not_found&codes=97110%0D%0ASet-Cookie%3A+x&month=2026-03`);
  });

  it('keeps the codes as typed only within their alphabet and length, and IDs and months only when the page’s schema takes them (R07, R08)', () => {
    expect(['ABC', ' 97110, 97530 ', 'g0283;97110', '971100', 'abcdefghij'].map(keptCodes)).toEqual(['ABC', '97110, 97530', 'g0283;97110', '971100', 'abcdefghij']);
    expect(['', '   ', 'abcdefghijk', '97110-59', 'Call 555-0100', '<b>x</b>', 'ſ9711', `${'97110,'.repeat(66)}97110`, undefined].map(keptCodes)).toEqual(Array.from({ length: 9 }, () => undefined));
    expect([PAYER.toUpperCase(), 'SYN-1', '', undefined].map(keptId)).toEqual([PAYER, undefined, undefined, undefined]);
    expect(['2026-03', ' 2026-12 ', '2026-13', '2026-00', '26-03', undefined].map(keptMonth)).toEqual(['2026-03', '2026-12', undefined, undefined, undefined, undefined]);
    expect(returnPage('/p/[practiceId]/coverage', { practiceId: PRACTICE }, { payer: undefined, codes: undefined })).toEqual({ path: `/p/${PRACTICE}/coverage` });
    expect(cameFrom({ from: 'review' }, ['list', 'review'])).toBe('review');
    expect(cameFrom({ from: 'constructor' }, ['list', 'review'])).toBeUndefined();
  });

  it('reads back only the closed codes: an unknown code, a malformed field, an out-of-range wait or a repeated key is ignored', () => {
    expect(downloadRefusal({ refused: 'invalid', fields: 'codes,contract' })).toEqual({ status: 'invalid', fields: ['codes', 'contract'], retryMinutes: null });
    expect(downloadRefusal({ refused: 'invalid', fields: 'codes,<script>,lines.0.code,Codes,codes,,%20' })).toEqual({ status: 'invalid', fields: ['codes'], retryMinutes: null });
    expect(downloadRefusal({ refused: 'invalid', fields: 'x'.repeat(401) })).toEqual({ status: 'invalid', fields: [], retryMinutes: null });
    expect(downloadRefusal({ refused: 'rate_limited', retry: '3', fields: 'codes' })).toEqual({ status: 'rate_limited', fields: [], retryMinutes: 3 });
    for (const retry of ['0', '1441', '1.5', '-1', 'abc', ' 3', '99999']) {
      expect(downloadRefusal({ refused: 'rate_limited', retry }), retry).toEqual({ status: 'rate_limited', fields: [], retryMinutes: null });
    }
    expect(downloadRefusal({ refused: 'not_found', retry: '3' })).toEqual({ status: 'not_found', fields: [], retryMinutes: null });
    for (const refused of ['evil', 'ok', 'unauthenticated', 'INVALID', 'Your account is locked. Call 555-0100.', '']) {
      expect(downloadRefusal({ refused }), refused).toBeNull();
    }
    expect(downloadRefusal({ refused: ['invalid', 'forbidden'] })).toBeNull();
    expect(downloadRefusal({})).toBeNull();
    expect(downloadRefusal(undefined)).toBeNull();
  });

  it('reads back what the 303 wrote, for every refusal', () => {
    const page: ReturnPage = { path: `/p/${PRACTICE}/coverage`, keep: { payer: PAYER } };
    for (const status of DOWNLOAD_REFUSALS) {
      const location = located(refusalLocation(REFUSALS[status], page, ORIGIN));
      expect(downloadRefusal(Object.fromEntries(new URL(location, ORIGIN).searchParams))).toEqual({
        status,
        fields: status === 'invalid' ? ['codes'] : [],
        retryMinutes: status === 'rate_limited' ? 3 : null,
      });
    }
  });
});

const APP = path.resolve(import.meta.dirname, '../../app');
const SAMPLE_ID = '0b6e2a7c-3f4d-4e5a-8b9c-1d2e3f4a5b01';

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]));
}

/** Every route.ts in src/app that serves a download, and the identifier it hands downloadHandler. */
const DOWNLOAD_FILES = files(APP)
  .filter((file) => path.basename(file) === 'route.ts')
  .flatMap((file) => [...readFileSync(file, 'utf8').matchAll(/downloadHandler\(\s*(\w+)/g)].map((match) => [path.relative(APP, file), match[1] ?? ''] as const));

function urlOf(file: string): string {
  return `/${path.dirname(file).split(path.sep).join('/')}`;
}

describe('every download route declares its page (R01: the registry test refuses one without)', () => {
  it('finds the download routes', () => {
    expect(DOWNLOAD_FILES.length).toBeGreaterThanOrEqual(15);
  });

  it.each(DOWNLOAD_FILES)('%s: downloadHandler(%s) serves a registered route whose page is on the origin for its own IDs, and / for hostile ones', async (file, name) => {
    const source = readFileSync(path.join(APP, file), 'utf8');
    const from = new RegExp(`import \\{[^}]*\\b${name}\\b[^}]*\\} from '([^']+)'`).exec(source)?.[1];
    expect(from, `${file} imports ${name}`).toBeDefined();
    const exported = (await import(path.resolve(APP, path.dirname(file), from ?? ''))) as Readonly<Record<string, unknown>>;
    const route = exported[name] as Route<Download>;
    expect(registry.ROUTES, `${name} is in the registry`).toContain(route);
    expect(route.path).toBe(urlOf(file));
    expect(route.returnTo, `${route.id} declares no returnTo: a refused navigation would land on /`).not.toBeNull();
    const names = [...route.path.matchAll(/\[(\w+)\]/g)].map((match) => match[1] ?? '');
    const own = Object.fromEntries(names.map((param) => [param, SAMPLE_ID]));
    const page = route.returnTo?.(own) ?? null;
    expect(page, `${route.id}: its page for its own IDs`).not.toBeNull();
    expect(safeReturnPath(page?.path ?? '', ORIGIN), page?.path).toBe(true);
    expect(page?.path, `${route.id}: its page is a page of the same practice`).toMatch(route.path.startsWith('/p/') ? new RegExp(`^/p/${SAMPLE_ID}(/|$)`) : /^\/console\//);
    const refused = answering(route, REFUSALS.forbidden);
    const location = await redirected(await fetchDownload(refused, route.path.replace(/\[\w+\]/g, SAMPLE_ID), NAVIGATION, own));
    expect(location.startsWith(`${page?.path ?? ''}?refused=forbidden`)).toBe(true);
    for (const hostile of ['//evil.example', '/\\evil', 'javascript:alert(1)', '%2F%2Fevil.example', 'SYN-1']) {
      const params = Object.fromEntries(names.map((param) => [param, hostile]));
      const landed = await redirected(await fetchDownload(refused, route.path.replace(/\[\w+\]/g, 'x'), { ...NAVIGATION }, params));
      expect(names.length === 0 || landed === '/', `${route.id} with ${hostile}`).toBe(true);
    }
  });
});

/** A seeded generator (mulberry32), so a failing case is the same on every run. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const ASCII = [...'abgxzABGXZ0123456789'];
/** Letters whose case mapping is ASCII, or whose case folding is: the long s, the sharp s, the dotless i, the ff ligature, the Kelvin sign. */
const CASE_MAPPED = ['ſ', 'ß', 'ı', 'ﬀ', 'K'];
/** The separators the route splits at, among them Unicode spaces (no-break, em, ideographic) and a tab. */
const SEPARATORS = [' ', ',', ';', '\t', ' ', ' ', '　'];

describe('the letter’s codes field (R06; DLR-03)', () => {
  const pattern = new RegExp(`^(?:${LETTER_CODES_PATTERN})$`, 'v');
  /** What the browser lets through: the field's pattern and its maxLength. */
  const browser = (value: string) => pattern.test(value) && value.length <= 400;
  /** What the route accepts: its params schema (trimmed, at most 400 characters) and letterCodes on the split value. */
  const route = (value: string) => {
    const trimmed = value.trim();
    if (trimmed.length > 400) {
      return false;
    }
    try {
      letterCodes(trimmed.split(/[\s,;]+/));
      return true;
    } catch {
      return false;
    }
  };

  it.each(['', ',', ' ', '97110', '97110, 97530', 'g0283;\t97110', '97110 97530', '97110　; 97530', 'ſ9711', 'ßAB1', 'ı9711', 'ﬀ971', 'K9711', 'ABC', '97110,9753', `${'97110,'.repeat(66)}97110`])(
    'agrees with the route on %j',
    (value) => {
      expect(browser(value)).toBe(route(value));
    },
  );

  it('agrees with the route on 20,000 strings of letters, digits, case-mapped letters and separators (seeded)', () => {
    const random = seeded(20_261_027);
    const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
    const run = (length: number, from: readonly string[]) => Array.from({ length }, () => pick(from)).join('');
    let accepted = 0;
    for (let index = 0; index < 20_000; index += 1) {
      let value: string;
      if (random() < 0.2) {
        value = run(Math.floor(random() * 16), [...ASCII, ...CASE_MAPPED, ...SEPARATORS]);
      } else {
        const tokens = Array.from({ length: Math.floor(random() * 5) }, () => Array.from({ length: pick([4, 5, 5, 5, 5, 6]) }, () => (random() < 0.92 ? pick(ASCII) : pick(CASE_MAPPED))).join(''));
        const edge = () => (random() < 0.3 ? run(1 + Math.floor(random() * 2), SEPARATORS) : '');
        value = edge() + tokens.reduce((joined, token, at) => (at === 0 ? token : `${joined}${run(1 + Math.floor(random() * 2), SEPARATORS)}${token}`), '') + edge();
      }
      expect(browser(value), JSON.stringify(value)).toBe(route(value));
      accepted += route(value) ? 1 : 0;
    }
    // Both sides of the rule are drawn often enough to mean something.
    expect(accepted).toBeGreaterThan(2_000);
    expect(accepted).toBeLessThan(18_000);
  });
});
