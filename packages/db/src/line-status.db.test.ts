import { randomUUID } from 'node:crypto';
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import fc from 'fast-check';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readDatabaseUrl } from './config';
import { MIGRATIONS_DIR, migrate } from './migrate';
import { OWNER_ROLE } from './roles';
import {
  type MigratedDatabase,
  type OwnerClient,
  RowFactory,
  type ScratchDatabase,
  type TenantWorld,
  asOwner,
  createMigratedDatabase,
  createScratchDatabase,
  createTenantWorld,
} from './testing';

/**
 * CAS-40 (SUITE-CAP-1b; migration 20261109090000; docs/adr/0083): a line's stage events keep their rules and their
 * commit order under concurrent writers, and no transaction holds a lock per line. Each line's lock is its head row in
 * line_status_head, written first by line_status_rules(), so the order number (seq) of a line's events is drawn under
 * the lock and the lock lives in the row, not in the cluster's shared lock table. Coordination between connections
 * waits on pg_stat_activity, never on a sleep. Synthetic data only. CAS-40.6 (the payer stages, with the ledger) is
 * apps/worker/src/reconcile/stage-head.db.test.ts.
 */

const MIGRATION = '20261109090000_line_status_heads.sql';
const FORWARD = 'line stages move forward only; setting a stage again or an earlier one is an explicit reopen with a reason';
const NAMES = 'a reopen names the stage the line is at';
const KEEPS = 'a reopen keeps the line at its stage or moves it back; moving forward is not a reopen';
const PERSON = "a reopen is a person's explicit action";
/** A reason as line_status_reason_encrypted requires it (enc:v1:...), never real words. */
const REASON = 'enc:v1:U1lOVEhFVElDLVJFQVNPTg';

const STAGES = ['flagged', 'validated', 'actionable'] as const;
type Stage = (typeof STAGES)[number];
const rank = (stage: Stage): number => STAGES.indexOf(stage);

let database: MigratedDatabase;
let owner: pg.Client;
let factory: RowFactory;
let world: TenantWorld;
let other: TenantWorld;
/** A case worker of the world's organization (a billing manager), who may reopen a line. */
let manager: string;
const clients: pg.Client[] = [];

interface Failure {
  readonly code: string;
  readonly message: string;
}

/** What a statement came to, settled at once so a refusal never surfaces as an unhandled rejection. */
function settle(attempt: Promise<unknown>): Promise<'accepted' | Failure> {
  return attempt.then(
    () => 'accepted' as const,
    (error: unknown) => {
      const { code, message } = error as { code?: string; message?: string };
      return { code: code ?? 'error', message: message ?? '' };
    },
  );
}

/** A connection with an open transaction in `practiceIds`' scope: a job of the practice on the worker's login unless an actor is named. */
async function open(url: string, practiceIds: readonly string[], actorId: string = randomUUID()): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: url });
  client.on('error', () => undefined);
  await client.connect();
  clients.push(client);
  await pidOf(client);
  await client.query('BEGIN');
  await client.query("SELECT set_config('app.actor_id', $1, true), set_config('app.practice_ids', $2, true)", [actorId, `{${practiceIds.join(',')}}`]);
  return client;
}

/** A person's request transaction on the application's login, scoped as withPracticeScope scopes it. */
async function openAsPerson(actorId: string, practiceId: string): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: database.appUrl });
  client.on('error', () => undefined);
  await client.connect();
  clients.push(client);
  await pidOf(client);
  await client.query('BEGIN');
  await client.query("SELECT set_config('app.actor_id', $1, true)", [actorId]);
  await client.query('SELECT open_practice_scope($1::uuid[])', [[practiceId]]);
  return client;
}

async function close(client: pg.Client): Promise<void> {
  await client.query('ROLLBACK').catch(() => undefined);
  await client.end().catch(() => undefined);
}

/** Each connection's backend, read when it opens: a query on a connection waits behind its blocked statement. */
const pids = new WeakMap<pg.Client, number>();

async function pidOf(client: pg.Client): Promise<number> {
  const known = pids.get(client);
  if (known !== undefined) {
    return known;
  }
  const { rows } = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
  const pid = rows[0]?.pid ?? 0;
  pids.set(client, pid);
  return pid;
}

