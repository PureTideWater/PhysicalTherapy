'use server';

import { type ActionState, runAction } from '../../lib/http/next';
import { screeningSubmit } from '../../lib/screening/routes';

/**
 * The form's fields as the browser built them. A form's multipart encoding turns every line break in a field into
 * CRLF (the HTML standard's multipart/form-data encoding), so the canonical rows, one per line joined by a line feed
 * and holding no carriage return, arrive with CRLF between them: they are read back as the browser built them.
 */
function asBuilt(form: FormData): FormData {
  const built = new FormData();
  for (const [name, value] of form.entries()) {
    built.append(name, typeof value === 'string' && name === 'rows' ? value.replaceAll('\r\n', '\n') : value);
  }
  return built;
}

/** Sends a screening's rows of totals (public; src/lib/screening/routes.ts). The file itself never reaches the server. */
export async function submitScreeningAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(screeningSubmit, asBuilt(form));
}
