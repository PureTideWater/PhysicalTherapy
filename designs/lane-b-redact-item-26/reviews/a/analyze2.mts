// Review A: second pass over the kept rows (who, which kind of wider match), and the clean rows the report quotes. Run: node analyze2.mts
import { readFileSync, readdirSync } from 'node:fs';
const OUT = '/home/user/ops/designs/lane-b-redact-item-26/reviews/a/out';
const base = await import('/home/user/rev/base/redact.ts');
const head = await import('/home/user/rev/head/redact.ts');
const mk = (names: string[], datesOfBirth: string[], memberIds: string[], numbers: string[]) => ({ patient: { pseudonym: 'synthetic-patient-1', names, datesOfBirth, memberIds }, claims: numbers.map((number, i) => ({ claimId: `synthetic-claim-${i + 1}`, patientPseudonym: 'synthetic-patient-1', claimNumbers: [number] })) });
// The fuzzer's patients, in its order (fuzz.mts PATIENTS).
const PATIENTS = [
  mk(['JANE Q ZEPHYRA'], ['1980-03-14'], ['SYNMEMBER0042'], ['SYNCLAIM0001']), mk(['JUNE MARCH'], ['1975-06-01'], ['ZZ12345/01'], ['1234.56']), mk(['INA VANTREE'], ['1990-12-31'], ['ZZ12345.01', '12.3456'], ['3456/15', 'ZZ98765+43']),
  mk(['BOB XU', 'AL VANTREE-ZEPHYRA'], ['2001-01-02'], ['76543210'], ['0283', 'ZZ 4455,66']), mk(["MARY-ANNE O'ZEPHYR"], ['1969-07-04'], ['ZZ12345&01', 'ZZ555*0123'], ['900.12', '555/0123']), mk(['TOBE ZEPHYRA', 'ISA QUILLFEATHER'], ['1988-02-29'], ['SYN 0042 77', '0123.45'], ['2020/01/01', '150.00']),
  mk(['ZЕPHYRA VANTREE'], ['1955-07-14'], ['ZZ12345]01', 'ZZ77^88', 'ZZ66\\55', 'ZZ44-33'], ['SYN\u{1F600}0001', 'ZZ12٣45']), mk(['JANE Q ZEPHYRA'], ['1980-03-14'], ['3456150.00', '12-3456', '345.678'], ['56150', '0123', '1/02/2020', '12/3456']), mk(['ASA NEWMAN', 'THEO UNDERWOOD'], ['1999-09-09'], ['SYN+MEMBER/0042', '5550,123'], ['55.50123', 'SYN.CLAIM,0001']),
];
type Who = (typeof PATIENTS)[number];
const rows = (category: string) => readdirSync(OUT).filter((name) => new RegExp(`^(fuzz|k1)-[0-9]+-${category}\\.jsonl$`, 'u').test(name) && !name.startsWith('fuzz-99-')).flatMap((name) => readFileSync(`${OUT}/${name}`, 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line)));
const screen = (m: typeof head, letter: string, who: Who) => { const r = m.redactLetterForScreen(letter, who.patient, who.claims); return m.holdsIdentifier(r.text, who.patient, who.claims) ? 'REFUSED' : JSON.stringify(r.text); };
const path = (m: typeof head, letter: string, who: Who) => { const r = m.redactLetter(letter, who.patient, who.claims); return m.holdsIdentifier(r.text, who.patient, who.claims) ? 'REFUSED' : JSON.stringify(r.text); };
const tally = (list: string[]) => JSON.stringify(Object.fromEntries([...new Set(list)].sort().map((key) => [key, list.filter((each) => each === key).length])));
const n = (text: string, placeholder: string) => text.split(placeholder).length - 1;
const kind = (baseText: string, headText: string) => `${n(headText, '[PATIENT_NAME]') !== n(baseText, '[PATIENT_NAME]') ? 'name' : ''}${n(headText, '[MEMBER_ID]') + n(headText, '[CLAIM_') !== n(baseText, '[MEMBER_ID]') + n(baseText, '[CLAIM_') ? 'number' : ''}`;

const k1 = rows('k1_sent_with_crlf_refused_with_lf_wider_applied');
console.log('K-1 with a wider match applied:', k1.length, 'by patient', tally(k1.map((row) => String(row.patient))), 'by kind of wider match', tally(k1.map((row) => kind(row.base ?? '', row.head))), 'base sent it too:', k1.filter((row) => row.base !== null).length);
for (const row of k1.filter((each) => kind(each.base ?? '', each.head) === 'name').slice(0, 4)) console.log('   name alone:', JSON.stringify(row).slice(0, 600), '| head on LF:', screen(head, row.letter.replaceAll('\r\n', '\n'), PATIENTS[row.patient] as Who));
for (const patient of [1, 2, 4, 5, 8]) { const row = k1.find((each) => each.patient === patient); if (row !== undefined) console.log(`   patient ${patient}:`, JSON.stringify(row).slice(0, 500)); }

