# 0091. Tell an account's address when its password changes, from an outbox the database writes in the change's own transaction

- **Status:** proposed (Schema PR 1 of the queue after #126, `co-001/password-changed-notice`: part 2 of the auth emails,
  whose part 1 is #125; migration `20261111090000_password_changed_notice.sql`). The founder's approval of the
  regenerated domain model (CO-02) accepts it. Adds to
  [0065](0065-send-mail-in-three-ses-streams-record-each-messages-delivery-send-notices-from-an-outbox-and-pause-the-screening-stream-alone.md)
  (the operator role also sends one kind, `password_changed`, on the transactional set; its dated note) and
  [0014](0014-audit-log-retention-classes-and-platform-jobs.md) (the platform job `password_notices`; its amendment).
  Closes the "password changed" item of
  [0081](0081-state-and-enforce-each-sign-in-steps-limit-warn-before-it-closes-and-start-again-with-the-email-kept.md)'s
  code-email amendment's Not covered, and #125's review findings security-N-3 and ux-brand-N5, which that review handed
  here (D10). Reverses none of their rulings. It is its own decision, not an amendment: it adds a table, a mail kind, a
  platform job and an operator permission across ADR 0065's streams.
- **Date:** 2026-11-07
- **Deciders:** the founder, under the standing rule of 2026-10-18, by approving the domain model (CO-02); acting Lane A
  (S2), 2026-11-07, for the batching plan's rulings on this item (the 24-hour cutoff, D7; complained leaves the notice
  unchanged, D8; the notice's alarm pages, D9; security-N-3 and ux-brand-N5 closed with option (a), D10; ADR 0081 A6
  moved to Schema PR 6); the build, for the design addendum's choices A-1 to A-5 and D15. Each reversible by the founder
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
changed" email (`PASSWORD_CHANGED_SUBJECT`, `passwordChangedLines(changedAt, supportEmail)` and `utcMinute()` in
`packages/auth-mail/src/words.ts`: when, in UTC to the minute, that every session of the account has ended and the
second factor is still asked, and "write to the support address from this address now"; no link and no "from where")
and the worker template's `account` variant, and nothing sent them. Sending them needs a migration:

