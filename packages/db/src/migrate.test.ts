import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MIGRATIONS_DIR, MigrationError, historyProblems, readMigrations } from './migrate';
import { APP_DEV_LOGIN, APP_ROLE, OWNER_ROLE, appDevLoginUrl, bootstrapStatements } from './roles';

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
    writeFileSync(path.join(dir, 'README.md'), 'not a migration');
    expect(readMigrations(dir)).toEqual([
      { name: '20261015120000_first.sql', sql: 'SELECT 1;', checksum: '17db4fd369edb9244b9f91d9aeed145c3d04ad8ba6e95d06247f07a63527d11a' },
      { name: '20261015120001_second.sql', sql: 'SELECT 2;', checksum: expect.stringMatching(/^[0-9a-f]{64}$/) },
    ]);
  });

  it.each(['1_short.sql', '20261015120000-dash.sql', '20261015120000_Upper.sql'])('refuses the file name %s', (name) => {
    writeFileSync(path.join(dir, name), 'SELECT 1;');
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
  it('creates the dev login only when asked', () => {
    expect(bootstrapStatements({ devLogin: false }).join('\n')).not.toContain(APP_DEV_LOGIN);
    expect(bootstrapStatements({ devLogin: true }).join('\n')).toContain(`GRANT ${APP_ROLE} TO ${APP_DEV_LOGIN}`);
  });

  it('never gives the application or owner role superuser, bypass or login', () => {
    for (const role of [APP_ROLE, OWNER_ROLE]) {
      const statements = bootstrapStatements({ devLogin: true }).filter((statement) => statement.includes(`ROLE ${role} `));
      expect(statements.length).toBeGreaterThan(0);
      for (const statement of statements) {
        expect(statement).toMatch(/NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS/);
      }
    }
  });

  it('builds the dev login URL on the same server and database', () => {
    expect(appDevLoginUrl('postgres://postgres:test@localhost:5432/tp_test_x')).toBe('postgres://tp_app_dev:tp_app_dev@localhost:5432/tp_test_x');
  });
});
