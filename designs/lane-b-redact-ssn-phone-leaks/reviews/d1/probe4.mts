// D1 review, D1-1: an initial beside a name only the head reads is a settled match the base did not make. It ends the
// label window of the reading that decides whether fresh matches are applied; a fresh match then takes the label itself.
// node probe4.mts
import { pathToFileURL } from 'node:url';
const load = async (p: string): Promise<any> => import(pathToFileURL(p).href);
const B = await load('/home/user/tree-ef3/packages/model-gateway/src/redact.ts');
const H = await load('/home/user/fix/packages/model-gateway/src/redact.ts');
const I = await load('/home/user/review-d1/d1/inst/redact.ts');
const P = { pseudonym: 'p', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['SYNMEMBER0042'] };
const C = [{ claimId: 'c', patientPseudonym: 'p', claimNumbers: ['SYNCLAIM0001'] }];
const out = (R: any, t: string) => { try { const s = R.redactLetterForScreen(t, P, C).text as string; return { r: R.holdsIdentifier(s, P, C) as boolean, s }; } catch (e) { return { r: false, s: `THREW ${String(e).slice(0, 80)}` }; } };
const letters: [string, string][] = [
  ['a', 'Ze·ph·yra J 900 12 34, 56'], ['b', 'Ze·ph·yra, J. 900 12 34, 56'], ['c', 'Z3ph·yra J 900 12 34, 56'], ['d', 'Ze·ph·yra J 20 25 55 01 23'], ['e', 'Ze•ph•yra J. 900,12 3456'], ['f', 'Re: Ze·ph·yra J\n900 12 34, 56 is on file.'],
  ['ctl plain name', 'Zephyra J 900 12 34, 56'], ['ctl no initial', 'Ze·ph·yra 900 12 34, 56'], ['ctl label outside the name', 'Phone Ze·phyra J 900 12 34, 56'], ['ctl no label in the name', 'Zeph·yra J 900 12 34, 56'], ['ctl number alone', '900 12 34, 56'],
];
for (const [id, t] of letters) {
  const [b, h] = [out(B, t), out(H, t)];
  const all = H.redactLetter(t, P, C).text as string;
  console.log(`${id}: ${JSON.stringify(t)}\n   base ${b.r ? 'REFUSED' : 'SENT'} ${JSON.stringify(b.s)}\n   head ${h.r ? 'REFUSED' : 'SENT'} ${JSON.stringify(h.s)}${all !== h.s ? ' (withheld)' : ''}${!h.r ? ` | base's check on the head's text: ${B.holdsIdentifier(h.s, P, C)}` : ''}`);
}
const t = letters[0]![1]; const tt = I.__t; const normal: string = tt.unbracketed(t); const subject = tt.letterSubject(P, C);
const found: any[] = tt.matchesIn(tt.unmarked(normal), subject);
console.log('matches of (a):', JSON.stringify(found.map((m) => ({ kind: m.kind, text: normal.slice(m.start, m.end), fresh: m.fresh === true }))));
const settled = tt.written(normal, tt.merge(found.filter((m) => m.fresh !== true)));
console.log('settled-only text:', JSON.stringify(settled), '| chainLeft not strict:', tt.chainLeft(settled, subject, C.length, false), '| strict:', tt.chainLeft(settled, subject, C.length, true));
console.log('letter as written | chainLeft not strict:', tt.chainLeft(normal, subject, C.length, false), '| base holdsIdentifier(letter):', B.holdsIdentifier(t, P, C));
