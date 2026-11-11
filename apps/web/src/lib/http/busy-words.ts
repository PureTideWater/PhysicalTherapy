import type { BusyWhat } from './route';

/**
 * What a busy refusal says (docs/adr/0092 and its amendment of 2026-11-11), in one place for the two that say it: the
 * server's words (next.ts), which a post without JavaScript shows and which cannot see the form, and the form's own
 * lead (components/form-issues.tsx, RefusalLead), which can.
 *
 * The first sentence says what was being written as a closed word allows: the ledger; the records the form needs,
 * which may be another record than the one on the page (a case's row behind a submission), so never "these records";
 * or the form's own earlier send, still running, of which "nothing was saved" would be false, since it may yet save.
 * It names no table, row, job or person. Only a signed-in person's form shows any of them. The wait is minutes, not a
 * minute: what holds a lock past the lock timeout holds it for a whole transaction, a reconcile pass at real size.
 */
const HELD: Readonly<Record<BusyWhat, string>> = {
  ledger: 'The recovery ledger is being updated, so nothing was saved.',
  records: 'The records this form needs are being updated, so nothing was saved.',
  request: 'This form was already sent and is still being processed, so nothing new was saved.',
};

/**
 * What the form held when it was refused, as the browser read it: `kept`, a field a person fills that a refusal leaves
 * as it was (typed, chosen or attached), and `secrets`, a password or a code, which a refusal empties.
 */
export interface BusyForm {
  readonly kept: boolean;
  readonly secrets: boolean;
}

/**
 * The refusal's words. `form` is what the form held, where the browser has read it; null where it has not (the
 * server's own words, the post without JavaScript, a summary before the page is read), and then the words claim
 * nothing about the form.
 *
 * The ledger and the records: what stays is said only of what a refusal keeps, and a password or a code is asked for
 * again. The same key still running: the form is sent again unchanged, since the same send is answered "Already sent"
 * once the first has saved and nothing is saved twice, while a changed one would lose its changes without a word;
 * without the form (no request key is kept), the page is read again instead.
 */
export function busyWords(what: BusyWhat, form: BusyForm | null): string {
  const lead = HELD[what];
  if (what === 'request') {
    if (form === null) {
      return `${lead} Reload the page in a few minutes to see whether it saved.`;
    }
    return form.secrets
      ? `${lead} Type passwords and codes again, then send it again in a few minutes, changing nothing else, to see whether it saved: nothing is saved twice.`
      : `${lead} Send it again in a few minutes, changing nothing, to see whether it saved: nothing is saved twice.`;
  }
  if (form === null || (!form.kept && !form.secrets)) {
    return `${lead} Try again in a few minutes.`;
  }
  if (!form.kept) {
    return `${lead} Passwords and codes are not kept: type them again, then try again in a few minutes.`;
  }
  return form.secrets
    ? `${lead} What you typed is still here, except passwords and codes: type them again, then try again in a few minutes.`
    : `${lead} What you typed is still here: try again in a few minutes.`;
}
