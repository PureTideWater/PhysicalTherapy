// node main.mts [hand|layouts|fuzz4|delta]: hand letters (A.1-A.4), a label above its number in many layouts (A.3), the second reading under a glued label (A.4), a token-soup delta fuzz with a throw check (B).
import { load, out, rng, pick, int, digits } from './lib.mts';
await load(['head', 'before', 'base', 'vL', 'v1']);
const part = process.argv[2] ?? 'all';
const on = (p: string) => part === 'all' || part === p;
const R = (ch: string, k: number) => ch.repeat(k);
const BX = { h: '\u2500', v: '\u2502', l: '\u251C', r: '\u2524', tl: '\u250C', tr: '\u2510', bl: '\u2514', br: '\u2518', dh: '\u2550', dv: '\u2551', dl: '\u2560', dr: '\u2563' };
const show = (text: string, extra = false) => console.log(`${JSON.stringify(text)}\n     head: ${out('head', text)} | before: ${out('before', text)} | base: ${out('base', text)}${extra ? ` | vL: ${out('vL', text)} | v1: ${out('v1', text)}` : ''}`);
if (on('hand')) {
  console.log('## A.1 month word glued');
  for (const t of ['802-45-678901Jan 2026', 'Ref 802-45-678901Jan 2026', 'Unit 802-45-678915MAR 2000.00', 'Web ID 802-456-78901Sep, 2026', 'Lot 802-45-678901-September., 2026', 'Lot 802-45-678931-September., 2026', 'Lot 802-45-678931-September., 20265', 'Lot 802-45-678901 Jan 2026', 'Lot 802-45-678901Jan 20', 'Lot 802-45-678901May 2026 be denied', 'Fax 110 32.744215Mar 2026', 'Medicare rate 110 32.744201Jan 2026', 'Lot 802-45-678901Mar  2026', 'Lot 802-45-678901Mar,2026.50', 'Lot 802-45-678901Dec 1999 units']) show(t);
  console.log('## A.2 date after a bare run');
  for (const t of ['Seq 12345678901\u204302\u20432026', 'Seq 12345678901/02/2026', 'Seq 12345678901/02/20261234-56', 'Seq 12345678901/02/20261234', 'Seq 12345678901/02/20261234. Paid', 'Seq 12345678901/02/20261234.', 'SSN 12345678901/02/20261234', 'Seen 12345678901-September.-2026123456.78', 'Seq 1234567892026-01-15150.00', 'Seq 1234567892026-01-151234', 'Claim 12345678901/02/20261234-56', 'Claim\n-----\n12345678901/02/20261234-56', 'Seq 12345678901/02/2026150,Paid', 'Seq 12345678901/02/20261234567-01']) show(t);
  console.log('## A.3 label above its number');
  for (const t of ['Claim\n#\n20260112345.01', 'Invoice\n#\n20260112345.01', 'Check\n#\n12345678901234.01', 'Claim\nNo.\n20260112345.01', '| Claim |\n|:------|\n| 20260112345.01 |', '| Claim |\n|:-----:|\n| 20260112345.01 |', '| Claim |\n|-------|\n| 20260112345.01 |',
    `${BX.v} Claim ${BX.v}\n${BX.l}${R(BX.h, 7)}${BX.r}\n${BX.v} 20260112345.01 ${BX.v}`, `Claim\n${R(BX.h, 7)}\n20260112345.01`, `${BX.tl}${R(BX.h, 16)}${BX.tr}\n${BX.v} Claim Number   ${BX.v}\n${BX.l}${R(BX.h, 16)}${BX.r}\n${BX.v} 20260112345.01 ${BX.v}\n${BX.bl}${R(BX.h, 16)}${BX.br}`,
    'ICN\n_ _ _ _ _\n12345678901234.01', 'Claim\n#####\n20260112345.01', 'Member\nID\nNumber\n20260112345.01', 'Invoice\n-------\nNo. 20260112345.01', 'Claim Number: __ 20260112345.01', 'Claim\n\n: 20260112345.01', 'Reference*\n----------\n20260112345.01', 'Ref.\n-----\n20260112345.01', 'Claim:\n.....\n20260112345.01', 'Claim .......... 20260112345.01', 'Claim\n. . . . .\n20260112345.01', '**Claim**\n---------\n20260112345.01', 'Claim (ICN)\n-----------\n20260112345.01', '(Claim)\n-------\n20260112345.01']) show(t);
  console.log('## A.4 glued label');
  for (const t of ['MemberSSN 8 1234567893.1', 'MemberSSN: 150.00 120.00 30.00', 'PatientSSN on file.\nService 01/01/2020-150.00 Paid', 'PatientSSN required.\nTelephone number 8 123456.1', 'Assoc. Sec. Jones 01/15/2026 150.00', 'PatientSSN 150.00\n01/15/2026 97110 2 150.00 120.00 30.00', 'MemberSSN 97110 97140 97530', 'MemberSSN 1 2 3 4 5 6 7 8 9']) show(t, true);
}
if (on('layouts')) {
  const NOUNS = ['Claim Number', 'ICN', 'Reference No.', 'Control Number', 'Invoice No.', 'Check Number', 'Policy Number', 'Member ID', 'Claim', 'Reference', 'Account', 'Invoice', 'Authorization', 'Case', 'Remittance Advice', 'Statement', 'Ref.', 'Acct.'];
  const NOUN3 = ['Member ID Number', 'Policy ID Number', 'Account ID No.', 'Remittance Advice Number', 'Claim ID Number', 'Provider ID Number', 'Subscriber ID No.', 'Payment ID Number'];
  const NUMS = ['20260112345.01', '12345678901234.01', '802-45-678901.50', '12345678901/02/2026'];
  const k = (n: string) => Math.max(5, n.length);
  const tally = (name: string, nouns: string[], f: (n: string, x: string) => string) => {
    let base = 0, head = 0, before = 0, total = 0; let exNew = ''; let exAny = ''; const hit: Record<string, number> = {};
    for (const n of nouns) for (const x of NUMS) {
      const text = f(n, x); total += 1;
      const b = out('base', text); if (b === 'REFUSED') continue; base += 1;
      const h = out('head', text); const bf = out('before', text);
      if (bf !== b) before += 1;
      if (h !== b) { head += 1; hit[n] = (hit[n] ?? 0) + 1; if (exAny === '') exAny = JSON.stringify(text); if (bf === b && exNew === '') exNew = JSON.stringify(text); }
    }
    const which = head === 0 ? '' : Object.keys(hit).length === nouns.length ? 'every label' : Object.keys(hit).join(', ');
    console.log(`${head > before ? 'NEW ' : head < before ? 'BACK' : head > 0 ? 'both' : 'ok  '} ${name}: base sends ${base}/${total}; head refuses ${head}, before ${before}${which ? `; ${which}` : ''}${head > 0 ? `\n       e.g. ${exNew || exAny}` : ''}`.slice(0, 520));
  };
  const LAY: [string, (n: string, x: string) => string][] = [
    ['rule of hyphens under the label (control)', (n, x) => `${n}\n${R('-', k(n))}\n${x}`],
    ['wrapped label, "#" its second line', (n, x) => `${n}\n#\n${x}`],
    ['wrapped label, "#:" its second line', (n, x) => `${n}\n#:\n${x}`],
    ['wrapped label, "No." its second line (control)', (n, x) => `${n}\nNo.\n${x}`],
    ['label, ":" alone on the next line', (n, x) => `${n}\n:\n${x}`],
    ['label, one break, ": number" (control)', (n, x) => `${n}\n: ${x}`],
    ['label, blank line, ": number"', (n, x) => `${n}\n\n: ${x}`],
    ['label, blank line, "#number" (recorded family)', (n, x) => `${n}\n\n#${x}`],
    ['markdown cell |:---| (left)', (n, x) => `| ${n} |\n|:${R('-', k(n) + 1)}|\n| ${x} |`],
    ['markdown cell |:---:| (centred)', (n, x) => `| ${n} |\n|:${R('-', k(n))}:|\n| ${x} |`],
    ['markdown cell |---:| (right)', (n, x) => `| ${n} |\n|${R('-', k(n) + 1)}:|\n| ${x} |`],
    ['markdown cell | --- | (control)', (n, x) => `| ${n} |\n| --- |\n| ${x} |`],
    ['markdown, no outer bars, :---', (n, x) => `${n}\n:---\n${x}`],
    ['rule of #', (n, x) => `${n}\n${R('#', k(n))}\n${x}`],
    ['rule of :', (n, x) => `${n}\n${R(':', k(n))}\n${x}`],
    ['box-drawn cell, bars U+2502', (n, x) => `${BX.v} ${n} ${BX.v}\n${BX.l}${R(BX.h, k(n) + 2)}${BX.r}\n${BX.v} ${x} ${BX.v}`],
    ['box-drawn cell with its top and bottom', (n, x) => `${BX.tl}${R(BX.h, k(n) + 2)}${BX.tr}\n${BX.v} ${n} ${BX.v}\n${BX.l}${R(BX.h, k(n) + 2)}${BX.r}\n${BX.v} ${x} ${BX.v}\n${BX.bl}${R(BX.h, k(n) + 2)}${BX.br}`],
    ['double-line box cell', (n, x) => `${BX.dv} ${n} ${BX.dv}\n${BX.dl}${R(BX.dh, k(n) + 2)}${BX.dr}\n${BX.dv} ${x} ${BX.dv}`],
    ['ASCII bars, box-drawn rule', (n, x) => `| ${n} |\n|${R(BX.h, k(n) + 2)}|\n| ${x} |`],
    ['box-drawn rule alone under the label (control)', (n, x) => `${n}\n${R(BX.h, k(n))}\n${x}`],
    ['spaced underscores _ _ _ under the label', (n, x) => `${n}\n${R('_ ', 6).trim()}\n${x}`],
    ['spaced tildes ~ ~ ~ under the label', (n, x) => `${n}\n${R('~ ', 6).trim()}\n${x}`],
    ['spaced box lines under the label', (n, x) => `${n}\n${R(BX.h + ' ', 6).trim()}\n${x}`],
    ['spaced hyphens - - - under the label (control)', (n, x) => `${n}\n${R('- ', 6).trim()}\n${x}`],
    ['two underscores as the blank, one line', (n, x) => `${n}: __ ${x}`],
    ['spaced underscores as the blank, one line', (n, x) => `${n}: _ _ _ _ ${x}`],
    ['dotted rule under the label (recorded)', (n, x) => `${n}\n${R('.', k(n))}\n${x}`],
    ['colon, then a dotted rule', (n, x) => `${n}:\n${R('.', k(n))}\n${x}`],
    ['dot leader on the label line, number on the next', (n, x) => `${n} ${R('.', 12)}\n${x}`],
    ['rule of two hyphens', (n, x) => `${n}\n--\n${x}`],
    ['heading underlined, then "No. number"', (n, x) => `${n}\n${R('-', k(n))}\nNo. ${x}`],
    ['rule, then ": number"', (n, x) => `${n}\n${R('-', k(n))}\n: ${x}`],
    ['rule -.-.-.', (n, x) => `${n}\n${R('-.', 5)}\n${x}`],
    ['rule +=====+', (n, x) => `${n}\n+${R('=', k(n))}+\n${x}`],
    ['label with a footnote *, rule', (n, x) => `${n}*\n${R('-', k(n))}\n${x}`],
    ['label in parentheses, rule', (n, x) => `(${n})\n${R('-', k(n))}\n${x}`],
    ['bold **label**, rule', (n, x) => `**${n}**\n${R('-', k(n))}\n${x}`],
    ['label, comma, rule', (n, x) => `${n},\n${R('-', k(n))}\n${x}`],
    ['rule of em dashes', (n, x) => `${n}\n${R('\u2014', 5)}\n${x}`],
    ['blank line, no colon (control)', (n, x) => `${n}\n\n${x}`],
    ['first word, blank line, rest of the label with a colon (recorded family)', (n, x) => `${n.split(' ')[0]}\n\n${n.split(' ').slice(1).join(' ') || 'Number'}: ${x}`],
  ];
  for (const [name, f] of LAY) tally(name, NOUNS, f);
  tally('label of three words, one per line', NOUN3, (n, x) => `${n.split(' ').join('\n')}\n${x}`);
  tally('label of three words, two lines (control)', NOUN3, (n, x) => `${n.replace(' ', '\n')}\n${x}`);
  tally('label of three words, one per line, colon', NOUN3, (n, x) => `${n.split(' ').join('\n')}:\n${x}`);
}
const two = (n: number) => String(n).padStart(2, '0');
type Rn = () => number;
const amt = (r: Rn) => `${int(r, 2000)}.${two(int(r, 100))}`;
const date = (r: Rn) => `${two(1 + int(r, 12))}/${two(1 + int(r, 28))}/${2019 + int(r, 8)}`;
const cpt = (r: Rn) => pick(r, ['97110', '97112', '97116', '97140', '97530', '97535', '97161', '97164', 'G0283', '98941']);
if (on('fuzz4')) {
  const TOK = ['PatientSSN', 'MemberSSN', 'SubscriberSSN', 'InsuredSSN', 'PatientSSN:', 'MemberSSN#', 'Assoc. Sec.', 'MemberSSN No.', 'PatientSocSec', 'MemberSoc. Sec. No.', 'PatientHICN', 'MemberSSNs', 'EmployeeSSN', 'noSSN', 'AssocSec', 'PatientS.S.N.'];
  const tokenLine = (r: Rn) => { const T = pick(r, TOK); return pick(r, [
    () => `${T} ${amt(r)} ${amt(r)} ${amt(r)}`, () => `${T}: ${amt(r)}`, () => `${T} ${cpt(r)} ${1 + int(r, 8)} ${amt(r)}`, () => `${T} ${date(r)} ${amt(r)}`, () => `${T} ${1 + int(r, 9)} ${digits(r, 10)}.${int(r, 10)}`,
    () => `${T} on file. Claim ${digits(r, 11)}.${two(int(r, 100))}`, () => `${T} verified ${date(r)}`, () => `${T} ${int(r, 10)} ${int(r, 10)} ${int(r, 10)} ${int(r, 10)}`, () => `${T} ${digits(r, 4)}`, () => `${T} XXX-XX-${digits(r, 4)} ${amt(r)}`,
    () => `${T} ${digits(r, 3)} ${digits(r, 2)}.${digits(r, 4)}`, () => `${T}\n${cpt(r)} ${cpt(r)} ${cpt(r)}`, () => `${T} required. ${date(r)}-${amt(r)} Paid`, () => `${T} ${digits(r, 5)} ${digits(r, 2)} ${amt(r)}`, () => `${T} ${digits(r, 6)}.${digits(r, 1)}`,
    () => `${T} ${digits(r, 2)}-${digits(r, 7)}`, () => `${T} ${digits(r, 3)}-${digits(r, 4)}`, () => `${T} not provided`, () => `${T} ${1 + int(r, 9)}) ${amt(r)} ${amt(r)}`,
  ])(); };
  const poolLine = (r: Rn) => pick(r, [
    () => `${date(r)} ${cpt(r)} ${1 + int(r, 8)} ${amt(r)} ${amt(r)} ${amt(r)}`, () => `Claim Number: ${digits(r, 11)}`, () => `Check ${digits(r, 9)} EFT trace ${digits(r, 15)}`, () => `Springfield, IL 62701-${digits(r, 4, false)}`,
    () => `Paid ${1 + int(r, 9)},${digits(r, 3, false)}.${two(int(r, 100))} on ${date(r)}`, () => 'NPI 1234567893', () => `TIN 12-${digits(r, 7)}`, () => `Total ${amt(r)} ${amt(r)} ${amt(r)}`, () => `CPT ${cpt(r)} ${cpt(r)} ${cpt(r)}`,
    () => `Units ${1 + int(r, 9)} ${1 + int(r, 9)} ${1 + int(r, 9)} ${1 + int(r, 9)}`, () => `Service ${date(r)}-${amt(r)} Paid`, () => `Service ${date(r)}-${date(r)}`, () => `Telephone number ${1 + int(r, 9)} ${digits(r, 6)}.${int(r, 10)}`,
    () => `Questions? Call ${digits(r, 3)}-${digits(r, 4)}`, () => `Deductible ${amt(r)} of ${amt(r)} met`, () => `Rate ${digits(r, 3)} ${digits(r, 2)}.${digits(r, 5)}`, () => `Visits ${int(r, 30)} of ${int(r, 60)} used through ${date(r)}`, () => `Group ${digits(r, 6)} Plan ${digits(r, 4)}`,
    () => `Contact 1: ${amt(r)} ${amt(r)}`, () => `Fax ${1 + int(r, 9)}) ${digits(r, 2)} ${digits(r, 2)} ${digits(r, 2)}`,
  ])();
  for (const seed of [11, 12]) {
    const r = rng(seed); let base = 0, head = 0, before = 0, onlyL = 0, only1 = 0, back = 0; const ex: string[] = [];
    for (let i = 0; i < 3000; i += 1) {
      const lines: string[] = []; const nt = 1 + int(r, 2); const np = 1 + int(r, 3);
      for (let j = 0; j < nt; j += 1) lines.push(tokenLine(r)); for (let j = 0; j < np; j += 1) lines.splice(int(r, lines.length + 1), 0, poolLine(r));
      const text = lines.join(r() < 0.8 ? '\n' : ' ');
      const b = out('base', text); if (b === 'REFUSED') continue; base += 1;
      const h = out('head', text); const bf = out('before', text);
      if (bf !== b) before += 1; if (h === b && bf !== b) back += 1;
      if (h !== b) { head += 1; const l = out('vL', text); if (out('v1', text) === b) only1 += 1; if (l === b) { onlyL += 1; if (ex.length < 8) ex.push(`${JSON.stringify(text)} head ${h}, before ${bf}, base ${b}, vL ${l}`); } }
    }
    console.log(`## FUZZ4 seed ${seed}: 3000 letters, base sends ${base}; head differs ${head}, before differs ${before}; head sends again what before refused ${back}; head differs only by the second reading (v1 agrees with base) ${only1}; only by byLong's second reading (vL agrees with base) ${onlyL}`);
    for (const e of ex) console.log('     ' + e.slice(0, 420));
  }
}
if (on('delta')) {
  const T = ['Claim', 'Claim Number', 'Statement', 'ICN', 'Invoice', 'Account', 'No.', 'Number', 'ID', ':', '#', '\n', '\n', '\n', ' ', ' ', ' ', '-----', '---', '___', '_____', '~~~', '\u2500\u2500\u2500', '|', '| ', ' |', '+', '.', '...', '802-45-678901.50', '20260112345.01', '12345678901234.01', '12345678901', '/02/2026', '-02-2026', '1234-56', '150.00', 'Jan', 'MAR', 'May', ' 2026', ', 2026', ',', 'SSN', 'MemberSSN', 'Phone', 'Medicare', 'on', 'file', 'on file', '\u2043', '\r\n', '1', '2', '01', '(', ')', '*', '=', '_', '~', '\u2502', 'Paid', 'Service 01/01/2020-150.00 Paid', '97110', 'rate 110 32.74420', '802-45-678901', '802-456-78901'];
  for (const seed of [21, 22]) {
    const r = rng(seed); let base = 0, regress = 0, back = 0, thrown = 0, both = 0; const ex: string[] = [];
    for (let i = 0; i < 5000; i += 1) {
      let text = ''; const n = 3 + int(r, 9); for (let j = 0; j < n; j += 1) text += pick(r, T);
      const h = out('head', text); if (h.startsWith('THROW')) { thrown += 1; if (thrown < 4) console.log('THROW', JSON.stringify(text), h); }
      const b = out('base', text); if (b === 'REFUSED') continue; base += 1;
      const bf = out('before', text);
      if (h !== b && bf === b) { regress += 1; ex.push(text); } else if (h === b && bf !== b) back += 1; else if (h !== b) both += 1;
    }
    ex.sort((a, b2) => a.length - b2.length);
    console.log(`## DELTA seed ${seed}: 5000 soups, base sends ${base}; head differs where before agreed ${regress}; head agrees where before differed ${back}; both differ ${both}; throws ${thrown}`);
    for (const e of ex.slice(0, 28)) console.log('     ' + JSON.stringify(e));
  }
}
