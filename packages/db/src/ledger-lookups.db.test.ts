import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readDatabaseUrl } from './config';
import { MIGRATIONS_DIR, migrate, readMigrations } from './migrate';
import { OWNER_ROLE } from './roles';
import { type ScratchDatabase, createScratchDatabase } from './testing';

/**
 * The ledger lookups migration (20261113090000; docs/adr/0087, the note of 2026-11-11) on the head before it, where a
 * deploy applies it. The founder's ledger freeze exception of 2026-11-06 covers new bodies for `ledger_line_net` and
 * `ledger_entry_rules` in place of their bodies of migration 20261027090000, and nothing else: so the file changes
 * those two bodies and no other thing the catalog holds of any function or trigger, refuses a starting body that is
 * not the one the exception was granted on, and holds no lock a reader or a writer of the ledger waits for. What the
 * two bodies answer and refuse, and how they are planned, is apps/worker/src/reconcile/ledger-lookups.db.test.ts.
 * No rows: the catalog only.
 */

const MIGRATION = '20261113090000_ledger_lookups.sql';

/** The first 16 digits are what packages/db/functions prints for each body. */
const GRANTED_ON = {
  'ledger_entry_rules()': 'abbcba68f46fd135f269175642bf0e68fe7ccd9ed34587ae080f94275d7a2572',
  'ledger_line_net(uuid,text)': 'f151e27ea09f28c1da80430ad29190e0f4f1988c219db232ed6e0bdb5b6e5a64',
};
/** The two bodies the founder read (approval-summaries/lane-b-suite-cap-3-freeze-exception-ask.md in the ops record), as the database stores them. */
const GRANTED = {
  'ledger_entry_rules()': '834cdefc070b08db11f6992c7804dc57bfaeca51c22ec2194b60ca1a9e7f614c',
  'ledger_line_net(uuid,text)': '5d0a94c0a294a732a12e210e365d156b58bbb61ffa85d2e34edf330c242eb458',
};

const refused = (signature: string) => ({
  code: '55000',
  message: `${signature} is not the body of migration 20261027090000 that migration 20261113090000 replaces; the ledger freeze exception of 2026-11-06 covers no other`,
});

/** Every migration before this one, in a directory of their own. */
let previousDir = '';
/** A database the runner migrated to them: the previous head. */
let previous: ScratchDatabase;
let head: pg.Client;

beforeAll(async () => {
  previousDir = mkdtempSync(path.join(tmpdir(), 'ledger-lookups-previous-head-'));
  for (const earlier of readMigrations(MIGRATIONS_DIR).filter((candidate) => candidate.name < MIGRATION)) {
    copyFileSync(path.join(MIGRATIONS_DIR, earlier.name), path.join(previousDir, earlier.name));
  }
  previous = await createScratchDatabase(readDatabaseUrl());
  await migrate({ databaseUrl: previous.url, migrationsDir: previousDir, devLogin: true });
  head = new pg.Client({ connectionString: previous.url });
  head.on('error', () => undefined);
  await head.connect();
}, 120_000);

afterAll(async () => {
  await head.end().catch(() => undefined);
  await previous.drop();
  rmSync(previousDir, { recursive: true, force: true });
});

const file = () => readFileSync(path.join(MIGRATIONS_DIR, MIGRATION), 'utf8');

/** One transaction on the previous head as the runner opens it for a file (as tp_owner), rolled back: the head stays where it was. */
async function onPreviousHead<T>(run: () => Promise<T>): Promise<T> {
  await head.query('BEGIN');
  try {
    await head.query(`SET LOCAL ROLE ${OWNER_ROLE}`);
    return await run();
  } finally {
    await head.query('ROLLBACK');
  }
}

/** What the whole file answers: applied, or its refusal. */
const apply = () =>
  head.query(file()).then(
    () => 'applied' as const,
    (error: unknown) => ({ code: (error as { code?: string }).code, message: (error as Error).message }),
  );

/**
 * Everything the catalog holds of every function of the schema but its body's text, with the body's SHA-256 beside it:
 * identity, owner, grants, settings, language, security, volatility, strictness, leakproofness, parallel safety, cost,
 * the argument and result types and names, and the comment.
 */
async function functions(): Promise<Map<string, Record<string, unknown>>> {
  const { rows } = await head.query<Record<string, unknown> & { signature: string }>(
    `SELECT p.oid::regprocedure::text AS signature, p.oid::int AS oid, pg_get_userbyid(p.proowner) AS owner, p.proacl::text AS acl, p.proconfig AS config,
            l.lanname AS language, p.prosecdef AS definer, p.provolatile AS volatility, p.proisstrict AS strict, p.proleakproof AS leakproof, p.proparallel AS parallel,
            p.procost::float8 AS cost, p.prorows::float8 AS result_rows, p.prokind AS kind, p.proretset AS returns_set, pg_get_function_result(p.oid) AS result,
            pg_get_function_arguments(p.oid) AS arguments, p.prosupport::text AS support, p.prosqlbody IS NULL AS body_as_text, obj_description(p.oid, 'pg_proc') AS comment,
            encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') AS body
       FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
      WHERE p.pronamespace = 'public'::regnamespace ORDER BY 1`,
  );
  return new Map(rows.map((row) => [row.signature, row]));
}

