// Shared: the trees (TREES picks which to load), the brief's patient and claims, the outcome per tree.
import { pathToFileURL } from 'node:url';
const SRC = 'packages/model-gateway/src/redact.ts';
export const PATHS: Record<string, string> = {
  head: `/home/user/fix/${SRC}`,
  before: `/home/user/work/p13/before/${SRC}`,
  base: `/home/user/tree-ef3/${SRC}`,
  v0: '/home/user/review-h2/v/v0.mts',
  v1: '/home/user/review-h2/v/v1.mts',
  v2: '/home/user/review-h2/v/v2.mts',
};
export const M: Record<string, any> = {};
for (const k of (process.env.TREES ?? 'head,before,base').split(',')) M[k] = await import(pathToFileURL(PATHS[k] as string).href);
export const JANE = { pseudonym: 'p', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['ZZ7654321'] };
export const MAYA = { pseudonym: 'p', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-05-14'], memberIds: ['ZZ7654321'] };
export const CLAIMS = [{ claimId: 'c', patientPseudonym: 'p', claimNumbers: ['SYNCLAIM0001'] }];
export function out(tree: string, text: string, patient: any = JANE): string {
  const R = M[tree];
  try {
    const s = R.redactLetterForScreen(text, patient, CLAIMS);
    return R.holdsIdentifier(s.text, patient, CLAIMS) ? 'REFUSED' : s.text === text ? 'same' : JSON.stringify(s.text);
  } catch (e) {
    return 'THROW ' + String(e).slice(0, 160);
  }
}
export function rng(seed: number) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
export const int = (r: () => number, n: number) => Math.floor(r() * n);
export function pick<T>(r: () => number, xs: readonly T[]): T { return xs[Math.floor(r() * xs.length)] as T; }
export function digits(r: () => number, n: number, firstNonZero = true): string { let s = ''; for (let i = 0; i < n; i += 1) s += String(i === 0 && firstNonZero ? 1 + Math.floor(r() * 9) : Math.floor(r() * 10)); return s; }
