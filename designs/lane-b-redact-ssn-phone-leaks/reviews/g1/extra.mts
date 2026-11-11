// node extra.mts: what separates the recorded give-back (amounts after the list number) from G1-1 (plain groups after it), and last probes.
import { judge, digitsOnly } from './lib.mts';
const H = 'Service 01/01/2020-150.00 Paid\n';
for (const letter of ['Fax 2) 15.00 30.00', 'Fax 2) 15 00 30 00', 'Telephone call (2) 30.00 60.00', 'Telephone call (2) 3000 6000', 'SSN (2) 15.00 30.00', 'SSN (2) 1500 3000', 'SS#: 7) 2020/0123', 'Calls (3) 2500 7500', 'Phone (20) 2555 0123\nPhone (2) 202-555-0124', 'Tel (20) 2555-0123 / Fax (20) 2555-0124', H + 'SSN 900 12..3456150.00', H + 'SSN (900) 12..3456150.00', 'Member SSN (9) 00-12-3456, DOB on file', 'Patient phone: (20) 2555-0123 (mobile)']) {
  const j = judge(letter, ['900123456', '2025550123'].filter((n) => digitsOnly(letter).includes(n)));
  console.log(`  [${j.sev || '-'}${j.notes.length ? ' ' + j.notes.join(',') : ''}] ${j.line}`);
}
