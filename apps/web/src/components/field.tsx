import { Input, Label } from '@tp/ui';
import type { ComponentProps } from 'react';

/** A labelled input (PRD 6, Cross-cutting: labels on every control). */
export function Field({ label, name, hint, ...props }: { readonly label: string; readonly name: string; readonly hint?: string } & ComponentProps<'input'>) {
  const id = `field-${name}`;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={name} aria-describedby={hint === undefined ? undefined : `${id}-hint`} {...props} />
      {hint === undefined ? null : (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

export function SelectField({
  label,
  name,
  options,
  required,
}: {
  readonly label: string;
  readonly name: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly required?: boolean;
}) {
  const id = `field-${name}`;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select id={id} name={name} required={required} className="h-9 rounded-md border border-input bg-transparent px-2 text-sm">
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
