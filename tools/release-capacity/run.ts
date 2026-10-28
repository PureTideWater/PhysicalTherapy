import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs, promisify } from 'node:util';

import { type DatabaseClient, type DatabasePool, type ScopeClient, databaseClient, developmentMasterKey, openPool, withPracticeScope } from '@tp/db';
import { asOwner } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { QUARTERLY_SCALE_RELEASE_NUMBER } from '@tp/synth';
import { releaseContentWindows } from '@tp/worker/pricing';
import type { QueryResult, QueryResultRow } from 'pg';

import { PgBossQueue } from '../../apps/web/src/lib/uploads/queue';
import { environmentSettings } from '../../infra/lib/environments';
import { heapFlag } from '../../infra/lib/heap';
import { repositoryRoot } from '../content-files';
import { scaleReleaseDirName } from '../release/scale';
import { CommandError, DockerRuntime, ProcessRuntime, type Runtime, type ServiceSpec, masked, processImagesProblems, serviceCommand, stderrTail } from '../screening-capacity/containers';
import { HARNESS_LOGINS, type HarnessDirectories, harnessLogins, loginUrl, loginsEnvironment, workerEnvironment } from '../screening-capacity/env';
import { MIB, NETWORK_DELAY_MS, cpuLayout, harnessCpus, postgresLimit, productionLimits, runnerTooSmall, taskLimit } from '../screening-capacity/limits';
import { memoryEvents, workerStarted } from '../screening-capacity/measure';
import { type AdvisoryLockSamples, type CapacityMeasurements, type JobHeap, type JobOutcome, type JobPhase, type SampledPeriod, type WindowsQuery, type WorkerMemory, advisoriesOutput, errorCodes, jobHeaps, markdown, report } from './checks';
import {
  FULL_SIZE,
  SMALL_SIZE,
  type ScenarioSize,
  type SeededPractice,
  type Seeding,
  actionableLines,
  capacity835,
  createRun,
  insertClaims,
  mapPlans,
  practiceClaims,
  reprocessing,
  requestReport,
  seedPractice,
  specialist,
  stage835,
  stagePostingExport,
  withHeapFlag,
} from './scenario';

/**
 * The weekly real-size test (audit #31; docs/adr/0071; .github/workflows/release-capacity.yml): the worker image's
 * practice jobs at the worker task's limits under the quarterly scale release 900110, as one production worker runs
 * them, every job type's loop at once (apps/worker/src/worker.ts) and parse_835 four at a time. Steps, as the design's
 * 5.10 numbers them:
 *
 *  2. build release 900110 outside the repository in a child process (or take one already built: --release-dir);
 *  3. start Postgres at production's database class and storage limits (tools/screening-capacity's runtime: Docker in
 *     CI, or a scratch database on the caller's server), migrate and create the logins, load the release in a child;
 *  4. seed the SYNTHETIC practices A to E (scenario.ts), C's second set of 835s staged too;
 *  5. start the worker at the worker task's limits (taskLimit(compute.worker): 0.5 vCPU and 1,024 MiB, no swap) with
 *     production's command and heapFlag('worker') after node (infra/lib/heap.ts; the flag is added here, never in
 *     tools/screening-capacity, so the screening's watched list does not change); price and triage B's period, and
 *     request its audit report; price D's period (setup: not measured);
 *  6. the concurrent phase, queued within a second: A's run created by the billing manager and its price job, B's
 *     audit_report job (a PDF printed by Chromium in the same container), C's four parse_835 jobs; memory.current
 *     sampled every second until all six finish (the harness cannot reset memory.peak through the runtime, so the
 *     phase's peak is the samples' maximum);
 *  7. the chain: A's triage job, then A's audit report; each wait up to 45 minutes, memory.current sampled each second
 *     for each job alone;
 *  7b. A's reconcile (the ledger freeze exception granted 2026-10-27; docs/adr/0083): SYNTHETIC 835s reprocessing every
 *     claim with an actionable line, each line paid its expected amount, staged and parsed, then a SYNTHETIC posting
 *     export posting each actionable line from its own row, staged as intake leaves it and reconciled by the reconcile
 *     job (the approvals and the postings in one pass), measured like the chain;
 *  7c. the large jobs together (D20): A's second audit report (its inline triage a re-triage), D's triage, E's run
 *     created and its price job, and C's second four parses, queued within a second, memory.current sampled each
 *     second until all seven finish;
 *  8. the web's windows query on the release (releaseContentWindows), cold after a restart of Postgres and warm, with
 *     its EXPLAIN (ANALYZE, BUFFERS);
 *  9. read back every job's state and attempt, the run, the counts, the container's memory.peak, OOM kills and
 *     restarts, the worker log's error codes and each job's `job heap` line (D19); write release-capacity.json and
 *     summary.md (and the job summary in CI); exit non-zero on any failing check (checks.ts). Times are advisory.
 *
 * Over the whole run, from the migration to the read-back, a sampler reads each second the largest advisory-lock count
 * any one backend of the run's database holds (D10).
 *
 * `--small` runs the same steps at a smoke size (the quarterly shape at the unit tests' size, and SMALL_SIZE's
 * practices): it proves the harness end to end and measures nothing. `--worker-image` names the image measured, so the
 * same harness can be pointed at the base's worker image for the pull request's "before". Synthetic data only; nothing
 * it writes carries a row, a name or a key: the worker's saved logs (<out>/logs) hold IDs, codes and counts.
 *
 *   tsx tools/release-capacity/run.ts --out <dir> [--runtime docker --worker-image <tag>] [--runtime process --images <dir> --admin-url <url> --database <name>] [--release-dir <dir>] [--small]
 *   tsx tools/release-capacity/run.ts --print-harness-cpus
 */

