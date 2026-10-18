import { timingSafeEqual } from 'node:crypto';

import type { Sealer } from '../auth/seal';
import { cookieToken } from '../auth/tokens';

/**
 * CSRF protection on every mutation (milestone 11; docs/product/sessions.md: "CSRF protection on every mutation
 * ... arrive[s] with production readiness"; docs/adr/0053). Two checks, both in the route wrapper:
 *
 * - A token bound to the session: an HMAC of the session cookie's token under the server's key, which only this
 *   server can make and only for the browser that holds that cookie (HttpOnly, so no script reads it). Every
 *   form a page renders carries it in a hidden field (FormKeys), and every script's request sends it in its JSON
 *   body or the x-csrf-token header. A mutation without it, or with another session's, is refused.
 * - The request's origin: a browser names it in Origin (and Sec-Fetch-Site) on every POST and PUT; one naming any
 *   origin but the application's is refused, whether or not a session exists, which also keeps a sign-in step
 *   from being posted from another site (login CSRF). A request naming none (not a browser) still needs the
 *   token when it changes anything in a session.
 */

export const CSRF_FIELD = 'csrfToken';
export const CSRF_HEADER = 'x-csrf-token';

const PURPOSE = 'csrf';

/** The session's CSRF token, or null when the cookie holds no session token. */
export function csrfTokenFor(sealer: Sealer, sessionCookie: string | undefined): string | null {
  const token = cookieToken(sessionCookie);
  return token === undefined ? null : sealer.sign(PURPOSE, token).toString('base64url');
}

/** Whether the presented token is the session's own (compared in constant time). */
export function csrfTokenMatches(sealer: Sealer, sessionCookie: string | undefined, presented: unknown): boolean {
  const expected = csrfTokenFor(sealer, sessionCookie);
  if (expected === null || typeof presented !== 'string' || presented.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(presented), Buffer.from(expected));
}

export interface RequestOrigin {
  /** The Origin header, if sent. */
  readonly origin?: string | null;
  /** The Sec-Fetch-Site header, if sent. */
  readonly fetchSite?: string | null;
}

/**
 * Whether the request comes from the application's own pages: an Origin naming another origin (or "null", an
 * opaque origin), or a Sec-Fetch-Site other than same-origin (or none, a typed address), is refused; a request
 * naming neither is not a browser's and is left to the token.
 */
export function sameOrigin(request: RequestOrigin, appOrigin: string): boolean {
  const origin = request.origin ?? null;
  const site = request.fetchSite ?? null;
  if (origin !== null && origin !== new URL(appOrigin).origin) {
    return false;
  }
  return site === null || site === 'same-origin' || site === 'none';
}
