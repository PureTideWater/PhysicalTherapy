import { z } from 'zod';

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

/** A form's required text field. Its two messages are instructions, read after the field's name ("Your name: fill this in"). */
export const requiredText = (max: number) => z.string().trim().min(1, 'fill this in').max(max, `enter at most ${String(max)} characters`);

export const emailAddress = z.string().trim().toLowerCase().pipe(z.email('an email address'));

/** A code as an authenticator app shows or copies it ("123 456", "123-456"): spaces and hyphens are dropped. */
export const sixDigitCode = z
  .string()
  .max(32)
  .transform((value) => value.replace(/[\s-]/g, ''))
  .pipe(z.string().regex(/^\d{6}$/, 'enter the six digits your authenticator app shows'));
