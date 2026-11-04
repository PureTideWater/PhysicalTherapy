import type { DatabaseClient } from '@tp/db';
import { asOwner } from '@tp/db/testing';

/**
 * WIP instrumentation only (co-001/wip-sc1b-retry-1; never merged): CAS-42.5's attempt-2 jobs on 3ac856d5 (run
 * 41901463895) left their first attempts' errors in the artifact alone, and the worker logs nothing for an attempt that
 * is retried. This probe prints to the job log, each second on a connection of its own:
 *
 * - each failed attempt pg-boss holds (state retry or failed, its serialized error in pgboss.job.output until the next
 *   attempt completes): the job's ID, queue, retry count, the error's class and SQLSTATE, a fixed kind for the driver's
 *   and pg-boss's own fixed texts, and the stack's code locations. Never the error's message;
 * - in the sampled phases, the worker login's backends (the practice jobs' pool) and the queue login's: pid, state,
 *   transaction age, the statement's first keyword and the wait event; and the practice jobs active or waiting to retry;
 * - each worker log line at warn or error: its level, fixed message, job ID and type, and error code.
 *
 * IDs, codes, counts and code locations only; the data is SYNTHETIC.
 */

const KINDS: readonly (readonly [string, string])[] = [
  ['timeout exceeded when trying to connect', 'POOL_WAIT_TIMEOUT'],
  ['Connection terminated due to connection timeout', 'POOL_CONNECT_TIMEOUT'],
  ['Connection terminated unexpectedly', 'CONNECTION_TERMINATED'],
  ['job timed out', 'PGBOSS_EXPIRED'],
  ['job heartbeat timeout', 'PGBOSS_HEARTBEAT_LOST'],
];

export interface FailedAttempt {
  readonly name: string;
  readonly code: string;
  readonly kind: string;
  readonly frames: readonly string[];
}

const word = (value: unknown, pattern: RegExp): string | null => (typeof value === 'string' && pattern.test(value) ? value : null);

/** A stack line's function and code location, repository-relative or the package's own path; null for anything else. */
export function frameOf(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('at ')) {
    return null;
  }
  const fn = /^at (?:async )?([A-Za-z0-9_$.<>[\] ]+?) \(/.exec(trimmed)?.[1]?.replace(/\s+/g, '_') ?? '';
  const repo = /((?:apps|packages|tools)\/[A-Za-z0-9_./-]+\.(?:ts|js|mjs|cjs)):(\d+):(\d+)/.exec(trimmed);
  const pkg = /node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+\/[A-Za-z0-9_./-]+\.(?:js|mjs|cjs)):(\d+):(\d+)/.exec(trimmed);
  const internal = /\((node:[a-z_/]+):(\d+):(\d+)\)/.exec(trimmed);
  const dist = /(dist\/[A-Za-z0-9_./-]+\.(?:js|mjs|cjs)):(\d+):(\d+)/.exec(trimmed);
  const at = repo ?? pkg ?? internal ?? dist;
  if (at === null) {
    return fn === '' ? null : `${fn}@?`;
  }
  return `${fn === '' ? '<anonymous>' : fn}@${String(at[1])}:${String(at[2])}`;
}

/** What the probe prints of a failed attempt's serialized error: never its message, only a fixed kind for known texts. */
export function failedAttempt(output: unknown): FailedAttempt {
  const value = typeof output === 'object' && output !== null ? (output as Record<string, unknown>) : {};
  const inner = typeof value.value === 'object' && value.value !== null ? (value.value as Record<string, unknown>) : value;
  const message = typeof inner.message === 'string' ? inner.message : '';
  const code = word(inner.code, /^[0-9A-Z]{5}$/) ?? word(inner.code, /^[A-Z][A-Z0-9_]{1,40}$/) ?? 'none';
  const known = KINDS.find(([text]) => message === text || message.startsWith(`${text}`))?.[1];
  const kind = known ?? (code !== 'none' ? `CODE_${code}` : 'OTHER');
  const name = word(inner.name, /^[A-Za-z][A-Za-z0-9_]{0,60}$/) ?? 'unnamed';
  const stack = typeof inner.stack === 'string' ? inner.stack.split('\n') : [];
  const frames = stack.map(frameOf).filter((frame): frame is string => frame !== null).slice(0, 10);
  const cause = typeof inner.cause === 'object' && inner.cause !== null ? failedAttempt(inner.cause) : null;
  return { name, code, kind: cause === null ? kind : `${kind}<-${cause.kind}:${cause.name}:${cause.code}`, frames };
}

const STATE: Readonly<Record<string, string>> = { active: 'A', idle: 'I', 'idle in transaction': 'T', 'idle in transaction (aborted)': 'X', fastpath: 'F', disabled: 'D' };

