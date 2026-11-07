import { AUTH_MAIL_FOOTER, PASSWORD_CHANGED_SUBJECT, passwordChangedLines } from '@tp/auth-mail';
import { createLogger, isAllowedLogField } from '@tp/observability';
import { describe, expect, it } from 'vitest';

import { type MailMessage, type MailSender, MemoryMailSender, mailBody, mailBodyHtml } from '../mail/mail';
import { MAIL_LOG_CODES, mailTags } from '../mail/streams';
import { escapeHtml } from '../report/escape';
import { PASSWORD_NOTICE_RUN, type PasswordNoticeOptions, passwordNoticeMessage, sendPasswordNotices } from './password-notices';

/**
 * The password-changed notice's message and the job's steps, without a database (SGN-16; docs/adr/0091): the message is
 * the base's words (@tp/auth-mail, unchanged) in the 'account' variant on the transactional stream, with no link; the job
 * sweeps stale notices first, sends each due notice in its own transaction as the operator with no practice in scope,
 * records a refused send in a new one, and logs IDs and codes only. The database's half is password-notices.db.test.ts.
 */

const NOTICE = '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e01';
const USER = '3d4e5f6a-7b8c-4d9e-8f0a-1b2c3d4e5f02';
const OTHER_NOTICE = '4e5f6a7b-8c9d-4e0f-9a1b-2c3d4e5f6a03';
const OTHER_USER = '5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b04';
const SUPPORT = 'support@synthetic.test';
const ADDRESS = `${USER}@synthetic.test`;
const CHANGED = new Date('2026-11-05T14:32:59Z');
const STATIC = 'https://static.synthetic.test';
const JOB = '6a7b8c9d-0e1f-4a2b-9c3d-4e5f6a7b8c05';

