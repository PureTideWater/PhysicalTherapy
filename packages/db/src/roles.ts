/**
 * Database roles (PRD sections 3 and 16; Data dictionary conventions):
 *
 * - `tp_owner` owns every table and runs migrations and content loads. It cannot log in: the
 *   migrating or loading connection (a superuser in dev and test, the deploy job's login in AWS)
 *   switches to it with SET ROLE, so whatever it creates is owned by tp_owner.
 * - `tp_app` is the application role: NOSUPERUSER, NOBYPASSRLS, owns nothing, cannot log in. Logins
 *   are members of it.
 * - `tp_operator` is the platform jobs' role (the nightly audit copy, the restore drill's evidence
 *   and the support notices): NOSUPERUSER, NOBYPASSRLS, owns nothing, cannot log in. It reads the
 *   audit log and calls the operator functions; the owner stays with migrations (docs/adr/0014).
 * - `tp_billing` is billing's role (Stripe's webhooks, dunning, the nightly usage snapshot; docs/adr/0050):
 *   NOSUPERUSER, NOBYPASSRLS, owns nothing, cannot log in. It holds the billing tables and nothing on
 *   any PHI table. The operator role and billing's own login may SET ROLE to it but do not inherit it,
 *   so billing code runs with its privileges alone. The application role may not (docs/adr/0055): a
 *   request on the application's login can never switch to billing and rewrite an invoice.
 * - `tp_esign` holds only EXECUTE on record_esigned_agreement() (docs/adr/0053 and 0055): NOLOGIN, owns
 *   nothing. Only the e-signature webhook's own login may SET ROLE to it, so no other route can record
 *   an agreement by that path.
 * - `tp_job` marks the worker's own login, which the practice jobs connect as (docs/adr/0061): NOLOGIN,
 *   owns nothing, holds no privilege, and no login may SET ROLE to it. The worker's login is a member of
 *   tp_app, as the web's is, and of tp_job besides, so `session_user` (which only a superuser can change:
 *   SET ROLE and SECURITY DEFINER change current_user, never the login a connection signed in as) tells a
 *   job's connection from a person's request whatever the job sets app.actor_id to. The database refuses a
 *   packet export's download evidence and its attestation on such a connection (app_session_is_job()).
 * - `tp_app_dev`, `tp_worker_dev`, `tp_billing_dev` and `tp_esign_dev` are the dev and test logins for the
 *   application role, the worker's login, billing's login and the e-signature webhook's login, with fixed
 *   local passwords. They are created only when asked (`pnpm db:migrate --dev-login`); production logins
 *   come from Secrets Manager (apps/worker/src/deploy/logins.ts).
 *
 * Roles belong to the whole PostgreSQL cluster, so the bootstrap is idempotent and tolerates another
 * database's migration creating the same role at the same moment. It works from a superuser (dev and
 * test) and from a login with CREATEROLE that is not one (the deploy job's login on RDS): existing
 * roles are altered only where an attribute differs, and SUPERUSER, REPLICATION and BYPASSRLS are
 * never named in ALTER ROLE by a connection that may not change them.
 */
export const OWNER_ROLE = 'tp_owner';
export const APP_ROLE = 'tp_app';
export const OPERATOR_ROLE = 'tp_operator';
export const BILLING_ROLE = 'tp_billing';
export const ESIGN_ROLE = 'tp_esign';
/** The marker of the worker's own login (a member of tp_app and of this role); it holds no privilege. */
export const JOB_ROLE = 'tp_job';
export const APP_DEV_LOGIN = 'tp_app_dev';
/** Local only: the dev and test login's password. Never used outside a developer machine or CI. */
export const APP_DEV_PASSWORD = 'tp_app_dev';
/** Local only: the worker's dev and test login, a member of tp_app and of the marker tp_job (its password is its name). */
export const WORKER_DEV_LOGIN = 'tp_worker_dev';
/** Local only: billing's dev and test login (its password is its name, as the application's). */
export const BILLING_DEV_LOGIN = 'tp_billing_dev';
/** Local only: the e-signature webhook's dev and test login. */
export const ESIGN_DEV_LOGIN = 'tp_esign_dev';
/** The dev logins, each with the role it may switch to (the application's inherits its role). */
const DEV_LOGINS = [APP_DEV_LOGIN, WORKER_DEV_LOGIN, BILLING_DEV_LOGIN, ESIGN_DEV_LOGIN] as const;

