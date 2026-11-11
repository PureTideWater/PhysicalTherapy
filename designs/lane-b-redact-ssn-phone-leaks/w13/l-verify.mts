import { pathToFileURL } from 'node:url';
const S = 'packages/model-gateway/src/redact.ts';
const T: Record<string, any> = { base: await import(pathToFileURL(`/home/user/tree-ef3/${S}`).href), before: await import(pathToFileURL(`/home/user/work/p17/before/${S}`).href), head: await import(pathToFileURL(`/home/user/fix/${S}`).href), alt: await import(pathToFileURL(`/home/user/work/w13/alt/${S}`).href) };
const esc = (s: string) => JSON.stringify(s).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
const A = String.fromCharCode(0x96b), B = String.fromCharCode(0x6f3);
const cases: [string, string, string[], string[][], string?][] = [
  ['L-1 two IDs', 'Member ID: ZZ1980O314\n555-0123\nPaid in full.', ['ZZ19800314', '800314'], [['SYNCLAIM0001']], '5550123'],
  ['L-1 one ID (older than the delta?)', 'Member ID: ZZ1980O314\n555-0123\nPaid in full.', ['ZZ19800314'], [['SYNCLAIM0001']], '5550123'],
  ['L-1 claim', 'Claim SYN445S667\n555-0123', ['ZZ7654321'], [['SYN4455667', '4455667']], '5550123'],
  ['L-1 begins another', '7654E210 555-0123', ['7654321', '76543210'], [['SYNCLAIM0001']], '5550123'],
  ['seed 5923', 'ID ZZ76543' + String.fromCharCode(0xa6ef) + '1\n01-02-2020', ['ZZ7654321', '7654321'], [['SYNCLAIM0001']], '01022020'],
  ['L-2 a', 'Tel. 345-62\n03l41980 Seen 01/01/2020-150.00Paid', ['ZZ19800314', '800314', '03141980', '141980'], [['SYNCLAIM0001']]],
  ['L-2 a, one ID', 'Tel. 345-62\n03l41980 Seen 01/01/2020-150.00Paid', ['03141980'], [['SYNCLAIM0001']]],
  ['L-2 b', `SSN 1: 255-7654E210 Zephyra\nLine 3. 76${A}4${B}213-45 6202 Paid`, ['7654321', '76543210'], [['SYNCLAIM0001']]],
  ['minor 4', 'Fax 555\n0123 #7654E210/X76543210 ext 12', ['7654321', '76543210'], [['SYNCLAIM0001']]],
  ['minor 4 alone', 'Fax X76543210 ext 12', ['7654321', '76543210'], [['SYNCLAIM0001']]],
];
for (const [note, t, ids, cl, want] of cases) {
  const P = { pseudonym: 'p', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ids }; const C = cl.map((claimNumbers, i) => ({ claimId: `c${i}`, patientPseudonym: 'p', claimNumbers }));
  console.log(`# ${note} ids=${JSON.stringify(ids)} claims=${JSON.stringify(cl)} letter ${esc(t)}`);
  for (const [name, M] of Object.entries(T)) { const s = M.redactLetterForScreen(t, P, C); const r = M.holdsIdentifier(s.text, P, C); console.log(`  ${name.padEnd(6)} ${r ? 'REFUSED' : 'sent   '} ${esc(s.text)}${want ? `  ${want}:${s.candidates.includes(want) ? 'offered' : 'NOT-offered'} (${s.candidates.length} candidates)` : ''}`); }
}