/** Every trigger of the schema: its table, function, timing and events, and whether it fires. */
async function triggers(): Promise<Record<string, unknown>[]> {
  const { rows } = await head.query<Record<string, unknown>>(
    `SELECT t.tgrelid::regclass::text AS relation, t.tgname AS name, t.tgfoid::int AS function, t.tgtype AS type, t.tgenabled AS enabled, pg_get_triggerdef(t.oid) AS definition
       FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      WHERE NOT t.tgisinternal AND c.relnamespace = 'public'::regnamespace ORDER BY 1, 2`,
  );
  return rows;
}

describe('the ledger lookups migration (20261113090000) on the previous head', () => {
  it('finds the two bodies the exception was granted on, and puts the two granted bodies in their place: nothing else of any function, and no trigger, changes', async () => {
    await onPreviousHead(async () => {
      const before = await functions();
      const firing = await triggers();
      for (const [signature, body] of Object.entries(GRANTED_ON)) {
        expect(before.get(signature)?.body, signature).toBe(body);
      }
      expect(await apply()).toBe('applied');
      const after = await functions();
      expect([...after.keys()]).toEqual([...before.keys()]);
      const changed = [...after].filter(([signature, row]) => JSON.stringify(row) !== JSON.stringify(before.get(signature))).map(([signature]) => signature);
      expect(changed).toEqual(Object.keys(GRANTED));
      for (const [signature, body] of Object.entries(GRANTED)) {
        // The same row but its body: the function's identity (so every trigger and caller still names it), owner, grants,
        // search_path, SECURITY INVOKER, volatility and the rest.
        expect({ ...after.get(signature), body: undefined }, signature).toEqual({ ...before.get(signature), body: undefined });
        expect(after.get(signature)?.body, signature).toBe(body);
        expect(after.get(signature)?.definer, signature).toBe(false);
        expect(after.get(signature)?.config, signature).toEqual(['search_path=pg_catalog, public, pg_temp']);
      }
      expect(after.get('ledger_line_net(uuid,text)')?.acl).toBe(`{${OWNER_ROLE}=X/${OWNER_ROLE},tp_app=X/${OWNER_ROLE}}`);
      expect(after.get('ledger_entry_rules()')?.acl).toBe(`{${OWNER_ROLE}=X/${OWNER_ROLE}}`);
      expect(await triggers()).toEqual(firing);
    });
  });

  it('holds no lock on a ledger table that a reader or a writer waits for: only the read lock creating a function takes on the tables its body names', async () => {
    await onPreviousHead(async () => {
      expect(await apply()).toBe('applied');
      const { rows } = await head.query<{ relation: string; mode: string }>(
        `SELECT l.relation::regclass::text AS relation, l.mode FROM pg_locks l JOIN pg_class c ON c.oid = l.relation
          WHERE l.pid = pg_backend_pid() AND l.locktype = 'relation' AND c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND l.mode <> 'AccessShareLock' ORDER BY 1, 2`,
      );
      expect(rows).toEqual([]);
    });
  });

  it('refuses, changing nothing, a starting body that is not the one the exception was granted on, by as little as one statement', async () => {
    /** A function's definition as the catalog prints it, with `find`, which is in it once, replaced by `put`. */
    const redefined = async (signature: string, find: string, put: string): Promise<string> => {
      const definition = (await head.query<{ definition: string }>('SELECT pg_get_functiondef($1::regprocedure) AS definition', [signature])).rows[0]?.definition ?? '';
      expect(definition.split(find), signature).toHaveLength(2);
      return definition.replace(find, put);
    };
    for (const [signature, find, put] of [
      ['ledger_line_net(uuid,text)', 'WHERE e.service_line_id = line', 'WHERE e.service_line_id = line AND true'],
      ['ledger_entry_rules()', "BEGIN\n  IF TG_OP <> 'INSERT'", "BEGIN\n  PERFORM 1;\n  IF TG_OP <> 'INSERT'"],
    ] as const) {
      const outcome = await onPreviousHead(async () => {
        await head.query(await redefined(signature, find, put));
        return apply();
      });
      expect(outcome, signature).toEqual(refused(signature.replace(',', ', ')));
    }
    // Applied twice, the second finds its own bodies and refuses: the file never runs over anything but the bodies it names.
    const twice = await onPreviousHead(async () => {
      expect(await apply()).toBe('applied');
      await head.query('SAVEPOINT again');
      return apply();
    });
    expect(twice).toEqual(refused('ledger_line_net(uuid, text)'));
    const still = await functions();
    for (const [signature, body] of Object.entries(GRANTED_ON)) {
      expect(still.get(signature)?.body, signature).toBe(body);
    }
  });
});
