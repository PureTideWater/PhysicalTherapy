import { randomBytes, randomUUID } from 'node:crypto';

import { type DatabaseClient, type DatabasePool, LocalKeyProvider, databaseClient, openPool, readDatabaseUrl } from '@tp/db';
import { type MigratedDatabase, type TenantWorld, addMembership, createMigratedDatabase, createOrganization, createTenantWorld, createUser, endPool } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DevAuthProvider } from '../auth/dev-provider';
import { MemoryDevStore } from '../auth/dev-store';
import { Sealer } from '../auth/seal';
import { SESSION_COOKIE, openSession } from '../auth/sessions';
import { csrfTokenFor } from '../http/csrf';
import type { CookieJar, Route } from '../http/route';
import { type Services, createServices } from '../server/services';
import { MemoryQueue } from '../uploads/queue';
import { inviteMember, supportPage } from './console';
import { consoleMailPage, pauseMailStream, resumeMailStream } from './console-mail';
import { notificationsPage } from './monitoring';
import { type NoticeDelivery, noticeStatus, practiceHome, supportAccessPage } from './practice';
import { usersSettingsPage } from './settings';

/**
 * What the pages read of the mail path (audit #76; docs/adr/0065, D6 to D10; the founder's Q9 and Q12 of 2026-10-21;
 * test matrix SCR-21 and SEC-19), beyond who may open them (route-tests.db.test.ts covers every route):
 *
 * - the console's mail streams: a platform administrator pauses the screening stream alone and resumes it with a
 *   reason, each audited by the route and recorded by the database; a resumed stream reads unconfirmed until the
 *   platform's reconcile confirms SES is sending;
 * - a support-access notice's delivery, counted from its recipients' rows, on the practice's pages and the console's;
 * - the in-app notification of a notice that did not reach every administrator, linked to its grant;
 * - an invitation whose latest email was reported undelivered, and not one whose earlier email was.
 *
 * The notices' rows are written as the platform's outbox leaves them (apps/worker's support_notices job, whose own tests
 * drive the functions); no address is read or shown. SYNTHETIC data only.
 */

let database: MigratedDatabase;
let owner: DatabaseClient;
let app: DatabasePool;
let services: Services;

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = databaseClient(database.url);
  await owner.connect();
  app = openPool(database.appUrl, 4);
  const sealer = new Sealer(randomBytes(32));
  const provider = new DevAuthProvider({
    store: new MemoryDevStore(),
    sealer: sealer.derive('dev-provider'),
    webauthn: { rpId: 'localhost', rpName: 'Test', origin: 'http://localhost:3100' },
    deliverInvitation: () => Promise.resolve(),
    scryptCost: { n: 1024, r: 8, p: 1 },
  });
  services = createServices({ origin: 'http://localhost:3100', pool: app, provider, keys: LocalKeyProvider.random(), sealer, logger: createLogger({ sink: () => undefined }), queue: new MemoryQueue() });
}, 120_000);

afterAll(async () => {
  await endPool(app);
  await owner.end();
  await database.drop();
});

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

async function sessionFor(userId: string, method: 'totp' | 'webauthn'): Promise<string> {
  return (await openSession(app, { userId, method, deviceToken: undefined, userAgent: null, requestId: 'test' })).sessionToken;
}

function run<R>(route: Route<R>, token: string, input?: Record<string, unknown>, params: Record<string, unknown> = {}) {
  return route.invoke({ cookies: new Jar(token), params, input: route.mutation ? { csrfToken: csrfTokenFor(services.sealer, token), requestKey: randomUUID(), ...input } : input, requestId: `test-${randomUUID()}`, userAgent: null }, services);
}

function ok<R>(outcome: Awaited<ReturnType<Route<R>['invoke']>>): R {
  if (outcome.status !== 'ok') {
    throw new Error(`expected ok, got ${outcome.status}`);
  }
  return outcome.data;
}

let admin: { readonly id: string; readonly token: string; readonly internalId: string };
let world: TenantWorld;

beforeAll(async () => {
  const internalId = await createOrganization(owner, 'internal');
  const id = await createUser(owner, { hardwareKeyRequired: true });
  await addMembership(owner, internalId, id, 'platform_admin');
  admin = { id, token: await sessionFor(id, 'webauthn'), internalId };
  world = await createTenantWorld(owner, 'mail');
});

