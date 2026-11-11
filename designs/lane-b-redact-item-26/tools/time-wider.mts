// Time of the path prepare runs (redactLetterForScreen, then holdsIdentifier) on synthetic letters crafted against the wider reading.
const { redactLetterForScreen, holdsIdentifier } = await import(process.argv[2]!);
const who = (names: string[], memberIds = ['SYN123456']) => ({ pseudonym: 'synthetic-patient-1', names, datesOfBirth: ['1961-03-03'], memberIds });
const claim = (...numbers: string[]) => [{ claimId: 'synthetic-claim-1', patientPseudonym: 'synthetic-patient-1', claimNumbers: numbers }];
const J = ['JANE Q VANTREE'];
const rows: [string, string[], (n: number) => string, string[], string[]?][] = [
  ['dates, then one split name', J, (n) => '1/1/11 '.repeat(n / 7) + 'Vant ree', ['SYN555001']],
  ['dates with spaces, then one split name', J, (n) => '1 1 11 '.repeat(n / 7) + 'Vant. ree', ['SYN555001']],
  ['a name letter by letter, repeated', J, (n) => 'V a n t r e e '.repeat(n / 14), ['SYN555001']],
  ['a split name, repeated', J, (n) => 'Ja ne '.repeat(n / 6), ['SYN555001']],
  ['a split name and an initial, repeated', J, (n) => 'Vant ree J. '.repeat(n / 12), ['SYN555001']],
  ['a split name, then initials to the end', J, (n) => 'Vant ree' + ' J'.repeat(n / 2), ['SYN555001']],
  ['a first letter and a long gap, repeated', J, (n) => ('V' + ' '.repeat(999)).repeat(n / 1000), ['SYN555001']],
  ['all but the last letter, spaced, repeated', J, (n) => 'V a n t r e '.repeat(n / 12), ['SYN555001']],
  ['all but the last letter over full stops, repeated', J, (n) => 'V.a.n.t.r.e.'.repeat(n / 12), ['SYN555001']],
  ['a split name on CR LF lines', J, (n) => 'Vant ree\r\n'.repeat(n / 10), ['SYN555001']],
  ['a split name glued to a word, repeated', J, (n) => 'xVant ree1 '.repeat(n / 11), ['SYN555001']],
  ['a stored number with its separator, repeated', J, (n) => 'ZZ12345/01 '.repeat(n / 11), ['SYN555001'], ['ZZ12345/01']],
  ['a stored number cut short, repeated', J, (n) => 'ZZ12345/0 '.repeat(n / 10), ['SYN555001'], ['ZZ12345/01']],
  ['a digits claim held with a period, in amounts', J, (n) => '$1,234.56 1234.56 '.repeat(n / 18), ['1234.56']],
  ['short-part names in running words', ['INA ASA', 'ISA TOBE'], (n) => 'this is a claim as a rule in a plan to be paid. '.repeat(n / 48), ['SYN555001']],
  ['dates of birth glued and a split name', J, (n) => '3/3/61150.00 Ja ne '.repeat(n / 19), ['SYN555001']],
  ['held ranges and a split name', J, (n) => 'Paid $0,000.00. Service 01/01/2020-01/02/2020Paid Vant ree '.repeat(n / 59), ['SYN555001']],
];
const only = process.argv[3];
for (const [label, names, make, numbers, memberIds] of rows) {
  if (only !== undefined && !label.includes(only)) continue;
  const out: string[] = [];
  for (const n of [25_000, 50_000, 100_000]) {
    const text = make(n);
    const started = performance.now();
    const redacted = redactLetterForScreen(text, who(names, memberIds), claim(...numbers));
    const mid = performance.now();
    const held = holdsIdentifier(redacted.text, who(names, memberIds), claim(...numbers));
    out.push(`${String(n / 1000)}k ${((mid - started) / 1000).toFixed(2)}+${((performance.now() - mid) / 1000).toFixed(2)}s${held ? ' R' : ''} (${String(redacted.replaced)})`);
  }
  console.log(label.padEnd(52), out.join(' | '));
}
