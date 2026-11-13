import type { ScopeClient } from '@tp/db/runtime';
import { z } from 'zod';

import { newRegistrationCode, registrationCodeDigest } from '../auth/registration-code';
import { platformRoute } from '../http/invoke';
import { InputError, type MutationResult, NotFoundError } from '../http/route';
import { opaqueId } from './schemas';

/**
 * The hardware-key registry in the internal console (docs/adr/0095; Queues item 37): a platform administrator requests
 * the removal of an account's hardware keys, a second confirms it, either cancels it, and after a confirmed removal one
 * of them opens registration of a new key for an hour with a one-time code.
 *
 * The handler checks organization.manage. Postgres decides everything again and holds it: two people, neither of them
 * the account, each seven days in the role, and the acting session (this request's own, never another session of the
 * account) a key session of the last 15 minutes. The functions write the audit rows themselves (reserved actions), so
 * the wrapper writes none (`writtenBy: 'database'`). The web calls the identity provider nowhere here: the confirmation
 * leaves a row in the outbox and the platform job signs the account out.
 *
 * The one-time code is made here, returned once to the administrator who opened registration, and only its SHA-256
 * goes to the database. It is in no redirect, URL, log line, job payload or error.
 */

const PAGE = '/console/organizations/[organizationId]';

/**
 * The words of each refusal, by the database's constraint name; `not_permitted` is its 42501. The database raises that
 * one code, with no constraint name, for both of its causes (under seven days in the role; no key session of the last
 * 15 minutes), so the route cannot tell them apart and the one sentence gives each cause its own next step. A request
 * already decided may have been confirmed, cancelled or expired: the forms that can meet it read the page again, so
 * the words point at the row and never at a reload.
 */
export const KEY_REFUSALS = {
  not_permitted:
    'only a platform administrator who has held the role for seven days and signed in with their hardware key in the last 15 minutes can do this. If you signed in with your key more than 15 minutes ago, sign out and sign in again with it. If you have held the role for less than seven days, ask another platform administrator.',
  hardware_key_removal_not_own_account: 'no one acts on the hardware keys of their own account; another platform administrator does',
  hardware_key_removal_open_once: 'a removal is already requested for this account; confirm or cancel that one',
  hardware_key_removal_two_people: 'ask another platform administrator to confirm this removal; the one who requested it cannot',
  hardware_key_removal_in_time: 'this request has expired; ask again',
  hardware_key_removal_decided: 'this request was already confirmed or cancelled, or it expired; the row now shows where it stands',
  hardware_key_removal_requester_left: 'the administrator who requested this removal no longer may; cancel it and ask again',
  hardware_key_registration_not_closed: 'registration is opened only for an account whose keys were removed and that has registered no key since',
  hardware_key_registration_open_once: 'registration is already open for this account; it can be opened again once that hour has passed',
} as const;

/** The database's refusal as the route's: a rule's words, not found, or the error itself. */
function refused(error: unknown): never {
  const { code, constraint } = (typeof error === 'object' && error !== null ? error : {}) as { readonly code?: unknown; readonly constraint?: unknown };
  if (code === '42501') {
    throw new InputError([{ field: 'input', message: KEY_REFUSALS.not_permitted }]);
  }
  if (code === 'P0002') {
    throw new NotFoundError();
  }
  if ((code === '23514' || code === '23505') && typeof constraint === 'string' && constraint in KEY_REFUSALS) {
    throw new InputError([{ field: 'input', message: KEY_REFUSALS[constraint as keyof typeof KEY_REFUSALS] }]);
  }
  throw error;
}

const redirectTo = (organizationId: string) => `/console/organizations/${organizationId}`;

export const requestKeyRemoval = platformRoute({
  id: 'console.request_key_removal',
  kind: 'action',
  path: PAGE,
  phi: false,
  permission: 'organization.manage',
  params: z.object({}),
  input: z.object({ organizationId: opaqueId, userId: opaqueId }),
  audit: { action: 'hardware_key_removal_requested', objectType: 'user', writtenBy: 'database' },
  handle: async ({ scope, input, request, actor }): Promise<MutationResult> => {
    const removal = await scope.client
      .query<{ id: string }>('SELECT hardware_key_removal_request($1, $2, $3) AS id', [input.userId, actor.sessionId, request.requestId])
      .catch(refused);
    return { objectId: removal.rows[0]?.id, redirect: redirectTo(input.organizationId) };
  },
  sample: { params: () => ({}), input: (refs) => ({ organizationId: refs.organizationId, userId: refs.keyHolderUserId }) },
});

const removalInput = z.object({ organizationId: opaqueId, removalId: opaqueId });

export const confirmKeyRemoval = platformRoute({
  id: 'console.confirm_key_removal',
  kind: 'action',
  path: PAGE,
  phi: false,
  permission: 'organization.manage',
  params: z.object({}),
  input: removalInput,
  audit: { action: 'hardware_key_removal_confirmed', objectType: 'user', writtenBy: 'database' },
  handle: async ({ scope, input, request, actor }): Promise<MutationResult> => {
    await scope.client.query('SELECT * FROM hardware_key_removal_confirm($1, $2, $3)', [input.removalId, actor.sessionId, request.requestId]).catch(refused);
    return { objectId: input.removalId, redirect: redirectTo(input.organizationId) };
  },
  sample: { params: () => ({}), input: (refs) => ({ organizationId: refs.organizationId, removalId: refs.keyRemovalToConfirmId }) },
});

