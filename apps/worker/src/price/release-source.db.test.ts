import { randomUUID } from 'node:crypto';

import { readDatabaseUrl, withJobScope } from '@tp/db';
import type { PracticeScope, ScopeClient } from '@tp/db/runtime';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { JobContext } from '../jobs/handlers';
import { completeRuns, runReleaseImpact } from './impact';
import { priceHandler } from './job';
import type * as ReleaseModule from './release';
import { KEYED_RECORDS, ReleaseTypeNotRead, forgetSharedReleases, loadRuleRelease, storedReleaseSource, typedRelease } from './release';
import { type Practice, PricingWorld, RELEASE, RERUN_RELEASE } from './test-support/pricing-world';

/**
 * The price job reads its release by key (audit #31; docs/adr/0071; test matrix RCC-07), against a scratch database
 * under SYNTHETIC release 900001: a run's stored rows, traces included, are byte-equal to a run of the same lines read
 * through the whole-release index (loadRuleRelease(), the oracle, served by a test-only shim); the shared types are
 * read once per release across runs and each key once per run; the keyed statement probes rule_record_identity and
 * never scans the release; triage's and reports' typed read refuses any other type; and the release impact check
 * counts the same through either read.
 */

/** When on, the price job reads its release through the whole-release index instead (the oracle). */
const oracle = vi.hoisted(() => ({ on: false }));

vi.mock('./release', async (importOriginal) => {
  const actual = await importOriginal<typeof ReleaseModule>();
  return {
    ...actual,
    storedReleaseSource: async (client: ScopeClient, releaseNo: number): Promise<Awaited<ReturnType<typeof actual.storedReleaseSource>>> => {
      if (!oracle.on) {
        return actual.storedReleaseSource(client, releaseNo);
      }
      const whole = await actual.loadRuleRelease(client, releaseNo);
      // Every lookup served from the whole release: no key set, so no violation is possible.
      const view = { releaseNo: whole.releaseNo, manifestSha256: whole.manifestSha256, inForce: whole.inForce.bind(whole), latestInYear: whole.latestInYear.bind(whole), ref: whole.ref.bind(whole), violation: null };
      return { releaseNo: whole.releaseNo, manifestSha256: whole.manifestSha256, view: () => Promise.resolve(view) };
    },
  };
});

let w: PricingWorld;

beforeAll(async () => {
  w = await PricingWorld.open(readDatabaseUrl());
}, 60_000);

afterAll(async () => {
  await w.close();
});

interface Statement {
  readonly text: string;
  readonly values: readonly unknown[];
}

/** A job context whose every statement is recorded, on the job's own client, in order. */
function recordingContext(practiceId: string, statements: Statement[]): JobContext {
  const base = w.jobContext(practiceId);
  return {
    ...base,
    transaction: (work) =>
      base.transaction((scope: PracticeScope<ScopeClient>) => {
        const client = new Proxy(scope.client, {
          get(target, property) {
            if (property === 'query') {
              return (text: string, values: unknown[] = []) => {
                statements.push({ text, values });
                return target.query(text, values);
              };
            }
            const value: unknown = Reflect.get(target, property);
            return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
          },
        });
        return work({ ...scope, client });
      }),
  };
}

/** A practice with the SYNTHETIC MAP-05 remittance (97110, 97140 and 97530 on one day), mapped as Medicare Advantage: every flag on. */
async function maPractice(label: string): Promise<Practice> {
  const target = await w.practice(label);
  await w.load(target, 'MAP-05/remit.835');
  await w.mapped(target, await w.planOf(target, 'CE:SYNPLAN-MA-05'), 'ma_noncontracted', '2026-01-01');
  return target;
}

/** A run's stored rows as text, the run's own identifiers left out, in line order. */
async function storedRows(pricingRunId: string): Promise<string[]> {
  const { rows } = await w.owner.query<{ row: string; trace: string }>(
    `SELECT (to_jsonb(p) - 'id' - 'pricing_run_id' - 'trace' - 'created_at' - 'updated_at')::text AS row, p.trace::text AS trace
       FROM priced_line p WHERE p.pricing_run_id = $1 ORDER BY p.service_line_id`,
    [pricingRunId],
  );
  return rows.map((row) => `${row.row}\n${row.trace}`);
}

