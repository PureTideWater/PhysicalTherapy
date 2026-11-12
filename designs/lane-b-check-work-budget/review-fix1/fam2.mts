// One family per fresh process: tsx fam.mts <family>. Lifted-budget copy of the working tree via the earlier harness. Synthetic data only.
import fs from 'node:fs';
import { calib, fit, line, rep, timed, who } from '/home/user/review-fix1/lib2.mts';
const fam = process.argv[2] ?? ''; const W = Number(process.env.WORDS ?? 3);
const L = 'BCDFGHJKLMNPQRSTVWXZ';
const part = (i: number) => L[i % 20]! + L[Math.floor(i / 20) % 20]! + L[Math.floor(i / 400) % 20]! + (i >= 8000 ? L[Math.floor(i / 8000) % 20]! : '');
const namesOf = (count: number, words: number) => Array.from({ length: count }, (_, n) => Array.from({ length: words }, (_, w) => [0, 1, 2].map((p) => part((n * words + w) * 3 + p)).join('-')).join(' '));
const members = Array.from({ length: 1000 }, (_, i) => `ZZ-${1000000 + i * 7}-0${i % 10}`);
const syn = Array.from({ length: 5000 }, (_, i) => `SYN${556000 + i}`);
const syn40 = Array.from({ length: 5000 }, (_, i) => `SYN${String(556000 + i)}${'0918273645QWRTYPSDFGHJKLZXCVBNM'.slice(0, 31)}`);
const one = (n: string[]) => [{ claimId: 'c1', patientPseudonym: 'p1', claimNumbers: n }] as any;
const across = (n: string[]) => n.map((x, i) => ({ claimId: `c${i}`, patientPseudonym: 'p1', claimNumbers: [x] })) as any;
const prose = rep('The claim was reviewed and paid in full by the plan. ');
const n12 = namesOf(50, 12); const n40 = namesOf(50, 40);
const seq = (items: string[]) => (n: number) => { let s = ''; for (let i = 0; s.length < n; i++) s += items[i % items.length]! + ' '; return s.slice(0, n); };
const F: Record<string, [any, any, (n: number) => string]> = {
  'names50 plainwords prose': [who(Array.from({ length: 50 }, (_, n) => Array.from({ length: W }, (_, w) => part(n * W + w) + part(4000 + n * W + w)).join(' '))), one(['SYN555001']), prose],
  'names50x12 prose': [who(n12), one(['SYN555001']), prose],
  'names50x12 prefix2': [who(n12), one(['SYN555001']), seq(Array.from({ length: 1800 }, (_, i) => part(i).slice(0, 2)))],
  'names50x12 parts(matches)': [who(n12), one(['SYN555001']), seq(Array.from({ length: 1800 }, (_, i) => part((i * 7) % 1800)))],
  'names50x12 wordsoutoforder': [who(n12), one(['SYN555001']), seq(n12.flatMap((n) => n.split(' ')).reverse())],
  'names50x40 prose': [who(n40), one(['SYN555001']), prose],
  'names50x12 yensemi': [who(n12), one(['SYN555001']), rep('㏾;')],
  'yensemi 1 claim (earlier dearest)': [who(), one(['SYN555001']), rep('㏾;')],
  'members1000 prose': [who(undefined, members), one(['SYN555001']), prose],
  'members1000 digitLF': [who(undefined, members), one(['SYN555001']), rep('5\n')],
  'members1000 nearmiss': [who(undefined, members), one(['SYN555001']), seq(members.map((m) => m.slice(0, 9)))],
  'members1000 nearmiss-nosep': [who(undefined, members), one(['SYN555001']), seq(members.map((m) => m.replace(/-/g, '').slice(0, 8)))],
  'claims5000 one prose': [who(), one(syn), prose],
  'claims5000 across prose': [who(), across(syn), prose],
  'claims5000 one tok9': [who(), one(syn), rep('QXN99887B ')],
  'claims5000 one nearmiss': [who(), one(syn), seq(syn.map((m) => m.slice(0, 8)))],
  'claims5000x40 prose': [who(), one(syn40), prose],
  'claims5000x40 nearmiss39': [who(), one(syn40), seq(syn40.map((m) => m.slice(0, 39)))],
  'claims5000x40 across nearmiss39': [who(), across(syn40), seq(syn40.map((m) => m.slice(0, 39)))],
  'allmax prose': [who(n12, members), one(syn40), prose],
  'allmax across yensemi': [who(n12, members), across(syn40), rep('㏾;')],
};
const log = (s: string) => { console.log(s); fs.appendFileSync('/home/user/review-fix1/out/trial.txt', s + '\n'); };
if (fam.startsWith('tiny ')) { // not sized: the least letter, the most identifiers (the cost no letter length buys down)
  const [p, c] = F[fam.slice(5)]!; const text = 'The claim was paid.';
  timed(text, p, c, 1); const c1 = await calib(); const g = timed(text, p, c, 3); const c2 = await calib();
  log(line(fam, text.length, g, Math.min(c1, c2)) + `  [cal ${c1.toFixed(0)}/${c2.toFixed(0)}]`);
} else {
  const [p, c, gen] = F[fam]!; const f = fit(gen, p, c);
  if (f === null) { log(`${fam.padEnd(26)} not fitted`); } else { const text = gen(f.n); const c1 = await calib(); const g = timed(text, p, c, 3); const c2 = await calib(); log(line(fam, text.length, g, Math.min(c1, c2)) + `  [cal ${c1.toFixed(0)}/${c2.toFixed(0)}]`); }
}
if (process.argv[3] === 'list') console.log(Object.keys(F).join('\n'));
