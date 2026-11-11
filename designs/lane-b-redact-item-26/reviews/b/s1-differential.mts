// Review B, script 1: base against head on generated synthetic letters (seeded). Classes written to out/s1-*.jsonl.
//   node s1-differential.mts            (SEED=1 BUDGET_S=400 by default)
// Synthetic values only: names ZEPHYRA, VANTREE, JUNE MARCH and word-names; SSN 900-..; phones 555-01..; IDs SYN.., ZZ...
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';
const DIR = '/home/user/ops/designs/lane-b-redact-item-26/reviews/b';
const B = await import(pathToFileURL('/home/user/rev/base/redact.ts').href);
const H = await import(pathToFileURL('/home/user/rev/head/redact.ts').href);
const I = await import(pathToFileURL(`${DIR}/inst/redact.ts`).href);
const SEED = Number(process.env.SEED ?? 1);
const BUDGET = Number(process.env.BUDGET_S ?? 400) * 1000;
const ONLY = (process.env.ONLY ?? '').split(',').filter(Boolean);
const TAG = process.env.TAG ?? 's1';
fs.mkdirSync(`${DIR}/out`, { recursive: true });
let state = SEED >>> 0;
const rnd = () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = <T,>(list: readonly T[]): T => list[Math.floor(rnd() * list.length)]!;
interface Pt { P: { pseudonym: string; names: string[]; datesOfBirth: string[]; memberIds: string[] }; C: { claimId: string; patientPseudonym: string; claimNumbers: string[] }[] }
const mk = (names: string[], memberIds = ['SYNMEMBER0042'], claimNumbers = ['SYNCLAIM0001'], dob = ['1980-03-14']): Pt => ({ P: { pseudonym: 'synthetic-patient-1', names, datesOfBirth: dob, memberIds }, C: [{ claimId: 'synthetic-claim-1', patientPseudonym: 'synthetic-patient-1', claimNumbers }] });
type Job = [string, string, Pt];
const jobs: Job[] = [];
const sample = (gen: string, count: number, make: () => [string, Pt]) => { for (let k = 0; k < count; k += 1) { const [t, pt] = make(); jobs.push([gen, t, pt]); } };

