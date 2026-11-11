// node tight.mts <seconds> <seed>: glued shapes written tight, outside the four give-back families of round H (no month's
// word across a space, no bar/underscore/backslash/tilde joiner, no blank line, no space around a date's separators):
// any letter the head sends that before or base refused or redacted more.
import { load, outcome, show, worse, rng } from './lib.mts';
const seconds = Number(process.argv[2] ?? 110);
const r = rng(Number(process.argv[3] ?? 3));
const [H, P, B] = [await load('head'), await load('before'), await load('base')];
const pick = (a: readonly string[]): string => a[Math.floor(r() * a.length)]!;
const prefix = ['', 'Ref ', 'SSN ', 'SSN: ', 'Phone ', 'Tel ', 'Medicare ', 'Claim ', 'Account No. ', 'Patient ', 'Social Security Account Number ', 'SSN Account ', 'Phone on file: ', 'Fax confirmation number ', 'ID ', 'Paid ', 'Service 01/01/2020-150.00 Paid\n', 'Member ID:\n', 'ICN\n', 'Phone (2) ', 'Call Jane Zephyra at ', 'SSN on file: ', 'Web ID ', 'Line '];
const headglue = ['', '', '', '2020', '01/02/2020', '150.00', '$150.00', '01/02/20', '2020-01-', '12', 'Jan 1, 2020', 'January 2020', '5', 'FY2020', '01JAN2020', '3/2020', '.50', '1 January 2020', '01-Jan-2020'];
const number = ['900-12-3456', '202-555-0123', '(202) 555-0123', '900123456', '2025550123', '900 12 3456', '900.12.3456', '900 12.3456', '202.555.0123', '(202)555-0123', '900-12-\n3456', '202 555 0123', '900/12/3456', '202/555-0123', '( 202 ) 555-0123', '(202) 555 0123', '900.12 3456'];
const tailglue = ['', '150.00', '01/02/2020', '01-Jan-2020', '2020-01-02', '202-555-0124', '1234', '78', '150.00-120.00', '01/02/2020150.00', '9/9/2020', '2020-1-5', '01Jan2020', '01/02/20', '.50', '12th', '-02', '01/02/202001/31/2020', 'x', '01.02.2020', '1/2/2020', '01JAN20', '2020/01/02'];
const suffix = ['', ' Paid', '\nThank you', ' 97110 1 150.00'];
const t0 = Date.now();
let n = 0, headSent = 0, baseFlags = 0, beforeFlags = 0;
const seen = new Set<string>();
const out: string[] = [];
while (Date.now() - t0 < seconds * 1000) {
  const text = `${pick(prefix)}${pick(headglue)}${pick(number)}${pick(tailglue)}${pick(suffix)}`;
  if (seen.has(text)) continue;
  seen.add(text);
  n += 1;
  const h = outcome(H, text);
  if (h.refused) continue;
  headSent += 1;
  const p = outcome(P, text);
  const b = outcome(B, text);
  const wp = worse(h, p);
  const wb = worse(h, b);
  if (wb) { baseFlags += 1; if (baseFlags <= 15) out.push(`BASE ${wb} ${JSON.stringify(text)} head=${show(h, text)} base=${show(b, text)}`); }
  if (wp) { beforeFlags += 1; if (beforeFlags <= 30) out.push(`BEFORE ${wp} ${JSON.stringify(text)} head=${show(h, text)} before=${show(p, text)} base=${show(b, text)}`); }
}
console.log(`## tight: ${n} letters in ${Date.now() - t0} ms; head sent ${headSent}; base flags ${baseFlags}; before flags ${beforeFlags}`);
console.log(out.join('\n'));
