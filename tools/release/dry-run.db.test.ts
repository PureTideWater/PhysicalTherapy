import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { OWNER_ROLE, openPool, readDatabaseUrl } from '@tp/db';
import { endPool } from '@tp/db/testing';
import { MANIFEST_FILE, buildManifest, serializeManifest, serializeRecords } from '@tp/rules';
import { fileSha256, listContentFiles, readRelease } from '@tp/rules/content';
import { ReleaseLoadError, loadRelease } from '@tp/rules/loader';
import { PricingWorld } from '@tp/worker/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { repositoryRoot } from '../content-files';
import { databaseRuns } from './database-runs';
import { dryRun } from './dry-run';
import { rollbackRelease } from './rollback';
import { RERUN_RELEASE_DIR, SYNTHETIC_RELEASE_DIR } from './synthetic';

/**
 * `pnpm release:dry-run` and `pnpm release:rollback` against a scratch database (the load-release skill,
 * step 3; PRD 9, The release pipeline step 4; PRD 18, Releases; test matrix PRC-19; docs/adr/0037): a
 * practice's SYNTHETIC PRC-19 remittance is priced by the price job under release 900001, then the dry
 * run of release 900004 (one 97110 relative value changed) prices the run's lines in memory and names
 * the run with its two changed lines, writing nothing but its audited reads. The rollback loads the
 * published release before the one withdrawn when the database lacks it.
 */

let w: PricingWorld;
let root = '';

beforeAll(async () => {
  w = await PricingWorld.open(readDatabaseUrl());
  root = mkdtempSync(path.join(tmpdir(), 'release-dry-run-'));
  // The release before 900004, where the dry run looks for it.
  cpSync(path.join(repositoryRoot, SYNTHETIC_RELEASE_DIR), path.join(root, 'content/outgoing/900001'), { recursive: true });
}, 60_000);

afterAll(async () => {
  await w.close();
  rmSync(root, { recursive: true, force: true });
});

describe('pnpm release:dry-run against a database', () => {
  it('names every complete run whose lines release 900004 would change, with how many, and changes nothing', async () => {
    const target = await w.practice('dry-run');
    await w.load(target, 'PRC-19/remit.835');
    await w.mapped(target, await w.planOf(target, 'CE:SYNPLAN-MA-NC'), 'ma_noncontracted', '2026-01-01');
    const runId = await w.createRun(target, '2026-02-01', '2026-02-28');
    await w.execute(target, runId);
    // A practice whose run release 900004 does not touch (no 97110 line), and one with no run at all.
    const quiet = await w.practice('dry-run-quiet');
    await w.load(quiet, 'MAP-03/remit.835');
    await w.mapped(quiet, await w.planOf(quiet, 'CE:SYNPLAN-COMM-03'), 'no_agreement', '2026-01-01');
    const quietRun = await w.createRun(quiet, '2026-05-01', '2026-05-31');
    await w.execute(quiet, quietRun);
    await w.practice('dry-run-empty');
    const counts = async () => (await w.owner.query<{ runs: string; lines: string }>('SELECT (SELECT count(*) FROM pricing_run)::text AS runs, (SELECT count(*) FROM priced_line)::text AS lines')).rows[0];
    const before = await counts();

    const pool = openPool(w.database.url, 2);
    try {
      const runs = databaseRuns(pool, { claimsPerBatch: 1 });
      const lines = await dryRun({ root, release: 900004, runs, dir: path.join(repositoryRoot, RERUN_RELEASE_DIR) });
      expect(lines).toEqual([
        `release:dry-run 900004: ${String(readRelease(path.join(repositoryRoot, RERUN_RELEASE_DIR)).records.length)} records.`,
        'Against release 900001:',
        '- pfs_rvu: 0 added, 0 removed, 1 changed',
        '',
        `Pricing runs in the database (dry run ${runs.dryRunId}): 2 complete run(s) priced in memory. Runs whose lines would change:`,
        `- run ${runId} (practice ${target.practiceId}, release 900001): 2 of 4 line(s)`,
      ]);
      // Nothing written but the audited reads, in the dry run's name.
      expect(await counts()).toEqual(before);
      const { rows } = await w.owner.query<{ object_type: string; n: string }>(
        "SELECT object_type, count(*)::text AS n FROM audit_event WHERE actor_id = $1 AND actor_kind = 'service' AND purpose = 'release_impact' GROUP BY object_type ORDER BY object_type",
        [runs.dryRunId],
      );
      expect(rows.map((row) => row.object_type)).toEqual(expect.arrayContaining(['claim', 'pricing_run']));
    } finally {
      await endPool(pool);
    }
  });
});

