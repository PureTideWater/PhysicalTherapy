import { randomUUID } from 'node:crypto';

import { readDatabaseUrl, withJobScope } from '@tp/db';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { CONTENT_NOT_LOADED_MESSAGE, ENGINE_ERRORS_MESSAGE, READ_OUTSIDE_FETCH_MESSAGE } from './execute';
import type * as KeyedReleaseModule from './keyed-release';
import { releaseContentSpans, releaseContentWindows } from './release';
import { CONTENT_GAP_RELEASE, type Practice, PricingWorld, RELEASE, termsAt } from './test-support/pricing-world';

/**
 * Months that need Medicare content a release has not loaded (audit #7; docs/adr/0071; test matrix RCC-04 and RCC-05),
 * against a scratch database under SYNTHETIC release 900007 (900001 with its per-code MPPR list and its MUE ending
 * 2026-09-30): a run whose lines read the MPPR or the MUE on a date outside its span fails with no line kept, naming
 * exactly the families read; a month that reads neither, or reads them inside their spans, prices; the stops' precedence
 * holds over the whole run (a read outside the fetch, then the location, then content); and a run that met content
 * PaidWhole has not loaded logs one content alert. Each case is a practice of its own, its SYNTHETIC 835 a variant of
 * MAP-05's (97110 twice, 97140 and 97530 on one day) moved to the month the case needs.
 */

/** From the given call of claimsRequestedKeys() on, the keys leave out every relative value: a read outside the fetch. */
const drop = vi.hoisted(() => ({ fromCall: Number.POSITIVE_INFINITY, calls: 0 }));

vi.mock('./keyed-release', async (importOriginal) => {
  const actual = await importOriginal<typeof KeyedReleaseModule>();
  return {
    ...actual,
    claimsRequestedKeys: (...args: Parameters<typeof actual.claimsRequestedKeys>) => {
      drop.calls += 1;
      const keys = actual.claimsRequestedKeys(...args);
      return drop.calls >= drop.fromCall ? { ...keys, pfs_rvu: new Set<string>() } : keys;
    },
  };
});

/** A scratch release, 900001's records with the GPCIs ending 2026-09-30: a commercial month after September stops on no_gpci. */
const GPCI_GAP_RELEASE = 900_098;

/** A scratch release, 900007's records with the GPCIs ending 2026-09-30: a month after September reads the MUE outside its span and stops on no_gpci. */
const MIXED_GAP_RELEASE = 900_097;

let w: PricingWorld;

beforeAll(async () => {
  w = await PricingWorld.open(readDatabaseUrl());
  await w.loadContentGapRelease();
}, 60_000);

afterAll(async () => {
  await w.close();
});

afterEach(() => {
  drop.fromCall = Number.POSITIVE_INFINITY;
  drop.calls = 0;
});

/** A fixed amount per line, flags off: the commercial fixed fee, which reads no Medicare content. */
const FIXED = { scope: {}, method: 'FIXED_SCHEDULE', parameters: { amount_cents: '5000' }, flags: { timed_units_rule: 'PER_CODE' } };

/**
 * Loads MAP-05's remittance with its lines on `serviceDate` and its payment the month after; `other` makes it another
 * payment of other claims, on plan `plan` (CE), with 97530 billed as `lastCode`.
 */
async function loadMonth(target: Practice, serviceDate: string, options: { other?: boolean; plan?: string; lastCode?: string } = {}): Promise<void> {
  const [year, month] = [serviceDate.slice(2, 4), Number(serviceDate.slice(5, 7))];
  const paid = String(month + 1).padStart(2, '0');
  const other: (readonly [string, string])[] = options.other === true ? [['020050001', '020059001'], ['SYNEFTMAP05001', 'SYNEFTMAP95001'], ['SYNPCNMAP05', 'SYNPCNMAP95'], ['SYNCCNMAP05', 'SYNCCNMAP95']] : [];
  await w.loadVariant(target, 'MAP-05/remit.835', [
    ...other,
    ['SYNPLAN-MA-05', options.plan ?? 'SYNPLAN-MA-05'],
    ['HC:97530', `HC:${options.lastCode ?? '97530'}`],
    ['20260216', serviceDate.replaceAll('-', '')],
    ['20260310', `20${year}${paid}10`],
    ['260311', `${year}${paid}11`],
  ]);
}

/** An October 2026 practice whose MA plan is mapped Medicare Advantage non-contracted: every flag on. */
async function maMonth(label: string, serviceDate = '2026-10-14'): Promise<Practice> {
  const target = await w.practice(label);
  await loadMonth(target, serviceDate);
  await w.mapped(target, await w.planOf(target, 'CE:SYNPLAN-MA-05'), 'ma_noncontracted', '2026-01-01');
  return target;
}

