import { z } from 'zod';

/** Every job the worker runs. Each is its own pg-boss queue. */
export const JOB_TYPES = ['parse_835', 'price', 'triage', 'reconcile', 'digest', 'export'] as const;
export type JobType = (typeof JOB_TYPES)[number];

const id = z.uuid();
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'a calendar month, YYYY-MM');

/**
 * Job payloads carry opaque IDs only, never a name, date of birth, member ID, claim number or
 * document text (CLAUDE.md). Strict objects refuse any extra field, so nothing else can ride along.
 * Every job belongs to exactly one practice.
 */
export const JOB_PAYLOADS = {
  parse_835: z.strictObject({ practice_id: id, document_id: id }),
  price: z.strictObject({ practice_id: id, pricing_run_id: id }),
  triage: z.strictObject({ practice_id: id, pricing_run_id: id }),
  reconcile: z.strictObject({ practice_id: id, document_id: id }),
  digest: z.strictObject({ practice_id: id, period: month }),
  export: z.strictObject({ practice_id: id, export_job_id: id }),
} satisfies Record<JobType, z.ZodType<{ practice_id: string }>>;

export type JobPayload<T extends JobType> = z.infer<(typeof JOB_PAYLOADS)[T]>;

/** What a job of each type is about: the idempotency subject inside its practice. */
const SUBJECTS: { readonly [T in JobType]: (payload: JobPayload<T>) => string } = {
  parse_835: (payload) => payload.document_id,
  price: (payload) => payload.pricing_run_id,
  triage: (payload) => payload.pricing_run_id,
  reconcile: (payload) => payload.document_id,
  digest: (payload) => payload.period,
  export: (payload) => payload.export_job_id,
};

/**
 * The pg-boss singleton key: job type, practice and subject. With the `exclusive` queue policy a
 * second job with the same key is refused while the first is queued or active, so a replayed
 * request has no duplicate effect.
 */
export function singletonKey<T extends JobType>(type: T, payload: JobPayload<T>): string {
  return `${type}:${payload.practice_id}:${SUBJECTS[type](payload)}`;
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
