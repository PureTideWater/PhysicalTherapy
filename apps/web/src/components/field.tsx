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
 * `describedBy` names text elsewhere on the page that describes the control too, after its own message and hint: a
 * rule a card says once for several fields (the support card's no-patient-information rule), so no hint repeats it.
 * Each field may shrink to its column (min-w-0, and a select no wider than it), so a long option never widens a form
 * past a phone's width. A page with several forms gives each field its own id.
 */

/**
 * Words a field shows: plain text, or text in runs when some are set as the page sets a figure, a code or a hash (Plex
 * Mono with tabular numerals; BRAND.md 5): an option's label (the submissions page's SHA-256) or a hint (the example
 * procedure codes of Coverage's letter). Nothing is guessed from the words.
 */
export type FieldWords = string | readonly ChoiceText[];

/** The props every labelled field takes, beside its control's own. */
interface FieldProps {
  readonly label: string;
  readonly name: string;
  readonly hint?: FieldWords;
  /** The message to show, in place of the one the form's refusal gives this field. */
  readonly error?: string;
  /** The field's name in the form's summary, when its label is a sentence. */
  readonly errorName?: string;
  /** Other keys a refusal may give this field. */
  readonly issueFor?: readonly string[];
  /** The id of text elsewhere on the page that describes this field too, read after its message and hint. */
  readonly describedBy?: string;
}

/** The attributes that mark and name a refused control. */
export function controlMarks(
  id: string,
  parts: {
    readonly error: string | undefined;
    readonly hint: FieldWords | undefined;
    readonly emptied?: boolean;
    readonly errorName?: string | undefined;
    readonly issueFor?: readonly string[] | undefined;
    /** The id of text elsewhere on the page that describes the control too (FieldProps' `describedBy`). */
    readonly also?: string | undefined;
  },
) {
  return {
    'aria-invalid': parts.error === undefined ? undefined : true,
    'aria-describedby': describedBy(id, { ...parts, hint: parts.hint === undefined ? undefined : labelText(parts.hint) }),
    'data-error-name': parts.errorName,
    'data-issue-for': parts.issueFor === undefined || parts.issueFor.length === 0 ? undefined : parts.issueFor.join(' '),
  } as const;
}

/**
 * A field's hint, under its control and any message: 14 px, as the message beside it (ADR 0056's type scale). Every
 * hand-written hint uses it too (D9, held by form-hints.test.ts); `className` adds layout only, such as a measure for a
 * hint whose box is as wide as its column. A hint given in runs sets each `mono` run as the page sets a code.
 */
export function Hint({ id, hint, className }: { readonly id: string; readonly hint: FieldWords | undefined; readonly className?: string }) {
  return hint === undefined ? null : (
    <p id={`${id}-hint`} className={className === undefined ? 'text-sm text-muted-foreground' : `${className} text-sm text-muted-foreground`}>
      {setWords(hint)}
    </p>
  );
}

/**
 * A labelled input. A one-time code (`autoComplete="one-time-code"`) is a secret: its form empties it after a refusal
 * (data-secret), and the field says so under it. Like a password (PasswordField), it turns off spell checking,
 * autocorrect and autocapitalisation, so no browser's spelling service reads it, and writes those and its marker after
 * the caller's props, so none undoes them.
 */
export function Field({ label, name, hint, error, errorName, issueFor, describedBy: also, id: given, ...props }: FieldProps & ComponentProps<'input'>) {
  const id = given ?? `field-${name}`;
  const shown = useFieldIssue(name, issueFor);
  const message = error ?? shown;
  const secret: SecretKind | undefined = props.autoComplete === 'one-time-code' ? 'code' : undefined;
  const emptied = useEmptied(secret);
  const secretMarks = secret === undefined ? {} : ({ 'data-secret': '', spellCheck: false, autoCorrect: 'off', autoCapitalize: 'none' } as const);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={name} {...controlMarks(id, { error: message, hint, emptied, errorName, issueFor, also })} {...props} {...secretMarks} />
      <FieldError id={id} error={message} />
      <EmptiedNote id={id} secret={secret} />
      <Hint id={id} hint={hint} />
    </div>
  );
}

/** The chosen option when the select cuts its text short: its value, and its text as the select holds it. */
interface CutChoice {
  readonly value: string;
  readonly text: string;
}

/**
 * The chosen option when the select cuts its text short, else null. The select is compared with a hidden copy of
 * itself that holds that option alone, so the browser's own arrow and padding count, and nothing is guessed from a
 * font. The copy is gone before the browser paints.
 */