async function auditActions(actions: readonly string[]): Promise<{ action: string; purpose: string | null }[]> {
  return (await owner.query<{ action: string; purpose: string | null }>('SELECT action, purpose FROM audit_event WHERE action = ANY ($1::text[]) ORDER BY at, id', [actions])).rows;
}

describe('the console’s mail streams (SCR-21)', () => {
  it('shows the three streams sending, to a platform administrator alone', async () => {
    const page = ok(await run(consoleMailPage, admin.token));
    expect(page.streams.map((stream) => [stream.stream, stream.sending, stream.pausedAt])).toEqual([
      ['transactional', true, null],
      ['notices', true, null],
      ['screening', true, null],
    ]);
    expect(page.resumeReasons.map((reason) => reason.value)).toEqual(['cause_fixed', 'false_alarm']);
    const practiceAdmin = await sessionFor(world.adminUserId, 'totp');
    expect((await run(consoleMailPage, practiceAdmin)).status).not.toBe('ok');
    expect((await run(pauseMailStream, practiceAdmin, { stream: 'screening' })).status).not.toBe('ok');
    expect((await owner.query<{ paused: boolean }>("SELECT paused_at IS NOT NULL AS paused FROM mail_stream WHERE stream = 'screening'")).rows).toEqual([{ paused: false }]);
  });

  it('pauses the screening stream alone, by hand, and refuses any other stream before the database is asked', async () => {
    expect(await run(pauseMailStream, admin.token, { stream: 'transactional' })).toMatchObject({ status: 'invalid', issues: [{ field: 'stream' }] });
    expect(await run(pauseMailStream, admin.token, { stream: 'screening' })).toMatchObject({ status: 'ok', data: { redirect: '/console/mail?notice=paused' } });
    expect(await run(pauseMailStream, admin.token, { stream: 'screening' })).toMatchObject({ status: 'ok', data: { redirect: '/console/mail?notice=unchanged' } });
    const page = ok(await run(consoleMailPage, admin.token, undefined, { notice: 'paused' }));
    expect(page.notice).toBe('paused');
    const screening = page.streams.find((stream) => stream.stream === 'screening');
    expect(screening).toMatchObject({ pausedReason: 'operator', sending: false, ready: false, confirmedAt: null });
    expect(screening?.pausedAt).toBeInstanceOf(Date);
    expect(page.streams.filter((stream) => stream.stream !== 'screening').every((stream) => stream.sending && stream.pausedAt === null)).toBe(true);
    // The route's audit of each request, and the database's of the one pause (which the application role cannot write;
    // the two share a transaction's time, so they are compared as a set).
    expect((await auditActions(['mail_stream_pause_requested', 'mail_stream_paused'])).map((row) => `${row.action}:${row.purpose ?? ''}`).sort()).toEqual([
      'mail_stream_pause_requested:',
      'mail_stream_pause_requested:',
      'mail_stream_paused:operator',
    ]);
    const { rows } = await owner.query<{ by: string | null }>("SELECT paused_by::text AS by FROM mail_stream WHERE stream = 'screening'");
    expect(rows).toEqual([{ by: admin.id }]);
  });

  it('resumes it only with a reason, and it reads unconfirmed until the platform reads SES sending', async () => {
    expect(await run(resumeMailStream, admin.token, { stream: 'screening' })).toMatchObject({ status: 'invalid', issues: [{ field: 'reason' }] });
    expect(await run(resumeMailStream, admin.token, { stream: 'screening', reason: 'because' })).toMatchObject({ status: 'invalid', issues: [{ field: 'reason' }] });
    expect(await run(resumeMailStream, admin.token, { stream: 'screening', reason: 'false_alarm' })).toMatchObject({ status: 'ok', data: { redirect: '/console/mail?notice=resumed' } });
    expect(await run(resumeMailStream, admin.token, { stream: 'screening', reason: 'false_alarm' })).toMatchObject({ status: 'ok', data: { redirect: '/console/mail?notice=unchanged' } });
    let screening = ok(await run(consoleMailPage, admin.token)).streams.find((stream) => stream.stream === 'screening');
    expect(screening).toMatchObject({ pausedAt: null, pausedReason: null, confirmedAt: null, sending: false, ready: false });
    expect(screening?.resumedAt).toBeInstanceOf(Date);
    expect((await auditActions(['mail_stream_resumed'])).map((row) => row.purpose)).toEqual(['false_alarm']);
    // The platform's reconcile reads the set enabled and confirms it (operator_mail_stream_confirmed, as tp_operator).
    await owner.query("SELECT operator_mail_stream_confirmed('screening', true)");
    screening = ok(await run(consoleMailPage, admin.token)).streams.find((stream) => stream.stream === 'screening');
    expect(screening).toMatchObject({ sending: true, ready: false });
    expect(screening?.confirmedAt).toBeInstanceOf(Date);
  });
});

