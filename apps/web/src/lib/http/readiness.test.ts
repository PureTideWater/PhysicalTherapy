import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { Sealer } from '../auth/seal';
import { newToken } from '../auth/tokens';
import { csrfTokenFor, csrfTokenMatches, sameOrigin } from './csrf';
import { formInput } from './form';
import { type Limit, RATE_BUCKETS, RATE_LIMITS, clientAddress, rateSubjectHash, retryMinutes } from './rate-limit';
import { STATIC_SECURITY_HEADERS, contentSecurityPolicy, newNonce, uploadOrigins } from './security-headers';
import { overallStatus } from '../routes/support';

/** The pure parts of production readiness (docs/adr/0053): CSRF tokens and origins, rate-limit subjects, and the security headers. */

describe('the CSRF token', () => {
  const sealer = new Sealer(randomBytes(32));
  const session = newToken();

  it('is bound to the session: the same for its cookie, another for another session, none without one', () => {
    const token = csrfTokenFor(sealer, session);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(csrfTokenFor(sealer, session)).toBe(token);
    expect(csrfTokenFor(sealer, newToken())).not.toBe(token);
    expect(csrfTokenFor(new Sealer(randomBytes(32)), session)).not.toBe(token);
    expect(csrfTokenFor(sealer, undefined)).toBeNull();
    expect(csrfTokenFor(sealer, 'not a token')).toBeNull();
  });

  it('matches only the session’s own token', () => {
    const token = csrfTokenFor(sealer, session) ?? '';
    expect(csrfTokenMatches(sealer, session, token)).toBe(true);
    expect(csrfTokenMatches(sealer, newToken(), token)).toBe(false);
    expect(csrfTokenMatches(sealer, session, `${token.slice(0, -1)}A` === token ? `${token.slice(0, -1)}B` : `${token.slice(0, -1)}A`)).toBe(false);
    expect(csrfTokenMatches(sealer, session, token.slice(1))).toBe(false);
    expect(csrfTokenMatches(sealer, session, undefined)).toBe(false);
    expect(csrfTokenMatches(sealer, session, 42)).toBe(false);
    expect(csrfTokenMatches(sealer, undefined, token)).toBe(false);
  });
});

describe('the origin check', () => {
  const app = 'https://app.synthetic.test';

  it('admits the application’s own origin and a request that names none', () => {
    expect(sameOrigin({ origin: app, fetchSite: 'same-origin' }, app)).toBe(true);
    expect(sameOrigin({ origin: app }, `${app}/`)).toBe(true);
    expect(sameOrigin({}, app)).toBe(true);
    expect(sameOrigin({ fetchSite: 'none' }, app)).toBe(true);
  });

  it('refuses another origin, an opaque one, and a cross-site or same-site fetch', () => {
    expect(sameOrigin({ origin: 'https://attacker.example' }, app)).toBe(false);
    expect(sameOrigin({ origin: 'null' }, app)).toBe(false);
    expect(sameOrigin({ origin: 'http://app.synthetic.test' }, app)).toBe(false);
    expect(sameOrigin({ fetchSite: 'cross-site' }, app)).toBe(false);
    expect(sameOrigin({ origin: app, fetchSite: 'same-site' }, app)).toBe(false);
  });
});

describe('rate limits', () => {
  it('cover every bucket with at least one limit, each a positive count in a window of at most a day', () => {
    for (const bucket of RATE_BUCKETS) {
      const limits = Object.values(RATE_LIMITS[bucket]) as Limit[];
      expect(limits.length, bucket).toBeGreaterThan(0);
      for (const limit of limits) {
        expect(limit.hits).toBeGreaterThan(0);
        expect(limit.windowSeconds).toBeGreaterThan(0);
        expect(limit.windowSeconds).toBeLessThanOrEqual(86_400);
      }
    }
    // Sign-in, MFA, uploads, exports and mutations, per user and per address (milestone 11).
    expect(RATE_LIMITS.sign_in.address).toBeDefined();
    expect(RATE_LIMITS.mfa.address).toBeDefined();
    for (const bucket of ['mutation', 'upload', 'export'] as const) {
      expect(RATE_LIMITS[bucket].user, bucket).toBeDefined();
      expect(RATE_LIMITS[bucket].address, bucket).toBeDefined();
    }
    // The account limit stops a run of attempts after the ten-failure lockout, never before it.
    expect(RATE_LIMITS.sign_in.account?.hits).toBeGreaterThan(10);
  });

  it('store a subject as a keyed hash, never the address, email or user in clear', () => {
    const sealer = new Sealer(randomBytes(32));
    const hash = rateSubjectHash(sealer, 'sign_in', 'account', 'someone@synthetic.test');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain('synthetic');
    expect(rateSubjectHash(sealer, 'mfa', 'account', 'someone@synthetic.test')).not.toBe(hash);
    expect(rateSubjectHash(sealer, 'sign_in', 'address', 'someone@synthetic.test')).not.toBe(hash);
  });

  it('read the client’s address from the trusted proxies only', () => {
    expect(clientAddress('198.51.100.7', 0)).toBeNull();
    expect(clientAddress(null, 1)).toBeNull();
    expect(clientAddress('198.51.100.7', 1)).toBe('198.51.100.7');
    // The load balancer appends what it saw: a spoofed entry before it is ignored.
    expect(clientAddress('192.0.2.1, 203.0.113.9', 1)).toBe('203.0.113.9');
    expect(clientAddress('192.0.2.1, 203.0.113.9, 10.0.0.1', 2)).toBe('203.0.113.9');
    expect(clientAddress('2001:db8::1', 1)).toBe('2001:db8::1');
    expect(clientAddress('203.0.113.9', 2)).toBeNull();
    expect(clientAddress('not-an-address', 1)).toBeNull();
    expect(clientAddress(' , ', 1)).toBeNull();
  });

  it('say the wait in whole minutes, at least one', () => {
    expect(retryMinutes(1)).toBe(1);
    expect(retryMinutes(60)).toBe(1);
    expect(retryMinutes(61)).toBe(2);
    expect(retryMinutes(900)).toBe(15);
  });
});

