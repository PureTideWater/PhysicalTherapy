// Timing cases: the crafted 100 kB letters of functions/denial-letter.test.ts (3fcb9359; a superset of cc3dd7f6's rows)
// and the round-3 timing shapes (rg-review-gateway-3/timez, timer, timey, timex). Each is timed through the real path
// (redactLetterForScreen, then holdsIdentifier), twice per tree; the slower run counts against the 3 s budget.
const N = 100_000;
const fill = (unit: string, n = N) => unit.repeat(Math.ceil(n / unit.length)).slice(0, n);
const fillFloor = (unit: string) => unit.repeat(Math.floor(N / unit.length));
type Who = { pseudonym: string; names: string[]; datesOfBirth: string[]; memberIds: string[] };
const p7 = (names: string[]): Who => ({ pseudonym: 'synthetic-patient-7', names, datesOfBirth: ['1961-03-03'], memberIds: ['ZZ1234567'] });
const c7 = (...claimNumbers: string[]) => [{ claimId: 'synthetic-claim-1', patientPseudonym: 'synthetic-patient-7', claimNumbers }];
const P1: Who = { pseudonym: 'p', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['SYNMEMBER0042', 'ZZ7654321'] };
const C1 = [{ claimId: 'c', patientPseudonym: 'p', claimNumbers: ['SYNCLAIM0001'] }];
const ZN = ['ZZ ZZZ ZZZZ ZZZZZ', 'ZZ-ZZ ZZZ', 'ZZZZZZ ZZ'];
const pz = (names: string[], member = 'Z1Z1Z1'): Who => ({ pseudonym: 'p', names, datesOfBirth: [], memberIds: [member] });
const pr = (names: string[]): Who => ({ pseudonym: 'p', names, datesOfBirth: ['1980-03-14'], memberIds: ['SYN555001'] });

export interface TimingCase { name: string; text: string; patient: Who; claims: { claimId: string; patientPseudonym: string; claimNumbers: string[] }[] }

