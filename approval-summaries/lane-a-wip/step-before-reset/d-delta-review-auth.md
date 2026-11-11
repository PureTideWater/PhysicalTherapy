# Delta review (auth): password notice keeps the second-factor fact at the reset
Delta 47c99ac7..1ae2952e (migration 20261112090000 section 6, password-notice.db.test.ts, ADR 0093 D10). Read-only.
SQL run in a scratch copy (dr4 from sbr, dropped). Counts: blocking 0, should-fix 2, note 5.
## Should-fix
S1. A second reset after enrolling brings the sentence back (case (d) in two steps). Verified in SQL.
  File: packages/db/migrations/20261112090000_sign_in_not_before.sql:345 (the trigger's subselect of u.mfa_enrolled).
  Scenario: mailbox reader resets the invitee's password with an outside code through the app (notice 1 kept=false),
  signs in, enrols their own authenticator (record_sign_in_with_mfa: invited -> active, mfa_enrolled=true). The account
  is now active and enrolled, so the app itself mails a reset code (sign-in.ts:766). They reset again: notice 2 is
  kept=true and its claim returns true. Scratch result: notices (f, t), claims (f, t), both due. The owner's latest
  email says "Signing in still asks for your authenticator code or hardware key" about the attacker's factor.
  Variant with one email only: the first reset is confirmed directly at the provider (public client; UNVERIFIED that
  Cognito accepts ConfirmForgotPassword there), so the app records nothing, then enrol, then one reset through the app.
  Smallest fix: in audit_event_password_notice() keep true only when the factor is not new: u.mfa_enrolled AND no
  enrolment of this account in the N days before NEW.at (the 'mfa_enrolled' audit event, sign-in.ts:593; UNVERIFIED
  that every enrolment path writes it, the hardware-key path was not read) AND no earlier password_notice of the
  account in that span with mfa_enrolled_at_reset IS NOT TRUE. Add the two-reset case to the db test. Until then ADR
  0093 D10 / ADR 0091 should not record case (d) as closed, only "between the reset and the send".

S2. The fact is read when the reset is RECORDED, not when the provider changed the password; an enrolment committed
  in between is kept as true. Verified in SQL for the ordering (kept=t); the timing is not measured.
  Files: apps/web/src/lib/auth/sign-in.ts:812-839 and 853-864; migration :345.
  Scenario: the provider answers confirmPasswordReset; before endedByReset's transaction takes the account's lock
  (pool wait, two statements; and the whole first try plus its lock_timeout when the first try fails and is retried),
  a sign-in begun after the provider's change with the new password finishes TOTP setup and openSession commits
  (sessions.ts:75-110: lock, session, record_sign_in_with_mfa in one transaction). No mark exists yet, so nothing
  refuses it. The reset then takes the lock, sweeps that session, and the trigger's statement (READ COMMITTED, new
  snapshot) reads mfa_enrolled = true. The step-before-reset rule does stop the other two orders: a step begun
  before the reset cannot hold the new password and is refused (began <= mark); one begun in the window whose session
  insert lands after the reset's commit is refused under the row lock (:215-217). Only "commit before the lock" wins.
  Normally the window is milliseconds against several provider round trips, so narrow; it widens with the retry.
  Smallest fix: S1's rule (an enrolment minutes old never yields the sentence) closes this too; no app change.

## Notes
N1. Both tries of endedByReset failing (sign-in.ts:839 'sessions_not_ended') records no event: no notice, no mark,
  password changed. An attacker then signs in and enrols with nothing refused and no email. Not this delta; the
  error line pages. Listed because it is the widest form of S2's window.
N2. password_reset_outcome_unknown queues no notice (trigger guard unchanged; scratch: the notice trigger's WHEN
  has no outcome_unknown). Still right for (d): the words would claim an unproved change, the mark moves and
  sessions end, the operator is paged. Residue: if the password did change, the owner hears only through the operator;
  a later repeat of the code is 'rejected' and writes nothing. An attacker cannot choose this outcome (UNVERIFIED:
  depends on provider timeouts only).
N3. Honest cases hold. Enrolled user who resets: kept=true, sentence sent (test :659). Factor cleared between reset
  and send: no code clears mfa_enrolled at all (the only writer is record_sign_in_with_mfa.sql:21, to true), so the
  case is hypothetical today. If a clear route is built, the stale sentence is harmless on current rules: an active
  account with no factor can neither enrol (enrolment needs status invited, sign-in.ts:244) nor open a session, so
  nothing is less guarded than the email says; add it to Revisit when. NULL (queued before the migration) -> false,
  the side that claims less; an enrolled user who reset just before the deploy loses one true sentence, harmless.
N4. Omitting the sentence tells a mailbox reader nothing new. Before the delta an unenrolled account's email also
  omitted it; whether an account is enrolled already shows in the mailbox by whether the app's reset request mails a
  code at all (sign-in.ts:766). The one new reading (omitted although now enrolled = enrolled after the reset) is
  known only to whoever enrolled.
N5. Still read at send time: "user".email (claim's join, migration :365). No function or route writes it (grep of
  packages/db/functions, apps/web/src, apps/worker/src), but tp_app holds UPDATE on the column (scratch:
  has_column_privilege = true), as ADR 0091 "Revisit when" already says. changed_at is kept on the notice; the support
  address is configuration. Nothing else an attacker can move between reset and send.

## Not checked
No test suite was run. Provider behaviour (direct ConfirmForgotPassword on the public client, timing of
AssociateSoftwareToken/VerifySoftwareToken) is unverified. The hardware-key enrolment path's audit event was not read.
