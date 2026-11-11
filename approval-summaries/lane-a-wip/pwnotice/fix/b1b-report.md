All four items are built under `/home/user/pwnotice/apps/web/` and green. The e2e journey was changed by reading and was not run.

## 1. R2 (SEC-02): the account is looked up before the provider's confirm

- **Files:** `/home/user/pwnotice/apps/web/src/lib/auth/sign-in.ts` (`confirmPasswordReset`, now lines 507-563: the lookup is its first statement, and the docblock says the order and why). `/home/user/pwnotice/apps/web/src/lib/auth/sign-in.db.test.ts` (two new cases, a `reachableWhile` pool helper, and one line in the existing no-account case asserting the provider holds the new password).
- **Red:** `DATABASE_URL=postgres://postgres:test@localhost:5433/<db> flock /tmp/laneb-heavy.lock pnpm -s exec vitest run --project db apps/web/src/lib/auth/sign-in.db.test.ts` with `sign-in.ts` untouched: 2 failed, 37 passed (39). Case one: the old password was refused at the provider twin after a confirm during the outage. Case two: the confirm threw the lookup's error instead of answering `sessions_not_ended`. Output: `<W6 scratchpad>/fix/b1b/red-sign-in.txt`
- **Green:** same command after the change: 39 passed (39). Final run with the reset routes, the mail console routes and the seed test: 4 files, 76 passed. Output: `<W6 scratchpad>/fix/b1b/green-final.txt`
- **Wrong variants fail:** the final test file against the flow as committed fails the same 2; skipping the provider when there is no account fails 2; swallowing the lookup's error fails 1. Output: `<W6 scratchpad>/fix/b1b/mutants.out`
- **What case one shows:** the confirm rejects with the database's error, the provider was never asked, the old password still passes the twin's first step and the new one does not, the session stays, and no event or notice exists. The same code then completes the reset once the database answers.
- **What case two shows:** `security event: password reset sessions not ended` is logged once with the user's ID and the request's, the provider still signs out, and the answer is `sessions_not_ended`.
- **Behaviour under an outage:** every confirm now throws before the provider is asked. Before, a wrong code and a weak password were still answered, and only the right code threw, after the password had changed.

**Why the new order tells an outsider nothing new about which addresses have accounts:**
1. The lookup's result is not read until the provider has answered `reset`, which takes the mailed code. A wrong code, a weak password and a refused credential get the same answer, the same log line and no write, account or none. The provider is asked for both.
2. A lookup that throws is the database's failure, the same for every address.
3. The only new thing is one read's timing on the refusal path. `sign_in_account` costs about 14 µs more for an address with an account (28 against 14 µs server-side, 5,000 synthetic users). The password step, the key step and the reset request already make that read first for any typed address. The password step then also writes a failure for a known address only, about 0.9 ms more database work here (1.10 against 0.23 ms), under the same `sign_in` limit of 20 per address per 15 minutes. So the confirm gives no signal the sign-in form does not already give more strongly.
   - Figures: `<W6 scratchpad>/fix/b1b/lookup-timing.out` and `<W6 scratchpad>/fix/b1b/bench.out`

## 2. R1 (SEC-01): the two open-residual cases

