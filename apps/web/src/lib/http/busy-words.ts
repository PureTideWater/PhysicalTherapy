import type { BusyWhat } from './route';

/**
 * What a busy refusal says (docs/adr/0092 and its amendment of 2026-11-11), in one place for the two that say it: the
 * server's words (next.ts), which a post without JavaScript shows and which cannot see the form, and the form's own
 * lead (components/form-issues.tsx, RefusalLead), which can.
 *
 * The first clause names what was being written as a closed word allows: the ledger, or the records the change needs,
 * which may be another record than the one on the page (a case's row behind a submission), so never "these records".
 * It names no table, row, job or person. The wait is minutes, not a minute: what holds a row past the web's
 * lock_timeout holds it for a whole transaction, a reconcile pass at real size.
 */
const HELD: Readonly<Record<BusyWhat, string>> = {
  ledger: 'The recovery ledger is being updated',
  records: 'The records this change needs are being updated',
};

/** What the form held when it was refused: any field a person fills, and any password or code (which a refusal empties). */
export interface BusyForm {
  readonly fields: boolean;
  readonly secrets: boolean;
}

/**
 * The refusal's sentence. `form` is what the form held, where that is known (the browser, after the refusal emptied its
 * passwords and codes); null where it is not, and then the words claim nothing about what stays: a post without
 * JavaScript keeps nothing typed, and a form with no field has nothing to keep.
 */
export function busyWords(what: BusyWhat, form: BusyForm | null): string {
  const lead = `${HELD[what]}, so nothing was saved.`;
  if (form === null || !form.fields) {
    return `${lead} Try again in a few minutes.`;
  }
  return form.secrets
    ? `${lead} What you typed is still here, except passwords and codes: type them again, then try again in a few minutes.`
    : `${lead} What you typed is still here: try again in a few minutes.`;
}
