// Review A: the fixed probes behind each finding (synthetic letters only). Run: node probes.mts > out/probes.txt
const HERE = '/home/user/ops/designs/lane-b-redact-item-26/reviews/a';
const base = await import('/home/user/rev/base/redact.ts');
const head = await import('/home/user/rev/head/redact.ts');
const open = await import(`${HERE}/open/redact.ts`);
const O = open.__open;

const mk = (names: string[], datesOfBirth: string[], memberIds: string[], numbers: string[]) => ({
  patient: { pseudonym: 'synthetic-patient-1', names, datesOfBirth, memberIds },
  claims: numbers.map((number, i) => ({ claimId: `synthetic-claim-${i + 1}`, patientPseudonym: 'synthetic-patient-1', claimNumbers: [number] })),
});
type Who = ReturnType<typeof mk>;
const JANE = mk(['JANE Q ZEPHYRA'], ['1980-03-14'], ['SYNMEMBER0042'], ['SYNCLAIM0001']);
const say = (...parts: unknown[]) => console.log(parts.map((part) => (typeof part === 'string' ? part : JSON.stringify(part))).join(' '));
const REFUSED = 'REFUSED';

/** The screen path: what is sent, or REFUSED. */
const screen = (m: typeof head, letter: string, who: Who): string => {
  try {
    const r = m.redactLetterForScreen(letter, who.patient, who.claims);
    return m.holdsIdentifier(r.text, who.patient, who.claims) ? REFUSED : JSON.stringify(r.text);
  } catch (error) {
    return `THROWS ${String(error)}`;
  }
};
/** The path without the screen: redactLetter, then the check. */
const letterPath = (m: typeof head, letter: string, who: Who): string => {
  try {
    const r = m.redactLetter(letter, who.patient, who.claims);
    return m.holdsIdentifier(r.text, who.patient, who.claims) ? `REFUSED (text read: ${JSON.stringify(r.text)})` : JSON.stringify(r.text);
  } catch (error) {
    return `THROWS ${String(error)}`;
  }
};
const both = (title: string, letter: string, who: Who) => {
  say(`\n## ${title}`);
  say('letter :', JSON.stringify(letter));
  say('patient:', who.patient, 'claims:', who.claims.map((claim) => claim.claimNumbers[0]));
  say('screen path  base:', screen(base, letter, who));
  say('screen path  head:', screen(head, letter, who));
  say('letter path  base:', letterPath(base, letter, who));
  say('letter path  head:', letterPath(head, letter, who));
};

// ---------------------------------------------------------------------------------------------------------------------
say('# 1. The path without the screen: a wider placeholder hides what the base\'s check read');
const AMOUNT = mk(['TOBE ZEPHYRA'], ['1988-02-29'], ['SYN 0042 77'], ['150.00']);
const TAIL = mk(['JANE Q ZEPHYRA'], ['1980-03-14'], ['3456150.00'], ['SYNCLAIM0001']);
const UNITS = mk(['JUNE MARCH'], ['1975-06-01'], ['ZZ12345/01'], ['1234.56']);
both('1a un-held: the claim number held "150.00" is the amount of the held range; the glued twin goes out', 'Service 01/01/2020-150.00 Paid\nSSN on file. Statement\n\nNo. 900-12-345678', AMOUNT);
both('1a as the fuzzer found it (two CR LF)', 'Service 01/01/2020-150.00 Paid\r\n\r\nSSN on file. Statement\r\n\r\nNo. 900-12-345678\r\nTel: 555.0123', AMOUNT);
both('1a with the test file\'s own held frame and a phone twin glued to a word', 'Seen 01/01/2020-150.00Paid in full. Call202-555-0123x', AMOUNT);
both('1a held frame, the name\'s pieces in clear beside it (for a patient with no such claim: JANE)', 'Seen 01/01/2020-150.00Paid in full. Dear Zephy ra, your claim', JANE);
both('1b chain cut: the member ID held "3456150.00" is the tail of the chain', 'SSN: see Member\nID Number: 900-12-3456150.00. Date of birth: 03/14/1980', TAIL);
both('1b chain cut, K-1 row 1', 'SSN on file. Statement\nNo. 900-12-3456150.00', TAIL);
both('1c the design\'s own example of a claim held "1234.56", in a held letter', 'Seen 01/01/2020-1234.56Paid in full. No. 900-12-345678', UNITS);

