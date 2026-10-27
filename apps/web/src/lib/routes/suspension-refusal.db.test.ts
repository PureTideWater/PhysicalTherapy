import { randomBytes, randomUUID } from 'node:crypto';

import { rolesPermit } from '@tp/db';
import { addMembership, asOwner, createOrganization, createUser } from '@tp/db/testing';
import { beforeAll, describe, expect, it } from 'vitest';

import { SESSION_COOKIE } from '../auth/sessions';
import { CONTINUES_STARTED_WORK, RUN_STARTING_ROUTES } from '../billing/runs';
import { RUN_STARTING_PERMISSIONS, type RunStartingPermission, stoppedWork } from '../billing/suspension-words';
import { csrfTokenFor } from '../http/csrf';
import type { Route } from '../http/route';
import { setOrganizationStatus } from './console';
import { ROUTES } from './index';
import { practiceHome } from './practice';
import { MemoryJar, type Persona, type SignedIn, type World, routeWorldsForThisFile } from './route-tests/world';
import { agreementsSettingsPage } from './settings';
import { acceptCurrentTerms } from './test-support/onboarding-world';
import { uploadsPage } from './uploads';

/**
 * A suspended or closed organization's people start no new work through its grants (test matrix BIL-07; docs/adr/0080;
 * design SS-01, section 2, option B, held per permission): on the route harness, people who reach the practice by two
 * paths are refused exactly the run-starting work their unheld roles do not allow, at every run-starting route, the
 * uploads gate and the practice home; the practice's own staff carry on; the owner's hold tells only its members why
 * (D6); and the registry: every run-starting route's permission is one Postgres names, and the routes that carry on
 * started work are registered. The database's own refusals (the trigger tables, a job's scope, the setter) are
 * packages/db's suspension.db.test.ts and organization-status.db.test.ts; the per-route refusal and the queued-work
 * check run for every route in route-tests/define.ts. Synthetic data only.
 */

const worlds = routeWorldsForThisFile();

const R4 = "PaidWhole has suspended your organization, so you start no new work here through its grant until PaidWhole reinstates your organization; you can still read this practice's records";
const R5 = 'your organization is closed, so you start no new work here through its grant';
const R1 = 'PaidWhole has suspended your organization, so no new work starts at this practice until PaidWhole reinstates your organization; everything here stays readable';
const R6 = "the PaidWhole account of the practice's organization is on hold, so no new work starts here; everything here stays readable";

interface Person {
  readonly name: string;
  readonly userId: string;
  /** The union of the person's roles at the practice, from every path. */
  readonly roles: readonly string[];
  /** The run-starting work only the held grant gives them (the design's probe, section 17, Q-series). */
  readonly stopped: readonly RunStartingPermission[];
}

const runStarting = (): readonly Route[] => ROUTES.filter((route) => RUN_STARTING_ROUTES.has(route.id));
const permissionOf = (route: Route): string => (route.access.kind === 'practice' ? route.access.permission : '');

let world: World;
let firmName: string;
let platformAdmin: string;
let X: Person;
let Y: Person;
let Z: Person;
let W: Person;
let principal: Person;
const sessions = new Map<string, SignedIn>();

const GROUP_PERSONA: Persona = { kind: 'group', role: 'analyst' };
const FIRM_PERSONA: Persona = { kind: 'firm', role: 'firm_principal' };

async function session(userId: string, persona: Persona = GROUP_PERSONA): Promise<SignedIn> {
  let signed = sessions.get(userId);
  if (signed === undefined) {
    signed = await worlds.signIn({ persona, userId, practiceRoles: [], platformRoles: persona.kind === 'internal' ? [persona.role] : [] });
    sessions.set(userId, signed);
  }
  return signed;
}

async function call<R>(route: Route<R>, userId: string) {
  const signed = await session(userId);
  return worlds.call(route, signed, { ...world.refs, actorDeviceId: signed.deviceId });
}

