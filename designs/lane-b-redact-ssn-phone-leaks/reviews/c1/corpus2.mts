// Avenue 2 over the gate corpus: base against head on every letter, each with its own patient. node corpus2.mts <firstShard> <lastShard> <seconds>
import fs from 'node:fs';
import zlib from 'node:zlib';
import { load } from './lib.mts';
import { classify } from './cls.mts';
const B = await load('base'); const H = await load('head');
const [from, to, secs] = [Number(process.argv[2] ?? 0), Number(process.argv[3] ?? 7), Number(process.argv[4] ?? 300)];
const t0 = Date.now(); const corpus = '/home/user/gate/corpus';
const patients = JSON.parse(fs.readFileSync(`${corpus}/patients.json`, 'utf8'));
const n: Record<string, number> = { letters: 0, complete: 1 }; const recs: string[] = []; const by: Record<string, number> = {};
outer: for (let s = from; s <= to; s += 1) {
  for (const line of zlib.gunzipSync(fs.readFileSync(`${corpus}/shard-${s}.jsonl.gz`)).toString('utf8').split('\n')) {
    if (!line) continue;
    if ((n.letters & 255) === 0 && Date.now() - t0 > secs * 1000) { n.complete = 0; break outer; }
    n.letters += 1;
    const rec = JSON.parse(line); const { P, C } = patients[rec.p];
    const own = [...P.names.flatMap((x: string) => x.toUpperCase().split(/[^A-Z]+/).filter((w: string) => w.length >= 4)), ...[...P.memberIds, ...C.flatMap((c: any) => c.claimNumbers)].map((x: string) => x.toUpperCase().replace(/[^A-Z0-9]/g, '')).filter((x: string) => /[A-Z]/.test(x) && x.length >= 5)];
    const r = classify(B, H, rec.t, P, C, own);
    for (const k of r.kinds) n[k] = (n[k] ?? 0) + 1;
    const marked = r.kinds.filter((k) => k !== 'headSent' && k !== 'flip');
    if (marked.length === 0) continue;
    const key = `${marked.join('+')} ${String(rec.s).replace(/__.*/, '')}`; by[key] = (by[key] ?? 0) + 1;
    if (by[key]! <= 3 && recs.length < 600) recs.push(JSON.stringify({ k: marked.join('+'), p: rec.p, s: rec.s, t: rec.t, base: r.b === null ? '' : r.b.refused ? 'REFUSED' : 'SENT', bsent: r.b?.sent ?? '', head: r.h.threw ?? r.h.sent }));
  }
}
fs.writeFileSync(`/home/user/review-c1/out/corpus2.${from}.jsonl`, `${recs.join('\n')}\n`);
console.log(JSON.stringify(n), `shards ${from}-${to} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
for (const [k, c] of Object.entries(by).sort((x, y) => y[1] - x[1]).slice(0, 30)) console.log(c, k);
