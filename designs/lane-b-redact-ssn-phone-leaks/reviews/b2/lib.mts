// Shared loader for the review: head (aea2852d), base (ef3e8d20), older reference (cc3dd7f6).
import { pathToFileURL } from 'node:url';
export const H = await import(pathToFileURL('/home/user/leaks/packages/model-gateway/src/redact.ts').href);
export const B = await import(pathToFileURL('/home/user/tree-ef3/packages/model-gateway/src/redact.ts').href);
let c3: any = null;
export const C3 = async () => (c3 ??= await import(pathToFileURL('/home/user/tree-cc3/packages/model-gateway/src/redact.ts').href));
export const pat = (names: string[] = ['JANE Q ZEPHYRA'], dob = '1980-03-14', memberIds: string[] = ['SYNMEMBER0042']) => ({ pseudonym: 'p', names, datesOfBirth: [dob], memberIds });
export const cl = (claimNumbers: string[] = ['SYNCLAIM0001']) => [{ claimId: 'c', patientPseudonym: 'p', claimNumbers }];
export const JANE = pat();
export const CLAIMS = cl();
export function out(R: any, text: string, p: any = JANE, c: any = CLAIMS): string {
  const s = R.redactLetterForScreen(text, p, c);
  if (R.holdsIdentifier(s.text, p, c)) return 'REFUSED';
  return s.text === text ? 'SENT same' : `SENT ${JSON.stringify(s.text)}`;
}
export function row(text: string, p: any = JANE, c: any = CLAIMS, note = ''): { b: string; h: string; differs: boolean } {
  const b = out(B, text, p, c);
  const h = out(H, text, p, c);
  return { b, h, differs: b !== h };
}
export function show(text: string, p: any = JANE, c: any = CLAIMS, note = '', onlyDiff = false) {
  const r = row(text, p, c);
  if (onlyDiff && !r.differs) return r;
  console.log(`${r.differs ? 'DIFF' : 'same'} ${JSON.stringify(text)}${note ? `   <<${note}>>` : ''}\n      base: ${r.b}\n      head: ${r.h}`);
  return r;
}
