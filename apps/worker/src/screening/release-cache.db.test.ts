import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';

import { type DatabaseClient, type DatabasePool, databaseClient, openPool, readDatabaseUrl } from '@tp/db';
import { type MigratedDatabase, addMembership, createMigratedDatabase, createOrganization, createUser, endPool } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { readRuleRelease, ruleRecordLike } from '@tp/pricing/testing';
import { type RuleRecord, recordSha256 } from '@tp/rules';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { MemoryMailSender } from '../mail/mail';
import { type RequestedKeys, isKeyedRecordType, keyIdentity } from '../price/keyed-release';
import { releaseChangeDays } from './adapter';
import { RELEASES_KEPT, type ScreeningJobDependencies, forgetScreeningReleases, heldScreeningReleases, priceScreeningRun } from './job';
import { legacyOutcomes, outcomesSha256, storedOutcomes } from './test-support/legacy-release';

/**
 * The release read by key, proved equal in output to the old read (audit #53 part 2; docs/adr/0062, "The release
 * read"; test matrix SCR-09), against a scratch database with a SYNTHETIC release published by this test alone
 * (900050, built here from release 900001's records; nothing is committed):
 *
 * - every stored row of runs at two ZIPs in two localities, over every 2026 band, deep-equals what the old adapter and
 *   read path (frozen at 3c1b289 in test-support) give for the same run, and none is ENGINE_ERROR, though the release
 *   corrects a used code's relative values mid-quarter, starts a used code's medically unlikely edit mid-quarter,
 *   changes an unused code's relative values and an unasked pair mid-quarter (days the old path counts and the new one
 *   does not), changes the conversion factor and sequestration mid-quarter, holds a same-code pair, and leaves a
 *   priced code without relative values;
 * - sixteen runs at sixteen ZIPs read the shared types once, hold one entry and read their keys and records each;
 * - a lookup outside the fetched keys (a code's relative values or its MPPR rate left out of the view), a row whose
 *   code is not in the key set, and codes priced unequal to the key set each fail the run as
 *   RELEASE_READ_OUTSIDE_FETCH, the batch unrecorded where the failure comes before it, and no row stored as
 *   ENGINE_ERROR;
 * - at most two releases are held.
 */

const BASE_DIR = path.resolve(import.meta.dirname, '../../../../fixtures/synthetic/rules/release-synth-900001');
const RELEASE_NO = 900_050;
const ORIGIN = 'https://app.synthetic.test';
const SPLIT = { '11': 'non_facility', '22': 'facility' } as const;
/** ZIP 00011 is locality 01; 00013 is locality 02 (both without a ZIP+4). */
const ZIPS = ['00011', '00013'] as const;
/** Sixteen more ZIPs, alternating between the two localities, for sixteen runs. */
const MANY_ZIPS = Array.from({ length: 16 }, (_, index) => `001${String(index).padStart(2, '0')}`);
const BANDS = ['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4'] as const;

let database: MigratedDatabase;
let owner: DatabaseClient;
let admin: DatabasePool;
let lines: Record<string, unknown>[];

const hex = (seed: string): string => createHash('sha256').update(seed).digest('hex');

