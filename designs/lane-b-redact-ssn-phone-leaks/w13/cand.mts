// The screen's candidates after L-1's fix: what is sent does not change, the screen loses no candidate, and a number the
// base offers is offered. node cand.mts <new redact.ts> <seconds for the random part> <seed>
import { pathToFileURL } from 'node:url';
import { makeGen2 } from '/home/user/review-d1/d1/gen2.mts';
const S = 'packages/model-gateway/src/redact.ts';
const load = async (p: string): Promise<any> => import(pathToFileURL(p).href);
const B = await load(`/home/user/tree-ef3/${S}`);
const H1 = await load(process.env.BEFORE ?? `/home/user/work/w13/ac41/${S}`);
const N = await load(process.argv[2] ?? `/home/user/leaks/${S}`);
const budget = Number(process.argv[3] ?? 60) * 1000; const seed = Number(process.argv[4] ?? 1);
const esc = (s: string) => JSON.stringify(s).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
const n: Record<string, number> = {}; const shown: Record<string, string[]> = {};
const add = (k: string, o: unknown) => { n[k] = (n[k] ?? 0) + 1; const l = (shown[k] ??= []); if (l.length < 4) l.push(esc(JSON.stringify(o)).slice(0, 420)); };
const run = (M: any, t: string, P: any, C: any) => { const s = M.redactLetterForScreen(t, P, C); return { text: s.text as string, refused: M.holdsIdentifier(s.text, P, C) as boolean, cands: new Set<string>(s.candidates) }; };
// Whether a run of digits the base offers is found in the letter only across one of the call's own matches as the new head reads them.
const touchesOwn = (t: string, P: any, C: any, c: string) => {
  const { text, spans } = N.redactionSpans(t, P, C); let out = ''; let kept = 0;
  for (const sp of spans) { out += text.slice(kept, sp.start) + (sp.placeholder === '[SSN]' || sp.placeholder === '[PHONE]' ? text.slice(sp.start, sp.end) : '|'); kept = sp.end; }
  out += text.slice(kept);
  return !out.normalize('NFKC').replace(/[^0-9|]/g, '').split('|').some((seg) => seg.includes(c));
};
const one = (t: string, P: any, C: any, planted?: string) => {
  n.letters = (n.letters ?? 0) + 1;
  const b = run(B, t, P, C), h = run(H1, t, P, C), x = run(N, t, P, C);
  if (x.text !== h.text || x.refused !== h.refused) add('SENT_DIFFERS', { t, h: h.text, x: x.text });
  const lost = [...h.cands].filter((c) => !x.cands.has(c)); if (lost.length > 0) add('LOST', { t, lost });
  const gained = [...x.cands].filter((c) => !h.cands.has(c)); const gainedSet = new Set(gained); if (gained.length > 0) n.lettersWithMore = (n.lettersWithMore ?? 0) + 1;
  const own = [...P.memberIds, ...C.flatMap((c: any) => c.claimNumbers)].map((o: string) => o.toUpperCase().replace(/[^A-Z0-9]/g, ''));
  for (const o of own) if (x.cands.has(o)) add(h.cands.has(o) ? (b.cands.has(o) ? 'own-offered,as-before-and-base' : 'own-offered,as-before') : 'OWN_OFFERED_NEW', { t, o, refused: x.refused });
  if (!x.refused) {
    n.sent = (n.sent ?? 0) + 1;
    if (planted !== undefined) {
      if (b.cands.has(planted) && !x.cands.has(planted)) add(b.refused ? 'base-refused-offers,new-not' : 'BASE_OFFERS_NEW_NOT', { t, ids: P.memberIds, x: x.text });
      if (!h.cands.has(planted) && x.cands.has(planted)) n.fixedPlanted = (n.fixedPlanted ?? 0) + 1;
    } else if (!b.refused) {
      // every run of seven digits or more the base offers that is not one of the call's own
      for (const c of b.cands) if (/^[0-9]{7,}$/.test(c) && !x.cands.has(c) && !own.some((o) => o.includes(c) || c.includes(o))) add(`${touchesOwn(t, P, C, c) ? 'base-digits-joined-to-an-own-identifier' : 'BASE_DIGITS_CLEAR_OF_OWN_NOT_OFFERED'}${gainedSet.size === 0 ? ',candidates-as-before' : ',candidates-changed'}`, { t, c, ids: P.memberIds, cl: C.flatMap((q: any) => q.claimNumbers), b: b.text, x: x.text });
    }
  }
};
// Part 1: the family, in full.
const bam = String.fromCharCode(0xa6ef);
const fam: { ids: string[]; claims: string[][]; writings: string[] }[] = [
  { ids: ['ZZ19800314', '800314'], claims: [['SYNCLAIM0001']], writings: ['ZZ1980O314', 'ZZI9800314', 'ZZ198OO314'] },
  { ids: ['ZZ19800314'], claims: [['SYNCLAIM0001']], writings: ['ZZ1980O314', 'ZZI9800314', 'ZZ198OO314'] },
  { ids: ['ZZ7654321', '7654321'], claims: [['SYNCLAIM0001']], writings: ['ZZ765432l', 'ZZ76S4321', `ZZ76543${bam}1`] },
  { ids: ['ZZ7654321'], claims: [['SYNCLAIM0001']], writings: ['ZZ765432l', 'ZZ76S4321', `ZZ76543${bam}1`] },
  { ids: ['7654321', '76543210'], claims: [['SYNCLAIM0001']], writings: ['7654E210', '76S43210', '765432l0'] },
  { ids: ['76543210'], claims: [['SYNCLAIM0001']], writings: ['7654E210', '76S43210', '765432l0'] },
  { ids: ['SYNMEMBER0042'], claims: [['SYN4455667', '4455667']], writings: ['SYN445S667', 'SYN44S5667', 'SYN44556b7'] },
  { ids: ['SYNMEMBER0042'], claims: [['SYN4455667']], writings: ['SYN445S667', 'SYN44S5667', 'SYN44556b7'] },
];
const leads = ['ID ', 'Member ID: ', 'Claim ', '']; const gaps = [' ', '\n', ' \n', '-', ': ', ', ', '', '. ', '\t', ' - '];
const numbers = ['555-0123', '555 0123', '5550123', '202-555-0123', '(202) 555-0123', '2025550123', '900-12-3456', '900 12 3456', '900123456']; const ends = ['', ' Paid', '\nPaid in full.'];
if (process.env.SKIP1 === undefined) for (const f of fam) for (const w of f.writings) for (const lead of leads) for (const gap of gaps) for (const num of numbers) for (const end of ends) {
  const P = { pseudonym: 'p', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: f.ids }; const C = f.claims.map((claimNumbers, i) => ({ claimId: `c${i}`, patientPseudonym: 'p', claimNumbers }));
  one(`${lead}${w}${gap}${num}${end}`, P, C, num.replace(/[^0-9]/g, ''));
  one(`${lead}${num}${gap}${w}${end}`, P, C, num.replace(/[^0-9]/g, ''));
}
console.log('## part 1, the family in full:', JSON.stringify(n)); for (const [k, l] of Object.entries(shown)) for (const s of l) console.log('  ', k, s);
// Part 2: the D1 review's wide generator.
for (const k of Object.keys(n)) delete n[k]; for (const k of Object.keys(shown)) delete shown[k];
const g = makeGen2(seed); const t0 = Date.now();
while (Date.now() - t0 < budget) { const { t, P, C } = g.letter(); try { one(t, P, C); } catch (e) { add('THREW', { t, e: String(e).slice(0, 100) }); } }
console.log(`## part 2, gen2 seed ${seed}:`, JSON.stringify(n)); for (const [k, l] of Object.entries(shown)) for (const s of l) console.log('  ', k, s);
