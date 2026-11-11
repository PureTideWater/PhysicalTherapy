// node fuzz-letters.mts <letters> <seed> [dashedRef probability]: whole letters, base against prototype; differences attributed to a line class.
import fs from 'node:fs';
import { makeGen, letter, joinLines } from './gen2.mts';
import { compare, reasonOf, JANE, CLAIMS } from './lib2.mts';
const count = Number(process.argv[2] ?? 2000);
const seed = Number(process.argv[3] ?? 11);
const dashedRef = Number(process.argv[4] ?? 0.5);
const g = makeGen(seed);
const out: string[] = [];
const kinds: Record<string, number> = {};
const byClass: Record<string, number> = {};
const ex: Record<string, string[]> = {};
const why = (kind: string, c: ReturnType<typeof compare>) => (kind === 'NEW-REFUSAL' ? reasonOf(c.i).replace(/chain:[0-9,]+/, 'chain:n') : kind);
for (let n = 0; n < count; n += 1) {
  const lines = letter(g, { dashedRef });
  const { text, starts } = joinLines(g, lines);
  const whole = compare(text, JANE, CLAIMS);
  const kind = whole.kind;
  kinds[kind] = (kinds[kind] ?? 0) + 1;
  if (kind === 'same' || kind === 'both-refused') continue;
  // attribute: a single line that alone differs the same way; else a pair of neighbours; else the letter
  const culprits = new Set<string>();
  for (const l of lines) {
    const c = compare(l.text, JANE, CLAIMS);
    if (c.kind === kind) culprits.add(`${l.tag} [${why(kind, c)}]`);
  }
  if (culprits.size === 0) {
    for (let k = 0; k + 1 < lines.length; k += 1) {
      const pair = text.slice(starts[k], k + 2 < lines.length ? starts[k + 2] : text.length);
      const c = compare(pair, JANE, CLAIMS);
      if (c.kind === kind) culprits.add(`PAIR ${lines[k]?.tag} + ${lines[k + 1]?.tag} [${why(kind, c)}]`);
    }
  }
  if (culprits.size === 0) culprits.add(`LETTER-LEVEL [${why(kind, whole)}]`);
  for (const c of culprits) {
    byClass[c] = (byClass[c] ?? 0) + 1;
    const list = (ex[c] ??= []);
    if (list.length < 3) list.push(JSON.stringify(text).slice(0, 700));
  }
  out.push(JSON.stringify({ kind, reason: reasonOf(whole.i), culprits: [...culprits], text, base: whole.b.refused ? null : whole.b.text, prot: whole.i.refused ? null : whole.i.text }));
}
fs.writeFileSync(`fuzz-letters.seed${seed}.p${dashedRef}.jsonl`, out.join('\n') + '\n');
console.log(`letters ${count} seed ${seed} dashedRef ${dashedRef}: ${JSON.stringify(kinds)}`);
for (const [c, v] of Object.entries(byClass).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(v).padStart(5)}  ${c}`);
  if (c.startsWith('PAIR') || c.startsWith('LETTER')) for (const e of ex[c] ?? []) console.log(`         ${e}`);
}
