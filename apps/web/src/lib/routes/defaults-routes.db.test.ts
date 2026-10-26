import { randomBytes, randomUUID } from 'node:crypto';

import { type DatabaseClient, type DatabasePool, LocalKeyProvider, databaseClient, openPool, readDatabaseUrl } from '@tp/db';
import { type MigratedDatabase, type TenantWorld, addMembership, createMigratedDatabase, createTenantWorld, createUser, endPool } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { triageSettings } from '@tp/triage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DevAuthProvider } from '../auth/dev-provider';
import { MemoryDevStore } from '../auth/dev-store';
import { Sealer } from '../auth/seal';
import { SESSION_COOKIE, openSession } from '../auth/sessions';
import { csrfTokenFor } from '../http/csrf';
import type { CookieJar, Route } from '../http/route';
import { dollarsForInput } from '../money-input';
import { type Services, createServices } from '../server/services';
import { MemoryQueue } from '../uploads/queue';
import { defaultsSettingsPage, settingsMaterialityAction, settingsPursuitAction } from './settings';

/**
 * Settings → Defaults through its routes against PostgreSQL (test matrix CAS-39): the page returns the stored
 * thresholds and staff rate in cents, the form is pre-filled with them in dollars (dollarsForInput), and saving the
 * materiality and pursuit forms with what the page pre-fills writes every value back, through the real settings.ts
 * parser, at the edges of what its save takes; triage reads the same cents. SYNTHETIC data only.
 */

let database: MigratedDatabase;
let owner: DatabaseClient;
let app: DatabasePool;
let services: Services;
let world: TenantWorld;
let token: string;

class Jar implements CookieJar {
  private readonly values = new Map<string, string>();
  constructor(value: string) {
    this.values.set(SESSION_COOKIE, value);
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

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = databaseClient(database.url);
  await owner.connect();
  app = openPool(database.appUrl, 4);
  const sealer = new Sealer(randomBytes(32));
  services = createServices({
    origin: 'http://localhost:3100',
    pool: app,
    provider: new DevAuthProvider({
      store: new MemoryDevStore(),
      sealer: sealer.derive('dev-provider'),
      webauthn: { rpId: 'localhost', rpName: 'Test', origin: 'http://localhost:3100' },
      deliverInvitation: () => Promise.resolve(),
      scryptCost: { n: 1024, r: 8, p: 1 },
    }),
    keys: LocalKeyProvider.random(),
    sealer,
    logger: createLogger({ sink: () => undefined }),
    queue: new MemoryQueue(),
  });
  world = await createTenantWorld(owner, 'defaults');
  const manager = await createUser(owner);
  await addMembership(owner, world.organizationId, manager, 'billing_manager');
  token = (await openSession(app, { userId: manager, method: 'totp', deviceToken: undefined, userAgent: null, requestId: 'test' })).sessionToken;
}, 120_000);

afterAll(async () => {
  await endPool(app);
  await owner.end();
  await database.drop();
});

function run<R>(route: Route<R>, input?: Record<string, unknown>) {
  return route.invoke(
    {
      cookies: new Jar(token),
      params: { practiceId: world.practiceId },
      input: route.mutation ? { csrfToken: csrfTokenFor(services.sealer, token), requestKey: randomUUID(), ...input } : input,
      requestId: `test-${randomUUID()}`,
      userAgent: null,
    },
    services,
  );
}

/** The practice's stored triage settings, as the owner reads them. */
async function stored(): Promise<Record<string, unknown>> {
  return (await owner.query<{ settings: Record<string, unknown> }>('SELECT settings FROM practice WHERE id = $1', [world.practiceId])).rows[0]?.settings ?? {};
}

async function store(settings: Record<string, unknown>): Promise<void> {
  await owner.query('UPDATE practice SET settings = settings || $2::jsonb WHERE id = $1', [world.practiceId, JSON.stringify(settings)]);
}

/** The keys the two forms write. */
const SAVED_KEYS = ['line_materiality_cents', 'case_materiality_cents', 'staff_rate_cents_per_hour', 'minutes_per_packet', 'minutes_per_follow_up'];

/**
 * Reads the page, then saves both forms with exactly what the page pre-fills. The keys are removed between the read
 * and the save, so a value found afterwards is one the save wrote, not one it left in place (an audit event would not
 * show that: the route records it whether or not the statement wrote).
 */
async function saveUnchanged(): Promise<void> {
  const page = await run(defaultsSettingsPage);
  if (page.status !== 'ok') {
    throw new Error(`expected the page, got ${page.status}`);
  }
  const { materiality, pursuit } = page.data;
  await owner.query('UPDATE practice SET settings = settings - $2::text[] WHERE id = $1', [world.practiceId, SAVED_KEYS]);
  expect(Object.keys(await stored()).filter((key) => SAVED_KEYS.includes(key))).toEqual([]);
  expect(await run(settingsMaterialityAction, { lineMateriality: dollarsForInput(materiality.lineCents), caseMateriality: dollarsForInput(materiality.caseCents) })).toMatchObject({
    status: 'ok',
    data: { redirect: `/p/${world.practiceId}/settings/defaults?notice=materiality` },
  });
  if (pursuit === null) {
    throw new Error('expected a pursuit cost');
  }
  expect(
    await run(settingsPursuitAction, { staffRatePerHour: dollarsForInput(pursuit.staffRateCentsPerHour), minutesPerPacket: String(pursuit.minutesPerPacket), minutesPerFollowUp: String(pursuit.minutesPerFollowUp) }),
  ).toMatchObject({ status: 'ok', data: { redirect: `/p/${world.practiceId}/settings/defaults?notice=pursuit` } });
}

describe('saving the defaults form unchanged (CAS-39)', () => {
  it('keeps $5.00 per line, $250.00 per case and $45.00 an hour as 500, 25000 and 4500 cents, as triage reads them', async () => {
    await store({ line_materiality_cents: '500', case_materiality_cents: '25000', staff_rate_cents_per_hour: '4500', minutes_per_packet: 45, minutes_per_follow_up: 10 });
    const page = await run(defaultsSettingsPage);
    expect(page).toMatchObject({
      status: 'ok',
      data: { materiality: { lineCents: '500', caseCents: '25000' }, pursuit: { staffRateCentsPerHour: '4500', minutesPerPacket: 45, minutesPerFollowUp: 10 }, canEdit: true },
    });
    await saveUnchanged();
    const settings = await stored();
    expect(settings).toMatchObject({ line_materiality_cents: '500', case_materiality_cents: '25000', staff_rate_cents_per_hour: '4500', minutes_per_packet: 45, minutes_per_follow_up: 10 });
    expect(triageSettings(settings)).toMatchObject({ lineMaterialityCents: 500n, caseMaterialityCents: 25000n, pursuit: { staffRateCentsPerHour: 4500n, minutesPerPacket: 45, minutesPerFollowUp: 10 } });
  });

  it('writes every amount back at the edges of what the save takes, through the save’s own parser', async () => {
    for (const amount of ['0', '1', '99', '100', '500', '4500', '25000', '99999999999']) {
      await store({ line_materiality_cents: amount, case_materiality_cents: amount, staff_rate_cents_per_hour: amount, minutes_per_packet: 0, minutes_per_follow_up: 10_000 });
      await saveUnchanged();
      expect(await stored(), amount).toMatchObject({ line_materiality_cents: amount, case_materiality_cents: amount, staff_rate_cents_per_hour: amount, minutes_per_packet: 0, minutes_per_follow_up: 10_000 });
    }
  });
});
