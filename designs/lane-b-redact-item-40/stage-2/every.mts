// every.mts <src dir> [detail file]: Queues item 40, stage 2 (W72): every number character that is no decimal digit
// (Nl, No; 1,154 in this runtime) right beside each KIND of stored identifier, before and after, through the letter's
// real path (redactLetterForScreen, then holdsIdentifier with the work spent) and through redactLetter and its check.
// Synthetic values only. Prints counts by kind: clear (sent, the value in it), hidden (sent without it), refused.
// Run: node --import /home/user/ops/designs/lane-b-redact-ssn-phone/gate/ts-resolve.mjs every.mts <dir> [detail]
import { writeFileSync } from 'node:fs';
const [dir, detailFile] = process.argv.slice(2);
const H = await import(`${dir}/redact.ts`);
const P = { pseudonym: 'synthetic-patient-40', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['76543210', 'ZZ7654321', '496736367'] };
const C = [{ claimId: 'synthetic-claim-40', patientPseudonym: 'synthetic-patient-40', claimNumbers: ['SYN99887', '4455667', '2572817237'] }];
const chars: string[] = [];
for (let cp = 0; cp <= 0x1ffff; cp += 1) { if (cp >= 0xd800 && cp <= 0xdfff) continue; const c = String.fromCodePoint(cp); if (/[\p{Nl}\p{No}]/u.test(c)) chars.push(c); }
const alnum = (s: string) => s.normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
// kind, the value as written, what shows it in a sent text
const KINDS: [string, string, (sent: string) => boolean][] = [
  ['digits-only member ID', '76543210', (s) => s.replace(/[^0-9]/g, '').includes('76543210')],
  ['digits-only claim number', '4455667', (s) => s.replace(/[^0-9]/g, '').includes('4455667')],
  ['digits-only member ID of nine digits (a pattern takes it)', '496736367', (s) => s.replace(/[^0-9]/g, '').includes('496736367')],
  ['digits-only claim number of ten digits (a pattern takes it)', '2572817237', (s) => s.replace(/[^0-9]/g, '').includes('2572817237')],
  ['lettered member ID', 'ZZ7654321', (s) => alnum(s).includes('zz7654321')],
  ['lettered claim number', 'SYN99887', (s) => alnum(s).includes('syn99887')],
  ['surname', 'Zephyra', (s) => alnum(s).includes('zephyra')],
  ['full name', 'Jane Q. Zephyra', (s) => alnum(s).includes('zephyra')],
  ['surname, first', 'Zephyra, Jane', (s) => alnum(s).includes('zephyra')],
  ['date of birth, slashes', '03/14/1980', (s) => s.replace(/[^0-9]/g, '').includes('03141980')],
  ['date of birth, ISO', '1980-03-14', (s) => s.replace(/[^0-9]/g, '').includes('19800314')],
  ['date of birth, in words', 'March 14, 1980', (s) => /march/i.test(s) && s.replace(/[^0-9]/g, '').includes('141980')],
  // Not stored: a pattern's number (a 900-area Social Security twin, a 555-01 phone twin). Counted, and named apart.
  ['NOT STORED, a Social Security number by pattern', '900-12-3456', (s) => s.replace(/[^0-9]/g, '').includes('900123456')],
  ['NOT STORED, a phone number by pattern', '555-0123', (s) => s.replace(/[^0-9]/g, '').includes('5550123')],
];
const FRAMES: [string, string][] = [['Ref ', ' on file.'], ['', ''], ['Seen: ', '\nPaid'], ['Member ID: ', ''], ['Patient: ', ' was seen.']];
const detail: string[] = [];
for (const path of ['screen', 'redactLetter'] as const) {
  console.log(`== through ${path === 'screen' ? 'redactLetterForScreen and the check' : 'redactLetter and the check'}`);
  let all = { clear: 0, hidden: 0, refused: 0 };
  for (const [kind, value, shown] of KINDS) {
    const n = { clear: 0, hidden: 0, refused: 0 };
    for (const c of chars) for (const side of [0, 1]) for (const [b, a] of FRAMES) {
      const letter = `${b}${side === 0 ? c + value : value + c}${a}`;
      let sent: string | null;
      if (path === 'screen') { const r = H.redactLetterForScreen(letter, P, C); sent = H.holdsIdentifier(r.text, P, C, H.checkWorkOf(r)) ? null : r.text; }
      else { const r = H.redactLetter(letter, P, C); sent = H.holdsIdentifier(r.text, P, C) ? null : r.text; }
      const o = sent === null ? 'refused' : shown(sent) ? 'clear' : 'hidden';
      n[o] += 1; all[o] += 1;
      if (o !== 'refused') detail.push(`${path}\t${kind}\t${o}\tU+${c.codePointAt(0)!.toString(16).toUpperCase()}\t${side === 0 ? 'before' : 'after'}\t${JSON.stringify(b)}\t${JSON.stringify(sent)}`);
    }
    console.log(`${kind}: ${JSON.stringify(n)}`);
  }
  console.log(`all kinds: ${JSON.stringify(all)} of ${chars.length} characters x 2 sides x ${FRAMES.length} frames x ${KINDS.length} kinds`);
}
if (detailFile) writeFileSync(detailFile, detail.join('\n') + '\n');