describe('a run read by key stores exactly what the whole-release read stores (the oracle)', () => {
  it.each([
    ['Medicare Advantage, every flag on', 'MAP-05/remit.835', 'CE:SYNPLAN-MA-05', 'ma_noncontracted', '2026-02-01', '2026-02-28'],
    ['Medicare Advantage over a re-run fixture', 'PRC-19/remit.835', 'CE:SYNPLAN-MA-NC', 'ma_noncontracted', '2026-02-01', '2026-02-28'],
    ['a contract at a percentage of Medicare', 'MAP-04/remit.835', 'CE:SYNPLAN-OON-04', 'contract', '2026-04-01', '2026-04-30'],
  ] as const)('%s', async (label, fixture, plan, kind, from, to) => {
    const target = await w.practice(`oracle-${label}`);
    await w.load(target, fixture);
    const versionId = kind === 'contract' ? (await w.signedContract(target, '2026-01-01')).versionId : null;
    await w.mapped(target, await w.planOf(target, plan), kind, '2026-01-01', versionId);
    const keyed = await w.createRun(target, from, to);
    await w.execute(target, keyed, [], { claimsPerBatch: 1 });
    oracle.on = true;
    let whole: string;
    try {
      whole = await w.createRun(target, from, to);
      await w.execute(target, whole);
    } finally {
      oracle.on = false;
    }
    const rows = await storedRows(keyed);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows).toEqual(await storedRows(whole));
    expect((await w.one<{ status: string }>('SELECT status FROM pricing_run WHERE id = $1', [keyed])).status).toBe('complete');
  });
});

describe('what a run reads of its release', () => {
  it('reads the shared types once per release across two runs, and each key once per run', async () => {
    forgetSharedReleases();
    const target = await maPractice('read-counts');
    const runs = [await w.createRun(target, '2026-02-01', '2026-02-28'), await w.createRun(target, '2026-02-01', '2026-02-28')];
    const perRun: Statement[][] = [];
    for (const runId of runs) {
      const statements: Statement[] = [];
      await priceHandler({ claimsPerBatch: 1 })({ practice_id: target.practiceId, pricing_run_id: runId }, recordingContext(target.practiceId, statements));
      perRun.push(statements);
    }
    const typeScans = perRun.map((statements) => statements.filter((statement) => statement.text.includes('WITH RECURSIVE types')).length);
    expect(typeScans).toEqual([1, 0]);
    for (const statements of perRun) {
      const keyed = statements.filter((statement) => statement.text === KEYED_RECORDS);
      expect(keyed.length).toBeGreaterThanOrEqual(1);
      const asked = keyed.flatMap((statement) => (statement.values[1] as string[]).map((type, index) => `${type} ${(statement.values[2] as string[])[index] ?? ''}`));
      // Each key once: the codes, the general MPPR rate, the claim's ordered pairs and the ZIP in both ZIP files.
      expect(new Set(asked).size).toBe(asked.length);
      expect(asked).toContain(`mppr_rate ${JSON.stringify({ component: 'practice_expense' })}`);
      expect(asked).toContain(`ncci_ptp ${JSON.stringify({ column1: '97140', column2: '97530' })}`);
      expect(asked).toContain(`locality_map ${JSON.stringify({ zip: '00011' })}`);
      // No statement reads the whole release (loadRuleRelease()'s read: every type, by release alone).
      expect(statements.filter((statement) => /FROM rule_record WHERE release_no = \$1 ORDER BY record_type, effective_from/.test(statement.text))).toEqual([]);
    }
  });

  it('serves a key asked in an earlier batch without fetching it again, and fetches only the new ones', async () => {
    const target = await maPractice('read-delta');
    const statements: Statement[] = [];
    await withJobScope(w.worker, { jobId: randomUUID(), practiceId: target.practiceId }, async (scope) => {
      const client = new Proxy(scope.client, {
        get(clientTarget, property) {
          if (property === 'query') {
            return (text: string, values: unknown[] = []) => {
              statements.push({ text, values });
              return clientTarget.query(text, values);
            };
          }
          const value: unknown = Reflect.get(clientTarget, property);
          return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(clientTarget) : value;
        },
      });
      const source = await storedReleaseSource(client, RELEASE);
      const first = await source.view({ ...emptyKeys(), pfs_rvu: new Set([JSON.stringify({ hcpcs: '97110', modifier: '' })]) });
      expect(first.inForce('pfs_rvu', { hcpcs: '97110', modifier: '' }, '2026-02-16')).not.toBeNull();
      const before = statements.filter((statement) => statement.text === KEYED_RECORDS).length;
      const second = await source.view({ ...emptyKeys(), pfs_rvu: new Set([JSON.stringify({ hcpcs: '97110', modifier: '' })]) });
      expect(statements.filter((statement) => statement.text === KEYED_RECORDS).length).toBe(before);
      expect(second.inForce('pfs_rvu', { hcpcs: '97110', modifier: '' }, '2026-02-16')).not.toBeNull();
      const third = await source.view({ ...emptyKeys(), ncci_mue: new Set([JSON.stringify({ hcpcs: '97110' })]) });
      const last = statements.filter((statement) => statement.text === KEYED_RECORDS).at(-1);
      expect(last?.values[2]).toEqual([JSON.stringify({ hcpcs: '97110' })]);
      // The earlier keys are still served, and a key never asked is loud.
      expect(third.inForce('pfs_rvu', { hcpcs: '97110', modifier: '' }, '2026-02-16')).not.toBeNull();
      expect(third.inForce('ncci_mue', { hcpcs: '97110' }, '2026-02-16')).not.toBeNull();
      expect(() => third.inForce('pfs_rvu', { hcpcs: '97140', modifier: '' }, '2026-02-16')).toThrow();
      expect(third.violation).toEqual({ recordType: 'pfs_rvu', keyFields: ['hcpcs', 'modifier'] });
    });
  });

  it('refuses a release that is not published, as loadRuleRelease() does', async () => {
    const target = await maPractice('read-missing');
    const [keyed, whole] = await withJobScope(w.worker, { jobId: randomUUID(), practiceId: target.practiceId }, async (scope) => [
      await storedReleaseSource(scope.client, 999_999).catch((error: unknown) => error),
      await loadRuleRelease(scope.client, 999_999).catch((error: unknown) => error),
    ]);
    expect(keyed).toEqual(whole);
    expect((keyed as Error).name).toBe('RuleReleaseMismatchError');
  });
});

