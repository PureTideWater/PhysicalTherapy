// Compact table of t1's cases: usage node t1b.mts
import { B, H, diff } from './lib.mts';
const sp = (n: number) => ' '.repeat(n);
const prose = (n: number) => 'The claim was reviewed and paid in full by the plan. '.repeat(Math.ceil(n / 53)).slice(0, n);
const kinds: Record<string, (n: number) => string> = {
  'member 7654<85>sp*n 3210': (n) => `${prose(700)} Member ID 7654\u0085${sp(n)}3210 was denied. ${prose(700)}`,
  'member 7654 sp*n <85>3210': (n) => `${prose(700)} Member ID 7654${sp(n)}\u00853210 was denied. ${prose(700)}`,
  'member 7654<85>\\n*n 3210': (n) => `${prose(700)} Member ID 7654\u0085${'\n'.repeat(n)}3210 was denied. ${prose(700)}`,
  'member 7654<2180>sp*n 3210': (n) => `${prose(700)} Member ID 7654ↀ${sp(n)}3210 was denied. ${prose(700)}`,
  'member 76 sp*n 54<bd>32 sp*n 10': (n) => `${prose(700)} Member ID 76${sp(n)}54½32${sp(n)}10 was denied. ${prose(700)}`,
  'claim ZZ<85>sp*n 99887': (n) => `${prose(700)} Claim ZZ\u0085${sp(n)}99887 was denied. ${prose(700)}`,
  'claim ZZ99 sp*n 8<85>87': (n) => `${prose(700)} Claim ZZ99${sp(n)}8\u008587 was denied. ${prose(700)}`,
  'name Jane Q<85>sp*n Zephyra': (n) => `${prose(700)} Jane Q\u0085${sp(n)}Zephyra was seen. ${prose(700)}`,
  'name Jane<85>sp*n Q Zephyra': (n) => `${prose(700)} Jane\u0085${sp(n)}Q Zephyra was seen. ${prose(700)}`,
  'name Zeph<85>sp*n yra': (n) => `${prose(700)} Jane Q Zeph\u0085${sp(n)}yra was seen. ${prose(700)}`,
  'initials J.<85>Q. Z., name n+700 before': (n) => `Jane Q Zephyra was seen. ${prose(700 + n)} J.\u0085Q. Z. signed. ${prose(700)}`,
  'initials J. Q.<85> Z., name before': (n) => `Jane Q Zephyra was seen. ${prose(700 + n)} J. Q.\u0085 Z. signed. ${prose(700)}`,
  'initials J<85>Q Z, name after': (n) => `${prose(700 + n)} J\u0085Q Z signed. ${prose(700)} Jane Q Zephyra was seen.`,
  'dob 03/14/<85>sp*n 1980': (n) => `${prose(700)} DOB 03/14/\u0085${sp(n)}1980 ok. ${prose(700)}`,
  'dob March<85>sp*n 14, 1980': (n) => `${prose(700)} DOB March\u0085${sp(n)}14, 1980 ok. ${prose(700)}`,
  'no white space 7654<85>-*n 3210': (n) => `${'x.'.repeat(400)}7654\u0085${'-'.repeat(n)}3210${'.x'.repeat(400)}`,
};
const ns = [0, 1, 100, 250, 254, 255, 256, 257, 258, 300, 600];
const clear = /7654|3210|99887|Zephyra|yra\b|1980|J\.\u0085Q|J\u0085Q|Q\.\u0085/u;
console.log('n: ' + ns.join(' '), ' (per cell base/head: s=sent H=held R=refused; * = outputs differ; ! = head sends with identifier text in clear)');
for (const [name, make] of Object.entries(kinds)) {
  const row = ns.map((n) => { const d = diff(name, make(n)); const c = (o: string) => o === 'sent' ? 's' : o === 'HELD' ? 'H' : o === 'REFUSED' ? 'R' : 'T'; return c(d.b.out) + c(d.h.out) + (d.same ? '' : '*') + (d.h.out === 'sent' && clear.test(d.h.text) ? '!' : ''); });
  console.log(name.padEnd(42), row.join(' '));
}
