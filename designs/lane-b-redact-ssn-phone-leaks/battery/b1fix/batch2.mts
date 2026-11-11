// Batch 2: follow-ups on the invisible-run hole in standsAlone, the crossed-identifier flip, G7 with a mark. node batch2.mts [all]
import { D, Rw, P2, runProbes, type Probe } from './lib.mts';

const probes: Probe[] = [];
const add = (g: string, leak: Probe['leak'], texts: string[], extra: Partial<Probe> = {}) => { for (const t of texts) probes.push({ g, t, leak, ...extra }); };
const left = [D('5550124'), D('90012'), D('900'), D('202'), D('0124'), D('3456'), D('5550123'), D('5550100'), D('45')];
const INV = ['​', '­', '⁠', '﻿', '‎', '‬', '‍', '͏', '️', '́', '؜', '᠎', '⁣'];
for (const z of INV) {
  add('INVa', left, [
    `Call Zephyra at 555-0123/${z}555-0124`, `Call Zephyra at 555-0123${z}/555-0124`, `Call Zephyra at 555-0123,${z}555-0124`, `Call Zephyra at 555-0123${z}, 555-0124`,
    `Call Zephyra at 555-0123${z} / 555-0124`, `Call Zephyra at 555-0123 /${z} 555-0124`, `Phone 1: 555-0100/${z}555-0124`, `Phone 1: 555-0100${z}/555-0124`,
    `Phone 1: 555-0100${z}, 555-0124`, `Call Zephyra at 555-0123${z}-900-12`, `Call Zephyra at 555-0123${z}/202`, `Call Zephyra at 555-0123${z}x45`, `Call Zephyra at 555-0123 ${z}555-0124`,
    `Call Zephyra at 555-0123${z} 555-0124`, `SSN Zephyra XXXXX3456${z}/900-12`, `Call Zephyra at 555-0123${z}(202)`, `Call Zephyra at 555-0123${z}.45`,
  ]);
}
add('INVb', left, [
  'Call Zephyra at 555-0123/555-0124', 'Call Zephyra at 555-0123, 555-0124', 'Phone 1: 555-0100/555-0124', 'Phone 1: 555-0100, 555-0124', 'Call Zephyra at 555-0123-900-12', 'Call Zephyra at 555-0123/202',
  'Call at 555-0123/​555-0124', 'Call 555-0123​/555-0124', 'Call 555-0123​, 555-0124', 'Phone: 555-0100​/555-0124', 'Call Zephyra at ‪555-0123‬, ‪555-0124‬',
  'Call Zephyra at ‎555-0123‎ / ‎555-0124‎', 'TTY Zephyra: ‏555-0123‏, ‏555-0124‏', 'Phone 1: ‎555-0100‎, 2: ‎555-0124‎',
  'Call Jane Zephyra (555-0123​/555-0124)', 'Fax SYNMEMBER0042 555-0123​/24', 'Call Zephyra at 555-0123​/​555-0124', 'Call Zephyra at 555-0123​-​0124',
]);
// crossed own identifier that held a chain at the base
add('XFLIP', [D('5550123'), D('3456'), D('555'), D('90012')], [
  'ID SYNMEMBERO042 555-0123', 'ID SYNMEMBER0042 555-0123', 'Member SYNMEMBERO042 Phone 555-0123', 'Member SYNMEMBER0O42 555-0123', 'Member SYNMEMBERO042 900-12', 'Member SYNMEMBERO042 12-3456',
  'Claim SYNCLAIMOOO1 55-0123', 'Claim SYNCLAIM000l 900-12-34', 'Member SYNMEMBERO042\n555-0123', 'Member SYNMEMBERO042, 555-0123', 'Member SYNMEMBERO042 / 555-0123', 'SYNMEMBERO042 | 555-0123 | 150.00',
  '555-0123 SYNMEMBERO042', '900-12 SYNCLAIMOOO1 3456',
]);
add('XFLIP2', [D('5550123'), D('3456'), D('555'), D('90012'), D('0123')], [
  'ID ZZ765432l 555', 'ID ZZ765432l 555-0123', 'ID ZZ7654321 555', 'ID 555 ZZ765432l', 'ID ZZ76543Z1 555', 'ID ZZ765432I 900', 'Dear S1MONE 20255-50123', 'S1MONE 900-12-34', '900-12 S1MONE 3456',
  'VANTR3E 5550123', '12 VANTR3E 5550123', 'ID ZZ765432l-555', 'ID ZZ765432l/900', 'ID ZZ765432l 90', 'ID ZZ765432l 5550', 'ID ZZ765432l 55501', 'ID ZZ765432l 0123',
], { P: P2 });
// G7 with a mark between the number and the letters, against the digit it stands for
add('G7m', [Rw('Zephyra')], ['0123́thZephyraPaid', '900-12-3456́thZephyraPaid', '0123​thZephyraPaid', '0123thZephyraPaid', '900-12-3456thZephyraPaid']);
// other G-forms under a label, to see which are label-dependent
add('LBL', [D('3456'), D('0123'), D('5550123')], [
  'SSN 900 12 3456150.00', 'SSN: 900-12-\n3456150.00', 'Social Security No. 900 12 3456150.00', 'SSN 150.00900123456', 'SSN $150.00900123456', 'Phone (202) 555-0123150.00', 'Telephone: (202) 555-01234567',
  'Call us at (202) 555-0123150.00', 'Phone number (202) 555-01234567', 'SSN 150.00900 12 3456', 'SSN FaxXXX-XX-3456', 'SSN: PaidXXX - XX - 3456', 'Paid 150.00 900123456', 'Paid 150.0900123456',
  'Paid 150.00900123456 today', 'Paid 150.00900123456.', 'Amount 150.00900123456 SSN', 'Paid 0.00900123456', 'Paid 1,234.00900123456', 'Paid 150.002025550123 phone',
]);
const args = process.argv.slice(2);
await runProbes(probes, { all: args.includes('all'), only: args.find((a) => a !== 'all') });
