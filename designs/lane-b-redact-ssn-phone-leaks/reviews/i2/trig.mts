// node trig.mts <tree> <part>: which numbers ask named() (timed after a noun, a rule of 46 underscores and two words), and letters as a payer writes them
import { pathToFileURL } from 'node:url';
import { PATHS, JANE, CLAIMS } from './lib.mts';
const [, , tree, part] = process.argv;
const R = await import(pathToFileURL(PATHS[tree as string] as string).href);
const run = (name: string, text: string) => { console.log(`start ${name}`); const t0 = performance.now(); const s = R.redactLetterForScreen(text, JANE, CLAIMS); const h = R.holdsIdentifier(s.text, JANE, CLAIMS); console.log(`done ${name}: ${(performance.now() - t0).toFixed(0)}ms ${h ? 'REFUSED' : s.text === text ? 'same' : 'changed'}`); };
run('warm-up', 'Claim 97110 2 150.00 on 01/15/2026');
const BOX = String.fromCharCode(0x2500);
if (part === 'numbers') {
  const NUMBERS: [string, string][] = [['11 digits with cents', '20260112345.01'], ['14 digits with cents', '12345678901234.01'], ['policy 2-5-2-4', '01-23456-78-9012'], ['account 4-3-4', '1234-567-8901'], ['claim 4-4-3-4', '2026-0115-123-4567'], ['id 3-2-5', '123-45-67890'], ['ref 3-3-5', '802-456-78901'], ['claim 6-2-4', '123456-01-2026'], ['11 digits', '20260112345'], ['phone', '202-555-0100'], ['toll-free', '1-800-555-0100'], ['date', '01/15/2026'], ['ISO date', '2026-01-15'], ['amount', '$1,250.00'], ['ZIP+4', '62701-1234'], ['TIN', '12-3456789'], ['NDC 5-4-2', '12345-6789-01'], ['9 digits', '000123456'], ['codes', '97110 97140 97530'], ['service row', '01/15/2026 97110 2 150.00 120.00 30.00'], ['id with letters', 'SYN1234567-01'], ['date range', '01/01/2026-01/31/2026'], ['amount with cents after 9 digits', '123456789.50'], ['check 10 digits and a date', '0001234567 01/15/2026']];
  for (const [name, x] of NUMBERS) run(`${name}: ${x}`, `IMPORTANT NOTICE\n${'_'.repeat(46)}\nPaid on ${x}`);
} else if (part === 'letters') {
  run('L1 sentence ending in "notice.", 52 underscores, a claim number', `Please keep this notice.\n${'_'.repeat(52)}\nClaim Number: 20260112345.01\nDate of service: 01/15/2026\nPaid: 150.00`);
  run('L2 sentence ending in "appeal.", 52 box-drawing lines, a policy number', `We have reviewed your appeal.\n${BOX.repeat(52)}\nPolicy 01-23456-78-9012`);
  run('L3 heading EXPLANATION OF PAYMENT, 52 underscores, an account number', `EXPLANATION OF PAYMENT\n${'_'.repeat(52)}\nPatient account 1234-567-8901`);
  run('L4 form line Member ID: and a blank of 52, then Group', `Member ID: ${'_'.repeat(52)}\nGroup 123456-01-2026`);
  run('L5 as L1 with 40 underscores', `Please keep this notice.\n${'_'.repeat(40)}\nClaim Number: 20260112345.01`);
} else {
  run('U60', `IMPORTANT NOTICE\n${'_'.repeat(60)}\nClaim Number: 20260112345.01`);
}
