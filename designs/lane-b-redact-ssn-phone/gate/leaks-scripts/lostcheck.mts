// node lostcheck.mts <show> <dirA:dirB:class>...: the letters in dirA's class and not in dirB's, on the head and on ef3e8d20
import fs from 'node:fs';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';
const [, , showArg, ...triples] = process.argv;
const H = await import(pathToFileURL('/home/user/fix/packages/model-gateway/src/redact.ts').href);
const B = await import(pathToFileURL('/home/user/tree-ef3/packages/model-gateway/src/redact.ts').href);
const ids = (dir: string, cls: string) => {
  const out = new Map<number, any>();
  for (const f of fs.readdirSync(`${dir}/hits`).filter((f) => f.startsWith(cls + '.'))) {
    for (const line of fs.readFileSync(`${dir}/hits/${f}`, 'utf8').split('\n')) if (line) { const r = JSON.parse(line); out.set(r.i, r); }
  }
  return out;
};
const sets = triples.map((t) => { const [a, b, cls] = t.split(':'); const want = ids(a!, cls!); for (const i of ids(b!, cls!).keys()) want.delete(i); return { t, want, by: {} as Record<string, number>, ex: {} as Record<string, string[]>, src: {} as Record<string, number> }; });
const all = new Set<number>(); for (const s of sets) for (const i of s.want.keys()) all.add(i);
const corpus = '/home/user/gate/corpus';
const patients = JSON.parse(fs.readFileSync(`${corpus}/patients.json`, 'utf8'));
const show = Number(showArg ?? 4);
const out = (R: any, t: string, P: any, C: any) => { const s = R.redactLetterForScreen(t, P, C); return R.holdsIdentifier(s.text, P, C) ? 'REFUSED' : s.text === t.normalize('NFKC') ? 'same' : JSON.stringify(s.text).slice(0, 150); };
for (const f of fs.readdirSync(corpus).filter((f) => f.startsWith('shard-'))) {
  for (const line of zlib.gunzipSync(fs.readFileSync(`${corpus}/${f}`)).toString('utf8').split('\n')) {
    if (!line) continue;
    const m = /"i":(\d+)/.exec(line.slice(0, 40)) ?? /"i":(\d+)/.exec(line);
    if (!m || !all.has(Number(m[1]))) continue;
    const rec = JSON.parse(line);
    const { P, C } = patients[rec.p];
    const h = out(H, rec.t, P, C), b = out(B, rec.t, P, C);
    const kind = (o: string) => (o === 'REFUSED' ? 'refused' : o === 'same' ? 'unchanged' : 'redacted');
    for (const s of sets) {
      if (!s.want.has(rec.i)) continue;
      const key = `head ${kind(h)} / ef3 ${kind(b)}${h === b ? ' (equal)' : ''}`;
      s.by[key] = (s.by[key] ?? 0) + 1; s.src[`${key} <- ${rec.s}`] = (s.src[`${key} <- ${rec.s}`] ?? 0) + 1;
      (s.ex[key] ??= []); if (s.ex[key].length < show) s.ex[key].push(`${JSON.stringify(rec.t).slice(0, 150)} [${P.names.join(';')}|${P.memberIds.join(',')}|${P.datesOfBirth.join(',')}]\n        head: ${h}\n        ef3:  ${b}`);
    }
  }
}
for (const s of sets) {
  console.log(`== ${s.t.replace(/\/home\/user\/gate-out\//g, '')}: ${s.want.size}`, JSON.stringify(s.by));
  console.log('   sources:', Object.entries(s.src).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([k, n]) => `${k} ${n}`).join(' | '));
  for (const [k, list] of Object.entries(s.ex)) for (const e of list) console.log('  ', k, '|', e);
}
