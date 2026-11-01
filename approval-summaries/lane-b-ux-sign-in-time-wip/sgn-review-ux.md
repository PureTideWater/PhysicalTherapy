# sgn-review-ux progress
- clone: scratchpad/uxrev at e4e05a0d
- shots: screens-after missing; screens-before-2 flagged invalid by capture -> no pairs; code-only review
- read: step-timer.tsx, arrival-focus.tsx, step-heading.tsx, notice.tsx, 6 pages, routes/sign-in.ts, hardware-key.tsx, e2e helpers, design 6.1/6.2/2.6-2.9/9
- strings: all match 6.1
- findings so far: (1) key-step expiry lands on password page (verifyHardwareKey RESTART) - should-fix; (2) ArrivalFocus wraps role=status Alert -> possible double announce - should-fix plausible; (3) limit sentence on reload states full limit, not time left - should-fix; (4) register-key words omit code - nit; (5) cue-in-view not asserted on new-password confirm field - nit
- DONE: findings returned (4: 3 should-fix, 2 nits merged); shots none valid
