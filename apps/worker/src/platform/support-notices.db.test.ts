import { randomUUID } from 'node:crypto';

import { type DatabaseClient, type DatabasePool, databaseClient, openPool, readDatabaseUrl } from '@tp/db';
import {
  type MigratedDatabase,
  type TenantWorld,
  addMembership,
  asOwner,
  createMigratedDatabase,
  createOrganization,
  createPracticeWithLocation,
  createTenantWorld,
  createUser,
  endPool,
} from '@tp/db/testing';
import { type Logger, createLogger } from '@tp/observability';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPlatformHandlers } from '../jobs/platform';
import { type MailSender, MemoryMailSender } from '../mail/mail';
import { noticeLink, sendSupportGrantNotices } from './support-notices';

/**
 * The support-grant notices (PRD 5, J15) against a real database: the practice's administrators are
 * told when a grant opens and when it ends, with the number of records read and a link to the list;
 * each notice once, even when two runs race; a practice with nobody to tell is recorded. From a recorded
 * outbox (audit #76, D10; SEC-19): one message per administrator, a retry only to those still pending,
 * and a notice with no administrator records notice_undelivered, never notice_sent.
 */

const ORIGIN = 'http://localhost:3000';
let database: MigratedDatabase;
let owner: DatabaseClient;
let operator: DatabasePool;
let app: DatabasePool;
let world: TenantWorld;
let engineer: string;
let platformAdmin: string;

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = databaseClient(database.url);
  await owner.connect();
  operator = openPool(database.url, 3);
  app = openPool(database.appUrl, 2);
  world = await createTenantWorld(owner, 'notices');
  const internal = await createOrganization(owner, 'internal');
  engineer = await createUser(owner, { hardwareKeyRequired: true });
  await addMembership(owner, internal, engineer, 'support');
  platformAdmin = await createUser(owner, { hardwareKeyRequired: true });
  await addMembership(owner, internal, platformAdmin, 'platform_admin');
});

afterAll(async () => {
  await endPool(app);
  await endPool(operator);
  await owner.end();
  await database.drop();
});

async function supportGrant(practiceId: string, startedHoursAgo: number): Promise<string> {
  const id = randomUUID();
  await asOwner(owner, [practiceId], () =>
    owner.query(
      `INSERT INTO support_grant (id, practice_id, user_id, ticket, reason, created_at, expires_at)
       VALUES ($1, $2, $3, 'SYN-9', 'SYNTHETIC', now() - make_interval(hours => $4), now() - make_interval(hours => $4) + interval '4 hours')`,
      [id, practiceId, engineer, startedHoursAgo],
    ),
  );
  return id;
}

async function read(practiceId: string, grantId: string): Promise<void> {
  await asOwner(owner, [practiceId], () =>
    owner.query("INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, practice_id, grant_id, purpose) VALUES ($1, 'user', 'read', 'practice', $2, $2, $3, 'support')", [
      engineer,
      practiceId,
      grantId,
    ]),
  );
}

/**
 * A practice with nobody to tell. The database keeps an administrator for every practice from its
 * creation (migration 20261015180000), so this state is built past that rule, as the superuser, to
 * test the job's defence for it.
 */
async function practiceWithoutAdministrator(): Promise<string> {
  const organizationId = await createOrganization(owner, 'group', 'no administrator');
  const practiceId = randomUUID();
  await owner.query('BEGIN');
  try {
    await owner.query('ALTER TABLE practice DISABLE TRIGGER practice_has_administrator');
    // With its pricing location, which every practice is created with (practice_has_site, audit #33), checked now so no
    // deferred event is pending when the trigger is enabled again.
    await createPracticeWithLocation(owner, { id: practiceId, organizationId, name: 'SYNTHETIC PRACTICE WITHOUT ADMINISTRATOR' });
    await owner.query('SET CONSTRAINTS practice_has_site IMMEDIATE');
    await owner.query('ALTER TABLE practice ENABLE TRIGGER practice_has_administrator');
    await owner.query('COMMIT');
  } catch (error) {
    await owner.query('ROLLBACK');
    throw error;
  }
  return practiceId;
}

