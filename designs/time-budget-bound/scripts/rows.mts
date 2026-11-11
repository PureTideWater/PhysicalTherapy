// rows.mts cold <i> | timed <reps> | regress | grain   (run with the repo's tsx; imports the helper and the reader by absolute path)
import { holdsIdentifier, holdsNameOrNumber, redactLetterForScreen } from '/home/user/PhysicalTherapy/packages/redact/src/index.ts';
const N = 100_000;
const fill = (unit: string) => unit.repeat(Math.floor(N / unit.length));
const claim = (...claimNumbers: string[]) => [{ claimId: '00000000-0000-4000-8000-000000000001', patientPseudonym: 'synthetic-patient-7', claimNumbers }];
const who = { pseudonym: 'synthetic-patient-7', names: ['JANE Q VANTREE'], datesOfBirth: ['1961-03-03'], memberIds: ['ZZ1234567'] };
const ROWS: [string, string][] = [['spaces 1 1 11', fill('1 1 11 ')], ['slashes 1/1/11', fill('1/1/11 ')], ['digit+LF', fill('5\n')]];
const work = (text: string) => () => {
  const redacted = redactLetterForScreen(text, who, claim('SYN555001'));
  return { held: holdsIdentifier(redacted.text, who, claim('SYN555001')), mentioned: holdsNameOrNumber(redacted.text, { names: who.names, numbers: [...who.memberIds, 'SYN555001'] }) };
};
const cpu = () => { const u = process.threadCpuUsage(); return (u.user + u.system) / 1000; };
const spin = (ms: number) => { const s = cpu(); let x = 0; while (cpu() - s < ms) { for (let i = 0; i < 1e5; i += 1) x += i; } return x; };
const stat = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return `min ${s[0]!.toFixed(2)} med ${s[Math.floor(s.length / 2)]!.toFixed(2)} max ${s[s.length - 1]!.toFixed(2)}`; };
const mode = process.argv[2];
if (mode === 'cold') {
  const [name, text] = ROWS[Number(process.argv[3])]!; const out: string[] = [];
  for (let run = 1; run <= 4; run += 1) { const c = cpu(); const w = performance.now(); const v = work(text)(); out.push(`run${run} cpu ${(cpu() - c).toFixed(0)} wall ${(performance.now() - w).toFixed(0)} ${v.held || v.mentioned ? 'BAD' : ''}`); }
  console.log(`cold ${name}: ${out.join(' | ')}`);
} else {
  const { calibrationMs, timed } = await import('/home/user/PhysicalTherapy/packages/model-gateway/src/test-support/time-budget.ts');
  if (mode === 'timed') {
    const reps = Number(process.argv[3] ?? 10);
    for (const [name, text] of ROWS) {
      const before: number[] = []; const after: number[] = []; const ms: number[] = []; const wall: number[] = []; const factor: number[] = []; const ratio: number[] = [];
      for (let i = 0; i < reps; i += 1) { const b = calibrationMs(); const c = cpu(); const w = performance.now(); work(text)(); const m = cpu() - c; wall.push(performance.now() - w); const a = calibrationMs(); const f = Math.max(1, Math.min(b, a) / 40); before.push(b); after.push(a); ms.push(m); factor.push(f); ratio.push(m / (3000 * f)); }
      console.log(`${name}: work cpu ms ${stat(ms)} | wall ms ${stat(wall)} | calib before ${stat(before)} | after ${stat(after)} | factor ${stat(factor)} | ms/allowed ${stat(ratio)} | ms/3000 max ${(Math.max(...ms) / 3000).toFixed(2)}`);
    }
  } else if (mode === 'regress') {
    const say = (label: string, r: { ms: number; allowedMs: number; slowdown: number }) => console.log(`${label}: ms ${r.ms.toFixed(0)} allowed ${r.allowedMs.toFixed(0)} factor ${r.slowdown.toFixed(2)} => ${r.ms < r.allowedMs ? 'PASS' : 'FAIL'}`);
    const [, text] = ROWS[0]!;
    say('healthy row', timed(3000, work(text)));
    for (const extra of [1000, 1500, 2000, 2500, 4000]) say(`row + ${extra} ms of added cpu`, timed(3000, () => { spin(extra); return work(text)(); }));
    say('row that sleeps 5 s (Atomics.wait) and computes nothing', timed(3000, () => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000); return 1; }));
    say('garbage-heavy work (300 MB of short strings) then calibration', timed(3000, () => { let n = 0; for (let k = 0; k < 30; k += 1) { const a: string[] = []; for (let i = 0; i < 2e5; i += 1) a.push(`x${i}y${k}`.repeat(5)); n += a.length; } return n; }));
    say('1 s row with 1500 ms of cpu', timed(1000, () => spin(1500)));
  } else if (mode === 'grain') {
    const deltas: number[] = []; let last = cpu();
    while (deltas.length < 2000) { const now = cpu(); if (now !== last) { deltas.push(now - last); last = now; } }
    console.log(`threadCpuUsage step, ms: ${stat(deltas)}`);
    for (const length of [48, 110, 5000]) { const letter = `IMPORTANT NOTICE\n${'_'.repeat(length)}\nClaim Number: 20260112345.01`; const r = timed(1000, () => holdsIdentifier(redactLetterForScreen(letter, who, claim('SYN555001')).text, who, claim('SYN555001'))); console.log(`rule of ${length}: ms ${r.ms.toFixed(3)} allowed ${r.allowedMs.toFixed(0)}`); }
    const w = performance.now(); for (let i = 0; i < 20; i += 1) timed(1000, () => 1); console.log(`overhead of one timed() call: ${((performance.now() - w) / 20).toFixed(0)} ms wall`);
  }
}
