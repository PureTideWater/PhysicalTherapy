import { randomUUID } from 'node:crypto';

import { PASSWORD_CHANGED_SUBJECT, passwordChangedLines } from '@tp/auth-mail';
import { type DatabaseClient, type DatabasePool, databaseClient, openPool, readDatabaseUrl, recordAuditEvent, withActor } from '@tp/db';
import { type MigratedDatabase, createMigratedDatabase, createUser, endPool } from '@tp/db/testing';
import { type Logger, createLogger, isAllowedLogField } from '@tp/observability';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createPlatformHandlers } from '../jobs/platform';
import { type MailMessage, type MailSender, MemoryMailSender } from '../mail/mail';
import { mailTags } from '../mail/streams';
import { sendPasswordNotices } from './password-notices';

/**
 * SGN-16's worker rows (docs/adr/0091; design 3.4 and 3.5): the platform's password_notices job against a real database.
 * A completed reset's notice goes once, to the account's own address read only by the claim, on the transactional stream
 * as the notice and its user, however many runs race (the claim's row lock held through the send); a refused send is
 * retried after a minute, fails at once on a permanent error or at the fifth try, and a notice not sent within 24 hours
 * fails as NoticeStale; each failure, and a bounce recorded before the send was, is logged once as
 * PASSWORD_NOTICE_UNDELIVERED by IDs and codes, never an address. Synthetic data only: every address is @synthetic.test.
 */

const SUPPORT = 'support@synthetic.test';
let database: MigratedDatabase;
let owner: DatabaseClient;
let operator: DatabasePool;
let app: DatabasePool;

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = databaseClient(database.url);
  await owner.connect();
  operator = openPool(database.url, 4);
  app = openPool(database.appUrl, 2);
}, 120_000);

afterAll(async () => {
  await endPool(app);
  await endPool(operator);
  await owner.end();
  await database.drop();
});

/** Each test sees only its own notices: every run sends whatever is due. */
beforeEach(async () => {
  await owner.query('DELETE FROM password_notice');
});

function capture() {
  const lines: Record<string, unknown>[] = [];
  return { lines, logger: createLogger({ sink: (line) => lines.push(JSON.parse(line) as Record<string, unknown>) }) };
}

/** Every key a line carries is allowlisted, and no value is an address. */
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
    return await sendPasswordNotices({ client, mail, supportEmail: SUPPORT, requestId, ...(logger === undefined ? {} : { logger }) });
  } finally {
    client.release();
  }
}

/** The web's completed reset (apps/web/src/lib/auth/sign-in.ts), which queues the notice in its own transaction. */
async function completedReset(): Promise<{ readonly user: string; readonly notice: string; readonly changedAt: Date }> {
  const user = await createUser(owner);
  await withActor(app, user, (scope) => recordAuditEvent(scope, { action: 'password_reset_completed', objectType: 'user', objectId: user, purpose: 'email_code', requestId: `test-${randomUUID()}` }));
  const { rows } = await owner.query<{ id: string; changed_at: Date }>('SELECT id, changed_at FROM password_notice WHERE user_id = $1', [user]);
  expect(rows).toHaveLength(1);
  return { user, notice: rows[0]?.id ?? '', changedAt: rows[0]?.changed_at ?? new Date(0) };
}

interface NoticeState {
  readonly state: string;
  readonly attempts: number;
  readonly ses_message_id: string | null;
  readonly error_code: string | null;
  readonly due_in_seconds: number;
}

async function notice(id: string): Promise<NoticeState | undefined> {
  const { rows } = await owner.query<NoticeState>(
    'SELECT state, attempts, ses_message_id, error_code, extract(epoch FROM next_attempt_at - now())::integer AS due_in_seconds FROM password_notice WHERE id = $1',
    [id],
  );
  return rows[0];
}

async function events(action: string, user: string): Promise<Record<string, unknown>[]> {
  const { rows } = await owner.query<Record<string, unknown>>(
    "SELECT actor_id, actor_kind, object_type, object_id, practice_id, purpose, request_id FROM audit_event WHERE action = $1 AND object_type = 'user' AND object_id = $2 ORDER BY at",
    [action, user],
  );
  return rows;
}

function refusing(name: string): MailSender {
  return { send: (message) => Promise.reject(Object.assign(new Error(`SYNTHETIC refused ${message.to[0] ?? ''}`), { name })) };
}

const undeliveredLine = (notice: string, user: string, reason: string): unknown =>
  expect.objectContaining({ level: 'error', msg: 'password notice not delivered', password_notice_id: notice, user_id: user, undelivered_reason_code: reason, error_code: 'PASSWORD_NOTICE_UNDELIVERED' });

