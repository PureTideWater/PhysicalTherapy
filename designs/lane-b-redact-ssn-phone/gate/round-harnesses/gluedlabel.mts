// Synthetic only. The held birth-label rule with the label glued to a range's end (digit or word before it), vs a space.
import { readFileSync, writeFileSync } from 'node:fs';
import { A, B, run } from './lib.mts';
const res = JSON.parse(readFileSync('/home/user/rg-cand-b/packages/model-gateway/src/redact.residuals.json', 'utf8'));
const rows = res.ownIdentifierA.filter((r: any) => r.gate.endsWith('dob'));
const toks = [...new Map(rows.map((r: any) => [r.token + '|' + res.patients[r.p].datesOfBirth[0], { t: r.token, dob: res.patients[r.p].datesOfBirth[0] }])).values()] as { t: string; dob: string }[];
const LABELS = ['DOB ', 'DOB: ', 'D/O/B ', 'Born ', 'Birthdate ', 'Date of birth: ', 'DOB'];
const PRE = ['Seen 01/01/2020-150.00', 'Paid $0,000.00. Service 01/01/2020-01/02/2020', 'Seen 01/01/2020-150.00Paid', 'Service 2020-01-01-150.00'];
let n = 0; const out: any[] = []; const by: Record<string, number> = {};
for (const { t, dob } of toks) {
  const p = { names: ['JANE Q ZEPHYRA'], dob };
  for (const lab of LABELS) for (const pre of PRE) {
    const glued = `${pre}${lab}${t} in full.`, spaced = `${pre} ${lab}${t} in full.`;
    n++;
    const a = run(A, glued, p), b = run(B, glued, p), bs = run(B, spaced, p);
    if (a === 'REFUSED' && b === glued) { const k = bs === 'REFUSED' ? 'glued SENT, spaced REFUSED' : 'glued SENT, spaced SENT'; by[k] = (by[k] ?? 0) + 1; out.push({ t, dob, glued, bs: bs === 'REFUSED' ? 'REFUSED' : 'SENT', k }); }
  }
}
writeFileSync(process.argv[2]!, out.map((o) => JSON.stringify(o)).join('\n') + '\n');
console.log('tokens', toks.length, 'letters', n, by);