/** A one-file release numbered `release` in `dir`, holding the fixture's thresholds as real-looking L2 content (as load.db.test.ts builds). */
function realLookingRelease(dir: string, release: number, kx: string): void {
  const records = readRelease(path.join(repositoryRoot, SYNTHETIC_RELEASE_DIR))
    .records.map((located) => located.record)
    .filter((record) => record.record_type === 'therapy_threshold')
    .map((record) => ({
      ...record,
      value: { ...record.value, kx_threshold_cents: kx },
      source: { ...record.source, title: 'A real-looking source', url: 'https://example.invalid/source', path: 'content/sources/therapy_threshold/x.md', synthetic: false },
      verification: { level: 'L2' as const, by: 'A. Reviewer', on: '2026-10-20', questions: [] },
    }));
  mkdirSync(path.join(dir, 'therapy_threshold/2026'), { recursive: true });
  writeFileSync(path.join(dir, 'therapy_threshold/2026/records.json'), serializeRecords(records));
  writeFileSync(path.join(dir, 'RELEASE.md'), `# release ${String(release)}\n`);
  const hashes = new Map(listContentFiles(dir).filter((file) => file.path !== MANIFEST_FILE).map((file) => [file.path, fileSha256(path.join(dir, file.path))]));
  writeFileSync(path.join(dir, MANIFEST_FILE), serializeManifest(buildManifest(release, hashes)));
}

describe('pnpm release:rollback against a database', () => {
  it('loads the published release before the one withdrawn when the database lacks it, then withdraws the release in force', async () => {
    const rollbackRoot = mkdtempSync(path.join(tmpdir(), 'release-rollback-'));
    const client = new pg.Client({ connectionString: w.database.url });
    await client.connect();
    try {
      await client.query(`SET ROLE ${OWNER_ROLE}`);
      const current = async () => (await client.query<{ n: number | null }>('SELECT current_rule_release() AS n')).rows[0]?.n;
      // Real-looking release 1 is published in the repository only; release 2 is loaded, and the
      // database's SYNTHETIC release 900001 is in force.
      realLookingRelease(path.join(rollbackRoot, 'content/releases/1'), 1, '111100');
      realLookingRelease(path.join(rollbackRoot, 'staging/2'), 2, '222200');
      await loadRelease(client, path.join(rollbackRoot, 'staging/2'), { release: 2 });
      expect(await current()).toBe(900001);
      await expect(rollbackRelease(client, { root: rollbackRoot, release: 2, reason: 'SYNTHETIC: the KX threshold was mistyped' })).rejects.toThrow(
        /release 2 is not in force \(release 900001 is\); only the release in force is withdrawn/,
      );
      // That refusal still loaded the published release before 2, which the database lacked.
      expect((await client.query('SELECT 1 FROM rule_release WHERE release_no = 1 AND published_at IS NOT NULL')).rowCount).toBe(1);
      expect(await rollbackRelease(client, { root: rollbackRoot, release: 900001, reason: 'SYNTHETIC: roll back the fixture' })).toEqual({ releaseNo: 900001, reinstatedReleaseNo: 2, loaded: null });
      expect(await current()).toBe(2);
      expect(await rollbackRelease(client, { root: rollbackRoot, release: 2, reason: 'SYNTHETIC: the KX threshold was mistyped' })).toEqual({ releaseNo: 2, reinstatedReleaseNo: 1, loaded: null });
      expect(await current()).toBe(1);
      await expect(rollbackRelease(client, { root: rollbackRoot, release: 1, reason: 'SYNTHETIC: nothing before it' })).rejects.toThrow(ReleaseLoadError);
      expect(await current()).toBe(1);
    } finally {
      await client.end();
      rmSync(rollbackRoot, { recursive: true, force: true });
    }
  });
});
