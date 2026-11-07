// THE differential gate for Lane B item redact-range-glued. Usage (under the heavy lock; run.sh does this):
//   node gate.mts <treeA> <treeB> <outdir> [--workers 4] [--limit N] [--no-cache] [--skip-timing] [--timing-only]
// A tree is a checkout root (…/packages/model-gateway/src is used) or a src directory holding redact.ts.
// Each tree's redact.ts is loaded by absolute path. Every corpus letter goes through the real path of
// denialLetterSpec.prepare (redactLetterForScreen, then holdsIdentifier on the sent text: refused when it holds an identifier).
// Writes <outdir>/report.json, report.md and hits/<class>.w<k>.jsonl (every hit). Never writes in either tree.
import { Worker } from 'node:worker_threads';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { timingCases } from './timing.mts';

const GATE = path.dirname(new URL(import.meta.url).pathname);
const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(name);
const opt = (name: string, def: number) => { const i = argv.indexOf(name); return i >= 0 ? Number(argv[i + 1]) : def; };
const positional = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && ['--workers', '--limit', '--stride'].includes(argv[i - 1]!)));
if (positional.length < 3) { console.error('usage: node gate.mts <treeA> <treeB> <outdir> [--workers N] [--limit N] [--no-cache] [--skip-timing] [--timing-only]'); process.exit(2); }
const srcOf = (p: string) => { const abs = path.resolve(p); for (const c of [path.join(abs, 'packages/model-gateway/src'), abs]) if (fs.existsSync(path.join(c, 'redact.ts'))) return c; console.error('no redact.ts under a tree'); process.exit(2); };
const srcA = srcOf(positional[0]!), srcB = srcOf(positional[1]!);
const outDir = path.resolve(positional[2]!);
fs.mkdirSync(path.join(outDir, 'hits'), { recursive: true });
for (const f of fs.readdirSync(path.join(outDir, 'hits'))) fs.unlinkSync(path.join(outDir, 'hits', f));
const sha = (f: string) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const shaA = sha(path.join(srcA, 'redact.ts')), shaB = sha(path.join(srcB, 'redact.ts'));
const corpusDir = path.join(GATE, 'corpus');
const manifest = JSON.parse(fs.readFileSync(path.join(corpusDir, 'manifest.json'), 'utf8'));
const W = opt('--workers', 4);
const limit = opt('--limit', 0);
const stride = Math.max(1, opt('--stride', 1));
const t0 = Date.now();

type Hit = { i: number; s: string; t: string; names: string[]; a: string; b: string; note?: string };
const counts: Record<string, number> = {};
const bySource: Record<string, Record<string, number>> = {};
const examplePool: Record<string, Hit[]> = {};
const stats: Record<string, number> = {};

if (!flag('--timing-only')) {
  const shardsOf = (w: number) => Array.from({ length: manifest.shards }, (_, k) => k).filter((k) => k % W === w);
  await Promise.all(Array.from({ length: W }, (_, w) => new Promise<void>((resolve, reject) => {
    const worker = new Worker(new URL('./worker.mts', import.meta.url), { workerData: { srcA, srcB, shaA, shaB, corpus: corpusDir, corpusSha: manifest.sha256, shards: shardsOf(w), cacheDir: flag('--no-cache') ? null : path.join(GATE, 'cache'), outDir, worker: w, limit, stride } });
    worker.on('message', (m) => {
      if (m.progress) process.stderr.write(`worker ${m.progress.worker} shard ${m.progress.shard} done (${m.progress.letters} letters, ${Math.round((Date.now() - t0) / 1000)} s)\n`);
      if (m.done) {
        for (const [k, v] of Object.entries(m.done.counts as Record<string, number>)) counts[k] = (counts[k] ?? 0) + v;
        for (const [k, v] of Object.entries(m.done.bySource as Record<string, Record<string, number>>)) { const g = (bySource[k] ??= {}); for (const [s, n] of Object.entries(v)) g[s] = (g[s] ?? 0) + n; }
        for (const [k, v] of Object.entries(m.done.examples as Record<string, Hit[]>)) (examplePool[k] ??= []).push(...v);
        for (const [k, v] of Object.entries(m.done.stats as Record<string, number>)) stats[k] = (stats[k] ?? 0) + v;
      }
    });
    worker.on('error', reject);
    worker.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('a gate worker failed'))));
  })));
}
const corpusSeconds = Math.round((Date.now() - t0) / 1000);

