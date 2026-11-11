// D1 review: a held letter's own-identifier fragments. The base refuses a name written in pieces (and other fragments of
// the call's identifiers) only in a letter its scan holds; this asks where the base's scan holds a letter and the head's
// does not, with such a fragment as the canary. node canary.mts grid | node canary.mts fuzz <seconds> <seed>
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { VOCAB, XA } from './gen2.mts';
const load = async (p: string): Promise<any> => import(pathToFileURL(p).href);
const B = await load('/home/user/tree-ef3/packages/model-gateway/src/redact.ts');
const H = await load('/home/user/fix/packages/model-gateway/src/redact.ts');
const I = await load('/home/user/review-d1/d1/inst/redact.ts');
const [P, C] = [XA.P, XA.C];
const out = (R: any, t: string) => { try { const s = R.redactLetterForScreen(t, P, C).text as string; return { r: R.holdsIdentifier(s, P, C) as boolean, s }; } catch (e) { return { r: false, s: `THREW ${String(e).slice(0, 80)}` }; } };
const tag = (o: { r: boolean }) => (o.r ? 'R' : 'S');
const scan = (t: string, strict: boolean) => { try { return String(I.__t.survivorLeft(I.__t.masked(t, C.length, '\u0003', '\u0003'), strict)); } catch (e) { return 'err'; } };
const CAN = ['Zephy ra', 'Z e p h y r a', 'Zephy. ra', 'Jane Zeph yra', 'SYNMEMBER 00 42', 'ZZ 76 54 321', 'S. Vant•ree'];
const ZIPX = ['AE 09012-3456', 'APO AE 09012', 'AP 96201-1234', 'D.C. 20001-1234', 'Washington, D.C. 20001', 'NY, 10001-1234', 'N.Y. 10001', 'TX\n75001-1234', 'TX. 75001', 'MP 96950', 'AS 96799-1234', 'AA 34002-1234', 'PR 00901-1234', 'W.V. 25301', 'S.C. 29201-1234', 'R.I. 02903', 'ZIP 75001-1234', 'Zip Code: 75001', 'CPT-4 97110 97140', 'Code(s) 97110, 97112 97530', 'CPT® 97110 97140 97530', 'Taxpayer ID 12-3456789', 'TIN (EIN): 12-3456789', 'Tax I.D. No. 12-3456789', '(TIN) 123456789', '97110 (2) 150.00', 'M54.50', 'N235', 'G0283', 'ICD-10 M54.50 97110'];
if (process.argv[2] === 'grid') {
  const NS = ['', 'AE 09012-3456:900-12-34567th', 'AE 09012-3456', '09012-3456', '900-12-34567th', '09012-3456:900-12-34567th', 'AE 09012-3456:900-12-34567', 'TX 75001-1234', 'DOS 01/01/2020-01/31/2020', 'D.C. 20001-1234', 'NY, 10001-1234', 'TX\n75001-1234', 'N.Y. 10001-1234', 'AP 96201-1234', 'TX. 75001-1234', 'ZIP 75001-1234.', '12345-6789', 'CPT-4 97110 97140 97530', 'Code(s) 97110, 97112', 'Taxpayer ID 12-3456789', 'TIN (EIN): 12-3456789', '97110 (2) 150.00', 'M54.50 97110', '$150.00 900.12', '150.00 2020-01-02', 'Paid 150.00 on 01/02/2020 check 12345'];
  console.log(`cells: base then head, R refused S sent, per canary ${JSON.stringify(CAN)}; scan = the head's survivor scan of the context alone (not strict / strict)`);
  for (const N of NS) {
    const cells = CAN.map((X) => { const t = N === '' ? X : `${X}. ${N}`; return `${tag(out(B, t))}${tag(out(H, t))}`; });
    console.log(`${cells.join(' ')}  scan=${scan(N, false)}/${scan(N, true)}  ${JSON.stringify(N)}`);
  }
} else {
  const { PERSON, KEEP, NAMED, CODES, ZIPS, TAIL, NUMS, EXTRA, GLUE, HELD } = VOCAB as any;
  const budget = Number(process.argv[3] ?? 30) * 1000; let seed = Number(process.argv[4] ?? 1); const seed0 = seed; const t0 = Date.now();
  const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]!;
  const D = () => String(Math.floor(rnd() * 10));
  const randomNumber = () => { const groups = Array.from({ length: 1 + Math.floor(rnd() * 4) }, () => Array.from({ length: 1 + Math.floor(rnd() * 5) }, D).join('')); return groups.map((gr, i) => (i === 0 ? gr : pick(['-', ' ', '.', '\n', '', '/', ')', ', ', '(', ' - ', ',', ':']) + gr)).join(''); };
  const LABELS = [...PERSON, ...KEEP, ...NAMED, ...CODES, ...ZIPS];
  const ctx = () => { const k = 1 + Math.floor(rnd() * 3); let s = ''; for (let i = 0; i < k; i += 1) { const c = rnd(); const atom = c < 0.15 ? pick(LABELS) + pick(TAIL) : c < 0.4 ? pick(NUMS) : c < 0.62 ? pick(EXTRA) : c < 0.82 ? pick(ZIPX) : c < 0.9 ? pick(HELD) : randomNumber(); s += (i === 0 ? '' : pick(GLUE)) + atom; } return s; };
  const clear = (s: string) => s.normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const shapeOf = (t: string) => t.replace(/[0-9]+/g, '9').replace(/\p{L}+/gu, 'a').slice(0, 40);
  const n: Record<string, number> = { letters: 0, headSent: 0, flips: 0 }; const seen = new Set<string>(); const recs: string[] = [];
  for (;;) {
    if ((n.letters & 31) === 0 && Date.now() - t0 > budget) break;
    n.letters += 1;
    const X = pick(CAN); const N = ctx(); const sep = pick([' ', '. ', '\n', ', ', ' - ', ': ']);
    const t = rnd() < 0.5 ? `${X}${sep}${N}` : `${N}${sep}${X}`;
    const h = out(H, t);
    if (h.r) continue;
    n.headSent += 1;
    const b = out(B, t);
    if (!b.r) continue;
    n.flips += 1;
    const shows = clear(h.s).includes(clear(X));
    const k = shows ? 'CANARY-FLIP' : 'flip-redacted';
    n[k] = (n[k] ?? 0) + 1;
    // The base's verdict on the context alone and on the canary beside a plain date range: is the canary the base's reason?
    const alone = tag(out(B, N));
    const key = `${k}|${X}|${shapeOf(N)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    recs.push(JSON.stringify({ k, X, N, t, baseOnContextAlone: alone, scan: `${scan(N, false)}/${scan(N, true)}`, h: h.s }));
  }
  fs.writeFileSync(`/home/user/review-d1/d1/out/canary.${seed0}.jsonl`, `${recs.join('\n')}\n`);
  console.log(`canary seed ${seed0} in ${((Date.now() - t0) / 1000).toFixed(0)} s`, JSON.stringify(n), `distinct ${recs.length}`);
  const want = recs.filter((r) => r.startsWith('{"k":"CANARY-FLIP"') && r.includes('"baseOnContextAlone":"S"'));
  console.log(`CANARY-FLIP where the base sends the context alone: ${want.length} distinct`);
  for (const r of want.slice(0, 14)) console.log(r.slice(0, 420));
  for (const r of recs.filter((r) => !want.includes(r)).slice(0, 4)) console.log(r.slice(0, 300));
}
