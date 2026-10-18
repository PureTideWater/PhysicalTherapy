import { OPERATOR_ROLE } from '@tp/db';
import { writtenPhiFindings } from '@tp/observability';

import type { InboxMessage, SupportInbox } from './inbox';
import { type ReadMail, readMail, sesVerified } from './mime';

/**
 * Mail to the support address opens a ticket (PRD 19, Support: "a support address that creates a ticket";
 * docs/adr/0055). A platform job, every five minutes, as the operator role (tp_operator), which owns nothing and
 * cannot bypass row-level security. It lists the inbox, asks the database which messages it has read already
 * (operator_support_mail_read, by mail_ref), and reads each new one once, in its own transaction:
 *
 * - a message it cannot read (too large, no header, no From address, no text) is recorded unreadable;
 * - in S3, a message whose sender SES did not verify (DMARC or aligned DKIM, and a clean virus scan; mime.ts) is
 *   recorded as from an unverified sender: anyone can write any From address;
 * - otherwise operator_record_support_mail() opens a ticket in the name of the account whose address sent it (one
 *   that is not disabled), or records an unknown sender. The job is never told who that is.
 *
 * The desk reads a ticket with no support grant, so its text is screened as the form's is (writtenPhiFindings): a
 * message that looks like it holds patient information opens a ticket that says only that a message came and was
 * withheld, and asks the desk to have the requester write through the form. The mail itself stays in the inbox until
 * its lifecycle rule expires it. Nothing the message says is logged: counts and codes only.
 */

export interface MailClient {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

export interface SupportMailOptions {
  readonly client: MailClient;
  readonly inbox: SupportInbox;
  /** The job's ID: the audit events' request_id. */
  readonly requestId: string;
}

export type SupportMailVerdict = 'ticket' | 'withheld' | 'unverified_sender' | 'unreadable';
export type SupportMailOutcome = 'opened' | 'withheld' | 'unknown_sender' | 'unverified_sender' | 'unreadable';

export interface SupportMailResult {
  readonly read: number;
  readonly outcomes: Readonly<Record<SupportMailOutcome, number>>;
  /** Messages left for the next run (more than one run takes). */
  readonly waiting: number;
}

/** How many new messages one run reads; the next run takes the rest. */
export const MAILS_PER_RUN = 50;

const SUBJECT_LIMIT = 200;
const MESSAGE_LIMIT = 4000;
const CUT = '\n\n[The rest of the message was cut: a ticket holds 4,000 characters.]';

/** What a withheld ticket says, in place of the message. */
export const WITHHELD_SUBJECT = 'Mail to support, withheld';
export const WITHHELD_MESSAGE =
  'A message came to the support address from this person, and its text was withheld because it looked like it held patient information (a name, a date, a member ID, a claim number or another identifier). ' +
  'Ask them to write again through the in-app form, naming the screen and the record’s opaque ID only.';

export interface ScreenedMail {
  readonly verdict: SupportMailVerdict;
  readonly sender: string | null;
  readonly subject: string | null;
  readonly message: string | null;
}

function clip(text: string, limit: number, suffix: string): string {
  return text.length <= limit ? text : `${text.slice(0, limit - suffix.length).trimEnd()}${suffix}`;
}

/** What one message becomes: the verdict and the ticket's text, decided by code from the message alone. */
export function screenMail(mail: ReadMail | null, verifiesSenders: boolean): ScreenedMail {
  if (mail === null || mail.from === null || mail.text === null) {
    return { verdict: 'unreadable', sender: null, subject: null, message: null };
  }
  if (verifiesSenders && !sesVerified(mail)) {
    return { verdict: 'unverified_sender', sender: null, subject: null, message: null };
  }
  if (writtenPhiFindings(`${mail.subject}\n${mail.text}`).length > 0) {
    return { verdict: 'withheld', sender: mail.from, subject: WITHHELD_SUBJECT, message: WITHHELD_MESSAGE };
  }
  const subject = mail.subject === '' ? 'Mail to support' : clip(mail.subject, SUBJECT_LIMIT, '…');
  return { verdict: 'ticket', sender: mail.from, subject, message: clip(mail.text, MESSAGE_LIMIT, CUT) };
}

/** One transaction as the operator role, with no practice in scope. */
async function asOperator<T>(client: MailClient, run: () => Promise<T>): Promise<T> {
  await client.query('BEGIN');
  try {
    await client.query(`SET LOCAL ROLE ${OPERATOR_ROLE}`);
    await client.query("SELECT set_config('app.practice_ids', '{}', true)");
    const result = await run();
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function unread(client: MailClient, messages: readonly InboxMessage[]): Promise<InboxMessage[]> {
  const read = new Set<string>();
  for (let start = 0; start < messages.length; start += 1000) {
    const refs = messages.slice(start, start + 1000).map((message) => message.ref);
    const rows = (await asOperator(client, async () => (await client.query('SELECT mail_ref FROM operator_support_mail_read($1::text[])', [refs])).rows)) as { mail_ref: string }[];
    for (const row of rows) {
      read.add(row.mail_ref);
    }
  }
  return messages.filter((message) => !read.has(message.ref));
}

export async function readSupportMail(options: SupportMailOptions): Promise<SupportMailResult> {
  const { client, inbox } = options;
  const outcomes: Record<SupportMailOutcome, number> = { opened: 0, withheld: 0, unknown_sender: 0, unverified_sender: 0, unreadable: 0 };
  const waiting = await unread(client, await inbox.list());
  const batch = waiting.slice(0, MAILS_PER_RUN);
  for (const message of batch) {
    const bytes = await inbox.read(message);
    const screened = screenMail(bytes === null ? null : readMail(bytes), inbox.verifiesSenders);
    const row = (await asOperator(
      client,
      async () =>
        (
          await client.query('SELECT outcome FROM operator_record_support_mail($1, $2, $3, $4, $5, $6)', [
            message.ref,
            screened.verdict,
            screened.sender,
            screened.subject,
            screened.message,
            options.requestId,
          ])
        ).rows[0],
    )) as { outcome: SupportMailOutcome } | undefined;
    if (row !== undefined) {
      outcomes[row.outcome] += 1;
    }
  }
  return { read: batch.length, outcomes, waiting: waiting.length - batch.length };
}
