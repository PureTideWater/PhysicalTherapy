// Shared helpers for the C1 adversarial review. Synthetic data only.
import { pathToFileURL } from 'node:url';
export { plain, digitsOf, show, outcome } from '/home/user/work/b1fix/lib.mts';
import { plain, outcome } from '/home/user/work/b1fix/lib.mts';
export const TREES: Record<string, string> = {
  base: '/home/user/tree-ef3/packages/model-gateway/src/redact.ts',
  aea: '/home/user/review-c1/aea/packages/model-gateway/src/redact.ts',
  head: '/home/user/fix/packages/model-gateway/src/redact.ts',
  inst: '/home/user/review-c1/inst/packages/model-gateway/src/redact.ts',
};
export const load = async (name: string): Promise<any> => import(pathToFileURL(TREES[name]!).href);
export const P1 = { pseudonym: 'p', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['SYNMEMBER0042'] };
export const C1 = [{ claimId: 'c', patientPseudonym: 'p', claimNumbers: ['SYNCLAIM0001'] }];
export const tag = (R: any, text: string, P: any = P1, C: any = C1) => { const o = outcome(R, text, P, C); return o.threw !== null ? `THREW ${o.threw.slice(0, 80)}` : o.refused ? 'REFUSED' : `SENT ${JSON.stringify(o.sent)}`; };
export const runs3 = (sent: string): string[] => plain(sent).match(/[0-9]{3,}/g) ?? [];
/** Avenue 1 on the instrumented head: the withheld text sent, and texts chainLeft refuses with strict false and not with strict true. */
export function av1(I: any, text: string, P: any, C: any, raw = false) {
  const t = I.__t;
  const normal: string = t.unbracketed(text);
  const subject = t.letterSubject(P, C);
  const found: any[] = t.matchesIn(t.unmarked(normal), subject);
  const fresh = found.filter((m) => m.fresh === true);
  const texts: [string, string][] = [['full', t.written(normal, t.merge(found))]];
  if (fresh.length > 0) texts.push(['settled', t.written(normal, t.merge(found.filter((m) => m.fresh !== true)))]);
  if (raw) texts.push(['raw', normal]);
  const out = { fresh: fresh.length, withheld: false, sentWithheld: '', asym: [] as { kind: string; T: string; held: boolean }[] };
  for (const [kind, T] of texts) {
    if (!t.chainLeft(T, subject, C.length, false)) continue;
    if (kind === 'settled') out.withheld = true;
    if (t.chainLeft(T, subject, C.length, true)) continue;
    out.asym.push({ kind, T, held: I.holdsIdentifier(T, P, C) });
  }
  if (out.withheld) {
    const s = I.redactLetterForScreen(text, P, C);
    if (!I.holdsIdentifier(s.text, P, C)) out.sentWithheld = s.text;
  }
  return out;
}
