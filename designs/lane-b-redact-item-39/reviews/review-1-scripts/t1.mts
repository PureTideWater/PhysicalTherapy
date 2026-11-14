import { B, H, diff, short, who, claims, once } from './lib.mts';
const sp = (n: number) => ' '.repeat(n);
const prose = (n: number) => 'The claim was reviewed and paid in full by the plan. '.repeat(Math.ceil(n / 53)).slice(0, n);
const cases: [string, string][] = [];
for (const n of [0, 1, 100, 250, 254, 255, 256, 257, 258, 300, 600]) {
  cases.push([`member unseen+spaces${n}`, `${prose(700)} Member ID 7654\u0085${sp(n)}3210 was denied. ${prose(700)}`]);
  cases.push([`member spaces${n}+unseen`, `${prose(700)} Member ID 7654${sp(n)}\u00853210 was denied. ${prose(700)}`]);
  cases.push([`member nl${n}`, `${prose(700)} Member ID 7654\u0085${'\n'.repeat(n)}3210 was denied. ${prose(700)}`]);
  cases.push([`member numchar+spaces${n}`, `${prose(700)} Member ID 7654ↀ${sp(n)}3210 was denied. ${prose(700)}`]);
  cases.push([`member sp numchar sp${n}`, `${prose(700)} Member ID 76${sp(n)}54½32${sp(n)}10 was denied. ${prose(700)}`]);
  cases.push([`claim unseen+spaces${n}`, `${prose(700)} Claim ZZ\u0085${sp(n)}99887 was denied. ${prose(700)}`]);
  cases.push([`claim sp unseen${n}`, `${prose(700)} Claim ZZ99${sp(n)}8\u008587 was denied. ${prose(700)}`]);
  cases.push([`name unseen+spaces${n}`, `${prose(700)} Jane Q\u0085${sp(n)}Zephyra was seen. ${prose(700)}`]);
  cases.push([`name2 unseen+spaces${n}`, `${prose(700)} Jane\u0085${sp(n)}Q Zephyra was seen. ${prose(700)}`]);
  cases.push([`name part unseen${n}`, `${prose(700)} Jane Q Zeph\u0085${sp(n)}yra was seen. ${prose(700)}`]);
  cases.push([`initials far name${n}`, `Jane Q Zephyra was seen. ${prose(700 + n)} J.\u0085Q. Z. signed. ${prose(700)}`]);
  cases.push([`initials2 far name${n}`, `Jane Q Zephyra was seen. ${prose(700 + n)} J. Q.\u0085 Z. signed. ${prose(700)}`]);
  cases.push([`initials3 far name${n}`, `${prose(700 + n)} J\u0085Q Z signed. ${prose(700)} Jane Q Zephyra was seen.`]);
  cases.push([`dob unseen${n}`, `${prose(700)} DOB 03/14/\u0085${sp(n)}1980 ok. ${prose(700)}`]);
  cases.push([`dob2 unseen${n}`, `${prose(700)} DOB March\u0085${sp(n)}14, 1980 ok. ${prose(700)}`]);
  cases.push([`nowhite ${n}`, `${'x.'.repeat(400)}7654\u0085${'-'.repeat(n)}3210${'.x'.repeat(400)}`]);
}
let bad = 0;
for (const [name, text] of cases) {
  const d = diff(name, text);
  if (!d.same) { bad++; console.log(d.worse ? 'WORSE' : 'DIFF ', name, 'base', d.b.out, 'head', d.h.out, d.b.text === d.h.text ? 'text=' : 'text!='); if (d.worse) { console.log('   in  ', short(text)); const i = d.h.text.search(/7654|3210|ZZ|99887|Zeph|yra|Jane|1980|J\.|J\u0085/); console.log('   head', short(d.h.text.slice(Math.max(0, i - 40), i + 400))); } }
}
console.log('cases', cases.length, 'differing', bad);
const t = Date.now(); once(H, cases[0][1]); console.log('ms per head call', Date.now() - t);
