// phone-sides.mts <root> <treeA> <treeB>: ruling (c)'s caveat, row by row. widened.mts's 135 phone letters (a phone-shaped
// number not stored, with a number character before, inside or after it), each outcome in A against B, by side and character.
import path from 'node:path'; import { pathToFileURL } from 'node:url';
const [root, a, b] = process.argv.slice(2);
const P = { pseudonym: 's', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['30072299'] };
const C = [{ claimId: 'c', patientPseudonym: 's', claimNumbers: ['SYNCLAIM0001'] }];
const load = async (t: string) => import(pathToFileURL(path.join(root!, t, 'packages/model-gateway/src/redact.ts')).href);
const A = await load(a!), B = await load(b!);
const out = (H: any, t: string) => { const r = H.redactLetterForScreen(t, P, C); if (H.holdsIdentifier(r.text, P, C)) return 'refused'; return /0\s*1\s*2\s*3/u.test(r.text) ? 'clear' : 'hidden'; };
const n: Record<string, number> = {};
for (const c of ['ↀ', '①', '¹', '½', 'Ⅳ']) for (const ph of ['555-0123', '(555) 555-0123', '5550123']) {
  const k = ph.lastIndexOf('0123');
  for (const [side, x] of [['before', `${c}${ph}`], ['after', `${ph}${c}`], ['inside', `${ph.slice(0, k)}${c}${ph.slice(k)}`]])
    for (const f of [`Call ${x} now.`, `Phone: ${x}`, `the number ${x}, or write`]) {
      const key = `${side} ${out(A, f)}->${out(B, f)}`; n[key] = (n[key] ?? 0) + 1;
      const key2 = `${ph.length === 7 ? 'seven bare' : 'labelled/ten'} ${c} ${out(A, f)}->${out(B, f)}`; n[key2] = (n[key2] ?? 0) + 1;
    }
}
for (const k of Object.keys(n).sort()) console.log(k, n[k]);
