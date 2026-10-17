import { randomBytes } from 'node:crypto';

import { databaseClient, readDatabaseUrl } from '@tp/db';
import { createMigratedDatabase, withScratchDatabase } from '@tp/db/testing';
import { PgBoss } from 'pg-boss';
import { describe, expect, it } from 'vitest';

import { type DeployLogins, LOGIN_VARIABLES, LoginProvisionError, QUEUE_ROLE, QUEUE_SCHEMA, provisionLogins, readDeployLogins } from './logins';

/** Logins are cluster-wide: each test names its own (synthetic passwords, dropped after). */
function syntheticLogins(): DeployLogins {
  const suffix = randomBytes(4).toString('hex');
  const password = () => randomBytes(18).toString('base64url');
  return {
    app: { username: `tp_app_login_t${suffix}`, password: password() },
    operator: { username: `tp_operator_login_t${suffix}`, password: password() },
    queue: { username: `tp_queue_login_t${suffix}`, password: password() },
    billing: { username: `tp_billing_login_t${suffix}`, password: password() },
  };
}

function loginUrl(databaseUrl: string, username: string, password: string, role?: string): string {
  const url = new URL(databaseUrl);
  url.username = username;
  url.password = password;
  if (role !== undefined) {
    url.searchParams.set('options', `-c role=${role}`);
  }
  return url.toString();
}

