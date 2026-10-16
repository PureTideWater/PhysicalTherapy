import { ContractWorkflowError } from '@tp/contracts';
import {
  type ActorScope,
  type AnyScope,
  type MembershipRole,
  PermissionDeniedError,
  type ScopeClient,
  organizationRoles,
  platformRoles,
  practiceDirectory,
  recordAuditEvent,
  requireOrganizationPermission,
  requirePlatformPermission,
  requirePracticePermission,
  withActor,
  withPracticeScope,
} from '@tp/db/runtime';
import { practiceRunRefusal } from '@tp/worker/billing';
import { z } from 'zod';

import { type ActiveSession, SESSION_COOKIE, resolveSession } from '../auth/sessions';
import { RUN_STARTING_ROUTES, SuspendedError } from '../billing/runs';
import { cookieToken } from '../auth/tokens';
import type { Services } from '../server/services';
import {
  type Access,
  type Actor,
  type ActorSpec,
  InputError,
  type Issue,
  type MutationResult,
  NotFoundError,
  type OrganizationSpec,
  type Outcome,
  type PlatformSpec,
  type PracticeSpec,
  type PublicSpec,
  type Route,
  type RouteRequest,
  type Shell,
} from './route';

/**
 * The single wrapper every page, server action and route handler runs through (CLAUDE.md: "Every
 * mutation: a server action or route handler with a Zod schema, a role check, a practice-scoped
 * transaction (SET LOCAL app.practice_ids, app.actor_id) and an audit event"; PRD 15, Request path for
 * a PHI page). In order:
 *
 * 1. The parameters (and a mutation's input) are parsed with the route's Zod schemas. A mutation must
 *    carry a request key (a UUID the form was rendered with).
 * 2. The session cookie is resolved by the database (resolve_session(): the 12-hour and 30-minute
 *    limits, revoked devices, disabled users), on every request.
 * 3. MFA is required: an active user with MFA enrolled whose session used a second factor; a user who
 *    needs a hardware key must have signed in with one. Otherwise no PHI route is reached.
 * 4. One transaction opens with SET LOCAL app.actor_id, and app.practice_ids computed by the
 *    effective-permission function (withPracticeScope) for practice routes, or empty (withActor) for
 *    platform and self routes. Memberships and grants are re-resolved here, every request.
 * 5. The role check runs in the handler's process: the route's permission against the actor's roles
 *    on the practice (or their internal roles, or their role in the organization the route names). A
 *    practice the actor cannot reach, or an organization they are no member of, is "not found". A route
 *    that starts new work is refused, with the database's reason, while the practice's organization is
 *    suspended (docs/adr/0050).
 * 6. A mutation records its request key in the same transaction (a replay does nothing), runs, and
 *    records its audit event; pages get the application shell.
 *
 * Responses that can carry PHI are sent with Cache-Control: private, no-store by the adapters
 * (src/lib/http/next.ts); every authenticated response is.
 */

const REQUEST_KEY = z.object({ requestKey: z.uuid() });

function issuesOf(error: z.ZodError): Issue[] {
  return error.issues.map((issue) => ({ field: issue.path.join('.') || 'input', message: issue.message }));
}

