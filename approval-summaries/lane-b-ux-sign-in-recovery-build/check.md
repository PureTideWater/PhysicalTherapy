# Adversarial check: UX PR 7, sign-in recovery (co-001/ux-sign-in-recovery @ 44cb1e4d)

The worktree was not touched: `git status` is empty and HEAD is 44cb1e4d. The mutations ran in a scratch copy at
`sgn7b/mut/tree`, which has no .git and no .next. Results are in `sgn7b/mut/results.txt` and the logs are in `sgn7b/mut/*.log`.
Heavy runs were under /tmp/laneb-heavy.lock. Database tests used 5433.

## Blocking (B)

None.

## Should fix (S)

**S-1. Half of SEC-B1, `mfa_enrolled`, is not pinned by any test.**
- Evidence. Mutation M1 changed `sign-in.ts:322` from `account?.status === 'active' && account.mfa_enrolled` to
  `account?.status === 'active'`. It survived 44 of 44 db tests. The real-clock probe under M1 mailed a code to an
  active account with no second factor (`probe-M1.json`: mailed `known, activeNotEnrolled, locked`).
- Cause. Every "not enrolled" row in both SGN-05 tests is `status: 'invited'`
  (`sign-in.db.test.ts:394`, `sign-in-routes.db.test.ts`, the SGN-05 "answers a request alike" case). The status
  half of the gate alone excludes those rows.
- Why it matters. No app path writes active with `mfa_enrolled = false` today: `record_sign_in_with_mfa` sets both
  together. But the design (1, 4.2) and ADR A2 make UX PR 65's console factor reset clear `mfa_enrolled` on an active
  account. That is exactly the case this half of the gate exists for, and nothing pins it.
- Fix. Add an active, not-enrolled row to both SGN-05 tests (`person({ totp: false })` in the routes test,
  `person({ mfa: false, totp: false })` in the flow test). Assert the same redirect and cookies, no provider call, no
  mail, `password_reset_requested` recorded, and the floor.

**S-2. The confirm's rate limit is not pinned by any test, although SGN-06 claims it.**
- Evidence. Three mutations of `resetConfirm` all survived 44 of 44:
  - M5: `rateAccount: pendingAccount`, the cookie. The design (4.3) rejects this key because each request mints a new
    one.
  - M5b: `rateAccount: () => undefined`.
  - M5c: `rateLimit: 'mfa'` with no account key.
- The SGN-06 row says "the confirm counts in `sign_in` by the sealed address". The swapped-email guard is covered (M4
  killed). The count itself is not, so a later edit could quietly multiply code guesses by about 4: one request, then
  free guesses per new cookie.
- Fix. In `sign-in-routes.db.test.ts`, request a code, spend the address's `sign_in` count with `spendSignIn(email)`,
  and assert that `resetConfirm` with the right code is `rate_limited` and the password is unchanged. Optionally, a
  password attempt after N confirms is refused, to show the count is shared.

**S-3. A provider or audit failure gives real accounts a different status, so accounts can be told apart during an
outage. This is a design gap; it needs a ruling.**
- The design (3.2, row 3) rethrows a non-swallowed `ForgotPassword` error, such as `InternalErrorException`, a network
  failure or an unexpected Lambda error. Its reason: "it can happen for any address, so it leaks nothing". SEC-B1 made
  that false: the provider is now called only for an active, enrolled account (`sign-in.ts:322`).
- The same holds for the audit insert, which runs only for an account.
- What happens. The flow sleeps to the floor and rethrows (`finally`, correct per SEC-N2). `publicRoute` rethrows
  (`invoke.ts:403`), and the server action 500s. An unknown, invited or disabled address still gets
  `?reason=code_sent`.
- So whenever Cognito returns a non-swallowed error, every real account answers differently from a non-account. This
  contradicts 4.2, "Every address gets the same status".
- An attacker cannot easily trigger it, but can watch for it.
- Recommended. In `requestPasswordReset`, catch a send or audit failure. Log `password reset request failed` at error
  with `{ request_id, error_code }`, so it can be alarmed with SEC-N6's metric, and answer `code_sent` like every other
  path. Then record the change in ADR A2.
- This changes a ruled row of the design ("a broken provider never says check your email"), so it goes to the
  design's owner and is not a silent fix. The notice already reads "If an account uses the address you typed…".

## Notes (N)

- N-1. M23 survived: replacing `timingSafeEqual` with `===` passes `dev-provider.test.ts:257`. The design (6.1)
  allowed "a length-mismatch case that does not throw", and a plain compare passes that too. This is dev-twin only.
- N-2. These mutations were equivalent or not observable, so no test is missing:
  - M6, `KEEPS_EMAIL.reset = true`: the reset step is written by `resetRequest`, never through `settle`.
  - M28, `error.message` added to the Cognito warn: the logger drops the field that is not on the allowlist, and the
    test's message carrying the address still passes.
  - M31, the floor started after the lookup: the lookup is uniform and the injected clock does not move during it.
  - M11, my first mutation, was equivalent. M11b and M11c (the phase binding dropped) were killed.
