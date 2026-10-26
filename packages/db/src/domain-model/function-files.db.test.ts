import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readDatabaseUrl } from '../config';
import { migrate } from '../migrate';
import { type ScratchDatabase, createScratchDatabase } from '../testing';
import { firstDifference } from './approval';
import { compareFunctionDirectory, describeDifference, sameDirectory } from './function-files';
import { FUNCTION_FILE_BANNER } from './functions';
import { type GeneratedDomainModel, generateDomainModel, generateFromCatalog, readDatabase } from './generate';
import { DOMAIN_MODEL_DOCUMENT, DomainModelError, FUNCTIONS_DIRECTORY, REPO_ROOT } from './sources';

/**
 * The function files' drift half (docs/adr/0068; DBF-01), beside the document's in domain-model.db.test.ts, which
 * stays the database suite's one case on the document (tools/test/workflows.test.ts, CI-09). A fresh database
 * migrated with every migration must regenerate exactly packages/db/functions, so a migration merged without
 * regenerating them fails here as well as in the `domain model` job's --check; and what the generator prints must not
 * depend on the connection's own settings. And the CLI itself (DBF-04), spawned against the same scratch database: its
 * exit codes, both halves of --check, the custom-FILE rule, INIT_CWD and --out. Synthetic schema only: the
 * repository's migrations on a scratch database.
 */
const committed = readFileSync(DOMAIN_MODEL_DOCUMENT, 'utf8');
const regenerate = 'regenerate them with pnpm db:domain-model --out on a freshly migrated database, and commit packages/db/functions';

let database: ScratchDatabase | undefined;
let generated: GeneratedDomainModel | undefined;
const directories: string[] = [];

beforeAll(async () => {
  database = await createScratchDatabase(readDatabaseUrl());
  await migrate({ databaseUrl: database.url });
  generated = await generateDomainModel({ databaseUrl: database.url });
}, 180_000);

afterAll(async () => {
  await database?.drop();
  for (const dir of directories) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'domain-model-functions-'));
  directories.push(dir);
  return dir;
}

function scratchUrl(): string {
  if (database === undefined) throw new Error('the database was not created');
  return database.url;
}

function regenerated(): GeneratedDomainModel {
  if (generated === undefined) throw new Error('the migrated database was not read');
  return generated;
}

