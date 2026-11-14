// census42.mts <base src> <corpus dir> <out prefix> [shard,shard...]: one pass of rules42.ts's finders over a corpus in
// the gate's layout (the gate's 975,489 letters, generated set 40, generated set 42), on the base's reader. For each
// letter with a hit: each hit with what the base does to it (refused: the base refuses the letter; hidden: the base's
// spans cover it; partial; clear), whether it lies on a part the generator marked as an identifier (sec), and the
// written text (synthetic). Every candidate and floor of the note is tabulated from these rows (summarize42.mjs).
// Run from the gate's directory: node --import ./ts-resolve.mjs <this> ...
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
const [src, corpus, prefix, shardList] = process.argv.slice(2) as [string, string, string, string | undefined];
const core = await import(path.resolve(src, 'redact-core.ts'));
const rules = await import(path.resolve(src, 'rules42.ts'));
const manifest = JSON.parse(fs.readFileSync(path.join(corpus, 'manifest.json'), 'utf8'));
const patients: { P: any; C: any }[] = JSON.parse(fs.readFileSync(path.join(corpus, 'patients.json'), 'utf8'));
const shards = shardList ? shardList.split(',').map(Number) : Array.from({ length: manifest.shards }, (_, k) => k);
const out = fs.openSync(`${prefix}.hits.jsonl`, 'w');
const time = { stored1: 0, stored2: 0, pattern2: 0, glue: 0, base: 0, baseLetters: 0 };
const slowest = { stored1: 0, stored2: 0, pattern2: 0, glue: 0 };
let letters = 0, withHit = 0, chars = 0;
const timed = <T,>(key: keyof typeof slowest, run: () => T): T => { const t = performance.now(); const r = run(); const d = performance.now() - t; time[key] += d; if (d > slowest[key]) slowest[key] = d; return r; };
for (const k of shards) for (const line of zlib.gunzipSync(fs.readFileSync(path.join(corpus, `shard-${k}.jsonl.gz`))).toString('utf8').split('\n')) {
  if (line === '') continue;
  const rec = JSON.parse(line) as { i: number; s: string; p: number; t: string; sec?: [string, number, number][] };
  const { P, C } = patients[rec.p]!;
  const normal = rules.normalOf(rec.t);
  letters += 1; chars += normal.length;
  if (letters % 50 === 0) { const t = performance.now(); const sent = core.redactLetterForScreen(rec.t, P, C).text; core.holdsIdentifier(sent, P, C); time.base += performance.now() - t; time.baseLetters += 1; }
  timed('stored1', () => rules.storedInsertedHits(normal, P, C, 1, 3));
  const hits = [...timed('stored2', () => rules.storedInsertedHits(normal, P, C, 2, 3)), ...timed('pattern2', () => rules.patternInsertedHits(normal, P, C, 2)), ...timed('glue', () => rules.gluedHits(normal, P, 2))];
  if (hits.length === 0) continue;
  withHit += 1;
  const sent = core.redactLetterForScreen(rec.t, P, C).text;
  const refused = core.holdsIdentifier(sent, P, C);
  const cover = new Uint8Array(normal.length + 1);
  for (const s of core.redactionSpans(rec.t, P, C).spans) cover.fill(1, s.start, s.end);
  const rows = hits.map((h: any) => {
    let word = 0, covered = 0;
    for (let at = h.start; at < h.end; at += 1) if (/[\p{L}\p{N}]/u.test(normal[at]!)) { word += 1; covered += cover[at]!; }
    const state = refused ? 'refused' : covered === word ? 'hidden' : covered > 0 ? 'partial' : 'clear';
    const sec = (rec.sec ?? []).some(([, at, len]) => at < h.end && h.start < at + len);
    return { ...h, value: undefined, state, sec, w: normal.slice(Math.max(0, h.start - 12), h.end + 12), id: h.value };
  });
  fs.writeSync(out, JSON.stringify({ i: rec.i, s: rec.s, refused, rows }) + '\n');
}
fs.closeSync(out);
fs.writeFileSync(`${prefix}.stats.json`, JSON.stringify({ corpus: manifest.sha256, shards, letters, chars, withHit, ms: time, slowestMs: slowest }));
console.log(`letters ${letters} with a hit ${withHit} ms ${JSON.stringify(time)} slowest ${JSON.stringify(slowest)}`);
