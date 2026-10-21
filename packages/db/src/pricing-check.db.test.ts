import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withPracticeScope } from './authz';
import { readDatabaseUrl } from './config';
import { DISPUTE_WINDOW_STARTS, DISPUTE_WINDOW_UNITS, PRICING_CHECK_RESULTS, SUBMISSION_UNATTESTED_REASONS } from './schema';
import { type MigratedDatabase, type TenantWorld, addMembership, createMigratedDatabase, createTenantWorld, createUser, endPool } from './testing';

/**
 * Whether a packet version's pricing is still current (migration 20261103090000; the best-option audit's item #4;
 * docs/adr/0061), as the schema states it: submission.pricing_check holds exactly PRICING_CHECK_RESULTS and the
 * application role never writes it; the contract window's unit and start hold exactly DISPUTE_WINDOW_UNITS and
 * DISPUTE_WINDOW_STARTS (item #5); submission.unattested_reason holds exactly SUBMISSION_UNATTESTED_REASONS, only
 * beside a pricing check that is not current, and the application role writes neither it nor the audit event of a
 * submission sent without sign-off (the founder's ruling of 2026-10-20); and the checks fail closed on content that
 * names nothing the caller can see. The checks over real priced lines (an accepted re-run, a withdrawn release, a
 * correction, a back-dated amendment) are apps/worker/src/price/pricing-check.db.test.ts and
 * apps/worker/src/packets/pricing-current.db.test.ts, and the submission sent without sign-off is
 * apps/worker/src/packets/unattested-submission.db.test.ts. Synthetic data only.
 */

let database: MigratedDatabase;
let owner: pg.Client;
let app: pg.Pool;
let north: TenantWorld;
let manager: string;

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = new pg.Client({ connectionString: database.url });
  await owner.connect();
  app = new pg.Pool({ connectionString: database.appUrl, max: 2 });
  north = await createTenantWorld(owner, 'north');
  manager = await createUser(owner);
  await addMembership(owner, north.organizationId, manager, 'billing_manager');
}, 60_000);

afterAll(async () => {
  await endPool(app);
  await owner.end();
  await database.drop();
});

/** The quoted values of a CHECK's IN list, in its order. */
async function checkValues(constraint: string): Promise<string[]> {
  const { rows } = await owner.query<{ definition: string }>('SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname = $1', [constraint]);
  expect(rows, constraint).toHaveLength(1);
  return [...(rows[0]?.definition ?? '').matchAll(/'([^']*)'::text/g)].map((match) => match[1] as string);
}

/** The first row of a query in the billing manager's practice scope, as the application role. */
const asManager = <R extends object>(sql: string, values: unknown[]) =>
  withPracticeScope(app, { actorId: manager, practiceIds: [north.practiceId] }, async (scope) => (await scope.client.query<R>(sql, values)).rows[0]);

