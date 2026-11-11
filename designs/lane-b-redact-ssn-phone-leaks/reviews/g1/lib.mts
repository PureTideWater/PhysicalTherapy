// Shared: the three trees, one outcome per tree, flags.
import { pathToFileURL } from 'node:url';
export const TREES: Record<string, string> = {
  head: '/home/user/fix/packages/model-gateway/src/redact.ts',
  before: '/home/user/work/p12/before/packages/model-gateway/src/redact.ts',
  base: '/home/user/tree-ef3/packages/model-gateway/src/redact.ts',
};
export const patient = { pseudonym: 'p', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['ZZ7654321'] };
export const claims = [{ claimId: 'c', patientPseudonym: 'p', claimNumbers: ['SYNCLAIM0001'] }];
const mods: Record<string, any> = {};
for (const [k, p] of Object.entries(TREES)) mods[k] = await import(pathToFileURL(p).href);
export const digitsOnly = (s: string) => s.replace(/[^0-9]/g, '');
export function outcome(tree: string, text: string, pat: any = patient) {
  const R = mods[tree];
  const s = R.redactLetterForScreen(text, pat, claims);
  return R.holdsIdentifier(s.text, pat, claims) ? { refused: true, text: '' } : { refused: false, text: s.text as string };
}
export const show = (o: { refused: boolean; text: string }, letter: string) => (o.refused ? 'REFUSED' : o.text === letter ? 'same' : JSON.stringify(o.text));
export function judge(letter: string, needles: string[] = [], pat: any = patient) {
  const [h, b, s] = ['head', 'before', 'base'].map((t) => outcome(t, letter, pat)) as [any, any, any];
  let sev = '';
  const notes: string[] = [];
  if (!h.refused) {
    if (s.refused) notes.push('base-refused');
    else if (digitsOnly(h.text).length > digitsOnly(s.text).length) notes.push('more-digits-than-base');
    if (b.refused) notes.push('before-refused');
    else if (digitsOnly(b.text).length < digitsOnly(h.text).length) notes.push('more-digits-than-before');
    for (const n of needles) {
      if (!digitsOnly(h.text).includes(n)) continue;
      const hidBase = s.refused || !digitsOnly(s.text).includes(n);
      const hidBefore = b.refused || !digitsOnly(b.text).includes(n);
      if (hidBase) sev = 'BLOCKING';
      else if (hidBefore && sev === '') sev = 'MAJOR';
      notes.push('clear:' + n);
    }
  }
  return { h, b, s, sev, notes, line: `${JSON.stringify(letter)}\n      head: ${show(h, letter)} | before: ${show(b, letter)} | base: ${show(s, letter)}` };
}
