import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { type DatabaseClient, type DatabasePool, databaseClient, openPool, readDatabaseUrl } from '@tp/db';
import { type MigratedDatabase, asOwner, createMigratedDatabase, createUser } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { NoInboxError, createPlatformHandlers } from '../jobs/platform';
import { MemoryMailSender } from '../mail/mail';
import { LocalSupportInbox, type SupportInbox, mailRef } from './inbox';
import { MAILS_PER_RUN, WITHHELD_MESSAGE, WITHHELD_SUBJECT, readSupportMail } from './support-mail';

/**
 * Mail to the support address opens a ticket (PRD 19, Support; docs/adr/0055), against a real database: a
 * message from an account's address opens a ticket in that person's name, once however often the job runs; one
 * that looks like it holds patient information opens a ticket that says only that it came; an unknown or disabled
 * sender, an unverified sender and an unreadable message open none; only the operator role records mail. Synthetic
 * people and messages only.
 */

let database: MigratedDatabase;
let owner: DatabaseClient;
let operator: DatabasePool;
let app: DatabasePool;
let dir: string;
let requester: string;
let disabled: string;

const eml = (from: string, subject: string, body: string) => ['From: ' + from, 'To: support@synthetic.test', `Subject: ${subject}`, '', body].join('\r\n');

async function emailOf(userId: string): Promise<string> {
  return asOwner(owner, [], async () => ((await owner.query<{ email: string }>('SELECT email FROM "user" WHERE id = $1', [userId])).rows[0]?.email ?? ''));
}

async function tickets(): Promise<{ requester_id: string; screen: string; category: string; subject: string; message: string; source: string; mail_ref: string | null }[]> {
  return asOwner(owner, [], async () => (await owner.query<{ requester_id: string; screen: string; category: string; subject: string; message: string; source: string; mail_ref: string | null }>("SELECT requester_id, screen, category, subject, message, source, mail_ref FROM support_ticket WHERE source = 'mail' ORDER BY number")).rows);
}

async function receipts(): Promise<{ mail_ref: string; outcome: string }[]> {
  return asOwner(owner, [], async () => (await owner.query<{ mail_ref: string; outcome: string }>('SELECT mail_ref, outcome FROM support_mail_receipt ORDER BY mail_ref')).rows);
}

async function run(inbox: SupportInbox, requestId = 'job-support-mail') {
  const client = await operator.connect();
  try {
    return await readSupportMail({ client, inbox, requestId });
  } finally {
    client.release();
  }
}

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = databaseClient(database.url);
  await owner.connect();
  operator = openPool(database.url, 2);
  app = openPool(database.appUrl, 2);
  requester = await createUser(owner);
  disabled = await createUser(owner, { status: 'disabled' });
  dir = await mkdtemp(path.join(tmpdir(), 'tp-support-inbox-'));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
  await app.end();
  await operator.end();
  await owner.end();
  await database.drop();
});

