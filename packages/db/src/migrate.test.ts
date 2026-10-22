import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MIGRATIONS_DIR, MigrationError, historyProblems, readMigrations } from './migrate';
import {
  APP_DEV_LOGIN,
  APP_ROLE,
  BILLING_DEV_LOGIN,
  BILLING_ROLE,
  ESIGN_DEV_LOGIN,
  ESIGN_ROLE,
  JOB_ROLE,
  OPERATOR_ROLE,
  OWNER_ROLE,
  type RoleAttributes,
  RoleBootstrapError,
  SCREENING_DEV_LOGIN,
  SCREENING_ROLE,
  WANTED_ROLES,
  WORKER_DEV_LOGIN,
  appDevLoginUrl,
  createRoleStatement,
  grantStatements,
  managedRoles,
  roleAlteration,
  workerDevLoginUrl,
} from './roles';

let dir = '';

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'migrations-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('readMigrations', () => {
  it('reads SQL files in name order with the SHA-256 of their bytes', () => {
    writeFileSync(path.join(dir, '20261015120001_second.sql'), 'SELECT 2;');
    writeFileSync(path.join(dir, '20261015120000_first.sql'), 'SELECT 1;');
    expect(readMigrations(dir)).toEqual([
      { name: '20261015120000_first.sql', sql: 'SELECT 1;', checksum: '17db4fd369edb9244b9f91d9aeed145c3d04ad8ba6e95d06247f07a63527d11a' },
      { name: '20261015120001_second.sql', sql: 'SELECT 2;', checksum: expect.stringMatching(/^[0-9a-f]{64}$/) },
    ]);
  });

  it.each(['1_short.sql', '20261015120000-dash.sql', '20261015120000_Upper.sql', '20270101000000_x.SQL', '20270101000000_x.sql.bak', 'README.md', 'notes'])(
    'refuses %s rather than skip it',
    (name) => {
      writeFileSync(path.join(dir, '20261015120000_first.sql'), 'SELECT 1;');
      writeFileSync(path.join(dir, name), 'SELECT 1;');
      expect(() => readMigrations(dir)).toThrow(MigrationError);
      expect(() => readMigrations(dir)).toThrow(`${name}: everything in the migrations directory is a migration file`);
    },
  );

  it('refuses a directory among the migrations', () => {
    mkdirSync(path.join(dir, '20270101000000_x.sql'));
    expect(() => readMigrations(dir)).toThrow(MigrationError);
  });

  it('finds the repository migrations, starting with the rule content tables', () => {
    expect(readMigrations(MIGRATIONS_DIR)[0]?.name).toBe('20261015120000_rule_content.sql');
  });
});

describe('historyProblems', () => {
  const file = (name: string, checksum = 'a'.repeat(64)) => ({ name, sql: '', checksum });
  const row = (filename: string, checksum = 'a'.repeat(64)) => ({ filename, checksum });

  it('accepts applied migrations that are unchanged, and new ones after them', () => {
    expect(historyProblems([file('20260101000000_a.sql'), file('20260102000000_b.sql')], [row('20260101000000_a.sql')])).toEqual([]);
    expect(historyProblems([file('20260101000000_a.sql')], [])).toEqual([]);
  });

  it('refuses a changed, a missing or an out-of-order migration', () => {
    expect(historyProblems([file('20260101000000_a.sql', 'b'.repeat(64))], [row('20260101000000_a.sql')])).toEqual([
      '20260101000000_a.sql changed after it was applied; migrations are forward-only, so write a new one',
    ]);
    expect(historyProblems([], [row('20260101000000_a.sql')])).toEqual(['20260101000000_a.sql was applied but its file is missing']);
    expect(historyProblems([file('20260101000000_a.sql'), file('20260102000000_b.sql')], [row('20260102000000_b.sql')])).toEqual([
      '20260101000000_a.sql sorts before 20260102000000_b.sql, which is already applied; give it a later timestamp',
    ]);
  });
});

