import type { Logger } from '@tp/observability';
import { z } from 'zod';

import { runDunning, sendDunningNotices } from '../billing/dunning';
import { recordUsageSnapshots } from '../billing/usage';
import { copyAuditDay, previousDay } from '../platform/audit-copy';
import type { MailSender } from '../mail/mail';
import { type MailControl, type MailEventSource, expireMail, runMailEvents } from '../platform/mail-events';
import { sendHardwareKeyNotices } from '../platform/hardware-key-notices';
import { queueMonitoringSchedule } from '../platform/monitoring-schedule';
import { sendPasswordNotices } from '../platform/password-notices';
import { type ProviderSignOutAdapter, runProviderSignOuts } from '../platform/provider-sign-outs';
import { type RestoreDrillResult, RestoreDrillFailedError, type SnapshotRestorer, runRestoreDrill } from '../platform/restore-drill';
import { sendSupportGrantNotices } from '../platform/support-notices';
import { expireScreenings } from '../screening/expiry';
import type { ObjectStore } from '../storage/object-store';
import type { SupportInbox } from '../support/inbox';
import { readSupportMail } from '../support/support-mail';
import type { JobSender } from './enqueue';

/**
 * Platform jobs: work on the platform itself rather than on one practice's data, so they carry no
 * practice in their payload (docs/adr/0014). They read no PHI: the audit copy reads audit_event
 * (codes and opaque IDs only), the restore drill counts rows on a scratch copy, and the support-grant
 * notices read IDs, counts of reads and the administrators' email addresses (docs/adr/0017) through
 * three narrow functions, one practice per transaction; the monitoring schedule reads the active
 * practices' IDs through one more and queues each practice's own monitor and digest jobs (docs/adr/0039).
 * Billing's two (docs/adr/0050) run as tp_billing, which the operator login switches to: the dunning
 * notices read invoices and the organization administrators' addresses, and the nightly usage snapshot
 * counts each organization's practices through one function that returns counts only. Support mail
 * (docs/adr/0055) reads the support inbox and opens tickets through one function that names no sender. The free
 * screening's expiry (docs/adr/0062) deletes screenings 30 days after their upload through
 * operator_screening_expire(); a screening holds no PHI and names no practice. Its pricing is the screening consumer's
 * since PR 6b-3 (jobs/screening.ts, WORKER_JOBS=screening). The mail record's (audit #76, docs/adr/0065): mail_events
 * reconciles the screening's SES set with its stream, sends the daily probes and records each SES event of each message
 * by its message ID (IDs and codes; the destination address only to resolve a Cognito user and to hash a refused
 * screening address, never kept); mail_expiry deletes the expired mail records; dunning_notices sends each billing owner
 * a stage notice whose send is due again (as tp_billing). The support-grant notices and the dunning notices each go one
 * message per recipient from a recorded outbox. The password-changed notices (docs/adr/0091) go one message per
 * completed reset from the outbox the database writes in the reset's own transaction, the account's address read only by
 * the claim of a pending, due notice under 24 hours old. They run on the operator connection, every
 * transaction as tp_operator (which owns nothing and cannot bypass row-level security), which the
 * worker holds only where OPERATOR_DATABASE_URL is configured. The provider sign-outs (docs/adr/0095) are asked of the
 * identity provider from the outbox the database writes in the cause's own transaction (an ended membership, a recorded
 * reset, a confirmed key removal): the provider's subject is read only by the claim and lives in memory for the one
 * call. Of all these, the restore drill alone uses an owner
 * login, and only on its scratch copy. A practice job (jobs/registry.ts) never runs this way.
 */
export const PLATFORM_JOB_TYPES = [
  'audit_copy',
  'restore_drill',
  'support_grant_notices',
  'monitoring_schedule',
  'billing_dunning',
  'usage_snapshot',
  'support_mail',
  'screening_expiry',
  'mail_events',
  'mail_expiry',
  'dunning_notices',
  'password_notices',
  'provider_sign_outs',
  'hardware_key_notices',
] as const;
export type PlatformJobType = (typeof PLATFORM_JOB_TYPES)[number];

const day = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'a calendar day, YYYY-MM-DD');

