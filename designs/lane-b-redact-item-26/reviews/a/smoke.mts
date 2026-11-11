const base = await import('/home/user/rev/base/redact.ts');
const head = await import('/home/user/rev/head/redact.ts');
const open = await import('/home/user/ops/designs/lane-b-redact-item-26/reviews/a/open/redact.ts');
const patient = { pseudonym: 'synthetic-patient-1', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['SYNMEMBER0042'] };
const claims = [{ claimId: 'synthetic-claim-1', patientPseudonym: 'synthetic-patient-1', claimNumbers: ['SYNCLAIM0001'] }];
const t0 = performance.now();
for (const m of [base, head, open]) {
  const s = performance.now();
  let r; for (let i = 0; i < 20; i++) { r = m.redactLetterForScreen('Dear Zephy ra, your claim SYNCLAIM0001 SSN 900-12-3456 was paid 01/01/2020-150.00.\r\nThank you.', patient, claims); m.holdsIdentifier(r.text, patient, claims); }
  console.log(JSON.stringify(r.text), m.holdsIdentifier(r.text, patient, claims), ((performance.now() - s) / 20).toFixed(2), 'ms per screen+check');
}
console.log(JSON.stringify(open.__open.stores()));
