import { randomBytes, randomUUID } from 'node:crypto';

import { type PracticeScope, type ScopeClient, readDatabaseUrl, withPracticeScope } from '@tp/db';
import { addMembership, asOwner, createOrganization, createPracticeWithLocation, createUser } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import type { Practice } from '@tp/worker/testing';
import { TriageWorld } from '@tp/worker/testing/triage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DevAuthProvider } from '../auth/dev-provider';
import { MemoryDevStore } from '../auth/dev-store';
import { Sealer } from '../auth/seal';
import { SESSION_COOKIE, openSession } from '../auth/sessions';
import type { CookieJar, Outcome, Route } from '../http/route';
import { practiceHome } from '../routes/practice';
import { uploadsPage } from '../routes/uploads';
import { type Services, createServices } from '../server/services';
import { DEADLINE_WINDOW_DAYS, HOME_CASES, dashboard } from './queries';

/**
 * The practice home's figures against PostgreSQL (docs/adr/0082; test matrix HOM-01, HOM-03). SYNTHETIC data only:
 * the CAS-03 and CAS-05 lines priced under fixed schedules and triaged into two cases.
 *
 * - HOM-01, cost (F1): the home reads its cases in one statement, the only one of dashboard() that runs the pricing
 *   check; its plan computes the check at one node, once (the per-line value behind the OFFSET 0 fence, never once
 *   per aggregate), and counted, it runs once per case line at actionable.
 * - HOM-03: the home's upload gate is the one Uploads reads: a practice's BAA and its organization's open it; one
 *   signed tomorrow and none close it.
 */

let w: TriageWorld;
let services: Services;
let practice: Practice;
const today = () => new Date().toISOString().slice(0, 10);
const FIXED = { effectiveFrom: '2026-01-01', disputeWindowDays: 3650 };

class Jar implements CookieJar {
  private readonly values = new Map<string, string>();
  constructor(token: string) {
    this.values.set(SESSION_COOKIE, token);
  }
  get(name: string) {
    return this.values.get(name);
  }
  set(name: string, value: string) {
    this.values.set(name, value);
  }
  delete(name: string) {
    this.values.delete(name);
  }
}

async function call<R>(route: Route<R>, userId: string, params: Record<string, unknown>): Promise<Outcome<R>> {
  const token = (await openSession(w.app, { userId, method: 'totp', deviceToken: undefined, userAgent: null, requestId: 'test' })).sessionToken;
  return route.invoke({ cookies: new Jar(token), params, input: undefined, requestId: `test-${randomUUID()}`, userAgent: null }, services);
}

function ok<R>(outcome: Outcome<R>): R {
  if (outcome.status !== 'ok') {
    throw new Error(`expected ok, got ${JSON.stringify(outcome)}`);
  }
  return outcome.data;
}

beforeAll(async () => {
  w = await TriageWorld.open(readDatabaseUrl());
  const sealer = new Sealer(randomBytes(32));
  services = createServices({
    origin: 'http://localhost:3100',
    pool: w.app,
    provider: new DevAuthProvider({
      store: new MemoryDevStore(),
      sealer: sealer.derive('dev-provider'),
      webauthn: { rpId: 'localhost', rpName: 'Test', origin: 'http://localhost:3100' },
      deliverInvitation: () => Promise.resolve(),
      scryptCost: { n: 1024, r: 8, p: 1 },
    }),
    keys: w.keys,
    sealer,
    logger: createLogger({ sink: () => undefined }),
  });
  practice = await w.practice('HOME FIGURES');
  await w.load(practice, 'CAS-03/remit.835');
  await w.load(practice, 'CAS-05/remit.835');
  const one = await w.fixedContract(practice, { ...FIXED, schedule: [{ code: '97110', amountCents: '5000' }] });
  const two = await w.fixedContract(practice, { ...FIXED, schedule: [{ code: '97530', amountCents: '5200' }] });
  const runId = await w.pricedRun(practice, {
    plans: [
      { key: 'CE:SYNPLAN-FIX-ONE', versionId: one.versionId },
      { key: 'CE:SYNPLAN-FIX-TWO', versionId: two.versionId },
    ],
    from: '2026-03-01',
    to: '2026-03-31',
  });
  await w.triage(practice, runId);
}, 180_000);

afterAll(async () => {
  await w.close();
});

/** A node of EXPLAIN (FORMAT JSON)'s plan. */
interface PlanNode {
  readonly 'Node Type': string;
  readonly Output?: readonly string[];
  readonly Plans?: readonly PlanNode[];
}

const names = (node: PlanNode) => (node.Output ?? []).some((output) => output.includes('priced_line_pricing_check'));

/** The plan nodes that compute the check: they name it and none of their children's outputs does. */
function computedAt(node: PlanNode): PlanNode[] {
  const below = (node.Plans ?? []).flatMap(computedAt);
  return names(node) && !(node.Plans ?? []).some(names) ? [node, ...below] : below;
}

/**
 * Runs `run` in a transaction of the database's superuser with track_functions on, and returns how many times it called
 * priced_line_pricing_check() and how many case lines of the practice are not written off with their latest stage
 * actionable (the lines the check may run for).
 */
