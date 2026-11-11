const R = await import(process.argv[2]!);
const P = (names: string[], dob: string[], memberIds: string[], claimNumbers: string[]) => ({ patient: { pseudonym: 'synthetic-patient-21', names, datesOfBirth: dob, memberIds }, claims: claimNumbers.map((n, i) => ({ claimId: `synthetic-claim-21-${String(i + 1)}`, patientPseudonym: 'synthetic-patient-21', claimNumbers: [n] })) });
const J = P(['JANE Q ZEPHYRA'], ['1980-03-14'], ['SYNMEMBER0042'], ['SYNCLAIM0001']);
const X = P(['JANE Q ZEPHYRA'], ['1980-03-14'], ['3456150.00', '12-3456', '345.678'], ['56150', '0123', '1/02/2020', '12/3456']);
const rows: [string, ReturnType<typeof P>, string][] = [
  ['A-2 second, CR LF', X, 'ZЕPHYRA, Z\r\n\r\n(202) 555-0123\r\nSeen 01/01/2020-150.00Paid in full. \r\nICN\r\n'],
  ['A-2 second, LF', X, 'ZЕPHYRA, Z\n\n(202) 555-0123\nSeen 01/01/2020-150.00Paid in full. \nICN\n'],
  ['A-1a text', P(['TOBE ZEPHYRA'], ['1988-02-29'], ['SYN 0042 77'], ['150.00']), 'Service 01/01/2020-150.00 Paid\nSSN on file. Statement\n\nNo. 900-12-345678'],
  ['A-1b text', P(['JANE Q ZEPHYRA'], ['1980-03-14'], ['3456150.00'], ['SYNCLAIM0001']), 'SSN on file. Statement\nNo. 900-12-3456150.00'],
  ['A-1b2 text', P(['JANE Q ZEPHYRA'], ['1980-03-14'], ['3456150.00'], ['SYNCLAIM0001']), 'SSN: see Member\nID Number: 900-12-3456150.00. Date of birth: 03/14/1980'],
  ['A-1c text', J, 'Seen 01/01/2020-150.00Paid in full. Dear Zephy ra, your claim'],
  ...['Dear Zephy, ra, your claim', 'Dear Zephy: ra, your claim', 'Dear Zephy(ra), your claim', 'Dear Zephy。ra, your claim', 'Dear Zephy・ra, your claim', 'Dear Zephy ra, your claim', 'Dear Zephy\fra, your claim', 'Dear Zephy\u0085 ra, your claim'].map((l): [string, ReturnType<typeof P>, string] => ['A-4', J, l]),
  ['A-5 [', P(['JANE Q ZEPHYRA'], ['1980-03-14'], ['ZZ12345[01'], ['SYNCLAIM0001']), 'The member ZZ12345[01 was paid short.'],
  ['A-5 [ as (', P(['JANE Q ZEPHYRA'], ['1980-03-14'], ['ZZ12345[01'], ['SYNCLAIM0001']), 'The member ZZ12345(01 was paid short.'],
  ['A-5 [x]', P(['JANE Q ZEPHYRA'], ['1980-03-14'], ['ZZ[12345]01'], ['SYNCLAIM0001']), 'Member ID: ZZ[12345]01 was paid short.'],
  ['A-6 crcrlf', J, 'SSN verified. Account \r\r\nNo. 900-12-345678'],
  ['A-6 cr', J, 'SSN verified. Account \rNo. 900-12-345678'],
  ['A-6 lfcr', J, 'SSN verified. Account \n\rNo. 900-12-345678'],
  ['K-1 kept row', J, 'SSN on file.  Statement\r\nNo. 900-12-3456150.00'],
];
for (const [id, who, letter] of rows) {
  const l = R.redactLetter(letter, who.patient, who.claims).text; const s = R.redactLetterForScreen(letter, who.patient, who.claims).text;
  console.log(id.padEnd(18), `letter: ${R.holdsIdentifier(l, who.patient, who.claims) ? 'REFUSED' : 'sent'} ${JSON.stringify(l)}\n${' '.repeat(19)}screen: ${R.holdsIdentifier(s, who.patient, who.claims) ? 'REFUSED' : 'sent'} ${JSON.stringify(s)}`);
}
