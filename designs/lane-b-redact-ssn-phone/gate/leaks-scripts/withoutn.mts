// The must-stay letters released since p8 that the prototype refuses: does ef3e8d20 refuse each with its "(n)" taken out?
import fs from 'node:fs';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';
const T = await import(pathToFileURL('/home/user/p10/packages/model-gateway/src/redact.ts').href);
const B = await import(pathToFileURL('/home/user/tree-ef3/packages/model-gateway/src/redact.ts').href);
const ids = (dir: string, cls: string) => { const out = new Set<number>(); for (const f of fs.readdirSync(`${dir}/hits`).filter((f) => f.startsWith(cls + '.'))) for (const line of fs.readFileSync(`${dir}/hits/${f}`, 'utf8').split('\n')) if (line) out.add(JSON.parse(line).i); return out; };
const G = '/home/user/gate-out';
const want = new Set<number>();
for (const cls of ['KEEP.refused.letter-with-identifiers', 'KEEP.refused.must-stay.after-ssn-phone-word', 'KEEP.refused.must-stay.other']) { const w = ids(`${G}/p8-ef3`, cls); for (const i of ids(`${G}/p9-ef3`, cls)) w.delete(i); for (const i of w) want.add(i); }
const corpus = '/home/user/gate/corpus';
const patients = JSON.parse(fs.readFileSync(`${corpus}/patients.json`, 'utf8'));
const refused = (R: any, t: string, P: any, C: any) => R.holdsIdentifier(R.redactLetterForScreen(t, P, C).text, P, C);
const by: Record<string, number> = {}; const ex: string[] = [];
for (const f of fs.readdirSync(corpus).filter((f) => f.startsWith('shard-'))) {
  for (const line of zlib.gunzipSync(fs.readFileSync(`${corpus}/${f}`)).toString('utf8').split('\n')) {
    if (!line) continue;
    const m = /"i":(\d+)/.exec(line);
    if (!m || !want.has(Number(m[1]))) continue;
    const rec = JSON.parse(line);
    const { P, C } = patients[rec.p];
    if (!refused(T, rec.t, P, C) || refused(B, rec.t, P, C)) continue;
    const without = rec.t.replace(/[ \t]?\([0-9]{1,2}\)/gu, '');
    const key = without === rec.t ? 'no (n) in the letter' : refused(B, without, P, C) ? 'ef3 refuses it without the (n)' : 'ef3 sends it without the (n)';
    by[key] = (by[key] ?? 0) + 1;
    if (key !== 'ef3 refuses it without the (n)' && ex.length < 12) ex.push(`${key}: ${JSON.stringify(rec.t).slice(0, 200)}`);
  }
}
console.log(JSON.stringify(by)); for (const e of ex) console.log('  ', e);
