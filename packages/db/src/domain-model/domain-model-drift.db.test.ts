import { createHash } from 'node:crypto';
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
 * The function files (docs/adr/0068; DBF-02) must show the same edit as the line it changed, and the changes the
 * document shows only as a hash or not at all: a grant, SECURITY DEFINER, a SET search_path.
 * Synthetic schema only: a probe migration appended to a copy of the migrations directory.
 */
const PROBE = '29991231000000_gate_probe.sql';
/**
 * The probe function: a plpgsql body over several lines, of which `statement` is the one the edit changes. Beside it,
 * unchanged by the edit, a procedure with a comment and a grant WITH GRANT OPTION, and a function with a BEGIN ATOMIC
 * body, so DBF-02 renders each kind through pg_get_functiondef and aclexplode, not only from hand-written rows.
 */
const probe = (statement: string): string =>
  [
    '-- The domain model drift probe (domain-model-drift.db.test.ts); never a real migration.',
    'CREATE FUNCTION gate_probe() RETURNS integer LANGUAGE plpgsql IMMUTABLE AS $$',
    'BEGIN',
    `  ${statement}`,
    'END',
    '$$;',
    'REVOKE ALL ON FUNCTION gate_probe() FROM PUBLIC;',
    "CREATE PROCEDURE gate_probe_proc(n integer) LANGUAGE plpgsql AS $$ BEGIN PERFORM n; END $$;",
    "COMMENT ON PROCEDURE gate_probe_proc(integer) IS 'the probe''s procedure';",
    'REVOKE ALL ON PROCEDURE gate_probe_proc(integer) FROM PUBLIC;',
    'GRANT EXECUTE ON PROCEDURE gate_probe_proc(integer) TO tp_app WITH GRANT OPTION;',
    'CREATE FUNCTION gate_probe_atomic(a integer) RETURNS integer LANGUAGE sql IMMUTABLE STRICT BEGIN ATOMIC SELECT a + 1; END;',
    'REVOKE ALL ON FUNCTION gate_probe_atomic(integer) FROM PUBLIC;',
    '',
  ].join('\n');

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
  return { database, migrationsDir, document: await generateDomainModel({ databaseUrl: database.url, migrationsDir, strict: true, commit: '0000000', branch: 'probe' }) };
}

/** A synthetic approver list, and the document signed by its one name on a valid date, as the founder would sign it. */
const check = { approvers: ['A. Signer'] };
const signed = (document: GeneratedDomainModel): string => {
  const line = approvalLineOf(document.text) ?? '';
  return document.text.replace(line, () => `${APPROVAL_PREFIX} A. Signer  Date: 2026-10-17  Document SHA-256: \`${document.sha256}\``);
};

const lineWith = (text: string, needle: string): string | undefined => text.split('\n').find((line) => line.includes(needle));

let first: Awaited<ReturnType<typeof migratedWithProbe>> | undefined;
let edited: Awaited<ReturnType<typeof migratedWithProbe>> | undefined;

