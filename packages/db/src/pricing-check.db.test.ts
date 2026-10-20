import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withPracticeScope } from './authz';
import { readDatabaseUrl } from './config';
import { DISPUTE_WINDOW_STARTS, DISPUTE_WINDOW_UNITS, PRICING_CHECK_RESULTS } from './schema';
import { type MigratedDatabase, type TenantWorld, addMembership, createMigratedDatabase, createTenantWorld, createUser, endPool } from './testing';

/**
 * Whether a packet version's pricing is still current (migration 20261103090000; the best-option audit's item #4;
 * docs/adr/0061), as the schema states it: submission.pricing_check holds exactly PRICING_CHECK_RESULTS and the
 * application role never writes it; the contract window's unit and start hold exactly DISPUTE_WINDOW_UNITS and
 * DISPUTE_WINDOW_STARTS (item #5); and the checks fail closed on content that names nothing the caller can see.
 * The checks over real priced lines (an accepted re-run, a withdrawn release, a correction, a back-dated
 * amendment) are apps/worker/src/price/pricing-check.db.test.ts and apps/worker/src/packets/pricing-current.db.test.ts.
 * Synthetic data only.
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
