// W28, after WORK.comparison went from 1 to 4: the dearest letters still read, each family sized to just under the budget,
// processor time, the least of three after a warm-up, scaled to the reference by the calibration read beside it.
// Run: PATH=/opt/node24/bin:$PATH NODE_OPTIONS="--import /home/user/work/ts-resolve.mjs" node dearest-w28.mts [reader dir]
import { calibrationMs } from '/home/user/PhysicalTherapy/packages/model-gateway/src/test-support/time-budget.ts';
const dir = process.argv[2] ?? '/home/user/PhysicalTherapy/packages/redact/src';
const { redactLetterForScreen, holdsIdentifier, checkWorkOf, CHECK_WORK_BUDGET: B } = await import(dir + '/redact.ts');
const who = { pseudonym: 'p1', names: ['JANE Q VANTREE'], memberIds: ['ZZ1234567'], datesOfBirth: ['1961-03-03'] } as any;
const claims = [{ claimId: 'c1', patientPseudonym: 'p1', claimNumbers: ['SYN555001'] }] as any;
const cpu = () => { const u = process.threadCpuUsage(); return (u.user + u.system) / 1000; };
const run = (text: string) => { const a = cpu(); const r = redactLetterForScreen(text, who, claims); const spent = checkWorkOf(r); const held = holdsIdentifier(r.text, who, claims, spent); return { ms: cpu() - a, pastInRedaction: spent > B, held, spent }; };
// A letter is "read" when the redaction ran to its end and the check did not refuse it for the budget; these families hold no identifier
// left after redaction, so held === true means past the budget.
const sized = (unit: string, n: number) => unit.repeat(Math.ceil(n / unit.length)).slice(0, n);
const families: [string, (n: number) => string][] = [
  ['U+33FE and ";" repeated', (n) => sized('㏾;', n)],
  ['a name, then "a;" repeated', (n) => 'Vantree ' + sized('a;', n)],
  ['ordinary prose', (n) => sized('The claim was reviewed under the plan and the allowed amount was paid in full. ', n)],
  ['CT-2: initials beside a name and a look-alike', (n) => 'Vantree' + sized(' J', n) + ' х'],
  ['CT-2 with the name written once with a joiner', (n) => 'Van∙tree Vantree' + sized(' J', n) + ' х'],
  ['initials beside a name', (n) => 'Vantree' + sized(' J', n)],
  ['a digit and a bare line break', (n) => sized('5\n', n)],
];
run(sized('5\n', 40000)); run('Vantree' + ' J'.repeat(5000) + ' х');
const cal = Math.min(...[1, 2, 3].map(() => calibrationMs()));
console.log(`calibration ${cal.toFixed(0)} ms (reference 144); budget ${String(B)}`);
for (const [name, make] of families) {
  let lo = 1000, hi = 700_000;
  while (hi - lo > Math.max(50, lo / 500)) { const mid = (lo + hi) >> 1; const r = run(make(mid)); if (!r.pastInRedaction && !r.held) lo = mid; else hi = mid; }
  const text = make(lo); const runs = [1, 2, 3].map(() => run(text)); const ms = Math.min(...runs.map((r) => r.ms));
  const over = run(make(hi)); const refusedMs = Math.min(over.ms, run(make(hi)).ms);
  console.log(`${name}: read to ${String(text.length)} characters, ${(ms / 1000).toFixed(2)} s here, ${((ms * 144) / cal / 1000).toFixed(2)} s at the reference; refused at ${String(make(hi).length)} in ${((refusedMs * 144) / cal / 1000).toFixed(2)} s at the reference (${over.pastInRedaction ? 'in the redaction' : 'in the check'})`);
}
console.log(`calibration after ${Math.min(...[1, 2, 3].map(() => calibrationMs())).toFixed(0)} ms`);