async function counted(run: () => Promise<void>): Promise<{ readonly calls: number; readonly atActionable: number }> {
  await w.owner.query('BEGIN');
  try {
    await w.owner.query("SET LOCAL track_functions = 'pl'");
    await run();
    const { rows } = await w.owner.query<{ calls: number; at_actionable: number }>(
      `SELECT coalesce(pg_stat_get_xact_function_calls('priced_line_pricing_check'::regproc), 0)::int AS calls,
              (SELECT count(*)::int FROM case_line x
                WHERE x.practice_id = $1 AND x.written_off_reason IS NULL
                  AND (SELECT s.stage FROM line_status s WHERE s.service_line_id = x.service_line_id ORDER BY s.seq DESC LIMIT 1) = 'actionable') AS at_actionable`,
      [practice.practiceId],
    );
    return { calls: rows[0]?.calls ?? 0, atActionable: rows[0]?.at_actionable ?? 0 };
  } finally {
    await w.owner.query('ROLLBACK');
  }
}

const as = <T>(run: (scope: PracticeScope<ScopeClient>) => Promise<T>) => withPracticeScope(w.app, { actorId: practice.manager, practiceIds: [practice.practiceId] }, run);

describe('the home reads its cases in one statement (HOM-01, F1)', () => {
  it('runs the pricing check in one statement of dashboard(), computed at one plan node, once per case line at actionable', async () => {
    const statements: string[] = [];
    const home = await as((scope) =>
      dashboard(
        {
          ...scope,
          client: {
            query: (text: string, values?: unknown[]) => {
              statements.push(text);
              return scope.client.query(text, values);
            },
            release: () => undefined,
          } as ScopeClient,
        },
        practice.practiceId,
        today(),
      ),
    );
    expect(home.headline.actionable).toEqual({ cents: '55200', lines: 16, outOfFigure: { movedOn: 0, stale: 0 } });
    expect(statements.filter((text) => text.includes('priced_line_pricing_check'))).toEqual([HOME_CASES]);

    // The plan computes the check at one node, named once in that node's output: the nodes above it read the value
    // (EXPLAIN deparses their reference to it as the expression again, so they are not counted), never once per FILTER.
    const plan = await as(
      async (scope) =>
        (await scope.client.query<{ 'QUERY PLAN': [{ Plan: PlanNode }] }>(`EXPLAIN (VERBOSE, FORMAT JSON) ${HOME_CASES}`, [practice.practiceId, today(), DEADLINE_WINDOW_DAYS])).rows[0]?.['QUERY PLAN'][0].Plan,
    );
    const computing = plan === undefined ? [] : computedAt(plan);
    expect(computing.map((node) => node.Output?.join(', ').match(/priced_line_pricing_check/g)?.length)).toEqual([1]);

    // Measured: in one transaction with the function's calls counted, the statement runs the check once for each case
    // line not written off at actionable, and for no other line. Read as the database's superuser (track_functions is
    // its setting), which the policies do not restrict; the statement names the practice itself.
    const { calls, atActionable } = await counted(async () => {
      await w.owner.query(HOME_CASES, [practice.practiceId, today(), DEADLINE_WINDOW_DAYS]);
    });
    expect(atActionable).toBeGreaterThan(0);
    expect(calls).toBe(atActionable);
  }, 60_000);
});

describe('the empty home names the gate Uploads uses (HOM-03, D9)', () => {
  /** A practice of a new group, with its administrator, and the BAA `baa` names (none, the practice's, the group's, or the practice's signed tomorrow). */
  async function practiceWith(baa: 'none' | 'practice' | 'organization' | 'tomorrow'): Promise<{ readonly practiceId: string; readonly admin: string }> {
    const organizationId = await createOrganization(w.owner, 'group', `HOME GATE ${baa.toUpperCase()}`);
    const admin = await createUser(w.owner);
    await addMembership(w.owner, organizationId, admin, 'practice_admin');
    const practiceId = randomUUID();
    await asOwner(w.owner, [practiceId], async () => {
      await createPracticeWithLocation(w.owner, { id: practiceId, organizationId, name: `SYNTHETIC PRACTICE HOME GATE ${baa.toUpperCase()}` });
      if (baa !== 'none') {
        const id = randomUUID();
        await w.owner.query(
          `INSERT INTO agreement (id, organization_id, practice_id, kind, version, signed_at, signer, document_ref, sha256)
           VALUES ($1, $2, $3, 'baa', '1', now() + ($4::text)::interval, 'SYNTHETIC SIGNER', $5, $6)`,
          [id, organizationId, baa === 'organization' ? null : practiceId, baa === 'tomorrow' ? '1 day' : '0 days', `agreements/${id}`, randomBytes(32).toString('hex')],
        );
      }
    });
    return { practiceId, admin };
  }

  it.each([
    ['practice', true],
    ['organization', true],
    ['tomorrow', false],
    ['none', false],
  ] as const)('reads a BAA of kind %s as Uploads does (on file: %s)', async (baa, open) => {
    const { practiceId, admin } = await practiceWith(baa);
    const home = ok(await call(practiceHome, admin, { practiceId }));
    const uploads = ok(await call(uploadsPage, admin, { practiceId }));
    expect([home.dashboard.uploads.baaOnFile, uploads.gate.open, home.suspension]).toEqual([open, open, null]);
  }, 60_000);
});
