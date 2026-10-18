import { Input, Label } from '@tp/ui';
import type { ComponentProps } from 'react';

/** A labelled input (PRD 6, Cross-cutting: labels on every control). A page with several forms gives each field its own id. */
export function Field({ label, name, hint, id: given, ...props }: { readonly label: string; readonly name: string; readonly hint?: string } & ComponentProps<'input'>) {
  const id = given ?? `field-${name}`;
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
  id: given,
  defaultValue,
}: {
  readonly label: string;
  readonly name: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly required?: boolean;
  readonly id?: string;
  readonly defaultValue?: string;
}) {
  const id = given ?? `field-${name}`;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select id={id} name={name} required={required} defaultValue={defaultValue} className="h-9 rounded-md border border-input bg-transparent px-2 text-sm">
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** A labelled multi-line text field. */
export function TextAreaField({
  label,
  name,
  hint,
  id: given,
  rows = 4,
  ...props
}: { readonly label: string; readonly name: string; readonly hint?: string; readonly rows?: number } & ComponentProps<'textarea'>) {
  const id = given ?? `field-${name}`;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        name={name}
        rows={rows}
        aria-describedby={hint === undefined ? undefined : `${id}-hint`}
        className="rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        {...props}
      />
      {hint === undefined ? null : (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}