// Timing: sequential, after the corpus run, on an otherwise idle process.
const timing: { name: string; chars: number; a: number; b: number }[] = [];
if (!flag('--skip-timing')) {
  const modA = await import(pathToFileURL(path.join(srcA, 'redact.ts')).href);
  const modB = await import(pathToFileURL(path.join(srcB, 'redact.ts')).href);
  // Warm each module on small letters first; then one timed run per case and tree, as the tests time it.
  for (const mod of [modA, modB]) for (const c of timingCases().slice(0, 12)) { const t = c.text.slice(0, 2000); const r = mod.redactLetterForScreen(t, c.patient, c.claims); mod.holdsIdentifier(r.text, c.patient, c.claims); }
  const time = (mod: any, c: ReturnType<typeof timingCases>[number]) => { let worst = 0; for (let k = 0; k < 1; k += 1) { const s = performance.now(); const r = mod.redactLetterForScreen(c.text, c.patient, c.claims); mod.holdsIdentifier(r.text, c.patient, c.claims); worst = Math.max(worst, performance.now() - s); } return Math.round(worst); };
  const harvested = fs.existsSync(path.join(corpusDir, 'timing-harvest.json')) ? (JSON.parse(fs.readFileSync(path.join(corpusDir, 'timing-harvest.json'), 'utf8')) as { name: string; text: string; patient: any; claims: any }[]).map((c) => ({ ...c, name: `harvest: ${c.name}` })) : [];
  for (const c of [...timingCases(), ...harvested]) timing.push({ name: c.name, chars: c.text.length, a: time(modA, c), b: time(modB, c) });
}

// Examples: up to 5 per class, shortest first, distinct shapes (digits as 9).
const shape = (t: string) => t.replace(/\p{Nd}/gu, '9');
const examples: Record<string, Hit[]> = {};
for (const [k, pool] of Object.entries(examplePool)) {
  pool.sort((x, y) => x.t.length - y.t.length || x.i - y.i);
  const seen = new Set<string>();
  const pick: Hit[] = [];
  for (const h of pool) { if (seen.has(shape(h.t))) continue; seen.add(shape(h.t)); pick.push(h); if (pick.length >= 5) break; }
  examples[k] = pick;
}
const notes: Record<string, Record<string, number>> = {};
for (const f of fs.readdirSync(path.join(outDir, 'hits'))) {
  const cls = f.replace(/\.w\d+\.jsonl$/, '');
  for (const line of fs.readFileSync(path.join(outDir, 'hits', f), 'utf8').split('\n')) { if (!line) continue; const h = JSON.parse(line) as Hit; if (h.note) { const n = (notes[cls] ??= {}); n[h.note] = (n[h.note] ?? 0) + 1; } }
}

const report = {
  treeA: { src: srcA, redactSha256: shaA }, treeB: { src: srcB, redactSha256: shaB },
  corpus: { letters: manifest.letters, sha256: manifest.sha256, limit: limit || null, stride }, seconds: { corpus: corpusSeconds, total: Math.round((Date.now() - t0) / 1000) },
  stats, counts, notes, bySource, examples,
  timing: { budgetMs: 3000, maxA: Math.max(0, ...timing.map((t) => t.a)), maxB: Math.max(0, ...timing.map((t) => t.b)), overBudgetB: timing.filter((t) => t.b > 3000).map((t) => t.name), cases: timing },
};
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 1));

