import { readDatabaseUrl } from '@tp/db';
import { PgBoss } from 'pg-boss';
import { describe, expect, it } from 'vitest';

import { producerOptions } from '../uploads/queue';
import { WEB_LOCK_TIMEOUT_MS } from './lock-timeout';

/**
 * CAS-57 (docs/adr/0092, the amendment of 2026-11-11): the queue producer's lock_timeout reaches the server, on a
 * connection pg-boss opens itself from the producer's options, with a URL built as a production login's is: `options`
 * of its own (the login's role, infra/lib/launch.ts). pg sends the URL's options and the pool's lock_timeout side by
 * side, and neither replaces the other, even where the URL's options set lock_timeout themselves. No table is touched
 * and the queue is not started.
 */

/** The test database's URL with options of its own. */
function urlWithOptions(options: string): string {
  const url = new URL(readDatabaseUrl());
  url.searchParams.set('options', options);
  return url.toString();
}

/** What pg-boss's own database adapter gives, opened without starting the queue. */
interface OpenedDb {
  open(): Promise<void>;
  close(): Promise<void>;
  executeSql(text: string): Promise<{ readonly rows: readonly Record<string, string>[] }>;
}

async function shown(url: string, settings: readonly string[]): Promise<string[]> {
  const db = new PgBoss(producerOptions(url)).getDb() as unknown as OpenedDb;
  await db.open();
  try {
    const values: string[] = [];
    for (const setting of settings) {
      values.push((await db.executeSql(`SHOW ${setting}`)).rows[0]?.[setting] ?? '');
    }
    return values;
  } finally {
    await db.close();
  }
}

describe('the queue producer’s lock_timeout on a URL with options of its own (CAS-57)', () => {
  const timeout = `${String(WEB_LOCK_TIMEOUT_MS / 1000)}s`;

  it('is set on a connection pg-boss opens, beside the URL’s own options', async () => {
    expect(await shown(urlWithOptions('-c statement_timeout=54321'), ['lock_timeout', 'statement_timeout'])).toEqual([timeout, '54321ms']);
  });

  it('is not replaced by options that set lock_timeout themselves: the server applies the pool’s setting after them', async () => {
    expect(await shown(urlWithOptions('-c lock_timeout=0'), ['lock_timeout'])).toEqual([timeout]);
  });
});