const exec = promisify(execFile);

class HarnessStop extends Error {
  override readonly name = 'HarnessStop';
  constructor(readonly code: string) {
    super(code);
  }
}

/** How long the harness waits for one job, or for the concurrent phase's six together. */
const JOB_WAIT_MS = 45 * 60_000;
/** How long the worker has to log its start line. */
const START_WAIT_MS = 180_000;

interface Options {
  readonly out: string;
  readonly runtime: 'docker' | 'process';
  readonly workerImage: string;
  readonly images: string | null;
  readonly adminUrl: string | null;
  readonly database: string;
  readonly releaseDir: string | null;
  readonly small: boolean;
  readonly keepDatabase: boolean;
}

function options(argv: readonly string[]): Options {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      out: { type: 'string' },
      runtime: { type: 'string', default: 'docker' },
      'worker-image': { type: 'string', default: 'tp-worker:capacity' },
      images: { type: 'string' },
      'admin-url': { type: 'string' },
      database: { type: 'string', default: 'tp_release_capacity' },
      'release-dir': { type: 'string' },
      small: { type: 'boolean', default: false },
      'keep-database': { type: 'boolean', default: false },
    },
    strict: true,
  });
  if (values.out === undefined || (values.runtime !== 'docker' && values.runtime !== 'process')) {
    throw new HarnessStop('USAGE');
  }
  if (values.runtime === 'process' && (values.images === undefined || values['admin-url'] === undefined)) {
    throw new HarnessStop('USAGE');
  }
  return {
    out: path.resolve(values.out),
    runtime: values.runtime,
    workerImage: values['worker-image'],
    images: values.images === undefined ? null : path.resolve(values.images),
    adminUrl: values['admin-url'] ?? null,
    database: values.database,
    releaseDir: values['release-dir'] === undefined ? null : path.resolve(values['release-dir']),
    small: values.small,
    keepDatabase: values['keep-database'],
  };
}

/** This runner's CPUs and memory. */
function thisRunner(): { readonly cpus: number; readonly memoryMiB: number; readonly cpuModel: string; readonly kernel: string } {
  return { cpus: os.cpus().length, memoryMiB: Math.floor(os.totalmem() / MIB), cpuModel: os.cpus()[0]?.model ?? 'unknown', kernel: os.release() };
}

