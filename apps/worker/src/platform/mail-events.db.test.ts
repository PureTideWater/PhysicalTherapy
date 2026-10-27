import { randomUUID } from 'node:crypto';

import { GetAccountCommand, GetConfigurationSetCommand, PutConfigurationSetSendingOptionsCommand } from '@aws-sdk/client-sesv2';
import { type DatabaseClient, type DatabasePool, databaseClient, openPool, readDatabaseUrl, withActor } from '@tp/db';
import { type MigratedDatabase, type TenantWorld, addMembership, asOwner, createMigratedDatabase, createOrganization, createTenantWorld, createUser, endPool } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { localMailEvents } from '../mail/events';
import { type MailIdentity, MemoryMailSender } from '../mail/mail';
import { MAIL_PROBE_RECIPIENTS } from '../mail/streams';
import { type MailEventSource, type MailEventsOptions, type MailQueueMessage, MemoryMailControl, SesMailControl, expireMail, runMailEvents } from './mail-events';
import { sendSupportGrantNotices } from './support-notices';

/**
 * The platform's mail_events job against a real database (audit #76; docs/adr/0065; JOB-05, SCR-21, SEC-18, SEC-19):
 * each SES event recorded once per message and event in any order, deleted from the queue only after its record
 * commits; the screening's set kept in step with its stream (a pause disables the screening set alone, and nothing keeps
 * a paused set sending); the account's signals; the probes; and a notice's undelivered recipient reported once.
 */

const PREFIX = 'tp-production';
let database: MigratedDatabase;
let owner: DatabaseClient;
let operator: DatabasePool;
let app: DatabasePool;
let world: TenantWorld;
let platformAdmin: string;
let engineer: string;

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = databaseClient(database.url);
  await owner.connect();
  operator = openPool(database.url, 3);
  app = openPool(database.appUrl, 2);
  world = await createTenantWorld(owner, 'mail events');
  const internal = await createOrganization(owner, 'internal');
  platformAdmin = await createUser(owner, { hardwareKeyRequired: true });
  await addMembership(owner, internal, platformAdmin, 'platform_admin');
  engineer = await createUser(owner, { hardwareKeyRequired: true });
  await addMembership(owner, internal, engineer, 'support');
});

afterAll(async () => {
  await endPool(app);
  await endPool(operator);
  await owner.end();
  await database.drop();
});

/**
 * Every stream open, confirmed and unprobed, and no message recorded: each test starts from the seeded state. The window
 * starts a minute back, as the seeded one starts at the migration: a test's events carry this process's clock to the
 * millisecond, and a window starting at the database's now(), to the microsecond, would begin after a message stamped
 * in the same millisecond and leave it uncounted (CI on 6579169, SCR-21).
 */
beforeEach(async () => {
  await owner.query('DELETE FROM screening_bounce_mark');
  await owner.query('DELETE FROM mail_send');
  await owner.query('DELETE FROM screening_mail_refusal');
  await owner.query(`UPDATE mail_stream SET paused_at = NULL, paused_reason = NULL, paused_by = NULL, pause_sends = NULL, pause_bounces = NULL,
                       pause_complaints = NULL, ses_enabled_confirmed_at = now(), probe_sent_at = NULL, probe_delivered_at = NULL,
                       probe_bounced_at = NULL, resumed_at = NULL, window_starts_at = now() - interval '1 minute'`);
});

/** The queue in memory: a message received and not deleted is hidden until the run ends (its visibility timeout). */
class MemoryQueue implements MailEventSource {
  readonly messages: MailQueueMessage[] = [];
  readonly removed: string[] = [];
  private readonly received = new Set<string>();

  push(body: string): string {
    const id = randomUUID();
    this.messages.push({ id, body, receipt: id });
    return id;
  }

  receive(max: number): Promise<readonly MailQueueMessage[]> {
    const taken = this.messages.filter((message) => !this.received.has(message.id)).slice(0, max);
    for (const message of taken) {
      this.received.add(message.id);
    }
    return Promise.resolve(taken);
  }

