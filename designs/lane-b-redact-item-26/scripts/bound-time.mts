// The wider reading's work bound: processor time of the dearest letters still read and of those refused by the count (Node 24; scaled to the reference calibration of 144 ms).
import { WIDER_WORK_BOUND as B, holdsIdentifier, redactLetterForScreen } from '/home/user/PhysicalTherapy/packages/redact/src/index.ts';
import { calibrationMs } from '/home/user/PhysicalTherapy/packages/model-gateway/src/test-support/time-budget.ts';
const fillTo = (u: string, n: number) => u.repeat(Math.floor(n / u.length));
const claim = [{ claimId: '00000000-0000-4000-8000-000000000001', patientPseudonym: 'synthetic-patient-7', claimNumbers: ['SYN555001'] }];
const who = { pseudonym: 'synthetic-patient-7', names: ['JANE Q VANTREE'], datesOfBirth: ['1961-03-03'], memberIds: ['ZZ1234567'] };
const cpu = () => { const u = process.threadCpuUsage(); return (u.user + u.system) / 1000; };
const N = 100_000;
const ROWS: [string, string][] = [
  ['base: spaces 100k', fillTo('1 1 11 ', N)],
  ['read: spaces + CRLF 100k, no wider match', `${fillTo('1 1 11 ', N)}\r\n`],
  ['read: 5 CRLF repeated 100k, no wider match', fillTo('5\r\n', N)],
  ['read: slashes + apart, at the bound', `${fillTo('1/1/11 ', B - 8)}Vant ree`],
  ['read: spaces + apart, at the bound', `${fillTo('1 1 11 ', B - 8)}Vant ree`],
  ['read: spaces + CRLF + apart, at the bound', `${fillTo('1 1 11 ', B / 2 - 10)}\r\nVant ree`],
  ['read: 5 CRLF + apart, at the bound', `${'5\r\n'.repeat(Math.floor((B - 16) / 5))}Vant ree`],
  ['refused: spaces + CRLF + apart 100k', `${fillTo('1 1 11 ', N)}\r\nVant ree`],
  ['refused: 5 CRLF + apart 100k', `${fillTo('5\r\n', N)}Vant ree`],
  ['refused: slashes + apart 100k', `${fillTo('1/1/11 ', N)}Vant ree`],
];
for (const [name, text] of ROWS) {
  const ms: number[] = []; let out = false;
  for (let i = 0; i < 6; i += 1) { const s = cpu(); const r = redactLetterForScreen(text, who, claim); out = holdsIdentifier(r.text, who, claim); ms.push(cpu() - s); }
  const cal = calibrationMs(); const rest = ms.slice(1);
  console.log(`${process.version} ${name} (${text.length} chars): refused ${out} | ms ${ms.map((x) => x.toFixed(0)).join(' ')} | calibration ${cal.toFixed(0)} | at reference: best ${(Math.min(...rest) * 144 / cal).toFixed(0)}, worst ${(Math.max(...ms) * 144 / cal).toFixed(0)} ms`);
}