interface RunState {
  readonly status: string;
  readonly failure_code: string | null;
  readonly lines: number;
}

const runState = (pricingRunId: string) =>
  w.one<RunState>('SELECT r.status, r.failure_code, (SELECT count(*)::int FROM priced_line p WHERE p.pricing_run_id = r.id) AS lines FROM pricing_run r WHERE r.id = $1', [pricingRunId]);

const contentAlerts = (logs: readonly Record<string, unknown>[]) => logs.filter((line) => line.error_code === 'CONTENT_NOT_LOADED');

/** Creates (a person, in the billing manager's scope) and executes a run of the month under the release in force. */
async function priceMonth(target: Practice, from: string, to: string, logs: Record<string, unknown>[] = [], claimsPerBatch?: number, releaseNo = CONTENT_GAP_RELEASE): Promise<string> {
  const runId = await w.createRun(target, from, to, releaseNo);
  await w.execute(target, runId, logs, claimsPerBatch === undefined ? {} : { claimsPerBatch });
  return runId;
}

describe('a month whose lines read the MPPR or the MUE outside its span', () => {
  it('fails a Medicare Advantage month of 2026-10 as waiting_on_content_mppr_mue with no line kept, and alerts once with its line count', async () => {
    const target = await maMonth('ma-october');
    const logs: Record<string, unknown>[] = [];
    const runId = await priceMonth(target, '2026-10-01', '2026-10-31', logs);
    expect(await runState(runId)).toEqual({ status: 'failed', failure_code: 'waiting_on_content_mppr_mue', lines: 0 });
    // Created by a person, not the monitor: the run alerts all the same, once, with the lines that read the content.
    expect(contentAlerts(logs)).toEqual([
      expect.objectContaining({ level: 'warn', msg: CONTENT_NOT_LOADED_MESSAGE, pricing_run_id: runId, error_code: 'CONTENT_NOT_LOADED', record_count: 3 }),
    ]);
    expect(logs.filter((line) => line.msg === ENGINE_ERRORS_MESSAGE || line.level === 'error')).toEqual([]);
  });

  it('fails a month whose terms apply the coding edits only as waiting_on_content_mue', async () => {
    const target = await w.practice('ncci-only-october');
    await loadMonth(target, '2026-10-14');
    const terms = { ...termsAt('110'), flags: { timed_units_rule: 'PER_CODE', apply_ncci: true } };
    const signed = await w.signedContract(target, '2026-01-01', { terms });
    await w.mapped(target, await w.planOf(target, 'CE:SYNPLAN-MA-05'), 'contract', '2026-01-01', signed.versionId);
    const logs: Record<string, unknown>[] = [];
    const runId = await priceMonth(target, '2026-10-01', '2026-10-31', logs);
    expect(await runState(runId)).toEqual({ status: 'failed', failure_code: 'waiting_on_content_mue', lines: 0 });
    expect(contentAlerts(logs).map((line) => line.record_count)).toEqual([3]);
  });

  it('prices a commercial fixed-fee month of 2026-10, which reads neither, with no content alert', async () => {
    const target = await w.practice('fixed-october');
    await loadMonth(target, '2026-10-14');
    const signed = await w.signedContract(target, '2026-01-01', { terms: FIXED });
    await w.mapped(target, await w.planOf(target, 'CE:SYNPLAN-MA-05'), 'contract', '2026-01-01', signed.versionId);
    const logs: Record<string, unknown>[] = [];
    const runId = await priceMonth(target, '2026-10-01', '2026-10-31', logs);
    expect(await runState(runId)).toEqual({ status: 'complete', failure_code: null, lines: 3 });
    expect(contentAlerts(logs)).toEqual([]);
  });

  it('prices a commercial percent-of-Medicare month of 2026-10, its flags off, with no content alert: its fee schedule is loaded', async () => {
    const target = await w.practice('percent-october');
    await loadMonth(target, '2026-10-14');
    const signed = await w.signedContract(target, '2026-01-01');
    await w.mapped(target, await w.planOf(target, 'CE:SYNPLAN-MA-05'), 'contract', '2026-01-01', signed.versionId);
    const logs: Record<string, unknown>[] = [];
    const runId = await priceMonth(target, '2026-10-01', '2026-10-31', logs);
    expect(await runState(runId)).toEqual({ status: 'complete', failure_code: null, lines: 3 });
    expect(contentAlerts(logs)).toEqual([]);
  });

  it('prices a Medicare Advantage month of 2026-09, inside both spans, its trace reading both', async () => {
    const target = await maMonth('ma-september', '2026-09-16');
    const logs: Record<string, unknown>[] = [];
    const runId = await priceMonth(target, '2026-09-01', '2026-09-30', logs);
    expect(await runState(runId)).toEqual({ status: 'complete', failure_code: null, lines: 3 });
    const { rows } = await w.owner.query<{ trace: { steps: { units: { mue: { checked: boolean } } } } }>('SELECT trace FROM priced_line WHERE pricing_run_id = $1', [runId]);
    expect(rows.map((row) => row.trace.steps.units.mue.checked)).toEqual([true, true, true]);
    expect(contentAlerts(logs)).toEqual([]);
  });
});