export const cancelKeyRemoval = platformRoute({
  id: 'console.cancel_key_removal',
  kind: 'action',
  path: PAGE,
  phi: false,
  permission: 'organization.manage',
  params: z.object({}),
  input: removalInput,
  audit: { action: 'hardware_key_removal_cancelled', objectType: 'user', writtenBy: 'database' },
  handle: async ({ scope, input, request, actor }): Promise<MutationResult> => {
    const cancelled = await scope.client
      .query<{ ok: boolean }>('SELECT hardware_key_removal_cancel($1, $2, $3) AS ok', [input.removalId, actor.sessionId, request.requestId])
      .catch(refused);
    if (cancelled.rows[0]?.ok !== true) {
      // Decided or expired in the meantime: nothing was cancelled and the function wrote no cancellation.
      throw new InputError([{ field: 'input', message: KEY_REFUSALS.hardware_key_removal_decided }]);
    }
    return { objectId: input.removalId, redirect: redirectTo(input.organizationId) };
  },
  sample: { params: () => ({}), input: (refs) => ({ organizationId: refs.organizationId, removalId: refs.keyRemovalToCancelId }) },
});

/** What opening registration answers, once: the code to read to the member, and when the opening ends. No redirect: the page that asked shows it. */
export interface RegistrationOpened {
  readonly objectId: string;
  readonly registrationCode: string;
  readonly openUntil: Date;
}

/** The opening as the form that asked receives it: the code and the opening's end, or the refusal's state. Never stored by the browser. */
export interface RegistrationOpenedState {
  readonly error?: string;
  readonly registrationCode?: string;
  /** ISO 8601, UTC. */
  readonly openUntil?: string;
}

export const openKeyRegistration = platformRoute({
  id: 'console.open_key_registration',
  kind: 'action',
  path: PAGE,
  phi: false,
  permission: 'organization.manage',
  params: z.object({}),
  input: removalInput,
  audit: { action: 'hardware_key_registration_opened', objectType: 'user', writtenBy: 'database' },
  handle: async ({ scope, input, request, actor, services }): Promise<RegistrationOpened> => {
    const registrationCode = newRegistrationCode();
    const opened = await scope.client
      .query<{ until: Date }>('SELECT hardware_key_registration_open($1, $2, $3, $4) AS until', [input.removalId, actor.sessionId, registrationCodeDigest(services.registrationCodeKey, registrationCode), request.requestId])
      .catch(refused);
    const openUntil = opened.rows[0]?.until;
    if (openUntil === undefined) {
      throw new NotFoundError();
    }
    return { objectId: input.removalId, registrationCode, openUntil };
  },
  sample: { params: () => ({}), input: (refs) => ({ organizationId: refs.organizationId, removalId: refs.keyRemovalClosedId }) },
});

/** An account's latest key removal, as the organization's page shows it beside the member. IDs, times and counts; never a code. */
export interface KeyRemovalSummary {
  readonly removalId: string;
  readonly state: 'requested' | 'confirmed' | 'cancelled' | 'expired';
  readonly requestedById: string;
  readonly requestedByEmail: string;
  /** Whether the administrator reading the page requested it (and so cannot confirm it). */
  readonly mine: boolean;
  readonly requestedAt: Date;
  readonly expiresAt: Date;
  readonly decidedAt: Date | null;
  readonly liveKeys: number;
  /** When the registration opened after this removal closes; null when none was opened. */
  readonly registrationOpenUntil: Date | null;
  /** Whether the account is closed: its keys were removed and it has registered none since. */
  readonly registrationClosed: boolean;
}

/** Each account's latest removal, open or decided in the last 30 days (hardware_key_removals(), which asks organization.manage again). */
export async function keyRemovalsByAccount(client: ScopeClient, actorId: string): Promise<ReadonlyMap<string, KeyRemovalSummary>> {
  const { rows } = await client.query<{
    removal_id: string;
    user_id: string;
    requested_by: string;
    requested_by_email: string | null;
    requested_at: Date;
    expires_at: Date;
    state: KeyRemovalSummary['state'];
    decided_at: Date | null;
    live_keys: number;
    registration_open_until: Date | null;
    registration_closed: boolean;
  }>(
    `SELECT r.removal_id, r.user_id, r.requested_by, u.email AS requested_by_email, r.requested_at, r.expires_at, r.state, r.decided_at, r.live_keys,
            r.registration_open_until, r.registration_closed
       FROM hardware_key_removals() r LEFT JOIN "user" u ON u.id = r.requested_by
      ORDER BY r.requested_at DESC, r.removal_id`,
  );
  const latest = new Map<string, KeyRemovalSummary>();
  for (const row of rows) {
    if (!latest.has(row.user_id)) {
      latest.set(row.user_id, {
        removalId: row.removal_id,
        state: row.state,
        requestedById: row.requested_by,
        requestedByEmail: row.requested_by_email ?? 'an administrator no longer listed',
        mine: row.requested_by === actorId,
        requestedAt: row.requested_at,
        expiresAt: row.expires_at,
        decidedAt: row.decided_at,
        liveKeys: row.live_keys,
        registrationOpenUntil: row.registration_open_until,
        registrationClosed: row.registration_closed,
      });
    }
  }
  return latest;
}

export const CONSOLE_KEY_ROUTES = [requestKeyRemoval, confirmKeyRemoval, cancelKeyRemoval, openKeyRegistration] as const;