// G1: the call's own name written apart, beside what the check reads (labels, numbers, dates, the other identifiers).
const PZ = mk(['JANE Q ZEPHYRA']);
const PV = mk(['JUNE MARCH', 'J VANTREE'], ['ZZ7654321'], ['C2026000417', '76543210']);
const NAMES1 = ['Zephy ra', 'Zephy. ra', 'Z e p h y r a', 'Ze.phyra', 'ZEPHY RA', 'zephy ra', 'Z.E.P.H.Y.R.A', 'Zephy\nra', 'Zephy\r\nra', 'Ja ne Zephyra', 'J ane Q Zephy ra', 'Jane Q. Zeph yra', 'Zephyr a', 'J. Zephy ra', 'Zephy ra, J', 'Zephy ra Q', 'Q Zephy ra', 'Ja. ne', 'J a n e', 'Zephyra', 'Jane'];
const NAMES1V = ['Ju ne', 'Mar ch', 'Ju ne Mar ch', 'J u n e', 'M a r c h', 'Van tree', 'V a n t r e e', 'Vant. ree', 'J Van tree', 'Ma rch', 'June Ma rch', 'Ju. ne', 'June', 'March'];
const PRE1 = ['', 'Dear ', 'Patient: ', 'Member ', 'Re: ', 'SSN ', 'DOB ', 'Member ID ', 'Claim ', 'Phone ', 'Fax for ', 'Paid ', 'Seen ', '900-12-3456 ', '555-0123 ', '03/14/1980 ', 'SYNMEMBER0042 ', 'SYNCLAIM0001 ', '$150.00 ', 'CO-45 ', '97110 ', 'Social Security number of ', 'Date of birth of ', 'ZZ7654321 ', 'born ', 'Call ', 'Subscriber ', 'ID ', 'ICN ', 'March 14, 1980 '];
const GLUE = [' ', '', ', ', ': ', '\n', '\r\n', '-', '.', ' - ', '\t', ' \r\n ', '\n\n'];
const POST1 = ['', '900-12-3456', '900123456', '900 12 3456', '555-0123', '(202) 555-0123', '202.555.0123', '03/14/1980', 'March 14, 1980', '1980-03-14', '14 March 1980', 'SYNMEMBER0042', 'SYNCLAIM0001', '150.00', '$150.00', '97110', 'CO-45', 'DOB 03/14/1980', 'SSN 900-12-3456', 'Member ID SYNMEMBER0042', 'ZZ7654321', '76543210', 'C2026000417', '12345', 'born 03/14/1980', 'was denied.', 'Q', 'J', 'Jane', 'Zephyra', 'No. 900-12-3456150.00', 'on file. Statement 900-12-3456', '03/14/2026', 'Mar 14 1980', 'SSN', 'DOB', 'Phone', 'Member ID', 'Claim'];
sample('G1', 9000, () => [`${pick(PRE1)}${pick(NAMES1)}${pick(GLUE)}${pick(POST1)}${rnd() < 0.3 ? `${pick(GLUE)}${pick(NAMES1)}${pick(GLUE)}${pick(POST1)}` : ''}`, PZ]);
sample('G1v', 5000, () => [`${pick(PRE1)}${pick(NAMES1V)}${pick(GLUE)}${pick(POST1)}${rnd() < 0.3 ? `${pick(GLUE)}${pick(NAMES1V)}${pick(GLUE)}${pick(POST1)}` : ''}`, PV]);

// G2: a patient whose name's letters are ordinary words apart, in ordinary phrases beside what the check reads.
const WORDS: Record<string, string[]> = {
  INA: ['in a', 'In a', 'in. A', 'in\na'], ASA: ['as a', 'As a'], ISA: ['is a', 'Is a', 'is. A'], TOBE: ['to be', 'To be', 'to\nbe'], BEA: ['be a'], ORA: ['or a', 'Or a'], TOAN: ['to an', 'To an'],
  HASAN: ['has an', 'Has an'], BEAN: ['be an'], ASIF: ['as if'], THEA: ['the a', 'the A'], IDA: ['ID a', 'I.D. A', 'id. A'], MARCHAND: ['March and', 'march and'], NORA: ['nor a'], ANA: ['an A', 'an a'],
  ONA: ['on a', 'On a'], ATA: ['at a', 'At a'], MAYA: ['may a', 'May a'], FORAN: ['for an', 'For an'], ORIN: ['or in', 'Or in'], INAN: ['in an', 'In an'], ANDRE: ['and re', 'and re-submit'], ANDI: ['and I'],
  THEIN: ['the in', 'the in-network'], NOTO: ['not o', 'no to'], PO: ['P.O.', 'P. O.'], MD: ['M.D.', 'M. D.'], NA: ['N.A.', 'n. a.'], THEO: ['the o', 'the O'],
};
const PRE2 = ['', 'This claim was processed ', 'Member ID SYNMEMBER0042 ', 'SSN 900-12-3456 ', 'Phone 555-0123 ', 'DOB 03/14/1980 ', 'Claim SYNCLAIM0001 ', 'Paid $150.00 ', 'On 03/14/2026 ', 'CPT 97110 ', 'CO-45 ', 'Q ', 'V. ', 'Dear Q ', 'Social Security number ', 'Member ID: ', 'Claim number ', 'Call ', 'Fax ', 'Date of birth ', 'born ', 'SSN on file ', 'Phone: ', 'ID ', 'Vantree ', 'Q Vantree '];
const POST2 = ['', 'lump sum of $150.00', '900-12-3456', '900 12 3456', '900123456', '555-0123', '(202) 555-0123', '03/14/1980', '03/14/2026', 'March 14, 1980', 'SYNMEMBER0042', 'SYNCLAIM0001', '15000', '$15000.00', '97110', 'CO-45', 'Q', 'V', 'Q code', 'timely manner within 180 days', 'DOB 03/14/1980', 'SSN 900-12-3456', 'Member ID SYNMEMBER0042', '12345678', 'ZZ7654321', 'Vantree', 'V a n t r e e', 'Van tree', 'G0283 unit', 'April 2026 period'];
const WORD_NAMES = Object.keys(WORDS);
sample('G2', 14000, () => { const w = pick(WORD_NAMES); const pt = mk(rnd() < 0.5 ? [`${w} Q VANTREE`] : [w], ['SYNMEMBER0042'], ['SYNCLAIM0001', '15000']); return [`${pick(PRE2)}${pick(WORDS[w]!)}${pick(GLUE.filter((g) => g !== ''))}${pick(POST2)}${rnd() < 0.3 ? ` ${pick(WORDS[w]!)} ${pick(POST2)}` : ''}`, pt]; });