/** The pg_roles columns the bootstrap manages, and the keyword that sets each. */
const ATTRIBUTES = {
  rolcanlogin: 'LOGIN',
  rolinherit: 'INHERIT',
  rolsuper: 'SUPERUSER',
  rolcreatedb: 'CREATEDB',
  rolcreaterole: 'CREATEROLE',
  rolreplication: 'REPLICATION',
  rolbypassrls: 'BYPASSRLS',
} as const;
export type RoleAttribute = keyof typeof ATTRIBUTES;
export type RoleAttributes = Readonly<Record<RoleAttribute, boolean>>;

/** Attributes only a superuser may change, even to switch them off (PostgreSQL 16 and later). */
const SUPERUSER_ONLY: readonly RoleAttribute[] = ['rolsuper', 'rolreplication', 'rolbypassrls'];

const NOTHING = { rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolreplication: false, rolbypassrls: false } as const;

/** What each managed role must be. */
export const WANTED_ROLES: Readonly<Record<string, RoleAttributes>> = {
  [OWNER_ROLE]: { rolcanlogin: false, rolinherit: true, ...NOTHING },
  [APP_ROLE]: { rolcanlogin: false, rolinherit: true, ...NOTHING },
  [OPERATOR_ROLE]: { rolcanlogin: false, rolinherit: true, ...NOTHING },
  [BILLING_ROLE]: { rolcanlogin: false, rolinherit: true, ...NOTHING },
  [ESIGN_ROLE]: { rolcanlogin: false, rolinherit: true, ...NOTHING },
  [JOB_ROLE]: { rolcanlogin: false, rolinherit: true, ...NOTHING },
  [APP_DEV_LOGIN]: { rolcanlogin: true, rolinherit: true, ...NOTHING },
  [WORKER_DEV_LOGIN]: { rolcanlogin: true, rolinherit: true, ...NOTHING },
  [BILLING_DEV_LOGIN]: { rolcanlogin: true, rolinherit: true, ...NOTHING },
  [ESIGN_DEV_LOGIN]: { rolcanlogin: true, rolinherit: true, ...NOTHING },
};

function attributeWords(attributes: RoleAttributes): string {
  return (Object.keys(ATTRIBUTES) as RoleAttribute[]).map((name) => `${attributes[name] ? '' : 'NO'}${ATTRIBUTES[name]}`).join(' ');
}

export class RoleBootstrapError extends Error {
  override readonly name = 'RoleBootstrapError';
}

/**
 * The ALTER ROLE that brings an existing role to `wanted`, naming only the attributes that differ
 * (null when none does). A connection that is not a superuser cannot name SUPERUSER, REPLICATION or
 * BYPASSRLS in ALTER ROLE at all, even to switch them off; RDS's master user is such a connection.
 * If one of those is wrong, the bootstrap refuses with the fix rather than fail half-way.
 */
export function roleAlteration(name: string, current: RoleAttributes, wanted: RoleAttributes, asSuperuser: boolean): string | null {
  const differing = (Object.keys(ATTRIBUTES) as RoleAttribute[]).filter((attribute) => current[attribute] !== wanted[attribute]);
  if (differing.length === 0) {
    return null;
  }
  const blocked = differing.filter((attribute) => SUPERUSER_ONLY.includes(attribute));
  if (blocked.length > 0 && !asSuperuser) {
    throw new RoleBootstrapError(
      `role ${name} has ${blocked.map((attribute) => ATTRIBUTES[attribute]).join(', ')} set, which only a superuser can remove; ask a superuser to run ALTER ROLE ${name} ${blocked.map((attribute) => `NO${ATTRIBUTES[attribute]}`).join(' ')}`,
    );
  }
  return `ALTER ROLE ${name} ${differing.map((attribute) => `${wanted[attribute] ? '' : 'NO'}${ATTRIBUTES[attribute]}`).join(' ')}`;
}