/** Resolves once backend `pid` waits on what `waits` names: a lock (wait_event_type 'Lock') unless said otherwise. */
async function waitFor(watcher: OwnerClient, pid: number, waits: { readonly type: string; readonly event?: string } = { type: 'Lock' }): Promise<void> {
  for (let tries = 0; tries < 1500; tries += 1) {
    const { rows } = (await watcher.query('SELECT wait_event_type AS type, wait_event AS event FROM pg_stat_activity WHERE pid = $1', [pid])) as { rows: { type: string | null; event: string | null }[] };
    if (rows[0]?.type === waits.type && (waits.event === undefined || rows[0].event === waits.event)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`backend ${String(pid)} never waited on ${waits.type}`);
}

interface StageEvent {
  readonly stage: string;
  readonly setBy?: string | null;
  readonly reopenedFrom?: string | null;
  readonly reason?: string | null;
}

function insertStage(client: OwnerClient, practiceId: string, line: string, event: StageEvent): Promise<unknown> {
  return client.query('INSERT INTO line_status (practice_id, service_line_id, stage, set_by, reason, reopened_from) VALUES ($1, $2, $3, $4, $5, $6)', [
    practiceId,
    line,
    event.stage,
    event.setBy ?? null,
    event.reason ?? null,
    event.reopenedFrom ?? null,
  ]);
}

/**
 * `count` new service lines of `target`: one built by the house row factory (with its claim, remittance and plan), and
 * copies of it on the same claim under later line numbers, inserted as the owner in the practice's scope.
 */
async function lines(client: OwnerClient, rows: RowFactory, target: TenantWorld, count: number): Promise<string[]> {
  const template = await rows.create(client, 'service_line', target);
  const templateId = template.id as string;
  if (count === 1) {
    return [templateId];
  }
  const copies = await asOwner(client, [target.practiceId], () =>
    client.query(
      `INSERT INTO service_line (practice_id, claim_id, line_no, procedure_qualifier, procedure_code, modifiers, revenue_code, charge_cents, paid_cents, units,
                                 original_units, service_date, service_date_to, place_of_service, line_allowed_cents, observed_allowed_cents,
                                 observed_allowed_basis, observed_allowed_allocated, patient_share_cents, rendering_npi, payer_plan_key)
       SELECT t.practice_id, t.claim_id, t.line_no + g, t.procedure_qualifier, t.procedure_code, t.modifiers, t.revenue_code, t.charge_cents, t.paid_cents, t.units,
              t.original_units, t.service_date, t.service_date_to, t.place_of_service, t.line_allowed_cents, t.observed_allowed_cents,
              t.observed_allowed_basis, t.observed_allowed_allocated, t.patient_share_cents, t.rendering_npi, t.payer_plan_key
         FROM service_line t, generate_series(1, $2::integer) g
        WHERE t.id = $1
        ORDER BY g
       RETURNING id`,
      [templateId, count - 1],
    ),
  );
  return [templateId, ...(copies.rows as { id: string }[]).map((row) => row.id)];
}

/** A line's events in seq order, read as the owner in the practice's scope. */
async function events(practiceId: string, line: string): Promise<{ stage: string; seq: string; reopened_from: string | null }[]> {
  const { rows } = await asOwner(owner, [practiceId], () =>
    owner.query('SELECT stage, seq::text AS seq, reopened_from FROM line_status WHERE service_line_id = $1 ORDER BY seq', [line]),
  );
  return rows as { stage: string; seq: string; reopened_from: string | null }[];
}

/** Each line's head row beside its latest event by seq, read as the owner in the practice's scope. */
async function headsAndLatest(client: OwnerClient, practiceIds: readonly string[], line: readonly string[]): Promise<{ line: string; head: string | null; latest: string | null }[]> {
  const { rows } = await asOwner(client, practiceIds, () =>
    client.query(
      `SELECT l.line,
              (SELECT h.stage || '@' || h.seq FROM line_status_head h WHERE h.service_line_id = l.line) AS head,
              (SELECT s.stage || '@' || s.seq FROM line_status s WHERE s.service_line_id = l.line ORDER BY s.seq DESC LIMIT 1) AS latest
         FROM unnest($1::uuid[]) AS l (line)`,
      [line],
    ),
  );
  return rows as { line: string; head: string | null; latest: string | null }[];
}

async function expectHeadIsLatest(practiceId: string, line: readonly string[]): Promise<void> {
  for (const row of await headsAndLatest(owner, [practiceId], line)) {
    expect(row.head, `line ${row.line}`).toBe(row.latest);
  }
}

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = new pg.Client({ connectionString: database.url });
  await owner.connect();
  factory = await RowFactory.load(owner);
  world = await createTenantWorld(owner, 'cas-40 a');
  other = await createTenantWorld(owner, 'cas-40 b');
  manager = await factory.actorFor(owner, 'line_status', world);
}, 120_000);

