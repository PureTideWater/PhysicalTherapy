import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

import { type PracticeScope, type ScopeClient, LocalKeyProvider, openPool, withJobScope } from '@tp/db';
import { createLogger } from '@tp/observability';

import { jobHeap, startHeapWatch } from '../../heap';
import { MemorySealedBytes } from '../../intake/test-support/memory-bytes';
import { generateAuditReport } from '../../report/generate';
import { ChromiumPdfRenderer, type PdfRenderer, chromiumInstalled } from '../../report/pdf';
import { DocumentStore } from '../../storage/documents';
import { type TriageJobContext, executeTriage } from '../execute';

/**
 * For CAS-42.1 and CAS-42.2 (SUITE-CAP-1b; docs/adr/0083): runs the jobs named in TP_LARGE_JOBS at once in this
 * process, as the worker runs one job per practice queue in one process, and prints what they did as JSON on one line.
 * triage.large.db.test.ts starts it as a child process under a heap flag (`--max-old-space-size`), so a job that needs
 * more heap than the flag allows is stopped by V8, as the worker would be. Each job runs in its practice's job scope on
 * the worker's own login, through the job's own code (executeTriage, generateAuditReport); the report prints with
 * Chromium where it is installed (PLAYWRIGHT_BROWSERS_PATH), as the worker's image does.
 *
 * The live heap is D19's (apps/worker/src/heap.ts): the heap in use just after each major collection, the largest seen
 * while the jobs ran. The sampled `heapUsed` and resident memory are printed beside it for the record only: they count
 * garbage V8 has yet to collect. A's actionable write is timed as the one statement that writes its actionable events.
 *
 * Synthetic data only: the practices' data keys are sealed under the test's own random local master key.
 */

interface TriageJob {
  readonly kind: 'triage';
  readonly practiceId: string;
  readonly pricingRunId: string;
}

interface ReportJob {
  readonly kind: 'report';
  readonly practiceId: string;
  readonly auditReportId: string;
}

export interface LargeJobsInput {
  readonly workerUrl: string;
  readonly masterKeyHex: string;
  readonly asOf: string;
  readonly jobs: readonly (TriageJob | ReportJob)[];
}

export interface LargeJobResult {
  readonly kind: 'triage' | 'report';
  readonly practiceId: string;
  readonly outcome: string;
  readonly summary: unknown;
  readonly ms: number;
  /** The statement that wrote the job's actionable events, in ms (0 when it wrote none). */
  readonly actionableWriteMs: number;
  readonly heapLivePeakMib: number;
  /** The job's slowest statements by their total time: each text's first 120 characters (never its values), its total ms and how many times it ran. */
  readonly slowest: readonly { readonly ms: number; readonly runs: number; readonly text: string }[];
}

export interface LargeJobsOutput {
  readonly jobs: readonly LargeJobResult[];
  /** The whole run's live heap peak (D19's observer), in MiB rounded up. */
  readonly heapLivePeakMib: number;
  readonly heapLimitMib: number;
  readonly sampledHeapPeakMib: number;
  readonly rssPeakMib: number;
  readonly ms: number;
  readonly chromium: boolean;
}

const MIB = 1024 * 1024;

const bound = <T extends object>(target: T, key: string | symbol): unknown => {
  const value: unknown = Reflect.get(target, key, target);
  return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
};

interface Timed {
  ms: number;
  readonly statements: Map<string, { ms: number; runs: number }>;
}

/** Statements reported per job, slowest first. */
const SLOWEST_KEPT = 5;

