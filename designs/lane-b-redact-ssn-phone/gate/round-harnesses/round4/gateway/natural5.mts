// Scale of GATEWAYJ4-1: the head rule's B-only refusals after the GATEWAYJ3-1 fix, for patients whose long part is the
// letters of a unit, a time or an ordinal plus another part of the same name, in natural sentences; cc3dd7f6 against HEAD.
import fs from 'node:fs';
import { cmp, patient } from './lib.mts';
const cap = (s: string) => s.split('-').map((w) => w[0] + w.slice(1).toLowerCase()).join('-');
const people: string[][] = [
  ['MINSEO', 'SEO'], ['MINJI', 'JI'], ['MINJUN', 'JUN'], ['MINHO', 'HO'], ['MINSU', 'SU'],
  ['AMAL', 'AL-SAYED'], ['AMAL', 'AL', 'HASSAN'], ['AMAN', 'AN'],
  ['NGUYEN', 'THANH', 'ANH'], ['THANH', 'ANH', 'TRAN'],
  // controls
  ['MINSEO', 'KIM'], ['AMAL', 'HASSAN'], ['NGUYEN', 'THANH', 'BINH'],
];
const templates: ((name: string) => string)[] = [
  (n) => `Session 30min ${n} attended.`,
  (n) => `Total treatment time 45min ${n} tolerated treatment well.`,
  (n) => `Therapeutic exercise 97110 x 2 units, 25min ${n} was seen on 02/14/2026.`,
  (n) => `Seen 9-10am ${n} tolerated treatment.`,
  (n) => `Appointment 9am-10am ${n} arrived on time.`,
  (n) => `Appointment 10:00-11:00am ${n} arrived on time.`,
  (n) => `Appointment at 9.30am ${n} arrived on time.`,
  (n) => `Visits on March 3rd-4th ${n} attended both.`,
  (n) => `Seen on the 3rd/4th ${n} attended.`,
  (n) => `Seen March 3-4th ${n} attended both visits.`,
  (n) => `Appointment at 9am ${n} arrived on time.`,
  (n) => `On the 4th ${n} called our office.`,
];
let total = 0, bad = 0;
const out: string[] = [];
const byT = new Map<number, number>();
for (const parts of people) {
  const names = [parts.join(' ')];
  const writings = [parts.map(cap).join(' '), cap(parts[0]!)];
  for (const full of writings) {
    templates.forEach((tpl, k) => {
      const t = tpl(full);
      total += 1;
      const r = cmp(t, patient(names));
      if (r.b === 'REFUSED' && r.a !== 'REFUSED') { bad += 1; byT.set(k, (byT.get(k) ?? 0) + 1); out.push(`[${names[0]}] t${k} ${JSON.stringify(t)} A: ${JSON.stringify(r.a)}`); }
    });
  }
}
fs.writeFileSync(process.argv[2]!, out.join('\n') + '\n');
console.log(`letters ${total} B-only refusals ${bad} by template ${JSON.stringify([...byT])}`);
