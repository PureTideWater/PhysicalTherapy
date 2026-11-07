// One gate worker: runs its corpus shards through both trees' real path (redactLetterForScreen, then holdsIdentifier on
// the sent text, exactly as denialLetterSpec.prepare does), and classifies every letter whose outcome differs.
import { parentPort, workerData } from 'node:worker_threads';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { annotate, classAt, labeledNumber, unbracketed, type Occ } from './oracle.mts';

interface Job { srcA: string; srcB: string; shaA: string; shaB: string; corpus: string; corpusSha: string; shards: number[]; cacheDir: string | null; outDir: string; worker: number; limit: number; stride: number }
const job = workerData as Job;
const A = await import(pathToFileURL(path.join(job.srcA, 'redact.ts')).href);
const B = await import(pathToFileURL(path.join(job.srcB, 'redact.ts')).href);
const patients: { P: any; C: any }[] = JSON.parse(fs.readFileSync(path.join(job.corpus, 'patients.json'), 'utf8'));

// 53-bit string hash (cyrb53), kept as two 32-bit halves.
function hash2(str: string): [number, number] {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i += 1) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return [h1 >>> 0, h2 >>> 0];
}

interface Outcome { state: 0 | 1 | 2; h1: number; h2: number; text?: string } // 0 sent, 1 refused, 2 threw
function run(mod: any, t: string, P: any, C: any): Outcome {
  try {
    const r = mod.redactLetterForScreen(t, P, C);
    const refused = mod.holdsIdentifier(r.text, P, C) ? 1 : 0;
    const [h1, h2] = hash2(r.text);
    return { state: refused as 0 | 1, h1, h2, text: r.text };
  } catch {
    return { state: 2, h1: 0, h2: 0, text: '' };
  }
}

// Per-tree cache of outcomes (state + hash of the sent text), by tree hash, corpus hash and shard.
const cacheFile = (sha: string, shard: number) => (job.cacheDir ? path.join(job.cacheDir, `${sha.slice(0, 16)}-${job.corpusSha.slice(0, 16)}-s${shard}.bin`) : null);
const loadCache = (sha: string, shard: number, n: number): Buffer | null => { const f = cacheFile(sha, shard); if (f && fs.existsSync(f)) { const b = fs.readFileSync(f); if (b.length === n * 9) return b; } return null; };

type Hit = { i: number; s: string; t: string; names: string[]; a: string; b: string; note?: string };
const counts: Record<string, number> = {};
const bySource: Record<string, Record<string, number>> = {};
const examples: Record<string, Hit[]> = {};
const hitStreams = new Map<string, number>();
const stats = { letters: 0, same: 0, differ: 0, refusedA: 0, refusedB: 0, errorsA: 0, errorsB: 0, spanMismatch: 0, cachedA: 0, cachedB: 0, metadata: 0, annotated: 0, msRunA: 0, msRunB: 0, msClassify: 0, msParse: 0 };
const srcGroup = (s: string) => s.split('/').slice(0, 2).join('/');
const shape = (t: string) => t.replace(/\p{Nd}/gu, '9');

function hit(cls: string, rec: { i: number; s: string; t: string; p: number }, a: string, b: string, note?: string) {
  counts[cls] = (counts[cls] ?? 0) + 1;
  const g = (bySource[cls] ??= {});
  const sg = srcGroup(rec.s);
  g[sg] = (g[sg] ?? 0) + 1;
  const h: Hit = { i: rec.i, s: rec.s, t: rec.t, names: patients[rec.p]!.P.names, a, b, ...(note ? { note } : {}) };
  const ex = (examples[cls] ??= []);
  if (ex.length < 40 || rec.t.length < ex[ex.length - 1]!.t.length) {
    if (!ex.some((e) => shape(e.t) === shape(rec.t))) { ex.push(h); ex.sort((x, y) => x.t.length - y.t.length); if (ex.length > 40) ex.pop(); }
  }
  let fd = hitStreams.get(cls);
  if (fd === undefined) { fd = fs.openSync(path.join(job.outDir, 'hits', `${cls.replace(/[^\w.-]+/g, '_')}.w${job.worker}.jsonl`), 'w'); hitStreams.set(cls, fd); }
  fs.writeSync(fd, JSON.stringify(h) + '\n');
}