afterAll(async () => {
  await Promise.all(clients.map((client) => client.end().catch(() => undefined)));
  await owner.end();
  await database.drop();
});

describe('concurrent writers of one line (CAS-40.1 to 40.4)', () => {
  it('refuses the second of two forward events for one line once the first commits, and the head row equals the one event (CAS-40.1)', async () => {
    const [line = ''] = await lines(owner, factory, world, 1);
    const a = await open(database.workerUrl, [world.practiceId]);
    const b = await open(database.workerUrl, [world.practiceId]);
    try {
      await insertStage(a, world.practiceId, line, { stage: 'validated' });
      const second = settle(insertStage(b, world.practiceId, line, { stage: 'validated' }));
      await waitFor(owner, await pidOf(b));
      await a.query('COMMIT');
      expect(await second).toEqual({ code: '23514', message: FORWARD });
    } finally {
      await close(a);
      await close(b);
    }
    expect((await events(world.practiceId, line)).map((event) => event.stage)).toEqual(['validated']);
    await expectHeadIsLatest(world.practiceId, [line]);
  });

  it('sorts a line’s events in commit order, so a duplicate forward event is refused (CAS-40.2)', async () => {
    const [line = ''] = await lines(owner, factory, world, 1);
    const a = await open(database.workerUrl, [world.practiceId]);
    const b = await open(database.workerUrl, [world.practiceId]);
    try {
      await insertStage(a, world.practiceId, line, { stage: 'flagged' });
      const waited = settle(insertStage(b, world.practiceId, line, { stage: 'actionable' }));
      await waitFor(owner, await pidOf(b));
      await insertStage(a, world.practiceId, line, { stage: 'validated' });
      await a.query('COMMIT');
      expect(await waited).toBe('accepted');
      await b.query('COMMIT');
    } finally {
      await close(a);
      await close(b);
    }
    const stored = await events(world.practiceId, line);
    expect(stored.map((event) => event.stage)).toEqual(['flagged', 'validated', 'actionable']);
    const [head] = await headsAndLatest(owner, [world.practiceId], [line]);
    expect(head?.head).toBe(`actionable@${stored.at(-1)?.seq ?? ''}`);
    const third = await open(database.workerUrl, [world.practiceId]);
    try {
      expect(await settle(insertStage(third, world.practiceId, line, { stage: 'actionable' }))).toEqual({ code: '23514', message: FORWARD });
    } finally {
      await close(third);
    }
    await expectHeadIsLatest(world.practiceId, [line]);
  });

  it('refuses a person’s reopen naming a stage the line has since left (CAS-40.3)', async () => {
    const [line = ''] = await lines(owner, factory, world, 1);
    await asOwner(owner, [world.practiceId], () => insertStage(owner, world.practiceId, line, { stage: 'validated' }));
    const a = await open(database.workerUrl, [world.practiceId]);
    const b = await openAsPerson(manager, world.practiceId);
    try {
      await insertStage(a, world.practiceId, line, { stage: 'actionable' });
      const reopen = settle(insertStage(b, world.practiceId, line, { stage: 'flagged', setBy: manager, reopenedFrom: 'validated', reason: REASON }));
      await waitFor(owner, await pidOf(b));
      await a.query('COMMIT');
      expect(await reopen).toEqual({ code: '23514', message: NAMES });
    } finally {
      await close(a);
      await close(b);
    }
    expect((await events(world.practiceId, line)).map((event) => event.stage)).toEqual(['validated', 'actionable']);
    await expectHeadIsLatest(world.practiceId, [line]);
  });

  it('lets triage’s shape and a person’s reopen shape cross on a case line without a deadlock (CAS-40.4)', async () => {
    const caseLine = await factory.create(owner, 'case_line', world);
    const lineX = caseLine.service_line_id as string;
    const [lineF = ''] = await lines(owner, factory, world, 1);
    const [current] = await events(world.practiceId, lineX).then((stored) => stored.slice(-1));
    const next = STAGES.find((stage) => current === undefined || rank(stage) > rank(current.stage as Stage)) ?? 'actionable';
    const t1 = await open(database.workerUrl, [world.practiceId]);
    const t2 = await open(database.workerUrl, [world.practiceId]);
    const touch = 'UPDATE case_line SET written_off_reason = written_off_reason WHERE id = $1';
    try {
      // execute.ts:444-446: a stage for one line, then the case lines (and so their case).
      await insertStage(t1, world.practiceId, lineF, { stage: 'flagged' });
      // triage.ts:522-528: the case line (and so its case), then the line's stage.
      await t2.query(touch, [caseLine.id]);
      const t1Touch = settle(t1.query(touch, [caseLine.id]));
      await waitFor(owner, await pidOf(t1));
      expect(await settle(insertStage(t2, world.practiceId, lineX, { stage: next }))).toBe('accepted');
      await t2.query('COMMIT');
      expect(await t1Touch).toBe('accepted');
      await t1.query('COMMIT');
    } finally {
      await close(t1);
      await close(t2);
    }
    await expectHeadIsLatest(world.practiceId, [lineF, lineX]);
  });
});

