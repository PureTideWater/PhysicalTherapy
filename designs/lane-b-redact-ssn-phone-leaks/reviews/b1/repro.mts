// Every finding of REPORT.md, one line per letter: the outcome on the base (ef3e8d20) and on the head (aea2852d).
// node repro.mts [finding id prefix]
import { load, outcome, P1, P2, C1 } from './lib.mts';

const B = await load('base');
const H = await load('head');
const esc = (text: string) => JSON.stringify(text).replace(/[^\x20-\x7E]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const CYR = 'ZЕРНYRА'; // ZEPHYRA with Cyrillic E, P, H, A
const HELD = 'Seen 01/01/2020-150.00Paid in full. ';
const only = process.argv[2];
const show = (id: string, letters: (string | [string, 'P2'])[]) => {
  if (only && !id.startsWith(only)) return;
  console.log(`\n## ${id}`);
  for (const entry of letters) {
    const [text, who] = typeof entry === 'string' ? [entry, 'P1'] : entry;
    const P = who === 'P2' ? P2 : P1;
    const b = outcome(B, text, P, C1);
    const h = outcome(H, text, P, C1);
    const say = (o: typeof b) => (o.threw !== null ? `THREW ${o.threw}` : o.refused ? 'REFUSED' : o.sent === text.normalize('NFKC') ? 'SENT unchanged' : `SENT ${esc(o.sent)}`);
    console.log(`${esc(text)}${who === 'P2' ? ' [patient P2]' : ''}\n    base: ${say(b)}\n    head: ${say(h)}`);
  }
};

show('B1-1 an invisible run hides the joined digit from standsAlone', [
  'Call Zephyra at 555-0123/​555-0124', 'Call Zephyra at 555-0123/555-0124', 'Call Zephyra at 555-0123 ​555-0124', 'Call Jane Zephyra (555-0123​/555-0124)',
  'Call Zephyra at ‎555-0123‎ / ‎555-0124‎', 'Phone 1: 555-0100​/555-0124', 'Phone 1: 555-0100/555-0124', 'Call Zephyra at 555-0123﻿-900-12',
  'SSN Zephyra XXXXX3456­/900-12', `${HELD}Call Zephyra at 555-0123/​555-0124`,
]);
show('B1-2 an own identifier only the head reads ends the label window the base read through', [
  `Phone ${CYR}\n555-0123`, `SSN: ${CYR}\nXXXXX3456`, `Call ${CYR} at 555-0123, 8 a.m. to 5 p.m.`, `Phone: ${CYR} 555-0123 01/02/2026`, `Phone/SSN: ${CYR} 555-0123 / 900-12-3456`,
  `SSN ${CYR}\n1234567893`, 'Phone: Zeph·yra\n555-0123', 'Call ᴢᴇᴘʜʏʀᴀ\n555-0123', ['Phone νantree\n555-0123', 'P2'], `${HELD}Phone ${CYR}\n555-0123`,
  'Phone Zephyra\n555-0123', `Call ${CYR} at 555-0123`,
]);
show('B1-3 a letter the fold reads as a digit is a digit to the patterns and the label window', [
  'Phone (Зоя): 555-0123', 'Call Борис at 555-0123', 'Phone (моб.): 555-0123', 'TTY без 555-0123', 'SSN (Зоя) XXXXX3456',
  'Тел. (202) 555-0123без выходных', 'Phone 555-0123б', 'SSN XXX-XX-3456з', `${HELD}Phone (Зоя): 555-0123`, 'Phone (Zoya): 555-0123',
  'Ref з 20255 50123', 'Ref 20255 50123',
]);
show('B1-4 a literal U+0003 in the letter is the scan\'s own-identifier mark', [
  'SSN \u0003\n900.12 3456', 'SSN \u0004\n900.12 3456', 'Phone \u0003\n555-0123', 'SSN \u0003\nXXXXX3456', 'Claim \u0003 and 900123456', 'Claim and 900123456',
]);
show('B1-5 a crossed member ID held the chain the base refused', [
  'ID SYNMEMBERO042 555-0123', 'SYNMEMBERO042 | 555-0123 | 150.00', 'ID SYNMEMBER0042 555-0123',
]);
show('B1-6 G3: a Social Security label glued to the word before it, other than SSN and SOC SEC', [
  'PatientSSN 900.12 3456', 'PatientSS# 900.12 3456', 'PatientSS No 900.12 3456', 'PatientHICN 900.12 3456', '$150.00SSN 900.12 3456', 'SS# 900.12 3456',
]);
show('B1-7 G2: a masked SSN glued, in gaps the masked pattern itself reads, or after a word that ends in x', [
  'PaidXXX-XX-3456', 'PaidXXX - XX - 3456', 'Paid XXX - XX - 3456', 'PaidXXX-XX-\n3456', 'FaxXXX-XX-3456', 'TaxXXX-XX-3456', 'SSN FaxXXX-XX-3456',
]);
show('B1-8 G1 and G6: the same forms in a phone\'s usual writing, across a line wrap, or mirrored', [
  'Phone number 202-555-01234567', 'Phone number (202) 555-01234567', 'Fax (202) 555-01234567', 'Call us at (202) 555-0123150.00', 'Tel 202 555-0123150.00',
  'Paid 900-12-3456150.00', 'Paid 900-12-\n3456150.00', 'Paid 900 12 3456150.00', 'Paid $150.00900-12-3456', 'Paid $150.00900-12-\n3456', 'Paid 900123456150.00', 'Paid 150.00900123456',
  'SSN $150.00900123456', 'Paid $150.002025550123',
]);
show('B1-9 G5 and G4: an abbreviation\'s period, a qualifier, or a digit after the number', [
  'Tel 1: 555-0100', 'Tel. 1: 555-0100', 'Ph. 1: 555-0100', 'Phone 1 (home): 555-0100', 'Phone (1): 555-0100', 'Phone 1: 555-0100, 8 am - 5 pm', 'Phone 1: 555-0100\n2. Next step',
  'Call Zephyra at 555-0123', 'Call Zephyra at 555-0123, 8 a.m. to 5 p.m.', 'Call at 555-0123, 8 a.m. to 5 p.m.', 'Call Zephyra at 555-0123\n2. Send the records', 'Call Zephyra at 555-0123 1/2/2026',
]);
show('B1-10 the look-alike table: digit entries never applied, and letters read by their capital', [
  ['Dear ٧ANTREE,', 'P2'], ['Dear SIM٥NE,', 'P2'], ['Dear νantree,', 'P2'], ['Dear νan-tree,', 'P2'], ['Dear Van-tree,', 'P2'], ['Paid 150.00νantree', 'P2'], ['Paid 150.00Vantree', 'P2'],
  ['Dear ƽim-one,', 'P2'],
]);
show('B1-11 digit-for-letter forms with a joiner, a line-break hyphen or a mark inside', [
  ['ID ZZ765432l', 'P2'], ['ID ZZ 765432l', 'P2'], ['ID ZZ 7654321', 'P2'], ['ID ZZ-765432I', 'P2'], 'Claim SYNCLAIMOOO1', 'Claim SYNCLAIM-OOO1', 'Claim SYNCLAIM-0001', 'Member SYNMEMBER O042',
  ['Dear VANTR3E,', 'P2'], ['Dear VAN-TR3E,', 'P2'], ['Dear Van-\ntr3e,', 'P2'], ['Dear Van-\ntree,', 'P2'], ['Dear S1M̃ONE,', 'P2'],
]);
show('B1-12 held letters: the date of birth 1980-03-14 one step from the writings the design names', [
  `${HELD}14.III.1980`, `${HELD}14/III/80`, `${HELD}III.14.80`, `${HELD}1980年3月14日`, `${HELD}80年3月14日`, `${HELD}3月14日`, `${HELD}ID 5580314`, `${HELD}ID 80031455`,
  `${HELD}born Mar 14th`, `${HELD}March fourteenth`,
]);
show('B1-13 minor: G7 across a mark, name joiners that look like the middle dot, stroke letters, control characters', [
  '900-12-3456thZephyraPaid', '900-12-3456́thZephyraPaid', '0123́thZephyraPaid', 'Dear Zeph·yra,', 'Dear Zeph∙yra,', 'Dear Zeph⋅yra,', 'Dear Zeph•yra,', 'Dear Zepħyra,',
  'Dear Ƶephyra,', '900-12\u0004-3456', 'Dear Zeph\u0004yra,', 'SSN \u0001 900.12 3456',
]);
