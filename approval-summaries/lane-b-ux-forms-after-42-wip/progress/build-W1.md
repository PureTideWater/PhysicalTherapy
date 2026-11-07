# build-W1 progress (slice W1, the #42 words)

Worktree /home/user/ufa42-w1, branch co-001/wip-ux-forms-after-42-w1, base 31a7345f. Installed.
Logs: /tmp/claude-0/-home-user-PhysicalTherapy/88c94db6-fc7b-5c57-a2b7-5dda4f5b392f/scratchpad/ufa42/logs/w1-*
(red: w1-cN-*-red.log, green: w1-cN-*-green.log, typecheck: w1-cN-typecheck.log). DB tests on 5433.

## Commits
1. 132a0918 ZIP wording (2.4) - red/green unit+db, typecheck ok
2. 27915508 console refusals + ROLE_NOT_LISTED (2.5 console rows, role rows incl. settings) - red/green, typecheck ok
3. 4097b557 correspondence + settings words (2.5 settings/correspondence rows; 2.7 W1 settings.ts:267, :426, :902; extra settings.ts:284 minutes) - red/green, typecheck ok

4. 80403463 public forms (2.6) + payer list refused on the list (field "payers", not "payers.0") + screening field() bound "enter at most N characters" - red/green, typecheck ok
5. 38979484 screeningReasonMessage (2.7) - red/green, typecheck ok
6. 2ea55e5b support.ts :249 :379 + support-mail WITHHELD_MESSAGE - red/green, typecheck ok
7. 953cab93 screeningPage appOrigin: services.origin - red/green, typecheck ok

8. aeb3f242 e2e forms-keep-input: no-JS screening step (FRM-06), :310 W2's mismatch words. Red at base (w1-c8-e2e-red.log: GET with fields in the query string); green with U's diff overlaid then reverted (w1-c8-e2e-green-with-U.log, 2 passed incl. the audit-request test with the new NO_PATIENT_INFORMATION).

## DONE, pushed
Head aeb3f242987b1843dff6e3f8c1ae523380bee38b pushed to origin/co-001/wip-ux-forms-after-42-w1 (fast-forward, hook). Final typecheck, lint, lint:copy, lint:logs all pass (w1-c8-typecheck.log, w1-lint*.log).

## Not mine / reported
- e2e/onboarding.spec.ts:573 (slice E) still pins "Billing ZIP: five digits, or ZIP+4 such as 27601-1234"
- forms-keep-input :310 needs W2's sign-in.ts words; the no-JS step needs U's method="post"
- console-onboarding.ts:224 'a date (YYYY-MM-DD)' (also tagging.ts, abstraction.ts, mapping.ts, terms-form.ts): not W1's files
- practice_has_administrator.sql message has ': ' (Postgres text; needs a migration)
