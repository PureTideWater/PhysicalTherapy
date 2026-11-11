import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MIGRATIONS_DIR, MIGRATION_LOCK_WAIT, MigrationError, historyProblems, isLockTimeout, migrationPauseMs, readMigrations } from './migrate';
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

/**
 * The messages a migration's lock loops give up with: each RAISE EXCEPTION with ERRCODE lock_not_available or its
 * SQLSTATE, 55P03, however it is laid out (on one line or two, in any case, with format arguments or none; PR 126 review
 * RV-DB1-1, RV-DB2-7).
 */
function lockLoopFailures(sql: string): string[] {
  return [...sql.matchAll(/RAISE\s+EXCEPTION\s+'((?:[^']|'')*)'\s*(?:,[^;]*?)?\s*USING\s+ERRCODE\s*=\s*'(?:lock_not_available|55P03)'/gi)].map((match) => (match[1] as string).replaceAll("''", "'"));
}

/** A migration's SQL without its comments, so a lock named in prose is not read as one taken. */
const withoutComments = (sql: string) => sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');

/** Whether the migration takes a table lock with NOWAIT, TABLE written or not: the lock loop's try (PR 126 review RV-DB2-7). */
const locksWithNowait = (sql: string) => /\bLOCK\s+(?:TABLE\s+)?[^;]*\bNOWAIT\b/i.test(withoutComments(sql));

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The deploy log's line for a migration's lock-loop failure: each % of the message stands for the value RAISE puts there, and %% for a %. */
const failureLine = (name: string, message: string) =>
  new RegExp(`db:migrate: ${escaped(name)} failed: ${message
    .split('%%')
    .map((part) => part.split('%').map(escaped).join('.+?'))
    .join('%')}`);

