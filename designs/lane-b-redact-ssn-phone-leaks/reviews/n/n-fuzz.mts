// node n-fuzz.mts <seconds> <seed>: head (head3) against before (head2), ac41 and base; own identifiers cut out of the number and its neighbours. Synthetic only.
import { T, esc, run, compact, fold, show, patient, claimsOf } from './nlib.mts';
const budget = Number(process.argv[2] ?? 60) * 1000; let seedv = Number(process.argv[3] ?? 1) >>> 0;
const rnd = () => { seedv = (seedv + 0x6d2b79f5) >>> 0; let t = seedv; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = <X,>(a: readonly X[]): X => a[Math.floor(rnd() * a.length)] as X;
const n: Record<string, number> = {}; const shown: Record<string, string[]> = {};
const add = (k: string, o: unknown) => { n[k] = (n[k] ?? 0) + 1; const l = (shown[k] ??= []); if (l.length < 4) l.push(esc(JSON.stringify(o)).slice(0, 520)); };
if (process.argv[4] === 'probe') {
  const C0 = claimsOf([['SYNCLAIM0001']]);
  show('p1 plain own over the number start, long own inside', 'ID 77 202-555-0123 88', patient(['77202', '5550123']), C0, ['5550123', '555012388', '2025550123']);
  show('p1b glued by dash', 'ID 77-202-555-0123 88', patient(['77202', '5550123']), C0, ['5550123', '555012388']);
  show('p1c alnum own over the start', 'ID ZZ77 202-555-0123 88', patient(['ZZ77202', '5550123']), C0, ['5550123', '555012388']);
  show('p1d ssn', 'ID ZZ 900-12-3456 88', patient(['ZZ900', '123456']), C0, ['123456', '12345688', '900123456']);
  show('p1e short claim inside, plain own over the start', 'ID ZZ77 202-555-0123 88', patient(['ZZ77202']), claimsOf([['SYNCLAIM0001'], ['0123']]), ['012388', '5550123', '2025550123']);
  show('p2 own over the number end, long own inside at the start', 'Tel 202-555-0123 88', patient(['012388', '202555']), C0, ['202555', 'TEL202555', '2025550123']);
  show('p3 arabic-indic digit in the inner own', 'Member ID: ZZ1980O314\n555-٠123 77', patient(['ZZ19800314', '5550123']), C0, ['555٠123', '555٠12377']);
  show('p4 unicode dash number', 'Member ID: ZZ1980O314\n555‑0123 77', patient(['ZZ19800314', '5550123']), C0, ['5550123', '555012377']);
  show('p5 dotted number', 'Member ID: ZZ1980O314\n555.0123 77', patient(['ZZ19800314', '5550123']), C0, ['5550123', '555012377']);
  show('p6 own member 5550123 x2 nested with claim', 'ID ZZ77 202-555-0123', patient(['ZZ77202', '5550123']), C0, ['5550123', '2025550123']);
  process.exit(0);
}
const ALIKE: Record<string, string[]> = { '0': ['O', 'o', '٠'], '1': ['l', 'I', '١'], '2': ['Z', '٢'], '3': ['E', '٣'], '4': ['٤'], '5': ['S', '٥'], '6': ['b'], '7': ['٧'], '8': ['B'], '9': ['٩', 'g'] };
const alike = (id: string, from = 1) => { const at = [...id].map((c, i) => (ALIKE[c] && i >= from ? i : -1)).filter((i) => i >= 0); if (at.length === 0) return id; const out = [...id]; const i = pick(at); out[i] = pick(ALIKE[id[i] as string] as string[]); return out.join(''); };
const IDSETS: { ids: string[]; claims: string[][] }[] = [
  { ids: ['ZZ19800314'], claims: [['SYNCLAIM0001']] }, { ids: ['ZZ19800314', '800314'], claims: [['SYNCLAIM0001']] }, { ids: ['ZZ7654321', '7654321'], claims: [['SYNCLAIM0001']] },
  { ids: ['7654321', '76543210'], claims: [['SYNCLAIM0001']] }, { ids: ['SYNMEMBER0042'], claims: [['SYN4455667', '4455667']] }, { ids: ['ZZ19800900'], claims: [['SYN4455202']] }, { ids: ['ZZ7654202', 'ZZ77'], claims: [['SYNCLAIM0900']] },
];
const NUMS = ['555-0123', '555 0147', '202-555-0123', '(202) 555-0156', '2025550123', '+1 202 555 0188', '555.0123', '202.555.0199', '900-12-3456', '900 12 3456', '900123456', '900-55-1234', '555‑0123', '1-202-555-0123', '202 555 0123', '900-12-3456-7890', '202-555-0123 555-0147', '555-0123 ext 12', '555-0123 x 4455'];
const LEAD = ['', '', 'Member ID: ', 'ID ', 'Claim ', 'Tel ', 'SSN ', 'Ph: ', 'Ref# ', 'Fax '];
const GAP = [' ', ' ', '\n', ' \n', '-', ': ', ', ', '', '.', '\t', ' - ', '/', '_', '|', '#', '​', '  '];
const TAIL = ['', ' Paid', '\nPaid in full.', ' 77', ' 77 88', '-77', ' 4455', ' ext 12', ' 01/02/2020', ' x', ' SYN88', '/88', ' 150.00', '\n555-0147', ' ZZ19800314'];
const letter = () => {
  const set = pick(IDSETS); const ids = [...set.ids]; let claims = set.claims.map((l) => [...l]);
  const target = pick([...ids, ...claims.flat()]); const q = rnd();
  const w = q < 0.6 ? alike(target) : q < 0.75 ? target : q < 0.9 ? alike(target).replace(/^(..)/, '$1 ') : pick(['77', 'ZZ77', 'x9', '4455', 'SYN']);
  let num = pick(NUMS); if (rnd() < 0.08) num = alike(num, 0);
  const lay = rnd(); const gap = pick(GAP); const tail = pick(TAIL); const lead = pick(LEAD);
  const t = lay < 0.6 ? `${lead}${w}${gap}${num}${tail}` : lay < 0.85 ? `${lead}${num}${gap}${w}${tail}` : `${lead}${w}${gap}${num}${pick(GAP)}${w}${tail}`;
  // Own identifiers cut from the letter: groups of letters and digits, one to three in a row, or a slice of the compact text.
  const groups = [...t.normalize('NFKC').matchAll(/[\p{L}\p{N}]+/gu)].map((m) => m[0]);
  const k = pick([0, 1, 1, 1, 2, 2, 3]); let dob = ['1980-03-14']; const inner: string[] = [];
  for (let i = 0; i < k; i += 1) {
    let cut: string; const r = rnd();
    if (r < 0.7 && groups.length > 0) { const a = Math.floor(rnd() * groups.length); const len = pick([1, 1, 1, 2, 2, 3]); cut = groups.slice(a, a + len).join(''); if (rnd() < 0.25) cut = rnd() < 0.5 ? cut.slice(-(3 + Math.floor(rnd() * 5))) : cut.slice(0, 3 + Math.floor(rnd() * 5)); }
    else { const all = groups.join(''); const a = Math.floor(rnd() * all.length); cut = all.slice(a, a + 3 + Math.floor(rnd() * 9)); }
    cut = fold(compact(cut)).replace(/[^0-9A-Z]/g, ''); if (rnd() < 0.5) cut = cut.replace(/[A-Z]/g, '');
    if (cut.length < 3 || cut.length > 14 || !/\d/.test(cut)) continue;
    inner.push(cut);
    const z = rnd(); if (z < 0.45) ids.push(cut); else if (z < 0.75) claims = [...claims, [cut]]; else claims = [[...(claims[0] as string[]), cut], ...claims.slice(1)];
  }
  if (rnd() < 0.08) { const d = compact(num).replace(/\D/g, ''); const six = d.slice(-6); const mm = Number(six.slice(2, 4)), dd = Number(six.slice(4, 6)); if (six.length === 6 && mm >= 1 && mm <= 12 && dd >= 1 && dd <= 28) dob = [`19${six.slice(0, 2)}-${six.slice(2, 4)}-${six.slice(4, 6)}`]; }
  const planted = [...new Set((num.normalize('NFKC').match(/[0-9()+. ‑-]{7,}/g) ?? []).flatMap((s) => { const d = s.replace(/\D/g, ''); return [d, d.slice(-7), d.slice(-10), d.slice(0, 9)]; }).filter((d) => d.length >= 7))];
  return { t, P: patient(ids, dob), C: claimsOf(claims), planted, inner };
};
const t0 = Date.now();
while (Date.now() - t0 < budget) {
  const { t, P, C, planted, inner } = letter(); n.letters = (n.letters ?? 0) + 1;
  let b: any, a: any, h: any, x: any;
  try { h = run(T.before, t, P, C); } catch (e) { h = { threw: String(e).slice(0, 90) }; }
  try { x = run(T.head, t, P, C); } catch (e) { x = { threw: String(e).slice(0, 90) }; }
  if (h.threw !== undefined || x.threw !== undefined) { if (h.threw !== x.threw) add('E_THREW_DIFFERS', { t, h: h.threw, x: x.threw }); else n.threwBoth = (n.threwBoth ?? 0) + 1; continue; }
  const ctx = { t, ids: P.memberIds, cl: C.map((c: any) => c.claimNumbers), dob: P.datesOfBirth };
  if (x.text !== h.text || x.refused !== h.refused) add('A_SENT_DIFFERS', ctx);
  if (JSON.stringify(T.head.redactionSpans(t, P, C)) !== JSON.stringify(T.before.redactionSpans(t, P, C))) add('A_SPANS_DIFFER', ctx);
  if (T.head.holdsIdentifier(t, P, C) !== T.before.holdsIdentifier(t, P, C)) add('A_HOLDS_RAW_DIFFERS', ctx);
  const lost = [...h.cands].filter((c: string) => !x.cands.has(c)); if (lost.length > 0) add('B_LOST_AGAINST_BEFORE', { ...ctx, lost });
  a = run(T.ac41, t, P, C); const lostA = [...a.cands].filter((c: string) => !x.cands.has(c)); if (lostA.length > 0) add(a.text === x.text ? 'B_LOST_AGAINST_AC41' : 'b_lost_ac41_sent_differs', { ...ctx, lostA });
  const gained = [...x.cands].filter((c: string) => !h.cands.has(c)); if (gained.length === 0) { n.candsSame = (n.candsSame ?? 0) + 1; } else n.lettersWithMore = (n.lettersWithMore ?? 0) + 1;
  b = run(T.base, t, P, C);
  const own = [...P.memberIds, ...C.flatMap((c: any) => c.claimNumbers)].map(compact); const ownF = own.map(fold);
  for (const g of gained) {
    const gf = fold(g.normalize('NFKD').replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)));
    const inBase = b.cands.has(g) ? 'base-offers-too' : 'BASE-DOES-NOT';
    if (own.includes(g)) add('D_OWN_EXACT_NEW', { ...ctx, g });
    else if (ownF.includes(gf)) add(`D_OWN_LOOKALIKE_WHOLE_NEW,${inBase}`, { ...ctx, g, x: x.text, b: b.text });
    else { const longest = Math.max(0, ...ownF.filter((o) => gf.includes(o)).map((o) => o.length)); if (longest >= 5) add(`D_long_own_joined_new,${inBase}${x.refused ? ',refused' : ''}`, { ...ctx, g, x: x.text, b: b.text }); else if (longest >= 3) add(`d_short_own_joined_new,${inBase}${x.refused ? ',refused' : ''}`, { ...ctx, g, x: x.text, b: b.text }); else n.gainedOther = (n.gainedOther ?? 0) + 1; }
  }
  if (x.refused) { n.refused = (n.refused ?? 0) + 1; continue; }
  n.sent = (n.sent ?? 0) + 1;
  for (const c of planted) {
    if (own.includes(c)) continue;
    const tag = `${inner.some((i) => c.includes(i)) ? 'own-piece-inside' : 'no-own-piece'},${x.text === b.text ? 'sent-as-base' : 'sent-differs-from-base'}`;
    if (b.cands.has(c) && !x.cands.has(c)) add(`C_BASE_OFFERS_HEAD_NOT,${tag}`, { ...ctx, c, b: b.text, x: x.text });
    else if (b.cands.has(c) && !h.cands.has(c)) n.restoredByThisRound = (n.restoredByThisRound ?? 0) + 1;
    else if (b.cands.has(c)) n.plantedOfferedAsBefore = (n.plantedOfferedAsBefore ?? 0) + 1;
  }
}
console.log(`## n-fuzz seed ${process.argv[3] ?? 1}:`, JSON.stringify(n, null, 0)); for (const [k, l] of Object.entries(shown)) for (const s of l) console.log('  ', k, s);
