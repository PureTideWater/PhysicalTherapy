import { pathToFileURL } from 'node:url';
const S = 'packages/model-gateway/src/redact.ts';
const T: Record<string, any> = { base: await import(pathToFileURL(`/home/user/tree-ef3/${S}`).href), ac41: await import(pathToFileURL(`/home/user/work/w13/ac41/${S}`).href), head2: await import(pathToFileURL(`/home/user/work/w13/head2/${S}`).href), head3: await import(pathToFileURL(`/home/user/work/w13/head3/${S}`).href) };
const esc = (s: string) => JSON.stringify(s).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
const z = String.fromCharCode(0x660);
const cases: [string, string[], string[][], string[]][] = [
  ['ID 77 202-555-0123 88', ['77202', '5550123'], [['SYNCLAIM0001']], ['555012388', '012388', '5550123']],
  ['Tel 202-555-0123 88', ['012388', '202555'], [['SYNCLAIM0001']], ['TEL202555', 'TEL202']],
  [`ID 77 202-555-${z}123`, ['77202', '5550123'], [['SYNCLAIM0001']], [`555${z}123`]],
  ['ID ZZ77 202-555-0123 88', ['ZZ77202'], [['SYNCLAIM0001'], ['0123']], ['012388', '5550123', '555012388']],
  // calibration: the same forms where the number is sent as [PHONE]
  ['Member ID: ZZ1980O314\n202-555-0123 77', ['ZZ19800314', '5550123'], [['SYNCLAIM0001']], ['555012377']],
  [`Member ID: ZZ1980O314\n202-555-${z}123`, ['ZZ19800314', '5550123'], [['SYNCLAIM0001']], [`555${z}123`]],
];
for (const [t, ids, cl, wants] of cases) {
  const P = { pseudonym: 'p', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ids }; const C = cl.map((claimNumbers, i) => ({ claimId: `c${i}`, patientPseudonym: 'p', claimNumbers }));
  console.log(esc(t), JSON.stringify(ids), JSON.stringify(cl));
  for (const [n, M] of Object.entries(T)) { const s = M.redactLetterForScreen(t, P, C); const r = M.holdsIdentifier(s.text, P, C); console.log(`   ${n.padEnd(5)} ${r ? 'REFUSED' : 'sent   '} ${esc(s.text)}  ${wants.map((w) => `${esc(w)}:${s.candidates.includes(w) ? 'offered' : 'no'}`).join(' ')}  all=${esc(JSON.stringify(s.candidates))}`.slice(0, 330)); }
}
