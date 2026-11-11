const { calibrationMs } = await import('/home/user/PhysicalTherapy/packages/model-gateway/src/test-support/time-budget.ts');
const runs = Array.from({ length: Number(process.argv[2] ?? 200) }, () => calibrationMs()).sort((a, b) => a - b);
const at = (q: number) => runs[Math.floor(q * (runs.length - 1))]!.toFixed(1);
console.log(`calibration ms: min ${at(0)} p10 ${at(0.1)} median ${at(0.5)} p90 ${at(0.9)} max ${at(1)}`);
