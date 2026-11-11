// The calibrated budget under the machine's present load: the reader's time on crafted letters beside the calibration's.
const { timed, calibrationMs } = await import('/home/user/PhysicalTherapy/packages/model-gateway/src/test-support/time-budget.ts');
const { redactLetterForScreen, holdsIdentifier } = await import('/home/user/PhysicalTherapy/packages/redact/src/redact.ts');
const who = { pseudonym: 'synthetic-patient-1', names: ['JANE Q VANTREE'], datesOfBirth: ['1961-03-03'], memberIds: ['SYN123456'] };
const claims = [{ claimId: 'synthetic-claim-1', patientPseudonym: 'synthetic-patient-1', claimNumbers: ['SYN555001'] }];
const N = 100_000; const fill = (u: string) => u.repeat(Math.floor(N / u.length));
const rows: [string, string][] = [['dates with slashes', fill('1/1/11 ')], ['dates with spaces', fill('1 1 11 ')], ['digit and CRLF', fill('1\r\n')], ['digit and bare break', fill('5\n')], ['dates then split name', `${fill('1/1/11 ')}Vant ree`]];
for (let round = 0; round < Number(process.argv[2] ?? 2); round += 1) {
  for (const [label, text] of rows) {
    const run = timed(3_000, () => holdsIdentifier(redactLetterForScreen(text, who, claims).text, who, claims), 1);
    console.log(label.padEnd(24), `${run.ms.toFixed(0)} ms, calibration x${run.slowdown.toFixed(2)}, allowed ${run.allowedMs.toFixed(0)} ms, used ${(100 * run.ms / run.allowedMs).toFixed(0)}%`);
  }
}
console.log('calibration now', calibrationMs().toFixed(1));
