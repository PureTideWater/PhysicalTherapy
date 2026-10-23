import { readdir, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';

import { GetAccountCommand, GetConfigurationSetCommand, PutConfigurationSetSendingOptionsCommand, type SESv2Client } from '@aws-sdk/client-sesv2';
import { DeleteMessageCommand, ReceiveMessageCommand, type SQSClient } from '@aws-sdk/client-sqs';
import type { MailPauseReason, MailStream } from '@tp/db';
import type { Logger } from '@tp/observability';

import { type MailEventRecord, MailEventUnreadable, parseMailQueueMessage } from '../mail/events';
import type { MailSender } from '../mail/mail';
import { MAIL_LOG_CODES, MAIL_PROBE_RECIPIENTS, configurationSetName } from '../mail/streams';
import { type NoticeClient, asOperator } from './support-notices';

/**
 * The platform's mail_events job (audit #76; docs/adr/0065, D5 and D6), every minute as tp_operator, which owns nothing
 * and cannot bypass row-level security. Each run, in order:
 *
 * 1. Reconcile. SES's enforcement other than HEALTHY pauses the screening stream (account_review). The screening's SES
 *    configuration set is made to match the database: disabled while the stream is paused (so nothing, a deploy
 *    included, keeps a paused set sending), enabled while it is open; the stream is confirmed sending only once SES
 *    reads the set enabled again, and the screening's runs are claimed only then (screening_run_mail_gate). Only the
 *    screening set is ever disabled: the transactional and notices streams never pause.
 * 2. Probes, once the stack's identities are verified (phase 2): a stream due one (daily, at once after a resume, again
 *    when one has not come back in 26 hours, which is MAIL_PROBE_MISSED) sends one message to SES's simulator's success
 *    address and one to its bounce address, through the stream's set, and nothing else.
 * 3. Drain the queue: up to 10 messages a receive, at most 1,000 or 50 seconds a run. Each SES event is recorded once
 *    per message and event, in any order (operator_record_mail_event(), by SES's message ID and the state's rank), in a
 *    transaction scoped to its support notice's practice (its tp_practice tag) or to none; the message is deleted from
 *    the queue only after that commits (JOB-05). An account alarm's state change pauses the screening stream
 *    (account_rate). A message that does not parse is logged by its queue ID (MAIL_EVENT_UNREADABLE) and left for the
 *    dead-letter queue; one the database refuses is logged by its SQLSTATE and left to be received again.
 * 4. Act on what the record returns: a pause (MAIL_STREAM_PAUSED) disables the screening set at once; a notice not
 *    delivered to every recipient is NOTICE_UNDELIVERED with its support grant's or invoice's ID; an invitation not
 *    delivered is INVITATION_UNDELIVERED with its ID.
 *
 * Logs carry IDs and codes only: no address, in no log line, payload, audit event or error. Outside SES the address's
 * only copy is the queue's encrypted message, for at most 4 days (14 in the dead-letter queue).
 */

/** One message of the queue: its ID (logged when unreadable), body and what deletes it. */
export interface MailQueueMessage {
  readonly id: string;
  readonly body: string;
  readonly receipt: string;
}

/** Where SES's events wait: the mail-events SQS queue, or the local sender's events directory. */
export interface MailEventSource {
  /** Up to `max` messages, none already received and not yet deleted or returned. */
  receive(max: number): Promise<readonly MailQueueMessage[]>;
  /** Deletes a message once its record has committed. */
  remove(message: MailQueueMessage): Promise<void>;
}

/** SES's account and the screening set's sending: the reconcile's view of SES. */
export interface MailControl {
  /** Whether SES's enforcement of the account is HEALTHY (GetAccount); false under PROBATION or SHUTDOWN. */
  accountHealthy(): Promise<boolean>;
  /** Whether the screening's configuration set is sending (GetConfigurationSet). */
  screeningSending(): Promise<boolean>;
  /** Enables or disables the screening's configuration set (PutConfigurationSetSendingOptions); never another set. */
  setScreeningSending(enabled: boolean): Promise<void>;
}

/** The mail-events queue: long polling of 1 second, at most 10 messages a call; deleted by receipt handle. */
export class SqsMailEventSource implements MailEventSource {
  constructor(private readonly options: { readonly client: Pick<SQSClient, 'send'>; readonly queueUrl: string }) {}

  async receive(max: number): Promise<readonly MailQueueMessage[]> {
    const result = await this.options.client.send(new ReceiveMessageCommand({ QueueUrl: this.options.queueUrl, MaxNumberOfMessages: Math.min(Math.max(max, 1), 10), WaitTimeSeconds: 1 }));
    return (result.Messages ?? []).flatMap((message) =>
      message.MessageId === undefined || message.ReceiptHandle === undefined ? [] : [{ id: message.MessageId, body: message.Body ?? '', receipt: message.ReceiptHandle }],
    );
  }

  async remove(message: MailQueueMessage): Promise<void> {
    await this.options.client.send(new DeleteMessageCommand({ QueueUrl: this.options.queueUrl, ReceiptHandle: message.receipt }));
  }
}

/** How long a local event, once received, is hidden from the next receive (the queue's visibility timeout). */
const LOCAL_VISIBILITY_MS = 60_000;

/**
 * Development and the e2e journeys: the local sender's events directory, one event a JSON file, oldest first (none:
 * nothing to read). A file received and not deleted is hidden for a minute, as the queue hides a message it handed out.
 */
export class LocalMailEventSource implements MailEventSource {
  private readonly hidden = new Map<string, number>();

  constructor(
    private readonly dir: string | null,
    private readonly now: () => number = Date.now,
  ) {}

  async receive(max: number): Promise<readonly MailQueueMessage[]> {
    if (this.dir === null) {
      return [];
    }
    const { dir } = this;
    let names: string[];
    try {
      names = (await readdir(dir)).filter((name) => name.endsWith('.json') && !name.startsWith('.')).sort();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
    const now = this.now();
    const taken: MailQueueMessage[] = [];
    for (const name of names) {
      if (taken.length >= max) {
        break;
      }
      if ((this.hidden.get(name) ?? 0) > now) {
        continue;
      }
      let body: string;
      try {
        body = await readFile(path.join(dir, name), 'utf8');
      } catch {
        continue;
      }
      this.hidden.set(name, now + LOCAL_VISIBILITY_MS);
      taken.push({ id: name.slice(0, -'.json'.length), body, receipt: name });
    }
    return taken;
  }

  async remove(message: MailQueueMessage): Promise<void> {
    this.hidden.delete(message.receipt);
    if (this.dir === null) {
      return;
    }
    await unlink(path.join(this.dir, message.receipt)).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    });
  }
}

