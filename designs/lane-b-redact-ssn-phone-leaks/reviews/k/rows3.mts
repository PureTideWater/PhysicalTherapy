// node rows3.mts: K-1 in letters as a payer writes them, its twins, and the window's edge of NAMED_REACH; head, before, base.
import { load, outcome, show, J, HELD, type Out } from './lib.mts';
const [H, P, B] = await Promise.all(['head', 'before', 'base'].map(load));
const line = (t: string) => { const [h, p, b] = [outcome(H, t), outcome(P, t), outcome(B, t)] as Out[]; return `${!(h as Out).refused && (p as Out).refused ? 'P-R>S ' : '      '}${J(t)} :: H ${show(h as Out, t)} | P ${show(p as Out, t)} | B ${show(b as Out, t)}`; };
const sec = (name: string, rows: string[]) => { console.log(`\n# ${name}`); for (const t of rows) console.log(line(t)); };
sec('K-1: the label wrapped by CR LF, the Social Security label 24 characters before the number in the LF writing', [
  'SSN on file. Statement\r\nNo. 900-12-3456150.00', 'SSN on file. Statement\nNo. 900-12-3456150.00', 'SSN on file. Statement\r\rNo. 900-12-3456150.00', 'SSN on file. Statement No. 900-12-3456150.00',
  'SSN: see Member\r\nID Number: 900-12-3456150.00', 'SSN: see Member\nID Number: 900-12-3456150.00',
  'SSN verified. Provider\r\nNo. 90012345601/02/2020', 'SSN verified. Provider\nNo. 90012345601/02/2020',
  'Your SSN is on file.\r\nAccount\r\nNumber: 900-12-3456150.00', 'Your SSN is on file.\nAccount\nNumber: 900-12-3456150.00',
  'Dear Jane Zephyra,\r\nSSN on file. Statement\r\nNo. 900-12-3456150.00\r\nThank you.', 'Dear Jane Zephyra,\nSSN on file. Statement\nNo. 900-12-3456150.00\nThank you.',
  `${HELD}SSN on file. Statement\r\nNo. 900-12-345678`, `${HELD}SSN on file. Statement\nNo. 900-12-345678`,
  'Social Security No. Record\r\nID 900-12-3456150.00', 'Social Security No. Record\nID 900-12-3456150.00',
]);
sec('the same edge with the break after the label (in "before" too) and with no noun', [
  'SSN verified. Account No. \r\n900-12-3456150.00', 'SSN verified. Account No. \n900-12-3456150.00',
  'SSN as shown in our file\r\n900-12-345678', 'SSN as shown in our file\n900-12-345678',
]);
sec('NAMED_REACH: a word that ends in a listed noun exactly 120 characters before the number', [112, 113, 114].flatMap((d) => [`Overpayment${'.'.repeat(d)}900-12-3456150.00`, `We disclaim${' '.repeat(d + 2)}900-12-3456150.00`]));
sec('a mark with a letter on a line of its own', ['Claim\n(s)\n20260112345.01', 'Claim\n#\n20260112345.01', 'STATEMENT\n(S)\n900-12-3456150.00']);