- **The kind.** Every message carries its kind (`tp_kind`), and `mail_send_kind` and `mail_send_stream_kind`
  (migration `20261107090000_mail_streams.sql`) refuse `password_changed`. Sent as `cognito` or `digest` it would
  falsify the mail record (`cognito` takes no subject, and the invitation's state reads `cognito` sends).
- **The address.** A platform job runs as `tp_operator`, which has no policy on `"user"` and reads an address only
  through a narrow definer function. A practice job runs as `tp_app` for one practice, and a password belongs to an
  account. A job acting as the user (`withActor(user_id)`) would be a new kind of job acting as a person who is not
  present.

What changes a password today:

- **A completed reset**, and only that writes `password_reset_completed`: `SignInFlow.confirmPasswordReset`
  (`apps/web/src/lib/auth/sign-in.ts:533-538`), inside the `withActor(account.user_id)` transaction that also runs
  `revokeUserSessions`, as `actor_id` the user, `actor_kind` `user`, `object_type` `user`, `object_id` the user.
- **The invitation's first password** writes `password_changed` (`sign-in.ts:356`): the account's first password,
  chosen inside a live invitation by whoever holds its temporary password.
- Nothing else: the app calls no `ChangePassword`, `AdminSetUserPassword` or `AdminResetUserPassword`, and the
  application role is pinned against the last two (`infra/test/application-role.test.ts:15`).

Two facts of the base shape the decision:

- **The audit policy lets a user name any object.** `audit_event_record` (as `20261108090000_suspension_refusal.sql`
  left it) checks the actor, the actor's kind, the reserved actions and the practice, not the object. A trigger keyed
  on the action alone would let one user's write of `password_reset_completed` naming another user queue a notice to
  that other user's address.
- **One completed reset records nothing.** Cognito has already changed the password when the `withActor` transaction
  runs (`sign-in.ts:532-546`). That transaction is tried twice inside a bare `catch {}`; if both tries fail, neither the
  revoke, the event nor anything the event would trigger exists. The web logs `security event: password reset sessions
  not ended` at error with the user's ID and the request's ID, still signs the account out at Cognito, and answers
  `sessions_not_ended` (ADR 0081 A5; review R-3; ADR 0088 D7). Until this decision no filter counted that line.

## Decision

- **D1. The outbox.** An AFTER INSERT trigger on `audit_event`, `audit_event_password_notice`, writes one pending row
  of a new table, `password_notice`, in the reset's own transaction: it commits or rolls back with
  `revokeUserSessions` and the event, and no request can skip it, as no request can skip a support notice (ADR 0065
  D10). The web is unchanged. A platform job sends it within about a minute.
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
- **D4. The table and the address.** `password_notice` is global: no `practice_id`, no PHI, no address and no name;
  the user's ID, the reset event's ID (`audit_event_id`, the idempotency key `password_notice_once`), the change's time,
  the send's state (`pending`, `sent`, `delivered`, `undelivered`, `failed`), its attempts, SES's message ID, an error
  code (letters only), the report stamp and the expiry. ENABLE and FORCE ROW LEVEL SECURITY, one owner-only policy
  (`password_notice_owner`), nothing granted to any role, revoked from PUBLIC and `tp_app`; it has no
  `phi_table_registry` row, since the catalog accepts a registry row only for a table with a NOT NULL `practice_id`.
  `user_id` keeps its foreign key to `"user"`. The address is read in one place:
  `operator_password_notice_claim()`, for a pending notice that is due and under 24 hours old, under `FOR UPDATE SKIP
  LOCKED`, the cutoff checked again under the lock; it does not filter on the user's status, so a user disabled after
  the reset is still told.
- **D5. The kind and the stream.** `password_changed` on the transactional stream: it keeps the account's suppression
  list, nothing pauses it, and the reset code goes through the same set. `mail_send_kind` and `mail_send_stream_kind`
  widen in one ALTER TABLE (A-2), in `MAIL_KINDS`' and `MAIL_STREAM_KINDS`' order; `mail_send_subject` then requires
  the subject, the notice's ID. The operator role, which the platform task runs as, gains one statement,
  `PasswordNoticeEmail`: `ses:SendEmail` on the mail identity (MailFromAddress's domain) and the transactional set
  alone, with `ses:FromAddress` equal to MailFromAddress. `NoticeEmail` stays the notices set's alone, and no statement
  names `identity/*`. The message is `PASSWORD_CHANGED_SUBJECT` ("Your password was changed | PaidWhole"), the four
  `passwordChangedLines`, no link, the `account` variant and its footer, tagged with the kind, the notice's ID and the
  user's ID only; `words.ts` and `template.ts` are not edited.
- **D6. The job.** `password_notices`, every minute, payload `{}` (nothing about the person rides in pg-boss), as
  `tp_operator` with an empty practice scope, under its singleton key. Each run: the stale sweep first
  (`operator_password_notices_stale`), then the due notices (`operator_password_notices_due`, IDs only), then each in
  its own transaction: the claim, one send, and `operator_password_notice_sent()` with SES's message ID, all before
  the commit, so the claim's row lock, not the singleton key, is what keeps a concurrent run from claiming it. A
  refused send is recorded in a new transaction by `operator_password_notice_failed()`: retried after 1, 5, 15 and 60
  minutes (81 minutes in all), failed at the fifth try or at once on a permanent SES error (`PERMANENT_SEND_ERRORS`).
  The reset is never blocked or undone: the send runs up to a minute later in another process, and a failed send
  changes only the notice's row. The worker reads the support address from `SUPPORT_EMAIL` (required in production,
  `support@synthetic.test` in development, refused when it is not an address, A-5), set on the platform task from the
  stack's `SupportEmail` parameter.
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
  (a permanent error or the fifth try) and `operator_password_notices_stale()` (the cutoff). The notice follows one rule,
  F, of its message's `mail_send` row: `undelivered` if that row is bounced, suppressed or rejected; else `delivered` if
  it has a delivery time; else `sent`. `_sent` applies F to the row it finds, and the mirror in
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
- **D9. It pages** (departure 4; S2's decision of 2026-11-07). Each report logs `password notice not delivered` at
  error with `error_code` `PASSWORD_NOTICE_UNDELIVERED`, the notice's ID, the user's ID and `undelivered_reason_code`
  (`bounced`, `suppressed`, `rejected`, `sent_undelivered`, `NoticeStale`, or the SES error's name). The code joins
  `MAIL_PLATFORM_ALARM_CODES`: a counted filter on the platform log group and an alarm at 1 in five minutes, to the
  operator topic. Why: every mail code in the base is alarmed, and `MAIL_WARNING_CODES` have no filter at all, so a
  counted code no one reads would be new; this notice is the account holder's only warning of a reset they did not
  make, and the operator can still give that warning another way; and the volume is tiny, since a notice exists only
  for a completed reset and a reset needs the mailbox's code. What the operator does: `docs/runbooks/deliverability.md`,
  3.10.
- **D10. What the lines claim** (departure 5: #125's security-N-3 and ux-brand-N5 closed with option (a); `words.ts`
  and the web unchanged).
  - **N5**, "with a code sent to this address", is true only for a reset: closed by D2's WHEN, since design 3.2 found
    no other change path.
  - **N-3**, "Every session of this account has ended.": a notice exists only if the app's sessions ended, because
    `revokeUserSessions` and the event are one `withActor` transaction (`sign-in.ts:533-538`) and the trigger fires on
    the event (D1). Cognito's tokens are never a PaidWhole session: they live only in the sealed pending sign-in cookie
    (`apps/web/src/lib/auth/pending.ts`), for at most the step's 5 or 15 minutes (`step-limits.ts`); the refresh token
    is revoked when the step ends (`release()`, `cognito-provider.ts:438`); access tokens last 15 minutes
    (`infra/lib/constructs/identity.ts`, `TOKEN_LIFETIMES`); the web client writes no attribute (`writeAttributes`
    empty, ADR 0081 B4a). So a provider session that survives a failed `AdminUserGlobalSignOut` can only finish, within
    those minutes and through the app's server, a sign-in step already started, and cannot reach a page, PHI or a
    setting. This pull request's sign-in and email security review checks each of these facts, including whether a
    step begun before the reset can finish into a session after it: if it can, this decision says so and SGN-16 gains
    the case; if a surviving provider session can do more than finish a sign-in that already proved both factors, the
    build switches to option (b) before the pull request opens. Option (b), carrying the provider's sign-out result to
    the notice for a narrower line, is rejected: it edits the web and `words.ts` (which #129 also edits), races the
    job's claim (every notice would have to wait for the sign-out's record), and makes the line less accurate, since
    the line is about the sessions PaidWhole holds, which have ended. A reset whose provider sign-out fails still
    queues the notice, and it says the same four lines (SGN-16).
  - **Line 2's second sentence**, "Signing in still asks for your authenticator code or hardware key.", holds on every
    path that completes a reset: a code is sent only to an active, enrolled account (`sign-in.ts:477`; ADR 0081 A2);
    only the app can start `ForgotPassword` once the client is confidential (ADR 0088); no code path in the apps or
    packages sets `"user".mfa_enrolled` to false; and a reset never removes the second factor (ADR 0081 A5). Condition:
    any later change that can clear `mfa_enrolled`, or complete a reset outside A2's gate, adds the narrower line in
    that same pull request.
- **D11. The locks.** The migration takes `"user"` (SHARE ROW EXCLUSIVE, for the foreign key), `audit_event` (ACCESS
  EXCLUSIVE, for the policy and the trigger) and `mail_send` (ACCESS EXCLUSIVE, for the CHECKs) together, with
  `NOWAIT`, in one subtransaction, once a second, up to 300 tries (ADR 0083's loop), before any DDL. A refused try holds
  and queues nothing. All three in one try because a new-device sign-in holds `audit_event` and then updates `"user"`:
  a plain wait on `"user"` would stall every sign-in and the loop could never win. If no moment comes in five minutes
  the migration fails with `"user", audit_event or mail_send stayed in use for five minutes; run the deploy again
  (docs/adr/0091)` (55P03), before any service moves. Once held, to the commit (the DDL and one scan of `mail_send`, at
  most about 91 days of messages), every write of `"user"`, every audited mutation, every read of `audit_event` and
  every read or write of `mail_send` waits, then proceeds.
- **D12. Rollback, and the rollback floor.** A rollback redeploys the previous image on this schema (ADR 0009; ADR 0049,
  `tp:skipMigrations=true`); the schema is never rolled back, and undoing the trigger would be a later migration. This is
  the first change that adds a mail kind.
  - The previous web is the current web: its resets queue notices.
  - The previous platform image has no `password_notices` job, so notices wait pending, unsent and unreported (the stale
    sweep is the new job's). It cannot read an SES event of kind `password_changed`: it logs `MAIL_EVENT_UNREADABLE`,
    and after five receives the event moves to `tp-<env>-mail-events-dlq` and raises `EventsDeadLetter` (and
    `EventsQueueAge` past 15 minutes), so notices already sent stay `sent` until the events are redriven. It selects
    `operator_record_mail_event()`'s six columns by name and calls `operator_mail_expire(integer)`, whose new body never
    deletes a pending notice, so its mail jobs keep working; it writes neither reserved action.
  - `PasswordNoticeEmail` and the two alarms (D9, D15) stay with the stack; D15's counts a line the current web already
    writes, so it keeps paging across a rollback of the images.
  - **Roll forward rather than stay back.** After rolling forward, the new job sends every pending notice inside the
    cutoff; every one older than 24 hours fails `NoticeStale` and pages one by one (the operator tells each person
    another way); then redrive the dead-letter queue, so the delivered and bounced states, and any report they raise,
    are recorded.
  - **The floor.** This migration sets none of its own: every object is added, the CHECKs only widen, and the previous
    image's calls keep their columns and signatures, so any image that ran on the schema before it runs on it after it,
    with the losses above. The floors earlier changes set stay (`docs/runbooks/deploy-and-rollback.md`). SS-01 D11's
    floor (never below #104) is set by D11's carrier, not here.
  - The steps: `docs/runbooks/deploy-and-rollback.md`, "Password-changed notices".
- **D13. Logs.** IDs and codes only, never an address, a name or a token: `password notice sent`, `password notice send
  failed` (warn, the SES error's name), `password notice not delivered` (D9) and `password notices sent` (the run's
  count). Two fields join the observability allowlist (A-1): `password_notice_id` (the notice's opaque ID) and
  `undelivered_reason_code` (a code from D9's closed set). The address exists only in the claim's row and the one
  message's recipient.
- **D14. Expiry** (A-4). `expires_at` is 90 days after the change (a CHECK keeps it within 91), as the other customer
  streams' mail records. `operator_mail_expire()`, the nightly `mail_expiry` job's function, also deletes expired
  notices that are not pending; a pending notice is never expired, so the stale sweep has failed and reported it first,
  and no notice disappears without a page, even after a long rollback.
- **D15. The completed reset no notice covers pages instead.** When the transaction that ends the app's sessions and
  records `password_reset_completed` fails twice (Context), Cognito already holds the new password, the app's sessions
  were not ended, and neither the event nor the notice exists. No email is sent there: N-3's line would be false (D10),
  and the web is unchanged. The web's existing line `security event: password reset sessions not ended` (error;
  `user_id`, `request_id`) is counted on the web log group as `PasswordResetSessionsNotEnded` (at least 1 in 300 s, to
  the operator topic), the eighth of the reset and enrolment counts, beside ADR 0088 D7's filters and ADR 0081's
  over-floor count; ADR 0088's D7 table and SEC-23's row are not edited, as ADR 0081 left them for its own count. The
  operator ends the account's access and tells the person another way, by user ID
  (`docs/runbooks/incident-response.md`, "A password reset whose sessions were not ended"). So every completed reset
  either queues a notice or pages, and with D9 every notice not delivered pages too. The gap predates this decision; it
  is closed here because D9 makes the notice the account holder's warning, and this is the path where that warning
  matters most. Infra's contract test pins the line's call in `sign-in.ts`, so an edit to it fails as for every other
  counted line.

### Choices of the design addendum (A-n)

- **A-1.** The two log fields of D13. The design's `notice_id` and `reason` are not on the allowlist: the runtime
  logger drops any other key, `pnpm lint:logs` refuses it, and every field name must end in `_id`, `_no`, `_type` or
  `_code`.
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
| 5 | #125's review: "the lines take the path and the sign-out result, with SGN-16 cases" (security-N-3) | Option (a): the lines unchanged, the facts recorded (D10) | The line is about PaidWhole's sessions, which have ended whenever a notice exists; option (b) edits the web and `words.ts`, races the claim and narrows a true line |
| 6 | ux-brand-N5: "with a code sent to this address" is true only for a reset | Closed by D2's WHEN (D10) | Only `password_reset_completed` queues a notice, and no other change path exists |

What the design did not state, added with their reasons:

- **The fourth undelivered path** (D8): `_sent` reads a state that SES's event recorded before the send's own record,
  which the mirror cannot see (the notice has no message ID yet). The base's support and dunning notices have the same
  path.
- **The message-ID lock** (A-3, D8), so the end state does not depend on the order of the send's commit and the events.
- **The operator role's statement** (D5). Without it every send in staging and production is refused (`AccessDenied`,
  not permanent, so retried and then failed): the role's real-recipient statement covered the notices set alone, and
  its probe statement reaches the transactional set only for SES's simulator.
- **The sessions-not-ended alarm** (D15).
- **The expiry rule** (A-4, D14), and the helper's report stamp, `undelivered_reported_at` (the support notices' own).
- **The base's names and shapes**, fixed at build time: the words are #125's (`passwordChangedLines`, four lines, and
  `utcMinute()`, "2026-11-05 14:32 UTC"), not the design's `passwordChangedMessage()` and `utcWords()`;
  `operator_password_notices_due(at_most)` and `operator_password_notices_stale(at_most, request)` take a batch size,
  as the outboxes' functions do; `_failed` takes `error_name`, as the base's; the expiry is `operator_mail_expire()`'s,
  the function the `mail_expiry` job calls; the migration is `20261111090000_password_changed_notice.sql`, after #126's
  `20261110090000`; the e2e drives the job through `apps/web/e2e/mail.ts`, since no `e2e/worker.ts` exists.
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
| Option (b): carry the provider's sign-out result to the notice | D10. Switch to it before the pull request opens if the review finds a surviving provider session can do more than finish a sign-in that already proved both factors |
| A non-paging filter for `PASSWORD_NOTICE_UNDELIVERED` | D9 |
| Counting a complaint as undelivered | D8 |
| No cutoff, or a cutoff on sent notices too | D7; a sent notice is SES's to deliver, and its outcome is recorded whenever it comes |
| A separate operator function to report an undelivered notice | A second exactly-once path and a grant the base's outboxes do not have; the internal helper is theirs |
| An email for a reset whose sessions were not ended | N-3's line would be false there, and a narrower one is a web and words change; the operator is paged instead (D15) |
| A `$.level = "error"` filter on the whole web log group | It pages on every error line, not on this reset (D15) |
| The CHECKs NOT VALID, validated in a second file | A-2 |

## Consequences

- Every completed reset either queues a notice, sent within about a minute, or pages the operator (D15); every notice
  bounced, suppressed, rejected, refused or not sent within 24 hours pages once (D9). The account holder learns of a
  reset they did not make from their own mailbox, and "write to the support address from this address now" brings them
  to the support desk's "Password changed, not by me" (`docs/runbooks/support-mail.md`).
- The operator role widens by one statement: the transactional set and the mail identity, from MailFromAddress alone.
  It deploys with the new platform image; while IAM propagates, a refused first send is retried a minute later.
- Only the claim reads an address, only for a pending, due notice inside the cutoff; nothing about the person rides in
  pg-boss; logs hold IDs and codes. `tp_app` cannot read or write `password_notice`, nor write
  `password_notice_sent` or `password_notice_undelivered` (`audit_event_record`).
- The residue, as the support notices': SES accepts a message and the transaction recording it then fails. The row stays
  pending and the next run sends again, so the person may get two copies; the first message's events match no notice.
- A deploy holds sign-ins, audited mutations and the mail record for the DDL and one scan of `mail_send`, or fails
  before any service moves (D11). An old and a new platform task overlap in a rolling deploy, and an old task cannot
  read a `password_changed` event, so the deploy runbook checks the mail events' dead-letter queue after each deploy.
- What proves it (SGN-16): `packages/db/src/password-notice.db.test.ts` (the table, the trigger and its guard, the
  idempotency, the reserved actions, the grants, the claim and its cutoff under the lock, `_sent`, the race, both sides
  of the message-ID lock, the retries, the stale sweep, the mirror, order independence over every sequence of up to
  three events and every position of the send's commit, the seventh column and the body diff, the kind, the expiry,
  the lock loop, the constants), `mail.db.test.ts` and `hardening.db.test.ts` (the grant map, the CHECK literals, the
  reserved actions); the worker's `password-notices.test.ts` and `password-notices.db.test.ts` (the message, the job,
  its race, its failures and its log lines) and `mail-events.db.test.ts` (the seventh column's line); the web's
  `sign-in.db.test.ts` (one notice for a confirmed reset, none for a refused, invalid or rolled-back one or the
  invitation's first password, none for the reset whose sessions were not ended, which logs the counted line) and
  `e2e/sign-in.spec.ts` (the reset journey's message in the local outbox); infra's `operator-role.test.ts`,
  `mail-streams.test.ts` and `monitoring.test.ts` (the statement, the two filters and their alarms, the line pinned in
  `sign-in.ts`); and the catalog and cross-tenant tests, unchanged.
- Not verified here (no user pool or SES in this lane): that a synthetic reset in staging produces one "Your password
  was changed | PaidWhole" message, which also proves `PasswordNoticeEmail` (the staging smoke check that #125 and this
  pull request share); how the message renders in Gmail for iOS and Outlook.com (with #129's plate).

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

## Revisit when

- A second password-change path exists (its action joins the trigger's WHEN, D2).
- SES changes its event order guarantees, or the mail record's rank rule changes (D8).
- The transactional stream gains a pause (D5).
- `"user".mfa_enrolled` can be cleared, or a reset can complete outside ADR 0081 A2's gate (D10's condition).
- The sign-in and email security review finds that a sign-in step begun before a reset can finish into a session after
  it (D10).
- The staging smoke check shows the message refused or not delivered.