/** SES's account and the screening set, through the SES v2 API (the platform role may touch the screening set alone). */
export class SesMailControl implements MailControl {
  constructor(private readonly options: { readonly client: Pick<SESv2Client, 'send'>; readonly streamPrefix: string }) {}

  private get set(): string {
    return configurationSetName(this.options.streamPrefix, 'screening');
  }

  async accountHealthy(): Promise<boolean> {
    const account = await this.options.client.send(new GetAccountCommand({}));
    // An account SES reports no status for is not under review: only PROBATION and SHUTDOWN (or a status SES adds) pause.
    return account.EnforcementStatus === undefined || account.EnforcementStatus === 'HEALTHY';
  }

  async screeningSending(): Promise<boolean> {
    const set = await this.options.client.send(new GetConfigurationSetCommand({ ConfigurationSetName: this.set }));
    return set.SendingOptions?.SendingEnabled ?? true;
  }

  async setScreeningSending(enabled: boolean): Promise<void> {
    await this.options.client.send(new PutConfigurationSetSendingOptionsCommand({ ConfigurationSetName: this.set, SendingEnabled: enabled }));
  }
}

/** Development and the tests: SES's state in memory, the account healthy and the screening set sending until told otherwise. */
export class MemoryMailControl implements MailControl {
  healthy = true;
  sending = true;
  /** Each change asked of the screening set, in order. */
  readonly changes: boolean[] = [];

