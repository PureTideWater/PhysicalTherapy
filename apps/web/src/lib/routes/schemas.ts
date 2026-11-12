import { z } from 'zod';

import { isRegistrationCodeShaped, normalizeRegistrationCode } from '../auth/registration-code';

/**
 * Shared input schemas. URLs and forms carry opaque IDs only (PRD 7, Information architecture
 * rules): every ID is a UUID, normalized to lowercase.
 */
export const opaqueId = z.uuid().transform((value) => value.toLowerCase());

/** A form's optional text field: blank means absent. */
export function optionalText<T extends z.ZodType<string>>(schema: T) {
  return z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? undefined : typeof value === 'string' ? value.trim() : value), schema.optional());
}

/** A form's optional field of any type: blank means absent; anything else must pass the schema. */
export function blankOptional<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? undefined : value), schema.optional());
}

/** A required field left blank: an instruction, read after the field's name ("Your name: fill this in"). */
export const FILL_THIS_IN = 'fill this in';

/** Text over a field's length: an instruction, read after the field's name ("Your name: enter at most 200 characters"). */
export const atMostCharacters = (max: number) => `enter at most ${String(max)} characters`;

/** A form's required text field. Its two messages are instructions, read after the field's name ("Your name: fill this in"). */
export const requiredText = (max: number) => z.string().trim().min(1, FILL_THIS_IN).max(max, atMostCharacters(max));

/**
 * A role the organization's kind does not hold (a group's roles for a firm, say). The form lists only the roles it holds,
 * so the step is to choose one of them; never the raw kind ("group") the database names.
 */
export const ROLE_NOT_LISTED = 'choose one of the roles listed';

/**
 * The message a public form gives text that looks like an identifier, a date or a phone number (the audit request, the
 * screening and its convert form): one sentence after the field's name, with no colon of its own (ADR 0077).
 */
export const NO_PATIENT_INFORMATION = 'this form takes no patient information; remove anything that looks like an identifier, a date or a phone number, then send it again';

/** An email field; its message is an instruction like requiredText's ("Email: enter an email address"). */
export const emailAddress = z.string().trim().toLowerCase().pipe(z.email('enter an email address'));

/** A code as an authenticator app shows or copies it ("123 456", "123-456"): spaces and hyphens are dropped. */
export const sixDigitCode = z
  .string()
  .max(32)
  .transform((value) => value.replace(/[\s-]/g, ''))
  .pipe(z.string().regex(/^\d{6}$/, 'enter the six digits your authenticator app shows'));

/**
 * The one-time code that opens key registration after a removal (docs/adr/0095), as a person types what was read to
 * them: spaces and hyphens are dropped and the letters upper-cased. Only the shape is checked here, which says nothing
 * of whether the code is right and is no secret; a code of the wrong shape never reaches the database, so it counts no try.
 */
export const registrationCode = z
  .string()
  .max(32)
  .transform(normalizeRegistrationCode)
  .refine((code) => code === '' || isRegistrationCodeShaped(code), 'enter the eight letters and digits of the code PaidWhole gave you')
  .refine((code) => code !== '', 'fill this in');

