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

export const requiredText = (max: number) => z.string().trim().min(1, 'required').max(max, `at most ${String(max)} characters`);

export const emailAddress = z.string().trim().toLowerCase().pipe(z.email('an email address'));

export const sixDigitCode = z.string().trim().regex(/^\d{6}$/, 'the six-digit code from your authenticator app');