/** A support grant on the world's practice, as the console opens it (the owner's connection, as the tests seed). */
async function grantOn(practiceId: string): Promise<string> {
  const engineer = await createUser(owner, { hardwareKeyRequired: true });
  await addMembership(owner, admin.internalId, engineer, 'support');
  const { rows } = await owner.query<{ id: string }>(
    "INSERT INTO support_grant (practice_id, user_id, ticket, reason, expires_at) VALUES ($1, $2, $3, 'SYNTHETIC MAIL ROUTES', now() + interval '4 hours') RETURNING id",
    [practiceId, engineer, `SYN-${randomUUID().slice(0, 6)}`],
  );
  return rows[0]?.id ?? '';
}

/** A notice as the platform's outbox leaves it: one row an administrator, each in the given state. */
async function noticeWith(grantId: string, practiceId: string, recipients: readonly { readonly userId: string; readonly state: 'pending' | 'sent' | 'delivered' | 'bounced' | 'suppressed' }[]): Promise<string> {
  const notice = (
    await owner.query<{ id: string }>("INSERT INTO support_grant_notice (support_grant_id, practice_id, notice, recipients) VALUES ($1, $2, 'support_grant_opened', $3) RETURNING id", [
      grantId,
      practiceId,
      recipients.length,
    ])
  ).rows[0]?.id;
  for (const recipient of recipients) {
    const sent = recipient.state !== 'pending';
    await owner.query(
      `INSERT INTO support_grant_notice_recipient (notice_id, practice_id, user_id, ses_message_id, state, sent_at)
       VALUES ($1, $2, $3, $4, $5, CASE WHEN $6 THEN now() END)`,
      [notice, practiceId, recipient.userId, sent ? `syn-notice-${randomUUID()}` : null, recipient.state, sent],
    );
  }
  return notice ?? '';
}

