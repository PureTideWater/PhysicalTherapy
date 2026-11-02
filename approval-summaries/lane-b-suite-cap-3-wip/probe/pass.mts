// SUITE-CAP-3 profile: one reconcile pass of the seeded practice, as the reconcile job runs it (reconcilePractice, the
// job's own pass, in a job scope on the worker's login), in this process (run it under node --max-old-space-size=560
// --expose-gc). With an export file, the export is first staged as intake leaves a clean one (not timed) and the pass is
// the export's reconcile (the job's document_id payload); without, a plain reconcile (the daily one).
//
// Recorded (results only: IDs, counts, times, heap):
// - <out>.timeline.ndjson: every statement the pass sends (a proxy over scope.client.query; no code under test
//   changes): its index, phase, family, fingerprint, start (ms from the pass's start), duration, rows, heapUsed;
// - <out>.json: totals by phase and family (count, time, rows), the time in TypeScript between statements by phase,
//   decrypts by column and phase, heap (sampled every 50 ms and at each statement; live after two gc() at the end),
//   the advisory-lock monitor (pg_locks every 200 ms on a superuser connection: the most any backend held, and all),
//   the pass's summary counts, and the database's stage and entry counts after it.
//
// Usage: TP_REPO=<checkout> node --max-old-space-size=560 --expose-gc --import tsx pass.mts <db url> <meta.json> <out prefix> [export.csv]
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';

import { MiB, PHASE_OPENERS, familyOf, fingerprintOf, repo } from './common.mts';

const [url, metaPath, out, exportPath] = process.argv.slice(2) as [string, string, string, string | undefined];
if (url === undefined || metaPath === undefined || out === undefined) {
  throw new Error('usage: pass.mts <db url> <meta.json> <out prefix> [export.csv]');
}
const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as { practiceId: string; managerId: string; n: number };
const db = await repo('packages/db/src/index.ts');
const testing = await repo('packages/db/src/testing.ts');
const { DocumentStore } = await repo('apps/worker/src/storage/documents.ts');
const { MemorySealedBytes } = await repo('apps/worker/src/intake/test-support/memory-bytes.ts');
const { reconcilePractice } = await repo('apps/worker/src/reconcile/pass.ts');
const { createLogger } = await repo('packages/observability/src/index.ts');

const keys = new db.LocalKeyProvider(db.developmentMasterKey());
const documents = new DocumentStore(new MemorySealedBytes());
const owner = db.databaseClient(url);
await owner.connect();
const app = db.openPool(db.appDevLoginUrl(url), 2);
const worker = db.openPool(db.workerDevLoginUrl(url), 4);
const practiceId = meta.practiceId;

// Stage the export as intake leaves a clean one (LedgerWorld.stageExport's statements), before the pass: not timed.
let documentId: string | undefined;
if (exportPath !== undefined) {
  const content = readFileSync(exportPath);
  documentId = randomUUID();
  await db.withPracticeScope(app, { actorId: meta.managerId, practiceIds: [practiceId] }, (scope: any) =>
    scope.client.query("INSERT INTO source_document (id, practice_id, kind, size_bytes, content_type, uploaded_by) VALUES ($1, $2, 'posting_export', $3, 'text/csv', $4)", [documentId, practiceId, content.length, meta.managerId]),
  );
  const cipher = await db.withPracticeScope(app, { actorId: meta.managerId, practiceIds: [practiceId] }, (scope: any) => db.loadPracticeCipher(scope, keys, practiceId));
  await documents.write(cipher, db.documentObjectKey(practiceId, documentId), Readable.from([content]));
  const { createHash } = await import('node:crypto');
  await testing.asOwner(owner, [practiceId], () =>
    owner.query("UPDATE source_document SET sha256 = $2, scan_status = 'clean', scan_at = now(), status = 'stored' WHERE id = $1", [documentId, createHash('sha256').update(content).digest('hex')]),
  );
}

// Decrypts (and encrypts, lookup hashes) by column and phase: the cipher's own methods, counted.
let phase = 'cipher';
const crypto: Record<string, number> = {};
const proto = db.PracticeCipher.prototype as Record<string, (...args: unknown[]) => unknown>;
for (const method of ['decrypt', 'encrypt', 'lookupHash']) {
  const original = proto[method];
  if (typeof original !== 'function') {
    continue;
  }
  proto[method] = function counted(this: unknown, ...args: unknown[]) {
    const key = `${method} ${String(args[0])} @${phase}`;
    crypto[key] = (crypto[key] ?? 0) + 1;
    return original.apply(this, args);
  };
}