type Generated =
  | { readonly kind: 'forward'; readonly line: number; readonly stage: Stage }
  | { readonly kind: 'reopen' | 'unnamed'; readonly line: number; readonly from: Stage; readonly stage: Stage };

/** The four rules of the status machine (design 1.2) over flagged, validated and actionable: null when the event is accepted, else the refusal. */
function modelRefusal(current: Stage | undefined, event: Generated): string | null {
  if (event.kind === 'forward') {
    return current !== undefined && rank(event.stage) <= rank(current) ? FORWARD : null;
  }
  if (current === undefined || event.from !== current) {
    return NAMES;
  }
  if (rank(event.stage) > rank(current)) {
    return KEEPS;
  }
  // A reopen in no one's name comes only from payer approved or recovered (the ledger's), never from these stages.
  return event.kind === 'unnamed' ? PERSON : null;
}

describe('the rules and the head row, as a property (CAS-40.5)', () => {
  it('accepts an event exactly when the status machine does, with its message, and keeps each head row equal to the line’s latest event', async () => {
    const pool = await lines(owner, factory, world, 300);
    let next = 0;
    const stage = fc.constantFrom(...STAGES);
    const line = fc.integer({ min: 0, max: 2 });
    const generated: fc.Arbitrary<Generated> = fc.oneof(
      fc.record({ kind: fc.constant('forward' as const), line, stage }),
      fc.record({ kind: fc.constantFrom('reopen' as const, 'unnamed' as const), line, from: stage, stage }),
    );
    let unnamedRefused = 0;
    await fc.assert(
      fc.asyncProperty(fc.array(generated, { minLength: 1, maxLength: 12 }), async (sequence) => {
        const run = pool.slice(next, next + 3);
        next += 3;
        if (run.length < 3) {
          throw new Error('the property ran out of lines');
        }
        const current: (Stage | undefined)[] = [undefined, undefined, undefined];
        await asOwner(owner, [world.practiceId], async () => {
          for (const event of sequence) {
            const target = run[event.line] ?? '';
            const wanted = modelRefusal(current[event.line], event);
            await owner.query('SAVEPOINT step');
            const got = await settle(
              insertStage(
                owner,
                world.practiceId,
                target,
                event.kind === 'forward'
                  ? { stage: event.stage }
                  : { stage: event.stage, reopenedFrom: event.from, reason: REASON, setBy: event.kind === 'reopen' ? world.adminUserId : null },
              ),
            );
            if (got === 'accepted') {
              await owner.query('RELEASE SAVEPOINT step');
            } else {
              await owner.query('ROLLBACK TO SAVEPOINT step');
            }
            expect(got, JSON.stringify(event)).toEqual(wanted === null ? 'accepted' : { code: '23514', message: wanted });
            if (wanted === null) {
              current[event.line] = event.stage;
            } else if (event.kind === 'unnamed') {
              unnamedRefused += 1;
            }
            const { rows } = await owner.query(
              `SELECT l.line,
                      (SELECT h.stage || '@' || h.seq FROM line_status_head h WHERE h.service_line_id = l.line) AS head,
                      (SELECT s.stage || '@' || s.seq FROM line_status s WHERE s.service_line_id = l.line ORDER BY s.seq DESC LIMIT 1) AS latest
                 FROM unnest($1::uuid[]) AS l (line)`,
              [run],
            );
            for (const row of rows as { line: string; head: string | null; latest: string | null }[]) {
              expect(row.head, `line ${row.line} after ${JSON.stringify(event)}`).toBe(row.latest);
            }
          }
          // A person's reopen is set in the person's own name (line_status_belongs), so the person is the actor.
        }, world.adminUserId);
      }),
      { numRuns: 100 },
    );
    expect(unnamedRefused).toBeGreaterThan(0);
  }, 300_000);
});

