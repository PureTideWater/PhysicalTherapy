// Synthetic only. A = cc3dd7f6 (probe checkout), B = candidate (live rg-cand-b). Real prepare path: redactLetterForScreen then holdsIdentifier.
export const A: any = await import('/home/user/redact-range-glued-probe/packages/model-gateway/src/redact.ts');
export const B: any = await import('/home/user/rg-cand-b/packages/model-gateway/src/redact.ts');
export interface Pt { names: string[]; dob?: string; members?: string[]; claims?: string[] }
export function call(p: Pt) {
  const patient = { pseudonym: 'synthetic-patient-1', names: p.names, datesOfBirth: p.dob === undefined ? ['1980-03-14'] : p.dob === '' ? [] : [p.dob], memberIds: p.members ?? ['SYNMEMBER0042'] };
  const claims = [{ claimId: 'c1', patientPseudonym: 'synthetic-patient-1', claimNumbers: p.claims ?? ['SYNCLAIM0001'] }];
  return { patient, claims };
}
export function run(m: any, text: string, p: Pt): string {
  const { patient, claims } = call(p);
  const r = m.redactLetterForScreen(text, patient, claims);
  return m.holdsIdentifier(r.text, patient, claims) ? 'REFUSED' : r.text;
}
export function cmp(text: string, p: Pt) {
  const a = run(A, text, p), b = run(B, text, p);
  return { a, b };
}
export const show = (letter: string, r: { a: string; b: string }) => {
  const s = (x: string) => (x === 'REFUSED' ? 'REFUSED' : x === letter ? 'SENT' : 'REDACT ' + JSON.stringify(x));
  return JSON.stringify(letter) + '\n  base: ' + s(r.a) + '\n  cand: ' + s(r.b);
};