// Markdown summary.
const SECTIONS: [string, string, string][] = [
  ['PHI.', '(1) PHI: A redacted or refused, B sends it in clear', 'by kind; note = how A protected it'],
  ['KEEP.', '(2) KEEP: B changes or refuses what A sent unchanged', 'changed.<class> = a character of that class B covers and A did not, outside every own identifier'],
  ['UNPLACED.', '(1b) Unplaced: B sends a letter A refused that has 7+ digits after an SSN/phone word but no SSN/phone the oracle can place', 'a fuzz letter of a random 9xx SSN, or a must-stay row after a phone word: judge by the examples and hits file'],
  ['REVERSE.PHI.', '(3a) Reverse PHI: A sent in clear, B redacts or refuses', 'information'],
  ['REVERSE.KEEP.', '(3b) Reverse KEEP: A changed or refused, B sends unchanged', 'information'],
  ['INFO.', 'Information', 'partial-in-clear: some but not all letters/digits of an occurrence sent by B where A sent none'],
];
const md: string[] = [];
md.push(`# Gate report`, '', `- tree A: \`${srcA}\` (redact.ts ${shaA.slice(0, 12)})`, `- tree B: \`${srcB}\` (redact.ts ${shaB.slice(0, 12)})`);
md.push(`- corpus: ${manifest.letters} letters${limit ? ` (limited to ${limit} per shard)` : ''}${stride > 1 ? ` (every ${stride}th letter)` : ''}, sha256 ${manifest.sha256.slice(0, 16)}; ${corpusSeconds} s`);
md.push(`- stats: ${Object.entries(stats).map(([k, v]) => `${k} ${v}`).join(', ')}`, '');
for (const [prefix, title, about] of SECTIONS) {
  const keys = Object.keys(counts).filter((k) => k.startsWith(prefix) && !(prefix === 'PHI.' && k.startsWith('REVERSE')) && !(prefix === 'KEEP.' && k.startsWith('REVERSE'))).sort();
  md.push(`## ${title}`, '', `_${about}_`, '');
  if (keys.length === 0) { md.push('none', ''); continue; }
  for (const k of keys) {
    md.push(`### ${k}: ${counts[k]}`);
    if (notes[k]) {
      const how: Record<string, number> = {};
      for (const [n, c] of Object.entries(notes[k]!)) { const h = n.split(';')[0]!; how[h] = (how[h] ?? 0) + c; }
      md.push(`- how: ${Object.entries(how).sort((x, y) => y[1] - x[1]).map(([n, c]) => `${n} ${c}`).join(', ')}`);
      const glue = Object.entries(notes[k]!).filter(([n]) => n.includes('glued')).sort((x, y) => y[1] - x[1]);
      if (glue.length > 0) md.push(`- glued (left|right: d digit, l lower, u upper, p punct, _ space/end): ${glue.slice(0, 12).map(([n, c]) => `${n.replace(/^.*glued /, '').trim()}${n.startsWith('A refused') || n.startsWith('B refused') ? ' (refused)' : ''} ${c}`).join(', ')}`);
    }
    md.push(`- by source: ${Object.entries(bySource[k] ?? {}).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([s, c]) => `${s} ${c}`).join(', ')}`);
    for (const e of examples[k] ?? []) md.push(`  - ${JSON.stringify(e.t)} [${e.names.join('; ')}] A: ${e.a === 'REFUSED' ? 'REFUSED' : JSON.stringify(e.a)} B: ${e.b === 'REFUSED' ? 'REFUSED' : JSON.stringify(e.b)}`);
    md.push('');
  }
}
md.push('## (4) Timing (ms, one run after a warm-up, redactLetterForScreen + holdsIdentifier)', '', `max A ${report.timing.maxA} ms, max B ${report.timing.maxB} ms, budget 3000 ms; over budget in B: ${report.timing.overBudgetB.length === 0 ? 'none' : report.timing.overBudgetB.join(', ')}`, '');
md.push('| case | chars | A | B |', '|---|---:|---:|---:|');
for (const t of [...timing].sort((x, y) => y.b - x.b)) md.push(`| ${t.name} | ${t.chars} | ${t.a} | ${t.b} |`);
fs.writeFileSync(path.join(outDir, 'report.md'), md.join('\n') + '\n');
const head = (prefix: string) => Object.entries(counts).filter(([k]) => k.startsWith(prefix)).map(([k, v]) => `${k.slice(prefix.length)} ${v}`).join(', ') || 'none';
console.log(`letters ${stats.letters ?? 0} differ ${stats.differ ?? 0} in ${corpusSeconds} s`);
console.log(`PHI: ${head('PHI.')}`);
console.log(`KEEP: ${head('KEEP.')}`);
console.log(`UNPLACED: ${head('UNPLACED.')}`);
console.log(`timing max A ${report.timing.maxA} ms, B ${report.timing.maxB} ms`);
