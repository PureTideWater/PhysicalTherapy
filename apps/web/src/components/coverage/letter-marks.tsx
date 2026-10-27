'use client';

import { useEffect } from 'react';

import { forgetRefusalUrl } from '../forget-refusal';

/** A marked control and the message under it, by their element ids (letter.tsx). */
export interface LetterMarkIds {
  readonly control: string;
  readonly message: string;
}

/** A control, as its mark is read and cleared (an input or a select; a test passes a fake). */
export interface MarkedControl extends EventTarget {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

/** A marked control, the message that says its mark (null when the page has none) and that message's id. */
export interface LetterMark {
  readonly control: MarkedControl;
  readonly message: Pick<HTMLElement, 'hidden'> | null;
  readonly messageId: string;
}

/** An aria-describedby's ids without one of them, in order; null when none is left. */
export function describedWithout(describedBy: string | null, id: string): string | null {
  const rest = (describedBy ?? '').split(/\s+/).filter((each) => each !== '' && each !== id);
  return rest.length === 0 ? null : rest.join(' ');
}

/**
 * Clears a control's mark while it still has one: aria-invalid (and with it the destructive border), and its message,
 * hidden and taken out of the control's aria-describedby (a hidden message it still named would still be read), its
 * hint kept. The message is hidden, never removed: React owns it, and takes it out itself once the page renders with no
 * refusal.
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
 * mark, and a letter sent (submit, which the browser fires only once its own checks pass) loses them all, a refusal of
 * the pair being one the person may answer by changing the other control; then sent() runs. Returns the function that
 * stops.
 */
export function watchLetterMarks(form: EventTarget, marks: readonly LetterMark[], sent: () => void): () => void {
  const edits = marks.map((mark) => ({
    control: mark.control,
    edited: () => {
      clearMark(mark);
    },
  }));
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
  form.addEventListener('submit', submitted);
  return () => {
    for (const { control, edited } of edits) {
      control.removeEventListener('input', edited);
      control.removeEventListener('change', edited);
    }
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
 * again comes back to a new address with its own marks. Until the person edits or sends, the marks and entries survive
 * a reload. Renders nothing.
 */
export function LetterMarks({ marks, forget }: { readonly marks: readonly LetterMarkIds[]; readonly forget: readonly string[] }) {
  useEffect(() => {
    const found = marks.flatMap((ids) => {
      const control = document.getElementById(ids.control);
      return control instanceof HTMLInputElement || control instanceof HTMLSelectElement ? [{ control, message: document.getElementById(ids.message), messageId: ids.message }] : [];
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