const say = (line: string): void => {
  process.stdout.write(`[release-capacity ${new Date().toISOString()}] ${line}\n`);
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A child process of the harness's own (tsx), its standard output returned, with a heap of its own. */
async function child(script: string, args: readonly string[], heapMiB: number): Promise<string> {
  try {
    const { stdout } = await exec(path.join(repositoryRoot, 'node_modules/.bin/tsx'), [path.join(repositoryRoot, script), ...args], {
      cwd: repositoryRoot,
      env: { ...process.env, NODE_OPTIONS: `--max-old-space-size=${String(heapMiB)}` },
      maxBuffer: 64 * MIB,
    });
    return stdout;
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr ?? '';
    printStderr(path.basename(script), stderr);
    throw new HarnessStop(`${path.basename(path.dirname(script)).toUpperCase()}_${path.basename(script, '.ts').toUpperCase()}_FAILED: ${stderrTail(stderr, 300)}`);
  }
}

function printStderr(what: string, stderr: string): void {
  for (const line of masked(stderr).split('\n')) {
    process.stdout.write(`[release-capacity] ${what} stderr: ${line}\n`);
  }
}

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

function directories(root: string): HarnessDirectories {
  const at = (name: string) => path.join(root, name);
  return {
    outbox: at('mail'),
    auditCopies: at('audit'),
    restoreDrill: at('restore-drill'),
    supportMail: at('support-mail'),
    devAuth: at('dev-auth'),
    documents: at('documents'),
    billing: at('billing'),
    modelOutputs: at('model-outputs'),
    agreements: at('agreements'),
    compliance: at('compliance'),
  };
}

/** The quarterly scale release: built in a child process unless the directory already holds one. */
async function ensureRelease(dir: string, small: boolean): Promise<{ readonly dir: string; readonly releaseNo: number; readonly records: number; readonly manifestSha256: string }> {
  const releaseDir = path.join(dir, scaleReleaseDirName(QUARTERLY_SCALE_RELEASE_NUMBER));
  if (!existsSync(path.join(releaseDir, 'MANIFEST.json'))) {
    say(`building the SYNTHETIC quarterly scale release${small ? ' at the smoke size' : ''}`);
    await child('tools/release/scale.ts', ['--shape', 'quarterly', '--out', dir, ...(small ? ['--small'] : [])], 6144);
  }
  const notes = readFileSync(path.join(releaseDir, 'RELEASE.md'), 'utf8');
  const records = Number.parseInt(/\| all \| (\d+) \|/.exec(notes)?.[1] ?? '0', 10);
  return { dir: releaseDir, releaseNo: QUARTERLY_SCALE_RELEASE_NUMBER, records, manifestSha256: createHash('sha256').update(readFileSync(path.join(releaseDir, 'MANIFEST.json'))).digest('hex') };
}

/** A pool whose idle connections a restart of Postgres may drop without stopping the harness. */
function pool(url: string, size: number): DatabasePool {
  const opened = openPool(url, size);
  opened.on('error', () => undefined);
  return opened;
}

async function ownerClient(url: string): Promise<DatabaseClient> {
  const client = databaseClient(url);
  client.on('error', () => undefined);
  await client.connect();
  return client;
}

const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

/** A queued job and its outcome so far. */
interface Queued {
  readonly what: string;
  readonly name: string;
  readonly phase: JobPhase;
  readonly jobId: string | null;
}

/** A queued job's state, time and attempt (pg-boss's retry_count, plus one); its heap is read from the log at the end. */
async function jobOutcome(owner: DatabaseClient, job: Queued): Promise<JobOutcome> {
  if (job.jobId === null) {
    return { ...job, state: 'not_queued', elapsedMs: null, attempts: null, heap: null };
  }
  const { rows } = await owner
    .query<{ state: string; ms: number | null; retry_count: number | null }>(
      'SELECT state, (extract(epoch FROM (completed_on - started_on)) * 1000)::float8 AS ms, retry_count FROM pgboss.job WHERE name = $1 AND id = $2',
      [job.name, job.jobId],
    )
    .catch(() => ({ rows: [] as { state: string; ms: number | null; retry_count: number | null }[] }));
  const row = rows[0];
  return {
    ...job,
    state: row?.state ?? null,
    elapsedMs: row?.ms === null || row?.ms === undefined ? null : Math.round(row.ms),
    attempts: typeof row?.retry_count === 'number' ? row.retry_count + 1 : null,
    heap: null,
  };
}

/**
 * Waits until every job is finished (completed, failed or cancelled) or the wait ends; `tick` runs once at the start and
 * then every second meanwhile, so a period it samples has a sample however soon its jobs finish.
 */
async function waitForJobs(owner: DatabaseClient, jobs: readonly Queued[], tick: () => Promise<void> = () => Promise.resolve()): Promise<JobOutcome[]> {
  const until = Date.now() + JOB_WAIT_MS;
  await tick();
  let outcomes = await Promise.all(jobs.map((job) => jobOutcome(owner, job)));
  while (outcomes.some((outcome) => outcome.state === null || !TERMINAL.has(outcome.state)) && outcomes.every((outcome) => outcome.state !== 'not_queued') && Date.now() < until) {
    await tick();
    await sleep(1000);
    outcomes = await Promise.all(jobs.map((job) => jobOutcome(owner, job)));
  }
  return outcomes;
}

/** A client that records the statement it runs, so the windows query's own text is explained. */
function recording(client: ScopeClient, seen: { text: string; values: unknown[] }[]): ScopeClient {
  return {
    query<R extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<R>> {
      seen.push({ text, values: values ?? [] });
      return client.query<R>(text, values);
    },
    release: (destroy) => {
      client.release(destroy);
    },
  };
}

/** The web's windows query on the release, cold (Postgres restarted, the page cache dropped where the runner allows) and warm. */
async function measureWindows(runtime: Runtime, appUrl: string, practice: SeededPractice, releaseNo: number): Promise<WindowsQuery> {
  const cold = await runtime.restartPostgres();
  const app = pool(appUrl, 1);
  try {
    const timed = async (): Promise<{ readonly ms: number; readonly contents: number; readonly seen: { text: string; values: unknown[] }[] }> => {
      const seen: { text: string; values: unknown[] }[] = [];
      const started = performance.now();
      const windows = await withPracticeScope(app, { actorId: practice.manager, practiceIds: [practice.practiceId] }, (scope) => releaseContentWindows(recording(scope.client, seen), releaseNo));
      return { ms: Math.round(performance.now() - started), contents: windows.size, seen };
    };
    const first = await timed();
    const warm = await timed();
    const statement = warm.seen.at(-1);
    const plan =
      statement === undefined
        ? null
        : await withPracticeScope(app, { actorId: practice.manager, practiceIds: [practice.practiceId] }, async (scope) =>
            (await scope.client.query<{ 'QUERY PLAN': string }>(`EXPLAIN (ANALYZE, BUFFERS) ${statement.text}`, statement.values)).rows.map((row) => row['QUERY PLAN']).join('\n'),
          ).catch(() => null);
    return { coldMs: first.ms, warmMs: warm.ms, coldRestarted: cold.restarted, cacheDropped: cold.cacheDropped, contents: first.contents, plan };
  } finally {
    await app.end();
  }
}

async function readMemory(runtime: Runtime, limitBytes: number, periods: readonly SampledPeriod[]): Promise<WorkerMemory> {
  const v = runtime.cgroupVersion;
  const peakText = await runtime.cgroupFile('worker', v === 2 ? 'memory.peak' : 'memory.max_usage_in_bytes');
  const eventsText = await runtime.cgroupFile('worker', v === 2 ? 'memory.events' : 'memory.oom_control');
  const status = await runtime.status('worker').catch(() => null);
  const peakBytes = peakText === null ? null : Number.parseInt(peakText.trim(), 10);
  return {
    limitBytes,
    peakBytes: peakBytes === null || Number.isNaN(peakBytes) ? null : peakBytes,
    periods,
    oomKills: eventsText === null ? null : memoryEvents(eventsText, v).oomKill,
    oomKilled: status?.oomKilled ?? null,
    restarts: status?.restarts ?? null,
    running: status?.running ?? null,
  };
}

/**
 * Samples, each second until stopped, the largest advisory-lock count any one backend of the run's database holds (D10),
 * on a connection of its own. A sample that cannot be read (a restart of Postgres) is skipped, not counted.
 */
function advisoryLockSampler(url: string): { readonly stop: () => Promise<AdvisoryLockSamples | null> } {
  let running = true;
  let peak = 0;
  let samples = 0;
  const loop = (async () => {
    const client = await ownerClient(url).catch(() => null);
    if (client === null) {
      return;
    }
    try {
      while (running) {
        const read = await client
          .query<{ n: number }>(
            `SELECT coalesce(max(n), 0)::int AS n FROM (SELECT count(*) AS n FROM pg_locks
               WHERE locktype = 'advisory' AND database = (SELECT oid FROM pg_database WHERE datname = current_database()) GROUP BY pid) x`,
          )
          .catch(() => null);
        if (read !== null) {
          peak = Math.max(peak, read.rows[0]?.n ?? 0);
          samples += 1;
        }
        await sleep(1000);
      }
    } finally {
      await client.end().catch(() => undefined);
    }
  })();
  return {
    stop: async () => {
      running = false;
      await loop;
      return samples === 0 ? null : { peak, samples };
    },
  };
}

async function main(): Promise<number> {
  const opts = options(process.argv.slice(2));
  mkdirSync(opts.out, { recursive: true });
  const size: ScenarioSize = opts.small ? SMALL_SIZE : FULL_SIZE;
  const runner = thisRunner();
  const limits = productionLimits();
  const workerLimit = taskLimit(environmentSettings('production').compute.worker);
  const pgLimit = postgresLimit(runner, limits);
  // The screening's layout on this runner: Postgres's CPUs, and the worker on the web task's (the same half vCPU), which
  // no web container takes here.
  const layout = cpuLayout(limits.cpuNeeds, runner.cpus);
  const command = withHeapFlag(serviceCommand('worker'), heapFlag('worker'));
  const logins = opts.runtime === 'process' ? harnessLogins(randomBytes(4).toString('hex')) : HARNESS_LOGINS;
  const dataHost = path.join(opts.out, 'data');
  const runtime: Runtime =
    opts.runtime === 'docker'
      ? new DockerRuntime({ web: opts.workerImage, worker: opts.workerImage }, dataHost, path.join(opts.out, 'logs'))
      : new ProcessRuntime({ worker: path.join(opts.images ?? '', 'worker'), web: path.join(opts.images ?? '', 'web') }, dataHost, opts.adminUrl ?? '', opts.database);
  const commit = (await exec('git', ['rev-parse', 'HEAD'], { cwd: opts.runtime === 'process' && opts.images !== null ? path.join(opts.images, 'worker') : repositoryRoot }).catch(() => ({ stdout: 'unknown' }))).stdout.trim();
  const times: Record<string, number> = {};
  const timed = async <T>(what: string, work: () => Promise<T>): Promise<T> => {
    const started = Date.now();
    try {
      return await work();
    } finally {
      times[what] = Date.now() - started;
    }
  };
  const jobs: JobOutcome[] = [];
  const periods: SampledPeriod[] = [];
  let release = { releaseNo: QUARTERLY_SCALE_RELEASE_NUMBER, records: 0, manifestSha256: '' };
  let run: CapacityMeasurements['run'] = null;
  let pricedLines: number | null = null;
  let parsedClaims: number | null = null;
  let postedEntries: number | null = null;
  let expectedPosted = 0;
  let memory: WorkerMemory = { limitBytes: workerLimit.memoryMiB * MIB, peakBytes: null, periods, oomKills: null, oomKilled: null, restarts: null, running: null };
  let codes: Record<string, number> | null = null;
  let lines: string[] | null = null;
  let locks: { readonly stop: () => Promise<AdvisoryLockSamples | null> } | null = null;
  let advisoryLocks: AdvisoryLockSamples | null = null;
  let windows: WindowsQuery | null = null;
  let aborted: string | null = null;
  let owner: DatabaseClient | null = null;
  let app: DatabasePool | null = null;
  let queue: PgBossQueue | null = null;
  say(`runner ${String(runner.cpus)} CPUs, ${String(runner.memoryMiB)} MiB; runtime ${opts.runtime}; worker ${String(workerLimit.cpus)} vCPU and ${String(workerLimit.memoryMiB)} MiB on CPUs ${layout.web}: ${command.join(' ')}`);
  try {
    const problems = runnerTooSmall(runner, limits);
    if (problems.length > 0) {
      throw new HarnessStop(`RUNNER_TOO_SMALL: ${problems.join('; ')}`);
    }
    if (opts.runtime === 'process') {
      const missing = processImagesProblems({ worker: path.join(opts.images ?? '', 'worker'), web: path.join(opts.images ?? '', 'web') }).filter((problem) => !problem.includes('server.js'));
      if (missing.length > 0) {
        missing.forEach((problem) => say(`process images: ${problem}`));
        throw new HarnessStop('PROCESS_IMAGES_INCOMPLETE');
      }
    }
    const built = await timed('release build', () => ensureRelease(opts.releaseDir ?? path.join(opts.out, 'release'), opts.small));
    release = { releaseNo: built.releaseNo, records: built.records, manifestSha256: built.manifestSha256 };
    say(`release ${String(release.releaseNo)}: ${String(release.records)} records`);
    const urls = await runtime.startPostgres(pgLimit, { iops: limits.database.iops, bytesPerSecond: limits.database.bytesPerSecond }, NETWORK_DELAY_MS, layout.platform);
    let ownerHarness = urls.harnessUrl;
    let ownerService = urls.serviceUrl;
    if (opts.runtime === 'docker') {
      const admin = await ownerClient(urls.harnessUrl);
      await admin.query(`CREATE DATABASE ${admin.escapeIdentifier(opts.database)}`).finally(() => admin.end());
      ownerHarness = withDatabase(urls.harnessUrl, opts.database);
      ownerService = withDatabase(urls.serviceUrl, opts.database);
    }
    await timed('migrate', () => runtime.migrate(ownerService, loginsEnvironment(ownerService, logins)));
    locks = advisoryLockSampler(ownerHarness);
    say(`loaded: ${(await timed('release load', () => child('tools/release-capacity/load.ts', [ownerHarness, built.dir, String(built.releaseNo)], 8192))).trim()}`);
    const hostDirs = directories(runtime.dataDir.host);
    for (const dir of Object.values(hostDirs) as string[]) {
      mkdirSync(dir, { recursive: true });
      chmodSync(dir, 0o777);
    }
    owner = await ownerClient(ownerHarness);
    const appUrl = loginUrl(ownerHarness, logins.app);
    app = pool(appUrl, 4);
    const seeding: Seeding = { owner, app, documentsDir: hostDirs.documents };
    const aClaims = practiceClaims(size.measuredLines, 'A');
    const { a, b, c, d, e, documents, secondDocuments } = await timed('seed', async () => {
      const specialistId = await specialist(seeding);
      const seeded = {
        a: await seedPractice(seeding, 'A', specialistId),
        b: await seedPractice(seeding, 'B', specialistId),
        c: await seedPractice(seeding, 'C', specialistId),
        d: await seedPractice(seeding, 'D', specialistId),
        e: await seedPractice(seeding, 'E', specialistId),
      };
      await insertClaims(seeding, seeded.a, aClaims);
      await insertClaims(seeding, seeded.b, practiceClaims(size.reportLines, 'B'));
      await insertClaims(seeding, seeded.d, practiceClaims(size.largeTogetherLines, 'D'));
      await insertClaims(seeding, seeded.e, practiceClaims(size.largeTogetherLines, 'E'));
      for (const practice of [seeded.a, seeded.b, seeded.d, seeded.e]) {
        await mapPlans(seeding, practice, specialistId);
      }
      const staged: string[] = [];
      const second: string[] = [];
      for (let index = 1; index <= size.remittances; index += 1) {
        staged.push(await stage835(seeding, seeded.c, capacity835(index, size.claimsPerRemittance)));
        second.push(await stage835(seeding, seeded.c, capacity835(index + size.remittances, size.claimsPerRemittance)));
      }
      return { ...seeded, documents: staged, secondDocuments: second };
    });
    say(
      `seeded A (${String(size.measuredLines)} lines), B (${String(size.reportLines)}), C (two sets of ${String(size.remittances)} 835s of ${String(size.claimsPerRemittance)} claims), D and E (${String(size.largeTogetherLines)} each)`,
    );
    const worker: ServiceSpec = {
      name: 'worker',
      env: workerEnvironment(ownerService, runtime.webOrigin, directories(runtime.dataDir.service), developmentMasterKey().toString('base64'), logins),
      limit: workerLimit,
      cpuset: layout.web,
      command,
    };
    await timed('worker start', async () => {
      await runtime.startService(worker, 'run');
      const until = Date.now() + START_WAIT_MS;
      while (!workerStarted(await runtime.logs('worker'))) {
        if (Date.now() > until) {
          throw new HarnessStop('WORKER_NOT_READY');
        }
        await sleep(500);
      }
    });
    queue = new PgBossQueue(loginUrl(ownerHarness, logins.queue), createLogger());
    const queued = async (what: string, name: 'price' | 'triage' | 'audit_report' | 'parse_835' | 'reconcile', phase: JobPhase, send: (q: PgBossQueue) => Promise<string | null>): Promise<Queued> => ({
      what,
      name,
      phase,
      jobId: await send(queue as PgBossQueue),
    });
    /** memory.current sampled each second into the period named, from its first tick; `close` records how long it ran. */
    const sampling = (what: string) => {
      const values: number[] = [];
      const started = Date.now();
      let entry: SampledPeriod = { what, peakBytes: null, samples: 0, ms: null };
      periods.push(entry);
      const close = () => {
        const index = periods.indexOf(entry);
        entry = { what, peakBytes: values.length === 0 ? null : Math.max(...values), samples: values.length, ms: Date.now() - started };
        periods[index] = entry;
      };
      const tick = async () => {
        const text = await runtime.cgroupFile('worker', runtime.cgroupVersion === 2 ? 'memory.current' : 'memory.usage_in_bytes').catch(() => null);
        const value = text === null ? Number.NaN : Number.parseInt(text.trim(), 10);
        if (!Number.isNaN(value)) {
          values.push(value);
        }
        close();
      };
      return { tick, close };
    };
    // B's and D's periods priced, and B's triaged, before the measurement, as a practice's month would be.
    const bRun = await createRun(seeding, b, release.releaseNo);
    const dRun = await createRun(seeding, d, release.releaseNo);
    const setup = await timed('setup: B priced and triaged, D priced', async () => {
      const priced = await waitForJobs(owner as DatabaseClient, [await queued('B price', 'price', 'setup', (q) => q.enqueue('price', { practice_id: b.practiceId, pricing_run_id: bRun }))]);
      const triaged = await waitForJobs(owner as DatabaseClient, [await queued('B triage', 'triage', 'setup', (q) => q.enqueue('triage', { practice_id: b.practiceId, pricing_run_id: bRun }))]);
      const dPriced = await waitForJobs(owner as DatabaseClient, [await queued('D price', 'price', 'setup', (q) => q.enqueue('price', { practice_id: d.practiceId, pricing_run_id: dRun }))]);
      return [...priced, ...triaged, ...dPriced];
    });
    jobs.push(...setup);
    const bReport = await requestReport(seeding, b, bRun);
    // The concurrent phase: A's run, B's report and C's four parses, queued together.
    const aRun = await createRun(seeding, a, release.releaseNo);
    const concurrentMemory = sampling('the concurrent phase');
    const concurrent = await timed('concurrent phase', async () => {
      const sent = await Promise.all([
        queued('A price', 'price', 'concurrent', (q) => q.enqueue('price', { practice_id: a.practiceId, pricing_run_id: aRun })),
        queued('B audit report', 'audit_report', 'concurrent', (q) => q.enqueue('audit_report', { practice_id: b.practiceId, audit_report_id: bReport })),
        ...documents.map((documentId, index) => queued(`C parse ${String(index + 1)}`, 'parse_835', 'concurrent', (q) => q.enqueue('parse_835', { practice_id: c.practiceId, document_id: documentId }))),
      ]);
      return waitForJobs(owner as DatabaseClient, sent, concurrentMemory.tick);
    });
    concurrentMemory.close();
    jobs.push(...concurrent);
    say(`concurrent phase: ${concurrent.map((job) => `${job.what} ${job.state ?? 'unread'}`).join(', ')}`);
    // The chain: A's triage, then A's audit report, each job's memory sampled alone.
    const triageMemory = sampling('A’s triage');
    jobs.push(...(await timed('A triage', async () => waitForJobs(owner as DatabaseClient, [await queued('A triage', 'triage', 'chain', (q) => q.enqueue('triage', { practice_id: a.practiceId, pricing_run_id: aRun }))], triageMemory.tick))));
    triageMemory.close();
    const aReport = await requestReport(seeding, a, aRun);
    const reportMemory = sampling('A’s audit report');
    jobs.push(
      ...(await timed('A audit report', async () =>
        waitForJobs(owner as DatabaseClient, [await queued('A audit report', 'audit_report', 'chain', (q) => q.enqueue('audit_report', { practice_id: a.practiceId, audit_report_id: aReport }))], reportMemory.tick),
      )),
    );
    reportMemory.close();
    // 7b, A's reconcile: its reprocessing 835s parsed, then its posting export reconciled (approvals and postings in one pass).
    const reprocessed = reprocessing('A', aClaims, await actionableLines(seeding, a, aRun));
    expectedPosted = reprocessed.lines;
    const reprocessingDocuments: string[] = [];
    for (const file of reprocessed.files) {
      reprocessingDocuments.push(await stage835(seeding, a, file));
    }
    const exportId = await stagePostingExport(seeding, a, reprocessed.postingExport);
    say(`A's reconcile: ${String(reprocessed.lines)} actionable lines in ${String(reprocessed.files.length)} reprocessing 835s`);
    const reconcileMemory = sampling('A’s reconcile');
    await timed('A reconcile', async () => {
      const parses = await Promise.all(
        reprocessingDocuments.map((documentId, index) => queued(`A reprocessing parse ${String(index + 1)}`, 'parse_835', 'reconcile', (q) => q.enqueue('parse_835', { practice_id: a.practiceId, document_id: documentId }))),
      );
      jobs.push(...(await waitForJobs(owner as DatabaseClient, parses, reconcileMemory.tick)));
      jobs.push(...(await waitForJobs(owner as DatabaseClient, [await queued('A reconcile', 'reconcile', 'reconcile', (q) => q.enqueue('reconcile', { practice_id: a.practiceId, document_id: exportId }))], reconcileMemory.tick)));
    });
    reconcileMemory.close();
    // 7c, the large jobs together (D20): A's second report, D's triage, E's price job and C's second four parses.
    const aSecondReport = await requestReport(seeding, a, aRun);
    const eRun = await createRun(seeding, e, release.releaseNo);
    const togetherMemory = sampling('the large jobs together');
    const together = await timed('large jobs together', async () => {
      const sent = await Promise.all([
        queued('A audit report 2', 'audit_report', 'together', (q) => q.enqueue('audit_report', { practice_id: a.practiceId, audit_report_id: aSecondReport })),
        queued('D triage', 'triage', 'together', (q) => q.enqueue('triage', { practice_id: d.practiceId, pricing_run_id: dRun })),
        queued('E price', 'price', 'together', (q) => q.enqueue('price', { practice_id: e.practiceId, pricing_run_id: eRun })),
        ...secondDocuments.map((documentId, index) =>
          queued(`C parse ${String(size.remittances + index + 1)}`, 'parse_835', 'together', (q) => q.enqueue('parse_835', { practice_id: c.practiceId, document_id: documentId })),
        ),
      ]);
      return waitForJobs(owner as DatabaseClient, sent, togetherMemory.tick);
    });
    togetherMemory.close();
    jobs.push(...together);
    say(`large jobs together: ${together.map((job) => `${job.what} ${job.state ?? 'unread'}`).join(', ')}`);
    // Read back, before the worker stops.
    const ownerNow = owner;
    run = await asOwner(ownerNow, [a.practiceId], async () => {
      const { rows } = await ownerNow.query<{ status: string; failure_code: string | null; lines: number }>(
        'SELECT r.status, r.failure_code, (SELECT count(*)::int FROM priced_line p WHERE p.pricing_run_id = r.id) AS lines FROM pricing_run r WHERE r.id = $1',
        [aRun],
      );
      pricedLines = rows[0]?.lines ?? null;
      return rows[0] === undefined ? null : { status: rows[0].status, failureCode: rows[0].failure_code };
    });
    parsedClaims = await asOwner(ownerNow, [c.practiceId], async () => (await ownerNow.query<{ n: number }>('SELECT count(*)::int AS n FROM claim WHERE practice_id = $1', [c.practiceId])).rows[0]?.n ?? null);
    postedEntries = await asOwner(
      ownerNow,
      [a.practiceId],
      async () => (await ownerNow.query<{ n: number }>("SELECT count(*)::int AS n FROM ledger_entry WHERE practice_id = $1 AND stage = 'posted'", [a.practiceId])).rows[0]?.n ?? null,
    );
    advisoryLocks = await locks.stop();
    locks = null;
    memory = await readMemory(runtime, workerLimit.memoryMiB * MIB, periods);
    lines = await runtime.logs('worker');
    codes = errorCodes(lines);
    await runtime.stopService('worker');
    await app.end();
    app = null;
    await owner.end();
    owner = null;
    windows = await timed('windows query', () => measureWindows(runtime, appUrl, a, release.releaseNo));
  } catch (error) {
    if (error instanceof CommandError) {
      printStderr(error.command, error.stderr);
    }
    aborted = error instanceof HarnessStop ? error.code : `HARNESS_ERROR: ${masked(error instanceof Error ? error.message : String(error)).split('\n')[0]?.slice(0, 500) ?? ''}`;
    say(`stopped: ${aborted}`);
    if (lines === null) {
      lines = await runtime.logs('worker').catch(() => null);
      codes = lines === null ? null : errorCodes(lines);
    }
  } finally {
    if (locks !== null) {
      advisoryLocks = await locks.stop();
    }
    await app?.end().catch(() => undefined);
    await owner?.end().catch(() => undefined);
    await runtime.stopAll().catch(() => undefined);
  }
  if (opts.runtime === 'process' && !opts.keepDatabase && opts.adminUrl !== null) {
    const admin = await ownerClient(opts.adminUrl);
    try {
      await admin.query(`DROP DATABASE IF EXISTS ${admin.escapeIdentifier(opts.database)} WITH (FORCE)`);
      await admin.query(`DROP ROLE IF EXISTS ${Object.values(logins).map((login) => admin.escapeIdentifier(login.username)).join(', ')}`);
    } finally {
      await admin.end();
    }
  }
  // Each job's `job heap` lines, by its ID (D19): none when the log could not be read, which fails closed.
  const heaps = lines === null ? new Map<string, JobHeap>() : jobHeaps(lines);
  const measuredJobs = jobs.map((job) => ({ ...job, heap: job.jobId === null ? null : (heaps.get(job.jobId) ?? null) }));
  const full = report({
    commit,
    runtime: opts.runtime,
    small: opts.small,
    runner,
    worker: { cpus: workerLimit.cpus, memoryMiB: workerLimit.memoryMiB, cpuset: layout.web, command },
    release,
    expected: { pricedLines: size.measuredLines, parsedClaims: 2 * size.remittances * size.claimsPerRemittance, postedEntries: expectedPosted },
    jobs: measuredJobs,
    run,
    pricedLines,
    parsedClaims,
    postedEntries,
    memory,
    advisoryLocks,
    errorCodes: codes,
    windows,
    times,
    aborted,
  });
  writeFileSync(path.join(opts.out, 'release-capacity.json'), `${JSON.stringify(full, null, 2)}\n`);
  const summary = markdown(full);
  writeFileSync(path.join(opts.out, 'summary.md'), summary);
  if (process.env.GITHUB_STEP_SUMMARY !== undefined) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  }
  say(`verdict: ${full.verdict.pass ? 'pass' : 'fail'}`);
  for (const reason of full.verdict.reasons) {
    say(`  ${reason}`);
  }
  for (const advisory of full.verdict.advisories) {
    process.stdout.write(`::warning title=Release capacity (advisory)::${advisory}\n`);
  }
  // The notify job's issue body names the advisories too, on a pass as on a failure (fix round S3).
  if (process.env.GITHUB_OUTPUT !== undefined && full.verdict.advisories.length > 0) {
    appendFileSync(process.env.GITHUB_OUTPUT, `advisories=${advisoriesOutput(full.verdict.advisories)}\n`);
  }
  return full.verdict.pass ? 0 : 1;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  try {
    if (process.argv.slice(2).includes('--print-harness-cpus')) {
      // The workflow pins the harness, its children and Chromium here (taskset), from the screening's layout.
      process.stdout.write(`${harnessCpus(thisRunner(), productionLimits())}\n`);
    } else {
      process.exitCode = await main();
      // The web's queue producer keeps pg-boss's pool open and offers no stop: once the report is written, nothing is
      // left to wait for, so a timer that does not itself hold the process ends it.
      setTimeout(() => process.exit(), 5_000).unref();
    }
  } catch (error) {
    if (error instanceof HarnessStop && error.code === 'USAGE') {
      process.stderr.write(
        'usage: tsx tools/release-capacity/run.ts --out <dir> [--runtime docker --worker-image <tag>] [--runtime process --images <dir> --admin-url <url> --database <name>] [--release-dir <dir>] [--small] [--keep-database]\n       tsx tools/release-capacity/run.ts --print-harness-cpus\n',
      );
      process.exitCode = 2;
    } else {
      throw error;
    }
  }
}
