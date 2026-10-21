import { APP_ROLE, BILLING_ROLE, JOB_ROLE, OPERATOR_ROLE } from '@tp/db';

/**
 * The deploy job's logins (docs/adr/0019: "the deploy job creates tp_operator_login from its secret as
 * it does tp_app_login"; docs/adr/0049). The migration task runs this after the migrations, as the
 * owner login, before any service moves to a new release:
 *
 * - QUEUE_ROLE, a NOLOGIN role that owns pg-boss's schema (QUEUE_SCHEMA) and nothing else, and that
 *   schema. Queue connections set the role at sign-in, so whatever pg-boss creates is owned by it.
 *   It may create schemas in the database (pg-boss's start asks), never objects in `public`.
 * - The application, operator and queue logins, from their secrets' current username and password,
 *   each a member of its role (tp_app, tp_operator, QUEUE_ROLE) and nothing else. A login that exists
 *   keeps its password: after its creation Secrets Manager's rotation owns it (the alternating-users
 *   scheme creates the `_clone` login itself and grants it the original).
 * - The worker's own login (the practice jobs; docs/adr/0061): a member of tp_app, which it inherits as the
 *   web's login does, and of the marker role tp_job, which it neither inherits nor may SET ROLE to. The
 *   database reads that membership from session_user, so a job's connection, or a compromised worker
 *   setting app.actor_id to a person's ID, records no download of a packet export and attests none. The
 *   rotation's `_clone` is granted the original, and so is marked too.
 * - Billing's login (the webhook route and the organization's billing screens; docs/adr/0055), which may
 *   SET ROLE tp_billing without inheriting it and holds nothing else: the application's login may not
 *   switch to billing, so no other route can write an invoice.
 *
 * Every statement can run again safely; nothing here reads a table.
 */
export const QUEUE_ROLE = 'tp_queue';
export const QUEUE_SCHEMA = 'pgboss';

export interface Login {
  readonly username: string;
  readonly password: string;
}

export interface DeployLogins {
  readonly app: Login;
  /** The worker's own login: tp_app's privileges, marked as a job's by tp_job. */
  readonly worker: Login;
  readonly operator: Login;
  readonly queue: Login;
  readonly billing: Login;
}

/** The SQL surface the step needs: pg's Client. */
export interface LoginClient {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
  escapeIdentifier(value: string): string;
  escapeLiteral(value: string): string;
}

export class LoginProvisionError extends Error {
  override readonly name = 'LoginProvisionError';
}

const LOGIN_NAME = /^[a-z_][a-z0-9_]{0,62}$/;
const NOTHING = 'NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT';

async function roleExists(client: LoginClient, name: string): Promise<boolean> {
  return (await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [name])).rows.length > 0;
}

/** Lets the connecting login act as `role` when it may not yet (a login with CREATEROLE that is not a superuser, as on RDS). */
async function canSetRole(client: LoginClient, role: string): Promise<void> {
  await client.query(`DO $$ BEGIN
  IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AND NOT pg_has_role(current_user, '${role}', 'SET') THEN
    EXECUTE format('GRANT ${role} TO %I', current_user);
  END IF;
END $$`);
}

/** How a login holds its role: inheriting it, only able to SET ROLE to it, or only marked by it (neither). */
type Membership = 'inherit' | 'switch' | 'mark';

const GRANT_OPTIONS: Readonly<Record<Membership, string>> = {
  inherit: '',
  switch: ' WITH INHERIT FALSE, SET TRUE',
  mark: ' WITH INHERIT FALSE, SET FALSE',
};

