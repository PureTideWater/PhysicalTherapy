// Review A's findings, run on base and head: letter path (redactLetter) and screen path (redactLetterForScreen), then the check.
const trees = { base: await import(process.argv[2]!), head: await import(process.argv[3]!) };
const P = (names: string[], dob: string[], memberIds: string[], claimNumbers: string[]) => ({ patient: { pseudonym: 'synthetic-patient-1', names, datesOfBirth: dob, memberIds }, claims: claimNumbers.map((n, i) => ({ claimId: `synthetic-claim-${String(i + 1)}`, patientPseudonym: 'synthetic-patient-1', claimNumbers: [n] })) });
const J = P(['JANE Q ZEPHYRA'], ['1980-03-14'], ['SYNMEMBER0042'], ['SYNCLAIM0001']);
const M = P(['JANE Q ZEPHYRA'], ['1980-03-14'], ['3456150.00'], ['SYNCLAIM0001']);
const rows: [string, ReturnType<typeof P>, string][] = [
  ['A-1a', P(['TOBE ZEPHYRA'], ['1988-02-29'], ['SYN 0042 77'], ['150.00']), 'Service 01/01/2020-150.00 Paid\nSSN on file. Statement\n\nNo. 900-12-345678'],
  ['A-1b', M, 'SSN on file. Statement\nNo. 900-12-3456150.00'],
  ['A-1c', J, 'Seen 01/01/2020-150.00Paid in full. Dear Zephy ra, your claim'],
  ['A-2', M, 'SSN on file. Statement\r\nNo. 900-12-3456150.00'],
  ['A-2lf', M, 'SSN on file. Statement\nNo. 900-12-3456150.00'],
  ['A-3', J, 'Dear Z e p h y r a900-12-3456, your claim'],
  ['A-3b', J, 'Dear Zephy ra202-555-0123.'],
  ['A-4nel', J, 'Dear Zephy\u0085ra, your claim'],
  ['A-4comma', J, 'Dear Zephy, ra, your claim'],
  ['A-5br', P(['JANE Q ZEPHYRA'], ['1980-03-14'], ['ZZ12345]01'], ['SYNCLAIM0001']), 'The member ZZ12345]01 was paid short.'],
  ['A-5sep', P(['JUNE MARCH'], ['1975-06-01'], ['ZZ12345/01'], ['1234.56']), 'The member ZZ12345.01 was paid short.'],
  ['A-6', J, 'SSN verified. Account \r\r\nNo. 900-12-345678'],
  ['A-6crlf', J, 'SSN verified. Account \r\nNo. 900-12-345678'],
  ['A-6lfcr', J, 'SSN verified. Account \n\rNo. 900-12-345678'],
];
for (const [id, who, letter] of rows) {
  const out: string[] = [];
  for (const [name, R] of Object.entries(trees)) {
    const l = R.redactLetter(letter, who.patient, who.claims).text; const s = R.redactLetterForScreen(letter, who.patient, who.claims).text;
    out.push(`${name} letter: ${R.holdsIdentifier(l, who.patient, who.claims) ? 'REFUSED' : JSON.stringify(l)} | screen: ${R.holdsIdentifier(s, who.patient, who.claims) ? 'REFUSED' : JSON.stringify(s)}`);
  }
  console.log(id, '\n  ' + out.join('\n  '));
}