/** Runs `sql` as the application role for `actorId`, with `practiceIds` in scope; rolled back. */
async function asApp(actorId: string, practiceIds: readonly string[], sql: string, values: unknown[] = []): Promise<unknown> {
  const client = await app.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.actor_id', $1, true), set_config('app.practice_ids', $2, true)", [actorId, `{${practiceIds.join(',')}}`]);
    return await client.query(sql, values);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

async function run(mail: MailSender, logger?: Logger) {
  const client = await operator.connect();
  try {
    return await sendSupportGrantNotices({ client, mail, origin: ORIGIN, requestId: `job-${randomUUID()}`, ...(logger === undefined ? {} : { logger }) });
  } finally {
    client.release();
  }
}

/** A run's counts with nothing sent, failed or undelivered: only what the test names. */
const none = { opened: 0, closed: 0, undeliverable: 0, sent: 0, failed: 0, undelivered: 0 };

/** The messages of one grant's notices, by subject, each to whom (the recipient's user ID tag). */
function messagesOf(mail: MemoryMailSender, grant: string): { subject: string; to: readonly string[]; user: string | undefined }[] {
  return mail.sent
    .filter((message) => message.links[0]?.endsWith(grant) === true)
    .map((message) => ({ subject: message.subject, to: message.to, user: message.identity.recipientUserId }));
}

async function notices(grantId: string): Promise<string[]> {
  const { rows } = await owner.query<{ purpose: string }>("SELECT purpose FROM audit_event WHERE action = 'notice_sent' AND object_id = $1 ORDER BY at, purpose", [grantId]);
  return rows.map((row) => row.purpose);
}

describe('support-grant notices', () => {
  it('tells the practice administrators when a grant opens, once, with a link and no PHI', async () => {
    const invited = await createUser(owner, { status: 'invited', mfaEnrolled: false });
    await addMembership(owner, world.organizationId, invited, 'practice_admin');
    const disabledAdmin = await createUser(owner);
    await addMembership(owner, world.organizationId, disabledAdmin, 'practice_admin');
    await asOwner(owner, [], () => owner.query("UPDATE \"user\" SET status = 'disabled' WHERE id = $1", [disabledAdmin]));
    const grant = await supportGrant(world.practiceId, 0);
    const mail = new MemoryMailSender();
    expect(await run(mail)).toEqual({ ...none, opened: 1, sent: 2 });
    // One message per administrator, never one naming two (SEC-19), each on the notices stream with its identity as tags.
    expect(mail.sent).toHaveLength(2);
    expect(mail.sent.map((message) => message.to).sort()).toEqual([[`${invited}@synthetic.test`], [`${world.adminUserId}@synthetic.test`]].sort());
    const { rows: noticeRows } = await owner.query<{ id: string }>("SELECT id FROM support_grant_notice WHERE support_grant_id = $1 AND notice = 'support_grant_opened'", [grant]);
    for (const message of mail.sent) {
      expect(message.to).toHaveLength(1);
      expect(message.identity).toEqual({ stream: 'notices', kind: 'support_grant_opened', subjectId: noticeRows[0]?.id, practiceId: world.practiceId, recipientUserId: message.to[0]?.split('@')[0] });
      expect(message.subject).toBe('Support access opened for your practice');
      expect(message.links).toEqual([noticeLink(ORIGIN, world.practiceId, grant)]);
      expect(message.body).not.toMatch(/SYN-9|SYNTHETIC/);
    }
    // Each recipient keeps the message ID SES gave, and notice_sent is written once, at the first accepted send.
    const recipients = await owner.query<{ user_id: string; state: string; ses_message_id: string }>('SELECT user_id, state, ses_message_id FROM support_grant_notice_recipient WHERE notice_id = $1 ORDER BY user_id', [noticeRows[0]?.id]);
    expect(recipients.rows.map((row) => [row.state, row.ses_message_id]).sort()).toEqual(mail.sent.map((message) => ['sent', message.messageId]).sort());
    expect(await notices(grant)).toEqual(['support_grant_opened']);
    expect(await run(new MemoryMailSender())).toEqual(none);
    expect((await owner.query('SELECT notified_at FROM support_grant WHERE id = $1', [grant])).rows).toEqual([{ notified_at: null }]);
  });

  it('tells them when it ends, with how many records were read, and marks the grant notified', async () => {
    const grant = await supportGrant(world.practiceId, 5);
    await read(world.practiceId, grant);
    await read(world.practiceId, grant);
    const mail = new MemoryMailSender();
    const result = await run(mail);
    expect(result).toMatchObject({ opened: 1, closed: 1, undeliverable: 0, failed: 0, undelivered: 0 });
    const closed = messagesOf(mail, grant).filter((message) => message.subject === 'Support access to your practice has ended');
    expect(closed.length).toBeGreaterThan(0);
    for (const message of mail.sent.filter((sent) => sent.subject === 'Support access to your practice has ended' && sent.links[0]?.endsWith(grant) === true)) {
      expect(message.lines).toContain('Records read under it: 2.');
      expect(message.links).toEqual([`${ORIGIN}/p/${world.practiceId}/support-access/${grant}`]);
      expect(message.identity.kind).toBe('support_grant_closed');
    }
    // Each administrator gets each notice once.
    expect(new Set(closed.map((message) => message.user)).size).toBe(closed.length);
    expect(await notices(grant)).toEqual(['support_grant_opened', 'support_grant_closed']);
    const { rows } = await owner.query<{ notified: boolean }>('SELECT notified_at IS NOT NULL AS notified FROM support_grant WHERE id = $1', [grant]);
    expect(rows).toEqual([{ notified: true }]);
    expect(await run(new MemoryMailSender())).toEqual(none);
  });

  it('sends each notice once when two runs race', async () => {
    const grant = await supportGrant(world.practiceId, 5);
    const mail = new MemoryMailSender();
    await Promise.all([run(mail), run(mail), run(mail)]);
    const sent = messagesOf(mail, grant);
    // Every administrator, each notice once: no (notice, administrator) pair twice however the runs race.
    const pairs = sent.map((message) => `${message.subject}|${message.user ?? ''}`);
    expect(new Set(pairs).size).toBe(pairs.length);
    expect([...new Set(sent.map((message) => message.subject))].sort()).toEqual(['Support access opened for your practice', 'Support access to your practice has ended']);
    const { rows } = await owner.query<{ n: number }>(
      'SELECT count(*)::integer AS n FROM support_grant_notice_recipient r JOIN support_grant_notice n ON n.id = r.notice_id WHERE n.support_grant_id = $1',
      [grant],
    );
    expect(sent).toHaveLength(rows[0]?.n ?? -1);
    expect(await notices(grant)).toHaveLength(2);
  });

  it('records a notice for a practice with nobody to tell as undelivered, never as sent, and does not retry it forever', async () => {
    const grant = await supportGrant(await practiceWithoutAdministrator(), 0);
    const mail = new MemoryMailSender();
    expect(await run(mail)).toMatchObject({ undeliverable: 1 });
    expect(mail.sent).toEqual([]);
    expect(await run(mail)).toMatchObject({ undeliverable: 0 });
    // No notice_sent: one notice_undelivered, and a notice row with no recipient that the due list no longer returns.
    expect(await notices(grant)).toEqual([]);
    const undelivered = await owner.query<{ purpose: string }>("SELECT purpose FROM audit_event WHERE action = 'notice_undelivered' AND object_id = $1", [grant]);
    expect(undelivered.rows).toEqual([{ purpose: 'support_grant_opened' }]);
    expect((await owner.query('SELECT recipients FROM support_grant_notice WHERE support_grant_id = $1', [grant])).rows).toEqual([{ recipients: 0 }]);
  });

  it('retries only the administrator whose send threw, and fails one at once on a permanent refusal, reporting the notice once', async () => {
    const practice = await createTenantWorld(owner, 'notices retry');
    const second = await createUser(owner);
    await addMembership(owner, practice.organizationId, second, 'practice_admin');
    const third = await createUser(owner);
    await addMembership(owner, practice.organizationId, third, 'practice_admin');
    const grant = await supportGrant(practice.practiceId, 0);
    const memory = new MemoryMailSender();
    const refusals = new Map<string, string>([
      [second, 'TooManyRequestsException'],
      [third, 'MessageRejected'],
    ]);
    // The second administrator's send is throttled once; the third's is refused for good.
    const flaky: MailSender = {
      send: (message) => {
        const refusal = refusals.get(message.identity.recipientUserId ?? '');
        if (refusal !== undefined) {
          if (refusal === 'TooManyRequestsException') {
            refusals.delete(second);
          }
          return Promise.reject(Object.assign(new Error(`SYNTHETIC refused ${message.to[0] ?? ''}`), { name: refusal }));
        }
        return memory.send(message);
      },
    };
    const lines: Record<string, unknown>[] = [];
    const logger = createLogger({ sink: (line) => lines.push(JSON.parse(line) as Record<string, unknown>) });
    expect(await run(flaky, logger)).toMatchObject({ opened: 1, sent: 1, failed: 2, undelivered: 1 });
    const state = async () =>
      (
        await owner.query<{ user_id: string; state: string; attempts: number; failure_code: string | null }>(
          'SELECT r.user_id, r.state, r.attempts, r.failure_code FROM support_grant_notice_recipient r JOIN support_grant_notice n ON n.id = r.notice_id WHERE n.support_grant_id = $1',
          [grant],
        )
      ).rows.sort((a, b) => a.user_id.localeCompare(b.user_id));
    expect(await state()).toEqual(
      [
        { user_id: practice.adminUserId, state: 'sent', attempts: 0, failure_code: null },
        { user_id: second, state: 'pending', attempts: 1, failure_code: null },
        { user_id: third, state: 'failed', attempts: 1, failure_code: 'MessageRejected' },
      ].sort((a, b) => a.user_id.localeCompare(b.user_id)),
    );
    // The permanent refusal reported the notice: notice_undelivered once, NOTICE_UNDELIVERED with the grant's ID, and
    // an in-app notification to each administrator.
    expect(lines).toEqual([expect.objectContaining({ level: 'error', support_grant_id: grant, error_code: 'NOTICE_UNDELIVERED' })]);
    expect(JSON.stringify(lines)).not.toMatch(/@|SYNTHETIC/);
    expect((await owner.query("SELECT count(*)::integer AS n FROM audit_event WHERE action = 'notice_undelivered' AND object_id = $1", [grant])).rows).toEqual([{ n: 1 }]);
    expect((await owner.query("SELECT count(*)::integer AS n FROM notification WHERE kind = 'support_notice_undelivered' AND practice_id = $1", [practice.practiceId])).rows).toEqual([{ n: 3 }]);
    // Not due yet: the next run sends nothing. Once the retry comes due, only the pending administrator is sent it.
    expect(await run(flaky)).toMatchObject({ sent: 0, failed: 0 });
    await owner.query('UPDATE support_grant_notice_recipient SET next_attempt_at = now() WHERE user_id = $1', [second]);
    expect(await run(flaky)).toMatchObject({ sent: 1, failed: 0, undelivered: 0 });
    expect(messagesOf(memory, grant).map((message) => message.user).sort()).toEqual([practice.adminUserId, second].sort());
    expect((await state()).map((row) => row.state).sort()).toEqual(['failed', 'sent', 'sent']);
  });

  it('cannot be suppressed by the application role: no one marks a grant notified or forges a notice (SEC-05)', async () => {
    const grant = await supportGrant(world.practiceId, 5);
    const firm = await createOrganization(owner, 'firm', 'notices firm');
    const analyst = await createUser(owner);
    await addMembership(owner, firm, analyst, 'firm_analyst');
    for (const actor of [engineer, analyst, platformAdmin, world.adminUserId]) {
      await expect(asApp(actor, [world.practiceId], 'UPDATE support_grant SET notified_at = now() WHERE id = $1', [grant])).rejects.toMatchObject({ code: '42501' });
      for (const kind of ['user', 'system']) {
        await expect(
          asApp(
            actor,
            [world.practiceId],
            "INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, practice_id, grant_id, purpose) VALUES ($1, $2, 'notice_sent', 'support_grant', $3, $4, $3, 'support_grant_opened')",
            [actor, kind, grant, world.practiceId],
          ),
        ).rejects.toMatchObject({ code: '42501' });
      }
      await expect(
        asApp(actor, [], "INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, purpose) VALUES ($1, 'system', 'security_event', 'user', $1, 'synthetic')", [actor]),
      ).rejects.toMatchObject({ code: '42501' });
    }
    // A notice_sent event the system did not write does not count: the job still sends both notices.
    await asOwner(owner, [world.practiceId], () =>
      owner.query(
        "INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, practice_id, grant_id, purpose) VALUES ($1, 'user', 'notice_sent', 'support_grant', $2, $3, $2, 'support_grant_opened')",
        [engineer, grant, world.practiceId],
      ),
    );
    const mail = new MemoryMailSender();
    await run(mail);
    // Both notices go, one message to each administrator.
    expect([...new Set(messagesOf(mail, grant).map((message) => message.subject))].sort()).toEqual(['Support access opened for your practice', 'Support access to your practice has ended']);
    const pairs = messagesOf(mail, grant).map((message) => `${message.subject}|${message.user ?? ''}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it('handles each notice in a transaction scoped to exactly its practice, as an operator role that reads nothing else', async () => {
    const grant = await supportGrant(world.practiceId, 0);
    const client = await operator.connect();
    try {
      for (const scope of ['{}', `{${world.practiceId},${randomUUID()}}`]) {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE tp_operator');
        await client.query("SELECT set_config('app.practice_ids', $1, true)", [scope]);
        await expect(client.query("SELECT * FROM operator_open_support_notice($1, 'support_grant_opened', 'job')", [grant])).rejects.toMatchObject({ code: '42501' });
        await client.query('ROLLBACK');
      }
      for (const table of ['practice', 'support_grant', 'user', 'membership', 'grant', 'agreement']) {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE tp_operator');
        await client.query("SELECT set_config('app.practice_ids', $1, true)", [`{${world.practiceId}}`]);
        await expect(client.query(`SELECT 1 FROM "${table}" LIMIT 1`)).rejects.toMatchObject({ code: '42501' });
        await client.query('ROLLBACK');
      }
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE tp_operator');
      await client.query("SELECT set_config('app.practice_ids', '{}', true)");
      await expect(client.query('UPDATE audit_event SET purpose = purpose')).rejects.toMatchObject({ code: '42501' });
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    await run(new MemoryMailSender());
  });

  it('runs as the support_grant_notices job, logging IDs only', async () => {
    const lines: Record<string, unknown>[] = [];
    const logger = createLogger({ sink: (line) => lines.push(JSON.parse(line) as Record<string, unknown>) });
    const mail = new MemoryMailSender();
    const handlers = createPlatformHandlers({
      operator,
      store: { putImmutable: () => Promise.reject(new Error('unused')), head: () => Promise.resolve(null) },
      restorer: { restoreLatest: () => Promise.reject(new Error('unused')) },
      mail,
      appOrigin: ORIGIN,
    });
    const jobId = randomUUID();
    await supportGrant(world.practiceId, 0);
    await handlers.support_grant_notices({}, { jobId, logger });
    expect(lines).toEqual([expect.objectContaining({ msg: 'support grant notices sent', job_id: jobId })]);
    await handlers.support_grant_notices({}, { jobId, logger });
    expect(lines).toHaveLength(1);
    const lonely = await supportGrant(await practiceWithoutAdministrator(), 0);
    await handlers.support_grant_notices({}, { jobId, logger });
    expect(lines.at(-1)).toMatchObject({ level: 'error', error_code: 'NOTICE_UNDELIVERABLE', job_id: jobId, support_grant_id: lonely });
    expect(JSON.stringify(lines)).not.toContain('@');
  });
});
