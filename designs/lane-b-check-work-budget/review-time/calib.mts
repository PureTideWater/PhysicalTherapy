import { calibrationMs } from '/home/user/PhysicalTherapy/packages/model-gateway/src/test-support/time-budget.ts';
import { redactLetterForScreen } from '/home/user/PhysicalTherapy/packages/redact/src/redact.ts';
redactLetterForScreen('5\n'.repeat(20000), { pseudonym: 'p', names: ['JANE Q VANTREE'], memberIds: ['ZZ1234567'], datesOfBirth: ['1961-03-03'] } as any, [{ claimId: 'c', patientPseudonym: 'p', claimNumbers: ['SYN555001'] }] as any);
console.log('calibration ms', [1, 2, 3].map(() => calibrationMs().toFixed(0)).join(' '), 'reference 144');