describe('roles', () => {
  const owner = WANTED_ROLES[OWNER_ROLE] as RoleAttributes;

  it('creates the dev logins only when asked', () => {
    // The screening consumer's role and its dev login too (migration 20261106090000; roles.test.ts).
    expect(managedRoles({ devLogin: false })).toEqual([OWNER_ROLE, APP_ROLE, OPERATOR_ROLE, BILLING_ROLE, ESIGN_ROLE, JOB_ROLE, SCREENING_ROLE]);
    expect(managedRoles({ devLogin: true })).toEqual([
      OWNER_ROLE,
      APP_ROLE,
      OPERATOR_ROLE,
      BILLING_ROLE,
      ESIGN_ROLE,
      JOB_ROLE,
      SCREENING_ROLE,
      APP_DEV_LOGIN,
      WORKER_DEV_LOGIN,
      BILLING_DEV_LOGIN,
      ESIGN_DEV_LOGIN,
      SCREENING_DEV_LOGIN,
    ]);
    for (const login of [APP_DEV_LOGIN, WORKER_DEV_LOGIN, BILLING_DEV_LOGIN, ESIGN_DEV_LOGIN, SCREENING_DEV_LOGIN]) {
      expect(grantStatements({ devLogin: false }).join('\n')).not.toContain(login);
    }
    expect(grantStatements({ devLogin: true }).join('\n')).toContain(`GRANT ${APP_ROLE} TO ${APP_DEV_LOGIN};`);
    // The worker's dev login inherits the application role and is marked as a job's; the web's is not (docs/adr/0061).
    expect(grantStatements({ devLogin: true }).join('\n')).toContain(`GRANT ${APP_ROLE} TO ${WORKER_DEV_LOGIN};`);
    expect(grantStatements({ devLogin: true }).join('\n')).toContain(`GRANT ${JOB_ROLE} TO ${WORKER_DEV_LOGIN} WITH INHERIT FALSE, SET FALSE;`);
    expect(grantStatements({ devLogin: true }).join('\n')).not.toContain(`GRANT ${JOB_ROLE} TO ${APP_DEV_LOGIN}`);
    expect(grantStatements({ devLogin: true }).join('\n')).toContain(`GRANT ${BILLING_ROLE} TO ${BILLING_DEV_LOGIN} WITH INHERIT FALSE, SET TRUE;`);
    expect(grantStatements({ devLogin: true }).join('\n')).toContain(`GRANT ${ESIGN_ROLE} TO ${ESIGN_DEV_LOGIN} WITH INHERIT FALSE, SET TRUE;`);
    expect(() => createRoleStatement('someone_else')).toThrow(RoleBootstrapError);
  });

  it('revokes temporary tables from PUBLIC and lets the operator role connect', () => {
    const statements = grantStatements({ devLogin: false }).join('\n');
    expect(statements).toContain("REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC");
    expect(statements).toContain(`GRANT USAGE ON SCHEMA public TO ${APP_ROLE}, ${OPERATOR_ROLE}, ${BILLING_ROLE}, ${ESIGN_ROLE}`);
    // The operator role switches to billing's role without inheriting it (docs/adr/0050); the application role
    // never may, and a membership an earlier bootstrap granted it is revoked (docs/adr/0055).
    expect(statements).toContain(`GRANT ${BILLING_ROLE} TO ${OPERATOR_ROLE} WITH INHERIT FALSE, SET TRUE;`);
    expect(statements).not.toContain(`GRANT ${BILLING_ROLE} TO ${APP_ROLE}`);
    expect(statements).toContain(`REVOKE ${BILLING_ROLE} FROM ${APP_ROLE};`);
  });

  it('never gives the application, operator, billing, e-signature, job or owner role superuser, bypass or login', () => {
    for (const role of [APP_ROLE, OPERATOR_ROLE, BILLING_ROLE, ESIGN_ROLE, JOB_ROLE, OWNER_ROLE]) {
      expect(createRoleStatement(role)).toContain(`CREATE ROLE ${role} NOLOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;`);
      expect(WANTED_ROLES[role]).toEqual({ rolcanlogin: false, rolinherit: true, rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolreplication: false, rolbypassrls: false });
    }
    expect(createRoleStatement(APP_DEV_LOGIN)).toContain("LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD 'tp_app_dev'");
  });

  it('alters an existing role only where it differs, naming nothing else', () => {
    expect(roleAlteration(OWNER_ROLE, owner, owner, false)).toBeNull();
    expect(roleAlteration(OWNER_ROLE, { ...owner, rolcanlogin: true }, owner, false)).toBe(`ALTER ROLE ${OWNER_ROLE} NOLOGIN`);
    expect(roleAlteration(OWNER_ROLE, { ...owner, rolcreatedb: true, rolinherit: false }, owner, false)).toBe(`ALTER ROLE ${OWNER_ROLE} INHERIT NOCREATEDB`);
    expect(roleAlteration(OWNER_ROLE, { ...owner, rolsuper: true, rolbypassrls: true }, owner, true)).toBe(`ALTER ROLE ${OWNER_ROLE} NOSUPERUSER NOBYPASSRLS`);
  });

  it('refuses, from a connection that is not a superuser, an attribute only a superuser can remove', () => {
    for (const attribute of ['rolsuper', 'rolreplication', 'rolbypassrls'] as const) {
      expect(() => roleAlteration(APP_ROLE, { ...owner, [attribute]: true }, owner, false)).toThrow(RoleBootstrapError);
    }
    expect(() => roleAlteration(APP_ROLE, { ...owner, rolbypassrls: true }, owner, false)).toThrow(
      `role ${APP_ROLE} has BYPASSRLS set, which only a superuser can remove; ask a superuser to run ALTER ROLE ${APP_ROLE} NOBYPASSRLS`,
    );
  });

  it('builds the dev login URL on the same server and database', () => {
    expect(appDevLoginUrl('postgres://postgres:test@localhost:5432/tp_test_x')).toBe('postgres://tp_app_dev:tp_app_dev@localhost:5432/tp_test_x');
    expect(workerDevLoginUrl('postgres://postgres:test@localhost:5432/tp_test_x')).toBe('postgres://tp_worker_dev:tp_worker_dev@localhost:5432/tp_test_x');
  });
});