// The heap: sampled every 50 ms and at each statement.
let heapPeak = 0;
const heapNow = () => {
  const used = process.memoryUsage().heapUsed;
  heapPeak = Math.max(heapPeak, used);
  return used;
};
const heapTimer = setInterval(heapNow, 50);
const live = () => {
  globalThis.gc?.();
  globalThis.gc?.();
  return process.memoryUsage().heapUsed;
};

// The advisory-lock monitor, on its own superuser connection.
const monitor = db.databaseClient(url);
await monitor.connect();
const locks = { peakPerBackend: 0, peakAll: 0, samples: 0, timeline: [] as { t: number; perBackend: number; all: number }[] };
let monitoring = true;
const t0 = performance.now();
const monitorLoop = (async () => {
  while (monitoring) {
    const { rows } = await monitor.query(
      `SELECT coalesce(max(n), 0)::int AS per_backend, coalesce(sum(n), 0)::int AS all_locks FROM (SELECT count(*) AS n FROM pg_locks
        WHERE locktype = 'advisory' AND database = (SELECT oid FROM pg_database WHERE datname = current_database()) GROUP BY pid) x`,
    );
    const row = rows[0] as { per_backend: number; all_locks: number };
    locks.peakPerBackend = Math.max(locks.peakPerBackend, row.per_backend);
    locks.peakAll = Math.max(locks.peakAll, row.all_locks);
    locks.samples += 1;
    if (locks.samples % 5 === 0) {
      locks.timeline.push({ t: Math.round(performance.now() - t0), perBackend: row.per_backend, all: row.all_locks });
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
})();

// Every statement, timed through a proxy over the scope's client.
const timeline = createWriteStream(`${out}.timeline.ndjson`);
const fingerprints: Record<string, { family: string; text: string }> = {};
const byFamily: Record<string, { count: number; ms: number; rows: number; maxMs: number }> = {};
const byPhase: Record<string, { statements: number; sqlMs: number; tsMs: number; startMs: number; endMs: number }> = {};
let index = 0;
let lastEnd = 0;
const record = (sql: string, start: number, end: number, rows: number, heap: number) => {
  const family = familyOf(sql);
  const opened = PHASE_OPENERS[family];
  if (opened !== undefined && opened !== phase && !(phase === 'notify' && opened === 'notify')) {
    phase = opened;
  }
  const { fp, text } = fingerprintOf(sql);
  fingerprints[fp] ??= { family, text };
  const p = (byPhase[phase] ??= { statements: 0, sqlMs: 0, tsMs: 0, startMs: start, endMs: end });
  p.statements += 1;
  p.sqlMs += end - start;
  p.tsMs += lastEnd === 0 ? 0 : Math.max(0, start - lastEnd);
  p.endMs = end;
  const f = (byFamily[family] ??= { count: 0, ms: 0, rows: 0, maxMs: 0 });
  f.count += 1;
  f.ms += end - start;
  f.rows += rows;
  f.maxMs = Math.max(f.maxMs, end - start);
  timeline.write(`${JSON.stringify({ i: index, ph: phase, fam: family, fp, t: Math.round(start * 10) / 10, dt: Math.round((end - start) * 100) / 100, rows, heap: MiB(heap) })}\n`);
  index += 1;
  lastEnd = end;
};
const watched = (scope: any) => {
  const client = new Proxy(scope.client, {
    get(target, key) {
      const value = Reflect.get(target, key, target);
      if (key !== 'query') {
        return typeof value === 'function' ? value.bind(target) : value;
      }
      return async (...args: unknown[]) => {
        const sql = typeof args[0] === 'string' ? args[0] : String((args[0] as { text?: string })?.text ?? '');
        // A statement that opens a phase moves the phase before its gap is counted.
        const opened = PHASE_OPENERS[familyOf(sql)];
        if (opened !== undefined && opened !== phase) {
          phase = opened;
        }
        const start = performance.now() - t0;
        heapNow();
        const answer = (await (value as (...query: unknown[]) => Promise<{ rows?: unknown[]; rowCount?: number }>).apply(target, args)) as { rows?: unknown[]; rowCount?: number };
        const end = performance.now() - t0;
        record(sql, start, end, answer?.rowCount ?? answer?.rows?.length ?? 0, heapNow());
        return answer;
      };
    },
  });
  return new Proxy(scope, { get: (target, key) => (key === 'client' ? client : Reflect.get(target, key, target)) });
};
const logs: Record<string, unknown>[] = [];
const jobId = randomUUID();
const context = {
  jobId,
  logger: createLogger({ sink: (line: string) => logs.push(JSON.parse(line) as Record<string, unknown>) }),
  transaction: (work: (scope: unknown) => Promise<unknown>) => db.withJobScope(worker, { jobId, practiceId }, (scope: unknown) => work(watched(scope))),
  enqueue: () => Promise.resolve(null),
  lastAttempt: false,
};

const liveBefore = live();
heapPeak = 0;
const started = performance.now();
let summary: any = null;
let error: { name: string; code?: string; message: string } | null = null;
try {
  summary = await reconcilePractice(context, { documents, keys }, practiceId, documentId === undefined ? {} : { documentId });
} catch (caught) {
  const e = caught as { name?: string; code?: string };
  // The class and the SQLSTATE only: a database message can quote a value.
  error = { name: e.name ?? 'Error', ...(e.code === undefined ? {} : { code: e.code }), message: 'withheld' };
}
const passMs = performance.now() - started;
const liveAfter = live();
monitoring = false;
await monitorLoop;
clearInterval(heapTimer);
await new Promise((resolve) => timeline.end(resolve));

const counts = (await testing.asOwner(owner, [practiceId], () =>
  owner.query(
    `SELECT (SELECT count(*) FROM ledger_entry WHERE practice_id = $1 AND stage = 'approved')::int AS approved,
            (SELECT count(*) FROM ledger_entry WHERE practice_id = $1 AND stage = 'posted')::int AS posted,
            (SELECT count(*) FROM ledger_match WHERE practice_id = $1)::int AS matches,
            (SELECT count(*) FROM line_status WHERE practice_id = $1)::int AS stage_events,
            (SELECT coalesce(sum(amount_cents), 0) FROM ledger_entry WHERE practice_id = $1 AND stage = 'posted')::text AS posted_cents,
            (SELECT count(*) FROM case_line cl WHERE cl.practice_id = $1 AND (SELECT s.stage FROM line_status s WHERE s.service_line_id = cl.service_line_id ORDER BY s.seq DESC LIMIT 1) = 'recovered')::int AS recovered,
            (SELECT count(*) FROM case_line cl WHERE cl.practice_id = $1 AND (SELECT s.stage FROM line_status s WHERE s.service_line_id = cl.service_line_id ORDER BY s.seq DESC LIMIT 1) = 'payer_approved')::int AS payer_approved`,
    [practiceId],
  ),
)).rows[0];
const totals = Object.values(byPhase).reduce((sum, p) => ({ sqlMs: sum.sqlMs + p.sqlMs, tsMs: sum.tsMs + p.tsMs }), { sqlMs: 0, tsMs: 0 });
const result = {
  n: meta.n,
  db: new URL(url).pathname.slice(1),
  export: exportPath !== undefined,
  passMs: Math.round(passMs),
  error,
  summary: summary === null ? null : { ...summary, remittances: { ...summary.remittances, recouped: summary.remittances.recouped.length }, exports: summary.exports.map((load: { outcome: string }) => load.outcome) },
  statements: index,
  sqlMs: Math.round(totals.sqlMs),
  tsBetweenMs: Math.round(totals.tsMs),
  byPhase: Object.fromEntries(Object.entries(byPhase).map(([k, v]) => [k, { statements: v.statements, sqlMs: Math.round(v.sqlMs), tsMs: Math.round(v.tsMs), wallMs: Math.round(v.endMs - v.startMs) }])),
  byFamily: Object.fromEntries(Object.entries(byFamily).sort((a, b) => b[1].ms - a[1].ms).map(([k, v]) => [k, { count: v.count, ms: Math.round(v.ms), rows: v.rows, maxMs: Math.round(v.maxMs * 10) / 10, perCallMs: Math.round((v.ms / v.count) * 1000) / 1000 }])),
  crypto,
  heap: { sampledPeakMiB: MiB(heapPeak), liveBeforeMiB: MiB(liveBefore), liveAfterMiB: MiB(liveAfter), limit: 'max-old-space-size=560' },
  locks: { peakPerBackend: locks.peakPerBackend, peakAll: locks.peakAll, samples: locks.samples, timeline: locks.timeline },
  after: counts,
  logs: logs.map((line) => ({ level: line.level, msg: line.msg, error_code: line.error_code })),
  fingerprints,
};
writeFileSync(`${out}.json`, `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`pass ${String(result.passMs)} ms; statements ${String(index)}; sql ${String(result.sqlMs)} ms; ts ${String(result.tsBetweenMs)} ms; heap peak ${String(result.heap.sampledPeakMiB)} MiB; locks/backend ${String(locks.peakPerBackend)}${error === null ? '' : `; FAILED ${error.name} ${error.code ?? ''}`}\n`);
await monitor.end();
await owner.end();
await testing.endPool(app);
await testing.endPool(worker);
process.exit(error === null ? 0 : 1);