function cutChoice(select: HTMLSelectElement): CutChoice | null {
  const option = select.selectedOptions[0];
  const text = option?.text ?? '';
  if (option === undefined || text === '' || select.clientWidth === 0) {
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
  return needed > select.clientWidth ? { value: option.value, text } : null;
}

/**
 * What `showChosen` shows: the select's chosen option while the select cuts its text short. Read from the page, not
 * the props, so a value the person chose, kept after a refusal or restored by the browser counts; measured once
 * mounted, on each change, after the form resets, when the select's size changes, when the controls' text size does
 * (16 px below md, 14 px above, which may leave the box as it was), and once the fonts load.
 */
function useCutChoice(id: string, enabled: boolean, shape: string): CutChoice | null {
  const [cut, setCut] = useState<CutChoice | null>(null);
  useLayoutEffect(() => {
    const select = document.getElementById(id);
    if (!enabled || !(select instanceof HTMLSelectElement)) {
      return undefined;
    }
    let live = true;
    const measure = () => {
      if (live) {
        const next = cutChoice(select);
        // The same option cut again keeps the state, so a resize renders nothing new.
        setCut((before) => (before !== null && next !== null && before.value === next.value && before.text === next.text ? before : next));
      }
    };
    // The reset event comes before the form's values go back, and a reset button's press runs a microtask before they
    // do too: measure in a task of its own, once they have.
    const afterReset = () => {
      setTimeout(measure, 0);
    };
    const form = select.form;
    const resized = new ResizeObserver(measure);
    const textSize = window.matchMedia('(width < 48rem)');
    measure();
    resized.observe(select);
    select.addEventListener('change', measure);
    form?.addEventListener('reset', afterReset);
    textSize.addEventListener('change', measure);
    void document.fonts.ready.then(measure);
    return () => {
      live = false;
      resized.disconnect();
      select.removeEventListener('change', measure);
      form?.removeEventListener('reset', afterReset);
      textSize.removeEventListener('change', measure);
    };
  }, [id, enabled, shape]);
  return cut;
}

/**
 * A run of an option's or a hint's words. `mono` sets it as the page sets a figure, a code or a hash (Plex Mono with
 * tabular numerals; BRAND.md 5): the native list draws every option in the system's face, but the line `showChosen`
 * writes under the select, like a hint, is page text.
 */
interface ChoiceText {
  readonly text: string;
  readonly mono?: boolean;
}

/**
 * One of a select's options. Its label is its words, or those words in runs when some are set in Plex Mono on the
 * chosen-text line (a document's SHA-256): the option holds the runs joined, so the line never says other words.
 */
interface Choice {
  readonly value: string;
  readonly label: FieldWords;
}

/** Options under a heading the list shows and no one chooses (an optgroup: a payer's contracts under its name). */
interface ChoiceGroup {
  readonly group: string;
  readonly options: readonly Choice[];
}

/** Words as plain text, their runs joined: an option's as the list holds it, a hint's for its control's description. */
function labelText(label: FieldWords): string {
  return typeof label === 'string' ? label : label.map((run) => run.text).join('');
}

/** Words as the page sets them: each `mono` run in Plex Mono with tabular numerals, the others as plain text. */
function setWords(words: FieldWords): ReactNode {
  return typeof words === 'string'
    ? words
    : words.map((run, index) =>
        run.mono === true ? (
          <span key={String(index)} className="font-mono tabular-nums">
            {run.text}
          </span>
        ) : (
          run.text
        ),
      );
}

function choiceText(choice: Choice): string {
  return `${choice.value}\u0000${labelText(choice.label)}`;
}

function choiceOption(choice: Choice) {
  return (
    <option key={choice.value} value={choice.value}>
      {labelText(choice.label)}
    </option>
  );
}

/**
 * The chosen-text line's words: the cut option's runs, a mono run set as the page sets it, when the option the select
 * holds is still the one given with those words; else the text the select holds.
 */
function ChosenWords({ cut, options }: { readonly cut: CutChoice; readonly options: readonly (Choice | ChoiceGroup)[] }) {
  const choice = options.flatMap((option) => ('group' in option ? option.options : [option])).find((option) => option.value === cut.value);
  // An option's text, as the select holds it, has its runs of white space collapsed and its ends trimmed.
  if (choice === undefined || typeof choice.label === 'string' || labelText(choice.label).replace(/\s+/g, ' ').trim() !== cut.text) {
    return cut.text;
  }
  return setWords(choice.label);
}

/**
 * A labelled select; any other select prop (onChange, disabled, a controlled value) passes through, and its options may
 * stand under headings. With `showChosen`, a select whose chosen text it cuts short (16 px at a phone's width) shows
 * that text whole on a line under it: a long run, policy or contract name stays readable without opening the list.
 * The line is aria-hidden, since a screen reader reads the select's value whole; it is measured in the browser, so a
 * page without JavaScript shows none. It is page text, so an option given in runs sets its mono runs as the page does.
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
  describedBy: also,
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
  // Measured again when the options or a controlled value change; read only for a select that shows its choice.
  const shape = showChosen ? options.flatMap((option) => ('group' in option ? [option.group, ...option.options.map(choiceText)] : [choiceText(option)])).join('\u0001') : '';
  const chosen = useCutChoice(id, showChosen, `${shape}\u0002${String(props.value)}`);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        name={name}
        className="h-9 max-w-full rounded-md border border-input bg-transparent px-2 text-sm"
        {...controlMarks(id, { error: message, hint, errorName, issueFor, also })}
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
          <ChosenWords cut={chosen} options={options} />
        </p>
      )}
      <FieldError id={id} error={message} />
      <Hint id={id} hint={hint} />
    </div>
  );
}

/** A labelled multi-line text field. */
export function TextAreaField({
  label,
  name,
  hint,
  error,
  errorName,
  issueFor,
  describedBy: also,
  id: given,
  rows = 4,
  ...props
}: FieldProps & { readonly rows?: number } & ComponentProps<'textarea'>) {
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
        {...controlMarks(id, { error: message, hint, errorName, issueFor, also })}
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
