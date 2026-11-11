// node cost-names.mts <base redact.ts> <head redact.ts>: what MOD-23's wider name reading costs ordinary text. For each
// of a list of names whose letters split into English words, every text of the repository's synthetic prose (fixtures'
// .txt and .md, the narrative set, the letters quoted in the gateway's tests) is redacted on both trees with that name
// alone as the patient; printed: per name, the texts that change and the distinct phrases newly replaced.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [B, H] = await Promise.all(process.argv.slice(2, 4).map((t) => import(pathToFileURL(t).href)));
const ROOT = '/home/user/PhysicalTherapy';
const texts: string[] = [];
const walk = (dir: string) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (/\.(txt|md)$/.test(e.name) && fs.statSync(p).size < 400_000) texts.push(fs.readFileSync(p, 'utf8')); } };
walk(`${ROOT}/fixtures/synthetic`);
for (const f of ['packages/synth/src/eval/narrative-set.ts', 'packages/model-gateway/src/functions/denial-letter.test.ts', 'packages/model-gateway/src/functions/narrative.test.ts', 'packages/model-gateway/src/redact.test.ts']) {
  for (const m of fs.readFileSync(`${ROOT}/${f}`, 'utf8').matchAll(/'((?:[^'\\\n]|\\.){40,})'|`((?:[^`\\]|\\.){40,})`/g)) texts.push((m[1] ?? m[2] ?? '').replace(/\\n/g, '\n').replace(/\\'/g, "'"));
}
const NAMES = (process.env.NAMES ?? 'INA,ISA,ANA,ALAN,THEO,NEWMAN,UNDERWOOD,ABE,BEA,MAYA,AMY,IAN,NOEL,TOM,BEN,ANN,ALI,ELI,ADA,ARI,DON,ANDY,ISAAC,ISABEL,HASAN,ATWOOD,INMAN,FORMAN,NORMAN,HERMAN,ONEAL,MAYO,ANTON,DOAN,NOLAN,ASHE,THEIS,TOBIAS,AL,TY,JO,ED,BO,LI,AN,SO,TOBE,ASA,IDA,INGE,SOTO,ORR,WEBB,ISOM,FORTE,WITHERS,ZEPHYRA,VANTREE,MARIA,SMITH,JONES,GARCIA,NGUYEN,JOHNSON').split(',');
const chars = texts.reduce((n, t) => n + t.length, 0);
console.log(`texts ${texts.length}, characters ${chars}`);
let totalTexts = 0;
for (const name of NAMES) {
  const P = { pseudonym: 'p', names: [name], datesOfBirth: [], memberIds: [] };
  const phrases = new Map<string, number>();
  let changed = 0;
  let baseHits = 0;
  for (const text of texts) {
    const b = B.redactionSpans(text, P, []);
    const h = H.redactionSpans(text, P, []);
    baseHits += b.spans.length;
    let any = false;
    for (const span of h.spans) {
      if (b.spans.some((s: { start: number; end: number }) => s.start <= span.start && span.end <= s.end)) continue;
      any = true;
      const phrase = h.text.slice(span.start, span.end).replace(/\s+/g, ' ').toLowerCase();
      phrases.set(phrase, (phrases.get(phrase) ?? 0) + 1);
    }
    if (any) changed += 1;
  }
  totalTexts += changed;
  const top = [...phrases].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([p, n]) => `${JSON.stringify(p)}x${n}`).join(' ');
  console.log(name.padEnd(10), `base spans ${String(baseHits).padStart(5)}`, `texts changed ${String(changed).padStart(4)}`, `new spans ${String([...phrases.values()].reduce((a, b) => a + b, 0)).padStart(5)}`, top);
}
