import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { OWNER_ROLE, appDevLoginUrl, migrate, readDatabaseUrl } from '@tp/db';
import { withScratchDatabase } from '@tp/db/testing';
import { MANIFEST_FILE, buildManifest, recordSha256, serializeManifest, serializeRecords, sha256 } from '@tp/rules';
import { fileSha256, listContentFiles, readRelease } from '@tp/rules/content';
import { ReleaseLoadError, loadRelease } from '@tp/rules/loader';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { repositoryRoot } from '../content-files';
import { SYNTHETIC_RELEASE_DIR, SYNTHETIC_RELEASE_NUMBER } from './synthetic';

const adminUrl = readDatabaseUrl();
const fixture = path.join(repositoryRoot, SYNTHETIC_RELEASE_DIR);
const fixtureRecords = readRelease(fixture).records.map((located) => located.record);
/** The SYNTHETIC fixture loads only with the test-only option, into these scratch databases. */
const FIXTURE = { release: SYNTHETIC_RELEASE_NUMBER, allowSyntheticFixtureForTests: true } as const;

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
      await loadRelease(owner, fixture, FIXTURE);
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

/** Rewrites MANIFEST.json for the files now in `dir`, under release number `release`. */
function reseal(dir: string, release: number): void {
  const hashes = new Map(listContentFiles(dir).filter((file) => file.path !== MANIFEST_FILE).map((file) => [file.path, fileSha256(path.join(dir, file.path))]));
  writeFileSync(path.join(dir, MANIFEST_FILE), serializeManifest(buildManifest(release, hashes)));
}

/**
 * A one-file release in `dir` holding the fixture's therapy thresholds as if they were real content
 * at `level` (or still synthetic), numbered `release`. The loader does not read stored sources, so
 * the cited file need not exist.
 */
function realLookingRelease(dir: string, release: number, level: 'L1' | 'L2', synthetic = false): void {
  const records = fixtureRecords
    .filter((record) => record.record_type === 'therapy_threshold')
    .map((record) => ({
      ...record,
      source: synthetic ? record.source : { ...record.source, title: 'A real-looking source', url: 'https://example.invalid/source', path: 'content/sources/therapy_threshold/x.md', synthetic: false },
      verification: { level, by: level === 'L1' ? 'pnpm verify-content' : 'A. Reviewer', on: '2026-10-20', questions: [] },
    }));
  mkdirSync(path.join(dir, 'therapy_threshold/2026'), { recursive: true });
  writeFileSync(path.join(dir, 'therapy_threshold/2026/records.json'), serializeRecords(records));
  writeFileSync(path.join(dir, 'RELEASE.md'), `# release ${String(release)}\n`);
  reseal(dir, release);
}

