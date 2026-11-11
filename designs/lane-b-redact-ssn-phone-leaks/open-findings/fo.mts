import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const S = 'packages/model-gateway/src/redact.ts';
const K = await import(pathToFileURL(`/home/user/leaks/${S}`).href);
const J = await import(pathToFileURL(`/home/user/work/p16/before/${S}`).href);
const B = await import(pathToFileURL(`/home/user/tree-ef3/${S}`).href);
const o = JSON.parse(fs.readFileSync('flipown.json', 'utf8'));
const M = { pseudonym: 'p', names: ['JUNE MARCH'], datesOfBirth: ['1975-05-02'], memberIds: ['SYNMEMBER0042'] };
const D = { pseudonym: 'p', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['SYNMEMBER0042'] };
const C = [{ claimId: 'c', patientPseudonym: 'p', claimNumbers: ['SYNCLAIM0001'] }];
const run = (R: any, t: string, P: any) => { const s = R.redactLetterForScreen(t, P, C).text; return R.holdsIdentifier(s, P, C) ? 'REFUSED' : JSON.stringify(s); };
console.log('letter', JSON.stringify(o.t));
console.log('K (M):', run(K, o.t, M).slice(0, 400)); console.log('J (M):', run(J, o.t, M).slice(0, 80)); console.log('B (M):', run(B, o.t, M).slice(0, 80));
for (const t of ['Faxes 5 (home): SYN/MEMB+ER0042; paid.', 'ID SYN/MEMB+ER0042', 'Member ID SYN/MEMB+ER0042 on file.']) {
  console.log(JSON.stringify(t)); for (const [n, R] of [['K', K], ['J', J], ['B', B]] as const) console.log('  ', n, '(D):', run(R, t, D), '| (M):', run(R, t, M));
}
// which month-word pieces make the base refuse this letter for M: the letter with the name's words taken out
const noName = o.t.replace(/June|March/g, 'Xxxx');
console.log('no month words, B (M):', run(B, noName, M).slice(0, 60), '| K (M):', run(K, noName, M).slice(0, 60));
