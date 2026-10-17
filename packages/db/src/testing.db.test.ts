import net from 'node:net';

import pg from 'pg';
import { describe, expect, it } from 'vitest';

import { readDatabaseUrl } from './config';
import { createScratchDatabase, endPool, withScratchDatabase } from './testing';

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

/**
 * A TCP relay to the database server that can hold what clients send, as a loaded machine delays it:
 * a pool's Terminate messages are then still on their way when its database is dropped WITH (FORCE).
 */
interface Relay {
  /** `url` through the relay. */
  readonly via: (url: string) => string;
  /** Hold what clients send from now on, until release(). */
  readonly hold: () => void;
  readonly release: () => void;
  readonly close: () => Promise<void>;
}

async function relayTo(url: string): Promise<Relay> {
  const target = new URL(url);
  let held: (() => void)[] | null = null;
  const sockets = new Set<net.Socket>();
  const server = net.createServer({ allowHalfOpen: true }, (client) => {
    const upstream = net.connect(Number(target.port || '5432'), target.hostname);
    sockets.add(client).add(upstream);
    const send = (deliver: () => void): void => {
      if (held === null) deliver();
      else held.push(deliver);
    };
    client.on('data', (chunk) => send(() => upstream.destroyed || upstream.write(chunk)));
    client.on('end', () => send(() => upstream.end()));
    client.on('close', () => send(() => upstream.destroy()));
    upstream.on('data', (chunk) => client.destroyed || client.write(chunk));
    upstream.on('end', () => client.end());
    upstream.on('close', () => client.destroy());
    for (const socket of [client, upstream]) {
      socket.on('error', () => socket.destroy());
      socket.on('close', () => sockets.delete(socket));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as net.AddressInfo;
  return {
    via: (database) => {
      const through = new URL(database);
      through.hostname = '127.0.0.1';
      through.port = String(port);
      return through.toString();
    },
    hold: () => {
      held ??= [];
    },
    release: () => {
      const queued = held ?? [];
      held = null;
      for (const deliver of queued) deliver();
    },
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

/** A pool of `size` clients through the relay, every one opened and idle. */
async function idlePool(url: string, size: number): Promise<pg.Pool> {
  const pool = new pg.Pool({ connectionString: url, max: size });
  await Promise.all(Array.from({ length: size }, () => pool.query('SELECT pg_sleep(0.05)')));
  expect(pool.idleCount).toBe(size);
  return pool;
}

describe('ending a pool before its database is dropped', () => {
  it("pool.end() resolves while its clients' sockets are open, so a forced drop ends each idle client with 57P01", async () => {
    const database = await createScratchDatabase(adminUrl);
    const relay = await relayTo(database.url);
    try {
      const pool = await idlePool(relay.via(database.url), 3);
      const errors: { code?: string }[] = [];
      pool.on('error', (error) => errors.push(error as { code?: string }));
      relay.hold();
      await pool.end();
      await database.drop();
      await expect.poll(() => errors.length, { timeout: 10_000 }).toBe(3);
      expect(errors.map((error) => error.code)).toEqual(['57P01', '57P01', '57P01']);
    } finally {
      relay.release();
      await relay.close();
      await database.drop();
    }
  });

  it('endPool resolves once every client has closed, so the forced drop that follows meets none of them', async () => {
    const database = await createScratchDatabase(adminUrl);
    const relay = await relayTo(database.url);
    try {
      // No error listener: an error a client emitted would be unhandled and fail the run, as it did.
      const pool = await idlePool(relay.via(database.url), 3);
      relay.hold();
      let released = false;
      const release = setTimeout(() => {
        released = true;
        relay.release();
      }, 500);
      await endPool(pool);
      // It waited for the Terminate messages the relay held to reach the server and the sockets to close.
      expect(released).toBe(true);
      await database.drop();
      clearTimeout(release);
      // Long enough for a 57P01 the drop provoked to reach a client.
      await new Promise((resolve) => setTimeout(resolve, 500));
    } finally {
      relay.release();
      await relay.close();
      await database.drop();
    }
  });
});