describe('the password_notices job (SGN-16; docs/adr/0091)', () => {
  it('sends a completed reset’s notice once, to the account’s own address, on the transactional stream, and records it sent', async () => {
    const { user, notice: id, changedAt } = await completedReset();
    const mail = new MemoryMailSender();
    const { lines, logger } = capture();
    const requestId = `job-${randomUUID()}`;
    expect(await run(mail, logger, requestId)).toEqual({ stale: 0, sent: 1, failed: 0, undelivered: 0 });
    const [message] = mail.sent;
    expect(mail.sent).toHaveLength(1);
    expect(message?.to).toEqual([`${user}@synthetic.test`]);
    expect(message?.subject).toBe(PASSWORD_CHANGED_SUBJECT);
    expect(message?.lines).toEqual(passwordChangedLines(changedAt, SUPPORT));
    expect(message?.links).toEqual([]);
    expect(message?.variant).toBe('account');
    expect(message?.identity).toEqual({ stream: 'transactional', kind: 'password_changed', subjectId: id, recipientUserId: user });
    expect(mailTags(message?.identity ?? { stream: 'transactional', kind: 'probe' })).toEqual([
      { Name: 'tp_kind', Value: 'password_changed' },
      { Name: 'tp_subject', Value: id },
      { Name: 'tp_recipient', Value: user },
    ]);
    expect(message?.body).not.toMatch(/http/);
    expect(message?.html).not.toMatch(/<a[\s>]|href/);
    expect(await notice(id)).toMatchObject({ state: 'sent', attempts: 0, ses_message_id: message?.messageId, error_code: null });
    expect(await events('password_notice_sent', user)).toEqual([
      { actor_id: null, actor_kind: 'system', object_type: 'user', object_id: user, practice_id: null, purpose: 'password_changed', request_id: requestId },
    ]);
    expect(lines).toEqual([expect.objectContaining({ level: 'info', msg: 'password notice sent', password_notice_id: id, user_id: user })]);
    idsOnly(lines);
    // A second run sends nothing.
    expect(await run(mail)).toEqual({ stale: 0, sent: 0, failed: 0, undelivered: 0 });
    expect(mail.sent).toHaveLength(1);
    expect(await events('password_notice_sent', user)).toHaveLength(1);
  });

  it('sends each notice once when runs race: the claim’s row lock is held through the send (PWN-R1-02)', async () => {
    const { user, notice: id } = await completedReset();
    const memory = new MemoryMailSender();
    let first = true;
    // The first send waits, so the other runs list the notice due and try to claim it while the first holds it.
    const slow: MailSender = {
      send: async (message) => {
        if (first) {
          first = false;
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        return memory.send(message);
      },
    };
    const results = await Promise.all([run(slow), run(slow), run(slow)]);
    expect(memory.sent.filter((message) => message.identity.subjectId === id)).toHaveLength(1);
    expect(results.reduce((sum, result) => sum + result.sent, 0)).toBe(1);
    expect(results.every((result) => result.failed === 0 && result.undelivered === 0 && result.stale === 0)).toBe(true);
    expect(await notice(id)).toMatchObject({ state: 'sent', ses_message_id: memory.sent[0]?.messageId });
    expect(await events('password_notice_sent', user)).toHaveLength(1);
  });

  it('tries a refused send again a minute later, logging the error’s name alone', async () => {
    const { user, notice: id } = await completedReset();
    const { lines, logger } = capture();
    expect(await run(refusing('Throttling'), logger)).toEqual({ stale: 0, sent: 0, failed: 1, undelivered: 0 });
    const state = await notice(id);
    expect(state).toMatchObject({ state: 'pending', attempts: 1, ses_message_id: null, error_code: null });
    expect(state?.due_in_seconds).toBeGreaterThan(50);
    expect(state?.due_in_seconds).toBeLessThanOrEqual(60);
    expect(lines).toEqual([expect.objectContaining({ level: 'warn', msg: 'password notice send failed', password_notice_id: id, error_code: 'Throttling' })]);
    idsOnly(lines);
    // Not due yet: the next run sends nothing.
    const mail = new MemoryMailSender();
    expect(await run(mail)).toEqual({ stale: 0, sent: 0, failed: 0, undelivered: 0 });
    expect(mail.sent).toEqual([]);
    expect(await events('password_notice_undelivered', user)).toEqual([]);
  });

  it('fails a notice at once on a permanent refusal and reports it once, by the error’s name', async () => {
    const { user, notice: id } = await completedReset();
    const { lines, logger } = capture();
    expect(await run(refusing('MessageRejected'), logger)).toEqual({ stale: 0, sent: 0, failed: 1, undelivered: 1 });
    expect(await notice(id)).toMatchObject({ state: 'failed', attempts: 1, error_code: 'MessageRejected' });
    expect(lines).toEqual([
      expect.objectContaining({ level: 'warn', msg: 'password notice send failed', password_notice_id: id, error_code: 'MessageRejected' }),
      undeliveredLine(id, user, 'MessageRejected'),
    ]);
    idsOnly(lines);
    expect(await events('password_notice_undelivered', user)).toEqual([
      expect.objectContaining({ actor_kind: 'system', object_type: 'user', object_id: user, purpose: 'password_changed' }),
    ]);
    expect(await run(new MemoryMailSender())).toEqual({ stale: 0, sent: 0, failed: 0, undelivered: 0 });
    expect(await events('password_notice_undelivered', user)).toHaveLength(1);
  });

  it('fails a notice at the fifth refused try and reports it once', async () => {
    const { user, notice: id } = await completedReset();
    await owner.query('UPDATE password_notice SET attempts = 4, next_attempt_at = now() WHERE id = $1', [id]);
    const { lines, logger } = capture();
    expect(await run(refusing('Throttling'), logger)).toEqual({ stale: 0, sent: 0, failed: 1, undelivered: 1 });
    expect(await notice(id)).toMatchObject({ state: 'failed', attempts: 5, error_code: 'Throttling' });
    expect(lines.filter((line) => line.error_code === 'PASSWORD_NOTICE_UNDELIVERED')).toEqual([undeliveredLine(id, user, 'Throttling')]);
    expect(await run(refusing('Throttling'), logger)).toEqual({ stale: 0, sent: 0, failed: 0, undelivered: 0 });
    expect(lines.filter((line) => line.error_code === 'PASSWORD_NOTICE_UNDELIVERED')).toHaveLength(1);
    expect(await events('password_notice_undelivered', user)).toHaveLength(1);
  });

  it('never sends a notice past the 24-hour cutoff: it fails as NoticeStale and is reported once', async () => {
    const { user, notice: id } = await completedReset();
    await owner.query("UPDATE password_notice SET changed_at = changed_at - interval '24 hours 1 minute', expires_at = expires_at - interval '24 hours 1 minute' WHERE id = $1", [id]);
    const mail = new MemoryMailSender();
    const { lines, logger } = capture();
    expect(await run(mail, logger)).toEqual({ stale: 1, sent: 0, failed: 0, undelivered: 1 });
    expect(mail.sent).toEqual([]);
    expect(await notice(id)).toMatchObject({ state: 'failed', attempts: 0, ses_message_id: null, error_code: 'NoticeStale' });
    expect(lines).toEqual([undeliveredLine(id, user, 'NoticeStale')]);
    idsOnly(lines);
    expect(await run(mail, logger)).toEqual({ stale: 0, sent: 0, failed: 0, undelivered: 0 });
    expect(lines).toHaveLength(1);
    expect(await events('password_notice_undelivered', user)).toHaveLength(1);
  });

  it('reports a notice whose bounce was recorded before its send was, once, as sent_undelivered', async () => {
    const { user, notice: id } = await completedReset();
    const memory = new MemoryMailSender();
    // SES accepts the message, and its bounce is recorded by the mail_events job (another connection) before the send's
    // own record: the send's record reads it and makes the notice undelivered.
    const bouncedFirst: MailSender = {
      send: async (message: MailMessage) => {
        const sent = await memory.send(message);
        const recorder = await operator.connect();
        try {
          await recorder.query('BEGIN');
          await recorder.query('SET LOCAL ROLE tp_operator');
          await recorder.query("SELECT set_config('app.practice_ids', '{}', true)");
          const { rows } = await recorder.query<{ password_notice_undelivered: string | null }>(
            'SELECT password_notice_undelivered FROM operator_record_mail_event($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)',
            [sent.messageId, 'transactional', 'bounce', new Date(), new Date(), null, 'password_changed', message.identity.subjectId, message.identity.recipientUserId, null, 'permanent', 'general', null, 'mail-events-job'],
          );
          // Not yet the notice's: its message ID is recorded only by the send's own record.
          expect(rows).toEqual([{ password_notice_undelivered: null }]);
          await recorder.query('COMMIT');
        } finally {
          recorder.release();
        }
        return sent;
      },
    };
    const { lines, logger } = capture();
    expect(await run(bouncedFirst, logger)).toEqual({ stale: 0, sent: 1, failed: 0, undelivered: 1 });
    expect(await notice(id)).toMatchObject({ state: 'undelivered', ses_message_id: memory.sent[0]?.messageId });
    expect(lines).toEqual([expect.objectContaining({ msg: 'password notice sent', password_notice_id: id }), undeliveredLine(id, user, 'sent_undelivered')]);
    idsOnly(lines);
    expect(await events('password_notice_sent', user)).toHaveLength(1);
    expect(await events('password_notice_undelivered', user)).toHaveLength(1);
  });

  it('runs as the platform’s password_notices job, logging the count and IDs only', async () => {
    const { user, notice: id } = await completedReset();
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
    await handlers.password_notices({}, { jobId, logger });
    expect(mail.sent.map((message) => message.to)).toEqual([[`${user}@synthetic.test`]]);
    expect(mail.sent[0]?.lines.at(-1)).toContain(SUPPORT);
    expect(lines).toEqual([
      expect.objectContaining({ msg: 'password notice sent', job_id: jobId, password_notice_id: id, user_id: user }),
      expect.objectContaining({ msg: 'password notices sent', job_id: jobId, record_count: 1 }),
    ]);
    idsOnly(lines);
    expect(await events('password_notice_sent', user)).toEqual([expect.objectContaining({ request_id: jobId })]);
    await handlers.password_notices({}, { jobId, logger });
    expect(lines).toHaveLength(2);
  });
});