describe('DBF-01: packages/db/functions', () => {
  it('matches the functions of a fresh migrated database: no file missing, extra or differing', async () => {
    const files = regenerated().functionFiles;
    const difference = compareFunctionDirectory(FUNCTIONS_DIRECTORY, files);
    expect(sameDirectory(difference), `packages/db/functions does not match the schema; ${regenerate}:\n  ${describeDifference(FUNCTIONS_DIRECTORY, difference).join('\n  ')}`).toBe(true);
    // One file per function name, and only the names the document's Appendix C lists, but a member of an extension:
    // Appendix C lists it, its file is left out (its definition belongs to the extension's version). None exists today;
    // the first extension a migration installs into public is on the ADR's "Revisit when" list.
    const client = new pg.Client({ connectionString: scratchUrl() });
    await client.connect();
    let extensionMembers: string[];
    try {
      const { rows } = await client.query<{ name: string }>(
        `SELECT DISTINCT p.proname AS name FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')`,
      );
      extensionMembers = rows.map((r) => `${r.name}.sql`);
    } finally {
      await client.end();
    }
    const names = new Set([...committed.matchAll(/^\| `([a-z_][a-z0-9_]*)\(/gm)].map((m) => `${m[1] ?? ''}.sql`).filter((name) => !extensionMembers.includes(name)));
    expect([...files.keys()].sort()).toEqual([...names].sort());
  });

  it('a stray file beside them fails the comparison', () => {
    const copy = mkdtempSync(path.join(tmpdir(), 'domain-model-functions-'));
    directories.push(copy);
    cpSync(FUNCTIONS_DIRECTORY, copy, { recursive: true });
    writeFileSync(path.join(copy, 'gate_probe_stray.sql'), '-- not generated\n');
    expect(compareFunctionDirectory(copy, regenerated().functionFiles).extra).toEqual(['gate_probe_stray.sql']);
  });

  it("is the same under a connection whose search_path, DateStyle, IntervalStyle, TimeZone, identifier quoting and float and bytea output differ from the generator's", async () => {
    const first = regenerated();
    if (database === undefined) throw new Error('the database was not created');
    const admin = new pg.Client({ connectionString: database.url });
    await admin.connect();
    try {
      // Every new connection to the database starts with these: the generator's SET LOCALs must override each.
      await admin.query(`ALTER DATABASE ${database.name} SET search_path = pg_catalog, pg_temp`);
      await admin.query(`ALTER DATABASE ${database.name} SET DateStyle = 'SQL, DMY'`);
      await admin.query(`ALTER DATABASE ${database.name} SET IntervalStyle = 'iso_8601'`);
      await admin.query(`ALTER DATABASE ${database.name} SET TimeZone = 'Pacific/Chatham'`);
      // quote_all_identifiers changes regprocedure, quote_ident and pg_get_functiondef: every file and the document.
      await admin.query(`ALTER DATABASE ${database.name} SET quote_all_identifiers = on`);
      await admin.query(`ALTER DATABASE ${database.name} SET extra_float_digits = 3`);
      await admin.query(`ALTER DATABASE ${database.name} SET bytea_output = 'escape'`);
    } finally {
      await admin.end();
    }
    const probe = new pg.Client({ connectionString: database.url });
    await probe.connect();
    try {
      const { rows } = await probe.query<{ search_path: string; datestyle: string; quoted: string; digits: string }>(
        `SELECT current_setting('search_path') AS search_path, current_setting('DateStyle') AS datestyle, current_setting('quote_all_identifiers') AS quoted, current_setting('extra_float_digits') AS digits`,
      );
      expect(rows[0]).toEqual({ search_path: 'pg_catalog, pg_temp', datestyle: 'SQL, DMY', quoted: 'on', digits: '3' });
    } finally {
      await probe.end();
    }
    const second = await generateDomainModel({ databaseUrl: database.url });
    expect([...second.functionFiles]).toEqual([...first.functionFiles]);
    expect(firstDifference(first.text, second.text)).toBeNull();
  }, 60_000);
});

describe('DBF-04: the document is the same with the function files as without (T6)', () => {
  it('renders the same text and SHA-256 from the catalog with every field only the files print changed', async () => {
    const read = await readDatabase(scratchUrl());
    const options = { commit: '0000000', branch: 'probe' };
    const plain = generateFromCatalog(read, options);
    const changed = generateFromCatalog(
      {
        ...read,
        catalog: {
          ...read.catalog,
          functions: read.catalog.functions.map((f) => ({
            ...f,
            definition: `CREATE OR REPLACE FUNCTION public.${f.signature}\n RETURNS void\n LANGUAGE sql\nAS $function$ SELECT 'changed' $function$\n`,
            owner: 'gate_probe_owner',
            owner_ident: 'gate_probe_owner',
            acl: [{ grantee: null, grantee_ident: 'PUBLIC', grantor: 'gate_probe_owner', grantor_ident: 'gate_probe_owner', grantable: true }],
            comment: 'a synthetic comment',
            kind: f.kind === 'p' ? 'f' : 'p',
            sql_standard_body: !f.sql_standard_body,
          })),
          functionPolicies: read.catalog.functions.map((f) => ({ function_signature: f.signature, table_name: 'gate_probe_table', policy_name: 'gate_probe_policy' })),
          eventTriggers: read.catalog.functions.map((f) => ({ function_signature: f.signature, name: 'gate_probe_event', event: 'ddl_command_end' })),
        },
      },
      options,
    );
    // The files did change, so the fields reached them; the document did not.
    expect([...changed.functionFiles.values()].every((text) => text.includes('a synthetic comment'))).toBe(true);
    expect(firstDifference(plain.text, changed.text)).toBeNull();
    expect(changed.text).toBe(plain.text);
    expect(changed.sha256).toBe(plain.sha256);
    // And an extension member, dropped from the files, stays in the document.
    const members = generateFromCatalog({ ...read, catalog: { ...read.catalog, functions: read.catalog.functions.map((f) => ({ ...f, extension_member: true })) } }, options);
    expect(members.functionFiles.size).toBe(0);
    expect(members.sha256).toBe(plain.sha256);
  }, 60_000);
});

/** The CLI, `pnpm db:domain-model`, as tsx runs it, against the scratch database; INIT_CWD is the caller's directory. */
const TSX = path.join(REPO_ROOT, 'node_modules/.bin/tsx');
const CLI = path.join(REPO_ROOT, 'packages/db/src/cli/domain-model.ts');
function cli(args: readonly string[], initCwd: string): { readonly status: number | null; readonly stdout: string; readonly stderr: string } {
  const result = spawnSync(TSX, [CLI, ...args, '--database-url', scratchUrl()], {
    cwd: path.join(REPO_ROOT, 'packages/db'),
    encoding: 'utf8',
    env: { ...process.env, INIT_CWD: initCwd },
    timeout: 120_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** A scratch copy of the committed document and function files, in a new directory. */
function copies(): { readonly dir: string; readonly doc: string; readonly functions: string } {
  const dir = tempDir();
  const doc = path.join(dir, 'domain-model.md');
  const functions = path.join(dir, 'functions');
  writeFileSync(doc, committed);
  cpSync(FUNCTIONS_DIRECTORY, functions, { recursive: true });
  return { dir, doc, functions };
}

describe('DBF-04: the CLI (T5)', () => {
  it('--check reports a document edit and a stray function file, both, then exits 1', () => {
    const { dir, doc, functions } = copies();
    writeFileSync(doc, committed.replace(/^# .*$/m, '# Domain model, edited by the probe'));
    writeFileSync(path.join(functions, 'gate_probe_stray.sql'), '-- not generated\n');
    const result = cli(['--check', doc, '--functions', functions], dir);
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain(`db:domain-model: ${doc} does not match the schema;`);
    expect(result.stderr).toContain('+ # Domain model');
    expect(result.stderr).toContain(`db:domain-model: ${functions} does not match the functions of the schema;`);
    expect(result.stderr).toContain(`extra: ${path.join(functions, 'gate_probe_stray.sql')}`);
  }, 120_000);

  it('--check passes on exact copies named relative to INIT_CWD, the caller directory', () => {
    const { dir } = copies();
    const result = cli(['--check', 'domain-model.md', '--functions', 'functions'], dir);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(`${path.join(dir, 'domain-model.md')} matches the schema`);
    expect(result.stdout).toContain(`${path.join(dir, 'functions')} matches the schema's ${String(regenerated().functionFiles.size)} function names`);
  }, 120_000);

  it('a symlinked functions directory exits 2', () => {
    const { dir, doc, functions } = copies();
    const link = path.join(dir, 'linked');
    symlinkSync(functions, link);
    const result = cli(['--check', doc, '--functions', link], dir);
    expect(result.status, result.stderr).toBe(2);
    expect(result.stderr).toContain(`${link} is a symlink`);
  }, 120_000);

  it('a custom FILE without --functions exits 2 and writes nothing', () => {
    const dir = tempDir();
    for (const flag of ['--out', '--check']) {
      const result = cli([flag, path.join(dir, 'preview.md')], dir);
      expect(result.status, result.stderr).toBe(2);
      expect(result.stderr).toContain('give --functions DIR with a custom FILE');
    }
    expect(readdirSync(dir)).toEqual([]);
  });

  it('--function-diffs takes list or full, and only with --summary-since', () => {
    const dir = tempDir();
    expect(cli(['--summary-since', 'HEAD', '--function-diffs', 'all'], dir).stderr).toContain('--function-diffs takes list or full, not "all"');
    expect(cli(['--summary-since', 'HEAD', '--function-diffs', 'all'], dir).status).toBe(2);
    expect(cli(['--check', '--function-diffs', 'list'], dir).status).toBe(2);
  });

  it('--out writes the document and the directory, then the summary with the function section', () => {
    const dir = tempDir();
    const result = cli(['--out', 'written.md', '--functions', 'written', '--summary-since', 'HEAD', '--function-diffs', 'list'], dir);
    expect(result.status, result.stderr).toBe(0);
    expect(firstDifference(readFileSync(path.join(dir, 'written.md'), 'utf8'), regenerated().text)).toBeNull();
    const written = path.join(dir, 'written');
    expect(sameDirectory(compareFunctionDirectory(written, regenerated().functionFiles))).toBe(true);
    expect(result.stdout).toContain(`wrote ${written}: ${String(regenerated().functionFiles.size)} function files, ${String(regenerated().functionFiles.size)} written, 0 removed`);
    expect(result.stdout).toContain('## Changes since the last approved document');
    expect(result.stdout).toContain('## Function definitions changed since HEAD');
    expect(result.stdout).toContain("- These are the files this run generated from the migrated database's catalog.");
    expect(result.stdout).not.toContain('### Diffs');
  }, 120_000);

  it('--out refuses a directory holding a *.sql that is not the generator, before writing the document (N5, S3)', () => {
    const dir = tempDir();
    const functions = path.join(dir, 'functions');
    mkdirSync(functions);
    writeFileSync(path.join(functions, '20260101000000_init.sql'), 'CREATE TABLE gate_probe_important();\n');
    writeFileSync(path.join(functions, 'gate_probe_stale.sql'), `${FUNCTION_FILE_BANNER.join('\n')}\n`);
    const result = cli(['--out', 'out.md', '--functions', 'functions'], dir);
    expect(result.status, result.stderr).toBe(2);
    expect(result.stderr).toContain('20260101000000_init.sql is not a generated function file');
    expect(existsSync(path.join(dir, 'out.md'))).toBe(false);
    expect(readdirSync(functions).sort()).toEqual(['20260101000000_init.sql', 'gate_probe_stale.sql']);
  }, 120_000);
});

describe('DBF-03: functions outside schema public (S2)', () => {
  it('none exists on a freshly migrated database, and one refuses the generator, naming it', async () => {
    expect((await readDatabase(scratchUrl())).catalog.otherSchemaFunctions).toEqual([]);
    const admin = new pg.Client({ connectionString: scratchUrl() });
    await admin.connect();
    try {
      await admin.query('CREATE SCHEMA gate_probe_priv');
      await admin.query(`CREATE FUNCTION gate_probe_priv.gate_probe_leak() RETURNS SETOF text LANGUAGE sql SECURITY DEFINER AS $$ SELECT 'x' $$`);
      const refused = generateDomainModel({ databaseUrl: scratchUrl() });
      await expect(refused).rejects.toThrow(DomainModelError);
      await expect(generateDomainModel({ databaseUrl: scratchUrl() })).rejects.toThrow(/a function outside schema public would have no function file and no diff: gate_probe_priv\.gate_probe_leak\(\)/);
    } finally {
      await admin.query('DROP SCHEMA IF EXISTS gate_probe_priv CASCADE');
      await admin.end();
    }
  }, 60_000);
});

