import { randomBytes, randomUUID } from 'node:crypto';

import { type KeyProvider, readDatabaseUrl } from '@tp/db';
import { createLogger } from '@tp/observability';
import { CONTENT_GAP_RELEASE, type Practice, PricingWorld, RELEASE, termsAt } from '@tp/worker/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DevAuthProvider } from '../auth/dev-provider';
import { MemoryDevStore } from '../auth/dev-store';
import { Sealer } from '../auth/seal';
import { SESSION_COOKIE, openSession } from '../auth/sessions';
import type { CookieJar, Outcome, Route } from '../http/route';
import { forgetContentThrough } from '../releases/content-through';
import { type Services, createServices } from '../server/services';
import { coveragePage } from './coverage';

/**
 * What the Coverage route returns of Medicare content PaidWhole has not loaded (audit #7 and #59; docs/adr/0071; test
 * matrix RCC-05; review S6), through the route as the page calls it, against a scratch database: the fee-schedule
 * periods the release in force does not load (its pfs_rvu windows read by the route itself, under SYNTHETIC release
 * 900001), and, under 900007, the months waiting on the MPPR and the MUE with their headline. The library functions
 * under these fields are tested in ../pricing/content.db.test.ts; this holds the route's wiring to them. Each case is a
 * practice of its own, its SYNTHETIC 835 MAP-05's (97110 twice, 97140 and 97530 on one day, 326.00 billed) moved to the
 * month the case needs.
 */

let w: PricingWorld;
let services: Services;

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
  const { sessionToken } = await openSession(w.app, { userId, method: 'totp', deviceToken: undefined, userAgent: null, requestId: 'test' });
  return route.invoke({ cookies: new Jar(sessionToken), params, input: undefined, requestId: `test-${randomUUID()}`, userAgent: null }, services);
}

function ok<R>(outcome: Outcome<R>): R {
  if (outcome.status !== 'ok') {
    throw new Error(`expected ok, got ${JSON.stringify(outcome)}`);
  }
  return outcome.data;
}

beforeAll(async () => {
  w = await PricingWorld.open(readDatabaseUrl());
  forgetContentThrough();
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
    // The key provider the world's practices were keyed with, as TriageWorld reads it.
    keys: Reflect.get(w, 'keys') as KeyProvider,
    sealer,
    logger: createLogger({ sink: () => undefined }),
  });
}, 60_000);

afterAll(async () => {
  await w.close();
});

/** MAP-05's remittance with its lines on `serviceDate` and its payment the month after. */
async function loadMonth(target: Practice, serviceDate: string): Promise<void> {
  const [year, month] = [serviceDate.slice(2, 4), Number(serviceDate.slice(5, 7))];
  const paid = String(month + 1).padStart(2, '0');
  await w.loadVariant(target, 'MAP-05/remit.835', [
    ['20260216', serviceDate.replaceAll('-', '')],
    ['20260310', `20${year}${paid}10`],
    ['260311', `${year}${paid}11`],
  ]);
}

async function priceMonth(target: Practice, from: string, to: string, releaseNo: number): Promise<string> {
  const runId = await w.createRun(target, from, to, releaseNo);
  await w.execute(target, runId);
  return runId;
}

describe('the Coverage route’s Medicare content (RCC-05)', () => {
  it('names the locked year the release in force does not load, from the route’s own pfs_rvu windows, with its lines and billed cents', async () => {
    const target = await w.practice('coverage-route-locked');
    await loadMonth(target, '2026-05-12');
    const base = termsAt('110');
    const signed = await w.signedContract(target, '2025-01-01', { terms: { ...base, parameters: { ...base.parameters, year_basis: 'LOCKED:2025' } } });
    await w.mapped(target, await w.planOf(target, 'CE:SYNPLAN-MA-05'), 'contract', '2025-01-01', signed.versionId);
    await priceMonth(target, '2026-05-01', '2026-05-31', RELEASE);
    const page = ok(await call(coveragePage, target.manager, { practiceId: target.practiceId }));
    // 900001 loads the RVUs for 2026 alone.
    expect(page.feeScheduleNotLoaded).toEqual([{ period: { kind: 'year', label: '2025' }, lines: 3, chargeCents: '32600' }]);
    expect(page.waitingOnContent).toEqual([]);
    expect(page.contentHeadline).toEqual({ lines: 0, chargeCents: '0', paidCents: '0' });
    // A CURRENT practice whose dates 900001 loads: nothing named.
    const current = await w.practice('coverage-route-current');
    await loadMonth(current, '2026-05-12');
    const signedCurrent = await w.signedContract(current, '2025-01-01', { terms: termsAt('110') });
    await w.mapped(current, await w.planOf(current, 'CE:SYNPLAN-MA-05'), 'contract', '2025-01-01', signedCurrent.versionId);
    await priceMonth(current, '2026-05-01', '2026-05-31', RELEASE);
    expect(ok(await call(coveragePage, current.manager, { practiceId: current.practiceId })).feeScheduleNotLoaded).toEqual([]);
  }, 120_000);

  it('lists the month waiting on the MPPR and the MUE under 900007, its quarter, families, lines and billed cents, and the headline their sum', async () => {
    await w.loadContentGapRelease();
    const target = await w.practice('coverage-route-waiting');
    await loadMonth(target, '2026-10-14');
    await w.mapped(target, await w.planOf(target, 'CE:SYNPLAN-MA-05'), 'ma_noncontracted', '2026-01-01');
    await priceMonth(target, '2026-10-01', '2026-10-31', CONTENT_GAP_RELEASE);
    const page = ok(await call(coveragePage, target.manager, { practiceId: target.practiceId }));
    expect(page.waitingOnContent).toEqual([
      {
        periodFrom: '2026-10-01',
        periodTo: '2026-10-31',
        kind: 'waiting',
        failureCode: 'waiting_on_content_mppr_mue',
        failedReleaseNo: CONTENT_GAP_RELEASE,
        families: ['mppr', 'mue'],
        quarters: ['2026-Q4'],
        releaseInForce: CONTENT_GAP_RELEASE,
        totals: { lines: 3, claims: 1, chargeCents: '32600', paidCents: '17641' },
      },
    ]);
    expect(page.contentHeadline).toEqual({ lines: 3, chargeCents: '32600', paidCents: '17641' });
    // Another practice's Coverage lists none of it.
    const other = await w.practice('coverage-route-other');
    expect(ok(await call(coveragePage, other.manager, { practiceId: other.practiceId })).waitingOnContent).toEqual([]);
  }, 120_000);
});