async function releaseCount(client: pg.Client): Promise<number> {
  return (await client.query('SELECT 1 FROM rule_release')).rowCount ?? 0;
}

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
        const result = await loadRelease(owner, fixture, FIXTURE);
        expect(result).toEqual({ status: 'loaded', releaseNo: SYNTHETIC_RELEASE_NUMBER, manifestSha256: sha256(readFileSync(path.join(fixture, MANIFEST_FILE))), records: fixtureRecords.length });

        const releases = await owner.query<{ release_no: number; manifest_sha256: string; published: boolean; notes: string }>(
          'SELECT release_no, manifest_sha256, published_at IS NOT NULL AS published, notes FROM rule_release',
        );
        expect(releases.rows).toEqual([
          { release_no: SYNTHETIC_RELEASE_NUMBER, manifest_sha256: result.manifestSha256, published: true, notes: readFileSync(path.join(fixture, 'RELEASE.md'), 'utf8') },
        ]);

        const rows = await owner.query<{ record_type: string; key: unknown; value: unknown; effective_from: string; effective_to: string | null; verification: string; sha256: string; source: { sha256: string; quotes: string[] } }>(
          "SELECT record_type, key, value, to_char(effective_from, 'YYYY-MM-DD') AS effective_from, to_char(effective_to, 'YYYY-MM-DD') AS effective_to, verification, sha256, source FROM rule_record WHERE release_no = $1",
          [SYNTHETIC_RELEASE_NUMBER],
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

  it('leaves the release analyzed and frozen once loaded, so the first screening after a load reads it by its indexes', async () => {
    // CI's capacity run on 9eb4474 read a release just loaded, before any ANALYZE: with no statistics each keyed read
    // hash-joined all 2.2 million records of the release, setting every page's hint bits as it went, and S1-1 recorded
    // no batch for five minutes. The loader now analyzes rule_record and freezes the records it wrote, which never change.
    await withLoadedRelease(async (url) => {
      const admin = await connect(url);
      try {
        const stats = await admin.query<{ n: number }>("SELECT count(*)::integer AS n FROM pg_stats WHERE schemaname = 'public' AND tablename = 'rule_record'");
        expect(stats.rows[0]?.n).toBeGreaterThan(0);
        const table = await admin.query<{ reltuples: number; relpages: number; relallvisible: number; relallfrozen: number }>(
          "SELECT reltuples, relpages, relallvisible, relallfrozen FROM pg_class WHERE oid = 'rule_record'::regclass",
        );
        expect(table.rows[0]?.reltuples).toBe(fixtureRecords.length);
        // Every page all-visible and all-frozen: no reader sets a hint bit, and no anti-wraparound vacuum rewrites them.
        expect(table.rows[0]?.relallvisible).toBe(table.rows[0]?.relpages);
        expect(table.rows[0]?.relallfrozen).toBe(table.rows[0]?.relpages);
      } finally {
        await admin.end();
      }
    });
  });

  it('loads the same release again as a no-op', async () => {
    await withLoadedRelease(async (url) => {
      const owner = await connect(url, OWNER_ROLE);
      try {
        expect(await loadRelease(owner, fixture, FIXTURE)).toMatchObject({ status: 'already_loaded', releaseNo: SYNTHETIC_RELEASE_NUMBER });
        expect((await owner.query('SELECT 1 FROM rule_record')).rowCount).toBe(fixtureRecords.length);
      } finally {
        await owner.end();
      }
    });
  });

  it('refuses different content under a number already loaded', async () => {
    await withLoadedRelease(async (url) => {
      cpSync(fixture, scratch, { recursive: true });
      writeFileSync(path.join(scratch, 'RELEASE.md'), '# SYNTHETIC test release, edited\n');
      reseal(scratch, SYNTHETIC_RELEASE_NUMBER);
      const owner = await connect(url, OWNER_ROLE);
      try {
        await expect(loadRelease(owner, scratch, FIXTURE)).rejects.toThrow(/release 900001 is already loaded from a different manifest/);
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
        await expect(loadRelease(owner, scratch, FIXTURE)).rejects.toThrow(ReleaseLoadError);
        await expect(loadRelease(owner, scratch, FIXTURE)).rejects.toThrow(/pfs_rvu\/2026\/PPRRVU_SYNTHETIC.json does not match its SHA-256/);
        expect((await owner.query('SELECT 1 FROM rule_release')).rowCount).toBe(0);
      } finally {
        await owner.end();
      }
    });
  });
});

