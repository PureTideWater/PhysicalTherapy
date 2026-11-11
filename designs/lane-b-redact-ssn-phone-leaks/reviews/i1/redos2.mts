// node redos2.mts <n> <blank|table|numbers>: where the time goes on a letter with a rule or blank of n characters after a
// noun. RegExp.prototype.exec is wrapped to add up the time spent in NAMED_BEFORE (its source holds "REDETERMINATION").
import { load, patient, claims } from './lib.mts';
const n = Number(process.argv[2] ?? 52);
const which = process.argv[3] ?? 'blank';
const origExec = RegExp.prototype.exec;
let spent = 0, calls = 0;
RegExp.prototype.exec = function (this: RegExp, s: string) {
  if (this.source.includes('REDETERMINATION')) { const t = performance.now(); const r = origExec.call(this, s); spent += performance.now() - t; calls += 1; return r; }
  return origExec.call(this, s);
} as any;
const H = await load(process.argv[4] ?? 'head');
const run = (text: string) => {
  spent = 0; calls = 0;
  let t = performance.now();
  const s = H.redactLetterForScreen(text, patient, claims);
  const t1 = performance.now() - t;
  t = performance.now();
  const refused = H.holdsIdentifier(s.text, patient, claims);
  const t2 = performance.now() - t;
  return `redactLetterForScreen ${t1.toFixed(0)} ms, holdsIdentifier ${t2.toFixed(0)} ms (${refused ? 'REFUSED' : 'sent'}); in NAMED_BEFORE.exec ${spent.toFixed(0)} ms over ${calls} calls`;
};
if (which === 'numbers') {
  for (const num of ['12345-67-89012', '2026-0115-123-4567', '20260112345.01', '0450-123-45678', '900-12-34567', '12345678901.50', '20260112345601/15/2026', '(202) 555-01234', '202-555-0123', '1-800-555-0199', '$150.00', '01/15/2026', '62701-1234', '123456789012', '97110 97140', '150.00 120.00 30.00', '2026-01-15', 'A1234-567-8901']) {
    console.log(`${JSON.stringify(num).padEnd(28)} ${run(`Claim Number: ${'_'.repeat(n)} Date ${num}`)}`);
  }
} else {
  const text = which === 'blank' ? `Member ID: ${'_'.repeat(n)}\nPlease complete and return. Reference 2026-0115-123-4567` : `Date        Description        Payment\n${'─'.repeat(n)}\nLine 1: 20260112345.01  150.00`;
  console.log(JSON.stringify(text));
  console.log(`${which} n=${n}: ${run(text)}`);
}
