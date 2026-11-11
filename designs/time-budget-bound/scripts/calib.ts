// 200 idle runs of the calibration workload: cpu ms and wall ms, min/median/max.
import { calibrationMs, REFERENCE_CALIBRATION_MS } from '/home/user/PhysicalTherapy/packages/model-gateway/src/test-support/time-budget.ts';
const n = Number(process.argv[2] ?? 200);
const cpu: number[] = []; const wall: number[] = [];
for (let i = 0; i < n; i += 1) { const w = performance.now(); cpu.push(calibrationMs()); wall.push(performance.now() - w); }
const q = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))]!;
const row = (name: string, a: number[]) => `${name} min ${q(a, 0).toFixed(1)} p10 ${q(a, 0.1).toFixed(1)} median ${q(a, 0.5).toFixed(1)} p90 ${q(a, 0.9).toFixed(1)} max ${q(a, 1).toFixed(1)}`;
console.log(process.version, `n=${n} ref=${REFERENCE_CALIBRATION_MS}`); console.log(row('cpu ', cpu)); console.log(row('wall', wall));
console.log(`factor at median ${(q(cpu, 0.5) / REFERENCE_CALIBRATION_MS).toFixed(3)}; share of runs over 40 ms ${(cpu.filter((x) => x > 40).length / n).toFixed(2)}`);
