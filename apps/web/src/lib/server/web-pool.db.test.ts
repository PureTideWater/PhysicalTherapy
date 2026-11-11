import { readDatabaseUrl } from '@tp/db';
import { endPool } from '@tp/db/testing';
import { PgBoss } from 'pg-boss';
import { describe, expect, it } from 'vitest';

import { producerOptions } from '../uploads/queue';
import { WEB_LOCK_TIMEOUT_MS, openWebPool } from './web-pool';

/**
 * CAS-57 (docs/adr/0092, the amendment of 2026-11-11): the web's lock_timeout reaches the server on a URL built as a
 * production login's is, with `options` of its own (the login's role, infra/lib/launch.ts), for a request pool and
 * for the queue producer's pool, which pg-boss opens itself. pg sends the URL's options and the pool's lock_timeout
 * side by side; neither replaces the other. Read back from a real connection of each. No table is touched.
 */

/** The test database's URL with options of its own, as a production login's URL has. */
function urlWithOptions(): string {
  const url = new URL(readDatabaseUrl());
  url.searchParams.set('options', '-c statement_timeout=54321');
  return url.toString();
}

const SHOWN = `${String(WEB_LOCK_TIMEOUT_MS / 1000)}s`;

/** What pg-boss's own database adapter gives, opened without starting the queue. */
interface OpenedDb {
  open(): Promise<void>;
  close(): Promise<void>;
  executeSql(text: string): Promise<{ readonly rows: readonly Record<string, string>[] }>;
}

describe('the web’s lock_timeout on a URL with options of its own (CAS-57)', () => {
  it('is set on a request pool’s connection, beside the URL’s own options', async () => {
    const pool = openWebPool(urlWithOptions(), 1);
    try {
      const client = await pool.connect();
      try {
        expect((await client.query<{ lock_timeout: string }>('SHOW lock_timeout')).rows[0]?.lock_timeout).toBe(SHOWN);
        expect((await client.query<{ statement_timeout: string }>('SHOW statement_timeout')).rows[0]?.statement_timeout).toBe('54321ms');
      } finally {
        client.release();
      }
    } finally {
      await endPool(pool);
    }
  });

  it('is set on a connection pg-boss opens from the queue producer’s options, beside the URL’s own options', async () => {
    const db = new PgBoss(producerOptions(urlWithOptions())).getDb() as unknown as OpenedDb;
    await db.open();
    try {
      expect((await db.executeSql('SHOW lock_timeout')).rows[0]?.lock_timeout).toBe(SHOWN);
      expect((await db.executeSql('SHOW statement_timeout')).rows[0]?.statement_timeout).toBe('54321ms');
    } finally {
      await db.close();
    }
  });
});
