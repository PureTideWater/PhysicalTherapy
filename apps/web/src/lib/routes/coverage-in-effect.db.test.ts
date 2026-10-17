import { randomBytes, randomUUID } from 'node:crypto';

import { readDatabaseUrl, withPracticeScope } from '@tp/db';
import { addMembership, asOwner, createOrganization, createUser } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import type { Practice } from '@tp/worker/testing';
import { TriageWorld } from '@tp/worker/testing/triage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DevAuthProvider } from '../auth/dev-provider';
import { MemoryDevStore } from '../auth/dev-store';
import { Sealer } from '../auth/seal';
import { SESSION_COOKIE, openSession } from '../auth/sessions';
import { csrfTokenFor } from '../http/csrf';
import type { CookieJar, Outcome, Route } from '../http/route';
import { coverageContent } from '../reports/documents';
import { type Services, createServices } from '../server/services';
import { contractsPage } from './contracts';
import { coveragePage } from './coverage';
import { practiceHome } from './practice';
import { reportPage } from './reports';

/**
 * The screen tour's numbers (N1 to N3) against PostgreSQL, on the tour's SYNTHETIC shape: CAS-08 (payer Q,
 * three 97110 lines) and LED-06's original (payer L, one line) priced for March under two signed-off
 * fixed schedules (four of four lines priced, 600.00 billed), then CAS-02's plan (payer N) mapped as no
 * agreement and April priced (thirty-two lines unpriced, NO_AGREEMENT, 2,400.00 billed); an audit report of
 * March signed by a reimbursement reviewer the practice reaches only under a support grant.
 *
 * - N1: each contract's coverage share is computed from its lines' pricing in effect, not a fixed "No pricing
 *   run yet".
 * - N2: the dashboard, Coverage and the coverage report read coverage across the runs in effect (each line's
 *   result in its pricing in effect, the digest's statement), not the latest run's alone: 4 of 36 lines,
 *   600.00 of 3,000.00, not April's 0 of 32.
 * - N3: the report names who signed it: the reviewer's address where the directory shows it, else the role,
 *   never a dash.
 */

let w: TriageWorld;
let services: Services;
let practice: Practice;
let viewer: string;
let contractQ = '';
let contractL = '';
let march = '';
let april = '';

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

const tokens = new Map<string, string>();
async function sessionOf(userId: string): Promise<string> {
  let token = tokens.get(userId);
  if (token === undefined) {
    token = (await openSession(w.app, { userId, method: 'totp', deviceToken: undefined, userAgent: null, requestId: 'test' })).sessionToken;
    tokens.set(userId, token);
  }
  return token;
}

async function call<R>(route: Route<R>, userId: string, params: Record<string, unknown>, input?: Record<string, unknown>): Promise<Outcome<R>> {
  return route.invoke(
    {
      cookies: new Jar(await sessionOf(userId)),
      params,
      input: route.mutation ? { csrfToken: csrfTokenFor(services.sealer, await sessionOf(userId)), requestKey: randomUUID(), ...input } : input,
      requestId: `test-${randomUUID()}`,
      userAgent: null,
    },
    services,
  );
}

function ok<R>(outcome: Outcome<R>): R {
  if (outcome.status !== 'ok') {
    throw new Error(`expected ok, got ${JSON.stringify(outcome)}`);
  }
  return outcome.data;
}

const P = () => ({ practiceId: practice.practiceId });
const SCHEDULE = { schedule: [{ code: '97110', amountCents: '5000' }], effectiveFrom: '2026-01-01', disputeWindowDays: 365 };

async function payerOfPlan(planKey: string): Promise<string> {
  return asOwner(w.owner, [practice.practiceId], async () => (await w.owner.query<{ payer_id: string }>('SELECT payer_id FROM plan WHERE practice_id = $1 AND plan_key = $2', [practice.practiceId, planKey])).rows[0]?.payer_id ?? '');
}

