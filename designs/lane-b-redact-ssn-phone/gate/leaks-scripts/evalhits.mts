// node evalhits.mts <redact.ts> <gate-out dirA> <gate-out dirB or -> <class> [show]: the letters of a class in A's hits
// (not in B's, where given), run through a tree with their own patients; counts of refused, redacted and unchanged.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';
const [, , tree, dirA, dirB, cls, showArg] = process.argv;
const R = await import(pathToFileURL(tree!).href);
const ids = (dir: string) => {
  const out = new Set<number>();
  for (const f of fs.readdirSync(`${dir}/hits`).filter((f) => f.startsWith(cls + '.'))) {
    for (const line of fs.readFileSync(`${dir}/hits/${f}`, 'utf8').split('\n')) if (line) out.add(JSON.parse(line).i);
  }
  return out;
};
const want = ids(dirA!);
if (dirB !== '-') for (const i of ids(dirB!)) want.delete(i);
const corpus = '/home/user/gate/corpus';
const patients = JSON.parse(fs.readFileSync(`${corpus}/patients.json`, 'utf8'));
const by: Record<string, number> = {}; const ex: Record<string, string[]> = {};
const show = Number(showArg ?? 4);
for (const f of fs.readdirSync(corpus).filter((f) => f.startsWith('shard-'))) {
  for (const line of zlib.gunzipSync(fs.readFileSync(`${corpus}/${f}`)).toString('utf8').split('\n')) {
    if (!line) continue;
    const at = line.indexOf('"i":');
    const rec = JSON.parse(line);
    if (!want.has(rec.i)) continue;
    const { P, C } = patients[rec.p];
    const s = R.redactLetterForScreen(rec.t, P, C);
    const refused = R.holdsIdentifier(s.text, P, C);
    const why = refused ? 'refused' : s.text === rec.t ? 'sent unchanged' : 'sent redacted';
    by[why] = (by[why] ?? 0) + 1; (ex[why] ??= []); if (ex[why].length < show) ex[why].push(`${JSON.stringify(rec.t).slice(0, 130)} => ${refused ? 'REFUSED' : JSON.stringify(s.text).slice(0, 130)}`);
  }
}
console.log(cls, want.size, JSON.stringify(by));
for (const [k, list] of Object.entries(ex)) for (const e of list) console.log(' ', k, '|', e);
