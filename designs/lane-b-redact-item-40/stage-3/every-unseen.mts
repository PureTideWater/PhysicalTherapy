// every-unseen.mts <src dir> [detail file]: Queues item 40, stage 3 (W74): every unseen character (every \p{C} code
// point of the Basic Multilingual Plane and the next that is a control or a format character and is not
// default-ignorable, not white space and not one of the checks' marks U+0001 to U+0003, with one private-use, one
// unassigned and the two lone surrogates) INSIDE each kind of identifier, at three places (after its first character,
// in its middle, before its last), in five frames, through the letter's real path (redactLetterForScreen, then
// holdsIdentifier with the work spent) and through redactLetter and its check. Synthetic values only.
// Prints counts by kind: clear (sent, the value in it), hidden (sent without it), refused; and apart, never among
// them, the letters of a frame in which the value written with NO such character is sent in clear too (no reading
// takes it there as an identifier at all: a phone number of seven digits that is not stored, after no label).
// Run: node --import /home/user/ops/designs/lane-b-redact-ssn-phone/gate/ts-resolve.mjs every-unseen.mts <dir> [detail]
import { writeFileSync } from 'node:fs';
const [dir, detailFile] = process.argv.slice(2);
const H = await import(`${dir}/redact.ts`);
const P = { pseudonym: 'synthetic-patient-40', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['76543210', 'ZZ7654321', '496736367'] };
const STORED = { ...P, memberIds: [...P.memberIds, '900123456', '5550123', '2125550123'] };
const C = [{ claimId: 'synthetic-claim-40', patientPseudonym: 'synthetic-patient-40', claimNumbers: ['SYN99887', '4455667', '2572817237'] }];
const chars: string[] = ['', '͸', '\uD800', '\uDC00'];
for (let cp = 0; cp <= 0x1ffff; cp += 1) { if (cp >= 0xd800 && cp <= 0xdfff) continue; const c = String.fromCodePoint(cp); if (/[\p{Cc}\p{Cf}]/u.test(c) && !/[\p{Default_Ignorable_Code_Point}\s]/u.test(c) && (cp < 1 || cp > 3)) chars.push(c); }
const alnum = (s: string) => s.normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
const digits = (d: string) => (s: string) => s.replace(/[^0-9]/g, '').includes(d);
// kind, the value as written, what shows it in a sent text, the call
const KINDS: [string, string, (sent: string) => boolean, typeof P][] = [
  ['digits-only member ID', '76543210', digits('76543210'), P],
  ['digits-only claim number', '4455667', digits('4455667'), P],
  ['digits-only member ID of nine digits (a pattern takes it)', '496736367', digits('496736367'), P],
  ['digits-only claim number of ten digits (a pattern takes it)', '2572817237', digits('2572817237'), P],
  ['lettered member ID', 'ZZ7654321', (s) => alnum(s).includes('zz7654321'), P],
  ['lettered claim number', 'SYN99887', (s) => alnum(s).includes('syn99887'), P],
  ['surname', 'Zephyra', (s) => alnum(s).includes('zephyra'), P],
  ['full name', 'Jane Q. Zephyra', (s) => alnum(s).includes('zephyra') || alnum(s).includes('jane'), P],
  ['surname, first', 'Zephyra, Jane', (s) => alnum(s).includes('zephyra') || alnum(s).includes('jane'), P],
  ['date of birth, slashes', '03/14/1980', digits('03141980'), P],
  ['date of birth, ISO', '1980-03-14', digits('19800314'), P],
  ['date of birth, in words', 'March 14, 1980', (s) => /march/i.test(alnum(s)) && digits('141980')(s), P],
  ['a Social Security number by pattern, not stored', '900-12-3456', digits('900123456'), P],
  ['a phone number of seven digits by pattern, not stored', '555-0123', digits('5550123'), P],
  ['a phone number of ten digits by pattern, not stored', '(212) 555-0123', digits('2125550123'), P],
  ['a Social Security number, stored', '900-12-3456', digits('900123456'), STORED],
  ['a phone number of seven digits, stored', '555-0123', digits('5550123'), STORED],
  ['a phone number of ten digits, stored', '(212) 555-0123', digits('2125550123'), STORED],
];
const FRAMES: [string, string][] = [['Ref ', ' on file.'], ['', ''], ['Seen: ', '\nPaid'], ['Member ID: ', ''], ['Patient: ', ' was seen.'], ['Call ', ' now'], ['Phone: ', '']];
const detail: string[] = [];
for (const path of ['screen', 'redactLetter'] as const) {
  console.log(`== through ${path === 'screen' ? 'redactLetterForScreen and the check' : 'redactLetter and the check'}`);
  const all = { clear: 0, hidden: 0, refused: 0, noIdentifierThere: 0 };
  const send = (letter: string, who: typeof P): string | null => {
    if (path === 'screen') { const r = H.redactLetterForScreen(letter, who, C); return H.holdsIdentifier(r.text, who, C, H.checkWorkOf(r)) ? null : r.text; }
    const r = H.redactLetter(letter, who, C); return H.holdsIdentifier(r.text, who, C) ? null : r.text;
  };
  for (const [kind, value, shown, who] of KINDS) {
    const n = { clear: 0, hidden: 0, refused: 0, noIdentifierThere: 0 };
    for (const [b, a] of FRAMES) {
      const plain = send(`${b}${value}${a}`, who);
      const none = plain !== null && shown(plain);
      for (const c of chars) for (const cut of new Set([1, Math.floor(value.length / 2), value.length - 1])) {
      const letter = `${b}${value.slice(0, cut)}${c}${value.slice(cut)}${a}`;
      const sent = send(letter, who);
      const o = none ? 'noIdentifierThere' : sent === null ? 'refused' : shown(sent) ? 'clear' : 'hidden';
      n[o] += 1; all[o] += 1;
      if (o !== 'refused' && o !== 'noIdentifierThere') detail.push(`${path}\t${kind}\t${o}\tU+${c.codePointAt(0)!.toString(16).toUpperCase()}\t${cut}\t${JSON.stringify(b)}\t${JSON.stringify(sent)}`);
    } }
    console.log(`${kind}: ${JSON.stringify(n)}`);
  }
  console.log(`all kinds: ${JSON.stringify(all)} of ${chars.length} characters x 3 places x ${FRAMES.length} frames x ${KINDS.length} kinds`);
}
if (detailFile) writeFileSync(detailFile, detail.join('\n') + '\n');
