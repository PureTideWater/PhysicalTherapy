// Ruling B (a name part that is a month's word), other-script digits in the date of birth, and a few leftovers. node misc.mts
import { D, Rw, runProbes, type Probe } from './lib.mts';
const PM = { pseudonym: 'p', names: ['MAY ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['SYNMEMBER0042'] };
const probes: Probe[] = [];
for (const t of ['Dear May,', 'Seen May 2020', 'Seen May 103', 'Seen May 5, 2026', 'Seen on May 5', 'Seen May 5th', 'Seen May-2020', 'Seen May/2020', 'Seen May, 2020', 'Seen May of 2020', "Seen May '20", 'Vision of May 20/20',
  'May 12 34 Main St', 'Seen May 5 and 6, 2026', 'Seen 5 May', 'Seen 5 May 2026', 'Seen May2020', 'Seen May 32, 2026', 'May 5, 26 units billed', 'Patient May 5 12 visits', 'May 1 2 3', 'Call May 5 5550123', 'Patient: May 03/14/1980',
  'Patient May 3 14', 'Dear May 5, 2026 is the date', 'MAY 5, 2026', 'may 5, 2026 notes', 'Patient May.5.26', 'Patient May 5,2026 owes', 'Patient May - 5 - 2026'])
  probes.push({ g: 'RULB', t, leak: [Rw('May'), Rw('MAY'), Rw('may')], P: PM });
for (const t of ['DOB ١٤/٠٣/١٩٨٠', 'Born ٠٣/١٤/١٩٨٠', 'on ٠٣-١٤-١٩٨٠ paid', 'on १४/०३/१९८०', 'on 03/14/19٨٠', 'on March 14, ١٩٨٠',
  'on 𝟎𝟑/𝟏𝟒/𝟏𝟗𝟖𝟎', 'on ①④/⓪③/1980', 'on ¹⁴/⁰³/¹⁹⁸⁰', 'on ❷❹ 3 1980'])
  probes.push({ g: 'DOBSC', t, leak: [D('1980'), D('0314'), D('1403')] });
await runProbes(probes, { all: true });
