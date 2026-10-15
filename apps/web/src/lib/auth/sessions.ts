import { type ActorScope, type MfaMethod, type ScopeClient, type ScopePool, recordAuditEvent, withActor } from '@tp/db/runtime';

import { deviceLabel, newToken, tokenHash } from './tokens';

/**
 * Sessions and devices (docs/product/sessions.md; docs/adr/0016). A session lasts at most 12 hours
 * from sign-in and ends after 30 minutes without a request; the database holds both limits
 * (user_session's check and resolve_session()), and every request resolves the session again, so
 * an ended session is refused on the very next request. Sign-in, sign-out, session ends and device
 * revocations are audit events (sign-out and revocation recorded by their routes); a sign-in from a
 * new device, for a user who had devices before, is a security event for the weekly review (PRD 5,
 * J16).
 */

export const SESSION_LIMITS = { absoluteHours: 12, idleMinutes: 30 } as const;

/** The cookies: HttpOnly, Secure, SameSite=Lax, path /. */
export const SESSION_COOKIE = 'tp_session';
export const DEVICE_COOKIE = 'tp_device';
export const SIGN_IN_COOKIE = 'tp_sign_in';
/** A browser keeps its device cookie for 400 days (the longest browsers honour). */
export const DEVICE_COOKIE_DAYS = 400;

export interface OpenSessionRequest {
  readonly userId: string;
  readonly method: MfaMethod;
  /** The browser's device cookie, if it has one. */
  readonly deviceToken: string | undefined;
  readonly userAgent: string | null;
  readonly requestId: string;
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
      'INSERT INTO user_session (user_id, device_id, token_sha256, mfa_method) VALUES ($1, $2, $3, $4) RETURNING id, expires_at',
      [request.userId, device.id, tokenHash(sessionToken), request.method],
    );
    const sessionId = session.rows[0]?.id ?? '';
    await client.query('SELECT sign_in_succeeded($1)', [request.userId]);
    // Accepting an invitation (PRD 5, J2): the first sign-in with MFA makes the user active.
    await client.query(`UPDATE "user" SET status = 'active', mfa_enrolled = true WHERE id = $1 AND (status = 'invited' OR NOT mfa_enrolled)`, [request.userId]);
    await recordAuditEvent(scope, { action: 'sign_in', objectType: 'user_session', objectId: sessionId, purpose: request.method, requestId: request.requestId });
    if (newDevice) {
      await recordAuditEvent(scope, { action: 'security_event', objectType: 'user_device', objectId: device.id, purpose: 'new_device_sign_in', requestId: request.requestId });
    }
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
 * The session a cookie names, resolved by the database on every request: an active session is
 * touched (its idle clock restarts); one past a limit is ended there and then, and its end is an
 * audit event. No cookie, or one the database does not know, is no session.
 */
export async function resolveSession(pool: ScopePool<ScopeClient>, sessionToken: string | undefined, requestId: string): Promise<SessionState> {
  if (sessionToken === undefined) {
    return { state: 'none' };
  }
  const client = await pool.connect();
  let row: ResolvedRow | undefined;
  try {
    row = (await client.query<ResolvedRow>('SELECT * FROM resolve_session($1)', [tokenHash(sessionToken)])).rows[0];
  } finally {
    client.release();
  }
  if (row === undefined || row.outcome === 'unknown' || row.user_id === null || row.session_id === null) {
    return { state: 'none' };
  }
  if (row.outcome !== 'active') {
    if (row.ended_now) {
      const sessionId = row.session_id;
      const reason = row.outcome;
      await withActor(pool, row.user_id, (scope) => recordAuditEvent(scope, { action: 'session_ended', objectType: 'user_session', objectId: sessionId, purpose: reason, requestId }));
    }
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
