// Review C-TIME's blocking rows, run again: thread processor time, three runs, at the reference calibration (144 ms), on the head and on the merged base.
import { calibrationMs } from '/home/user/PhysicalTherapy/packages/model-gateway/src/test-support/time-budget.ts';
const head = await import('/home/user/PhysicalTherapy/packages/redact/src/redact.ts'); const base = await import('/home/user/rev/base/redact.ts');
const F = (u: string, n: number) => u.repeat(Math.floor(n / u.length));
const claim = [{ claimId: '00000000-0000-4000-8000-000000000001', patientPseudonym: 'synthetic-patient-7', claimNumbers: ['SYN555001'] }];
const who = { pseudonym: 'synthetic-patient-7', names: ['JANE Q VANTREE'], datesOfBirth: ['1961-03-03'], memberIds: ['ZZ1234567'] };
const cpu = () => { const u = process.threadCpuUsage(); return (u.user + u.system) / 1000; };
const U = process.argv[2] === 'nel' ? '\u0085' : process.argv[2] === 'ls' ? ' ' : '\n';
const ROWS: [string, string][] = [
  ['K1 5LF + apart (wider, no CR LF)', F('5\n', 99990) + ' Vant ree'],
  ['K2 5LF + CRLF (no wider)', F('5\n', 99998) + '\r\n'],
  ['L5 5<U> + apart', F(`5${U}`, 99990) + ' Vant ree'],
  ['L6 5<U> + CRLF', F(`5${U}`, 99998) + '\r\n'],
  ['L9 arabic5<U> + apart', F(`٥${U}`, 99990) + ' Vant ree'],
  ['L10 arabic5<U> + CRLF', F(`٥${U}`, 99998) + '\r\n'],
  ['L11 arabic5<U> alone', F(`٥${U}`, 100000)],
  ['L12 arabic5<U> 50k + CRLF + apart', F(`٥${U}`, 49975) + '\r\nVant ree'],
  ['X1 initials + look-alike', 'Vantree' + ' J'.repeat(49990) + ' х'],
];
for (const [name, text] of ROWS) for (const [tree, R] of [['head', head], ['base', base]] as const) {
  const ms: number[] = []; let out = false;
  for (let i = 0; i < 3; i += 1) { const s = cpu(); out = R.holdsIdentifier(R.redactLetterForScreen(text, who, claim).text, who, claim); ms.push(cpu() - s); }
  const cal = calibrationMs();
  console.log(`${name} [${tree}] ${text.length} chars: ${out ? 'refused' : 'sent'} | at reference ${ms.map((x) => (x * 144 / cal).toFixed(0)).join(' ')} ms (calibration ${cal.toFixed(0)})`);
}
