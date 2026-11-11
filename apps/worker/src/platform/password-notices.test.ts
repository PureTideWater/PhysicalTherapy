import { AUTH_MAIL_FOOTER, PASSWORD_CHANGED_SUBJECT, passwordChangedLines } from '@tp/auth-mail';
import { createLogger, isAllowedLogField } from '@tp/observability';
import { describe, expect, it } from 'vitest';

import { type MailMessage, type MailSender, MemoryMailSender, mailBody, mailBodyHtml } from '../mail/mail';
import { MAIL_LOG_CODES, mailTags } from '../mail/streams';
import { escapeHtml } from '../report/escape';
import { PASSWORD_NOTICE_RECORD_FAILED, PASSWORD_NOTICE_RUN, PASSWORD_NOTICE_RUN_MS, type PasswordNoticeOptions, passwordNoticeMessage, sendPasswordNotices } from './password-notices';

/**
 * The password-changed notice's message and the job's steps, without a database (SGN-16; docs/adr/0091): the message is
 * @tp/auth-mail's words (its second line by whether the account has a second factor enrolled) in the 'account' variant
 * on the transactional stream, with no link and with Reply-To the support address; the job sweeps stale notices first,
 * sends each due notice in its own transaction as the operator with no practice in scope, records a refused send in a
 * new one, counts a record that fails after SES accepted the message as a try (RecordFailed) and still fails, stops
 * claiming once it has spent 8 seconds sending, and logs IDs and codes only. The database's half is
 * password-notices.db.test.ts.
 */

const NOTICE = '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e01';
const USER = '3d4e5f6a-7b8c-4d9e-8f0a-1b2c3d4e5f02';
const OTHER_NOTICE = '4e5f6a7b-8c9d-4e0f-9a1b-2c3d4e5f6a03';
const OTHER_USER = '5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b04';
const THIRD_NOTICE = '7b8c9d0e-1f2a-4b3c-8d4e-5f6a7b8c9d06';
const THIRD_USER = '8c9d0e1f-2a3b-4c4d-9e5f-6a7b8c9d0e07';
const SUPPORT = 'support@synthetic.test';
const ADDRESS = `${USER}@synthetic.test`;
const CHANGED = new Date('2026-11-05T14:32:59Z');
const STATIC = 'https://static.synthetic.test';
const JOB = '6a7b8c9d-0e1f-4a2b-9c3d-4e5f6a7b8c05';

