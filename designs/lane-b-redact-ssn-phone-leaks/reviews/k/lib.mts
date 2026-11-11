// Shared by reviewer K's scripts: the three trees, the brief's patient and claims, the outcome per tree.
import { pathToFileURL } from 'node:url';
export const patient = { pseudonym: 'p', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['ZZ7654321'] };
export const claims = [{ claimId: 'c', patientPseudonym: 'p', claimNumbers: ['SYNCLAIM0001'] }];
const SRC = 'packages/model-gateway/src/redact.ts';
export const PATHS: Record<string, string> = {
  head: `/home/user/fix/${SRC}`,
  before: `/home/user/work/p16/before/${SRC}`,
  base: `/home/user/tree-ef3/${SRC}`,
};
export const load = async (name: string): Promise<any> => import(pathToFileURL(PATHS[name] as string).href);
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
const bare = (t: string) => t.replace(PH, '');
export const clearDigits = (t: string) => (bare(t).match(/[0-9]/g) ?? []).length;
export const J = (s: string) => JSON.stringify(s).replace(/[^\x20-\x7E]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
export const show = (o: Out, original: string) => (o.refused ? (o.text.startsWith('THROW') ? o.text : 'REFUSED') : o.text === original ? 'same' : J(o.text));
export const stay = (h: Out, p: Out, b: Out) => !b.refused && !p.refused && b.text === p.text && (h.refused || h.text !== p.text);
/** Whether the head sends more than the other tree: the other refused, or the head shows more digits in clear. */
export function worse(head: Out, other: Out): string | null {
  if (head.refused) return null;
  if (other.refused) return 'R>S';
  return clearDigits(head.text) > clearDigits(other.text) ? 'less' : null;
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
export function pick<T>(r: () => number, xs: readonly T[]): T {
  return xs[Math.floor(r() * xs.length)] as T;
}
export const HELD = 'Service 01/01/2020-150.00 Paid\n';
