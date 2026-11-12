// node --import <gate>/ts-resolve.mjs work.mts <proto redact.ts> [floor=6]
// Queues item 34: what the prototype's rule for a digits-only number glued to a letter adds to the check's work count
// (CHECK_WORK_BUDGET = 420,000,000), on the crafted letters of item 26's scripts/dear.mts (the base's dearest rows among
// them), for the rows' own patient (no digits-only number: the rule reads nothing) and for the same patient holding a
// digits-only member ID and claim number. Units are the counter's own, read after holdsIdentifier; no clock.
const H = await import(process.argv[2]!);
const FLOOR = Number(process.argv[3] ?? 6);
const F = (u: string, n: number) => u.repeat(Math.floor(n / u.length));
const claims = (...numbers: string[]) => [{ claimId: '00000000-0000-4000-8000-000000000001', patientPseudonym: 'synthetic-patient-7', claimNumbers: numbers }];
const who = (...memberIds: string[]) => ({ pseudonym: 'synthetic-patient-7', names: ['JANE Q VANTREE'], datesOfBirth: ['1961-03-03'], memberIds });
const N = 100000; const FILL = 'paid in full. ';
const ROWS: [string, string][] = [
  ['gap + initials 100k (the base row at 403M)', `Vantree${' '.repeat(2000)}x${' J'.repeat(49000)}`],
  ['the same with CR LF line endings in the gap', `Vantree${'\r\n'.repeat(1000)}x${' J'.repeat(49000)}`],
  ['5LF 50k (base row)', F('5\n', 50000)], ['5LF + apart 30k', F('5\n', 29991) + ' Vant ree'], ['5LF + CRLF 30k', F('5\n', 29998) + '\r\n'],
  ['dates spaces 100k (base row)', F('1 1 11 ', N)], ['dates + CRLF 60k', F('1 1 11 ', 60000) + '\r\n'], ['dates + CRLF + apart 25k', F('1 1 11 ', 24990) + '\r\nVant ree'],
  ['slash dates + apart 50k', F('1/1/11 ', 49992) + 'Vant ree'], ['apart + initials 50k', 'Vant ree' + ' J'.repeat(24996)],
  ['U+33FE; 93k (base dearest)', F('㏾;', 93006)], ['prose + apart 150k', F(FILL, 149986) + ' Dear Vant ree,'], ['prose lines CRLF 150k', F(FILL + '\r\n', 150000)],
  ['prose 100k with the number glued once at its end', F(FILL, 99980) + ' Fax X76543210'],
];
const run = (text: string, P: any, C: any, floor: number) => { H.__setFloor(floor); const r = H.redactLetterForScreen(text, P, C); const refused = H.holdsIdentifier(r.text, P, C, H.checkWorkOf(r)); return `${(H.__last.spent / 1e6).toFixed(1)}M ${refused ? (r.text === '\u0001' ? 'refused in the redaction' : 'refused') : 'sent'}`; };
console.log(`row | length | own patient: base | own patient: floor ${FLOOR} | with digits-only numbers: base | with digits-only numbers: floor ${FLOOR}`);
for (const [name, text] of ROWS) {
  const own = [who('ZZ1234567'), claims('SYN555001')] as const; const digits = [who('ZZ1234567', '76543210'), claims('SYN555001', '1234567890')] as const;
  console.log([name, text.length, run(text, ...own, 0), run(text, ...own, FLOOR), run(text, ...digits, 0), run(text, ...digits, FLOOR)].join(' | '));
}