/** Release 900001's records, with the changes this test needs (see the module comment). */
function scaleFixture(): RuleRecord[] {
  const base = readRuleRelease(BASE_DIR).records;
  const records: RuleRecord[] = [];
  const keyOf = (record: RuleRecord) => record.key as Record<string, string>;
  const valueOf = (record: RuleRecord) => record.value as Record<string, unknown>;
  for (const record of base) {
    const key = keyOf(record);
    if (record.record_type === 'pfs_rvu' && key.hcpcs === '97110') {
      // A used code's relative values corrected mid-Q2.
      records.push(ruleRecordLike(record, { effective_to: '2026-05-15' }), ruleRecordLike(record, { effective_from: '2026-05-16', value: { ...valueOf(record), work_rvu: '0.33' } }));
    } else if (record.record_type === 'pfs_rvu' && key.hcpcs === '97164') {
      // An unused code's relative values changed mid-Q1: a day the old path counts and the new one does not.
      records.push(ruleRecordLike(record, { effective_to: '2026-02-14' }), ruleRecordLike(record, { effective_from: '2026-02-15', value: { ...valueOf(record), work_rvu: '1.99' } }));
    } else if (record.record_type === 'ncci_mue' && key.hcpcs === '97116') {
      // A used code's medically unlikely edit, a new record from mid-Q2.
      records.push(ruleRecordLike(record, { effective_to: '2026-05-10' }), ruleRecordLike(record, { effective_from: '2026-05-11', value: { ...valueOf(record), mue: 2 } }));
    } else if (record.record_type === 'ncci_ptp' && key.column1 === '97140' && key.column2 === '97530') {
      // A pair no screening claim asks for, changed mid-Q4: a day the old path counts and the new one does not.
      records.push(ruleRecordLike(record, { effective_to: '2026-11-15' }), ruleRecordLike(record, { effective_from: '2026-11-16', value: { ...valueOf(record), modifier_indicator: '0' } }));
    } else if (record.record_type === 'conversion_factor' && key.applicability === 'non_qualifying_apm') {
      // A shared type changed mid-Q3.
      records.push(ruleRecordLike(record, { effective_to: '2026-08-14' }), ruleRecordLike(record, { effective_from: '2026-08-15', value: { ...valueOf(record), conversion_factor: '20.5000' } }));
    } else if (record.record_type === 'sequestration') {
      // Another shared type changed mid-Q3.
      records.push(ruleRecordLike(record, { effective_to: '2026-08-31' }), ruleRecordLike(record, { effective_from: '2026-09-01', value: { ...valueOf(record), reduction_percent: '2' } }));
    } else {
      records.push(record);
    }
  }
  const locality = base.find((record) => record.record_type === 'locality_map' && keyOf(record).zip === '00011');
  const gpci = base.find((record) => record.record_type === 'pfs_gpci');
  const pair = base.find((record) => record.record_type === 'ncci_ptp');
  if (locality === undefined || gpci === undefined || pair === undefined) {
    throw new Error('release 900001 has a locality, a GPCI and a pair');
  }
  const at = (zip: string, localityNo: string) => ruleRecordLike(locality, { key: { zip }, value: { ...valueOf(locality), locality: localityNo } });
  records.push(
    at('00013', '02'),
    ...MANY_ZIPS.map((zip, index) => at(zip, index % 2 === 0 ? '01' : '02')),
    ruleRecordLike(gpci, { key: { carrier: '99999', locality: '02' }, value: { ...valueOf(gpci), locality_name: 'SYNTHETIC LOCALITY TWO', work_gpci: '1.020', pe_gpci: '1.110', mp_gpci: '0.700' } }),
    // A same-code pair: the later-procedure claim (two lines of one code) asks for it.
    ruleRecordLike(pair, { key: { column1: '97110', column2: '97110' }, effective_from: '2026-01-01', effective_to: null }),
  );
  return records;
}

/** Publishes a release from records, as the owner, as the database tests do (no files). */
async function publish(releaseNo: number, records: readonly RuleRecord[]): Promise<void> {
  await owner.query('BEGIN');
  try {
    await owner.query('INSERT INTO rule_release (release_no, manifest_sha256) VALUES ($1, $2)', [releaseNo, hex(`manifest ${String(releaseNo)}`)]);
    for (let start = 0; start < records.length; start += 200) {
      const batch = records.slice(start, start + 200);
      const values = batch.flatMap((record) => [releaseNo, record.record_type, JSON.stringify(record.key), JSON.stringify(record.value), record.effective_from, record.effective_to, recordSha256(record)]);
      const tuples = batch.map((_, index) => {
        const p = (offset: number) => `$${String(index * 7 + offset)}`;
        return `(${p(1)}, ${p(2)}, ${p(3)}::jsonb, ${p(4)}::jsonb, ${p(5)}::date, ${p(6)}::date, '{"synthetic":true}', 'L1', ${p(7)})`;
      });
      await owner.query(`INSERT INTO rule_record (release_no, record_type, key, value, effective_from, effective_to, source, verification, sha256) VALUES ${tuples.join(', ')}`, values);
    }
    await owner.query('UPDATE rule_release SET published_at = now() WHERE release_no = $1', [releaseNo]);
    await owner.query('COMMIT');
  } catch (error) {
    await owner.query('ROLLBACK');
    throw error;
  }
}

