// node census.mjs <gate corpus dir>: the gate's patients' digits-only numbers by length, and how many stored values
// hold a separator (a number) or a character the records' name split does not read (a name).
import fs from 'node:fs';
const p = JSON.parse(fs.readFileSync(`${process.argv[2]}/patients.json`, 'utf8'));
const L = { member: {}, claim: {} }; let withDigits = 0, separated = 0, names = 0;
for (const { P, C } of p) { let any = false;
  for (const [kind, values] of [['member', P.memberIds], ['claim', C.flatMap((c) => c.claimNumbers)]]) for (const v of values) { if (/[^\p{L}\p{N}]/u.test(v)) separated += 1; const c = v.normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, ''); if (/^\p{N}+$/u.test(c)) { any = true; L[kind][[...c].length] = (L[kind][[...c].length] ?? 0) + 1; } }
  for (const v of P.names) if (/[^\p{L}\p{N}\s,;/\p{Pd}'.’_]/u.test(v)) names += 1; if (any) withDigits += 1; }
console.log(`patients ${p.length}; with a digits-only number ${withDigits}; digits-only by length ${JSON.stringify(L)}; numbers held with a separator ${separated}; names held with a character the split does not read ${names}`);
