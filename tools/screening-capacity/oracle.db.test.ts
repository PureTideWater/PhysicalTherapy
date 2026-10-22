import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { type DatabaseClient, type DatabasePool, databaseClient, openPool, readDatabaseUrl } from '@tp/db';
import { type MigratedDatabase, addMembership, createMigratedDatabase, createOrganization, createUser, endPool } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { loadRelease } from '@tp/rules/loader';
import { SCALE_RELEASE_NUMBER, SMALL_SCALE_RELEASE_SHAPE, type SynthScreeningRow, smallUploadRows, uploadZips } from '@tp/synth';
import { MemoryMailSender, forgetScreeningReleases, priceScreeningRun } from '@tp/worker/runtime';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { writeScaleRelease } from '../release/scale';
import { compareRuns, parseRunArgument } from './oracle';
import { splitZip } from './uploads';

/**
 * The capacity test's oracles against PostgreSQL, at the scale release's small shape (PR 6b; docs/adr/0064; test matrix
 * SCR-15): a five-digit run's stored rows equal the frozen 3c1b289 read path's, and a run from a ZIP the release splits
 * across localities, sent with its ZIP+4, prices every row through the keyed read (the ZIP's ZIP9 record among the keys)
 * and equals the whole-release oracle, which the frozen pricer, taking a five-digit ZIP alone, cannot. Synthetic data
 * only, in a scratch database.
 */

let database: MigratedDatabase;
let owner: DatabaseClient;
let admin: DatabasePool;
let out: string;

