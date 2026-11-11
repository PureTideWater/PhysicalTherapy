// Review M-1 on four trees, then a family: a short identifier of the call's own as a whole piece of the number.
import { pathToFileURL } from 'node:url';
const S = 'packages/model-gateway/src/redact.ts';
const T: Record<string, any> = { base: await import(pathToFileURL(`/home/user/tree-ef3/${S}`).href), ac41: await import(pathToFileURL(`/home/user/work/w13/ac41/${S}`).href), head: await import(pathToFileURL(`/home/user/work/w13/head2/${S}`).href), alt2: await import(pathToFileURL(`/home/user/work/w13/alt2/${S}`).href) };
const mk = (ids: string[], cl: string[][]) => ({ P: { pseudonym: 'p', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ids }, C: cl.map((claimNumbers, i) => ({ claimId: `c${i}`, patientPseudonym: 'p', claimNumbers })) });
const run = (M: any, t: string, P: any, C: any) => { const s = M.redactLetterForScreen(t, P, C); return { text: s.text as string, refused: M.holdsIdentifier(s.text, P, C) as boolean, cands: new Set<string>(s.candidates) }; };
const cases: [string, string[], string[][], string][] = [
  ['Member ID: ZZ1980O314\n555-0123\nPaid in full.', ['ZZ19800314'], [['0123']], '5550123'],
  ['Member ID: ZZ1980O314\n555-0123\nPaid in full.', ['ZZ19800314', '555'], [['SYNCLAIM0001']], '5550123'],
  ['7654E210 555-0123', ['7654321', '76543210'], [['0123']], '5550123'],
  ['Claim SYN445S667\n555-0123', ['ZZ7654321', '0123'], [['SYN4455667']], '5550123'],
  ['Call 314 555-0123 today.', ['ZZ19800314'], [['0123']], '5550123'],
  ['ID ZZ1980O900-12-3456', ['ZZ19800900', '3456'], [['SYNCLAIM0001']], '900123456'],
];
for (const [t, ids, cl, want] of cases) { const { P, C } = mk(ids, cl); console.log(JSON.stringify(t), JSON.stringify(ids), JSON.stringify(cl)); for (const [n, M] of Object.entries(T)) { const r = run(M, t, P, C); console.log(`   ${n.padEnd(5)} ${r.refused ? 'REFUSED' : 'sent   '} ${JSON.stringify(r.text)} ${want}:${r.cands.has(want) ? 'offered' : 'NOT-offered'}`); } }
// The family: look-alike writing of the ID, a gap, a number; the patient also has a short identifier that is the number's first or last piece, or none.
const n: Record<string, number> = {}; const ex: string[] = [];
const fam = [{ ids: ['ZZ19800314'], w: ['ZZ1980O314', 'ZZI9800314'] }, { ids: ['ZZ19800314', '800314'], w: ['ZZ1980O314', 'ZZI9800314'] }, { ids: ['7654321', '76543210'], w: ['7654E210', '765432l0'] }, { ids: ['ZZ7654321', '7654321'], w: ['ZZ765432l', 'ZZ76S4321'] }];
const nums: [string, string[]][] = [['555-0123', ['555', '0123']], ['555 0123', ['555', '0123']], ['202-555-0123', ['202', '555', '0123']], ['(202) 555-0123', ['202', '0123']], ['900-12-3456', ['900', '3456']], ['900 12 3456', ['900', '3456']]];
for (const f of fam) for (const w of f.w) for (const lead of ['ID ', 'Member ID: ', '']) for (const gap of [' ', '\n', ' \n', '-', ': ', ', ', '']) for (const [num, pieces] of nums) for (const short of [null, ...pieces]) for (const where of ['member', 'claim']) for (const end of ['', ' Paid']) for (const order of [0, 1]) {
  if (short === null && where === 'claim') continue;
  const ids = short !== null && where === 'member' ? [...f.ids, short] : f.ids; const cl = short !== null && where === 'claim' ? [['SYNCLAIM0001'], [short]] : [['SYNCLAIM0001']];
  const { P, C } = mk(ids, cl); const t = order === 0 ? `${lead}${w}${gap}${num}${end}` : `${lead}${num}${gap}${w}${end}`; const want = num.replace(/[^0-9]/g, '');
  const b = run(T.base, t, P, C), a = run(T.ac41, t, P, C), h = run(T.head, t, P, C), x = run(T.alt2, t, P, C);
  const add = (k: string) => { n[k] = (n[k] ?? 0) + 1; if (k === k.toUpperCase() && ex.length < 6) ex.push(`${k} ${JSON.stringify({ t, ids, cl })}`); };
  add('letters'); const cls = short === null ? 'no short id' : 'short id';
  if (x.text !== h.text || x.refused !== h.refused || h.text !== a.text || h.refused !== a.refused) add('SENT_DIFFERS');
  if ([...h.cands].some((c) => !x.cands.has(c))) add('LOST_AGAINST_HEAD'); if ([...a.cands].some((c) => !x.cands.has(c))) add('LOST_AGAINST_AC41');
  const own = [...ids, ...cl.flat()]; if (own.some((o) => x.cands.has(o) && !a.cands.has(o))) add('OWN_OFFERED_NEW');
  if (!x.refused && b.cands.has(want)) { add(`${cls}: base offers`); if (!h.cands.has(want)) add(`${cls}: head misses (M-1)`); if (!x.cands.has(want)) add(`${cls}: ALT2_MISSES`); }
}
console.log(JSON.stringify(n, null, 1)); for (const e of ex) console.log(e.slice(0, 300));
