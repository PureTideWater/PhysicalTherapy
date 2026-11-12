// Families sized to just under the budget, timed (min of 3 after the fitting runs as warm-up), calibration beside each.
import fs from 'node:fs';
import { claimsOf, fitAndTime, rep, who } from './lib.mts';
const group = process.argv[2] ?? '1';
const out = `/home/user/review-time/out/special-${group}${process.env.PART ?? ''}.txt`;
fs.writeFileSync(out, `node ${process.version} group ${group}\n`);
const log = (s: string) => { console.log(s); fs.appendFileSync(out, s + '\n'); };
const P = who(); const C = claimsOf();
type Fam = [string, (n: number) => string, any?, any?];
const fams: Fam[] = [];
if (group === '1') {
  const units: [string, string][] = [
    ['plain a', 'a'], ['plain "a "', 'a '], ['prose nodigit', 'The claim was reviewed and paid in full by the plan. '], ['spaces', ' '], ['newlines', '\n'], ['dots', '.'], ['brackets [', '['], ['brackets ][', ']['],
    ['e+acute', 'é'], ['a+8 marks', 'à́̂̃̄̆̇̈ '], ['zwsp only', '​'], ['shy only', '­'], ['cyrillic kha', 'х'], ['cyrillic word', 'хорошо '], ['fullwidth J', 'Ｊ '],
    ['initials no name', 'J '], ['name repeated', 'Zephyra '], ['full name repeated', 'Jane Q Zephyra '], ['member id rep', 'ZZ1234567 '], ['claim no rep', 'SYN555001 '], ['dob rep', '03/03/1961 '],
    ['[PATIENT_NAME] rep', '[PATIENT_NAME] '], ['[CLAIM_1] rep', '[CLAIM_1] '], ['[CLAIM_7654321] rep', '[CLAIM_7654321] '], ['[SSN] rep', '[SSN] '],
    ['U+FDFA', 'ﷺ'], ['U+FDFA sp', 'ﷺ '], ['U+3300', '㌀'], ['U+2488 1. LF', '⒈\n'], ['U+2474 (1) sp', '⑴ '], ['U+33FE 31day LF', '㏾\n'], ['half sp', '½ '], ['U+FDFB', 'ﷻ'], ['U+3250 PTE', '㉐ '], ['ligature ffi word', 'eﬃcient '],
    ['caps words', 'Zebra Quartz Jam '], ['upper J words', 'JQZ '], ['J. Q. Z.', 'J. Q. Z. '], ['hyphen caps', 'Jane-Zephyra-'], ['apostrophes', "Z'e'p'h'y'r'a "], ['middots', 'Z·e·p·h '],
  ];
  units.forEach(([name, u], i) => { if (process.env.PART === undefined || i % 2 === Number(process.env.PART)) fams.push([name, rep(u)]); });
}
if (group === '2') {
  fams.push(['ct2 (name, initials, kha)', (n) => 'Zephyra' + ' J'.repeat(Math.max(1, Math.floor((n - 9) / 2))) + ' х']);
  fams.push(['ct2 joiner', (n) => 'Zeph∙yra Zephyra' + ' J'.repeat(Math.max(1, Math.floor((n - 18) / 2))) + ' х']);
  fams.push(['mix initials+digitLF', (n) => 'Zephyra' + ' J'.repeat(Math.floor(n * 0.15)) + ' х ' + '5\n'.repeat(Math.floor(n * 0.35))]);
  fams.push(['mix initials+zwsp+digit', rep('J​​​ J 5\n', 'Zeph∙yra Zephyra х ')]);
  fams.push(['mix name joiner digit', rep('Zeph∙yra J. 5-\n')]);
  fams.push(['mix arabic LS fdfa', rep('٥ ﷺ')]);
  fams.push(['mix lookalike name digits', rep('Zерhуrа J 5\n​')]);
  fams.push(['mix dob initials', rep('J 3/3/61 Q 5\n', 'Zephyra ')]);
  fams.push(['mix all', rep('Zeph­yra J​ Q. х 5\n 3-3-61 ٥\u0085', 'Zephyra ')]);
  const prose = rep('The claim was reviewed and paid in full by the plan. ');
  const proseD = rep('Claim 2026-11-01 was paid $150.00 for 97110, 2 units.\n');
  const many = (k: number) => claimsOf(Array.from({ length: k }, (_, i) => `SYN${String(556000 + i)}`));
  const manyC = (k: number) => Array.from({ length: k }, (_, i) => ({ claimId: `c${i}`, patientPseudonym: 'p1', claimNumbers: [`SYN${String(556000 + i)}`] })) as any;
  fams.push(['prose, 1 claim', prose]);
  fams.push(['prose, 30 numbers 1 claim', prose, P, many(30)]);
  fams.push(['prose, 30 claims', prose, P, manyC(30)]);
  fams.push(['prose, 200 claims', prose, P, manyC(200)]);
  fams.push(['proseD, 200 claims', proseD, P, manyC(200)]);
  fams.push(['prose, 1000 claims', prose, P, manyC(1000)]);
  fams.push(['prose, 6 names', prose, who(['JANE Q ZEPHYRA', 'JANIE ZEPHYRA-QUILL', 'J Q ZEPHYRA', 'JANE QUINCE ZEPHYRA', 'ZEPHYRA JANE', 'JAYNE ZEPHIRA']), C]);
  fams.push(['prose, 20 member ids', prose, who(['JANE Q ZEPHYRA'], Array.from({ length: 20 }, (_, i) => `ZZ${String(1234500 + i)}`)), C]);
  fams.push(['prose, 40-char ids', prose, who(['JANE Q ZEPHYRA'], ['ZZ12345678901234567890123456789012345678']), claimsOf(['SYN5550011234567890123456789012345678901'])]);
  fams.push(['prose, 8-part name', prose, who(['JANE QUINCE ANNA MARIA LOUISA BEATRIX VAN ZEPHYRA']), C]);
  fams.push(['initials, 8-part name', rep('J Q A M L B V ', 'Zephyra '), who(['JANE QUINCE ANNA MARIA LOUISA BEATRIX VAN ZEPHYRA']), C]);
}
if (group === '3' || group === '4') {
  const { rows } = await import('./rowsdef.mts');
  const mine = (rows as [string, string[], string, string[]][]).filter(([name]) => !name.startsWith('ct2') || name === 'ct2plain').filter((_, i) => (i % 2 === 0) === (group === '3'));
  for (const [name, names, text, nums] of mine) fams.push([`row ${name}`, (n) => (n <= text.length ? text.slice(0, n) : text.repeat(Math.ceil(n / text.length)).slice(0, n)), who(names), claimsOf(nums)]);
}
const started = Date.now();
for (const [name, gen, p, c] of fams) {
  if (Date.now() - started > Number(process.env.LIMIT_S ?? 270) * 1000) { log(`${name} SKIPPED (time)`); continue; }
  try { await fitAndTime(name, gen, p ?? P, c ?? C, log); } catch (e) { log(`${name} ERROR ${(e as Error).message.slice(0, 80)}`); }
}
log('done');