async function asSuperuser<T>(url: string, run: (client: ReturnType<typeof databaseClient>) => Promise<T>): Promise<T> {
  const client = databaseClient(url);
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

async function dropLogins(logins: DeployLogins): Promise<void> {
  await asSuperuser(readDatabaseUrl(), async (client) => {
    for (const login of [logins.app, logins.operator, logins.queue, logins.billing]) {
      await client.query(`DROP ROLE IF EXISTS ${client.escapeIdentifier(login.username)}`);
    }
  });
}

describe('provisionLogins (the migration task, docs/adr/0049)', () => {
  it('creates the queue role and schema and the four logins, each in its own role only', { timeout: 120_000 }, async () => {
    const logins = syntheticLogins();
    const database = await createMigratedDatabase(readDatabaseUrl());
    try {
      const first = await asSuperuser(database.url, (client) => provisionLogins(client, logins));
      expect(first.created).toEqual([logins.app.username, logins.operator.username, logins.queue.username, logins.billing.username]);
      await asSuperuser(database.url, async (client) => {
        const memberships = await client.query<{ login: string; role: string; inherits: boolean; switches: boolean }>(
          `SELECT m.rolname AS login, r.rolname AS role, a.inherit_option AS inherits, a.set_option AS switches FROM pg_auth_members a
             JOIN pg_roles m ON m.oid = a.member JOIN pg_roles r ON r.oid = a.roleid
            WHERE m.rolname = ANY($1) ORDER BY 1, 2`,
          [[logins.app.username, logins.operator.username, logins.queue.username, logins.billing.username]],
        );
        expect(memberships.rows).toEqual(
          [
            { login: logins.app.username, role: 'tp_app', inherits: true, switches: true },
            { login: logins.operator.username, role: 'tp_operator', inherits: true, switches: true },
            { login: logins.queue.username, role: QUEUE_ROLE, inherits: true, switches: true },
            // Billing's login switches to tp_billing and holds nothing of its own (docs/adr/0055).
            { login: logins.billing.username, role: 'tp_billing', inherits: false, switches: true },
          ].sort((a, b) => (a.login < b.login ? -1 : 1)),
        );
        const attributes = await client.query<{ rolname: string; rolcanlogin: boolean; rolsuper: boolean; rolbypassrls: boolean; rolcreaterole: boolean }>(
          'SELECT rolname, rolcanlogin, rolsuper, rolbypassrls, rolcreaterole FROM pg_roles WHERE rolname = ANY($1) ORDER BY 1',
          [[logins.app.username, logins.operator.username, logins.queue.username, QUEUE_ROLE]],
        );
        for (const row of attributes.rows) {
          expect(row, row.rolname).toMatchObject({ rolcanlogin: row.rolname !== QUEUE_ROLE, rolsuper: false, rolbypassrls: false, rolcreaterole: false });
        }
        const schema = await client.query<{ owner: string }>('SELECT pg_get_userbyid(nspowner)::text AS owner FROM pg_namespace WHERE nspname = $1', [QUEUE_SCHEMA]);
        expect(schema.rows).toEqual([{ owner: QUEUE_ROLE }]);
        const database = await client.query(
          "SELECT has_database_privilege($1, current_database(), 'CREATE') AS create, has_database_privilege($1, current_database(), 'TEMPORARY') AS temporary, has_schema_privilege($1, 'public', 'CREATE') AS public",
          [QUEUE_ROLE],
        );
        expect(database.rows).toEqual([{ create: true, temporary: false, public: false }]);
      });

      // The queue login signs in as the queue role: what it creates belongs to the role, and it reads no practice table.
      await asSuperuser(loginUrl(database.url, logins.queue.username, logins.queue.password, QUEUE_ROLE), async (client) => {
        expect((await client.query('SELECT current_user AS role')).rows).toEqual([{ role: QUEUE_ROLE }]);
        await client.query(`CREATE TABLE ${QUEUE_SCHEMA}.probe (id int)`);
        expect((await client.query("SELECT tableowner FROM pg_tables WHERE schemaname = 'pgboss' AND tablename = 'probe'")).rows).toEqual([{ tableowner: QUEUE_ROLE }]);
        await expect(client.query('SELECT 1 FROM practice LIMIT 1')).rejects.toThrow(/permission denied/);
        await expect(client.query('CREATE TABLE public.probe (id int)')).rejects.toThrow(/permission denied/);
      });
      await asSuperuser(loginUrl(database.url, logins.app.username, logins.app.password), async (client) => {
        expect((await client.query("SELECT pg_has_role(current_user, 'tp_app', 'USAGE') AS app, pg_has_role(current_user, 'tp_queue', 'USAGE') AS queue")).rows).toEqual([{ app: true, queue: false }]);
        // The application's login never switches to billing.
        await expect(client.query('SET ROLE tp_billing')).rejects.toThrow(/permission denied/);
      });
      await asSuperuser(loginUrl(database.url, logins.billing.username, logins.billing.password), async (client) => {
        await expect(client.query('SELECT 1 FROM invoice LIMIT 1')).rejects.toThrow(/permission denied/);
        await client.query('SET ROLE tp_billing');
        expect((await client.query('SELECT count(*)::int AS n FROM invoice')).rows).toEqual([{ n: 0 }]);
      });

      // pg-boss installs its schema and queues work on the queue login alone, everything owned by the role.
      const boss = new PgBoss(loginUrl(database.url, logins.queue.username, logins.queue.password, QUEUE_ROLE));
      boss.on('error', () => undefined);
      await boss.start();
      await boss.createQueue('deploy_probe', { policy: 'exclusive', retryLimit: 2 });
      expect(await boss.send('deploy_probe', { probe: true }, { singletonKey: 'deploy_probe:1' })).not.toBeNull();
      await boss.stop({ graceful: false });
      await asSuperuser(database.url, async (client) => {
        const owners = await client.query(
          "SELECT DISTINCT pg_get_userbyid(c.relowner)::text AS owner FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1",
          [QUEUE_SCHEMA],
        );
        expect(owners.rows).toEqual([{ owner: QUEUE_ROLE }]);
      });

      // Again, with new passwords in the secrets: nothing is created and no password changes (rotation owns them).
      const again = await asSuperuser(database.url, (client) =>
        provisionLogins(client, { ...logins, app: { ...logins.app, password: 'another-synthetic-password-1' } }),
      );
      expect(again.created).toEqual([]);
      await asSuperuser(loginUrl(database.url, logins.app.username, logins.app.password), async (client) => {
        expect((await client.query('SELECT 1 AS ok')).rows).toEqual([{ ok: 1 }]);
      });
    } finally {
      await database.drop();
      await dropLogins(logins);
    }
  });

  it('refuses before the migrations have created the roles, and refuses bad names, short passwords and repeated logins', { timeout: 60_000 }, async () => {
    const logins = syntheticLogins();
    // A fresh cluster has no tp_app yet; this one may, so the order check is exercised with a name check first.
    await expect(provisionLogins({} as never, { ...logins, app: { username: 'Bad-Name', password: logins.app.password } })).rejects.toThrow(LoginProvisionError);
    await expect(provisionLogins({} as never, { ...logins, operator: { username: logins.operator.username, password: 'short' } })).rejects.toThrow(/shorter than 16/);
    await expect(provisionLogins({} as never, { ...logins, queue: logins.app })).rejects.toThrow(/four different names/);
    await withScratchDatabase(readDatabaseUrl(), async (url) => {
      await asSuperuser(url, async (client) => {
        const missing = { query: (text: string, values?: unknown[]) => (text.includes('FROM pg_roles WHERE rolname') ? Promise.resolve({ rows: [] }) : client.query(text, values)) };
        await expect(provisionLogins({ ...missing, escapeIdentifier: (v: string) => client.escapeIdentifier(v), escapeLiteral: (v: string) => client.escapeLiteral(v) }, logins)).rejects.toThrow(
          /role tp_app does not exist; the migrations run first/,
        );
      });
    });
  });
});

describe('readDeployLogins', () => {
  it('reads the four logins from the eight secret fields and names a missing one', () => {
    const env = Object.fromEntries(Object.values(LOGIN_VARIABLES).flatMap((pair) => [[pair.username, `${pair.username.toLowerCase()}`], [pair.password, 'synthetic-password-0123']]));
    expect(readDeployLogins(env).queue).toEqual({ username: 'tp_queue_login_username', password: 'synthetic-password-0123' });
    expect(() => readDeployLogins({ ...env, TP_OPERATOR_LOGIN_PASSWORD: '' })).toThrow('TP_OPERATOR_LOGIN_PASSWORD is not set');
  });
});