/** The Contracts screen's coverage share of a contract, as the route returns it. */
async function shareOf(contractId: string) {
  const page = ok(await call(contractsPage, viewer, P()));
  return page.list.items.find((item) => item.id === contractId)?.coverage;
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
  practice = await w.practice('SYNTHETIC TOUR NUMBERS', { case_materiality_cents: '1000' });
  viewer = await createUser(w.owner);
  await addMembership(w.owner, practice.world.organizationId, viewer, 'viewer');
  await w.load(practice, 'CAS-08/remit.835');
  await w.load(practice, 'LED-06/original.835');
  await w.load(practice, 'CAS-02/remit.835');
  contractQ = (await w.fixedContract(practice, { ...SCHEDULE, payerId: await payerOfPlan('CE:SYNPLAN-FIX-ONE') })).contractId;
  contractL = (await w.fixedContract(practice, { ...SCHEDULE, payerId: await payerOfPlan('CE:SYNPLAN-FIX-LED') })).contractId;
}, 120_000);

afterAll(async () => {
  await w.close();
});

describe('a contract’s coverage share (N1)', () => {
  it('says no run is in effect before one prices, then counts the lines its versions priced in effect', async () => {
    expect(ok(await call(contractsPage, viewer, P())).runsInEffect).toBe(0);
    expect(await shareOf(contractQ)).toBeNull();

    const versions = await asOwner(w.owner, [practice.practiceId], async () =>
      (await w.owner.query<{ contract_id: string; id: string }>('SELECT contract_id, id FROM contract_version WHERE practice_id = $1', [practice.practiceId])).rows,
    );
    const versionOf = (contractId: string) => versions.find((row) => row.contract_id === contractId)?.id ?? null;
    march = await w.pricedRun(practice, {
      plans: [
        { key: 'CE:SYNPLAN-FIX-ONE', versionId: versionOf(contractQ) },
        { key: 'CE:SYNPLAN-FIX-LED', versionId: versionOf(contractL) },
      ],
      from: '2026-03-01',
      to: '2026-03-31',
    });
    await w.triage(practice, march);

    const page = ok(await call(contractsPage, viewer, P()));
    expect(page.runsInEffect).toBe(1);
    expect(await shareOf(contractQ)).toEqual({ of: { lines: 3, chargeCents: '45000' }, priced: { lines: 3, chargeCents: '45000' } });
    expect(await shareOf(contractL)).toEqual({ of: { lines: 1, chargeCents: '15000' }, priced: { lines: 1, chargeCents: '15000' } });
  }, 120_000);
});

