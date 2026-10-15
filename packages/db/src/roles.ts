import type pg from 'pg';

/**
 * Database roles (PRD sections 3 and 16; Data dictionary conventions):
 *
 * - `tp_owner` owns every table and runs migrations and content loads. It cannot log in: the
 *   migrating or loading connection (a superuser in dev and test, the deploy job's login in AWS)
 *   switches to it with SET ROLE, so whatever it creates is owned by tp_owner.
 * - `tp_app` is the application role: NOSUPERUSER, NOBYPASSRLS, owns nothing, cannot log in. Logins
 *   are members of it.
 * - `tp_app_dev` is a login for the application role in dev and test only, with a fixed local
 *   password. It is created only when asked (`pnpm db:migrate --dev-login`); production logins come
 *   from Secrets Manager.
 *
 * Roles belong to the whole PostgreSQL cluster, so the bootstrap is idempotent and tolerates another
 * database's migration creating the same role at the same moment.
 */
export const OWNER_ROLE = 'tp_owner';
export const APP_ROLE = 'tp_app';
export const APP_DEV_LOGIN = 'tp_app_dev';
/** Local only: the dev and test login's password. Never used outside a developer machine or CI. */
export const APP_DEV_PASSWORD = 'tp_app_dev';

const ROLE_ATTRIBUTES = 'NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS';

function createRole(name: string, attributes: string): string {
  return `DO $$ BEGIN
  CREATE ROLE ${name} ${attributes};
EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL;
END $$`;
}

/** Cluster roles, then this database's grants. Every statement can run again safely. */
export function bootstrapStatements(options: { readonly devLogin: boolean }): string[] {
  const statements = [
    createRole(OWNER_ROLE, `NOLOGIN ${ROLE_ATTRIBUTES}`),
    `ALTER ROLE ${OWNER_ROLE} NOLOGIN ${ROLE_ATTRIBUTES}`,
    createRole(APP_ROLE, `NOLOGIN ${ROLE_ATTRIBUTES}`),
    `ALTER ROLE ${APP_ROLE} NOLOGIN ${ROLE_ATTRIBUTES}`,
    // A connecting user that is not a superuser (the deploy job's login) needs membership to SET ROLE.
    `DO $$ BEGIN
  IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AND NOT pg_has_role(current_user, '${OWNER_ROLE}', 'SET') THEN
    EXECUTE format('GRANT ${OWNER_ROLE} TO %I', current_user);
  END IF;
END $$`,
    `DO $$ BEGIN EXECUTE format('GRANT CONNECT ON DATABASE %I TO ${APP_ROLE}', current_database()); END $$`,
    'REVOKE CREATE ON SCHEMA public FROM PUBLIC',
    `GRANT USAGE, CREATE ON SCHEMA public TO ${OWNER_ROLE}`,
    `GRANT USAGE ON SCHEMA public TO ${APP_ROLE}`,
  ];
  if (options.devLogin) {
    statements.push(
      createRole(APP_DEV_LOGIN, `LOGIN INHERIT PASSWORD '${APP_DEV_PASSWORD}' ${ROLE_ATTRIBUTES}`),
      `ALTER ROLE ${APP_DEV_LOGIN} LOGIN INHERIT ${ROLE_ATTRIBUTES}`,
      `DO $$ BEGIN
  IF NOT pg_has_role('${APP_DEV_LOGIN}', '${APP_ROLE}', 'MEMBER') THEN
    GRANT ${APP_ROLE} TO ${APP_DEV_LOGIN};
  END IF;
EXCEPTION WHEN unique_violation THEN NULL;
END $$`,
    );
  }
  return statements;
}

/** SQLSTATEs a concurrent bootstrap in another database can raise on the shared role catalog. */
const RETRYABLE = new Set(['XX000', '40001', '40P01', '23505']);
const ATTEMPTS = 5;

function sqlState(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
}

export async function bootstrapRoles(client: pg.ClientBase, options: { readonly devLogin: boolean }): Promise<void> {
  for (const statement of bootstrapStatements(options)) {
    for (let attempt = 1; ; attempt += 1) {
      try {
        await client.query(statement);
        break;
      } catch (error) {
        if (attempt >= ATTEMPTS || !RETRYABLE.has(sqlState(error) ?? '')) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 20 * attempt));
      }
    }
  }
}

/** The URL of the dev and test login for the application role, on the same server and database. */
export function appDevLoginUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.username = APP_DEV_LOGIN;
  url.password = APP_DEV_PASSWORD;
  return url.toString();
}
