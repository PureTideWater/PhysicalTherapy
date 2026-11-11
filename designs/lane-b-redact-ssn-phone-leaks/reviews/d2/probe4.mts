// node probe4.mts [seed]: review D2, fourth round: a label beside a named number with structure, and whether the label read through the call's own identifier or a list
// number across a line break (this diff) redacts or refuses an ordinary next line otherwise than the base does with the identifier or list number taken out.
import { pathToFileURL } from 'node:url';

const T0 = Date.now();
const H: any = await import(pathToFileURL('/home/user/fix/packages/model-gateway/src/redact.ts').href);
const B: any = await import(pathToFileURL('/home/user/tree-ef3/packages/model-gateway/src/redact.ts').href);
const GEN: any = await import(pathToFileURL('/home/user/work/d2p6/gen.mts').href);
const pat = (names = ['JANE Q ZEPHYRA'], dob = ['1980-03-14'], memberIds = ['SYNMEMBER0042']) => ({ pseudonym: 'p', names, datesOfBirth: dob, memberIds });
const CLAIMS = [{ claimId: 'c', patientPseudonym: 'p', claimNumbers: ['SYNCLAIM0001'] }];
const JANE = pat();
const seed = Number(process.argv[2] ?? 307);
type Out = { refused: boolean; text: string };
const memo = new Map<string, Out>();
function run(which: 'b' | 'h', text: string, p: any = JANE): Out {
  const key = `${which}\u0000${text}`;
  let o = memo.get(key);
  if (o === undefined) {
    const R = which === 'b' ? B : H;
    try {
      const s = R.redactLetterForScreen(text, p, CLAIMS);
      o = { refused: R.holdsIdentifier(s.text, p, CLAIMS) === true, text: s.text };
    } catch (e) {
      o = { refused: true, text: `THROW ${String(e).slice(0, 80)}` };
    }
    memo.set(key, o);
  }
  return o;
}
const kindOf = (text: string) => {
  const b = run('b', text);
  const h = run('h', text);
  return b.refused ? (h.refused ? 'both' : 'UNREFUSED') : h.refused ? 'NEW' : b.text === h.text ? 'same' : 'CHANGED';
};
const J = (s: string) => JSON.stringify(s);
const clip = (s: string, n = 260) => (s.length > n ? `${s.slice(0, n)}...` : s);
const describe = (text: string) => {
  const b = run('b', text);
  const h = run('h', text);
  const f = (o: Out) => (o.refused ? 'REFUSED' : o.text === text.normalize('NFKC') ? 'SENT same' : `SENT ${J(o.text)}`);
  return `${kindOf(text).padEnd(9)} ${J(text)}  base: ${f(b)} | head: ${f(h)}`;
};
const list = (title: string, texts: readonly string[]) => {
  const kinds: Record<string, number> = {};
  for (const t of texts) kinds[kindOf(t)] = (kinds[kindOf(t)] ?? 0) + 1;
  console.log(`\n## ${title}: ${texts.length} letters ${JSON.stringify(kinds)}`);
  for (const t of texts) console.log(`  ${clip(describe(t), 330)}`);
};

list('K a phone word or Medicare before a number a noun names, with structure', [
  'Medicare Advantage plan ID 1234567-01-2026', 'Plan ID 1234567-01-2026', 'Fax confirmation number 20260115-001-0001', 'Confirmation number 20260115-001-0001', 'If you call, give order 1234567-01-2026.', 'Give order 1234567-01-2026.',
  'Medicare Advantage Member ID 802-45-678901', 'Member ID 802-45-678901', 'Medicare claim number 20260115-12-3456', 'Contact us about claim 20260115-12-3456.', 'Contact us about account 20260115-12-3456.', 'Phone order 1234567-01-2026 shipped.',
  'Reference 20260115-\n12-3456', 'NPI|TIN\n1234567893|12-3456789\n1098765432|98-7654321', 'Provider|NPI|TIN\nSynth Clinic|1234567893|12-3456789', 'Billed|NPI|TIN\n150.00|1234567893|12-3456789',
]);

{
  const TRIGGERS: readonly (readonly [string, string])[] = [
    ['Phone: Jane Zephyra', 'Phone: '], ['Call Ms. Zephyra', 'Call Ms. '], ['Contact: SYNMEMBER0042', 'Contact: '], ['Fax 1:', 'Fax :'], ['Tel (2):', 'Tel :'], ['Phone Zephyra,', 'Phone ,'], ['Mobile (Jane Zephyra)', 'Mobile ()'], ['Fax re: claim SYNCLAIM0001', 'Fax re: claim '],
  ];
  const g = GEN.makeGen(seed);
  const start = Date.now();
  const kinds: Record<string, number> = {};
  let done = 0;
  let newRecorded = 0;
  let sameLine = 0;
  let principle = 0;
  const newBeyond: Record<string, { n: number; ex: string }> = {};
  const redactBeyond: Record<string, { n: number; ex: string; head: string; base0: string }> = {};
  const rest = (s: string) => s.slice(s.indexOf('\n') + 1);
  while (Date.now() - start < 70000 && done < 14000) {
    const line = g.line();
    const alone = run('h', line.text);
    for (const [t, t0] of TRIGGERS) {
      const text = `${t}\n${line.text}`;
      const k = kindOf(text);
      done += 1;
      kinds[k] = (kinds[k] ?? 0) + 1;
      const b0 = run('b', `${t0}\n${line.text}`);
      const h = run('h', text);
      if (k === 'NEW') {
        if (b0.refused) newRecorded += 1;
        else {
          const e = (newBeyond[`${J(t)} ${line.tag}`] ??= { n: 0, ex: text });
          e.n += 1;
        }
      } else if (!h.refused && !alone.refused) {
        if (rest(h.text) === alone.text) sameLine += 1;
        else if (!b0.refused && rest(b0.text) === rest(h.text)) principle += 1;
        else {
          const e = (redactBeyond[`${J(t)} ${line.tag}`] ??= { n: 0, ex: text, head: h.text, base0: b0.refused ? 'REFUSED' : b0.text });
          e.n += 1;
        }
      }
    }
  }
  console.log(`\n## L. a label and the call's identifier or a list number at a line's end, an ordinary line after it (d2p6 generator, seed ${seed}): ${done} letters ${JSON.stringify(kinds)} (${((Date.now() - start) / 1000).toFixed(0)}s)`);
  console.log(`  NEW refusals the base makes too with the identifier or list number taken out (recorded): ${newRecorded}; beyond: ${Object.values(newBeyond).reduce((n, e) => n + e.n, 0)}`);
  for (const [key, e] of Object.entries(newBeyond).sort((a, b) => b[1].n - a[1].n).slice(0, 14)) console.log(`  ${String(e.n).padStart(3)} NEW ${clip(key, 80)}  e.g. ${clip(J(e.ex), 200)}`);
  console.log(`  sent by the head: the next line redacted as it is alone ${sameLine}; otherwise, but as the base redacts it with the identifier or list number taken out ${principle}; otherwise and not so: ${Object.values(redactBeyond).reduce((n, e) => n + e.n, 0)}`);
  for (const [key, e] of Object.entries(redactBeyond).sort((a, b) => b[1].n - a[1].n).slice(0, 14)) console.log(`  ${String(e.n).padStart(3)} REDACTS ${clip(key, 80)}  e.g. ${clip(J(e.ex), 150)} head ${clip(J(e.head), 150)} | base without it ${clip(J(e.base0), 150)}`);
}
console.log(`\ntotal ${((Date.now() - T0) / 1000).toFixed(0)}s, ${memo.size} runs`);
