// Regular-expression run counts of the "one reading" row (redact.test.ts), for a given redact.ts.
const mod = await import(process.argv[2]!);
const { redactLetter, holdsIdentifier } = mod;
const patient = { pseudonym: 'synthetic-patient-15', names: ['PHONE SSN VANTREE'], datesOfBirth: [], memberIds: ['ZZ1234567'] };
const claims = [{ claimId: 'synthetic-claim-1', patientPseudonym: 'synthetic-patient-15', claimNumbers: ['SYNCLAIM0001'] }];
const plain = 'Call 202-555-0123 or SSN 900-12-3456 about 97110 on 11/01/2026.\n5\n5\n5\n';
const real = RegExp.prototype.exec;
let n = 0;
const count = (f: () => void) => { n = 0; RegExp.prototype.exec = function (s: string) { n += 1; return real.call(this, s); }; try { f(); } finally { RegExp.prototype.exec = real; } return n; };
for (const [label, text] of [['once', plain], ['twice', `${plain}​`]] as const) {
  const sent = redactLetter(text, patient, claims).text;
  const a = count(() => redactLetter(text, patient, claims));
  const b = count(() => holdsIdentifier(sent, patient, claims));
  console.log(label, 'redact', a, 'check', b, 'total', a + b, JSON.stringify(sent).slice(0, 120));
}