/** Creates the queue role and schema and the five logins; returns the logins it created. */
export async function provisionLogins(client: LoginClient, logins: DeployLogins): Promise<{ readonly created: string[] }> {
  const all = [logins.app, logins.worker, logins.operator, logins.queue, logins.billing];
  const members: [Login, string, Membership][] = [
    [logins.app, APP_ROLE, 'inherit'],
    [logins.worker, APP_ROLE, 'inherit'],
    [logins.worker, JOB_ROLE, 'mark'],
    [logins.operator, OPERATOR_ROLE, 'inherit'],
    [logins.queue, QUEUE_ROLE, 'inherit'],
    [logins.billing, BILLING_ROLE, 'switch'],
  ];
  for (const login of all) {
    if (!LOGIN_NAME.test(login.username)) {
      throw new LoginProvisionError('a login name is lowercase letters, digits and underscores');
    }
    if (login.password.length < 16) {
      throw new LoginProvisionError(`the password of ${login.username} is shorter than 16 characters`);
    }
  }
  if (new Set(all.map((login) => login.username)).size !== all.length) {
    throw new LoginProvisionError('the five logins have five different names');
  }
  for (const role of [APP_ROLE, JOB_ROLE, OPERATOR_ROLE, BILLING_ROLE]) {
    if (!(await roleExists(client, role))) {
      throw new LoginProvisionError(`role ${role} does not exist; the migrations run first`);
    }
  }

  await client.query(`DO $$ BEGIN
  CREATE ROLE ${QUEUE_ROLE} NOLOGIN ${NOTHING};
EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL;
END $$`);
  await canSetRole(client, QUEUE_ROLE);
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${QUEUE_SCHEMA} AUTHORIZATION ${QUEUE_ROLE}`);
  const owner = (await client.query('SELECT pg_get_userbyid(nspowner)::text AS owner FROM pg_namespace WHERE nspname = $1', [QUEUE_SCHEMA])).rows[0] as { owner: string } | undefined;
  if (owner?.owner !== QUEUE_ROLE) {
    throw new LoginProvisionError(`schema ${QUEUE_SCHEMA} belongs to ${owner?.owner ?? 'nobody'}, not ${QUEUE_ROLE}`);
  }
  // pg-boss starts with CREATE SCHEMA IF NOT EXISTS, which PostgreSQL checks against the database's
  // CREATE privilege before it looks for the schema; with it the role can create only schemas it owns.
  await client.query(`DO $$ BEGIN EXECUTE format('GRANT CONNECT, CREATE ON DATABASE %I TO ${QUEUE_ROLE}', current_database()); END $$`);

  const created: string[] = [];
  for (const login of all) {
    if (!(await roleExists(client, login.username))) {
      await client.query(`CREATE ROLE ${client.escapeIdentifier(login.username)} LOGIN ${NOTHING} PASSWORD ${client.escapeLiteral(login.password)}`);
      created.push(login.username);
    }
  }
  for (const [login, role, membership] of members) {
    await client.query(`GRANT ${role} TO ${client.escapeIdentifier(login.username)}${GRANT_OPTIONS[membership]}`);
  }
  return { created };
}

/** The ten secret fields the migration task is given (infra/lib/constructs/compute.ts). */
export const LOGIN_VARIABLES = {
  app: { username: 'TP_APP_LOGIN_USERNAME', password: 'TP_APP_LOGIN_PASSWORD' },
  worker: { username: 'TP_WORKER_LOGIN_USERNAME', password: 'TP_WORKER_LOGIN_PASSWORD' },
  operator: { username: 'TP_OPERATOR_LOGIN_USERNAME', password: 'TP_OPERATOR_LOGIN_PASSWORD' },
  queue: { username: 'TP_QUEUE_LOGIN_USERNAME', password: 'TP_QUEUE_LOGIN_PASSWORD' },
  billing: { username: 'TP_BILLING_LOGIN_USERNAME', password: 'TP_BILLING_LOGIN_PASSWORD' },
} as const;

/** Reads the five logins from the environment; a missing field is named, never a value. */
export function readDeployLogins(env: Readonly<Record<string, string | undefined>> = process.env): DeployLogins {
  const read = (name: string): string => {
    const value = env[name];
    if (value === undefined || value === '') {
      throw new LoginProvisionError(`${name} is not set`);
    }
    return value;
  };
  const login = (variables: { readonly username: string; readonly password: string }): Login => ({ username: read(variables.username), password: read(variables.password) });
  return {
    app: login(LOGIN_VARIABLES.app),
    worker: login(LOGIN_VARIABLES.worker),
    operator: login(LOGIN_VARIABLES.operator),
    queue: login(LOGIN_VARIABLES.queue),
    billing: login(LOGIN_VARIABLES.billing),
  };
}
