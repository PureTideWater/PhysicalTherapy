// node surface.mts <gate corpus dir>: Queues item 34, the surface a digits-only number (or piece of one) of L digits
// could meet in a letter as written, with no reader run: (glued) a run of digits, a number's own joiners between them,
// with a letter right before it (its first L digits) or right after it (its last L); (whole) L digits standing as whole
// groups between characters that are no letter and no digit. Over: the repository's synthetic prose (as item 26's
// scripts/cost-names.mts gathers it), the gate's T3 letters (codes, units, amounts, dates, IDs beside a name) and all
// the gate's letters. Printed per L: texts with any, distinct values, the expected texts for a random number of L digits
// (places / 10^L) and the commonest values.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
const ROOT = '/home/user/PhysicalTherapy';
const JOIN = "\\s\\p{Pd}\\u2212\\u2043\\u02D7\\u2796_|\\\\\\u00AD'\\u2018\\u2019\\u02BC\\u02B9\\u02CA\\u2032\\u2035`~\\u00B7\\u2027\\u2219\\u22C5\\u30FB\\u2022;\"\\u201C\\u201D"; // redact.ts NUMBER_JOINERS
const RUN = new RegExp(`\\p{N}(?:[${JOIN}]*\\p{N})*`, 'gu');
const LENGTHS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const isL = (c: string | undefined) => c !== undefined && /\p{L}/u.test(c);
type Tally = Record<number, { texts: number; places: number; values: Map<string, number> }>;
const tally = (): Tally => Object.fromEntries(LENGTHS.map((L) => [L, { texts: 0, places: 0, values: new Map() }]));
const sets: Record<string, { n: number; glued: Tally; whole: Tally }> = {};
function read(scope: string, raw: string) {
  const s = (sets[scope] ??= { n: 0, glued: tally(), whole: tally() }); s.n += 1;
  const text = raw.normalize('NFKC');
  const glued = new Map<number, Set<string>>(); const whole = new Map<number, Set<string>>();
  const add = (m: Map<number, Set<string>>, L: number, v: string) => { const set = m.get(L) ?? new Set<string>(); m.set(L, set); set.add(v); };
  for (const run of text.matchAll(RUN)) {
    const before = isL(text[run.index - 1]); const after = isL(text[run.index + run[0].length]);
    const groups = run[0].split(/\P{N}+/u); const digits = groups.join('');
    for (const L of LENGTHS) { if (digits.length < L) break; if (before) add(glued, L, digits.slice(0, L)); if (after) add(glued, L, digits.slice(-L)); }
    for (let i = 0; i < groups.length; i += 1) { if (i === 0 && before) continue; let joined = ''; for (let j = i; j < groups.length && joined.length < 12; j += 1) { joined += groups[j]; if (j === groups.length - 1 && after) break; if (joined.length >= 2 && joined.length <= 12) add(whole, joined.length, joined); } }
  }
  for (const [kind, mine] of [['glued', glued], ['whole', whole]] as const) for (const [L, set] of mine) { const t = s[kind][L]!; t.texts += 1; t.places += set.size; for (const v of set) t.values.set(v, (t.values.get(v) ?? 0) + 1); }
}
const walk = (dir: string) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (/\.(txt|md)$/.test(e.name) && fs.statSync(p).size < 400_000) read('prose', fs.readFileSync(p, 'utf8')); } };
walk(`${ROOT}/fixtures/synthetic`);
for (const f of ['packages/synth/src/eval/narrative-set.ts', 'packages/model-gateway/src/functions/denial-letter.test.ts', 'packages/model-gateway/src/functions/narrative.test.ts', 'packages/model-gateway/src/redact.test.ts']) for (const m of fs.readFileSync(`${ROOT}/${f}`, 'utf8').matchAll(/'((?:[^'\\\n]|\\.){40,})'|`((?:[^`\\]|\\.){40,})`/g)) read('prose', (m[1] ?? m[2] ?? '').replace(/\\n/g, '\n').replace(/\\'/g, "'"));
const corpus = process.argv[2]!;
for (let shard = 0; shard < 8; shard += 1) for (const line of zlib.gunzipSync(fs.readFileSync(path.join(corpus, `shard-${shard}.jsonl.gz`))).toString('utf8').split('\n')) { if (line === '') continue; const rec = JSON.parse(line) as { s: string; t: string }; read('gate, all', rec.t); if (rec.s.startsWith('T3/')) read('gate, T3', rec.t); }
for (const [scope, s] of Object.entries(sets)) for (const kind of ['glued', 'whole'] as const) {
  console.log(`\n## ${scope} (${s.n} texts), ${kind}`);
  for (const L of LENGTHS) { const t = s[kind][L]!; const top = [...t.values].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([v, c]) => `${v}x${c}`).join(' '); console.log(`L=${L} | texts ${t.texts} | distinct ${t.values.size} | expected for a random number ${(t.places / 10 ** L).toFixed(4)} | ${top}`); }
}
