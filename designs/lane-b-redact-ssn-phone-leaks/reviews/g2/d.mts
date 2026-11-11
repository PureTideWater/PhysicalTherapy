// node d.mts <letters> <seed>: the ready-made whole-letter generator (d2p6/gen2.mts) on the three trees: letters the base sends unchanged that head refuses or changes and before does not.
import { three, fmt } from './lib.mts';
import { makeGen, letter, joinLines } from '/home/user/work/d2p6/gen2.mts';
const count = Number(process.argv[2] ?? 800);
const seed = Number(process.argv[3] ?? 23);
const T0 = Date.now();
const g = makeGen(seed);
let done = 0, baseSame = 0, headNew = 0, beforeNew = 0, roundNew = 0;
const byTag: Record<string, number> = {};
const ex: string[] = [];
for (let n = 0; n < count && Date.now() - T0 < 100000; n += 1) {
  const lines: any[] = letter(g, { dashedRef: 0.5 });
  const { text } = joinLines(g, lines);
  done += 1;
  const t = three(text);
  if (t.base === 'REFUSED') continue;
  baseSame += 1;
  if (t.before !== t.base) beforeNew += 1;
  if (t.head === t.base) continue;
  headNew += 1;
  if (t.before !== t.base) continue;
  roundNew += 1;
  let found = false;
  for (const l of lines) {
    const lt = three(l.text);
    if (lt.base !== 'REFUSED' && lt.head !== lt.base && lt.before === lt.base) {
      byTag[l.tag] = (byTag[l.tag] ?? 0) + 1;
      found = true;
      if (ex.length < 10) ex.push(fmt(l.text, lt));
    }
  }
  if (!found) {
    byTag['(letter level)'] = (byTag['(letter level)'] ?? 0) + 1;
    if (ex.length < 10) ex.push(fmt(text.slice(0, 500), t));
  }
}
console.log(`fuzz letters seed ${seed}: ${done} letters, base sends ${baseSame}; head refuses/changes ${headNew}, before ${beforeNew}, new this round ${roundNew} ${JSON.stringify(byTag)} [${Date.now() - T0}ms]`);
for (const e of ex) console.log('   ' + e);
