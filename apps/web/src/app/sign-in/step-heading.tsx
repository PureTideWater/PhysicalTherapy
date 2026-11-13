import type { ReactNode } from 'react';

import type { SetupMarker } from '../../lib/routes/sign-in';

/**
 * A sign-in step's heading, with an invited person's setup step as its caption (docs/adr/0081 D7; UX-128; test matrix
 * SGN-04): "Step 1 of 2" in small type over the step's name, which a screen reader and a list of headings read as
 * "Step 1 of 2: Choose a password", the name said once and the colon heard, not seen. The server counts the steps
 * (lib/routes/sign-in.ts); null is a step that is not numbered. `arrival` lets the heading take the focus when the step
 * arrives at a new state of the same screen (register-key's ArrivalHeadingFocus, after the right code).
 */
export function StepHeading({ setup, arrival = false, children }: { readonly setup: SetupMarker; readonly arrival?: boolean; readonly children: ReactNode }) {
  return (
    <h1
      tabIndex={arrival ? -1 : undefined}
      data-arrival-heading={arrival ? '' : undefined}
      className="text-[2rem] font-bold leading-display tracking-display"
    >
      {setup === null ? null : (
        <span data-slot="step-marker" className="block text-sm font-medium tracking-normal text-muted-foreground">
          Step {setup.at} of {setup.of}
          {/* Unseen but in the line: an out-of-flow `sr-only` span would make Chromium read "Step 1 of 2 : Choose…". */}
          <span className="opacity-0">: </span>
        </span>
      )}
      {children}
    </h1>
  );
}