  remove(message: MailQueueMessage): Promise<void> {
    this.removed.push(message.id);
    const index = this.messages.findIndex((held) => held.id === message.id);
    if (index >= 0) {
      this.messages.splice(index, 1);
    }
    return Promise.resolve();
  }

  /** The next run receives every message still held. */
  expire(): void {
    this.received.clear();
  }
}

/** One message's events as SES publishes them, through the simulator's outcome for its address. */
function events(queue: MemoryQueue, to: string, identity: MailIdentity, messageId = `0100019a${randomUUID()}-000000`): string {
  for (const event of localMailEvents({ messageId, to, identity, streamPrefix: PREFIX, at: new Date() })) {
    queue.push(JSON.stringify(event));
  }
  return messageId;
}

function capture() {
  const lines: Record<string, unknown>[] = [];
  return { lines, logger: createLogger({ sink: (line) => lines.push(JSON.parse(line) as Record<string, unknown>) }) };
}

async function run(options: Partial<Omit<MailEventsOptions, 'client'>> & { readonly source: MailEventSource }, logger = capture().logger) {
  const client = await operator.connect();
  try {
    return await runMailEvents({
      client,
      control: new MemoryMailControl(),
      mail: new MemoryMailSender(),
      streamPrefix: PREFIX,
      probes: false,
      requestId: `job-${randomUUID()}`,
      logger,
      ...options,
    });
  } finally {
    client.release();
  }
}

async function stream(name: string): Promise<Record<string, unknown>> {
  const { rows } = await owner.query<Record<string, unknown>>(
    'SELECT paused_reason, ses_enabled_confirmed_at IS NOT NULL AS confirmed, probe_sent_at IS NOT NULL AS probed FROM mail_stream WHERE stream = $1',
    [name],
  );
  return rows[0] ?? {};
}

const screening = (): MailIdentity => ({ stream: 'screening', kind: 'screening_result', subjectId: randomUUID() });

