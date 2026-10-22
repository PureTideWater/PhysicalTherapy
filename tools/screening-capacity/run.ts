import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs, promisify } from 'node:util';

import { databaseClient, developmentMasterKey } from '@tp/db';
import { addMembership, createOrganization, createUser } from '@tp/db/testing';
import { SCALE_RELEASE_NUMBER, SCALE_RELEASE_SHAPE, scaleZip9Size, sha256 } from '@tp/synth';
import pg from 'pg';
import { type Browser, type BrowserContext, type Page, chromium } from 'playwright-core';

import { environmentSettings } from '../../infra/lib/environments';
import { repositoryRoot } from '../content-files';
import {
  type ColdStart,
  CommandError,
  DockerRuntime,
  type PostgresStatus,
  ProcessRuntime,
  type Runtime,
  type ServiceName,
  type ServiceSpec,
  masked,
  screeningServices,
  serviceCommand,
  stderrTail,
} from './containers';
import { DEPARTURES, HARNESS_LOGINS, type HarnessDirectories, harnessLogins, loginsEnvironment, platformEnvironment, screeningEnvironment, webEnvironment } from './env';
import {
  HARNESS_DEADLINE_MS,
  MIB,
  NETWORK_DELAY_MS,
  RUNNER_TO_FARGATE,
  SCENARIO_CAP_MS,
  SCENARIO_START_DEADLINE_MS,
  STALL_MS,
  harnessCpus,
  postgresLimit,
  productionLimits,
  runnerTooSmall,
} from './limits';
import { anonBytes, cpuThrottling, emailedLines, memoryEvents, peak, phaseLines, phasesByRun, pricedRuns, workerStarted } from './measure';
import {
  type AppliedLimits,
  type ConsumerMeasure,
  type ContainerMeasure,
  type Measurements,
  ORACLE_UPLOADS,
  type OracleComparison,
  type OracleKind,
  type ScenarioMeasure,
  type UploadMeasure,
  markdown,
  oracleKind,
  report,
  timeRule,
} from './report';
import { type ScenarioSpec, type UploadSpec, scenarios, shapeFacts, shapeRows, typedZip, uploadCsv } from './uploads';

/**
 * `pnpm screening:capacity`: the screening's capacity test under production limits (audit #53 part 1; docs/adr/0062,
 * "Capacity under production limits"; docs/runbooks/screening-capacity.md). Since PR 6b-3 it runs the screening's own
 * consumer as production will (WORKER_JOBS=screening, one container per declared task at its size, its threads at the
 * declared concurrency, on the screening login) beside a platform that prices no screening, so time is enforced
 * (decision 15). Steps, as the design's §3.6 numbers them:
 *
 *  1. read the limits and the runner; stop as "runner too small" if it is (`--print-harness-cpus` prints the CPUs the
 *     workflow pins the harness to, from the same layout, and exits);
 *  2. build the SYNTHETIC scale release in a child process (or take one already built);
 *  3. start Postgres with its limits, io.max and netem (Docker), or take a scratch database on the caller's server;
 *  4. run the migration task (migrations, then logins; a failure's stderr goes to the job's log and its last lines to
 *     the report), load the release in a child process, approve the place-of-service split as a synthetic contract
 *     specialist;
 *  5. start web, platform and the consumer and wait for the health route and each worker's start line; read the limits
 *     back;
 *  6. run S1 to S5: S1, S4 and S5 first stop every service, restart Postgres with the page cache dropped (recorded) and
 *     start them again; a fresh consumer where a scenario says; each upload's page parses its file first (not timed),
 *     then the uploads are submitted (three at once in S4 and S5, and the small one once the large runs' jobs are
 *     queued); with a static asset origin, the pages' requests to it are served from the web container's own
 *     /_next/static/; memory sampled every 500 ms, the outbox polled every 250 ms, a run in pricing that records no
 *     batch for five minutes, or a run still queued while nothing in its scenario moved for five minutes, called stalled,
 *     a 30-minute cap; then the cgroups' peaks, events and throttling, Postgres's OOM kills and restarts, the consumer's
 *     phase and time-to-email lines, any screening the platform's log shows it pricing, each run's tier, each pricing
 *     job's place in the queue, the jobs that ran, the stored rows; the report is written after each; no scenario
 *     starts after 60 minutes, and one still running at 70 ends there (limits.ts);
 *  7. open every result link, then its last page of groups;  8. close the browsers, stop every service;
 *  9. compare S1-1, S2-1 and S3-1 with the frozen oracle and S1-2 (a ZIP split across localities, with its ZIP+4)
 *     with the whole-release oracle, in a child process, against the running Postgres (oracle.ts);
 * 10. remove Postgres; write screening-capacity.json, its SHA-256 (screening-capacity.sha256, as the launch check
 *     computes it) and summary.md (and the job summary in CI); exit non-zero on any failing check.
 *
 * The harness and Chromium run on the CPUs the workflow gives them (taskset), never the tasks' CPU. Nothing it writes
 * carries a link, a token or a row; the services' saved logs (<out>/logs) hold IDs, codes and numbers, links masked.
 */

const exec = promisify(execFile);

class HarnessStop extends Error {
  override readonly name = 'HarnessStop';
  constructor(readonly code: string) {
    super(code);
  }
}

interface Options {
  readonly out: string;
  readonly runtime: 'docker' | 'process';
  readonly webImage: string;
  readonly workerImage: string;
  readonly images: string | null;
  readonly adminUrl: string | null;
  readonly database: string;
  readonly releaseDir: string | null;
  readonly only: readonly string[];
  readonly keepDatabase: boolean;
  /** The static host the web image was built for (its STATIC_ASSET_ORIGIN), or null for an image built with none. */
  readonly staticAssetOrigin: string | null;
}

/** An https origin with no path, as the web's STATIC_ASSET_ORIGIN takes it. */
const STATIC_ORIGIN = /^https:\/\/[a-z0-9.-]+(?::\d+)?$/;

