// Synthetic only. The call's own NUMERIC (and short alphanumeric) member IDs and claim numbers in held frames, with
// separators, labels, invisibles and line breaks. Hit: A refused or redacted, B sends every digit in order with at most
// separators between. Class by the no-range twin (B hides it there = NOT-A').
import { readFileSync, writeFileSync } from 'node:fs';
import { A, B, run } from './lib.mts';
const all: string[] = JSON.parse(readFileSync(process.argv[2]!, 'utf8'));
const frames = all.filter((_, i) => i % 4 === 0);
const norange = (f: string) => f.replace(/(01\/01\/2020|1\/1\/20|2020-01-01|01\.01\.2020|Jan 1, 2020|03\/01\/2020)\s*[-–—−‐]\s*\n?(?:\$?150\.00|\$?120\.00|\$45\.00|01\/02\/2020|1\/2\/20|2020-01-02|01\.02\.2020|Jan 2, 2020|03\/05\/2020)/u, '$1 ').replace(/\$?150\.00-\$?120\.00/u, '150.00 ');
type P = { members?: string[]; claims?: string[] };
const ids: [string, P, string[]][] = [
  ['12345678', { claims: ['12345678'] }, ['12345678', '1234-5678', '12 345 678', 'Claim #12345678', 'ICN 12345678', '1234​5678', '1234\n5678', '12345678.', '#12345678', '12-34-56-78', '1234.5678', '1234/5678']],
  ['2026000417', { claims: ['2026000417'] }, ['2026000417', '2026-000417', '2026 000 417', 'Claim 2026000417', '2026/000417', '2026­000417']],
  ['031561', { members: ['031561'] }, ['031561', '03-15-61', '03 15 61', 'Member 031561', '03/15/61', '0315\n61']],
  ['W1234567', { members: ['W1234567'] }, ['W1234567', 'W-1234567', 'w1234567', 'W 123 4567', 'ID W1234567', 'W123​4567']],
  ['55500177', { claims: ['55500177'] }, ['55500177', '555-00177', '$555001.77', '555 00177']],
];
const out: string[] = []; const by: Record<string, number> = {}; let n = 0;
const digitsOf = (s: string) => s.normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '').toUpperCase();
for (const [id, extra, forms] of ids) {
  const p = { names: ['JANE Q ZEPHYRA'], members: extra.members ?? ['SYNMEMBER0042'], claims: extra.claims ?? ['SYNCLAIM0001'] };
  const want = id.toUpperCase();
  const clear = (x: string) => x !== 'REFUSED' && digitsOf(x).includes(want);
  for (const t of forms) for (const f of frames) {
    const l = f.replace('{T}', t); n++;
    const a = run(A, l, p), b = run(B, l, p);
    if (!(clear(b) && !clear(a))) continue;
    const nr = norange(f).replace('{T}', t);
    const aNR = run(A, nr, p), bNR = run(B, nr, p);
    const cls = nr === l ? 'no-twin' : clear(bNR) ? (clear(aNR) ? 'A-like' : 'NOT-A(A)') : 'NOT-A(B)';
    const k = `${id} ${JSON.stringify(t)} ${cls}`; by[k] = (by[k] ?? 0) + 1;
    out.push(JSON.stringify({ id, t, l, a: a === 'REFUSED' ? a : a, b: b === l ? 'SENT' : b, nr, bNR: bNR === nr ? 'SENT' : bNR, aNR: aNR === nr ? 'SENT' : aNR, cls }));
  }
}
writeFileSync(process.argv[3]!, out.join('\n') + '\n');
console.log('frames', frames.length, 'letters', n, 'hits', out.length); for (const [k, v] of Object.entries(by)) console.log(v, k);
