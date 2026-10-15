import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { OWNER_ROLE, appDevLoginUrl, migrate, readDatabaseUrl } from '@tp/db';
import { withScratchDatabase } from '@tp/db/testing';
import { MANIFEST_FILE, buildManifest, recordSha256, serializeManifest, sha256 } from '@tp/rules';
import { fileSha256, listContentFiles, readRelease } from '@tp/rules/content';
import { ReleaseLoadError, loadRelease } from '@tp/rules/loader';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { repositoryRoot } from '../content-files';
import { SYNTHETIC_RELEASE_DIR } from './synthetic';

const adminUrl = readDatabaseUrl();
const fixture = path.join(repositoryRoot, SYNTHETIC_RELEASE_DIR);
const fixtureRecords = readRelease(fixture).records.map((located) => located.record);

async function connect(url: string, role?: string): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  if (role !== undefined) {
    await client.query(`SET ROLE ${role}`);
  }
  return client;
}

/** Runs `body` against a migrated scratch database with the synthetic release loaded by the owner. */
async function withLoadedRelease(body: (url: string) => Promise<void>): Promise<void> {
  await withScratchDatabase(adminUrl, async (url) => {
    await migrate({ databaseUrl: url, devLogin: true });
    const owner = await connect(url, OWNER_ROLE);
    try {
      await loadRelease(owner, fixture);
    } finally {
      await owner.end();
    }
    await body(url);
  });
}

async function expectRefused(client: pg.Client, statement: string, pattern: RegExp | string): Promise<void> {
  await expect(client.query(statement), statement).rejects.toThrow(pattern);
}

let scratch = '';

