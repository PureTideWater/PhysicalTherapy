import { randomUUID } from 'node:crypto';

import { PERSONAS } from '@tp/db';
import { addMembership, createUser } from '@tp/db/testing';
import { beforeAll, describe, expect, it } from 'vitest';

import { RUN_STARTING_ROUTES } from '../../billing/runs';
import { csrfTokenFor } from '../../http/csrf';
import type { SampleRefs } from '../../http/route';
import { SESSION_COOKIE } from '../../auth/sessions';
import { inviteMember } from '../console';
import { routesOf } from './partition';
import { type Actor, MemoryJar, PERSONA_LIST, type SignedIn, type World, customerPersona, expected, label, tenantRows, routeWorldsForThisFile } from './world';

/**
 * Tests generated from the route registry, for every registered route (test matrix SEC-02 "every
 * table and route", SEC-03, SEC-04, SEC-15; PRD 6 "a user without MFA cannot reach any PHI route";
 * PRD 16 "a test calls each mutation with each role"; docs/adr/0017). A route added to the registry
 * gets all of them with nothing else to write:
 *
 * - no session, an idle session (30 minutes), a session past 12 hours: refused;
 * - a user without MFA: refused; an internal role signed in without a hardware key: refused;
 * - every persona (each customer role of the practice's group, each firm role through a grant, each
 *   internal role, the support engineer, the contract specialist and the reviewer through support
 *   grants): allowed exactly when the persona matrix allows the route's permission and the actor
 *   reaches the practice;
 * - a mutation replayed with its request key: does nothing;
 * - every persona of another practice, aimed at this practice's records or mixing them into its own
 *   request: never answered with any of this practice's records, and nothing of this practice changes;
 * - for practice routes, every internal role: never made a member of the practice's group (not through
 *   the console, not by the owner), so the route stays not found without a support grant (PRD 3);
 * - every mutation: refused without the session's CSRF token, with another session's, or from another origin;
 *   every public POST but a signed webhook: refused from another origin (docs/adr/0053);
 * - every customer route but the terms themselves: a customer who has not accepted the terms of use in force is
 *   sent to them first; every route but the console's and the terms': refused while the platform is in
 *   maintenance. Neither changes anything.
 *
 * The routes are split over twelve files, route-tests.0.db.test.ts to route-tests.11.db.test.ts, each calling
 * defineRouteTests(<its index>) for the routes partition.ts gives it, on a database of its own (test matrix CI-02;
 * docs/adr/0066). partition.test.ts proves every route is in exactly one file and every authenticated route has a
 * sample; snapshot.db.test.ts proves the one-statement snapshot every case below compares equals the per-table one.
 */

const INTERNAL_ROLES = ['platform_admin', 'contract_specialist', 'reviewer', 'support'] as const;

