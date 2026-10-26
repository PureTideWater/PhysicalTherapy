import { formatCents, parseAmount, parseCents } from '@tp/money';
import { z } from 'zod';

/**
 * Money a person types, and the stored cents a form is pre-filled with (PRD 6, Cross-cutting: integer cents, never
 * a float). The two are each other's inverse over every amount a store holds, [0, 999,999,999,999] cents (the
 * triage settings, practice_set_materiality and the feature flag's check all take twelve digits):
 * `dollarsField.parse(dollarsForInput(text))` is the cents `text` names, so a form saved unchanged changes nothing
 * (test matrix CAS-39). Pure, and safe to import in the browser.
 */

/** What a field refuses with, wherever an amount in dollars is typed. */
export const DOLLARS_MESSAGE = 'an amount in dollars, such as 5.00 or 1,250.00';

/**
 * Up to ten whole digits, bare or with commas between groups of three, and at most two places. The commas are
 * exact ("1,250", never "1,25" or "12,50"), so a misplaced one is refused rather than read as some other amount.
 */
const DOLLARS = /^(\d{1,10}|\d{1,3}(,\d{3}){1,2}|\d(,\d{3}){3})(\.\d{1,2})?$/;

/**
 * A dollar amount as a form field takes it: an optional leading "$" (spaces may follow it), the whole dollars bare
 * or grouped by commas, and at most two places ("5", "$5.00", "1,250.50"); no sign. Read as integer cents by
 * parseAmount once the "$" and commas are dropped. The one schema every settings save reads dollars with.
 */
export const dollarsField = z
  .string()
  .trim()
  .transform((text) => text.replace(/^\$\s*/, ''))
  .pipe(z.string().regex(DOLLARS, DOLLARS_MESSAGE))
  .transform((text) => parseAmount(text.replaceAll(',', '')));

/**
 * Stored cents, as canonical integer text ("500"), as the dollars a form is pre-filled with ("5.00"), which
 * dollarsField reads back to the same cents. Refuses text that is not canonical cents rather than guess.
 */
export function dollarsForInput(centsText: string): string {
  return formatCents(parseCents(centsText));
}
