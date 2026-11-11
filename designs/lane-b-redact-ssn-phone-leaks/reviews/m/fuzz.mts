// node fuzz.mts <seconds> <seed> : differential fuzz head / before / base with planted numbers. Synthetic only.
import { B, H1, N, esc, run } from './lib.mts';
import { makeGen2 } from '/home/user/review-d1/d1/gen2.mts';
const budget = Number(process.argv[2] ?? 60) * 1000; let seedv = Number(process.argv[3] ?? 1) >>> 0; const gen2secs = Number(process.argv[4] ?? 0);
const rnd = () => { seedv = (seedv + 0x6d2b79f5) >>> 0; let t = seedv; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)] as T;
const n: Record<string, number> = {}; const shown: Record<string, string[]> = {};
const add = (k: string, o: unknown) => { n[k] = (n[k] ?? 0) + 1; const l = (shown[k] ??= []); if (l.length < 5) l.push(esc(JSON.stringify(o)).slice(0, 700)); };
const compact = (s: string) => s.normalize('NFKC').toUpperCase().replace(/[^\p{L}\p{N}]/gu, '');
const ALIKE: Record<string, string[]> = { '0': ['O', 'o', '٠', '०'], '1': ['l', 'I', '١'], '2': ['Z', 'ꛯ', '٢'], '3': ['E', '٣'], '4': ['٤', '４'], '5': ['S', '٥'], '6': ['b', '٦'], '7': ['٧', '७'], '8': ['B', '٨'], '9': ['٩', 'g'] };
const alike = (id: string) => { const at = [...id].map((c, i) => (ALIKE[c] ? i : -1)).filter((i) => i >= 0); if (at.length === 0) return id; let out = [...id]; const k = rnd() < 0.8 ? 1 : 2; for (let j = 0; j < k; j += 1) { const i = pick(at); out[i] = pick(ALIKE[id[i] as string] as string[]); } return out.join(''); };
const spaced = (id: string) => { const i = 1 + Math.floor(rnd() * (id.length - 1)); return id.slice(0, i) + pick([' ', '-', '​', '.']) + id.slice(i); };
const IDSETS: { ids: string[]; claims: string[][] }[] = [
  { ids: ['ZZ19800314'], claims: [['SYNCLAIM0001']] }, { ids: ['ZZ19800314', '800314'], claims: [['SYNCLAIM0001']] }, { ids: ['ZZ7654321', '7654321'], claims: [['SYNCLAIM0001']] },
  { ids: ['7654321', '76543210'], claims: [['SYNCLAIM0001']] }, { ids: ['SYNMEMBER0042'], claims: [['SYN4455667', '4455667']] }, { ids: ['ZZ7654321'], claims: [['SYN4455667'], ['SYN4455668', '4455667']] },
  { ids: ['ZZAB202', 'ZZ19800314'], claims: [['SYN900', 'SYNCLAIM0001']] }, { ids: ['76543210'], claims: [['SYN4455667'], ['ZZ19800314']] },
];
const NAMES = [['JANE Q ZEPHYRA'], ['JANE Q ZEPHYRA', 'J VANTREE'], ['ZEPHYRA VANTREE']];
const NAMEW = ['Zephyra', 'ZEPHYRA', 'Jane Q Zephyra', 'Zephyra, Jane', 'Zephy∙ra', 'Z3phyra', 'Vantree', 'VAN·TREE', 'J. Q. Zephyra', 'Zephyra’s'];
const DOBW = ['03/14/1980', '1980-03-14', '03141980', '3/14/80', 'March 14, 1980', '14 Mar 1980', '19800314', '03-14-1980', 'O3/14/1980'];
const PLANT = ['555-0123', '555 0147', '5550123', '202-555-0123', '(202) 555-0156', '2025550123', '+1 202 555 0188', '555.0123', '202.555.0199', '900-12-3456', '900 12 3456', '900123456', '900-55-1234', 'SYN7788990', 'ZZ44556677', '88776655', '4455 6677', 'SYN-88-7766', 'ZZ 9988 7766', '1234.5678', '99887766', '555​0123', '555‑0123', '900‒12‒3456'];
const LABELS = ['', '', '', 'Member ID: ', 'Member ID ', 'ID ', 'Claim ', 'Claim No. ', 'ICN ', 'SSN ', 'Tel ', 'Ph: ', 'Fax ', 'DOB ', 'Patient: ', 'Ref# ', 'Acct '];
const JOIN = [' ', ' ', '\n', ' \n', '-', '_', '|', '/', '#', ':', ': ', ', ', '', '. ', '\t', ' - ', '​', '­', ' ', '⁠', ' (', ') ', ';', '~'];
const FILL = ['Paid in full.', 'Seen 01/01/2020-150.00Paid in full. ', 'Balance $150.00', 'CPT 97110 x2', 'on 01/02/2020', 'Denied CO-45', 'x', 'ext 12', 'Dear provider,', '(CLAIM_1)', '[MEMBER_ID]', '[CLAIM_1]', '[SSN]', 'page 3'];
const one = (t: string, P: any, C: any, planted: { c: string; inner: boolean }[], src: string) => {
  n.letters = (n.letters ?? 0) + 1;
  let b: any, h: any, x: any;
  try { h = run(H1, t, P, C); } catch (e) { h = { threw: String(e).slice(0, 80) }; }
  try { x = run(N, t, P, C); } catch (e) { x = { threw: String(e).slice(0, 80) }; }
  if (h.threw !== undefined || x.threw !== undefined) { if (h.threw !== x.threw) add('E_THREW_DIFFERS', { t, h: h.threw, x: x.threw, ids: P.memberIds }); else n.threwBoth = (n.threwBoth ?? 0) + 1; return; }
  if (x.text !== h.text || x.refused !== h.refused) add('A_SENT_DIFFERS', { t, h: h.text, x: x.text, hr: h.refused, xr: x.refused, ids: P.memberIds });
  const s1 = JSON.stringify(N.redactionSpans(t, P, C)), s0 = JSON.stringify(H1.redactionSpans(t, P, C)); if (s1 !== s0) add('A_SPANS_DIFFER', { t, ids: P.memberIds });
  if (N.redactLetter(t, P, C).text !== H1.redactLetter(t, P, C).text) add('A_REDACTLETTER_DIFFERS', { t });
  if (N.holdsIdentifier(t, P, C) !== H1.holdsIdentifier(t, P, C)) add('A_HOLDS_RAW_DIFFERS', { t });
  const lost = [...h.cands].filter((c: string) => !x.cands.has(c)); if (lost.length > 0) add('B_LOST', { t, lost, ids: P.memberIds });
  const gained = [...x.cands].filter((c: string) => !h.cands.has(c)); if (gained.length > 0) n.lettersWithMore = (n.lettersWithMore ?? 0) + 1;
  const own = [...P.memberIds, ...C.flatMap((c: any) => c.claimNumbers)].map(compact);
  const whole = compact(t.replace(/[[\]]/g, ' '));
  for (const g of gained) {
    if (own.includes(g)) add('D_OWN_OFFERED_NEW', { t, g, ids: P.memberIds, cl: C.map((c: any) => c.claimNumbers) });
    if (!whole.includes(g)) add('D_GAINED_NOT_IN_LETTER', { t, g, ids: P.memberIds, x: x.text });
    if (/MEMBERID|PATIENTNAME|DATEOFBIRTH|CLAIM[0-9]|^SSN|SSN$|^PHONE|PHONE$/.test(g) && !/MEMBER[ _]?ID|PATIENT[ _]?NAME|CLAIM[ _]?[0-9]|SSN|PHONE/i.test(t.replace(/\[(MEMBER_ID|PATIENT_NAME|DATE_OF_BIRTH|SSN|PHONE|CLAIM_\d+)\]/g, ' '))) add('D_PLACEHOLDER_WORD', { t, g });
  }
  if (x.refused) { n.refused = (n.refused ?? 0) + 1; return; }
  n.sent = (n.sent ?? 0) + 1;
  try { b = run(B, t, P, C); } catch { n.baseThrew = (n.baseThrew ?? 0) + 1; return; }
  for (const p of planted) {
    if (own.some((o) => o === p.c)) continue;
    if (b.cands.has(p.c) && !x.cands.has(p.c)) add(`C_BASE_OFFERS_HEAD_NOT,${p.inner ? 'own-identifier-inside-the-number' : 'NO-own-inside'},${gained.length === 0 ? 'cands-as-before' : 'cands-changed'}${b.refused ? ',base-refused' : ''},${src}`, { t, c: p.c, ids: P.memberIds, cl: C.map((c: any) => c.claimNumbers), b: b.text, x: x.text });
    else if (!h.cands.has(p.c) && x.cands.has(p.c)) n.restored = (n.restored ?? 0) + 1;
  }
};
const letter = () => {
  const set = pick(IDSETS); let ids = [...set.ids]; let claims = set.claims.map((l) => [...l]);
  const ownAll = [...ids, ...claims.flat()];
  const k = 2 + Math.floor(rnd() * 5); let t = ''; const planted: { c: string; inner: boolean; w: string }[] = [];
  for (let i = 0; i < k; i += 1) {
    const r = rnd(); let item: string;
    if (r < 0.34) { const id = pick(ownAll); const q = rnd(); item = q < 0.25 ? id : q < 0.85 ? alike(id) : spaced(alike(id)); }
    else if (r < 0.62) { item = pick(PLANT); planted.push({ c: compact(item), inner: false, w: item }); }
    else if (r < 0.72) item = pick(NAMEW);
    else if (r < 0.82) item = pick(DOBW);
    else item = pick(FILL);
    t += pick(LABELS) + item + (i + 1 < k ? pick(JOIN) : pick(['', '\n', ' Paid']));
  }
  if (planted.length > 0 && rnd() < 0.3) {
    const p = pick(planted); const groups = p.w.normalize('NFKC').match(/[0-9]{3,}/g) ?? [];
    if (groups.length > 0) { const g = pick(groups); const inner = rnd() < 0.5 ? g : g.slice(-4); if (inner.length >= 3 && inner !== p.c) { if (rnd() < 0.5) ids.push(inner); else claims = [...claims.slice(0, -1), [...(claims.at(-1) as string[]), inner]]; for (const q of planted) if (q.c.includes(inner)) q.inner = true; } }
  }
  const P = { pseudonym: 'p', names: pick(NAMES), datesOfBirth: ['1980-03-14'], memberIds: ids }; const C = claims.map((claimNumbers, i) => ({ claimId: `c${i}`, patientPseudonym: 'p', claimNumbers }));
  return { t, P, C, planted };
};
const report = (title: string) => { console.log(title, JSON.stringify(n)); for (const [k, l] of Object.entries(shown)) for (const s of l) console.log('  ', k, s); for (const k of Object.keys(n)) delete n[k]; for (const k of Object.keys(shown)) delete shown[k]; };
let t0 = Date.now();
while (Date.now() - t0 < budget) { const { t, P, C, planted } = letter(); one(t, P, C, planted, 'fuzz'); }
report(`## fuzz seed ${process.argv[3] ?? 1}:`);
if (gen2secs > 0) { const g = makeGen2(Number(process.argv[3] ?? 1) + 7000); t0 = Date.now(); while (Date.now() - t0 < gen2secs * 1000) { const { t, P, C } = g.letter(); one(t, P, C, [], 'gen2'); } report('## gen2:'); }
