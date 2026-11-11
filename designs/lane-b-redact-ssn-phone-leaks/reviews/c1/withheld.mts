// node withheld.mts <seconds> <seed>: over the wide generator, a letter whose sent text differs from redactLetter's (a match
// left as written) and that the check does not refuse: the left-as-written match would be sent. Also letters that throw.
import { load } from './lib.mts';
import { makeGen } from './gen.mts';
const H = await load('head');
const budget = Number(process.argv[2] ?? 30) * 1000; const seed = Number(process.argv[3] ?? 1); const t0 = Date.now();
const g = makeGen(seed);
const n = { letters: 0, withheld: 0, SENT_WITHHELD: 0, threw: 0 }; const shown: string[] = [];
for (;;) {
  if ((n.letters & 63) === 0 && Date.now() - t0 > budget) break;
  n.letters += 1;
  const { t, P, C } = g.letter();
  try {
    const screen = H.redactLetterForScreen(t, P, C).text; const all = H.redactLetter(t, P, C).text;
    if (screen === all) continue;
    n.withheld += 1;
    if (!H.holdsIdentifier(screen, P, C)) { n.SENT_WITHHELD += 1; if (shown.length < 6) shown.push(JSON.stringify({ t, screen, all }).slice(0, 700)); }
  } catch (error) { n.threw += 1; if (shown.length < 6) shown.push(`THREW ${String(error).slice(0, 200)} ${JSON.stringify(t).slice(0, 300)}`); }
}
console.log(JSON.stringify(n), `seed ${seed} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
for (const s of shown) console.log(s);