// G3: stored numbers that hold a separator, beside amounts, dates and units.
const STORED: [string[], string[]][] = [[['ZZ12345/01'], ['SYNCLAIM0001']], [['SYNMEMBER0042'], ['1234.56']], [['123456789*01'], ['2026.00123']], [['SYNMEMBER0042'], ['12/34']], [['W1234.56789'], ['26-0311/7']], [['SYNMEMBER0042'], ['0311/26']], [['ZZ12345,01'], ['1,234']], [['ZZ12345+01'], ['150.00']], [['SYNMEMBER0042'], ['03/11']], [['ZZ 12345.01'], ['97110.59']], [['A1:B2'], ['2026/0311']]];
const NUM3 = (ids: string[]) => { const v = pick(ids); const d = v.replace(/[^A-Za-z0-9]/g, ''); return pick([v, d, v.replace(/[^A-Za-z0-9]/g, ' '), v.replace(/[^A-Za-z0-9]/g, '-'), `$${v}`, `${v}.00`, `${v}/2026`, `${v} units`, `$${v}.00`, `${v.slice(0, -1)} ${v.slice(-1)}`, `${v}0`, `1${v}`, v.replace(/([^A-Za-z0-9])/g, '$1 '), v.replace(/([^A-Za-z0-9])/g, ' $1'), `${v.replace(/[^A-Za-z0-9]/g, '.')}`, `${v.replace(/[^A-Za-z0-9]/g, '/')}`]); };
const PRE3 = ['', 'Paid ', 'Paid $', 'Billed ', 'Allowed ', 'Claim ', 'Claim number: ', 'Member ID ', 'ICN ', 'Seen ', 'DOS ', 'Date of service ', 'Total ', 'Units ', 'SSN ', 'Phone ', 'Check ', 'CPT ', 'Ref '];
const POST3 = ['', ' units', '.00', ' 123.45', ' on 03/11/2026', '/2026', ' 900-12-3456', ' 555-0123', ' was denied.', ' 97110', ' CO-45', ' $150.00', ' 01', ' 56', ' 26'];
sample('G3', 9000, () => { const [m, c] = pick(STORED); const pt = mk(['JANE Q ZEPHYRA'], m, c); return [`${pick(PRE3)}${NUM3([...m, ...c])}${pick(POST3)}${rnd() < 0.4 ? `${pick(GLUE)}${pick(PRE3)}${NUM3([...m, ...c])}${pick(POST3)}` : ''}`, pt]; });

