import type { Logger } from '@tp/observability';
import { z } from 'zod';

import { copyAuditDay, previousDay } from '../platform/audit-copy';
import type { MailSender } from '../mail/mail';
import { queueMonitoringSchedule } from '../platform/monitoring-schedule';
import { type RestoreDrillResult, RestoreDrillFailedError, type SnapshotRestorer, runRestoreDrill } from '../platform/restore-drill';
import { sendSupportGrantNotices } from '../platform/support-notices';
import type { ObjectStore } from '../storage/object-store';
import type { JobSender } from './enqueue';

/**
 * Platform jobs: work on the platform itself rather than on one practice's data, so they carry no
 * practice in their payload (docs/adr/0014). They read no PHI: the audit copy reads audit_event
 * (codes and opaque IDs only), the restore drill counts rows on a scratch copy, and the support-grant
 * notices read IDs, counts of reads and the administrators' email addresses (docs/adr/0017) through
 * three narrow functions, one practice per transaction; the monitoring schedule reads the active
 * practices' IDs through one more and queues each practice's own monitor and digest jobs (docs/adr/0039).
 * They run on the operator connection, every
 * transaction as tp_operator (which owns nothing and cannot bypass row-level security), which the
 * worker holds only where OPERATOR_DATABASE_URL is configured; the restore drill alone uses an owner
 * login, and only on its scratch copy. A practice job (jobs/registry.ts) never runs this way.
 */
export const PLATFORM_JOB_TYPES = ['audit_copy', 'restore_drill', 'support_grant_notices', 'monitoring_schedule'] as const;
export type PlatformJobType = (typeof PLATFORM_JOB_TYPES)[number];

const day = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'a calendar day, YYYY-MM-DD');

export const PLATFORM_JOB_PAYLOADS = {
  /** The day to copy; the scheduled run omits it and copies yesterday (UTC). */
  audit_copy: z.strictObject({ day: day.optional() }),
  restore_drill: z.strictObject({}),
  support_grant_notices: z.strictObject({}),
  /** The day to schedule; the scheduled run omits it and takes today (UTC). */
  monitoring_schedule: z.strictObject({ day: day.optional() }),
} satisfies Record<PlatformJobType, z.ZodType>;

export type PlatformJobPayload<T extends PlatformJobType> = z.infer<(typeof PLATFORM_JOB_PAYLOADS)[T]>;

export function parsePlatformPayload<T extends PlatformJobType>(type: T, payload: unknown): PlatformJobPayload<T> {
  return PLATFORM_JOB_PAYLOADS[type].parse(payload ?? {}) as PlatformJobPayload<T>;
}

/**
 * When each runs, in UTC: the audit copy nightly at 01:20, after the day it copies has closed; the
 * restore drill on the first Monday of each month at 06:00 (PRD 19 Runbooks, Restore drill); the
 * support-grant notices every minute, so a notice goes out within a minute of a grant opening or
 * ending; the monitoring schedule daily at 05:10, so the month's digest goes out on its first morning.
 */
export const PLATFORM_SCHEDULES: Readonly<Record<PlatformJobType, string>> = {
  audit_copy: '20 1 * * *',
  restore_drill: 'FREQ=MONTHLY;BYDAY=1MO;BYHOUR=6;BYMINUTE=0;BYSECOND=0',
  support_grant_notices: '* * * * *',
  monitoring_schedule: '10 5 * * *',
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
  readonly now?: () => Date;
}

/** The monitoring schedule ran on a worker that has no queue to send to. */
export class NoQueueError extends Error {
  override readonly name = 'NoQueueError';
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