describe('support mail', () => {
  it('opens a ticket for a known sender once, withholds patient-like text, and opens none for an unknown or disabled sender or an unreadable message', async () => {
    const address = await emailOf(requester);
    await writeFile(path.join(dir, '1-question.eml'), eml(`Someone Synthetic <${address.toUpperCase()}>`, 'Where is the export button?', 'I cannot find it on the packet screen of case 7d0c3d0e.'));
    await writeFile(path.join(dir, '2-patient.eml'), eml(address, 'Underpaid claim', 'Patient Zephyra Quillon, born March 3 1961, member ZQ4455667 was underpaid.'));
    await writeFile(path.join(dir, '3-unknown.eml'), eml('nobody@synthetic.test', 'Hello', 'Is anyone there?'));
    await writeFile(path.join(dir, '4-disabled.eml'), eml(await emailOf(disabled), 'Hello', 'I was turned off.'));
    await writeFile(path.join(dir, '5-empty.eml'), eml(address, 'No text', ''));
    await writeFile(path.join(dir, 'not-a-message.txt'), 'ignored');
    const inbox = new LocalSupportInbox(dir);

    const first = await run(inbox);
    expect(first).toEqual({ read: 5, waiting: 0, outcomes: { opened: 1, withheld: 1, unknown_sender: 2, unverified_sender: 0, unreadable: 1 } });
    const opened = await tickets();
    expect(opened).toEqual([
        {
          requester_id: requester,
          screen: 'email',
          category: 'other',
          subject: 'Where is the export button?',
          message: 'I cannot find it on the packet screen of case 7d0c3d0e.',
          source: 'mail',
          mail_ref: mailRef('1-question.eml'),
        },
        { requester_id: requester, screen: 'email', category: 'other', subject: WITHHELD_SUBJECT, message: WITHHELD_MESSAGE, source: 'mail', mail_ref: mailRef('2-patient.eml') },
    ]);
    // Nothing the patient-like message said reached the database.
    const everything = JSON.stringify(await asOwner(owner, [], async () => (await owner.query<Record<string, unknown>>('SELECT * FROM support_ticket')).rows));
    expect(everything).not.toContain('Quillon');
    expect(everything).not.toContain('ZQ4455667');
    expect((await receipts()).map((row) => row.outcome).sort()).toEqual(['opened', 'unknown_sender', 'unknown_sender', 'unreadable', 'withheld']);
    const audit = await asOwner(owner, [], async () => (await owner.query<{ actor_kind: string; purpose: string; request_id: string }>("SELECT actor_kind, purpose, request_id FROM audit_event WHERE action = 'support_ticket_opened'")).rows);
    expect(audit).toEqual([
      { actor_kind: 'system', purpose: 'mail', request_id: 'job-support-mail' },
      { actor_kind: 'system', purpose: 'mail', request_id: 'job-support-mail' },
    ]);

    // Every message is read once: the next run reads nothing, and a message recorded already keeps its first outcome.
    expect(await run(inbox)).toEqual({ read: 0, waiting: 0, outcomes: { opened: 0, withheld: 0, unknown_sender: 0, unverified_sender: 0, unreadable: 0 } });
    const client = await operator.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE tp_operator');
      const again = await client.query<{ outcome: string; ticket_number: string | null }>("SELECT outcome, ticket_number FROM operator_record_support_mail($1, 'ticket', $2, 'Again', 'Again', 'job-again')", [mailRef('1-question.eml'), address]);
      expect(again.rows[0]?.outcome).toBe('opened');
      expect(again.rows[0]?.ticket_number).not.toBeNull();
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    expect(await tickets()).toHaveLength(2);

    // The requester sees the mailed ticket among their own.
    const own = await app.connect();
    try {
      await own.query('BEGIN');
      await own.query("SELECT set_config('app.actor_id', $1, true), set_config('app.practice_ids', '{}', true)", [requester]);
      expect((await own.query<{ subject: string }>("SELECT subject FROM support_ticket WHERE source = 'mail' ORDER BY number")).rows.map((row) => row.subject)).toEqual(['Where is the export button?', WITHHELD_SUBJECT]);
      await own.query('ROLLBACK');
    } finally {
      own.release();
    }
  });

  it('opens no ticket for a sender the inbox could not verify, and reads at most a run’s worth at a time', async () => {
    const address = await emailOf(requester);
    const messages = Array.from({ length: MAILS_PER_RUN + 2 }, (_, index) => ({ ref: mailRef(`unverified-${String(index)}`), location: `unverified-${String(index)}`, sizeBytes: 10 }));
    const unverified: SupportInbox = {
      kind: 's3',
      verifiesSenders: true,
      list: () => Promise.resolve(messages),
      read: () => Promise.resolve(Buffer.from(eml(address, 'Forged?', 'No SES verdicts above me.'))),
    };
    const first = await run(unverified);
    expect(first.read).toBe(MAILS_PER_RUN);
    expect(first.waiting).toBe(2);
    expect(first.outcomes.unverified_sender).toBe(MAILS_PER_RUN);
    expect(await run(unverified)).toMatchObject({ read: 2, waiting: 0 });
    const tooLarge: SupportInbox = { ...unverified, list: () => Promise.resolve([{ ref: mailRef('too-large'), location: 'too-large', sizeBytes: 2_000_000 }]), read: () => Promise.resolve(null) };
    expect((await run(tooLarge)).outcomes.unreadable).toBe(1);
    expect(await tickets()).toHaveLength(2);
  });

  it('records mail only as the operator role, never as the application', async () => {
    const client = await app.connect();
    try {
      await expect(client.query("SELECT * FROM operator_record_support_mail($1, 'unreadable', NULL, NULL, NULL, NULL)", [mailRef('app')])).rejects.toThrow(/permission denied/);
      await expect(client.query("SELECT * FROM operator_support_mail_read('{}'::text[])")).rejects.toThrow(/permission denied/);
      await expect(client.query('SELECT * FROM support_mail_receipt')).rejects.toThrow(/permission denied/);
    } finally {
      client.release();
    }
    const asOperator = await operator.connect();
    try {
      await asOperator.query('BEGIN');
      await asOperator.query('SET LOCAL ROLE tp_operator');
      await expect(asOperator.query('SELECT * FROM support_mail_receipt')).rejects.toThrow(/permission denied/);
      await asOperator.query('ROLLBACK');
      await asOperator.query('BEGIN');
      await asOperator.query('SET LOCAL ROLE tp_operator');
      await expect(asOperator.query("SELECT * FROM operator_record_support_mail('not-a-hash', 'ticket', NULL, NULL, NULL, NULL)")).rejects.toThrow(/SHA-256/);
      await asOperator.query('ROLLBACK');
      await asOperator.query('BEGIN');
      await asOperator.query('SET LOCAL ROLE tp_operator');
      await expect(asOperator.query("SELECT * FROM operator_record_support_mail($1, 'opened', NULL, NULL, NULL, NULL)", [mailRef('x')])).rejects.toThrow(/ticket, withheld/);
      await asOperator.query('ROLLBACK');
    } finally {
      asOperator.release();
    }
    // A form ticket cannot claim to be mail, and a mailed ticket cannot lose its source.
    const form = await app.connect();
    try {
      await form.query('BEGIN');
      await form.query("SELECT set_config('app.actor_id', $1, true), set_config('app.practice_ids', '{}', true)", [requester]);
      await expect(form.query("INSERT INTO support_ticket (requester_id, screen, category, subject, message, source, mail_ref) VALUES (app_actor_id(), 'email', 'other', 's', 'm', 'mail', $1)", [mailRef('forged')])).rejects.toThrow(
        /permission denied/,
      );
      await form.query('ROLLBACK');
    } finally {
      form.release();
    }
    await expect(asOwner(owner, [], () => owner.query("UPDATE support_ticket SET source = 'form', mail_ref = NULL WHERE source = 'mail'"))).rejects.toThrow(/keeps what its requester wrote/);
  });

  it('runs as the support_mail job, logging codes only, and refuses to run without an inbox', async () => {
    const lines: Record<string, unknown>[] = [];
    const logger = createLogger({ sink: (line) => lines.push(JSON.parse(line) as Record<string, unknown>) });
    const address = await emailOf(requester);
    const jobDir = await mkdtemp(path.join(tmpdir(), 'tp-support-job-'));
    try {
      await writeFile(path.join(jobDir, 'job.eml'), eml(address, 'From the job', 'A question for the desk.'));
      await writeFile(path.join(jobDir, 'job-unknown.eml'), eml('stranger@synthetic.test', 'Hi', 'Hello.'));
      await writeFile(path.join(jobDir, 'job-withheld.eml'), eml(address, 'Claim', 'Member ID ZQ4455667 again.'));
      const handlers = createPlatformHandlers({
        operator,
        store: { putImmutable: () => Promise.reject(new Error('not used')), head: () => Promise.resolve(null) },
        restorer: { restoreLatest: () => Promise.reject(new Error('not used')) },
        mail: new MemoryMailSender(),
        appOrigin: 'http://localhost:3000',
        inbox: new LocalSupportInbox(jobDir),
      });
      await handlers.support_mail({}, { jobId: 'job-mail-1', logger });
      expect(lines.map((line) => [line.msg, line.error_code ?? null])).toEqual([
        ['support mail opened tickets', null],
        ['support mail looked like it held patient information; its tickets say only that it came', 'SUPPORT_MAIL_WITHHELD'],
        ['support mail opened no ticket for some messages: unverified or unknown senders, or unreadable', 'SUPPORT_MAIL_REFUSED'],
      ]);
      const logged = JSON.stringify(lines);
      for (const text of [address, 'stranger', 'From the job', 'ZQ4455667', 'job.eml']) {
        expect(logged).not.toContain(text);
      }
      lines.length = 0;
      await handlers.support_mail({}, { jobId: 'job-mail-2', logger });
      expect(lines).toEqual([]);
      const without = createPlatformHandlers({
        operator,
        store: { putImmutable: () => Promise.reject(new Error('not used')), head: () => Promise.resolve(null) },
        restorer: { restoreLatest: () => Promise.reject(new Error('not used')) },
        mail: new MemoryMailSender(),
        appOrigin: 'http://localhost:3000',
      });
      await expect(without.support_mail({}, { jobId: 'job-mail-3', logger })).rejects.toThrow(NoInboxError);
    } finally {
      await rm(jobDir, { recursive: true, force: true });
    }
    // A missing directory is an empty inbox.
    expect(await new LocalSupportInbox(path.join(dir, 'missing')).list()).toEqual([]);
  });
});