// G4: the repository's synthetic prose, by paragraph, for each word-name patient the wider reading can touch; as written and with CR LF.
const ROOT = '/home/user/PhysicalTherapy';
const prose: string[] = [];
const walk = (dir: string) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (/\.(txt|md)$/.test(e.name) && fs.statSync(p).size < 400_000) prose.push(fs.readFileSync(p, 'utf8')); } };
walk(`${ROOT}/fixtures/synthetic`);
const chunks: string[] = [];
for (const text of prose) { let cur = ''; for (const para of text.split(/\n{2,}/)) { if (cur.length + para.length > 1200 && cur !== '') { chunks.push(cur); cur = ''; } cur += (cur === '' ? '' : '\n\n') + para; } if (cur !== '') chunks.push(cur.slice(0, 4000)); }
const loose = (w: string) => new RegExp(`(?<![\\p{L}\\p{N}])${[...w].join("[\\s.\\-'_]*")}(?![\\p{L}\\p{N}])`, 'iu');
let g4 = 0;
for (const w of WORD_NAMES) { const re = loose(w); const pt = mk([`${w} Q VANTREE`], ['SYNMEMBER0042'], ['SYNCLAIM0001']); for (const chunk of chunks) { if (g4 < 9000 && re.test(chunk)) { jobs.push(['G4', chunk, pt]); jobs.push(['G4crlf', chunk.replace(/\r?\n/g, '\r\n'), pt]); g4 += 2; } } }
// G4z: every chunk for the ordinary patient with CR LF line endings (a CR LF letter against its LF writing).
for (const chunk of chunks.slice(0, 1500)) if (chunk.includes('\n')) jobs.push(['G4zcrlf', chunk.replace(/\r?\n/g, '\r\n'), PZ]);

// G5: the gate's corpus, sampled, with its own patients: CR LF line endings; a CR LF at a space; the patient's name written apart.
const patients: Pt[] = JSON.parse(fs.readFileSync('/home/user/gate/corpus/patients.json', 'utf8'));
for (let shard = 0; shard < 8; shard += 1) {
  const lines = zlib.gunzipSync(fs.readFileSync(`/home/user/gate/corpus/shard-${shard}.jsonl.gz`)).toString('utf8').split('\n');
  for (let k = Math.floor(rnd() * 97); k < lines.length; k += 97 + Math.floor(rnd() * 5)) {
    if (!lines[k]) continue;
    const rec = JSON.parse(lines[k]!) as { t: string; p: number };
    const pt = patients[rec.p]!;
    if (rec.t.length > 3000) continue;
    const roll = rnd();
    if (rec.t.includes('\n') && roll < 0.35) { jobs.push(['G5crlf', rec.t.replace(/\r?\n/g, '\r\n'), pt]); continue; }
    if (roll < 0.55 && rec.t.includes(' ')) { const at = [...rec.t.matchAll(/ /g)].map((m) => m.index!); const i = pick(at); jobs.push(['G5crlfAtSpace', `${rec.t.slice(0, i)}${pick(['\r\n', ' \r\n', '\r\n\r\n'])}${rec.t.slice(i + 1)}`, pt]); continue; }
    const parts = pt.P.names.flatMap((n) => n.split(/[^\p{L}]+/u)).filter((p) => p.length >= 3);
    const hits = parts.flatMap((p) => [...rec.t.matchAll(new RegExp(p, 'giu'))].map((m) => [m.index!, p.length] as const));
    if (hits.length === 0) continue;
    const [at, len] = pick(hits); const cut = at + 1 + Math.floor(rnd() * (len - 1));
    jobs.push(['G5apart', `${rec.t.slice(0, cut)}${pick([' ', '. ', '.', '  ', ' . ', '\n'])}${rec.t.slice(cut)}`, pt]);
  }
}
// G6 (added after the first run; G1 to G5 draw the same letters as before): the name apart in look-alike letters and digits.
const ALIKE: Record<string, string[]> = { a: ['а', 'α', 'ａ'], e: ['е', '3', 'ｅ'], p: ['р', 'ρ'], y: ['у', 'γ'], h: ['һ', 'ｈ'], Z: ['Ζ', 'Ｚ', '2'], J: ['Ј', 'Ｊ'], n: ['ո', 'ｎ'], r: ['г', 'ｒ'], o: ['о', '0'], E: ['Е', 'Ε', '3'], A: ['А', 'Α'], H: ['Н', 'Η'], Y: ['Υ', 'Ү'], R: ['Ｒ'], P: ['Р', 'Ρ'] };
const alike = (name: string) => [...name].map((ch) => (ALIKE[ch] !== undefined && rnd() < 0.4 ? pick(ALIKE[ch]!) : ch)).join('');
sample('G6', 7000, () => [`${pick(PRE1)}${alike(pick(NAMES1))}${pick(GLUE)}${pick(POST1)}${rnd() < 0.3 ? `${pick(GLUE)}${alike(pick(NAMES1))}${pick(GLUE)}${pick(POST1)}` : ''}`, PZ]);
// One order for every generator, so a stopped run has covered each.
for (let i = jobs.length - 1; i > 0; i -= 1) { const j = Math.floor(rnd() * (i + 1)); [jobs[i], jobs[j]] = [jobs[j]!, jobs[i]!]; }