function isPgError(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

interface Parsed<P, I> {
  readonly params: P;
  readonly input: I;
  readonly requestKey: string | undefined;
}

function parse<P, I>(spec: { params: z.ZodType<P>; input?: z.ZodType<I> }, request: RouteRequest, mutation: boolean): Parsed<P, I> | Outcome<never> {
  const params = spec.params.safeParse(request.params);
  if (!params.success) {
    // Parameters come from the URL: a malformed ID names nothing.
    return { status: 'not_found' };
  }
  let requestKey: string | undefined;
  if (mutation) {
    const key = REQUEST_KEY.safeParse(request.input);
    if (!key.success) {
      return { status: 'invalid', issues: [{ field: 'requestKey', message: 'reload the page and try again' }] };
    }
    requestKey = key.data.requestKey;
  }
  if (spec.input === undefined) {
    return { params: params.data, input: undefined as I, requestKey };
  }
  const input = spec.input.safeParse(request.input);
  if (!input.success) {
    return { status: 'invalid', issues: issuesOf(input.error) };
  }
  return { params: params.data, input: input.data, requestKey };
}

function isOutcome(value: unknown): value is Outcome<never> {
  return typeof value === 'object' && value !== null && 'status' in value;
}

/** The session, with MFA (and the hardware key, where required) checked. */
async function signedIn(request: RouteRequest, services: Services): Promise<ActiveSession | Outcome<never>> {
  const state = await resolveSession(services.pool, cookieToken(request.cookies.get(SESSION_COOKIE)), request.requestId);
  if (state.state === 'none') {
    return { status: 'unauthenticated', reason: 'none' };
  }
  if (state.state === 'ended') {
    return { status: 'unauthenticated', reason: state.reason };
  }
  const session = state.session;
  if (session.userStatus !== 'active' || !session.mfaEnrolled) {
    return { status: 'mfa_required' };
  }
  if (session.hardwareKeyRequired && session.mfaMethod !== 'webauthn') {
    return { status: 'hardware_key_required' };
  }
  return session;
}

function actorOf(session: ActiveSession): Actor {
  return { userId: session.userId, sessionId: session.sessionId, deviceId: session.deviceId, mfaMethod: session.mfaMethod };
}

export async function shellFor(scope: AnyScope<ScopeClient>, currentPracticeId: string | null, roles?: readonly MembershipRole[]): Promise<Shell> {
  const { rows } = await scope.client.query<{ email: string }>('SELECT email FROM "user" WHERE id = app_actor_id()');
  return {
    email: rows[0]?.email ?? '',
    practices: await practiceDirectory(scope),
    currentPracticeId,
    platformRoles: roles ?? (await platformRoles(scope)),
  };
}

/** Records the request key; false when it was already used (the mutation then does nothing). */
async function claimRequestKey(scope: AnyScope<ScopeClient>, routeId: string, requestKey: string): Promise<boolean> {
  const { rowCount } = await scope.client.query(
    'INSERT INTO mutation_request (user_id, request_key, route_id) VALUES (app_actor_id(), $1, $2) ON CONFLICT (user_id, request_key) DO NOTHING',
    [requestKey, routeId],
  );
  return rowCount === 1;
}

interface Running {
  readonly route: Pick<Route, 'id' | 'kind' | 'mutation' | 'audit'>;
  readonly scope: AnyScope<ScopeClient>;
  readonly requestKey: string | undefined;
  readonly requestId: string;
  readonly practiceId: string | null;
  readonly roles: readonly MembershipRole[];
}

/** Steps 6: the request key, the handler, the audit event and the shell, inside the open transaction. */
async function run<R>(running: Running, handle: () => Promise<R>): Promise<Outcome<R>> {
  const { route, scope } = running;
  if (running.requestKey !== undefined && !(await claimRequestKey(scope, route.id, running.requestKey))) {
    return { status: 'duplicate' };
  }
  const data = await handle();
  if (route.audit !== undefined) {
    const objectId = (data as MutationResult | undefined)?.objectId;
    await recordAuditEvent(scope, {
      action: route.audit.action,
      objectType: route.audit.objectType,
      objectId,
      practiceId: running.practiceId ?? undefined,
      requestId: running.requestId,
    });
  }
  const shell = route.kind === 'page' ? await shellFor(scope, running.practiceId, running.roles) : undefined;
  return shell === undefined ? { status: 'ok', data } : { status: 'ok', data, shell };
}

/** Maps what a handler may throw to an outcome; anything else is a server error. */
async function refusal(error: unknown, kind: Route['kind'], services: Services, actor: Actor, practiceId: string | null): Promise<Outcome<never>> {
  if (error instanceof NotFoundError) {
    return { status: 'not_found' };
  }
  if (error instanceof SuspendedError) {
    return { status: 'suspended', reason: error.message };
  }
  if (isPgError(error, '55000')) {
    // The database refused new work for a suspended organization's practice (migration 20261029150000).
    return { status: 'suspended', reason: (error as Error).message };
  }
  if (error instanceof InputError) {
    return { status: 'invalid', issues: error.issues };
  }
  if (error instanceof ContractWorkflowError) {
    // The contract workflow's refusals (packages/contracts): what the request names is not there, or
    // the domain refuses it, with the rule's own words (never a value).
    if (error.reason === 'not_found') {
      return { status: 'not_found' };
    }
    return { status: 'invalid', issues: error.issues.length > 0 ? error.issues : [{ field: 'input', message: error.message }] };
  }
  if (error instanceof PermissionDeniedError) {
    const shell = kind === 'page' ? await withActor(services.pool, actor.userId, (scope) => shellFor(scope, practiceId)) : undefined;
    const outcome = { status: 'forbidden' as const, permission: error.permission, message: error.message, roles: error.roles };
    return shell === undefined ? outcome : { ...outcome, shell };
  }
  if (isPgError(error, '23514')) {
    // A rule the records keep (a practice keeps an administrator; a role fits its organization). The
    // database's messages name rules, never values.
    return { status: 'invalid', issues: [{ field: 'input', message: (error as Error).message }] };
  }
  if (isPgError(error, '42501')) {
    // A policy refused what the handler tried: the database's own role check.
    return { status: 'forbidden', permission: 'practice.open', message: 'the database refused this action for your role', roles: [] };
  }
  throw error;
}

interface Shape {
  readonly id: string;
  readonly kind: Route['kind'];
  readonly path: string;
  readonly method?: 'GET' | 'POST' | 'PUT';
  readonly phi: boolean;
  readonly audit?: Route['audit'];
  readonly sample?: Route['sample'];
}

/** What every route records about itself; a mutation without an audit event is refused at definition. */
function common(spec: Shape, access: Access): Omit<Route, 'invoke'> {
  const method = spec.method ?? (spec.kind === 'action' ? 'POST' : 'GET');
  const mutation = spec.kind === 'action' || method === 'POST' || method === 'PUT';
  if (mutation && access.kind !== 'public' && spec.audit === undefined) {
    throw new Error(`route ${spec.id} changes records but names no audit event`);
  }
  return { id: spec.id, kind: spec.kind, path: spec.path, method, access, phi: spec.phi, mutation, audit: spec.audit, sample: spec.sample };
}

/** A route anyone may call: sign-in. It opens no scope; its steps write their own audit events. */
export function publicRoute<P, I, R>(spec: PublicSpec<P, I, R>): Route<R> {
  const shape = common(spec, { kind: 'public' });
  return {
    ...shape,
    mutation: false,
    invoke: async (request, services) => {
      const parsed = parse(spec, request, false);
      if (isOutcome(parsed)) {
        return parsed;
      }
      try {
        return { status: 'ok', data: await spec.handle({ params: parsed.params, input: parsed.input, request, services }) };
      } catch (error) {
        if (error instanceof InputError) {
          return { status: 'invalid', issues: error.issues };
        }
        throw error;
      }
    },
  };
}

function actorRoute<P, I, R>(spec: ActorSpec<P, I, R>, access: Extract<Access, { kind: 'self' | 'platform' }>): Route<R> {
  const shape = common(spec, access);
  return {
    ...shape,
    invoke: async (request, services) => {
      const parsed = parse(spec, request, shape.mutation);
      if (isOutcome(parsed)) {
        return parsed;
      }
      const session = await signedIn(request, services);
      if (isOutcome(session)) {
        return session;
      }
      const actor = actorOf(session);
      try {
        return await withActor(services.pool, actor.userId, async (scope: ActorScope<ScopeClient>) => {
          const roles = access.kind === 'platform' ? await requirePlatformPermission(scope, access.permission) : await platformRoles(scope);
          return run({ route: shape, scope, requestKey: parsed.requestKey, requestId: request.requestId, practiceId: null, roles }, () =>
            spec.handle({ params: parsed.params, input: parsed.input, request, services, actor, scope, platformRoles: roles }),
          );
        });
      } catch (error) {
        return refusal(error, spec.kind, services, actor, null);
      }
    },
  };
}

/** A signed-in user's own records (their devices; signing out). */
export function selfRoute<P, I, R>(spec: ActorSpec<P, I, R>): Route<R> {
  return actorRoute(spec, { kind: 'self' });
}

/** The internal console: a platform permission, and no practice in scope (no PHI without a support grant). */
export function platformRoute<P, I, R>(spec: PlatformSpec<P, I, R>): Route<R> {
  return actorRoute(spec, { kind: 'platform', permission: spec.permission });
}

/** A practice's workspace: the practice named by params.practiceId, in its scope, under the route's permission. */
export function practiceRoute<P extends { readonly practiceId: string }, I, R>(spec: PracticeSpec<P, I, R>): Route<R> {
  const shape = common(spec, { kind: 'practice', permission: spec.permission });
  return {
    ...shape,
    invoke: async (request, services) => {
      const parsed = parse(spec, request, shape.mutation);
      if (isOutcome(parsed)) {
        return parsed;
      }
      const session = await signedIn(request, services);
      if (isOutcome(session)) {
        return session;
      }
      const actor = actorOf(session);
      const practiceId = parsed.params.practiceId;
      try {
        return await withPracticeScope(services.pool, { actorId: actor.userId, practiceIds: [practiceId] }, async (scope) => {
          if (scope.access(practiceId) === undefined) {
            throw new NotFoundError();
          }
          const access = requirePracticePermission(scope, practiceId, spec.permission);
          if (RUN_STARTING_ROUTES.has(spec.id)) {
            const reason = await practiceRunRefusal(scope.client, practiceId);
            if (reason !== null) {
              throw new SuspendedError(reason);
            }
          }
          const roles = await platformRoles(scope);
          return run({ route: shape, scope, requestKey: parsed.requestKey, requestId: request.requestId, practiceId, roles }, () =>
            spec.handle({ params: parsed.params, input: parsed.input, request, services, actor, scope, practiceId, access, platformRoles: roles }),
          );
        });
      } catch (error) {
        return refusal(error, spec.kind, services, actor, practiceId);
      }
    },
  };
}

/**
 * An organization's own records (its billing, docs/adr/0050): the organization named by
 * params.organizationId, under the route's organization permission, with no practice in scope. An
 * organization the actor is no member of is "not found"; the database checks the permission again
 * where it matters.
 */
export function organizationRoute<P extends { readonly organizationId: string }, I, R>(spec: OrganizationSpec<P, I, R>): Route<R> {
  const shape = common(spec, { kind: 'organization', permission: spec.permission });
  return {
    ...shape,
    invoke: async (request, services) => {
      const parsed = parse(spec, request, shape.mutation);
      if (isOutcome(parsed)) {
        return parsed;
      }
      const session = await signedIn(request, services);
      if (isOutcome(session)) {
        return session;
      }
      const actor = actorOf(session);
      const organizationId = parsed.params.organizationId;
      try {
        return await withActor(services.pool, actor.userId, async (scope: ActorScope<ScopeClient>) => {
          if ((await organizationRoles(scope, organizationId)).length === 0) {
            throw new NotFoundError();
          }
          const held = await requireOrganizationPermission(scope, organizationId, spec.permission);
          const roles = await platformRoles(scope);
          return run({ route: shape, scope, requestKey: parsed.requestKey, requestId: request.requestId, practiceId: null, roles }, () =>
            spec.handle({ params: parsed.params, input: parsed.input, request, services, actor, scope, platformRoles: roles, organizationId, organizationRoles: held }),
          );
        });
      } catch (error) {
        return refusal(error, spec.kind, services, actor, null);
      }
    },
  };
}