describe('the password-changed message (docs/adr/0091; design 3.4)', () => {
  const message = passwordNoticeMessage({ notice_id: NOTICE, user_id: USER }, ADDRESS, CHANGED, SUPPORT);

  it('goes to the one address, with the base’s subject and four lines, no link, the account variant, on the transactional stream', () => {
    expect(message).toEqual({
      to: [ADDRESS],
      subject: PASSWORD_CHANGED_SUBJECT,
      lines: passwordChangedLines(CHANGED, SUPPORT),
      links: [],
      variant: 'account',
      identity: { stream: 'transactional', kind: 'password_changed', subjectId: NOTICE, recipientUserId: USER },
    });
    expect(message.subject).toBe('Your password was changed');
    expect(message.lines).toHaveLength(4);
  });

  it('is tagged with its kind, its notice and its user alone, none an address', () => {
    const tags = mailTags(message.identity);
    expect(tags).toEqual([
      { Name: 'tp_kind', Value: 'password_changed' },
      { Name: 'tp_subject', Value: NOTICE },
      { Name: 'tp_recipient', Value: USER },
    ]);
    expect(JSON.stringify(tags)).not.toContain('@');
  });

  it('says when in UTC to the minute and where to write, as text and as HTML, with no link of any kind', () => {
    const body = mailBody(message);
    for (const line of passwordChangedLines(CHANGED, SUPPORT)) {
      expect(body).toContain(line);
    }
    expect(body).toContain('2026-11-05 14:32 UTC');
    expect(body).toContain(SUPPORT);
    expect(body).not.toMatch(/http|href|<a/);
    for (const origin of [null, STATIC]) {
      const html = mailBodyHtml(message, origin);
      for (const line of passwordChangedLines(CHANGED, SUPPORT)) {
        expect(html).toContain(escapeHtml(line));
      }
      expect(html).toContain('2026-11-05 14:32 UTC');
      expect(html).toContain(escapeHtml(SUPPORT));
      expect(html).toContain(escapeHtml(AUTH_MAIL_FOOTER));
      expect(html).not.toMatch(/href|<a[\s>]/);
      // No URL but the lockup's on the static host, when there is one.
      expect([...html.matchAll(/https?:\/\/[^"'\s)]*/g)].map((match) => match[0].startsWith(`${STATIC}/brand/`))).toEqual(origin === null ? [] : [true]);
    }
  });
});

interface Answer {
  readonly stale?: readonly { notice_id: string; user_id: string }[];
  readonly due?: readonly { notice_id: string; user_id: string }[];
  /** The claim's row for each notice; none: another run holds it, or it is no longer due. */
  readonly claims?: Readonly<Record<string, { user_id: string; email: string; changed_at: Date }>>;
  readonly sentUndelivered?: boolean;
  readonly failedUndelivered?: boolean;
  readonly sentThrows?: Error;
}

/** An operator connection that answers the five functions as told and records every statement with its values. */
function client(answer: Answer) {
  const statements: { text: string; values: unknown[] }[] = [];
  return {
    statements,
    texts: () => statements.map((statement) => statement.text),
    query(text: string, values: unknown[] = []) {
      statements.push({ text, values });
      if (text.includes('operator_password_notices_stale')) {
        return Promise.resolve({ rows: [...(answer.stale ?? [])] });
      }
      if (text.includes('operator_password_notices_due')) {
        return Promise.resolve({ rows: [...(answer.due ?? [])] });
      }
      if (text.includes('operator_password_notice_claim')) {
        const row = answer.claims?.[String(values[0])];
        return Promise.resolve({ rows: row === undefined ? [] : [row] });
      }
      if (text.includes('operator_password_notice_sent')) {
        return answer.sentThrows === undefined ? Promise.resolve({ rows: [{ undelivered: answer.sentUndelivered ?? false }] }) : Promise.reject(answer.sentThrows);
      }
      if (text.includes('operator_password_notice_failed')) {
        return Promise.resolve({ rows: [{ undelivered: answer.failedUndelivered ?? false }] });
      }
      return Promise.resolve({ rows: [] });
    },
  };
}

function capture() {
  const lines: Record<string, unknown>[] = [];
  return { lines, logger: createLogger({ sink: (line) => lines.push(JSON.parse(line) as Record<string, unknown>) }) };
}

function refusing(name: string): MailSender {
  return { send: () => Promise.reject(Object.assign(new Error(`SYNTHETIC refused ${ADDRESS}`), { name })) };
}

const due = [{ notice_id: NOTICE, user_id: USER }];
const claims = { [NOTICE]: { user_id: USER, email: ADDRESS, changed_at: CHANGED } };

async function run(answer: Answer, mail: MailSender = new MemoryMailSender()) {
  const fake = client(answer);
  const { lines, logger } = capture();
  const options: PasswordNoticeOptions = { client: fake, mail, supportEmail: SUPPORT, requestId: JOB, logger };
  const result = await sendPasswordNotices(options);
  for (const line of lines) {
    for (const key of Object.keys(line).filter((field) => !['level', 'msg', 'time', 'service'].includes(field))) {
      expect(isAllowedLogField(key), key).toBe(true);
    }
  }
  expect(JSON.stringify(lines)).not.toMatch(/@|SYNTHETIC/);
  return { result, lines, statements: fake.statements, texts: fake.texts() };
}

describe('sendPasswordNotices (docs/adr/0091, D6)', () => {
  it('sweeps the stale notices first, then sends each due notice in one operator transaction from claim to record, with no practice in scope', async () => {
    const mail = new MemoryMailSender();
    const { result, lines, statements, texts } = await run({ due, claims }, mail);
    expect(result).toEqual({ stale: 0, sent: 1, failed: 0, undelivered: 0 });
    const scope = ['BEGIN', 'SET LOCAL ROLE tp_operator', "SELECT set_config('app.practice_ids', '{}', true)"];
    expect(texts).toEqual([
      ...scope,
      'SELECT notice_id, user_id FROM operator_password_notices_stale($1, $2)',
      'COMMIT',
      ...scope,
      'SELECT notice_id, user_id FROM operator_password_notices_due($1)',
      'COMMIT',
      ...scope,
      'SELECT user_id, email, changed_at FROM operator_password_notice_claim($1)',
      'SELECT operator_password_notice_sent($1, $2, $3) AS undelivered',
      'COMMIT',
    ]);
    const [message] = mail.sent;
    expect(statements.find((statement) => statement.text.includes('_stale'))?.values).toEqual([PASSWORD_NOTICE_RUN, JOB]);
    expect(statements.find((statement) => statement.text.includes('_due'))?.values).toEqual([PASSWORD_NOTICE_RUN]);
    expect(statements.find((statement) => statement.text.includes('_claim'))?.values).toEqual([NOTICE]);
    expect(statements.find((statement) => statement.text.includes('_sent'))?.values).toEqual([NOTICE, message?.messageId, JOB]);
    expect(mail.sent.map((sent) => sent.to)).toEqual([[ADDRESS]]);
    expect(message?.lines).toEqual(passwordChangedLines(CHANGED, SUPPORT));
    expect(lines).toEqual([expect.objectContaining({ level: 'info', msg: 'password notice sent', password_notice_id: NOTICE, user_id: USER })]);
    expect(PASSWORD_NOTICE_RUN).toBe(100);
  });

  it('skips a notice its claim does not return (another run holds it, or it is no longer due), sending nothing', async () => {
    const mail = new MemoryMailSender();
    const { result, lines, texts } = await run({ due, claims: {} }, mail);
    expect(result).toEqual({ stale: 0, sent: 0, failed: 0, undelivered: 0 });
    expect(mail.sent).toEqual([]);
    expect(texts.some((text) => text.includes('_sent') || text.includes('_failed'))).toBe(false);
    expect(lines).toEqual([]);
  });

  it('logs each stale notice once as not delivered (NoticeStale), by its ID and its user’s, and pages', async () => {
    const stale = [
      { notice_id: NOTICE, user_id: USER },
      { notice_id: OTHER_NOTICE, user_id: OTHER_USER },
    ];
    const { result, lines } = await run({ stale });
    expect(result).toEqual({ stale: 2, sent: 0, failed: 0, undelivered: 2 });
    expect(lines).toEqual(
      stale.map(
        (row): unknown =>
          expect.objectContaining({
            level: 'error',
            msg: 'password notice not delivered',
            password_notice_id: row.notice_id,
            user_id: row.user_id,
            undelivered_reason_code: 'NoticeStale',
            error_code: MAIL_LOG_CODES.passwordNoticeUndelivered,
          }),
      ),
    );
    expect(MAIL_LOG_CODES.passwordNoticeUndelivered).toBe('PASSWORD_NOTICE_UNDELIVERED');
  });

  it('logs a sent notice the record found bounced, suppressed or rejected first as not delivered (sent_undelivered)', async () => {
    const { result, lines } = await run({ due, claims, sentUndelivered: true });
    expect(result).toEqual({ stale: 0, sent: 1, failed: 0, undelivered: 1 });
    expect(lines).toEqual([
      expect.objectContaining({ level: 'info', msg: 'password notice sent', password_notice_id: NOTICE }),
      expect.objectContaining({ level: 'error', msg: 'password notice not delivered', password_notice_id: NOTICE, user_id: USER, undelivered_reason_code: 'sent_undelivered', error_code: 'PASSWORD_NOTICE_UNDELIVERED' }),
    ]);
  });

  it('rolls a refused send back and records the attempt in a new transaction, by the error’s name alone, permanent or not', async () => {
    for (const [name, permanent] of [
      ['Throttling', false],
      ['MessageRejected', true],
      ['AccountSuspendedException', true],
    ] as const) {
      const { result, lines, statements, texts } = await run({ due, claims }, refusing(name));
      expect(result, name).toEqual({ stale: 0, sent: 0, failed: 1, undelivered: 0 });
      const claimAt = texts.indexOf('SELECT user_id, email, changed_at FROM operator_password_notice_claim($1)');
      expect(texts.slice(claimAt, claimAt + 5), name).toEqual([
        'SELECT user_id, email, changed_at FROM operator_password_notice_claim($1)',
        'ROLLBACK',
        'BEGIN',
        'SET LOCAL ROLE tp_operator',
        "SELECT set_config('app.practice_ids', '{}', true)",
      ]);
      expect(statements.find((statement) => statement.text.includes('_failed'))?.values, name).toEqual([NOTICE, name, permanent, JOB]);
      expect(texts.some((text) => text.includes('_sent')), name).toBe(false);
      expect(lines, name).toEqual([expect.objectContaining({ level: 'warn', msg: 'password notice send failed', password_notice_id: NOTICE, error_code: name })]);
    }
  });

  it('names an error that is not shaped like SES’s Unrecognized, never by its message', async () => {
    const { statements } = await run({ due, claims }, refusing('Not A Name'));
    expect(statements.find((statement) => statement.text.includes('_failed'))?.values).toEqual([NOTICE, 'Unrecognized', false, JOB]);
  });

  it('logs a notice that failed for good (a permanent error, or the fifth try) as not delivered, by the error’s name', async () => {
    const { result, lines } = await run({ due, claims, failedUndelivered: true }, refusing('MessageRejected'));
    expect(result).toEqual({ stale: 0, sent: 0, failed: 1, undelivered: 1 });
    expect(lines).toEqual([
      expect.objectContaining({ level: 'warn', msg: 'password notice send failed', error_code: 'MessageRejected' }),
      expect.objectContaining({ level: 'error', msg: 'password notice not delivered', password_notice_id: NOTICE, user_id: USER, undelivered_reason_code: 'MessageRejected', error_code: 'PASSWORD_NOTICE_UNDELIVERED' }),
    ]);
  });

  it('leaves the notice pending and fails the job when SES accepted the message but its record failed, recording no failed attempt', async () => {
    const refused = Object.assign(new Error('could not serialize'), { code: '40001' });
    const fake = client({ due, claims, sentThrows: refused });
    const mail = new MemoryMailSender();
    await expect(sendPasswordNotices({ client: fake, mail, supportEmail: SUPPORT, requestId: JOB })).rejects.toBe(refused);
    expect(mail.sent).toHaveLength(1);
    expect(fake.texts().at(-1)).toBe('ROLLBACK');
    expect(fake.texts().some((text) => text.includes('_failed'))).toBe(false);
  });

  it('builds every message with the claim’s address and time, and nothing from the due list', async () => {
    const mail = new MemoryMailSender();
    const later = new Date('2026-11-06T09:01:00Z');
    await run({ due, claims: { [NOTICE]: { user_id: USER, email: ADDRESS, changed_at: later } } }, mail);
    const sent = mail.sent[0] as MailMessage | undefined;
    expect(sent?.lines[0]).toContain('2026-11-06 09:01 UTC');
  });
});
