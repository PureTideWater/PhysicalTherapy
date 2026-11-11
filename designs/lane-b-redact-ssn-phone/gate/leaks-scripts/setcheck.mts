// node setcheck.mts <tree> <show> <name=dirA:dirB:class[,class...]>...: letters only in dirA's classes, on a tree, against the head
import fs from 'node:fs';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';
const [, , tree, showArg, ...sets] = process.argv;
const T = await import(pathToFileURL(tree!).href);
const H = await import(pathToFileURL('/home/user/fix/packages/model-gateway/src/redact.ts').href);
const ids = (dir: string, cls: string) => { const out = new Set<number>(); for (const f of fs.readdirSync(`${dir}/hits`).filter((f) => f.startsWith(cls + '.'))) for (const line of fs.readFileSync(`${dir}/hits/${f}`, 'utf8').split('\n')) if (line) out.add(JSON.parse(line).i); return out; };
const groups = sets.map((s) => { const [name, rest] = s.split('='); const [a, b, classes] = rest!.split(':'); const want = new Set<number>(); for (const cls of classes!.split(',')) { const w = ids(a!, cls); if (b !== '-') for (const i of ids(b!, cls)) w.delete(i); for (const i of w) want.add(i); } return { name, want, by: {} as Record<string, number>, ex: {} as Record<string, string[]> }; });
const all = new Set<number>(); for (const g of groups) for (const i of g.want) all.add(i);
const corpus = '/home/user/gate/corpus';
const patients = JSON.parse(fs.readFileSync(`${corpus}/patients.json`, 'utf8'));
const show = Number(showArg ?? 6);
const out = (R: any, t: string, P: any, C: any) => { const s = R.redactLetterForScreen(t, P, C); return R.holdsIdentifier(s.text, P, C) ? 'REFUSED' : s.text === t.normalize('NFKC') ? 'same' : JSON.stringify(s.text).slice(0, 150); };
const kind = (o: string) => (o === 'REFUSED' ? 'refused' : o === 'same' ? 'unchanged' : 'redacted');
for (const f of fs.readdirSync(corpus).filter((f) => f.startsWith('shard-'))) {
  for (const line of zlib.gunzipSync(fs.readFileSync(`${corpus}/${f}`)).toString('utf8').split('\n')) {
    if (!line) continue;
    const m = /"i":(\d+)/.exec(line);
    if (!m || !all.has(Number(m[1]))) continue;
    const rec = JSON.parse(line);
    const { P, C } = patients[rec.p];
    const t = out(T, rec.t, P, C), h = out(H, rec.t, P, C);
    for (const g of groups) {
      if (!g.want.has(rec.i)) continue;
      const key = `tree ${kind(t)} / head ${kind(h)}${t === h ? ' (equal)' : ''}`;
      g.by[key] = (g.by[key] ?? 0) + 1;
      (g.ex[key] ??= []); if (g.ex[key].length < show && t !== h) g.ex[key].push(`${JSON.stringify(rec.t).slice(0, 160)}  tree: ${t.slice(0, 110)}`);
    }
  }
}
for (const g of groups) { console.log(`== ${g.name}: ${g.want.size}`, JSON.stringify(g.by)); for (const [k, list] of Object.entries(g.ex)) for (const e of list) console.log('    ', k, '|', e); }
