// b5.mts: item 26's two dearest letters, processor time per run, with the calibration beside them (run with the repo's tsx).
import { holdsIdentifier, holdsNameOrNumber, redactLetterForScreen } from '/home/user/PhysicalTherapy/packages/redact/src/index.ts';
import { calibrationMs } from '/home/user/PhysicalTherapy/packages/model-gateway/src/test-support/time-budget.ts';
const N = 100_000; const fill = (u: string) => u.repeat(Math.floor(N / u.length));
const claim = [{ claimId: '00000000-0000-4000-8000-000000000001', patientPseudonym: 'synthetic-patient-7', claimNumbers: ['SYN555001'] }];
const who = { pseudonym: 'synthetic-patient-7', names: ['JANE Q VANTREE'], datesOfBirth: ['1961-03-03'], memberIds: ['ZZ1234567'] };
const cpu = () => { const u = process.threadCpuUsage(); return (u.user + u.system) / 1000; };
const ROWS: [string, string][] = [['spaces+CRLF+apart', `${fill('1 1 11 ')}\r\nVant ree`], ['digit CRLF+apart', `${fill('5\r\n')}Vant ree`], ['spaces alone (base row)', fill('1 1 11 ')]];
for (const [name, text] of ROWS) {
  const ms: number[] = [];
  for (let i = 0; i < 5; i += 1) { const s = cpu(); const r = redactLetterForScreen(text, who, claim); holdsIdentifier(r.text, who, claim); holdsNameOrNumber(r.text, { names: who.names, numbers: [...who.memberIds, 'SYN555001'] }); ms.push(cpu() - s); }
  console.log(`${process.version} ${name}: ${ms.map((x) => x.toFixed(0)).join(' ')} | calibration ${calibrationMs().toFixed(0)}`);
}
