import { type NextRequest, NextResponse } from 'next/server';

import { contentSecurityPolicy, newNonce, staticAssetOrigin, uploadOrigins } from './lib/http/security-headers';

/**
 * The per-request Content-Security-Policy with its nonce (docs/adr/0053; Next's guide: the nonce is read from
 * the request's own CSP header and attached to every script and style Next renders). Headers only: this proxy
 * never authorizes anything, reads no cookie and touches no database; every route still runs its own checks in
 * its handler and in Postgres (docs/adr/0017). The fixed security headers come from next.config.ts, so static
 * assets carry them too.
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
  return response;
}

export const config = {
  // Every page, action and route handler; static assets carry no script and keep the fixed headers alone.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
