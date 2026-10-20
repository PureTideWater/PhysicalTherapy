import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs, promisify } from 'node:util';

import { databaseClient, developmentMasterKey } from '@tp/db';
import { addMembership, createOrganization, createUser } from '@tp/db/testing';
import { SCALE_RELEASE_NUMBER, sha256 } from '@tp/synth';
import pg from 'pg';
import { type Browser, type BrowserContext, type Page, chromium } from 'playwright-core';

import { environmentSettings } from '../../infra/lib/environments';
import { repositoryRoot } from '../content-files';
import { DockerRuntime, ProcessRuntime, type Runtime, type ServiceName, type ServiceSpec } from './containers';
import { DEPARTURES, HARNESS_LOGINS, type HarnessDirectories, harnessLogins, loginsEnvironment, platformEnvironment, webEnvironment } from './env';
import { MIB, NETWORK_DELAY_MS, RUNNER_TO_FARGATE, SCENARIO_CAP_MS, STALL_MS, postgresLimit, productionLimits, runnerTooSmall } from './limits';
import { anonBytes, cpuThrottling, memoryEvents, peak, phaseLines, phasesByRun, workerStarted } from './measure';
import { type AppliedLimits, type ContainerMeasure, type Measurements, type OracleComparison, type ScenarioMeasure, type UploadMeasure, markdown, report, timeRule } from './report';
import { type ScenarioSpec, type UploadSpec, scenarios, shapeFacts, shapeRows, uploadCsv } from './uploads';

/**
 * `pnpm screening:capacity`: the screening's capacity test under production limits (audit #53 part 1; docs/adr/0062,
 * "Capacity under production limits"; docs/runbooks/screening-capacity.md). Steps, as the design's §3.6 numbers them:
 *
 *  1. read the limits and the runner; stop as "runner too small" if it is;
 *  2. build the SYNTHETIC scale release in a child process (or take one already built);
 *  3. start Postgres with its limits, io.max and netem (Docker), or take a scratch database on the caller's server;
 *  4. run the migration task (migrations, then logins), load the release in a child process, approve the place-of-
 *     service split as a synthetic contract specialist, and restart Postgres so S1 starts with a cold cache;
 *  5. start web and platform and wait for the health route and the worker's start line; read the limits back;
 *  6. run S1 to S5: each upload's page parses its file first (not timed), then the uploads are submitted (three at once
 *     and a small one behind them in S4 and S5); memory sampled every 500 ms, the outbox polled every 250 ms, a run in
 *     pricing that records no batch for five minutes called stalled, a 30-minute cap; then the cgroups' peaks, events
 *     and throttling, the phase lines, the platform jobs that ran, the stored rows; a fresh platform where it says;
 *  7. open every result link, then its last page of groups;  8. close the browsers;
 *  9. compare upload 1 of S1 and of S2 with the oracle in a child process;
 * 10. write screening-capacity.json and summary.md (and the job summary in CI); exit non-zero on any failing check.
 *
 * The harness and Chromium run on the CPUs the workflow gives them (taskset), never the tasks' CPU. Nothing it writes
 * carries a link, a token or a row.
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
}

function options(argv: readonly string[]): Options {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      out: { type: 'string' },
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
    // The child's own last error line (a code or a short message of this repository's), never its arguments' URLs.
    const stderr = (error as { stderr?: string }).stderr ?? '';
    const last = stderr.split('\n').filter((line) => /Error|error:/.test(line)).at(-1) ?? 'exited non-zero';
    throw new HarnessStop(`${path.basename(script, '.ts').toUpperCase()}_FAILED: ${last.trim().slice(0, 200)}`);
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

/** The split a contract specialist approves (synthetic, as the e2e suite's): 11 non-facility, 22 facility. */
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
    await owner.query('SELECT console_approve_screening_split($1)', [JSON.stringify({ '11': 'non_facility', '22': 'facility' })]);
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
}

interface RunFacts {
  readonly id: string;
  readonly status: string;
  readonly stored: number;
  readonly pending: number;
  readonly engineErrors: number;
}