export function timingCases(): TimingCase[] {
  const dl: [string, string[], string, string[]][] = [
    ['dl: initials run after a name', ['IVY ANNA VANTREE'], `Vantree ${'A '.repeat(20_000)}`, ['SYN555001']],
    ['dl: initials run before a name', ['IVY ANNA VANTREE'], `${'A '.repeat(20_000)}Vantree`, ['SYN555001']],
    ['dl: long gap after a name and many initials', ['JANE Q VANTREE'], `Vantree${' '.repeat(2_000)}x${' J'.repeat(49_000)}`, ['SYN555001']],
    ['dl: gap after a name as long as the letter', ['JANE Q VANTREE'], `Vantree${' '.repeat(N - 20)}x J`, ['SYN555001']],
    ['dl: dates with slashes', ['JANE Q VANTREE'], fillFloor('1/1/11 '), ['SYN555001']],
    ['dl: dates with spaces', ['JANE Q VANTREE'], fillFloor('1 1 11 '), ['SYN555001']],
    ['dl: dates with a claim between', ['JANE VANTREE'], fillFloor('1-1-11 555001 '), ['555001']],
    ['dl: phones back to back', ['JANE Q VANTREE'], fillFloor('(202) 555-0123 '), ['SYN555001']],
    ['dl: SSNs back to back', ['JANE Q VANTREE'], fillFloor('900-12-3456 '), ['SYN555001']],
    ['dl: spaced phone chains', ['JANE Q VANTREE'], fillFloor('202 555 0123 '), ['SYN555001']],
    ['dl: 100 k digit run', ['JANE Q VANTREE'], '9'.repeat(N), ['SYN555001']],
    ['dl: digit and dash', ['JANE Q VANTREE'], fillFloor('5-'), ['SYN555001']],
    ['dl: digit and ZWSP', ['JANE Q VANTREE'], fillFloor('5​'), ['SYN555001']],
    ['dl: nine-digit runs', ['JANE Q VANTREE'], fillFloor('900123456 '), ['SYN555001']],
    ['dl: phone label before nine digits', ['JANE Q VANTREE'], fillFloor('Phone 900123456 '), ['SYN555001']],
    ['dl: digit and indented break', ['JANE Q VANTREE'], fillFloor('5\n    '), ['SYN555001']],
    ['dl: digit two dashes break', ['JANE Q VANTREE'], fillFloor('5--\n  '), ['SYN555001']],
    ['dl: digit and bare break', ['JANE Q VANTREE'], fillFloor('5\n'), ['SYN555001']],
    ['dl: digit and CRLF', ['JANE Q VANTREE'], fillFloor('1\r\n'), ['SYN555001']],
    ['dl: digit dash break', ['JANE Q VANTREE'], fillFloor('5-\n'), ['SYN555001']],
    ['dl: amount before a date', ['JANE Q VANTREE'], fillFloor('$150.00 2026-11-01 '), ['SYN555001']],
    ['dl: date ranges', ['JANE Q VANTREE'], fillFloor('10/01/2026-10/15/2026 '), ['SYN555001']],
    ['dl: amount ranges', ['JANE Q VANTREE'], fillFloor('150.00-120.00 '), ['SYN555001']],
    ['dl: keep-noun list', ['JANE Q VANTREE'], `Claims 900123456${fillFloor(' and 900123457')}`, ['SYN555001']],
    ['dl: date ranges glued to next word', ['JANE Q VANTREE'], fillFloor('Service 01/01/2020-01/02/2020Paid '), ['SYN555001']],
    ['dl: one word glued to a digit', ['JANE Q VANTREE'], `${'a'.repeat(N - 2)}1a`, ['SYN555001']],
    ['dl: ranges glued to ordinal-like word', ['JANE Q VANTREE'], fillFloor('Service 01/01/2020-01/02/2020St. '), ['SYN555001']],
    ['dl: amounts after a range', ['JANE Q VANTREE'], fillFloor('Billed 01/01/2020-150.00-120.00 1.00 '), ['SYN555001']],
  ];
  const out: TimingCase[] = dl.map(([name, names, text, claims]) => ({ name, text, patient: p7(names), claims: c7(...claims) }));
  const add = (name: string, text: string, patient: Who) => out.push({ name, text, patient, claims: C1 });
  // GATEWAY3-3 (timez): runs of letters a digit touches, for names of short repeated-letter parts.
  add('r3 timez: ZZ/ZZZ run', `1${'Z'.repeat(N)}1`, pz(['ZZ ZZZ']));
  add('r3 timez: many parts run', `1${'Z'.repeat(N)}1`, pz(ZN));
  add('r3 timez: many parts run zZ', `1${fill('zZ')}1`, pz(ZN));
  add('r3 timez: many parts run ZzZ', `1${fill('ZzZ')}1`, pz(ZN));
  add('r3 timez: initials Z run', `1${'Z'.repeat(N)}1`, pz(['ZEPH ZZ Z Z Z']));
  // timer: realistic names on crafted runs.
  add('r3 timer: DE LA run caps', `1${fill('DELA')}1`, pr(['MARIA DE LA CRUZ']));
  add('r3 timer: DE LA run camel', `1${fill('DeLa')}1`, pr(['MARIA DE LA CRUZ']));
  add('r3 timer: DE LA run 2 names', `1${fill('DeLa')}1`, pr(['MARIA DE LA CRUZ', 'MARIA CRUZ']));
  add('r3 timer: DE LA run 3 names caps', `1${fill('DELA')}1`, pr(['MARIA DE LA CRUZ GARCIA', 'MARIA DE LA CRUZ', 'M DE LA CRUZ']));
  add('r3 timer: DE LA glued words', fill('1DeLaCruz'), pr(['MARIA DE LA CRUZ GARCIA', 'MARIA DE LA CRUZ', 'M DE LA CRUZ']));
  add('r3 timer: XU MA run', `1${fill('XUMA')}1`, pr(['MIN XU', 'QIANG MA']));
  add('r3 timer: LI run', `1${fill('LI')}1`, pr(['LI LI', 'LI NA']));
  add('r3 timer: LI camel words', fill('LiLi '), pr(['LI LI', 'LI NA']));
  // timey: camel runs, month words at run ends, glued DOB readings, own numbers.
  const P2: Who = { pseudonym: 'p', names: ['AB AB', 'A B'], datesOfBirth: ['1980-03-14'], memberIds: ['A1B2'] };
  const P3: Who = { pseudonym: 'p', names: ['ZZ ZZZ'], datesOfBirth: ['1980-03-14'], memberIds: ['Z1Z1Z1'] };
  const ty: [string, string, Who][] = [
    ['camel aB', fill('aB'), P2], ['camel AbAb glued', `1${fill('Ab')}1`, P2], ['long glued ZZZ run', `1${'Z'.repeat(N)}1`, P3], ['long glued zZ run', `1${fill('zZ')}1`, P3],
    ['JANE repeated glued', `1${fill('JANE')}1`, P1], ['JaneZephyraQ repeated glued', `1${fill('JaneZephyraQ')}1`, P1], ['Jane1 repeated', fill('Jane1'), P1], ['Q1 initials', fill('Q1 Jane '), P1],
    ['Q1Q initials', fill('1Q '), P1], ['month words at run ends', fill('xMar 14, 1980'), P1], ['month words + overlap dates', fill('aMar 12.03/14/'), P1], ['DOB glued readings', fill('DOB03/14/1980Paid'), P1],
    ['month glued dense', fill('1March 1'), P1], ['own number glued', fill('ZZ7654321'), P1], ['own number near-miss', fill('ZZ765432'), P1], ['spaced member chars', fill('Z Z 7 6 5 4 3 2 '), P1],
    ['Z1 near-miss', fill('Z1Z1Z'), P3], ['placeholder glued digits', fill('SSN Jane900 '), P1], ['placeholders chain', `SSN ${fill('Jane1')}`, P1], ['zephyra pieces spaced', `2020${fill('Zeph yra')}`, P1],
    ['camel own name before label numbers', fill('Call MsZephyra 555-0123 '), P1], ['SSN label glued own name', fill('SSN DearJane900.12 3456 '), P1],
  ];
  for (const [name, text, who] of ty) add(`r3 timey: ${name}`, text, who);
  const PX: Who = { pseudonym: 'p', names: ['JANE Q VANTREE'], datesOfBirth: ['1980-03-14'], memberIds: ['SYN555001'] };
  for (const [name, text] of [['long word one glue', `1a ${'b'.repeat(N - 4)} `], ['medium words before digits', `${fill('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb ')}1a`], ['words glued both sides', fill('1abcdefghij')], ['overlap dates 1.1.1', fill('1.1.')]] as const) add(`r3 timex: ${name}`, text, PX);
  return out;
}
