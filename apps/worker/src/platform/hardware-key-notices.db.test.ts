import { randomUUID } from 'node:crypto';

import { AUTH_MAIL_FOOTER, HARDWARE_KEY_NOTICE_KINDS, HARDWARE_KEY_NOTICE_SUBJECTS, type HardwareKeyNoticeKind, hardwareKeyNoticeLines } from '@tp/auth-mail';
import { type DatabaseClient, type DatabasePool, databaseClient, openPool, readDatabaseUrl } from '@tp/db';
import { type MigratedDatabase, createMigratedDatabase, createUser, endPool } from '@tp/db/testing';
import { type Logger, createLogger, isAllowedLogField } from '@tp/observability';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createPlatformHandlers } from '../jobs/platform';
import { type MailMessage, type MailSender, MemoryMailSender, mailBody } from '../mail/mail';
import { mailTags } from '../mail/streams';
import { sendHardwareKeyNotices } from './hardware-key-notices';

/**
 * The hardware_key_notices job against a real database (docs/adr/0095; the password notice's tests, re-pointed, and the
 * one branch more): each of the three kinds goes once, to the account's own address read only by the claim, with its
 * own words and no link; an account whose address changed since the removal was requested is never written to
 * (AddressChanged, reported once); a refused send is retried, a permanent one fails; a stale notice is never sent; a
 * record that fails after SES accepted the message is a counted try. Lines carry IDs and codes only. The notice rows
 * are seeded as the owner (the functions that write them are W32's tests' subject). Synthetic data only.
 */

const SUPPORT = 'support@synthetic.test';
let database: MigratedDatabase;
let owner: DatabaseClient;
let operator: DatabasePool;

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = databaseClient(database.url);
  await owner.connect();
  operator = openPool(database.url, 4);
}, 120_000);

afterAll(async () => {
  await endPool(operator);
  await owner.end();
  await database.drop();
});

beforeEach(async () => {
  await owner.query('DELETE FROM hardware_key_notice');
});

function capture() {
  const lines: Record<string, unknown>[] = [];
  return { lines, logger: createLogger({ sink: (line) => lines.push(JSON.parse(line) as Record<string, unknown>) }) };
}

function idsOnly(lines: readonly Record<string, unknown>[]): void {
  for (const line of lines) {
    for (const key of Object.keys(line).filter((field) => !['level', 'msg', 'time', 'service'].includes(field))) {
      expect(isAllowedLogField(key), key).toBe(true);
    }
  }
  expect(JSON.stringify(lines)).not.toMatch(/@|SYNTHETIC/);
}

async function run(mail: MailSender, logger?: Logger, requestId = `job-${randomUUID()}`) {
  const client = await operator.connect();
  try {
    return await sendHardwareKeyNotices({ client, mail, supportEmail: SUPPORT, requestId, ...(logger === undefined ? {} : { logger }) });
  } finally {
    client.release();
  }
}

/** A removal requested for a new account, with the address's digest as the request takes it, and one notice of the kind. */
async function noticed(kind: HardwareKeyNoticeKind, age = '0 seconds'): Promise<{ readonly user: string; readonly notice: string; readonly eventAt: Date }> {
  const user = await createUser(owner, {});
  const requester = await createUser(owner, {});
  const removal = randomUUID();
  await owner.query(
    `INSERT INTO hardware_key_removal (id, user_id, requested_by, requested_at, expires_at, address_sha256)
     SELECT $1::uuid, u.id, $3, now(), now() + interval '24 hours', sha256(convert_to($1::uuid::text || ':' || lower(u.email), 'UTF8')) FROM "user" u WHERE u.id = $2`,
    [removal, user, requester],
  );
  const { rows } = await owner.query<{ id: string; event_at: Date }>(
    `INSERT INTO hardware_key_notice (user_id, kind, removal_id, event_at, expires_at)
     VALUES ($1, $2, $3, now() - $4::interval, now() - $4::interval + interval '90 days') RETURNING id, event_at`,
    [user, kind, removal, age],
  );
  return { user, notice: rows[0]?.id ?? '', eventAt: rows[0]?.event_at ?? new Date(0) };
}

interface NoticeState {
  readonly state: string;
  readonly attempts: number;
  readonly ses_message_id: string | null;
  readonly error_code: string | null;
  readonly next_in_seconds: number;
}

async function notice(id: string): Promise<NoticeState | undefined> {
  const { rows } = await owner.query<NoticeState>(
    'SELECT state, attempts, ses_message_id, error_code, round(extract(epoch FROM next_attempt_at - now()))::int AS next_in_seconds FROM hardware_key_notice WHERE id = $1',
    [id],
  );
  return rows[0];
}

