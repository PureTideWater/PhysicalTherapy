// Is the calibration disturbed by the process's own state (5,000 identifiers read)? Fresh calibration, then after one check, then after dropping references.
import { calib, once, who } from '/home/user/review-time/lib.mts';
const syn40 = Array.from({ length: 5000 }, (_, i) => `SYN${String(556000 + i)}${'0918273645QWRTYPSDFGHJKLZXCVBNM'.slice(0, 31)}`);
const c0 = await calib(); const c0b = await calib();
const g = once('The claim was paid.', who(), [{ claimId: 'c1', patientPseudonym: 'p1', claimNumbers: syn40 }]);
const c1 = await calib(); const c1b = await calib();
console.log(`calibration fresh ${c0.toFixed(0)}/${c0b.toFixed(0)} ms; after one check with 5,000 claim numbers (cpu ${g.ms.toFixed(0)} ms, ${g.units} units) ${c1.toFixed(0)}/${c1b.toFixed(0)} ms`);
