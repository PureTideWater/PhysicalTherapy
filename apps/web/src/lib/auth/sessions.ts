import { type ActorScope, type MfaMethod, type ScopeClient, type ScopePool, recordAuditEvent, withActor, withResolvedActor } from '@tp/db/runtime';

import { deviceLabel, newToken, tokenHash } from './tokens';

/**
 * Sessions and devices (docs/product/sessions.md; docs/adr/0016). A session lasts at most 12 hours
 * from sign-in and ends after 30 minutes without a request; the database holds both limits
 * (user_session's check and resolve_session()), and every request resolves the session again, so
 * an ended session is refused on the very next request. Sign-in, sign-out, session ends and device
 * revocations are audit events, each written in the transaction that ends the session (sign-out and
 * revocation by their routes, a limit's end by resolveSession); a sign-in from a
 * new device, for a user who had devices before, is a security event for the weekly review (PRD 5,
 * J16), written by the database's trigger on user_device so no code path can skip it.
 */

export const SESSION_LIMITS = { absoluteHours: 12, idleMinutes: 30 } as const;

/** The cookies: HttpOnly, Secure, SameSite=Lax, path /. */
export const SESSION_COOKIE = 'tp_session';
export const DEVICE_COOKIE = 'tp_device';
export const SIGN_IN_COOKIE = 'tp_sign_in';
/** The email kept for a restart once a sign-in step closes (docs/adr/0081). */
export const KEPT_EMAIL_COOKIE = 'tp_sign_in_email';
/** A browser keeps its device cookie for 400 days (the longest browsers honour). */
export const DEVICE_COOKIE_DAYS = 400;

export interface OpenSessionRequest {
  readonly userId: string;
  readonly method: MfaMethod;
  /** The browser's device cookie, if it has one. */
  readonly deviceToken: string | undefined;
  readonly userAgent: string | null;
  readonly requestId: string;
  /**
   * When the sign-in attempt began (epoch ms of the database's sign_in_step_began(), read before the attempt's first
   * provider call; docs/adr/0093, D3 and D4). The database refuses the session when it is at or before the account's
   * latest recorded password reset, or ahead of its clock. Absent: the row carries no start and is not checked, as the
   * release before wrote it; the sign-in flow always gives one.
   */
  readonly began: number;
  /**
   * A key sign-in's credential: SHA-256 of the credential ID, which the database checks under the account's lock to be
   * a live key of this account (docs/adr/0095). Absent for a password-and-code session.
   */
  readonly keyCredentialSha256?: Buffer;
}

/** The name the database's refusal of a stale session carries (migration 20261112090000; docs/adr/0093, D4). */
export const STALE_SESSION_CONSTRAINT = 'user_session_sign_in_not_before';

/** Whether an error is the database refusing a session whose sign-in began at or before the account's latest reset. */
export function isStaleSessionRefusal(error: unknown): boolean {
  const { code, constraint } = (typeof error === 'object' && error !== null ? error : {}) as { readonly code?: unknown; readonly constraint?: unknown };
  return code === '23514' && constraint === STALE_SESSION_CONSTRAINT;
}

/** The names the database's refusals of a session carry since the key registry (migration 20261116090000; docs/adr/0095). */
export const KEY_NOT_LIVE_CONSTRAINT = 'user_session_hardware_key_live';
export const KEY_REGISTRATION_CLOSED_CONSTRAINT = 'user_session_key_registration_closed';

/** The constraint a check or unique violation names, if the error is one. */
export function refusedConstraint(error: unknown): string | undefined {
  const { code, constraint } = (typeof error === 'object' && error !== null ? error : {}) as { readonly code?: unknown; readonly constraint?: unknown };
  return (code === '23514' || code === '23505') && typeof constraint === 'string' ? constraint : undefined;
}

/**
 * The acting account's own row lock, taken first by the transaction that opens a session and by the one that records a
 * password reset (docs/adr/0093, D2): every transaction then takes the account's row before a device or a session row,
 * so the two cannot deadlock, and a sign-in racing a reset is either ended by it or refused after it.
 */
export async function lockAccountForSignIn<C extends ScopeClient>(scope: ActorScope<C>): Promise<void> {
  await scope.client.query('SELECT sign_in_lock_account()');
}

export interface OpenedSession {
  readonly sessionId: string;
  readonly sessionToken: string;
  readonly deviceId: string;
  /** What the device cookie must hold from now on (a new token when the old one named a revoked device). */
  readonly deviceToken: string;
  readonly newDevice: boolean;
  readonly expiresAt: Date;
}

