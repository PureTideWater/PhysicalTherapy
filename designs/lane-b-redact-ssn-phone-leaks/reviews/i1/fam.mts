// node fam.mts [scale]: the four give-back families of round I and the re-widened narrowings, head against before and base.
// Every letter the head sends that before refused or redacted more is grouped by (section, prefix class / joiner class, kind,
// what the base does); every letter the head sends that the base refused or redacted more is printed as BASE.
import { load, outcome, show, worse, rng, shuffle } from './lib.mts';
const [H, P, B] = [await load('head'), await load('before'), await load('base')];
const scale = Number(process.argv[2] ?? 1);
type Row = [string, string];
const groups = new Map<string, { n: number; ex: string[] }>();
const baseFlags: string[] = [];
const seen = new Set<string>();
const r = rng(7);
function section(name: string, rows: Row[], seconds: number) {
  shuffle(rows, r);
  const t0 = Date.now();
  let n = 0, sent = 0, flips = 0;
  for (const [tag, text] of rows) {
    if (Date.now() - t0 > seconds * 1000 * scale) break;
    if (seen.has(text)) continue;
    seen.add(text); n += 1;
    const h = outcome(H, text);
    if (h.refused) continue;
    sent += 1;
    const p = outcome(P, text), b = outcome(B, text);
    const wb = worse(h, b);
    if (wb && baseFlags.length < 40) baseFlags.push(`BASE ${wb} [${name} ${tag}] ${JSON.stringify(text)} head=${show(h, text)} base=${show(b, text)} before=${show(p, text)}`);
    const wp = worse(h, p);
    if (wp) {
      flips += 1;
      const key = `${name} ${tag} ${wp} base:${b.refused ? 'REFUSED' : b.text === h.text ? 'as-head' : 'differs'}`;
      const g = groups.get(key) ?? { n: 0, ex: [] };
      g.n += 1;
      if (g.ex.length < 1) g.ex.push(`${JSON.stringify(text)} head=${show(h, text)} before=${show(p, text)}`.slice(0, 250));
      groups.set(key, g);
    }
  }
  console.log(`## ${name}: ran ${n} of ${rows.length} in ${Date.now() - t0} ms; head sent ${sent}; before-flips ${flips}`);
}
// T: a table of date tails beside the rules this round added (H = head, P = before, B = base; S sent, R refused, r redacted).
const DT: Row[] = [
  ['mon', '01Jan 2020'], ['mon', '01Jan, 2020'], ['mon', '01JAN20'], ['mon', '01Jan 20'], ['mon', '01-Jan-2020'], ['mon', '01Jan. 2020'], ['mon', '01Jan.2020'], ['mon', '01Jan-2020'], ['mon', '01 Jan 2020'], ['mon', '01Jan  2020'], ['mon', '01Jan , 2020'], ['mon', '01Jan,  2020'], ['mon', '01Jan\n2020'], ['mon', '01Jan\t2020'], ['mon', "01Jan '20"], ['mon', '01January 2020'], ['mon', '01Jan 2020150.00'], ['mon', '01Jan 20201'], ['mon', '01Jan2020'], ['mon', '01Jan/2020'], ['mon', '1Jan 2020'], ['mon', '01Sept 2020'], ['mon', '01Jan 15, 2026'], ['mon', '01Jan 1999'], ['mon', '01Jan of 2020'], ['mon', '01Jan 2020'], ['mon', '01Jan 2020'], ['mon', '01Jan ,2020'],
  ['num', '01/02/2020'], ['num', '01/02/20201,250.00'], ['num', '01/02/2020150.5'], ['num', '01/02/2020150.00'], ['num', '01/02/20201234'], ['num', '01/02/20201234-56'], ['num', '01/02/202001/31/2020'], ['num', '01/02/202001-Jan-2020'], ['num', '01/02/2020150'], ['num', '01/02/2020 150.00'], ['num', '01⁃02⁃2020'], ['num', '01_02_2020'], ['num', '01_02_20201234'], ['num', '01~02~2020'], ['num', '01/02/20'], ['num', '2020-01-02'], ['num', '2020-01-0212'], ['num', '9/9/2020'], ['num', '9/9/20201,250.00'], ['num', '01/02/2020150 00'], ['num', '01/02/202012:30'], ['num', '01/02/20201234567.89'], ['num', '01.02.2020150,00'], ['num', '01/02/2020150.'], ['num', '01/02/20201,'], ['num', '01/02/2020150/'], ['num', '01/02/2020$150.00'], ['num', '01/02/2020x150.00'], ['num', '01/02/20201−250'], ['num', '01⁃02⁃2020150.00'],
];
const code = (o: { refused: boolean; text: string }, text: string) => (o.refused ? 'R' : o.text === text ? 'S' : 'r');
const tcols: Row[] = [['-/shape', '900-12-3456'], ['-/bare', '900123456'], ['SSN:/shape', 'SSN: 900-12-3456'], ['SSN:/bare', 'SSN: 900123456'], ['Tel/shape', 'Tel 202-555-0123'], ['-/ten', '2025550123']];
console.log('## T (H P B per column): ' + tcols.map(([c]) => c).join(' | '));
for (const [, tail] of DT) {
  const cells = tcols.map(([, lead]) => { const text = lead + tail; return code(outcome(H, text), text) + code(outcome(P, text), text) + code(outcome(B, text), text); });
  console.log(`${JSON.stringify(tail).padEnd(28)} ${cells.join(' | ')}`);
}
// E1: family (i), what stands between a noun and its number.
const PRE1: Row[] = [['n', 'Claim'], ['n', 'Account'], ['n', 'Provider'], ['n', 'Facility'], ['n', 'Member'], ['n', 'Statement'], ['n', 'Location'], ['n', 'Payment'], ['n', 'Provider line'], ['pn', 'Phone: Provider'], ['pn', 'Fax Account No.'], ['sn', 'SSN Account'], ['s/n', 'SSN / Member ID'], ['ns', 'Member ID / SSN'], ['s', 'SSN'], ['p', 'Phone'], ['sn', 'Social Security Account Number'], ['gsn', 'PatientSSN Account'], ['s:n', 'SSN: Account'], ['tbl', '| SSN | Claim'], ['tbl', 'SSN | Claim'], ['np', 'Provider phone']];
const JOIN: Row[] = [['sp', ' '], ['sp', ': '], ['plus', ' + '], ['plus', '+'], ['plus1', ' +1-'], ['plus1', ' +1'], ['plus1sp', ': +1 '], ['plus1', ' +1('], ['plus1', ' +1.'], ['blank', ' ___ '], ['blank', ': ______ '], ['blank', '~~~'], ['blank', ' ─── '], ['two', ' __ '], ['rule', '\n___\n'], ['rule', '\n─────\n'], ['rule', '\n+-----+\n'], ['rulebars', ' |\n|-----|\n| '], ['rule', '\n~~~\n'], ['rule', '\n- - -\n'], ['rule', '\n═══\n'], ['dots', '\n...\n'], ['short', '\n-  \n'], ['pluses', '\n+++\n'], ['pluses', '\n+ + +\n'], ['bars', '\n|||\n'], ['bars', '\n| | |\n'], ['blankline', '\n\n'], ['blank2', '\n\n\n'], ['colonblank', ':\n\n'], ['hashnext', '\n\n#'], ['nonext', '\n\nNo. '], ['nl', '\n'], ['hash', ' #'], ['bar', ' | '], ['box1', ' │ '], ['box2', ' ││ '], ['box', ' ├── '], ['rulebox', '\n├───┤\n│ '], ['rulebars', ' |\n+-----+\n| ']];
const NUM1 = ['900-12-3456', '202-555-0123', '(202) 555-0123', '12025550123', '900123456', '2025550123', '1-202-555-0123'];
const TAIL1 = ['150.00', '01/02/2020', '01Jan 2020'];
const e1: Row[] = [];
for (const [pt, pre] of PRE1) for (const [jt, join] of JOIN) for (const num of NUM1) for (const tail of TAIL1) e1.push([`${pt}/${jt}`, `${pre}${join}${num}${tail}`]);
section('E1', e1, 55);
// E3: family (iii), "on file".
const e3: Row[] = [];
for (const [lt, label] of [['p', 'Phone'], ['s', 'SSN'], ['p', 'Fax'], ['n', 'Claim'], ['-', 'Based'], ['sfar', 'The Social Security number that we have'], ['pfar', 'The member phone number that we have']] as Row[])
  for (const [ot, oj] of [['sp', ' '], ['nl', '\n'], ['ff', '\f'], ['vt', '\v'], ['ls', ' '], ['nl', ' \n'], ['nl', '\n '], ['d', '-'], ['d', ' - '], ['dnl', '-\n'], ['nl', '\r\n'], ['tab', '\t'], ['sp2', '  '], ['nel', '\u0085'], ['zw', '​'], ['nl2', '\n\n'], ['nbsp', ' '], ['og', ' '], ['minus', '−']] as Row[])
    for (const after of [': ', ' ', ' number: ']) for (const num of ['900-12-3456', '202-555-0123', '12345678901234', '900123456']) for (const tail of ['150.00', '01/02/2020', '.01']) e3.push([`${lt}/${ot}`, `${label} on${oj}file${after}${num}${tail}`]);
