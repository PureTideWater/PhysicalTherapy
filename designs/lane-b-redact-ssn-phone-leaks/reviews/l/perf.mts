// Reviewer L: cost of the new filter (glued x own) on long letters, head against before, relative. Synthetic twins only.
import { pathToFileURL } from 'node:url';
const S = 'packages/model-gateway/src/redact.ts';
const HEAD = await import(pathToFileURL(`/home/user/fix/${S}`).href);
const BF = await import(pathToFileURL(`/home/user/work/p17/before/${S}`).href);
const P = { pseudonym: 'p', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['ZZ7654321', '7654321'] };
const C = [{ claimId: 'c', patientPseudonym: 'p', claimNumbers: ['SYNCLAIM0001'] }];
const rep = (s: string, n: number) => Array.from({ length: n }, (_, i) => s.replace('%', String(i % 90 + 10))).join('');
const letters: Record<string, (n: number) => string> = {
  'covered runs, each with a date after': (n) => rep('ID ZZ76543ꛯ1\n01-02-2020 line % paid.\n', n),
  'uncovered runs + plain IDs + names': (n) => rep('ID 9ZZ76543ꛯ1 x ZZ7654321 Zephyra line %.\n', n),
  'uncovered runs, each with a date after': (n) => rep('ID ZZ76543ꛯ1X\n01-02-2020 line %.\n', n),
  'half covered, half uncovered, phones': (n) => rep('ZZ765٤321 555 0123, 9ZZ7654৩21 555 0123; ', Math.ceil(n / 2)),
};
const time = (M: any, t: string) => { const t0 = process.hrtime.bigint(); const s = M.redactLetterForScreen(t, P, C); const r = M.holdsIdentifier(s.text, P, C); return { ms: Number(process.hrtime.bigint() - t0) / 1e6, r, len: s.text.length }; };
for (const [name, make] of Object.entries(letters)) for (const n of [250, 500, 1000, 2000]) {
  const t = make(n); const a1 = time(BF, t); const h1 = time(HEAD, t); const h2 = time(HEAD, t); const a2 = time(BF, t);
  const hm = Math.min(h1.ms, h2.ms); const bm = Math.min(a1.ms, a2.ms);
  console.log(`${name.padEnd(42)} tokens=${String(n).padStart(4)} chars=${String(t.length).padStart(6)} before=${bm.toFixed(0).padStart(6)}ms head=${hm.toFixed(0).padStart(6)}ms head/before=${(hm / bm).toFixed(2)} refused: before=${a1.r} head=${h1.r} same-text=${a1.len === h1.len}`);
}
