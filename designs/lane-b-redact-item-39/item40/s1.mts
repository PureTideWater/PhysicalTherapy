// S-1, measured: the longest ordinary letter (prose, no identifier) with one U+00BD and one U+0085 that a tree still
// sends, by bisection on its length (a count, not a clock: the same on every machine), and the whole check's units and
// processor time at 100,000 characters. Usage: node s1.mts <dir holding redact.ts> [mix: both|half|nel|none]. Synthetic.
import { pathToFileURL } from 'node:url';
const [dir, mix = 'both'] = process.argv.slice(2) as [string, string];
const H = await import(pathToFileURL(`${dir}/redact.ts`).href);
const who = { pseudonym: 'p1', names: ['JANE Q ZEPHYRA'], memberIds: ['ZZ1234567'], datesOfBirth: ['1961-03-03'] } as any;
const claims = [{ claimId: 'c1', patientPseudonym: 'p1', claimNumbers: ['SYN555001'] }] as any;
const UNIT = 'The plan reviewed the visit and paid the allowed amount under the contract. ';
const letter = (n: number) => {
  let t = UNIT.repeat(Math.ceil(n / UNIT.length)).slice(0, n);
  if (mix === 'both' || mix === 'half') t = 'Paid ½ of the visit. ' + t.slice(23);
  if (mix === 'both' || mix === 'nel') { const at = Math.floor(t.length / 2); t = t.slice(0, at) + '\u0085' + t.slice(at + 1); }
  return t;
};
const cpu = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };
const run = (n: number) => {
  const t = letter(n); const a = cpu();
  const r = H.redactLetterForScreen(t, who, claims); const spent = H.checkWorkOf(r);
  const held = spent > H.CHECK_WORK_BUDGET || H.holdsIdentifier(r.text, who, claims, spent);
  return { held, spent, ms: cpu() - a };
};
run(2000);
let lo = 1000; let hi = 400_000;
if (!run(hi).held) { console.log(`${mix}: sent even at ${hi}`); } else {
  while (hi - lo > 100) { const mid = Math.floor((lo + hi) / 2); if (run(mid).held) hi = mid; else lo = mid; }
  console.log(`${mix}: longest sent about ${lo} characters (refused from ${hi})`);
}
const at = run(100_000); const again = run(100_000);
console.log(`${mix}: at 100,000 characters ${at.held ? 'REFUSED' : 'sent'}, redaction's count ${at.spent} of ${H.CHECK_WORK_BUDGET}, processor ${Math.min(at.ms, again.ms).toFixed(0)} ms`);
if (H.item40Stats) console.log(`${mix}: windows ${JSON.stringify(H.item40Stats)}`);
