// node family2.mts : an own identifier in a look-alike writing, a gap, a local number; with and without a short identifier of the call's own inside the number. Synthetic only.
import { one, report, compact } from './check.mts';
import { show, patient, claimsOf } from './lib.mts';
const ALIKE: Record<string, string[]> = { '0': ['O', '٠'], '1': ['l', 'I'], '2': ['Z', 'ꛯ'], '3': ['E'], '4': ['٤'], '5': ['S'], '6': ['b'], '7': ['٧'], '8': ['B'], '9': ['٩'] };
const writings = (id: string) => { const out: string[] = []; [...id].forEach((ch, i) => { if (i > 0) for (const a of ALIKE[ch] ?? []) out.push(id.slice(0, i) + a + id.slice(i + 1)); }); return out; };
const sets: { ids: string[]; claims: string[][]; target: string }[] = [
  { ids: ['ZZ19800314'], claims: [['SYNCLAIM0001']], target: 'ZZ19800314' }, { ids: ['ZZ19800314', '800314'], claims: [['SYNCLAIM0001']], target: 'ZZ19800314' },
  { ids: ['ZZ7654321', '7654321'], claims: [['SYNCLAIM0001']], target: 'ZZ7654321' }, { ids: ['7654321', '76543210'], claims: [['SYNCLAIM0001']], target: '76543210' },
  { ids: ['SYNMEMBER0042'], claims: [['SYN4455667', '4455667']], target: 'SYN4455667' }, { ids: ['SYNMEMBER0042'], claims: [['SYN4455667']], target: 'SYN4455667' },
];
const gaps = [' ', '\n', ' \n', '-', ': ', ', ', '', '.', '\t', ' - ', '/', '_', '|', '#', '​', ' '];
const numbers = ['555-0123', '555 0123', '5550123', '555‑0147', '555-0199 ext 12', '555.0123'];
const inners = [(c: string) => undefined, (c: string) => c.slice(-4), (c: string) => c.slice(0, 3), (c: string) => c.slice(1, 5)];
let k = 0; const t0 = Date.now(); const STRIDE = Number(process.argv[2] ?? 3); const PHASE = Number(process.argv[3] ?? 0); let all = 0;
outer: for (const s of sets) for (const w of writings(s.target)) for (const gap of gaps) for (const num of numbers) for (const [ii, inner] of inners.entries()) for (const where of ['member', 'claim']) {
  if (ii === 0 && where === 'claim') continue;
  all += 1; if ((all * 2654435761 >>> 8) % STRIDE !== PHASE) continue; if (Date.now() - t0 > 140_000) { console.log('time limit at', all); break outer; }
  k += 1; const c = compact(num.replace(/ ext.*/, '')); const add = inner(c);
  const ids = add !== undefined && where === 'member' ? [...s.ids, add] : s.ids; const cl = add !== undefined && where === 'claim' ? [...s.claims.slice(0, -1), [...(s.claims.at(-1) as string[]), add]] : s.claims;
  const lead = ['ID ', 'Member ID: ', 'Claim ', ''][k % 4]; const end = ['', ' Paid', '\nPaid in full.'][k % 3];
  one(`${lead}${w}${gap}${num}${end}`, patient(ids), claimsOf(cl), [c], ii === 0 ? 'no-own-inside' : `own-inside-${['', 'last4', 'first3', 'mid4'][ii]}`);
}
console.log('enumerated', all, 'run', k); report('## family2:');
const P0 = patient(['ZZ19800314']); const C0 = claimsOf([['SYNCLAIM0001']]);
show('s1 date of birth of the call inside the number (yymmdd 550123)', 'Member ID: ZZ1980O314\n555-0123\nPaid in full.', patient(['ZZ19800314'], ['JANE Q ZEPHYRA'], ['1955-01-23']), C0, ['5550123']);
show('s2 name in digits glued after a phone', 'Call 202-555-0123PHYRA today', P0, C0, ['2025550123']);
show('s3 pattern over two own', 'ID ZZ1980O314 555-7654E210', patient(['ZZ19800314', '76543210']), C0, ['5557654', '3145557654']);
show('s4 claim placeholder beside digits', 'Claim SYN445S667-555-0123 2345', patient(['ZZ7654321']), claimsOf([['SYN4455667']]), ['5550123', '15550123', '6675550123']);
show('s5 number before, own inside', 'Tel 202-555-7654E210', patient(['76543210', '555']), C0, ['202555', '2025557654']);
show('s6 held ending', 'Member ID: ZZ1980O314\n555-0123\nSeen 01/01/2020-150.00Paid in full. ', P0, C0, ['5550123']);
show('s7 SSN tail after own', 'ID ZZ1980O900-12-3456', patient(['ZZ19800900', '3456']), C0, ['900123456', '123456']);
show('s8 own inside is a claim of the second claim', 'Member ID: ZZ1980O314\n555-0123', P0, claimsOf([['SYNCLAIM0001'], ['0123']]), ['5550123']);