export const PLATFORM_JOB_PAYLOADS = {
  /** The day to copy; the scheduled run omits it and copies yesterday (UTC). */
  audit_copy: z.strictObject({ day: day.optional() }),
  restore_drill: z.strictObject({}),
  support_grant_notices: z.strictObject({}),
  /** The day to schedule; the scheduled run omits it and takes today (UTC). */
  monitoring_schedule: z.strictObject({ day: day.optional() }),
  billing_dunning: z.strictObject({}),
  /** The day to count; the scheduled run omits it and takes today (UTC). */
  usage_snapshot: z.strictObject({ day: day.optional() }),
  support_mail: z.strictObject({}),
  screening_expiry: z.strictObject({}),
  mail_events: z.strictObject({}),
  mail_expiry: z.strictObject({}),
  dunning_notices: z.strictObject({}),
  /** Nothing about the person: the notice, its user and the address are read from the outbox (docs/adr/0091). */
  password_notices: z.strictObject({}),
  /** Nothing about the person: the row, its account and the provider's subject are read from the outbox (docs/adr/0095). */
  provider_sign_outs: z.strictObject({}),
  /** Nothing about the person: the notice, its user and the address are read from the outbox (docs/adr/0095). */
  hardware_key_notices: z.strictObject({}),
} satisfies Record<PlatformJobType, z.ZodType>;

export type PlatformJobPayload<T extends PlatformJobType> = z.infer<(typeof PLATFORM_JOB_PAYLOADS)[T]>;

export function parsePlatformPayload<T extends PlatformJobType>(type: T, payload: unknown): PlatformJobPayload<T> {
  return PLATFORM_JOB_PAYLOADS[type].parse(payload ?? {}) as PlatformJobPayload<T>;
}

/**
 * When each runs, in UTC: the audit copy nightly at 01:20, after the day it copies has closed; the
 * restore drill on the first Monday of each month at 06:00 (PRD 19 Runbooks, Restore drill); the
 * support-grant notices every minute, so a notice goes out within a minute of a grant opening or
 * ending; the monitoring schedule daily at 05:10, so the month's digest goes out on its first morning;
 * the dunning notices daily at 14:10 (a morning in the United States); the usage snapshot nightly at 00:40;
 * support mail every five minutes, well inside the published response target (docs/adr/0055); the screening
 * expiry nightly at 03:35 (docs/adr/0062); the mail events every minute, so a pause disables the screening's set within a
 * minute and a notice's delivery is recorded within one; the mail expiry nightly at 03:50; the dunning notices' sends
 * every minute, so a send that threw is tried again after 1, 5, 15 and 60 minutes (docs/adr/0065); and the
 * password-changed notices every minute, from the database's outbox, so the account's address is told within a minute of
 * a reset (a backlog goes out over several runs: each stops claiming once it has spent 8 seconds sending) and a refused
 * send is tried again on the same steps (docs/adr/0091); and the provider sign-outs every minute, so the provider is
 * asked within about a minute of the cause's commit, a failed try again after 1, 5, 15 and 60 minutes (docs/adr/0095);
 * and the hardware-key notices every minute, as the password-changed notices go.
 */
export const PLATFORM_SCHEDULES: Readonly<Record<PlatformJobType, string>> = {
  audit_copy: '20 1 * * *',
  restore_drill: 'FREQ=MONTHLY;BYDAY=1MO;BYHOUR=6;BYMINUTE=0;BYSECOND=0',
  support_grant_notices: '* * * * *',
  monitoring_schedule: '10 5 * * *',
  billing_dunning: '10 14 * * *',
  usage_snapshot: '40 0 * * *',
  support_mail: '*/5 * * * *',
  screening_expiry: '35 3 * * *',
  mail_events: '* * * * *',
  mail_expiry: '50 3 * * *',
  dunning_notices: '* * * * *',
  password_notices: '* * * * *',
  provider_sign_outs: '* * * * *',
  hardware_key_notices: '* * * * *',
};

export interface PlatformContext {
  readonly jobId: string;
  readonly logger: Logger;
}

export type PlatformHandlers = { readonly [T in PlatformJobType]: (payload: PlatformJobPayload<T>, context: PlatformContext) => Promise<void> };

export interface OperatorPool {
  connect(): Promise<{ query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>; release(destroy?: boolean): void }>;
}

export interface PlatformDependencies {
  /** Operator connections to the platform database (a login that can SET ROLE to tp_operator). */
  readonly operator: OperatorPool;
  readonly store: ObjectStore;
  readonly restorer: SnapshotRestorer;
  /** Notices to practice administrators (links only). */
  readonly mail: MailSender;
  /** The application's origin, for the notices' links. */
  readonly appOrigin: string;
  /** The support address the password-changed email says to write to, and its Reply-To (SUPPORT_EMAIL; docs/adr/0091). */
  readonly supportEmail: string;
  /** Where the monitoring schedule queues each practice's jobs (pg-boss). */
  readonly queue?: JobSender;
  /** Where mail to the support address waits (SES's bucket, or a local directory). */
  readonly inbox?: SupportInbox;
  /** The mail_events job's queue and SES control, the sets' prefix and whether probes go (docs/adr/0065). */
  readonly mailEvents?: MailEventsDependencies;
  /** The identity provider's global sign-out, for the provider_sign_outs job (docs/adr/0095). */
  readonly providerSignOut?: ProviderSignOutAdapter;
  readonly now?: () => Date;
}

