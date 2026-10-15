export interface Header {
  readonly key: string;
  readonly value: string;
}

/**
 * Every route except build assets. Pages and route handlers can carry PHI, so none of them may be
 * cached by a browser or a shared cache (PRD section 15; .claude/rules/privacy-and-tenant.md).
 */
export const APP_ROUTE_SOURCE = '/((?!_next/static|_next/image|favicon\\.ico).*)';

export const NO_STORE = 'private, no-store';

/**
 * The content security policy. Scripts, styles, fonts and connections are same-origin only; there
 * are no third-party scripts, analytics, session replay or web fonts on any page. Next.js inlines
 * its bootstrap scripts and styles, hence 'unsafe-inline'; development adds 'unsafe-eval' for
 * React's debugging tools.
 */
export function contentSecurityPolicy(development: boolean): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'", ...(development ? ["'unsafe-eval'"] : [])],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'"],
    'connect-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };
  return Object.entries(directives)
    .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
    .join('; ');
}

/** Headers on every response, static assets included. */
export function securityHeaders(development: boolean): Header[] {
  return [
    { key: 'Content-Security-Policy', value: contentSecurityPolicy(development) },
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'no-referrer' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()' },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
    { key: 'X-DNS-Prefetch-Control', value: 'off' },
  ];
}

/** The `headers()` entries for next.config. */
export function headerRules(development: boolean): { source: string; headers: Header[] }[] {
  return [
    { source: '/:path*', headers: securityHeaders(development) },
    { source: APP_ROUTE_SOURCE, headers: [{ key: 'Cache-Control', value: NO_STORE }] },
  ];
}
