import { Input, Label } from '@tp/ui';
import type { ComponentProps } from 'react';

/** The ids that describe a control: its error first (read first), then its hint. */
function describedBy(id: string, hint: string | undefined, error: string | undefined): string | undefined {
  const ids = [error === undefined ? null : `${id}-error`, hint === undefined ? null : `${id}-hint`].filter((part) => part !== null);
  return ids.length === 0 ? undefined : ids.join(' ');
}

/** What the server refused of a field, under it: tied to the control by aria-describedby, which aria-invalid marks. */
function FieldError({ id, error }: { readonly id: string; readonly error: string | undefined }) {
  return error === undefined ? null : (
    <p id={`${id}-error`} className="text-xs text-destructive" data-field-error>
      {error}
    </p>
  );
}

/**
 * A labelled input (PRD 6, Cross-cutting: labels on every control). A page with several forms gives each field its own id.
 * Each field may shrink to its column (min-w-0, and a select no wider than it), so a long option never widens a form
 * past a phone's width. `error`, when the server refused the field, shows under it, marks it invalid and describes it.
 */
export function Field({
  label,
  name,
  hint,
  error,
  id: given,
  ...props
}: { readonly label: string; readonly name: string; readonly hint?: string; readonly error?: string } & ComponentProps<'input'>) {
  const id = given ?? `field-${name}`;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={name} aria-describedby={describedBy(id, hint, error)} aria-invalid={error === undefined ? undefined : true} {...props} />
      <FieldError id={id} error={error} />
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
  error,
}: {
  readonly label: string;
  readonly name: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly required?: boolean;
  readonly id?: string;
  readonly defaultValue?: string;
  readonly error?: string;
}) {
  const id = given ?? `field-${name}`;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        name={name}
        required={required}
        defaultValue={defaultValue}
        aria-describedby={describedBy(id, undefined, error)}
        aria-invalid={error === undefined ? undefined : true}
        className="h-9 max-w-full rounded-md border border-input bg-transparent px-2 text-sm"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <FieldError id={id} error={error} />
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
    <div className="flex min-w-0 flex-col gap-1.5">
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
