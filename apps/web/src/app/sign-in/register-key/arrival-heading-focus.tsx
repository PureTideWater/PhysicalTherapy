'use client';

import { useEffect } from 'react';

/**
 * After the right code the same screen shows the key step: the form that held the focus is gone, so the focus goes to
 * the step's heading (StepHeading's `arrival`), and a screen reader reads where the person now is. Only when nothing
 * holds the focus, as the sign-in notices do (components/arrival-focus.tsx). It renders nothing.
 */
export function ArrivalHeadingFocus() {
  useEffect(() => {
    const active = document.activeElement;
    if (active === null || active === document.body) {
      document.querySelector<HTMLElement>('h1[data-arrival-heading]')?.focus();
    }
  }, []);
  return null;
}
