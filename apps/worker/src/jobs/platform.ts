import type { Logger } from '@tp/observability';
import { z } from 'zod';

import { runDunning } from '../billing/dunning';
import { recordUsageSnapshots } from '../billing/usage';
import { copyAuditDay, previousDay } from '../platform/audit-copy';
import type { MailSender } from '../mail/mail';
import { queueMonitoringSchedule } from '../platform/monitoring-schedule';
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
 * since PR 6b-3 (jobs/screening.ts, WORKER_JOBS=screening). They run on the operator connection, every
 * transaction as tp_operator (which owns nothing and cannot bypass row-level security), which the
 * worker holds only where OPERATOR_DATABASE_URL is configured; the restore drill alone uses an owner
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
 * support mail every five minutes, well inside the published response target (docs/adr/0055); and the screening
 * expiry nightly at 03:35 (docs/adr/0062).
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
  /** Where the monitoring schedule queues each practice's jobs (pg-boss). */
  readonly queue?: JobSender;
  /** Where mail to the support address waits (SES's bucket, or a local directory). */
  readonly inbox?: SupportInbox;
  readonly now?: () => Date;
}

/** The monitoring schedule ran on a worker that has no queue to send to. */
export class NoQueueError extends Error {
  override readonly name = 'NoQueueError';
}

/** The support mail job ran on a worker that has no inbox to read. */
export class NoInboxError extends Error {
  override readonly name = 'NoInboxError';
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
      const result = await runDunning({ pool: dependencies.operator, mail: dependencies.mail, origin: dependencies.appOrigin, requestId: context.jobId, now: now() });
      if (result.undeliverable > 0) {
        context.logger.error('dunning notice had no organization administrator to send to', { job_id: context.jobId, error_code: 'NOTICE_UNDELIVERABLE' });
      }
      if (result.notices > 0) {
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
      const result = await withOperator(dependencies.operator, (client) => sendSupportGrantNotices({ client, mail: dependencies.mail, origin: dependencies.appOrigin, requestId: context.jobId }));
      if (result.undeliverable > 0) {
        // A practice with no administrator to tell: the operator follows up (PRD 19, Break-glass access).
        context.logger.error('support grant notice had no practice administrator to send to', { job_id: context.jobId, error_code: 'NOTICE_UNDELIVERABLE' });
      }
      if (result.opened + result.closed > 0) {
        context.logger.info('support grant notices sent', { job_id: context.jobId });
      }
    },
  };
}
