'use client';

import { Input, Label } from '@tp/ui';
import type { ComponentProps, ReactNode } from 'react';

import { EmptiedNote, FieldError, type SecretKind, describedBy, useEmptied, useFieldIssue } from './form-issues';

/**
 * The shared form fields (PRD 6, Cross-cutting: labels on every control). Each reads the refusal its form shows
 * (FormIssuesContext, docs/adr/0077): the message under the control, aria-invalid on it, and the message first in its
 * description, then its hint. `error` overrides what the form gives; a field outside a form that refuses shows nothing.
 * `errorName` names the field in the form's summary when its label is a sentence, and `issueFor` lists the other keys
 * a refusal may give it (a hidden field it stands for); both are written on the control, beside its label.
 * Each field may shrink to its column (min-w-0, and a select no wider than it), so a long option never widens a form
 * past a phone's width. A page with several forms gives each field its own id.
 */

/** The props every labelled field takes, beside its control's own. */
interface FieldProps {
  readonly label: string;
  readonly name: string;
  readonly hint?: string;
  /** The message to show, in place of the one the form's refusal gives this field. */
  readonly error?: string;
  /** The field's name in the form's summary, when its label is a sentence. */
  readonly errorName?: string;
  /** Other keys a refusal may give this field. */
  readonly issueFor?: readonly string[];
}

/** The attributes that mark and name a refused control. */
export function controlMarks(
  id: string,
  parts: { readonly error: string | undefined; readonly hint: string | undefined; readonly emptied?: boolean; readonly errorName?: string | undefined; readonly issueFor?: readonly string[] | undefined },
) {
  return {
    'aria-invalid': parts.error === undefined ? undefined : true,
    'aria-describedby': describedBy(id, parts),
    'data-error-name': parts.errorName,
    'data-issue-for': parts.issueFor === undefined || parts.issueFor.length === 0 ? undefined : parts.issueFor.join(' '),
  } as const;
}

/** A field's hint, under its control and any message. */
export function Hint({ id, hint }: { readonly id: string; readonly hint: string | undefined }) {
  return hint === undefined ? null : (
    <p id={`${id}-hint`} className="text-xs text-muted-foreground">
      {hint}
    </p>
  );
}

/**
 * A labelled input. A one-time code (`autoComplete="one-time-code"`) is a secret: its form empties it after a refusal
 * (data-secret), and the field says so under it.
 */
export function Field({ label, name, hint, error, errorName, issueFor, id: given, ...props }: FieldProps & ComponentProps<'input'>) {
  const id = given ?? `field-${name}`;
  const shown = useFieldIssue(name, issueFor);
  const message = error ?? shown;
  const secret: SecretKind | undefined = props.autoComplete === 'one-time-code' ? 'code' : undefined;
  const emptied = useEmptied(secret);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={name} data-secret={secret === undefined ? undefined : ''} {...controlMarks(id, { error: message, hint, emptied, errorName, issueFor })} {...props} />
      <FieldError id={id} error={message} />
      <EmptiedNote id={id} secret={secret} />
      <Hint id={id} hint={hint} />
    </div>
  );
}

/** A labelled select; any other select prop (onChange, disabled, a controlled value) passes through. */
export function SelectField({
  label,
  name,
  options,
  hint,
  error,
  errorName,
  issueFor,
  id: given,
  ...props
}: FieldProps & { readonly options: readonly { readonly value: string; readonly label: string }[] } & Omit<ComponentProps<'select'>, 'children'>) {
  const id = given ?? `field-${name}`;
  const shown = useFieldIssue(name, issueFor);
  const message = error ?? shown;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        name={name}
        className="h-9 max-w-full rounded-md border border-input bg-transparent px-2 text-sm"
        {...controlMarks(id, { error: message, hint, errorName, issueFor })}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <FieldError id={id} error={message} />
      <Hint id={id} hint={hint} />
    </div>
  );
}

/** A labelled multi-line text field. */
export function TextAreaField({ label, name, hint, error, errorName, issueFor, id: given, rows = 4, ...props }: FieldProps & { readonly rows?: number } & ComponentProps<'textarea'>) {
  const id = given ?? `field-${name}`;
  const shown = useFieldIssue(name, issueFor);
  const message = error ?? shown;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        name={name}
        rows={rows}
        className="rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        {...controlMarks(id, { error: message, hint, errorName, issueFor })}
        {...props}
      />
      <FieldError id={id} error={message} />
      <Hint id={id} hint={hint} />
    </div>
  );
}

/**
 * One checkbox and its label, a sentence (often a consequence the person confirms), with the message under it. The
 * box is marked and described; its wrapper carries data-invalid, which draws the refused rule down its left edge.
 * `errorName` is required: a sentence is no name for the form's summary ("Confirmation").
 */
export function CheckboxField({
  name,
  label,
  errorName,
  hint,
  value,
  defaultChecked,
  required,
  id: given,
}: {
  readonly name: string;
  readonly label: ReactNode;
  readonly errorName: string;
  readonly hint?: string;
  readonly value?: string;
  readonly defaultChecked?: boolean;
  readonly required?: boolean;
  readonly id?: string;
}) {
  const id = given ?? `field-${name}`;
  const error = useFieldIssue(name);
  return (
    <div data-slot="checkbox-field" data-invalid={error === undefined ? undefined : ''} className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          id={id}
          name={name}
          value={value}
          defaultChecked={defaultChecked}
          required={required}
          className="mt-0.5 size-4 shrink-0"
          {...controlMarks(id, { error, hint, errorName })}
        />
        <label htmlFor={id}>{label}</label>
      </div>
      <FieldError id={id} error={error} />
      <Hint id={id} hint={hint} />
    </div>
  );
}

/**
 * A group of checkboxes under a legend: one question with several answers (`components[]`), or a list to confirm item
 * by item. The route names the group by `issueKey` ("components", "kept"), written on the fieldset as data-issue-for,
 * so the form's summary names the group by its legend and the focus goes to its first box. The message sits inside
 * the fieldset after the legend and hint, and the fieldset's description names both.
 */
export function CheckboxGroup({
  legend,
  issueKey,
  options,
  hint,
}: {
  readonly legend: string;
  readonly issueKey: string;
  readonly options: readonly { readonly name: string; readonly value?: string; readonly label: ReactNode; readonly defaultChecked?: boolean; readonly required?: boolean }[];
  readonly hint?: string;
}) {
  const id = `group-${issueKey}`;
  const error = useFieldIssue(issueKey);
  return (
    <fieldset data-issue-for={issueKey} data-invalid={error === undefined ? undefined : ''} aria-describedby={describedBy(id, { error, hint })} className="flex min-w-0 flex-col gap-1.5">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      <Hint id={id} hint={hint} />
      <FieldError id={id} error={error} />
      <div className="flex flex-wrap gap-3 text-sm">
        {options.map((option, index) => (
          <label key={`${option.name}:${option.value ?? String(index)}`} className="flex items-center gap-1.5">
            <input
              type="checkbox"
              id={`${id}-${String(index)}`}
              name={option.name}
              value={option.value}
              defaultChecked={option.defaultChecked}
              required={option.required}
              className="size-4 shrink-0"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
