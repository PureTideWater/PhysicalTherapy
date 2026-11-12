// The dearest letters still read and CT-1's rows on the merged reader: thread processor time at the reference calibration (144 ms), the least and most of N runs after a warm-up.
import { calibrationMs } from '/home/user/PhysicalTherapy/packages/model-gateway/src/test-support/time-budget.ts';
const H = await import(process.argv[2] ?? '/home/user/PhysicalTherapy/packages/redact/src/redact.ts');
const RUNS = Number(process.argv[3] ?? 3);
const F = (u: string, n: number) => u.repeat(Math.floor(n / u.length));
const claim = [{ claimId: '00000000-0000-4000-8000-000000000001', patientPseudonym: 'synthetic-patient-7', claimNumbers: ['SYN555001'] }];
const who = { pseudonym: 'synthetic-patient-7', names: ['JANE Q VANTREE'], datesOfBirth: ['1961-03-03'], memberIds: ['ZZ1234567'] };
const cpu = () => { const u = process.threadCpuUsage(); return (u.user + u.system) / 1000; };
const N = 100000; const FILL = 'paid in full. ';
const ROWS: [string, string][] = [
  ['CT-1 K1 5LF + apart 100k', F('5\n', 99990) + ' Vant ree'], ['CT-1 K2 5LF + CRLF 100k', F('5\n', 99998) + '\r\n'],
  ['CT-1 L9 arabic5 LS + apart', F('٥ ', 99990) + ' Vant ree'], ['CT-1 L10 arabic5 NEL + CRLF', F('٥\u0085', 99998) + '\r\n'], ['CT-1 L12 arabic5 LS 50k + CRLF + apart', F('٥ ', 49975) + '\r\nVant ree'],
  ['5LF + apart 30k', F('5\n', 29991) + ' Vant ree'], ['5LF + apart 36k', F('5\n', 35991) + ' Vant ree'], ['5LF + CRLF 30k', F('5\n', 29998) + '\r\n'], ['5LF + CRLF 38k', F('5\n', 37998) + '\r\n'],
  ['5CRLF + apart 30k', F('5\r\n', 29992) + 'Vant ree'], ['dates + CRLF + apart 25k', F('1 1 11 ', 24990) + '\r\nVant ree'], ['dates + CRLF + apart 35k', F('1 1 11 ', 34990) + '\r\nVant ree'],
  ['dates + CRLF 50k', F('1 1 11 ', 50000) + '\r\n'], ['dates + CRLF 70k', F('1 1 11 ', 70000) + '\r\n'], ['slash dates + apart 50k', F('1/1/11 ', 49992) + 'Vant ree'], ['apart + initials 50k', 'Vant ree' + ' J'.repeat(24996)],
  ['name letter by letter 100k', F('V a n t r e e ', N)], ['gap + initials 100k (base row)', `Vantree${' '.repeat(2000)}x${' J'.repeat(49000)}`], ['5LF 50k (base row)', F('5\n', 50000)], ['U+33FE; 93k (base dearest)', F('㏾;', 93006)],
  ['prose + apart 150k', F(FILL, 149986) + ' Dear Vant ree,'], ['prose lines CRLF 150k', F(FILL + '\r\n', 150000)], ['dates spaces 100k (base row)', F('1 1 11 ', N)],
];
for (const [name, text] of ROWS) {
  const ms: number[] = []; let out = false; let mark = false;
  for (let i = 0; i <= RUNS; i += 1) { const s = cpu(); const r = H.redactLetterForScreen(text, who, claim); mark = r.text === '\u0001'; out = H.holdsIdentifier(r.text, who, claim, H.checkWorkOf(r)); if (i > 0) ms.push((cpu() - s) * 144 / calibrationMs()); }
  console.log(`${name} | ${text.length} | ${out ? (mark ? 'refused in the redaction' : 'refused in the check') : 'sent'} | ${Math.min(...ms).toFixed(0)} to ${Math.max(...ms).toFixed(0)} ms`);
}
