// Shared: the three trees, the brief's patient and claims, outcome per tree.
import { pathToFileURL } from 'node:url';
export const PATHS: Record<string, string> = {
  head: '/home/user/fix/packages/model-gateway/src/redact.ts',
  before: '/home/user/work/p12/before/packages/model-gateway/src/redact.ts',
  base: '/home/user/tree-ef3/packages/model-gateway/src/redact.ts',
};
export const M: Record<string, any> = {};
for (const [k, p] of Object.entries(PATHS)) M[k] = await import(pathToFileURL(p).href);
export const JANE = { pseudonym: 'p', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['ZZ7654321'] };
export const MAYA = { pseudonym: 'p', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-05-14'], memberIds: ['ZZ7654321'] };
export const CLAIMS = [{ claimId: 'c', patientPseudonym: 'p', claimNumbers: ['SYNCLAIM0001'] }];
export function out(tree: string, text: string, patient: any = JANE): string {
  const R = M[tree];
  try {
    const s = R.redactLetterForScreen(text, patient, CLAIMS);
    return R.holdsIdentifier(s.text, patient, CLAIMS) ? 'REFUSED' : s.text === text ? 'same' : JSON.stringify(s.text);
  } catch (e) {
    return 'THROW ' + String(e).slice(0, 120);
  }
}
export type Three = { head: string; before: string; base: string };
export function three(text: string, patient: any = JANE): Three {
  return { head: out('head', text, patient), before: out('before', text, patient), base: out('base', text, patient) };
}
export const HELD = 'Service 01/01/2020-150.00 Paid\n';
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
export function pick<T>(r: () => number, xs: readonly T[]): T {
  return xs[Math.floor(r() * xs.length)]!;
}
export function digits(r: () => number, n: number, firstNonZero = true): string {
  let s = '';
  for (let i = 0; i < n; i += 1) s += String(i === 0 && firstNonZero ? 1 + Math.floor(r() * 9) : Math.floor(r() * 10));
  return s;
}
export function fmt(text: string, t: Three): string {
  return `${JSON.stringify(text)}\n        head: ${t.head} | before: ${t.before} | base: ${t.base}`;
}