describe('the backfill (CAS-40.7)', () => {
  it('leaves one head row per line that has events, equal to its latest event, across two practices', async () => {
    // Every migration that sorts before this one, by name: the schema as the previous release left it.
    const earlier = mkdtempSync(path.join(tmpdir(), 'line-status-heads-'));
    let scratch: ScratchDatabase | undefined;
    let client: pg.Client | undefined;
    try {
      for (const file of readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql') && name < MIGRATION)) {
        copyFileSync(path.join(MIGRATIONS_DIR, file), path.join(earlier, file));
      }
      scratch = await createScratchDatabase(readDatabaseUrl());
      await migrate({ databaseUrl: scratch.url, devLogin: true, migrationsDir: earlier });
      client = new pg.Client({ connectionString: scratch.url });
      await client.connect();
      const rows = await RowFactory.load(client);
      const staged: { practiceId: string; line: string }[] = [];
      for (const label of ['backfill a', 'backfill b']) {
        const target = await createTenantWorld(client, label);
        const [l1 = '', l2 = '', l3 = '', untouched = ''] = await lines(client, rows, target, 4);
        const written = client;
        await asOwner(written, [target.practiceId], async () => {
          for (const [line, event] of [
            [l1, { stage: 'flagged' }],
            [l2, { stage: 'flagged' }],
            [l1, { stage: 'validated' }],
            [l3, { stage: 'flagged' }],
            [l1, { stage: 'flagged', setBy: target.adminUserId, reopenedFrom: 'validated', reason: REASON }],
            [l3, { stage: 'validated' }],
            [l3, { stage: 'actionable' }],
            [l1, { stage: 'validated' }],
            [l3, { stage: 'validated', setBy: target.adminUserId, reopenedFrom: 'actionable', reason: REASON }],
          ] as const) {
            await insertStage(written, target.practiceId, line, event);
          }
        }, target.adminUserId);
        staged.push(...[l1, l2, l3].map((line) => ({ practiceId: target.practiceId, line })), { practiceId: target.practiceId, line: untouched });
      }
      await migrate({ databaseUrl: scratch.url, devLogin: true });
      const practiceIds = [...new Set(staged.map((row) => row.practiceId))];
      const found = await headsAndLatest(client, practiceIds, staged.map((row) => row.line));
      expect(found.filter((row) => row.latest !== null)).toHaveLength(6);
      for (const row of found) {
        expect(row.head, `line ${row.line}`).toBe(row.latest);
      }
      const counted = await asOwner(client, practiceIds, () => client?.query('SELECT practice_id, count(*)::int AS n FROM line_status_head GROUP BY practice_id ORDER BY practice_id') ?? Promise.reject(new Error('no client')));
      expect((counted.rows as { n: number }[]).map((row) => row.n)).toEqual([3, 3]);
    } finally {
      await client?.end();
      await scratch?.drop();
      rmSync(earlier, { recursive: true, force: true });
    }
  }, 300_000);
});

/** The migration's one lock loop, as it stands in the file: the DO block that takes claim's and line_status's locks. */
function lockLoop(): string {
  const text = readFileSync(path.join(MIGRATIONS_DIR, MIGRATION), 'utf8');
  const block = text
    .split(/^DO \$\$$/m)
    .slice(1)
    .map((rest) => `DO $$${rest.slice(0, rest.indexOf('\n$$;') + 4)}`)
    .find((candidate) => candidate.includes('NOWAIT'));
  if (block === undefined) {
    throw new Error(`${MIGRATION} has no NOWAIT lock loop`);
  }
  return block;
}

/** A function's body as a migration file wrote it: the text between `AS $$` and `$$;` of its CREATE. */
function bodyIn(file: string, name: string): string {
  const text = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
  const start = text.indexOf(`FUNCTION ${name}() RETURNS trigger`);
  const open = text.indexOf('AS $$', start) + 'AS $$'.length;
  return text.slice(open, text.indexOf('\n$$;', open) + 1);
}