describe('the precedence of a run’s stops, over the whole run', () => {
  /** A practice at 00012 (split between two localities: it needs its ZIP+4) with two payments of October. */
  async function locationAndContent(label: string, secondPlan: string, lastCode = '97530'): Promise<Practice> {
    const target = await w.practice(label);
    await loadMonth(target, '2026-10-14');
    await loadMonth(target, '2026-10-14', { other: true, plan: secondPlan, lastCode });
    await w.mapped(target, await w.planOf(target, 'CE:SYNPLAN-MA-05'), 'ma_noncontracted', '2026-01-01');
    expect(await w.setLocation(target, '00012')).toBe('zip_plus_four_needed');
    return target;
  }

  it('fails a month with both a location stop and a content gap as location_not_ready, the customer’s step first', async () => {
    // The Medicare Advantage lines stop on the location before any MPPR; the fixed fee with the coding edits on reads the MUE.
    const target = await locationAndContent('location-and-content', 'SYNPLAN-FX-05');
    const terms = { ...FIXED, flags: { timed_units_rule: 'PER_CODE', apply_ncci: true } };
    const signed = await w.signedContract(target, '2026-01-01', { terms });
    await w.mapped(target, await w.planOf(target, 'CE:SYNPLAN-FX-05'), 'contract', '2026-01-01', signed.versionId);
    for (const claimsPerBatch of [undefined, 1]) {
      const logs: Record<string, unknown>[] = [];
      const runId = await priceMonth(target, '2026-10-01', '2026-10-31', logs, claimsPerBatch);
      expect(await runState(runId)).toEqual({ status: 'failed', failure_code: 'location_not_ready', lines: 0 });
      expect(contentAlerts(logs)).toEqual([]);
    }
  });

  it('fails a read outside the fetch as release_read_outside_fetch, logged for the operator, before anything of its batch is stored', async () => {
    // Two payments of September, each claim its own batch: the first is stored, the second reads a relative value it never fetched.
    const target = await w.practice('outside-fetch');
    await loadMonth(target, '2026-09-16');
    await loadMonth(target, '2026-09-16', { other: true, lastCode: '97116' });
    await w.mapped(target, await w.planOf(target, 'CE:SYNPLAN-MA-05'), 'ma_noncontracted', '2026-01-01');
    drop.fromCall = 2;
    const logs: Record<string, unknown>[] = [];
    const runId = await priceMonth(target, '2026-09-01', '2026-09-30', logs, 1);
    expect(await runState(runId)).toEqual({ status: 'failed', failure_code: 'release_read_outside_fetch', lines: 0 });
    expect(logs.filter((line) => line.error_code === 'RELEASE_READ_OUTSIDE_FETCH')).toEqual([
      expect.objectContaining({ level: 'error', msg: READ_OUTSIDE_FETCH_MESSAGE, pricing_run_id: runId }),
    ]);
    expect(logs.filter((line) => line.msg === ENGINE_ERRORS_MESSAGE)).toEqual([]);
  });

  it('puts a read outside the fetch before a content gap', async () => {
    const target = await maMonth('outside-fetch-and-content');
    drop.fromCall = 1;
    const logs: Record<string, unknown>[] = [];
    const runId = await priceMonth(target, '2026-10-01', '2026-10-31', logs);
    expect(await runState(runId)).toEqual({ status: 'failed', failure_code: 'release_read_outside_fetch', lines: 0 });
    expect(contentAlerts(logs)).toEqual([]);
  });

  it('puts a read outside the fetch before the location, also when it comes in a later batch than the first location stop', async () => {
    // Each payment bills a code the other does not (97530, 97116): whichever claim is priced second asks for a new key.
    const target = await locationAndContent('outside-fetch-after-location', 'SYNPLAN-MA-05', '97116');
    for (const [claimsPerBatch, fromCall] of [
      [undefined, 1],
      [1, 2],
    ] as const) {
      drop.calls = 0;
      drop.fromCall = fromCall;
      const logs: Record<string, unknown>[] = [];
      const runId = await priceMonth(target, '2026-10-01', '2026-10-31', logs, claimsPerBatch);
      expect(await runState(runId)).toEqual({ status: 'failed', failure_code: 'release_read_outside_fetch', lines: 0 });
      expect(logs.filter((line) => line.error_code === 'RELEASE_READ_OUTSIDE_FETCH')).toHaveLength(1);
    }
  });
});

