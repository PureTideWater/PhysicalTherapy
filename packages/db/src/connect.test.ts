import { describe, expect, it } from 'vitest';

import { lockTimeoutParameter, openPool } from './connect';

/**
 * A pool's lock_timeout (docs/adr/0092, the amendment of 2026-11-11; CAS-57): given to pg as the pool's own setting, and
 * never left for a URL to replace. No connection is opened here; the database tests read the setting back from one
 * (apps/web: reconciliation-routes.db.test.ts and uploads/queue.db.test.ts). SYNTHETIC URLs.
 */
const URL_PLAIN = 'postgres://synthetic_login:synthetic-words@db.synthetic.test:5432/synthetic';

describe('a pool’s lock_timeout', () => {
  it('reaches pg as the pool’s own setting when asked for, and is absent otherwise (a job may wait)', async () => {
    const bounded = openPool(URL_PLAIN, 1, { lockTimeoutMs: 3_000 });
    const plain = openPool(URL_PLAIN, 1);
    try {
      expect((bounded as unknown as { options: Record<string, unknown> }).options.lock_timeout).toBe(3_000);
      expect('lock_timeout' in (plain as unknown as { options: Record<string, unknown> }).options).toBe(false);
    } finally {
      await bounded.end();
      await plain.end();
    }
    expect(lockTimeoutParameter(URL_PLAIN, 3_000)).toEqual({ lock_timeout: 3_000 });
    expect(lockTimeoutParameter(URL_PLAIN, undefined)).toEqual({});
  });

  it('keeps a URL’s own options for anything else: a production login’s role (infra/lib/launch.ts)', () => {
    expect(lockTimeoutParameter(`${URL_PLAIN}?sslmode=verify-full&options=-c%20role%3Dtp_billing`, 3_000)).toEqual({ lock_timeout: 3_000 });
  });

  it('refuses a URL that would replace it (pg lets a URL’s query win), in words that never hold the URL', () => {
    for (const query of ['?lock_timeout=0', '?sslmode=verify-full&lock_timeout=60000', '?options=-c%20lock_timeout%3D0', '?options=-c%20role%3Dtp_app%20-c%20lock_timeout%3D0']) {
      let message = '';
      try {
        lockTimeoutParameter(`${URL_PLAIN}${query}`, 3_000);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toBe('the database URL sets lock_timeout itself, which would replace the pool’s own: take it out of the URL');
      expect(() => openPool(`${URL_PLAIN}${query}`, 1, { lockTimeoutMs: 3_000 })).toThrow('sets lock_timeout itself');
      // With no timeout asked for, the URL is the caller's own business, as before.
      expect(lockTimeoutParameter(`${URL_PLAIN}${query}`, undefined)).toEqual({});
    }
  });

  it('refuses a URL it cannot read, without repeating it', () => {
    let message = '';
    try {
      lockTimeoutParameter('synthetic-words not a url', 3_000);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toBe('the database URL could not be read to check that it sets no lock_timeout');
    expect(message).not.toContain('synthetic-words');
  });
});
