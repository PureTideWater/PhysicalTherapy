// E1: (1) the flips fz3.mts seed 7718 reported (base refused, head sent), regenerated from gen3 and run on head, before and base;
// (2) the flip letters fz.mts seed 7717 wrote to its out file, run the same way; (3) a search aimed at a label's list number
// followed by a chain of digits (base refused, head sent). Synthetic twins only.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const load = async (p: string): Promise<any> => import(pathToFileURL(p).href);
const H = await load('/home/user/fix/packages/model-gateway/src/redact.ts');
const F = await load('/home/user/work/p9/beforeF/redact.ts');
const B = await load('/home/user/tree-ef3/packages/model-gateway/src/redact.ts');
const { makeGen3 } = await load('/home/user/review-d1/d1/gen3.mts');
const J = (x: unknown) => JSON.stringify(x);
const c = (s: string, n = 330) => (s.length > n ? s.slice(0, n) + '...' : s);
const T0 = Date.now(); const el = () => ((Date.now() - T0) / 1000).toFixed(0) + 's';
const out = (R: any, t: string, P: any, C: any) => { try { const s = R.redactLetterForScreen(t, P, C).text as string; return { r: R.holdsIdentifier(s, P, C) === true, t: s }; } catch (e) { return { r: true, t: 'ERR ' + String(e).slice(0, 60) }; } };
const sh = (o: any) => (o.r ? 'REFUSED' : 'SENT ' + J(o.t));
const PH = /\[[A-Z_0-9]+\]/g;
const occ = (s: string, t: string) => s.split(t).length - 1;
const shows = (a: string, b: string) => { const A = a.replace(PH, ' '); const Bt = b.replace(PH, ' '); const o: string[] = []; for (const t of new Set(A.match(/[\p{L}\p{N}]{2,}/gu) ?? [])) if (occ(A, t) > occ(Bt, t)) o.push(t); return o; };

// ---------- (1)
const seed = Number(process.env.SEED ?? 7718); const N = Number(process.env.N ?? 12128);
const g = makeGen3(seed, { ph: false });
const pats: Record<string, any> = {};
let flips = 0; let flipsBeforeRefused = 0;
for (let i = 1; i <= N; i += 1) {
  const { t, P, C, who } = g.letter();
  pats[who] ??= { P, C };
  const h = out(H, t, P, C); if (h.r) continue;
  const b = out(B, t, P, C); if (!b.r) continue;
  flips += 1;
  const f = out(F, t, P, C); if (f.r) flipsBeforeRefused += 1;
  let chk = false; try { chk = B.holdsIdentifier(h.t, P, C) === true; } catch { chk = false; }
  console.log(`FLIP#${flips} (letter ${i}, who=${who})\n  t=${c(J(t))}\n  head: SENT ${c(J(h.t))}\n  before: ${c(sh(f))}\n  base: REFUSED; its own redaction ${c(J(b.t))}\n  the base's check on the head's text: ${chk ? 'REFUSES' : 'accepts'}; head shows that the base's redaction replaced: ${J(shows(h.t, b.t))}`);
}
console.log(`gen3 seed ${seed}: ${N} letters, flips (base refused, head sent) ${flips}, of them refused by "before" ${flipsBeforeRefused} [${el()}]`);
console.log('patients: ' + J(Object.fromEntries(Object.entries(pats).map(([w, v]: any) => [w, { names: v.P.names, dob: v.P.datesOfBirth, ids: v.P.memberIds, claims: v.C.map((x: any) => x.claimNumbers) }]))));

