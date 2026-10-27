'use client';

import { Input, Label } from '@tp/ui';
import { type ComponentProps, type ReactNode, useLayoutEffect, useState } from 'react';

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

/** A field's hint, under its control and any message: 14 px, as the message beside it (ADR 0056's type scale). */
export function Hint({ id, hint }: { readonly id: string; readonly hint: string | undefined }) {
  return hint === undefined ? null : (
    <p id={`${id}-hint`} className="text-sm text-muted-foreground">
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

/**
 * The chosen option's text when the select cuts it short, else null. The select is compared with a hidden copy of
 * itself that holds that option alone, so the browser's own arrow and padding count, and nothing is guessed from a
 * font. The copy is gone before the browser paints.
 */
function cutChoice(select: HTMLSelectElement): string | null {
  const text = select.selectedOptions[0]?.text ?? '';
  if (text === '' || select.clientWidth === 0) {
    return null;
  }
  const copy = document.createElement('select');
  copy.className = select.className;
  copy.style.cssText = 'position: absolute; visibility: hidden; width: auto; max-width: none';
  copy.setAttribute('aria-hidden', 'true');
  copy.tabIndex = -1;
  copy.append(new Option(text));
  select.after(copy);
  // Padding boxes: a refused select's wider border is not the text's room.
  const needed = copy.clientWidth;
  copy.remove();
  return needed > select.clientWidth ? text : null;
}

/**
 * What `showChosen` shows: the select's chosen text while the select cuts it short. Read from the page, not the props,
 * so a value the person chose, kept after a refusal or restored by the browser counts; measured once mounted, on each
 * change, after the form resets, when the select's size or the window's changes (16 px below md, 14 px above), and once
 * the fonts load.
 */
function useCutChoice(id: string, enabled: boolean, shape: string): string | null {
  const [cut, setCut] = useState<string | null>(null);
  useLayoutEffect(() => {
    const select = document.getElementById(id);
    if (!enabled || !(select instanceof HTMLSelectElement)) {
      return undefined;
    }
    let live = true;
    const measure = () => {
      if (live) {
        setCut(cutChoice(select));
      }
    };
    // The reset event comes before the form's values go back: measure once they have.
    const afterReset = () => {
      queueMicrotask(measure);
    };
    const form = select.form;
    const resized = new ResizeObserver(measure);
    measure();
    resized.observe(select);
    select.addEventListener('change', measure);
    form?.addEventListener('reset', afterReset);
    window.addEventListener('resize', measure);
    void document.fonts.ready.then(measure);
    return () => {
      live = false;
      resized.disconnect();
      select.removeEventListener('change', measure);
      form?.removeEventListener('reset', afterReset);
      window.removeEventListener('resize', measure);
    };
  }, [id, enabled, shape]);
  return cut;
}

/** One of a select's options. */
interface Choice {
  readonly value: string;
  readonly label: string;
}

/** Options under a heading the list shows and no one chooses (an optgroup: a payer's contracts under its name). */
interface ChoiceGroup {
  readonly group: string;
  readonly options: readonly Choice[];
}

function choiceText(choice: Choice): string {
  return `${choice.value}\u0000${choice.label}`;
}

function choiceOption(choice: Choice) {
  return (
    <option key={choice.value} value={choice.value}>
      {choice.label}
    </option>
  );
}

/**
 * A labelled select; any other select prop (onChange, disabled, a controlled value) passes through, and its options may
 * stand under headings. With `showChosen`, a select whose chosen text it cuts short (16 px at a phone's width) shows
 * that text whole on a line under it: a long run, policy or contract name stays readable without opening the list.
 * The line is aria-hidden, since a screen reader reads the select's value whole; it is measured in the browser, so a
 * page without JavaScript shows none.
 */
export function SelectField({
  label,
  name,
  options,
  hint,
  error,
  errorName,
  issueFor,
  showChosen = false,
  id: given,
  ...props
}: FieldProps & {
  readonly options: readonly (Choice | ChoiceGroup)[];
  /** Show the chosen text whole under the select while the select cuts it short. */
  readonly showChosen?: boolean;
} & Omit<ComponentProps<'select'>, 'children'>) {
  const id = given ?? `field-${name}`;
  const shown = useFieldIssue(name, issueFor);
  const message = error ?? shown;
  // Measured again when the options or a controlled value change.
  const shape = options.flatMap((option) => ('group' in option ? [option.group, ...option.options.map(choiceText)] : [choiceText(option)])).join('\u0001');
  const chosen = useCutChoice(id, showChosen, `${shape}\u0002${String(props.value)}`);
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
        {options.map((option, index) =>
          'group' in option ? (
            <optgroup key={`group-${String(index)}`} label={option.group}>
              {option.options.map(choiceOption)}
            </optgroup>
          ) : (
            choiceOption(option)
          ),
        )}
      </select>
      {chosen === null ? null : (
        <p data-slot="chosen-text" aria-hidden="true" className="text-sm break-words">
          {chosen}
        </p>
      )}
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
 * so the form's summary names the group by its legend and the focus goes to its first box. A box the route refuses
 * under its own name (`applyNcci`; `confirm_<id>`) is the group's too: its message shows in the group, and the summary
 * names it by the box's own label, or by the legend when the boxes are `itemized`. The message sits inside the
 * fieldset after the legend and hint, and the fieldset's description names both.
 */
export function CheckboxGroup({
  legend,
  issueKey,
  options,
  hint,
  itemized = false,
}: {
  readonly legend: string;
  readonly issueKey: string;
  readonly options: readonly { readonly name: string; readonly value?: string; readonly label: ReactNode; readonly defaultChecked?: boolean; readonly required?: boolean }[];
  readonly hint?: string;
  /**
   * A list confirmed item by item, each box its own key (`confirm_<id>`) and its label a sentence, which is no name for
   * the summary: a refused box is named by the legend.
   */
  readonly itemized?: boolean;
}) {
  const id = `group-${issueKey}`;
  // The boxes' own keys (a group posting one name[] has none beyond issueKey).
  const boxKeys = [...new Set(options.map((option) => (option.name.endsWith('[]') ? option.name.slice(0, -2) : option.name)))].filter((key) => key !== issueKey);
  const error = useFieldIssue(issueKey, boxKeys);
  return (
    <fieldset
      data-issue-for={[issueKey, ...boxKeys].join(' ')}
      data-invalid={error === undefined ? undefined : ''}
      aria-describedby={describedBy(id, { error, hint })}
      className="flex min-w-0 flex-col gap-1.5"
    >
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
              data-error-name={itemized ? legend : undefined}
              className="size-4 shrink-0"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
