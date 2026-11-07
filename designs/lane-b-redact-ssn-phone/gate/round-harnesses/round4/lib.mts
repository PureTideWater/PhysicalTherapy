// Synthetic only. A = cc3dd7f6, B = live candidate. judge1's call of denial-letter.test.ts.
export const A: any = await import('/home/user/redact-range-glued-probe/packages/model-gateway/src/redact.ts');
export const B: any = await import('/home/user/rg-cand-b/packages/model-gateway/src/redact.ts');
export const judge1 = (names: string[], more: { datesOfBirth?: string[]; memberIds?: string[]; claimNumbers?: string[] } = {}) => ({
  patient: { pseudonym: 'synthetic-patient-15', names, datesOfBirth: [...(more.datesOfBirth ?? ['1980-03-14'])], memberIds: [...(more.memberIds ?? ['SYNMEMBER0042', 'ZZ7654321'])] },
  claims: [{ claimId: 'c1', patientPseudonym: 'synthetic-patient-15', claimNumbers: [...(more.claimNumbers ?? ['SYNCLAIM0001', 'C2026000417'])] }],
});
export const run = (m: any, letter: string, names: string[], more = {}) => {
  const { patient, claims } = judge1(names, more);
  const r = m.redactLetterForScreen(letter, patient, claims);
  return m.holdsIdentifier(r.text, patient, claims) ? null : r.text;
};