/** The generated tests of route-test file `file` (0 to 11): every case above for each of its routes. */
export function defineRouteTests(file: number): void {
  const routes = routesOf(file);
  const worlds = routeWorldsForThisFile();
  const authenticated = routes.filter((route) => route.access.kind !== 'public');
  const practiceRoutes = routes.filter((route) => route.access.kind === 'practice');
  const publicRoutes = routes.filter((route) => route.access.kind === 'public');

  describe.each(authenticated.map((route) => [route.id, route] as const))('%s', (_id, route) => {
    let worldA: World;
    let worldB: World;

    beforeAll(async () => {
      worldA = await worlds.buildWorld(`A ${route.id}`);
      worldB = await worlds.buildWorld(`B ${route.id}`);
    }, 60_000);

    const refsFor = (world: World, session: SignedIn): SampleRefs => ({ ...world.refs, actorDeviceId: session.deviceId });
    const admin = () => worldA.actors[0] as Actor;

    it('refuses a request without a session', async () => {
      expect(await worlds.call(route, undefined, { ...worldA.refs, actorDeviceId: randomUUID() })).toEqual({ status: 'unauthenticated', reason: 'none' });
    });

    it('refuses a session idle for more than 30 minutes, or past 12 hours, on the next request (SEC-15)', async () => {
      const idle = await worlds.signIn(admin());
      await worlds.owner.query("UPDATE user_session SET last_seen_at = now() - interval '31 minutes' WHERE id = $1", [idle.sessionId]);
      expect(await worlds.call(route, idle, refsFor(worldA, idle))).toEqual({ status: 'unauthenticated', reason: 'idle' });
      expect(await worlds.call(route, idle, refsFor(worldA, idle))).toEqual({ status: 'unauthenticated', reason: 'ended' });
      const old = await worlds.signIn(admin());
      await worlds.owner.query("UPDATE user_session SET started_at = now() - interval '12 hours', expires_at = now() WHERE id = $1", [old.sessionId]);
      expect(await worlds.call(route, old, refsFor(worldA, old))).toEqual({ status: 'unauthenticated', reason: 'expired' });
    });

    it('refuses a user without MFA (PRD 6: no PHI route without MFA)', async () => {
      const person = await createUser(worlds.owner, { mfaEnrolled: false });
      await addMembership(worlds.owner, worldA.refs.organizationId, person, 'billing_manager');
      const session = await worlds.rawSession(person, 'totp');
      expect(await worlds.call(route, session, refsFor(worldA, session))).toEqual({ status: 'mfa_required' });
    });

    it('refuses an internal role signed in without a hardware key', async () => {
      const platformAdmin = worldA.actors.find((actor) => actor.persona.role === 'platform_admin') as Actor;
      const session = await worlds.rawSession(platformAdmin.userId, 'totp');
      expect(await worlds.call(route, session, refsFor(worldA, session))).toEqual({ status: 'hardware_key_required' });
    });

    it.each(PERSONA_LIST.map((persona) => [label(persona), persona] as const))('answers %s as the persona matrix says', async (_label, persona) => {
      const actor = worldA.actors.find((candidate) => candidate.persona === persona) as Actor;
      const session = await worlds.signIn(actor);
      const outcome = await worlds.call(route, session, refsFor(worldA, session));
      const want = expected(route, actor);
      expect(outcome.status, `${label(persona)} (${PERSONAS[persona.role].persona})`).toBe(want);
    });

    if (route.mutation) {
      it('does nothing when a mutation is replayed with its request key', async () => {
        // On the other world, which the persona calls above have not touched.
        const allowed = worldB.actors.find((actor) => expected(route, actor) === 'ok') as Actor;
        const session = await worlds.signIn(allowed);
        const key = randomUUID();
        const refs = refsFor(worldB, session);
        expect((await worlds.call(route, session, refs, key)).status).toBe('ok');
        // The same user and key from a fresh session (the first call may have ended its own).
        expect((await worlds.call(route, await worlds.signIn(allowed), refs, key)).status).toBe('duplicate');
      });
    }

    it.each(PERSONA_LIST.map((persona) => [label(persona), persona] as const))(
      'gives %s of another practice nothing of this practice, and changes nothing of it',
      async (_label, persona) => {
        const outsider = worldB.actors.find((candidate) => candidate.persona === persona) as Actor;
        // A platform administrator manages every organization by design; that is not a tenant's reach.
        const manages = route.access.kind === 'platform' && expected(route, outsider) === 'ok';
        const deviceOfA = await worlds.signIn(admin());
        const before = await worlds.snapshot(worldA);
        // Aimed at this practice's records.
        const aimed = await worlds.signIn(outsider);
        const atA = await worlds.call(route, aimed, refsFor(worldA, deviceOfA));
        // Its own practice, with this practice's records mixed in wherever the route names other records.
        const mixed = await worlds.signIn(outsider);
        const ownWithA = await worlds.call(route, mixed, { ...refsFor(worldA, deviceOfA), practiceId: worldB.refs.practiceId, organizationId: worldB.refs.organizationId });
        const after = await worlds.snapshot(worldA);
        if (manages) {
          return;
        }
        for (const outcome of [atA, ownWithA]) {
          const text = JSON.stringify(outcome);
          expect(
            worldA.ids.filter((id) => text.includes(id)),
            `${label(persona)} saw practice A's records through ${route.id}`,
          ).toEqual([]);
        }
        if (route.access.kind === 'practice' || route.access.kind === 'organization') {
          expect(atA.status).toBe('not_found');
        }
        expect(after).toBe(before);
      },
    );

    if (RUN_STARTING_ROUTES.has(route.id)) {
      it('refuses new work with the reason while the practice’s organization is suspended for nonpayment, and changes nothing (docs/adr/0050)', async () => {
        // On the other world, after every test above has used it; paid again afterwards.
        const allowed = worldB.actors.find((actor) => expected(route, actor) === 'ok') as Actor;
        const session = await worlds.signIn(allowed);
        const invoiceId = await worlds.suspendForNonpayment(worldB);
        try {
          const before = tenantRows(await worlds.snapshot(worldB));
          expect(await worlds.call(route, session, refsFor(worldB, session))).toEqual({ status: 'suspended', reason: expect.stringMatching(/^the organization is suspended for nonpayment/) as string });
          expect(tenantRows(await worlds.snapshot(worldB))).toBe(before);
        } finally {
          await worlds.owner.query("UPDATE invoice SET status = 'paid', paid_at = now(), amount_paid_cents = amount_due_cents, amount_remaining_cents = 0 WHERE id = $1", [invoiceId]);
        }
      });
    }

    if (route.mutation) {
      it('refuses a missing or wrong CSRF token, and a request from another origin, and changes nothing (docs/adr/0053)', async () => {
        const allowed = worldA.actors.find((actor) => expected(route, actor) === 'ok') as Actor;
        const session = await worlds.signIn(allowed);
        const another = await worlds.signIn(allowed);
        const refs = refsFor(worldA, session);
        const before = tenantRows(await worlds.snapshot(worldA));
        expect(await worlds.call(route, session, refs, randomUUID(), { csrfToken: null })).toEqual({ status: 'csrf_refused' });
        expect(await worlds.call(route, session, refs, randomUUID(), { csrfToken: csrfTokenFor(worlds.services.sealer, another.token) })).toEqual({ status: 'csrf_refused' });
        expect(await worlds.call(route, session, refs, randomUUID(), { csrfToken: 'not-a-token' })).toEqual({ status: 'csrf_refused' });
        expect(await worlds.call(route, session, refs, randomUUID(), { origin: 'https://elsewhere.example' })).toEqual({ status: 'csrf_refused' });
        expect(tenantRows(await worlds.snapshot(worldA))).toBe(before);
      });
    }

    const customer = route.access.kind === 'platform' || route.termsExempt ? undefined : customerPersona(route);
    if (customer !== undefined) {
      it('sends a customer who has not accepted the terms of use in force to them first, and changes nothing (docs/adr/0053)', async () => {
        // A new member of the group in the role the matrix allows, who has not accepted the terms in force.
        const person = await createUser(worlds.owner);
        await addMembership(worlds.owner, worldA.refs.organizationId, person, customer.role);
        const session = await worlds.signIn({ persona: customer, userId: person, practiceRoles: [customer.role], platformRoles: [] });
        const before = tenantRows(await worlds.snapshot(worldA));
        expect(await worlds.call(route, session, refsFor(worldA, session))).toEqual({ status: 'terms_required' });
        expect(tenantRows(await worlds.snapshot(worldA))).toBe(before);
      });
    }

    if (route.access.kind !== 'platform' && !route.termsExempt) {
      it('answers with the maintenance page while the platform is in maintenance, and changes nothing (docs/adr/0053)', async () => {
        const allowed = worldA.actors.find((actor) => expected(route, actor) === 'ok') as Actor;
        const session = await worlds.signIn(allowed);
        const before = tenantRows(await worlds.snapshot(worldA));
        await worlds.setMaintenance(true);
        try {
          expect(await worlds.call(route, session, refsFor(worldA, session))).toEqual({ status: 'maintenance' });
        } finally {
          await worlds.setMaintenance(false);
        }
        expect(tenantRows(await worlds.snapshot(worldA))).toBe(before);
      });
    }
  });

  describe.each(practiceRoutes.map((route) => [route.id, route] as const))('%s (internal roles)', (_id, route) => {
    let worldA: World;
    let worldB: World;

    beforeAll(async () => {
      worldA = await worlds.buildWorld(`A internal ${route.id}`);
      worldB = await worlds.buildWorld(`B internal ${route.id}`);
    }, 60_000);

    it.each(INTERNAL_ROLES)('never makes the internal %s a member of the practice’s group, so the route stays not found', async (role) => {
      // Another world's staff, who hold no support grant on this practice.
      const staff = worldB.actors.find((actor) => actor.persona.kind === 'internal' && actor.persona.role === role) as Actor;
      const inviter = worldA.actors.find((actor) => actor.persona.role === 'platform_admin') as Actor;
      const email = (await worlds.owner.query<{ email: string }>('SELECT email FROM "user" WHERE id = $1', [staff.userId])).rows[0]?.email ?? '';
      const adminSession = await worlds.signIn(inviter);
      for (const memberRole of ['practice_admin', 'viewer'] as const) {
        const invited = await inviteMember.invoke(
          {
            cookies: new MemoryJar({ [SESSION_COOKIE]: adminSession.token }),
            params: {},
            input: { requestKey: randomUUID(), csrfToken: csrfTokenFor(worlds.services.sealer, adminSession.token), organizationId: worldA.refs.organizationId, email, role: memberRole },
            requestId: `test-${randomUUID()}`,
            userAgent: null,
          },
          worlds.services,
        );
        expect(invited.status, `${role} invited as ${memberRole}`).toBe('invalid');
      }
      await expect(addMembership(worlds.owner, worldA.refs.organizationId, staff.userId, 'practice_admin')).rejects.toMatchObject({ code: '23514' });
      const session = await worlds.signIn(staff);
      expect((await worlds.call(route, session, { ...worldA.refs, actorDeviceId: session.deviceId })).status).toBe('not_found');
    });
  });

  describe.each(publicRoutes.map((route) => [route.id, route] as const))('%s (public)', (_id, route) => {
    it('answers without a session and reads or changes no tenant record', async () => {
      const world = await worlds.buildWorld(`public ${route.id}`);
      const before = await worlds.snapshot(world);
      const outcome = await worlds.call(route, undefined, { ...world.refs, actorDeviceId: randomUUID() });
      expect(['ok', 'invalid', 'not_found']).toContain(outcome.status);
      const text = JSON.stringify(outcome);
      expect(world.ids.filter((id) => text.includes(id))).toEqual([]);
      expect(await worlds.snapshot(world)).toBe(before);
    });

    if (route.originChecked) {
      it('refuses a POST from another origin before reading it (login CSRF; docs/adr/0053)', async () => {
        const world = await worlds.buildWorld(`public origin ${route.id}`);
        const outcome = await worlds.call(route, undefined, { ...world.refs, actorDeviceId: randomUUID() }, randomUUID(), { origin: 'https://elsewhere.example' });
        expect(outcome).toEqual({ status: 'csrf_refused' });
      });
    }
  });
}
