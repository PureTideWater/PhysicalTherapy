// Finds the letters whose outcome differs between tree A and tree B; prints each with a trimmed diff.
import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib'; import { pathToFileURL } from 'node:url';
const [srcA, srcB, corpus, out, ...sh] = process.argv.slice(2);
const A = await import(pathToFileURL(path.join(srcA!, 'redact.ts')).href);
const B = await import(pathToFileURL(path.join(srcB!, 'redact.ts')).href);
const patients = JSON.parse(fs.readFileSync(path.join(corpus!, 'patients.json'), 'utf8'));
const run = (m: any, t: string, P: any, C: any) => { try { const r = m.redactLetterForScreen(t, P, C); return { state: m.holdsIdentifier(r.text, P, C) ? 1 : 0, text: r.text as string }; } catch { return { state: 2, text: '' }; } };
let n = 0, d = 0;
for (const s of sh) {
  const lines = zlib.gunzipSync(fs.readFileSync(path.join(corpus!, `shard-${s}.jsonl.gz`))).toString('utf8').split('\n').filter((l) => l !== '');
  for (let j = 0; j < lines.length; j += 1) {
    const rec = JSON.parse(lines[j]!); const { P, C } = patients[rec.p]; n += 1;
    const a = run(A, rec.t, P, C), b = run(B, rec.t, P, C);
    if (a.state === b.state && (a.state !== 0 || a.text === b.text)) continue;
    d += 1;
    fs.appendFileSync(out!, JSON.stringify({ shard: s, j, i: rec.i, s: rec.s, p: rec.p, P, C, t: rec.t, sa: a.state, sb: b.state, a: a.text, b: b.text, hasSec: rec.sec !== undefined, sec: rec.sec, keep: rec.keep }) + '\n');
  }
}
console.log(`shards ${sh.join(',')}: letters ${n}, differ ${d}`);
