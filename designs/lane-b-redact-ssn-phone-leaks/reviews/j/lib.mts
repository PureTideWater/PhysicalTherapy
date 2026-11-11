// Shared by reviewer J's scripts: the three trees, the brief's patient and claims, the outcome per tree.
import { pathToFileURL } from 'node:url';
export const patient = { pseudonym: 'p', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['ZZ7654321'] };
export const claims = [{ claimId: 'c', patientPseudonym: 'p', claimNumbers: ['SYNCLAIM0001'] }];
const SRC = 'packages/model-gateway/src/redact.ts';
export const PATHS: Record<string, string> = {
  head: `/home/user/fix/${SRC}`,
  before: `/home/user/work/p15/before/${SRC}`,
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
export const clearLetters = (t: string) => (bare(t).match(/\p{L}/gu) ?? []).length;
export const ownLeft = (t: string) => (bare(t).match(/ZEPHYRA|JANE|ZZ7654321|SYNCLAIM0001/gi) ?? []).length;
export const show = (o: Out, original: string) => (o.refused ? (o.text.startsWith('THROW') ? o.text : 'REFUSED') : o.text === original ? 'same' : JSON.stringify(o.text));
/** Whether the head sends more than the other tree: the other refused, or the head shows more digits, own identifiers or letters in clear. */
export function worse(head: Out, other: Out): string | null {
  if (head.refused) return null;
  if (other.refused) return 'R>S';
  if (clearDigits(head.text) > clearDigits(other.text)) return 'less';
  if (ownLeft(head.text) > ownLeft(other.text)) return 'own';
  return clearLetters(head.text) >= clearLetters(other.text) + 3 ? 'letters' : null;
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
/** One line per letter: flags, the letter, the three outcomes. */
export function line(H: any, P: any, B: any, text: string): { flags: string[]; row: string } {
  const [h, p, b] = [outcome(H, text), outcome(P, text), outcome(B, text)];
  const flags: string[] = [];
  const wb = worse(h, b);
  const wp = worse(h, p);
  if (wb) flags.push(`BASE-${wb}`);
  if (wp) flags.push(`PHI-${wp}`);
  const same = (o: Out) => !o.refused && o.text === text;
  if (same(b) && same(p) && !same(h)) flags.push(h.refused ? 'STAY-refused' : 'STAY-changed');
  else if (!p.refused && h.refused) flags.push('newR');
  return { flags, row: `${(flags.join(',') || '-').padEnd(13)} ${JSON.stringify(text)} :: H ${show(h, text)} | P ${show(p, text)} | B ${show(b, text)}` };
}