/** A scope whose statements that write actionable events add their time to `timed.ms`, and whose slowest are kept. */
function timedActionable(scope: PracticeScope<ScopeClient>, timed: Timed): PracticeScope<ScopeClient> {
  const client = new Proxy(scope.client, {
    get(target, key) {
      if (key !== 'query') {
        return bound(target, key);
      }
      return async (...args: unknown[]) => {
        const [text, values] = args as [unknown, unknown];
        const actionable = typeof text === 'string' && text.includes('INSERT INTO line_status') && Array.isArray(values) && values[3] === 'actionable';
        const started = performance.now();
        try {
          return await (target.query as (...query: unknown[]) => Promise<unknown>).apply(target, args);
        } finally {
          const ms = performance.now() - started;
          if (actionable) {
            timed.ms += ms;
          }
          if (typeof text === 'string') {
            const key = text.replace(/\s+/g, ' ').trim().slice(0, 120);
            const seen = timed.statements.get(key) ?? { ms: 0, runs: 0 };
            timed.statements.set(key, { ms: seen.ms + ms, runs: seen.runs + 1 });
          }
        }
      };
    },
  });
  return new Proxy(scope, { get: (target, key) => (key === 'client' ? client : bound(target, key)) });
}

async function main(): Promise<void> {
  const input = JSON.parse(process.env.TP_LARGE_JOBS ?? '{}') as LargeJobsInput;
  const pool = openPool(input.workerUrl, Math.max(2, input.jobs.length * 2));
  const keys = new LocalKeyProvider(Buffer.from(input.masterKeyHex, 'hex'));
  const chromium = chromiumInstalled();
  const pdf: PdfRenderer = chromium ? new ChromiumPdfRenderer() : { render: () => Promise.resolve(new TextEncoder().encode('%PDF-1.7 SYNTHETIC STAND-IN')) };
  const services = { documents: new DocumentStore(new MemorySealedBytes()), keys, pdf };
  const stopWatch = startHeapWatch();
  const whole = jobHeap();
  let sampledHeapPeak = 0;
  let rssPeak = 0;
  const sample = () => {
    const memory = process.memoryUsage();
    sampledHeapPeak = Math.max(sampledHeapPeak, memory.heapUsed);
    rssPeak = Math.max(rssPeak, memory.rss);
  };
  const sampler = setInterval(sample, 250);
  const started = performance.now();
  try {
    const jobs = await Promise.all(
      input.jobs.map(async (job): Promise<LargeJobResult> => {
        const timed: Timed = { ms: 0, statements: new Map() };
        const context: TriageJobContext = {
          jobId: randomUUID(),
          logger: createLogger({ sink: () => undefined }),
          transaction: (work) => withJobScope(pool, { jobId: randomUUID(), practiceId: job.practiceId }, (scope) => work(timedActionable(scope, timed))),
        };
        const heap = jobHeap();
        const jobStarted = performance.now();
        const answer = job.kind === 'triage' ? await executeTriage(context, job.practiceId, job.pricingRunId, { asOf: input.asOf }) : await generateAuditReport(context, services, job.practiceId, job.auditReportId, { asOf: input.asOf });
        const ms = performance.now() - jobStarted;
        return {
          kind: job.kind,
          practiceId: job.practiceId,
          outcome: answer.outcome,
          summary: 'summary' in answer ? answer.summary : null,
          ms: Math.round(ms),
          actionableWriteMs: Math.round(timed.ms),
          heapLivePeakMib: heap.end().heapLivePeakMib,
          slowest: [...timed.statements]
            .map(([text, seen]) => ({ ms: Math.round(seen.ms), runs: seen.runs, text }))
            .sort((x, y) => y.ms - x.ms)
            .slice(0, SLOWEST_KEPT),
        };
      }),
    );
    sample();
    const peak = whole.end();
    const output: LargeJobsOutput = {
      jobs,
      heapLivePeakMib: peak.heapLivePeakMib,
      heapLimitMib: peak.heapLimitMib,
      sampledHeapPeakMib: Math.ceil(sampledHeapPeak / MIB),
      rssPeakMib: Math.ceil(rssPeak / MIB),
      ms: Math.round(performance.now() - started),
      chromium,
    };
    process.stdout.write(`${JSON.stringify(output)}\n`);
  } finally {
    clearInterval(sampler);
    stopWatch();
    await pool.end();
  }
}

try {
  await main();
} catch (error) {
  // The failure on one line, last on stderr, for the test's message: the SQLSTATE and the message (synthetic data only).
  const { code, message } = error as { code?: unknown; message?: unknown };
  process.stderr.write(`\nlarge job failed: ${JSON.stringify({ code, message })}\n`);
  process.exitCode = 1;
}
