// Gate corpus letters a prefilter matches, on base and head with their own patients: letters the base refuses and the head sends,
// and letters both send where the head shows more digits than the base. node corpus.mts <seconds>
import fs from 'node:fs';
import zlib from 'node:zlib';
import { load, digitsOf, show } from './lib.mts';
const B = await load('base'); const H = await load('head');
const budget = Number(process.argv[2] ?? 300) * 1000; const t0 = Date.now();
const INV = '\\u200B-\\u200F\\u202A-\\u202E\\u2060\\uFEFF\\u00AD\\u034F\\uFE0F';
const filters: Record<string, RegExp> = {
  l2d: /[ЗзБбƷʒ]/u,
  inv: new RegExp(`[${INV}][^\\n\\p{L}]{0,2}[0-9]|[0-9][^\\n\\p{L}]{0,2}[${INV}]`, 'u'),
  fold: /[Ͱ-ϿЀ-ԯᴀ-ᵿᎠ-᏿ꓐ-꓿]|·|‧/u,
};
const corpus = '/home/user/gate/corpus';
const patients = JSON.parse(fs.readFileSync(`${corpus}/patients.json`, 'utf8'));
const out = (R: any, t: string, P: any, C: any) => { const s = R.redactLetterForScreen(t, P, C); return { refused: R.holdsIdentifier(s.text, P, C) as boolean, sent: s.text as string }; };
const n: Record<string, number> = { letters: 0, matched: 0, flip: 0, unredact: 0 }; const by: Record<string, number> = {}; const ex: string[] = [];
outer: for (const f of fs.readdirSync(corpus).filter((x) => x.startsWith('shard-')).sort()) {
  for (const line of zlib.gunzipSync(fs.readFileSync(`${corpus}/${f}`)).toString('utf8').split('\n')) {
    if (!line) continue;
    if ((n.letters & 1023) === 0 && Date.now() - t0 > budget) break outer;
    n.letters += 1;
    const rec = JSON.parse(line);
    const hit = Object.entries(filters).filter(([, re]) => re.test(rec.t)).map(([k]) => k);
    if (hit.length === 0) continue;
    n.matched += 1;
    const { P, C } = patients[rec.p];
    const h = out(H, rec.t, P, C); if (h.refused) continue;
    const b = out(B, rec.t, P, C);
    const kind = b.refused ? 'flip' : digitsOf(h.sent).length > digitsOf(b.sent).length ? 'unredact' : '';
    if (kind === '') continue;
    n[kind] += 1; const key = `${kind} ${hit.join('+')} ${String(rec.s).replace(/__.*/, '')}`; by[key] = (by[key] ?? 0) + 1;
    if (by[key] <= 2 && ex.length < 16) ex.push(`${key}: ${show(rec.t, 150)}\n      base ${b.refused ? 'REFUSED' : show(b.sent, 130)}\n      head ${show(h.sent, 130)}`);
  }
}
console.log(JSON.stringify(n), `in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
for (const [k, c] of Object.entries(by).sort((x, y) => y[1] - x[1]).slice(0, 25)) console.log(c, k);
for (const e of ex) console.log(e);
