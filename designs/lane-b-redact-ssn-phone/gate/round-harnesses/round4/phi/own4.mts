// Synthetic only. The call's own identifiers in many writings (labels, invisibles, line breaks, glued, 835 name order),
// in held frames. Hit: A refused or redacted, B sends every letter/digit of the identifier. Class by B's no-range twin:
// B hides it there (redacts or refuses) = a form B reads elsewhere, NOT A' (a finding); else pre-existing (A').
import { readFileSync, writeFileSync } from 'node:fs';
import { A, B, run } from './lib.mts';
const all: string[] = JSON.parse(readFileSync(process.argv[2]!, 'utf8'));
const frames = all.filter((_, i) => i % 5 === 0);
const norange = (f: string) => f.replace(/(01\/01\/2020|1\/1\/20|2020-01-01|01\.01\.2020|Jan 1, 2020|03\/01\/2020)\s*[-–—−‐]\s*\n?(?:\$?150\.00|\$?120\.00|\$45\.00|01\/02\/2020|1\/2\/20|2020-01-02|01\.02\.2020|Jan 2, 2020|03\/05\/2020)/u, '$1 ').replace(/\$?150\.00-\$?120\.00/u, '150.00 ');
type Case = { kind: string; names: string[]; t: string; core: string };
const cases: Case[] = [];
const J = ['JANE Q ZEPHYRA'];
const nameForms: [string[], string, string][] = [
  [J, 'ZEPHYRA, JANE Q', 'ZEPHYRA'], [J, 'ZEPHYRA/JANE/Q', 'ZEPHYRA'], [J, 'Zephyra J', 'Zephyra'], [J, 'J. Zephyra', 'Zephyra'], [J, 'Ms. Zephyra', 'Zephyra'],
  [J, 'Dear Jane,', 'Jane'], [J, 'jane zephyra', 'zephyra'], [J, 'Zeph-\nyra', 'Zeph'], [J, 'Zeph­yra', 'Zeph'], [J, 'Ze​phyra', 'phyra'], [J, 'Z e p h y r a', 'Z e p h'],
  [J, 'ZEPHYRAJANE', 'ZEPHYRA'], [J, 'Jane Q. Zephyra', 'Zephyra'], [J, 'Jane-Zephyra', 'Zephyra'], [J, 'Patient:Zephyra', 'Zephyra'], [J, 'ZEPHYRA\nJANE', 'ZEPHYRA'],
  [J, 'J.Q.Z.', 'J.Q.Z'], [J, 'JQZ', 'JQZ'], [J, 'J Q Z', 'J Q Z'], [J, 'Jane', 'Jane'], [J, 'Zéphyra', 'phyra'], [J, 'ZEPHYRA JANE Q', 'ZEPHYRA'],
  [['JANE MA'], 'Ms. Ma', 'Ma'], [['JANE MA'], 'Jane Ma', 'Ma'], [['JANE MA'], 'MA, JANE', 'MA'], [['JANE MA'], 'MA/JANE', 'MA'], [['JANE MA'], 'J. Ma', 'Ma'], [['JANE MA'], 'Dear Ms Ma:', 'Ma'],
  [['AL Q ZEPHYRA'], 'Al Zephyra', 'Al'], [['AL Q ZEPHYRA'], 'ZEPHYRA, AL', 'AL'], [['AL Q ZEPHYRA'], 'Dear Al,', 'Al'], [['AL Q ZEPHYRA'], 'Al', 'Al'],
  [['XU VANTREE'], 'Xu Vantree', 'Xu'], [['XU VANTREE'], 'VANTREE, XU', 'XU'], [['XU VANTREE'], 'Mr. Xu', 'Xu'],
  [['JANE ZEPHYRA'], 'J.Z.', 'J.Z'], [['JANE ZEPHYRA'], 'Jane Z.', 'Jane'], [['JANE ZEPHYRA'], 'JZ', 'JZ'],
];
for (const [names, t, core] of nameForms) cases.push({ kind: 'name', names, t, core });
for (const [k, v] of [['member', 'SYNMEMBER0042'], ['claim', 'SYNCLAIM0001']] as const) {
  for (const t of [v, v.toLowerCase(), v.replace('0', '-0'), v.slice(0, 3) + '-' + v.slice(3, 9) + '-' + v.slice(9), v.slice(0, 3) + ' ' + v.slice(3, 9) + ' ' + v.slice(9), v.slice(0, 4) + '​' + v.slice(4), v.slice(0, 9) + '\n' + v.slice(9), `ID#${v}`, `ID:${v}`, `Member ${v}`, `${v}-01`, `${v}Paid`, `${v}01`, `X${v}`, `${v.slice(0, 9)}/${v.slice(9)}`, `${v.slice(0, 9)}.${v.slice(9)}`, v.split('').join(' '), `${v.slice(0, 9)} ${v.slice(9)}`])
    cases.push({ kind: k, names: J, t, core: t.replace(/^(ID#|ID:|Member |X)/, '').replace(/(-01|Paid|01)$/, '') });
}
for (const t of ['03/14/1980', '3-14-80', 'March 14, 1980', '14 Mar 1980', '1980-03-14', 'DOB:03/14/1980', 'DOB03141980', 'Born 3/14/80', '03141980', '031480', '3/14/1980Paid', '03/14/\n1980', '3.14.80', '14.03.1980', 'Mar 14 80', '03​/14/1980', '0​3/14/80', 'March\n14,\n1980', '14th March 1980', 'DOB: Mar. 14th, \'80', '3/14/80', '19800314'])
  cases.push({ kind: 'dob', names: J, t, core: t.replace(/^(DOB:? ?|Born )/, '').replace(/Paid$/, '') });
const alnum = (s: string) => s.normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '').toUpperCase();
const out: string[] = []; const by: Record<string, number> = {}; let n = 0;
for (const c of cases) {
  const p = { names: c.names };
  const want = alnum(c.core);
  const clear = (x: string) => x !== 'REFUSED' && alnum(x).includes(want);
  for (const f of frames) {
    const l = f.replace('{T}', c.t); n++;
    const a = run(A, l, p), b = run(B, l, p);
    if (!(clear(b) && !clear(a))) continue;
    const nrF = norange(f); const nr = nrF.replace('{T}', c.t);
    if (nrF === f) { by[`${c.kind} no-twin`] = (by[`${c.kind} no-twin`] ?? 0) + 1; continue; }
    const bNR = run(B, nr, p); const aNR = run(A, nr, p);
    const cls = !clear(bNR) ? 'NOT-A(B hides twin)' : !clear(aNR) ? 'NOT-A(A hides twin)' : 'A-like';
    const k = `${c.kind} ${cls}`; by[k] = (by[k] ?? 0) + 1;
    out.push(JSON.stringify({ kind: c.kind, names: c.names, t: c.t, l, a: a === 'REFUSED' ? a : 'RED', b: b === l ? 'SENT' : b, nr, bNR: bNR === nr ? 'SENT' : bNR, aNR: aNR === nr ? 'SENT' : aNR, cls }));
  }
}
writeFileSync(process.argv[3]!, out.join('\n') + '\n');
console.log('frames', frames.length, 'letters', n, 'hits', out.length, JSON.stringify(by));
