import { copyFileSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readDatabaseUrl } from '../config';
import { MIGRATIONS_DIR, migrate } from '../migrate';
import { type ScratchDatabase, createScratchDatabase } from '../testing';
import { APPROVAL_PREFIX, approvalLineOf, documentApprovalProblems, firstDifference } from './approval';
import { type GeneratedDomainModel, generateDomainModel } from './generate';

/**
 * What the approval binds (CO-02; reconciliation-001, PR 2: "an approval never carries over to a
 * regenerated document"). A migration edited after the document was generated and signed, as a review
 * fix to a pull request's new migration would be, must change the document and its hash, even when the
 * edit only changes a function's body. And the document must show what changes behaviour without
 * changing a table: a trigger disabled or set to replica-only, a rewrite rule, a default privilege.
 * Synthetic schema only: a probe migration appended to a copy of the migrations directory.
 */
const PROBE = '29991231000000_gate_probe.sql';
const probe = (body: string): string =>
  ['-- The domain model drift probe (domain-model-drift.db.test.ts); never a real migration.', `CREATE FUNCTION gate_probe() RETURNS integer LANGUAGE sql IMMUTABLE AS $$ ${body} $$;`, 'REVOKE ALL ON FUNCTION gate_probe() FROM PUBLIC;', ''].join('\n');

const directories: string[] = [];
const databases: ScratchDatabase[] = [];

/** A copy of the migrations with the probe at `body`, migrated into a new scratch database, and its document. */
async function migratedWithProbe(body: string): Promise<{ readonly database: ScratchDatabase; readonly migrationsDir: string; readonly document: GeneratedDomainModel }> {
  const migrationsDir = mkdtempSync(path.join(tmpdir(), 'domain-model-probe-'));
  directories.push(migrationsDir);
  for (const file of readdirSync(MIGRATIONS_DIR)) copyFileSync(path.join(MIGRATIONS_DIR, file), path.join(migrationsDir, file));
  writeFileSync(path.join(migrationsDir, PROBE), probe(body));
  const database = await createScratchDatabase(readDatabaseUrl());
  databases.push(database);
  await migrate({ databaseUrl: database.url, migrationsDir });
  return { database, migrationsDir, document: await generateDomainModel({ databaseUrl: database.url, migrationsDir, strict: true, commit: 'probe', branch: 'probe' }) };
}

/** The document signed by a person on a valid date, as the founder would sign it. */
const signed = (document: GeneratedDomainModel): string => {
  const line = approvalLineOf(document.text) ?? '';
  return document.text.replace(line, () => `${APPROVAL_PREFIX} A. Founder  Date: 2026-10-17  Document SHA-256: \`${document.sha256}\``);
};

const lineWith = (text: string, needle: string): string | undefined => text.split('\n').find((line) => line.includes(needle));

let first: Awaited<ReturnType<typeof migratedWithProbe>> | undefined;
let edited: Awaited<ReturnType<typeof migratedWithProbe>> | undefined;

beforeAll(async () => {
  first = await migratedWithProbe('SELECT 1');
  edited = await migratedWithProbe('SELECT 2');
}, 180_000);

afterAll(async () => {
  await Promise.all(databases.map((d) => d.drop()));
  for (const dir of directories) rmSync(dir, { recursive: true, force: true });
});

function both(): { readonly before: GeneratedDomainModel; readonly after: GeneratedDomainModel; readonly url: string; readonly migrationsDir: string } {
  if (first === undefined || edited === undefined) throw new Error('the probe databases were not migrated');
  return { before: first.document, after: edited.document, url: edited.database.url, migrationsDir: edited.migrationsDir };
}

describe('the domain model and an edited migration', () => {
  it("a migration's function body edited after the document was signed fails the drift case and the approval", () => {
    const { before, after } = both();
    const approved = signed(before);
    expect(documentApprovalProblems(approved, before.sha256)).toEqual([]);
    const difference = firstDifference(approved, after.text);
    expect(difference).not.toBeNull();
    expect(after.sha256).not.toBe(before.sha256);
    expect(documentApprovalProblems(approved, after.sha256)).toEqual([expect.stringMatching(/the document changed after it was approved$/)]);
    // Two lines show it: the probe's row in Appendix D (its file's SHA-256) and the function's body hash in Appendix C.
    const appendixRow = `| \`${PROBE}\` |`;
    expect(lineWith(before.text, appendixRow)).toBeDefined();
    expect(lineWith(after.text, appendixRow)).not.toBe(lineWith(before.text, appendixRow));
    expect(lineWith(after.text, '| `gate_probe()` |')).not.toBe(lineWith(before.text, '| `gate_probe()` |'));
  });

  it('shows a function body, a disabled trigger, a rewrite rule and a default privilege, each changed alone', async () => {
    const { after, url, migrationsDir } = both();
    const regenerate = async (): Promise<string> => (await generateDomainModel({ databaseUrl: url, migrationsDir, commit: 'probe', branch: 'probe' })).text;
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    try {
      let previous = after.text;
      const change = async (sql: string): Promise<string> => {
        await client.query(sql);
        const text = await regenerate();
        expect(firstDifference(previous, text), sql).not.toBeNull();
        previous = text;
        return text;
      };

      const body = await change('CREATE OR REPLACE FUNCTION gate_probe() RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 3 $$');
      expect(lineWith(body, '| `gate_probe()` |')).not.toBe(lineWith(after.text, '| `gate_probe()` |'));

      const disabled = await change('ALTER TABLE agreement_event DISABLE TRIGGER agreement_event_append_only');
      expect(disabled).toContain('Triggers that do not fire in an ordinary session (not enforced):\n- `agreement_event_append_only` (disabled: not enforced): `BEFORE DELETE OR UPDATE ON agreement_event');
      expect(disabled).toContain('of which 1 disabled or replica-only (not enforced): `agreement_event.agreement_event_append_only`');
      expect(disabled).not.toContain('Invariants enforced by triggers:\n- `agreement_event_append_only`');

      const replica = await change('ALTER TABLE agreement_event ENABLE REPLICA TRIGGER agreement_event_append_only');
      expect(replica).toContain('- `agreement_event_append_only` (fires only under session_replication_role replica: not enforced)');

      const rule = await change('CREATE RULE agreement_event_keep AS ON DELETE TO agreement_event DO INSTEAD NOTHING');
      expect(rule).toContain('rewrite rules on tables: `agreement_event.agreement_event_keep`');
      expect(rule).toContain('Rewrite rules (1):\n- `agreement_event_keep`: `CREATE RULE agreement_event_keep AS');

      const privileges = await change('ALTER DEFAULT PRIVILEGES FOR ROLE tp_owner IN SCHEMA public GRANT ALL ON TABLES TO tp_app');
      expect(privileges).toContain('- Default privileges (ALTER DEFAULT PRIVILEGES): for `tp_owner` in `public` on tables: `tp_app=arwdDxtm/tp_owner`');
    } finally {
      await client.end();
    }
  }, 60_000);
});
