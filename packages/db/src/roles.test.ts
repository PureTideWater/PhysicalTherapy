import { describe, expect, it } from 'vitest';

import {
  APP_ROLE,
  SCREENING_DEV_LOGIN,
  SCREENING_ROLE,
  WANTED_ROLES,
  createRoleStatement,
  grantStatements,
  managedRoles,
  roleAlteration,
  screeningDevLoginUrl,
  switchesTo,
} from './roles';

/**
 * The role bootstrap's statements for the screening consumer's role (migration 20261106090000; docs/adr/0062): the
 * bootstrap creates tp_screening with nothing (no login, no superuser, no bypass of row-level security), gives it the
 * database's CONNECT and the schema's USAGE beside the other roles, and lets its dev login switch to it without
 * inheriting it, as billing's does. The migration grants it its functions; the catalog test keeps it owning nothing
 * and the application role from switching to it.
 */
describe('the role bootstrap and the screening consumer’s role', () => {
  it('creates tp_screening after the job role, and its dev login only when asked', () => {
    expect(managedRoles({ devLogin: false })).toEqual(['tp_owner', 'tp_app', 'tp_operator', 'tp_billing', 'tp_esign', 'tp_job', SCREENING_ROLE]);
    expect(managedRoles({ devLogin: true })).toEqual(expect.arrayContaining([SCREENING_ROLE, SCREENING_DEV_LOGIN]));
    expect(managedRoles({ devLogin: true }).indexOf(SCREENING_ROLE)).toBe(6);
  });

  it('wants tp_screening with no login and nothing else, and its dev login with a login alone', () => {
    expect(WANTED_ROLES[SCREENING_ROLE]).toEqual({
      rolcanlogin: false,
      rolinherit: true,
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolreplication: false,
      rolbypassrls: false,
    });
    expect(WANTED_ROLES[SCREENING_DEV_LOGIN]).toMatchObject({ rolcanlogin: true, rolsuper: false, rolbypassrls: false });
    expect(createRoleStatement(SCREENING_ROLE)).toContain('CREATE ROLE tp_screening NOLOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;');
    expect(createRoleStatement(SCREENING_ROLE)).not.toContain('PASSWORD');
    expect(createRoleStatement(SCREENING_DEV_LOGIN)).toContain(`PASSWORD '${SCREENING_DEV_LOGIN}'`);
    // A role that drifted is brought back, naming only what differs.
    const wanted = WANTED_ROLES[SCREENING_ROLE];
    if (wanted === undefined) {
      throw new Error('tp_screening is not a role the bootstrap manages');
    }
    expect(roleAlteration(SCREENING_ROLE, { ...wanted, rolcanlogin: true }, wanted, false)).toBe('ALTER ROLE tp_screening NOLOGIN');
  });

  it('gives tp_screening the database’s CONNECT and the schema’s USAGE, and nothing that writes', () => {
    const statements = grantStatements({ devLogin: false });
    const connect = statements.find((statement) => statement.includes('GRANT CONNECT ON DATABASE'));
    const usage = statements.find((statement) => statement.startsWith('GRANT USAGE ON SCHEMA public TO'));
    expect(connect).toMatch(new RegExp(`TO ${APP_ROLE}, .*${SCREENING_ROLE}'`));
    expect(usage).toMatch(new RegExp(`, ${SCREENING_ROLE}$`));
    expect(statements.filter((statement) => statement.includes(SCREENING_ROLE))).toEqual([connect, usage]);
  });

  it('lets the dev login switch to tp_screening without inheriting it, as billing’s does', () => {
    expect(grantStatements({ devLogin: false }).some((statement) => statement.includes(SCREENING_DEV_LOGIN))).toBe(false);
    const grants = grantStatements({ devLogin: true }).filter((statement) => statement.includes(SCREENING_DEV_LOGIN));
    expect(grants).toEqual([switchesTo(SCREENING_DEV_LOGIN, SCREENING_ROLE)]);
    expect(grants[0]).toContain(`GRANT ${SCREENING_ROLE} TO ${SCREENING_DEV_LOGIN} WITH INHERIT FALSE, SET TRUE`);
    expect(screeningDevLoginUrl('postgres://postgres:test@localhost:5433/tp_test')).toBe('postgres://tp_screening_dev:tp_screening_dev@localhost:5433/tp_test');
  });
});
