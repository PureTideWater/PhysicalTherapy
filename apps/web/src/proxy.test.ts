import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it } from 'vitest';

import { ATTRIBUTION_COOKIE } from './lib/http/attribution';
import { proxy } from './proxy';

/**
 * The proxy's one cookie (audit #57; the founder's ruling of 2026-10-20, decision 11; docs/adr/0062): pw_first_touch,
 * set on a page GET whose URL carries campaign codes or a paid click when the browser has none yet, HttpOnly,
 * SameSite=Lax, 30 days, Secure on https, holding the codes and the kind of click, never a click ID; never on /api or
 * Next's assets, and never over one already set (the first visit wins). The Content-Security-Policy is set as before.
 * SYNTHETIC values.
 */

const ORIGIN = process.env.APP_ORIGIN;
const ENVIRONMENT = process.env.TP_ENVIRONMENT;

afterEach(() => {
  for (const [name, value] of [
    ['APP_ORIGIN', ORIGIN],
    ['TP_ENVIRONMENT', ENVIRONMENT],
  ] as const) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
});

function request(path: string, options: { readonly method?: string; readonly cookie?: string; readonly origin?: string } = {}): NextRequest {
  const headers = new Headers();
  if (options.cookie !== undefined) {
    headers.set('cookie', options.cookie);
  }
  return new NextRequest(new URL(path, options.origin ?? 'http://localhost:3000'), { method: options.method ?? 'GET', headers });
}

const setCookie = (response: Response) => response.headers.get('set-cookie');

describe('the proxy', () => {
  it('sets the attribution cookie once, from the landing URL, with the codes and the kind of click, never the click ID', () => {
    delete process.env.APP_ORIGIN;
    const response = proxy(request('/screening?utm_source=Newsletter&utm_medium=email&utm_campaign=Fall+Launch&gclid=SYNTHETICCLICK123'));
    const cookie = setCookie(response) ?? '';
    expect(cookie).toMatch(new RegExp(`^${ATTRIBUTION_COOKIE}=`));
    expect(decodeURIComponent(cookie)).toContain('s=newsletter&m=email&c=fall-launch&k=paid_search');
    expect(cookie).not.toContain('SYNTHETICCLICK123');
    expect(cookie).toMatch(/Max-Age=2592000/i);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    // Over plain http in development, not Secure.
    expect(cookie).not.toMatch(/Secure/i);
    expect(response.headers.get('content-security-policy')).toContain("default-src 'self'");
  });

  it('marks it Secure on https', () => {
    process.env.APP_ORIGIN = 'https://app.synthetic.test';
    expect(setCookie(proxy(request('/request-audit?utm_source=apta', { origin: 'https://app.synthetic.test' })))).toMatch(/Secure/i);
  });

  it('never overwrites one already set: the first visit wins', () => {
    expect(setCookie(proxy(request('/screening?utm_source=search', { cookie: `${ATTRIBUTION_COOKIE}=s%3Dnewsletter` })))).toBeNull();
  });

  it('never sets it on /api, Next’s assets, a POST, or a URL with no attribution', () => {
    expect(setCookie(proxy(request('/api/screening/opened?utm_source=x', { method: 'POST' })))).toBeNull();
    expect(setCookie(proxy(request('/api/health?utm_source=x')))).toBeNull();
    expect(setCookie(proxy(request('/_next/data/build/screening.json?utm_source=x')))).toBeNull();
    expect(setCookie(proxy(request('/screening?utm_source=x', { method: 'POST' })))).toBeNull();
    expect(setCookie(proxy(request('/screening')))).toBeNull();
    expect(setCookie(proxy(request('/screening?utm_source=jane.doe%40synthetic.test')))).toBeNull();
    // A code with an identifier's shape sets nothing either: a member ID, a date of birth, a phone number.
    expect(setCookie(proxy(request('/screening?utm_source=mbr123456789&utm_campaign=1980-04-12&utm_medium=555-867-5309')))).toBeNull();
  });

  it('sets no attribution cookie on a production server until the cookie’s review is recorded (docs/product/legal-surfaces.md)', () => {
    process.env.TP_ENVIRONMENT = 'production';
    expect(setCookie(proxy(request('/screening?utm_source=newsletter&utm_medium=email')))).toBeNull();
    process.env.TP_ENVIRONMENT = 'staging';
    expect(setCookie(proxy(request('/screening?utm_source=newsletter&utm_medium=email')))).toMatch(/^pw_first_touch=/);
  });
});