function options(argv: readonly string[]): Options {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      out: { type: 'string' },
      'static-asset-origin': { type: 'string' },
      runtime: { type: 'string', default: 'docker' },
      'web-image': { type: 'string', default: 'tp-web:capacity' },
      'worker-image': { type: 'string', default: 'tp-worker:capacity' },
      images: { type: 'string' },
      'admin-url': { type: 'string' },
      database: { type: 'string', default: 'tp_capacity' },
      'release-dir': { type: 'string' },
      scenarios: { type: 'string' },
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
  const staticAssetOrigin = values['static-asset-origin'] ?? null;
  if (staticAssetOrigin !== null && !STATIC_ORIGIN.test(staticAssetOrigin)) {
    throw new HarnessStop('USAGE');
  }
  return {
    out: path.resolve(values.out),
    runtime: values.runtime,
    webImage: values['web-image'],
    workerImage: values['worker-image'],
    images: values.images === undefined ? null : path.resolve(values.images),
    adminUrl: values['admin-url'] ?? null,
    database: values.database,
    releaseDir: values['release-dir'] === undefined ? null : path.resolve(values['release-dir']),
    only: values.scenarios === undefined ? [] : values.scenarios.split(','),
    keepDatabase: values['keep-database'],
    staticAssetOrigin,
  };
}

const say = (line: string): void => {
  process.stdout.write(`[capacity ${new Date().toISOString()}] ${line}\n`);
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
    // The child's whole stderr to the job's log, and its last lines in the report, URLs' credentials masked.
    const stderr = (error as { stderr?: string }).stderr ?? '';
    printStderr(path.basename(script), stderr);
    throw new HarnessStop(`${path.basename(script, '.ts').toUpperCase()}_FAILED: ${stderrTail(stderr, 300)}`);
  }
}

/** A failed command's stderr in the job's log, line by line, masked. */
function printStderr(what: string, stderr: string): void {
  for (const line of masked(stderr).split('\n')) {
    process.stdout.write(`[capacity] ${what} stderr: ${line}\n`);
  }
}

/**
 * The harness's own connection to the database as the owner (run facts, the queue), with an error listener: a server
 * that goes away (a restart, the end) drops it, never the process, and the next use connects again.
 */
class OwnerConnection {
  private current: pg.Client | null = null;
  constructor(private readonly url: string) {}

  async client(): Promise<pg.Client> {
    if (this.current === null) {
      const client = new pg.Client({ connectionString: this.url });
      client.on('error', () => {
        if (this.current === client) {
          this.current = null;
        }
      });
      await client.connect();
      this.current = client;
    }
    return this.current;
  }

  async end(): Promise<void> {
    const client = this.current;
    this.current = null;
    await client?.end().catch(() => undefined);
  }
}

/** The scale release: built in a child process unless the directory already holds one. */
async function ensureRelease(dir: string): Promise<{ readonly dir: string; readonly releaseNo: number; readonly manifestSha256: string; readonly records: number }> {
  const releaseDir = path.join(dir, `release-synth-${String(SCALE_RELEASE_NUMBER)}`);
  if (!existsSync(path.join(releaseDir, 'MANIFEST.json'))) {
    say('building the SYNTHETIC scale release');
    await child('tools/release/scale.ts', ['--out', dir], 6144);
  }
  const notes = readFileSync(path.join(releaseDir, 'RELEASE.md'), 'utf8');
  const records = Number.parseInt(/\| all \| (\d+) \|/.exec(notes)?.[1] ?? '0', 10);
  return { dir: releaseDir, releaseNo: SCALE_RELEASE_NUMBER, manifestSha256: sha256(readFileSync(path.join(releaseDir, 'MANIFEST.json'))), records };
}

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

/**
 * The place-of-service split a contract specialist approves (synthetic, as the e2e suite's): 11 non-facility, 22
 * facility, through the console's function (place_of_service_split since PR 6b, docs/adr/0064).
 */
async function approveSplit(ownerUrl: string): Promise<void> {
  const owner = databaseClient(ownerUrl);
  await owner.connect();
  try {
    const internal = await createOrganization(owner, 'internal');
    const specialist = await createUser(owner, { hardwareKeyRequired: true });
    await addMembership(owner, internal, specialist, 'contract_specialist');
    await owner.query('BEGIN');
    await owner.query('SET LOCAL ROLE tp_app');
    await owner.query("SELECT set_config('app.actor_id', $1, true)", [specialist]);
    await owner.query('SELECT console_approve_place_of_service_split($1)', [JSON.stringify({ '11': 'non_facility', '22': 'facility' })]);
    await owner.query('COMMIT');
  } finally {
    await owner.end();
  }
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

async function waitUntil(what: string, check: () => Promise<boolean>, timeoutMs: number): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (!(await check().catch(() => false))) {
    if (Date.now() > until) {
      throw new HarnessStop(`${what}_NOT_READY`);
    }
    await sleep(500);
  }
}

/** An outbox message the platform wrote: its recipients, body and the time in its name (ms). */
interface Mail {
  readonly to: readonly string[];
  readonly body: string;
  readonly writtenMs: number;
}

function readOutbox(dir: string, seen: Map<string, Mail>): void {
  if (!existsSync(dir)) {
    return;
  }
  for (const file of readdirSync(dir)) {
    if (!seen.has(file) && file.endsWith('.json')) {
      try {
        const message = JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as { to: string[]; body: string };
        seen.set(file, { to: message.to, body: message.body, writtenMs: Number.parseInt(file.split('-')[0] ?? '0', 10) });
      } catch {
        // Still being written; the next poll reads it.
      }
    }
  }
}

const RESULT_LINK = /https?:\/\/[^\s]+\/screening\/results\/[a-z]{32}/;
/** How long the harness waits for a result page; one that takes longer counts as not opening. */
const RESULT_PAGE_MS = 60_000;