const PLACEHOLDER = /\[(?:PATIENT_NAME|DATE_OF_BIRTH|MEMBER_ID|SSN|PHONE|CLAIM_\d+)\]/g;
const literal = (text: string) => text.replace(PLACEHOLDER, '');
const subsequence = (small: string, big: string) => { let i = 0; for (let j = 0; j < big.length && i < small.length; j += 1) if (big[j] === small[i]) i += 1; return i === small.length; };
const run = (M: typeof B, text: string, pt: Pt) => { try { const s = M.redactLetterForScreen(text, pt.P, pt.C); return { text: s.text as string, refused: M.holdsIdentifier(s.text, pt.P, pt.C) as boolean, candidates: s.candidates as string[], error: null as string | null }; } catch (error) { return { text: '', refused: true, candidates: [] as string[], error: String(error).slice(0, 200) }; } };
const counts = new Map<string, number>();
const done = new Map<string, number>();
const streams = new Map<string, number>();
const shortest = new Map<string, object[]>();
const hit = (cls: string, gen: string, row: Record<string, unknown>) => {
  counts.set(`${cls}|${gen}`, (counts.get(`${cls}|${gen}`) ?? 0) + 1);
  let fd = streams.get(cls);
  if (fd === undefined) { fd = fs.openSync(`${DIR}/out/${TAG}-${cls}.jsonl`, 'w'); streams.set(cls, fd); }
  fs.writeSync(fd, `${JSON.stringify({ gen, ...row })}\n`);
  const list = shortest.get(cls) ?? []; list.push({ gen, ...row }); list.sort((a, b) => JSON.stringify(a).length - JSON.stringify(b).length); shortest.set(cls, list.slice(0, 4));
};
const t0 = performance.now();
let n = 0;
for (const [gen, text, pt] of jobs) {
  if (ONLY.length > 0 && !ONLY.includes(gen)) continue;
  if (performance.now() - t0 > BUDGET) break;
  n += 1;
  done.set(gen, (done.get(gen) ?? 0) + 1);
  const b = run(B, text, pt);
  const h = run(H, text, pt);
  const row = { t: text, P: pt.P, C: pt.C, base: { refused: b.refused, text: b.text }, head: { refused: h.refused, text: h.text } };
  if (b.error !== null || h.error !== null) { if (b.error !== h.error) hit('error-differs', gen, { ...row, be: b.error, he: h.error }); continue; }
  if (b.refused && !h.refused) { hit('BLOCK-base-refuses-head-sends', gen, row); continue; }
  if (b.refused && h.refused) { if (b.text !== h.text) hit('both-refuse-text-differs', gen, row); continue; }
  const subj = I.__subject(pt.P, pt.C);
  if (!b.refused && h.refused) {
    const applied = h.text !== b.text;
    const sent = h.text;
    const firstHolds = I.__holdsFirst(sent, pt.P, pt.C) as boolean;
    const widerLeft = firstHolds ? -1 : (I.__wider(I.__masked(sent, pt.C.length), subj) as unknown[]).length;
    const lf = sent.replaceAll('\r\n', '\n');
    const crlf = sent.includes('\r\n');
    const firstHoldsLf = crlf ? (I.__holdsFirst(lf, pt.P, pt.C) as boolean) : null;
    const widerLeftLf = crlf && !firstHoldsLf ? (I.__wider(I.__masked(lf, pt.C.length), subj) as unknown[]).length : null;
    const lfLetter = text.includes('\r\n') ? run(H, text.replaceAll('\r\n', '\n'), pt) : null;
    const lfLetterBase = text.includes('\r\n') ? run(B, text.replaceAll('\r\n', '\n'), pt) : null;
    let cls = 'newref-unexplained';
    if (firstHolds) cls = applied ? 'newref-first-check-refuses-wider-redacted-text' : 'newref-first-check-refuses-same-text';
    else if (widerLeft > 0) cls = applied ? 'newref-wider-left-after-wider-applied' : 'newref-wider-left-not-applied';
    else if (crlf) cls = lfLetter !== null && !lfLetter.refused ? (lfLetterBase !== null && !lfLetterBase.refused && lfLetterBase.text === lfLetter.text ? 'newref-crlf-LFwriting-sent-same-as-base' : 'newref-crlf-LFwriting-sent-head-redacts-more') : 'newref-crlf-LFwriting-refused';
    hit(cls, gen, { ...row, applied, firstHolds, widerLeft, firstHoldsLf, widerLeftLf, lfLetter: lfLetter && { refused: lfLetter.refused, text: lfLetter.text }, lfLetterBase: lfLetterBase && { refused: lfLetterBase.refused, text: lfLetterBase.text } });
    continue;
  }
  // Both send.
  const lb = literal(b.text); const lh = literal(h.text);
  if (lh.length > lb.length || !subsequence(lh, lb)) hit('BLOCK-head-shows-what-base-replaced', gen, row);
  const hc = new Set(h.candidates);
  const missing = b.candidates.filter((c) => !hc.has(c));
  if (missing.length > 0) hit('BLOCK-candidate-not-offered', gen, { ...row, missing, bc: b.candidates, hc: h.candidates });
  const bc = new Set(b.candidates);
  const added = h.candidates.filter((c) => !bc.has(c));
  if (added.length > 0) {
    const own = new Set((I.__formsOf(subj) as { kind: string; compact: string }[]).filter((f) => f.kind !== 'name').map((f) => f.compact.toUpperCase()));
    const raw = new Set([...pt.P.memberIds, ...pt.C.flatMap((c) => c.claimNumbers)].map((v) => v.normalize('NFKC').toUpperCase().replace(/[^\p{L}\p{N}]/gu, '')));
    const bad = added.filter((c) => own.has(c.toUpperCase()) || raw.has(c.toUpperCase()));
    hit(bad.length > 0 ? 'SCREEN-own-number-added' : 'screen-added', gen, { ...row, added, bad });
  }
  if (b.text !== h.text) hit('newred', gen, row);
}
for (const fd of streams.values()) fs.closeSync(fd);
console.log(`seed ${SEED}: ${n} of ${jobs.length} letters in ${((performance.now() - t0) / 1000).toFixed(0)} s`);
console.log('done by generator:', JSON.stringify(Object.fromEntries(done)));
for (const [key, count] of [...counts].sort()) console.log(String(count).padStart(7), key);
for (const [cls, list] of shortest) { if (cls === 'newred' || cls === 'screen-added') continue; console.log(`\n== ${cls}`); for (const row of list) console.log(JSON.stringify(row).slice(0, 900)); }