describe('the pieces (CAS-40.8)', () => {
  it('makes line_status_rules a definer owned by tp_owner with its search path, and names line_status’s sequence', async () => {
    const { rows } = await owner.query<{ definer: boolean; owner: string; config: string[]; acl: string | null; sequence: string }>(
      `SELECT p.prosecdef AS definer, pg_get_userbyid(p.proowner) AS owner, p.proconfig AS config, p.proacl::text AS acl,
              pg_get_serial_sequence('line_status', 'seq') AS sequence
         FROM pg_proc p WHERE p.oid = 'line_status_rules()'::regprocedure`,
    );
    expect(rows[0]).toEqual({ definer: true, owner: OWNER_ROLE, config: ['search_path=pg_catalog, public, pg_temp'], acl: `{${OWNER_ROLE}=X/${OWNER_ROLE}}`, sequence: 'public.line_status_seq_seq' });
  });

  it('gives line_status_head forced row-level security, its registry row, its keys and guards, and no write grant to any role', async () => {
    const { rows } = await owner.query<{ rls: boolean; forced: boolean; owner: string; acl: string | null; policy: string | null; registered: string | null }>(
      `SELECT c.relrowsecurity AS rls, c.relforcerowsecurity AS forced, pg_get_userbyid(c.relowner) AS owner, c.relacl::text AS acl,
              (SELECT pol.polname::text FROM pg_policy pol WHERE pol.polrelid = c.oid) AS policy,
              (SELECT r.policy_name FROM phi_table_registry r WHERE r.table_name = 'line_status_head') AS registered
         FROM pg_class c WHERE c.oid = 'line_status_head'::regclass`,
    );
    expect(rows[0]).toEqual({
      rls: true,
      forced: true,
      owner: OWNER_ROLE,
      acl: `{${OWNER_ROLE}=arwdDxtm/${OWNER_ROLE},tp_app=r/${OWNER_ROLE}}`,
      policy: 'line_status_head_tenant',
      registered: 'line_status_head_tenant',
    });
    const indexes = await owner.query<{ indexdef: string }>("SELECT indexdef FROM pg_indexes WHERE tablename = 'line_status_head' ORDER BY indexname");
    expect(indexes.rows.map((row) => row.indexdef)).toEqual([
      'CREATE UNIQUE INDEX line_status_head_once ON public.line_status_head USING btree (practice_id, service_line_id)',
      'CREATE UNIQUE INDEX line_status_head_pkey ON public.line_status_head USING btree (id)',
    ]);
    const triggers = await owner.query<{ name: string; fn: string }>(
      "SELECT tgname AS name, tgfoid::regproc::text AS fn FROM pg_trigger WHERE tgrelid = 'line_status_head'::regclass AND NOT tgisinternal ORDER BY tgname",
    );
    expect(triggers.rows).toEqual([
      { name: 'line_status_head_never_deleted', fn: 'triage_never_deleted' },
      { name: 'line_status_head_no_truncate', fn: 'triage_no_truncate' },
    ]);
    // The trigger is the only writer: no role but the owner may write it. The application role reads it within its practices, as it reads line_status.
    for (const role of ['tp_app', 'tp_operator', 'tp_billing', 'tp_esign', 'tp_screening', 'tp_job', 'tp_app_dev', 'tp_worker_dev']) {
      const privileges = await owner.query<{ writes: boolean }>("SELECT has_table_privilege($1, 'line_status_head', 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') AS writes", [role]);
      expect(privileges.rows[0]?.writes, role).toBe(false);
    }
    for (const role of ['tp_operator', 'tp_billing', 'tp_esign', 'tp_screening']) {
      const privileges = await owner.query<{ reads: boolean }>("SELECT has_table_privilege($1, 'line_status_head', 'SELECT') AS reads", [role]);
      expect(privileges.rows[0]?.reads, role).toBe(false);
    }
  });

  it('indexes the claims a correction supersedes (claim_by_superseded)', async () => {
    const { rows } = await owner.query<{ indexdef: string }>("SELECT indexdef FROM pg_indexes WHERE indexname = 'claim_by_superseded'");
    expect(rows.map((row) => row.indexdef)).toEqual(['CREATE INDEX claim_by_superseded ON public.claim USING btree (superseded_by_claim_id) WHERE (superseded_by_claim_id IS NOT NULL)']);
  });

  it('takes both tables’ locks without queueing a writer: retries while a stage insert or a claim insert is open, and takes them once both end', async () => {
    const loop = lockLoop();
    expect(loop).toContain("'line_status or claim stayed in use for five minutes; run the deploy again (docs/adr/0083)'");
    const [held = '', meanwhile = '', after = ''] = await lines(owner, factory, world, 3);
    const claim = await factory.build(owner, 'claim', world);
    const stageHolder = await open(database.workerUrl, [world.practiceId]);
    const claimHolder = new pg.Client({ connectionString: database.url });
    claimHolder.on('error', () => undefined);
    await claimHolder.connect();
    clients.push(claimHolder);
    const migration = new pg.Client({ connectionString: database.url });
    migration.on('error', () => undefined);
    await migration.connect();
    clients.push(migration);
    try {
      await insertStage(stageHolder, world.practiceId, held, { stage: 'flagged' });
      await claimHolder.query('BEGIN');
      await claimHolder.query(`SET LOCAL ROLE ${OWNER_ROLE}`);
      await claimHolder.query("SELECT set_config('app.practice_ids', $1, true)", [`{${world.practiceId}}`]);
      const columns = Object.keys(claim.values);
      await claimHolder.query(
        `INSERT INTO claim (${columns.map((column) => `"${column}"`).join(', ')}) VALUES (${columns.map((_, index) => `$${String(index + 1)}`).join(', ')})`,
        Object.values(claim.values),
      );
      // The migration's transaction, as tp_owner, running the loop.
      await migration.query('BEGIN');
      await migration.query(`SET LOCAL ROLE ${OWNER_ROLE}`);
      const migrationPid = await pidOf(migration);
      const done = settle(migration.query(loop));
      // It sleeps between tries; it never waits in a lock queue.
      await waitFor(owner, migrationPid, { type: 'Timeout', event: 'PgSleep' });
      const third = await open(database.workerUrl, [world.practiceId]);
      expect(await settle(insertStage(third, world.practiceId, meanwhile, { stage: 'flagged' }).then(() => third.query('COMMIT')))).toBe('accepted');
      await close(third);
      // The stage writer ends; the claim insert stays open, so the loop still retries, holding nothing on line_status.
      await stageHolder.query('COMMIT');
      await waitFor(owner, migrationPid, { type: 'Timeout', event: 'PgSleep' });
      const fourth = await open(database.workerUrl, [world.practiceId]);
      expect(await settle(insertStage(fourth, world.practiceId, after, { stage: 'flagged' }).then(() => fourth.query('COMMIT')))).toBe('accepted');
      await close(fourth);
      const queued = await owner.query<{ n: number }>("SELECT count(*)::int AS n FROM pg_stat_activity WHERE pid = $1 AND wait_event_type = 'Lock'", [migrationPid]);
      expect(queued.rows[0]?.n).toBe(0);
      await claimHolder.query('ROLLBACK');
      expect(await done).toBe('accepted');
      const locks = await owner.query<{ relation: string; mode: string }>(
        "SELECT relation::regclass::text AS relation, mode FROM pg_locks WHERE pid = $1 AND locktype = 'relation' AND relation IN ('claim'::regclass, 'line_status'::regclass) AND granted ORDER BY 1",
        [migrationPid],
      );
      expect(locks.rows).toEqual([
        { relation: 'claim', mode: 'ShareLock' },
        { relation: 'line_status', mode: 'ShareRowExclusiveLock' },
      ]);
    } finally {
      await close(stageHolder);
      await close(claimHolder);
      await close(migration);
    }
  }, 120_000);

  it('changes only the lock line of each ledger trigger: the practice’s ledger: key instead of one per row and per line (Q1)', async () => {
    const wanted: Record<string, { readonly old: string; readonly now: string }> = {
      ledger_entry_within_evidence: {
        old: "  PERFORM pg_advisory_xact_lock(hashtextextended('ledger_evidence:' || row_id::text, 0));",
        now: "  PERFORM pg_advisory_xact_lock(hashtextextended('ledger:' || NEW.practice_id::text, 0));",
      },
      ledger_entry_within_line: {
        old: "    PERFORM pg_advisory_xact_lock(hashtextextended('ledger_line:' || NEW.service_line_id::text, 0));",
        now: "    PERFORM pg_advisory_xact_lock(hashtextextended('ledger:' || NEW.practice_id::text, 0));",
      },
    };
    for (const [name, lock] of Object.entries(wanted)) {
      const before = bodyIn('20261027090000_packet_and_ledger_review.sql', name).split('\n');
      const { rows } = await owner.query<{ body: string; definer: boolean; config: string[]; acl: string }>(
        `SELECT prosrc AS body, prosecdef AS definer, proconfig AS config, proacl::text AS acl FROM pg_proc WHERE oid = '${name}()'::regprocedure`,
      );
      const now = (rows[0]?.body ?? '').split('\n');
      expect(now, name).toHaveLength(before.length);
      const changed = now.flatMap((line, index) => (line === before[index] ? [] : [{ was: before[index], is: line }]));
      expect(changed, name).toEqual([{ was: lock.old, is: lock.now }]);
      expect(rows[0], name).toMatchObject({ definer: false, config: ['search_path=pg_catalog, public, pg_temp'], acl: `{${OWNER_ROLE}=X/${OWNER_ROLE}}` });
    }
  });
});

