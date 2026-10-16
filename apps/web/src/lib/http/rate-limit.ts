import type { ScopeClient, ScopePool } from '@tp/db/runtime';

import type { Sealer } from '../auth/seal';

/**
 * Rate limits (milestone 11: "rate limits (per user and per IP on sign-in, MFA, uploads, exports and
 * mutations, stored in Postgres ...)"; docs/adr/0053). Each request a limit covers counts one hit for each of
 * its subjects (the signed-in user, the client's address, and for sign-in the account it names) in the
 * bucket's fixed window, in Postgres (rate_limit_take(), migration 20261030090000), so every web task shares
 * the counts. A subject is stored only as an HMAC under the server's key: never an address, an email or a user
 * ID in clear. The counting statement runs on its own, before the request's transaction, so a refused attempt
 * still counts. The WAF's own rate rules (ADR 0049) sit in front of these, per address only.
 *
 * The limits are the build's defaults (the plan names none): high enough that a person working fast never meets
 * them, low enough that guessing and scraping stop within a window.
 */

export type RateBucket = 'sign_in' | 'mfa' | 'mutation' | 'upload' | 'export' | 'public_form' | 'webhook';

export const RATE_BUCKETS: readonly RateBucket[] = ['sign_in', 'mfa', 'mutation', 'upload', 'export', 'public_form', 'webhook'];

export interface Limit {
  readonly hits: number;
  readonly windowSeconds: number;
}

export interface BucketLimits {
  /** Per signed-in user. */
  readonly user?: Limit;
  /** Per client address (when the trusted proxy names one). */
  readonly address?: Limit;
  /** Per account a sign-in step names (its email, or its pending step). */
  readonly account?: Limit;
}

export const RATE_LIMITS: Readonly<Record<RateBucket, BucketLimits>> = {
  // Below the WAF's 300 per five minutes on /sign-in; the account limit sits above the ten-failure lockout,
  // which locks first for a wrong password, and stops a run of attempts on a locked account.
  sign_in: { address: { hits: 30, windowSeconds: 300 }, account: { hits: 20, windowSeconds: 900 } },
  mfa: { address: { hits: 30, windowSeconds: 300 }, account: { hits: 10, windowSeconds: 300 } },
  mutation: { user: { hits: 120, windowSeconds: 60 }, address: { hits: 600, windowSeconds: 60 } },
  // A batch is at most 100 files (uploads/limits.ts), each one PUT; ten batches in ten minutes.
  upload: { user: { hits: 1200, windowSeconds: 600 }, address: { hits: 2400, windowSeconds: 600 } },
  export: { user: { hits: 60, windowSeconds: 600 }, address: { hits: 300, windowSeconds: 600 } },
  public_form: { address: { hits: 5, windowSeconds: 3600 } },
  webhook: { address: { hits: 1200, windowSeconds: 60 } },
};

export interface RateSubjects {
  readonly userId?: string;
  readonly address?: string | null;
  readonly account?: string | null;
}

export type RateVerdict = { readonly allowed: true } | { readonly allowed: false; readonly retryAfterSeconds: number };

/** A subject as stored: an HMAC of the bucket, the kind of subject and its value. */
export function rateSubjectHash(sealer: Sealer, bucket: RateBucket, kind: keyof BucketLimits, value: string): string {
  return sealer.sign('rate-limit', `${bucket}:${kind}:${value}`).toString('hex');
}

/**
 * Counts the request against each limit of the bucket it has a subject for, and refuses it when any is past
 * its limit, with the longest wait among them.
 */
export async function takeRateLimit(pool: ScopePool<ScopeClient>, sealer: Sealer, bucket: RateBucket, subjects: RateSubjects): Promise<RateVerdict> {
  const limits = RATE_LIMITS[bucket];
  const checks: { readonly subject: string; readonly limit: Limit }[] = [];
  const values: Readonly<Record<keyof BucketLimits, string | null | undefined>> = { user: subjects.userId, address: subjects.address, account: subjects.account };
  for (const kind of ['user', 'address', 'account'] as const) {
    const limit = limits[kind];
    const value = values[kind];
    if (limit !== undefined && value !== undefined && value !== null && value !== '') {
      checks.push({ subject: rateSubjectHash(sealer, bucket, kind, value), limit });
    }
  }
  if (checks.length === 0) {
    return { allowed: true };
  }
  const client = await pool.connect();
  let wait = 0;
  try {
    for (const check of checks) {
      const { rows } = await client.query<{ allowed: boolean; retry_after_seconds: number }>('SELECT allowed, retry_after_seconds FROM rate_limit_take($1, $2, $3, $4)', [
        bucket,
        check.subject,
        check.limit.hits,
        check.limit.windowSeconds,
      ]);
      if (rows[0]?.allowed !== true) {
        wait = Math.max(wait, rows[0]?.retry_after_seconds ?? check.limit.windowSeconds);
      }
    }
  } finally {
    client.release();
  }
  return wait === 0 ? { allowed: true } : { allowed: false, retryAfterSeconds: wait };
}

/**
 * The client's address from X-Forwarded-For, trusting only the proxies in front of the application: with one
 * trusted hop (the load balancer, which appends the address it saw), the last entry; with none, no address
 * (a request could name any). Anything that is not an address is no address.
 */
export function clientAddress(forwardedFor: string | null, trustedHops: number): string | null {
  if (trustedHops < 1 || forwardedFor === null) {
    return null;
  }
  const entries = forwardedFor
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
  const entry = entries[entries.length - trustedHops];
  return entry !== undefined && /^[0-9A-Fa-f.:]{2,45}$/.test(entry) ? entry : null;
}

/** Minutes, rounded up, for a refusal's sentence. */
export function retryMinutes(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / 60));
}
