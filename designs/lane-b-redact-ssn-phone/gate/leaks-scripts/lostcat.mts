// node lostcat.mts <dirA:dirB:class>...: the letters only in dirA's class, grouped by form
import fs from 'node:fs';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';
const triples = process.argv.slice(2);
const H = await import(pathToFileURL(process.env.TREE ?? '/home/user/fix/packages/model-gateway/src/redact.ts').href);
const ids = (dir: string, cls: string) => { const out = new Set<number>(); for (const f of fs.readdirSync(`${dir}/hits`).filter((f) => f.startsWith(cls + '.'))) for (const line of fs.readFileSync(`${dir}/hits/${f}`, 'utf8').split('\n')) if (line) out.add(JSON.parse(line).i); return out; };
const all = new Map<number, string>();
for (const t of triples) { const [a, b, cls] = t.split(':'); const want = ids(a!, cls!); for (const i of ids(b!, cls!)) want.delete(i); for (const i of want) all.set(i, cls!); }
const corpus = '/home/user/gate/corpus';
const patients = JSON.parse(fs.readFileSync(`${corpus}/patients.json`, 'utf8'));
const cats: Record<string, { n: number; ex: string[] }> = {};
for (const f of fs.readdirSync(corpus).filter((f) => f.startsWith('shard-'))) {
  for (const line of zlib.gunzipSync(fs.readFileSync(`${corpus}/${f}`)).toString('utf8').split('\n')) {
    if (!line) continue;
    const m = /"i":(\d+)/.exec(line);
    if (!m || !all.has(Number(m[1]))) continue;
    const rec = JSON.parse(line);
    const { P, C } = patients[rec.p];
    const s = H.redactLetterForScreen(rec.t, P, C);
    const refused = H.holdsIdentifier(s.text, P, C);
    const t: string = rec.t;
    const outcome = refused ? 'REFUSED' : s.text === t.normalize('NFKC') ? 'same' : 'redacted';
    let cat: string;
    if (/\((?:[0-9]{1,2})\)(?![ \t]?:)/.test(t) && /\b(?:SSN|Soc(?:ial)? Sec|Tel|Phone|Cell|Call|Fax|TTY|Mobile|Contact)\b[^\n]{0,6}\([0-9]{1,2}\)/i.test(t)) cat = 'label + (n) with no colon';
    else if (/x\b|St(?:Paid)?\b|th\b/.test(t) && /[0-9]{4}[0-9.,-]*[0-9](?:x|st|th|St)/.test(t)) cat = 'glued word after';
    else cat = 'other';
    const key = `${all.get(rec.i)} | ${outcome} | ${cat}`;
    (cats[key] ??= { n: 0, ex: [] }).n += 1;
    if (cats[key].ex.length < Number(process.env.SHOW ?? 14)) cats[key].ex.push(`${JSON.stringify(t).slice(0, 140)} => ${refused ? 'REFUSED' : outcome === 'same' ? 'same' : JSON.stringify(s.text).slice(0, 140)}`);
  }
}
for (const [k, v] of Object.entries(cats).sort((a, b) => b[1].n - a[1].n)) { console.log(`== ${v.n} ${k}`); for (const e of v.ex) console.log('    ', e); }
