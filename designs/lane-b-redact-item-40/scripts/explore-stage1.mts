const dirs = process.argv.slice(2);
const P = (names: string[], m: string[]) => ({ pseudonym: 'synthetic-patient-21', names, datesOfBirth: ['1980-03-14'], memberIds: m });
const C = (...n: string[]) => n.map((x, i) => ({ claimId: `synthetic-claim-21-${i + 1}`, patientPseudonym: 'synthetic-patient-21', claimNumbers: [x] }));
const esc = (s: string) => JSON.stringify(s).replace(/[^\x20-\x7e]/g, (c) => `<U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}>`);
const dig = [P(['JANE Q ZEPHYRA'], ['76543210', 'ZZ7654321']), C('ZZ99887')] as const;
const nm = (n: string) => [P([n], ['SYN555001']), C('ZZ99887')] as const;
const rows: [string, readonly [any, any]][] = [
  ...['Ref ①76543210 on file.', 'Ref 76543210² on file.', 'Member ID: 76543210¹', 'Ref ⑴76543210 on file.', 'Ref Ⅷ76543210 on file.', 'Ref 76543210½ on file.', 'Ref ① 76543210 on file.', 'Ref 76543210 ² on file.', 'Ref ↀ7654 on file.', 'Ref ↀ76543210 on file.', 'Ref ZZ7654321¹ on file.', 'Ms. Zephyra¹ was seen.', 'Ref №76543210 on file.',
    'Member ID \u008576543210 paid', 'Member ID 76543210\u0085 paid', 'Member ID 76543210\u0000', 'X\u009676543210 paid', '76543210\u0096B paid', 'Member ID 7654\uD8003210 paid', 'Member ID 7654\uDC003210 paid', 'Member ID 7654\u00013210 paid'].map((l) => [l, dig] as [string, readonly [any, any]]),
  ['ZZ/ZZZZ Z.Z.Z', nm('ZZZZZZ')], ['AA/AAAAAA A.A.A', nm('AAAAAAAA')], ['Ann A.A.', nm('ANNA')], ['Zephyr A.J.Q.', nm('JANE Q ZEPHYRA')], ['Zephyra. I am', nm('JANE Q ZEPHYRA')], ['Dear Zephyra. I am writing', nm('JANE Q ZEPHYRA')], ['Zephyr A.A.', nm('ANA ZEPHYRA')],
];
for (const d of dirs) {
  const H = await import(`${d}/packages/model-gateway/src/redact.ts`);
  console.log('== ' + d.split('/').pop());
  for (const [l, [p, c]] of rows) { const r = H.redactLetterForScreen(l, p, c); console.log(`${esc(l)} | ${H.holdsIdentifier(r.text, p, c, H.checkWorkOf(r)) ? 'REFUSED' : esc(r.text)} | redactLetter+check ${H.holdsIdentifier(H.redactLetter(l, p, c).text, p, c)}`); }
  // budget rows
  const F = (u: string, n: number) => u.repeat(Math.floor(n / u.length));
  const BP = { pseudonym: 'synthetic-patient-7', names: ['JANE Q VANTREE'], datesOfBirth: ['1961-03-03'], memberIds: ['ZZ1234567'] };
  const BC = [{ claimId: '00000000-0000-4000-8000-000000000001', patientPseudonym: 'synthetic-patient-7', claimNumbers: ['SYN555001'] }];
  for (const [n, t] of [['414M', F('㏾;', 57970) + '\r\n'], ['414M+85 end', F('㏾;', 57970) + '\r\n\u0085'], ['414M 85 for last ;', F('㏾;', 57968) + '㏾\u0085\r\n'], ['403M+85', `Vantree${' '.repeat(2000)}x${' J'.repeat(49000)}\u0085`]] as const) {
    const r = H.redactLetterForScreen(t, BP, BC); const spent = H.checkWorkOf(r);
    let w = -1; const orig = H.holdsIdentifier; console.log(`${n} | len ${t.length} | redaction ${spent} | sent text len ${r.text.length} | refused ${H.holdsIdentifier(r.text, BP, BC, spent)}`);
  }
}