interface Prepared {
  readonly upload: UploadSpec;
  readonly rows: number;
  readonly context: BrowserContext;
  readonly page: Page;
  submittedAt: number | null;
  emailedAt: number | null;
  link: string | null;
  failedNotice: boolean;
  /** The page took the upload (its "sent" page); one it did not is not waited for. */
  accepted: boolean;
}

interface RunFacts {
  readonly id: string;
  readonly status: string;
  readonly stored: number;
  readonly pending: number;
  readonly engineErrors: number;
  /** The tier submit_screening set (Q7): null in the normal tier. */
  readonly waitReason: string | null;
  readonly queuePriority: number;
}

async function runFacts(owner: pg.Client, email: string): Promise<RunFacts | null> {
  const { rows } = await owner.query<RunFacts>(
    `SELECT r.id, r.status, r.wait_reason AS "waitReason", r.queue_priority::int AS "queuePriority",
            (SELECT count(*)::int FROM screening_result s WHERE s.run_id = r.id) AS stored,
            (SELECT count(*)::int FROM screening_result s WHERE s.run_id = r.id AND s.disposition = 'pending') AS pending,
            (SELECT count(*)::int FROM screening_result s WHERE s.run_id = r.id AND s.unpriced_reason = 'ENGINE_ERROR') AS "engineErrors"
       FROM screening_run r JOIN screening_upload u ON u.id = r.upload_id JOIN screening_prospect p ON p.id = u.prospect_id
      WHERE p.contact_email = $1 ORDER BY r.created_at DESC LIMIT 1`,
    [email],
  );
  return rows[0] ?? null;
}

interface Context {
  readonly runtime: Runtime;
  readonly browser: Browser;
  readonly owner: OwnerConnection;
  readonly outbox: string;
  readonly web: ServiceSpec;
  readonly platform: ServiceSpec;
  /** The consumer's tasks, one service each (screening-1 to screening-N). */
  readonly consumers: readonly ServiceSpec[];
  /** The static host the web image was built for, routed to the web container; null for none. */
  readonly staticAssetOrigin: string | null;
  /** When the harness's deadline ends a scenario still running (limits.ts, HARNESS_DEADLINE_MS). */
  readonly until: number;
}

async function startWeb(runtime: Runtime, spec: ServiceSpec, label: string): Promise<void> {
  await runtime.startService(spec, label);
  await waitUntil('WEB', async () => (await fetch(`${runtime.webOrigin}/api/health`)).status === 200, 300_000);
}

/** Starts a worker service (platform or a consumer task) and waits for its start line. */
async function startWorker(runtime: Runtime, spec: ServiceSpec, label: string): Promise<void> {
  await runtime.startService(spec, label);
  await waitUntil(spec.name.toUpperCase().replaceAll('-', '_'), async () => workerStarted(await runtime.logs(spec.name)), 180_000);
}

/** Starts the consumer's tasks afresh (their threads' release caches cold). */
async function startConsumers(runtime: Runtime, consumers: readonly ServiceSpec[], label: string): Promise<void> {
  for (const spec of consumers) {
    await runtime.stopService(spec.name);
    await startWorker(runtime, spec, label);
  }
}

/** A run's pricing job in pg-boss: when it was created (its place in the queue) and started, null when not found. */
async function queueTimes(owner: pg.Client, runId: string): Promise<{ readonly created: number | null; readonly started: number | null }> {
  const { rows } = await owner
    .query<{ created: Date | null; started: Date | null }>(
      `SELECT created_on AS created, started_on AS started FROM pgboss.job
        WHERE name = 'screening_price' AND data ->> 'screening_run_id' = $1 ORDER BY created_on LIMIT 1`,
      [runId],
    )
    .catch(() => ({ rows: [] as { created: Date | null; started: Date | null }[] }));
  return { created: rows[0]?.created?.getTime() ?? null, started: rows[0]?.started?.getTime() ?? null };
}

/** Postgres's OOM kills and restarts over a scenario: the counts at its end less those at its start. */
function postgresOver(before: PostgresStatus, after: PostgresStatus): ScenarioMeasure['postgres'] {
  const delta = (start: number | null, end: number | null) => (start === null || end === null ? null : end >= start ? end - start : end);
  return { oomKills: delta(before.oomKills, after.oomKills), restarts: delta(before.restarts, after.restarts), running: after.running };
}

async function readContainer(runtime: Runtime, name: ServiceName, limitMiB: number, samples: readonly number[], stopped: boolean): Promise<ContainerMeasure> {
  const v = runtime.cgroupVersion;
  const peakText = await runtime.cgroupFile(name, v === 2 ? 'memory.peak' : 'memory.max_usage_in_bytes');
  const events = v === 2 ? memoryEvents((await runtime.cgroupFile(name, 'memory.events')) ?? '', 2) : memoryEvents((await runtime.cgroupFile(name, 'memory.oom_control')) ?? '', 1, (await runtime.cgroupFile(name, 'memory.failcnt')) ?? '0');
  const cpu = await runtime.cgroupFile(name, 'cpu.stat');
  const status = await runtime.status(name);
  return {
    name,
    limitBytes: limitMiB * MIB,
    anonPeakBytes: peak(samples),
    anonSamples: samples.length,
    memoryPeakBytes: peakText === null ? null : Number.parseInt(peakText.trim(), 10),
    events,
    oomKilled: status.oomKilled,
    restarts: status.restarts,
    exitedUnexpectedly: !stopped && !status.running,
    throttling: cpu === null ? null : cpuThrottling(cpu, v),
  };
}

const clientAddress = (scenario: number, upload: number) => `198.51.100.${String(10 + scenario * 10 + upload)}`;

/**
 * The static origin's requests from one browser context, served from the web container's own /_next/static/ (the image
 * keeps them; production's CloudFront serves the same files): anything else for the static host, or a file the web
 * did not serve, is counted as having left for it and aborted.
 */
