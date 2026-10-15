import { z } from 'zod';

/**
 * Every job the worker runs. Each is its own pg-boss queue. `intake` takes an upload in once its bytes
 * have arrived (hash, duplicate check, malware scan, sniffing, zip expansion) and queues parse_835 for
 * each clean 835 it finds (docs/adr/0026). `triage` screens a complete pricing run's lines and groups
 * its validated ones into cases; `audit_report` triages a run and generates its audit report (the PDF
 * and the line CSV, docs/adr/0038).
 *
 * The monitoring chain (PRD 5, J11; docs/adr/0039): each parse_835 queues `monitor` once its document is
 * done, which creates a pricing run under the release in force for each service month whose lines no
 * run covers yet (or, on the daily schedule, for the day) and queues `price` for it; a price job that
 * completes a run the chain created queues `triage`, and triage queues `reconcile` (the recovery
 * ledger's step, milestone 9). `digest` sends a practice's monthly digest.
 */
export const JOB_TYPES = ['intake', 'parse_835', 'monitor', 'price', 'triage', 'audit_report', 'reconcile', 'digest', 'export'] as const;
export type JobType = (typeof JOB_TYPES)[number];

const id = z.uuid();
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'a calendar month, YYYY-MM');
const day = z.iso.date();

/**
 * Job payloads carry opaque IDs only, never a name, date of birth, member ID, claim number or
 * document text (CLAUDE.md). Strict objects refuse any extra field, so nothing else can ride along.
 * Every job belongs to exactly one practice.
 */
export const JOB_PAYLOADS = {
  intake: z.strictObject({ practice_id: id, document_id: id }),
  parse_835: z.strictObject({ practice_id: id, document_id: id }),
  /** After a document of an upload batch is done (its ID), or on the daily schedule (the day, UTC). */
  monitor: z.union([z.strictObject({ practice_id: id, document_id: id }), z.strictObject({ practice_id: id, day })]),
  price: z.strictObject({ practice_id: id, pricing_run_id: id }),
  triage: z.strictObject({ practice_id: id, pricing_run_id: id }),
  audit_report: z.strictObject({ practice_id: id, audit_report_id: id }),
  /** After triage of a run the monitoring chain priced: the ledger's step for that run (milestone 9). */
  reconcile: z.strictObject({ practice_id: id, pricing_run_id: id }),
  digest: z.strictObject({ practice_id: id, period: month }),
  export: z.strictObject({ practice_id: id, export_job_id: id }),
} satisfies Record<JobType, z.ZodType<{ practice_id: string }>>;

export type JobPayload<T extends JobType> = z.infer<(typeof JOB_PAYLOADS)[T]>;

/** What a job of each type is about: the idempotency subject inside its practice. */
const SUBJECTS: { readonly [T in JobType]: (payload: JobPayload<T>) => string } = {
  intake: (payload) => payload.document_id,
  parse_835: (payload) => payload.document_id,
  monitor: (payload) => ('document_id' in payload ? payload.document_id : payload.day),
  price: (payload) => payload.pricing_run_id,
  triage: (payload) => payload.pricing_run_id,
  audit_report: (payload) => payload.audit_report_id,
  reconcile: (payload) => payload.pricing_run_id,
  digest: (payload) => payload.period,
  export: (payload) => payload.export_job_id,
};

/** The job's idempotency subject inside its practice (job_run.idempotency_key). */
export function jobSubject<T extends JobType>(type: T, payload: JobPayload<T>): string {
  return SUBJECTS[type](payload);
}

/**
 * The pg-boss singleton key: job type, practice and subject. With the `exclusive` queue policy a
 * second job with the same key is refused while the first is queued or active, so a replayed
 * request has no duplicate effect.
 */
export function singletonKey<T extends JobType>(type: T, payload: JobPayload<T>): string {
  return `${type}:${payload.practice_id}:${jobSubject(type, payload)}`;
}

/** Validates a payload for a job type; throws a ZodError on anything else. */
export function parsePayload<T extends JobType>(type: T, payload: unknown): JobPayload<T> {
  return JOB_PAYLOADS[type].parse(payload) as JobPayload<T>;
}

/**
 * Queue settings shared by every job type. Three attempts in all (two retries) with backoff,
 * then the job fails and stays visible for the operator (PRD section 10: parsed at most three
 * times; test matrix JOB-02: three failures raise the alert).
 */
export const QUEUE_OPTIONS = {
  policy: 'exclusive',
  retryLimit: 2,
  retryDelay: 30,
  retryBackoff: true,
} as const;

/**
 * Each queue's settings: the shared ones, and for intake an hour before pg-boss expires an attempt
 * (its default is fifteen minutes): an attempt may wait up to ten minutes for the malware scan and then
 * stream a 2 GiB zip into its entries.
 */
export function queueOptions(type: JobType): typeof QUEUE_OPTIONS & { readonly expireInSeconds?: number } {
  return type === 'intake' ? { ...QUEUE_OPTIONS, expireInSeconds: 3600 } : QUEUE_OPTIONS;
}

export interface WorkOptions {
  readonly batchSize: 1;
  readonly pollingIntervalSeconds?: number;
  readonly localConcurrency?: number;
}

/** How many parse_835 jobs one worker runs at once. */
export const PARSE_CONCURRENCY = 4;

/**
 * How the worker takes each queue's jobs: one job per fetch, pg-boss's two-second poll. A zip queues
 * hundreds of parse_835 jobs at once, each a fraction of a second's work, so that queue is polled
 * every half second (pg-boss's minimum) by four workers per process: a 500-file zip loads in about a
 * minute rather than seventeen. Concurrent loads of one practice are safe (ADR 0027: the remittance
 * key, an advisory lock per trace, and upserts in one order).
 */
export function workOptions(type: JobType): WorkOptions {
  return type === 'parse_835' ? { batchSize: 1, pollingIntervalSeconds: 0.5, localConcurrency: PARSE_CONCURRENCY } : { batchSize: 1 };
}
