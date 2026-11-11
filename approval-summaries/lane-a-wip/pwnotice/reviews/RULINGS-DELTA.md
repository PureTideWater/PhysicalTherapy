# password-changed-notice: rulings on the review of the fix round's delta (W6, 2026-11-11)

Two adversarial reviewers read 68895f0f..ffa44ea9: sign-in, words and records (`reviews/delta-sec/findings.md`, DS-01
to DS-08) and database, worker and mail (`reviews/delta-db/findings.md`, DD-01 to DD-06). No blocking finding; six to
fix, eight notes. All are real. The head is 7da699b1 (one test-only commit after ffa44ea9, for CI's PostgreSQL 18.6).

## Rulings

D1. **DS-03 and DD-01 (the same finding, found twice): the second-factor sentence follows `mfa_enrolled` as the claim
finds it, so whoever completed a reset from outside the app's gate can enrol their own authenticator before the send
and the email then says a second factor guards the account.** NOT built in this pull request. The right fix keeps the
fact as it was at the reset (a column of `password_notice` written by the reset's trigger, returned by the claim). It
changes the table, the trigger and the claim, and the trigger is what the next schema pull request already replaces
(`LANES.md` Queues item 28, in build, stacked on this one). It is reachable only while the user pool's client is public
(before ADR 0088's release N+1, which ruling 15 puts before the first customer invitation), as SEC-03 itself was, and
it is unproven at Cognito. In this pull request: D4 and D10 say it plainly, Not covered names it with its fix and where
it rides, and the description lists it for the founder as a fourth case. The orchestrator is asked to queue it with
item 28.

D2. **DD-03.** The migration is NOT edited. The preflight's comment there says the two replaced bodies and the
policy's WITH CHECK expression are compared whole, which is what it does; it does not say what is left uncompared (the
two CHECKs it rewrites, the policy's roles and command, the functions' grants and settings). ADR 0091 D11 says both
plainly. Why not the comment itself: W6's one-command edit through the marker route was refused by the session's
built-in safety check (the command removes the marker in a trap, inside a shell script the check cannot read), W6 does
not work around that check, and a comment's precision is not worth a second route. The migration, the document and its
hash (6002e2af…ea33) therefore stand as CI verified them on 7da699b1. No comparison is added either: no migration can
come to sort before this one in a chain that merges one schema pull request at a time.

D3. **DD-02.** Built: the job's line `password notice record failed` is counted on the platform log group and alarmed
at one in five minutes, so the first copy of a notice whose record fails pages, not the fifth 81 minutes later. Its
description leads to runbook 3.10's `RecordFailed` case.

D4. **DS-01.** Built as the finding writes it: on the page for a failed provider sign-out, a `hardware_key_registered`
row is the sign; a `sign_in` by authenticator code is the person's own and ends no membership; the statement starts
from the reset's own row (the same `request_id`), not the web task's log time. The alarm's words, D10 and
`security-events.ts` say the same.

D5. **DS-02.** Built as the finding writes it: the statement that finds a user's practices keeps only practices of the
user's own organization (`actor_kind = 'user'`, `grant_id IS NULL`, not `feature_flag_set`), and no row means tell no
one there and take the user ID to the founder.

D6. **DS-04 to DS-08, words:** case (b) is only ever one of PaidWhole's own accounts that must sign in with a hardware
key and has none (never a customer's), and removing a key already registered is `LANES.md` Queues item 29, not yet
assigned; the only-administrator account's break-glass words; tokens taken at Cognito directly outlive the 15 minutes
while the client is public; the undelivered alarm's words cover `RecordFailed`; D15's fourth unreported reset (a web
task stopped between Cognito's answer and the line).

D7. **DD-06.** `.gitattributes` pins LF for `packages/db/migrations/*.sql` (the preflight's body hashes are of the
file's bytes). The session setting is not pinned: it fails closed and nothing in the stack sets it.

## Deferred, added to the Follow-ups of `approval-summaries/lane-a-auth-emails-status.md`
- D1 above (with Queues item 28).
- DD-04: a failed queue delete after a record that paused the screening stream logs no `MAIL_STREAM_PAUSED` (the base's
  order, kept by ruling; a test pins it; the follow-up moves the pause before the delete and turns the test round).
- DD-05: the lock tests do not see a lock taken before the loop, a sleep with all three held, or a loop of fewer
  tries: three assertions for the next migration that copies the loop.