/** As the application role in a transaction (with an actor when named), as the screening routes run. */
async function asApp<T extends Record<string, unknown>>(sql: string, values: unknown[] = [], actorId: string | null = null): Promise<T[]> {
  const client = await admin.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE tp_app');
    await client.query("SELECT set_config('app.actor_id', $1, true)", [actorId ?? '']);
    const { rows } = await client.query<T>(sql, values);
    await client.query('COMMIT');
    return rows;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

type Row = readonly [code: string, modifiers: string, units: number, place: string, product: string, band: string, allowedCents: bigint, claims: number];

/** A practice name of its own (letters only), so no screening replaces another's. */
function practiceName(): string {
  const letters = randomUUID()
    .replace(/-/g, '')
    .slice(0, 10)
    .replace(/[0-9]/g, (digit) => 'ghijklmnop'.charAt(Number(digit)));
  return `Synthetic Cache Therapy ${letters}`;
}

/** Submits a screening of the rows at a ZIP, as submit_screening's caller does; the run's ID. */
async function submit(rows: readonly Row[], zip: string): Promise<string> {
  const [created] = await asApp<{ id: string }>(
    `SELECT submit_screening(practice => $1, state_code => $2, zip5 => $3, plus_four => NULL, email => $4, codes => $5, modifier_sets => $6, unit_counts => $7,
                             places => $8, products => $9, bands => $10, allowed_cents => $11, claim_counts => $12, rows_left_out => $13, claim_lines_left_out => $14,
                             allowed_cents_left_out => $15, rows_outside_content => 0, claim_lines_outside_content => 0, allowed_cents_outside_content => 0,
                             heard_from => NULL, campaign_source => NULL, campaign_medium => NULL, campaign_name => NULL,
                             click_kind => NULL, firm => NULL, consent_sha256 => NULL, terms_sha256 => $16, request => $17) AS id`,
    [
      practiceName(),
      'MN',
      zip,
      `prospect.${randomUUID().slice(0, 8)}@cache.synthetic.test`,
      rows.map((row) => row[0]),
      rows.map((row) => row[1]),
      rows.map((row) => row[2]),
      rows.map((row) => row[3]),
      rows.map((row) => row[4]),
      rows.map((row) => row[5]),
      rows.map((row) => row[6].toString()),
      rows.map((row) => row[7]),
      0,
      0,
      '0',
      hex('SYNTHETIC screening terms'),
      `test-${randomUUID()}`,
    ],
  );
  return created?.id ?? '';
}

/**
 * About 200 distinct rows for one run: codes in the reduction across codes and outside it, a code without relative
 * values (97799), assistant and bypass modifiers, units 1 to 3, both places and every 2026 band, the Medicare products
 * alternating, and a few rows of the products a screening does not price.
 */
function fixtureRows(offset: number): Row[] {
  const codes = ['97110', '97112', '97116', '97140', '97530', '97161', '97162', '97799'];
  const modifierSets = ['', 'GP', 'CQ GP', '59 GP'];
  const rows: Row[] = [];
  let index = 0;
  for (const band of BANDS) {
    for (const code of codes) {
      for (const modifiers of modifierSets) {
        for (const place of ['11', '22']) {
          for (let units = 1; units <= 3; units += 1) {
            index += 1;
            if ((index + offset) % 4 === 0) {
              rows.push([code, modifiers, units, place, index % 2 === 0 ? 'medicare_ffs' : 'ma_noncontracted', band, BigInt(2_000 + ((index * 131) % 40_000)), 11 + (index % 30)]);
            }
          }
        }
      }
    }
  }
  rows.push(['97110', 'GP', 1, '11', 'ma_contracted', '2026-Q1', 30_000n, 20], ['97140', '', 1, '11', 'commercial', '2026-Q2', 40_000n, 14], ['97116', '', 1, '11', 'medicaid', '2026-Q3', 9_000n, 11]);
  return rows;
}

function dependencies(mail: MemoryMailSender, overrides: Partial<ScreeningJobDependencies> = {}): ScreeningJobDependencies {
  return {
    operator: admin,
    mail,
    appOrigin: ORIGIN,
    logger: createLogger({ sink: (line) => lines.push(JSON.parse(line) as Record<string, unknown>) }),
    jobId: randomUUID(),
    ...overrides,
  };
}

async function runState(runId: string): Promise<{ status: string; failure_code: string | null; pending: number; engine_errors: number; recorded: number }> {
  const { rows } = await owner.query<{ status: string; failure_code: string | null; pending: number; engine_errors: number; recorded: number }>(
    `SELECT r.status, r.failure_code,
            (SELECT count(*)::int FROM screening_result s WHERE s.run_id = r.id AND s.disposition = 'pending') AS pending,
            (SELECT count(*)::int FROM screening_result s WHERE s.run_id = r.id AND s.unpriced_reason = 'ENGINE_ERROR') AS engine_errors,
            (SELECT count(*)::int FROM screening_result s WHERE s.run_id = r.id AND s.disposition <> 'pending') AS recorded
       FROM screening_run r WHERE r.id = $1`,
    [runId],
  );
  const row = rows[0];
  if (row === undefined) {
    throw new Error('no run');
  }
  return row;
}

const messages = (text: string) => lines.filter((line) => line.msg === text);

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = databaseClient(database.url);
  await owner.connect();
  await publish(RELEASE_NO, scaleFixture());
  admin = openPool(database.url, 4);
  const internal = await createOrganization(owner, 'internal');
  const specialist = await createUser(owner, { hardwareKeyRequired: true });
  await addMembership(owner, internal, specialist, 'contract_specialist');
  await asApp('SELECT console_approve_place_of_service_split($1)', [JSON.stringify(SPLIT)], specialist);
}, 60_000);