export interface MailEventsDependencies {
  readonly source: MailEventSource;
  readonly control: MailControl;
  /** The configuration sets' prefix (MAIL_STREAM_PREFIX). */
  readonly streamPrefix: string;
  /** Whether probes go: the stack's mail identities are verified (MAIL_IDENTITIES_VERIFIED). */
  readonly probes: boolean;
}

/** The monitoring schedule ran on a worker that has no queue to send to. */
export class NoQueueError extends Error {
  override readonly name = 'NoQueueError';
}

/** The support mail job ran on a worker that has no inbox to read. */
export class NoInboxError extends Error {
  override readonly name = 'NoInboxError';
}

/** The mail_events job ran on a worker that has no queue of SES's events to read. */
export class NoMailEventsError extends Error {
  override readonly name = 'NoMailEventsError';
}

/** The provider sign-outs job ran on a worker that has no identity provider to ask. */
export class NoProviderSignOutError extends Error {
  override readonly name = 'NoProviderSignOutError';
}

async function withOperator<T>(pool: OperatorPool, use: (client: Awaited<ReturnType<OperatorPool['connect']>>) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let broken = false;
  try {
    return await use(client);
  } catch (error) {
    broken = true;
    throw error;
  } finally {
    client.release(broken);
  }
}

export function createPlatformHandlers(dependencies: PlatformDependencies): PlatformHandlers {
  const now = dependencies.now ?? (() => new Date());
  return {
    audit_copy: async (payload, context) => {
      const target = payload.day ?? previousDay(now());
      const result = await withOperator(dependencies.operator, (client) => copyAuditDay({ client, store: dependencies.store, day: target, now: now() }));
      if (result.outcome === 'written') {
        context.logger.info('audit copy written', { job_id: context.jobId });
      } else {
        context.logger.info('audit copy already present', { job_id: context.jobId });
      }
    },
    restore_drill: async (_payload, context) => {
      let result: RestoreDrillResult;
      try {
        result = await withOperator(dependencies.operator, (evidence) => runRestoreDrill({ restorer: dependencies.restorer, evidence, now }));
      } catch (error) {
        if (error instanceof RestoreDrillFailedError) {
          context.logger.error('restore drill failed', { job_id: context.jobId, restore_drill_id: error.result.id, error_code: error.result.errorCode });
        }
        throw error;
      }
      context.logger.info('restore drill passed', { job_id: context.jobId, restore_drill_id: result.id });
    },
    monitoring_schedule: async (payload, context) => {
      const { queue } = dependencies;
      if (queue === undefined) {
        throw new NoQueueError('the monitoring schedule needs the queue');
      }
      const result = await withOperator(dependencies.operator, (client) => queueMonitoringSchedule({ client, queue, day: payload.day ?? now().toISOString().slice(0, 10) }));
      if (result.practices > 0) {
        context.logger.info('monitoring schedule queued the practices’ jobs', { job_id: context.jobId });
      } else {
        context.logger.info('monitoring schedule found no active practice', { job_id: context.jobId });
      }
    },
    billing_dunning: async (_payload, context) => {
      // Each stage's notice with no billing owner is NOTICE_UNDELIVERABLE, and one not delivered NOTICE_UNDELIVERED, by
      // the invoice's ID (logged as they are found).
      const result = await runDunning({ pool: dependencies.operator, mail: dependencies.mail, origin: dependencies.appOrigin, requestId: context.jobId, now: now(), logger: context.logger.child({ job_id: context.jobId }) });
      if (result.sent > 0) {
        context.logger.info('dunning notices sent', { job_id: context.jobId });
      }
    },
    dunning_notices: async (_payload, context) => {
      const result = await sendDunningNotices({ pool: dependencies.operator, mail: dependencies.mail, origin: dependencies.appOrigin, requestId: context.jobId, logger: context.logger.child({ job_id: context.jobId }) });
      if (result.sent > 0) {
        context.logger.info('dunning notices sent', { job_id: context.jobId });
      }
    },
    usage_snapshot: async (payload, context) => {
      const result = await recordUsageSnapshots({ pool: dependencies.operator, day: payload.day ?? now().toISOString().slice(0, 10), requestId: context.jobId });
      if (result.recorded > 0) {
        context.logger.info('usage snapshot recorded', { job_id: context.jobId });
      } else {
        context.logger.info('usage snapshot already recorded', { job_id: context.jobId });
      }
    },
    support_mail: async (_payload, context) => {
      const { inbox } = dependencies;
      if (inbox === undefined) {
        throw new NoInboxError('the support mail job needs the inbox');
      }
      const result = await withOperator(dependencies.operator, (client) => readSupportMail({ client, inbox, requestId: context.jobId }));
      if (result.outcomes.opened + result.outcomes.withheld > 0) {
        context.logger.info('support mail opened tickets', { job_id: context.jobId });
      }
      if (result.outcomes.withheld > 0) {
        context.logger.warn('support mail looked like it held patient information; its tickets say only that it came', { job_id: context.jobId, error_code: 'SUPPORT_MAIL_WITHHELD' });
      }
      if (result.outcomes.unverified_sender + result.outcomes.unknown_sender + result.outcomes.unreadable > 0) {
        context.logger.info('support mail opened no ticket for some messages: unverified or unknown senders, or unreadable', { job_id: context.jobId, error_code: 'SUPPORT_MAIL_REFUSED' });
      }
    },
    screening_expiry: async (_payload, context) => {
      const result = await expireScreenings({ operator: dependencies.operator, jobId: context.jobId });
      if (result.prospects + result.leads > 0) {
        context.logger.info('screening expiry deleted expired screenings', { job_id: context.jobId });
      }
    },
    support_grant_notices: async (_payload, context) => {
      // A practice with no administrator to tell is NOTICE_UNDELIVERABLE, and a notice not delivered NOTICE_UNDELIVERED,
      // by the grant's ID (logged as they are found): the operator follows up (PRD 19, Break-glass access).
      const result = await withOperator(dependencies.operator, (client) =>
        sendSupportGrantNotices({ client, mail: dependencies.mail, origin: dependencies.appOrigin, requestId: context.jobId, logger: context.logger.child({ job_id: context.jobId }) }),
      );
      if (result.sent > 0) {
        context.logger.info('support grant notices sent', { job_id: context.jobId });
      }
    },
    mail_events: async (_payload, context) => {
      const events = dependencies.mailEvents;
      if (events === undefined) {
        throw new NoMailEventsError('the mail events job needs the mail-events queue');
      }
      const result = await withOperator(dependencies.operator, (client) =>
        runMailEvents({
          client,
          source: events.source,
          control: events.control,
          mail: dependencies.mail,
          streamPrefix: events.streamPrefix,
          probes: events.probes,
          requestId: context.jobId,
          logger: context.logger,
        }),
      );
      if (result.recorded > 0) {
        context.logger.info('mail events recorded', { job_id: context.jobId, record_count: result.recorded });
      }
    },
    password_notices: async (_payload, context) => {
      // A notice not delivered, failed for good or past its 24 hours is PASSWORD_NOTICE_UNDELIVERED, by the notice's and
      // the user's IDs (logged as they are found): the operator tells the person another way (docs/adr/0091, D9).
      const result = await withOperator(dependencies.operator, (client) =>
        sendPasswordNotices({ client, mail: dependencies.mail, supportEmail: dependencies.supportEmail, requestId: context.jobId, logger: context.logger.child({ job_id: context.jobId }) }),
      );
      if (result.sent > 0) {
        context.logger.info('password notices sent', { job_id: context.jobId, record_count: result.sent });
      }
    },
    provider_sign_outs: async (_payload, context) => {
      const provider = dependencies.providerSignOut;
      if (provider === undefined) {
        throw new NoProviderSignOutError('the provider sign-outs job needs the identity provider');
      }
      // Each row done, each failed try and each LATE or GAVE_UP line is logged as it happens, by IDs and codes. The run
      // throws at its end if a step failed, after the other steps ran. A connection is taken for each step's database
      // work and given back before the provider is called: the pool is two for every platform job (pools.ts), and the
      // provider may take 10 seconds to answer.
      await runProviderSignOuts({ withClient: (use) => withOperator(dependencies.operator, use), provider, requestId: context.jobId, logger: context.logger.child({ job_id: context.jobId }) });
    },
    hardware_key_notices: async (_payload, context) => {
      // A notice not delivered, failed for good, past its 24 hours or whose account's address changed is
      // KEY_NOTICE_UNDELIVERED, by the notice's and the user's IDs (logged as they are found; docs/adr/0095).
      const result = await withOperator(dependencies.operator, (client) =>
        sendHardwareKeyNotices({ client, mail: dependencies.mail, supportEmail: dependencies.supportEmail, requestId: context.jobId, logger: context.logger.child({ job_id: context.jobId }) }),
      );
      if (result.sent > 0) {
        context.logger.info('hardware key notices sent', { job_id: context.jobId, record_count: result.sent });
      }
    },
    mail_expiry: async (_payload, context) => {
      const removed = await withOperator(dependencies.operator, (client) => expireMail(client));
      if (removed > 0) {
        context.logger.info('mail expiry deleted expired mail records', { job_id: context.jobId, record_count: removed });
      }
    },
  };
}
