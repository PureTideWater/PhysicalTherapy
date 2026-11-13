// timing-unseen.mts <src dir> [letters=20000]: Queues item 40, stage 3 (W74): wall time of the whole entry over the
// first letters of the gate's shard 0, one thread, after a warm-up of 2,000 (as scripts/timing.mts), three times over:
// each letter as it is, with U+200B added after it, and with U+0085 added after it (an unseen character where no
// reading finds anything: the further reading and its check are the whole of the difference).
import fs from 'node:fs';
import zlib from 'node:zlib';
const [dir, n = '20000'] = process.argv.slice(2);
const H = await import(`${dir}/redact.ts`);
const CORPUS = '/home/user/ops/designs/lane-b-redact-ssn-phone/gate/corpus';
const patients = JSON.parse(fs.readFileSync(`${CORPUS}/patients.json`, 'utf8')) as { P: unknown; C: unknown }[];
const lines = zlib.gunzipSync(fs.readFileSync(`${CORPUS}/shard-0.jsonl.gz`)).toString('utf8').split('\n').filter(Boolean).slice(0, Number(n)).map((line) => JSON.parse(line) as { p: number; t: string });
const run = (rows: typeof lines, add: string) => rows.filter(({ p, t }) => { const who = patients[p]!; const r = H.redactLetterForScreen(t + add, who.P, who.C); return H.holdsIdentifier(r.text, who.P, who.C, H.checkWorkOf(r)); }).length;
for (const add of ['', '​', '\u0085']) run(lines.slice(0, 2000), add);
for (const [what, add] of [['as it is', ''], ['with U+200B after it', '​'], ['with U+0085 after it', '\u0085'], ['as it is, again', '']] as const) {
  const started = performance.now();
  const refused = run(lines, add);
  console.log(`${what}: ${lines.length} letters, ${((performance.now() - started) / lines.length).toFixed(4)} ms per letter, refused ${refused}`);
}