export interface Backend {
  readonly usename: string;
  readonly pid: number;
  readonly state: string | null;
  readonly wait_event_type: string | null;
  readonly wait_event: string | null;
  readonly xact_s: number | null;
  readonly verb: string | null;
}

/** One backend as pid:state:transaction age:first keyword[:wait]. */
export function backendLine(backend: Backend): string {
  const state = backend.state === null ? '-' : (STATE[backend.state] ?? '?');
  const age = backend.xact_s === null ? '-' : backend.xact_s.toFixed(1);
  const verb = word(backend.verb, /^[A-Z]{2,12}$/) ?? '?';
  const wait = backend.wait_event_type === null ? '' : `:${word(backend.wait_event_type, /^[A-Za-z]{1,20}$/) ?? '?'}/${word(backend.wait_event, /^[A-Za-z0-9_]{1,40}$/) ?? '?'}`;
  return `${String(backend.pid)}:${state}:${age}:${verb}${wait}`;
}

/** A worker log line at warn or error, as the probe prints it: fixed fields only. */
export function workerLogLine(line: string): string | null {
  const start = line.indexOf('{');
  if (start === -1) {
    return null;
  }
  try {
    const entry = JSON.parse(line.slice(start)) as Record<string, unknown>;
    if (entry.level !== 'warn' && entry.level !== 'error') {
      return null;
    }
    const field = (key: string, pattern: RegExp) => word(entry[key], pattern) ?? '-';
    return [
      field('time', /^[0-9T:.Z-]{10,30}$/),
      field('level', /^[a-z]{1,8}$/),
      field('job_type', /^[a-z_0-9]{1,30}$/),
      field('job_id', /^[0-9a-f-]{36}$/),
      field('error_code', /^[A-Z][A-Z0-9_]{1,60}$/),
      JSON.stringify(typeof entry.msg === 'string' ? entry.msg.slice(0, 120) : ''),
    ].join(' ');
  } catch {
    return null;
  }
}

interface JobRow {
  readonly id: string;
  readonly name: string;
  readonly state: string;
  readonly retry_count: number;
  readonly age_s: number | null;
  readonly practice_id: string | null;
  readonly started_on: Date | null;
  readonly output: unknown;
}

interface RunRow {
  readonly attempts: number;
  readonly outcome: string;
  readonly error_code: string | null;
  readonly started_after_s: number | null;
  readonly finished_after_s: number | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * The job's job_run row (the worker's runs.started and recordEnd, each a job scope on the practice pool), against the
 * attempt's pg-boss started_on: started_after_s is how long the attempt waited for its first connection (job_run's
 * started_at is that transaction's now()), finished_after_s when its end was recorded. No row: runs.started never ran.
 */
async function jobRun(client: DatabaseClient, job: JobRow): Promise<string> {
  if (job.practice_id === null || !UUID.test(job.practice_id) || job.started_on === null) {
    return 'job_run unread';
  }
  const practiceId = job.practice_id;
  const startedOn = job.started_on;
  const row = await asOwner(client, [practiceId], async () =>
    (
      await client.query<RunRow>(
        `SELECT attempts, outcome, error_code, extract(epoch FROM started_at - $2::timestamptz)::float8 AS started_after_s,
                extract(epoch FROM finished_at - $2::timestamptz)::float8 AS finished_after_s FROM job_run WHERE job_id = $1`,
        [job.id, startedOn],
      )
    ).rows[0],
  ).catch(() => 'error' as const);
  if (row === 'error') {
    return 'job_run unread (error)';
  }
  if (row === undefined) {
    return 'job_run none (runs.started never wrote)';
  }
  const at = (value: number | null) => (value === null ? '-' : `${value >= 0 ? '+' : ''}${value.toFixed(1)}s`);
  return `job_run attempts ${String(row.attempts)} outcome ${word(row.outcome, /^[a-z_]{1,20}$/) ?? '?'} code ${row.error_code ?? '-'} started ${at(row.started_after_s)} finished ${at(row.finished_after_s)} after started_on`;
}

export interface RetryProbeOptions {
  readonly logins: { readonly worker: string; readonly queue: string };
  readonly queues: readonly string[];
  /** The sampled period open now (run.ts openPeriod). */
  readonly during: () => string;
  /** Periods printed each second; others every fifteenth second. */
  readonly everySecond: readonly string[];
  readonly workerLog: () => Promise<readonly string[]>;
  readonly say: (line: string) => void;
}

