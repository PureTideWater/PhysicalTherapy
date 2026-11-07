// Scale of the head rule's B-only refusals: first names that are a token glued after a digit (unit, ordinal, time) plus an
// initial of another part or plus another part, in natural sentences; cc3dd7f6 against HEAD.
import fs from 'node:fs';
import { cmp, patient } from './lib-gateway.mts';
const cap = (s: string) => s[0] + s.slice(1).toLowerCase();
// [first name, other parts]
const people: [string, string[]][] = [
  ['MINA', ['ALI']], ['MINA', ['AHMADI']], ['MINA', ['A', 'ZEPHYRA']], ['MINH', ['HOANG']], ['MINH', ['HUYNH']], ['MINH', ['HA']], ['MINH', ['H', 'VANTREE']],
  ['MING', ['GAO']], ['MING', ['GUO']], ['MINO', ['OTA']], ['STAN', ['AN']], ['AMAL', ['AL', 'ZEPHYRA']], ['THAI', ['AI', 'VANTREE']],
  // controls: no rest part or initial
  ['MINA', ['ZEPHYRA']], ['MINH', ['NGUYEN']], ['STAN', ['ZEPHYRA']], ['AMAL', ['ZEPHYRA']],
];
const templates: ((name: string) => string)[] = [
  (n) => `Therapeutic exercise 97110, 4 units (53min) ${n} tolerated treatment well.`,
  (n) => `Total treatment time 45min ${n} was seen on 02/14/2026.`,
  (n) => `Patient seen for 45min. ${n} tolerated treatment well.`,
  (n) => `Session length 30min - ${n} attended.`,
  (n) => `Seen 3x/week for 30min ${n} progressed as expected.`,
  (n) => `On March 1st ${n} was seen.`,
  (n) => `Appointment at 9am ${n} arrived on time.`,
  (n) => `On the 4th ${n} called our office.`,
  (n) => `Visit 2nd ${n} denied (CO-50).`,
];
let total = 0, bad = 0;
const out: string[] = [];
for (const [first, rest] of people) {
  const names = [`${first} ${rest.join(' ')}`];
  for (const full of [`${cap(first)} ${rest.filter((r) => r.length > 1).map(cap).join(' ')}`, cap(first)]) {
    templates.forEach((tpl, k) => {
      const t = tpl(full);
      total += 1;
      const r = cmp(t, patient(names));
      if (r.b === 'REFUSED' && r.a !== 'REFUSED') { bad += 1; out.push(`[${names[0]}] t${k} ${JSON.stringify(t)} A: ${JSON.stringify(r.a)}`); }
    });
  }
}
fs.writeFileSync(process.argv[2]!, out.join('\n') + '\n');
console.log(`letters ${total} B-only refusals ${bad}`);