const p2 = rows('p2_base_refuses_head_sends');
console.log('\nletter path, kept rows', p2.length, 'by patient', tally(p2.map((row) => String(row.patient))), 'by kind', tally(p2.map((row) => kind(row.baseLetter, row.headLetter))));
// Where the wider reading replaced names alone: write the patient's name there as the base reads it. If the base still refuses, the placeholder hid something else the base's check read.
let tested = 0;
const still: unknown[] = [];
for (const row of p2) {
  const who = PATIENTS[row.patient] as Who;
  const sb = base.redactionSpans(row.letter, who.patient, who.claims);
  const sh = head.redactionSpans(row.letter, who.patient, who.claims);
  const wider = sh.spans.filter((span: { start: number; end: number }) => !sb.spans.some((first: { start: number; end: number }) => first.start === span.start && first.end === span.end));
  if (wider.length === 0 || wider.some((span: { placeholder: string }) => span.placeholder !== '[PATIENT_NAME]')) continue;
  tested += 1;
  const part = (who.patient.names[0] ?? '').split(/[\s\-']+/u).sort((a, b) => b.length - a.length)[0] ?? 'Zephyra';
  let rewritten = sh.text as string;
  for (const span of [...wider].reverse()) rewritten = `${rewritten.slice(0, span.start)} ${part} ${rewritten.slice(span.end)}`;
  if (path(base, rewritten, who) === 'REFUSED') still.push({ letter: row.letter, patient: row.patient, rewritten, baseOnRewritten: base.redactLetter(rewritten, who.patient, who.claims).text, headLetter: row.headLetter });
}
console.log(`names alone replaced by the wider reading: ${tested} rows; base still refuses with the name written whole there: ${still.length}`);
for (const row of still.slice(0, 5)) console.log('   ', JSON.stringify(row).slice(0, 900));

console.log('\nclean rows');
const JANE = PATIENTS[0] as Who;
const HELD = mk(['JUNE MARCH'], ['1975-06-01'], ['ZZ12345/01'], ['1234.56']);
for (const [letter, who] of [
  ['Dear Z e p h y r a900-12-3456, your claim', JANE], ['Dear Zephy ra202-555-0123.', JANE], ['Dear Zephy ra 900-12-3456, your claim', JANE],
  ['The member ZZ12345.01 was paid short.', HELD], ['The member ZZ12345,01 was paid short.', HELD], ['Member ID: ZZ12345.01 was paid short.', HELD], ['The member ZZ12345/01 was paid short.', HELD],
  ['The member ZZ12345]01 was paid short.', mk(['JANE Q ZEPHYRA'], ['1980-03-14'], ['ZZ12345]01'], ['SYNCLAIM0001'])], ['Member ID: ZZ12345]01 was paid short.', mk(['JANE Q ZEPHYRA'], ['1980-03-14'], ['ZZ12345]01'], ['SYNCLAIM0001'])],
  ['Dear Zephy\u0085ra, your claim', JANE], ['Dear Zephy。ra, your claim', JANE], ['Dear Zephy, ra, your claim', JANE], ['Dear Zephy.,ra, your claim', JANE], ['Dear Zephy(ra), your claim', JANE], ['Dear Zephy: ra, your claim', JANE],
  ['SSN verified. Account \r\r\nNo. 900-12-345678', JANE], ['SSN verified. Account \n\rNo. 900-12-345678', JANE],
  ['Seen 01/01/2020-150.00Paid in full. SSN:(V an tree, Z​Medicare: 900*12*3456\n900123456\n\n$150.00', PATIENTS[6] as Who], ['Seen 01/01/2020-150.00Paid in full. SSN:(Vantree, Z​Medicare: 900*12*3456\n900123456\n\n$150.00', PATIENTS[6] as Who],
  ['ZЕPHYRA, Z\r\n\r\n(202) 555-0123\r\nSeen 01/01/2020-150.00Paid in full. \r\nICN\r\n', PATIENTS[7] as Who], ['ZЕPHYRA, Z\n\n(202) 555-0123\nSeen 01/01/2020-150.00Paid in full. \nICN\n', PATIENTS[7] as Who],
] as const) console.log(JSON.stringify(letter), '| names', JSON.stringify(who.patient.names), 'ids', JSON.stringify(who.patient.memberIds), 'claims', JSON.stringify(who.claims.map((claim) => claim.claimNumbers[0])), '\n    screen: base', screen(base, letter, who), '| head', screen(head, letter, who), '\n    letter path: base', path(base, letter, who), '| head', path(head, letter, who));
const e = rows('e_no_crlf');
console.log('\nbase sends, head refuses, no CR LF in the letter: kept', e.length, 'head wrote the base\'s text:', e.filter((row) => row.base === row.headText).length, 'by patient', tally(e.map((row) => String(row.patient))));
