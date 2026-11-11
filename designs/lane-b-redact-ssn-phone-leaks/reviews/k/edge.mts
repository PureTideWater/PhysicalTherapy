// node edge.mts: two populations around hunk 2 (the count of line breaks in a label), each letter on head, before, base.
// P1: a Social Security label, a listed noun, a wrapped label, the number; the label's reach is 24 characters and CR LF spends two.
// P2: CR, an invisible character, LF inside a label under a phone word or Medicare, the number refused only under its label.
import { load, outcome, show, J, type Out } from './lib.mts';
const [H, P, B] = await Promise.all(['head', 'before', 'base'].map(load));
const RS = (o: Out) => (o.refused ? 'R' : 'S');
const three = (t: string) => [outcome(H, t), outcome(P, t), outcome(B, t)] as [Out, Out, Out];
const line = (t: string) => { const [h, p, b] = three(t); return `${J(t)} :: H ${show(h, t)} | P ${show(p, t)} | B ${show(b, t)}`; };
console.log('# P1 the pad grid: "SSN verified. Account" + pad blanks + break + "No. 900-12-3456150.00" (distance from the label to the number in the LF writing = 23 + pad)');
for (let pad = 0; pad <= 3; pad += 1) for (const br of ['\n', '\r\n']) console.log(`  pad ${pad} ${br === '\n' ? 'LF  ' : 'CRLF'} ${line(`SSN verified. Account${' '.repeat(pad)}${br}No. 900-12-3456150.00`)}`);
let [n, k1, k1before, tailOnly] = [0, 0, 0, 0];
const ex: string[] = [];
const byDist = new Map<number, number>();
for (const ssn of ['SSN', 'Social Security', 'SS#', 'S.S.N.', 'Soc. Sec.', 'HICN'])
  for (const mid of [' verified. ', ' on file. ', ': see ', ' and ', ' (masked). ', ' is on record. Your '])
    for (const noun of ['Account', 'Policy', 'Member', 'Statement', 'Provider', 'Plan'])
      for (let pad = 0; pad <= 3; pad += 1)
        for (const word of ['No.', 'Number:', 'ID:', 'NBR: #', 'No. is'])
          for (const num of ['900-12-3456150.00', '900-12-345678', '90012345601/02/2020']) {
            const crlf = `${ssn}${mid}${noun}${' '.repeat(pad)}\r\n${word} ${num}`;
            const lf = crlf.replace('\r\n', '\n');
            const [h, p] = [outcome(H, crlf), outcome(P, crlf)];
            const hl = outcome(H, lf);
            n += 1;
            if (!h.refused && hl.refused) {
              k1 += 1;
              if (p.refused) k1before += 1;
              const d = `${mid}${noun}${' '.repeat(pad)}\n${word} `.length;
              byDist.set(d, (byDist.get(d) ?? 0) + 1);
              if (ex.length < 4) ex.push(`  CRLF ${line(crlf)}\n  LF   ${line(lf)}`);
            }
            // the same edge with the break after the label's last word (no delta: "before" counted that break as one too)
            const t2 = `${ssn}${mid}${noun}${' '.repeat(pad)} ${word}\r\n${num}`;
            if (!outcome(H, t2).refused && outcome(H, t2.replace('\r\n', '\n')).refused) tailOnly += 1;
          }
console.log(`# P1: ${n} pairs (the CR LF letter and its LF writing): head sends the CR LF letter and refuses its LF writing: ${k1} (of them "before" refused the CR LF letter: ${k1before}); by the distance in the LF writing: ${[...byDist.entries()].sort((a, b) => a[0] - b[0]).map(([d, c]) => `${d}:${c}`).join(' ')}; the same with the break in the tail: ${tailOnly}`);
for (const e of ex) console.log(e);

console.log('\n# P2: label + noun + CR + invisible + LF + number word + number');
const INV: [string, string][] = [['(none: CR LF)', ''], ['200B', '​'], ['FEFF', String.fromCharCode(0xfeff)], ['00AD', String.fromCharCode(0xad)], ['2060', String.fromCharCode(0x2060)], ['200D', String.fromCharCode(0x200d)], ['034F', String.fromCharCode(0x34f)], ['FE0F', String.fromCharCode(0xfe0f)], ['200E', String.fromCharCode(0x200e)], ['0301', String.fromCharCode(0x301)], ['180E', String.fromCharCode(0x180e)], ['061C', String.fromCharCode(0x61c)], ['E0020 (tag)', String.fromCodePoint(0xe0020)], ['space', ' '], ['tab', '\t'], ['00A0', String.fromCharCode(0xa0)]];
const NUMS = ['202-555-01234567', '900-12-345678', '(202) 555-01234567', '202-555-0123150.00'];
for (const [name, z] of INV) {
  const c = { n: 0, hS: 0, pS: 0, bS: 0, crcr: 0, lflf: 0 };
  let first = '';
  for (const label of ['Phone', 'Fax', 'Medicare', 'Tel.', 'Contact'])
    for (const noun of ['Member ID', 'Statement', 'Provider', 'Account', 'Policy', 'Member'])
      for (const word of ['No.', 'Number:', 'ID'])
        for (const num of NUMS.slice(0, 3)) {
          const t = `${label} ${noun}\r${z}\n${word} ${num}`;
          const [h, p, b] = three(t);
          c.n += 1;
          if (!h.refused) c.hS += 1;
          if (!p.refused) c.pS += 1;
          if (!b.refused) c.bS += 1;
          if (!outcome(H, `${label} ${noun}\r\r${word} ${num}`).refused) c.crcr += 1;
          if (!outcome(H, `${label} ${noun}\n${z}\n${word} ${num}`).refused) c.lflf += 1;
          if (!h.refused && p.refused && first === '') first = line(t);
        }
  console.log(`  ${name.padEnd(14)} of ${c.n}: head sends ${c.hS}, before sends ${c.pS}, base sends ${c.bS} | head sends the CR CR writing ${c.crcr}, the LF+it+LF writing ${c.lflf}${first ? `\n      e.g. ${first}` : ''}`);
}
console.log('\n# P2 rows');
for (const t of ['Phone Member ID\r️\nNo. 202-555-01234567', 'Phone Member ID\r\nNo. 202-555-01234567', 'Phone Member ID\nNo. 202-555-01234567', 'Phone Member ID\r\rNo. 202-555-01234567', 'Phone Member ID\n\nNo. 202-555-01234567', 'Phone Member ID\n️\nNo. 202-555-01234567', 'Phone Member ID\r️\n\r️\nNo. 202-555-01234567', 'Medicare Member\r⁠\nNumber 900-12-345678', 'Medicare Member\r\rNumber 900-12-345678', 'Medicare Member\r\nNumber 900-12-345678', 'Medicare Member Number 900-12-345678', 'Medicare 900-12-345678', 'Phone Member ID\r️\nNo. 202-555-0123150.00', 'Phone Member ID\r\nNo. 202-555-0123150.00', 'Member ID\r️\nNo. 202-555-0123150.00', 'Phone STATEMENT\r​\nNo.\r​\n202-555-01234567', 'Phone STATEMENT\r\nNo.\r\n202-555-01234567', 'Phone STATEMENT\r​\n\r​\n202-555-01234567']) console.log(`  ${line(t)}`);