  accountHealthy(): Promise<boolean> {
    return Promise.resolve(this.healthy);
  }

  screeningSending(): Promise<boolean> {
    return Promise.resolve(this.sending);
  }

  setScreeningSending(enabled: boolean): Promise<void> {
    this.changes.push(enabled);
    this.sending = enabled;
    return Promise.resolve();
  }
}

/** A run's bounds: messages received at most, and how long it drains. */
export const MAIL_EVENTS_RUN = { messages: 1000, ms: 50_000, batch: 10 } as const;

export interface MailEventsOptions {
  /** One operator connection; each step its own transaction as tp_operator. */
  readonly client: NoticeClient;
  readonly source: MailEventSource;
  readonly control: MailControl;
  /** The probes' sender (each stream's address and set). */
  readonly mail: MailSender;
  readonly streamPrefix: string;
  /** Whether probes go: the stack's identities are verified (MAIL_IDENTITIES_VERIFIED, phase 2). */
  readonly probes: boolean;
  /** The job's ID: the audit events' request_id. */
  readonly requestId: string;
  readonly logger: Logger;
  readonly now?: () => number;
  readonly limits?: { readonly messages: number; readonly ms: number };
}

export interface MailEventsResult {
  readonly recorded: number;
  /** Events already recorded, or ranked below the message's state: nothing changed. */
  readonly repeated: number;
  readonly ignored: number;
  readonly unreadable: number;
  readonly notRecorded: number;
  /** Why the screening stream paused in this run, if it did. */
  readonly paused: MailPauseReason | null;
  readonly probed: readonly MailStream[];
  readonly probesMissed: readonly MailStream[];
}

interface StreamRow {
  readonly stream: MailStream;
  readonly paused: boolean;
  readonly confirmed: boolean;
  readonly probe_due: boolean;
  readonly probe_missed: boolean;
}

interface RecordedRow {
  readonly recorded: boolean;
  readonly state: string;
  readonly notice_undelivered: string | null;
  readonly invoice_undelivered: string | null;
  readonly invitation_undelivered: string | null;
  readonly stream_paused: MailPauseReason | null;
}

/** The pause's alarm line: one fixed sentence a reason, each with MAIL_STREAM_PAUSED. */
function logPaused(logger: Logger, reason: MailPauseReason, requestId: string): void {
  switch (reason) {
    case 'bounce_rate':
      logger.error('screening mail stream paused: its permanent bounces passed the cut-off', { job_id: requestId, error_code: MAIL_LOG_CODES.streamPaused });
      return;
    case 'complaint_rate':
      logger.error('screening mail stream paused: its complaints passed the cut-off', { job_id: requestId, error_code: MAIL_LOG_CODES.streamPaused });
      return;
    case 'account_rate':
      logger.error('screening mail stream paused: an account reputation alarm', { job_id: requestId, error_code: MAIL_LOG_CODES.streamPaused });
      return;
    case 'account_review':
      logger.error('screening mail stream paused: SES enforcement of the account is not healthy', { job_id: requestId, error_code: MAIL_LOG_CODES.streamPaused });
      return;
    case 'operator':
      logger.error('screening mail stream paused by a platform administrator', { job_id: requestId, error_code: MAIL_LOG_CODES.streamPaused });
      return;
  }
}

/** A probe that has not come back in 26 hours: one fixed sentence a stream, each with MAIL_PROBE_MISSED. */
function logProbeMissed(logger: Logger, stream: MailStream, requestId: string): void {
  switch (stream) {
    case 'transactional':
      logger.error('transactional mail probe has not come back in 26 hours', { job_id: requestId, error_code: MAIL_LOG_CODES.probeMissed });
      return;
    case 'notices':
      logger.error('notices mail probe has not come back in 26 hours', { job_id: requestId, error_code: MAIL_LOG_CODES.probeMissed });
      return;
    case 'screening':
      logger.error('screening mail probe has not come back in 26 hours', { job_id: requestId, error_code: MAIL_LOG_CODES.probeMissed });
      return;
  }
}

