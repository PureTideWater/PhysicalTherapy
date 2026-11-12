// The refusal path and the counter's arithmetic, on the module AS SHIPPED (no scratch copy).
import fs from 'node:fs';
import { CHECK_WORK_BUDGET, checkWorkOf, holdsIdentifier, redactLetterForScreen } from '/home/user/PhysicalTherapy/packages/redact/src/redact.ts';
import { calibrationMs } from '/home/user/PhysicalTherapy/packages/model-gateway/src/test-support/time-budget.ts';
const out = '/home/user/review-time/out/refuse.txt';
fs.writeFileSync(out, `node ${process.version} budget ${CHECK_WORK_BUDGET}\n`);
const log = (s: string) => { console.log(s); fs.appendFileSync(out, s + '\n'); };
const P = { pseudonym: 'p1', names: ['JANE Q ZEPHYRA'], memberIds: ['ZZ1234567'], datesOfBirth: ['1961-03-03'] } as any;
const C = [{ claimId: 'c1', patientPseudonym: 'p1', claimNumbers: ['SYN555001'] }] as any;
const cpu = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };
const min3 = (f: () => unknown) => { let best = Infinity; let v: unknown; for (let i = 0; i < 4; i++) { const a = cpu(); v = f(); const d = cpu() - a; if (i > 0) best = Math.min(best, d); } return { ms: best, v }; };
redactLetterForScreen('Zephyra J 5\n'.repeat(3000), P, C);
const cal = calibrationMs();
log(`calibration ${cal.toFixed(0)} ms (reference 144)`);
const ref = (ms: number) => ((144 / cal) * ms).toFixed(2);
const big: [string, string][] = [['5M a', 'a'.repeat(5_000_000)], ['5M digit LF', '5\n'.repeat(2_500_000)], ['5M U+FDFA', 'ﷺ'.repeat(5_000_000)], ['5M initials', 'Zephyra' + ' J'.repeat(2_500_000)], ['5M zwsp', '​'.repeat(5_000_000)], ['50M a', 'a'.repeat(50_000_000)], ['1.3M a (just past the entry charge)', 'a'.repeat(1_300_000)], ['1.19M a (entry charge under the budget)', 'a'.repeat(1_190_000)]];
for (const [name, text] of big) {
  const r = min3(() => { const x = redactLetterForScreen(text, P, C); return `${JSON.stringify(x.text.slice(0, 3))} spent ${checkWorkOf(x)}`; });
  log(`redactLetterForScreen ${name.padEnd(40)} cpu ${r.ms.toFixed(2)} ms  ref ${ref(r.ms)} ms  -> ${String(r.v)}`);
  const h = min3(() => holdsIdentifier(text, P, C, 0));
  log(`holdsIdentifier(spent 0) ${name.padEnd(37)} cpu ${h.ms.toFixed(2)} ms  ref ${ref(h.ms)} ms  -> ${String(h.v)}`);
  const h2 = min3(() => holdsIdentifier(text, P, C, CHECK_WORK_BUDGET));
  log(`holdsIdentifier(spent B) ${name.padEnd(37)} cpu ${h2.ms.toFixed(2)} ms  ref ${ref(h2.ms)} ms  -> ${String(h2.v)}`);
}
// The latest refusals: families just past the budget (1.02x to 1.5x the fitted length of special/fuzz), whole check.
const late: [string, string][] = [['digit LF 100k', '5\n'.repeat(50_000)], ['ct2 100k', 'Zephyra' + ' J'.repeat(49_990) + ' х'], ['a-space 230k', 'a '.repeat(115_000)], ['a-space 600k', 'a '.repeat(300_000)], ['cyrillic word 210k', 'хорошо '.repeat(30_000)], ['prose 260k', 'Claim 2026-11-01 was paid $150.00 for 97110, 2 units; member was seen on 11/01/2026 by Dr. Other.\n'.repeat(2_600)]];
for (const [name, text] of late) {
  const r = min3(() => { const x = redactLetterForScreen(text, P, C); const w = checkWorkOf(x); const held = holdsIdentifier(x.text, P, C, w); return `redaction spent ${w}${w > CHECK_WORK_BUDGET ? ' (past)' : ''}, refused ${String(held)}`; });
  log(`whole check, refused late: ${name.padEnd(22)} ${text.length} ch  cpu ${r.ms.toFixed(0)} ms  ref ${ref(r.ms)} ms  -> ${String(r.v)}`);
}
// The counter's arithmetic.
const small = 'Dear Jane, claim 12 was paid.';
for (const spent of [0, -0, 0.5, CHECK_WORK_BUDGET - 350 * small.length, CHECK_WORK_BUDGET - 350 * small.length + 1, CHECK_WORK_BUDGET, CHECK_WORK_BUDGET + 1, -1, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER, Number.MIN_VALUE, '5' as any, '0' as any, 0n as any, null as any, undefined, true as any, [] as any, {} as any]) {
  let said: string;
  try { said = String(holdsIdentifier(small, P, C, spent)); } catch (e) { said = `THROWS ${(e as Error).constructor.name}: ${(e as Error).message}`; }
  log(`holdsIdentifier(clean ${small.length}-char text, spent = ${typeof spent === 'bigint' ? '0n' : typeof spent === 'string' ? `'${spent}'` : JSON.stringify(spent) ?? String(spent)} [${String(spent)}]) -> ${said}`);
}
log(`after those calls a clean letter still reads: holds ${String(holdsIdentifier(small, P, C, 0))}, redaction spent ${checkWorkOf(redactLetterForScreen(small, P, C))}`);
log(`largest entry charge: 350 x (2^29 - 24) = ${350 * (2 ** 29 - 24)}; + budget = ${350 * (2 ** 29 - 24) + CHECK_WORK_BUDGET}; safe integer ${Number.MAX_SAFE_INTEGER}; exact ${String(Number.isSafeInteger(350 * (2 ** 29 - 24) + CHECK_WORK_BUDGET))}`);
log(`checkWorkOf of an object the redaction did not return: ${checkWorkOf({ text: 'x', claims: new Map(), replaced: 0 } as any)} ; of a spread copy of a refused result: ${(() => { const x = redactLetterForScreen('5\n'.repeat(50_000), P, C); return `${checkWorkOf(x)} -> copy ${checkWorkOf({ ...x } as any)}`; })()}`);
log('done');