describe('the security headers', () => {
  it('allow scripts and styles from this origin and the request’s nonce alone, and nothing framed or plugged in', () => {
    const nonce = newNonce();
    const policy = contentSecurityPolicy({ nonce, development: false, uploadOrigins: [], https: true });
    const directives = new Map(policy.split('; ').map((part) => [part.split(' ')[0], part.split(' ').slice(1)] as const));
    expect(directives.get('script-src')).toEqual(["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", 'https://js.stripe.com']);
    expect(directives.get('style-src')).toEqual(["'self'", `'nonce-${nonce}'`]);
    expect(directives.get('object-src')).toEqual(["'none'"]);
    expect(directives.get('frame-ancestors')).toEqual(["'none'"]);
    expect(directives.get('base-uri')).toEqual(["'self'"]);
    expect(directives.get('form-action')).toEqual(["'self'"]);
    expect(directives.has('upgrade-insecure-requests')).toBe(true);
    expect(policy).not.toContain('unsafe-inline');
    expect(policy).not.toContain('unsafe-eval');
  });

  it('allow eval only for the development server, upgrade only over https, and name the documents bucket for uploads', () => {
    expect(contentSecurityPolicy({ nonce: 'n', development: true, uploadOrigins: [], https: false })).toContain("'unsafe-eval'");
    expect(contentSecurityPolicy({ nonce: 'n', development: false, uploadOrigins: [], https: false })).not.toContain('upgrade-insecure-requests');
    expect(contentSecurityPolicy({ nonce: 'n', development: false, uploadOrigins: ['https://b.s3.us-east-1.amazonaws.com'], https: true })).toContain(
      "connect-src 'self' https://api.stripe.com https://b.s3.us-east-1.amazonaws.com",
    );
    expect(uploadOrigins({ DOCUMENTS_BUCKET: 'tp-production-documents', AWS_REGION: 'us-east-1' })).toEqual(['https://tp-production-documents.s3.us-east-1.amazonaws.com']);
    expect(uploadOrigins({ DOCUMENTS_BUCKET: 'tp-production-documents' })).toEqual(['https://tp-production-documents.s3.amazonaws.com']);
    expect(uploadOrigins({ DOCUMENTS_BUCKET: 'Not A Bucket', AWS_REGION: 'us-east-1' })).toEqual([]);
    expect(uploadOrigins({})).toEqual([]);
  });

  it('carry the full fixed set', () => {
    const names = STATIC_SECURITY_HEADERS.map((header) => header.key);
    expect(names).toEqual([
      'Strict-Transport-Security',
      'X-Content-Type-Options',
      'X-Frame-Options',
      'Referrer-Policy',
      'Permissions-Policy',
      'Cross-Origin-Opener-Policy',
      'Cross-Origin-Resource-Policy',
      'X-DNS-Prefetch-Control',
      'X-Permitted-Cross-Domain-Policies',
      'Origin-Agent-Cluster',
    ]);
    expect(STATIC_SECURITY_HEADERS.find((header) => header.key === 'Strict-Transport-Security')?.value).toMatch(/max-age=\d{8}/);
  });

  it('draw a fresh nonce each time', () => {
    const nonces = new Set(Array.from({ length: 50 }, () => newNonce()));
    expect(nonces.size).toBe(50);
    expect([...nonces][0]).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });
});

describe('form fields', () => {
  it('send a group of checkboxes as their checked values, comma-joined, and drop the framework’s own fields', () => {
    const form = new FormData();
    form.append('title', 'Slow uploads');
    form.append('components[]', 'uploads');
    form.append('components[]', 'jobs');
    form.append('$ACTION_ID_abc', 'x');
    form.append('document', new Blob(['%PDF-']), 'signed.pdf');
    expect(formInput(form)).toEqual({ title: 'Slow uploads', components: 'uploads,jobs' });
  });
});

describe('the status page', () => {
  it('heads with the worst status any component has', () => {
    expect(overallStatus([])).toBe('operational');
    expect(overallStatus([{ status: 'operational' }, { status: 'degraded' }, { status: 'maintenance' }])).toBe('degraded');
    expect(overallStatus([{ status: 'partial_outage' }, { status: 'major_outage' }, { status: 'degraded' }])).toBe('major_outage');
  });
});
