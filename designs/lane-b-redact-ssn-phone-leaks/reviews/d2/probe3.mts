// node probe3.mts [seed]: review D2, third round: controls for the held 'shape' rule, more named references, and whether a match left as written ("fresh") refuses a letter the base sent.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const T0 = Date.now();
const H: any = await import(pathToFileURL('/home/user/fix/packages/model-gateway/src/redact.ts').href);
const B: any = await import(pathToFileURL('/home/user/tree-ef3/packages/model-gateway/src/redact.ts').href);
const GEN: any = await import(pathToFileURL('/home/user/work/d2p6/gen.mts').href);
const pat = (names = ['JANE Q ZEPHYRA'], dob = ['1980-03-14'], memberIds = ['SYNMEMBER0042']) => ({ pseudonym: 'p', names, datesOfBirth: dob, memberIds });
const CLAIMS = [{ claimId: 'c', patientPseudonym: 'p', claimNumbers: ['SYNCLAIM0001'] }];
const JANE = pat();
const seed = Number(process.argv[2] ?? 211);
type Out = { refused: boolean; text: string };
const memo = new Map<string, Out>();
function run(which: 'b' | 'h', text: string, p: any = JANE): Out {
  const key = `${which}${p.datesOfBirth[0]}${p.names[0]}${p.memberIds[0]}\u0000${text}`;
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
const kindOf = (text: string, p: any = JANE) => {
  const b = run('b', text, p);
  const h = run('h', text, p);
  return b.refused ? (h.refused ? 'both' : 'UNREFUSED') : h.refused ? 'NEW' : b.text === h.text ? 'same' : 'CHANGED';
};
const J = (s: string) => JSON.stringify(s);
const clip = (s: string, n = 260) => (s.length > n ? `${s.slice(0, n)}...` : s);
const describe = (text: string, p: any = JANE) => {
  const b = run('b', text, p);
  const h = run('h', text, p);
  const f = (o: Out) => (o.refused ? 'REFUSED' : o.text === text.normalize('NFKC') ? 'SENT same' : `SENT ${J(o.text)}`);
  return `${kindOf(text, p).padEnd(9)} ${J(text)}  base: ${f(b)} | head: ${f(h)}`;
};
const list = (title: string, texts: readonly string[], p: any = JANE) => {
  const kinds: Record<string, number> = {};
  for (const t of texts) kinds[kindOf(t, p)] = (kinds[kindOf(t, p)] ?? 0) + 1;
  console.log(`\n## ${title}: ${texts.length} letters ${JSON.stringify(kinds)}`);
  for (const t of texts) console.log(`  ${clip(describe(t, p), 330)}`);
};
const HELD = 'Service 01/01/2020-150.00 Paid\n';

list("G held letter: the 'shape' rule and its controls", [
  `${HELD}Tracking 802-456-78901`, `${HELD}Tracking # 4-802-456-78901`, `${HELD}Tracking # 4-8024-456-78901`, `${HELD}Policy No. 01-802-45-678901`, `${HELD}Policy No. 01-8025-45-678901`, `${HELD}Policy No. 01-802-45-6789`,
  `${HELD}Claim 802-456-78901`, `${HELD}Claim W802-456-78901`, `${HELD}Claim W8024-456-78901`, `${HELD}Authorization 802-456-78901 approved`, `${HELD}Authorization PA802-456-78901 approved`,
]);
list('H more named references', [
  'Remittance Advice Number 20260115-12-3456', 'Remittance Number 20260115-12-3456', 'Claim W2026008123456.01', 'Claim 2026008123456.01', 'Claim WC 20260115-12-3456', 'Workers Compensation Claim No. WC20260115-001-0001', 'Claim # 30-20260115-12-3456', 'Claim No. WC2026-0115-12-3456',
  'Claim E1234567-01-0001', 'Claim PT1234567-001-20260115', 'Ref: INV-2026011-123-4567', 'Invoice INV2026011-123-4567', 'Policy # GRP1234567-123-4567', 'Claim number: 1234567-001-20260115', 'Your claim (W1234567-01-2026) was processed.', 'Your claim (1234567-01-2026) was processed.',
  'Claim #W1234567-01-2026', 'Claim #1234567-01-2026', 'Claim No.W1234567-01-2026', 'CLAIM: W1234567-01-2026 DOS: 01/05/2026', 'Auth No. PA-1234567-01-2026', 'Auth No. 1234567-01-2026', 'Case ID C1234567-123-4567 is closed.', 'Appeal AP1234567-12-3456 received 01/05/2026.',
]);

// A match the head reads and ef3 did not ("fresh"), beside an ordinary line: is the letter refused where the base sent it, each line alone being sent by the head?
{
  const TRIGGERS: readonly (readonly [string, string])[] = [
    ['Call Jane Zephyra at 555-0123.', 'Call  at 555-0123.'], ['Phone 1: 555-0100', 'Phone  555-0100'], ['Dear Jane·Zephyra,', 'Dear ,'], ['Tel (2): 555-0142', 'Tel  555-0142'], ['Fax Zephyra\n555-0199', 'Fax \n555-0199'],
    ['Contact Ms. Zephyra: 555-0123', 'Contact Ms. : 555-0123'], ['Phone: SYNMEMBER0042 555-0123', 'Phone:  555-0123'], ['Patient Jane•Zephyra', 'Patient '],
  ];
  const g = GEN.makeGen(seed);
  const start = Date.now();
  const kinds: Record<string, number> = {};
  let done = 0;
  let interplay = 0;
  let recorded = 0;
  const beyond: Record<string, { n: number; ex: string; head: string }> = {};
  const asWritten: Record<string, number> = {};
  const out: string[] = [];
  while (Date.now() - start < 60000 && done < 16000) {
    const line = g.line();
    for (const [t, t0] of TRIGGERS) {
      for (const order of [0, 1]) {
        const text = order === 0 ? `${t}\n${line.text}` : `${line.text}\n${t}`;
        const k = kindOf(text);
        done += 1;
        kinds[k] = (kinds[k] ?? 0) + 1;
        if (k !== 'NEW') continue;
        if (run('h', t).refused || run('h', line.text).refused) continue;
        interplay += 1;
        const without = order === 0 ? `${t0}\n${line.text}` : `${line.text}\n${t0}`;
        if (run('b', without).refused) {
          recorded += 1;
          continue;
        }
        const head = run('h', text).text;
        const key = `${J(t)} ${order === 0 ? 'before' : 'after'} ${line.tag}`;
        const e = (beyond[key] ??= { n: 0, ex: text, head });
        e.n += 1;
        const left = /555-01/.test(head) ? 'phone left as written' : /ZEPHYRA/i.test(head) ? 'name left as written' : 'all taken';
        asWritten[left] = (asWritten[left] ?? 0) + 1;
        out.push(JSON.stringify({ text, head, without }));
      }
    }
  }
  console.log(`\n## I. a fresh match beside an ordinary line (d2p6 generator, seed ${seed}): ${done} letters ${JSON.stringify(kinds)} (${((Date.now() - start) / 1000).toFixed(0)}s)`);
  console.log(`  NEW with each line alone sent by the head: ${interplay}; the base refuses the letter with the identifier or list number taken out (recorded): ${recorded}; beyond: ${interplay - recorded} ${JSON.stringify(asWritten)}`);
  for (const [key, e] of Object.entries(beyond).sort((a, b) => b[1].n - a[1].n).slice(0, 24)) console.log(`  ${String(e.n).padStart(3)} ${clip(key, 90)}  e.g. ${clip(J(e.ex), 170)}  head redaction ${clip(J(e.head), 170)}`);
  fs.writeFileSync('/home/user/review-d2/probe3.jsonl', out.join('\n') + '\n');
}
console.log(`\ntotal ${((Date.now() - T0) / 1000).toFixed(0)}s, ${memo.size} runs`);
