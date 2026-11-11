// Reviewer E2 shared helpers. Synthetic twins only (ZEPHYRA, 900-xx-xxxx, 555-01xx, SYN..., ZZ...).
import { pathToFileURL } from 'node:url';
export const T0 = Date.now();
export const el = () => `${((Date.now() - T0) / 1000).toFixed(1)}s`;
export const PATHS: Record<string, string> = {
  head: '/home/user/fix/packages/model-gateway/src/redact.ts',
  before: '/home/user/work/p9/beforeF/redact.ts',
  base: '/home/user/tree-ef3/packages/model-gateway/src/redact.ts',
};
export const M: any = {};
for (const [k, v] of Object.entries(PATHS)) M[k] = await import(pathToFileURL(v).href);
export const mk = (dob: string) => ({ pseudonym: 'p', names: (process.env.NAMES ?? 'JANE Q ZEPHYRA').split(';'), datesOfBirth: [dob], memberIds: ['ZZ7654321'] });
export const JANE = mk('1980-03-14');
export const MAYP = mk('1980-05-12');
export const CLAIMS = [{ claimId: 'c', patientPseudonym: 'p', claimNumbers: ['SYNCLAIM0001'] }];
export const HELD = 'Service 01/01/2020-150.00 Paid\n';
const norm = (t: string) => t.normalize('NFKC').replace(/[[\]]/g, (b) => (b === '[' ? '(' : ')'));
export const memo = new Map<string, string>();
export function out(tree: string, text: string, p: any = JANE): string {
  const key = `${tree}|${p.datesOfBirth[0]}|${text}`;
  let o = memo.get(key);
  if (o === undefined) {
    const R = M[tree];
    try {
      const s = R.redactLetterForScreen(text, p, CLAIMS);
      o = R.holdsIdentifier(s.text, p, CLAIMS) ? 'REFUSED' : s.text === text || s.text === norm(text) ? 'same' : `T:${s.text}`;
    } catch (e) {
      o = `THROW ${String(e).slice(0, 120)}`;
    }
    memo.set(key, o);
  }
  return o;
}
export const rl = (tree: string, text: string, p: any = JANE): string => {
  try {
    return M[tree].redactLetter(text, p, CLAIMS).text;
  } catch (e) {
    return `THROW ${String(e).slice(0, 120)}`;
  }
};
export const show = (o: string) => (o.startsWith('T:') ? JSON.stringify(o.slice(2)) : o);
export function targeted(title: string, rows: any[]) {
  console.log(`\n== ${title} (${el()})   flags: ** head differs from base and before; *  head differs from base, same as before; ~  head as base, differs from before`);
  for (const [tag, text, p, w] of rows) {
    const pt = p ?? JANE;
    const h = out('head', text, pt);
    const bf = out('before', text, pt);
    const b = out('base', text, pt);
    const flag = h !== b ? (h !== bf ? '**' : '* ') : h !== bf ? '~ ' : '  ';
    let line = `${flag}${tag}  ${JSON.stringify(text)}\n      head: ${show(h)} | before: ${show(bf)} | base: ${show(b)}`;
    if (w !== undefined && w !== null) line += `\n      without (n) ${JSON.stringify(w)}: head: ${show(out('head', w, pt))} | base: ${show(out('base', w, pt))}`;
    console.log(line);
  }
}
