import pg from 'pg';
import { describe, expect, it } from 'vitest';

import { readDatabaseUrl } from './config';
import { withScratchDatabase } from './testing';

const adminUrl = readDatabaseUrl();

async function databaseExists(name: string): Promise<boolean> {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    const result = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    return result.rowCount === 1;
  } finally {
    await client.end();
  }
}

describe('withScratchDatabase', () => {
  it('creates an empty database, connects to it, and drops it afterwards', async () => {
    const name = await withScratchDatabase(adminUrl, async (url) => {
      const client = new pg.Client({ connectionString: url });
      await client.connect();
      try {
        const current = await client.query<{ name: string }>('SELECT current_database() AS name');
        const tables = await client.query(
          "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public'",
        );
        expect(tables.rowCount).toBe(0);
        return current.rows[0]?.name ?? '';
      } finally {
        await client.end();
      }
    });
    expect(name).toMatch(/^tp_test_[0-9a-f]{32}$/);
    expect(await databaseExists(name)).toBe(false);
  });

  it('drops the database when the test body throws', async () => {
    let seen = '';
    await expect(
      withScratchDatabase(adminUrl, (url) => {
        seen = new URL(url).pathname.slice(1);
        return Promise.reject(new Error('boom'));
      }),
    ).rejects.toThrow('boom');
    expect(seen).not.toBe('');
    expect(await databaseExists(seen)).toBe(false);
  });
});