describe('the release’s content windows', () => {
  it('give the three span contents exactly as rule_release_content_span() does, for 900001 and 900007', async () => {
    const target = await w.practice('windows');
    await withJobScope(w.worker, { jobId: randomUUID(), practiceId: target.practiceId }, async (scope) => {
      for (const releaseNo of [RELEASE, CONTENT_GAP_RELEASE]) {
        const spans = await releaseContentSpans(scope.client, releaseNo);
        const windows = await releaseContentWindows(scope.client, releaseNo);
        for (const content of ['mppr_code', 'mppr_general', 'ncci_mue'] as const) {
          expect(windows.get(content)?.loaded, `${String(releaseNo)} ${content}`).toEqual(spans[content]);
        }
      }
      const gap = await releaseContentSpans(scope.client, CONTENT_GAP_RELEASE);
      expect(gap).toEqual({ mppr_code: [{ from: '2026-01-01', until: '2026-10-01' }], mppr_general: [{ from: '2026-01-01', until: null }], ncci_mue: [{ from: '2026-01-01', until: '2026-10-01' }] });
      // Limited to the types asked.
      expect([...(await releaseContentWindows(scope.client, CONTENT_GAP_RELEASE, ['pfs_gpci', 'ncci_mue'])).keys()]).toEqual(['ncci_mue', 'pfs_gpci']);
    });
  });

  it('shows one hand-typed MUE record widening the span past the quarters its file’s records state (why the checker refuses it, C1 and C15)', async () => {
    // An unpublished scratch release: three parsed MUE quarters of 2026, and one record typed for the whole year beside them.
    const scratch = 900_094;
    await w.owner.query("INSERT INTO rule_release (release_no, manifest_sha256, notes) VALUES ($1, $2, 'SYNTHETIC')", [scratch, 'e'.repeat(64)]);
    await w.owner.query(
      `INSERT INTO rule_record (release_no, record_type, key, value, effective_from, effective_to, source, verification, sha256)
       SELECT $1, 'ncci_mue', jsonb_build_object('hcpcs', q.hcpcs), '{"synthetic":true}', q.effective_from, q.effective_to, '{"synthetic":true}', 'L1', repeat(q.hash, 64)
         FROM (VALUES ('97110', '2026-01-01'::date, '2026-03-31'::date, '1'), ('97110', '2026-04-01', '2026-06-30', '2'), ('97110', '2026-07-01', '2026-09-30', '3'),
                      ('97140', '2026-01-01', '2026-12-31', '4')) q (hcpcs, effective_from, effective_to, hash)`,
      [scratch],
    );
    const target = await w.practice('widened');
    const spans = await withJobScope(w.worker, { jobId: randomUUID(), practiceId: target.practiceId }, (scope) => releaseContentSpans(scope.client, scratch));
    expect(spans.ncci_mue).toEqual([{ from: '2026-01-01', until: '2027-01-01' }]);
  });
});