- **File:** `/home/user/pwnotice/apps/web/src/lib/auth/sign-in.db.test.ts`, each case under a three-line comment saying what closes it (a step begun before the account's latest completed reset is refused).
- **Names:**
  - `SGN-16, open residual (ADR 0091 D10): a step that proved the old password before a reset still opens a session when its code is answered after the reset, which queued its one notice; the close refuses it, and flips this case`
  - `SGN-16, open residual (ADR 0091 D10): a key-registration step begun before a reset still registers a key after it when the provider’s sign-out had no effect, and the reset queued its one notice; the close refuses it, and flips this case`
- **Red:** none by design; they record today's behaviour and are among the 37 that passed in the red run.
- **Green:** both pass in the 39.
- Case (b) makes the provider's sign-out fail and asserts `security event: password reset provider sign-out failed` with the user's ID, the line B3's `PasswordResetProviderSignOutFailed` counts. The twin's own sign-out ends no grant either.
- Review findings are cited as "review SEC-01 of 2026-11-11" and "review SEC-02 of 2026-11-11", B3's form, because the test matrix has its own SEC-01 and SEC-02.

## 3. UX-08: the console's label

- **Files:** `/home/user/pwnotice/apps/web/src/app/console/mail/page.tsx` line 17, as ruled. Also the docblock of `/home/user/pwnotice/apps/web/src/lib/routes/console-mail.ts` (comment only), whose list of undelivered customer messages now names the password-changed notices. That is beyond the letter of the item; drop it if unwanted.
- **Search:** no test, snapshot or e2e baseline pins the old label. Its only occurrence in the worktree was `page.tsx:17`. `mail-cutoff.spec.ts` opens the page but asserts no card title, and the `brand.spec.ts-snapshots` images are headers and report covers.
- **Red and green:** no test. Before, the old label occurred once and the new one nowhere; after, the reverse. `pnpm -s lint:copy` passes. Records: `<W6 scratchpad>/fix/b1b/ux08-before.txt` and `<W6 scratchpad>/fix/b1b/ux08-after.txt`

## 4. The e2e journey (not run)

- **Files:** `/home/user/pwnotice/apps/web/e2e/sign-in.spec.ts` (the journey now asserts lines 2, 3 and 4 of R4 in full, line 2 as the enrolled sentence); `/home/user/pwnotice/apps/web/e2e/mail.ts` (one docblock; it calls only `sendPasswordNotices`, whose options B1a kept compatible); `/home/user/pwnotice/apps/web/e2e/outbox.ts` (an optional `replyTo` on `OutboxMessage`).
- **Addition:** the journey also asserts `replyTo` is the support address (R5). B1a's local sender writes that key and its test says "where a journey reads it".
- **Not run:** Playwright needs a production build. `pnpm -s exec tsc -p apps/web --noEmit` is clean.
- **Checked without a browser:** the same assertions hold on the message `passwordNoticeMessage` builds and `LocalMailSender` writes, as B1a's files stood at 06:17 UTC. Output: `<W6 scratchpad>/fix/b1b/journey-words.out`

## Checks before finishing

- `pnpm -s exec eslint` on my seven files: clean.
- `pnpm -s lint:logs`: passes.
- `pnpm -s typecheck`: 23 projects passed at 06:16 UTC, with the other builders' files as they stood then.
- Unit tests of `apps/web`, `tools/brand-copy` and `infra/test/monitoring.test.ts`: 124 files, 1,792 passed. Infra's pin of the two log calls in `sign-in.ts` still matches.
- No scratch file is left in the worktree and `tp_fix_b1b_1` is dropped.

## Not done

- The other 55 database test files of the web were not run. I ran the four that exercise the flow, the reset routes, the mail console routes and the seed.
- No test was added for the label: the constant sits in a page file and cannot be imported, and I did not add an unrun assertion to `mail-cutoff.spec.ts`.

## Found, not foreseen by the rulings

1. **ADR 0091 line citations moved (B3's file).** `sign-in.ts:533-538`, cited twice, is now `539-544`; `sign-in.ts:532-546` is now `538-552`. `:356` and `:477` are unchanged.
2. **The weak-password path is the barest timing case.** The provider answers a weak password without a round trip, so nothing follows the read. Checking the password policy in the flow before the lookup would keep that path free of the read, at the cost of duplicating the provider's check. I did not build it; the ruling's order is as built.
3. **The answer's `locked` and `keepEmail` are read earlier.** They now come from a row read before the provider's call, so a lock or disable landing during that call is not in the answer; the next sign-in says it. The existing "disabled after the request" case still passes.
4. **Unproven: a lost provider answer.** If Cognito applies `ConfirmForgotPassword` and the answer is lost, the flow throws, or the SDK's default retry is answered as a spent code and the flow says `rejected`. The password has changed with no event, notice or page. The Cognito client is built with default retries (`services.ts:144`). The user's ID is now in hand at that point, so a counted line could close it. It needs a pool to prove.
