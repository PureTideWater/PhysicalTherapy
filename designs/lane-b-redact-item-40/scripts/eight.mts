// eight.mts <src dir>: which of the 953 number characters NFKC leaves as they are the tree already refuses beside a
// digits-only number ("Ref <c>76543210 on file."), with the reader's own fold of each (fold; the look-alike table).
const H = await import(`${process.argv[2]}/redact.ts`);
const P = { pseudonym: 'synthetic-patient-40', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['76543210'] };
const C = [{ claimId: 'synthetic-claim-40', patientPseudonym: 'synthetic-patient-40', claimNumbers: ['ZZ99887'] }];
let stable = 0;
for (let cp = 0; cp <= 0x10ffff; cp += 1) {
  if (cp >= 0xd800 && cp <= 0xdfff) continue;
  const ch = String.fromCodePoint(cp);
  if (!/[\p{Nl}\p{No}]/u.test(ch) || ch.normalize('NFKC') !== ch) continue;
  stable += 1;
  const refused = (l: string) => { const r = H.redactLetterForScreen(l, P, C); return H.holdsIdentifier(r.text, P, C, H.checkWorkOf(r)); };
  if (refused(`Ref ${ch}76543210 on file.`)) console.log(`U+${cp.toString(16).toUpperCase().padStart(4, '0')} ${/\p{Nl}/u.test(ch) ? 'Nl' : 'No'} fold ${JSON.stringify(H.fold(ch))} after too ${refused(`Ref 76543210${ch} on file.`)} alone ${refused(`Ref ${ch} on file.`)}`);
}
console.log(`of ${stable}`);
