// generated-run.mts <treeA src> <treeB src> <corpus dir> <out dir>: the generated set (generated-set.mts) through the
// gate's own worker.mts, unchanged (its classes: a PHI.* class is a value A hides and B shows), then each record's
// expected outcome checked on both trees by the worker's own path (redactLetterForScreen, then holdsIdentifier on the
// sent text; cover from redactionSpans). Run from the gate's directory:
//   node --import ./ts-resolve.mjs <this file> <A> <B> <corpus> <out>
// Writes <out>/summary.json (counts only), <out>/failures.jsonl (a rule says hidden or refused and B shows the value)
// and <out>/notes.jsonl (a residual not as pinned). Exit 1 if failures.jsonl holds a line or a PHI class is counted.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';

const [srcA, srcB, corpus, outDir] = process.argv.slice(2).map((p) => path.resolve(p)) as [string, string, string, string];
const GATE = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.join(corpus, 'manifest.json'), 'utf8'));
fs.mkdirSync(path.join(outDir, 'hits'), { recursive: true });
for (const f of fs.readdirSync(path.join(outDir, 'hits'))) fs.unlinkSync(path.join(outDir, 'hits', f));
const sha = (f: string) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const shaA = sha(path.join(srcA, 'redact.ts')), shaB = sha(path.join(srcB, 'redact.ts'));

// (1) The gate's worker, one per shard.
const counts: Record<string, number> = {};
const stats: Record<string, number> = {};
await Promise.all(Array.from({ length: manifest.shards }, (_, w) => new Promise<void>((resolve, reject) => {
  const worker = new Worker(pathToFileURL(path.join(GATE, 'worker.mts')), { workerData: { srcA, srcB, shaA, shaB, corpus, corpusSha: manifest.sha256, shards: [w], cacheDir: null, outDir, worker: w, limit: 0, stride: 1 } });
  worker.on('message', (m: { done?: { counts: Record<string, number>; stats: Record<string, number> } }) => { if (m.done) { for (const [k, v] of Object.entries(m.done.counts)) counts[k] = (counts[k] ?? 0) + v; for (const [k, v] of Object.entries(m.done.stats)) stats[k] = (stats[k] ?? 0) + v; resolve(); } });
  worker.on('error', reject);
})));

// (2) Each record's outcome on each tree, by the same path.
const A = await import(pathToFileURL(path.join(srcA, 'redact.ts')).href);
const B = await import(pathToFileURL(path.join(srcB, 'redact.ts')).href);
const patients: { P: any; C: any }[] = JSON.parse(fs.readFileSync(path.join(corpus, 'patients.json'), 'utf8'));
interface Rec { i: number; s: string; p: number; t: string; sec: [string, number, number][]; exp: string; ctl?: number }
const recs: Rec[] = [];
for (let k = 0; k < manifest.shards; k += 1) for (const line of zlib.gunzipSync(fs.readFileSync(path.join(corpus, `shard-${k}.jsonl.gz`))).toString('utf8').split('\n')) if (line !== '') recs.push(JSON.parse(line));
recs.sort((x, y) => x.i - y.i);
const unbracketed = (text: string) => text.normalize('NFKC').replace(/[[\]]/g, (b) => (b === '[' ? '(' : ')'));
type Seen = { outcome: 'refused' | 'replaced' | 'left' | 'partial' | 'threw'; text: string };
function outcome(mod: any, rec: Rec): Seen {
  const { P, C } = patients[rec.p]!;
  try {
    const sent = mod.redactLetterForScreen(rec.t, P, C).text as string;
    if (mod.holdsIdentifier(sent, P, C)) return { outcome: 'refused', text: 'REFUSED' };
    const normal = unbracketed(rec.t);
    const cover = new Uint8Array(normal.length);
    for (const s of mod.redactionSpans(rec.t, P, C).spans) cover.fill(1, s.start, s.end);
    let clear = 0, covered = 0;
    for (const [, at, len] of rec.sec) for (let k = at; k < at + len; k += 1) if (/[\p{L}\p{N}]/u.test(normal[k]!)) { if (cover[k]) covered += 1; else clear += 1; }
    return { outcome: clear === 0 ? 'replaced' : covered === 0 ? 'left' : 'partial', text: sent };
  } catch {
    return { outcome: 'threw', text: 'THREW' };
  }
}
const seenA: Seen[] = [], seenB: Seen[] = [];
let slowest = 0;
for (const rec of recs) { seenA.push(outcome(A, rec)); const t = performance.now(); seenB.push(outcome(B, rec)); slowest = Math.max(slowest, performance.now() - t); }

const forms: Record<string, { exp: string; letters: number; A: Record<string, number>; B: Record<string, number>; failures: number; notes: number }> = {};
const failures: unknown[] = [], notes: unknown[] = [];
for (const rec of recs) {
  const a = seenA[rec.i]!, b = seenB[rec.i]!;
  const form = (forms[rec.s] ??= { exp: rec.exp, letters: 0, A: {}, B: {}, failures: 0, notes: 0 });
  form.letters += 1;
  form.A[a.outcome] = (form.A[a.outcome] ?? 0) + 1;
  form.B[b.outcome] = (form.B[b.outcome] ?? 0) + 1;
  const shows = b.outcome === 'left' || b.outcome === 'partial' || b.outcome === 'threw';
  const row = { i: rec.i, s: rec.s, exp: rec.exp, names: patients[rec.p]!.P.names, memberIds: patients[rec.p]!.P.memberIds, claims: patients[rec.p]!.C.map((c: any) => c.claimNumbers[0]), t: rec.t, a: a.text, b: b.text, A: a.outcome, B: b.outcome };
  let failed = false, noted = false;
  if (rec.exp === 'refused' || rec.exp === 'hidden') failed = shows;
  else if (rec.exp === 'strict') failed = seenB[rec.ctl!]!.outcome === 'refused' && b.outcome !== 'refused';
  else if (rec.exp === 'left') noted = b.outcome !== 'left' || a.text !== b.text;
  // On every form: nothing A hides or refuses may show on B.
  if (a.outcome !== 'left' && a.outcome !== 'partial' && shows) failed = true;
  if (failed) { form.failures += 1; failures.push(row); } else if (noted) { form.notes += 1; notes.push(row); }
}
fs.writeFileSync(path.join(outDir, 'failures.jsonl'), failures.map((f) => JSON.stringify(f) + '\n').join(''));
fs.writeFileSync(path.join(outDir, 'notes.jsonl'), notes.map((f) => JSON.stringify(f) + '\n').join(''));
const phi = Object.keys(counts).filter((k) => k.startsWith('PHI.'));
const summary = { corpus: { letters: manifest.letters, patients: manifest.patients, sha256: manifest.sha256, seed: manifest.seed }, shaA, shaB, worker: { classes: counts, phiClasses: phi, letters: stats.letters, differ: stats.differ, refusedA: stats.refusedA, refusedB: stats.refusedB, errorsA: stats.errorsA, errorsB: stats.errorsB, spanMismatch: stats.spanMismatch }, failures: failures.length, notes: notes.length, slowestMsB: Math.round(slowest), forms: Object.fromEntries(Object.entries(forms).sort(([x], [y]) => x.localeCompare(y))) };
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 1));
console.log(`letters ${recs.length} differ ${stats.differ} refusedA ${stats.refusedA} refusedB ${stats.refusedB} PHI classes ${phi.length === 0 ? 'none' : phi.join(',')} failures ${failures.length} notes ${notes.length}`);
process.exit(failures.length > 0 || phi.length > 0 ? 1 : 0);
