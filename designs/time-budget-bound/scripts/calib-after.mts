// Does the calibration read higher right after the reader's work than in a clean process? 30 clean runs, then 6 x (work, then 4 calibrations in a row).
import { holdsIdentifier, redactLetterForScreen } from '/home/user/PhysicalTherapy/packages/redact/src/index.ts';
import { calibrationMs } from '/home/user/PhysicalTherapy/packages/model-gateway/src/test-support/time-budget.ts';
const who = { pseudonym: 'p', names: ['JANE Q VANTREE'], datesOfBirth: ['1961-03-03'], memberIds: ['ZZ1234567'] };
const claims = [{ claimId: '00000000-0000-4000-8000-000000000001', patientPseudonym: 'p', claimNumbers: ['SYN555001'] }];
const text = '1 1 11 '.repeat(14285);
const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]!;
const clean = Array.from({ length: 30 }, () => calibrationMs());
const slots: number[][] = [[], [], [], []];
for (let i = 0; i < 6; i += 1) { holdsIdentifier(redactLetterForScreen(text, who, claims).text, who, claims); for (const s of slots) s.push(calibrationMs()); }
const again = Array.from({ length: 30 }, () => calibrationMs());
console.log(`${process.version} clean median ${med(clean).toFixed(1)} | after work: 1st ${med(slots[0]!).toFixed(1)} 2nd ${med(slots[1]!).toFixed(1)} 3rd ${med(slots[2]!).toFixed(1)} 4th ${med(slots[3]!).toFixed(1)} | 30 more at the end ${med(again).toFixed(1)} | heap ${(process.memoryUsage().heapUsed / 1e6).toFixed(0)} MB`);