describe('coverage across the runs in effect (N2)', () => {
  it('reads March’s four of four on the dashboard and Coverage while it is the only run in effect', async () => {
    const home = ok(await call(practiceHome, viewer, P()));
    expect(home.dashboard.coverage).toEqual({ runs: 1, periodFrom: '2026-03-01', periodTo: '2026-03-31', lines: 4, pricedLines: 4, chargeCents: '60000', pricedChargeCents: '60000' });
    const coverage = ok(await call(coveragePage, viewer, P()));
    expect(coverage.share).toMatchObject({ runs: 1, of: { lines: 4, chargeCents: '60000' } });
    expect(coverage.priced).toEqual({ lines: 4, chargeCents: '60000' });
  });

  it('keeps March’s priced lines beside April’s unpriced ones once April is priced under a no-agreement plan', async () => {
    april = await w.pricedRun(practice, { plans: [{ key: 'CE:SYNPLAN-OON-CAS', versionId: null, kind: 'no_agreement' }], from: '2026-04-01', to: '2026-04-30' });
    await w.triage(practice, april);

    // The dashboard: 4 of 36 lines, 600.00 of 3,000.00 billed, across both runs; never April's 0 of 32 alone.
    const home = ok(await call(practiceHome, viewer, P()));
    expect(home.dashboard.coverage).toEqual({ runs: 2, periodFrom: '2026-03-01', periodTo: '2026-04-30', lines: 36, pricedLines: 4, chargeCents: '300000', pricedChargeCents: '60000' });

    // Coverage: the same shares, and the unpriced reasons across the runs in effect; the latest run is named beside them.
    const coverage = ok(await call(coveragePage, viewer, P()));
    expect(coverage.priced).toEqual({ lines: 4, chargeCents: '60000' });
    expect(coverage.share).toEqual({ runs: 2, periodFrom: '2026-03-01', periodTo: '2026-04-30', of: { lines: 36, chargeCents: '300000' } });
    expect(coverage.run?.id).toBe(april);
    expect(coverage.reasons.filter((reason) => reason.lines > 0).map((reason) => [reason.reason, reason.lines])).toEqual([['NO_AGREEMENT', 32]]);

    // The coverage report stores the screen's own figures.
    const content = await withPracticeScope(w.app, { actorId: practice.manager, practiceIds: [practice.practiceId] }, (scope) => coverageContent(scope, practice.practiceId, '2026-10-17', `test-${randomUUID()}`));
    expect(content.priced).toEqual({ lines: 4, charge_cents: '60000' });
    expect(content.of).toEqual({ lines: 36, charge_cents: '300000' });
    expect(content.runs_in_effect).toEqual({ runs: 2, period_from: '2026-03-01', period_to: '2026-04-30' });
    expect(content.reasons.filter((reason) => reason.lines > 0)).toEqual([{ reason: 'NO_AGREEMENT', lines: 32 }]);

    // April prices nothing under either contract: their shares stand.
    expect(await shareOf(contractQ)).toEqual({ of: { lines: 3, chargeCents: '45000' }, priced: { lines: 3, chargeCents: '45000' } });
    expect(await shareOf(contractL)).toEqual({ of: { lines: 1, chargeCents: '15000' }, priced: { lines: 1, chargeCents: '15000' } });
  }, 120_000);
});

describe('who signed an audit report (N3)', () => {
  it('names the reimbursement reviewer by role when the user directory hides their address, never a dash', async () => {
    const id = await w.requestReport(practice, march);
    expect((await w.generate(practice, id)).outcome).toBe('ready');
    const internal = await createOrganization(w.owner, 'internal', 'review');
    const reviewer = await createUser(w.owner, { hardwareKeyRequired: true });
    await addMembership(w.owner, internal, reviewer, 'reviewer');
    await asOwner(w.owner, [practice.practiceId], () =>
      w.owner.query(`INSERT INTO support_grant (practice_id, user_id, ticket, reason, expires_at) VALUES ($1, $2, 'RV-TOUR', 'SYNTHETIC AUDIT REVIEW', now() + interval '4 hours')`, [practice.practiceId, reviewer]),
    );
    const files = (await asOwner(w.owner, [practice.practiceId], async () => (await w.owner.query<{ pdf_sha256: string; csv_sha256: string }>('SELECT pdf_sha256, csv_sha256 FROM audit_report WHERE id = $1', [id])).rows))[0];
    const attestation = JSON.stringify({ format: 'tp-attestation/1', checklist: ['coverage', 'anomalies', 'validated', 'actionable', 'gaps', 'independent'], pdf_sha256: files?.pdf_sha256, csv_sha256: files?.csv_sha256 });
    await withPracticeScope(w.app, { actorId: reviewer, practiceIds: [practice.practiceId] }, (scope) =>
      scope.client.query('UPDATE audit_report SET attested_by = $2, attestation = $3 WHERE id = $1', [id, reviewer, attestation]),
    );

    const seen = ok(await call(reportPage, practice.manager, { ...P(), reportId: id })).report;
    expect(seen.attestedAt).not.toBeNull();
    expect(seen.attestedBy).toBe('the reimbursement reviewer');
    // Unsigned and unreleased, nobody is named.
    const other = await w.requestReport(practice, march);
    await w.generate(practice, other);
    expect(ok(await call(reportPage, practice.manager, { ...P(), reportId: other })).report).toMatchObject({ attestedAt: null, attestedBy: null, releasedAt: null, releasedBy: null });
  }, 120_000);
});
