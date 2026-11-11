// Review B, script 4: follow-ups. (a) a label that reads through the call's own name to a number: the name written whole
// against the name written apart; (b) the screen's candidates around stored numbers and wider names (seeded);
// (c) redactLetter, base against head, on the rows script 1 kept; (d) one wider match in a long letter: time.
//   node s4-followup.mts      Synthetic text only.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const DIR = '/home/user/ops/designs/lane-b-redact-item-26/reviews/b';
const B = await import(pathToFileURL('/home/user/rev/base/redact.ts').href);
const H = await import(pathToFileURL('/home/user/rev/head/redact.ts').href);
interface Pt { P: { pseudonym: string; names: string[]; datesOfBirth: string[]; memberIds: string[] }; C: { claimId: string; patientPseudonym: string; claimNumbers: string[] }[] }
const mk = (names: string[], memberIds = ['SYNMEMBER0042'], claimNumbers = ['SYNCLAIM0001']): Pt => ({ P: { pseudonym: 'synthetic-patient-1', names, datesOfBirth: ['1980-03-14'], memberIds }, C: [{ claimId: 'synthetic-claim-1', patientPseudonym: 'synthetic-patient-1', claimNumbers }] });
const run = (M: typeof B, text: string, pt: Pt) => { const s = M.redactLetterForScreen(text, pt.P, pt.C); return { text: s.text as string, refused: M.holdsIdentifier(s.text, pt.P, pt.C) as boolean, candidates: s.candidates as string[] }; };
const PZ = mk(['JANE Q ZEPHYRA']);
const show = (text: string, pt: Pt) => {
  const b = run(B, text, pt); const h = run(H, text, pt);
  const mark = !b.refused && h.refused ? 'NEW-REFUSAL' : b.refused && !h.refused ? 'BLOCKING?' : b.refused && h.refused ? 'both-refuse' : b.text !== h.text ? 'new-redaction' : 'same';
  console.log(`${mark.padEnd(13)} letter ${JSON.stringify(text)}  names=${JSON.stringify(pt.P.names)} ids=${JSON.stringify(pt.P.memberIds)} claims=${JSON.stringify(pt.C[0]!.claimNumbers)}\n   base ${b.refused ? 'REFUSED' : 'sent   '} ${JSON.stringify(b.text)}\n   head ${h.refused ? 'REFUSED' : 'sent   '} ${JSON.stringify(h.text)}`);
  return mark;
};
console.log('## (a) the name whole, then the same letter with the name apart');
const PAIRS = ['Call NAME\n555-0123', 'Call NAME 555-0123', 'Patient: Jane NAME, 555-0123', 'Subscriber NAME 900123456', 'Contact NAME 555-0123', 'Fax NAME 202-555-0123', 'NAME 555-0123', 'NAME\n555-0123', 'Phone for NAME is 555-0123.', 'Member NAME DOB 03/14/1980 phone 555-0123', 'Dear NAME,\n\nYour claim SYNCLAIM0001 was denied. Call 555-0123.', 'Re: NAME\nID 76543210', 'Patient NAME\nAccount 76543210\nPhone 555-0123', 'SSN of NAME: 900-12-3456', 'Insured: NAME  Tel 555-0123', 'Patient Name: NAME\nPatient Phone: 555-0123'];
const marks = new Map<string, number>();
for (const pair of PAIRS) {
  show(pair.replace('NAME', 'Zephyra'), PZ);
  for (const apart of ['Zephy ra', 'Z e p h y r a']) { const m = show(pair.replace('NAME', apart), PZ); marks.set(m, (marks.get(m) ?? 0) + 1); }
}
console.log('name apart, by outcome:', JSON.stringify(Object.fromEntries(marks)));
console.log('\n## (a2) word-names and stored numbers before a kept number');
for (const [names, text, m, c] of [
  [['INA VANTREE'], 'Call in a\n555-0123'], [['INA VANTREE'], 'Call in a 555-0123 emergency.'], [['INA VANTREE'], 'Phone in a pinch: 555-0123'], [['ORA VANTREE'], 'Call or a 555-0123 fax.'], [['ISA VANTREE'], 'Phone is a 555-0123 line.'],
  [['JANE Q ZEPHYRA'], 'Ref 1234.56 555-0123', ['SYNMEMBER0042'], ['1234.56']], [['JANE Q ZEPHYRA'], 'Phone 1234.56 555-0123', ['SYNMEMBER0042'], ['1234.56']], [['JANE Q ZEPHYRA'], 'Total 1234.56\nPhone 555-0123', ['SYNMEMBER0042'], ['1234.56']], [['JANE Q ZEPHYRA'], 'Paid 1234.56. Call 555-0123.', ['SYNMEMBER0042'], ['1234.56']],
  [['JANE Q ZEPHYRA'], 'Member ZZ12345/01 555-0123', ['ZZ12345/01'], ['SYNCLAIM0001']], [['JANE Q ZEPHYRA'], 'Member ZZ12345-01 555-0123', ['ZZ12345/01'], ['SYNCLAIM0001']], [['JANE Q ZEPHYRA'], 'Call ZZ12345/01 555-0123', ['ZZ12345/01'], ['SYNCLAIM0001']], [['JANE Q ZEPHYRA'], 'Call ZZ12345-01 555-0123', ['ZZ12345/01'], ['SYNCLAIM0001']],
] as [string[], string, string[]?, string[]?][]) show(text, mk(names, m, c));