describe('the lock table (CAS-40.9 to 40.11)', () => {
  it('writes 30,000 stage events in one transaction holding no advisory lock (CAS-40.9)', async () => {
    const many = await lines(owner, factory, world, 30_000);
    const writer = await open(database.workerUrl, [world.practiceId]);
    try {
      await writer.query("INSERT INTO line_status (practice_id, service_line_id, stage) SELECT $1, l, 'flagged' FROM unnest($2::uuid[]) AS l ORDER BY l", [world.practiceId, many]);
      const { rows } = await writer.query<{ n: number }>("SELECT count(*)::int AS n FROM pg_locks WHERE pid = pg_backend_pid() AND locktype = 'advisory'");
      expect(rows[0]?.n).toBe(0);
      await writer.query('COMMIT');
    } finally {
      await close(writer);
    }
    const { rows } = await asOwner(owner, [world.practiceId], () => owner.query('SELECT count(*)::int AS n FROM line_status_head WHERE service_line_id = ANY ($1::uuid[])', [many]));
    expect((rows[0] as { n: number }).n).toBe(30_000);
  }, 300_000);

  it('commits another practice’s 2,000 events while one practice’s 30,000 are held open (CAS-40.10)', async () => {
    const many = await lines(owner, factory, world, 30_000);
    const theirs = await lines(owner, factory, other, 2_000);
    const holder = await open(database.workerUrl, [world.practiceId]);
    const neighbour = await open(database.workerUrl, [other.practiceId]);
    try {
      await holder.query("INSERT INTO line_status (practice_id, service_line_id, stage) SELECT $1, l, 'flagged' FROM unnest($2::uuid[]) AS l ORDER BY l", [world.practiceId, many]);
      expect(
        await settle(
          neighbour
            .query("INSERT INTO line_status (practice_id, service_line_id, stage) SELECT $1, l, 'flagged' FROM unnest($2::uuid[]) AS l ORDER BY l", [other.practiceId, theirs])
            .then(() => neighbour.query('COMMIT')),
        ),
      ).toBe('accepted');
      await holder.query('COMMIT');
    } finally {
      await close(holder);
      await close(neighbour);
    }
    const { rows } = await asOwner(owner, [other.practiceId], () => owner.query('SELECT count(*)::int AS n FROM line_status WHERE service_line_id = ANY ($1::uuid[])', [theirs]));
    expect((rows[0] as { n: number }).n).toBe(2_000);
  }, 300_000);

  it('adds no sequential scan per event when the tables’ statistics say they are empty (CAS-40.11)', async () => {
    const fresh = await createMigratedDatabase(readDatabaseUrl());
    const admin = new pg.Client({ connectionString: fresh.url });
    await admin.connect();
    try {
      const rows = await RowFactory.load(admin);
      const target = await createTenantWorld(admin, 'empty statistics');
      const many = await lines(admin, rows, target, 40_000);
      await admin.query('VACUUM ANALYZE line_status');
      await admin.query('VACUUM ANALYZE line_status_head');
      const scans = async (): Promise<Record<string, number>> => {
        const found = await admin.query<{ relname: string; seq_scan: string }>(
          "SELECT relname, seq_scan::text FROM pg_stat_xact_user_tables WHERE relname IN ('line_status', 'line_status_head')",
        );
        return Object.fromEntries(['line_status', 'line_status_head'].map((name) => [name, Number(found.rows.find((row) => row.relname === name)?.seq_scan ?? 0)]));
      };
      const insert = (slice: readonly string[]) =>
        admin.query("INSERT INTO line_status (practice_id, service_line_id, stage) SELECT $1, l, 'flagged' FROM unnest($2::uuid[]) AS l ORDER BY l", [target.practiceId, slice]);
      await asOwner(admin, [target.practiceId], async () => {
        const before = await scans();
        const started = performance.now();
        await insert(many.slice(0, 10_000));
        const tenThousand = performance.now() - started;
        await insert(many.slice(10_000));
        const fortyThousand = performance.now() - started;
        const after = await scans();
        process.stdout.write(`CAS-40.11: 10,000 events in ${tenThousand.toFixed(0)} ms, 40,000 in ${fortyThousand.toFixed(0)} ms (printed, not asserted)\n`);
        expect({ line_status: (after.line_status ?? 0) - (before.line_status ?? 0), line_status_head: (after.line_status_head ?? 0) - (before.line_status_head ?? 0) }).toEqual({
          line_status: 0,
          line_status_head: 0,
        });
      });
    } finally {
      await admin.end();
      await fresh.drop();
    }
  }, 600_000);
});
