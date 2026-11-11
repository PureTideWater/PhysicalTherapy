# 0091. Tell an account's address when its password changes, from an outbox the database writes in the change's own transaction

- **Status:** proposed (Schema PR 1 of the queue after #126, `co-001/password-changed-notice`: part 2 of the auth emails,
  whose part 1 is #125; migration `20261111090000_password_changed_notice.sql`), as its three reviews of 2026-11-11
  left it (the last section lists what they changed). The founder's approval of the regenerated domain model (CO-02)
  accepts it. Adds to
  [0065](0065-send-mail-in-three-ses-streams-record-each-messages-delivery-send-notices-from-an-outbox-and-pause-the-screening-stream-alone.md)
  (the operator role also sends one kind, `password_changed`, on the transactional set; its dated note) and
  [0014](0014-audit-log-retention-classes-and-platform-jobs.md) (the platform job `password_notices`; its amendment).
  Closes the "password changed" item of
  [0081](0081-state-and-enforce-each-sign-in-steps-limit-warn-before-it-closes-and-start-again-with-the-email-kept.md)'s
  code-email amendment's Not covered, and #125's review finding ux-brand-N5; answers its finding security-N-3 with the
  line kept, two open cases recorded and their close required before launch (D10). That review handed both here. It
  changes three of #125's four lines (D5) and reverses no other ruling of theirs. It is its own decision, not an
  amendment: it adds a table, a mail kind, a platform job and an operator permission across ADR 0065's streams.
- **Date:** 2026-11-07; its review round, 2026-11-11
- **Deciders:** the founder, under the standing rule of 2026-10-18, by approving the domain model (CO-02); acting Lane A
  (S2), 2026-11-07, for the batching plan's rulings on this item (the 24-hour cutoff, D7; complained leaves the notice
  unchanged, D8; the notice's alarm pages, D9; security-N-3 and ux-brand-N5 closed with option (a), D10; ADR 0081 A6
  moved to Schema PR 6); the build, for the design addendum's choices A-1 to A-5 and D15; W6, 2026-11-11, under the
  co-founder's standing instruction, for the review round's rulings R1 to R11 (the last section). Each reversible by
  the founder
- **PRD sections:** 6 (Identity and sessions; the audit log; observability), 7 (Sign-in and MFA), 16 (logging
  discipline: IDs and codes, no address); `docs/product/sessions.md`; test matrix SGN-16; ADRs
  [0009](0009-database-roles-and-forward-only-migrations.md), 0014,
  [0049](0049-run-the-compute-on-fargate-behind-an-https-only-load-balancer-and-waf-migrate-before-traffic-moves-and-egress-through-nat-for-what-has-no-endpoint.md),
  0065, 0081,
  [0083](0083-read-a-months-triage-and-audit-report-in-batches-look-each-line-up-through-an-index-and-hold-only-a-small-measured-share-of-heap-per-line.md)
  and [0088](0088-a-confidential-cognito-client-and-second-factor-enrolment-only-inside-a-live-invitation.md)

## Context

A reset completed with the code sent to an account's mailbox changes the password at Cognito, and until now the
account's address heard nothing of it. #125 (ADR 0081, the code-email amendment) built the words of a "password
changed" email (`PASSWORD_CHANGED_SUBJECT`, `passwordChangedLines()` and `utcMinute()` in
`packages/auth-mail/src/words.ts`: when, in UTC to the minute, that every session of the account has ended and the
second factor is still asked, and the support route; no link and no "from where") and the worker template's `account`
variant, and nothing sent them. Sending them needs a migration:

- **The kind.** Every message carries its kind (`tp_kind`), and `mail_send_kind` and `mail_send_stream_kind`
  (migration `20261107090000_mail_streams.sql`) refuse `password_changed`. Sent as `cognito` or `digest` it would
  falsify the mail record (`cognito` takes no subject, and the invitation's state reads `cognito` sends).
- **The address.** A platform job runs as `tp_operator`, which has no policy on `"user"` and reads an address only
  through a narrow definer function. A practice job runs as `tp_app` for one practice, and a password belongs to an
  account. A job acting as the user (`withActor(user_id)`) would be a new kind of job acting as a person who is not
  present.

What changes a password today:

- **A completed reset**, and only that writes `password_reset_completed`: `SignInFlow.confirmPasswordReset`
  (`apps/web/src/lib/auth/sign-in.ts`), inside the `withActor(account.user_id)` transaction that also runs
  `revokeUserSessions`, as `actor_id` the user, `actor_kind` `user`, `object_type` `user`, `object_id` the user.
- **The invitation's first password** writes `password_changed` (`passwordChosen`, in the same file): the account's
  first password, chosen inside a live invitation by whoever holds its temporary password.
- Nothing else: the app calls no `ChangePassword`, `AdminSetUserPassword` or `AdminResetUserPassword`, and the
  application role is pinned against the last two (`infra/test/application-role.test.ts:15`).

Two facts of the base shape the decision:

- **The audit policy lets a user name any object.** `audit_event_record` (as `20261108090000_suspension_refusal.sql`
  left it) checks the actor, the actor's kind, the reserved actions and the practice, not the object. A trigger keyed
  on the action alone would let one user's write of `password_reset_completed` naming another user queue a notice to
  that other user's address.
- **A completed reset can record nothing.** Cognito has already changed the password when the `withActor` transaction
  runs. That transaction is tried twice inside a bare `catch {}`; if both tries fail, neither the revoke, the event nor
  anything the event would trigger exists. The web logs `security event: password reset sessions not ended` at error
  with the user's ID and the request's ID, still signs the account out at Cognito, and answers `sessions_not_ended`
  (ADR 0081 A5; review R-3; ADR 0088 D7). Until this decision no filter counted that line. And on the base the account
  was looked up after Cognito had changed the password, outside that retry: a lookup that failed (the database out of
  reach) threw before the line could be written, so that reset ended no session and left no record and no line at all
  (the review of 2026-11-11, SEC-02; D15).

## Decision

- **D1. The outbox.** An AFTER INSERT trigger on `audit_event`, `audit_event_password_notice`, writes one pending row
  of a new table, `password_notice`, in the reset's own transaction: it commits or rolls back with
  `revokeUserSessions` and the event, and no request can skip it, as no request can skip a support notice (ADR 0065
  D10). No request writes it either: the web's reset queues nothing itself. What this change does touch in the web is
  the order of the reset's lookup (D15) and the console's label for the transactional stream, which names the new
  kind; nothing else in the web changes. A platform job sends the notice within about a minute.
- **D2. What queues one.** `password_reset_completed` alone. Not the invitation's first password: a "was this you?"
  email to the same mailbox a second after the person chose it is noise, not safety. A future Settings change of
  password adds its own action to the trigger's WHEN in that pull request.
- **D3. The guard** (departure 1). The trigger's WHEN also requires `actor_kind = 'user'`, `object_type = 'user'` and
  `object_id = actor_id`: the actor is a person, the object is the actor, and the notice's user is that actor. A job's
  `service` actor and the database's `system` queue none; a NULL `actor_id` or `object_id` makes WHEN false. An event
  that does not match is still recorded and queues nothing, so no new refusal path exists. The trigger function is
  SECURITY DEFINER, owned by `tp_owner`, with `search_path` pinned, granted to no role (a trigger fires without
  EXECUTE), and fires for every role's insert. Its insert is `ON CONFLICT ON CONSTRAINT password_notice_once DO
  NOTHING`, and can fail only on the foreign key (the actor's own row, which `withActor` read in the same transaction)
  or a CHECK (every value is the event's own or a constant), so it can newly stop no reset from ending sessions.
- **D4. The table and the address.** `password_notice` is global: no `practice_id`, no PHI, no address and no name; the
  user's ID, the reset event's ID (`audit_event_id`, the idempotency key `password_notice_once`), the change's time, the
  send's state (`pending`, `sent`, `delivered`, `undelivered`, `failed`), its attempts, SES's message ID, an error code
  (letters only), the report stamp and the expiry. ENABLE and FORCE ROW LEVEL SECURITY, one owner-only policy
  (`password_notice_owner`), nothing granted to any role, revoked from PUBLIC and `tp_app`; it has no
  `phi_table_registry` row, since the catalog accepts a registry row only for a table with a NOT NULL `practice_id`.
  `user_id` keeps its foreign key to `"user"`. For a notice, the account's row is read in one place:
  `operator_password_notice_claim()`, for a pending notice that is due and under 24 hours old, under `FOR UPDATE SKIP
  LOCKED`, the cutoff checked again under the lock. It returns four columns: the user's ID, the address, the change's
  time and, fourth, `mfa_enrolled`, the one fact of the account's state the email's words depend on (D10). The address
  and the flag are read at send time, not at the reset: the address is the one the code went to for as long as no route
  changes `"user".email` (Revisit when). The flag is the account's as the claim finds it, and that can differ from the
  reset's: the first sign-in that enrols a factor sets it (`record_sign_in_with_mfa()`), and the send follows the reset
  by up to a minute, or by up to 24 hours while a send is retried or the platform service is down. D10 says what that
  leaves open and where its fix rides. The claim does not filter on the user's status, so a user disabled after the
  reset is still told; mail from a disabled account's address opens no support ticket, which is one reason line 4 names
  a second route (D5).
- **D5. The kind and the stream.** `password_changed` on the transactional stream: it keeps the account's suppression
  list, nothing pauses it, and the reset code goes through the same set. `mail_send_kind` and `mail_send_stream_kind`
  widen in one ALTER TABLE (A-2), in `MAIL_KINDS`' and `MAIL_STREAM_KINDS`' order; `mail_send_subject` then requires
  the subject, the notice's ID. The operator role, which the platform task runs as, gains one statement,
  `PasswordNoticeEmail`: `ses:SendEmail` on the mail identity (MailFromAddress's domain) and the transactional set
  alone, with `ses:FromAddress` equal to MailFromAddress. `NoticeEmail` stays the notices set's alone, and no statement
  names `identity/*`. The message is `PASSWORD_CHANGED_SUBJECT` ("Your password was changed | PaidWhole"), no link, the
  `account` variant, tagged with the kind, the notice's ID and the user's ID only, and four lines
  (`passwordChangedLines(changedAt, supportEmail, secondFactorEnrolled)`), of which the review round changed the last
  three (D10 says why):
  1. "The password for your PaidWhole account was changed at 2026-11-05 14:32 UTC, with a code sent to this address."
     (the change's own time, `utcMinute()`).
  2. To an account the claim returns as enrolled: "Every session of this account has ended. Signing in still asks for
     your authenticator code or hardware key." To one not enrolled: "Every session of this account has ended."
  3. "If you changed it, ignore this email."
  4. "If you did not, write to <the support address> now from the address you sign in with, and tell your
     organization’s administrator. We will help you secure the account."

  It goes from the stream's own sender, MailFromAddress, with one header no other transactional message carries:
  Reply-To the support address (a per-message `replyTo`), as the screening stream's mail has by the founder's ruling
  Q12, so a plain reply reaches the support desk and not the sender's address; the pull request's description puts it
  to the founder to refuse. The `account` variant's footer ("PaidWhole never asks you to send your password or a code
  to anyone…") ends both alternatives: the HTML's, as every variant's does, and for this variant alone the text's
  (`mailBody`), since it is the sentence a look-alike cannot keep. `words.ts` and `mail.ts` are edited for these; the
  template's frame is unchanged.
- **D6. The job.** `password_notices`, every minute, payload `{}` (nothing about the person rides in pg-boss), as
  `tp_operator` with an empty practice scope, under its singleton key. Each run: the stale sweep first
  (`operator_password_notices_stale`), then the due notices (`operator_password_notices_due`, IDs only), then each in
  its own transaction: the claim, one send, and `operator_password_notice_sent()` with SES's message ID, all before the
  commit, so the claim's row lock, not the singleton key, is what keeps a concurrent run from claiming it. A refused
  send is recorded in a new transaction by `operator_password_notice_failed()`: retried after 1, 5, 15 and 60 minutes
  (81 minutes in all), failed at the fifth try or at once on a permanent SES error (`PERMANENT_SEND_ERRORS`). A record
  that fails after SES accepted the message is a try too, since a copy went out: it is counted the same way in a new
  transaction, as `RecordFailed` and never permanent, and then the error is rethrown, so the job's attempt fails and the
  run ends there. The notice backs off on the same minutes and leaves the head of the due order, so the next run sends
  the others; a notice's fifth try, of either kind, fails it, and when that try was a failed record the notice is
  reported (D8, D9) before the rethrow. An error before the send is rethrown uncounted: nothing went out. A run stops
  claiming notices once it has spent 8 seconds sending (`PASSWORD_NOTICE_RUN_MS`) and the next run, a minute later,
  takes the rest: the operator pool holds two connections, `mail_events` can hold one for its whole run, and a backlog
  sent on the other would fail the minute's other jobs for want of a connection. The reset is never blocked or undone:
  the send runs up to a minute later in another process, and a failed send changes only the notice's row. The worker
  reads the support address from `SUPPORT_EMAIL` (required in production, `support@synthetic.test` in development,
  refused when it is not an address, A-5), set on the platform task from the stack's `SupportEmail` parameter; it is the
  address line 4 names and the message's Reply-To.
- **D7. The 24-hour cutoff** (departure 2; S2's decision of 2026-11-07). A notice still pending 24 hours after the change
  is never sent: the stale sweep marks it `failed` with `error_code` `NoticeStale` and reports it undelivered (D8),
  which pages (D9). It applies to pending rows only: a sent notice waiting on SES's event is never cut off. 24 hours is
  about 17 times the retry span, so it covers a rollout and an overnight outage. Why: an email that says "your password
  was changed" a day late misleads more than it helps, and the operator, paged, tells the person another way.
- **D8. Undelivered, once.** One helper, `password_notice_report_undelivered()` (SECURITY INVOKER, granted to no role),
  sets the notice's report stamp by compare-and-set and writes `password_notice_undelivered` (`system`, object the
  user, purpose `password_changed`, the request's ID), true only the first time. It has exactly four callers, each of
  which hands the answer back only when it returned true: `operator_record_mail_event()` (a bounce, suppression or
  rejection recorded after the send was recorded; its new seventh OUT column `password_notice_undelivered`),
  `operator_password_notice_sent()` (one of those recorded before it; it returns true), `operator_password_notice_failed()`
  (a permanent error, or the fifth try, a refused send's or a failed record's) and `operator_password_notices_stale()`
  (the cutoff). The notice follows one rule, F, of its message's `mail_send` row: `undelivered` if that row is bounced,
  suppressed or rejected; else `delivered` if it has a delivery time; else `sent`. `_sent` applies F to the row it
  finds, and it reads only a mail record of kind `password_changed`: a record of another kind under the ID it is
  given (a probe's, a digest's) is not this notice's message, and its state never becomes the notice's. The mirror in
  `operator_record_mail_event()` applies F's step for each move it records; `undelivered` is final.
  - **Complained leaves the notice unchanged** (departure 3; S2's decision): a complaint follows a delivery, so the
    person was told; the support and dunning notices, and `NOTICE_UNDELIVERED_STATES`, leave it out too. A complaint
    that SES records before its delivery leaves the delivery time unset (the mail record keeps the first terminal
    state of a rank), so the notice stays `sent`, unreported: the mail record's own rule.
  - **The message-ID lock (A-3).** Both the mirror (for kind `password_changed`, before it writes or locks the
    `mail_send` row) and `_sent` (before it reads that row) take `pg_advisory_xact_lock(hashtextextended(
    'password_notice:' || message_id, 0))`. Without it, an event recorded after `_sent` read `mail_send` and before
    `_sent` committed would find no `ses_message_id` to match, and `_sent` would commit `sent` over a bounce. With it,
    the end state is F of the final `mail_send` row whatever the order of `_sent`'s commit and SES's events, concurrent
    ones included, and the report comes exactly once when that state is `undelivered`. No deadlock: the mirror waits
    only on the advisory lock, taken first, and cannot match the claimed row until `_sent` has set its message ID,
    which `_sent` does only after taking the lock. The support and dunning outboxes keep their own narrow window; this
    decision does not back-port the lock to them.
  - `operator_record_mail_event()` is dropped and created again (an OUT column cannot be added in place) with its 14
    arguments, its body that of migration 20261107090000 with exactly these additions, and the seventh column last;
    it is revoked from PUBLIC and granted to `tp_operator` again.
- **D9. It pages** (departure 4; S2's decision of 2026-11-07). Each report logs `password notice not delivered` at error
  with `error_code` `PASSWORD_NOTICE_UNDELIVERED`, the notice's ID, the user's ID and `undelivered_reason_code`
  (`bounced`, `suppressed`, `rejected`, `sent_undelivered`, `NoticeStale`, `RecordFailed`, or the name of the error the
  send threw, SES's or the worker's own). The code joins `MAIL_PLATFORM_ALARM_CODES`: a counted filter on the platform
  log group and an alarm at 1 in five minutes, to the operator topic. The alarm notifies when it goes into ALARM, not
  once a line: notices that fail while it is raised share its page, and a stale sweep can fail up to 100 in one run. So
  the alarm's words say to read every line while it is raised and each line's reason before anyone is told, since a
  notice that failed as `RecordFailed` went out; and the runbook reads from five minutes before the alarm was raised
  until it is back at OK and checks the lines against the audit log's `password_notice_undelivered`, one a notice. Each
  line is written once its report has committed: in `mail_events`, before the event's message is deleted from the queue,
  so a delete that fails cannot take the line with it (the event comes again, and is answered as a replay with nothing
  more to log). A task stopped between a commit and its line still loses the line, since the database hands a report out
  once; the audit event remains, and the weekly sign-in review reads the week's against their tickets. One reason pages
  before its report (the delta review of 2026-11-11, DD-02): the job's line `password notice record failed` (warn;
  `error_code` `RecordFailed`) is itself counted on the platform log group, as `PasswordNoticeRecordFailed`, and alarmed
  at 1 in five minutes. The counted try backs the notice off, so the job's retry finds nothing due and completes, and
  the failed-job alarm never hears of it; without this count the first page was the report at the fifth try, 81 minutes
  and five copies in. Why the report pages: every mail code in the base is alarmed, and `MAIL_WARNING_CODES` have no
  filter at all, so a counted code no one reads would be new; this notice is the account holder's only warning of a
  reset they did not make, and the operator can still give that warning another way; and the volume is tiny, since a
  notice exists only for a completed reset and a reset needs the mailbox's code. What the operator does:
  `docs/runbooks/deliverability.md`, 3.10.
- **D10. What the lines claim** (departure 5: #125's security-N-3 and ux-brand-N5; S2 closed both with option (a),
  and the review round kept the sessions line, recorded what it leaves open and changed lines 2 to 4).
  - **N5**, "with a code sent to this address", is true only for a reset: closed by D2's WHEN, since design 3.2 found
    no other change path. It also rests on the address the claim reads being the one the code went to, which holds
    while no route changes `"user".email` (D4; Revisit when).
  - **N-3**, "Every session of this account has ended.": a notice exists only if the app's sessions ended, because
    `revokeUserSessions` and the event are one `withActor` transaction (`confirmPasswordReset`) and the trigger fires
    on the event (D1). Every session open at the reset has ended, and the sign-in screen says so in the same words
    after the same reset. The design went further, and said that what a failed `AdminUserGlobalSignOut` leaves alive
    can only finish a sign-in that had already proved both factors. The security review tested that (SEC-01), with the
    local provider twin, and it is wrong in two cases, both of a sign-in step begun before the reset:
    - **(a) A step waiting at its second factor.** A step that proved the old password before the reset opens a
      session when its code is answered after the reset, within the step's 3 minutes (`step-limits.ts`). It does not
      depend on the provider's sign-out. The other party needs a current code as well as the old password. ADR 0081's
      amendment already records it of Cognito's sign-in session.
    - **(b) A key-registration step.** A step that proved the password and the code before the reset, and stopped at
      registering a hardware key, holds the provider's grant sealed for 15 minutes. When the provider's sign-out had no
      effect, that grant registers a hardware key after the reset, and the key then signs in with no password: a factor
      the reset does not remove. It needs the sign-out to fail, so it is the rarer case. Only an account that must sign
      in with a hardware key and has none reaches that step: PaidWhole's own platform administrators, contract
      specialists, reimbursement reviewers and support engineers, never a customer's account.

    Nothing in the app ties a step to the account's latest completed reset. So for those minutes the line is not the
    whole truth for a reader whose password and second factor are both in another's hands, and this decision says so:
    - **Option (b) is not taken** (R1). Carrying the provider's sign-out result to the notice for a narrower line
      would cover only case (b), the rarer one, and leave case (a) untouched, since (a) does not depend on the
      sign-out; and it would cost what the design already said: the web and the words edited for a result every
      notice would have to wait for, in a race with the job's claim.
    - **The close** is to refuse to open a session or register a key from a step begun before the account's latest
      completed reset (the step's own sealed start against the reset's time; it needs no fact about Cognito's
      `auth_time`). It changes sign-in and the `"user"` row, so it is its own reviewed change: `LANES.md` Queues item
      28, the next schema pull request after this one, in build on `co-001/step-before-reset`, stacked on this one. It
      is **required before launch**. The pull request's description puts this to the founder as a trade-off, with its
      exact alternative: hold this pull request until the close is built into it.
    - **Until the close**, in this pull request: the email keeps "Every session of this account has ended."; SGN-16
      holds both cases as tests that record what a step begun before a reset can do today, named so that the close flips
      them; and the web's line `security event: password reset provider sign-out failed` (error; `user_id`,
      `request_id`, `error_code`) is counted on the web log group as `PasswordResetProviderSignOutFailed` (at least 1 in
      300 s, to the operator topic), the ninth of the reset and enrolment counts, so what case (b) needs pages a person,
      who reads the audit log for a key registered by that user since the reset, from the reset's own row: that row is
      what the failed sign-out makes possible, and a `sign_in` by authenticator code after it is the person's own and
      ends no membership (`docs/runbooks/incident-response.md`, "A password reset whose provider sign-out failed"). Case
      (a) pages no one: its session is recorded as any other `sign_in`. A reset whose provider sign-out fails still
      queues the notice, with the same lines (SGN-16).
    - **What waits on the confidential client.** The design gave two facts with no condition that hold only once the
      user pool's client is confidential (ADR 0088's release N+1, designed and not built; its ruling 15: in production
      within 7 days of release N, and before the first customer invitation): that Cognito's tokens live only in the
      app's sealed pending sign-in cookie, and that only the app can start `ForgotPassword`. Today the client is public.
      Anyone holding the client ID can ask Cognito for a reset code directly, for an account the app's gate (ADR 0081
      A2) would refuse, and redeem it on the app's own confirm route, which queues a notice like any other; and anyone
      who signs in at Cognito directly, with the password and a code, holds its tokens outside that cookie (the refresh
      token for 12 hours). What holds without the condition: the tokens the app itself obtains live only in the
      key-registration step's sealed cookie (`apps/web/src/lib/auth/pending.ts`), for at most 15 minutes, every other
      path giving the grant back before a session opens; the refresh token is revoked when the step ends (`release()`),
      though not when the step only expires or the revoke fails, where it stays sealed and unread; access tokens last 15
      minutes (`infra/lib/constructs/identity.ts`, `TOKEN_LIFETIMES`); and no token of Cognito's is a PaidWhole session
      or reaches a page. That the web client can write no attribute (`writeAttributes` empty, ADR 0081 B4a) is in the
      template and not yet proven of Cognito (Not verified here). And until the client is confidential a token taken at
      Cognito directly outlives case (b)'s 15 minutes: a sign-out that failed revoked none of them, and a key registered
      with one at Cognito writes no `hardware_key_registered`. So the runbook has the founder make the sign-out again
      for that user, and the week's review reads `sign_in` rows of purpose `webauthn` for them. Unproven without a user
      pool.
  - **Line 2's second sentence**, "Signing in still asks for your authenticator code or hardware key.", is sent only to
    an account whose row says `mfa_enrolled` when its notice is claimed (D4, D5; R3). On the app's own path a code goes
    only to an active, enrolled account (`requestPasswordReset`; ADR 0081 A2); but while the client is public a reset
    can be started at Cognito directly for an account that gate would refuse (an invitee who chose a password and
    stopped before the authenticator, ADR 0088's C1'; a disabled account) and completed on the app's confirm route. Told
    the full line, that reader would believe a second factor guards an account that has none, so their line ends at the
    sessions. For an account enrolled at the reset the sentence holds whenever it is sent: no code path in the apps or
    packages sets `"user".mfa_enrolled` to false, the application role cannot update it, and a reset never removes the
    second factor (ADR 0081 A5). A later change that can clear the flag needs no new words: the line follows the flag.
  - **What reading the flag at the send leaves open** (the delta review of 2026-11-11, DS-03 and DD-01). The flag goes
    from false to true, and it does so in the very takeover the short line exists for. Whoever reads an invitee's
    mailbox can reset the password from outside the app's gate, sign in with it inside the live invitation, enrol an
    authenticator of their own and hold a session before the job's next run. The account's address is then sent the full
    line, though the open session and the authenticator are the other party's; the short line goes out only when the
    send falls between the reset and that enrolment. It is reachable only while the client is public, since the reset
    has to be started at Cognito directly, as SEC-03's own case was; it is reproduced with the local provider twin and
    unproven at Cognito. It is not fixed in this pull request. The fix keeps the fact as it was at the reset: a column
    of `password_notice` written by the reset's trigger and returned by the claim. That changes the table, the trigger
    and the claim, and it rides with `LANES.md` Queues item 28, the next schema pull request, which already replaces the
    trigger. The pull request's description lists it for the founder as a fourth case.
  - **Lines 3 and 4** (R4). This decision decides who receives the lines, and D4 tells a locked account, and one
    disabled after the reset, on purpose; the review weighed lines 2 to 4 for both. Line 2 stays true of them: their
    sessions ended and the second factor was not removed, though neither can sign in until the lock is lifted or the
    account re-enabled, which the sign-in page says of a locked account ("Password changed, account still locked").
    #125's line 3, "If you changed it, there is nothing more to do.", was untrue for that locked account, which still
    has to write to have the lock lifted: it is now "If you changed it, ignore this email.", true of every account and
    the code emails' own phrase. #125's line 4 gave one route, to write to the support address "from this address",
    which ends in silence for three readers: one whose domain SES cannot verify, one whose account was disabled after
    the reset, and one who reads "this address" as a forwarding mailbox that is not the address they sign in with
    (`docs/runbooks/support-mail.md`). It now says "from the address you sign in with", the screens' own words, and
    names a second route that needs no inbound mail: the organization's administrator.
- **D11. The locks.** The migration takes `"user"` (SHARE ROW EXCLUSIVE, for the foreign key), `audit_event` (ACCESS
  EXCLUSIVE, for the policy and the trigger) and `mail_send` (ACCESS EXCLUSIVE, for the CHECKs) together, with `NOWAIT`,
  in one subtransaction, once a second, up to 300 tries (ADR 0083's loop), before any DDL. A refused try holds and
  queues nothing. All three in one try because a new-device sign-in holds `audit_event` and then updates `"user"`: a
  plain wait on `"user"` would stall every sign-in and the loop could never win. If no moment comes in five minutes the
  migration fails with `"user", audit_event or mail_send stayed in use for five minutes; run the deploy again
  (docs/adr/0091)` (55P03), before any service moves. Once held, to the commit (the DDL and one scan of `mail_send`, at
  most about 91 days of messages: about 0.3 seconds measured with 500,000 mail records), every write of `"user"`, every
  audited read or mutation, every other read of `audit_event` and every read or write of `mail_send` waits. Jobs and
  sign-ins wait and then proceed. A signed-in request waits up to its three-second lock timeout and is then refused as
  busy, with nothing saved (ADR 0092's amendment of 2026-11-11, #137); at the measured window no one is refused. What
  refuses the loop, and when to deploy if it fails, is the runbook's. Before the loop, the file's preflight compares
  three things with the values of a database migrated to the 48 migrations before this one, by SHA-256 and not by
  substrings (R9): the stored body of each of the two functions it replaces, `operator_record_mail_event()` and
  `operator_mail_expire()`, and the whole WITH CHECK expression of the `audit_event_record` policy. A migration that
  changed one of those in between is refused, never undone without a word. The preflight does not compare the rest of
  what the file restates from its own text: the two kind CHECKs of `mail_send` that it rewrites, the policy's command
  and roles, and the two functions' grants and settings. A change to one of those by a migration sorting before this one
  would be replaced without a refusal (the delta review of 2026-11-11, DD-03). The migration's own comment states the
  first and not the second. No comparison is added: no migration can come to sort before this one in a chain that merges
  one schema pull request at a time.
- **D12. Rollback, and the rollback floor.** A rollback redeploys the previous image on this schema (ADR 0009; ADR 0049,
  `tp:skipMigrations=true`); the schema is never rolled back, and undoing the trigger would be a later migration. This is
  the first change that adds a mail kind.
  - The previous web's resets queue notices all the same: the database writes them. That web differs in two things:
    it looks the account up after Cognito has changed the password, so a reset completed while the database cannot be
    reached ends no session, records nothing and writes neither counted line (D15's order is the new web's); and its
    console labels the transactional stream without the notices.
  - The previous platform image has no `password_notices` job, so notices wait pending, unsent and unreported (the stale
    sweep is the new job's), and nobody is paged for them. As the operator role, `SELECT * FROM
    operator_password_notices_due(100)` lists those due a try and still inside the cutoff, by notice and user ID, 100 at
    most, and the audit log's `password_reset_completed` lists the resets themselves, past the cutoff or not, from the
    rollback or from as far before it as the runbook says. That image cannot read an SES event of kind
    `password_changed`: it logs `MAIL_EVENT_UNREADABLE`, and after five receives the event moves to
    `tp-<env>-mail-events-dlq` and raises `EventsDeadLetter` (and `EventsQueueAge` past 15 minutes), so notices already
    sent stay `sent` until the events are redriven. The dead-letter queue keeps an event 14 days: a rollback longer than
    that loses the events of the notices sent before it. The image selects `operator_record_mail_event()`'s six columns
    by name and calls `operator_mail_expire(integer)`, whose new body never deletes a pending notice, so its mail jobs
    keep working; it writes neither reserved action.
  - `PasswordNoticeEmail` and the four alarms (D9's two, D10's and D15's) stay with the stack; D10's and D15's count
    lines the previous web already writes, so they keep paging across a rollback of the images.
  - **Roll forward rather than stay back.** After rolling forward, the new job sends every pending notice inside the
    cutoff; every one older than 24 hours fails `NoticeStale`, up to 100 a run, and they share one page, one line a
    notice (the operator tells each person another way); then redrive the dead-letter queue, so the delivered and
    bounced states, and any report they raise, are recorded.
  - **The floor.** This migration sets none of its own: every object is added, the CHECKs only widen, and the previous
    image's calls keep their columns and signatures, so any image that ran on the schema before it runs on it after it,
    with the losses above. The floors earlier changes set stay (`docs/runbooks/deploy-and-rollback.md`). SS-01 D11's
    floor (never below #104) is set by D11's carrier, not here.
  - The steps: `docs/runbooks/deploy-and-rollback.md`, "Password-changed notices".
- **D13. Logs.** IDs and codes only, never an address, a name or a token: `password notice sent`, `password notice send
  failed` (warn, the thrown error's name), `password notice record failed` (warn: SES accepted the message and its
  record failed, D6; counted and alarmed as `PasswordNoticeRecordFailed`, D9), `password notice not delivered` (D9) and
  `password notices sent` (the run's count). Two fields join the observability allowlist (A-1): `password_notice_id`
  (the notice's opaque ID) and `undelivered_reason_code` (a code: one of D9's six fixed words, or the thrown error's
  name, letters only). The address exists only in the claim's row and the one message's recipient.
- **D14. Expiry** (A-4). `expires_at` is 90 days after the change (a CHECK keeps it within 91), as the other customer
  streams' mail records. `operator_mail_expire()`, the nightly `mail_expiry` job's function, also deletes expired
  notices that are not pending; a pending notice is never expired, so the stale sweep has failed and reported it first,
  and no notice disappears without a page, even after a long rollback.
- **D15. The completed reset no notice covers pages instead.** The web's reset looks the account up before it asks
  Cognito to change the password (R2). A database that cannot be reached then fails the lookup while Cognito still holds
  the old password and the code is unspent: nothing changed, and the person tries again. So whatever fails after the
  password changed has the user's ID. When the transaction that ends the app's sessions and records
  `password_reset_completed` then fails twice (Context), Cognito already holds the new password, the app's sessions were
  not ended, and neither the event nor the notice exists. No email is sent there: N-3's line would be false (D10). The
  web's existing line `security event: password reset sessions not ended` (error; `user_id`, `request_id`) is counted on
  the web log group as `PasswordResetSessionsNotEnded` (at least 1 in 300 s, to the operator topic), the eighth of the
  reset and enrolment counts, beside ADR 0088 D7's filters and ADR 0081's over-floor count; ADR 0088's D7 table and
  SEC-23's row are not edited for it or for D10's ninth, as ADR 0081 left them for its own count. The operator ends the
  account's sessions and tells the person another way, by user ID (`docs/runbooks/incident-response.md`, "A password
  reset whose sessions were not ended"). So every completed reset the app learns of, for an account, either queues a
  notice or pages, unless its web task stops in between (the fourth case below), and with D9 every notice not delivered
  pages too. This decision claims no more than that. Four completed resets do neither, and are not this decision's to
  close: one for an address the app has no account for (the provider's confirm runs for every address, so the answer
  cannot tell an account from none, and there is no account here to tell); one made at Cognito directly from start to
  finish, which never reaches the app and is possible while the client is public (D10); and one Cognito applied whose
  answer never reached the app. The Cognito client is built with the SDK's default retries
  (`apps/web/src/lib/server/services.ts`), so a `ConfirmForgotPassword` whose answer is lost is sent again, meets its
  own spent code and is answered as a refused code: the password is changed, the person reads that the code did not
  match, no session ends, nothing is recorded, no notice is queued and nothing pages. It is not proven without a user
  pool. The app never learns of that reset, so D15 does not cover it; its close rides in the next schema pull request
  with D10's two cases (`LANES.md` Queues item 28). The fourth: a web task stopped between Cognito's answer and the line
  loses both; nothing records that reset. The gap predates this decision; it is closed here because D9 makes the notice
  the account holder's warning, and this is the path where that warning matters most. Infra's contract test pins both
  lines' calls in `sign-in.ts`, so an edit to either fails as for every other counted line.

### Choices of the design addendum (A-n)

- **A-1.** The two log fields of D13. The design's `notice_id` and `reason` are not on the allowlist: the runtime
  logger drops any other key, `pnpm lint:logs` refuses it, and every field name must end in `_id`, `_no`, `_type` or
  `_code`. `undelivered_reason_code` is not a closed set, as this record first called it: it is one of six fixed words
  or the name of whatever the send threw, letters only (`Unrecognized` for any other name), so the runbook has a case
  for a name that is not SES's.
- **A-2.** Both kind CHECKs swapped in one ALTER TABLE, so PostgreSQL validates them in a single scan of `mail_send`.
  Written plainly, not NOT VALID: the runner applies a file in one transaction, so a VALIDATE would scan under the same
  lock, and a second file holding only the VALIDATE was weighed and rejected.
- **A-3.** The message-ID lock of D8.
- **A-4.** A pending notice is never expired (D14).
- **A-5.** `SUPPORT_EMAIL` is required in production and has a development default, so a local worker running every
  job still starts; the plan's "required only when `WORKER_JOBS=platform`" is kept for the deployed task.

## Departures from the design

The design is `designs/lane-a-auth-emails.md` sections 3.1 to 3.8, refined by the schema queue's batching plan
(section 1); each departure below is recorded here with its reason.

| # | The design said | Built | Why |
| --- | --- | --- | --- |
| 1 | The trigger's WHEN names the action alone (3.3) | The guard: `actor_kind` `user`, `object_type` `user`, `object_id` the actor (D3) | The audit policy lets one user name another as the object; without the guard one user's write could send a notice to another's address |
| 2 | No age limit on a pending notice | Never sent 24 hours after the change: failed `NoticeStale`, reported, paged (D7) | A day-late "your password was changed" misleads more than it helps; the operator tells the person another way |
| 3 | A complaint marks the notice `undelivered` and reports it (3.3) | Complained changes nothing (D8) | A complaint follows a delivery, so the person was told; the support and dunning notices leave it out too, and counting it would page for a delivered notice |
| 4 | A "non-paging metric filter" for `PASSWORD_NOTICE_UNDELIVERED` (3.4) | It pages (D9) | Every mail code is alarmed in the base and a counted code no one reads would be new; this is the account holder's only warning, and its volume is tiny |
| 5 | #125's review: "the lines take the path and the sign-out result, with SGN-16 cases" (security-N-3) | The sessions line kept; the two cases a step begun before a reset leaves open recorded as SGN-16 cases, their close required before launch; the provider's failed sign-out paged; the second factor named only to an enrolled account, by the claim's `mfa_enrolled` (D10) | Every session open at the reset has ended whenever a notice exists; the sign-out result carried to the notice (option (b)) would cover only the rarer of the two cases and cost the web, the words and a race with the claim; the account's state is carried where a sentence would otherwise be false |
| 6 | ux-brand-N5: "with a code sent to this address" is true only for a reset | Closed by D2's WHEN (D10) | Only `password_reset_completed` queues a notice, and no other change path exists |

What the design did not state, added with their reasons:

- **The fourth undelivered path** (D8): `_sent` reads a state that SES's event recorded before the send's own record,
  which the mirror cannot see (the notice has no message ID yet). The base's support and dunning notices have the same
  path.
- **The message-ID lock** (A-3, D8), so the end state does not depend on the order of the send's commit and the events.
- **The operator role's statement** (D5). Without it every send in staging and production is refused (`AccessDenied`,
  not permanent, so retried and then failed): the role's real-recipient statement covered the notices set alone, and
  its probe statement reaches the transactional set only for SES's simulator.
- **The sessions-not-ended alarm** (D15), and, from the review round, **the provider sign-out's alarm** (D10) and
  **the reset's lookup before the provider's confirm** (D15).
- **From the review round, in the message and the job**: the claim's fourth column and the not-enrolled line (D4,
  D10), lines 3 and 4 (D5), the Reply-To and the text alternative's footer (D5), a failed record counted as a try and
  the run's 8 seconds (D6), `_sent`'s kind filter (D8), the lines before the queue's delete (D9) and the preflight's
  hashes (D11).
- **The expiry rule** (A-4, D14), and the helper's report stamp, `undelivered_reported_at` (the support notices' own).
- **The base's names and shapes**, fixed at build time: the words are #125's (`passwordChangedLines`, four lines, the
  last three as the review round left them, and `utcMinute()`, "2026-11-05 14:32 UTC"), not the design's
  `passwordChangedMessage()` and `utcWords()`; `operator_password_notices_due(at_most)` and
  `operator_password_notices_stale(at_most, request)` take a batch size, as the outboxes' functions do; `_failed` takes
  `error_name`, as the base's; the expiry is `operator_mail_expire()`'s, the function the `mail_expiry` job calls; the
  migration is `20261111090000_password_changed_notice.sql`, after #126's `20261110090000`; the e2e drives the job
  through `apps/web/e2e/mail.ts`, since no `e2e/worker.ts` exists.
- **The log fields** (A-1), **`SUPPORT_EMAIL`'s development default** (A-5) and **the CHECKs in one ALTER** (A-2).

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| A pg-boss job enqueued by the web after the reset commits | The email is lost if the process dies between the commit and the enqueue, and a user's ID rides in a payload for nothing |
| An enqueue inside the reset's transaction | The web role would need pg-boss's tables |
| A send from the web, through SES | The side channel the scope forbids: the web sends no mail of its own, and the address would be read on the request's path |
| A `withActor(user)` job that reads the user's own row | A new kind of job acting as a person who is not present |
| A BEGIN ... EXCEPTION wrapper around the trigger's insert | A lost notice would fail silently; the insert adds no failure mode the audit insert does not have (D3) |
| A foreign key from `audit_event_id` to `audit_event` | `audit_event` is append-only and guarded by its own triggers; the key would add a lock to every reset's insert for nothing |
| Dropping `user_id`'s foreign key, as `line_status_head`'s were | The loop (D11) makes its lock safe, and the key ties every notice to a real account |
| The notices set through `NoticeEmail` | The notices stream carries a practice's support-access and billing notices; an account's own mail (its invitation, its reset code) is the transactional stream's, and the kind CHECK keeps each stream's kinds apart |
| Option (b): carry the provider's sign-out result to the notice | Not taken, though the review found what the design said would switch to it (D10): it would cover only the key-registration case, the rarer of the two, and leave the code step's untouched, which does not depend on the sign-out; the close covers both |
| Hold this pull request until the close of D10's two cases is built into it | The exact alternative the pull request's description puts to the founder: the close changes sign-in and the `"user"` row, which is its own reviewed change, required before launch (D10) |
| Line 2's second sentence to every account, the record saying it waits on ADR 0088's release N+1 | It tells an account with no second factor, today, that one guards it; the claim's fourth column and a shorter line make the sentence true where it is sent (D10) |
| No Reply-To: a reply goes to MailFromAddress | The email's one call to action is to write to the support address, and Reply is how an email is answered; whether MailFromAddress is a mailbox anyone reads is not in the repository (D5) |
| A committed mark before the send, so no second copy is ever sent | The base's outboxes have none either; counting the try bounds the copies and frees the notices behind it (D6) |
| A larger operator pool for the every-minute jobs | A run bounded by time needs no new connection budget (D6) |
| A non-paging filter for `PASSWORD_NOTICE_UNDELIVERED` | D9 |
| Counting a complaint as undelivered | D8 |
| No cutoff, or a cutoff on sent notices too | D7; a sent notice is SES's to deliver, and its outcome is recorded whenever it comes |
| A separate operator function to report an undelivered notice | A second exactly-once path and a grant the base's outboxes do not have; the internal helper is theirs |
| An email for a reset whose sessions were not ended | N-3's line would be false there, and a narrower one is a web and words change; the operator is paged instead (D15) |
| A `$.level = "error"` filter on the whole web log group | It pages on every error line, not on this reset (D15) |
| The CHECKs NOT VALID, validated in a second file | A-2 |

## Consequences

- Every reset the provider answers as completed, for an account, either queues a notice, sent within about a minute, or
  pages the operator (D15, which lists the four resets that do neither); every notice bounced, suppressed, rejected,
  refused, accepted with its record still failing at the fifth try, or not sent within 24 hours is reported once and
  raises the alarm (D9); notices that fail while it is raised share its page, and the runbook reads every line; a record
  that fails after SES accepted the message pages at its first copy, by the job's own line (D9). The account holder
  learns of a reset they did not make from their own mailbox, and line 4 brings them, or their organization's
  administrator, to the support desk's "Password changed, not by me" (`docs/runbooks/support-mail.md`) when the message
  opens a readable ticket; a reply or a forward quotes the email's date and address and is withheld, and the playbook
  says how the desk treats it.
- For up to 3 minutes after a reset, a sign-in step that proved the old password can still open a session with a
  current code, and for up to 15, when the provider's sign-out fails, a key-registration step can still register a
  key (D10): two open cases, tested as they stand, their close required before launch.
- The operator role widens by one statement: the transactional set and the mail identity, from MailFromAddress alone.
  It deploys with the new platform image; while IAM propagates, a refused first send is retried a minute later.
- For a notice, only the claim reads the account's row, its address and whether it is enrolled, and only for a
  pending, due notice inside the cutoff; nothing about the person rides in pg-boss; logs hold IDs and codes. `tp_app`
  cannot read or write `password_notice`, nor write `password_notice_sent` or `password_notice_undelivered`
  (`audit_event_record`).
- The residue, as the support notices': SES accepts a message and the transaction recording it then fails. The row
  stays pending and that try is counted (D6), so the person is sent one more copy for each run whose record fails,
  five at most, and the notice then fails as `RecordFailed` and pages; the copies' events match no notice, and their
  mail records are what the runbook reads before anyone is told anything. One case the count does not reach: a try
  that cannot be counted either (the database lost between SES's answer and the record) leaves the notice due, and the
  next run sends again. And the web tries the reset's transaction twice, so a commit whose answer was lost is
  followed by a second event and a second notice.
- A deploy holds sign-ins, audited reads and mutations and the mail record for the DDL and one scan of `mail_send`
  (about 0.3 seconds measured), a signed-in request being refused as busy if it waits past three seconds, or fails
  before any service moves (D11). An old and a new platform task overlap in a rolling deploy, and an old task cannot
  read a `password_changed` event, so the deploy runbook checks the mail events' dead-letter queue after each deploy.
- What proves it (SGN-16): `packages/db/src/password-notice.db.test.ts` (the table, the trigger and its guard, the
  idempotency, the reserved actions, the grants, the claim, its four columns and its cutoff under the lock, `_sent` and
  the one kind of record it reads, the race, both sides of the message-ID lock, the retries, the stale sweep, the
  mirror, order independence over every sequence of up to three events and every position of the send's commit, the
  seventh column and the body diff, the kind, the expiry, the lock loop giving back all it took on a refused try, each
  refusal of the preflight and its three hashes, the whole file's locks on the tables that existed before it, the
  constants), `mail.db.test.ts` and `hardening.db.test.ts` (the grant map, the CHECK literals, the reserved actions);
  the worker's `password-notices.test.ts` and `password-notices.db.test.ts` (the message with either second line, its
  Reply-To and the footer of both alternatives, the job, its race, its failures, a failed record counted as a try and
  ended at five, the run's 8 seconds, and its log lines) and `mail-events.db.test.ts` (the seventh column's line,
  written before the queue's delete); the web's `sign-in.db.test.ts` (one notice for a confirmed reset, none for a
  refused, invalid or rolled-back one or the invitation's first password, none for the reset whose sessions were not
  ended, which logs the counted line, a confirmation that fails at the lookup with the provider not asked, and D10's two
  open cases as they stand) and `e2e/sign-in.spec.ts` (the reset journey's message in the local outbox); infra's
  `operator-role.test.ts`, `mail-streams.test.ts` and `monitoring.test.ts` (the statement, the four filters, their
  alarms and what their words say, both lines pinned in `sign-in.ts` and the job's line pinned in
  `password-notices.ts`); and the catalog and cross-tenant tests, unchanged. Beside SGN-16's list,
  `packages/auth-mail`'s `render.test.ts` holds the four lines and both second lines, and the worker's `mail.test.ts`
  the per-message Reply-To and the text alternative's footer.
- Not verified here (no user pool or SES in this lane), so on the staging smoke list that #125 and this pull request
  share, each with a synthetic account:
  - a completed reset produces one "Your password was changed | PaidWhole" message, which also proves
    `PasswordNoticeEmail`, and its notice is recorded `sent` and then `delivered`: that proves a real SES message ID is
    one the record takes (20 to 100 letters, digits and hyphens);
  - a reply to that email reaches the support inbox (the Reply-To) and opens a ticket, withheld when it quotes the
    email;
  - the user pool's web client writes no attribute in effect: its description shows the write list empty, and an
    `UpdateUserAttributes` call with a synthetic user's access token is refused;
  - D10's two cases on a user pool: a code step begun before a reset and answered after it, inside its 3 minutes; and
    a hardware-key registration with an access token issued before `AdminUserGlobalSignOut`, which Cognito should
    refuse when the sign-out succeeded;
  - how the message renders in Gmail for iOS and Outlook.com (with #129's plate).

## Not covered

- SS-01 D11's `REVOKE UPDATE (status), INSERT (status) ON organization FROM tp_app`: no founder deploy fact yet; it
  rides its own carrier, which states its rollback floor.
- ADR 0081 A6: Schema PR 6, beside the Cognito relink.
- "From where" in the email (design O-4): the only coarse, safe source is GeoIP, a new vendor or data set, which is the
  founder's call.
- A Settings change of password: none exists (D2).
- The support and dunning outboxes' own window between `_sent`'s read and its commit: A-3 is not back-ported to them.
- An email for a completed reset whose sessions were not ended: none is sent; D15 pages the operator, who tells the
  person another way.
- The close of D10's two cases: refusing to open a session or register a key from a step begun before the account's
  latest completed reset. Its own change, required before launch: `LANES.md` Queues item 28, the next schema pull
  request, in build on `co-001/step-before-reset`. The same change takes the reset whose answer from Cognito is lost
  (D15). A key already registered in case (b) is removed by nothing an operator holds: that remedy is `LANES.md` Queues
  item 29, not yet assigned, its need before launch still to be decided.
- The second-factor sentence as the account was at the reset: the claim reads the flag at the send (D4, D10). The fix,
  the flag kept with the notice by the reset's trigger, rides with `LANES.md` Queues item 28.
- The sibling outboxes (`support-notices.ts`, `dunning.ts`) rethrow an error after an accepted send uncounted, as this
  job did before R7, and bound no run by time; and the two earlier lock-loop tests (`ledger-interest.db.test.ts`,
  `line-status.db.test.ts`) never look at what a refused try holds, as this one did before the review. Base behaviour,
  not changed here.
- What the review round deferred, each tracked in `approval-summaries/lane-a-auth-emails-status.md` ("Follow-ups") and
  the pull request's description:
  - a withheld support ticket that names the notice it answers: it changes the support inbox's PHI screen (ADR 0055),
    which is its own reviewed change, so until then the desk cannot tell such a ticket from any other withheld mail;
  - the console showing a member's and a ticket requester's user ID: until then no screen turns a user ID into a
    person, and the runbooks say where that leaves the operator;
  - a console control that disables a user: until then End membership, or the founder's break-glass session;
  - the shared email template keeping a date whole and wrapping a long address: it changes every email's HTML;
  - the notice's age beside its UTC time, for a notice sent late: with the baseline's open finding on UTC times
    (UX-027).

## Revisit when

- A second password-change path exists (its action joins the trigger's WHEN, D2).
- SES changes its event order guarantees, or the mail record's rank rule changes (D8).
- The transactional stream gains a pause (D5).
- A route can change `"user".email`: the column's grant and the row's policy already let a person change their own
  address, and no route does. The first that does sends or fails every pending notice of that account first, or the
  notice keeps the address its code went to (D4, D10's N5).
- ADR 0088's release N+1 makes the client confidential: D10's two conditioned facts then hold, and this record says
  so.
- The close of D10's two cases is built: SGN-16's two residual cases flip, and D10, SGN-16's row and Consequences
  say the cases are closed.
- The staging smoke list shows the message refused or not delivered, a reply that does not reach the support inbox, a
  writable attribute, or either of D10's cases behaving otherwise on a user pool.

## Review round of 2026-11-11

Three reviews read the build before its pull request opened: security and sign-in (SEC-01 to SEC-09), database, mail
and deploy (DB-01 to DB-11), and UX and brand (UX-01 to UX-13). Every finding was real. The rulings on them (R1 to
R11; W6, under the co-founder's standing instruction, each reversible by the founder) and the fixes changed this
record and the build as follows; what was deferred is under Not covered.

- **R1 (SEC-01).** D10 states both cases of a step begun before a reset; option (b) is not taken; the close is its own
  change, required before launch; SGN-16 records both cases; the provider sign-out's failure is counted and paged.
- **R2 (SEC-02).** The web's reset looks the account up before the provider's confirm (D15).
- **R3 (SEC-03).** The claim returns `mfa_enrolled`, and the second factor is named only to an enrolled account (D4,
  D10); D10 says which facts wait on the confidential client; the staging list gains the write-attributes check.
- **R4 (UX-02, UX-03).** Line 3 is "If you changed it, ignore this email."; line 4 says "from the address you sign in
  with" and names the organization's administrator (D5, D10).
- **R5 (SEC-09, UX-01).** The message goes with Reply-To the support address (D5); the support playbook says what a
  reply, a forward and an automatic reply become at the desk.
- **R6 (SEC-04, UX-06).** The runbooks name the control that exists, End membership, and the founder's break-glass
  session by user ID, in place of a "disable the user" no screen offers.
- **R7 (SEC-07, DB-02).** A record that fails after SES accepted the message counts as a try (D6): the residue is
  bounded, the notices behind it are not held up, and the runbook has a case for `RecordFailed`.
- **R8 (SEC-08).** `operator_password_notice_sent()` reads only a mail record of kind `password_changed` (D8).
- **R9 (DB-07).** The preflight compares the hashes of the two replaced bodies and of the policy's WITH CHECK expression
  with the base's values, not substrings; D11 says what it leaves uncompared.
- **R10 (DB-08).** A run stops claiming notices once it has spent 8 seconds sending (D6).
- **R11 (UX-10).** The text alternative ends with the `account` variant's footer (D5).
- **DB-01.** `mail_events` writes the lines for what a record reported before it deletes the event from the queue (D9).
- **DB-03, DB-05, DB-09.** The migration's header, D11, D12 and the deploy runbook say what a signed-in request meets
  under the locks, what refuses the loop and when to deploy again, the dead-letter queue's 14 days, and how to list
  who waits during a rollback.
- **DB-04, DB-06, DB-10.** Tests only: the lock loop holds nothing while it sleeps, the whole file locks no table that
  existed beyond the loop's three, each preflight refusal fires, and two timing margins are wider.
- **UX-04, SEC-06.** One page can stand for many notices, and a line can be lost after its report commits: the
  alarm's words, D9, the runbooks and a step of the weekly sign-in review read every line and the audit log.
- **UX-05.** The runbooks say how a user ID leads to an organization and a ticket to a user ID, and where neither
  names the person.
- **UX-08, UX-12, UX-13.** The console's label and the bounce alarm's words name the notices among the transactional
  stream's kinds; the copy lint reads the job's file; the reason code is no longer called a closed set (D13, A-1).
- **SEC-05.** "Revisit when" names a route that changes an address.
- **DB-11** is the pull request description's: it names the five new grants to `tp_operator` and the definer trigger
  function.

Two more reviews then read the round's own changes (68895f0f to ffa44ea9): sign-in, words and records (DS-01 to DS-08)
and database, worker and mail (DD-01 to DD-06). None was blocking and every finding was real. W6's rulings on them,
numbered D1 to D7 in their own file and not to be read as this record's decisions of those numbers, changed the record
and the build as follows.

- **DS-03, DD-01.** Not built here: the second-factor sentence follows the flag as the claim finds it, so an
  authenticator enrolled after the reset by whoever holds the new password puts the sentence back. D4 and D10 say so,
  Not covered names the fix, and it rides with Queues item 28.
- **DD-02.** The job's line for a record that failed is counted and alarmed as `PasswordNoticeRecordFailed`, so the
  first copy pages (D9); runbook 3.10's `RecordFailed` case starts from it.
- **DD-03.** The preflight compares, by SHA-256, the stored bodies of the two functions it replaces and the policy's
  whole WITH CHECK expression. It does not compare the two kind CHECKs of `mail_send` that the file rewrites, the
  policy's command and roles, or the two functions' grants and settings. The migration's own comment states the first
  and not the second; D11 now states both, and the migration is not edited.
- **DS-01.** On the page for a failed provider sign-out a key registered since the reset is the sign, read from the
  reset's own row; the person's own sign-in by authenticator code ends no membership (D10, the runbook, the alarm's
  words).
- **DS-02.** The runbook's statement that finds a user's practices keeps those of the user's own organization only; no
  row goes to the founder.
- **DS-04 to DS-08.** Whose accounts case (b) can touch and where the removal of a registered key is queued (D10, Not
  covered); what the break-glass session does, and what the database refuses for an only administrator (the runbooks);
  tokens taken at Cognito directly (D10); the undelivered alarm's words, which now cover `RecordFailed`; and D15's
  fourth unreported reset.
- **DD-04 to DD-06** changed nothing in this record.
