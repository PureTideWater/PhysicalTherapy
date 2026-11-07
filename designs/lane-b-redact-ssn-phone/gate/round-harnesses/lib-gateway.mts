export const A: any = await import('/home/user/redact-range-glued-probe/packages/model-gateway/src/redact.ts');
export const B: any = await import('/home/user/rg-cand-b/packages/model-gateway/src/redact.ts');
export const C = [{ claimId: 'c', patientPseudonym: 'p', claimNumbers: ['SYNCLAIM0001'] }] as any;
export function patient(names: string[], dob = '1980-03-14', member = 'SYNMEMBER0042'): any {
  return { pseudonym: 'p', names, datesOfBirth: dob === '' ? [] : [dob], memberIds: [member] };
}
export function run(m: any, text: string, P: any, claims = C): string {
  const r = m.redactLetterForScreen(text, P, claims);
  return m.holdsIdentifier(r.text, P, claims) ? 'REFUSED' : r.text;
}
export function heldOf(text: string, P: any, claims = C): string {
  const r = B.redactLetterForScreen(text, P, claims);
  const p = B.__probe;
  return String(p.survivorLeft(p.masked(r.text, claims.length)));
}
export function cmp(text: string, P: any, claims = C) {
  const a = run(A, text, P, claims);
  const b = run(B, text, P, claims);
  return { a, b, same: a === b };
}