/** As the application role, with an actor when named, in a transaction, as the screening routes run. */
async function asApp<T extends Record<string, unknown>>(sql: string, values: unknown[], actorId: string | null = null): Promise<T[]> {
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

/** Submits the small upload's rows at a ZIP (and ZIP+4), as the screening form does; the run's ID. */
async function submit(rows: readonly SynthScreeningRow[], zip: string, plusFour: string | null, label: string): Promise<string> {
  const [created] = await asApp<{ id: string }>(
    `SELECT submit_screening(practice => $1, state_code => 'MN', zip5 => $2, plus_four => $3, email => $4, codes => $5, modifier_sets => $6, unit_counts => $7,
                             places => $8, products => $9, bands => $10, allowed_cents => $11, claim_counts => $12, rows_left_out => 0, claim_lines_left_out => 0,
                             allowed_cents_left_out => 0, rows_outside_content => 0, claim_lines_outside_content => 0, allowed_cents_outside_content => 0,
                             heard_from => NULL, campaign_source => NULL, campaign_medium => NULL, campaign_name => NULL, click_kind => NULL, firm => NULL,
                             consent_sha256 => NULL, terms_sha256 => NULL, received => NULL, rate_account_subject => $14, request => $13) AS id`,
    [
      `Synthetic Oracle Therapy ${label}`,
      zip,
      plusFour,
      `oracle.${label.toLowerCase()}@oracle.synthetic.test`,
      rows.map((row) => row.procedureCode),
      rows.map((row) => row.modifiers.join(' ')),
      rows.map((row) => row.units),
      rows.map((row) => row.placeOfService),
      rows.map((row) => row.payerProduct),
      rows.map((row) => row.serviceBand),
      rows.map((row) => row.allowedCents.toString()),
      rows.map((row) => row.claimCount),
      `test-${randomUUID()}`,
      // The rate limiter's keyed subject the web passes (PR 6b-3): any 64 hex characters here, one account per upload.
      createHash('sha256').update(`oracle-account:${label}`).digest('hex'),
    ],
  );
  return created?.id ?? '';
}

async function price(runId: string): Promise<string> {
  return priceScreeningRun({ operator: admin, mail: new MemoryMailSender(), appOrigin: 'https://app.synthetic.test', logger: createLogger({ sink: () => undefined }), jobId: randomUUID() }, runId);
}

beforeAll(async () => {
  out = mkdtempSync(path.join(tmpdir(), 'tp-oracle-scale-'));
  const built = writeScaleRelease({ out, shape: SMALL_SCALE_RELEASE_SHAPE });
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = databaseClient(database.url);
  await owner.connect();
  await loadRelease(owner, built.dir, { release: SCALE_RELEASE_NUMBER, allowSyntheticFixtureForTests: true });
  admin = openPool(database.url, 4);
  const internal = await createOrganization(owner, 'internal');
  const specialist = await createUser(owner, { hardwareKeyRequired: true });
  await addMembership(owner, internal, specialist, 'contract_specialist');
  await asApp('SELECT console_approve_place_of_service_split($1)', [JSON.stringify({ '11': 'non_facility', '22': 'facility' })], specialist);
  forgetScreeningReleases();
}, 120_000);

afterAll(async () => {
  await endPool(admin);
  await owner.end();
  await database.drop();
  rmSync(out, { recursive: true, force: true });
});

describe('the capacity test’s oracles (SCR-15)', () => {
  it('equal a five-digit run by the frozen read path, and a split ZIP’s run by the whole release, every Medicare row priced', async () => {
    const rows = smallUploadRows();
    const medicareRows = rows.filter((row) => row.payerProduct === 'medicare_ffs' || row.payerProduct === 'ma_noncontracted').length;
    const five = uploadZips(SMALL_SCALE_RELEASE_SHAPE, 1, 1)[0]?.[0] ?? '';
    const split = splitZip(SMALL_SCALE_RELEASE_SHAPE);
    // The split ZIP needs its ZIP+4: without it the screening is refused, with it the ZIP+4 is kept.
    await expect(submit(rows, split.zip, null, 'Refused')).rejects.toMatchObject({ code: '23514', constraint: 'screening_zip_plus_four' });
    const fiveRun = await submit(rows, five, null, 'Five');
    const splitRun = await submit(rows, split.zip, split.zipPlusFour, 'Split');
    expect((await owner.query('SELECT p.zip_plus_four FROM screening_run r JOIN screening_upload u ON u.id = r.upload_id JOIN screening_prospect p ON p.id = u.prospect_id WHERE r.id = $1', [splitRun])).rows).toEqual([
      { zip_plus_four: split.zipPlusFour },
    ]);
    expect(await price(fiveRun)).toBe('complete');
    expect(await price(splitRun)).toBe('complete');
    // Every Medicare row priced: none stopped on the locality, none read outside the keys fetched.
    const stopped = await owner.query("SELECT count(*)::int AS n FROM screening_result WHERE run_id = ANY ($1::uuid[]) AND disposition IN ('priced', 'unpriced', 'rates_change_in_band') AND unpriced_reason = 'ENGINE_ERROR'", [
      [fiveRun, splitRun],
    ]);
    expect(stopped.rows).toEqual([{ n: 0 }]);
    const results = await compareRuns(database.url, [parseRunArgument(`frozen_3c1b289:${fiveRun}`), parseRunArgument(`whole_release:${splitRun}`)]);
    expect(results.map((result) => [result.oracle, result.rows, result.storedSha256 === result.oracleSha256])).toEqual([
      ['frozen_3c1b289', medicareRows, true],
      ['whole_release', medicareRows, true],
    ]);
    // The frozen pricer, given the five-digit ZIP alone, cannot price the split ZIP's rows as the run did.
    const [frozen] = await compareRuns(database.url, [{ runId: splitRun, oracle: 'frozen_3c1b289' }]);
    expect(frozen?.storedSha256).not.toBe(frozen?.oracleSha256);
  });

  it('names each run by its oracle on the command line', () => {
    const id = randomUUID();
    expect(parseRunArgument(`whole_release:${id}`)).toEqual({ oracle: 'whole_release', runId: id });
    expect(parseRunArgument(`frozen_3c1b289:${id}`)).toEqual({ oracle: 'frozen_3c1b289', runId: id });
    expect(() => parseRunArgument(id)).toThrow(RangeError);
    expect(() => parseRunArgument(`legacy:${id}`)).toThrow(RangeError);
  });
});
