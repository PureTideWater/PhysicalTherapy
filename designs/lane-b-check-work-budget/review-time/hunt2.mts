// Follow-up of the dearest families (digits beside a CJK letter from one compatibility character) and of the claims list.
import fs from 'node:fs';
import { claimsOf, fitAndTime, rep, who } from './lib.mts';
const part = process.argv[2] ?? 'a';
const out = `/home/user/review-time/out/hunt2-${part}.txt`;
fs.writeFileSync(out, `node ${process.version}\n`);
const log = (s: string) => { console.log(s); fs.appendFileSync(out, s + '\n'); };
const P = who(); const C = claimsOf();
const manyC = (k: number, per = 1) => Array.from({ length: k }, (_, i) => ({ claimId: `c${i}`, patientPseudonym: 'p1', claimNumbers: Array.from({ length: per }, (_, j) => `SYN${String(556000 + i * per + j)}`) })) as any;
const prose = rep('The claim was reviewed and paid in full by the plan. ');
const fams: [string, (n: number) => string, any?, any?][] = part === 'a' ? [
  ['U+33FE comma', rep('㏾,')], ['plain 31日 comma', rep('31日,')], ['plain 31日 LF', rep('31日\n')], ['1日 comma', rep('1日,')], ['U+33E0 comma', rep('㏠,')], ['U+33FE alone', rep('㏾')], ['5x comma', rep('5x,')], ['x5 comma', rep('x5,')],
  ['31é comma', rep('31é,')], ['U+33FE LF name before', rep('㏾\n', 'Zephyra ')], ['U+33FE, held prefix', rep('㏾,', 'Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00. ')], ['U+3358 0点 comma', rep('㍘,')], ['U+32C0 1月 comma', rep('㋀,')], ['1月31日 comma', rep('㋀㏾,')], ['U+33FE ;', rep('㏾;')], ['U+33FE zwsp', rep('㏾​')],
] : [
  ['prose, 50 claims', prose, P, manyC(50)], ['prose, 100 claims', prose, P, manyC(100)], ['prose, 400 claims', prose, P, manyC(400)], ['prose, 700 claims', prose, P, manyC(700)], ['prose, 100 claims x 3 numbers', prose, P, manyC(100, 3)],
  ['U+33FE comma, 30 claims', rep('㏾,'), P, manyC(30)], ['U+33FE comma, 100 claims', rep('㏾,'), P, manyC(100)], ['U+33FE comma, 200 claims', rep('㏾,'), P, manyC(200)], ['U+33FE comma, 400 claims', rep('㏾,'), P, manyC(400)],
  ['a; after name, 200 claims', rep('a;', 'Zeph∙yra Zephyra '), P, manyC(200)], ['prose, 40 names', prose, who(Array.from({ length: 40 }, (_, i) => `JANE ${String.fromCharCode(65 + (i % 26))}${'QUILL'.slice(0, 1 + (i % 5))} ZEPHYRA${i >= 26 ? 'N' : ''}`)), C], ['prose, 200 member ids', prose, who(['JANE Q ZEPHYRA'], Array.from({ length: 200 }, (_, i) => `ZZ${String(1234500 + i)}`)), C],
];
const started = Date.now();
for (const [name, gen, p, c] of fams) { if (Date.now() - started > 255_000) { log(`${name} SKIPPED (time)`); continue; } try { await fitAndTime(name, gen, p ?? P, c ?? C, log); } catch (e) { log(`${name} ERROR ${(e as Error).message.slice(0, 80)}`); } }
log('done');
