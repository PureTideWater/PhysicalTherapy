// Four trees: base ef3e8d20, aea2852d (before the fix round), 405314b4, head a64cc9af (/home/user/fix).
import { pathToFileURL } from 'node:url';
const load = (root: string) => import(pathToFileURL(`${root}/packages/model-gateway/src/redact.ts`).href);
export const B: any = await load('/home/user/tree-ef3');
export const A: any = await load('/home/user/review-c2/aea');
export const H4: any = await load('/home/user/review-c2/h405');
export const H: any = await load('/home/user/fix');
export const pat = (names: string[] = ['JANE Q ZEPHYRA'], dob = '1980-03-14', memberIds: string[] = ['SYNMEMBER0042']) => ({ pseudonym: 'p', names, datesOfBirth: [dob], memberIds });
export const cl = (claimNumbers: string[] = ['SYNCLAIM0001']) => [{ claimId: 'c', patientPseudonym: 'p', claimNumbers }];
export const JANE = pat();
export const CLAIMS = cl();
export const HELD = 'Service 01/01/2020-150.00 Paid\n';
export function out(R: any, text: string, p: any = JANE, c: any = CLAIMS): string {
  try {
    const s = R.redactLetterForScreen(text, p, c);
    if (R.holdsIdentifier(s.text, p, c)) return 'REFUSED';
    return s.text === text ? 'SENT same' : `SENT ${JSON.stringify(s.text)}`;
  } catch (e: any) { return `ERROR ${String(e && e.message).slice(0, 80)}`; }
}
