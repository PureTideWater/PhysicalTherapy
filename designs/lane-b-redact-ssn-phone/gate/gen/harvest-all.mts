// Runs every reviewer/fixer harness under the recorder (harvest-run.mts), 4 at a time, 60 s each, with the seeds the
// reviewers used. Output: gate/harvest/runs/<dir>__<file>__<tag>.jsonl. Writes nothing in the reviewers' directories.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const S = '/tmp/claude-0/-home-user-PhysicalTherapy/b3c6553f-bf86-5901-9a05-bd89989a0ff9/scratchpad';
const G = `${S}/rg-judge/gate`;
const outDir = `${G}/harvest/runs`;
fs.mkdirSync(outDir, { recursive: true });
const DIRS = ['rg-review-phi-1', 'rg-review-phi-2', 'rg-review-phi-3', 'rg-review-gateway-1', 'rg-review-gateway-2', 'rg-review-gateway-3', 'rg-fixer-1', 'rg-fixer-1b', 'rg-fixer-2', 'rg-sweep', 'rg-skeptic-phi', 'rg-skeptic-gateway'];
const files: string[] = [];
const walk = (d: string, depth: number) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (depth < 1 && !/node_modules|^gw-|^mono|vite-cache|^wt$|^base$|^head$|^live$|^mid$|^v\w*$|^fix\d$|^sk-/.test(e.name)) walk(p, depth + 1); } else if (/\.(mts|mjs)$/.test(e.name) && !/^redact/.test(e.name) && !/^vitest/.test(e.name)) files.push(p); } };
for (const d of DIRS) walk(`${S}/${d}`, 0);
// Extra argument sets: the seeds the reviewers ran (their output file names), and both modes of the keep/sec fuzzers.
const extra: Record<string, string[][]> = {
  'rg-review-phi-1/fuzz.mts': [['1'], ['2']], 'rg-review-phi-1/fuzzdob.mts': [['1'], ['2']],
  'rg-review-phi-1/fuzz2.mts': [['11'], ['22'], ['33'], ['44']], 'rg-review-phi-1/fuzz2l.mts': [['101'], ['202'], ['303']],
  'rg-review-phi-2/fuzz3.mts': [['202'], ['303'], ['101'], ['404'], ['505']],
  'rg-review-phi-3/fuzz4.mts': [['11'], ['22']],
  'rg-review-gateway-2/secfill.mts': [['4242'], ['9191']], 'rg-review-gateway-3/secfill.mts': [['4242'], ['9191']], 'rg-fixer-2/secfill.mts': [['4242'], ['9191']], 'rg-skeptic-gateway/r3/secfill.mts': [['4242'], ['9191']],
  'rg-fixer-1b/fuzzK.mts': [['sec', '4242'], ['keep', '4242']], 'rg-skeptic-gateway/r2/fuzzK.mts': [['sec', '4242'], ['keep', '4242']],
  'rg-sweep/sweep.mts': [['keep'], ['sec']],
};
for (const f of ['rg-review-gateway-1/fuzz.mts', 'rg-review-gateway-1/fuzzfix.mts', 'rg-review-gateway-1/fuzzord.mts', 'rg-review-gateway-1/fuzzx.mts', 'rg-review-gateway-2/fuzzord.mts', 'rg-review-gateway-3/fuzzord.mts', 'rg-fixer-1/fuzz.mts', 'rg-fixer-1b/fuzz.mts', 'rg-skeptic-gateway/fuzz.mts']) extra[f] = [['keep'], ['sec']];
for (const f of ['rg-fixer-2/glue.mts', 'rg-fixer-2/secglue.mts', 'rg-fixer-2/secglue2.mts', 'rg-fixer-2/fixcheck.mts', 'rg-skeptic-phi/fixcheck.mts']) extra[f] = [['./redact.cand.ts']];
for (const f of ['rg-fixer-1/fuzz2.mts', 'rg-skeptic-gateway/fuzz2.mts']) extra[f] = [['sec'], ['keep']];
const jobs: { file: string; args: string[]; out: string }[] = [];
for (const file of files.sort()) {
  const rel = path.relative(S, file);
  const sets = extra[rel] ?? [[]];
  for (const args of sets) jobs.push({ file, args, out: `${outDir}/${rel.replace(/\//g, '__')}__${args.join('_') || 'default'}.jsonl` });
}
let next = 0; let done = 0;
const status: string[] = [];
const runOne = (job: (typeof jobs)[number]) => new Promise<void>((resolve) => {
  const t0 = Date.now();
  const child = spawn(process.execPath, [`${G}/gen/harvest-run.mts`, job.file, ...job.args], { env: { ...process.env, REC_OUT: job.out, REC_CAP: '1500000' }, stdio: ['ignore', 'ignore', 'pipe'], cwd: `${G}/harvest/cwd` });
  let err = '';
  child.stderr.on('data', (c) => { if (err.length < 400) err += String(c); });
  const timer = setTimeout(() => child.kill('SIGTERM'), 60_000);
  child.on('exit', (code, sig) => { clearTimeout(timer); const lines = fs.existsSync(job.out) ? fs.readFileSync(job.out, 'utf8').split('\n').filter((l) => l.startsWith('{"p"')).length : 0; status.push(`${path.relative(S, job.file)} [${job.args.join(' ')}] code=${code} sig=${sig ?? ''} letters=${lines} ms=${Date.now() - t0}${err && code !== 0 ? ' err=' + err.replace(/\s+/g, ' ').slice(0, 160) : ''}`); done += 1; resolve(); });
});
const worker = async () => { while (next < jobs.length) { const j = jobs[next++]!; await runOne(j); } };
await Promise.all([worker(), worker(), worker(), worker()]);
fs.writeFileSync(`${G}/harvest/runs.log`, status.sort().join('\n') + '\n');
console.log(`jobs ${jobs.length} done ${done}`);