/** Creates the session (and the device, if new) for a user who just proved their password and second factor. */
export function openSession(pool: ScopePool<ScopeClient>, request: OpenSessionRequest): Promise<OpenedSession> {
  return withActor(pool, request.userId, async (scope) => {
    const client = scope.client;
    // The account's row first, before any device or session row (docs/adr/0093, D2).
    await lockAccountForSignIn(scope);
    const label = deviceLabel(request.userAgent);
    let deviceToken = request.deviceToken ?? newToken();
    const known = await client.query<{ id: string; revoked: boolean }>('SELECT id, revoked_at IS NOT NULL AS revoked FROM user_device WHERE user_id = $1 AND token_sha256 = $2', [
      request.userId,
      tokenHash(deviceToken),
    ]);
    let device = known.rows[0];
    let newDevice = false;
    if (device?.revoked === true) {
      // A revoked device stays revoked: this browser becomes a new device with a new cookie.
      deviceToken = newToken();
      device = undefined;
    }
    if (device === undefined) {
      const before = await client.query<{ had: boolean }>('SELECT EXISTS (SELECT 1 FROM user_device WHERE user_id = $1) AS had', [request.userId]);
      const inserted = await client.query<{ id: string }>('INSERT INTO user_device (user_id, token_sha256, label) VALUES ($1, $2, $3) RETURNING id', [
        request.userId,
        tokenHash(deviceToken),
        label,
      ]);
      device = { id: inserted.rows[0]?.id ?? '', revoked: false };
      newDevice = before.rows[0]?.had === true;
    } else {
      await client.query('UPDATE user_device SET last_seen_at = now(), label = $2 WHERE id = $1', [device.id, label]);
    }
    const sessionToken = newToken();
    const session = await client.query<{ id: string; expires_at: Date }>(
      'INSERT INTO user_session (user_id, device_id, token_sha256, mfa_method, sign_in_began_at, key_credential_sha256) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, expires_at',
      [request.userId, device.id, tokenHash(sessionToken), request.method, new Date(request.began), request.keyCredentialSha256 ?? null],
    );
    const sessionId = session.rows[0]?.id ?? '';
    await client.query('SELECT sign_in_succeeded($1)', [request.userId]);
    // Accepting an invitation (PRD 5, J2): the first sign-in with MFA makes the user active. Only this
    // database function records MFA enrollment, and only for a session this transaction opened.
    await client.query('SELECT record_sign_in_with_mfa()');
    await recordAuditEvent(scope, { action: 'sign_in', objectType: 'user_session', objectId: sessionId, purpose: request.method, requestId: request.requestId });
    // A new device for a user who had devices before is a security event, which the database records
    // itself when the device row is inserted (migration 20261015180000).
    return { sessionId, sessionToken, deviceId: device.id, deviceToken, newDevice, expiresAt: new Date(session.rows[0]?.expires_at ?? 0) };
  });
}

export interface ActiveSession {
  readonly sessionId: string;
  readonly userId: string;
  readonly deviceId: string;
  readonly mfaMethod: MfaMethod;
  readonly startedAt: Date;
  readonly expiresAt: Date;
  readonly userStatus: 'invited' | 'active' | 'disabled';
  readonly mfaEnrolled: boolean;
  /** A hardware key is required: the user's rule, or a current internal membership. */
  readonly hardwareKeyRequired: boolean;
}

export type EndedReason = 'ended' | 'idle' | 'expired' | 'device_revoked' | 'user_disabled';

export type SessionState =
  | { readonly state: 'none' }
  | { readonly state: 'ended'; readonly reason: EndedReason }
  | { readonly state: 'active'; readonly session: ActiveSession };

interface ResolvedRow {
  readonly outcome: 'unknown' | 'active' | EndedReason;
  readonly ended_now: boolean;
  readonly session_id: string | null;
  readonly user_id: string | null;
  readonly device_id: string | null;
  readonly mfa_method: MfaMethod | null;
  readonly started_at: Date | null;
  readonly expires_at: Date | null;
  readonly user_status: 'invited' | 'active' | 'disabled' | null;
  readonly mfa_enrolled: boolean | null;
  readonly hardware_key_required: boolean | null;
}

/**
 * How long the transaction that resolves a session may sit idle between its statements before PostgreSQL ends its
 * connection and releases the session's and the device's rows: the transaction holds them from the database's answer
 * to its commit, so a web task that stalls or loses its network in between would otherwise keep that person's later
 * requests waiting on the rows for as long as the connection lived. A healthy request is idle there for a round trip.
 */
export const SESSION_RESOLVE_IDLE_MS = 10_000;

/**
 * The resolving statement: the session by its token's hash ($1), and, for this transaction only (set_config's
 * is_local), the idle bound above ($2, milliseconds) as idle_in_transaction_session_timeout. The bound rides in the
 * same statement, so it costs no round trip, and it takes effect when the statement ends and the transaction first
 * waits for the client, whichever of the two the server evaluates first. It bounds idleness, not a wait for a lock: a
 * session's paths stay outside the web's lock timeout (docs/adr/0092, the amendment of 2026-11-11).
 */
export const RESOLVE_SESSION = "SELECT r.* FROM set_config('idle_in_transaction_session_timeout', $2, true) AS bound, resolve_session($1) AS r";

