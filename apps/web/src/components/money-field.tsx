import type { ComponentProps } from 'react';

import { Field } from './field';

/** A money field's label as the form shows it, with its unit: "Per line (dollars)". */
export function moneyLabel(label: string, unit = 'dollars'): string {
  return `${label} (${unit})`;
}

/**
 * A labelled input for an amount in dollars (PRD 6, Cross-cutting: integer cents, typed as dollars): the label says
 * the unit, the keyboard is the decimal one, and the figure is set in the mono face with tabular numerals, as
 * <Money> sets the same amount beside it (brand: every money figure in mono). Pre-filled with dollarsForInput, it
 * reads back through the save as the same cents (test matrix CAS-39).
 */
export function MoneyField({
  label,
  unit,
  ...props
}: { readonly label: string; readonly unit?: string; readonly name: string; readonly hint?: string; readonly error?: string } & Omit<ComponentProps<'input'>, 'inputMode' | 'className'>) {
  return <Field label={moneyLabel(label, unit)} inputMode="decimal" className="font-mono tabular-nums" {...props} />;
}
