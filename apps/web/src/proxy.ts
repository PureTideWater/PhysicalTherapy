import { type NextRequest, NextResponse } from 'next/server';

import { ATTRIBUTION_COOKIE, ATTRIBUTION_MAX_AGE_SECONDS, firstTouch } from './lib/http/attribution';
import { contentSecurityPolicy, newNonce, staticAssetOrigin, uploadOrigins } from './lib/http/security-headers';

/**
 * The per-request Content-Security-Policy with its nonce (docs/adr/0053; Next's guide: the nonce is read from
 * the request's own CSP header and attached to every script and style Next renders), and the first-party
 * attribution cookie (docs/adr/0062, Outcomes, leads and attribution; the founder's ruling of 2026-10-20). This proxy
 * never authorizes anything and touches no database, and it reads and sets one cookie only, the attribution cookie:
 * on a page GET whose URL carries campaign codes or a paid click, and no such cookie yet, it sets pw_first_touch (30
 * days, the first visit wins; src/lib/http/attribution.ts) with the codes and the kind of click, never a click ID.
 * Every route still runs its own checks in its handler and in Postgres (docs/adr/0017). The fixed security headers
 * come from next.config.ts, so static assets carry them too.
 */
export function proxy(request: NextRequest): NextResponse {
  const policy = contentSecurityPolicy({
    nonce: newNonce(),
    development: process.env.NODE_ENV === 'development',
    uploadOrigins: uploadOrigins(process.env),
    https: (process.env.APP_ORIGIN ?? '').startsWith('https://'),
    // Checked at start (the server's configuration refuses anything but an https origin), and again here.
    staticOrigin: staticAssetOrigin(process.env),
  });
  const headers = new Headers(request.headers);
  headers.set('content-security-policy', policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('content-security-policy', policy);
  // The URL as the browser sent it (Next's nextUrl rewrites a /_next/data path to the page's).
  const touch = firstTouch({ method: request.method, url: new URL(request.url), hasCookie: request.cookies.has(ATTRIBUTION_COOKIE) });
  if (touch !== null) {
    response.cookies.set(ATTRIBUTION_COOKIE, touch, {
      maxAge: ATTRIBUTION_MAX_AGE_SECONDS,
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      // The load balancer ends TLS, so the application's origin says whether the browser's request was https.
      secure: request.nextUrl.protocol === 'https:' || (process.env.APP_ORIGIN ?? '').startsWith('https://'),
    });
  }
  return response;
}

export const config = {
  // Every page, action and route handler; static assets carry no script and keep the fixed headers alone.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
