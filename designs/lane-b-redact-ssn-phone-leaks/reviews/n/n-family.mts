// node n-family.mts: an own identifier written plainly over one end of a number (or in a look-alike writing before it), a second own identifier inside the number, neighbours after. Synthetic only.
import { T, esc, run, compact, fold, show, patient, claimsOf } from './nlib.mts';
const C0 = claimsOf([['SYNCLAIM0001']]);
show('f1 fuzz letter, shortened', 'Fax 7654٣210​1-202-555-0123 4455', patient(['76543210']), claimsOf([['SYNCLAIM0001', '01234455']]), ['7654٣210', '76543210']);
show('f2 own in a non-ASCII digit writing whole inside a 9-digit run, own over its end', 'ID 90012٣456 77', patient(['12345677', '0012345']), C0, ['0012٣456', '90012٣456']);
show('f3 look-alike own before the number, inner own in arabic-indic', 'Member ID: ZZ1980O314\n202-555-٠123', patient(['ZZ19800314', '5550123']), C0, ['555٠123']);
const n: Record<string, number> = {}; const ex: Record<string, string[]> = {};
const add = (k: string, o: unknown) => { n[k] = (n[k] ?? 0) + 1; const l = (ex[k] ??= []); if (l.length < 2) l.push(esc(JSON.stringify(o)).slice(0, 420)); };
const fams: { a: string; w: string[]; nums: [string, string][] }[] = [
  { a: '77202', w: ['77 ', '77-', '77\n'], nums: [['202-555-0123', '5550123'], ['202 555 0123', '5550123'], ['202-555-0147', '5550147']] },
  { a: 'ZZ77202', w: ['ZZ77 ', 'ZZ77-', 'ZZ 77 '], nums: [['202-555-0123', '5550123'], ['202 555 0123', '5550123']] },
  { a: 'ZZ900', w: ['ZZ ', 'ZZ-'], nums: [['900-12-3456', '123456'], ['900 12 3456', '123456']] },
  { a: 'ZZ19800314', w: ['ZZ1980O314\n', 'ZZ1980O314 ', 'ZZI9800314\n'], nums: [['555-0123', '5550123'], ['555 0123', '5550123']] },
];
const DIG = [(s: string) => s, (s: string) => s.replace(/(\d)(\d)$/, (_, p, q) => `${p}${String.fromCharCode(0x660 + Number(q))}`), (s: string) => s.replace(/(\d)(\d\d)$/, (_, p, q) => `${String.fromCharCode(0x966 + Number(p))}${q}`)];
for (const f of fams) for (const w of f.w) for (const [num, inner] of f.nums) for (const [di, dig] of DIG.entries()) for (const lead of ['ID ', 'Member ID: ', '', 'Tel ']) for (const tail of ['', ' 88', ' 88 99', '-88', ' Paid', '\nPaid in full.', ' 01/02/2020', ' SYN88']) for (const where of ['member', 'claim', 'none']) {
  const t = `${lead}${w}${dig(num)}${tail}`; const P = patient(where === 'member' ? [f.a, inner] : [f.a]); const C = claimsOf(where === 'claim' ? [['SYNCLAIM0001'], [inner]] : [['SYNCLAIM0001']]);
  const b = run(T.base, t, P, C), h = run(T.before, t, P, C), x = run(T.head, t, P, C), a = run(T.ac41, t, P, C);
  const cls = `${where === 'none' ? 'no inner own' : 'inner own'},${di === 0 ? 'ascii' : 'non-ascii digit'}`;
  add(`letters,${cls}`, 0); if (x.text !== h.text || x.refused !== h.refused) add('A_SENT_DIFFERS', { t });
  if ([...h.cands].some((c) => !x.cands.has(c))) add('B_LOST_BEFORE', { t }); if (a.text === x.text && [...a.cands].some((c) => !x.cands.has(c))) add('B_LOST_AC41', { t });
  if (x.refused) { add(`refused,${cls}`, 0); }
  const own = [...P.memberIds, ...C.flatMap((c: any) => c.claimNumbers)].map(compact); const gained = [...x.cands].filter((c) => !h.cands.has(c)); let hit = ''; let L = false, W = false;
  for (const g of gained) {
    const gf = fold(g.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x966)));
    const nb = b.cands.has(g) ? 'base offers too' : 'BASE DOES NOT';
    if (own.includes(g)) hit = `D own exact new`; else if (own.includes(gf)) add(`D own whole in look-alike writing new,${nb},${x.refused ? 'refused' : 'sent'}`, { t, ids: P.memberIds, cl: C.map((c: any) => c.claimNumbers), g }); else if (own.some((o) => o.length >= 5 && gf.includes(o))) add(`D long own joined new,${nb},${x.refused ? 'refused' : 'sent'}`, { t, ids: P.memberIds, cl: C.map((c: any) => c.claimNumbers), g });
  }
  if (hit !== '') add(hit, { t }); for (const g of gained) { const gf2 = fold(g.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[\u0966-\u096F]/g, (d) => String(d.charCodeAt(0) - 0x966))); if (!b.cands.has(g) && !own.includes(g)) { if (own.includes(gf2)) W = true; else if (own.some((o) => o.length >= 5 && gf2.includes(o))) L = true; } } const fam = f.a === 'ZZ19800314' ? 'look-alike own before' : 'plain own over the start'; add(`PER LETTER,${fam},${cls},${x.refused ? 'refused' : 'sent'}`, 0); if (W) add(`PER LETTER own whole in look-alike new and base does not,${fam},${cls},${x.refused ? 'refused' : 'sent'}`, 0); if (L) add(`PER LETTER long own joined new and base does not,${fam},${cls},${x.refused ? 'refused' : 'sent'}`, 0);
  if (gained.length > 0) add(`letters with more candidates,${cls}`, 0);
}
console.log(JSON.stringify(n, null, 1)); for (const [k, l] of Object.entries(ex)) if (k.startsWith('D') || k.startsWith('A') || k.startsWith('B')) for (const s of l) console.log(k, s);