describe('the password-changed message (docs/adr/0091; design 3.4)', () => {
  const message = passwordNoticeMessage({ notice_id: NOTICE, user_id: USER }, ADDRESS, CHANGED, SUPPORT, true);

  it('goes to the one address, with @tp/auth-mail’s subject and four lines, no link, the account variant, on the transactional stream, with Reply-To the support address', () => {
    expect(message).toEqual({
      to: [ADDRESS],
      subject: PASSWORD_CHANGED_SUBJECT,
      lines: passwordChangedLines(CHANGED, SUPPORT, true),
      links: [],
      variant: 'account',
      replyTo: SUPPORT,
      identity: { stream: 'transactional', kind: 'password_changed', subjectId: NOTICE, recipientUserId: USER },
    });
    expect(message.subject).toBe('Your password was changed');
    expect(message.lines).toHaveLength(4);
  });

  it('tells an account with no second factor enrolled only that its sessions ended, never that signing in still asks for one (docs/adr/0091, R3); nothing else of the message differs', () => {
    const narrower = passwordNoticeMessage({ notice_id: NOTICE, user_id: USER }, ADDRESS, CHANGED, SUPPORT, false);
    expect(narrower).toEqual({ ...message, lines: passwordChangedLines(CHANGED, SUPPORT, false) });
    expect(narrower.lines[1]).toBe('Every session of this account has ended.');
    expect(message.lines[1]).toBe('Every session of this account has ended. Signing in still asks for your authenticator code or hardware key.');
    for (const sent of [mailBody(narrower), mailBodyHtml(narrower, null), mailBodyHtml(narrower, STATIC)]) {
      expect(sent).not.toMatch(/authenticator|hardware key|still asks/i);
    }
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

  it('says when in UTC to the minute and where to write, as text and as HTML, each ending with the account footer, with no link of any kind', () => {
    const body = mailBody(message);
    for (const line of passwordChangedLines(CHANGED, SUPPORT, true)) {
      expect(body).toContain(line);
    }
    expect(body).toContain('2026-11-05 14:32 UTC');
    expect(body).toContain(SUPPORT);
    expect(body).not.toMatch(/http|href|<a/);
    // The text alternative ends with a blank line and the footer the HTML carries (docs/adr/0091, R11).
    expect(body).toBe(`${passwordChangedLines(CHANGED, SUPPORT, true).join('\n')}\n\n${AUTH_MAIL_FOOTER}`);
    for (const origin of [null, STATIC]) {
      const html = mailBodyHtml(message, origin);
      for (const line of passwordChangedLines(CHANGED, SUPPORT, true)) {
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

interface Statement {
  readonly text: string;
  readonly values: unknown[];
}

interface Answer {
  readonly stale?: readonly { notice_id: string; user_id: string }[];
  readonly due?: readonly { notice_id: string; user_id: string }[];
  /** The claim's row for each notice; none: another run holds it, or it is no longer due. */
  readonly claims?: Readonly<Record<string, { user_id: string; email: string; changed_at: Date; mfa_enrolled: boolean }>>;
  readonly sentUndelivered?: boolean;
  readonly failedUndelivered?: boolean;
  readonly sentThrows?: Error;
  /** Called with every statement so far, the last the one being answered: an error it returns is that statement's answer. */
  readonly on?: (statements: readonly Statement[]) => Error | undefined;
}

const CLAIM = 'SELECT user_id, email, changed_at, mfa_enrolled FROM operator_password_notice_claim($1)';
const SENT = 'SELECT operator_password_notice_sent($1, $2, $3) AS undelivered';
const FAILED = 'SELECT operator_password_notice_failed($1, $2, $3, $4) AS undelivered';
/** How asOperator opens each transaction: the operator role, with no practice in scope. */
const SCOPE = ['BEGIN', 'SET LOCAL ROLE tp_operator', "SELECT set_config('app.practice_ids', '{}', true)"];

/** An operator connection that answers the five functions as told and records every statement with its values. */
function client(answer: Answer) {
  const statements: Statement[] = [];
  return {
    statements,
    texts: () => statements.map((statement) => statement.text),
    query(text: string, values: unknown[] = []) {
      statements.push({ text, values });
      const thrown = answer.on?.(statements);
      if (thrown !== undefined) {
        return Promise.reject(thrown);
      }
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
const claims = { [NOTICE]: { user_id: USER, email: ADDRESS, changed_at: CHANGED, mfa_enrolled: true } };

/** Every key a line carries is allowlisted, and no value is an address or an error's text. */
function idsOnly(lines: readonly Record<string, unknown>[]): void {
  for (const line of lines) {
    for (const key of Object.keys(line).filter((field) => !['level', 'msg', 'time', 'service'].includes(field))) {
      expect(isAllowedLogField(key), key).toBe(true);
    }
  }
  expect(JSON.stringify(lines)).not.toMatch(/@|SYNTHETIC/);
}

async function run(answer: Answer, mail: MailSender = new MemoryMailSender(), now?: () => number) {
  const fake = client(answer);
  const { lines, logger } = capture();
  const options: PasswordNoticeOptions = { client: fake, mail, supportEmail: SUPPORT, requestId: JOB, logger, ...(now === undefined ? {} : { now }) };
  const result = await sendPasswordNotices(options);
  idsOnly(lines);
  return { result, lines, statements: fake.statements, texts: fake.texts() };
}

/** A run that fails: the error it rejected with, and what it did before. */
async function failedRun(answer: Answer, mail: MailSender = new MemoryMailSender()) {
  const fake = client(answer);
  const { lines, logger } = capture();
  const error: unknown = await sendPasswordNotices({ client: fake, mail, supportEmail: SUPPORT, requestId: JOB, logger }).then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  idsOnly(lines);
  return { error, lines, statements: fake.statements, texts: fake.texts() };
}

describe('sendPasswordNotices (docs/adr/0091, D6)', () => {
  it('sweeps the stale notices first, then sends each due notice in one operator transaction from claim to record, with no practice in scope', async () => {
    const mail = new MemoryMailSender();
    const { result, lines, statements, texts } = await run({ due, claims }, mail);
    expect(result).toEqual({ stale: 0, sent: 1, failed: 0, undelivered: 0 });
    expect(texts).toEqual([
      ...SCOPE,
      'SELECT notice_id, user_id FROM operator_password_notices_stale($1, $2)',
      'COMMIT',
      ...SCOPE,
      'SELECT notice_id, user_id FROM operator_password_notices_due($1)',
      'COMMIT',
      ...SCOPE,
      CLAIM,
      SENT,
      'COMMIT',
    ]);
    const [message] = mail.sent;
    expect(statements.find((statement) => statement.text.includes('_stale'))?.values).toEqual([PASSWORD_NOTICE_RUN, JOB]);
    expect(statements.find((statement) => statement.text.includes('_due'))?.values).toEqual([PASSWORD_NOTICE_RUN]);
    expect(statements.find((statement) => statement.text.includes('_claim'))?.values).toEqual([NOTICE]);
    expect(statements.find((statement) => statement.text.includes('_sent'))?.values).toEqual([NOTICE, message?.messageId, JOB]);
    expect(mail.sent.map((sent) => sent.to)).toEqual([[ADDRESS]]);
    expect(message?.lines).toEqual(passwordChangedLines(CHANGED, SUPPORT, true));
    expect(message?.replyTo).toBe(SUPPORT);
    expect(lines).toEqual([expect.objectContaining({ level: 'info', msg: 'password notice sent', password_notice_id: NOTICE, user_id: USER })]);
    expect(PASSWORD_NOTICE_RUN).toBe(100);
  });

  it('writes the second line by the claim’s mfa_enrolled: an account with no second factor is never told one still guards it (docs/adr/0091, R3)', async () => {
    const mail = new MemoryMailSender();
    await run({ due, claims: { [NOTICE]: { user_id: USER, email: ADDRESS, changed_at: CHANGED, mfa_enrolled: false } } }, mail);
    expect(mail.sent[0]?.lines).toEqual(passwordChangedLines(CHANGED, SUPPORT, false));
    expect(mail.sent[0]?.lines[1]).toBe('Every session of this account has ended.');
    expect(`${mail.sent[0]?.body ?? ''} ${mail.sent[0]?.html ?? ''}`).not.toMatch(/authenticator|hardware key|still asks/i);
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
      expect(texts.slice(texts.indexOf(CLAIM)), name).toEqual([CLAIM, 'ROLLBACK', ...SCOPE, FAILED, 'COMMIT']);
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

  it('builds every message with the claim’s address and time, and nothing from the due list', async () => {
    const mail = new MemoryMailSender();
    const later = new Date('2026-11-06T09:01:00Z');
    await run({ due, claims: { [NOTICE]: { user_id: USER, email: ADDRESS, changed_at: later, mfa_enrolled: true } } }, mail);
    const sent = mail.sent[0] as MailMessage | undefined;
    expect(sent?.lines[0]).toContain('2026-11-06 09:01 UTC');
  });
});

describe('a record that fails after SES accepted the message (docs/adr/0091, R7)', () => {
  /** What the database answers when it refuses the record: a SQLSTATE and a text that is never logged. */
  const refused = Object.assign(new Error('SYNTHETIC a password notice is recorded with the message ID SES gave'), { code: '23514' });
  const recordFailedLine: unknown = expect.objectContaining({ level: 'warn', msg: 'password notice record failed', password_notice_id: NOTICE, user_id: USER, error_code: 'RecordFailed' });

  it('is counted as a try, RecordFailed and never permanent, in a new transaction after the rollback; then the job fails with the record’s own error', async () => {
    const mail = new MemoryMailSender();
    const { error, lines, statements, texts } = await failedRun({ due, claims, sentThrows: refused }, mail);
    expect(error).toBe(refused);
    expect(mail.sent).toHaveLength(1);
    expect(texts.slice(texts.indexOf(CLAIM))).toEqual([CLAIM, SENT, 'ROLLBACK', ...SCOPE, FAILED, 'COMMIT']);
    expect(statements.find((statement) => statement.text.includes('_failed'))?.values).toEqual([NOTICE, 'RecordFailed', false, JOB]);
    expect(PASSWORD_NOTICE_RECORD_FAILED).toBe('RecordFailed');
    // Not sent as far as the record goes, and not yet failed for good: one line names the notice, and nothing pages.
    expect(lines).toEqual([recordFailedLine]);
  });

  it('counts a commit that fails after the record the same way', async () => {
    const lost = Object.assign(new Error('SYNTHETIC the commit failed'), { code: '40001' });
    const { error, statements, texts } = await failedRun({ due, claims, on: (all) => (all.at(-1)?.text === 'COMMIT' && all.at(-2)?.text === SENT ? lost : undefined) });
    expect(error).toBe(lost);
    expect(texts.slice(texts.indexOf(CLAIM))).toEqual([CLAIM, SENT, 'COMMIT', 'ROLLBACK', ...SCOPE, FAILED, 'COMMIT']);
    expect(statements.find((statement) => statement.text.includes('_failed'))?.values).toEqual([NOTICE, 'RecordFailed', false, JOB]);
  });

  it('logs the notice not delivered, as RecordFailed, when that try was its fifth, before the job fails', async () => {
    const { error, lines } = await failedRun({ due, claims, sentThrows: refused, failedUndelivered: true });
    expect(error).toBe(refused);
    expect(lines).toEqual([
      recordFailedLine,
      expect.objectContaining({ level: 'error', msg: 'password notice not delivered', password_notice_id: NOTICE, user_id: USER, undelivered_reason_code: 'RecordFailed', error_code: 'PASSWORD_NOTICE_UNDELIVERED' }),
    ]);
  });

  it('fails the job with the first error when the try cannot be recorded either, and reports nothing', async () => {
    const second = Object.assign(new Error('SYNTHETIC lost connection'), { code: '08006' });
    const { error, lines, texts } = await failedRun({ due, claims, sentThrows: refused, failedUndelivered: true, on: (all) => (all.at(-1)?.text === FAILED ? second : undefined) });
    expect(error).toBe(refused);
    expect(texts.slice(texts.indexOf(CLAIM))).toEqual([CLAIM, SENT, 'ROLLBACK', ...SCOPE, FAILED, 'ROLLBACK']);
    expect(lines).toEqual([recordFailedLine]);
  });

  it('ends the run there: the notices after it wait for the next run, by which time this one has backed off', async () => {
    const mail = new MemoryMailSender();
    const two = [...due, { notice_id: OTHER_NOTICE, user_id: OTHER_USER }];
    const both = { ...claims, [OTHER_NOTICE]: { user_id: OTHER_USER, email: `${OTHER_USER}@synthetic.test`, changed_at: CHANGED, mfa_enrolled: true } };
    const { error, statements } = await failedRun({ due: two, claims: both, on: (all) => (all.at(-1)?.text === SENT && all.at(-1)?.values[0] === NOTICE ? refused : undefined) }, mail);
    expect(error).toBe(refused);
    expect(statements.filter((statement) => statement.text === CLAIM).map((statement) => statement.values[0])).toEqual([NOTICE]);
    expect(mail.sent.map((sent) => sent.identity.subjectId)).toEqual([NOTICE]);
  });

  it('counts nothing for an error before the send: a claim that fails, or a commit after a claim that returned nothing, is rethrown as it was', async () => {
    const down = Object.assign(new Error('SYNTHETIC the claim failed'), { code: '57014' });
    for (const [name, answer] of [
      ['the claim', { due, claims, on: (all) => (all.at(-1)?.text === CLAIM ? down : undefined) }],
      ['the commit of a claim that returned nothing', { due, claims: {}, on: (all) => (all.at(-1)?.text === 'COMMIT' && all.at(-2)?.text === CLAIM ? down : undefined) }],
    ] satisfies [string, Answer][]) {
      const mail = new MemoryMailSender();
      const { error, lines, texts } = await failedRun(answer, mail);
      expect(error, name).toBe(down);
      expect(mail.sent, name).toEqual([]);
      expect(texts.at(-1), name).toBe('ROLLBACK');
      expect(texts.some((text) => text.includes('_failed')), name).toBe(false);
      expect(lines, name).toEqual([]);
    }
  });
});

describe('a run’s 8 seconds of sending (docs/adr/0091, R10)', () => {
  const three = [
    { notice_id: NOTICE, user_id: USER },
    { notice_id: OTHER_NOTICE, user_id: OTHER_USER },
    { notice_id: THIRD_NOTICE, user_id: THIRD_USER },
  ];
  const all = Object.fromEntries(three.map((row) => [row.notice_id, { user_id: row.user_id, email: `${row.user_id}@synthetic.test`, changed_at: CHANGED, mfa_enrolled: true }]));
  const claimed = (statements: readonly Statement[]) => statements.filter((statement) => statement.text === CLAIM).map((statement) => statement.values[0]);

  /** A sender whose every send takes `ms` on the run's clock, and that clock. */
  function taking(ms: number) {
    const memory = new MemoryMailSender();
    const clock = { at: 1_762_000_000_000 };
    const mail: MailSender = {
      send: (message) => {
        clock.at += ms;
        return memory.send(message);
      },
    };
    return { memory, clock, mail };
  }

  it('stops claiming once it has spent 8 seconds sending, and leaves the rest pending for the next run: never claimed, sent or failed', async () => {
    const { memory, clock, mail } = taking(4_000);
    const { result, lines, statements, texts } = await run({ due: three, claims: all }, mail, () => clock.at);
    expect(PASSWORD_NOTICE_RUN_MS).toBe(8_000);
    expect(result).toEqual({ stale: 0, sent: 2, failed: 0, undelivered: 0 });
    expect(claimed(statements)).toEqual([NOTICE, OTHER_NOTICE]);
    expect(memory.sent.map((sent) => sent.identity.subjectId)).toEqual([NOTICE, OTHER_NOTICE]);
    expect(texts.some((text) => text.includes('_failed'))).toBe(false);
    expect(texts.at(-1)).toBe('COMMIT');
    expect(lines.map((line) => line.password_notice_id)).toEqual([NOTICE, OTHER_NOTICE]);
  });

  it('claims a notice with a millisecond of the 8 seconds left, and none with none', async () => {
    for (const [ms, sent] of [
      [7_999, 2],
      [8_000, 1],
    ] as const) {
      const { clock, mail } = taking(ms);
      const { result, statements } = await run({ due: three, claims: all }, mail, () => clock.at);
      expect(result.sent, String(ms)).toBe(sent);
      expect(claimed(statements), String(ms)).toHaveLength(sent);
    }
  });

  it('counts from when it begins sending: the sweep’s and the due list’s time is not spent, so the first due notice is always tried', async () => {
    const { memory, clock, mail } = taking(1);
    // The sweep and the due list each take a minute on the run's clock.
    const slowLists = (statements: readonly Statement[]) => {
      if (/_stale|_due/.test(statements.at(-1)?.text ?? '')) {
        clock.at += 60_000;
      }
      return undefined;
    };
    const { result } = await run({ due: three, claims: all, on: slowLists }, mail, () => clock.at);
    expect(result).toEqual({ stale: 0, sent: 3, failed: 0, undelivered: 0 });
    expect(memory.sent).toHaveLength(3);
  });

  it('counts a refused send’s time too: the tries of a run are bounded together, whatever each came to', async () => {
    const clock = { at: 0 };
    const slowRefusal: MailSender = {
      send: () => {
        clock.at += 5_000;
        return Promise.reject(Object.assign(new Error(`SYNTHETIC refused ${ADDRESS}`), { name: 'Throttling' }));
      },
    };
    const { result, statements } = await run({ due: three, claims: all }, slowRefusal, () => clock.at);
    expect(result).toEqual({ stale: 0, sent: 0, failed: 2, undelivered: 0 });
    expect(claimed(statements)).toEqual([NOTICE, OTHER_NOTICE]);
  });
});