/**
 * The session a cookie names, resolved by the database on every request: an active session is
 * touched (its idle clock restarts); one past a limit is ended there and then, and its end is an
 * audit event. The end and its event are one transaction (Queues item 25 (d)): the database ends the
 * session and the event is written in the session's user's name before the one commit, so a session
 * never ends without its event, and no event is kept for an end that was not. A failure of either
 * fails the request with the session as it was; the next request ends it again, with its event. The
 * transaction's idleness is bounded (SESSION_RESOLVE_IDLE_MS). No
 * cookie, or one the database does not know, is no session.
 */
export async function resolveSession(pool: ScopePool<ScopeClient>, sessionToken: string | undefined, requestId: string): Promise<SessionState> {
  if (sessionToken === undefined) {
    return { state: 'none' };
  }
  const row = await withResolvedActor(pool, async (client, actAs) => {
    const resolved = (await client.query<ResolvedRow>(RESOLVE_SESSION, [tokenHash(sessionToken), String(SESSION_RESOLVE_IDLE_MS)])).rows[0];
    if (resolved?.ended_now === true) {
      if (resolved.user_id === null || resolved.session_id === null || resolved.outcome === 'unknown' || resolved.outcome === 'active') {
        // An end the database reports without its session, its user or its reason cannot be recorded: nothing commits.
        throw new Error('the database ended a session without naming it');
      }
      await recordAuditEvent(await actAs(resolved.user_id), { action: 'session_ended', objectType: 'user_session', objectId: resolved.session_id, purpose: resolved.outcome, requestId });
    }
    return resolved;
  });
  if (row === undefined || row.outcome === 'unknown' || row.user_id === null || row.session_id === null) {
    return { state: 'none' };
  }
  if (row.outcome !== 'active') {
    return { state: 'ended', reason: row.outcome };
  }
  return {
    state: 'active',
    session: {
      sessionId: row.session_id,
      userId: row.user_id,
      deviceId: row.device_id ?? '',
      mfaMethod: row.mfa_method ?? 'totp',
      startedAt: new Date(row.started_at ?? 0),
      expiresAt: new Date(row.expires_at ?? 0),
      userStatus: row.user_status ?? 'disabled',
      mfaEnrolled: row.mfa_enrolled === true,
      hardwareKeyRequired: row.hardware_key_required !== false,
    },
  };
}

/** Sign-out: the session ends now (the sign-out route records the audit event). */
export async function endSession<C extends ScopeClient>(scope: ActorScope<C>, sessionId: string): Promise<boolean> {
  const { rowCount } = await scope.client.query("UPDATE user_session SET ended_at = now(), end_reason = 'signed_out' WHERE id = $1 AND ended_at IS NULL", [sessionId]);
  return rowCount === 1;
}

export interface DeviceRow {
  readonly id: string;
  readonly label: string;
  readonly firstSeenAt: Date;
  readonly lastSeenAt: Date;
  readonly revokedAt: Date | null;
  readonly openSessions: number;
}

/** The signed-in user's devices, most recent first (PRD 7, Sign-in and MFA: the device list). */
export async function listDevices<C extends ScopeClient>(scope: ActorScope<C>): Promise<DeviceRow[]> {
  const { rows } = await scope.client.query<{ id: string; label: string; first_seen_at: Date; last_seen_at: Date; revoked_at: Date | null; open_sessions: number }>(
    `SELECT d.id, d.label, d.first_seen_at, d.last_seen_at, d.revoked_at,
            (SELECT count(*)::int FROM user_session s WHERE s.device_id = d.id AND s.ended_at IS NULL AND s.expires_at > now()) AS open_sessions
       FROM user_device d
      ORDER BY d.revoked_at IS NOT NULL, d.last_seen_at DESC, d.id`,
  );
  return rows.map((row) => ({ id: row.id, label: row.label, firstSeenAt: row.first_seen_at, lastSeenAt: row.last_seen_at, revokedAt: row.revoked_at, openSessions: row.open_sessions }));
}

/** Revokes one of the user's devices: it is forgotten and every session on it ends now (the route audits it). */
export async function revokeDevice<C extends ScopeClient>(scope: ActorScope<C>, deviceId: string): Promise<boolean> {
  const revoked = await scope.client.query('UPDATE user_device SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL RETURNING id', [deviceId]);
  if (revoked.rowCount === 0) {
    return false;
  }
  await scope.client.query("UPDATE user_session SET ended_at = now(), end_reason = 'device_revoked' WHERE device_id = $1 AND ended_at IS NULL", [deviceId]);
  return true;
}

/** Ends every open session of a user (they left an organization; an administrator revoked them). */
export async function revokeUserSessions<C extends ScopeClient>(scope: ActorScope<C>, userId: string): Promise<number> {
  const { rows } = await scope.client.query<{ ended: number }>('SELECT revoke_user_sessions($1) AS ended', [userId]);
  return rows[0]?.ended ?? 0;
}
