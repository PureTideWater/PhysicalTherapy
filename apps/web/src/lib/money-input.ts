import { formatCents, parseAmount, parseCents } from '@tp/money';
import { z } from 'zod';

/**
 * Money a person types, and the stored cents a form is pre-filled with (PRD 6, Cross-cutting: integer cents, never
 * a float). The two are each other's inverse over every amount a save can store, [0, 99,999,999,999] cents:
 * `dollarsField.parse(dollarsForInput(text))` is the cents `text` names, so a form saved unchanged changes nothing
 * (test matrix CAS-39). Pure, and safe to import in the browser.
 */

/**
 * A dollar amount as a form field takes it: up to nine whole digits and at most two places, no sign or separator
 * ("5", "5.0", "5.00"), read as integer cents by parseAmount. The one schema every settings save reads dollars with.
 */
export const dollarsField = z
  .string()
  .trim()
  .regex(/^\d{1,9}(\.\d{1,2})?$/, 'dollars and cents, such as 5.00')
  .transform((text) => parseAmount(text));

/**
 * Stored cents, as canonical integer text ("500"), as the dollars a form is pre-filled with ("5.00"), which
 * dollarsField reads back to the same cents. Refuses text that is not canonical cents rather than guess.
 */
export function dollarsForInput(centsText: string): string {
  return formatCents(parseCents(centsText));
}
