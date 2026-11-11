// node flips.mts <files...>: every flip record of the ready-made fuzzers (their .jsonl records, or the FLIP lines fuzz1/fuzz2 print), on head,
// before, base and on the head with listNumberAt taken out of survivorIn (patched/redact-a.ts, written by mech.mts). EXTRA: letters of my own.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { TREES, claims } from './lib.mts';
const paths: Record<string, string> = { ...TREES, noA: '/home/user/review-g1/patched/redact-a.ts' };
const mods: Record<string, any> = {};
for (const [k, p] of Object.entries(paths)) mods[k] = await import(pathToFileURL(p).href);
const PATIENTS: Record<string, any> = JSON.parse(process.env.PATIENTS ?? '{}');
const fallback = { pseudonym: 'p', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1975-05-02'], memberIds: ['SYNMEMBER0042'] };
const seen = new Set<string>();
const tally: Record<string, number> = {};
let cut = 0;
const run = (label: string, letter: string, pat: any) => {
  const row = Object.keys(paths).map((k) => { const R = mods[k]; const s = R.redactLetterForScreen(letter, pat, claims); return `${k}:${R.holdsIdentifier(s.text, pat, claims) ? 'R' : 'S'}`; }).join(' ');
  tally[row] = (tally[row] ?? 0) + 1;
  console.log(`${label}  ${row}  ${JSON.stringify(letter).slice(0, 170)}`);
};
for (const file of process.argv.slice(2)) {
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    let letter: string | null = null, who = '';
    if (line.startsWith('{')) { try { const o = JSON.parse(line); if (/flip/i.test(o.k ?? '') && typeof o.t === 'string') { letter = o.t; who = `${o.k}/${o.who ?? ''}`; } } catch { cut += 1; } }
    const m = /^FLIP ("(?:[^"\\]|\\.)*") => /u.exec(line);
    if (m) { letter = JSON.parse(m[1]!); who = 'FLIP'; }
    if (letter === null || seen.has(letter)) continue;
    seen.add(letter);
    run(`${file.split('/').pop()} ${who}`, letter, PATIENTS[who.split('/')[1] ?? ''] ?? fallback);
  }
}
console.log(`records that did not parse: ${cut}; tally: ${JSON.stringify(tally)}`);
for (const letter of JSON.parse(process.env.EXTRA ?? '[]')) run('extra', letter, { pseudonym: 'p', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['ZZ7654321'] });
