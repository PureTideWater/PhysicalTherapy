import { parseAmount } from '@tp/money';
import { z } from 'zod';

/** The save's dollars field, as settings.ts, workbench.ts and the console each write it today. */
export const dollarsField = z
  .string()
  .trim()
  .regex(/^\d{1,9}(\.\d{1,2})?$/, 'dollars and cents, such as 5.00')
  .transform((text) => parseAmount(text));

/** STUB, tests first: what the defaults page pre-fills at c5195ee, the stored cents text as it is. */
export function dollarsForInput(centsText: string): string {
  return centsText;
}