- N-3. Registry citations: `dev-provider.test.ts` is listed for SGN-05 and SGN-07, but only its describe cites
  SGN-06. `sign-in-routes.db.test.ts` and `e2e/sign-in.spec.ts` are listed for SGN-08 and do not cite it. The
  repository's convention is loose (120 of 494 listed files do not cite their ID), and `fixtures.test` checks only the
  matrix rows.
- N-4. Phase 1's `?reason=step_expired` notice has the title "Reset step closed". The design gives only the text, and
  the title is consistent with the house words.
- N-5. The forgot page's `closesIn` on arrival is about 898.5 s, because `startedAt` is taken before the 1.5 s floor
  while the cookie's Max-Age (900) runs from the write. This is uniform across classes and harmless.
- N-6. The e2e reset journey changes the `reset` persona's password, so a Playwright retry of that test in the same run
  would fail on the old password. CI uses a fresh database, so it does not happen there.
- N-7. Status: the status file's 07:15Z entry ("the merge no longer waits on #102", the repository is public again)
  contradicts the task's "the merge waits on the founder's runner (#102)" and design 8. The orchestrator should
  reconcile them before the PR body is written.

## Checked and holding

- **Known and unknown answer alike.** This was run, on the real clock, with no injected pace, in
  `sgn7b/mut/tree/apps/web/src/lib/routes/zz-probe.db.test.ts`. There were 7 classes (known, unknown, invited,
  invited with a password but not enrolled, active not enrolled, disabled, locked), each run 3 times.
  - Every response is `ok` with a redirect to `/sign-in/forgot-password?reason=code_sent`.
  - Cookies written are `[tp_sign_in]` and cookies deleted are `[tp_sign_in_email]`.
  - The phase 2 data is the same apart from a jitter of ±2 ms in `closesIn`.
  - Elapsed times were 1503 to 1521 ms for every class.
  - Codes went only to known and locked. No address appeared in any log line.
  - The db tests also pin it on the injected clock, including the thrown paths (M3 and M15b killed).
- **SEC-B1 (status half).** M2 killed. The dev twin's temporary guard: M20 killed.
- **Swapping the confirm's email.** The swap is refused with no provider call (M4 killed; spy in the test). The
  request is counted by the typed address and the count is shared with password attempts (test). See S-2 for the
  confirm's own count.
- **Second factor after a reset.** The dev twin keeps TOTP and keys (M25 killed). The next sign-in gives
  `/sign-in/mfa` in the db test and the e2e. A locked account stays locked: M34, an unlock on reset, was killed.
- **Sessions end.** Revoke (M8 killed), the provider sign-out after the revoke (M9 and M32 killed), the retry once
  (M18 killed). A request revokes nothing (M33 killed). The audit event on request: M16 killed.
- **A wrong code counts no failure.** M19 killed. The dev cap (M21c killed in both the unit and db tests), expiry
  (M22 killed) and the policy before the provider (M24 and M29 killed). In Cognito, the mapping rows (M26, M27 and
  M30 killed).
- **Kept email.** It is never written for a reset step. It is written only after a proven reset with
  `use: 'chosen'`, never for locked (M7 killed) or disabled (M17 killed). The request ends a kept email (M10 killed).
- **Pending step.** It is 900 s with a 120 s warning. It closes at 900 s on both the page and the confirm, landing on
  `?reason=step_expired`. "Use a different email" and "Back to sign in" clear the cookie and land on an empty phase 1
  and on `/sign-in` (M13 killed). The e2e reloads to confirm no step is left live. Restart with no `to` on a reset
  goes to the forgot page.
- **UXS-01.** `KEY_RESTART` from verify and from a provider expiry (M12 killed). The e2e covers a closed key step.
- **Logs, URLs and errors.** Logs carry only `request_id`, `error_code`, `elapsed_ms` and `user_id`. There is a
  rate-limit warn (M14 killed). `Destination` and `error.message` are never logged. URLs carry closed reason codes
  only, and the e2e checks that no `@` appears in any navigated URL. The `mailto:` links have no subject or body (e2e
  regex).
- **Words.** Checked line by line against design 2.1 to 2.3: the help list (6 items, D-1 to D-3), the locked refusal
  and D-4 notice, `password_reset` with and without a kept email, `password_reset_locked`, phase 1 and 2 titles,
  descriptions, hints and buttons, "No email?", the timer's warning and closed words, `code_sent`, `step_expired`, the
  lost-factor lines, and the code email in the dev outbox. All match.
- **Focus.** `ArrivalNotice` is used for `password_reset`, `password_reset_locked`, `code_sent` (keyed by `startedAt`,
  refocused after Send a new code, e2e) and `step_expired`. Refusal summaries use ActionForm's focus. The code and
  password fields are emptied, since one-time-code and password inputs are secrets in `form-issues.tsx:464`.
- **Matrix.** SGN-05 to SGN-08 match design 6.3 word for word in both `test-matrix.md` and `matrix.ts`
  (script-compared). The intro sentence was updated.
- **ADR 0081.** The amendment is word for word design 5's quoted text, placed before "Revisit when", with the four
  new revisit items. The status line is kept.
- **Runbook.** Sections (a) to (e) are present.