console.log('\n## (b) the screen: candidates around stored numbers and wider names');
let state = Number(process.env.SEED ?? 7) >>> 0;
const rnd = () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = <T,>(list: readonly T[]): T => list[Math.floor(rnd() * list.length)]!;
const PS = mk(['INA Q VANTREE'], ['ZZ12345/01'], ['1234.56', '2026.00123']);
const OWN = new Set(['ZZ1234501', '123456', '202600123']);
const TOK = ['ZZ12345', '/01', '01', 'ZZ', '12345', '1234', '.56', '56', '2026', '.00123', '00123', 'in a', 'In a', 'in', 'a', 'Q', 'V a n t r e e', 'Van tree', '-', '/', '.', ' ', '\n', ':', '#', 'ID', 'Claim', 'Member ID', '99887766', 'ZZ7654321', '150.00', '$', 'ZZ12345/01', '1234.56', '2026.00123', 'ZZ12345.01', '1234 56', ',', '(', ')', 'ICN'];
const PLACEHOLDER = /\[(?:PATIENT_NAME|DATE_OF_BIRTH|MEMBER_ID|SSN|PHONE|CLAIM_\d+)\]/g;
const subsequence = (small: string, big: string) => { let i = 0; for (let j = 0; j < big.length && i < small.length; j += 1) if (big[j] === small[i]) i += 1; return i === small.length; };
const tally = new Map<string, number>(); const examples: string[] = [];
const bump = (k: string) => tally.set(k, (tally.get(k) ?? 0) + 1);
for (let k = 0; k < 12000; k += 1) {
  const n = 3 + Math.floor(rnd() * 7); let text = '';
  for (let i = 0; i < n; i += 1) text += `${pick(TOK)}${rnd() < 0.6 ? ' ' : ''}`;
  const b = run(B, text, PS); const h = run(H, text, PS);
  if (b.refused && !h.refused) { bump('BLOCK base refuses, head sends'); examples.push(`BLOCK ${JSON.stringify(text)}`); continue; }
  if (b.refused) { bump('both refuse'); continue; }
  if (h.refused) { bump('base sends, head refuses'); continue; }
  bump('both send');
  const lb = b.text.replace(PLACEHOLDER, ''); const lh = h.text.replace(PLACEHOLDER, '');
  if (lh.length > lb.length || !subsequence(lh, lb)) { bump('BLOCK head shows more'); examples.push(`SHOWS ${JSON.stringify(text)} base ${JSON.stringify(b.text)} head ${JSON.stringify(h.text)}`); }
  const hc = new Set(h.candidates); const bc = new Set(b.candidates);
  if (b.candidates.some((c) => !hc.has(c))) { bump('BLOCK base candidate not offered'); examples.push(`MISSING ${JSON.stringify(text)} base ${JSON.stringify(b.candidates)} head ${JSON.stringify(h.candidates)}`); }
  const added = h.candidates.filter((c) => !bc.has(c));
  if (added.length > 0) { bump('head adds a candidate'); if (added.some((c) => OWN.has(c.toUpperCase()))) { bump('SCREEN head adds an own number'); examples.push(`OWN ${JSON.stringify(text)} added ${JSON.stringify(added)}`); } else if (examples.length < 12) examples.push(`added ${JSON.stringify(text)} -> ${JSON.stringify(added)} | base sent ${JSON.stringify(b.text)} | head sent ${JSON.stringify(h.text)}`); }
  if (b.candidates.some((c) => OWN.has(c.toUpperCase()))) bump('(base offers an own number itself)');
  if (h.text !== b.text) bump('head redacts more');
}
for (const [key, count] of [...tally].sort()) console.log(String(count).padStart(7), key);
for (const e of examples.slice(0, 14)) console.log('  ', e.slice(0, 600));