describe('the engine-error page of a refused run', () => {
  it('logs the engine-error line beside the content alert when other lines of the refused run stopped on engine errors that page the operator', async () => {
    // A scratch release, 900007's records with the GPCIs ending 2026-09-30, published before the next test's.
    await w.owner.query("INSERT INTO rule_release (release_no, manifest_sha256, notes) VALUES ($1, $2, 'SYNTHETIC')", [MIXED_GAP_RELEASE, 'c'.repeat(64)]);
    await w.owner.query(
      `INSERT INTO rule_record (release_no, record_type, key, value, effective_from, effective_to, source, verification, sha256)
       SELECT $1, record_type, key, value, effective_from, CASE WHEN record_type = 'pfs_gpci' THEN '2026-09-30'::date ELSE effective_to END, source, verification, sha256
         FROM rule_record WHERE release_no = $2`,
      [MIXED_GAP_RELEASE, CONTENT_GAP_RELEASE],
    );
    await w.owner.query('UPDATE rule_release SET published_at = now() WHERE release_no = $1', [MIXED_GAP_RELEASE]);
    // One payment's fixed fee with the coding edits on reads the MUE outside its span; the other's percent of Medicare stops on no_gpci.
    const target = await w.practice('mue-and-gpci-october');
    await loadMonth(target, '2026-10-14');
    await loadMonth(target, '2026-10-14', { other: true, plan: 'SYNPLAN-FX-05' });
    const edits = await w.signedContract(target, '2026-01-01', { terms: { ...FIXED, flags: { timed_units_rule: 'PER_CODE', apply_ncci: true } } });
    await w.mapped(target, await w.planOf(target, 'CE:SYNPLAN-FX-05'), 'contract', '2026-01-01', edits.versionId);
    const percent = await w.signedContract(target, '2026-01-01');
    await w.mapped(target, await w.planOf(target, 'CE:SYNPLAN-MA-05'), 'contract', '2026-01-01', percent.versionId);
    for (const claimsPerBatch of [undefined, 1]) {
      const logs: Record<string, unknown>[] = [];
      const runId = await priceMonth(target, '2026-10-01', '2026-10-31', logs, claimsPerBatch, MIXED_GAP_RELEASE);
      expect(await runState(runId)).toEqual({ status: 'failed', failure_code: 'waiting_on_content_mue', lines: 0 });
      expect(contentAlerts(logs)).toEqual([expect.objectContaining({ level: 'warn', msg: CONTENT_NOT_LOADED_MESSAGE, pricing_run_id: runId, record_count: 6 })]);
      expect(logs.filter((line) => line.msg === ENGINE_ERRORS_MESSAGE)).toEqual([expect.objectContaining({ level: 'error', pricing_run_id: runId, error_code: 'PRICING_ENGINE_ERROR' })]);
    }
  });
});

describe('the content alert of a complete run', () => {
  it('logs once for a run with lines stopped on a GPCI not loaded for their dates, beside the engine-error log, which is unchanged', async () => {
    // From here on the scratch release is in force; this test is the file's last.
    await w.owner.query("INSERT INTO rule_release (release_no, manifest_sha256, notes) VALUES ($1, $2, 'SYNTHETIC')", [GPCI_GAP_RELEASE, 'd'.repeat(64)]);
    await w.owner.query(
      `INSERT INTO rule_record (release_no, record_type, key, value, effective_from, effective_to, source, verification, sha256)
       SELECT $1, record_type, key, value, effective_from, CASE WHEN record_type = 'pfs_gpci' THEN '2026-09-30'::date ELSE effective_to END, source, verification, sha256
         FROM rule_record WHERE release_no = $2`,
      [GPCI_GAP_RELEASE, RELEASE],
    );
    await w.owner.query('UPDATE rule_release SET published_at = now() WHERE release_no = $1', [GPCI_GAP_RELEASE]);
    const target = await w.practice('gpci-october');
    await loadMonth(target, '2026-10-14');
    const signed = await w.signedContract(target, '2026-01-01');
    await w.mapped(target, await w.planOf(target, 'CE:SYNPLAN-MA-05'), 'contract', '2026-01-01', signed.versionId);
    const logs: Record<string, unknown>[] = [];
    const runId = await priceMonth(target, '2026-10-01', '2026-10-31', logs, undefined, GPCI_GAP_RELEASE);
    expect(await runState(runId)).toEqual({ status: 'complete', failure_code: null, lines: 3 });
    const { rows } = await w.owner.query<{ detail: string }>("SELECT trace->'outcome'->>'detail' AS detail FROM priced_line WHERE pricing_run_id = $1", [runId]);
    expect(rows.map((row) => row.detail)).toEqual(['no_gpci', 'no_gpci', 'no_gpci']);
    expect(contentAlerts(logs)).toEqual([expect.objectContaining({ level: 'warn', msg: CONTENT_NOT_LOADED_MESSAGE, pricing_run_id: runId, record_count: 3 })]);
    expect(logs.filter((line) => line.msg === ENGINE_ERRORS_MESSAGE)).toEqual([expect.objectContaining({ level: 'error', pricing_run_id: runId, error_code: 'PRICING_ENGINE_ERROR' })]);
    // The same terms on a September line, its GPCI loaded, log no content alert.
    const september = await w.practice('gpci-september');
    await loadMonth(september, '2026-09-16');
    const signedSeptember = await w.signedContract(september, '2026-01-01');
    await w.mapped(september, await w.planOf(september, 'CE:SYNPLAN-MA-05'), 'contract', '2026-01-01', signedSeptember.versionId);
    const quiet: Record<string, unknown>[] = [];
    await priceMonth(september, '2026-09-01', '2026-09-30', quiet, undefined, GPCI_GAP_RELEASE);
    expect(contentAlerts(quiet)).toEqual([]);
  });
});