async function data<R>(route: Route<R>, userId: string): Promise<R> {
  const outcome = await call(route, userId);
  if (outcome.status !== 'ok') {
    throw new Error(`expected ok, got ${JSON.stringify(outcome)}`);
  }
  return outcome.data;
}

/** PaidWhole's suspension or reinstatement of an organization, through the console's route and its setter. */
async function setStatus(organizationId: string, input: Record<string, unknown>): Promise<void> {
  const signed = await session(platformAdmin, { kind: 'internal', role: 'platform_admin' });
  const outcome = await setOrganizationStatus.invoke(
    {
      cookies: new MemoryJar({ [SESSION_COOKIE]: signed.token }),
      params: {},
      input: { requestKey: randomUUID(), csrfToken: csrfTokenFor(worlds.services.sealer, signed.token), organizationId, ...input },
      requestId: `test-${randomUUID()}`,
      userAgent: null,
    },
    worlds.services,
  );
  expect(outcome.status, JSON.stringify(outcome)).toBe('ok');
}

async function person(name: string, memberships: readonly (readonly [string, string])[], roles: readonly string[], stopped: readonly RunStartingPermission[]): Promise<Person> {
  const userId = await createUser(worlds.owner);
  for (const [organizationId, role] of memberships) {
    await addMembership(worlds.owner, organizationId, userId, role as never);
  }
  return { name, userId, roles, stopped };
}

beforeAll(async () => {
  world = await worlds.buildWorld('SUSPENSION REFUSAL');
  const { owner } = worlds;
  const group = world.refs.organizationId;
  const firm = world.refs.firmId;
  firmName = (await owner.query<{ name: string }>('SELECT name FROM organization WHERE id = $1', [firm])).rows[0]?.name ?? '';
  platformAdmin = world.actors.find((actor) => actor.persona.kind === 'internal' && actor.persona.role === 'platform_admin')?.userId ?? '';
  // A second, active firm whose grant gives viewers only.
  const second = await createOrganization(owner, 'firm', 'SUSPENSION REFUSAL SECOND FIRM');
  const agreementId = randomUUID();
  await asOwner(owner, [world.refs.practiceId], async () => {
    await owner.query(
      `INSERT INTO agreement (id, organization_id, practice_id, kind, version, signed_at, signer, document_ref, sha256)
       VALUES ($1, $2, $3, 'engagement', '1', now(), 'SYNTHETIC SIGNER', 'agreements/engagement', $4)`,
      [agreementId, second, world.refs.practiceId, randomBytes(32).toString('hex')],
    );
    await owner.query(
      `INSERT INTO "grant" (organization_id, practice_id, scope, ends_at, approved_by_user_id, agreement_id)
       VALUES ($1, $2, '{"roles":["viewer"]}', now() + interval '30 days', $3, $4)`,
      [second, world.refs.practiceId, world.refs.adminUserId, agreementId],
    );
  });
  const all = [...RUN_STARTING_PERMISSIONS];
  principal = await person('the firm principal', [[firm, 'firm_principal']], ['firm_principal'], all);
  X = await person('X, the group’s practice administrator and the firm’s principal', [[group, 'practice_admin'], [firm, 'firm_principal']], ['practice_admin', 'firm_principal'], all);
  Y = await person('Y, the firm’s principal and a viewer in the second firm', [[firm, 'firm_principal'], [second, 'viewer']], ['firm_principal', 'viewer'], ['mapping.edit', 'case.work', 'posting.reconcile', 'file.upload']);
  Z = await person('Z, the group’s analyst and the firm’s principal', [[group, 'analyst'], [firm, 'firm_principal']], ['analyst', 'firm_principal'], ['mapping.edit', 'posting.reconcile', 'phi.export']);
  W = await person('W, the group’s analyst and the firm’s analyst', [[group, 'analyst'], [firm, 'analyst']], ['analyst'], []);
  await acceptCurrentTerms(owner, [principal, X, Y, Z, W].map((one) => one.userId));
  await setStatus(firm, { change: 'suspend', reason: 'security_hold', note: 'SYNTHETIC NOTE', confirm: 'on' });
}, 120_000);

