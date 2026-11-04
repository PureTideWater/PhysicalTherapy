# PR #108 (UX PR 7, sign-in recovery): the UX and brand review of the build

**Not completed.** The review set up its clone (sgn7c/clone-ux-brand at 6b25ed60), the tour (sgn7c/tour-after, with the
locked-reason patch and a local forgot-password, notices and UXS-01 block) and its TOUR_ONLY list (96 ids), but its
build stopped at 09:26Z before any shot, and it reported no findings: the fix round's confirmed, refuted and sound lists
were empty. Its record is sgn7c/progress/review-ux-brand.progress.md.

## The after shots, taken in the fix round
The fix round moved the clone to the pushed head 0bd5721a and ran the same tour: 96 shots, 0 skipped
(10:25-10:33Z, fresh prepare, populate 11 passed, synthetic personas only). Index: /tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/sgn7c/shots-after/INDEX.md.
51 match the before set by name (/tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/sgn7c/../sgn7b/shots-before/INDEX.md, base df4daff7); 42 are new on the head (the
forgot-password page's 11 states and three arrival notices (password_reset, password_reset_locked, password_reset with the email kept), each at 1280 light, 1280 dark and 390); the 3
`sign-in-hardware-key.key-step-closed` shots have the password page as their before (UXS-01).

## Owed
A UX and brand reviewer's pass over these shots against design 2 and brand.md, with a skeptic per B/S finding. The
words in the shots were not changed in the fix round (S-3 and N-1 change no visible text).
