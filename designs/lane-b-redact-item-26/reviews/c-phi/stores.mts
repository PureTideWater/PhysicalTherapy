// Review C-PHI, bar 4: the head's module state (the stores of inOneReading, the fold, patterns' lastIndex) across calls.
// A: every letter and patient read once in an instance of its own (as a fresh process reads it) against the same
//    letters read in one instance in four orders, patients interleaved.
// B: a reading that throws midway (a patient or claims object whose Nth property read throws, for every N the reading
//    makes), then letters read in that same instance against A's fresh answers.
// C: identifiers of the wrong type or shape (some throw), then the same comparison.
// D: the mark: the check on texts that end in U+0001.
// Synthetic only. Run: tsx stores.mts
const TREE = process.argv[2] ?? '/home/user/rev/head/redact.ts';
type Mod = typeof import('/home/user/rev/head/redact.ts');
let instanceNo = 0;
const instance = async () => (await import(`${TREE}?stores=${String((instanceNo += 1))}`)) as Mod;

const mk = (names: string[], datesOfBirth: string[], memberIds: string[], numbers: string[]) => ({
  patient: { pseudonym: 'p', names, datesOfBirth, memberIds },
  claims: numbers.map((number, i) => ({ claimId: `c${String(i + 1)}`, patientPseudonym: 'p', claimNumbers: [number] })),
});
const PATIENTS = [
  mk(['JANE Q ZEPHYRA'], ['1980-03-14'], ['SYNMEMBER0042'], ['SYNCLAIM0001']),
  mk(['JUNE MARCH'], ['1975-06-01'], ['ZZ12345/01'], ['1234.56']),
  mk(['INA VANTREE'], ['1990-12-31'], ['ZZ12345.01', '12.3456'], ['3456/15', 'ZZ98765+43']),
  mk(['JANE Q ZEPHYRA'], ['1980-03-14'], ['3456150.00', '12-3456', '345.678'], ['56150', '0123', '1/02/2020', '12/3456']),
  mk(['ZЕPHYRA VANTREE'], ['1955-07-14'], ['ZZ12345]01', 'ZZ77^88'], ['SYN[0001]', '150.00']),
];
const LETTERS = [
  'Patient Zephy ra was seen.',
  'Patient Z e p h y r a was seen.',
  'Patient Zeph. yra was seen.',
  'Patient JANE Q ZEPHYRA, Member ID: SYNMEMBER0042, Claim SYNCLAIM0001.',
  'RE: J. Zephyra DOB 03/14/1980',
  'Seen 01/01/2020-150.00Paid in full. Zephy ra',
  'Seen 01/01/2020-150.00Paid in full. SSN 900-12-3456',
  'SSN on file. Statement\r\nNo. 900-12-3456150.00',
  'SSN on file. Statement\r\r\nNo. 900-12-3456150.00 Zephy ra',
  'Tel 555-0123 or 202-555-0199',
  'Patient Zеphyra, Member SYNMEMBER0O42',
  'Patient Zеphy ra was seen.',
  'Zephy\u0085ra and Van\u0085tree',
  'Zephy ra',
  'Zephy\r\nra\r\nVan tree',
  'Zephy\rra',
  'Member ID: SYN MEMBER 0042',
  'Claim No. SYN-CLAIM-0001 paid 150.00',
  'paid in full. '.repeat(40),
  'Member ID: [MEMBER_ID] Claim [CLAIM_1] Patient [PATIENT_NAME]',
  'Total\u0002for45.00',
  'Zephy ra\u0001',
  '\u0004Zephy ra',
  'Service 01/01/2020-150.00 Paid Zephy ra',
  'No. 900-12-3456150.00\r\nZephy ra',
  'VANTREE, INA 12/31/1990 ZZ12345.01',
  'Van tree, I. ZZ12345/01 3456/15',
  'June March was seen in March and June. ZZ12345/01 1234.56',
  'Ju ne Mar ch 06/01/1975 Claim 1234.56 paid 1,234.56',
  'ID ZZ12345(01 and ZZ12345]01 and SYN(0001) and SYN[0001]',
  'Member 12-3456 SSN 900-12-3456 Tel 555-0123 Claim 0123',
  'Statement\r\nNo. 12/3456\r\nMember\r\n345.678\r\nJane\r\nZephy\r\nra',
];

