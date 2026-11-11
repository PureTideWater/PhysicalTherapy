// node gen.mts <perMode> <seed> [modes]: letters aimed at this round's delta; prints only letters the head sends with the
// planted nine or ten digits in clear (any writing) where before or base refused or redacted them. One example per tag.
import { judge } from './lib.mts';
const [, , nArg, seedArg, modesArg] = process.argv;
const N = Number(nArg ?? 500), seed = Number(seedArg ?? 1), modes = modesArg ?? 'ABCDEFG';
function rng(a: number) { return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const r = rng(seed);
const pick = (a: any[]) => a[Math.floor(r() * a.length)];
const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const sp = (n: number) => ' '.repeat(n);
const ssn = () => '900' + String(int(10, 99)) + String(int(1000, 9999));
const phone = () => '20255501' + String(int(10, 99));
const SSNL = ['SSN', 'Social Security', 'Soc Sec', 'Soc. Sec.', 'SS#', 'S.S.N.', 'HICN', 'Social Security Number', 'SSN No.', 'SS No'];
const PHL = ['Phone', 'Tel', 'Fax', 'Call', 'Cell', 'Mobile', 'Contact', 'TTY', 'Telephone', 'Phone number', 'Phone numbers', 'Fax No.', 'Tel.', 'Phones', 'Calls', 'Toll-free', 'Ph'];
const HELD = 'Service 01/01/2020-150.00 Paid';
const PRE = ['', '', '', 'Re: your account. ', HELD + '\n', HELD + ' ', 'Dear Member,\n', 'Line 1 97110 150.00\n', HELD + '\n\n'];
const TRAIL = ['', '', '', ' Paid 150.00', ' 150.00 30.00', '\nPlease call us.', '.', ' and 150.00', '\n' + HELD, ' units', ', thanks'];
const JOIN = [' ', '-', '.', ' - ', '', '  ', '/', ') ', '–', ' . '];
function cutNatural(full: string, shape: number[], k: number) {
  const out: string[] = []; let at = 0, rem = k;
  for (const len of shape) { const g = full.slice(at, at + len); at += len; if (rem >= g.length) { rem -= g.length; continue; } out.push(g.slice(rem)); rem = 0; }
  return out;
}
function randomCut(d: string) { const out: string[] = []; let at = 0; while (at < d.length) { const len = Math.min(d.length - at, int(1, 5)); out.push(d.slice(at, at + len)); at += len; } return out; }
function modeA() {
  const isSsn = r() < 0.5; const d = isSsn ? ssn() : phone();
  const withOne = !isSsn && r() < 0.2; const full = withOne ? '1' + d : d;
  const k = int(1, 2); const ln = full.slice(0, k); const restDigits = full.slice(k);
  const style = r(); let rest: string;
  if (style < 0.25) rest = restDigits;
  else { const groups = style < 0.75 ? cutNatural(full, withOne ? [1, 3, 3, 4] : isSsn ? [3, 2, 4] : [3, 3, 4], k) : randomCut(restDigits); const j = pick(JOIN); rest = r() < 0.7 ? groups.join(j) : groups.reduce((acc, g, i) => acc + (i ? pick(JOIN) : '') + g, ''); }
  const label = pick(isSsn ? SSNL : PHL);
  const between = pick([' ', ' ', '', '  ', ': ', ' #', ' - ', '\n', ' \n', ':\n', ' No. ', ' number ', ' numbers ', ' Nos. ', ' # ', ' -', ':']);
  const open = pick(['(', '(', '( ', '', '']);
  const suffix = pick(['', '', '', '', 'st', 'nd', 'rd', 'th', 'TH']);
  const close = open !== '' ? pick([')', ')', ' )']) : pick([':', ')', ' :', ' (home):', ' (h))', ' (cell) :']);
  const gap = pick([' ', ' ', '', '  ', '-', '\n', ' - ', '.', ': ']);
  const pre = pick(PRE);
  return { tag: `${isSsn ? 'ssn' : withOne ? 'ph1' : 'ph'}-k${k}-${open ? 'paren' : 'bare'}${suffix ? '-ord' : ''}-close[${close}]${pre.startsWith(HELD) ? '-held' : ''}`, letter: `${pre}${label}${between}${open}${ln}${suffix}${close}${gap}${rest}${pick(TRAIL)}`, needles: [d] };
}
const LOOSE = [' ', ' ', '  ', ' - ', '-', ') ', '.', '. ', ' .', '/', '- ', ' -', '..', ' . '];
function modeB() {
  const isSsn = r() < 0.75; const d = isSsn ? ssn() : phone();
  const [a, b, c] = isSsn ? [d.slice(0, 3), d.slice(3, 5), d.slice(5)] : [d.slice(0, 3), d.slice(3, 6), d.slice(6)];
  let g1 = pick(LOOSE), g2 = pick(LOOSE);
  if (r() < 0.6 && !(g1 + g2).includes('.')) g2 = pick(['.', '. ', ' .']);
  const paren = g1.startsWith(')') ? '(' : '';
  const label = pick(isSsn ? [...SSNL, 'Medicare', 'Medicare ID', 'Medicare No.'] : PHL);
  const sep = pick([' ', ': ', ' # ', '  ', ' No. ', ':', '\n']);
  const tail = pick(['150.00', '78', '1', '150', '01/02/2020', '2020-01-02', '97110', '.50', '150.00-120.00', '01-Jan-2020', '2020', '4.5', '150.00 Paid']);
  const pre = pick(PRE);
  return { tag: `${isSsn ? 'ssn' : 'ph'}-g1[${g1}]-g2[${g2}]${pre.startsWith(HELD) ? '-held' : ''}`, letter: `${pre}${label}${sep}${paren}${a}${g1}${b}${g2}${c}${tail}${pick(TRAIL)}`, needles: [d] };
}
function modeC() {
  const d = phone(); const [a, b, c] = [d.slice(0, 3), d.slice(3, 6), d.slice(6)];
  const pre = pick([HELD + '\n', HELD + ' ', HELD + '\n\n', HELD + '. ', 'DOS 01/01/2020-150.00\n', 'Paid 150.00-01/02/2020 net ', '', 'Dear Member,\n', HELD + '\nLine 1 97110 150.00\n']);
  const word = pick(['', '', 'Line ', 'Ref ', 'at ', 'Claim ', 'Acct ', 'Office ', 'Dept. ', 'Fax ', 'Phone ', 'Call ', 'Section ', 'x', 'No. ']);
  const o = pick(['(', '(', '( ', '(  ']); const cl = pick([')', ')', ' )']);
  const g1 = pick([' ', ' ', '', '  ', '-', ' - ', '.', '\n', ' \n  ', '\t', ' . ']);
  const g2 = pick(['-', '-', ' ', '.', '', '–', ' - ', '\n', '/']);
  const tail = pick(['4', '150', '97110', '150.00', '01/02/2020', '2020', '150,00', '1 97110', '', ' 150.00', 'x12', '01/02', '-150.00', '/3', '12', '1,250.00', '01-Jan-2020', '9']);
  return { tag: `${/2020-150|150\.00-01/.test(pre) ? 'held' : 'plain'}-word[${word.trim()}]-g1[${g1}]-g2[${g2}]-tail[${tail}]`, letter: `${pre}${word}${o}${a}${cl}${g1}${b}${g2}${c}${tail}${pick(TRAIL)}`, needles: [d] };
}
const KEEPN = ['Claim', 'Claims', 'ICN', 'DCN', 'Reference', 'Ref', 'Appeal', 'Case', 'NPI', 'TIN', 'EIN', 'Tax ID', 'Check', 'EFT', 'Trace', 'Control', 'Invoice', 'Authorization', 'Auth', 'ZIP', 'Group'];
const NAMEDN = ['Account', 'Acct', 'Policy', 'Certificate', 'Contract', 'Member', 'Subscriber', 'Ticket', 'File', 'Record', 'Plan', 'Provider', 'MRN', 'Payment', 'Statement', 'Remittance Advice', 'Remittance', 'Notice', 'Letter', 'Document', 'Order', 'Visit', 'Batch', 'Customer', 'Loan'];
const OTHERN = ['Advice', 'on file', 'CPT', 'Code', 'Modifier', 'Rev', 'Administration'];
function modeD() {
  const isSsn = r() < 0.8; const d = isSsn ? ssn() : phone();
  const dashed = isSsn ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  const w = r();
  const [nk, num] = w < 0.5 ? ['dashed', dashed + pick(['150.00', '78', '01/02/2020', '2020-01-02', '4.50', '150.00-120.00'])]
    : w < 0.7 ? ['bare', d + pick(['150.00', '01/02/2020', '2020-01-02', '4.50', '01-Jan-2020'])]
    : w < 0.85 ? ['prefixed', pick(['01-', '4-', '12-', '2026-']) + dashed + pick(['150.00', '78', '.50'])]
    : ['loose', dashed.replace(/-/g, pick([' ', '.', '/'])) + pick(['150.00', '78'])];
  const label = pick([...SSNL, 'PatientSSN', 'Social  Security', 'Medicare', 'Phone', 'Fax']);
  const lk = label === 'Medicare' ? 'medicare' : label === 'Phone' || label === 'Fax' ? 'phone' : 'ssn';
  const fill = pick([' ', ' ', ' ', '  ', '\t', '/', ' / ', ' or ', ', ', ' - ', ': ', ' on file. ', '\n', ' and ']);
  const kind = pick(['keep', 'named', 'named', 'other']);
  const noun = pick(kind === 'keep' ? KEEPN : kind === 'named' ? NAMEDN : OTHERN);
  const conn = pick([' ', ' ', ' No. ', ' Number ', ' Number: ', ' ID ', ' ID: ', ' Code ', ' Code: ', ': ', ' # ', ' #', ' Nos. ', ' Number' + sp(int(6, 40)), ':' + sp(int(6, 40)), sp(int(10, 40)), '\n', ' No.\n', '(s) ', ' Line ', ' is ', ' No.:\n\n', '\n \n']);
  const ck = conn.includes('\n') ? 'break' : /CODE/i.test(conn) ? 'code' : conn.length > 8 ? 'column' : 'short';
  return { tag: `${lk}-fill[${fill.trim() || 'sp'}]-${kind}-conn:${ck}-${nk}`, letter: `${pick(PRE)}${label}${fill}${noun}${conn}${num}${pick(TRAIL)}`, needles: [d] };
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function modeE() {
  const isSsn = r() < 0.5; const d = isSsn ? ssn() : phone();
  const y = int(2019, 2026), m = int(1, 12), day = int(1, 28);
  const z = (n: number) => String(n).padStart(2, '0'); const j = pick(['/', '-', '.', '–', '·', '_', '|', ' ']);
  const mm = pick([z(m), String(m)]), dd = pick([z(day), String(day)]);
  const forms = [`${mm}${j}${dd}${j}${y}`, `${y}${j}${mm}${j}${dd}`, `${dd}${j}${MON[m - 1]}${j}${y}`, `${dd}${MON[m - 1]}${y}`, `${dd} ${MON[m - 1]} ${y}`, `${y}${z(m)}${z(day)}`, `${mm}${j}${dd}${j}${String(y).slice(2)}`, `${MON[m - 1]} ${dd}, ${y}`, `${mm}${j}${y}`, `${y}${j}${mm}`];
  const fi = int(0, forms.length - 1);
  const word = pick(['', 'Seen ', 'On ', 'DOB ', 'SSN: ', 'Phone ', 'ID ', 'Paid ', 'Service ', 'Claim ', 'Account ', 'Ref ']);
  const after = pick(['', '', ' Paid', '150.00', ' 150.00', '.', ',', ' and', '\n', '-150.00', 'x']);
  return { tag: `${isSsn ? 'nine' : 'ten'}-form${fi}-mm${mm.length}dd${dd.length}-j[${j}]-after[${after.trim()}]`, letter: `${pick(PRE)}${word}${d}${forms[fi]}${after}`, needles: [d] };
}
function modeF() {
  const pre = pick(['', '', HELD + '\n', HELD + ' ', 'Dear Member,\n']);
  const lead = pick(['Paid ', 'Acct ', 'CPT ', 'DOS ', 'Total ', 'SSN ', 'Units ', '']);
  const tok = pick(['97110', '150.00', '$150', '$1,250', '$ 150', '2020-01-02', '01/02/2020', '01/02/20', '2020', '4', '12', '123', 'Paid', 'Pd.', 'x', '150.0', '1/2/2020', '2020-1-2', '1,250', '150,00', '€150', '2020/01/02', '01.02.2020', 'Jan 2, 2020', '99', 'Max', 'Fax']);
  const mask = pick(['XXX-XX-', '***-**-', '___-__-', 'XXXXX', '*****', '_____', 'XXX XX ', 'XXX.XX.', '###-##-', '•••-••-', 'xxx-xx-', 'XXX-XX-\n', 'XXX - XX - ', 'XXX-XX', 'XXX–XX–', '●●●-●●-', 'XXX_XX_', '#####']);
  return { tag: `${pre.startsWith(HELD) ? 'held' : 'plain'}-tok[${tok}]-mask[${mask}]`, letter: `${pre}${lead}${tok}${mask}3456${pick(['', ' Paid 150.00', '.', '1', '\n', ' on file'])}`, needles: [] as string[] };
}
function modeG() {
  const isSsn = r() < 0.5; const d = isSsn ? ssn() : phone();
  const [a, b, c] = isSsn ? [d.slice(0, 3), d.slice(3, 5), d.slice(5)] : [d.slice(0, 3), d.slice(3, 6), d.slice(6)];
  const [tag, w] = pick([['dashed', `${a}-${b}-${c}`], ['dashed+cents', `${a}-${b}-${c}150.00`], ['spaced', `${a} ${b} ${c}`], ['sp.pt', `${a} ${b}.${c}`], ['pt.sp', `${a}.${b} ${c}`], ['bare', d], ['bare+date', `${d}01/02/2020`], ['bare+ydate1', `${d}2020-1-2`],
    ['paren', `(${a}) ${b}-${c}`], ['paren+digit', `(${a}) ${b}-${c}4`], ['paren+cents', `(${a}) ${b}-${c}150.00`], ['ln2', `(${d.slice(0, 2)}) ${d.slice(2, 6)} ${d.slice(6)}`], ['ln1', `${d.slice(0, 1)}) ${d.slice(1, 5)} ${d.slice(5)}`], ['ln2c', `${d.slice(0, 2)}: ${d.slice(2)}`], ['sp.pt+cents', `${a} ${b}.${c}150.00`], ['dashed+2', `${a}-${b}-${c}78`], ['year+dashed', `01/02/2020${a}-${b}-${c}`]]);
  const POOL = ['SSN', 'Phone', 'Fax', 'Tel', 'Call', 'Medicare', 'Social Security', 'Contact', 'HICN', 'Claim', 'Account', 'Member ID', 'Ref', 'on file', 'Policy No.', 'Statement', 'Remittance Advice', 'Code', 'CPT', '(2)', '2)', '1:', '(1st)', '( 3 )', '2nd:', '3 (home):', ':', '.', ',', '-', '#', '(', ')', '/', '150.00', '30.00', '97110', '01/02/2020', '2020-01-02', '$45', '2020', '12', '4', '711', '1,250.00', 'Jan 2, 2020', '01/01/2020-150.00', 'XXX-XX-3456', 'Paid', 'Service', 'Line', 'units', 'is', 'and', 'or', 'Dear Member', 'call us', 'No.', 'Number', 'ID'];
  const n = int(2, 8); const at = int(0, n); let letter = '';
  for (let i = 0; i <= n; i += 1) letter += (i === 0 ? '' : pick([' ', ' ', ' ', ' ', '', '\n', '  '])) + (i === at ? w : pick(POOL));
  return { tag, letter, needles: [d] };
}
const GEN: Record<string, () => { tag: string; letter: string; needles: string[] }> = { A: modeA, B: modeB, C: modeC, D: modeD, E: modeE, F: modeF, G: modeG };
const found = new Map<string, { count: number; letter: string; line: string }>();
const totals: Record<string, number> = {};
const started = Date.now(); let letters = 0;
for (const m of modes) {
  const n = m === 'G' ? N * 2 : N;
  for (let i = 0; i < n; i += 1) {
    const g = GEN[m]!(); letters += 1;
    const j = judge(g.letter, g.needles);
    let sev = j.sev;
    if (sev === '' && (j.notes.includes('base-refused') || j.notes.includes('more-digits-than-base'))) sev = g.needles.length ? 'base-stricter,number-not-whole-in-clear' : 'BLOCKING?';
    if (sev === '' && g.needles.length === 0 && (j.notes.includes('before-refused') || j.notes.includes('more-digits-than-before'))) sev = 'MAJOR?';
    if (sev === '') continue;
    totals[`${m}|${sev}`] = (totals[`${m}|${sev}`] ?? 0) + 1;
    const key = `${m}|${sev}|${g.tag}`; const cur = found.get(key);
    if (!cur) found.set(key, { count: 1, letter: g.letter, line: j.line });
    else { cur.count += 1; if (g.letter.length < cur.letter.length) { cur.letter = g.letter; cur.line = j.line; } }
  }
}
console.log(`seed ${seed}, ${letters} letters, ${((Date.now() - started) / 1000).toFixed(1)} s; flagged per mode|severity:`, JSON.stringify(totals));
const cap = Number(process.env.CAP ?? 8);
for (const group of Object.keys(totals).sort()) {
  const rows = [...found.entries()].filter(([k]) => k.startsWith(group + '|')).sort((x, y) => y[1].count - x[1].count);
  console.log(`== ${group}: ${rows.length} tags`);
  if (process.env.TAGS) console.log('  ' + rows.map(([k, v]) => `(${v.count}) ${k.slice(group.length + 1)}`).join('; ').slice(0, Number(process.env.TAGS)));
  else for (const [k, v] of rows.slice(0, cap)) console.log(`  (${v.count}) ${k.slice(group.length + 1)}\n    ${v.line}`);
}