function emptyKeys() {
  return { pfs_rvu: new Set<string>(), ncci_mue: new Set<string>(), mppr_rate: new Set<string>(), ncci_ptp: new Set<string>(), locality_map: new Set<string>(), locality_map_plus_four: new Set<string>() };
}

describe('the plans of the release reads', () => {
  /** An unpublished SYNTHETIC scratch release (never in force), whose filler records give rule_record a real size beside 900001. */
  const FILLER_RELEASE = 900_096;

  beforeAll(async () => {
    // As packages/db/src/screening-queue.db.test.ts sizes it: tens of thousands of records, so a plan that scans or
    // joins the release would cost what it costs in production, then analyzed, as the release loader leaves it.
    await w.owner.query("INSERT INTO rule_release (release_no, manifest_sha256, notes) VALUES ($1, $2, 'SYNTHETIC filler')", [FILLER_RELEASE, 'f'.repeat(64)]);
    await w.owner.query(
      `INSERT INTO rule_record (release_no, record_type, key, value, effective_from, effective_to, source, verification, sha256)
       SELECT $1, t.type, jsonb_build_object('hcpcs', lpad(g::text, 5, '0'), 'modifier', ''), '{"synthetic":true}', d.effective_from, d.effective_to, '{"synthetic":true}', 'L1',
              encode(sha256(convert_to(t.type || g::text || d.effective_from::text, 'UTF8')), 'hex')
         FROM (VALUES ('pfs_rvu', 12000), ('ncci_ptp', 4000), ('carc', 40), ('rarc', 60), ('pfs_gpci', 12), ('conversion_factor', 1)) t (type, n),
              generate_series(1, t.n) g,
              (VALUES ('2026-01-01'::date, '2026-06-30'::date), ('2026-07-01'::date, '2026-12-31'::date)) d (effective_from, effective_to)`,
      [FILLER_RELEASE],
    );
    await w.owner.query('ANALYZE rule_record');
  });

  /** The plans of a statement as it runs with its values, as auto_explain gives them (the precedent of packages/db/src/screening-queue.db.test.ts). */
  async function plans(sql: string, values: unknown[]): Promise<string> {
    const seen: string[] = [];
    const listen = (notice: { message?: string }) => {
      seen.push(notice.message ?? '');
    };
    w.owner.on('notice', listen);
    try {
      await w.owner.query("LOAD 'auto_explain'");
      await w.owner.query('SET auto_explain.log_min_duration = 0');
      await w.owner.query("SET auto_explain.log_level = 'notice'");
      await w.owner.query("SET auto_explain.log_format = 'json'");
      await w.owner.query('SET client_min_messages = notice');
      await w.owner.query(sql, values);
    } finally {
      w.owner.off('notice', listen);
      await w.owner.query('RESET ALL');
    }
    return seen.filter((plan) => plan.includes('rule_record')).join('\n');
  }

  it('probes rule_record_identity for each key, with no scan or join of the release, whatever the planner’s statistics', async () => {
    const keys = [
      ['pfs_rvu', { hcpcs: '97110', modifier: '' }],
      ['ncci_mue', { hcpcs: '97110' }],
      ['mppr_rate', { component: 'practice_expense' }],
      ['ncci_ptp', { column1: '97140', column2: '97530' }],
      ['locality_map', { zip: '00011' }],
    ] as const;
    const keyed = await plans(KEYED_RECORDS, [RELEASE, keys.map(([type]) => type), keys.map(([, key]) => JSON.stringify(key))]);
    expect(keyed).toMatch(/rule_record_identity/);
    expect(keyed).not.toMatch(/"Node Type": "(?:Hash Join|Merge Join)"/);
    expect(keyed).not.toMatch(/"Node Type": "(?:Seq Scan|Bitmap Heap Scan)",[^{}]*"Relation Name": "rule_record"/);
  });

  it('reads the shared types through rule_record_by_type', async () => {
    const shared = await plans(
      `SELECT record_type, key, value, effective_from::text AS effective_from, effective_to::text AS effective_to, sha256 FROM rule_record WHERE release_no = $1 AND record_type = ANY ($2::text[]) ORDER BY record_type, effective_from, id`,
      [RELEASE, ['pfs_gpci', 'conversion_factor', 'sequestration']],
    );
    expect(shared).toMatch(/rule_record_by_type/);
    expect(shared).not.toMatch(/"Node Type": "Seq Scan"/);
  });
});