console.log('\n## (c) redactLetter and redactionSpans, base against head, on the rows script 1 kept');
let rows = 0; let worse = 0; let spanLost = 0;
for (const file of fs.readdirSync(`${DIR}/out`).filter((f) => /^s1-.*\.jsonl$/.test(f))) {
  const lines = fs.readFileSync(path.join(DIR, 'out', file), 'utf8').split('\n').filter(Boolean);
  const step = file.includes('newred') ? 7 : 1;
  for (let i = 0; i < lines.length; i += step) {
    const r = JSON.parse(lines[i]!); rows += 1;
    const b = B.redactLetter(r.t, r.P, r.C).text as string; const h = H.redactLetter(r.t, r.P, r.C).text as string;
    const lb = b.replace(PLACEHOLDER, ''); const lh = h.replace(PLACEHOLDER, '');
    if (lh.length > lb.length || !subsequence(lh, lb)) { worse += 1; if (worse <= 3) console.log('   redactLetter shows more:', JSON.stringify(r.t), JSON.stringify(b), JSON.stringify(h)); }
    const bs = B.redactionSpans(r.t, r.P, r.C).spans; const hs = H.redactionSpans(r.t, r.P, r.C).spans;
    for (const s of bs) if (!hs.some((x: { start: number; end: number }) => x.start <= s.start && s.end <= x.end)) { spanLost += 1; if (spanLost <= 3) console.log('   span of the base not covered:', JSON.stringify(r.t), JSON.stringify(s)); }
  }
}
console.log(`rows ${rows}: redactLetter shows more on ${worse}; spans of the base not covered by the head ${spanLost}`);

console.log('\n## (d) time: 100,000 characters of the fixtures\' prose and one name written apart, patient JANE Q ZEPHYRA (5 runs each, median)');
let prose = '';
const walk = (dir: string) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (/\.(txt|md)$/.test(e.name) && fs.statSync(p).size < 400_000) prose += `${fs.readFileSync(p, 'utf8')}\n\n`; } };
walk('/home/user/PhysicalTherapy/fixtures/synthetic');
const fill = (unit: string, length: number) => unit.repeat(Math.ceil(length / unit.length)).slice(0, length);
const once = (M: typeof B, text: string, pt: Pt) => { const t = performance.now(); const s = M.redactLetterForScreen(text, pt.P, pt.C); M.holdsIdentifier(s.text, pt.P, pt.C); return performance.now() - t; };
const median = (list: number[]) => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)]!;
for (const [label, text] of [
  ['LF, no name apart', fill(prose, 100000)], ['LF, one "Zephy ra" at the end', `${fill(prose, 99980)}\nDear Zephy ra,\n`],
  ['CR LF, no name apart', fill(prose.replace(/\r?\n/g, '\r\n'), 100000)], ['CR LF, one "Zephy ra" at the end', `${fill(prose.replace(/\r?\n/g, '\r\n'), 99980)}\r\nDear Zephy ra,\r\n`],
] as [string, string][]) {
  const bs: number[] = []; const hs: number[] = [];
  once(B, text.slice(0, 3000), PZ); once(H, text.slice(0, 3000), PZ);
  for (let rep = 0; rep < 5; rep += 1) { bs.push(once(B, text, PZ)); hs.push(once(H, text, PZ)); }
  console.log(`${label.padEnd(36)} length ${text.length}  base ${median(bs).toFixed(0)} ms  head ${median(hs).toFixed(0)} ms  head/base ${(median(hs) / median(bs)).toFixed(2)}`);
}