function createRole(name: string, attributes: string): string {
  return `DO $$ BEGIN
  CREATE ROLE ${name} ${attributes};
EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL;
END $$`;
}

/** The roles the bootstrap creates, in order: the owner, the application, operator, billing, e-signature and job roles and, when asked, the dev logins. */
export function managedRoles(options: { readonly devLogin: boolean }): string[] {
  return [OWNER_ROLE, APP_ROLE, OPERATOR_ROLE, BILLING_ROLE, ESIGN_ROLE, JOB_ROLE, ...(options.devLogin ? DEV_LOGINS : [])];
}

/** CREATE ROLE for one managed role; a role that already exists is left for roleAlteration. */
export function createRoleStatement(name: string): string {
  const wanted = WANTED_ROLES[name];
  if (wanted === undefined) {
    throw new RoleBootstrapError(`${name} is not a role the bootstrap manages`);
  }
  const password = (DEV_LOGINS as readonly string[]).includes(name) ? ` PASSWORD '${name}'` : '';
  return createRole(name, `${attributeWords(wanted)}${password}`);
}

/** This database's grants, after the roles exist. Every statement can run again safely. */
export function grantStatements(options: { readonly devLogin: boolean }): string[] {
  const statements = [
    // A connecting user that is not a superuser (the deploy job's login) needs membership to SET ROLE.
    `DO $$ BEGIN
  IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AND NOT pg_has_role(current_user, '${OWNER_ROLE}', 'SET') THEN
    EXECUTE format('GRANT ${OWNER_ROLE} TO %I', current_user);
  END IF;
END $$`,
    `DO $$ BEGIN EXECUTE format('GRANT CONNECT ON DATABASE %I TO ${APP_ROLE}, ${OPERATOR_ROLE}, ${BILLING_ROLE}, ${ESIGN_ROLE}', current_database()); END $$`,
    // No temporary tables for anyone but the database's owner and superusers: a temporary table could
    // otherwise stand in for a real one in a function that does not search pg_temp last.
    `DO $$ BEGIN EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC', current_database()); END $$`,
    'REVOKE CREATE ON SCHEMA public FROM PUBLIC',
    `GRANT USAGE, CREATE ON SCHEMA public TO ${OWNER_ROLE}`,
    `GRANT USAGE ON SCHEMA public TO ${APP_ROLE}, ${OPERATOR_ROLE}, ${BILLING_ROLE}, ${ESIGN_ROLE}`,
    // Billing code runs as tp_billing: the operator role switches to it with SET ROLE without inheriting
    // its privileges (docs/adr/0050); so does billing's own login (logins.ts). The application role never
    // may (docs/adr/0055): a membership an earlier bootstrap granted it is revoked.
    switchesTo(OPERATOR_ROLE, BILLING_ROLE),
    `DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_auth_members m WHERE m.roleid = '${BILLING_ROLE}'::regrole AND m.member = '${APP_ROLE}'::regrole) THEN
    REVOKE ${BILLING_ROLE} FROM ${APP_ROLE};
  END IF;
END $$`,
  ];
  if (options.devLogin) {
    // The web's dev login and the worker's both inherit the application role; the worker's is also marked as a
    // job's (docs/adr/0061), and the web's never is.
    statements.push(inherits(APP_DEV_LOGIN, APP_ROLE), inherits(WORKER_DEV_LOGIN, APP_ROLE), marks(WORKER_DEV_LOGIN, JOB_ROLE));
    statements.push(switchesTo(BILLING_DEV_LOGIN, BILLING_ROLE), switchesTo(ESIGN_DEV_LOGIN, ESIGN_ROLE));
  }
  return statements;
}

/** Makes `member` a member of `role` that inherits its privileges (idempotent). */
export function inherits(member: string, role: string): string {
  return `DO $$ BEGIN
  IF NOT pg_has_role('${member}', '${role}', 'MEMBER') THEN
    GRANT ${role} TO ${member};
  END IF;
EXCEPTION WHEN unique_violation THEN NULL;
END $$`;
}

/**
 * Makes `member` a member of the marker `role` that neither inherits it nor may SET ROLE to it (idempotent): the
 * membership is all it carries, read with pg_has_role(session_user, role, 'MEMBER').
 */
