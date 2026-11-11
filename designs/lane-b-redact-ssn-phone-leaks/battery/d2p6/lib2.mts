// Helpers: base (B), prototype (P), and the instrumented copy of the prototype (I: same code, a trace of the refusing rule).
import { pathToFileURL } from 'node:url';
export const P = await import(pathToFileURL('/home/user/fix/packages/model-gateway/src/redact.ts').href);
export const B = await import(pathToFileURL('/home/user/tree-ef3/packages/model-gateway/src/redact.ts').href);
export const I = await import(pathToFileURL('/home/user/fix/packages/model-gateway/src/redact.ts').href);
export const patientOf = (names: string[], dob: string[] = ['1980-03-14'], memberIds: string[] = ['SYNMEMBER0042']) => ({ pseudonym: 'synthetic-patient-16', names, datesOfBirth: dob, memberIds });
export const claimsOf = (claimNumbers: string[] = ['SYNCLAIM0001']) => [{ claimId: 'synthetic-claim-1', patientPseudonym: 'synthetic-patient-16', claimNumbers }];
export const JANE = patientOf(['JANE Q ZEPHYRA']);
export const CLAIMS = claimsOf();
export interface Outcome { refused: boolean; text: string; replaced: number; trace: string[]; redacted: string[] }
export function handle(R: any, text: string, patient: any = JANE, claims: any = CLAIMS): Outcome {
  if (R.TRACE) R.TRACE.length = 0;
  const s = R.redactLetterForScreen(text, patient, claims);
  const redacted = R.REDACTED ? [...R.REDACTED] : [];
  if (R.TRACE) R.TRACE.length = 0;
  const refused = R.holdsIdentifier(s.text, patient, claims);
  return { refused, text: s.text, replaced: s.replaced, trace: R.TRACE ? [...R.TRACE] : [], redacted };
}
/** The refusing rule of a refused letter, from the instrumented copy's trace. */
export const reasonOf = (o: Outcome) => o.trace.filter((t) => !t.startsWith('survivor=') && t !== 'redact:confused').join(' | ') || (o.refused ? '?' : '');
export function compare(text: string, patient: any = JANE, claims: any = CLAIMS) {
  const b = handle(B, text, patient, claims);
  const i = handle(I, text, patient, claims);
  const kind = b.refused ? (i.refused ? 'both-refused' : 'UNREFUSED') : i.refused ? 'NEW-REFUSAL' : b.text === i.text ? 'same' : 'CHANGED';
  return { b, i, kind };
}
export function show(text: string, patient: any = JANE, claims: any = CLAIMS) {
  const { b, i, kind } = compare(text, patient, claims);
  const fmt = (o: Outcome) => (o.refused ? `REFUSED${reasonOf(o) ? ` [${reasonOf(o)}]` : ''}` : o.text === text.normalize('NFKC') ? 'SENT unchanged' : `SENT ${JSON.stringify(o.text)}`);
  console.log(`${kind.padEnd(12)} ${JSON.stringify(text)}\n    base: ${fmt(b)}\n    prot: ${fmt(i)}`);
}
