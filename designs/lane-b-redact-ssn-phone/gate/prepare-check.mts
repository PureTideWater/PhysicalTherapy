// Confirms the gate's direct path equals denialLetterSpec.prepare (functions/denial-letter.ts, as denial-letter.test.ts
// builds its input) on a fixed sample of the corpus: refused <=> InputRefusedError('identifier_left'), and the sent text
// equals prepare's context text. Needs the tree's node_modules (run with tsx). Usage:
//   tsx prepare-check.mts <src dir> [every=500]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';

const src = path.resolve(process.argv[2]!);
const every = Number(process.argv[3] ?? 500);
const GATE = path.dirname(new URL(import.meta.url).pathname);
const dl = await import(pathToFileURL(path.join(src, 'functions', 'denial-letter.ts')).href);
const rd = await import(pathToFileURL(path.join(src, 'redact.ts')).href);
const patients: { P: any; C: any }[] = JSON.parse(fs.readFileSync(path.join(GATE, 'corpus', 'patients.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(GATE, 'corpus', 'manifest.json'), 'utf8'));
let n = 0, agree = 0, otherRefusal = 0;
const mismatches: string[] = [];
for (let k = 0; k < manifest.shards; k += 1) {
  const lines = zlib.gunzipSync(fs.readFileSync(path.join(GATE, 'corpus', `shard-${k}.jsonl.gz`))).toString('utf8').split('\n');
  for (let j = 0; j < lines.length; j += every) {
    if (!lines[j]) continue;
    const rec = JSON.parse(lines[j]!);
    const { P, C } = patients[rec.p]!;
    n += 1;
    let direct: string;
    try { const r = rd.redactLetterForScreen(rec.t, P, C); direct = rd.holdsIdentifier(r.text, P, C) ? 'REFUSED' : r.text; } catch { direct = 'THREW'; }
    let viaPrepare: string;
    try {
      const prepared = dl.denialLetterSpec.prepare({ documentId: '00000000-0000-4000-8000-000000000016', documentSha256: '0'.repeat(64), text: rec.t, patient: P, claims: C, otherPatients: { holdsOtherPatient: () => Promise.resolve(false) } });
      viaPrepare = prepared.context.text;
    } catch (e: any) {
      viaPrepare = e?.code === 'identifier_left' || /identifier_left/.test(String(e?.reason ?? e?.message ?? '')) ? 'REFUSED' : `OTHER:${String(e?.code ?? e?.reason ?? 'error')}`;
    }
    if (viaPrepare.startsWith('OTHER:')) { otherRefusal += 1; continue; }
    if (viaPrepare === direct) agree += 1; else if (mismatches.length < 10) mismatches.push(JSON.stringify({ i: rec.i, direct: direct.slice(0, 80), viaPrepare: viaPrepare.slice(0, 80) }));
  }
}
console.log(`prepare-check ${src}: sampled ${n}, agree ${agree}, refused before redaction (no_text/identifiers_missing/...) ${otherRefusal}, mismatch ${n - agree - otherRefusal}`);
for (const m of mismatches) console.log('  ', m);