describe('typedRelease (triage and reports)', () => {
  it('serves the types it read and refuses any other, naming the type only', async () => {
    const target = await maPractice('typed');
    await withJobScope(w.worker, { jobId: randomUUID(), practiceId: target.practiceId }, async (scope) => {
      const release = await typedRelease(scope.client, RELEASE, ['mppr_rate', 'conversion_factor']);
      expect(release.inForce('mppr_rate', { component: 'practice_expense' }, '2026-02-16')).not.toBeNull();
      expect(release.latestInYear('conversion_factor', { applicability: 'non_qualifying_apm' }, 2026)).not.toBeNull();
      const whole = await loadRuleRelease(scope.client, RELEASE);
      const found = release.inForce('mppr_rate', { hcpcs: '97110', modifier: '' }, '2026-02-16');
      const expected = whole.inForce('mppr_rate', { hcpcs: '97110', modifier: '' }, '2026-02-16');
      expect(found === null || expected === null ? null : release.ref(found)).toEqual(expected === null ? null : whole.ref(expected));
      expect(() => release.inForce('pfs_rvu', { hcpcs: '97110', modifier: '' }, '2026-02-16')).toThrow(ReleaseTypeNotRead);
      expect(() => release.latestInYear('ncci_mue', { hcpcs: '97110' }, 2026)).toThrow(new ReleaseTypeNotRead('ncci_mue'));
      expect(new ReleaseTypeNotRead('pfs_rvu').message).not.toMatch(/97110/);
    });
  });
});

describe('the release impact check through the keyed read', () => {
  it('counts what the whole-release read counts, under its own release and another', async () => {
    const target = await w.practice('impact-keyed');
    await w.load(target, 'PRC-19/remit.835');
    await w.mapped(target, await w.planOf(target, 'CE:SYNPLAN-MA-NC'), 'ma_noncontracted', '2026-01-01');
    const runId = await w.createRun(target, '2026-02-01', '2026-02-28');
    await w.execute(target, runId);
    // From here on release 900004 (one 97110 relative value changed) is in force; this test is the file's last.
    await w.loadRerunRelease();
    await withJobScope(w.worker, { jobId: randomUUID(), practiceId: target.practiceId }, async (scope) => {
      const [run] = await completeRuns(scope, target.practiceId, `test-${randomUUID()}`);
      if (run === undefined) {
        throw new Error('expected the complete run');
      }
      for (const releaseNo of [RELEASE, RERUN_RELEASE]) {
        const keyed = await runReleaseImpact(scope, run, await storedReleaseSource(scope.client, releaseNo), `test-${randomUUID()}`, { claimsPerBatch: 1 });
        const whole = await runReleaseImpact(scope, run, await loadRuleRelease(scope.client, releaseNo), `test-${randomUUID()}`);
        expect(keyed).toEqual(whole);
      }
      const changed = await runReleaseImpact(scope, run, await storedReleaseSource(scope.client, RERUN_RELEASE), `test-${randomUUID()}`);
      expect(changed.changedLines).toBe(2);
    });
  });
});
