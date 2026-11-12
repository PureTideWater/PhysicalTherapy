// node --import <gate>/ts-resolve.mjs measure.mts <proto redact.ts> <gate corpus dir> <out dir> [workers=4]
// Queues item 34, form (a): what each candidate floor refuses on the gate's 975,489 synthetic letters, by count.
// The prototype (scripts/proto.sh) is the merged reader plus one rule in holdsIdentifier: a member ID or claim number
// of digits alone, of FLOOR digits or more, with a letter right before or after it, refuses the letter. Per letter:
//  A. the base's answer (floor 0), as prepare gives it; for a letter the base sends, the prototype's answer at each floor;
//  B. the census of that sent text: each of the call's digits-only numbers standing glued to a letter, or to a digit only;
//  C. the surface a number of L digits could meet in any sent letter: every run of digits (the number's own joiners
//     between them) with a letter right before it (its first L digits) or right after it (its last L).
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';

const FLOORS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const LENGTHS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const group = (s: string) => (s.startsWith('harness/') ? 'harness' : s.startsWith('T3/') ? 'T3 codes, units, amounts, dates' : s.split('/')[0]!);

if (isMainThread) {
  const [proto, corpus, out, workers = '4'] = process.argv.slice(2) as [string, string, string, string?];
  fs.mkdirSync(out, { recursive: true });
  const n = Number(workers);
  const results = await Promise.all(Array.from({ length: n }, (_, w) => new Promise<any>((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url), { workerData: { proto, corpus, out, w, shards: [0, 1, 2, 3, 4, 5, 6, 7].filter((s) => s % n === w) }, execArgv: process.execArgv.filter((flag) => !flag.startsWith('--max-old-space-size')), resourceLimits: { maxOldGenerationSizeMb: 3000 } });
    worker.on('message', resolve); worker.on('error', reject);
  })));
  const sum = (a: any, b: any): any => { if (typeof b === 'number') return (a ?? 0) + b; const o: any = a ?? {}; for (const k of Object.keys(b)) o[k] = sum(o[k], b[k]); return o; };
  const total = results.map((r) => r.counts).reduce(sum, {});
  // The surface: merge the per-worker value counts.
  const surface: Record<string, any> = {};
  for (const scope of ['all', 'T3']) for (const L of LENGTHS) {
    const values = new Map<string, number>(); let letters = 0; let placed = 0;
    for (const r of results) { const s = r.surface[scope][L]; letters += s.letters; placed += s.placed; for (const [v, c] of s.values) values.set(v, (values.get(v) ?? 0) + c); }
    const top = [...values].sort((a, b) => b[1] - a[1]).slice(0, 6);
    surface[`${scope} L=${L}`] = { lettersWithAny: letters, distinctValues: values.size, placed, expectedLettersForARandomNumber: Number((placed / 10 ** L).toFixed(4)), top: top.map(([v, c]) => `${v} in ${c}`).join(', ') };
  }
  fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify({ floors: FLOORS, total, surface }, null, 1));
  console.log('done', JSON.stringify(total.letters), JSON.stringify(total.base));
} else {
  const job = workerData as { proto: string; corpus: string; out: string; w: number; shards: number[] };
  const H = await import(pathToFileURL(job.proto).href);
  const T = H.__t;
  const patients: { P: any; C: any[] }[] = JSON.parse(fs.readFileSync(path.join(job.corpus, 'patients.json'), 'utf8'));
  const counts: any = { letters: 0, base: { sent: 0, refused: 0 }, callsWithDigitsOnly: 0, sentWithDigitsOnly: 0, newlyRefused: {}, newlyRefusedBySource: {}, census: {}, censusBySource: {} };
  const bump = (o: any, ...keys: (string | number)[]) => { let at = o; keys.slice(0, -1).forEach((k) => { at = at[k] ??= {}; }); const k = keys[keys.length - 1]!; at[k] = (at[k] ?? 0) + 1; };
  const surface: any = { all: {}, T3: {} };
  for (const scope of ['all', 'T3']) for (const L of LENGTHS) surface[scope][L] = { letters: 0, placed: 0, values: new Map<string, number>() };
  const RUN = new RegExp(`\\p{N}(?:[${T.NUMBER_JOINERS}]*\\p{N})*`, 'gu');
  const digitsOnly = new Map<number, { compact: string; core: string }[]>();
  const hits = fs.openSync(path.join(job.out, `hits.w${job.w}.jsonl`), 'w');
  const isL = (c: string | undefined) => c !== undefined && /\p{L}/u.test(c);
  const isN = (c: string | undefined) => c !== undefined && /\p{N}/u.test(c);
  const answer = (t: string, P: any, C: any[], floor: number) => { H.__setFloor(floor); const r = H.redactLetterForScreen(t, P, C); return { text: r.text as string, refused: H.holdsIdentifier(r.text, P, C, H.checkWorkOf(r)) as boolean }; };
  for (const shard of job.shards) {
    const lines = zlib.gunzipSync(fs.readFileSync(path.join(job.corpus, `shard-${shard}.jsonl.gz`))).toString('utf8').split('\n');
    for (const line of lines) {
      if (line === '') continue;
      const rec = JSON.parse(line) as { i: number; s: string; p: number; t: string };
      const { P, C } = patients[rec.p]!;
      let own = digitsOnly.get(rec.p);
      if (own === undefined) {
        const seen = new Map<string, string>();
        for (const form of T.formsOf(T.letterSubject(P, C))) if ((form.kind === 'claim' || form.kind === 'member') && form.digitsOnly) seen.set(form.compact, T.coreOf(form));
        own = [...seen].map(([compact, core]) => ({ compact, core }));
        digitsOnly.set(rec.p, own);
      }
      counts.letters += 1;
      if (own.length > 0) counts.callsWithDigitsOnly += 1;
      const base = answer(rec.t, P, C, 0);
      if (base.refused) { counts.base.refused += 1; continue; }
      counts.base.sent += 1;
      const g = group(rec.s);
      const text: string = T.viewOf(T.masked(base.text, C.length, T.NAME_MARK), 'join').text;
      // C. The surface.
      const mine = new Map<number, Set<string>>();
      for (const run of text.matchAll(RUN)) {
        const digits = run[0].replace(/\P{N}/gu, '');
        const before = isL(text[run.index - 1]); const after = isL(text[run.index + run[0].length]);
        if (!before && !after) continue;
        for (const L of LENGTHS) { if ([...digits].length < L) break; const set = mine.get(L) ?? new Set<string>(); mine.set(L, set); if (before) set.add(digits.slice(0, L)); if (after) set.add(digits.slice(-L)); }
      }
      for (const scope of g.startsWith('T3') ? ['all', 'T3'] : ['all']) for (const [L, set] of mine) { const s = surface[scope][L]; s.letters += 1; s.placed += set.size; for (const v of set) s.values.set(v, (s.values.get(v) ?? 0) + 1); }
      if (own.length === 0) continue;
      counts.sentWithDigitsOnly += 1;
      // B. The census of the sent text.
      let lowest = 99;
      for (const { compact, core } of own) {
        const L = [...compact].length; let letter = false; let exact = false; let digit = false; let context = '';
        for (const m of text.matchAll(new RegExp(core, 'gu'))) {
          const b = text[m.index - 1]; const a = text[m.index + m[0].length];
          if (isL(b) || isL(a)) { letter = true; if (!isN(b) && !isN(a)) exact = true; context ||= text.slice(Math.max(0, m.index - 12), m.index + m[0].length + 12); } else if (isN(b) || isN(a)) digit = true;
        }
        if (letter) { bump(counts.census, 'gluedToALetter', L); bump(counts.censusBySource, g, L); if (exact) bump(counts.census, 'gluedToALetter, no digit on the other side', L); lowest = Math.min(lowest, L); fs.writeSync(hits, `${JSON.stringify({ i: rec.i, s: rec.s, L, exact, context })}\n`); }
        if (digit && !letter) bump(counts.census, 'gluedToADigitOnly (stays recorded)', L);
      }
      // A. The prototype, at each floor a number of the call reaches.
      if (!answer(rec.t, P, C, 2).refused) { if (lowest < 99) bump(counts, 'censusHitThePrototypeDoesNotRefuse'); continue; }
      if (lowest === 99) bump(counts, 'prototypeRefusesWithNoCensusHit (the look-alike fold, CR LF)');
      for (const floor of FLOORS) if (answer(rec.t, P, C, floor).refused) { bump(counts.newlyRefused, floor); bump(counts.newlyRefusedBySource, g, floor); }
    }
  }
  fs.closeSync(hits);
  for (const scope of ['all', 'T3']) for (const L of LENGTHS) surface[scope][L].values = [...surface[scope][L].values];
  parentPort!.postMessage({ counts, surface });
}
