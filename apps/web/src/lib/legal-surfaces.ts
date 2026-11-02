/**
 * The legal surfaces still waiting for their review (docs/product/legal-surfaces.md, rows whose "Before" names any
 * production deploy), and what a production server does while one waits: it leaves a page's part out, keeps the
 * screening closed, or sets and reads no attribution cookie, so a draft commitment, or a practice not yet disclosed,
 * never reaches the public there before counsel or the security official has reviewed it. Every other environment
 * shows each in place, where it is read. The pull request that records a surface's review takes its row off the list
 * and its id out of here (tools/test/legal-surfaces.test.ts holds the two to each other, and each id to its gate).
 */

export type Environment = 'dev' | 'staging' | 'production';

/** The disclosure page's parts that carry a legal commitment (src/app/security/page.tsx leaves each out while it waits). */
export const DISCLOSURE_LEGAL_SURFACES = ['disclosure-response-times', 'good-faith-research'] as const;

/**
 * What the screening says is kept, on each of its surfaces (decisions 7, 17 and 18), and what it says about its mail
 * (audit #76; the founder's Q10 (a), Q11 (b) and Q12 of 2026-10-21: the paused page, and what the form answers about
 * the address): while any waits, a production server keeps the screening closed (src/lib/screening/routes.ts,
 * screeningOpen), so nothing is screened, and nothing kept, under wording counsel has not confirmed.
 */
export const SCREENING_LEGAL_SURFACES = [
  'screening-kept-result',
  'screening-kept-email',
  'screening-kept-closed-link',
  'screening-kept-upload',
  'screening-kept-sent',
  'screening-kept-convert',
  'screening-mail-paused',
  'screening-mail-address',
] as const;

/**
 * The first-party attribution cookie (decision 11): while it waits, a production server neither sets it (src/proxy.ts)
 * nor reads it (src/lib/http/attribution.ts, readAttribution), so no campaign code is kept from a visit before the
 * privacy notice discloses the cookie.
 */
export const ATTRIBUTION_LEGAL_SURFACES = ['attribution-cookie'] as const;

export const LEGAL_SURFACES_AWAITING_REVIEW: ReadonlySet<string> = new Set<string>([...DISCLOSURE_LEGAL_SURFACES, ...SCREENING_LEGAL_SURFACES, ...ATTRIBUTION_LEGAL_SURFACES]);

/** True when a server in `environment` shows the legal surface `id` (or does what it describes). */
export function showsLegalSurface(id: string, environment: Environment): boolean {
  return environment !== 'production' || !LEGAL_SURFACES_AWAITING_REVIEW.has(id);
}

/** True when every surface of a group may be shown in `environment`. */
export function showsLegalSurfaces(ids: readonly string[], environment: Environment): boolean {
  return ids.every((id) => showsLegalSurface(id, environment));
}

/**
 * The environment as the proxy sees it, which runs before the server's configuration is read: TP_ENVIRONMENT when it is
 * set, which a production server must set (src/lib/server/config.ts refuses to start without it, the end-to-end
 * build's local providers aside); otherwise production for a production build without the end-to-end providers, and
 * dev for the rest, as the configuration takes it.
 */
export function environmentFrom(env: Readonly<Record<string, string | undefined>>): Environment {
  const named = env.TP_ENVIRONMENT;
  if (named === 'dev' || named === 'staging' || named === 'production') {
    return named;
  }
  return env.NODE_ENV === 'production' && env.TP_ALLOW_LOCAL_PROVIDERS !== 'e2e' ? 'production' : 'dev';
}
