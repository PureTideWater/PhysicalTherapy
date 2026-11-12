const H = await import('/home/user/m34/proto/packages/model-gateway/src/redact.ts');
const C = (...n: string[]) => [{ claimId: 'c1', patientPseudonym: 'p', claimNumbers: n }];
const P = { pseudonym: 'p', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: [] };
const out = (t: string, c: any, f: number) => { H.__setFloor(f); const r = H.redactLetterForScreen(t, P, c); return H.holdsIdentifier(r.text, P, c, H.checkWorkOf(r)) ? 'REFUSED' : r.text === t ? 'sent as written' : JSON.stringify(r.text); };
for (const [n, t] of [['12345', 'Account12345 was paid'], ['1234', 'Account1234 was paid'], ['12345', 'Fax X12345 ext'], ['97110', 'Billed 97110GP twice'], ['0283', 'Billed G0283 twice'], ['12345', 'Acct12345 was paid']] as const) console.log(`claim ${n} | ${JSON.stringify(t)} | base: ${out(t, C(n), 0)} | floor 5: ${out(t, C(n), 5)} | floor 6: ${out(t, C(n), 6)}`);
