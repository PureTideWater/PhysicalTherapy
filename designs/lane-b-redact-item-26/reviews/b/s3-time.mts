// Review B, script 3: time of redactLetterForScreen + holdsIdentifier, head against base on the same letter, back to back
// in one process, three times each, the median taken; each shape at growing lengths up to 100,000 characters.
//   node s3-time.mts [shape,shape...]     Synthetic text only. Lines are appended to out/s3-time.tsv as they are measured.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const DIR = '/home/user/ops/designs/lane-b-redact-item-26/reviews/b';
const B = await import(pathToFileURL('/home/user/rev/base/redact.ts').href);
const H = await import(pathToFileURL('/home/user/rev/head/redact.ts').href);
const ONLY = (process.argv[2] ?? '').split(',').filter(Boolean);
const DEADLINE = Number(process.env.BUDGET_S ?? 430) * 1000;
const SIZES = (process.env.SIZES ?? '12500,25000,50000,100000').split(',').map(Number);
const REPS = Number(process.env.REPS ?? 3);
const OUT = `${DIR}/out/${process.env.TAG ?? 's3'}-time.tsv`;
fs.mkdirSync(`${DIR}/out`, { recursive: true });
interface Pt { P: { pseudonym: string; names: string[]; datesOfBirth: string[]; memberIds: string[] }; C: { claimId: string; patientPseudonym: string; claimNumbers: string[] }[] }
const mk = (names: string[], memberIds = ['SYNMEMBER0042'], claims: string[][] = [['SYNCLAIM0001']]): Pt => ({ P: { pseudonym: 'synthetic-patient-1', names, datesOfBirth: ['1980-03-14'], memberIds }, C: claims.map((claimNumbers, i) => ({ claimId: `synthetic-claim-${i + 1}`, patientPseudonym: 'synthetic-patient-1', claimNumbers })) });
const PZ = mk(['JANE Q ZEPHYRA']);
const fill = (unit: string, length: number) => unit.repeat(Math.ceil(length / unit.length)).slice(0, length);
// Ordinary prose: the repository's synthetic fixtures (.txt, .md), joined.
let prose = '';
const walk = (dir: string) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (/\.(txt|md)$/.test(e.name) && fs.statSync(p).size < 400_000) prose += `${fs.readFileSync(p, 'utf8')}\n\n`; } };
walk('/home/user/PhysicalTherapy/fixtures/synthetic');
const WORDY = ['INA', 'ASA', 'ISA', 'TOBE', 'BEA', 'ORA', 'TOAN', 'HASAN', 'BEAN', 'ASIF', 'THEA', 'IDA', 'MARCHAND', 'NORA', 'ANA', 'ONA', 'ATA', 'MAYA', 'FORAN', 'ORIN', 'INAN', 'ANDRE', 'ANDI', 'THEIN', 'NOTO'];
const MANY = mk(WORDY.map((w, i) => `${w} ${String.fromCharCode(65 + (i % 26))} VANTREE`), ['ZZ12345/01', 'W1234.56789', '123456789*01'], Array.from({ length: 30 }, (_, i) => [`${1000 + i * 37}.${10 + i}`, `26-${String(3000 + i)}/7`]));
const SHAPES: Record<string, [Pt, (n: number) => string]> = {
  'in-a x N (patient INA Q VANTREE)': [mk(['INA Q VANTREE']), (n) => fill('paid in a lump sum. ', n)],
  'in a\\n x N (patient INA)': [mk(['INA']), (n) => fill('in a\n', n)],
  'in a\\r\\n x N (patient INA)': [mk(['INA']), (n) => fill('in a\r\n', n)],
  'Z e p h y r a x N': [PZ, (n) => fill('Z e p h y r a was seen. ', n)],
  'Zephy ra\\r\\n x N': [PZ, (n) => fill('Dear Zephy ra, your visit was denied.\r\n', n)],
  'J. Zephy ra, Q. x N (initials beside wider names)': [PZ, (n) => fill('J. Zephy ra, Q. ', n)],
  'Q Q Q ... then Zephy ra (initials)': [PZ, (n) => `${fill('Q J ', n - 20)} Zephy ra Q J Q`],
  'near miss Z e p h y r x N': [PZ, (n) => fill('Z e p h y r ', n)],
  'Z + spaces + periods run': [PZ, (n) => fill(`Z${' .'.repeat(200)} `, n)],
  'i n i n i n (patient INA)': [mk(['INA']), (n) => fill('i n ', n)],
  'look-alike Zephy ra x N (Cyrillic e, a; Greek Z)': [PZ, (n) => fill('Ζеphy rа was seen. ', n)],
  'look-alike in a x N (patient INA; Cyrillic a)': [mk(['INA Q VANTREE']), (n) => fill('paid in а lump sum. ', n)],
  'prose, 25 word-names, 60 claim numbers with stored separators, LF': [MANY, (n) => fill(prose, n)],
  'prose, 25 word-names, 60 claim numbers with stored separators, CR LF': [MANY, (n) => fill(prose.replace(/\r?\n/g, '\r\n'), n)],
  'prose, ordinary patient, LF': [PZ, (n) => fill(prose, n)],
  'prose, ordinary patient, CR LF': [PZ, (n) => fill(prose.replace(/\r?\n/g, '\r\n'), n)],
  'amounts 1034.10 1071.11 ... (stored separators, 60 claims)': [MANY, (n) => fill(Array.from({ length: 30 }, (_, i) => `${1000 + i * 37}.${10 + i} 26-${3000 + i}/7 `).join(''), n)],
  'amounts near miss 1000.1 x N (stored separators)': [MANY, (n) => fill('1000.1 1000. 1 ZZ12345/0 W1234.5678 ', n)],
  'a n a d a single letters (patient ANA ADA ALA AVA)': [mk(['ANA ADA', 'ALA AVA']), (n) => fill('a n a d a l a v a ', n)],
  'name parts apart with dates: Zephy ra 03/14/2026 x N': [PZ, (n) => fill('Zephy ra 03/14/2026 $150.00 97110\n', n)],
};
// Second round (TAG=s3b): the CR LF shapes against their LF writing, and ordinary prose for subjects of growing size.
const subject = (names: number, claims: number, stored: boolean) => mk(WORDY.concat(WORDY.map((w) => `${w}SON`)).slice(0, names).map((w, i) => `${w} ${String.fromCharCode(65 + (i % 26))} VANTREE`), stored ? ['ZZ12345/01', 'W1234.56789'] : ['ZZ1234501', 'W123456789'], Array.from({ length: claims }, (_, i) => (stored ? [`${1000 + i * 37}.${10 + i}`, `26-${String(3000 + i)}/7`] : [`${1000 + i * 37}${10 + i}`, `26-${String(3000 + i)}7`])));
Object.assign(SHAPES, {
  'R2 Dear Zephy ra line, CR LF': [PZ, (n: number) => fill('Dear Zephy ra, your visit was denied.\r\n', n)],
  'R2 Dear Zephy ra line, LF': [PZ, (n: number) => fill('Dear Zephy ra, your visit was denied.\n', n)],
  'R2 Dear Zephyra line (no wider match), CR LF': [PZ, (n: number) => fill('Dear Zephyra, your visit was denied.\r\n', n)],
  'R2 Dear Vantree line (no match at all), CR LF': [PZ, (n: number) => fill('Dear Vantree, your visit was denied.\r\n', n)],
  'R2 Zephy ra only, CR LF': [PZ, (n: number) => fill('Zephy ra\r\n', n)],
  'R2 Zephy ra only, LF': [PZ, (n: number) => fill('Zephy ra\n', n)],
  'R2 prose LF, subject 3 names 4 claims (8 numbers), no stored separators': [subject(3, 4, false), (n: number) => fill(prose, n)],
  'R2 prose LF, subject 3 names 4 claims (8 numbers), stored separators': [subject(3, 4, true), (n: number) => fill(prose, n)],
  'R2 prose CR LF, subject 3 names 4 claims (8 numbers), stored separators': [subject(3, 4, true), (n: number) => fill(prose.replace(/\r?\n/g, '\r\n'), n)],
  'R2 prose LF, subject 10 names 12 claims (24 numbers), stored separators': [subject(10, 12, true), (n: number) => fill(prose, n)],
  'R2 prose CR LF, subject 10 names 12 claims (24 numbers), stored separators': [subject(10, 12, true), (n: number) => fill(prose.replace(/\r?\n/g, '\r\n'), n)],
  'R2 prose CR LF, subject 50 names 60 claims (120 numbers), stored separators': [subject(50, 60, true), (n: number) => fill(prose.replace(/\r?\n/g, '\r\n'), n)],
  'R2 prose CR LF, subject 50 names 60 claims (120 numbers), no stored separators': [subject(50, 60, false), (n: number) => fill(prose.replace(/\r?\n/g, '\r\n'), n)],
});
const once = (M: typeof B, text: string, pt: Pt) => { const t = performance.now(); const s = M.redactLetterForScreen(text, pt.P, pt.C); const refused = M.holdsIdentifier(s.text, pt.P, pt.C); return { ms: performance.now() - t, refused, replaced: s.replaced as number }; };
const median = (list: number[]) => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)]!;
const start = performance.now();
fs.appendFileSync(OUT, `# ${new Date().toISOString()} sizes ${SIZES.join(',')} reps ${REPS}\nshape\tlength\tbase ms (median)\thead ms (median)\thead/base\tbase refused\thead refused\tbase replaced\thead replaced\n`);
for (const [name, [pt, make]] of Object.entries(SHAPES)) {
  if (ONLY.length > 0 && !ONLY.some((o) => name.includes(o))) continue;
  let previous: { n: number; h: number; b: number } | null = null;
  for (const n of SIZES) {
    if (performance.now() - start > DEADLINE) { console.log(`${name}\t${n}\tnot measured (the run's time was up)`); continue; }
    if (previous !== null && Math.max(previous.h, previous.b) * (n / previous.n) ** 2 * 2 * REPS > 150_000) { console.log(`${name}\t${n}\tnot measured (the length before took ${previous.h.toFixed(0)} ms on the head, ${previous.b.toFixed(0)} ms on the base)`); continue; }
    const text = make(n);
    const bs: number[] = []; const hs: number[] = []; let b = once(B, text.slice(0, 2000), pt); let h = once(H, text.slice(0, 2000), pt);
    for (let rep = 0; rep < REPS; rep += 1) { b = once(B, text, pt); bs.push(b.ms); h = once(H, text, pt); hs.push(h.ms); }
    const line = `${name}\t${text.length}\t${median(bs).toFixed(0)}\t${median(hs).toFixed(0)}\t${(median(hs) / median(bs)).toFixed(2)}\t${b.refused}\t${h.refused}\t${b.replaced}\t${h.replaced}`;
    console.log(line); fs.appendFileSync(OUT, `${line}\n`);
    previous = { n, h: median(hs), b: median(bs) };
  }
}
console.log(`total ${((performance.now() - start) / 1000).toFixed(0)} s`);
