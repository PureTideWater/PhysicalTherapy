// node rows4.mts: K-1's bounds. (a) CR LF near a Social Security label, short of the reach; (b) the edge with two CR LF (a wrapped label and the number under it);
// (c) one-character breaks at the edge; (d) the rate in a letter written with CR LF throughout, by the distance in the LF writing; (e) a phone word in place of the label.
import { load, outcome, show, J, type Out } from './lib.mts';
const [H, P, B] = await Promise.all(['head', 'before', 'base'].map(load));
const line = (t: string) => { const [h, p, b] = [outcome(H, t), outcome(P, t), outcome(B, t)] as [Out, Out, Out]; return `${!h.refused && p.refused ? 'P-R>S ' : '      '}${J(t)} :: H ${show(h, t)} | P ${show(p, t)} | B ${show(b, t)}`; };
const sec = (name: string, rows: string[]) => { console.log(`\n# ${name}`); for (const t of rows) console.log(line(t)); };
const LS = String.fromCharCode(0x2028);
sec('(a) short of the reach', ['SSN\r\nAccount No. 900-12-3456150.00', 'SSN:\r\nStatement\r\nNo. 900-12-3456150.00', 'Social Security\r\nAccount\r\nNumber: 900-12-3456150.00', 'SSN on file. Account\r\nNo. 900-12-3456150.00']);
sec('(b) two CR LF', ['SSN on file. Account\r\nNo.:\r\n900-12-3456150.00', 'SSN on file. Account\nNo.:\n900-12-3456150.00', 'SSN on file. Record\r\nNo.:\r\n900-12-3456150.00', 'SSN on file. Record\nNo.:\n900-12-3456150.00']);
sec('(c) one-character breaks at the edge', ['SSN on file. Statement\rNo. 900-12-3456150.00', `SSN on file. Statement${LS}No. 900-12-3456150.00`, 'SSN on file. Statement\u0085No. 900-12-3456150.00', 'SSN on file. Statement\fNo. 900-12-3456150.00']);
sec('(e) a phone word or Medicare in place of the Social Security label', ['Phone on file. Statement\r\nNo. 202-555-0123150.00', 'Phone on file. Statement\nNo. 202-555-0123150.00', 'Medicare on file. Statemnt\r\nNo. 900-12-3456150.00']);
// (d) every letter: label + filler + noun + CR LF + number word + (CR LF or a blank) + number; d = characters from the label's end to the number in the LF writing
const byD = new Map<number, { n: number; flip: number; before: number }>();
for (const fill of ['', ' ', ': ', ' on file. ', ' verified. ', ' is on record. ', ' (see below) ', ' - '])
  for (const noun of ['Account', 'Policy', 'Member', 'Statement', 'Provider', 'Plan', 'Record', 'Subscriber', 'Certificate'])
    for (const pad of ['', ' ', '  '])
      for (const word of ['No.', 'Number:', 'ID:', 'ID No.:', 'No. is'])
        for (const under of [' ', '\r\n'])
          for (const num of ['900-12-3456150.00', '90012345601/02/2020', '802-45-678901.50']) {
            const crlf = `SSN${fill}${noun}${pad}\r\n${word}${under}${num}`;
            const lf = crlf.replaceAll('\r\n', '\n');
            const d = lf.length - num.length - 3;
            const e = byD.get(d) ?? { n: 0, flip: 0, before: 0 };
            e.n += 1;
            const h = outcome(H, crlf);
            if (!h.refused && outcome(H, lf).refused) { e.flip += 1; if (outcome(P, crlf).refused) e.before += 1; }
            byD.set(d, e);
          }
console.log('\n# (d) "SSN" + filler + noun + CR LF + number word + (blank or CR LF) + number: head sends the CR LF letter and refuses its LF writing (and "before" refused the CR LF letter), by the distance d in the LF writing');
console.log([...byD.entries()].sort((a, b) => a[0] - b[0]).filter(([d]) => d >= 18 && d <= 28).map(([d, e]) => `  d=${d}: ${e.flip}/${e.n} (${e.before})`).join('\n'));
const tot = [...byD.values()].reduce((s, e) => ({ n: s.n + e.n, flip: s.flip + e.flip, before: s.before + e.before }), { n: 0, flip: 0, before: 0 });
console.log(`  all distances (${Math.min(...byD.keys())} to ${Math.max(...byD.keys())}): ${tot.flip}/${tot.n} (${tot.before})`);
