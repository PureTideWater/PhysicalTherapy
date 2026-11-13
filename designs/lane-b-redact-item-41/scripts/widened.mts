// widened.mts <root> <tree>...: the orchestrator's widening of item 41 (2026-11-13 19:54 UTC), the benefit side, on
// synthetic values only, through redactLetterForScreen and the check (holdsIdentifier). Prints counts per tree.
//  S-5: JANE Q ZEPHYRA; the name written five ways; a chain of J and Q after it (and before it) whose periods follow an
//       unseen character (U+0085, U+200B, U+00AD, U+2060, U+0000, U+0092 and the C1 range's others), or whose joiner is
//       "/", ":", "·", "。"; three frames. Clear = a letter J or Q standing alone in what is sent.
//  phone: "Call {x} now" etc., a phone-shaped number not stored with ↀ, ①, ¹, ½ before, inside or after it. Clear = its
//       last four digits in what is sent.
//  sentence starts (f's cost): a name, then a period and a capital starting a sentence or a word, written the ways a
//       letter writes them. Changed = what is sent differs from item 40's head; the letter of the capital is replaced.
import path from 'node:path'; import { pathToFileURL } from 'node:url';
const [root, ...trees] = process.argv.slice(2);
const P = { pseudonym: 's', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['30072299'] };
const C = [{ claimId: 'c', patientPseudonym: 's', claimNumbers: ['SYNCLAIM0001'] }];
const UNSEEN = ['\u0085', '​', '­', '⁠', '\u0000', '\u0092', '\u0080', '\u0096'];
const JOINERS = ['/', ':', '·', '。'];
const NAMES = ['Zephyra', 'Zephyr A', 'ZEPHYRA', 'Zephyra,', 'ZEPH YRA'];
const FRAMES = (x: string) => [`Dear ${x}, your claim was paid.`, `Patient ${x} was seen on 01/05/2026.`, `Re: ${x}\nPaid 150.00`];
const s5: string[] = [];
for (const n of NAMES) for (const u of UNSEEN) { s5.push(`${n} J${u}.Q${u}.`, `${n} J${u}. Q${u}.`, `J${u}. Q${u}. ${n}`); }
for (const n of NAMES) for (const j of JOINERS) { s5.push(`${n} J${j}Q${j}`, `${n}${j}J${j}Q`, `J${j}Q${j}${n}`); }
const phones: string[] = [];
for (const c of ['ↀ', '①', '¹', '½', 'Ⅳ']) for (const ph of ['555-0123', '(555) 555-0123', '5550123']) { const k = ph.lastIndexOf('0123'); phones.push(`${c}${ph}`, `${ph}${c}`, `${ph.slice(0, k)}${c}${ph.slice(k)}`); }
// Sentence starts: for JANE Q ZEPHYRA (initials J, Q, Z) and ANNA I OKAFOR (A, I, O: the article, the pronoun and the
// interjection, which (f)'s fix leaves out of its undotted rule), a name then a period and a capital the way letters write them.
const P2 = { pseudonym: 't', names: ['ANNA I OKAFOR'], datesOfBirth: ['1979-02-11'], memberIds: ['40081177'] };
const C2 = [{ claimId: 'd', patientPseudonym: 't', claimNumbers: ['SYNCLAIM0002'] }];
const starts: [any, any, string][] = [
  ...['Zephyra.J.Q. was seen', 'Zephyra.J. was seen', 'Zephyra.Q was seen', 'Zephyra J.Q was seen', 'Zephyra, J.Q was seen', 'J. Zephyra. Q was seen', 'Zephyra.Z is the plan', 'Zephyra. J. Smith called',
    'Zephyra.J.Smith called', 'Zephyra J. Q is the code', 'Zephyra J.Q.R. was seen', 'Zephyra, J. Q. paid'].map((x) => [P, C, x] as [any, any, string]),
  ...['Okafor.I am writing', 'Okafor.A claim was', 'Okafor.O the plan', 'Okafor. I am writing', 'Okafor.A.I. was seen', 'Okafor.A. was seen', 'Okafor A.I was seen', 'Okafor, A. I am',
    'Okafor A. A claim was', 'Okafor A.I. A claim was', 'Okafor, A.I. I am', 'A. Okafor. I am', 'Okafor.I.A. paid'].map((x) => [P2, C2, x] as [any, any, string]),
];
const send = (H: any, t: string, p: any = P, c: any = C) => { const r = H.redactLetterForScreen(t, p, c); return H.holdsIdentifier(r.text, p, c) ? null : (r.text as string); };
const base = await import(pathToFileURL(path.join(root!, 'head/packages/model-gateway/src/redact.ts')).href);
for (const t of trees) {
  const H = await import(pathToFileURL(path.join(root!, t, 'packages/model-gateway/src/redact.ts')).href);
  const left: string[] = [];
  const n = { s5: { letters: 0, clear: 0, hidden: 0, refused: 0 }, phone: { letters: 0, clear: 0, hidden: 0, refused: 0 }, starts: { letters: 0, changed: 0, refused: 0 } };
  for (const x of s5) for (const f of FRAMES(x)) { n.s5.letters += 1; const s = send(H, f); if (s === null) n.s5.refused += 1; else if (/(?<!\p{L})[JQ](?!\p{L})/u.test(s)) { n.s5.clear += 1; if (t === 'head-s5') left.push(`${JSON.stringify(f)} -> ${JSON.stringify(s)}`); } else n.s5.hidden += 1; }
  for (const x of phones) for (const f of [`Call ${x} now.`, `Phone: ${x}`, `the number ${x}, or write`]) { n.phone.letters += 1; const s = send(H, f); if (s === null) n.phone.refused += 1; else if (/0\s*1\s*2\s*3/u.test(s)) n.phone.clear += 1; else n.phone.hidden += 1; }
  const changed: string[] = [];
  for (const [p, c, x] of starts) { const f = `Re: ${x} today.`; n.starts.letters += 1; const s = send(H, f, p, c), b = send(base, f, p, c); if (s === null) n.starts.refused += 1; else if (s !== b) { n.starts.changed += 1; changed.push(`${JSON.stringify(f)} -> ${JSON.stringify(s)} (head ${JSON.stringify(b)})`); } }
  console.log(t, JSON.stringify(n)); for (const c of changed) console.log('  changed', c); for (const l of left) console.log('  S-5 left', l);
}