// ---------------------------------------------------------------------------------------------------------------------
say('\n# 2. The screen path: K-1 (a CR LF letter is refused wherever its LF writing is) with a wider match in the letter');
for (const [title, lf, who] of [
  ['2a chain cut', 'SSN\n900123456(SSN verified. Account No. \n900-12-3456150.00', TAIL],
  ['2a chain cut, K-1 row 1', 'SSN on file. Statement\nNo. 900-12-3456150.00', TAIL],
  ['2b un-held, K-1 row 4', 'Service 01/01/2020-150.00 Paid\nSSN on file. Statement\nNo. 900-12-345678', AMOUNT],
  ['2c a name read wider beside the K-1 row (JANE)', 'Dear Zephy ra,\nSSN on file. Statement\nNo. 900-12-3456150.00', JANE],
] as const) {
  say(`\n## ${title}`);
  say('patient:', who.patient, 'claims:', who.claims.map((claim) => claim.claimNumbers[0]));
  for (const [name, ending] of [['LF', '\n'], ['CR LF', '\r\n']] as const) {
    const letter = lf.replaceAll('\n', ending);
    say(`${name} letter:`, JSON.stringify(letter));
    say(`  base: ${screen(base, letter, who)}`);
    say(`  head: ${screen(head, letter, who)}`);
  }
  say('  the same CR LF letter for JANE (no wider match), head:', screen(head, lf.replaceAll('\n', '\r\n'), JANE));
}

// ---------------------------------------------------------------------------------------------------------------------
say('\n# 3. Line endings beside a CR LF (K-1 rows; LF is refused by both)');
const K1 = ['SSN on file. Statement\nNo. 900-12-3456150.00', 'SSN: see Member\nID Number: 900-12-3456150.00', 'SSN verified. Provider\nNo. 90012345601/02/2020', 'Service 01/01/2020-150.00 Paid\nSSN on file. Statement\nNo. 900-12-345678', 'Dear Jane Zephyra,\nSSN on file. Statement\nNo. 900-12-3456150.00\nThank you.', 'SSN verified. Account No. \n900-12-3456150.00', 'SSN verified. Account \nNo. 900-12-345678'];
const ENDINGS = ['\n', '\r\n', '\r', '\n\r', '\r\r\n', '\r\n\r', '\u0085', ' ', ' ', '\f', '\v', '\r\n​', '​\r\n', '\r​\n', '\r­\n', ' \r\n', '\r\n '];
for (const ending of ENDINGS) {
  const rows = K1.map((letter) => letter.replaceAll('\n', ending));
  const baseSent = rows.filter((letter) => screen(base, letter, JANE) !== REFUSED).length;
  const sent = rows.filter((letter) => screen(head, letter, JANE) !== REFUSED);
  say(`ending ${JSON.stringify(ending)}: base sends ${baseSent} of 7, head sends ${sent.length} of 7${sent.length > 0 ? `; first sent by the head: ${JSON.stringify(sent[0])} -> ${screen(head, sent[0] as string, JANE)}` : ''}`);
}

