import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readDatabaseUrl } from './config';
import { MIGRATIONS_DIR, migrate, readMigrations } from './migrate';
import { OWNER_ROLE } from './roles';
import { RowFactory, type ScratchDatabase, type TenantWorld, createScratchDatabase, createTenantWorld } from './testing';

/**
 * The payer-response document rules migration (20261114090000; docs/adr/0085, the amendment of 2026-11-11) on the head
 * before it, applied as the runner applies a file (one transaction, as tp_owner): what it changes of the schema's
 * functions and what it leaves, and its preflight, which stops the migration when a document is already both a payer
 * response's letter and a contract version's source. Synthetic data only.
 */

const MIGRATION = '20261114090000_payer_response_document_rules.sql';
const REPLACED = ['case_line_rules()', 'console_contract_queue()', 'contract_version_documents_ok(contract_version)', 'payer_response_belongs()', 'source_document_rules()'];

let previousDir = '';
let previous: ScratchDatabase;
let head: pg.Client;
let north: TenantWorld;
let factory: RowFactory;

beforeAll(async () => {
  previousDir = mkdtempSync(path.join(tmpdir(), 'payer-response-document-rules-previous-head-'));
  for (const earlier of readMigrations(MIGRATIONS_DIR).filter((candidate) => candidate.name < MIGRATION)) {
    copyFileSync(path.join(MIGRATIONS_DIR, earlier.name), path.join(previousDir, earlier.name));
  }
  previous = await createScratchDatabase(readDatabaseUrl());
  await migrate({ databaseUrl: previous.url, migrationsDir: previousDir, devLogin: true });
  head = new pg.Client({ connectionString: previous.url });
  head.on('error', () => undefined);
  await head.connect();
  factory = await RowFactory.load(head);
  north = await createTenantWorld(head, 'north');
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

/** Everything the catalog holds of every function of the schema, its body as a SHA-256. */
async function functions(): Promise<Map<string, Record<string, unknown>>> {
  const { rows } = await head.query<Record<string, unknown> & { signature: string }>(
    `SELECT p.oid::regprocedure::text AS signature, p.oid::int AS oid, pg_get_userbyid(p.proowner) AS owner, p.proacl::text AS acl, p.proconfig AS config,
            l.lanname AS language, p.prosecdef AS definer, p.provolatile AS volatility, p.proisstrict AS strict, p.proleakproof AS leakproof, p.proparallel AS parallel,
            pg_get_function_result(p.oid) AS result, pg_get_function_arguments(p.oid) AS arguments, encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') AS body
       FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
      WHERE p.pronamespace = 'public'::regnamespace ORDER BY 1`,
  );
  return new Map(rows.map((row) => [row.signature, row]));
}

const columnExists = async (): Promise<boolean> =>
  (await head.query("SELECT 1 FROM information_schema.columns WHERE table_name = 'source_document' AND column_name = 'filed_for_submission_id'")).rowCount === 1;

describe('the payer-response document rules migration (20261114090000) on the previous head', () => {
  it('applies on a head that holds no document in both uses, replaces five functions and changes no other', async () => {
    await onPreviousHead(async () => {
      const before = await functions();
      expect(await apply()).toBe('applied');
      const after = await functions();
      expect([...after.keys()]).toEqual([...before.keys()]);
      const changed = [...after.keys()].filter((signature) => JSON.stringify(after.get(signature)) !== JSON.stringify(before.get(signature)));
      expect(changed).toEqual(REPLACED);
      for (const signature of REPLACED) {
        const { body: was, language: wasLanguage, volatility: wasVolatility, ...kept } = before.get(signature) as Record<string, unknown>;
        const { body: is, language, volatility, ...keeps } = after.get(signature) as Record<string, unknown>;
        // Identity, owner, grants, settings, security, strictness and types are kept by every one of the five.
        expect(keeps, signature).toEqual(kept);
        expect(is, signature).not.toBe(was);
        if (signature === 'contract_version_documents_ok(contract_version)') {
          // The one deliberate change of kind: its check after the document's lock must read a new snapshot.
          expect([wasLanguage, wasVolatility, language, volatility]).toEqual(['sql', 's', 'plpgsql', 'v']);
        } else {
          expect([language, volatility], signature).toEqual([wasLanguage, wasVolatility]);
        }
      }
      expect(await columnExists()).toBe(true);
      // The preflight's widened scope is emptied again before the migration ends.
      expect((await head.query<{ scope: string }>("SELECT current_setting('app.practice_ids', true) AS scope")).rows[0]?.scope).toBe('{}');
    });
    expect(await columnExists()).toBe(false);
  });

  it('stops, changing nothing, when a document is already a payer response’s letter and a contract version’s source, and says how many', async () => {
    const response = await factory.create(head, 'payer_response', north);
    const contract = await factory.create(head, 'contract', north);
    // A state the handlers have refused since the payer-response pull request: written with the triggers off.
    await head.query('BEGIN');
    await head.query('SET LOCAL session_replication_role = replica');
    await head.query(`INSERT INTO contract_version (practice_id, contract_id, version_no, source_document_ids, effective_from) VALUES ($1, $2, 1, ARRAY[$3]::uuid[], '2027-01-01')`, [
      north.practiceId,
      contract.id,
      response.document_id,
    ]);
    await head.query('COMMIT');
    const before = await onPreviousHead(functions);
    expect(await onPreviousHead(apply)).toEqual({
      code: '23514',
      message: '1 document(s) are named by a payer response and by a contract version; nothing was changed (docs/runbooks/deploy-and-rollback.md)',
    });
    expect(await columnExists()).toBe(false);
    expect(await onPreviousHead(functions)).toEqual(before);
  });
});