export function marks(member: string, role: string): string {
  return `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_auth_members m WHERE m.roleid = '${role}'::regrole AND m.member = '${member}'::regrole) THEN
    GRANT ${role} TO ${member} WITH INHERIT FALSE, SET FALSE;
  END IF;
EXCEPTION WHEN unique_violation THEN NULL;
END $$`;
}

/** Lets `member` SET ROLE to `role` without inheriting its privileges (idempotent). */
export function switchesTo(member: string, role: string): string {
  return `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_auth_members m WHERE m.roleid = '${role}'::regrole AND m.member = '${member}'::regrole) THEN
    GRANT ${role} TO ${member} WITH INHERIT FALSE, SET TRUE;
  END IF;
EXCEPTION WHEN unique_violation THEN NULL;
END $$`;
}

/** SQLSTATEs a concurrent bootstrap in another database can raise on the shared role catalog. */
const RETRYABLE = new Set(['XX000', '40001', '40P01', '23505']);
const ATTEMPTS = 5;

function sqlState(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
}

interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

async function run(client: Queryable, statement: string, values: unknown[] | undefined, retry: boolean): Promise<{ rows: unknown[] }> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await client.query(statement, values);
    } catch (error) {
      if (!retry || attempt >= ATTEMPTS || !RETRYABLE.has(sqlState(error) ?? '')) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 20 * attempt));
    }
  }
}

/**
 * Creates the roles that are missing, brings existing ones to their attributes (altering only what
 * differs, so a deploy login that is not a superuser can run it), then grants this database's
 * privileges. `retry` (the default) retries the catalog conflicts a concurrent bootstrap in another
 * database raises; a dry run inside one transaction passes false, since a failed statement aborts it.
 */
export async function bootstrapRoles(client: Queryable, options: { readonly devLogin: boolean; readonly retry?: boolean }): Promise<void> {
  const retry = options.retry !== false;
  const me = (await run(client, 'SELECT rolsuper FROM pg_roles WHERE rolname = current_user', undefined, retry)).rows[0] as { rolsuper: boolean } | undefined;
  const asSuperuser = me?.rolsuper === true;
  for (const name of managedRoles(options)) {
    await run(client, createRoleStatement(name), undefined, retry);
    const found = (
      await run(
        client,
        'SELECT rolcanlogin, rolinherit, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls FROM pg_roles WHERE rolname = $1',
        [name],
        retry,
      )
    ).rows[0] as RoleAttributes | undefined;
    const wanted = WANTED_ROLES[name];
    if (found === undefined || wanted === undefined) {
      throw new RoleBootstrapError(`role ${name} could not be created`);
    }
    const alteration = roleAlteration(name, found, wanted, asSuperuser);
    if (alteration !== null) {
      await run(client, alteration, undefined, retry);
    }
  }
  for (const statement of grantStatements(options)) {
    await run(client, statement, undefined, retry);
  }
}

function devLoginUrl(databaseUrl: string, login: string): string {
  const url = new URL(databaseUrl);
  url.username = login;
  url.password = login;
  return url.toString();
}

/** The URL of the dev and test login for the application role, on the same server and database. */
export function appDevLoginUrl(databaseUrl: string): string {
  return devLoginUrl(databaseUrl, APP_DEV_LOGIN);
}

/** The URL of the worker's dev and test login (tp_app's privileges, marked as a job's by tp_job), on the same server and database. */
export function workerDevLoginUrl(databaseUrl: string): string {
  return devLoginUrl(databaseUrl, WORKER_DEV_LOGIN);
}

/** The URL of billing's dev and test login (it may SET ROLE tp_billing), on the same server and database. */
export function billingDevLoginUrl(databaseUrl: string): string {
  return devLoginUrl(databaseUrl, BILLING_DEV_LOGIN);
}

/** The URL of the e-signature webhook's dev and test login (it may SET ROLE tp_esign), on the same server and database. */
export function esignDevLoginUrl(databaseUrl: string): string {
  return devLoginUrl(databaseUrl, ESIGN_DEV_LOGIN);
}