async function runFacts(owner: pg.Client, email: string): Promise<RunFacts | null> {
  const { rows } = await owner.query<RunFacts>(
    `SELECT r.id, r.status,
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
  readonly owner: pg.Client;
  readonly outbox: string;
  readonly web: ServiceSpec;
  readonly platform: ServiceSpec;
}

async function startPlatform(runtime: Runtime, spec: ServiceSpec): Promise<void> {
  await runtime.startService(spec);
  await waitUntil('PLATFORM', async () => workerStarted(await runtime.logs('platform')), 180_000);
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

async function runScenario(spec: ScenarioSpec, index: number, context: Context, limits: { readonly web: number; readonly platform: number }): Promise<{ readonly measure: ScenarioMeasure; readonly runs: Map<string, string> }> {
  const { runtime, browser, owner } = context;
  // A service that exited in an earlier scenario (counted there) is started again, as production's service would
  // start a new task, so one failure does not leave the later scenarios unmeasured.
  if (!(await runtime.status('web')).running) {
    say(`${spec.id}: web had exited; starting it again`);
    await runtime.startService(context.web);
    await waitUntil('WEB', async () => (await fetch(`${runtime.webOrigin}/api/health`)).status === 200, 300_000);
  }
  if (spec.freshPlatform || !(await runtime.status('platform')).running) {
    say(`${spec.id}: a fresh platform container`);
    await runtime.stopService('platform');
    await startPlatform(runtime, context.platform);
  }
  const scenarioStart = Date.now();
  const since = new Date(scenarioStart);
  const prepared: Prepared[] = [];
  for (const [at, upload] of spec.uploads.entries()) {
    const rows = shapeRows(upload.shape);
    const browserContext = await browser.newContext({ extraHTTPHeaders: { 'X-Forwarded-For': clientAddress(index, at) } });
    const page = await browserContext.newPage();
    const entry: Prepared = { upload, rows: rows.length, context: browserContext, page, submittedAt: null, emailedAt: null, link: null, failedNotice: false };
    page.on('request', (request) => {
      if (entry.submittedAt === null && request.method() === 'POST' && new URL(request.url()).pathname === '/screening') {
        entry.submittedAt = Date.now();
      }
    });
    await page.goto(`${runtime.webOrigin}/screening`, { timeout: 180_000 });
    await page.getByLabel('Practice name').fill(upload.practiceName);
    await page.getByLabel('State').selectOption('MN');
    await page.getByLabel('ZIP code', { exact: true }).fill(upload.zip);
    await page.getByLabel('Work email').fill(upload.contactEmail);
    await page.getByLabel('File to screen').setInputFiles({ name: 'totals.csv', mimeType: 'text/csv', buffer: uploadCsv(rows) });
    // The browser reads and screens the file in its own time, before anything is timed.
    await page.locator('[data-state="file-ready"]').waitFor({ timeout: 600_000 });
    prepared.push(entry);
  }
  say(`${spec.id}: ${String(prepared.length)} pages ready; submitting`);
  const samples: Record<ServiceName, number[]> = { web: [], platform: [] };
  let sampling = true;
  const sampler = (async () => {
    while (sampling) {
      for (const name of ['web', 'platform'] as const) {
        const text = await runtime.cgroupFile(name, 'memory.stat');
        if (text !== null) {
          samples[name].push(anonBytes(text, runtime.cgroupVersion));
        }
      }
      await sleep(500);
    }
  })();
  const click = (entry: Prepared) => entry.page.getByRole('button', { name: 'Screen the file' }).click({ timeout: 60_000 });
  await Promise.all(prepared.filter((entry) => !entry.upload.behind).map(click));
  const behind = prepared.filter((entry) => entry.upload.behind);
  if (behind.length > 0) {
    await sleep(500);
    await Promise.all(behind.map(click));
  }
  const sent = await Promise.allSettled(prepared.map((entry) => entry.page.waitForURL(/\/screening\?sent=1$/, { timeout: 600_000 })));
  sent.forEach((result, at) => {
    if (result.status === 'rejected') {
      say(`${spec.id}: upload ${prepared[at]?.upload.id ?? ''} was not accepted by the page`);
    }
  });
  const mails = new Map<string, Mail>();
  const progress = new Map<string, { readonly done: number; readonly at: number }>();
  const stalled = new Set<string>();
  let lastStallCheck = 0;
  while (Date.now() - scenarioStart < SCENARIO_CAP_MS) {
    readOutbox(context.outbox, mails);
    for (const entry of prepared) {
      if (entry.emailedAt !== null || entry.failedNotice) {
        continue;
      }
      const mail = [...mails.values()].find((message) => message.to.includes(entry.upload.contactEmail));
      if (mail !== undefined) {
        const link = RESULT_LINK.exec(mail.body)?.[0] ?? null;
        if (link === null) {
          entry.failedNotice = true;
        } else {
          entry.emailedAt = mail.writtenMs;
          entry.link = link;
        }
      }
    }
    const open = prepared.filter((entry) => entry.emailedAt === null && !entry.failedNotice && !stalled.has(entry.upload.id));
    if (open.length === 0) {
      break;
    }
    if (Date.now() - lastStallCheck >= 30_000) {
      lastStallCheck = Date.now();
      for (const entry of open) {
        const facts = await runFacts(owner, entry.upload.contactEmail);
        if (facts?.status === 'pricing') {
          const done = facts.stored - facts.pending;
          const before = progress.get(entry.upload.id);
          if (before === undefined || before.done !== done) {
            progress.set(entry.upload.id, { done, at: Date.now() });
          } else if (Date.now() - before.at >= STALL_MS) {
            stalled.add(entry.upload.id);
          }
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
  const containers = [await readContainer(runtime, 'web', limits.web, samples.web, false), await readContainer(runtime, 'platform', limits.platform, samples.platform, false)];
  const phases = phasesByRun(phaseLines(await runtime.logs('platform')));
  const runs = new Map<string, string>();
  const uploads: UploadMeasure[] = [];
  for (const entry of prepared) {
    const facts = await runFacts(owner, entry.upload.contactEmail);
    if (facts !== null) {
      runs.set(entry.upload.id, facts.id);
    }
    const lines = facts === null ? undefined : phases.get(facts.id);
    const opened = resultStatuses.get(entry.upload.id);
    const phaseLog = phaseLines(await runtime.logs('platform')).filter((line) => line.runId === facts?.id);
    const firstPhase = phaseLog[0] === undefined ? null : Date.parse(phaseLog[0].at);
    uploads.push({
      id: entry.upload.id,
      shape: entry.upload.shape,
      rows: entry.rows,
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
    });
  }
  for (const entry of prepared) {
    await entry.context.close();
  }
  const jobs = await owner
    .query<{ name: string; count: number; seconds: number }>(
      `SELECT name, count(*)::int AS count, coalesce(sum(extract(epoch FROM (completed_on - started_on))), 0)::float8 AS seconds
         FROM pgboss.job WHERE started_on >= $1 GROUP BY name ORDER BY name`,
      [since],
    )
    .then((result) => result.rows)
    .catch(() => []);
  return { measure: { id: spec.id, what: spec.what, uploads, containers, platformJobs: jobs }, runs };
}

async function main(): Promise<number> {
  const opts = options(process.argv.slice(2));
  mkdirSync(opts.out, { recursive: true });
  const loadAverage = os.loadavg();
  const runner = { cpus: os.cpus().length, memoryMiB: Math.floor(os.totalmem() / MIB), cpuModel: os.cpus()[0]?.model ?? 'unknown', kernel: os.release(), loadAverage };
  const limits = productionLimits();
  const rule = timeRule(environmentSettings('production'), RUNNER_TO_FARGATE);
  const pgLimit = postgresLimit(runner, limits);
  const expected = { web: limits.web, platform: limits.platform, postgres: pgLimit, storage: { iops: limits.database.iops, bytesPerSecond: limits.database.bytesPerSecond } };
  const runnerProblems = runnerTooSmall(runner, limits);
  const dataHost = path.join(opts.out, 'data');
  const logins = opts.runtime === 'process' ? harnessLogins(randomBytes(4).toString('hex')) : HARNESS_LOGINS;
  const runtime: Runtime =
    opts.runtime === 'docker'
      ? new DockerRuntime({ web: opts.webImage, worker: opts.workerImage }, dataHost)
      : new ProcessRuntime({ worker: path.join(opts.images ?? '', 'worker'), web: path.join(opts.images ?? '', 'web') }, dataHost, opts.adminUrl ?? '', opts.database);
  const scenarioMeasures: ScenarioMeasure[] = [];
  const oracle: OracleComparison[] = [];
  let applied: AppliedLimits = { containers: [], ioMax: null, roundTripMedianMs: null };
  let release = { releaseNo: SCALE_RELEASE_NUMBER, manifestSha256: '', records: 0 };
  let aborted: string | null = null;
  // The commit measured: the images' checkout for the process runtime (built outside this one), else this checkout.
  const measuredCheckout = opts.runtime === 'process' && opts.images !== null ? path.join(opts.images, 'worker') : repositoryRoot;
  const commit = (await exec('git', ['rev-parse', 'HEAD'], { cwd: measuredCheckout }).catch(() => ({ stdout: 'unknown' }))).stdout.trim();
  const affinity = /Cpus_allowed_list:\s*(\S+)/.exec(readFileSync('/proc/self/status', 'utf8'))?.[1] ?? 'unknown';
  say(`runner ${String(runner.cpus)} CPUs, ${String(runner.memoryMiB)} MiB, load ${loadAverage.map((value) => value.toFixed(2)).join(' ')}; harness on CPUs ${affinity}; runtime ${opts.runtime}`);
  let browser: Browser | null = null;
  let owner: pg.Client | null = null;
  try {
    if (runnerProblems.length > 0) {
      throw new HarnessStop('RUNNER_TOO_SMALL');
    }
    const built = await ensureRelease(opts.releaseDir ?? path.join(opts.out, 'release'));
    release = { releaseNo: built.releaseNo, manifestSha256: built.manifestSha256, records: built.records };
    say(`release ${String(release.releaseNo)}: ${String(release.records)} records`);
    const urls = await runtime.startPostgres(pgLimit, expected.storage, NETWORK_DELAY_MS);
    let ownerService = urls.serviceUrl;
    let ownerHarness = urls.harnessUrl;
    if (opts.runtime === 'docker') {
      const admin = new pg.Client({ connectionString: urls.harnessUrl });
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
    await runtime.restartPostgres();
    const hostDirs = directories(runtime.dataDir.host);
    for (const dir of Object.values(hostDirs) as string[]) {
      mkdirSync(dir, { recursive: true });
      chmodSync(dir, 0o777);
    }
    const serviceDirs = directories(runtime.dataDir.service);
    const secrets = { cookieSecret: randomBytes(32).toString('base64'), masterKey: developmentMasterKey().toString('base64') };
    const web: ServiceSpec = { name: 'web', env: webEnvironment(ownerService, runtime.webOrigin, serviceDirs, secrets, logins), limit: limits.web, cpuset: pgLimit.taskCpuset };
    const platform: ServiceSpec = { name: 'platform', env: platformEnvironment(ownerService, runtime.webOrigin, serviceDirs, logins), limit: limits.platform, cpuset: pgLimit.taskCpuset };
    say('starting web and platform');
    await runtime.startService(web);
    await waitUntil('WEB', async () => (await fetch(`${runtime.webOrigin}/api/health`)).status === 200, 300_000);
    await startPlatform(runtime, platform);
    applied = await runtime.applied(ownerHarness);
    owner = new pg.Client({ connectionString: ownerHarness });
    await owner.connect();
    browser = await chromium.launch({ headless: true });
    const all = scenarios().filter((spec) => opts.only.length === 0 || opts.only.includes(spec.id));
    const runIds = new Map<string, string>();
    for (const [index, spec] of all.entries()) {
      say(`${spec.id}: ${spec.what}`);
      const { measure, runs } = await runScenario(spec, index, { runtime, browser, owner, outbox: hostDirs.outbox, web, platform }, { web: limits.web.memoryMiB, platform: limits.platform.memoryMiB });
      scenarioMeasures.push(measure);
      for (const [upload, run] of runs) {
        runIds.set(upload, run);
      }
      for (const upload of measure.uploads) {
        const elapsed = upload.submittedMs !== null && upload.emailedMs !== null ? ((upload.emailedMs - upload.submittedMs) / 1000).toFixed(1) : 'none';
        say(`${upload.id} (${upload.shape}): ${elapsed} s to email; run ${upload.runStatus ?? 'none'}`);
      }
    }
    await browser.close();
    browser = null;
    await runtime.stopAll();
    const compared = ['S1-1', 'S2-1'].filter((upload) => runIds.has(upload));
    if (compared.length > 0) {
      say('comparing with the oracle');
      const results = JSON.parse(await child('tools/screening-capacity/oracle.ts', [ownerHarness, ...compared.map((upload) => runIds.get(upload) ?? '')], 8192)) as { runId: string; rows: number; storedSha256: string; oracleSha256: string }[];
      results.forEach((result, at) => {
        const upload = compared[at] ?? '';
        oracle.push({ scenario: upload.split('-')[0] ?? '', upload, rows: result.rows, storedSha256: result.storedSha256, oracleSha256: result.oracleSha256 });
      });
    }
  } catch (error) {
    aborted = error instanceof HarnessStop ? error.code : `HARNESS_ERROR: ${(error instanceof Error ? error.message : String(error)).split('\n')[0]?.slice(0, 200) ?? ''}`;
    say(`stopped: ${aborted}`);
  } finally {
    await browser?.close().catch(() => undefined);
    await owner?.end().catch(() => undefined);
    await runtime.stopAll().catch(() => undefined);
  }
  if (opts.runtime === 'process' && !opts.keepDatabase && opts.adminUrl !== null) {
    // The scratch database, then the run's own logins (roles outlive a database; their names carry the run's suffix).
    const admin = new pg.Client({ connectionString: opts.adminUrl });
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
  const measured: Measurements = {
    commit,
    runtime: opts.runtime,
    imageDigests:
      opts.runtime === 'docker'
        ? Object.fromEntries(await Promise.all([opts.webImage, opts.workerImage].map(async (image) => [image, (await exec('docker', ['image', 'inspect', '-f', '{{.Id}}', image]).catch(() => ({ stdout: 'unknown' }))).stdout.trim()] as const)))
        : {},
    runner,
    expected,
    applied,
    runnerProblems,
    departures: [...DEPARTURES, ...(opts.runtime === 'process' ? [{ what: 'process runtime: the build outputs as processes in cgroups, against an unlimited shared Postgres with a warm cache and no network delay', direction: 'gentler' }] : [])],
    release,
    shapes: { practice: shapeFacts('practice'), worst: shapeFacts('worst'), small: shapeFacts('small') },
    scenarios: scenarioMeasures,
    oracle,
    aborted,
  };
  const full = report(measured, rule);
  const json = JSON.stringify(full, (_, value: unknown) => (typeof value === 'bigint' ? value.toString() : value), 2);
  writeFileSync(path.join(opts.out, 'screening-capacity.json'), `${json}\n`);
  const summary = markdown(full, rule);
  writeFileSync(path.join(opts.out, 'summary.md'), summary);
  if (process.env.GITHUB_STEP_SUMMARY !== undefined) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  }
  say(`verdict: ${full.verdict.pass ? 'pass' : 'fail'} (time ${full.verdict.time})`);
  for (const reason of full.verdict.reasons) {
    say(`  ${reason}`);
  }
  return full.verdict.pass ? 0 : 1;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  try {
    process.exitCode = await main();
  } catch (error) {
    if (error instanceof HarnessStop && error.code === 'USAGE') {
      process.stderr.write(
        'usage: pnpm screening:capacity --out <dir> [--runtime docker --web-image <tag> --worker-image <tag>] [--runtime process --images <dir> --admin-url <url> --database <name>] [--release-dir <dir>] [--scenarios S1,S2]\n',
      );
      process.exitCode = 2;
    } else {
      throw error;
    }
  }
}