describe('what the loader refuses before writing anything', () => {
  async function withOwner(body: (owner: pg.Client) => Promise<void>): Promise<void> {
    await withScratchDatabase(adminUrl, async (url) => {
      await migrate({ databaseUrl: url });
      const owner = await connect(url, OWNER_ROLE);
      try {
        await body(owner);
        expect(await releaseCount(owner)).toBe(0);
      } finally {
        await owner.end();
      }
    });
  }

  it('refuses the SYNTHETIC fixture without the test-only option, under any number', async () => {
    await withOwner(async (owner) => {
      await expect(loadRelease(owner, fixture, { release: SYNTHETIC_RELEASE_NUMBER })).rejects.toThrow(/reserved for SYNTHETIC fixture releases/);
      await expect(loadRelease(owner, fixture, { release: SYNTHETIC_RELEASE_NUMBER })).rejects.toThrow(/is SYNTHETIC; invented values never load as rule content/);
      await expect(loadRelease(owner, fixture, { release: SYNTHETIC_RELEASE_NUMBER })).rejects.toThrow(/is at verification L1/);
      cpSync(fixture, scratch, { recursive: true });
      reseal(scratch, 1);
      await expect(loadRelease(owner, scratch, { release: 1 })).rejects.toThrow(/is SYNTHETIC; invented values never load as rule content/);
    });
  });

  it('refuses a release whose manifest names another number than the one asked for', async () => {
    await withOwner(async (owner) => {
      await expect(loadRelease(owner, fixture, { ...FIXTURE, release: 5 })).rejects.toThrow(/MANIFEST.json names release 900001, not 5/);
      realLookingRelease(scratch, 2, 'L2');
      await expect(loadRelease(owner, scratch, { release: 3 })).rejects.toThrow(/MANIFEST.json names release 2, not 3/);
    });
  });

  it('refuses records below L2, and synthetic records marked L2', async () => {
    await withOwner(async (owner) => {
      realLookingRelease(scratch, 2, 'L1');
      await expect(loadRelease(owner, scratch, { release: 2 })).rejects.toThrow(/therapy_threshold .* is at verification L1; a release loads only records verified to L2 or L3/);
      realLookingRelease(scratch, 2, 'L2', true);
      await expect(loadRelease(owner, scratch, { release: 2 })).rejects.toThrow(/is SYNTHETIC/);
    });
  });

  it('refuses the test-only option for a real release number or real records', async () => {
    await withOwner(async (owner) => {
      realLookingRelease(scratch, 2, 'L2');
      await expect(loadRelease(owner, scratch, { release: 2, allowSyntheticFixtureForTests: true })).rejects.toThrow(/release 2 is a real release number/);
      realLookingRelease(scratch, 900_002, 'L2');
      await expect(loadRelease(owner, scratch, { release: 900_002, allowSyntheticFixtureForTests: true })).rejects.toThrow(/is not synthetic; a fixture release holds only SYNTHETIC records/);
    });
  });

  it('loads a verified, real release under its own number', async () => {
    await withScratchDatabase(adminUrl, async (url) => {
      await migrate({ databaseUrl: url });
      realLookingRelease(scratch, 2, 'L2');
      const owner = await connect(url, OWNER_ROLE);
      try {
        expect(await loadRelease(owner, scratch, { release: 2 })).toMatchObject({ status: 'loaded', releaseNo: 2, records: 2 });
        expect((await owner.query<{ verification: string }>('SELECT DISTINCT verification FROM rule_record')).rows).toEqual([{ verification: 'L2' }]);
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
             VALUES (${String(SYNTHETIC_RELEASE_NUMBER)}, 'carc', '{"code":"9002"}', '{}', '2026-01-01', '{}', 'L1', '${'a'.repeat(64)}')`,
            /rule_release 900001 is published: no record can be added/,
          );
          await expectRefused(client, "UPDATE rule_release SET notes = 'changed'", /rule_release 900001 is immutable/);
          await expectRefused(client, 'UPDATE rule_release SET published_at = now()', /rule_release 900001 is immutable/);
          await expectRefused(client, 'DELETE FROM rule_release', /rule_release 900001 is immutable/);
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
          `INSERT INTO rule_record (release_no, record_type, key, value, effective_from, source, verification, sha256) VALUES (${String(SYNTHETIC_RELEASE_NUMBER)}, 'carc', '{}', '{}', '2026-01-01', '{}', 'L1', '${'a'.repeat(64)}')`,
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
        await expect(loadRelease(app, fixture, FIXTURE)).rejects.toMatchObject({ code: '42501' });
        expect((await app.query('SELECT 1 FROM rule_release')).rowCount).toBe(0);
      } finally {
        await app.end();
      }
    });
  });
});