/** The SQLSTATE of a database refusal, or nothing: never its text, which can carry an address. */
function sqlState(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : '';
  return /^[0-9A-Z]{5}$/.test(code) ? `MAIL_EVENT_NOT_RECORDED_${code}` : 'MAIL_EVENT_NOT_RECORDED';
}

async function recordEvent(options: MailEventsOptions, record: MailEventRecord): Promise<RecordedRow> {
  const { client } = options;
  return asOperator(client, record.practiceId, async () => {
    const { rows } = await client.query(
      `SELECT recorded, state, notice_undelivered, invoice_undelivered, invitation_undelivered, stream_paused
         FROM operator_record_mail_event($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        record.messageId,
        record.stream,
        record.event,
        record.mailAt,
        record.eventAt,
        record.recipient,
        record.kind,
        record.subjectId,
        record.recipientUserId,
        record.practiceId,
        record.bounceKind,
        record.bounceSubtype,
        record.complaintType,
        options.requestId,
      ],
    );
    return rows[0] as RecordedRow;
  });
}

/** The probes' message: fixed text to SES's simulator, which proves the stream's whole event path. */
function probeMessage(stream: MailStream, to: string) {
  return {
    to: [to],
    subject: 'Mail probe',
    lines: ['This message goes only to the mail service’s simulator, to prove that its delivery events are recorded.'],
    links: [],
    identity: { stream, kind: 'probe' as const },
  };
}

export async function runMailEvents(options: MailEventsOptions): Promise<MailEventsResult> {
  const { client, control, logger, requestId } = options;
  const now = options.now ?? Date.now;
  const limits = options.limits ?? MAIL_EVENTS_RUN;
  let paused: MailPauseReason | null = null;
  const pausedNow = async (reason: MailPauseReason) => {
    paused = reason;
    logPaused(logger, reason, requestId);
    // At once: a paused stream's set sends nothing more; the next reconcile repeats it should this fail.
    await control.setScreeningSending(false);
  };
  const streams = () => asOperator(client, null, async () => (await client.query('SELECT stream, paused, confirmed, probe_due, probe_missed FROM operator_mail_streams()')).rows as StreamRow[]);

  // 1. Reconcile.
  if (!(await control.accountHealthy())) {
    const signalled = await asOperator(client, null, async () => (await client.query('SELECT operator_mail_account_signal($1, $2) AS paused', ['enforcement_not_healthy', requestId])).rows[0] as { paused: boolean });
    if (signalled.paused) {
      await pausedNow('account_review');
    }
  }
  const screening = (await streams()).find((row) => row.stream === 'screening');
  let sending = await control.screeningSending();
  if (screening?.paused === true) {
    if (sending) {
      // Drift: something enabled a paused set (a deploy, a hand). It is disabled again.
      logger.warn('screening mail set was sending while its stream is paused; disabled again', { job_id: requestId, error_code: 'MAIL_STREAM_DRIFT' });
      await control.setScreeningSending(false);
    }
  } else if (screening !== undefined) {
    if (!sending) {
      await control.setScreeningSending(true);
      sending = await control.screeningSending();
    }
    // Confirmed only on what SES reads now: enabled confirms an open stream, disabled clears it.
    await asOperator(client, null, () => client.query('SELECT operator_mail_stream_confirmed($1, $2)', ['screening', sending]));
  }

  // 2. Probes.
  const probed: MailStream[] = [];
  const probesMissed: MailStream[] = [];
  if (options.probes) {
    for (const row of await streams()) {
      if (!row.probe_due) {
        continue;
      }
      if (row.probe_missed) {
        probesMissed.push(row.stream);
        logProbeMissed(logger, row.stream, requestId);
      }
      try {
        await options.mail.send(probeMessage(row.stream, MAIL_PROBE_RECIPIENTS.delivered));
        await options.mail.send(probeMessage(row.stream, MAIL_PROBE_RECIPIENTS.bounced));
      } catch {
        logger.warn('mail probe could not be sent; the next run tries again', { job_id: requestId, error_code: 'MAIL_PROBE_UNSENT' });
        continue;
      }
      await asOperator(client, null, () => client.query('SELECT operator_mail_probe_sent($1)', [row.stream]));
      probed.push(row.stream);
    }
  }

  // 3 and 4. Drain the queue and act on each record.
  const started = now();
  let received = 0;
  let recorded = 0;
  let repeated = 0;
  let ignored = 0;
  let unreadable = 0;
  let notRecorded = 0;
  while (received < limits.messages && now() - started < limits.ms) {
    const batch = await options.source.receive(Math.min(MAIL_EVENTS_RUN.batch, limits.messages - received));
    if (batch.length === 0) {
      break;
    }
    for (const message of batch) {
      received += 1;
      let entry;
      try {
        entry = parseMailQueueMessage(message.body, options.streamPrefix);
      } catch (error) {
        if (!(error instanceof MailEventUnreadable)) {
          throw error;
        }
        unreadable += 1;
        logger.warn('mail event unreadable; left for the dead-letter queue', { job_id: requestId, queue_message_id: message.id, error_code: MAIL_LOG_CODES.eventUnreadable });
        continue;
      }
      if (entry.type === 'ignored') {
        await options.source.remove(message);
        ignored += 1;
        continue;
      }
      if (entry.type === 'account_signal') {
        const { signal } = entry;
        const signalled = await asOperator(client, null, async () => (await client.query('SELECT operator_mail_account_signal($1, $2) AS paused', [signal, requestId])).rows[0] as { paused: boolean });
        await options.source.remove(message);
        recorded += 1;
        if (signalled.paused) {
          await pausedNow('account_rate');
        }
        continue;
      }
      let row: RecordedRow;
      try {
        row = await recordEvent(options, entry.record);
      } catch (error) {
        notRecorded += 1;
        logger.error('mail event could not be recorded; it is received again', { job_id: requestId, queue_message_id: message.id, error_code: sqlState(error) });
        continue;
      }
      // Deleted only once its record has committed (JOB-05): a failure before this leaves it to be received again.
      await options.source.remove(message);
      if (!row.recorded) {
        repeated += 1;
        continue;
      }
      recorded += 1;
      if (row.notice_undelivered !== null) {
        logger.error('support-access notice not delivered to every administrator', { job_id: requestId, support_grant_id: row.notice_undelivered, error_code: MAIL_LOG_CODES.noticeUndelivered });
      }
      if (row.invoice_undelivered !== null) {
        logger.error('dunning notice not delivered to every billing owner', { job_id: requestId, invoice_id: row.invoice_undelivered, error_code: MAIL_LOG_CODES.noticeUndelivered });
      }
      if (row.invitation_undelivered !== null) {
        logger.warn('invitation email not delivered', { job_id: requestId, invitation_id: row.invitation_undelivered, error_code: MAIL_LOG_CODES.invitationUndelivered });
      }
      if (row.stream_paused !== null) {
        await pausedNow(row.stream_paused);
      }
    }
  }
  return { recorded, repeated, ignored, unreadable, notRecorded, paused, probed, probesMissed };
}

/** The nightly mail_expiry job: expired messages, bounce marks and refused addresses, 1,000 of each a call, until none is left. */
export const MAIL_EXPIRY_BATCH = 1000;

export async function expireMail(client: NoticeClient): Promise<number> {
  let removed = 0;
  for (;;) {
    const row = await asOperator(client, null, async () => (await client.query('SELECT operator_mail_expire($1) AS removed', [MAIL_EXPIRY_BATCH])).rows[0] as { removed: number });
    removed += row.removed;
    if (row.removed === 0) {
      return removed;
    }
  }
}