beforeAll(async () => {
  first = await migratedWithProbe('RETURN 1;');
  edited = await migratedWithProbe('RETURN 2;');
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
    expect(documentApprovalProblems(approved, before.sha256, check)).toEqual([]);
    const difference = firstDifference(approved, after.text);
    expect(difference).not.toBeNull();
    expect(after.sha256).not.toBe(before.sha256);
    expect(documentApprovalProblems(approved, after.sha256, check)).toEqual([
      `the approval line's hash does not match the regenerated text: the line carries ${before.sha256}; the regenerated text's SHA-256 is ${after.sha256}`,
    ]);
    // Two lines show it: the probe's row in Appendix D (its file's SHA-256) and the function's body hash in Appendix C.
    const appendixRow = `| \`${PROBE}\` |`;
    expect(lineWith(before.text, appendixRow)).toBeDefined();
    expect(lineWith(after.text, appendixRow)).not.toBe(lineWith(before.text, appendixRow));
    expect(lineWith(after.text, '| `gate_probe()` |')).not.toBe(lineWith(before.text, '| `gate_probe()` |'));
  });

  it('shows a function body, a disabled trigger, a rewrite rule and a default privilege, each changed alone', async () => {
    const { after, url, migrationsDir } = both();
    const regenerate = async (): Promise<string> => (await generateDomainModel({ databaseUrl: url, migrationsDir, commit: '0000000', branch: 'probe' })).text;
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

/** The first 16 hex digits of the body hash Appendix C prints for `signature`. */
function appendixHash(text: string, signature: string): string | undefined {
  const row = lineWith(text, `| \`${signature}\` |`);
  return row === undefined ? undefined : /\| `([0-9a-f]{16})` \|$/.exec(row)?.[1];
}

const sha16 = (text: string): string => createHash('sha256').update(text).digest('hex').slice(0, 16);

/** The lines that differ between two texts of the same length in lines, as [line number, before, after]. */
function changedLines(before: string, after: string): [number, string, string][] {
  const a = before.split('\n');
  const b = after.split('\n');
  expect(b.length, 'the same number of lines').toBe(a.length);
  return a.flatMap((line, i): [number, string, string][] => (line === b[i] ? [] : [[i + 1, line, b[i] ?? '']]));
}

describe('DBF-02: the function files and an edited function', () => {
  it("a one-line body edit changes only that function's file, by that line and its body-hash line", () => {
    const { before, after } = both();
    expect([...after.functionFiles.keys()]).toEqual([...before.functionFiles.keys()]);
    const changed = [...after.functionFiles].filter(([name, text]) => before.functionFiles.get(name) !== text).map(([name]) => name);
    expect(changed).toEqual(['gate_probe.sql']);
    const lines = changedLines(before.functionFiles.get('gate_probe.sql') ?? '', after.functionFiles.get('gate_probe.sql') ?? '');
    expect(lines.map(([, was, is]) => [was, is])).toEqual([
      [`-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: ${String(appendixHash(before.text, 'gate_probe()'))}`, `-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: ${String(appendixHash(after.text, 'gate_probe()'))}`],
      ['  RETURN 1;', '  RETURN 2;'],
    ]);
  });

  it('the hash of the text between the delimiters is the Appendix C value, for a plpgsql body and a SQL-standard one', () => {
    const { after } = both();
    const plpgsql = after.functionFiles.get('gate_probe.sql') ?? '';
    const between = /\nAS \$function\$([\s\S]*?)\$function\$;\n/.exec(plpgsql)?.[1];
    expect(between).toBe('\nBEGIN\n  RETURN 2;\nEND\n');
    expect(sha16(between ?? '')).toBe(appendixHash(after.text, 'gate_probe()'));
    expect(plpgsql).toContain(`as Appendix C prints it: ${sha16(between ?? '')}\n`);
    // screening_standing has a SQL-standard body (RETURN ...): no dollar quotes, its body the text after the header.
    const standard = after.functionFiles.get('screening_standing.sql') ?? '';
    const body = /\n(RETURN [\s\S]*?);\nALTER FUNCTION /.exec(standard)?.[1];
    expect(body).toMatch(/^RETURN CASE /);
    expect(sha16(body ?? '')).toBe(appendixHash(after.text, 'screening_standing(bigint,bigint,bigint,bigint)'));
    expect(standard).toContain(`-- Body SHA-256 (the SQL-standard body only, from RETURN or BEGIN ATOMIC), as Appendix C prints it: ${sha16(body ?? '')}\n`);
  });

  it('a grant added, a SECURITY DEFINER flip, a SET search_path removed, a grant by another grantor and a calling policy each change the file', async () => {
    if (first === undefined) throw new Error('the probe database was not migrated');
    const { database, migrationsDir } = first;
    const client = new pg.Client({ connectionString: database.url });
    await client.connect();
    try {
      let previous = first.document.functionFiles;
      /** Runs `sql`, regenerates, and returns the lines `file` changed by; no other file may change. */
      const change = async (sql: string, file: string): Promise<[number, string, string][] | string[]> => {
        await client.query(sql);
        const files = (await generateDomainModel({ databaseUrl: database.url, migrationsDir, commit: '0000000', branch: 'probe' })).functionFiles;
        const changed = [...files].filter(([name, text]) => previous.get(name) !== text).map(([name]) => name);
        expect(changed, sql).toEqual([file]);
        const was = previous.get(file) ?? '';
        const is = files.get(file) ?? '';
        previous = files;
        const a = was.split('\n');
        const b = is.split('\n');
        // Lines added or removed: the lines one side has that the other lacks.
        return a.length === b.length ? changedLines(was, is) : [...b.filter((line) => !a.includes(line)).map((l) => `+${l}`), ...a.filter((line) => !b.includes(line)).map((l) => `-${l}`)];
      };

      expect(await change('GRANT EXECUTE ON FUNCTION gate_probe() TO tp_app', 'gate_probe.sql')).toEqual(['+GRANT EXECUTE ON FUNCTION public.gate_probe() TO tp_app;']);
      expect(await change('ALTER FUNCTION gate_probe() SECURITY DEFINER', 'gate_probe.sql')).toEqual([[expect.any(Number), ' IMMUTABLE', ' IMMUTABLE SECURITY DEFINER']]);
      expect(await change('ALTER FUNCTION allowed_practice_ids() RESET search_path', 'allowed_practice_ids.sql')).toEqual(["- SET search_path TO 'pg_catalog', 'public', 'pg_temp'"]);
      // A grant by a grantee holding the grant option, not the owner, says GRANTED BY.
      expect(await change('SET ROLE tp_app; GRANT EXECUTE ON PROCEDURE gate_probe_proc(integer) TO tp_operator; RESET ROLE', 'gate_probe_proc.sql')).toEqual([
        '+GRANT EXECUTE ON PROCEDURE public.gate_probe_proc(integer) TO tp_operator GRANTED BY tp_app;',
      ]);
      // A policy that calls the function names it in the function's header (pg_depend), which a reviewer reads
      // before changing its volatility or body.
      expect(await change('CREATE POLICY gate_probe_policy ON agreement_event USING (gate_probe() = 2)', 'gate_probe.sql')).toEqual([
        [expect.any(Number), '-- Called by policy: (none)', '-- Called by policy: agreement_event.gate_probe_policy'],
      ]);
    } finally {
      await client.end();
    }
  }, 60_000);
});

describe('DBF-02: a procedure and a BEGIN ATOMIC body, through pg_get_functiondef and aclexplode (T16)', () => {
  it('renders the procedure with its keyword, comment and grantable grant, and the SQL-standard body with its hash', () => {
    const { after } = both();
    const procedure = after.functionFiles.get('gate_probe_proc.sql') ?? '';
    expect(procedure.split('\n').slice(3)).toEqual([
      '-- gate_probe_proc(integer)',
      `-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: ${sha16(' BEGIN PERFORM n; END ')}`,
      '-- Trigger function of: (none)',
      '-- Called by policy: (none)',
      'CREATE OR REPLACE PROCEDURE public.gate_probe_proc(IN n integer)',
      ' LANGUAGE plpgsql',
      'AS $procedure$ BEGIN PERFORM n; END $procedure$;',
      'ALTER PROCEDURE public.gate_probe_proc(integer) OWNER TO tp_owner;',
      'REVOKE ALL ON PROCEDURE public.gate_probe_proc(integer) FROM PUBLIC;',
      'GRANT EXECUTE ON PROCEDURE public.gate_probe_proc(integer) TO tp_app WITH GRANT OPTION;',
      "COMMENT ON PROCEDURE public.gate_probe_proc(integer) IS 'the probe''s procedure';",
      '',
    ]);
    expect(appendixHash(after.text, 'gate_probe_proc(integer)')).toBe(sha16(' BEGIN PERFORM n; END '));
    const atomic = after.functionFiles.get('gate_probe_atomic.sql') ?? '';
    const body = 'BEGIN ATOMIC\n SELECT (a + 1);\nEND';
    expect(atomic.split('\n').slice(3)).toEqual([
      '-- gate_probe_atomic(integer)',
      `-- Body SHA-256 (the SQL-standard body only, from RETURN or BEGIN ATOMIC), as Appendix C prints it: ${sha16(body)}`,
      '-- Trigger function of: (none)',
      '-- Called by policy: (none)',
      'CREATE OR REPLACE FUNCTION public.gate_probe_atomic(a integer)',
      ' RETURNS integer',
      ' LANGUAGE sql',
      ' IMMUTABLE STRICT',
      ...`${body};`.split('\n'),
      'ALTER FUNCTION public.gate_probe_atomic(integer) OWNER TO tp_owner;',
      'REVOKE ALL ON FUNCTION public.gate_probe_atomic(integer) FROM PUBLIC;',
      '',
    ]);
    expect(appendixHash(after.text, 'gate_probe_atomic(integer)')).toBe(sha16(body));
  });
});

