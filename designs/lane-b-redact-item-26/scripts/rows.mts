// CT-1's rows and the item's test rows: thread processor time at the reference calibration, on the head and the base, the count handed on.
import { calibrationMs } from '/home/user/PhysicalTherapy/packages/model-gateway/src/test-support/time-budget.ts';
const head = await import('/home/user/PhysicalTherapy/packages/redact/src/redact.ts'); const base = await import('/home/user/rev/base/redact.ts');
const F = (u: string, n: number) => u.repeat(Math.floor(n / u.length));
const claim = [{ claimId: '00000000-0000-4000-8000-000000000001', patientPseudonym: 'synthetic-patient-7', claimNumbers: ['SYN555001'] }];
const who = { pseudonym: 'synthetic-patient-7', names: ['JANE Q VANTREE'], datesOfBirth: ['1961-03-03'], memberIds: ['ZZ1234567'] };
const cpu = () => { const u = process.threadCpuUsage(); return (u.user + u.system) / 1000; };
const U = process.argv[2] === 'nel' ? '\u0085' : process.argv[2] === 'ls' ? ' ' : '\n';
const RUNS = Number(process.argv[3] ?? 3);
const N = 100000;
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
  ['T1 slashes dates + apart 100k', F('1/1/11 ', N - 8) + 'Vant ree'],
  ['T2 spaces dates + full stop apart 100k', F('1 1 11 ', N - 9) + 'Vant. ree'],
  ['T3 name letter by letter', F('V a n t r e e ', N)],
  ['T4 apart + initials', 'Vant ree' + ' J'.repeat((N - 8) / 2)],
  ['T5 all but last letter spaced', F('V a n t r e ', N)],
  ['T6 spaces dates + CRLF', F('1 1 11 ', N) + '\r\n'],
  ['T7 5CRLF 100k', F('5\r\n', N)],
  ['T8 spaces dates 50k + CRLF + apart', F('1 1 11 ', N / 2 - 10) + '\r\nVant ree'],
  ['T9 5CRLF x (N-16)/5 + apart', '5\r\n'.repeat(Math.floor((N - 16) / 5)) + 'Vant ree'],
  ['T10 slashes dates + apart full', F('1/1/11 ', N) + 'Vant ree'],
  ['T11 spaces dates + CRLF + apart full', F('1 1 11 ', N) + '\r\nVant ree'],
  ['T12 5CRLF full + apart', F('5\r\n', N) + 'Vant ree'],
  ...[20000, 25000, 30000, 33000, 36000, 40000, 45000, 50000].flatMap((n): [string, string][] => [
    [`S 5LF ${n} + apart`, F(`5${U}`, n - 10) + ' Vant ree'],
    [`S 5LF ${n} + CRLF`, F(`5${U}`, n - 2) + '\r\n'],
    [`S 5CRLF ${n}`, F('5\r\n', n)],
    [`S 5CRLF ${n} + apart`, F('5\r\n', n - 10) + ' Vant ree'],
    [`S 5LF ${n} alone`, F(`5${U}`, n)],
  ]),
];
const only = process.argv[4];
for (const [name, text] of ROWS) { if (only && !name.startsWith(only)) continue; for (const [tree, R] of [['head', head], ['base', base]] as const) {
  const ms: number[] = []; let out = false; let spent = 0; let mark = false;
  for (let i = 0; i < RUNS; i += 1) { const s = cpu(); const r = R.redactLetterForScreen(text, who, claim); spent = R.checkWorkOf(r); mark = r.text === '\u0001'; out = R.holdsIdentifier(r.text, who, claim, spent); ms.push(cpu() - s); }
  const cal = calibrationMs();
  console.log(`${name} [${tree}] ${text.length} chars: ${out ? (mark ? 'refused in redaction' : 'refused') : 'sent'} | redaction ${(spent / 1e6).toFixed(0)}M | at reference ${ms.map((x) => (x * 144 / cal).toFixed(0)).join(' ')} ms (calibration ${cal.toFixed(0)})`);
} }