// ---------------------------------------------------------------------------------------------------------------------
say('\n# 4. A name\'s part split by one character: which splits the head still sends in clear (patient JANE Q ZEPHYRA)');
const ASCII = [...'!"#$%&()*+,/:;<=>?@\\^`{|}~1'];
const SPLITS = [' ', '.', '. ', '\t', '\n', '\r', '\r\n', '\v', '\f', '\u0085', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', '　', '﻿', '​', '‌', '‍', '⁠', '᠎', '­', '⠀', 'ㅤ', 'ᅟ', '͏', '؜', '⁣', '․', '‧', '·', '。', '．', '…', '，', '،', '、', '•', '﹒', '։', '۔', '・', '·', '∙', '-', "'", '_', ', ', '; ', ': ', ' - ', ' / ', '. . .', ' .\n', ' ,', '.,', ' — ', ...ASCII];
const shows = (answer: string) => answer !== REFUSED && !answer.startsWith('THROWS') && /ra,/u.test(answer) && /Z/u.test(answer);
const still: string[] = [];
const closed: string[] = [];
for (const split of SPLITS) {
  const name = `U+${[...split].map((c) => (c.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')).join(' U+')}`;
  const results = [`Dear Zephy${split}ra, your claim`, `Dear Z${split}ephyra, your claim`, `Dear ZEPH${split}YRA, your claim`].map((letter) => ({ letter, base: screen(base, letter, JANE), head: screen(head, letter, JANE) }));
  const sent = results.filter((row) => row.head !== REFUSED && !/^"Dear \[PATIENT_NAME\], your claim"$/u.test(row.head));
  if (sent.length > 0) still.push(`${name} ${JSON.stringify(split)}: ${sent.length} of 3 sent with the pieces in clear, e.g. ${JSON.stringify(sent[0]?.letter)} base ${sent[0]?.base} head ${sent[0]?.head}`);
  else closed.push(`${name}${results.some((row) => row.head === REFUSED) ? '(refused)' : ''}`);
  void shows;
}
say(`still sent (${still.length}):`);
for (const row of still) say('  ', row);
say(`redacted or refused by the head (${closed.length}): ${closed.join(', ')}`);

// ---------------------------------------------------------------------------------------------------------------------
say('\n# 5. A member ID held with a separator: written as held, and written with another separator');
const STORED = ['/', '.', ',', '+', '&', '*', ' ', ' / ', ']', '[', '\\', '^', '-', '\u{1F600}', '٣', 'б', '\t', ' ', '　', '\n', '{', '}', '(', ')', '$', '|', '#', ':', '=', '~', '%', '@', '!', '?', '"', "'", '<', '>', '\u0001', '\u0004', '​', '́', '_', ';', '`', ' ', '--', '/.', '­', '\ud800'];
const WRITTEN = ['/', '.', ',', '+', '-', ' ', '*', '&', ':', '#', ''];
for (const stored of STORED) {
  const who = mk(['JANE Q ZEPHYRA'], ['1980-03-14'], [`ZZ12345${stored}01`], ['SYNCLAIM0001']);
  const digits = mk(['JANE Q ZEPHYRA'], ['1980-03-14'], ['SYNMEMBER0042'], [`1234${stored}56`]);
  const as = `The member ZZ12345${stored}01 was paid short.`;
  const plain = `Denied: 1234${stored}56 was a duplicate.`;
  const otherwise = WRITTEN.filter((written) => written !== stored).map((written) => ({ written, base: screen(base, `The member ZZ12345${written}01 was paid short.`, who), head: screen(head, `The member ZZ12345${written}01 was paid short.`, who) }));
  const shown = otherwise.filter((row) => row.head !== REFUSED && row.head.includes('ZZ12345'));
  const worse = otherwise.filter((row) => (row.base === REFUSED && row.head !== REFUSED) || (row.base.includes('[MEMBER_ID]') && row.head.includes('ZZ12345')));
  say(`held with ${JSON.stringify(stored)} (U+${(stored.codePointAt(0) ?? 0).toString(16).toUpperCase()}): as held: base ${screen(base, as, who)} | head ${screen(head, as, who)}`);
  say(`    digits-only claim as held, no label: base ${screen(base, plain, digits)} | head ${screen(head, plain, digits)}`);
  say(`    written with another separator and sent in clear by the head: ${shown.map((row) => JSON.stringify(row.written)).join(' ') || 'none'}${worse.length > 0 ? `  WORSE THAN BASE: ${JSON.stringify(worse)}` : ''}`);
}

// ---------------------------------------------------------------------------------------------------------------------
say('\n# 6. The stores');
// 6a. A reading that throws: the stores and the fold afterwards, and the next call's answer.
const letter = 'Dear Zеphy ra,\r\nSSN on file. Statement\r\nNo. 900-12-3456150.00 Member ID: SYNMEMBER0042 Seen 01/01/2020-150.00Paid in full.';
const reference = JSON.stringify([open.redactLetterForScreen(letter, JANE.patient, JANE.claims), open.holdsIdentifier(letter, JANE.patient, JANE.claims), open.redactionSpans(letter, JANE.patient, JANE.claims)]);
let thrown = 0;
let leftOpen = 0;
let differs = 0;
for (const call of ['redactLetterForScreen', 'holdsIdentifier', 'redactionSpans'] as const) {
  for (let at = 1; at <= 400; at += 1) {
    let reads = 0;
    const trap = (values: string[]) =>
      new Proxy(values, {
        get(target, property, receiver) {
          reads += 1;
          if (reads === at) throw new Error('synthetic failure');
          return Reflect.get(target, property, receiver);
        },
      });
    const patient = { pseudonym: 'synthetic-patient-1', names: trap(['JANE Q ZEPHYRA']), datesOfBirth: trap(['1980-03-14']), memberIds: trap(['SYNMEMBER0042']) };
    try {
      open[call](letter, patient, JANE.claims);
    } catch {
      thrown += 1;
      const stores = O.stores();
      if (stores.views !== null || stores.dates !== null || stores.forms !== null || stores.fold !== 'plain') {
        leftOpen += 1;
        say('  store left open after a throw:', call, at, stores);
      }
      const after = JSON.stringify([open.redactLetterForScreen(letter, JANE.patient, JANE.claims), open.holdsIdentifier(letter, JANE.patient, JANE.claims), open.redactionSpans(letter, JANE.patient, JANE.claims)]);
      if (after !== reference) differs += 1;
    }
  }
}
say(`6a readings made to throw at each of 400 reads of the patient's lists, three exported readings: ${thrown} threw; a store or the fold left open after: ${leftOpen}; next call's answer differs: ${differs}`);

// 6b. Two subjects in one reading whose dates of birth are the same and whose names and numbers are not: the dates' store is keyed by the dates of birth alone.
const pairs: [Who, Who][] = [
  [JANE, mk(['MARCH JUNE'], ['1980-03-14'], ['14'], ['03/14/1980', '1980'])],
  [mk(['JUNE MARCH'], ['1975-06-01'], ['ZZ12345/01'], ['1234.56']), mk(['ZEPHYRA'], ['1975-06-01'], ['06011975'], ['June', '1 1975'])],
];
const texts = ['Dear June March, DOB June 1, 1975Paid 06/01/1975 and March 14, 1980. Member 03/14/1980 14 1980 Claim 1234.56', 'DOB 03/14/1980 Jane Zephyra March June 14, 1980 Claim 03/14/1980\r\nSSN 900-12-3456 June 1 1975', 'born 06011975 June\n1 1975 ZZ12345/01 March 14 1980 Zеphyra'];
let keyed = 0;
let compared = 0;
for (const [a, b] of pairs) {
  for (const text of texts) {
    const normal = O.unbracketed(text);
    const fresh = (who: Who) => JSON.stringify([O.screenAsBothRead(text, who.patient, who.claims), O.holdsAsFirstRead(text, who.patient, who.claims), O.widerMatchesIn(O.unmarked(normal), O.letterSubject(who.patient, who.claims))]);
    const [freshA, freshB] = [fresh(a), fresh(b)];
    const shared = O.inOneReading(() => [fresh(a), fresh(b), fresh(a)]);
    const sharedOther = O.inOneReading(() => [fresh(b), fresh(a)]);
    compared += 5;
    for (const [got, want] of [[shared[0], freshA], [shared[1], freshB], [shared[2], freshA], [sharedOther[0], freshB], [sharedOther[1], freshA]]) {
      if (got !== want) {
        keyed += 1;
        say('  6b differs:', JSON.stringify(text), 'got', got, 'want', want);
      }
    }
  }
}
say(`6b two subjects with the same dates of birth in one reading, against each alone: ${compared} compared, ${keyed} differ`);

// 6c. The form list a reader is given: frozen, its forms and their patterns not; whether any reader leaves a mark on them.
O.inOneReading(() => {
  const subject = O.letterSubject(JANE.patient, JANE.claims);
  const snapshot = () => JSON.stringify([false, true].flatMap((wider) => O.formsOf(subject, wider).map((form: { compact: string; pattern: RegExp; labeled: RegExp | null; insidePart: boolean[] }) => [form.compact, form.pattern.source, form.pattern.lastIndex, form.labeled?.lastIndex ?? null, form.insidePart])));
  const before = snapshot();
  const normal = O.unbracketed(letter);
  const first = O.screenAsFirstRead(normal, subject, JANE.claims);
  O.widerMatchesIn(O.unmarked(normal), subject);
  O.chainLeft(first.text, subject, JANE.claims.length);
  O.matchesIn(O.masked(first.text, JANE.claims.length), subject);
  const forms = O.formsOf(subject);
  say(`6c forms after every reader as before: ${snapshot() === before}; list frozen: ${Object.isFrozen(forms)}; a form frozen: ${Object.isFrozen(forms[0])}; same list on a second ask: ${O.formsOf(subject) === forms}; stores inside: ${JSON.stringify(O.stores())}`);
  let wrote = 'no';
  try {
    (forms as unknown[]).push(forms[0]);
    wrote = 'yes';
  } catch (error) {
    wrote = `throws ${String(error).slice(0, 60)}`;
  }
  say(`6c a reader that adds to the list: ${wrote}`);
});
say('6c stores after:', O.stores());

// 6d. The same call twice, and the exported readings inside one reading against outside.
let twice = 0;
for (const text of [...texts, letter, ...K1.map((row) => row.replaceAll('\n', '\r\n'))]) {
  for (const who of [JANE, AMOUNT, TAIL, UNITS]) {
    const read = () => JSON.stringify([head.redactLetterForScreen(text, who.patient, who.claims), head.holdsIdentifier(text, who.patient, who.claims), head.redactionSpans(text, who.patient, who.claims)]);
    const openRead = () => JSON.stringify([open.redactLetterForScreen(text, who.patient, who.claims), open.holdsIdentifier(text, who.patient, who.claims), open.redactionSpans(text, who.patient, who.claims)]);
    const a = read();
    if (a !== read() || a !== openRead() || a !== O.inOneReading(() => (openRead(), openRead()))) twice += 1;
  }
}
say(`6d same call twice, the opened copy, and inside one reading after another: ${twice} differ`);

// ---------------------------------------------------------------------------------------------------------------------
say('\n# 7. Time: the fuzzer\'s slowest letter by ratio, 30 runs each, median milliseconds');
const slow = 'Phone 1234.56150.00(Phone\r\n202-555-0123(12-\r\n3-\r\n4-\r\n.-\r\n5-\r\n6/SS#900-12-3456/RE: born 06/01/1975-Patient\n';
for (const [name, m] of [['base', base], ['head', head], ['base', base], ['head', head]] as const) {
  const times: number[] = [];
  for (let i = 0; i < 30; i += 1) {
    const t = performance.now();
    const r = m.redactLetterForScreen(slow, UNITS.patient, UNITS.claims);
    m.holdsIdentifier(r.text, UNITS.patient, UNITS.claims);
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  say(`  ${name}: median ${(times[15] ?? 0).toFixed(2)} ms, slowest ${(times[29] ?? 0).toFixed(2)} ms`);
}
say('  letter:', JSON.stringify(slow), 'answers: base', screen(base, slow, UNITS), 'head', screen(head, slow, UNITS));
