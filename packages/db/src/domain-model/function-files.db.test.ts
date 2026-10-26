import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readDatabaseUrl } from '../config';
import { migrate } from '../migrate';
import { type ScratchDatabase, createScratchDatabase } from '../testing';
import { firstDifference } from './approval';
import { compareFunctionDirectory, describeDifference, sameDirectory } from './function-files';
import { type GeneratedDomainModel, generateDomainModel } from './generate';
import { DOMAIN_MODEL_DOCUMENT, FUNCTIONS_DIRECTORY } from './sources';

/**
 * The function files' drift half (docs/adr/0068; DBF-01), beside the document's in domain-model.db.test.ts, which
 * stays the database suite's one case on the document (tools/test/workflows.test.ts, CI-09). A fresh database
 * migrated with every migration must regenerate exactly packages/db/functions, so a migration merged without
 * regenerating them fails here as well as in the `domain model` job's --check; and what the generator prints must not
 * depend on the connection's own settings. Synthetic schema only: the repository's migrations on a scratch database.
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

function regenerated(): GeneratedDomainModel {
  if (generated === undefined) throw new Error('the migrated database was not read');
  return generated;
}

describe('DBF-01: packages/db/functions', () => {
  it('matches the functions of a fresh migrated database: no file missing, extra or differing', () => {
    const files = regenerated().functionFiles;
    const difference = compareFunctionDirectory(FUNCTIONS_DIRECTORY, files);
    expect(sameDirectory(difference), `packages/db/functions does not match the schema; ${regenerate}:\n  ${describeDifference(FUNCTIONS_DIRECTORY, difference).join('\n  ')}`).toBe(true);
    // One file per function name, and only the names the document's Appendix C lists.
    const names = new Set([...committed.matchAll(/^\| `([a-z_][a-z0-9_]*)\(/gm)].map((m) => `${m[1] ?? ''}.sql`));
    expect([...files.keys()].sort()).toEqual([...names].sort());
  });

  it('a stray file beside them fails the comparison', () => {
    const copy = mkdtempSync(path.join(tmpdir(), 'domain-model-functions-'));
    directories.push(copy);
    cpSync(FUNCTIONS_DIRECTORY, copy, { recursive: true });
    writeFileSync(path.join(copy, 'gate_probe_stray.sql'), '-- not generated\n');
    expect(compareFunctionDirectory(copy, regenerated().functionFiles).extra).toEqual(['gate_probe_stray.sql']);
  });

  it("is the same under a connection whose search_path, DateStyle, IntervalStyle and TimeZone differ from the generator's", async () => {
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
    } finally {
      await admin.end();
    }
    const probe = new pg.Client({ connectionString: database.url });
    await probe.connect();
    try {
      const { rows } = await probe.query<{ search_path: string; datestyle: string }>(`SELECT current_setting('search_path') AS search_path, current_setting('DateStyle') AS datestyle`);
      expect(rows[0]).toEqual({ search_path: 'pg_catalog, pg_temp', datestyle: 'SQL, DMY' });
    } finally {
      await probe.end();
    }
    const second = await generateDomainModel({ databaseUrl: database.url });
    expect([...second.functionFiles]).toEqual([...first.functionFiles]);
    expect(firstDifference(first.text, second.text)).toBeNull();
  }, 60_000);
});
