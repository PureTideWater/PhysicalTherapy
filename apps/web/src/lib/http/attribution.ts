import { PAID_CLICKS, type PaidClick } from '@tp/db/runtime';

import type { CookieJar } from './route';

/**
 * Where a visitor came from (audit #57; the founder's ruling of 2026-10-20, decision 11; docs/adr/0062, Outcomes,
 * leads and attribution): one first-party cookie, pw_first_touch, set by the proxy (src/proxy.ts) on the first page a
 * visitor lands on with campaign codes or a paid click in its URL, kept 30 days, and never overwritten (the first
 * visit wins). It holds the three campaign codes a link carried (utm_source, utm_medium, utm_campaign), each
 * normalised and shape-checked here, and the kind of paid click (paid_search or paid_social) from the presence of an
 * advertiser's click-ID parameter: never the click ID's value, which stays in the URL. HttpOnly, SameSite=Lax, Secure
 * on https; no script reads it, no third party receives it, and nothing logs it. The screening and audit-request
 * handlers read it on the server and pass the four values to the database, which checks their shape again.
 */

export const ATTRIBUTION_COOKIE = 'pw_first_touch';

/** 30 days, in seconds. */
export const ATTRIBUTION_MAX_AGE_SECONDS = 2_592_000;

/** A campaign code as stored: the same shape every utm_* column's CHECK holds. */
export const CAMPAIGN_CODE = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/** The click-ID parameters whose presence names the kind of paid click; their values are never read. */
export const PAID_CLICK_PARAMETERS: Readonly<Record<PaidClick, readonly string[]>> = {
  paid_search: ['gclid', 'gbraid', 'wbraid', 'msclkid'],
  paid_social: ['fbclid', 'li_fat_id', 'ttclid', 'twclid'],
};

export interface Attribution {
  readonly source: string | null;
  readonly medium: string | null;
  readonly campaign: string | null;
  readonly click: PaidClick | null;
}

export const NO_ATTRIBUTION: Attribution = { source: null, medium: null, campaign: null, click: null };

/**
 * A campaign code as kept: lower-cased and trimmed, each run of white space or '+' turned into '-', then held to
 * CAMPAIGN_CODE; anything else (an email address, a name, a long or empty value) is dropped.
 */
export function normaliseCampaignCode(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  const code = raw.trim().toLowerCase().replace(/[\s+]+/g, '-');
  return CAMPAIGN_CODE.test(code) ? code : null;
}

/** The kind of paid click a URL's parameters carry, by a click-ID parameter's presence alone; search first. */
export function paidClickKind(parameters: URLSearchParams): PaidClick | null {
  for (const kind of PAID_CLICKS) {
    if (PAID_CLICK_PARAMETERS[kind].some((name) => parameters.has(name))) {
      return kind;
    }
  }
  return null;
}

/** What a landing URL says of where the visitor came from, or null when it carries no valid code and no paid click. */
export function attributionFromUrl(url: URL): Attribution | null {
  const attribution: Attribution = {
    source: normaliseCampaignCode(url.searchParams.get('utm_source')),
    medium: normaliseCampaignCode(url.searchParams.get('utm_medium')),
    campaign: normaliseCampaignCode(url.searchParams.get('utm_campaign')),
    click: paidClickKind(url.searchParams),
  };
  return attribution.source === null && attribution.medium === null && attribution.campaign === null && attribution.click === null ? null : attribution;
}

/** The cookie's value: s, m, c and k, URL-encoded; an absent one is left out. */
export function encodeAttribution(attribution: Attribution): string {
  const parameters = new URLSearchParams();
  const entries: readonly (readonly [string, string | null])[] = [
    ['s', attribution.source],
    ['m', attribution.medium],
    ['c', attribution.campaign],
    ['k', attribution.click],
  ];
  for (const [key, value] of entries) {
    if (value !== null) {
      parameters.set(key, value);
    }
  }
  return parameters.toString();
}

/** The cookie read back, every value checked again (a browser can send anything): what is not a code is dropped. */
export function decodeAttribution(value: string | null | undefined): Attribution {
  if (value === null || value === undefined || value === '' || value.length > 512) {
    return NO_ATTRIBUTION;
  }
  let parameters: URLSearchParams;
  try {
    parameters = new URLSearchParams(decodeURIComponent(value));
  } catch {
    return NO_ATTRIBUTION;
  }
  const code = (key: string) => {
    const raw = parameters.get(key);
    return raw !== null && CAMPAIGN_CODE.test(raw) ? raw : null;
  };
  const click = parameters.get('k');
  return { source: code('s'), medium: code('m'), campaign: code('c'), click: (PAID_CLICKS as readonly string[]).includes(click ?? '') ? (click as PaidClick) : null };
}

/** The visitor's attribution, from the request's cookie (none when it is absent or unreadable). */
export function readAttribution(cookies: CookieJar): Attribution {
  return decodeAttribution(cookies.get(ATTRIBUTION_COOKIE));
}

/** The four values a submission passes to the database, in its order: source, medium, campaign and the kind of paid click. */
export function attributionValues(attribution: Attribution): readonly [string | null, string | null, string | null, PaidClick | null] {
  return [attribution.source, attribution.medium, attribution.campaign, attribution.click];
}

/**
 * Whether the proxy sets the cookie for this request: a page GET (not Next's assets and not /api), with no cookie
 * yet, whose URL carries attribution. The value to set, or null.
 */
export function firstTouch(request: { readonly method: string; readonly url: URL; readonly hasCookie: boolean }): string | null {
  if (request.method !== 'GET' || request.hasCookie) {
    return null;
  }
  const { pathname } = request.url;
  if (pathname === '/_next' || pathname.startsWith('/_next/') || pathname === '/api' || pathname.startsWith('/api/')) {
    return null;
  }
  const attribution = attributionFromUrl(request.url);
  return attribution === null ? null : encodeAttribution(attribution);
}
