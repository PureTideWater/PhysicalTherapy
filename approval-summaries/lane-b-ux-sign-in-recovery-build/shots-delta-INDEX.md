# Delta after shots: UX PR 7, sign-in recovery, round 2 (head e156d948)

Taken 2026-11-04 11:37Z on e156d948 (clone sgn7e/clone; tour dir sgn7e/tour-delta, copied from sgn7c/tour-after with
its forgot-password block and locked-reason patch, paths rewritten, spec otherwise unchanged). Fresh prepare, populate
skipped (TOUR_SKIP_POPULATE=1; these states need no populated records), synthetic personas only. 9 shots, 0 skipped.
Server stopped 11:37:30, port free, tp_e2e_screens dropped. Names match sgn7c/shots-after (0bd5721a); PNGs in png/,
entries in shots.json. Diff = pixel bbox against the 0bd5721a shot, top-aligned.

| Shot | Path | Counterpart (0bd5721a) | What changed |
| --- | --- | --- | --- |
| png/sign-in.default.1280.png | /sign-in | sgn7c/shots-after/png/sign-in.default.1280.png | control: identical (no diff) |
| png/sign-in-forgot-password.code-sent.1280.png | /sign-in/forgot-password?reason=code_sent | sgn7c/shots-after/png/sign-in-forgot-password.code-sent.1280.png | 1295 -> 1359 px: No-email list reordered, fifth support item; Back to sign in in link blue (the synthetic address differs by run) |
| png/sign-in-forgot-password.code-sent.390.png | same | sgn7c/shots-after/png/sign-in-forgot-password.code-sent.390.png | 1351 -> 1415 px: same changes, wraps evenly |
| png/sign-in-forgot-password.code-sent.1280-dark.png | same | sgn7c/shots-after/png/sign-in-forgot-password.code-sent.1280-dark.png | same changes; Back to sign in now visible (dark link token on Paper) |
| png/sign-in-forgot-password.error-malformed.1280.png | /sign-in/forgot-password | sgn7c/shots-after/png/sign-in-forgot-password.error-malformed.1280.png | only the two message lines: "enter an email address" |
| png/sign-in-forgot-password.error-malformed.390.png | same | sgn7c/shots-after/png/sign-in-forgot-password.error-malformed.390.png | same |
| png/sign-in.reason-password-reset-locked.1280.png | /sign-in?reason=password_reset_locked | sgn7c/shots-after/png/sign-in.reason-password-reset-locked.1280.png | only the notice's title and text |
| png/sign-in.reason-password-reset-locked.390.png | same | sgn7c/shots-after/png/sign-in.reason-password-reset-locked.390.png | same (one line longer inside the notice; height unchanged) |
| png/sign-in.reason-password-reset-locked.1280-dark.png | same | sgn7c/shots-after/png/sign-in.reason-password-reset-locked.1280-dark.png | same |
