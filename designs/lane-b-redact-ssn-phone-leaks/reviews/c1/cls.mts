// Avenue 2 classification of one letter on base and head: a letter the base refuses and the head sends, or one both send
// where the head shows more digits or one of the call's own identifiers the base did not show.
import { outcome, digitsOf, plain, runs3 } from './lib.mts';
export const ownClear = (sent: string, own: readonly string[]) => { const up = plain(sent).toUpperCase().replace(/[^A-Z0-9|]/g, ''); return own.filter((o) => up.includes(o)); };
export function classify(B: any, H: any, t: string, P: any, C: any, own: readonly string[]) {
  const h = outcome(H, t, P, C);
  if (h.threw !== null) return { kinds: ['THREW'], h, b: null as any };
  if (h.refused) return { kinds: [] as string[], h, b: null as any };
  const b = outcome(B, t, P, C);
  const kinds: string[] = ['headSent'];
  if (b.threw !== null) return { kinds, h, b };
  if (b.refused) {
    kinds.push('flip');
    let chk = false; try { chk = B.holdsIdentifier(h.sent, P, C) as boolean; } catch { chk = false; }
    const three = runs3(h.sent).length > 0;
    if (chk) kinds.push(three ? 'FLIP-CHK' : 'FLIP-CHK0');
    if (digitsOf(h.sent).length > digitsOf(b.sent).length) kinds.push('FLIP-RED');
    if (ownClear(h.sent, own).length > 0) kinds.push('FLIP-OWN');
    if (kinds.length === 2) kinds.push(three ? 'flip-other3' : 'flip-other');
  } else {
    if (digitsOf(h.sent).length > digitsOf(b.sent).length) kinds.push('UNREDACT');
    const bo = ownClear(b.sent, own);
    if (ownClear(h.sent, own).some((o) => !bo.includes(o))) kinds.push('UNREDACT-OWN');
  }
  return { kinds, h, b };
}