async function events(action: string, user: string): Promise<Record<string, unknown>[]> {
  const { rows } = await owner.query<Record<string, unknown>>("SELECT actor_kind, request_id FROM audit_event WHERE action = $1 AND object_type = 'user' AND object_id = $2 ORDER BY at", [action, user]);
  return rows;
}

function refusing(name: string): MailSender {
  return {
    send: () => {
      const error = new Error('refused for someone@synthetic.test');
      error.name = name;
      return Promise.reject(error);
    },
  };
}

describe('the hardware_key_notices job (docs/adr/0095)', () => {
  it.each(HARDWARE_KEY_NOTICE_KINDS)('sends a %s notice once, to the account’s own address, with its own words, no link and Reply-To the support address, and records it sent', async (kind) => {
    const { user, notice: id, eventAt } = await noticed(kind);
    const mail = new MemoryMailSender();
    const { lines, logger } = capture();
    const requestId = `job-${randomUUID()}`;
    expect(await run(mail, logger, requestId)).toEqual({ stale: 0, sent: 1, failed: 0, undelivered: 0 });
    expect(mail.sent).toHaveLength(1);
    const message = mail.sent[0] as MailMessage;
    // The memory sender keeps what it rendered beside the message.
    expect(message).toMatchObject({
      to: [`${user}@synthetic.test`],
      subject: HARDWARE_KEY_NOTICE_SUBJECTS[kind],
      lines: hardwareKeyNoticeLines(kind, eventAt, SUPPORT),
      links: [],
      variant: 'account',
      replyTo: SUPPORT,
      identity: { stream: 'transactional', kind: 'hardware_keys_removed', subjectId: id, recipientUserId: user },
    });
    expect(mailTags(message.identity)).toEqual([
      { Name: 'tp_kind', Value: 'hardware_keys_removed' },
      { Name: 'tp_subject', Value: id },
      { Name: 'tp_recipient', Value: user },
    ]);
    const body = mailBody(message);
    expect(body).toBe(`${hardwareKeyNoticeLines(kind, eventAt, SUPPORT).join('\n')}\n\n${AUTH_MAIL_FOOTER}`);
    expect(body).not.toMatch(/http|href|<a/);
    expect(await notice(id)).toMatchObject({ state: 'sent', error_code: null });
    expect(await events('hardware_key_notice_sent', user)).toEqual([{ actor_kind: 'system', request_id: requestId }]);
    expect(lines).toEqual([expect.objectContaining({ level: 'info', msg: 'hardware key notice sent', hardware_key_notice_id: id, user_id: user })]);
    idsOnly(lines);
    expect(await run(mail, logger)).toMatchObject({ sent: 0 });
    expect(mail.sent).toHaveLength(1);
  });

  it('never writes to an address changed since the removal was requested: the notice fails as AddressChanged and is reported once', async () => {
    const { user, notice: id } = await noticed('removed');
    await owner.query('UPDATE "user" SET email = $2 WHERE id = $1', [user, `moved-${user}@synthetic.test`]);
    const mail = new MemoryMailSender();
    const { lines, logger } = capture();
    expect(await run(mail, logger)).toEqual({ stale: 0, sent: 0, failed: 0, undelivered: 1 });
    expect(mail.sent).toEqual([]);
    expect(await notice(id)).toMatchObject({ state: 'failed', error_code: 'AddressChanged', ses_message_id: null });
    expect(lines).toEqual([
      expect.objectContaining({ level: 'error', msg: 'hardware key notice not delivered', hardware_key_notice_id: id, user_id: user, undelivered_reason_code: 'AddressChanged', error_code: 'KEY_NOTICE_UNDELIVERED' }),
    ]);
    idsOnly(lines);
    expect(await events('hardware_key_notice_undelivered', user)).toHaveLength(1);
    expect(await run(mail, logger)).toEqual({ stale: 0, sent: 0, failed: 0, undelivered: 0 });
    expect(lines).toHaveLength(1);
    expect(await events('hardware_key_notice_undelivered', user)).toHaveLength(1);
  });

  it('sends each notice once when runs race: the claim’s row lock is held through the send', async () => {
    await noticed('removed');
    await noticed('registration_opened');
    const mail = new MemoryMailSender();
    const results = await Promise.all([run(mail), run(mail), run(mail)]);
    expect(results.reduce((sum, result) => sum + result.sent, 0)).toBe(2);
    expect(mail.sent).toHaveLength(2);
  });

  it('tries a refused send again a minute later, logging the error’s name alone', async () => {
    const { notice: id } = await noticed('removed');
    const { lines, logger } = capture();
    expect(await run(refusing('Throttling'), logger)).toEqual({ stale: 0, sent: 0, failed: 1, undelivered: 0 });
    const state = await notice(id);
    expect(state).toMatchObject({ state: 'pending', attempts: 1 });
    expect(state?.next_in_seconds).toBeGreaterThan(50);
    expect(state?.next_in_seconds).toBeLessThanOrEqual(60);
    expect(lines).toEqual([expect.objectContaining({ level: 'warn', msg: 'hardware key notice send failed', hardware_key_notice_id: id, error_code: 'Throttling' })]);
    idsOnly(lines);
  });

  it('fails a notice at once on a permanent refusal and reports it once, by the error’s name', async () => {
    const { user, notice: id } = await noticed('registered_after_removal');
    const { lines, logger } = capture();
    expect(await run(refusing('MessageRejected'), logger)).toEqual({ stale: 0, sent: 0, failed: 1, undelivered: 1 });
    expect(await notice(id)).toMatchObject({ state: 'failed', error_code: 'MessageRejected' });
    expect(lines.filter((line) => line.msg === 'hardware key notice not delivered')).toEqual([
      expect.objectContaining({ hardware_key_notice_id: id, user_id: user, undelivered_reason_code: 'MessageRejected', error_code: 'KEY_NOTICE_UNDELIVERED' }),
    ]);
    idsOnly(lines);
    expect(await run(new MemoryMailSender(), logger)).toMatchObject({ sent: 0, undelivered: 0 });
  });

  it('never sends a notice past the 24-hour cutoff: it fails as NoticeStale and is reported once', async () => {
    const { user, notice: id } = await noticed('removed', '25 hours');
    const mail = new MemoryMailSender();
    const { lines, logger } = capture();
    expect(await run(mail, logger)).toEqual({ stale: 1, sent: 0, failed: 0, undelivered: 1 });
    expect(mail.sent).toEqual([]);
    expect(await notice(id)).toMatchObject({ state: 'failed', error_code: 'NoticeStale' });
    expect(lines).toEqual([expect.objectContaining({ hardware_key_notice_id: id, user_id: user, undelivered_reason_code: 'NoticeStale', error_code: 'KEY_NOTICE_UNDELIVERED' })]);
    expect(await run(mail, logger)).toEqual({ stale: 0, sent: 0, failed: 0, undelivered: 0 });
  });

  it('counts a record that fails after SES accepted the message as a try: the job fails and the notice backs off a minute', async () => {
    const { notice: id } = await noticed('removed');
    const memory = new MemoryMailSender();
    // SES accepts; the message ID it answers cannot be recorded (the column's CHECK refuses it).
    const unrecordable: MailSender = { send: async (message) => (await memory.send(message), { messageId: 'bad id' }) };
    const { lines, logger } = capture();
    await expect(run(unrecordable, logger)).rejects.toThrow();
    expect(memory.sent).toHaveLength(1);
    const state = await notice(id);
    expect(state).toMatchObject({ state: 'pending', attempts: 1, ses_message_id: null });
    expect(state?.next_in_seconds).toBeGreaterThan(50);
    expect(lines).toEqual([expect.objectContaining({ level: 'warn', msg: 'hardware key notice record failed', hardware_key_notice_id: id, error_code: 'RecordFailed' })]);
    idsOnly(lines);
  });

  it('runs as the platform’s hardware_key_notices job, logging the count and IDs only', async () => {
    const { user, notice: id } = await noticed('removed');
    const mail = new MemoryMailSender();
    const handlers = createPlatformHandlers({
      operator,
      store: { putImmutable: () => Promise.reject(new Error('unused')), head: () => Promise.resolve(null) },
      restorer: { restoreLatest: () => Promise.reject(new Error('unused')) },
      mail,
      appOrigin: 'http://localhost:3000',
      supportEmail: SUPPORT,
    });
    const { lines, logger } = capture();
    const jobId = randomUUID();
    await handlers.hardware_key_notices({}, { jobId, logger });
    expect(mail.sent.map((message) => message.to)).toEqual([[`${user}@synthetic.test`]]);
    expect(lines).toEqual([
      expect.objectContaining({ msg: 'hardware key notice sent', job_id: jobId, hardware_key_notice_id: id, user_id: user }),
      expect.objectContaining({ msg: 'hardware key notices sent', job_id: jobId, record_count: 1 }),
    ]);
    idsOnly(lines);
    expect(await events('hardware_key_notice_sent', user)).toEqual([expect.objectContaining({ request_id: jobId })]);
  });
});