describe('a support-access notice’s delivery (SEC-19)', () => {
  it('reads not delivered to 1 of 2 administrators on the practice’s pages and the console’s, with the notification linked to the grant', async () => {
    const second = await createUser(owner);
    await addMembership(owner, world.organizationId, second, 'practice_admin');
    const grantId = await grantOn(world.practiceId);
    const noticeId = await noticeWith(grantId, world.practiceId, [
      { userId: world.adminUserId, state: 'delivered' },
      { userId: second, state: 'suppressed' },
    ]);
    // The first undelivered recipient reports the notice once: notice_undelivered, and each administrator notified.
    await owner.query('SELECT support_notice_report_undelivered($1, $2)', [noticeId, 'test-mail-routes']);

    const token = await sessionFor(world.adminUserId, 'totp');
    const access = ok(await run(supportAccessPage, token, undefined, { practiceId: world.practiceId, supportGrantId: grantId }));
    expect(access.grant.notices.opening).toMatchObject({ recipients: 2, delivered: 1, undelivered: 1, pending: 0 });
    expect(access.grant.notices.closing).toEqual({ recipients: null, delivered: 0, undelivered: 0, pending: 0, sentAt: null });
    expect(noticeStatus(access.grant.notices.opening, 'opening', true, () => 'at noon')).toBe('Not delivered to 1 of 2 administrators. PaidWhole has been told.');
    expect(noticeStatus(access.grant.notices.closing, 'closing', true, () => 'at noon')).toBe('Sent when access ends');
    const home = ok(await run(practiceHome, token, undefined, { practiceId: world.practiceId }));
    expect(home.supportGrants?.find((grant) => grant.id === grantId)?.notices.opening).toMatchObject({ recipients: 2, undelivered: 1 });
    const consoleGrant = ok(await run(supportPage, admin.token)).grants.find((grant) => grant.id === grantId);
    expect(consoleGrant?.notices.opening).toMatchObject({ recipients: 2, delivered: 1, undelivered: 1, pending: 0 });

    // Each administrator's notification names the grant and which notice, with no figure.
    for (const userId of [world.adminUserId, second]) {
      const notifications = ok(await run(notificationsPage, await sessionFor(userId, 'totp'), undefined, { practiceId: world.practiceId })).notifications;
      expect(notifications.filter((item) => item.kind === 'support_notice_undelivered')).toEqual([
        expect.objectContaining({ supportGrantId: grantId, notice: 'support_grant_opened', subjectId: noticeId, counts: {}, totals: {} }),
      ]);
    }
    expect(await owner.query<{ action: string; purpose: string }>("SELECT action, purpose FROM audit_event WHERE object_id = $1 AND action = 'notice_undelivered'", [grantId]).then((r) => r.rows)).toEqual([
      { action: 'notice_undelivered', purpose: 'support_grant_opened' },
    ]);

    // Another practice's administrator reads none of it.
    const other = await createTenantWorld(owner, 'mail-other');
    const otherToken = await sessionFor(other.adminUserId, 'totp');
    expect(await run(supportAccessPage, otherToken, undefined, { practiceId: world.practiceId, supportGrantId: grantId })).toEqual({ status: 'not_found' });
    expect(ok(await run(notificationsPage, otherToken, undefined, { practiceId: other.practiceId })).notifications).toEqual([]);
  });

  it('says what each state means, never more than SES said', () => {
    const notice = (fields: Partial<NoticeDelivery>): NoticeDelivery => ({ recipients: 1, delivered: 0, undelivered: 0, pending: 0, sentAt: null, ...fields });
    const time = () => 'at noon';
    expect(noticeStatus(notice({ recipients: null }), 'opening', true, time)).toBe('Sending');
    expect(noticeStatus(notice({ recipients: null }), 'closing', false, time)).toBe('Sending');
    expect(noticeStatus(notice({ recipients: 0 }), 'opening', true, time)).toBe('Not sent: the practice had no administrator');
    expect(noticeStatus(notice({ undelivered: 1 }), 'opening', true, time)).toBe('Not delivered to 1 of 1 administrator. PaidWhole has been told.');
    expect(noticeStatus(notice({ recipients: 3, delivered: 3 }), 'closing', false, time)).toBe('Delivered to 3 of 3 administrators');
    expect(noticeStatus(notice({ recipients: 3, delivered: 2, pending: 1, sentAt: new Date() }), 'opening', true, time)).toBe('Sent at noon; delivery not yet confirmed');
    expect(noticeStatus(notice({ pending: 1 }), 'opening', true, time)).toBe('Sending');
  });
});

describe('an invitation whose email was not delivered (SEC-19)', () => {
  it('reads undelivered only while the report is about the email last sent, and not once accepted', async () => {
    const email = `mail-invitee-${randomUUID().slice(0, 8)}@synthetic.test`;
    expect((await run(inviteMember, admin.token, { organizationId: world.organizationId, email, role: 'viewer' })).status).toBe('ok');
    const invitationId = (await owner.query<{ id: string }>('SELECT i.id FROM invitation i JOIN "user" u ON u.id = i.user_id WHERE u.email = $1', [email])).rows[0]?.id ?? '';
    const token = await sessionFor(world.adminUserId, 'totp');
    const view = async () => ok(await run(usersSettingsPage, token, undefined, { organizationId: world.organizationId })).invitations.find((item) => item.id === invitationId);
    expect((await view())?.undeliveredAt).toBeNull();

    // The email last sent bounced (its own send time, within SES's clock skew of sent_at).
    await owner.query("UPDATE invitation SET undelivered_at = sent_at - interval '2 seconds', undelivered_reason = 'bounced' WHERE id = $1", [invitationId]);
    expect((await view())?.undeliveredAt).toBeInstanceOf(Date);
    // A late report of an email a resend replaced flags nothing.
    await owner.query("UPDATE invitation SET undelivered_at = sent_at - interval '10 minutes' WHERE id = $1", [invitationId]);
    expect((await view())?.undeliveredAt).toBeNull();
    // Nor once the invitation is accepted.
    await owner.query("UPDATE invitation SET undelivered_at = sent_at, accepted_at = now() WHERE id = $1", [invitationId]);
    expect((await view())?.undeliveredAt).toBeNull();
  });
});