afterAll(async () => {
  await endPool(admin);
  await owner.end();
  await database.drop();
});

beforeEach(() => {
  lines = [];
  forgetScreeningReleases();
});

describe('SCR-09: the release read by key gives every row the old read’s outcome', () => {
  it('stores, for runs at two ZIPs in two localities over every band, exactly what the frozen adapter and read path give, and no ENGINE_ERROR', { timeout: 120_000 }, async () => {
    const fixture = scaleFixture();
    // The days the old path counts that the new one does not: an unused code's and an unasked pair's changes.
    const all = releaseChangeDays(fixture);
    const shared = releaseChangeDays(fixture.filter((record) => !isKeyedRecordType(record.record_type)));
    expect(all.filter((day) => !shared.includes(day))).toEqual(expect.arrayContaining(['2026-02-15', '2026-11-16']));
    const tally = new Map<string, number>();
    for (const [index, zip] of ZIPS.entries()) {
      const runId = await submit(fixtureRows(index), zip);
      const mail = new MemoryMailSender();
      expect(await priceScreeningRun(dependencies(mail), runId)).toBe('complete');
      const stored = await storedOutcomes(owner, runId);
      const oracle = await legacyOutcomes(owner, runId);
      expect(stored.size).toBeGreaterThan(180);
      expect(stored.size).toBe(oracle.size);
      for (const [rowNo, outcome] of oracle) {
        expect(stored.get(rowNo), `row ${String(rowNo)} at ${zip}`).toEqual(outcome);
      }
      expect(outcomesSha256(stored)).toBe(outcomesSha256(oracle));
      expect((await runState(runId)).engine_errors).toBe(0);
      for (const outcome of stored.values()) {
        const label = outcome.disposition === 'unpriced' ? `unpriced ${outcome.reason}` : outcome.disposition === 'priced' && outcome.inReductionPool ? 'priced pooled' : outcome.disposition;
        tally.set(label, (tally.get(label) ?? 0) + 1);
      }
    }
    // The fixture reaches every outcome the comparison needs to cover.
    for (const label of ['priced', 'priced pooled', 'rates_change_in_band', 'unpriced NO_PFS_VALUE', 'unpriced MUE_EXCEEDED']) {
      expect(tally.get(label) ?? 0, label).toBeGreaterThan(0);
    }
  });
});

describe('one copy of a release’s shared types, keyed reads per run', () => {
  it('reads the shared types once for sixteen runs at sixteen ZIPs, holds one entry, and reads each run’s keys and records', { timeout: 120_000 }, async () => {
    for (const zip of MANY_ZIPS) {
      const runId = await submit([['97110', 'GP', 2, '11', 'medicare_ffs', '2026-Q1', 40_000n, 11], ['97161', '', 1, '22', 'ma_noncontracted', '2026-Q4', 6_000n, 12]], zip);
      expect(await priceScreeningRun(dependencies(new MemoryMailSender()), runId)).toBe('complete');
    }
    expect(messages('screening release shared types read')).toHaveLength(1);
    expect(messages('screening release shared types held from an earlier run')).toHaveLength(15);
    const keyed = messages('screening release keyed records read');
    expect(keyed).toHaveLength(16);
    // Each run's keyed read is its two codes' records, the general MPPR rate and its ZIP: never the release's whole tables.
    for (const line of keyed) {
      expect(line.record_count).toBeLessThan(12);
      expect(typeof line.elapsed_ms).toBe('number');
    }
    expect(heldScreeningReleases()).toEqual([`${String(RELEASE_NO)}:${hex(`manifest ${String(RELEASE_NO)}`)}`]);
    // Every phase logs numbers only, beside the run's ID.
    for (const text of ['screening release shared types read', 'screening release keyed records read', 'screening run rows priced', 'screening run rows recorded']) {
      for (const line of messages(text)) {
        expect(Object.keys(line).sort()).toEqual(['elapsed_ms', 'job_id', 'level', 'msg', 'record_count', 'screening_run_id', 'time']);
      }
    }
  });
});

