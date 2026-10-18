import { randomUUID } from 'node:crypto';

import pg from 'pg';

import { migrate } from './migrate';
import { appDevLoginUrl, billingDevLoginUrl, esignDevLoginUrl } from './roles';

export { type BuiltRow, RowFactory, RowFactoryError, type Row } from './row-factory';
export {
  type OwnerClient,
  type TenantWorld,
  addMembership,
  asOwner,
  createOrganization,
  createTenantWorld,
  createUser,
  placeholderDataKeyRef,
  worldRefs,
} from './tenant-world';

export interface ScratchDatabase {
  readonly name: string;
  readonly url: string;
  drop(): Promise<void>;
}

/** Creates an empty database; `drop` removes it. `adminUrl` must be a role allowed to CREATE DATABASE. */
export async function createScratchDatabase(adminUrl: string): Promise<ScratchDatabase> {
  const name = `tp_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  return {
    name,
    url: url.toString(),
    drop: async () => {
      const dropper = new pg.Client({ connectionString: adminUrl });
      await dropper.connect();
      try {
        await dropper.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      } finally {
        await dropper.end();
      }
    },
  };
}

/**
 * Ends a pool and resolves once every one of its connections has closed. Every test ends its pools with
 * this before it drops their database. pg-pool's end() resolves as soon as it has asked its idle clients
 * to end, while their sockets are still closing; a drop WITH (FORCE) then terminates backends that have
 * not yet read the Terminate message, each such client receives 57P01 ("terminating connection due to
 * administrator command"), and a pool with no error listener throws it as an unhandled error, which
 * fails the run (testing.db.test.ts reproduces it). An error a closing client reports here is expected
 * and ignored.
 */
export async function endPool(pool: pg.Pool): Promise<void> {
  pool.on('error', () => undefined);
  const open = pool.totalCount;
  const closed = new Set<pg.PoolClient>();
  const allClosed = new Promise<void>((resolve) => {
    if (open === 0) resolve();
    pool.on('remove', (client) => {
      closed.add(client);
      if (closed.size >= open) resolve();
    });
  });
  await pool.end();
  await allClosed;
}

/**
 * Creates an empty database for one test, hands its URL to `run`, and drops it afterwards, so
 * database tests never share state. `adminUrl` must be a role allowed to CREATE DATABASE.
 */
export async function withScratchDatabase<T>(adminUrl: string, run: (url: string) => Promise<T>): Promise<T> {
  const database = await createScratchDatabase(adminUrl);
  try {
    return await run(database.url);
  } finally {
    await database.drop();
  }
}

export interface MigratedDatabase extends ScratchDatabase {
  /** The application role's dev login on the same database (tp_app_dev). */
  readonly appUrl: string;
  /** Billing's dev login, which may SET ROLE tp_billing (tp_billing_dev). */
  readonly billingUrl: string;
  /** The e-signature webhook's dev login, which may SET ROLE tp_esign (tp_esign_dev). */
  readonly esignUrl: string;
}

/** A scratch database with every migration applied and the dev login for the application role. */
export async function createMigratedDatabase(adminUrl: string): Promise<MigratedDatabase> {
  const database = await createScratchDatabase(adminUrl);
  try {
    await migrate({ databaseUrl: database.url, devLogin: true });
  } catch (error) {
    await database.drop();
    throw error;
  }
  return { ...database, appUrl: appDevLoginUrl(database.url), billingUrl: billingDevLoginUrl(database.url), esignUrl: esignDevLoginUrl(database.url) };
}