section('E3', e3, 25);
// E2: family (ii), a point between the second and third groups under Social Security and Medicare labels.
const e2: Row[] = [];
for (const [pt, pre] of [['sm', 'SSN/Medicare ID'], ['sm', 'SSN Medicare'], ['ms', 'Medicare/SSN'], ['ms', 'Medicare SSN'], ['s', 'SSN'], ['m', 'Medicare'], ['sm', 'Social Security Act. Medicare rate'], ['sm', 'SSN: Medicare rate'], ['sm', 'SSN (Medicare) No.'], ['sm', 'HICN Medicare'], ['sp', 'SSN Phone'], ['ps', 'Phone SSN'], ['sc', 'SSN Claim'], ['smc', 'SSN Medicare Claim'], ['m', 'Medicare ID'], ['gsm', 'PatientSSN Medicare'], ['gs', 'PatientSSN'], ['ms', 'Medicare number or SSN'], ['mgs', 'Medicare PatientSSN']] as Row[])
  for (const join of [' ', ': ', ' No. ', ' # ', '\n']) for (const num of ['900 12.3456', '900 12 3456', '900.12 3456', '900 12-3456', '900-12 3456', '900  12.3456', '110 32.7442', '900 12.34567', '900 12·3456', '900 12. 3456', '900 12 .3456'])
    for (const tail of ['150.00', '', '01/02/2020', '0', ' 150.00', '.50']) e2.push([pt, `${pre}${join}${num}${tail}`]);
section('E2', e2, 20);
// E4: the re-widened narrowings (date tails) under labels and nouns.
const e4: Row[] = [];
for (const [pt, pre] of [['-', ''], ['w', 'Ref '], ['s', 'SSN: '], ['p', 'Phone '], ['n', 'Claim '], ['sp', 'SSN/Phone: '], ['m', 'Medicare '], ['n', 'Account '], ['gs', 'PatientSSN '], ['w', 'Seen '], ['sm', 'SSN/Medicare ID: ']] as Row[])
  for (const num of ['900-12-3456', '202-555-0123', '900123456', '2025550123', '(202) 555-0123', '900 12 3456', '555-0123']) for (const [dt, tail] of DT) for (const suf of ['', ' Paid']) e4.push([`${pt}/${dt}`, `${pre}${num}${tail}${suf}`]);
section('E4', e4, 40);
console.log([...groups.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, g]) => `${String(g.n).padStart(4)} ${key} :: ${g.ex[0]}`).join('\n'));
console.log(`BASE flags: ${baseFlags.length}`);
console.log(baseFlags.join('\n'));
