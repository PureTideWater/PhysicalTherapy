// Reviewer L: prints the three trees' outcomes (and the head's branch) for given letters. Synthetic twins only.
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
const S = 'packages/model-gateway/src/redact.ts';
const H = await import(pathToFileURL('/home/user/review-d1/d1/inst/redact.ts').href);
const HEAD = await import(pathToFileURL(`/home/user/fix/${S}`).href);
const BF = await import(pathToFileURL(`/home/user/work/p17/before/${S}`).href);
const B = await import(pathToFileURL(`/home/user/tree-ef3/${S}`).href);
const T = H.__t;
const esc = (s: string) => JSON.stringify(s).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
const mk = (names: string[], dob: string[], memberIds: string[], claims: string[][]) => ({ P: { pseudonym: 'p', names, datesOfBirth: dob, memberIds }, C: claims.map((claimNumbers, i) => ({ claimId: `c${i}`, patientPseudonym: 'p', claimNumbers })) });
const cases = JSON.parse(readFileSync(process.argv[2] as string, 'utf8')) as { note?: string; t: string; names?: string[]; dob?: string[]; ids: string[]; claims?: string[][]; want?: string[] }[];
for (const c of cases) {
  const { P, C } = mk(c.names ?? ['JANE Q ZEPHYRA'], c.dob ?? ['1980-03-14'], c.ids, c.claims ?? [['SYNCLAIM0001']]);
  console.log(`# ${c.note ?? ''} ids=${JSON.stringify(c.ids)} claims=${JSON.stringify(c.claims ?? [['SYNCLAIM0001']])}\n  letter ${esc(c.t)}`);
  for (const [name, M] of [['base  ', B], ['before', BF], ['head  ', HEAD]] as const) {
    const s = M.redactLetterForScreen(c.t, P, C); const r = M.holdsIdentifier(s.text, P, C);
    const want = (c.want ?? []).map((w) => `${w}:${(s.candidates ?? []).includes(w) ? 'offered' : 'NOT-offered'}`).join(' ');
    console.log(`  ${name} ${r ? 'REFUSED' : 'sent   '} ${esc(s.text)} ${want}${c.want === undefined ? '' : `  cands=${esc(JSON.stringify(s.candidates))}`}`);
  }
  const subject = T.letterSubject(P, C); const normal = T.unbracketed(c.t);
  const all = T.matchesIn(T.unmarked(normal), subject);
  const found = all.filter((m: any) => m.withheld !== true); const settled = found.filter((m: any) => m.fresh !== true);
  const st = T.written(normal, T.merge(settled)); const ns = T.chainLeft(st, subject, C.length, false);
  console.log(`  head branch=${!found.some((m: any) => m.fresh === true) ? 'nofresh' : ns ? 'settled' : 'all'} matches=${all.map((m: any) => `${m.kind}${m.fresh ? '*' : ''}${m.withheld ? '(withheld)' : ''}[${esc(normal.slice(m.start, m.end))}]`).join(' ')}`);
  console.log(`  head all-applied text ${esc(T.written(normal, T.merge(found)))} check=${HEAD.holdsIdentifier(T.written(normal, T.merge(found)), P, C)}`);
}