describe('the deploy runbook (docs/runbooks/deploy-and-rollback.md)', () => {
  /** Each migration's lock loop: a NOWAIT loop that gives up with lock_not_available, and the message it ends with. */
  const loops = readMigrations(MIGRATIONS_DIR).flatMap(({ name, sql }) => lockLoopFailures(sql).map((message) => ({ name, message })));
  const runbook = readFileSync(path.resolve(MIGRATIONS_DIR, '../../../docs/runbooks/deploy-and-rollback.md'), 'utf8');

  it('reads every migration that ends a lock loop with lock_not_available', () => {
    expect(loops.map((loop) => loop.name)).toEqual(expect.arrayContaining(['20261109090000_line_status_heads.sql', '20261110090000_ledger_interest_once.sql']));
  });

  it('finds a lock loop’s failure however its RAISE is laid out (PR 126 review RV-DB1-1)', () => {
    const message = 'claim stayed in use for five minutes; run the deploy again (docs/adr/0083)';
    expect(lockLoopFailures(`  RAISE EXCEPTION '${message}' USING ERRCODE = 'lock_not_available';`)).toEqual([message]);
    // The two-line style of this repository's preflight raises, and lower case.
    expect(lockLoopFailures(`  RAISE EXCEPTION '${message}'\n      USING ERRCODE = 'lock_not_available';`)).toEqual([message]);
    expect(lockLoopFailures(`  raise exception '${message}' using errcode = 'lock_not_available';`)).toEqual([message]);
    // With a format argument, and a quote doubled inside the message.
    expect(lockLoopFailures(`  RAISE EXCEPTION 'claim stayed in use for % minutes', 5\n    USING ERRCODE = 'lock_not_available';`)).toEqual(['claim stayed in use for % minutes']);
    expect(lockLoopFailures(`  RAISE EXCEPTION 'the reconcile''s locks stayed held' USING ERRCODE = 'lock_not_available';`)).toEqual(["the reconcile's locks stayed held"]);
    // Another error code is no lock loop's failure.
    expect(lockLoopFailures(`  RAISE EXCEPTION '${message}'\n      USING ERRCODE = 'check_violation';`)).toEqual([]);
    // The condition's SQLSTATE, 55P03, which EXCEPTION WHEN lock_not_available catches as its name (PR 126 review RV-DB2-7).
    expect(lockLoopFailures(`  RAISE EXCEPTION '${message}' USING ERRCODE = '55P03';`)).toEqual([message]);
    expect(lockLoopFailures(`  RAISE EXCEPTION '${message}'\n      USING ERRCODE='55P03';`)).toEqual([message]);
    expect(lockLoopFailures(`  RAISE EXCEPTION '${message}' USING ERRCODE = '55P04';`)).toEqual([]);
  });

  it('finds a lock loop’s failure in every migration that takes a lock with NOWAIT, so no lock loop escapes the runbook (PR 126 review RV-DB1-1)', () => {
    const nowait = readMigrations(MIGRATIONS_DIR)
      .filter(({ sql }) => locksWithNowait(sql))
      .map(({ name }) => name);
    expect(nowait).toEqual(expect.arrayContaining(['20261109090000_line_status_heads.sql', '20261110090000_ledger_interest_once.sql']));
    expect(nowait.filter((name) => !loops.some((loop) => loop.name === name))).toEqual([]);
    expect(locksWithNowait('-- LOCK TABLE claim IN SHARE MODE NOWAIT\nSELECT 1;')).toBe(false);
    expect(locksWithNowait('/* LOCK TABLE claim NOWAIT */ SELECT 1;')).toBe(false);
    expect(locksWithNowait('      lock table claim in share mode\n        nowait;')).toBe(true);
    expect(locksWithNowait('LOCK TABLE claim IN SHARE MODE; SELECT 1 NOWAIT;')).toBe(false);
    // TABLE is optional in LOCK, and a loop may take the lock with neither spelling it gives up with by name: together
    // they once escaped both detectors (PR 126 review RV-DB2-7).
    expect(locksWithNowait('LOCK claim IN SHARE MODE NOWAIT;')).toBe(true);
    expect(locksWithNowait('      lock ledger_entry, ledger_match in access exclusive mode\n        nowait;')).toBe(true);
    expect(locksWithNowait("SELECT pg_advisory_lock(1); SELECT 1 FROM claim FOR UPDATE NOWAIT;")).toBe(false);
    const loop = `DO $$\nBEGIN\n  FOR i IN 1..300 LOOP\n    BEGIN\n      LOCK claim IN SHARE MODE NOWAIT;\n      RETURN;\n    EXCEPTION WHEN lock_not_available THEN\n      PERFORM pg_sleep(1);\n    END;\n  END LOOP;\n  RAISE EXCEPTION 'claim stayed in use for five minutes; run the deploy again'\n    USING ERRCODE = '55P03';\nEND\n$$;`;
    expect([locksWithNowait(loop), lockLoopFailures(loop)]).toEqual([true, ['claim stayed in use for five minutes; run the deploy again']]);
  });

  it('reads the deploy log’s line for a failure with format arguments as RAISE fills them in', () => {
    expect('db:migrate: 20270101000000_x.sql failed: claim stayed in use for 5 minutes (100% of tries)').toMatch(failureLine('20270101000000_x.sql', 'claim stayed in use for % minutes (100%% of tries)'));
    expect('db:migrate: 20270101000000_x.sql failed: claim stayed in use for minutes').not.toMatch(failureLine('20270101000000_x.sql', 'claim stayed in use for % minutes'));
    expect('db:migrate: 20270101000000_xsql failed: (a)').not.toMatch(failureLine('20270101000000_x.sql', '(a)'));
  });

  it.each(loops)('quotes $name’s lock-loop failure as the deploy log shows it, so whoever deploys knows what it means and what to do', ({ name, message }) => {
    expect(runbook).toMatch(failureLine(name, message));
  });

  /** A text's words, its comment markers and line breaks read as single spaces. */
  const words = (text: string) => text.replace(/^\s*--/gm, ' ').replace(/\s+/g, ' ');
  /** The runbook's section on migration 20261110090000's lock, up to the next heading. */
  const interestSection = () => /## The ledger’s lock for interest credited once \(ADR 0084\)[\s\S]*?(?=\n## )/.exec(runbook.replaceAll("'", '’'))?.[0] ?? '';

  it('says alike, in the interest migration’s header, the runbook and ADR 0084, which REPEATABLE READ page reads ledger_match as empty once: one whose snapshot began before the migration committed, the locks held or not (PR 126 review RV-DB2-5)', () => {
    const header = words(readMigrations(MIGRATIONS_DIR).find((migration) => migration.name === '20261110090000_ledger_interest_once.sql')?.sql.split('\n\nDO $$')[0] ?? '');
    const adrs = path.resolve(MIGRATIONS_DIR, '../../../docs/adr');
    const adr = words(readFileSync(path.join(adrs, readdirSync(adrs).find((name) => name.startsWith('0084-')) ?? ''), 'utf8'));
    for (const text of [header, words(interestSection()), adr]) {
      expect(text).toContain('snapshot began before the migration committed (before the locks were taken or while they were held)');
      expect(text).not.toContain('began before the locks were taken');
    }
  });

  it('tells whoever deploys the interest migration that one reconcile running can hold the ledger’s tables past the lock loop’s five minutes, so to deploy again with none queued or running (PR 126 review RV-DB2-6)', () => {
    const section = words(interestSection());
    expect(section).toContain('one reconcile running holds both tables from its first read to its commit');
    expect(section).toContain('with no reconcile queued or running');
    expect(section).not.toContain('takes most of a minute');
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

describe('the migrations’ lock wait', () => {
  it('waits two seconds a lock and tries twenty times, about five minutes in all', () => {
    expect(MIGRATION_LOCK_WAIT.timeoutMs).toBe(2_000);
    expect(MIGRATION_LOCK_WAIT.attempts).toBe(20);
    const pauses = Array.from({ length: MIGRATION_LOCK_WAIT.attempts - 1 }, (_unused, index) => migrationPauseMs(index + 1));
    expect(pauses.slice(0, 6)).toEqual([1_000, 2_000, 4_000, 8_000, 15_000, 15_000]);
    expect(new Set(pauses.slice(4))).toEqual(new Set([15_000]));
    const total = pauses.reduce((sum, pause) => sum + pause, 0) + MIGRATION_LOCK_WAIT.attempts * MIGRATION_LOCK_WAIT.timeoutMs;
    expect(total).toBe(280_000);
    // The run's retries end at thirty minutes: the deploy gives the migration task fifty (infra/test/compute.test.ts
    // pins that number) and does not stop it there, so twenty minutes are left for a last try.
    expect(MIGRATION_LOCK_WAIT.budgetMs).toBe(30 * 60_000);
    expect(migrationPauseMs(0)).toBe(1_000);
  });

  it('recognizes PostgreSQL’s cancellation of a lock wait and nothing else', () => {
    expect(isLockTimeout({ code: '55P03', routine: 'ProcessInterrupts' })).toBe(true);
    expect(isLockTimeout({ code: '55P03', routine: 'exec_stmt_raise' })).toBe(false);
    expect(isLockTimeout({ code: '55P03', routine: 'LockTableRecurse' })).toBe(false);
    expect(isLockTimeout({ code: '55P03' })).toBe(false);
    expect(isLockTimeout({ code: '57014', routine: 'ProcessInterrupts' })).toBe(false);
    expect(isLockTimeout({ routine: 'ProcessInterrupts' })).toBe(false);
    expect(isLockTimeout(new Error('canceling statement due to lock timeout'))).toBe(false);
    expect(isLockTimeout(null)).toBe(false);
    expect(isLockTimeout('55P03')).toBe(false);
  });
});