/** Starts the probe on its own connection; stop ends it. A read that fails is skipped; the probe never stops the run. */
export function retryProbe(connect: () => Promise<DatabaseClient>, options: RetryProbeOptions): { readonly stop: () => Promise<void> } {
  let running = true;
  const seen = new Set<string>();
  let logLines = 0;
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const loop = (async () => {
    const client = await connect().catch(() => null);
    if (client === null) {
      options.say('[retry-probe] no connection; probe off');
      return;
    }
    options.say(`[retry-probe] on: worker login ${options.logins.worker}, queue login ${options.logins.queue}`);
    let tick = 0;
    try {
      while (running) {
        const period = options.during();
        const jobs = await client
          .query<JobRow>(
            `SELECT id::text, name, state::text, retry_count, extract(epoch FROM now() - started_on)::float8 AS age_s, data ->> 'practice_id' AS practice_id, started_on, output
               FROM pgboss.job WHERE name = ANY ($1::text[]) AND (state IN ('active', 'retry', 'failed') OR retry_count > 0)`,
            [[...options.queues]],
          )
          .catch(() => null);
        for (const job of jobs?.rows ?? []) {
          if ((job.state === 'retry' || job.state === 'failed') && job.output !== null) {
            const key = `${job.id}:${String(job.retry_count)}:${job.state}`;
            if (!seen.has(key)) {
              seen.add(key);
              const failed = failedAttempt(job.output);
              options.say(
                `[retry-probe] FAILED ATTEMPT job ${job.id} ${job.name} retry_count ${String(job.retry_count)} state ${job.state} during ${period}, seen ${job.age_s === null ? '-' : job.age_s.toFixed(1)} s after its started_on: error ${failed.name} code ${failed.code} kind ${failed.kind}; ${await jobRun(client, job)}; frames ${failed.frames.join(' < ') || 'none'}`,
              );
            }
          }
        }
        if (options.everySecond.includes(period) || tick % 15 === 0) {
          const backends = await client
            .query<Backend>(
              `SELECT usename::text, pid, state, wait_event_type, wait_event, extract(epoch FROM now() - xact_start)::float8 AS xact_s,
                      upper(split_part(ltrim(query), ' ', 1)) AS verb
                 FROM pg_stat_activity WHERE datname = current_database() AND usename::text = ANY ($1::text[]) AND pid <> pg_backend_pid() ORDER BY usename, pid`,
              [[options.logins.worker, options.logins.queue]],
            )
            .catch(() => null);
          if (backends !== null) {
            const worker = backends.rows.filter((row) => row.usename === options.logins.worker);
            const queue = backends.rows.filter((row) => row.usename === options.logins.queue);
            const busy = worker.filter((row) => row.state !== 'idle').length;
            const active = (jobs?.rows ?? []).filter((job) => job.state === 'active' || job.state === 'retry');
            options.say(
              `[retry-probe] ${period} | worker ${String(worker.length)} busy ${String(busy)}: ${worker.map(backendLine).join(' ')} | queue ${String(queue.length)} busy ${String(queue.filter((row) => row.state !== 'idle').length)} | jobs ${active
                .map((job) => `${job.name}:${job.id.slice(0, 8)}:${job.state}:${String(job.retry_count)}:${job.age_s === null ? '-' : job.age_s.toFixed(1)}`)
                .join(' ')}`,
            );
          }
        }
        if (tick % 5 === 0) {
          const lines = await options.workerLog().catch(() => null);
          if (lines !== null) {
            for (const line of lines.slice(logLines)) {
              const printed = workerLogLine(line);
              if (printed !== null) {
                options.say(`[retry-probe] worker log: ${printed}`);
              }
            }
            logLines = Math.max(logLines, lines.length);
          }
        }
        tick += 1;
        await sleep(1000);
      }
    } finally {
      // The log's last lines, read once more as the probe stops.
      const lines = await options.workerLog().catch(() => null);
      for (const line of lines?.slice(logLines) ?? []) {
        const printed = workerLogLine(line);
        if (printed !== null) {
          options.say(`[retry-probe] worker log: ${printed}`);
        }
      }
      const finished = await client
        .query<JobRow & { readonly ran_s: number | null }>(
          `SELECT id::text, name, state::text, retry_count, NULL::float8 AS age_s, data ->> 'practice_id' AS practice_id, started_on, NULL::jsonb AS output,
                  extract(epoch FROM completed_on - started_on)::float8 AS ran_s
             FROM pgboss.job WHERE name = ANY ($1::text[]) AND started_on IS NOT NULL ORDER BY started_on`,
          [[...options.queues]],
        )
        .catch(() => null);
      for (const job of finished?.rows ?? []) {
        options.say(
          `[retry-probe] job ${job.id} ${job.name} state ${job.state} retry_count ${String(job.retry_count)} ran ${job.ran_s === null ? '-' : job.ran_s.toFixed(1)} s (last attempt); ${await jobRun(client, job)}`,
        );
      }
      options.say(`[retry-probe] off: ${String(seen.size)} failed attempts seen`);
      await client.end().catch(() => undefined);
    }
  })().catch(() => undefined);
  return {
    stop: async () => {
      running = false;
      await loop;
    },
  };
}
