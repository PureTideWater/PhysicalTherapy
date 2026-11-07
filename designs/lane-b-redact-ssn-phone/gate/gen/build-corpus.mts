// Builds the gate's FIXED corpus: gate/corpus/shard-<k>.jsonl.gz (8 shards, round robin), patients.json, manifest.json.
// Deterministic: fixed seeds, fixed snapshots (gen/snap), the harvest of the reviewers' harnesses (gate/harvest/runs) and
// of their data files. Global dedupe by (patient, text); the first source in priority order keeps the letter; large
// harness sources are sampled by a hash of the letter (not by stride, which would alias with their nested loops).
// Usage: node build-corpus.mts   (run under the heavy lock)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { findings, t1, t2, t3, t4, t5, P13, type Rec } from './sources.mts';

const GEN = path.dirname(new URL(import.meta.url).pathname);
const GATE = path.dirname(GEN);
const S = path.resolve(GATE, '..', '..');
const OUT = path.join(GATE, 'corpus');
fs.mkdirSync(OUT, { recursive: true });
const SHARDS = 8;

const fnv = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; };

const patients: { P: unknown; C: unknown }[] = [];
const patientIndex = new Map<string, number>();
const pidOf = (P: unknown, C: unknown) => { const k = JSON.stringify({ P, C }); let i = patientIndex.get(k); if (i === undefined) { i = patients.length; patients.push({ P, C }); patientIndex.set(k, i); } return i; };
const seen = new Set<string>();
const corpus: { s: string; p: number; t: string; sec?: unknown; keep?: unknown; d?: string[] }[] = [];
const counts: Record<string, { offered: number; kept: number; cap: number | null }> = {};
const longBySource: Record<string, { P: unknown; C: unknown; t: string }[]> = {};

/** Adds a source's letters: those not seen before, sampled to `cap` by hash if more. */
function addSource(source: string, recs: Iterable<{ P: unknown; C: unknown; t: string; sec?: unknown; keep?: unknown; d?: string[] }>, cap: number | null) {
  const fresh: { p: number; t: string; key: string; sec?: unknown; keep?: unknown; d?: string[] }[] = [];
  let offered = 0;
  for (const r of recs) {
    if (typeof r.t !== 'string' || r.t.length === 0) continue;
    // Letters over 2,000 characters are the harnesses' timing letters: they go to the timing set, not the corpus.
    if (r.t.length > 2000) { const l = (longBySource[source] ??= []); if (l.length < 200) l.push({ P: r.P, C: r.C, t: r.t }); continue; }
    offered += 1;
    const p = pidOf(r.P, r.C);
    const key = `${p}\u0000${r.t}`;
    if (seen.has(key)) continue;
    seen.add(key);
    fresh.push({ p, t: r.t, key, sec: r.sec, keep: r.keep, d: r.d });
  }
  const keepAll = cap === null || fresh.length <= cap;
  let kept = 0;
  for (const f of fresh) {
    if (!keepAll && fnv(f.key) / 4294967296 >= cap! / fresh.length) { seen.delete(f.key); continue; }
    const rec: (typeof corpus)[number] = { s: source, p: f.p, t: f.t };
    if (f.sec !== undefined) rec.sec = f.sec;
    if (f.keep !== undefined) rec.keep = f.keep;
    if (f.d !== undefined && f.d.length > 0) rec.d = f.d;
    corpus.push(rec);
    kept += 1;
  }
  const c = (counts[source] ??= { offered: 0, kept: 0, cap });
  c.offered += offered; c.kept += kept;
}

const bySource = (recs: Rec[]) => { const m = new Map<string, Rec[]>(); for (const r of recs) { const a = m.get(r.s) ?? []; a.push(r); m.set(r.s, a); } return m; };

// 1. Findings, 2. targeted, 3. property generators: all of them.
for (const [s, recs] of bySource(findings())) addSource(s, recs, null);
for (const gen of [t1(), t2(), t3(), t4()]) for (const [s, recs] of bySource(gen)) addSource(s, recs, null);
for (const [s, recs] of bySource(await t5())) addSource(s, recs, null);

// 4. The reviewers' and fixers' harnesses, as recorded (gate/harvest/runs). Round 3 first; caps per harness run.
const runsDir = path.join(GATE, 'harvest', 'runs');
const runFiles = fs.readdirSync(runsDir).filter((f) => f.endsWith('.jsonl')).sort();
const round = (f: string) => (/^rg-review-phi-3|^rg-review-gateway-3|^rg-skeptic-gateway__r4|^rg-skeptic-phi__r3|^rg-fixer-2/.test(f) ? 0 : /^rg-review-phi-2|^rg-review-gateway-2|^rg-skeptic-gateway__r3|^rg-skeptic-phi/.test(f) ? 1 : 2);
// Caps keep a cold pair under ~8 minutes on 4 workers: round 3's sweeps whole (sweep1, sweep2), ownid3 sampled, others capped.
const CAPS: Record<string, number> = { 'rg-review-phi-3__sweep1.mts__default': 170_000, 'rg-review-phi-3__ownid3.mts__default': 70_000, 'rg-review-phi-3__sweep2.mts__default': 50_000 };
const ROUND_CAP = [20_000, 6_000, 3_000];
runFiles.sort((a, b) => round(a) - round(b) || a.localeCompare(b));
for (const f of runFiles) {
  const defs = new Map<number, { P: unknown; C: unknown }>();
  const recs: { P: unknown; C: unknown; t: string; d?: string[] }[] = [];
  for (const line of fs.readFileSync(path.join(runsDir, f), 'utf8').split('\n')) {
    if (line === '') continue;
    const o = JSON.parse(line);
    if (o.patientDef !== undefined) { defs.set(o.patientDef, { P: o.def.patient, C: o.def.claims }); continue; }
    const who = defs.get(o.p);
    if (!who || who.P === null || typeof who.P !== 'object' || !Array.isArray(who.C)) continue;
    recs.push({ P: who.P, C: who.C, t: o.t, ...(o.d ? { d: o.d } : {}) });
  }
  const name = f.replace(/\.jsonl$/, '');
  addSource(`harness/${name}`, recs, CAPS[name] ?? ROUND_CAP[round(f)]!);
}

