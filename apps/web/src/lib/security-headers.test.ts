import { describe, expect, it } from 'vitest';

import config from '../../next.config';
import { APP_ROUTE_SOURCE, NO_STORE, contentSecurityPolicy, headerRules, securityHeaders } from './security-headers';

function header(name: string, development = false): string | undefined {
  return securityHeaders(development).find((entry) => entry.key === name)?.value;
}

/** Next matches `source` with path-to-regexp; the app-route pattern is a plain regular expression. */
const appRoute = new RegExp(`^${APP_ROUTE_SOURCE}$`);

describe('securityHeaders', () => {
  it('sets the browser hardening headers', () => {
    expect(header('X-Frame-Options')).toBe('DENY');
    expect(header('X-Content-Type-Options')).toBe('nosniff');
    expect(header('Referrer-Policy')).toBe('no-referrer');
    expect(header('Strict-Transport-Security')).toBe('max-age=63072000; includeSubDomains');
    expect(header('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(header('Permissions-Policy')).toContain('camera=()');
  });

  it('keeps every source same-origin and forbids framing', () => {
    const csp = contentSecurityPolicy(false);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("font-src 'self'");
    expect(csp).not.toMatch(/https?:/);
    expect(csp).not.toContain('unsafe-eval');
  });

  it("allows 'unsafe-eval' in development only", () => {
    expect(contentSecurityPolicy(true)).toContain("'unsafe-eval'");
    expect(header('Content-Security-Policy', true)).toContain("'unsafe-eval'");
  });
});

describe('Cache-Control on app routes', () => {
  it.each(['/', '/dashboard', '/cases', '/api/anything', '/sign-in'])('applies to %s', (path) => {
    expect(appRoute.test(path)).toBe(true);
  });

  it.each(['/_next/static/chunks/app.js', '/_next/image', '/favicon.ico'])('skips the build asset %s', (path) => {
    expect(appRoute.test(path)).toBe(false);
  });

  it('is private and never stored', () => {
    const rule = headerRules(false).find((entry) => entry.source === APP_ROUTE_SOURCE);
    expect(rule?.headers).toEqual([{ key: 'Cache-Control', value: NO_STORE }]);
    expect(NO_STORE).toBe('private, no-store');
  });
});

describe('next.config', () => {
  it('serves the header rules and hides the framework banner', async () => {
    expect(config.poweredByHeader).toBe(false);
    expect(await config.headers?.()).toEqual(headerRules(false));
  });

  it('compiles every workspace package the app imports', () => {
    expect(config.transpilePackages).toContain('@tp/ui');
    expect(config.transpilePackages).toContain('@tp/money');
  });
});
