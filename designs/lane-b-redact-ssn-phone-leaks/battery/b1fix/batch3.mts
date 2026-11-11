// Batch 3: a newly recognized own identifier between a label and its number (the base read the label through it), a digit
// after a labeled number (hours, a list, the next line), held-letter date-of-birth writings. node batch3.mts [all] [group]
import { D, Rw, P2, runProbes, type Probe } from './lib.mts';

const probes: Probe[] = [];
const add = (g: string, leak: Probe['leak'], texts: string[], extra: Partial<Probe> = {}) => { for (const t of texts) probes.push({ g, t, leak, ...extra }); };
const num = [D('5550123'), D('5550124'), D('5550100'), D('3456'), D('1234567893')];
const CYR = 'ZЕРНYRА';
add('OWNNEW', num, [
  `Phone ${CYR}\n555-0123`, 'Phone: Zephyra\n555-0123', `SSN: ${CYR}\nXXXXX3456`, 'Phone: Zeph·yra\n555-0123', `Phone/SSN: ${CYR} 555-0123 / 900-12-3456`, `Phone: ${CYR} 555-0123 01/02/2026`,
  `Cell: ${CYR} - 555-0123 2020`, `SSN No. ${CYR} is 1234567893•0124`, `Phone ${CYR} 555-0123, 555-0124`, 'Call Z3PHYRA at\n555-0123', `Call ${CYR} at 555-0123, 8 a.m. to 5 p.m.`,
  `Call ${CYR} at 555-0123 24 hours a day`, 'Call ᴢᴇᴘʜʏʀᴀ\n555-0123', `Contact ${CYR}:\n555-0123 (home)`, `Telephone (${CYR})\n555-0123`, 'Fax Zeph‧yra\n555-0123',
  `SSN ${CYR}\n1234567893`, `Social Security ${CYR}\n0123456789`, `Phone ${CYR}\n(555) 0123`, `Phone ${CYR} 555-0123`, `Phone ${CYR}: 555-0123`, `Phone\n${CYR} 555-0123 7 days`,
  `Patient: ${CYR}\nPhone: 555-0123`, `Phone ${CYR}\n\n555-0123`, `Member SYNMEMBERO042\nPhone 555-0123`, `Phone ${CYR} 555-0123/24`, `SSN ${CYR} XXXXX3456 1`, `SSN ${CYR} XXXXX3456, 2026`,
]);
add('OWNNEW2', num, [
  'Contact: S1MONE\n555-0123', 'Call VANTR3E at 555-0123 01/02/2026', 'Tel S1MONE VANTR3E\n555-0123', 'Phone νantree\n555-0123', 'Phone: S1MONE 555-0123, 9 to 5', 'SSN S1MONE\nXXXXX3456',
  'Contact: SIMONE\n555-0123', 'Call VANTREE at 555-0123 01/02/2026', 'Call S1MONE at 555-0123', 'Phone ZZ765432l\n555-0123', 'Phone ZZ765432I\n555-0123', 'Phone: S1MONE VANTREE 555-0123 / 900-12-3456',
], { P: P2 });
add('AFTER', num, [
  'Call Zephyra at 555-0123\n2. Send the records', 'Call Zephyra at 555-0123\n01/02/2026 Paid', 'Call Zephyra at 555-0123\n150.00 paid', 'Phone 1: 555-0100\n2. Next step', 'Phone 1: 555-0100\n123 Main Street',
  'Call Zephyra at 555-0123 by 5 pm', 'Call Zephyra at 555-0123 24 hours a day', 'Call Zephyra at 555-0123 (24 hours)', 'Call Zephyra at 555-0123, 24 hours a day, 7 days a week', 'Call Zephyra at 555-0123 7 days a week',
  'Call Zephyra at 555-0123 9am-5pm', 'Call Zephyra at 555-0123, 8 a.m. to 5 p.m.', 'Call Zephyra at 555-0123 / TTY 711', 'Call Zephyra at 555-0123 (TTY 711)', 'Phone 1: 555-0100, 8 am - 5 pm', 'Phone 1: 555-0100 (8-5)',
  'Call at 555-0123 24 hours a day', 'Call at 555-0123, 8 a.m. to 5 p.m.', 'Call Zephyra at 555-0123 8 a.m. to 5 p.m.', 'Call Zephyra at 555-0123 - 24/7', 'Call Zephyra at 555-0123 24/7', 'Phone 1: 555-0100 24/7',
  'Call Zephyra at 555-0123.\n2. Send the records', 'Phone 1: 555-0100 1/2/2026', 'Call Zephyra at 555-0123 on 1/2/2026', 'Call Zephyra at 555-0123 1/2/2026', 'Call Zephyra at 555-0123, 2026',
  'Call Zephyra at 555-0123 (2)', 'Call Zephyra at 555-0123 #2', 'Call Zephyra at 555-0123, option 2', 'Call Zephyra at 555-0123, 2', '3 Call Zephyra at 555-0123', '2. Call Zephyra at 555-0123',
  '2026 Call Zephyra at 555-0123', 'Paid 150.00\nCall Zephyra at 555-0123', 'Call Zephyra 24/7 at 555-0123', 'Call Zephyra by 5 pm at 555-0123', 'Call Zephyra at 5 pm: 555-0123',
]);
// held letters: the date of birth 1980-03-14 in writings the held rules name, and one step away from them
const H = 'Seen 01/01/2020-150.00Paid in full. ';
const dob: [string, string[]][] = [
  ['born Mar 14th', ['Mar 14']], ['born on March the 14th', ['March the 14']], ['the 14th of March', ['14th of March']], ['14 March', ['14 March']], ['March 14', ['March 14']], ['14-Mar', ['14-Mar']], ['Mar. 14', ['Mar. 14']],
  ['on 3/14', ['3/14']], ['on 03/14', ['03/14']], ['on 03-14', ['03-14']], ['March fourteenth', ['March fourteenth']], ['the fourteenth of March', ['fourteenth of March']], ['14.III.1980', ['14.III.1980']],
  ['14/III/80', ['14/III/80']], ['III-14-1980', ['III-14-1980']], ['14 iii 1980', ['14 iii 1980']], ['III.14.80', ['III.14.80']], ['1980年3月14日', ['3月14']], ['80年3月14日', ['3月14']],
  ['1980 年 3 月 14 日', ['14 日']], ['3月14日', ['3月14']], ['March 14, nineteen eighty', ['nineteen eighty']], ['March 14, Nineteen Hundred Eighty', ['Hundred Eighty']],
  ['March 14 in the year nineteen eighty', ['nineteen eighty']], ['14 March nineteen-eighty', ['nineteen-eighty']], ['nineteen eighty, March 14', ['March 14']], ['March 14, 19 80', ['19 80']], ['March 14, eighty', ['eighty']],
  ['March 14 of ’80', ['80']], ['ID 80314', ['80314']], ['ID 800314', ['800314']], ['ID 80031455', ['800314']], ['ID 5580314', ['80314']], ['ID 8003140', ['800314']], ['ID 31480', ['31480']], ['ID 14380', ['14380']],
  ['ID 198003-14', ['198003-14']], ['ID 1980314', ['1980314']], ['ID 3141980', ['3141980']], ['ID 1431980', ['1431980']], ['ID 80-03-14', ['80-03-14']], ['ID 80/3/14', ['80/3/14']], ['ID 80.074', ['80.074']],
  ['born 1980, March', ['1980, March']], ['born March 1980', ['March 1980']], ['born 3/1980', ['3/1980']], ['born 03-1980 on the 14th', ['03-1980']], ['age 45, born in March of 1980 on the 14th', ['March of 1980']],
  ['DOB: 14 Mar', ['14 Mar']], ['DOB 3.14', ['3.14']], ['D.O.B. Mar 14', ['Mar 14']], ['Mar-14', ['Mar-14']], ['MAR14', ['MAR14']], ['14MAR', ['14MAR']], ['14MAR80', ['14MAR80']], ['Mar 14 ‘80', ['Mar 14']],
  ['March 14th at 3 pm', ['March 14th']], ['Marzo 14', ['Marzo 14']], ['14 de marzo de 1980', ['14 de marzo']], ['3—14—1980', ['1980']], ['3 14 1980', ['3 14 1980']], ['14·3·1980', ['1980']],
];
for (const [t, raws] of dob) { probes.push({ g: 'HDOB', t: H + t, leak: raws.map((r) => Rw(r)) }); probes.push({ g: 'DOBnh', t, leak: raws.map((r) => Rw(r)) }); }
const args = process.argv.slice(2);
await runProbes(probes, { all: args.includes('all'), only: args.find((a) => a !== 'all') });
