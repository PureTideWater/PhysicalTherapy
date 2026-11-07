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