beforeEach(() => {
  scratch = mkdtempSync(path.join(tmpdir(), 'release-load-'));
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe('loading the synthetic release', () => {
  it('loads every record into an empty database, published, with its manifest and notes', async () => {
    await withScratchDatabase(adminUrl, async (url) => {
      await migrate({ databaseUrl: url });
      const owner = await connect(url, OWNER_ROLE);
      try {
        const result = await loadRelease(owner, fixture);
        expect(result).toEqual({ status: 'loaded', releaseNo: 1, manifestSha256: sha256(readFileSync(path.join(fixture, MANIFEST_FILE))), records: fixtureRecords.length });

        const releases = await owner.query<{ release_no: number; manifest_sha256: string; published: boolean; notes: string }>(
          'SELECT release_no, manifest_sha256, published_at IS NOT NULL AS published, notes FROM rule_release',
        );
        expect(releases.rows).toEqual([
          { release_no: 1, manifest_sha256: result.manifestSha256, published: true, notes: readFileSync(path.join(fixture, 'RELEASE.md'), 'utf8') },
        ]);

        const rows = await owner.query<{ record_type: string; key: unknown; value: unknown; effective_from: string; effective_to: string | null; verification: string; sha256: string; source: { sha256: string; quotes: string[] } }>(
          "SELECT record_type, key, value, to_char(effective_from, 'YYYY-MM-DD') AS effective_from, to_char(effective_to, 'YYYY-MM-DD') AS effective_to, verification, sha256, source FROM rule_record WHERE release_no = 1",
        );
        expect(rows.rows).toHaveLength(fixtureRecords.length);
        const byHash = new Map(rows.rows.map((row) => [row.sha256, row]));
        for (const record of fixtureRecords) {
          const row = byHash.get(recordSha256(record));
          expect(row, `${record.record_type} ${JSON.stringify(record.key)}`).toBeDefined();
          expect(row).toMatchObject({
            record_type: record.record_type,
            key: record.key,
            value: record.value,
            effective_from: record.effective_from,
            effective_to: record.effective_to,
            verification: record.verification.level,
            source: { sha256: record.source.sha256, quotes: record.quotes },
          });
        }
        const types = await owner.query<{ count: string }>('SELECT count(DISTINCT record_type) AS count FROM rule_record');
        expect(types.rows).toEqual([{ count: '16' }]);
      } finally {
        await owner.end();
      }
    });
  });

  it('loads the same release again as a no-op', async () => {
    await withLoadedRelease(async (url) => {
      const owner = await connect(url, OWNER_ROLE);
      try {
        expect(await loadRelease(owner, fixture)).toMatchObject({ status: 'already_loaded', releaseNo: 1 });
        expect((await owner.query('SELECT 1 FROM rule_record')).rowCount).toBe(fixtureRecords.length);
      } finally {
        await owner.end();
      }
    });
  });

  it('refuses different content under a number already loaded', async () => {
    await withLoadedRelease(async (url) => {
      cpSync(fixture, scratch, { recursive: true });
      writeFileSync(path.join(scratch, 'RELEASE.md'), '# SYNTHETIC test release 1, edited\n');
      const hashes = new Map(listContentFiles(scratch).filter((file) => file.path !== MANIFEST_FILE).map((file) => [file.path, fileSha256(path.join(scratch, file.path))]));
      writeFileSync(path.join(scratch, MANIFEST_FILE), serializeManifest(buildManifest(1, hashes)));
      const owner = await connect(url, OWNER_ROLE);
      try {
        await expect(loadRelease(owner, scratch)).rejects.toThrow(/release 1 is already loaded from a different manifest/);
      } finally {
        await owner.end();
      }
    });
  });

  it('refuses a release that does not match its manifest, loading nothing', async () => {
    await withScratchDatabase(adminUrl, async (url) => {
      await migrate({ databaseUrl: url });
      cpSync(fixture, scratch, { recursive: true });
      const file = path.join(scratch, 'pfs_rvu/2026/PPRRVU_SYNTHETIC.json');
      writeFileSync(file, readFileSync(file, 'utf8').replace('"work_rvu":"0.31"', '"work_rvu":"0.41"'));
      const owner = await connect(url, OWNER_ROLE);
      try {
        await expect(loadRelease(owner, scratch)).rejects.toThrow(ReleaseLoadError);
        await expect(loadRelease(owner, scratch)).rejects.toThrow(/pfs_rvu\/2026\/PPRRVU_SYNTHETIC.json does not match its SHA-256/);
        expect((await owner.query('SELECT 1 FROM rule_release')).rowCount).toBe(0);
      } finally {
        await owner.end();
      }
    });
  });
});

describe('a loaded release', () => {
  it('is immutable for the owner and for a superuser', async () => {
    await withLoadedRelease(async (url) => {
      for (const client of [await connect(url, OWNER_ROLE), await connect(url)]) {
        try {
          await expectRefused(client, "UPDATE rule_record SET value = '{}'::jsonb", /rule_record rows are immutable/);
          await expectRefused(client, 'DELETE FROM rule_record', /rule_record rows are immutable/);
          await expectRefused(client, 'TRUNCATE rule_record', /cannot be truncated/);
          await expectRefused(
            client,
            `INSERT INTO rule_record (release_no, record_type, key, value, effective_from, source, verification, sha256)
             VALUES (1, 'carc', '{"code":"9002"}', '{}', '2026-01-01', '{}', 'L1', '${'a'.repeat(64)}')`,
            /rule_release 1 is published: no record can be added/,
          );
          await expectRefused(client, "UPDATE rule_release SET notes = 'changed'", /rule_release 1 is immutable/);
          await expectRefused(client, 'UPDATE rule_release SET published_at = now()', /rule_release 1 is immutable/);
          await expectRefused(client, 'DELETE FROM rule_release', /rule_release 1 is immutable/);
          await expectRefused(client, 'TRUNCATE rule_release CASCADE', /cannot be truncated/);
        } finally {
          await client.end();
        }
      }
      const check = await connect(url);
      try {
        expect((await check.query('SELECT 1 FROM rule_record')).rowCount).toBe(fixtureRecords.length);
      } finally {
        await check.end();
      }
    });
  });

  it('can be read but never inserted, updated or deleted by the application role', async () => {
    await withLoadedRelease(async (url) => {
      const app = await connect(appDevLoginUrl(url));
      try {
        expect((await app.query('SELECT 1 FROM rule_record')).rowCount).toBe(fixtureRecords.length);
        expect((await app.query('SELECT 1 FROM rule_release')).rowCount).toBe(1);
        const denied = { code: '42501' };
        for (const statement of [
          `INSERT INTO rule_release (release_no, manifest_sha256) VALUES (2, '${'b'.repeat(64)}')`,
          "UPDATE rule_release SET notes = 'x'",
          'DELETE FROM rule_release',
          'TRUNCATE rule_release',
          `INSERT INTO rule_record (release_no, record_type, key, value, effective_from, source, verification, sha256) VALUES (1, 'carc', '{}', '{}', '2026-01-01', '{}', 'L1', '${'a'.repeat(64)}')`,
          "UPDATE rule_record SET verification = 'L3'",
          "UPDATE rule_record SET value = '{}'::jsonb",
          'DELETE FROM rule_record',
          'TRUNCATE rule_record',
        ]) {
          await expect(app.query(statement), statement).rejects.toMatchObject(denied);
        }
      } finally {
        await app.end();
      }
    });
  });

  it('cannot be loaded by the application role', async () => {
    await withScratchDatabase(adminUrl, async (url) => {
      await migrate({ databaseUrl: url, devLogin: true });
      const app = await connect(appDevLoginUrl(url));
      try {
        await expect(loadRelease(app, fixture)).rejects.toMatchObject({ code: '42501' });
        expect((await app.query('SELECT 1 FROM rule_release')).rowCount).toBe(0);
      } finally {
        await app.end();
      }
    });
  });
});