describe('no silent "not found": a read outside the fetch fails the run', () => {
  const rows: readonly Row[] = [
    ['97110', 'GP', 2, '11', 'medicare_ffs', '2026-Q1', 40_000n, 11],
    ['97140', 'GP', 1, '11', 'ma_noncontracted', '2026-Q1', 20_000n, 12],
    ['97161', '', 1, '22', 'medicare_ffs', '2026-Q4', 6_000n, 13],
  ];
  const without = (type: 'pfs_rvu' | 'mppr_rate', key: Readonly<Record<string, string>>) => ({
    requested: (requested: RequestedKeys): RequestedKeys => ({
      ...requested,
      [type]: new Set([...requested[type]].filter((entry) => entry !== keyIdentity(key))),
    }),
  });

  it.each([
    ['a view missing one code’s relative values', without('pfs_rvu', { hcpcs: '97140', modifier: '' })],
    ['a view missing one code’s MPPR rate', without('mppr_rate', { hcpcs: '97110', modifier: '' })],
  ])('fails the run as RELEASE_READ_OUTSIDE_FETCH through the real engine: %s, the batch unrecorded, no row ENGINE_ERROR', async (_, alterReleaseRead) => {
    const runId = await submit(rows, '00011');
    const mail = new MemoryMailSender();
    expect(await priceScreeningRun(dependencies(mail, { alterReleaseRead }), runId)).toBe('failed');
    expect(await runState(runId)).toEqual({ status: 'failed', failure_code: 'RELEASE_READ_OUTSIDE_FETCH', pending: rows.length, engine_errors: 0, recorded: 0 });
    expect(messages('screening run failed: its pricing read the release outside the keys fetched for it')).toEqual([expect.objectContaining({ error_code: 'RELEASE_READ_OUTSIDE_FETCH', screening_run_id: runId })]);
    // The contact is told, as for any failed run.
    expect(mail.sent).toHaveLength(1);
  });

  it('fails the run the same way when a row’s code is not in the key set, before the batch is recorded', async () => {
    const runId = await submit(rows, '00011');
    const alterReleaseRead = { keys: (keys: { readonly codes: readonly string[]; readonly zip: string }) => ({ ...keys, codes: keys.codes.filter((code) => code !== '97161') }) };
    expect(await priceScreeningRun(dependencies(new MemoryMailSender(), { alterReleaseRead }), runId)).toBe('failed');
    expect(await runState(runId)).toEqual({ status: 'failed', failure_code: 'RELEASE_READ_OUTSIDE_FETCH', pending: rows.length, engine_errors: 0, recorded: 0 });
  });

  it('completes a run whose key set holds a code no row priced: every code priced is in it, which is all the check asks', async () => {
    // A key set larger than the codes priced fetched records nothing read; a stale claim that overtook an attempt leaves
    // it pricing fewer codes than its key set, and the attempt's fence, not this check, stops it (screening.db.test.ts).
    const runId = await submit(rows, '00011');
    const alterReleaseRead = { keys: (keys: { readonly codes: readonly string[]; readonly zip: string }) => ({ ...keys, codes: [...keys.codes, '97530'] }) };
    expect(await priceScreeningRun(dependencies(new MemoryMailSender(), { alterReleaseRead }), runId)).toBe('complete');
    expect(await runState(runId)).toMatchObject({ status: 'complete', pending: 0, engine_errors: 0 });
  });
});

describe('the releases held', () => {
  it(`holds at most ${String(RELEASES_KEPT)} releases, the newest`, { timeout: 60_000 }, async () => {
    const fixture = scaleFixture();
    const runs: string[] = [await submit([['97110', 'GP', 1, '11', 'medicare_ffs', '2026-Q1', 4_000n, 11]], '00011')];
    for (const releaseNo of [RELEASE_NO + 1, RELEASE_NO + 2]) {
      // A later release in force: runs submitted from now on pin it.
      await publish(releaseNo, fixture);
      runs.push(await submit([['97110', 'GP', 1, '11', 'medicare_ffs', '2026-Q1', 4_000n, 11]], '00011'));
    }
    for (const runId of runs) {
      expect(await priceScreeningRun(dependencies(new MemoryMailSender()), runId)).toBe('complete');
    }
    expect(RELEASES_KEPT).toBe(2);
    expect(heldScreeningReleases()).toEqual([RELEASE_NO + 1, RELEASE_NO + 2].map((releaseNo) => `${String(releaseNo)}:${hex(`manifest ${String(releaseNo)}`)}`));
    expect(messages('screening release shared types read')).toHaveLength(3);
  });
});