// ---------- (2)
const dir = '/home/user/review-d1/d1/out';
for (const file of fs.readdirSync(dir).filter((x) => x.includes('7717'))) {
  const seenT = new Set<string>(); let nrec = 0; let repro = 0; let befRef = 0; let detailed = 0;
  for (const line of fs.readFileSync(`${dir}/${file}`, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let rec: any; try { rec = JSON.parse(line); } catch { continue; }
    if (!/flip/i.test(String(rec.k)) || typeof rec.t !== 'string' || seenT.has(rec.t)) continue;
    seenT.add(rec.t); nrec += 1;
    const pc = pats[rec.who]; if (!pc) { console.log(`  no patient known for who=${rec.who}`); continue; }
    const h = out(H, rec.t, pc.P, pc.C); const b = out(B, rec.t, pc.P, pc.C); const f = out(F, rec.t, pc.P, pc.C);
    if (!h.r && b.r) repro += 1;
    if (!h.r && b.r && f.r) befRef += 1;
    console.log(`  ${rec.k} who=${rec.who} head ${h.r ? 'R' : 'S'} before ${f.r ? 'R' : 'S'} base ${b.r ? 'R' : 'S'} t=${c(J(rec.t), 150)}`);
    if (!h.r && b.r && detailed < 3 && (f.r || /ADJ|CHK|SHOWS|OWN/.test(String(rec.k)))) { detailed += 1; console.log(`    t=${c(J(rec.t))}\n    head: SENT ${c(J(h.t))}\n    before: ${c(sh(f))}\n    base's own redaction ${c(J(b.t))}; head shows that it replaced: ${J(shows(h.t, b.t))}`); }
  }
  console.log(`${file}: ${nrec} distinct flip letters, reproduced here (base refused, head sent) ${repro}, of them refused by "before" ${befRef} [${el()}]`);
}

// ---------- (3)
const PAT = { pseudonym: 'p', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['ZZ7654321'] };
const CLAIMS = [{ claimId: 'c', patientPseudonym: 'p', claimNumbers: ['SYNCLAIM0001'] }];
function rng(s0: number) { let a = s0 >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const r = rng(Number(process.env.SEED3 ?? 4242)); const pick = (a: string[]) => a[Math.floor(r() * a.length)]!;
const LABELS = ['Phone', 'Tel', 'Cell', 'Fax', 'PH#', 'Contact', 'TTY', 'SSN', 'Call', 'Phone No.', 'SS#', 'Telephone'];
const LISTS = [' (2) ', ' (6) ', ' (2) ', ' (1) ', ' (2), ', ' (2). ', ' (12) ', ' (2) - ', ' (2): ', ' 2) ', ' 1: '];
const FIRST = ['555 0123', '555-0123', '555.0123', '900 12 3456', '202 555 0123', '555 0100', '900-12-3456', '900123456', '5550123', '(202) 555-0123'];
const SEP = [' ', '-', '/', ', ', '.', '  ', '\n', ' - ', ' x', ' ext ', '; ', ' or ', ' / '];
const TAIL = ['4567', '45', '456', '45678', '0101', '900 12 3456', '12 3456', '555 0101', '4567 8901', '1', '12', '123', '01/02/2020', '150.00', '2020', '62701', '97110 2 150.00', '555-0101', '202', '0123 4567', '900 12', '3456'];
const PRE = ['', '', '', 'Seen 01/01/2020 97110 2 150.00\n', 'Billed 01/01/2020-150.00.\n', 'Jane Zephyra ', 'ZZ7654321 ', 'Paid 12 '];
const POST = ['', '', '', ', 12', ' Paid $1.00', '\nJane Zephyra', ' 150.00 120.00'];
const until = Date.now() + Number(process.env.SECS ?? '25') * 1000; let n3 = 0; let f3 = 0; let f3new = 0; let f3bef = 0; const seen3 = new Set<string>(); let printed = 0;
while (Date.now() < until) {
  const list = pick(LISTS); const t = pick(PRE) + pick(LABELS) + list + pick(FIRST) + pick(SEP) + pick(TAIL) + pick(POST); n3 += 1;
  const h = out(H, t, PAT, CLAIMS); if (h.r) continue;
  const b = out(B, t, PAT, CLAIMS); if (!b.r) continue;
  f3 += 1; const f = out(F, t, PAT, CLAIMS); if (f.r) f3bef += 1;
  const thisRound = /^ \(\d+\)(?!:)/.test(list); if (thisRound) f3new += 1;
  const digits = (h.t.replace(PH, ' ').match(/[0-9]{3,}/g) ?? []).join(' ');
  const key = h.t.replace(/[0-9]+/g, '9').replace(/\p{L}+/gu, 'a') + (f.r ? 'R' : 'S');
  if (seen3.has(key) || printed >= 12) continue; seen3.add(key); printed += 1;
  console.log(`LIST-FLIP${thisRound ? ' (parenthesis, no colon: this round)' : ''}\n  t=${c(J(t), 260)}\n  head: SENT ${c(J(h.t), 260)} | before: ${c(sh(f), 200)} | base: REFUSED, its own redaction ${c(J(b.t), 200)}\n  digits (3+) left in the head's text: ${digits}`);
}
console.log(`list-number search: ${n3} letters, base refused and head sent ${f3} (list number in parentheses with no colon ${f3new}; refused by "before" ${f3bef}) [${el()}]`);