describe('the registry of run-starting work (BIL-07; D16)', () => {
  it('gives run_starting_permissions() exactly the permissions of the run-starting routes, in the words’ order', async () => {
    const { rows } = await worlds.owner.query<{ permissions: string[] }>('SELECT run_starting_permissions() AS permissions');
    const permissions = rows[0]?.permissions ?? [];
    expect(permissions).toEqual([...RUN_STARTING_PERMISSIONS]);
    expect(new Set(runStarting().map(permissionOf))).toEqual(new Set(permissions));
    expect(runStarting()).toHaveLength(RUN_STARTING_ROUTES.size);
  });

  it('holds the routes that carry on started work to registered practice mutations outside the run-starting list', () => {
    expect([...CONTINUES_STARTED_WORK]).toEqual(['practice.uploads.complete']);
    for (const id of CONTINUES_STARTED_WORK) {
      const route = ROUTES.find((candidate) => candidate.id === id);
      expect(route?.access.kind, id).toBe('practice');
      expect(route?.mutation, id).toBe(true);
      expect(RUN_STARTING_ROUTES.has(id), id).toBe(false);
    }
  });
});

describe('a person with two paths, held per permission (BIL-07; D1)', () => {
  it.each([
    ['the firm principal', () => principal],
    ['X', () => X],
    ['Y', () => Y],
    ['Z', () => Z],
    ['W', () => W],
  ] as const)('refuses %s exactly the run-starting work only the held grant gives them', async (_name, of) => {
    const one = of();
    for (const route of runStarting()) {
      const permission = permissionOf(route);
      const outcome = await call(route, one.userId);
      if (!rolesPermit(one.roles as never, permission as never)) {
        expect(outcome.status, `${one.name}: ${route.id}`).toBe('forbidden');
      } else if (one.stopped.includes(permission as RunStartingPermission)) {
        expect(outcome, `${one.name}: ${route.id}`).toEqual({ status: 'suspended', reason: R4 });
      } else {
        expect(outcome.status, `${one.name}: ${route.id}`).not.toBe('suspended');
      }
    }
  });

  it('pauses uploads at the gate only for those whose uploads stop', async () => {
    for (const one of [principal, X, Y, Z, W]) {
      const { gate } = await data(uploadsPage, one.userId);
      if (one.stopped.includes('file.upload')) {
        expect(gate, one.name).toEqual({ open: false, reason: `Uploads are paused: ${R4}.` });
      } else {
        expect(gate, one.name).toEqual({ open: true, reason: null });
      }
    }
  });

  it('tells each, on the practice home, the work stopped for them through their organization’s grant, and the rest of the practice nothing', async () => {
    for (const one of [principal, X, Y, Z]) {
      const { hold } = await data(practiceHome, one.userId);
      expect(hold, one.name).toEqual({
        source: 'grantee',
        title: "Work through your organization's grant has stopped",
        body: expect.stringMatching(new RegExp(`^PaidWhole suspended ${firmName} on \\d{4}-\\d{2}-\\d{2}, while it looks into a security concern, so you start no new ${stoppedWork(one.stopped)} at this practice through its grant until PaidWhole reinstates ${firmName}\\.`)) as string,
        nextStep: expect.anything() as unknown,
      });
    }
    // The principal holds the firm's billing; X's membership in it is the principal's too.
    expect((await data(practiceHome, principal.userId)).hold?.nextStep).toEqual({ link: 'Settings, Billing', href: `/settings/billing/${world.refs.firmId}`, text: ' shows why and what to do next.' });
    expect((await data(practiceHome, W.userId)).hold).toBeNull();
    expect((await data(practiceHome, world.refs.adminUserId)).hold).toBeNull();
  });

  it('shows the practice’s administrator the grant in force to the held firm, on hold, and never why', async () => {
    const { grants } = await data(agreementsSettingsPage, world.refs.adminUserId);
    const held = grants?.find((grant) => grant.granteeName === firmName);
    expect(held).toMatchObject({ inForce: true, granteeStatus: 'suspended' });
    expect(grants?.filter((grant) => grant.granteeStatus === 'active')).toHaveLength(1);
  });
});

