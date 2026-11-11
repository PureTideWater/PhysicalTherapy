// node gen.mts <A|H1|B|C> <seed> <letters> [seconds]: one generator per hunk of the round-K delta; every letter on head, before, base.
// Prints flips by signature (count and three examples). A: hunk 2 (line breaks in a label and after it). H1: hunk 1 (connectors).
// B: hunk 3 (the date glued after a number, its year, what follows the year). C: hunk 4 (the label right before a number).
import { load, outcome, show, worse, rng, pick, HELD, J, stay, type Out } from './lib.mts';
const [H, P, B] = await Promise.all(['head', 'before', 'base'].map(load));
const mode = process.argv[2] ?? 'A';
const seed = Number(process.argv[3] ?? 1);
const N = Number(process.argv[4] ?? 20000);
const SECS = Number(process.argv[5] ?? 150);
const r = rng(seed);
const BRK = /\r\n|[\n\r\f\v\u0085\u2028\u2029]/g;
const vb = (s: string) => (s.match(BRK) ?? []).length;
const sigs = new Map<string, { n: number; ex: string[] }>();
const note = (sig: string, text: string, h: Out, p: Out, b: Out, extra = '') => {
  const e = sigs.get(sig) ?? { n: 0, ex: [] };
  e.n += 1;
  if (e.ex.length < 3) e.ex.push(`${J(text)} :: H ${show(h, text)} | P ${show(p, text)} | B ${show(b, text)}${extra}`);
  sigs.set(sig, e);
};
const same = (o: Out, t: string) => !o.refused && o.text === t;
const three = (text: string): [Out, Out, Out] => [outcome(H, text), outcome(P, text), outcome(B, text)];
const RS = (o: Out) => (o.refused ? 'R' : 'S');
let count = 0;
const t0 = Date.now();
const go = () => count < N && Date.now() - t0 < SECS * 1000;
const NOUNS = ['Claim', 'STATEMENT', 'Reference', 'Member', 'Account', 'Remittance Advice', 'ICN', 'Invoice', 'Provider', 'Policy', 'File', 'Check', 'Group', 'Notice', 'Plan', 'Letter', 'Record', 'Tax ID', 'Pre-Auth', 'Claim Number', 'Member ID', 'Remittance\nAdvice', 'Remit  Advice'];
const ASK = ['900-12-3456150.00', '202-555-0123150.00', '20260112345.01', '802-45-678901.50', '90012345601/02/2020', '12345678901234.01'];
const PRE = ['', '', '', 'Dear Provider,\n', HELD, 'Phone ', 'SSN ', 'Medicare ', 'Fax: ', 'Paid on 01/15/2026.\n', 'SSN on file. ', 'Phone\n', 'Social Security\n'];
const PLAIN = new Set(['', 'Dear Provider,\n', 'Paid on 01/15/2026.\n']);

