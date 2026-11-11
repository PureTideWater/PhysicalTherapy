// Four trees: base (ef3), ac41, before (head2), head (head3). Synthetic twins only.
import { pathToFileURL } from 'node:url';
const S = 'packages/model-gateway/src/redact.ts';
const load = async (p: string): Promise<any> => import(pathToFileURL(p).href);
export const T: Record<string, any> = { base: await load(`/home/user/tree-ef3/${S}`), ac41: await load(`/home/user/work/w13/ac41/${S}`), before: await load(`/home/user/work/w13/head2/${S}`), head: await load(`/home/user/work/w13/head3/${S}`) };
export const esc = (s: string) => JSON.stringify(s).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
export const run = (M: any, t: string, P: any, C: any) => { const s = M.redactLetterForScreen(t, P, C); return { text: s.text as string, refused: M.holdsIdentifier(s.text, P, C) as boolean, cands: new Set<string>(s.candidates) }; };
export const patient = (memberIds: string[], dob = ['1980-03-14'], names = ['JANE Q ZEPHYRA']) => ({ pseudonym: 'p', names, datesOfBirth: dob, memberIds });
export const claimsOf = (lists: string[][]) => lists.map((claimNumbers, i) => ({ claimId: `c${i}`, patientPseudonym: 'p', claimNumbers }));
export const compact = (s: string) => s.normalize('NFKC').toUpperCase().replace(/[^\p{L}\p{N}]/gu, '');
const FOLD: Record<string, string> = { O: '0', I: '1', L: '1', Z: '2', E: '3', S: '5', B: '8', G: '9' };
export const fold = (s: string) => [...s].map((c) => FOLD[c] ?? c).join('');
export const show = (label: string, t: string, P: any, C: any, wanted: string[]) => {
  const r: Record<string, any> = {}; for (const [k, M] of Object.entries(T)) r[k] = run(M, t, P, C);
  console.log(`${label}\n  letter ${esc(t)}  ids ${JSON.stringify(P.memberIds)} claims ${JSON.stringify(C.map((c: any) => c.claimNumbers))} dob ${JSON.stringify(P.datesOfBirth)}`);
  for (const k of ['base', 'ac41', 'before', 'head']) console.log(`  ${k.padEnd(6)} ${r[k].refused ? 'REFUSED' : 'sent   '} text ${esc(r[k].text)} ${wanted.map((w) => `${w}:${r[k].cands.has(w)}`).join(' ')}`);
  const gained = [...r.head.cands].filter((c) => !r.before.cands.has(c)), lost = [...r.before.cands].filter((c) => !r.head.cands.has(c));
  console.log(`  head gained vs before: [${gained.join(' ')}] lost: [${lost.join(' ')}] sentSame: ${r.head.text === r.before.text && r.head.refused === r.before.refused}`);
  console.log(`  head cands: ${[...r.head.cands].join(' ')}\n  base cands: ${[...r.base.cands].join(' ')}`);
};
