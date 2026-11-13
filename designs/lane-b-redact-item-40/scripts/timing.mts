// timing.mts <src dir> [letters=20000]: wall time of the whole entry over the first letters of the gate's shard 0, one
// thread, after a warm-up of 2,000. Prints milliseconds per letter and the count refused.
import fs from 'node:fs';
import zlib from 'node:zlib';
const [dir, n = '20000'] = process.argv.slice(2);
const H = await import(`${dir}/redact.ts`);
const CORPUS = '/home/user/ops/designs/lane-b-redact-ssn-phone/gate/corpus';
const patients = JSON.parse(fs.readFileSync(`${CORPUS}/patients.json`, 'utf8')) as { P: unknown; C: unknown }[];
const lines = zlib.gunzipSync(fs.readFileSync(`${CORPUS}/shard-0.jsonl.gz`)).toString('utf8').split('\n').filter(Boolean).slice(0, Number(n)).map((line) => JSON.parse(line) as { p: number; t: string });
const run = (rows: typeof lines) => rows.filter(({ p, t }) => { const who = patients[p]!; const r = H.redactLetterForScreen(t, who.P, who.C); return H.holdsIdentifier(r.text, who.P, who.C, H.checkWorkOf(r)); }).length;
run(lines.slice(0, 2000));
const started = performance.now();
const refused = run(lines);
console.log(`${lines.length} letters, ${((performance.now() - started) / lines.length).toFixed(4)} ms per letter, refused ${refused}`);
