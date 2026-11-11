import { B, H1, N, esc, run } from './lib.mts';
export const n: Record<string, number> = {}; export const shown: Record<string, string[]> = {};
export const add = (k: string, o: unknown) => { n[k] = (n[k] ?? 0) + 1; const l = (shown[k] ??= []); if (l.length < 4) l.push(esc(JSON.stringify(o)).slice(0, 600)); };
export const compact = (s: string) => s.normalize('NFKC').toUpperCase().replace(/[^\p{L}\p{N}]/gu, '');
export const one = (t: string, P: any, C: any, planted: string[], tag: string) => {
  n.letters = (n.letters ?? 0) + 1;
  let h: any, x: any;
  try { h = run(H1, t, P, C); } catch (e) { h = { threw: String(e).slice(0, 80) }; }
  try { x = run(N, t, P, C); } catch (e) { x = { threw: String(e).slice(0, 80) }; }
  if (h.threw !== undefined || x.threw !== undefined) { if (h.threw !== x.threw) add('E_THREW_DIFFERS', { t, h: h.threw, x: x.threw }); else n.threwBoth = (n.threwBoth ?? 0) + 1; return; }
  if (x.text !== h.text || x.refused !== h.refused) add('A_SENT_DIFFERS', { t, h: h.text, x: x.text, ids: P.memberIds });
  if (JSON.stringify(N.redactionSpans(t, P, C)) !== JSON.stringify(H1.redactionSpans(t, P, C))) add('A_SPANS_DIFFER', { t, ids: P.memberIds });
  const lost = [...h.cands].filter((c: string) => !x.cands.has(c)); if (lost.length > 0) add('B_LOST', { t, lost, ids: P.memberIds });
  const gained = [...x.cands].filter((c: string) => !h.cands.has(c)); if (gained.length > 0) n.lettersWithMore = (n.lettersWithMore ?? 0) + 1;
  const own = [...P.memberIds, ...C.flatMap((c: any) => c.claimNumbers)].map(compact); const whole = compact(t.replace(/[[\]]/g, ' '));
  for (const g of gained) {
    if (own.includes(g)) add('D_OWN_OFFERED_NEW', { t, g, ids: P.memberIds, cl: C.map((c: any) => c.claimNumbers) });
    if (!whole.includes(g)) add('D_GAINED_NOT_IN_LETTER', { t, g, ids: P.memberIds, x: x.text });
    if (/MEMBERID|PATIENTNAME|DATEOFBIRTH|CLAIM[0-9]|^SSN|SSN$|^PHONE|PHONE$/.test(g)) add('D_PLACEHOLDER_WORD', { t, g });
  }
  if (x.refused) { n[`refused,${tag}`] = (n[`refused,${tag}`] ?? 0) + 1; return; }
  const b = run(B, t, P, C);
  for (const c of planted) {
    if (own.includes(c)) continue;
    if (b.cands.has(c) && !x.cands.has(c)) add(`C_BASE_OFFERS_HEAD_NOT,${tag},${gained.length === 0 ? 'cands-as-before' : 'cands-changed'}${b.refused ? ',base-refused' : ''}`, { t, c, ids: P.memberIds, cl: C.map((q: any) => q.claimNumbers), dob: P.datesOfBirth, b: b.text, x: x.text });
    else if (!h.cands.has(c) && x.cands.has(c)) n[`restored,${tag}`] = (n[`restored,${tag}`] ?? 0) + 1;
    else if (x.cands.has(c)) n[`offered-as-before,${tag}`] = (n[`offered-as-before,${tag}`] ?? 0) + 1;
    else n[`base-does-not-offer,${tag}`] = (n[`base-does-not-offer,${tag}`] ?? 0) + 1;
  }
};
export const report = (title: string) => { console.log(title, JSON.stringify(n, null, 0)); for (const [k, l] of Object.entries(shown)) for (const s of l) console.log('  ', k, s); for (const k of Object.keys(n)) delete n[k]; for (const k of Object.keys(shown)) delete shown[k]; };
