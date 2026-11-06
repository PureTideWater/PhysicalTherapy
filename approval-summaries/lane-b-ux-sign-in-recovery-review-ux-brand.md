# PR #108 (UX PR 7, sign-in recovery): the UX and brand review of the build, on 0bd5721a

Second UX and brand review, read only, over the code at head 0bd5721a and the shots: before
(sgn7b/shots-before/INDEX.md, base df4daff7, 51) and after (sgn7c/shots-after/INDEX.md, 0bd5721a, 96), with a skeptic
per finding (the first round's agent ended without output). Six findings: 2 should-fix and 4 nits, all confirmed, none
refuted. Dispositions are in the fix round's summary (round 2).

## Findings
| ID | Sev | Finding | Skeptic | Disposition |
| --- | --- | --- | --- | --- |
| UXB-S1 | S | The forgot-password page names no support contact, so a person no code reaches (a password set but no factor, filtered mail) can only resend: a dead end where the runbook expects these tickets | Real; supportEmail in the confirm phase only, so the request phase's toEqual checks hold | Fixed: a fifth item, the same for every address, "Still nothing after a new code: write to <support address> from the address you sign in with." (ecd6dbaa); e2e (aa640327) |
| UXB-S2 | S | A malformed email reads "Email: an email address", no instruction, departing from design 2.2 | Real; also improves onboarding and settings; console.ts's copy may follow | Fixed: `z.email('enter an email address')` in schemas.ts and console.ts, new schemas.test.ts red first (5e95a834); e2e (aa640327) |
| UXB-N1 | N | Phase 2's Back to sign in is a body-ink button, unlike phase 1's link, and vanishes in dark | nit | Fixed: `.pw-link-button` from the link tokens; e2e compares colours (4e4e5329) |
| UXB-N2 | N | The "No email?" list names its buttons in the reverse of their order | nit | Fixed: Send a new code first (c7a6a325) |
| UXB-N3 | N | A password-only refusal also empties the still-valid code | nit | Left as ruled, with the reason in ADR 0081 A1: one rule, every secret emptied on every refusal (WCAG 3.3.7 security exception), no submitted code left on an unattended page (aaa8a070) |
| UXB-N4 | N | The locked reset notice says "is locked", where the state is meant | nit | Fixed: "is still locked", title "Password changed, account still locked" (03e2f1f1) |

## Found sound (the reviewer's record, summarized)
D-1 to D-4 match design 2.1; the locked words (UX-066) on all three surfaces; the help list (h2, ul, design order,
mailto with no subject or body); the lost-factor lines; UXS-01 (the closed key step lands on the key page, focused);
the phase binding of reasons; phase 2's layout and fields (390 wrap, labels, hints, autocomplete, outline buttons in
every timer phase, the reset's own timer words); the refusals (one code refusal, issues on the right field, summary,
focus, the counted wait); the arrival notices; brand (Paper frame, tokens only, danger only on refusals, house voice);
focus outline; page titles. Dark is advisory (ADR 0056:127-130): the h2, both h1s and phase 2's Back to sign in were
not visible on Paper in 1280-dark; the last is fixed by UXB-N1.

## Not checked (as the reviewer recorded)
Screen-reader output and live announcements; the Tab order (markup only); phase 2 after a successful Send a new code;
the leave actions' pending states; the out-of-date, CSRF and connection refusals; the Cognito code email (Lane A);
contrast was judged by eye. No screen is declared accessible or WCAG conformant.

## Shots
The words changed in round 2 (UXB-S1, S2, N2, N4) and the Back to sign in colour (N1) are not in the 0bd5721a after
shots; they are asserted by notice.test.tsx, schemas.test.ts and the sign-in-time e2e. Retaking
`sign-in-forgot-password.{code-sent,error-malformed,error-wrong-code,closed,warning}.*` and
`sign-in.reason-password-reset-locked.*` on the new head is owed.

## Delta round, on e156d948 (2026-11-04)

The shots owed above, retaken on the head `e156d948` with the tour tool (`/home/user/ops/tools/lane-b-screen-tour`,
"From another lane"): 9 shots, none skipped and none failed, 11:37 UTC, fresh prepare, populate skipped (these states
need no records), synthetic personas only; server stopped, port free, the tour database dropped. Index
`/tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/sgn7e/shots-delta/INDEX.md`, each compared by pixel with the `0bd5721a` shot of the same name in `sgn7c/shots-after`.
- `sign-in.default.1280` (control): identical.
- `sign-in-forgot-password.code-sent.{1280,390,1280-dark}`: the "No email?" list in the new order with the fifth
  support item (UXB-S1, UXB-N2), Back to sign in in the link colour (UXB-N1), visible in dark.
- `sign-in-forgot-password.error-malformed.{1280,390}`: only the message, "enter an email address" (UXB-S2).
- `sign-in.reason-password-reset-locked.{1280,390,1280-dark}`: only the notice's title and text (UXB-N4).
- Not retaken: `error-wrong-code`, `warning`, `closed` (they share code-sent's list and button; the tests assert them).
- Checked: UXB-S1, S2, N1, N2 and N4 do what was asked; CO-11 and the brand words hold; light link 7.3:1 on Paper.

| ID | Sev | Finding | Skeptic | Disposition |
| --- | --- | --- | --- | --- |
| UXD-N1 | N | Dark (tokens only, advisory): phase 2's Back to sign in is now the dark link blue on the Paper frame, about 1.9:1 (as phase 1's link already is) | No verdict returned (none) | Recorded as a follow-up; no code change in #108 |

No blocker or should-fix, so nothing is open before merge. Not seen, by sample: the new `emailAddress` message on
onboarding, settings and the console invite. PR #108's description was updated to carry this result and the gate's O9
note (readback identical, 54,872 characters). Not committed.
