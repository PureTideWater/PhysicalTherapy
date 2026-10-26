/**
 * A server action's form, as its route reads it (docs/adr/0053): text fields by name, never the framework's own
 * fields, and a checkbox group as one comma-joined field.
 */

/** A form's fields; a field named with [] (a group of checkboxes) is its checked values, comma-joined, under its name. */
export function formInput(form: FormData): Record<string, string> {
  const input: Record<string, string> = {};
  for (const [name, value] of form.entries()) {
    // Required, not tidiness: a form sent from the browser (useGuardedSubmit, docs/adr/0077) builds its FormData from
    // the DOM, which holds the framework's $ACTION_* hidden fields, so they reach the action and stop here.
    if (typeof value !== 'string' || name.startsWith('$ACTION')) {
      continue;
    }
    if (name.endsWith('[]')) {
      const key = name.slice(0, -2);
      input[key] = input[key] === undefined ? value : `${input[key]},${value}`;
    } else {
      input[name] = value;
    }
  }
  return input;
}