if (mode === 'A') {
  const WORDS = ['', '', 'No.', 'Number', 'ID', 'Number:', '#', 'No', 'is', 'Line', 'Code', 'ID No.', 'NBR'];
  const B1 = [...[0x200b, 0xfeff, 0xad, 0x2060, 0x200d, 0x34f, 0x200e, 0xfe0f, 0x301].map((z) => '\r' + String.fromCharCode(z) + '\n'), '\n', '\r\n', '\r', '\n\r', '\r\r\n', '\f', '\v', '\u0085', '\u2028', '\u2029', '\n', '\r\n', '\r\n'];
  const BL = ['', '', ' ', '\t', ' ', '​', '﻿', '  '];
  const MK = ['', '', '', ':', '#', '.', '-', '|', '│', '___', '~~~', ',', '*', '=', '(', ')', '/', '"', "'"];
  const sep = (): string => {
    const k = pick(r, [0, 1, 1, 1, 2, 2, 3]);
    let s = pick(r, BL) + pick(r, MK) + pick(r, BL);
    for (let i = 0; i < k; i += 1) s += pick(r, B1) + pick(r, BL) + (r() < 0.3 ? pick(r, MK) : '') + (r() < 0.2 ? pick(r, BL) : '');
    return s;
  };
  const NUMS = [...ASK, '900-12-345678', '202-555-01234567', '(202) 555-0123150.00', '900 12 3456150.00'];
  while (go()) {
    const noun = pick(r, NOUNS);
    const word = pick(r, WORDS);
    const s1 = sep();
    const s2 = word === '' ? '' : sep();
    const num = pick(r, NUMS);
    const pre = pick(r, PRE);
    const mid = `${noun}${s1}${word}${s2}`;
    const text = `${pre}${mid}${num}${pick(r, ['', '', ' Paid', '\nThank you.', ' 150.00'])}`;
    const tail = (/[^\p{L}\p{N}]*$/u.exec(mid) as RegExpExecArray)[0];
    const label = mid.slice(0, mid.length - tail.length);
    const [vL, vT] = [vb(label), vb(tail)];
    const [h, p, b] = three(text);
    count += 1;
    const [wb, wp] = [worse(h, b), worse(h, p)];
    if (wb) note(`BLOCK-${wb}`, text, h, p, b);
    if (wp) {
      const pn = outcome(P, text.replace(/\r\n/g, '\n'));
      note(`PHI-${wp} crlfInLabel=${/\r\n/.test(label)} beforeSendsItsLFwriting=${!pn.refused} vL=${vL} vT=${vT}`, text, h, p, b);
    }
    if (stay(h, p, b)) note(`STAY vL${vL > 1 ? '>1' : '<=1'} vT${vT > 1 ? '>1' : '<=1'}`, text, h, p, b);
    const tn = text.replace(BRK, '\n');
    if (tn !== text) {
      const hn = outcome(H, tn);
      if (hn.refused !== h.refused) {
        const [pn, bn] = [outcome(P, tn), outcome(B, tn)];
        const odd = [...new Set(text.match(/[\r\f\v\u0085\u2028\u2029]/g) ?? [])].map((c) => (c.codePointAt(0) as number).toString(16)).sort().join(',');
        note(`META head ${RS(h)}, its LF writing ${RS(hn)} | before ${RS(p)},${RS(pn)} | base ${RS(b)},${RS(bn)} | breaks ${odd}`, text, h, p, b);
      }
    }
    if (PLAIN.has(pre) && ASK.includes(num)) {
      const exp = vL <= 1 && vT <= 1;
      if (exp === h.refused) note(`ORACLE the rule says ${exp ? 'named' : 'not named'} (vL=${vL} vT=${vT}), head ${RS(h)}, before ${RS(p)}, base ${RS(b)} num=${num.length > 16 ? 'bare+date' : num}`, text, h, p, b);
    }
  }
} else if (mode === 'H1') {
  const TOK = [' ', ' ', ' ', ':', '#', '.', '-', '+', '+', '_', '__', '___', '____', '~', '~~', '~~~', '=', '|', '│', '─', '(S)', ' No. ', ' ID ', '\n', '*', '/', ',', '+-', '-+', '=+', '(', ')', '_~_', '\t', ' is ', '"', '__ ', '_ _', '~~~~~_', '(s', 'S)'];
  while (go()) {
    const k = 1 + Math.floor(r() * 6);
    const conn = Array.from({ length: k }, () => pick(r, TOK)).join('');
    const text = `${pick(r, PRE)}${pick(r, NOUNS)}${conn}${pick(r, ASK)}${pick(r, ['', ' Paid'])}`;
    const [h, p, b] = three(text);
    count += 1;
    const [wb, wp] = [worse(h, b), worse(h, p)];
    const cls = `plus=${conn.includes('+')} shortRun=${/(?<![_~])[_~]{1,2}(?![_~])/.test(conn)} breaks>1=${vb(conn) > 1}`;
    if (wb) note(`BLOCK-${wb} ${cls}`, text, h, p, b);
    if (wp) note(`PHI-${wp} ${cls}`, text, h, p, b);
    if (stay(h, p, b)) note(`STAY ${cls}`, text, h, p, b);
    else if (!p.refused && h.refused) note(`newR(not-stay) ${cls}`, text, h, p, b);
  }
} else if (mode === 'B') {
  const SHAPES = [['', '900-12-3456'], ['', '202-555-0123'], ['', '(202) 555-0123'], ['SSN ', '900 12 3456'], ['SSN: ', '900.12 3456'], ['Tel ', '250.75 1234'], ['Phone ', '202 555 0123'], ['', '900123456'], ['Seq ', '900123456'], ['SSN: ', '900123456'], ['', '2025550123'], ['Row ', '366-535-1693'], ['Unit ', '398-272-1239'], ['Claim ', '900-12-3456'], ['Medicare rate ', '110 32.7442'], ['Seq ', '123456789'], ['On ', '1234567890'], ['Member SSN ', '900.12 3456'], ['Fax ', '202.555.0123'], ['Ref ', '900123456']] as const;
  const DAY = ['01', '1', '5', '12', '15', '28', '31', '05', '3'];
  const J1 = ['', '', '', '-', '/', '.', '–', ' '];
  const MONTHS = ['Jan', 'JAN', 'January', 'Feb', 'Mar', 'March', 'Apr', 'May', 'MAY', 'Jun', 'June', 'Jul', 'July', 'Aug', 'August', 'Sep', 'Sept', 'September', 'SEPTEMBER', 'September', 'Oct', 'October', 'Nov', 'November', 'Dec', 'December', 'February'];
  const SEP2 = ['', ' ', ' ', ',', ', ', ', ', '-', '/', '.', ' ,', '  ', ',,', '- ', ' -', '. ', '–', '-,', '/ '];
  const YEAR = ['2020', '2000', '2026', '1999', '1980', '2021', '20', '26', '99'];
  const AFTER = ['', '', '.00', '.00', '.5', '.125', ',150.00', ',00', ',1 unit', '1234', '.00.', '.00 paid', ' paid', '.12.31', '.00-120.00', '.001', '0', '.0', '.00/3', ',2022', ' 150.00', '.50', '.00\n', ', 2021', ',2021,2022', '.75%', '.00)', ':30', '-01', '/3', '.00USD', '.00,', ',', '.', ' units', '.5 units', ',5', '.10:30', '.00 ', '.99\n', '.00 ', '.001234', '150.00', '1,250.00', '01/31/2020'];
  const cls = (a: string) => (/^,[0-9]/.test(a) ? 'comma+digit' : /^\.[0-9](?![0-9])/.test(a) ? 'point+1' : /^\.[0-9]{3}/.test(a) ? 'point+3' : /^\.[0-9]{2}(?![0-9])/.test(a) ? 'cents' : /^[0-9]/.test(a) ? 'digits' : 'other');
  while (go()) {
    const [lab, shape] = pick(r, SHAPES);
    const date = `${pick(r, DAY)}${pick(r, J1)}${pick(r, MONTHS)}${pick(r, ['', '', '.'])}${pick(r, SEP2)}${pick(r, YEAR)}`;
    const after = pick(r, AFTER);
    const text = `${pick(r, ['', '', HELD, 'Dear Provider,\n'])}${lab}${shape}${date}${after}`;
    const [h, p, b] = three(text);
    count += 1;
    const [wb, wp] = [worse(h, b), worse(h, p)];
    const c = `dateLen=${date.length >= 19 ? date.length : '<19'} after=${cls(after)}`;
    if (wb) note(`BLOCK-${wb} ${c}`, text, h, p, b);
    if (wp) note(`PHI-${wp} ${c}`, text, h, p, b);
    if (stay(h, p, b)) note(`STAY ${c}`, text, h, p, b);
    else if (!p.refused && h.refused) note(`newR(not-stay: base refuses or changes) ${c}`, text, h, p, b);
  }
} else if (mode === 'C') {
  const LABELS = ['Phone', 'Fax', 'Tel', 'Tel.', 'Telephone', 'Medicare', 'SSN', 'Contact', 'Call', 'TTY', 'Cell', 'Mobile', 'Toll-free', 'Ph', 'Ph.', 'HICN', 'Soc. Sec.', 'Social Security', 'Phones', 'Fax/Phone', 'Member Services Phone'];
  const NW = ['No.', 'No', 'Number', 'Numbers', 'Nos.', 'NBR', 'Num', 'ID', 'ID.', 'Num.'];
  const SIGN = [':', '#', '-', '–', '−', ':', '#'];
  const bl = () => pick(r, ['', ' ', ' ', ' ', '  ', '\t']);
  const NUMC = ['900 77.3283150.00', '900 12.3456150.00', '917 16.2677535.06', '250 75.123456', '110 32.74420', '250 75.12345 units', '110 32.744201', '302 45.67890', '120 00.12345', '250-75 .123456', '110 32. 74420', '110 - 32.74420'];
  const PHI = new Set(NUMC.slice(0, 3));
  const OTHER = ['', '', '', '', '', '', ' rate', ' Billing', ' us at', ' fee', ' allowed', ' Part B', ' code', ' line', ' is', ' (cell)', ' ext'];
  while (go()) {
    const label = pick(r, LABELS);
    const nws = pick(r, [0, 0, 1, 1, 2, 2, 3]);
    const sg = pick(r, [0, 1, 1, 2, 2, 3]);
    let mid = label;
    for (let i = 0; i < nws; i += 1) mid += pick(r, [' ', ' ', '  ', '\t']) + pick(r, NW);
    const other = pick(r, OTHER);
    mid += other;
    let signs = '';
    let adjacent = true;
    for (let i = 0; i < sg; i += 1) {
      if (i > 0 && r() < 0.25) { signs += ' '; adjacent = false; }
      signs += pick(r, SIGN);
    }
    const [b1, b2] = [bl(), bl()];
    const brk = r() < 0.15 ? pick(r, ['\n', '\r\n', '\r']) + pick(r, ['', ' ', '  ']) : '';
    const paren = r() < 0.1;
    const num = pick(r, NUMC);
    const text = `${pick(r, ['', '', 'Dear Provider,\n', HELD, 'Questions? '])}${mid}${b1}${signs}${b2}${brk}${paren ? '(' : ''}${paren ? num.replace(' ', ') ') : num}${pick(r, ['', ' Paid', '\n'])}`;
    const [h, p, bb] = three(text);
    count += 1;
    const [wb, wp] = [worse(h, bb), worse(h, p)];
    const c = `otherWord=${other !== ''} numberWords=${nws} signs=${sg}${adjacent ? '' : '(apart)'}`;
    if (wb) note(`BLOCK-${wb} ${c}`, text, h, p, bb);
    if (wp) note(`PHI-${wp} ${c}`, text, h, p, bb);
    if (stay(h, p, bb)) note(`STAY ${c}`, text, h, p, bb);
    if (PHI.has(num) && other === '' && nws <= 2 && sg <= 2 && adjacent && !h.refused && b2.length + (brk ? 0 : 0) <= 2 && b1.length <= 2) note(`UNREAD(label right before, head sends) numberWords=${nws} signs=${sg} break=${brk !== ''} paren=${paren} before=${RS(p)}`, text, h, p, bb);
  }
}
console.log(`# ${mode} seed ${seed}: ${count} letters in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
for (const [sig, e] of [...sigs.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
  console.log(`\n## ${sig}: ${e.n}`);
  for (const x of e.ex) console.log(`   ${x}`);
}