async function routeStaticOrigin(context: BrowserContext, origin: string, webOrigin: string, counts: { routed: number; left: number }): Promise<void> {
  await context.route(`${origin}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/_next/static/')) {
      // Playwright's own route.fetch keeps the protocol; the web container is plain HTTP on the runner, so Node fetches it.
      const response = await fetch(`${webOrigin}${url.pathname}${url.search}`, { headers: { 'X-Forwarded-For': '198.51.100.251' } }).catch(() => null);
      if (response?.ok === true) {
        const headers = Object.fromEntries([...response.headers.entries()].filter(([name]) => name !== 'content-encoding' && name !== 'content-length' && name !== 'transfer-encoding'));
        await route.fulfill({ status: response.status, headers, body: Buffer.from(await response.arrayBuffer()) });
        counts.routed += 1;
        return;
      }
    }
    counts.left += 1;
    await route.abort();
  });
}

async function runScenario(spec: ScenarioSpec, index: number, context: Context, limits: Readonly<Record<string, number>>): Promise<{ readonly measure: ScenarioMeasure; readonly runs: Map<string, string> }> {
  const { runtime, browser, owner } = context;
  let coldStart: ColdStart | null = null;
  if (spec.freshPostgres) {
    // A cold database: the services stop first (their pools would lose every connection), the harness lets go of its
    // own, Postgres restarts with the page cache dropped and the delay applied again, and every service starts fresh.
    say(`${spec.id}: a cold Postgres (restarted, page cache dropped), then web, platform and the consumer fresh`);
    await runtime.stopServices();
    await owner.end();
    coldStart = await runtime.restartPostgres();
    await startWeb(runtime, context.web, spec.id);
    await startWorker(runtime, context.platform, spec.id);
    await startConsumers(runtime, context.consumers, spec.id);
  } else {
    // A service that exited in an earlier scenario (counted there) is started again, as production's service would
    // start a new task, so one failure does not leave the later scenarios unmeasured.
    if (!(await runtime.status('web')).running) {
      say(`${spec.id}: web had exited; starting it again`);
      await startWeb(runtime, context.web, spec.id);
    }
    if (!(await runtime.status('platform')).running) {
      say(`${spec.id}: platform had exited; starting it again`);
      await startWorker(runtime, context.platform, spec.id);
    }
    const exited = (await Promise.all(context.consumers.map(async (consumer) => (await runtime.status(consumer.name)).running))).some((running) => !running);
    if (spec.freshConsumer || exited) {
      say(`${spec.id}: a fresh consumer${exited ? ' (a task had exited)' : ''}`);
      await startConsumers(runtime, context.consumers, spec.id);
    }
  }
  const postgresBefore = await runtime.postgresStatus();
  const scenarioStart = Date.now();
  const capUntil = Math.min(scenarioStart + SCENARIO_CAP_MS, context.until);
  const since = new Date(scenarioStart);
  const prepared: Prepared[] = [];
  const staticCounts = { routed: 0, left: 0 };
  for (const [at, upload] of spec.uploads.entries()) {
    const rows = shapeRows(upload.shape, undefined, upload.variant);
    const browserContext = await browser.newContext({ extraHTTPHeaders: { 'X-Forwarded-For': clientAddress(index, at) } });
    if (context.staticAssetOrigin !== null) {
      await routeStaticOrigin(browserContext, context.staticAssetOrigin, runtime.webOrigin, staticCounts);
    }
    const page = await browserContext.newPage();
    const entry: Prepared = { upload, rows: rows.length, context: browserContext, page, submittedAt: null, emailedAt: null, link: null, failedNotice: false, accepted: true };
    page.on('request', (request) => {
      if (entry.submittedAt === null && request.method() === 'POST' && new URL(request.url()).pathname === '/screening') {
        entry.submittedAt = Date.now();
      }
    });
    await page.goto(`${runtime.webOrigin}/screening`, { timeout: 180_000 });
    await page.getByLabel('Practice name').fill(upload.practiceName);
    await page.getByLabel('State').selectOption('MN');
    // Five digits, or ZIP+4 for a ZIP the release splits across localities (S1-2).
    await page.getByLabel('ZIP code', { exact: true }).fill(typedZip(upload));
    await page.getByLabel('Work email').fill(upload.contactEmail);
    await page.getByLabel('File to screen').setInputFiles({ name: 'totals.csv', mimeType: 'text/csv', buffer: uploadCsv(rows) });
    // The browser reads and screens the file in its own time, before anything is timed.
    await page.locator('[data-state="file-ready"]').waitFor({ timeout: 600_000 });
    prepared.push(entry);
  }
  say(`${spec.id}: ${String(prepared.length)} pages ready; submitting`);
  const measured: readonly ServiceName[] = ['web', 'platform', ...context.consumers.map((consumer) => consumer.name)];
  const samples = new Map<ServiceName, number[]>(measured.map((name) => [name, []]));
  let sampling = true;
  const sampler = (async () => {
    while (sampling) {
      for (const name of measured) {
        const text = await runtime.cgroupFile(name, 'memory.stat');
        if (text !== null) {
          samples.get(name)?.push(anonBytes(text, runtime.cgroupVersion));
        }
      }
      await sleep(500);
    }
  })();
  const click = (entry: Prepared) => entry.page.getByRole('button', { name: 'Screen the file' }).click({ timeout: 60_000 });
  const sentPage = (entry: Prepared) => entry.page.waitForURL(/\/screening\?sent=1$/, { timeout: Math.max(1_000, Math.min(600_000, capUntil - Date.now())) });
  const large = prepared.filter((entry) => !entry.upload.behind);
  const behind = prepared.filter((entry) => entry.upload.behind);
  await Promise.all(large.map(click));
  const largeSent = Promise.allSettled(large.map(sentPage));
  if (behind.length > 0) {
    // The small upload is sent once the large ones' pricing jobs are in pg-boss, so its job is queued behind theirs.
    // A run's row is not enough: the web sends a run's job only after its transaction commits, and on a quarter-CPU
    // web a small upload taken in after the large runs exist could still be queued before a large one's job.
    const waitUntilQueued = Date.now();
    while (Date.now() < capUntil) {
      const client = await owner.client();
      let queued = 0;
      for (const entry of large) {
        const facts = await runFacts(client, entry.upload.contactEmail);
        queued += facts !== null && (await queueTimes(client, facts.id)).created !== null ? 1 : 0;
      }
      if (queued === large.length) {
        break;
      }
      await sleep(500);
    }
    say(`${spec.id}: the large uploads' jobs are queued after ${((Date.now() - waitUntilQueued) / 1000).toFixed(1)} s; sending the small one behind them`);
    await Promise.all(behind.map(click));
  }
  const sent = [...(await largeSent), ...(await Promise.allSettled(behind.map(sentPage)))];
  const order = [...large, ...behind];
  sent.forEach((result, at) => {
    const entry = order[at];
    if (result.status === 'rejected' && entry !== undefined) {
      entry.accepted = false;
      say(`${spec.id}: upload ${entry.upload.id} was not accepted by the page`);
    }
  });
  const mails = new Map<string, Mail>();
  const progress = new Map<string, { readonly done: number; readonly at: number }>();
  const lastSeen = new Map<string, string>();
  let lastMove = Date.now();
  const stalled = new Set<string>();
  let lastStallCheck = 0;
  while (Date.now() < capUntil) {
    readOutbox(context.outbox, mails);
    for (const entry of prepared) {
      if (entry.emailedAt !== null || entry.failedNotice) {
        continue;
      }
      const mail = [...mails.values()].find((message) => message.to.includes(entry.upload.contactEmail));
      if (mail !== undefined) {
        lastMove = Date.now();
        const link = RESULT_LINK.exec(mail.body)?.[0] ?? null;
        if (link === null) {
          entry.failedNotice = true;
        } else {
          entry.emailedAt = mail.writtenMs;
          entry.link = link;
        }
      }
    }
    const open = prepared.filter((entry) => entry.accepted && entry.emailedAt === null && !entry.failedNotice && !stalled.has(entry.upload.id));
    if (open.length === 0) {
      break;
    }
    if (Date.now() - lastStallCheck >= 30_000) {
      lastStallCheck = Date.now();
      const client = await owner.client();
      const facts = new Map<string, RunFacts | null>();
      for (const entry of open) {
        const found = await runFacts(client, entry.upload.contactEmail);
        facts.set(entry.upload.id, found);
        const seen = found === null ? 'none' : `${found.status}:${String(found.stored - found.pending)}`;
        if (lastSeen.get(entry.upload.id) !== seen) {
          lastSeen.set(entry.upload.id, seen);
          lastMove = Date.now();
        }
      }
      for (const entry of open) {
        const found = facts.get(entry.upload.id) ?? null;
        if (found?.status === 'pricing') {
          const done = found.stored - found.pending;
          const before = progress.get(entry.upload.id);
          if (before === undefined || before.done !== done) {
            progress.set(entry.upload.id, { done, at: Date.now() });
          } else if (Date.now() - before.at >= STALL_MS) {
            stalled.add(entry.upload.id);
          }
        } else if ((found === null || found.status === 'queued') && Date.now() - lastMove >= STALL_MS) {
          // Still queued (or no run yet) while nothing in the scenario moved: no job is taking it.
          stalled.add(entry.upload.id);
        }
      }
    }
    await sleep(250);
  }
  // Each emailed link opened from the harness, as the prospect's mail client would (the link is never written
  // anywhere), then its last page of groups (a page past the last, which the page shows as its last: the worst shape
  // has 411 pages of 50), while memory is still sampled, and before the containers are read, so a service a page
  // brings down counts in this scenario. Each body is read to its end, as a browser reads it.
  const open = async (url: string): Promise<number | null> => {
    const response = await fetch(url, { headers: { 'X-Forwarded-For': '198.51.100.250' }, signal: AbortSignal.timeout(RESULT_PAGE_MS) }).catch(() => null);
    const read = await response?.arrayBuffer().catch(() => null);
    return read === undefined || read === null ? null : (response?.status ?? null);
  };
  const resultStatuses = new Map<string, { readonly first: number | null; readonly last: number | null }>();
  for (const entry of prepared) {
    if (entry.link !== null) {
      const url = entry.link.replace(/^https?:\/\/[^/]+/, runtime.webOrigin);
      const first = await open(url);
      resultStatuses.set(entry.upload.id, { first, last: first === 200 ? await open(`${url}?groups=999999`) : null });
    }
  }
  sampling = false;
  await sampler;
  const containers: ContainerMeasure[] = [];
  for (const name of measured) {
    containers.push(await readContainer(runtime, name, limits[name] ?? 0, samples.get(name) ?? [], false));
  }
  const postgres = postgresOver(postgresBefore, await runtime.postgresStatus());
  // The consumer's lines (every task's), and the platform's, which since PR 6b-3 shows no screening.
  const consumerLog = (await Promise.all(context.consumers.map((consumer) => runtime.logs(consumer.name)))).flat();
  const consumerPhases = phaseLines(consumerLog);
  const phases = phasesByRun(consumerPhases);
  const emailed = emailedLines(consumerLog);
  const platformRuns = pricedRuns(await runtime.logs('platform'));
  const runs = new Map<string, string>();
  const uploads: UploadMeasure[] = [];
  const client = await owner.client();
  for (const entry of prepared) {
    const facts = await runFacts(client, entry.upload.contactEmail);
    if (facts !== null) {
      runs.set(entry.upload.id, facts.id);
    }
    const queue = facts === null ? { created: null, started: null } : await queueTimes(client, facts.id);
    const lines = facts === null ? undefined : phases.get(facts.id);
    const opened = resultStatuses.get(entry.upload.id);
    const phaseLog = consumerPhases.filter((line) => line.runId === facts?.id);
    const firstPhase = phaseLog[0] === undefined ? null : Date.parse(phaseLog[0].at);
    const logged = facts === null ? undefined : emailed.find((line) => line.runId === facts.id);
    uploads.push({
      id: entry.upload.id,
      shape: entry.upload.shape,
      rows: entry.rows,
      behind: entry.upload.behind,
      jobCreatedMs: queue.created === null ? null : queue.created - scenarioStart,
      jobStartedMs: queue.started === null ? null : queue.started - scenarioStart,
      submittedMs: entry.submittedAt === null ? null : entry.submittedAt - scenarioStart,
      emailedMs: entry.emailedAt === null ? null : entry.emailedAt - scenarioStart,
      queueWaitMs: firstPhase === null || entry.submittedAt === null ? null : Math.max(0, firstPhase - entry.submittedAt),
      phases: lines ?? {},
      resultStatus: opened?.first ?? null,
      lastPageStatus: opened?.last ?? null,
      storedRows: facts?.stored ?? null,
      pendingRows: facts?.pending ?? null,
      engineErrorRows: facts?.engineErrors ?? null,
      stalled: stalled.has(entry.upload.id),
      runStatus: facts?.status ?? null,
      waitReason: facts?.waitReason ?? null,
      queuePriority: facts?.queuePriority ?? null,
      logged: logged === undefined ? null : { elapsedMs: logged.elapsedMs, atMs: Date.parse(logged.at) - scenarioStart, tier: logged.tier },
    });
  }
  for (const entry of prepared) {
    await entry.context.close();
  }
  const jobs = await client
    .query<{ name: string; count: number; seconds: number }>(
      `SELECT name, count(*)::int AS count, coalesce(sum(extract(epoch FROM (completed_on - started_on))), 0)::float8 AS seconds
         FROM pgboss.job WHERE started_on >= $1 GROUP BY name ORDER BY name`,
      [since],
    )
    .then((result) => result.rows)
    .catch(() => []);
  const platformPricedRuns = [...runs.values()].filter((run) => platformRuns.has(run)).length;
  return {
    measure: {
      id: spec.id,
      what: spec.what,
      coldStart,
      uploads,
      containers,
      postgres,
      jobs,
      platformPricedRuns,
      staticOrigin: context.staticAssetOrigin === null ? null : { ...staticCounts },
    },
    runs,
  };
}

