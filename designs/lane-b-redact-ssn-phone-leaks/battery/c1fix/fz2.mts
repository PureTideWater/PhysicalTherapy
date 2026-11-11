// Avenue 2 fuzzer: base against head over the wide generator. node fz2.mts <seconds> <seed>
import fs from 'node:fs';
import { load, plain, tag } from './lib.mts';
import { classify } from './cls.mts';
import { makeGen } from './gen.mts';
const B = await load('base'); const H = await load('head'); const A = await load('aea');
const budget = Number(process.argv[2] ?? 30) * 1000; const seed = Number(process.argv[3] ?? 1); const t0 = Date.now();
const g = makeGen(seed);
const n: Record<string, number> = { letters: 0 }; const shapes = new Set<string>(); const recs: string[] = [];
const shapeOf = (t: string) => plain(t).replace(/[0-9]+/g, '9').replace(/\p{L}+/gu, 'a').slice(0, 40);
for (;;) {
  if ((n.letters & 63) === 0 && Date.now() - t0 > budget) break;
  n.letters += 1;
  const { t, P, C, who, own } = g.letter();
  const r = classify(B, H, t, P, C, own);
  for (const k of r.kinds) n[k] = (n[k] ?? 0) + 1;
  const marked = r.kinds.filter((k) => k !== 'headSent' && k !== 'flip');
  if (marked.length === 0) continue;
  const key = `${marked.join('+')}${shapeOf(r.h.sent)}`;
  if (shapes.has(key) || recs.length >= 4000) continue;
  shapes.add(key);
  recs.push(JSON.stringify({ k: marked.join('+'), who, t, base: r.b === null ? '' : r.b.refused ? 'REFUSED' : 'SENT', bsent: r.b?.sent ?? '', head: r.h.threw ?? r.h.sent, aea: tag(A, t, P, C).slice(0, 300) }));
}
fs.writeFileSync(`/home/user/work/c1fix/out/fz2.${seed}.jsonl`, `${recs.join('\n')}\n`);
console.log(JSON.stringify(n), `seed ${seed} in ${((Date.now() - t0) / 1000).toFixed(0)} s; distinct shapes ${recs.length}`);
const by: Record<string, number> = {}; for (const r of recs) { const k = JSON.parse(r).k; by[k] = (by[k] ?? 0) + 1; }
console.log('shapes by kind', JSON.stringify(by));
