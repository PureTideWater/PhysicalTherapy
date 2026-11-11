// ref.mts [cycles]: the calibration's fastest-of-five, clean and after the reader has run, in one process.
import { redactLetterForScreen, holdsIdentifier } from '/home/user/PhysicalTherapy/packages/redact/src/index.ts';
import { calibrationMs, calibrationWork } from '/home/user/PhysicalTherapy/packages/model-gateway/src/test-support/time-budget.ts';
const N = 100_000; const fill = (u: string) => u.repeat(Math.floor(N / u.length));
const claim = [{ claimId: '00000000-0000-4000-8000-000000000001', patientPseudonym: 'synthetic-patient-7', claimNumbers: ['SYN555001'] }];
const who = { pseudonym: 'synthetic-patient-7', names: ['JANE Q VANTREE'], datesOfBirth: ['1961-03-03'], memberIds: ['ZZ1234567'] };
const texts = [fill('1 1 11 '), fill('1/1/11 '), fill('5\n')];
calibrationWork(30); calibrationWork(30);
const clean: number[] = []; for (let i = 0; i < 6; i += 1) clean.push(calibrationMs());
const after: number[] = [];
for (let c = 0; c < Number(process.argv[2] ?? 6); c += 1) { const t = texts[c % 3]!; holdsIdentifier(redactLetterForScreen(t, who, claim).text, who, claim); after.push(calibrationMs()); }
const f = (a: number[]) => a.map((x) => x.toFixed(0)).join(' ');
console.log(`${process.version} clean ${f(clean)} | after reader ${f(after)}`);
