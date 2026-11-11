import { pathToFileURL } from 'node:url';
export const patient = { pseudonym: 'p', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['ZZ7654321'] };
export const claims = [{ claimId: 'c', patientPseudonym: 'p', claimNumbers: ['SYNCLAIM0001'] }];
export const PATHS: Record<string, string> = {
  head: '/home/user/fix/packages/model-gateway/src/redact.ts',
  before: '/home/user/work/p13/before/packages/model-gateway/src/redact.ts',
  base: '/home/user/tree-ef3/packages/model-gateway/src/redact.ts',
  fix3: '/home/user/fix3/packages/model-gateway/src/redact.ts',
};
export const load = async (name: string): Promise<any> => import(pathToFileURL(PATHS[name]!).href);
export type Out = { refused: boolean; text: string };
export function outcome(R: any, text: string): Out {
  try {
    const s = R.redactLetterForScreen(text, patient, claims);
    return { refused: R.holdsIdentifier(s.text, patient, claims), text: s.text };
  } catch (e) {
    return { refused: true, text: 'THROW ' + String(e).slice(0, 120) };
  }
}
const PH = /\[[A-Z_]+(?:_?[0-9]+)?\]/g;
export const clearDigits = (t: string) => (t.replace(PH, '').match(/[0-9]/g) ?? []).length;
export const ownLeft = (t: string) => (t.replace(PH, '').match(/ZEPHYRA|JANE|ZZ7654321|SYNCLAIM0001/gi) ?? []).length;
export const show = (o: Out, original: string) => (o.refused ? 'REFUSED' : o.text === original ? 'same' : JSON.stringify(o.text));
/** Whether the head sends more than the other tree: the other refused, or the head shows more digits or own identifiers in clear. */
export function worse(head: Out, other: Out): string | null {
  if (head.refused) return null;
  if (other.refused) return 'R>S';
  if (clearDigits(head.text) > clearDigits(other.text)) return 'less';
  return ownLeft(head.text) > ownLeft(other.text) ? 'own' : null;
}
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