async function main(): Promise<number> {
  const harnessStart = Date.now();
  const opts = options(process.argv.slice(2));
  mkdirSync(opts.out, { recursive: true });
  const loadAverage = os.loadavg();
  const runner = { ...thisRunner(), loadAverage };
  const limits = productionLimits();
  const rule = timeRule(environmentSettings('production'), RUNNER_TO_FARGATE);
  const pgLimit = postgresLimit(runner, limits);
  const expected = {
    web: limits.web,
    platform: limits.platform,
    screening: limits.screening,
    screeningTasks: limits.screeningTasks,
    postgres: pgLimit,
    storage: { iops: limits.database.iops, bytesPerSecond: limits.database.bytesPerSecond },
  };
  const consumer: ConsumerMeasure | null =
    limits.screening === null ? null : { tasks: limits.screeningTasks, cpus: limits.screening.cpus, memoryMiB: limits.screening.memoryMiB, concurrency: limits.screeningConcurrency };
  const runnerProblems = runnerTooSmall(runner, limits);
  const dataHost = path.join(opts.out, 'data');
  const logins = opts.runtime === 'process' ? harnessLogins(randomBytes(4).toString('hex')) : HARNESS_LOGINS;
  const runtime: Runtime =
    opts.runtime === 'docker'
      ? new DockerRuntime({ web: opts.webImage, worker: opts.workerImage }, dataHost, path.join(opts.out, 'logs'))
      : new ProcessRuntime({ worker: path.join(opts.images ?? '', 'worker'), web: path.join(opts.images ?? '', 'web') }, dataHost, opts.adminUrl ?? '', opts.database);
  const scenarioMeasures: ScenarioMeasure[] = [];
  const oracle: OracleComparison[] = [];
  const notStarted: string[] = [];
  let applied: AppliedLimits = { containers: [], ioMax: null, roundTripMedianMs: null };
  // The ZIP9 file's size (open item O8): the release is built at the production shape.
  let release: Measurements['release'] = { releaseNo: SCALE_RELEASE_NUMBER, manifestSha256: '', records: 0, zip9: scaleZip9Size(SCALE_RELEASE_SHAPE) };
  let aborted: string | null = null;
  // The commit measured: the images' checkout for the process runtime (built outside this one), else this checkout.
  const measuredCheckout = opts.runtime === 'process' && opts.images !== null ? path.join(opts.images, 'worker') : repositoryRoot;
  const commit = (await exec('git', ['rev-parse', 'HEAD'], { cwd: measuredCheckout }).catch(() => ({ stdout: 'unknown' }))).stdout.trim();
  const affinity = /Cpus_allowed_list:\s*(\S+)/.exec(readFileSync('/proc/self/status', 'utf8'))?.[1] ?? 'unknown';
  // The measured images' IDs, which the launch check compares with the images being deployed (decision 13).
  const imageId = async (image: string): Promise<string | null> => (await exec('docker', ['image', 'inspect', '-f', '{{.Id}}', image]).catch(() => null))?.stdout.trim() || null;
  const images = opts.runtime === 'docker' ? { web: await imageId(opts.webImage), worker: await imageId(opts.workerImage) } : { web: null, worker: null };
  const specs = scenarios().filter((spec) => opts.only.length === 0 || opts.only.includes(spec.id));
  // The report as it stands, written after every scenario as well as at the end, so a run that stops leaves its figures.
  const write = (final: boolean): ReturnType<typeof report> => {
    const measured: Measurements = {
      commit,
      runtime: opts.runtime,
      images,
      consumer,
      staticAssetOrigin: opts.staticAssetOrigin,
      runner,
      expected,
      applied,
      runnerProblems,
      departures: [...DEPARTURES, ...(opts.runtime === 'process' ? [{ what: 'process runtime: the build outputs as processes in cgroups, against an unlimited shared Postgres with a warm cache and no network delay', direction: 'gentler' }] : [])],
      release,
      shapes: {
        practice: shapeFacts('practice'),
        worst: shapeFacts('worst'),
        ...Object.fromEntries([1, 2, 3].map((variant) => [`worst_variant_${String(variant)}`, shapeFacts('worst', undefined, variant)])),
        small: shapeFacts('small'),
      },
      scenarios: scenarioMeasures,
      oracle,
      only: opts.only,
      notStarted,
      aborted: final ? aborted : (aborted ?? 'run in progress: the report is written again after each scenario and at the end'),
    };
    const full = report(measured, rule);
    const json = `${JSON.stringify(full, (_, value: unknown) => (typeof value === 'bigint' ? value.toString() : value), 2)}\n`;
    writeFileSync(path.join(opts.out, 'screening-capacity.json'), json);
    // As sha256sum writes it, over the bytes kept: the value the launch check prints in ScreeningLaunch (launch-check.ts).
    writeFileSync(path.join(opts.out, 'screening-capacity.sha256'), `${createHash('sha256').update(json).digest('hex')}  screening-capacity.json\n`);
    writeFileSync(path.join(opts.out, 'summary.md'), markdown(full, rule));
    return full;
  };
  say(`runner ${String(runner.cpus)} CPUs, ${String(runner.memoryMiB)} MiB, load ${loadAverage.map((value) => value.toFixed(2)).join(' ')}; harness on CPUs ${affinity}; runtime ${opts.runtime}`);
  let browser: Browser | null = null;
  let owner: OwnerConnection | null = null;
  try {
    if (runnerProblems.length > 0) {
      throw new HarnessStop('RUNNER_TOO_SMALL');
    }
    if (limits.screening === null || limits.screeningTasks < 1) {
      // Production's settings declare the consumer since PR 6b-3; without it there is nothing to measure as production runs.
      throw new HarnessStop('CONSUMER_NOT_DECLARED');
    }
    const built = await ensureRelease(opts.releaseDir ?? path.join(opts.out, 'release'));
    release = { ...release, releaseNo: built.releaseNo, manifestSha256: built.manifestSha256, records: built.records };
    say(`release ${String(release.releaseNo)}: ${String(release.records)} records`);
    const urls = await runtime.startPostgres(pgLimit, expected.storage, NETWORK_DELAY_MS);
    let ownerService = urls.serviceUrl;
    let ownerHarness = urls.harnessUrl;
    if (opts.runtime === 'docker') {
      const admin = new pg.Client({ connectionString: urls.harnessUrl });
      admin.on('error', () => undefined);
      await admin.connect();
      await admin.query(`CREATE DATABASE ${admin.escapeIdentifier(opts.database)}`).finally(() => admin.end());
      ownerHarness = withDatabase(urls.harnessUrl, opts.database);
      ownerService = withDatabase(urls.serviceUrl, opts.database);
    }
    say('migrating and creating the logins');
    await runtime.migrate(ownerService, loginsEnvironment(ownerService, logins));
    say('loading the release');
    say(`loaded: ${(await child('tools/screening-capacity/load.ts', [ownerHarness, built.dir], 6144)).trim()}`);
    await approveSplit(ownerHarness);
    const hostDirs = directories(runtime.dataDir.host);
    for (const dir of Object.values(hostDirs) as string[]) {
      mkdirSync(dir, { recursive: true });
      chmodSync(dir, 0o777);
    }
    const serviceDirs = directories(runtime.dataDir.service);
    const secrets = { cookieSecret: randomBytes(32).toString('base64'), masterKey: developmentMasterKey().toString('base64') };
    const web: ServiceSpec = {
      name: 'web',
      env: webEnvironment(ownerService, runtime.webOrigin, serviceDirs, secrets, logins, { staticAssetOrigin: opts.staticAssetOrigin, screeningSlots: limits.screeningTasks * limits.screeningConcurrency }),
      limit: limits.web,
      cpuset: pgLimit.taskCpuset,
      command: serviceCommand('web'),
    };
    const platform: ServiceSpec = { name: 'platform', env: platformEnvironment(ownerService, runtime.webOrigin, serviceDirs, logins), limit: limits.platform, cpuset: pgLimit.taskCpuset, command: serviceCommand('platform') };
    const screening = limits.screening;
    const consumers: ServiceSpec[] = screeningServices(limits.screeningTasks).map((name) => ({
      name,
      env: screeningEnvironment(ownerService, runtime.webOrigin, serviceDirs, limits.screeningConcurrency, logins),
      limit: screening,
      cpuset: pgLimit.consumerCpuset,
      command: serviceCommand(name),
    }));
    say(`starting web, platform and the screening consumer (${String(consumers.length)} task of ${String(screening.cpus)} vCPU and ${String(screening.memoryMiB)} MiB, ${String(limits.screeningConcurrency)} at once)`);
    await startWeb(runtime, web, 'setup');
    await startWorker(runtime, platform, 'setup');
    await startConsumers(runtime, consumers, 'setup');
    applied = await runtime.applied(ownerHarness);
    owner = new OwnerConnection(ownerHarness);
    browser = await chromium.launch({ headless: true });
    const runIds = new Map<string, string>();
    for (const [index, spec] of specs.entries()) {
      if (Date.now() - harnessStart > SCENARIO_START_DEADLINE_MS) {
        notStarted.push(...specs.slice(index).map((item) => item.id));
        say(`deadline: ${notStarted.join(', ')} not started`);
        break;
      }
      say(`${spec.id}: ${spec.what}`);
      const { measure, runs } = await runScenario(
        spec,
        index,
        { runtime, browser, owner, outbox: hostDirs.outbox, web, platform, consumers, staticAssetOrigin: opts.staticAssetOrigin, until: harnessStart + HARNESS_DEADLINE_MS },
        Object.fromEntries([web, platform, ...consumers].map((service) => [service.name, service.limit.memoryMiB])),
      );
      scenarioMeasures.push(measure);
      for (const [upload, run] of runs) {
        runIds.set(upload, run);
      }
      for (const upload of measure.uploads) {
        const elapsed = upload.submittedMs !== null && upload.emailedMs !== null ? ((upload.emailedMs - upload.submittedMs) / 1000).toFixed(1) : 'none';
        say(`${upload.id} (${upload.shape}): ${elapsed} s to email (logged ${upload.logged === null ? 'none' : (upload.logged.elapsedMs / 1000).toFixed(1)}, ${upload.waitReason ?? upload.logged?.tier ?? 'no tier'}); run ${upload.runStatus ?? 'none'}`);
      }
      write(false);
    }
    await browser.close();
    browser = null;
    // Every service stops and the harness lets go of its connection; Postgres keeps running for the oracle and is
    // removed after it.
    await runtime.stopServices();
    await owner.end();
    const uploads = new Map(specs.flatMap((spec) => spec.uploads).map((upload) => [upload.id, upload] as const));
    const compared = ORACLE_UPLOADS.filter((upload) => runIds.has(upload));
    if (compared.length > 0) {
      say(`comparing ${compared.map((upload) => `${upload} (${oracleKind(upload)})`).join(', ')} with the oracles`);
      const results = JSON.parse(await child('tools/screening-capacity/oracle.ts', [ownerHarness, ...compared.map((upload) => `${oracleKind(upload)}:${runIds.get(upload) ?? ''}`)], 8192)) as {
        runId: string;
        oracle: OracleKind;
        rows: number;
        storedSha256: string;
        oracleSha256: string;
      }[];
      results.forEach((result, at) => {
        const id = compared[at] ?? '';
        const spec = uploads.get(id);
        const expectedRows = spec === undefined ? 0 : shapeFacts(spec.shape, undefined, spec.variant).pricedRows;
        oracle.push({ scenario: id.split('-')[0] ?? '', upload: id, oracle: result.oracle, rows: result.rows, expectedRows, storedSha256: result.storedSha256, oracleSha256: result.oracleSha256 });
      });
    }
  } catch (error) {
    if (error instanceof CommandError) {
      printStderr(error.command, error.stderr);
    }
    aborted = error instanceof HarnessStop ? error.code : `HARNESS_ERROR: ${masked(error instanceof Error ? error.message : String(error)).split('\n')[0]?.slice(0, 500) ?? ''}`;
    say(`stopped: ${aborted}`);
  } finally {
    await browser?.close().catch(() => undefined);
    await owner?.end().catch(() => undefined);
    await runtime.stopAll().catch(() => undefined);
  }
  if (opts.runtime === 'process' && !opts.keepDatabase && opts.adminUrl !== null) {
    // The scratch database, then the run's own logins (roles outlive a database; their names carry the run's suffix).
    const admin = new pg.Client({ connectionString: opts.adminUrl });
    admin.on('error', () => undefined);
    await admin.connect();
    try {
      await admin.query(`DROP DATABASE IF EXISTS ${admin.escapeIdentifier(opts.database)} WITH (FORCE)`);
      await admin.query(`DROP ROLE IF EXISTS ${Object.values(logins).map((login) => admin.escapeIdentifier(login.username)).join(', ')}`);
    } finally {
      await admin.end();
    }
  } else if (opts.runtime === 'process') {
    say(`kept database ${opts.database} and its logins ${Object.values(logins).map((login) => login.username).join(', ')}; drop all of them when done`);
  }
  const full = write(true);
  const summary = markdown(full, rule);
  if (process.env.GITHUB_STEP_SUMMARY !== undefined) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  }
  say(`verdict: ${full.verdict.pass ? 'pass' : 'fail'} (time ${full.verdict.time})`);
  for (const reason of full.verdict.reasons) {
    say(`  ${reason}`);
  }
  if (full.sizing.question) {
    say(`sizing question for the founder (O9): the worst time, ${full.sizing.worstUpload ?? ''}'s ${((full.sizing.worstMs ?? 0) / 1000).toFixed(1)} s, is above 44 s`);
  }
  return full.verdict.pass ? 0 : 1;
}

/** This runner's CPUs and memory. */
function thisRunner(): { readonly cpus: number; readonly memoryMiB: number; readonly cpuModel: string; readonly kernel: string } {
  return { cpus: os.cpus().length, memoryMiB: Math.floor(os.totalmem() / MIB), cpuModel: os.cpus()[0]?.model ?? 'unknown', kernel: os.release() };
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  try {
    if (process.argv.slice(2).includes('--print-harness-cpus')) {
      // The workflow pins the harness, its children and Chromium here (taskset), from the same layout the run applies.
      process.stdout.write(`${harnessCpus(thisRunner(), productionLimits())}\n`);
    } else {
      process.exitCode = await main();
    }
  } catch (error) {
    if (error instanceof HarnessStop && error.code === 'USAGE') {
      process.stderr.write(
        'usage: pnpm screening:capacity --out <dir> [--runtime docker --web-image <tag> --worker-image <tag>] [--runtime process --images <dir> --admin-url <url> --database <name>] [--release-dir <dir>] [--scenarios S1,S2] [--static-asset-origin https://<host>]\n       pnpm -s screening:capacity --print-harness-cpus\n',
      );
      process.exitCode = 2;
    } else {
      throw error;
    }
  }
}
