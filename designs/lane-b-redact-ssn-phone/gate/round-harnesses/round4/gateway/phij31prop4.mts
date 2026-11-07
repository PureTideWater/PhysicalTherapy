// Replica of denial-letter.test.ts's PHIJ3-1 property (unseeded, 300 runs on CI): many runs over many seeds, counting
// inputs where neverInClear fails (not refused and not the form alone replaced). Arg: total runs, first seed.
import fc from '/home/user/rg-cand-b/node_modules/.pnpm/fast-check@4.10.2/node_modules/fast-check/lib/fast-check.js';
import fs from 'node:fs';
import { B } from './lib.mts';
const total = Number(process.argv[2] ?? '20000');
const seed0 = Number(process.argv[3] ?? '1');
const HELD = 'Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00. ';
const HELD_FRAMES = [`${HELD}Seen {T}`, 'Seen 01/01/2020-150.00 Paid. {T}', '{T}\nSeen 01/01/2020-150.00Paid in full.', 'Re: {T}. Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00'];
const ORDERS = ['ymd', 'ydm', 'mdy', 'dmy', 'myd', 'dym'] as const;
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const narrow = fc.array(fc.constantFrom('/', '\\', '.', '-', '–', '−', '⁃', '_', '|', ' ', ',', '\n', "'"), { minLength: 1, maxLength: 3 }).map((c: string[]) => c.join(''));
const blank = fc.constantFrom('', '  ', '     ', '        ', '\n        ', '\r\n   ', '\t\t\t');
const wide = fc.tuple(blank, fc.constantFrom('', '/', '-', '.', ',', '–', '|'), blank).map(([a, b, c]: string[]) => `${a}${b}${c}`).filter((w: string) => w.length > 4);
const gap = fc.oneof(narrow, wide);
const arb = fc.tuple(
  fc.date({ min: new Date('1925-01-01T00:00:00Z'), max: new Date('2009-12-31T00:00:00Z'), noInvalidDate: true }),
  fc.constantFrom(...HELD_FRAMES), fc.constantFrom(...ORDERS), gap, gap, fc.boolean(), fc.boolean(), fc.nat(4));
const bad: string[] = [];
let runs = 0;
for (let s = seed0; runs < total; s += 1) {
  const samples = fc.sample(arb, { numRuns: 300, seed: s });
  for (const [date, frame, order, first, second, short, padded, word] of samples as any[]) {
    runs += 1;
    const birth = date.toISOString().slice(0, 10);
    const [year = '', month = '', day = ''] = birth.split('-');
    const name = MONTH_NAMES[Number.parseInt(month, 10) - 1] ?? 'May';
    const monthAs = [padded ? month : month.replace(/^0/u, ''), name, name.slice(0, 3), `${name.slice(0, 3)}.`, name.toUpperCase()][word] ?? month;
    const parts: Record<string, string> = { y: short ? year.slice(2) : year, m: monthAs, d: padded ? day : day.replace(/^0/u, '') };
    const [a = '', b = '', c = ''] = [...order].map((p) => parts[p] ?? '');
    const form = `${a}${first}${b}${second}${c}`;
    const letter = frame.replace('{T}', form);
    const who = { pseudonym: 'synthetic-patient-15', names: ['JANE Q ZEPHYRA'], datesOfBirth: [birth], memberIds: ['SYNMEMBER0042', 'ZZ7654321'] };
    const claims = [{ claimId: 'c1', patientPseudonym: 'synthetic-patient-15', claimNumbers: ['SYNCLAIM0001', 'C2026000417'] }];
    const screened = B.redactLetterForScreen(letter, who, claims);
    const refused = B.holdsIdentifier(screened.text, who, claims);
    const ok = refused || screened.text === letter.normalize('NFKC').replace(form.normalize('NFKC'), '[DATE_OF_BIRTH]');
    if (!ok) bad.push(JSON.stringify({ seed: s, birth, letter, sent: screened.text }));
  }
}
fs.writeFileSync(process.argv[4] ?? 'phij31prop.bad', bad.join('\n') + '\n');
console.log(`runs ${runs} bad ${bad.length}`);
for (const line of bad.slice(0, 5)) console.log(line);