describe('a closed grantee, and the owner’s hold (BIL-07; D6)', () => {
  it('refuses a closed grantee’s people with R5, and tells them the closure without a restart', async () => {
    await worlds.owner.query("UPDATE organization SET status = 'closed' WHERE id = $1", [world.refs.firmId]);
    try {
      const upload = ROUTES.find((route) => route.id === 'practice.uploads.request') as Route;
      expect(await call(upload, principal.userId)).toEqual({ status: 'suspended', reason: R5 });
      expect((await data(practiceHome, principal.userId)).hold).toEqual({
        source: 'grantee',
        title: "Work through your organization's grant has stopped",
        body: `${firmName} is closed, so you start no new ${stoppedWork(RUN_STARTING_PERMISSIONS)} at this practice through its grant.`,
        nextStep: { link: 'Open a support ticket', href: '/support?from=billing', text: ' if you have a question about the closure.' },
      });
      expect((await data(agreementsSettingsPage, world.refs.adminUserId)).grants?.find((grant) => grant.granteeName === firmName)?.granteeStatus).toBe('closed');
    } finally {
      await worlds.owner.query("UPDATE organization SET status = 'suspended', status_reason = 'security_hold' WHERE id = $1", [world.refs.firmId]);
    }
  });

  it('gives the owner’s suspension, reason and all, to the group’s members, and only that it is on hold to the firm’s people', async () => {
    await setStatus(world.refs.firmId, { change: 'reinstate', reason: 'resolved' });
    await setStatus(world.refs.organizationId, { change: 'suspend', reason: 'customer_request', confirm: 'on' });
    try {
      const upload = ROUTES.find((route) => route.id === 'practice.uploads.request') as Route;
      expect(await call(upload, Z.userId)).toEqual({ status: 'suspended', reason: R1 });
      expect(await call(upload, principal.userId)).toEqual({ status: 'suspended', reason: R6 });
      const member = (await data(practiceHome, Z.userId)).hold;
      expect(member).toMatchObject({
        source: 'owner',
        title: 'New runs have stopped',
        body: expect.stringMatching(/^PaidWhole suspended your organization on \d{4}-\d{2}-\d{2}, at your organization's request\. /) as string,
        nextStep: { link: null, href: null, text: "Your organization's administrator sees why and what to do next in Settings, Billing." },
      });
      const outsider = (await data(practiceHome, principal.userId)).hold;
      expect(outsider).toEqual({
        source: 'owner',
        title: 'New work has stopped here',
        body: expect.stringMatching(/^The PaidWhole account of the practice's organization has been on hold since \d{4}-\d{2}-\d{2}, so /) as string,
        nextStep: { link: null, href: null, text: "The practice's administrator sees why and what to do next in Settings, Billing." },
      });
      expect(JSON.stringify(outsider)).not.toMatch(/request|invoice|unpaid|suspended/i);
      // The practice's administrator holds the group's billing.
      expect((await data(practiceHome, world.refs.adminUserId)).hold?.nextStep).toEqual({
        link: 'Settings, Billing',
        href: `/settings/billing/${world.refs.organizationId}`,
        text: ' shows why and what to do next.',
      });
    } finally {
      await setStatus(world.refs.organizationId, { change: 'reinstate', reason: 'resolved' });
    }
    expect((await data(practiceHome, principal.userId)).hold).toBeNull();
  });
});
