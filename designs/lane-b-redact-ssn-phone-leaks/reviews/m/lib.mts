import { pathToFileURL } from 'node:url';
const S = 'packages/model-gateway/src/redact.ts';
const load = async (p: string): Promise<any> => import(pathToFileURL(p).href);
export const B = await load(`/home/user/tree-ef3/${S}`);
export const H1 = await load(`/home/user/work/w13/ac41/${S}`);
export const N = await load(process.env.HEAD_SRC ?? `/home/user/work/w13/head2/${S}`);
export const esc = (s: string) => JSON.stringify(s).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
export const run = (M: any, t: string, P: any, C: any) => { const s = M.redactLetterForScreen(t, P, C); return { text: s.text as string, refused: M.holdsIdentifier(s.text, P, C) as boolean, cands: new Set<string>(s.candidates) }; };
export const patient = (memberIds: string[], names = ['JANE Q ZEPHYRA'], dob = ['1980-03-14']) => ({ pseudonym: 'p', names, datesOfBirth: dob, memberIds });
export const claimsOf = (lists: string[][]) => lists.map((claimNumbers, i) => ({ claimId: `c${i}`, patientPseudonym: 'p', claimNumbers }));
export const show = (label: string, t: string, P: any, C: any, wanted: string[]) => {
  const b = run(B, t, P, C), h = run(H1, t, P, C), x = run(N, t, P, C);
  console.log(`${label}\n  letter ${esc(t)}  ids ${JSON.stringify(P.memberIds)} claims ${JSON.stringify(C.map((c: any) => c.claimNumbers))} dob ${JSON.stringify(P.datesOfBirth)}`);
  for (const [name, r] of [['base  ', b], ['before', h], ['head  ', x]] as const) console.log(`  ${name} text ${esc(r.text)} refused ${r.refused} ${wanted.map((w) => `${w}:${r.cands.has(w)}`).join(' ')}`);
  console.log(`  head-before cands same: ${[...x.cands].sort().join() === [...h.cands].sort().join()}  head cands: ${[...x.cands].join(' ')}`);
  console.log(`  base cands: ${[...b.cands].join(' ')}`);
};