const outcome = (m: Mod, letter: string, who: (typeof PATIENTS)[number]): string => {
  try {
    const s = m.redactLetterForScreen(letter, who.patient, who.claims);
    const spans = m.redactionSpans(letter, who.patient, who.claims);
    const l = m.redactLetter(letter, who.patient, who.claims);
    return JSON.stringify([s.text, s.candidates, m.holdsIdentifier(s.text, who.patient, who.claims), spans, l.text, m.holdsIdentifier(l.text, who.patient, who.claims), m.holdsIdentifier(letter, who.patient, who.claims)]);
  } catch (error) {
    return `THROWS ${String(error).slice(0, 120)}`;
  }
};

// A
const pairs: [number, number][] = [];
for (let l = 0; l < LETTERS.length; l += 1) for (let p = 0; p < PATIENTS.length; p += 1) pairs.push([l, p]);
const fresh = new Map<string, string>();
for (const [l, p] of pairs) fresh.set(`${String(l)}/${String(p)}`, outcome(await instance(), LETTERS[l] as string, PATIENTS[p] as (typeof PATIENTS)[number]));
const freshInstances = instanceNo;
let state = 7;
const rng = () => ((state = (Math.imul(state, 1103515245) + 12345) >>> 0) / 4294967296);
const shuffled = () => [...pairs].map((pair) => [rng(), pair] as const).sort((a, b) => a[0] - b[0]).map(([, pair]) => pair);
const shared = await instance();
let compared = 0;
const differing: unknown[] = [];
const check = (m: Mod, l: number, p: number, when: string) => {
  compared += 1;
  const now = outcome(m, LETTERS[l] as string, PATIENTS[p] as (typeof PATIENTS)[number]);
  if (now !== fresh.get(`${String(l)}/${String(p)}`)) differing.push({ when, letter: LETTERS[l], patient: p, fresh: fresh.get(`${String(l)}/${String(p)}`), now });
};
for (const [order, list] of [['forward', pairs], ['reverse', [...pairs].reverse()], ['shuffled 1', shuffled()], ['shuffled 2', shuffled()]] as const) for (const [l, p] of list) check(shared, l, p, `A ${order}`);
console.log(JSON.stringify({ part: 'A', freshInstances, sentFresh: [...fresh.values()].filter((value) => /^\[[^\n]*?,false,\{/u.test(value) || value.includes('],false,{')).length, throwsFresh: [...fresh.values()].filter((value) => value.startsWith('THROWS')).length, compared, differing: differing.length }));

// B
let countdown = Infinity;
const wrap = <T extends object>(target: T): T =>
  new Proxy(target, {
    get(of, key, receiver) {
      countdown -= 1;
      if (countdown === 0) throw new Error('synthetic throw midway');
      const value: unknown = Reflect.get(of, key, receiver);
      return typeof value === 'object' && value !== null ? wrap(value) : value;
    },
  });
const broken = await instance();
let thrown = 0;
let reads = 0;
let canary = 0;
const before = compared;
for (const [l, p] of [[11, 4], [8, 3], [5, 0], [31, 3]] as const) {
  const who = PATIENTS[p] as (typeof PATIENTS)[number];
  const letter = LETTERS[l] as string;
  const calls: ((patient: typeof who.patient, claims: typeof who.claims) => unknown)[] = [
    (patient, claims) => broken.redactLetterForScreen(letter, patient, claims),
    (patient, claims) => broken.redactionSpans(letter, patient, claims),
    (patient, claims) => broken.holdsIdentifier(letter, patient, claims),
  ];
  for (const call of calls) {
    for (let n = 1; n <= 20_000; n += 1) {
      countdown = n;
      let threw = false;
      try {
        call(wrap(who.patient), wrap(who.claims));
      } catch (error) {
        threw = String(error).includes('synthetic throw midway');
        if (!threw) differing.push({ when: 'B other error', n, error: String(error).slice(0, 200) });
      }
      const used = n - countdown;
      countdown = Infinity;
      if (!threw) {
        reads = Math.max(reads, used);
        break;
      }
      thrown += 1;
      // After each throw: three letters in the same instance, against a fresh instance's answers.
      for (let i = 0; i < 3; i += 1) {
        const [cl, cp] = pairs[(canary += 7) % pairs.length] as [number, number];
        check(broken, cl, cp, `B after a throw at read ${String(n)} of letter ${String(l)}`);
      }
    }
  }
}
for (const [l, p] of pairs) check(broken, l, p, 'B at the end');
console.log(JSON.stringify({ part: 'B', thrown, mostPropertyReadsInOneCall: reads, compared: compared - before, differing: differing.length }));

// C
const odd = await instance();
const beforeC = compared;
const BAD: [string, unknown, unknown][] = [
  ['member ID a number', { pseudonym: 'p', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['SYNMEMBER0042', 42] }, PATIENTS[0]?.claims],
  ['name null', { pseudonym: 'p', names: ['JANE Q ZEPHYRA', null], datesOfBirth: ['1980-03-14'], memberIds: ['SYNMEMBER0042'] }, PATIENTS[0]?.claims],
  ['date of birth a number', { pseudonym: 'p', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14', 19800314], memberIds: ['SYNMEMBER0042'] }, PATIENTS[0]?.claims],
  ['date of birth no date', { pseudonym: 'p', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['not a date'], memberIds: ['SYNMEMBER0042'] }, PATIENTS[0]?.claims],
  ['claim number undefined', PATIENTS[0]?.patient, [{ claimId: 'c1', patientPseudonym: 'p', claimNumbers: ['SYNCLAIM0001', undefined] }]],
  ['claims undefined', PATIENTS[0]?.patient, undefined],
  ['names missing', { pseudonym: 'p', datesOfBirth: ['1980-03-14'], memberIds: ['SYNMEMBER0042'] }, PATIENTS[0]?.claims],
  ['name a lone surrogate', { pseudonym: 'p', names: ['ZEPHYRA\ud83d'], datesOfBirth: ['1980-03-14'], memberIds: ['SYN\udc00MEMBER0042'] }, PATIENTS[0]?.claims],
  ['identifiers of pattern characters', { pseudonym: 'p', names: ['(ZEPH)+YRA\\', 'VAN[TREE'], datesOfBirth: ['1980-03-14'], memberIds: ['SYN(00]42\\', '[', '\\u{110000}'] }, [{ claimId: 'c1', patientPseudonym: 'p', claimNumbers: ['SYN|CLAIM*0001?', '{2,1}'] }]],
];
const cResults: string[] = [];
for (const [name, patient, claims] of BAD) {
  for (const letter of [LETTERS[11] as string, LETTERS[8] as string, 'Member SYN(00)42\\ and SYN|CLAIM*0001? for Zeph yra, Van tree']) {
    cResults.push(`${name}: ${outcome(odd, letter, { patient, claims } as never).slice(0, 60)}`);
    for (let i = 0; i < 3; i += 1) {
      const [cl, cp] = pairs[(canary += 7) % pairs.length] as [number, number];
      check(odd, cl, cp, `C after ${name}`);
    }
  }
}
for (const [l, p] of pairs) check(odd, l, p, 'C at the end');
console.log(JSON.stringify({ part: 'C', calls: cResults.length, threw: cResults.filter((row) => row.includes('THROWS')).length, compared: compared - beforeC, differing: differing.length }));

// D
const who = PATIENTS[0] as (typeof PATIENTS)[number];
const TEXTS = ['', 'paid in full.', '[PATIENT_NAME]', 'a\r\n', 'a\r', '\ud83d', '\udc00', 'oﬃce', 'x\u0000', '\u0004', '[SSN]', 'á', '﻿', '​', '\u0002', '\u0003\r\n'];
const sentWithMark = TEXTS.filter((text) => !shared.holdsIdentifier(`${text}\u0001`, who.patient, who.claims) || !shared.holdsIdentifier(`${text}\u0001`.normalize('NFKC'), who.patient, who.claims) || !shared.holdsIdentifier(`${text}\u0001`.normalize('NFKD'), who.patient, who.claims));
console.log(JSON.stringify({ part: 'D', texts: TEXTS.length, sentWithMark }));
console.log(JSON.stringify({ compared, differing: differing.slice(0, 5) }).slice(0, 3000));