// 5. Strings in the reviewers' data files (hits, attack lists, rows, findings), as letters of the default patient.
const DIRS = ['rg-review-phi-1', 'rg-review-phi-2', 'rg-review-phi-3', 'rg-review-gateway-1', 'rg-review-gateway-2', 'rg-review-gateway-3', 'rg-fixer-1', 'rg-fixer-1b', 'rg-fixer-2', 'rg-sweep', 'rg-skeptic-phi', 'rg-skeptic-gateway', 'rg-judge'];
const dataFiles: string[] = [];
const walk = (d: string, depth: number) => {
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (depth < 1 && !/node_modules|^gw-|^mono|vite-cache|^wt$|^gate$|^base$|^head$|^live$|^mid$|^v\w*$|^fix\d$|^sk-/.test(e.name)) walk(p, depth + 1); }
    else if (/\.(txt|json|log|out)$/.test(e.name) && fs.statSync(p).size < 40_000_000) dataFiles.push(p);
  }
};
for (const d of DIRS) walk(path.join(S, d), 0);
const PLACEHOLDER = /\[(?:PATIENT_NAME|DATE_OF_BIRTH|MEMBER_ID|SSN|PHONE|CLAIM_\d+)\]/;
const dataRecs: { P: unknown; C: unknown; t: string }[] = [];
const okLetter = (t: string) => t.length >= 4 && t.length <= 2000 && /[\p{L}\p{N}]/u.test(t) && !PLACEHOLDER.test(t) && !/ -> | => |^(?:base|head|r2|now|mid|var\w*|fix\w*|cand|live|ord|keep|sec)\b[:\s]/.test(t) && !t.includes('/tmp/');
for (const file of dataFiles.sort()) {
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(/"(?:[^"\\\n]|\\.){3,2000}"/g)) {
    let t: unknown;
    try { t = JSON.parse(m[0]); } catch { continue; }
    if (typeof t === 'string' && okLetter(t)) dataRecs.push({ P: P13.P, C: P13.C, t });
  }
  if (file.endsWith('round3-findings.json') || file.endsWith('history.json')) {
    for (const m of text.matchAll(/'([^'\n\\]{4,200})'/g)) if (okLetter(m[1]!)) dataRecs.push({ P: P13.P, C: P13.C, t: m[1]! });
  }
}
addSource('data/reviewer-files', dataRecs, 40_000);

// Write: shards round robin, patients, manifest with a hash of every line in order.
const hash = crypto.createHash('sha256');
const shards: string[][] = Array.from({ length: SHARDS }, () => []);
corpus.forEach((rec, i) => { const line = JSON.stringify({ i, ...rec }); hash.update(line + '\n'); shards[i % SHARDS]!.push(line); });
for (let k = 0; k < SHARDS; k += 1) fs.writeFileSync(path.join(OUT, `shard-${k}.jsonl.gz`), zlib.gzipSync(shards[k]!.join('\n') + '\n', { level: 6 }));
fs.writeFileSync(path.join(OUT, 'patients.json'), JSON.stringify(patients));
// Timing set: up to 3 long letters per harness, distinct shapes, the ones nearest 100 kB first.
const timingSet: { name: string; text: string; patient: unknown; claims: unknown }[] = [];
for (const [source, list] of Object.entries(longBySource).sort()) {
  const shapes = new Set<string>();
  for (const r of [...list].sort((a, b) => Math.abs(a.t.length - 100_000) - Math.abs(b.t.length - 100_000))) {
    const shape = `${r.t.slice(0, 24)}|${r.t.slice(-24)}`.replace(/\p{Nd}/gu, '9');
    if (shapes.has(shape) || r.t.length > 220_000) continue;
    shapes.add(shape);
    timingSet.push({ name: `${source.replace(/^harness\//, '')} #${shapes.size}`, text: r.t, patient: r.P, claims: r.C });
    if (shapes.size >= 3) break;
  }
}
fs.writeFileSync(path.join(OUT, 'timing-harvest.json'), JSON.stringify(timingSet));
hash.update(JSON.stringify(patients));
const manifest = { built: 'gen/build-corpus.mts', letters: corpus.length, timingHarvest: timingSet.length, patients: patients.length, shards: SHARDS, sha256: hash.digest('hex'), dataFiles: dataFiles.length, sources: counts };
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
const group = (s: string) => s.split('/')[0]!;
const totals: Record<string, number> = {};
for (const [s, c] of Object.entries(counts)) totals[group(s)] = (totals[group(s)] ?? 0) + c.kept;
console.log(`letters ${corpus.length} patients ${patients.length} sha256 ${manifest.sha256.slice(0, 16)} by group ${JSON.stringify(totals)}`);
