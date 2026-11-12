// node --import <gate>/ts-resolve.mjs lfcr.mts <redact.ts> <gate corpus dir>: Queues item 34, A-6. Of the gate's letters,
// how many hold a line feed right before a CR once every CR LF is read as one line ending, and how many of those the
// reader sends today and would refuse on a third reading (that text with each such LF CR as a line feed).
import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib';
const H = await import(process.argv[2]!); const corpus = process.argv[3]!;
const patients = JSON.parse(fs.readFileSync(path.join(corpus, 'patients.json'), 'utf8'));
let letters = 0, hold = 0, sent = 0, third = 0; const examples: string[] = [];
for (let shard = 0; shard < 8; shard += 1) for (const line of zlib.gunzipSync(fs.readFileSync(path.join(corpus, `shard-${shard}.jsonl.gz`))).toString('utf8').split('\n')) {
  if (line === '') continue; const rec = JSON.parse(line); letters += 1;
  if (!/\n\r/.test(rec.t.replace(/\r+\n/g, '\n'))) continue;
  hold += 1; const { P, C } = patients[rec.p];
  const r = H.redactLetterForScreen(rec.t, P, C); if (H.holdsIdentifier(r.text, P, C, H.checkWorkOf(r))) continue;
  sent += 1;
  if (H.holdsIdentifier(r.text.replace(/\r+\n/g, '\n').replace(/\n\r+/g, '\n'), P, C, H.checkWorkOf(r))) { third += 1; if (examples.length < 3) examples.push(JSON.stringify(rec.t.slice(0, 80))); }
}
console.log(`letters ${letters}; hold LF CR ${hold}; of those sent today ${sent}; refused on the third reading ${third}`, examples.join(' '));
