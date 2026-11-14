// The new timing tests' quantities, measured as the tests measure them (thread processor time), REPS times.
// node tests.mts [reps]. REPO picks the tree. Prints one JSON line. Synthetic data only.
import { H, once, who, one, calibrationMs, REFERENCE_CALIBRATION_MS, tag } from './h.mts';
const reps = Number(process.argv[2] ?? 5);
const nine = (count: number) => Array.from({ length: count }, (_, i) => `SYN${String(556000 + i)}`);
const thread = () => { const u = process.threadCpuUsage(); return (u.user + u.system) / 1000; };
const LETTER = 'The claim was paid.';
const half = one(nine(3150));
const whole = one(nine(6300));
function fastest(runs: number, work: () => unknown): number {
  let best = Infinity;
  for (let r = 0; r < runs; r += 1) { const a = thread(); work(); best = Math.min(best, thread() - a); }
  return best;
}
const a0 = thread();
const first = once(LETTER, who, half).out;
const warmup = thread() - a0;
const rows: { g1: number; halfMs: number; wholeMs: number; ratio: number }[] = [];
for (let i = 0; i < reps; i += 1) {
  const a = thread();
  once(LETTER, who, whole);
  const g1 = thread() - a;
  if (g1 > 15000) { rows.push({ g1: Math.round(g1), halfMs: Math.round(fastest(1, () => once(LETTER, who, half))), wholeMs: Math.round(g1), ratio: 0 }); break; }
  const halfMs = fastest(3, () => once(LETTER, who, half));
  const wholeMs = fastest(3, () => once(LETTER, who, whole));
  rows.push({ g1: Math.round(g1), halfMs: Math.round(halfMs), wholeMs: Math.round(wholeMs), ratio: Number((wholeMs / halfMs).toFixed(3)) });

}
console.log(JSON.stringify({ tree: tag, first, warmup: Math.round(warmup), calibration: Math.round(calibrationMs()), reference: REFERENCE_CALIBRATION_MS, rows }));
void H;