/** What the occurrence is glued to on each side: d digit, l lower-case letter, u upper-case letter, ' ' white space or an end, p punctuation. */
const sideOf = (ch: string | undefined) => (ch === undefined || /\s/u.test(ch) ? '_' : /\p{Nd}/u.test(ch) ? 'd' : /\p{Ll}/u.test(ch) ? 'l' : /\p{L}/u.test(ch) ? 'u' : 'p');
const ctxOf = (normal: string, at: number, len: number) => `${sideOf(normal[at - 1])}|${sideOf(normal[at + len])}`;
const written = (normal: string, spans: { start: number; end: number; placeholder: string }[]) => { let t = ''; let k = 0; for (const s of spans) { t += normal.slice(k, s.start) + s.placeholder; k = s.end; } return t + normal.slice(k); };
const show = (o: Outcome) => (o.state === 1 ? 'REFUSED' : o.state === 2 ? 'THREW' : o.text!);

function classify(rec: { i: number; s: string; t: string; p: number; sec?: Occ[]; keep?: Occ[]; d?: string[] }, oa: Outcome, ob: Outcome) {
  const { P, C } = patients[rec.p]!;
  const normal = unbracketed(rec.t);
  const cover = (mod: any, o: Outcome): Uint8Array | null => {
    if (o.state !== 0) return null;
    const { spans } = mod.redactionSpans(rec.t, P, C);
    if (written(normal, spans) !== o.text) stats.spanMismatch += 1;
    const c = new Uint8Array(normal.length);
    for (const s of spans) c.fill(1, s.start, s.end);
    return c;
  };
  const covA = cover(A, oa);
  const covB = cover(B, ob);
  let secrets: Occ[];
  if (rec.sec !== undefined) { secrets = rec.sec; stats.metadata += 1; } else { secrets = annotate(normal, P, C, rec.d); stats.annotated += 1; }
  const secretMask = new Uint8Array(normal.length);
  const a = show(oa), b = show(ob);
  const phi = new Map<string, string>(), phiRev = new Map<string, string>(), partial = new Set<string>();
  for (const [kind, at, len] of secrets) {
    secretMask.fill(1, at, at + len);
    const idx: number[] = [];
    for (let k = at; k < at + len && k < normal.length; k += 1) if (/[\p{L}\p{N}]/u.test(normal[k]!)) idx.push(k);
    if (idx.length === 0) continue;
    const clearA = covA !== null && idx.every((k) => covA[k] === 0);
    const clearB = covB !== null && idx.every((k) => covB[k] === 0);
    const someB = covB !== null && idx.some((k) => covB[k] === 0);
    const someA = covA !== null && idx.some((k) => covA[k] === 0);
    if (clearB && !clearA && !phi.has(kind)) phi.set(kind, `${oa.state === 1 ? 'A refused' : oa.state === 2 ? 'A threw' : someA ? 'A partly redacted' : 'A redacted'}; glued ${ctxOf(normal, at, len)}`);
    if (clearA && !clearB && !phiRev.has(kind)) phiRev.set(kind, `${ob.state === 1 ? 'B refused' : ob.state === 2 ? 'B threw' : 'B redacted'}; glued ${ctxOf(normal, at, len)}`);
    if (someB && !clearB && !someA) partial.add(kind);
  }
  for (const [kind, how] of phi) hit(`PHI.${kind}`, rec, a, b, how);
  for (const [kind, how] of phiRev) hit(`REVERSE.PHI.${kind}`, rec, a, b, how);
  for (const kind of partial) hit(`INFO.partial-in-clear.${kind}`, rec, a, b);
  const hasSecrets = secrets.length > 0;
  if (ob.state !== 0 && oa.state === 0) {
    // A refusal by B of a letter A leaked from is a PHI fix (REVERSE.PHI), not a KEEP loss.
    if (phiRev.size === 0) hit(hasSecrets ? 'KEEP.refused.letter-with-identifiers' : labeledNumber(normal) ? 'KEEP.refused.must-stay.after-ssn-phone-word' : 'KEEP.refused.must-stay.other', rec, a, b, ob.state === 2 ? 'B threw' : undefined);
  } else if (oa.state !== 0 && ob.state === 0) {
    // With digits after an SSN or phone word that the oracle cannot place, B's sending may be a leak or a fixed fail-safe refusal.
    if (!hasSecrets) hit(labeledNumber(normal) ? 'UNPLACED.unrefused.after-ssn-phone-word' : 'REVERSE.KEEP.unrefused.must-stay', rec, a, b);
    else if (phi.size === 0) hit('REVERSE.KEEP.unrefused.letter-with-identifiers', rec, a, b);
  } else if (covA && covB) {
    const word = labeledNumber(normal) ? 'after an SSN/phone word' : 'no SSN/phone word';
    // A 1-3 letter part of the patient's name, glued, that the oracle did not read as the name: neither a listed
    // must-stay token nor a placed identifier, so its own class (codes and units are classed first).
    const shortParts = [...new Set((P.names as string[]).flatMap((n) => n.normalize('NFKC').toUpperCase().split(/[\s,.\-'’]+/u)).filter((x) => x.length >= 1 && x.length <= 3))];
    const inShortPart = (k: number) => shortParts.some((part) => { for (let s0 = Math.max(0, k - part.length + 1); s0 <= k; s0 += 1) if (normal.slice(s0, s0 + part.length).toUpperCase() === part) return true; return false; });
    const classOf = (k: number) => { const c = classAt(normal, k, rec.keep); return (c === 'ref' || c === 'text' || c === 'number') && /\p{L}/u.test(normal[k]!) && inShortPart(k) ? 'short-name-part' : c; };
    const lost = new Set<string>(), fixed = new Set<string>();
    for (let k = 0; k < normal.length; k += 1) {
      if (secretMask[k] || /\s/u.test(normal[k]!)) continue;
      if (covB[k] && !covA[k]) lost.add(classOf(k));
      else if (covA[k] && !covB[k]) fixed.add(classOf(k));
    }
    for (const cls of lost) hit(`KEEP.changed.${cls}`, rec, a, b, word);
    for (const cls of fixed) hit(`REVERSE.KEEP.changed.${cls}`, rec, a, b);
  }
}

for (const shard of job.shards) {
  const lines = zlib.gunzipSync(fs.readFileSync(path.join(job.corpus, `shard-${shard}.jsonl.gz`))).toString('utf8').split('\n').filter((l) => l !== '');
  const n = job.limit > 0 ? Math.min(job.limit, lines.length) : lines.length;
  const cA = job.limit > 0 || job.stride > 1 ? null : loadCache(job.shaA, shard, n);
  const cB = job.limit > 0 || job.stride > 1 ? null : loadCache(job.shaB, shard, n);
  const outA = Buffer.alloc(n * 9), outB = Buffer.alloc(n * 9);
  const sampled = job.limit > 0 || job.stride > 1;
  for (let j = 0; j < n; j += job.stride) {
    let tp = performance.now();
    const rec = JSON.parse(lines[j]!);
    stats.msParse += performance.now() - tp;
    const { P, C } = patients[rec.p]!;
    stats.letters += 1;
    const fromCache = (c: Buffer | null): Outcome | null => (c === null ? null : { state: c[j * 9] as 0 | 1 | 2, h1: c.readUInt32LE(j * 9 + 1), h2: c.readUInt32LE(j * 9 + 5) });
    let oa = fromCache(cA);
    let ob = fromCache(cB);
    tp = performance.now();
    if (oa) stats.cachedA += 1; else oa = run(A, rec.t, P, C);
    stats.msRunA += performance.now() - tp; tp = performance.now();
    if (ob) stats.cachedB += 1; else ob = run(B, rec.t, P, C);
    stats.msRunB += performance.now() - tp;
    for (const [o, buf] of [[oa, outA], [ob, outB]] as const) { buf[j * 9] = o.state; buf.writeUInt32LE(o.h1, j * 9 + 1); buf.writeUInt32LE(o.h2, j * 9 + 5); }
    if (oa.state === 1) stats.refusedA += 1;
    if (ob.state === 1) stats.refusedB += 1;
    if (oa.state === 2) stats.errorsA += 1;
    if (ob.state === 2) stats.errorsB += 1;
    if (oa.state === ob.state && (oa.state !== 0 || (oa.h1 === ob.h1 && oa.h2 === ob.h2))) { stats.same += 1; continue; }
    stats.differ += 1;
    if (oa.text === undefined) oa = run(A, rec.t, P, C);
    if (ob.text === undefined) ob = run(B, rec.t, P, C);
    tp = performance.now();
    classify(rec, oa, ob);
    stats.msClassify += performance.now() - tp;
  }
  for (const [sha, buf, had] of [[job.shaA, outA, cA], [job.shaB, outB, cB]] as const) {
    const f = cacheFile(sha, shard);
    if (f && had === null && !sampled) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', buf); fs.renameSync(f + '.tmp', f); }
  }
  parentPort!.postMessage({ progress: { worker: job.worker, shard, letters: n } });
}
for (const fd of hitStreams.values()) fs.closeSync(fd);
parentPort!.postMessage({ done: { counts, bySource, examples, stats } });
