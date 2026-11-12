// One family per fresh process: tsx claims.mts <shape> <claims> ; appended to out/claims.txt.
import fs from 'node:fs';
import { claimsOf, fitAndTime, rep, who } from './lib.mts';
const [shape = 'prose', k = '200'] = process.argv.slice(2);
const K = Number(k);
const C = K === 1 ? claimsOf() : (Array.from({ length: K }, (_, i) => ({ claimId: `c${i}`, patientPseudonym: 'p1', claimNumbers: [`SYN${String(556000 + i)}`] })) as any);
const gens: Record<string, (n: number) => string> = { prose: rep('The claim was reviewed and paid in full by the plan. '), yen: rep('㏾,'), yensemi: rep('㏾;'), asemi: rep('a;', 'Zeph∙yra Zephyra '), digitLF: rep('5\n') };
await fitAndTime(`${shape}, ${K} claim(s), fresh process${process.env.FIX ? ` WITH TRIAL CHARGE w=${process.env.FIX}` : ""}`, gens[shape] as any, who(), C, (s) => { console.log(s); fs.appendFileSync('/home/user/review-time/out/claims.txt', s + '\n'); });