describe('the mail_events job', () => {
  it('records 500 events with repeats once per message and event, in any order, and deletes each from the queue only after its record commits (JOB-05)', async () => {
    const queue = new MemoryQueue();
    const ids: string[] = [];
    for (let index = 0; index < 100; index += 1) {
      ids.push(events(queue, `someone${String(index)}@clinic.synthetic.test`, { stream: 'transactional', kind: 'digest', subjectId: randomUUID(), recipientUserId: world.adminUserId }));
    }
    // Every event again, shuffled: 400 messages, and a delivery before its send.
    const repeats = [...queue.messages.map((message) => message.body), ...queue.messages.map((message) => message.body)];
    queue.messages.reverse();
    for (const body of repeats.sort(() => 0.5 - Math.random())) {
      queue.push(body);
    }
    expect(queue.messages).toHaveLength(600);
    const result = await run({ source: queue, limits: { messages: 1000, ms: 50_000 } });
    // A delivery read before its send records the message as delivered, and the send then changes nothing.
    expect(result).toMatchObject({ unreadable: 0, notRecorded: 0 });
    expect(result.recorded + result.repeated).toBe(600);
    expect(result.recorded).toBeGreaterThanOrEqual(100);
    expect(result.recorded).toBeLessThanOrEqual(200);
    expect(queue.messages).toEqual([]);
    const { rows } = await owner.query<{ state: string; n: number }>('SELECT state, count(*)::integer AS n FROM mail_send WHERE ses_message_id = ANY ($1) GROUP BY state', [ids]);
    expect(rows).toEqual([{ state: 'delivered', n: 100 }]);
  });

  it('leaves an unreadable message and one whose record fails on the queue, logged by their IDs alone', async () => {
    const queue = new MemoryQueue();
    const unreadable = queue.push('{"source":"aws.ses","detail":{"SYNTHETIC":"someone@synthetic.test"}}');
    events(queue, 'someone@clinic.synthetic.test', screening());
    // A support notice's event without its practice's tag: the database refuses it (42501), and it is received again.
    const refused = queue.push(
      JSON.stringify(localMailEvents({ messageId: `0100019a${randomUUID()}-000000`, to: 'admin@synthetic.test', identity: { stream: 'notices', kind: 'support_grant_opened', subjectId: randomUUID() }, streamPrefix: PREFIX, at: new Date() })[0]),
    );
    const { lines, logger } = capture();
    const result = await run({ source: queue }, logger);
    expect(result).toMatchObject({ recorded: 2, unreadable: 1, notRecorded: 1 });
    expect(queue.messages.map((message) => message.id).sort()).toEqual([unreadable, refused].sort());
    expect(lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ level: 'warn', queue_message_id: unreadable, error_code: 'MAIL_EVENT_UNREADABLE' }),
        expect.objectContaining({ level: 'error', queue_message_id: refused, error_code: 'MAIL_EVENT_NOT_RECORDED_42501' }),
      ]),
    );
    expect(JSON.stringify(lines)).not.toMatch(/@|SYNTHETIC/);
  });

  it('deletes nothing whose transaction did not commit', async () => {
    const queue = new MemoryQueue();
    events(queue, 'someone@clinic.synthetic.test', screening());
    const client = await operator.connect();
    try {
      // The commit fails: the job stops, and neither message has left the queue.
      const failing = {
        query: (text: string, values?: unknown[]) => (text === 'COMMIT' ? Promise.reject(Object.assign(new Error('SYNTHETIC lost connection'), { code: '08006' })) : client.query(text, values)),
      };
      const options = { client: failing, source: queue, control: new MemoryMailControl(), mail: new MemoryMailSender(), streamPrefix: PREFIX, probes: false, requestId: 'job', logger: capture().logger };
      await expect(runMailEvents(options)).rejects.toThrow();
      expect(queue.messages).toHaveLength(2);
      expect(queue.removed).toEqual([]);
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  });

  it('pauses the screening stream on its own cut-off, disables the screening set alone at once, and keeps it disabled whatever re-enables it (SCR-21)', async () => {
    const queue = new MemoryQueue();
    // 7 permanent bounces among 7 sends: above 3% of the 200-send floor.
    for (let index = 0; index < 7; index += 1) {
      events(queue, `bounce+m${String(index)}@simulator.amazonses.com`, screening());
    }
    const commands: unknown[] = [];
    let enabled = true;
    const ses = {
      send: (command: object) => {
        commands.push(command);
        if (command instanceof GetAccountCommand) {
          return Promise.resolve({ EnforcementStatus: 'HEALTHY' });
        }
        if (command instanceof GetConfigurationSetCommand) {
          return Promise.resolve({ SendingOptions: { SendingEnabled: enabled } });
        }
        if (command instanceof PutConfigurationSetSendingOptionsCommand) {
          enabled = command.input.SendingEnabled === true;
        }
        return Promise.resolve({});
      },
    };
    const control = new SesMailControl({ client: ses as never, streamPrefix: PREFIX });
    const { lines, logger } = capture();
    const result = await run({ source: queue, control }, logger);
    expect(result.paused).toBe('bounce_rate');
    expect(await stream('screening')).toMatchObject({ paused_reason: 'bounce_rate', confirmed: false });
    expect(await stream('transactional')).toMatchObject({ paused_reason: null, confirmed: true });
    expect(await stream('notices')).toMatchObject({ paused_reason: null, confirmed: true });
    const puts = commands.filter((command): command is PutConfigurationSetSendingOptionsCommand => command instanceof PutConfigurationSetSendingOptionsCommand).map((command) => command.input);
    expect(puts).toEqual([{ ConfigurationSetName: 'tp-production-screening', SendingEnabled: false }]);
    expect(lines).toEqual(expect.arrayContaining([expect.objectContaining({ level: 'error', msg: 'screening mail stream paused: its permanent bounces passed the cut-off', error_code: 'MAIL_STREAM_PAUSED' })]));
    // Drift: a deploy (or a hand) enables the paused set; the next run disables it again, and the stream stays unconfirmed.
    enabled = true;
    commands.length = 0;
    await run({ source: new MemoryQueue(), control });
    expect(enabled).toBe(false);
    expect(commands.filter((command): command is PutConfigurationSetSendingOptionsCommand => command instanceof PutConfigurationSetSendingOptionsCommand).map((command) => command.input)).toEqual([
      { ConfigurationSetName: 'tp-production-screening', SendingEnabled: false },
    ]);
    expect(await stream('screening')).toMatchObject({ confirmed: false });
    // The resume (a platform administrator's): the next run enables the set, then confirms the stream on what SES reads.
    expect(await withActor(app, platformAdmin, async (scope) => (await scope.client.query<{ resumed: boolean }>("SELECT console_resume_mail_stream('screening', 'cause_fixed') AS resumed")).rows)).toEqual([{ resumed: true }]);
    expect(await stream('screening')).toMatchObject({ paused_reason: null, confirmed: false });
    await run({ source: new MemoryQueue(), control });
    expect(enabled).toBe(true);
    expect(await stream('screening')).toMatchObject({ paused_reason: null, confirmed: true });
  });

  it('pauses only the screening stream on an account alarm (account_rate) and on SES enforcement other than HEALTHY (account_review), once each', async () => {
    const alarm = (metric: string) =>
      JSON.stringify({
        source: 'aws.cloudwatch',
        'detail-type': 'CloudWatch Alarm State Change',
        detail: { state: { value: 'ALARM' }, configuration: { metrics: [{ metricStat: { metric: { namespace: 'AWS/SES', name: metric } } }] } },
      });
    const queue = new MemoryQueue();
    queue.push(alarm('Reputation.ComplaintRate'));
    queue.push(alarm('Reputation.BounceRate'));
    const control = new MemoryMailControl();
    const result = await run({ source: queue, control });
    expect(result).toMatchObject({ paused: 'account_rate', recorded: 2 });
    expect(queue.messages).toEqual([]);
    expect(control.changes).toEqual([false]);
    expect(await stream('screening')).toMatchObject({ paused_reason: 'account_rate' });
    expect((await owner.query("SELECT count(*)::integer AS n FROM audit_event WHERE action = 'mail_stream_paused' AND purpose = 'account_rate'")).rows).toEqual([{ n: 1 }]);
    // Under review, with the stream open again: account_review.
    await owner.query("UPDATE mail_stream SET paused_at = NULL, paused_reason = NULL, pause_sends = NULL, pause_bounces = NULL, pause_complaints = NULL, ses_enabled_confirmed_at = now() WHERE stream = 'screening'");
    const probation = new MemoryMailControl();
    probation.healthy = false;
    expect(await run({ source: new MemoryQueue(), control: probation })).toMatchObject({ paused: 'account_review' });
    expect(await stream('screening')).toMatchObject({ paused_reason: 'account_review' });
    expect(await stream('transactional')).toMatchObject({ paused_reason: null });
    expect(await run({ source: new MemoryQueue(), control: probation })).toMatchObject({ paused: null });
  });

  it('probes each stream only at SES’s simulator, at once and then daily, never while paused, unconfirmed or before the identities are verified', async () => {
    const mail = new MemoryMailSender();
    // Phase 1: no probe at all.
    expect(await run({ source: new MemoryQueue(), mail, probes: false })).toMatchObject({ probed: [] });
    expect(mail.sent).toEqual([]);
    const result = await run({ source: new MemoryQueue(), mail, probes: true });
    expect(result.probed).toEqual(['notices', 'screening', 'transactional']);
    expect(mail.sent).toHaveLength(6);
    expect(new Set(mail.sent.map((message) => message.to[0]))).toEqual(new Set(Object.values(MAIL_PROBE_RECIPIENTS)));
    expect(mail.sent.every((message) => message.identity.kind === 'probe' && message.identity.subjectId === undefined)).toBe(true);
    // Not due again until they come back and a day passes.
    expect(await run({ source: new MemoryQueue(), mail, probes: true })).toMatchObject({ probed: [] });
    // The probes' events come back: the screening reads ready.
    const queue = new MemoryQueue();
    for (const message of mail.sent) {
      for (const event of localMailEvents({ messageId: message.messageId, to: message.to[0] ?? '', identity: message.identity, streamPrefix: PREFIX, at: new Date() })) {
        queue.push(JSON.stringify(event));
      }
    }
    await run({ source: queue, mail, probes: true });
    const status = await withActor(app, world.adminUserId, async (scope) => (await scope.client.query<{ paused: boolean; ready: boolean }>('SELECT paused, ready FROM screening_mail_status()')).rows);
    expect(status).toEqual([{ paused: false, ready: true }]);
    // Paused, or resumed but not yet confirmed: no screening probe.
    await owner.query("UPDATE mail_stream SET probe_sent_at = now() - interval '25 hours'");
    await owner.query("UPDATE mail_stream SET paused_at = now(), paused_reason = 'account_review', pause_sends = 0, pause_bounces = 0, pause_complaints = 0, ses_enabled_confirmed_at = NULL WHERE stream = 'screening'");
    const paused = new MemoryMailControl();
    paused.sending = false;
    expect((await run({ source: new MemoryQueue(), mail, probes: true, control: paused })).probed).toEqual(['notices', 'transactional']);
  });

  it('logs MAIL_PROBE_MISSED when a probe has not come back in 26 hours, and sends it again', async () => {
    await owner.query("UPDATE mail_stream SET probe_sent_at = now() - interval '27 hours', probe_delivered_at = NULL, probe_bounced_at = NULL WHERE stream = 'notices'");
    await owner.query("UPDATE mail_stream SET probe_sent_at = now(), probe_delivered_at = now(), probe_bounced_at = now() WHERE stream <> 'notices'");
    const mail = new MemoryMailSender();
    const { lines, logger } = capture();
    const result = await run({ source: new MemoryQueue(), mail, probes: true }, logger);
    expect(result).toMatchObject({ probed: ['notices'], probesMissed: ['notices'] });
    expect(lines).toEqual([expect.objectContaining({ level: 'error', msg: 'notices mail probe has not come back in 26 hours', error_code: 'MAIL_PROBE_MISSED' })]);
    expect(mail.sent.map((message) => message.identity.stream)).toEqual(['notices', 'notices']);
  });

  it('reports a break-glass notice not delivered to an administrator once, by the grant’s ID, from its events in any order (SEC-19)', async () => {
    const grant = randomUUID();
    await asOwner(owner, [world.practiceId], () =>
      owner.query("INSERT INTO support_grant (id, practice_id, user_id, ticket, reason, created_at, expires_at) VALUES ($1, $2, $3, 'SYN-9', 'SYNTHETIC', now(), now() + interval '4 hours')", [
        grant,
        world.practiceId,
        engineer,
      ]),
    );
    const mail = new MemoryMailSender();
    const client = await operator.connect();
    try {
      await sendSupportGrantNotices({ client, mail, origin: 'http://localhost:3000', requestId: 'job' });
    } finally {
      client.release();
    }
    const [message] = mail.sent.filter((sent) => sent.links[0]?.endsWith(grant) === true);
    expect(message).toBeDefined();
    const queue = new MemoryQueue();
    // The suppression bounce arrives before its send; then both again.
    const published = localMailEvents({ messageId: message?.messageId ?? '', to: 'suppressionlist@simulator.amazonses.com', identity: message?.identity ?? screening(), streamPrefix: PREFIX, at: new Date() });
    for (const event of [...published.reverse(), ...published]) {
      queue.push(JSON.stringify(event));
    }
    const { lines, logger } = capture();
    const result = await run({ source: queue }, logger);
    expect(result).toMatchObject({ recorded: 1, repeated: 3 });
    expect(lines.filter((line) => line.error_code === 'NOTICE_UNDELIVERED')).toEqual([expect.objectContaining({ level: 'error', support_grant_id: grant })]);
    expect((await owner.query('SELECT state FROM support_grant_notice_recipient WHERE ses_message_id = $1', [message?.messageId])).rows).toEqual([{ state: 'suppressed' }]);
    expect((await owner.query("SELECT count(*)::integer AS n FROM notification WHERE kind = 'support_notice_undelivered' AND practice_id = $1", [world.practiceId])).rows).toEqual([{ n: 1 }]);
    expect(JSON.stringify(lines)).not.toContain('@');
  });

  it('reports a break-glass notice SES never sent, its administrator on the account’s suppression list for an earlier complaint, as not delivered (SEC-19)', async () => {
    const grant = randomUUID();
    await asOwner(owner, [world.practiceId], () =>
      owner.query("INSERT INTO support_grant (id, practice_id, user_id, ticket, reason, created_at, expires_at) VALUES ($1, $2, $3, 'SYN-10', 'SYNTHETIC', now(), now() + interval '4 hours')", [
        grant,
        world.practiceId,
        engineer,
      ]),
    );
    const mail = new MemoryMailSender();
    const client = await operator.connect();
    try {
      await sendSupportGrantNotices({ client, mail, origin: 'http://localhost:3000', requestId: 'job' });
    } finally {
      client.release();
    }
    const [message] = mail.sent.filter((sent) => sent.links[0]?.endsWith(grant) === true);
    expect(message).toBeDefined();
    // SES accepts the message and sends nothing: its Send event, then a Complaint whose subtype is OnAccountSuppressionList
    // and which carries no feedback report (SES's Complaint.ComplaintSubType).
    const [sent] = localMailEvents({ messageId: message?.messageId ?? '', to: 'admin@clinic.synthetic.test', identity: message?.identity ?? screening(), streamPrefix: PREFIX, at: new Date() });
    const complaint = {
      ...(sent as { detail: Record<string, unknown> }),
      'detail-type': 'Email Complaint Received',
      detail: {
        ...(sent as { detail: Record<string, unknown> }).detail,
        eventType: 'Complaint',
        complaint: { complaintSubType: 'OnAccountSuppressionList', complainedRecipients: [{ emailAddress: 'admin@clinic.synthetic.test' }], timestamp: new Date().toISOString(), feedbackId: 'synthetic' },
      },
    };
    delete (complaint.detail as Record<string, unknown>).send;
    const queue = new MemoryQueue();
    queue.push(JSON.stringify(sent));
    queue.push(JSON.stringify(complaint));
    const { lines, logger } = capture();
    expect(await run({ source: queue }, logger)).toMatchObject({ recorded: 2, unreadable: 0, notRecorded: 0 });
    expect(lines.filter((line) => line.error_code === 'NOTICE_UNDELIVERED')).toEqual([expect.objectContaining({ level: 'error', support_grant_id: grant })]);
    expect((await owner.query('SELECT state, bounce_kind, bounce_subtype, complaint_type FROM mail_send WHERE ses_message_id = $1', [message?.messageId])).rows).toEqual([
      { state: 'suppressed', bounce_kind: 'permanent', bounce_subtype: 'on_account_suppression_list', complaint_type: null },
    ]);
    expect((await owner.query('SELECT state FROM support_grant_notice_recipient WHERE ses_message_id = $1', [message?.messageId])).rows).toEqual([{ state: 'suppressed' }]);
    // Never "Delivered": the console counts it undelivered.
    const counts = await withActor(app, platformAdmin, async (scope) =>
      (await scope.client.query<Record<string, unknown>>('SELECT opened_delivered, opened_undelivered FROM console_support_grants() WHERE support_grant_id = $1', [grant])).rows,
    );
    expect(counts).toEqual([{ opened_delivered: 0, opened_undelivered: 1 }]);
    expect(JSON.stringify(lines)).not.toContain('@');
  });

  it('flags an invitation whose Cognito message bounced, by its ID, and keeps a refused screening address only as its keyed hash (SEC-18)', async () => {
    const invited = await createUser(owner, { status: 'invited', mfaEnrolled: false });
    const membership = await addMembership(owner, world.organizationId, invited, 'viewer');
    // Sent a moment ago, before the Cognito call whose message bounces.
    const { rows: invitation } = await owner.query<{ id: string; email: string }>(
      `INSERT INTO invitation (organization_id, membership_id, user_id, invited_by, sent_at, expires_at, last_sent_by)
       VALUES ($1, $2, $3, $4, now() - interval '1 second', now() - interval '1 second' + interval '7 days', $4) RETURNING id, (SELECT email FROM "user" WHERE id = $3) AS email`,
      [world.organizationId, membership, invited, world.adminUserId],
    );
    const queue = new MemoryQueue();
    const cognito = `0100019a${randomUUID()}-000000`;
    for (const event of localMailEvents({ messageId: cognito, to: 'bounce@simulator.amazonses.com', identity: { stream: 'transactional', kind: 'cognito' }, streamPrefix: PREFIX, at: new Date() })) {
      // Cognito's message to the invited user's own address, bounced.
      queue.push(JSON.stringify(event).replaceAll('bounce@simulator.amazonses.com', invitation[0]?.email ?? ''));
    }
    events(queue, 'Bounce+Refused@Simulator.AmazonSES.com', screening());
    const { lines, logger } = capture();
    await run({ source: queue }, logger);
    expect(lines).toEqual(expect.arrayContaining([expect.objectContaining({ level: 'warn', invitation_id: invitation[0]?.id, error_code: 'INVITATION_UNDELIVERED' })]));
    expect((await owner.query('SELECT undelivered_reason FROM invitation WHERE id = $1', [invitation[0]?.id])).rows).toEqual([{ undelivered_reason: 'bounced' }]);
    // The refusal list holds the keyed hash, not the address nor its plain SHA-256; no mail record holds either.
    const { rows } = await owner.query<{ keyed: string; plain: string }>(
      "SELECT mail_recipient_sha256('bounce+refused@simulator.amazonses.com') AS keyed, encode(sha256(convert_to('bounce+refused@simulator.amazonses.com', 'UTF8')), 'hex') AS plain",
    );
    const refusals = await owner.query<{ recipient_sha256: string }>('SELECT recipient_sha256 FROM screening_mail_refusal');
    expect(refusals.rows).toEqual([{ recipient_sha256: rows[0]?.keyed }]);
    expect(rows[0]?.keyed).not.toBe(rows[0]?.plain);
    const sends = JSON.stringify((await owner.query('SELECT * FROM mail_send')).rows);
    expect(sends).not.toMatch(/@|simulator/i);
    expect(sends).not.toContain(rows[0]?.keyed ?? 'none');
    expect(JSON.stringify(lines)).not.toContain('@');
  });

  it('expires the mail records past their days, as the nightly mail_expiry job does', async () => {
    const queue = new MemoryQueue();
    const old = events(queue, 'someone@clinic.synthetic.test', screening());
    const kept = events(queue, 'other@clinic.synthetic.test', screening());
    await run({ source: queue });
    await owner.query("UPDATE mail_send SET sent_at = now() - interval '31 days' WHERE ses_message_id = $1", [old]);
    const client = await operator.connect();
    try {
      expect(await expireMail(client)).toBe(1);
      expect(await expireMail(client)).toBe(0);
    } finally {
      client.release();
    }
    expect((await owner.query<{ id: string }>('SELECT ses_message_id AS id FROM mail_send')).rows).toEqual([{ id: kept }]);
  });
});

