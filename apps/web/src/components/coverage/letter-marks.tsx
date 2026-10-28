'use client';

import { useEffect } from 'react';

import { forgetRefusalUrl } from '../forget-refusal';

/**
 * A marked control and the message under it, by their element ids (letter.tsx; the message is FieldError's
 * `{id}-error`), and the other controls whose change can answer its refusal (also: the payer, for a contract refused as
 * not the payer's).
 */
export interface LetterMarkIds {
  readonly control: string;
  readonly message: string;
  readonly also?: readonly string[];
}

/** A control, as its mark is read and cleared (an input or a select; a test passes a fake). */
export interface MarkedControl extends EventTarget {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  /**
   * Whether it holds now, its custom validity with the rest (the contract's is LetterContractCheck's), read as a value:
   * checkValidity() would fire an invalid event at a control that does not hold.
   */
  readonly validity: Pick<ValidityState, 'valid'>;
}

/**
 * A marked control, the line that says its mark (FieldError's: its icon, "Error:" and the message; null when the page
 * has none), the message's id, and the other controls whose change clears the mark once the control holds (none when
 * not given).
 */
export interface LetterMark {
  readonly control: MarkedControl;
  readonly message: Pick<HTMLElement, 'hidden'> | null;
  readonly messageId: string;
  readonly also?: readonly EventTarget[];
}

/** An aria-describedby's ids without one of them, in order; null when none is left. */
export function describedWithout(describedBy: string | null, id: string): string | null {
  const rest = (describedBy ?? '').split(/\s+/).filter((each) => each !== '' && each !== id);
  return rest.length === 0 ? null : rest.join(' ');
}

/**
 * Clears a control's mark while it still has one: aria-invalid (and with it the 2 px danger border), and its message,
 * its whole line hidden (the icon and "Error:" with it) and the message taken out of the control's aria-describedby (a
 * hidden message it still named would still be read), its hint kept. The line is hidden, never removed: React owns it,
 * and takes it out itself once the page renders with no refusal.
 */
export function clearMark(mark: LetterMark): void {
  if (mark.control.getAttribute('aria-invalid') !== 'true') {
    return;
  }
  mark.control.removeAttribute('aria-invalid');
  const described = describedWithout(mark.control.getAttribute('aria-describedby'), mark.messageId);
  if (described === null) {
    mark.control.removeAttribute('aria-describedby');
  } else {
    mark.control.setAttribute('aria-describedby', described);
  }
  if (mark.message !== null) {
    mark.message.hidden = true;
  }
}

/**
 * Watches a refused letter's marks until they no longer hold: a control the person edits (input, change) loses its own
 * mark; a change of one of its other controls (also) loses it once the control holds again (a refused pair the person
 * answers by changing the payer); and a letter sent (submit, which the browser fires only once its own checks pass)
 * loses them all, then sent() runs. The other controls' changes are read on the form, where they arrive as they bubble,
 * after every listener on the control itself has run, so the validity read is the one LetterContractCheck has just set
 * for the new pair. Returns the function that stops.
 */
export function watchLetterMarks(form: EventTarget, marks: readonly LetterMark[], sent: () => void): () => void {
  const edits = marks.map((mark) => ({
    control: mark.control,
    edited: () => {
      clearMark(mark);
    },
  }));
  const answered = (event: Event) => {
    for (const mark of marks) {
      if (mark.also?.some((other) => other === event.target) === true && mark.control.validity.valid) {
        clearMark(mark);
      }
    }
  };
  const submitted = () => {
    for (const mark of marks) {
      clearMark(mark);
    }
    sent();
  };
  for (const { control, edited } of edits) {
    control.addEventListener('input', edited);
    control.addEventListener('change', edited);
  }
  form.addEventListener('change', answered);
  form.addEventListener('submit', submitted);
  return () => {
    for (const { control, edited } of edits) {
      control.removeEventListener('input', edited);
      control.removeEventListener('change', edited);
    }
    form.removeEventListener('change', answered);
    form.removeEventListener('submit', submitted);
  };
}

/**
 * A refused letter's marks, cleared once they no longer hold (docs/adr/0079). The page marks the controls its URL's
 * refusal names, and a downloaded letter does not navigate, so without this a corrected letter would keep its "Error:"
 * and aria-invalid after it downloads, and a reload would put the refused entries back over the corrected ones. A
 * control the person edits loses its mark; a letter sent loses them all, and the refusal and the entries kept beside
 * it (forget) leave the address bar as ForgetRefusal takes them (replaceState with no state, so Next moves its
 * canonical URL too): a downloaded letter leaves a clean screen and a reload shows the plain form, and a letter refused
 * again comes back to a new address with its own marks. A mark that names other controls (also) is lost too once a
 * change of one of them makes its control hold. Until the person edits or sends, the marks and entries survive a
 * reload. Renders nothing.
 */
export function LetterMarks({ marks, forget }: { readonly marks: readonly LetterMarkIds[]; readonly forget: readonly string[] }) {
  useEffect(() => {
    const found = marks.flatMap((ids) => {
      const control = document.getElementById(ids.control);
      const also = (ids.also ?? []).flatMap((id) => document.getElementById(id) ?? []);
      const message = document.getElementById(ids.message);
      // FieldError's line, which holds the message beside its icon and "Error:", so all three go together.
      const line = message?.closest<HTMLElement>('[data-field-error]') ?? message;
      return control instanceof HTMLInputElement || control instanceof HTMLSelectElement ? [{ control, message: line, messageId: ids.message, also }] : [];
    });
    const form = found[0]?.control.form ?? null;
    if (form === null) {
      return undefined;
    }
    return watchLetterMarks(form, found, () => {
      const path = forgetRefusalUrl(window.location.href, forget);
      if (path !== null) {
        window.history.replaceState(null, '', path);
      }
    });
  }, [marks, forget]);
  return null;
}
