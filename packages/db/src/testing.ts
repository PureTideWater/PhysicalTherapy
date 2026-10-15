import { randomUUID } from 'node:crypto';

import pg from 'pg';

/**
 * Creates an empty database for one test, hands its URL to `run`, and drops it afterwards, so
 * database tests never share state. `adminUrl` must be a role allowed to CREATE DATABASE.
 */
export async function withScratchDatabase<T>(adminUrl: string, run: (url: string) => Promise<T>): Promise<T> {
  const name = `tp_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${name}`);
    const url = new URL(adminUrl);
    url.pathname = `/${name}`;
    try {
      return await run(url.toString());
    } finally {
      await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    }
  } finally {
    await admin.end();
  }
}