describe('the schema of the pricing check and the window rule', () => {
  it('holds exactly the TypeScript lists, in their order', async () => {
    expect(await checkValues('submission_pricing_check_check')).toEqual([...PRICING_CHECK_RESULTS]);
    expect(await checkValues('submission_unattested_reason_check')).toEqual([...SUBMISSION_UNATTESTED_REASONS]);
    expect(await checkValues('contract_version_dispute_window_unit_check')).toEqual([...DISPUTE_WINDOW_UNITS]);
    expect(await checkValues('contract_version_dispute_window_measured_from_check')).toEqual([...DISPUTE_WINDOW_STARTS]);
  });

  it('gives the application role no grant on submission.pricing_check, which the database writes', async () => {
    const { rows } = await owner.query<{ insert: boolean; update: boolean; select: boolean }>(
      `SELECT has_column_privilege('tp_app', 'submission', 'pricing_check', 'INSERT') AS insert,
              has_column_privilege('tp_app', 'submission', 'pricing_check', 'UPDATE') AS update,
              has_column_privilege('tp_app', 'submission', 'pricing_check', 'SELECT') AS select`,
    );
    expect(rows[0]).toEqual({ insert: false, update: false, select: true });
  });

  it('gives the application role no grant on submission.unattested_reason either, and refuses a write that names either column', async () => {
    const { rows } = await owner.query<{ insert: boolean; update: boolean; select: boolean }>(
      `SELECT has_column_privilege('tp_app', 'submission', 'unattested_reason', 'INSERT') AS insert,
              has_column_privilege('tp_app', 'submission', 'unattested_reason', 'UPDATE') AS update,
              has_column_privilege('tp_app', 'submission', 'unattested_reason', 'SELECT') AS select`,
    );
    expect(rows[0]).toEqual({ insert: false, update: false, select: true });
    const refused = async (sql: string) => {
      try {
        await asManager(sql, []);
      } catch (error) {
        return (error as { code?: string }).code;
      }
      return 'written';
    };
    const values = `'${north.practiceId}', gen_random_uuid(), gen_random_uuid(), current_date, 'payer_portal', app_actor_id(), current_date, repeat('a', 64), repeat('b', 64)`;
    const columns = 'practice_id, case_id, packet_version_id, submitted_on, channel, submitted_by, follow_up_on, export_sha256, export_csv_sha256';
    expect(await refused(`INSERT INTO submission (${columns}, unattested_reason) VALUES (${values}, 'pricing_stale_after_export')`)).toBe('42501');
    expect(await refused(`INSERT INTO submission (${columns}, pricing_check) VALUES (${values}, 'RELEASE_WITHDRAWN')`)).toBe('42501');
    expect(await refused(`UPDATE submission SET unattested_reason = 'pricing_stale_after_export'`)).toBe('42501');
    expect(await refused(`UPDATE submission SET pricing_check = 'current'`)).toBe('42501');
  });

  it('holds a reason only beside a pricing check that is not current', async () => {
    const { rows } = await owner.query<{ definition: string }>("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname = 'submission_unattested_only_when_pricing_stale'");
    expect(rows[0]?.definition).toBe("CHECK (((unattested_reason IS NULL) OR ((pricing_check IS NOT NULL) AND (pricing_check <> 'current'::text))))");
  });

  it('lets the application role ask whether an export may be sent without sign-off, which fails closed for a version it cannot see', async () => {
    const { rows } = await owner.query<{ app: boolean; public: boolean }>(
      `SELECT has_function_privilege('tp_app', 'packet_version_unattested_reason(uuid)', 'EXECUTE') AS app,
              coalesce((SELECT bool_or(a.grantee = 0) FROM pg_proc p, aclexplode(p.proacl) a WHERE p.oid = 'packet_version_unattested_reason(uuid)'::regprocedure AND a.privilege_type = 'EXECUTE'), false) AS public`,
    );
    expect(rows[0]).toEqual({ app: true, public: false });
    expect(await asManager<{ reason: string | null }>('SELECT packet_version_unattested_reason($1) AS reason', [randomUUID()])).toEqual({ reason: null });
  });

  it('refuses the application an audit event of a submission sent without sign-off that the database did not record', async () => {
    const forged = withPracticeScope(app, { actorId: manager, practiceIds: [north.practiceId] }, (scope) =>
      scope.client.query(
        `INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, practice_id, purpose, request_id)
         VALUES (app_actor_id(), 'user', 'submission_logged_unattested', 'submission', $1, $2, 'pricing_stale_after_export', 'test-forged')`,
        [randomUUID(), north.practiceId],
      ),
    );
    await expect(forged).rejects.toMatchObject({ code: '23514' });
  });

  it('lets the application role run the four checks, and nobody else', async () => {
    for (const signature of ['service_line_priced_in_effect(uuid)', 'priced_line_pricing_check(uuid)', 'packet_version_pricing_check(jsonb)', 'pricing_run_release_withdrawn(uuid)']) {
      const { rows } = await owner.query<{ app: boolean; public: boolean }>(
        `SELECT has_function_privilege('tp_app', $1, 'EXECUTE') AS app,
                coalesce((SELECT bool_or(a.grantee = 0) FROM pg_proc p, aclexplode(p.proacl) a WHERE p.oid = $1::regprocedure AND a.privilege_type = 'EXECUTE'), false) AS public`,
        [signature],
      );
      expect(rows[0], signature).toEqual({ app: true, public: false });
    }
  });
});

describe('the checks fail closed', () => {
  it('reads content that names no line the caller can see as not current, and no line as current', async () => {
    const check = async (content: unknown) => (await asManager<{ check: string }>('SELECT packet_version_pricing_check($1::jsonb) AS check', [JSON.stringify(content)]))?.check;
    expect(await check({ lines: [] })).toBe('current');
    expect(await check({ lines: [{ priced_line_id: randomUUID() }] })).toBe('PRICING_NOT_IN_EFFECT');
    expect(await check({ lines: [{ priced_line_id: 'not-a-uuid' }] })).toBe('PRICING_NOT_IN_EFFECT');
    expect(await check({ lines: [{}] })).toBe('PRICING_NOT_IN_EFFECT');
    expect(await check({ lines: ['a line'] })).toBe('PRICING_NOT_IN_EFFECT');
    expect(await check({ lines: { priced_line_id: randomUUID() } })).toBe('PRICING_NOT_IN_EFFECT');
    expect(await check({})).toBe('PRICING_NOT_IN_EFFECT');
    const unknown = randomUUID();
    expect(
      await asManager<{ line: string; in_effect: string | null; withdrawn: boolean }>(
        'SELECT priced_line_pricing_check($1) AS line, service_line_priced_in_effect($1) AS in_effect, pricing_run_release_withdrawn($1) AS withdrawn',
        [unknown],
      ),
    ).toEqual({ line: 'PRICING_NOT_IN_EFFECT', in_effect: null, withdrawn: false });
  });
});
