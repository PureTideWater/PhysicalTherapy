# Acting Lane A (S2): the schema queue after #126, batched (2026-11-07)
Read-only planning workflow wf_255f9403-721 (`workflow-scripts/lane-a-schema-queue-batching-plan-wf_255f9403-721.js`): seven scouts (one per queue item), two independent groupings (fewest founder cycles; lowest risk per PR), a judged synthesis, then three rounds of a completeness critic and a risk skeptic with a revision after each (issues per round 14, 12, 9, folded in; the loop stopped at its 3-round cap with the last round's issues all about PR 1's build detail, not the grouping, which held across all three revisions). The standing rule (orchestrator, 2026-11-06 22:45 UTC): batch related tables and functions where review risk allows; never more than one schema PR open; record the grouping and why. Full output: `lane-a-schema-queue-plan-2026-11-07.json`. Items marked "S2's decision" are recommended options taken under the co-founder's standing instruction and recorded for the orchestrator to note or override.
**Summary:** 10 schema PRs for about 22 queued items (about 18 founder approval cycles if each shipped alone).

## 1. Schema PR 1 (opens after #126 merges): password-changed-notice (ADR 0091, SGN-16), with the conditional SS-01 D11 rider. ADR 0081 A6 moves to Schema PR 6
### Items
password-changed-notice, built from /home/user/ops/designs/lane-a-auth-emails.md §3.1-3.8 and the follow-on list in §9. Drift from the base is fixed at build time.
- **password_notice** is a new global table with no practice_id and no PHI.
  - It has ENABLE and FORCE ROW LEVEL SECURITY and one owner-only policy, as mail_send does.
  - Nothing is granted to tp_app or tp_operator. Only definer functions reach it.
  - Columns: the design's (§3.3, including `user_id uuid NOT NULL REFERENCES "user"`), plus undelivered_reported_at, the once-only report stamp that support_grant_notice already has.
  - Indexes: UNIQUE(audit_event_id), the idempotency key; UNIQUE(ses_message_id); a partial index on next_attempt_at WHERE state='pending'; and one on expires_at.
- **The age cutoff** is 24 hours after changed_at (S2's decision, 2026-11-07, recorded in ADR 0091).
  - That is about 17 times the 81-minute retry span, so it covers a rollout and an overnight outage.
  - It applies only to pending rows. A sent row waiting on its SES event is never cut off.
  - A pending notice past the cutoff is never sent. It becomes failed with error_code 'NoticeStale' and is reported undelivered (next item).
- **The trigger** is AFTER INSERT ON audit_event WHEN (NEW.action = 'password_reset_completed'). It is SECURITY DEFINER, owned by tp_owner, with search_path pinned.
  - It also requires actor_kind 'user', object_type 'user' and object_id = actor_id, and inserts ON CONFLICT (audit_event_id) DO NOTHING.
  - The design does not state that guard. Without it, today's audit_event_record would let one user's write queue a notice to another user.
  - Its insert can fail in no way the audit insert cannot already fail: the key has ON CONFLICT, the foreign key names the acting user in the same transaction, and every other value is a constant. So it cannot newly stop a reset from ending sessions (sign-in.ts:533-553).
  - A BEGIN ... EXCEPTION wrapper was considered and rejected: a lost notice would then fail silently.
- **Operator functions:** each is SECURITY DEFINER with EXECUTE to tp_operator only, and each is pinned in mail.db.test.ts's grant map.
  - operator_password_notices_due() returns the IDs of pending, due rows inside the cutoff.
  - operator_password_notices_stale() moves each pending row past the cutoff to failed ('NoticeStale'). It returns (notice_id, user_id) for each row the helper reported. The job runs it first each minute.
  - operator_password_notice_claim(uuid) takes a pending, due row FOR UPDATE SKIP LOCKED. It checks the cutoff again under that lock and returns user_id, email and changed_at. It is the only place the address is read.
  - **operator_password_notice_sent(notice uuid, message_id text, request text) RETURNS boolean**, modelled on operator_support_notice_sent (whose RETURNS boolean shape billing_dunning_notice_sent shares):
    - It refuses a row that is not pending (check_violation).
    - It reads mail_send's state and delivered_at for message_id. SES's event can be recorded before this commit, and until then the notice's ses_message_id is NULL, so the mirror cannot find it.
    - It sets ses_message_id, sent_at and the state. The state is undelivered when mail_send is bounced, suppressed or rejected; delivered when mail_send has a delivered_at (a delivery, or a complaint after one); and sent otherwise. That is exactly the state the mirror's rule (next item) would reach had the events come after the commit.
    - It writes password_notice_sent once.
    - On undelivered it returns the helper's answer. Otherwise it returns false.
  - operator_password_notice_failed(...) RETURNS boolean, as operator_support_notice_failed does. It retries after 1, 5, 15 and 60 minutes. After the fifth try, or at once on PERMANENT_SEND_ERRORS, it marks the row failed, calls the helper and returns the helper's answer.
**The undelivered signal: one helper, four callers, one log code that pages.**
Design §3.3 has operator_password_notice_failed write password_notice_undelivered as well as the mail-event mirror. The base's support and dunning notices report the same way: each *_failed and *_sent calls its *_report_undelivered helper (operator_support_notice_sent.sql; billing_dunning_notice_sent.sql), and dunning.ts:245 and :275 and support-notices.ts:183-191 log the result.
- **The helper:** password_notice_report_undelivered(notice, request) RETURNS boolean, modelled on support_notice_report_undelivered.
  - It is SECURITY INVOKER, owned by tp_owner, with REVOKE ALL FROM PUBLIC and no grantee. It is pinned with grantees [] beside mail.db.test.ts:390-392.
  - It sets undelivered_reported_at by compare-and-set (WHERE undelivered_reported_at IS NULL).
  - It writes the password_notice_undelivered audit event: actor_kind 'system', object_type 'user', the notice's user, purpose password_changed and the request ID.
  - It returns true only that first time.
- **Its four callers, and only these:**
  - operator_record_mail_event: an SES bounce, suppression or rejection recorded after _sent;
  - operator_password_notice_sent: one of those recorded before _sent commits. mail.db.test.ts:1000-1018 tests this race for the support notices;
  - operator_password_notice_failed: a permanent SES error at send time, or the fifth failed try;
  - operator_password_notices_stale: the cutoff.
- **How each caller hands the answer back:** each returns the notice only when the helper returned true.
  - operator_record_mail_event returns it in its OUT column.
  - _sent and _failed return their boolean, and _stale returns its rows.
  - password-notices.ts logs on _sent's true (mapped to 'sent_undelivered', as support-notices.ts:189 does), on _failed's true and on each stale row. mail-events.ts logs on the OUT column.
  - The line is always 'password notice not delivered' { job_id, notice_id, user_id, reason, error_code: PASSWORD_NOTICE_UNDELIVERED }. reason is a code only: the mail state, 'NoticeStale', or the send error's name.
- **operator_record_mail_event** is dropped and created again with the same 14 arguments and one more OUT column, password_notice_undelivered uuid. It follows the existing six (recorded, state, notice_undelivered, invoice_undelivered, invitation_undelivered, stream_paused).
  - Its owner, REVOKE ALL FROM PUBLIC and GRANT EXECUTE TO tp_operator are issued again.
  - mail.db.test.ts:399's entry is keyed by the arguments, so it stays as it is and fails if the re-grant is missed.
  - mail-events.ts:296-297 selects the seventh column. The previous image selects its six named columns, so it never sees the new one.
- **The notice's own transition rule:** the branch runs only after mail_send has recorded the event. It never uses mail_state_rank, which gives NULL for 'undelivered'.
  - It matches by message ID only. A pending row has no ID, and a failed row was never accepted, so neither is touched. An event for a message whose commit failed (the residue) matches no notice.
  - delivered: sent becomes delivered.
  - bounced, suppressed or rejected: sent or delivered becomes undelivered, and the helper runs.
  - complained: no change. This is S2's decision, recorded in ADR 0091 as a departure from §3.3's text. It matches the support and dunning notices, whose branch and NOTICE_UNDELIVERED_STATES leave complained out. A complaint follows a delivery, so the person was told; counting it would log PASSWORD_NOTICE_UNDELIVERED for a delivered notice.
  - undelivered and failed are final.
  - _sent applies the same rule to a state that arrived first. The end state is therefore the same whichever order the SES event and _sent's commit come in.
- **It pages.** This is S2's decision of 2026-11-07, recorded in ADR 0091 as a departure from §3.4's 'non-paging metric filter'.
  - **Why it pages:** the base has no mail code that is counted and read by no one. Every mail code is built with an alarm (monitoring.ts:510-531), and MAIL_WARNING_CODES are logged with no filter at all. This notice is the account holder's only warning of a reset they did not make, and the operator can still give that warning another way. Volume is tiny: a notice exists only for a completed reset, and a reset needs the mailbox's code.
  - **Code:** PASSWORD_NOTICE_UNDELIVERED joins MAIL_PLATFORM_ALARM_CODES in infra/lib/mail.ts (:96), and its docblock (:90-95) is updated. infra/lib/mail.ts holds only constants and builds no construct, so the filter is not written there.
  - **Filter and alarm:** infra/lib/constructs/monitoring.ts's existing loop (:510-531) builds the counted filter and an alarm at 1 in five minutes to the operator topic. Its alarm description is added to mailCodeDescriptions, which the Record type requires.
  - **Tests:** infra/test/mail-streams.test.ts (:82-95, :319) follows.
  - **Runbook table:** docs/runbooks/deliverability.md gains a row in the alarm table (:80-97, where the count becomes 18).
  - **Runbook section:** it also gains section 3.10, 'A password-changed email undelivered (PASSWORD_NOTICE_UNDELIVERED)':
    - the log line names the notice, the user and the reason;
    - for a bounce, suppression or rejection, the address that took the code no longer takes mail;
    - for NoticeStale or a failed send, check the platform service and SES: the platform service did not send the notice within 24 hours, or SES refused it;
    - in every case, reach the person through their organization's administrator or the account contact, working by user ID. Say the password was changed at the logged time. If it was not them, follow support-mail.md's 'Password changed, not by me';
    - release a suppressed address only as 3.4 says.
**The lock order: one NOWAIT try for "user", audit_event and mail_send, before any DDL that takes a lock.** The precedents do the same: 20261109090000 section 2 (:75-89) comes before its CREATE TABLE, and #126's 20261110090000 (:78-95) comes before its ALTERs.
- **The loop** follows the read-only preflight. Each try is one subtransaction that takes:
  - `LOCK TABLE "user" IN SHARE ROW EXCLUSIVE MODE NOWAIT`, which password_notice.user_id's foreign key needs;
  - audit_event IN ACCESS EXCLUSIVE MODE NOWAIT, for the audit_event_record DROP and CREATE POLICY and for CREATE TRIGGER;
  - mail_send IN ACCESS EXCLUSIVE MODE NOWAIT, for the CHECK swap.
- **The ADR 0083 pattern:** one try a second, up to 300 tries. A refused try holds and queues nothing. If no try succeeds in five minutes, the deploy fails before any service moves, and the error names docs/adr/0091.
- **Why all three in one try:** a new-device sign-in first holds audit_event (sessions.ts:63, after which the user_device_security_events trigger calls record_security_event). It then updates "user" (sessions.ts:80, sign_in_succeeded; :83, record_sign_in_with_mfa).
  - If "user" were taken outside the loop with a plain wait, every sign-in would stall behind it.
  - The loop could then never win, so the deploy would fail after five minutes of stalled sign-ins.
- **Only after the loop:**
  - CREATE TABLE password_notice with its foreign key, indexes and policy;
  - the functions;
  - the CHECK swap;
  - the policy recreate;
  - CREATE TRIGGER;
  - operator_record_mail_event's drop and create;
  - operator_mail_expire;
  - D11's REVOKE, if it rides.
- **The foreign key stays (the design's).** It is not dropped as line_status_head's were: the loop makes its lock safe, and it ties every notice to a real account.
- **The CHECK swap** adds 'password_changed' to mail_send_kind and to mail_send_stream_kind on the transactional stream.
  - It is written plainly: DROP and ADD CONSTRAINT, with no NOT VALID. The runner applies each file in one transaction (migrate.ts:10-12, :195-198), so a VALIDATE would still scan under the same lock.
  - mail_send holds at most about 91 days of messages (:231, :243), so the scan is short.
  - A second file holding only VALIDATE was weighed and rejected.
- **The migration header states the lock window,** from the loop to the commit: the DDL plus a scan of at most about 91 days of mail_send. During the window, these wait and then proceed:
  - failed and successful sign-in bookkeeping (sign_in_failed, sign_in_succeeded), second-factor enrolment (record_sign_in_with_mfa), settings saves (monitoring.ts:223) and every other write of "user";
  - every audited mutation, and every read of audit_event;
  - every read or write of mail_send.
- **audit_event_record** is recreated from the text at 20261108090000_suspension_refusal.sql:383-391, plus password_notice_sent and password_notice_undelivered.
- **operator_mail_expire(integer):** CREATE OR REPLACE with the same signature. It also deletes expired notices.
**Registration, all in place before `pnpm db:domain-model --out` runs.** A commit after the founder's line dismisses it.
- **packages/db/domain-model/areas.json** places password_notice beside mail_send (:180). Otherwise the CLI exits 2 (sources.ts:58-60).
- **packages/db/src/schema/operations.ts:**
  - MAIL_KINDS and MAIL_STREAM_KINDS.transactional gain password_changed. mail.db.test.ts:458-463 and streams.test.ts:25 pin them;
  - a passwordNotice pgTable with every column, type and nullability;
  - any PASSWORD_NOTICE_STATES constant, and the row type.
- **packages/db/src/schema/index.ts** re-exports each of these by name in its explicit list (:258-303). migrate.db.test.ts:15 imports `* as schema from './schema'`, and 'defines every migrated table' (:626-633) fails without them.
- **The db tests' lists:**
  - migrate.db.test.ts's owners list (from :101) gains password_notice;
  - hardening.db.test.ts's reserved actions (:356) gain the two new actions;
  - mail.db.test.ts's grant map gains the five operator functions (tp_operator) and the helper (grantees []).
- **The worker's and infra's code lists:**
  - apps/worker/src/mail/streams.ts MAIL_LOG_CODES gains passwordNoticeUndelivered, and streams.test.ts:32, which pins the object exactly, follows;
  - infra/lib/mail.ts MAIL_PLATFORM_ALARM_CODES gains PASSWORD_NOTICE_UNDELIVERED;
  - infra/lib/constructs/monitoring.ts gains its alarm description;
  - infra/test/mail-streams.test.ts follows.
- **The matrix:** SGN-16 goes in docs/product/test-matrix.md, with its row in packages/synth/src/cases/matrix.ts and its entry in packages/synth/src/cases/registry.ts (as SGN-13 to SGN-15 at :1058-1070). fixtures/synthetic/SGN-16 is generated by `pnpm synth`, never by hand.
- **Not change sites:**
  - apps/worker/src/mail/events.ts:166 reads MAIL_STREAM_KINDS from @tp/db;
  - divergence-explanations.json changes only if `--strict` reports a non-informational divergence.
**App, infra and docs.**
- **The worker:**
  - apps/worker/src/platform/password-notices.ts runs the stale sweep first, then due, claim, send, then sent or failed. It logs PASSWORD_NOTICE_UNDELIVERED on _sent's true, on _failed's true and on each stale row;
  - jobs/platform.ts, with payload {};
  - config.ts gains SUPPORT_EMAIL, required only when WORKER_JOBS=platform;
  - mail-events.ts gains the new column and its log line.
- **Infra, the operator role.** The platform task runs as the operator role. That role may send to real recipients only through NoticeEmail, which covers the notices set alone (operator-role.ts:187). Its MailProbes statement (:193) reaches the transactional set only for the SES mailbox simulator.
  - So without a change, every password_changed send in staging and production is refused with AccessDenied. That error is not in PERMANENT_SEND_ERRORS, so it retries at 1, 5, 15 and 60 minutes and then fails undelivered.
  - The worker side is ready (mail.ts:171, transactional: customer). No local sender catches the gap: not MemoryMailSender, not LocalMailSender, and not the e2e outbox.
  - **The fix:** a new statement, PasswordNoticeEmail: ses:SendEmail on [mailIdentityArn, configurationSetArns.transactional] only, with StringEquals ses:FromAddress = MailFromAddress.
  - NoticeEmail stays notices-only. The docblock (:74-77) names the new statement.
  - infra/test/operator-role.test.ts pins PasswordNoticeEmail: the transactional set and the mail identity, no other set, no identity/*, and the From condition. It keeps NoticeEmail's notices-only test (:116-127).
  - The transactional stream stays, as the design chose it: it keeps the account's suppression list, nothing pauses it, and the same set carries the reset code. The kind/stream CHECK therefore stays as planned.
  - It deploys with the new platform image. While IAM propagates, a refused first send is simply retried a minute later.
- **Infra, compute:** SUPPORT_EMAIL is set on the platform task (compute.ts).
- **The words are the base's, unchanged** (next item): passwordChangedLines, PASSWORD_CHANGED_SUBJECT and utcMinute (words.ts:122-141), and template.ts's 'account' variant (:14). This PR edits neither words.ts nor template.ts.
- **Docs:**
  - ADR 0091 records the trigger's guard, the 24-hour cutoff, the complained rule, the fourth (_sent) path, the paging decision, the operator role's new statement, why the lines hold (next item) and the rollback (item 7);
  - ADR 0065 gets a dated note: the operator role now sends one kind on the transactional set;
  - SGN-16;
  - support-mail.md's 'Password changed, not by me' (O-7: the orchestrator confirms the steps);
  - deliverability.md's row and section 3.10;
  - the deploy-and-rollback.md section (item 7).
- **Records:**
  - PR 1's LANES.md claim row changes from 'Two reviews (sign-in and email; database)' to three: sign-in and email security; database, mail and deploy; and UX and brand with renders.
  - A6's move to PR 6 is recorded in the schema-chain status file.

**Tests (each failing first; design §3.5, plus these):**
- **SES events:**
  - delivered, then complained: the notice stays delivered, with no undelivered event and no log line;
  - a bounce, then the same bounce replayed: one password_notice_undelivered event and one PASSWORD_NOTICE_UNDELIVERED line;
  - a late event for a message whose commit failed (the residue) leaves the notice alone;
  - a mail event never touches a pending or a failed notice.
- **The race (as mail.db.test.ts:1000-1018):** a bounce recorded before _sent makes _sent return true, leaves the notice undelivered and writes one audit event. A delivery, or a delivery and then a complaint, recorded first makes _sent give delivered and false.
- **Order independence:** a property test shows the end state is the same whichever order the events and _sent's commit come in.
- **The race in the job:** a password-notices.db.test.ts case whose sender records the bounce before _sent produces one log line.
- **Send failures:**
  - a permanent SES error at send: one undelivered event and one log line, and no retry;
  - the fifth failed try: one of each;
  - a pending notice past the cutoff: failed 'NoticeStale', one of each. The claim refuses it even when it crosses the cutoff between due and claim.
- **The trigger's guard:** the actor and object checks.
- **Grants:** the helper's grantees [] and the re-grant of operator_record_mail_event.
- **Locks:** a db test holds a sign-in transaction's ROW EXCLUSIVE on audit_event, and the migration's loop is refused without queueing behind it.
- **Infra:** PasswordNoticeEmail is pinned, and the PASSWORD_NOTICE_UNDELIVERED alarm exists at 1 in five minutes to the operator topic.
- **SGN-16, the provider sign-out failing:** a reset whose provider sign-out throws still ends the app sessions, queues one notice, sends the same four lines and logs 'password reset provider sign-out failed'.

**Timestamp and regeneration:** the timestamp sorts after 20261110090000. domain-model.md and packages/db/functions are regenerated on top of #126's merge.
**What the email's lines claim: #125's security-N-3 and ux-brand-N5 are closed in ADR 0091 with reasons (option (a)).** This is S2's decision, 2026-11-07. words.ts and the web do not change.
- #125's review handed both findings to ADR 0091: 'the lines take the path and the sign-out result, with SGN-16 cases'.
- **Option (b) was weighed and rejected.** It would carry the sign-out result to the notice: an event recorded after globalSignOut (sign-in.ts:548) and a narrower line. It would edit the web and words.ts, which #129 is editing.
  - It also races: the job can claim the notice before a failed sign-out is recorded. To be right, every notice would have to wait.
  - It would make the line less accurate, not more, because the line is about the sessions PaidWhole holds, which the facts below show have ended.
- **ux-brand-N5** ('with a code sent to this address' is true only for a reset) is closed by the trigger's WHEN: only password_reset_completed queues a notice, and design §3.2 found no other change path.
- **security-N-3, 'Every session of this account has ended.'** ADR 0091 records why this holds without the provider's result.
  - The app's sessions are its own rows. revokeUserSessions and the password_reset_completed insert are one withActor transaction (sign-in.ts:533-538), and the trigger fires on that insert. So a notice exists only if every app session of the account has ended.
  - Cognito tokens are never a PaidWhole session. They live only inside the sealed pending sign-in cookie (pending.ts), which the browser cannot read, for at most the step's 5 or 15 minutes (step-limits.ts).
  - The refresh token is revoked when the sign-in step ends (release(), cognito-provider.ts:438). Access tokens last 15 minutes (identity.ts TOKEN_LIFETIMES). The client writes no attribute (identity.ts:143).
  - **What a provider session that survives a failed AdminUserGlobalSignOut can do:** only finish, within those minutes and through the app's server, a sign-in step that had already been started. **What it cannot do:** reach a page, PHI or a setting, or change the account's attributes.
  - Review (1) checks each of these facts. That includes whether a step begun before the reset can finish into a session after it. If it can, ADR 0091 says so, and the case is added to SGN-16.
  - If the review finds a surviving provider session can do more than finish a sign-in that already proved both factors, the build switches to (b) before the PR opens and plans it against #129's overlap.
  - SGN-16 carries the provider-sign-out-fails case (previous item).
- **The second sentence of line 2 ('Signing in still asks for your authenticator code or hardware key.')** holds on every path that completes a reset, for four reasons:
  - a code is requested only for an active, mfa_enrolled account (sign-in.ts:477; ADR 0081 A2);
  - the confidential client means only the app can start ForgotPassword (ADR 0088);
  - no code path sets "user".mfa_enrolled to false (git grep on 31a7345f finds none);
  - a reset never removes the second factor (ADR 0081 A5).
  - ADR 0091 records these four facts, and a condition: any later change that can clear mfa_enrolled, or complete a reset outside A2's gate, adds the narrower line in that same PR.
**Safe with the previous image, and on rollback.** This is the first change that adds a mail kind (mail_send_kind appears only at 20261107090000:202 and :222). A rollback redeploys the previous image against the new schema (ADR 0009:42-43; ADR 0049:147, with tp:skipMigrations=true). This section goes in the migration header, in ADR 0091, and in a new docs/runbooks/deploy-and-rollback.md section, 'Password-changed notices (ADR 0091; PR 1)', modelled on PR 6b-4's (:212-226).
- **The forward deploy:**
  - The migration runs before the new platform image. The trigger queues notices from that moment, and they wait, within the cutoff, until the new platform task sends them.
  - The web is unchanged. The old worker selects named columns.
  - The section also documents the migration's lock loop and its five-minute failure message, as SUITE-CAP-1b's section does (:282-299).
- **On rollback, what the previous platform image cannot do:**
  - It cannot read an SES event of kind password_changed. events.ts:165-168 throws MailEventUnreadable, and mail-events.ts:419-423 logs MAIL_EVENT_UNREADABLE and leaves the message.
  - After 5 receives (infra/lib/mail.ts:50-52) the message moves to tp-<env>-mail-events-dlq and raises EventsDeadLetter (threshold 1; mail-streams.ts:270-280). It also raises EventsQueueAge if the event waits longer than 15 minutes.
  - Notices already sent stay 'sent', and their bounces go unreported, until the events are redriven.
  - The previous image has no password_notices job. The trigger still queues notices. Those not sent within 24 hours become NoticeStale and page PASSWORD_NOTICE_UNDELIVERED one by one.
- **The runbook's instruction:** roll forward rather than stay back. After rolling forward, redrive tp-<env>-mail-events-dlq (deliverability.md 3.6), so that delivered and bounced states, and any PASSWORD_NOTICE_UNDELIVERED, are recorded.
- **The rolling deploy:** the platform service is rolling (minHealthyPercent 100 and maxHealthyPercent 200: infra/lib/environments.ts:47, :151), so an old and a new task overlap.
  - Review (2) checks whether the old task can receive one password_changed event five times in that overlap.
  - If it can, the deploy section says to check the dead-letter queue after each deploy and redrive it.
Conditional rider: SS-01 D11, `REVOKE UPDATE (status), INSERT (status) ON organization FROM tp_app` (20261015140000_tenancy.sql:596-597).
- **When it rides PR 1:** only if the founder states, before PR 1's database review starts, that every environment runs an image that contains #104. That image is then the one a rollback from the carrier returns to. GitHub shows no deployments or tags.
- **Otherwise:** it rides the first non-ledger schema PR built after the founder states that fact. That is PR 3, PR 4, PR 6 or PR 7, or a later one if skip-ahead reorders them. It never rides PR 2 (an exact grant) or PR 5 (a pending freeze ruling).
- **The rollback floor, wherever it rides:** a pre-#104 image suspends and reinstates with a direct UPDATE of organization.status as tp_app (designs/ss-01-suspension.md:201, :487). On this schema those writes are refused (42501).
  - The carrier's migration header, ADR 0080's dated note and a deploy-and-rollback.md section 'Rollback across D11' say so: never roll back past #104 on this schema, and roll forward with a fix instead. This follows the SUITE-CAP-1a precedent (:296-299).
  - The carrier's database review checks the floor against the image each environment runs.
- **Whichever PR carries it also changes these:**
  - organization-status.db.test.ts:229-238 flips to expect tp_app's direct status write refused (42501).
  - The tp_app refusal tests after it (from :243, including :265's INSERT with a status) are re-pointed: their 23514 becomes 42501. The trigger's own guard stays covered by a role that can still write status: the owner, as :255 does, or the definer setter.
  - console-routes.db.test.ts:891-900: the direct suspension is written as the owner, standing for a row the previous image left, and the page still reads it as one whose author was not recorded. tp_app's direct writes expect 42501.
  - BIL-08 is reworded in docs/product/test-matrix.md:306 and packages/synth/src/cases/matrix.ts:628. tp_app's direct status write is refused (42501). A suspension the previous image wrote still reads as one whose author was not recorded. The trigger stays as a second guard.
  - fixtures/synthetic/BIL-08 is regenerated with `pnpm synth`, never by hand.
  - ADR 0080 gets a dated note: D11 is closed, the trigger is kept as a second guard, and the rollback floor is stated.
  - D11 is marked done under LANES.md 'Handed to Lane A'.
  - The build greps for every tp_app write of organization.status, seed and e2e helpers included.

### Why together
- **password-changed-notice** is the fixed next item.
- **Inside the item, not riders.** These are parts of the item, without which it is wrong or does not work:
  - the operator role's transactional send: without it, every send is refused in staging and production;
  - the fourth undelivered path, _sent, for SES's event recorded before the commit;
  - the paging alarm and its runbook section;
  - the rollback section;
  - ADR 0091's ruling on #125's N-3 and N5, which #125's review handed to this ADR.
- **D11:** SS-01's design (designs/ss-01-suspension.md:201, :1188) assigns it to 'the first schema PR after SS-01 is deployed'. Its placement comes from that rule, not from batching.
  - #126 cannot carry it: its last review round would reset.
  - PR 2 cannot carry it: its grant is exact.
  - So PR 1 is the earliest carrier, and it needs only a deploy fact. Its rollback floor is written wherever it lands.
  - The fallback names every non-ledger schema PR.
- **ADR 0081 A6 moves to Schema PR 6.** It is S2's decision of 2026-11-07, which replaces the earlier choice to ride PR 1.
  - A6 is in no queue. Its only source is ADR 0081:263-265.
  - The earlier reason, a second founder cycle saved, was wrong. PR 6 happens anyway for the queued relink, so in PR 6 A6 costs one CREATE OR REPLACE inside a PR the founder approves anyway.
  - In PR 1 it would add the reset-request path (A2 and A3's 1,500 ms floor, SGN-05) and a second definer write inside the revoke transaction. That would land on the PR that the granted ledger PR, and D14's move of step 7b, wait behind.
  - The decision is recorded in the schema-chain status file and in PR 6's entry.
- **The undelivered signal follows the base's pattern on all four paths.** One internal helper gives one exactly-once report and one log code. A separate tp_operator function would add a second exactly-once path, and a grant the pattern does not have.
- **One lock try for "user", audit_event and mail_send.** The table's foreign key needs "user", and a sign-in takes audit_event before "user". Taking them apart would stall sign-ins and fail the deploy.
- **Kept out** (they would turn a ready, designed item into one waiting on design cycles):
  - SS-01 D15's mail with Q13, and #32's notice (PR 7);
  - SEC-N5 (Cognito's auth_time is unverified);
  - the Cognito relink (undesigned; different objects);
  - A6 (above).
- **Build now; open later:** the build starts beside #126's finish, and the PR opens only after #126 merges.

### Reviews
- Each adversarial finding is checked by a skeptic. A completeness critic runs. The loop continues until a round finds nothing new.
- (1) Sign-in and email security. The security review's scope includes the wider operator role.
  - **The trigger's guard**, and that the notice insert adds no failure mode to the revoke transaction.
  - **The address** is read only in the claim, and only for pending, due rows.
  - **The two new reserved actions** in audit_event_record.
  - **N-3 and N5:** verify every fact ADR 0091 relies on:
    - the trigger fires in the revoke transaction;
    - Cognito tokens live only in the sealed pending cookie, for at most 15 minutes;
    - the refresh token is revoked when the step ends;
    - the client writes no attribute;
    - whether a step begun before the reset can finish into a session after it.
    If a surviving provider session can do more than finish a sign-in that already proved both factors, the build switches to option (b) before the PR opens.
  - **Line 2's second sentence:** its four facts.
  - **PasswordNoticeEmail:** the transactional set and the mail identity only, from MailFromAddress; NoticeEmail unchanged; no identity/*.
  - **A double send** when SES accepts the message and the commit then fails (the residue).
  - **PASSWORD_NOTICE_UNDELIVERED:** that it pages, and that its runbook section is right.
- (2) Database, mail and deploy.
  - **The table:** FORCE RLS, owner-only, and the owners list in migrate.db.test.ts.
  - **Locks:** the NOWAIT loop and its order; the plain CHECK swap and its scan; the lock window stated in the header.
  - **operator_record_mail_event:** the DROP and CREATE, its re-grant, and the seventh column.
  - **The four helper paths,** including the race in _sent, and order independence.
  - **The indexes and the cutoff.**
  - **The catalog and cross-tenant tests.**
  - **The previous image and rollback:**
    - the header and the deploy-and-rollback section;
    - events.ts:166 on the old image, and the dead-letter queue and its alarms;
    - notices left 'sent' until a redrive;
    - the 24-hour stale pages.
  - **The rolling platform deploy (100/200):** whether an old task can drain one password_changed event five times.
  - **IAM propagation:** AccessDenied retries at one minute.
  - **If D11 rides:** the REVOKE against each environment's running image, and the rollback floor.
- (3) UX and brand, with renders (LANES.md rule 1, 'Screens'; part 1, #125, took the same review).
  - **Renders:** the password-changed email on the base after #129 (the White plate header), in light, dark-preferred and dark-inverted, at 600 and 390 px.
  - **The email:** the subject line, the four lines (words.ts unchanged) and the 'account' variant.
  - **If #129 has not merged** when the review runs: render on the current base, and render again after #129 merges, before the PR opens.
  - **Add a mail and deliverability correctness pass:** events.ts:166, the retries, the expiry, the stale backlog and the new alarm.

### Founder gates
- CO-02:
  - We post the domain-model.md approval line only as one suggested-change comment through gh api. We never write the line or approvers.json.
  - The founder commits it.
  - ADR 0063: the founder approves the latest commit and the required checks are green before the merge.
- O-1 (the follow-on's migration) is answered by that CO-02 line. No ledger or engine freeze exception is needed.
- D11 rides only on the founder's deploy fact: every environment runs an image that contains #104, so a rollback from the carrier never lands below #104. It is a fact to state, not a ruling.
- Not gates:
  - #125's and this PR's staging smoke checks: one synthetic reset produces one 'Your password was changed | PaidWhole' message. After this PR, that check also proves the operator role's new statement;
  - the infra changes (the IAM statement, the alarm and SUPPORT_EMAIL), which ride the founder's normal deploy with the new platform image.

### Risk
**Lenses:** auth moderate to high, now including a wider operator role; mail and deliverability moderate; PHI and tenancy low; no money.

**Size:** medium to large. About 450-550 lines of SQL (operator_record_mail_event's whole body is issued again under DROP and CREATE), and 35-45 files including tests, infra and three runbooks.

**Deploy:** safe with the previous image.
- Every object is additive, and the CHECKs only widen.
- The old worker selects named columns, and the web is unchanged.
- The migration runs before the new platform image (ADR 0049).
- The lock window holds sign-ins and audited mutations for the DDL and the mail_send scan. The loop fails the deploy, before any service moves, after five minutes without a free moment.

**Rollback:**
- The previous platform image cannot read password_changed events: they go to the dead-letter queue and raise EventsDeadLetter, and notices stay 'sent' until a redrive after rolling forward.
- Notices queued during a rollback longer than 24 hours become NoticeStale and page.
- The runbook says to roll forward.

**Cautions:**
- Until the operator role's statement deploys, every send is refused, and only the staging smoke check would show it. The infra test now pins the statement.
- #129 overlaps softly in template.ts. This PR edits neither template.ts nor words.ts, but the renders should be taken after #129 merges.
- D11 is safe only once no image older than #104 runs anywhere, and it sets a rollback floor.

## 2. Schema PR 2 (opens after PR 1 merges): the SUITE-CAP-3 ledger-function bodies under the founder's grant of 2026-11-06 ~22:40 UTC (relayed in the 22:45 UTC entry), alone
### Items
One migration: CREATE OR REPLACE of ledger_line_net(uuid,text) and ledger_entry_rules(), exactly as /home/user/ops/approval-summaries/lane-b-suite-cap-3-freeze-exception-ask.md writes them.
- **Which text was granted:** the ask's text at the grant, 38123394 (22:28 UTC).
  - Its later revisions (f795bf28, and the 2026-11-07 review rounds 1, 3 and 4, now on build-ops 8eab931e) changed prose and added proof items only. The ask's header says both bodies are exactly as granted.
  - At build start, the build diffs the two bodies in the ask at the grant against the ask then. Any difference stops the build for a new ruling.
- **Header and preflight:** the header cites the grant.
  - A preflight DO block refuses unless both current bodies are the 20261027090000 ones. On base 31a7345f their hashes are f151e27ea09f28c1 and abbcba68f46fd135.
  - #126 touches neither function. Both hashes are checked again on #126's merged head.
- **Comment:** the migration's comment says that the practice condition and the ORDER BY e.seq exist only for the plan, as the ask's added proof item asks.
- **Timestamp:** it sorts after PR 1's.
Proof, as the grant and the ask's added items name it:
- the refusal tests:
  - no match;
  - another practice's match, which needs a two-practice app.practice_ids scope;
  - a reversed match, on both the correction path and the entry path;
- the cross-practice test: tp_app calling ledger_line_net on another practice's line gets 0, before and after. It is written on #126's base;
- the plan test:
  - it plans the statements as they stand in the installed functions, read from the database's own copy of each function;
  - it first switches automatic analysis off on the two ledger tables and checks that neither was ever analyzed;
  - it must use the line index and the match's primary key;
  - it is shown to fail against today's two bodies first;
- LED-01 to LED-18, LED-23 to LED-25, and the ledger oracle;
- the write-equality dumps, ordered by ledger_match.seq, at F 10,000 and R 2,000, and the counts and cents at A's month;
- all of it re-measured on #126's merged head, with nothing else running on the container.
The grant's record:
- **ADR:** a dated note in ADR 0087 if Lane B's SUITE-CAP-3 PR has merged it by then. Otherwise the note goes in ADR 0083, where SUITE-CAP-1b's grant is recorded and which D14 amends.
- **reconciliation-001:** the grant also goes in its freeze list (:466-467), beside #126's.
- Both follow founder-asks-2026-10-27.md:86-88: 'records the grant in its ADR and in reconciliation-001'.
Not in this PR:
- **D14's acceptance:** step 7b back to A's month, the Known gap line, CAS-51's and CAS-42.3's budgets, and the fillx CAS-42 variant. It is a no-migration follow-up PR made after both this PR and Lane B's SUITE-CAP-3 worker PR merge, measured on that merged tree after 14.4 item 12's auto_explain of ledger_entry_within_evidence.
  - If A's month is over 360 s, step 7b stays on F, and the Known gap line is reworded to name the remaining term, never removed.
  - This keeps the orchestrator's 22:31 UTC ruling ('once Lane A's two trigger fixes merge'). The granted money change does not wait on a capacity acceptance that only the move needs.
- **No other ledger function.** ledger_entry_within_evidence, ledger_line_stage and the interest branch go to PR 5's ask.

### Why together
- **Exact grant:** the grant covers exactly one migration with these two bodies, and a batch never widens a grant (LANES.md:366, :368). Nothing else goes in it. No other ledger function may join it conditionally, even one designed and measured early: that would put a second freeze ruling and new measurements in front of the granted change.
- **D14's move follows as a no-migration PR.** It needs Lane B's worker PR merged and its own measurement, and the orchestrator's ruling places it after the merge.
- **Not batched with PR 1:** the objects are disjoint, the review lenses differ, and the standing rule batches only related tables and functions.
- **Time to value:**
  - SUITE-CAP-3's design loop wf_d171f0f0-948 has finished, and the ask still says the bodies are as granted. Build and measure now, in parallel with PR 1, on #126's head, with nothing else on the container.
  - It is then ready to open the moment PR 1 merges.
  - If Lane B's worker fix has not merged, merge 0b6e90eb into the local measurement tree only, so the worker does not dominate the pass. The proof is re-run on the tree PR 2 actually merges onto.

### Reviews
- (1) Payment engine and ledger.
  - The equivalence argument: primary-key lookups return at most one row; a missing target counts as nothing; a NULL line or match_id behaves as before; every entry carries its line's practice under the tenant policy.
  - The write-equality dumps re-run on #126's merged head.
  - The refusal texts and codes, unchanged word for word.
  - The recovered totals, unchanged.
- (2) Database, tenancy and plan.
  - Both functions stay SECURITY INVOKER with search_path pinned.
  - The new read of service_line.practice_id sits under the same app.practice_ids RLS predicate.
  - EXPLAIN (GENERIC_PLAN) as tp_app on a never-analyzed copy of #126's head.
  - The plan test reads the installed functions.
  - The OID, owner, ACL and the trigger bindings on ledger_entry are kept.
- Each finding is checked by a skeptic. A completeness critic runs.

### Founder gates
- Ledger freeze exception: GRANTED for exactly this DDL.
  - Any DDL change, or any added ledger function, needs a new ruling.
  - If the delta review wf_44d7c772-605, or any later revision of the ask, changes either body, the orchestrator must ask the founder again before the build.
- CO-02:
  - Appendix C's two function hashes change, so the line 'Tyler Williams 2026-11-05' goes stale.
  - A new approval line is needed, posted only as a suggested-change comment.
- ADR 0063: the founder approves the latest commit, and the required checks are green.

### Risk
**Money:** high stakes, small change. The new bodies claim identical results, backed by write-equality measurements: 102,907 rows at F 10,000 and 20,635 at R 2,000, seq included, with the same recovered totals. At A's month only the counts and the cents were compared.

**Plan:** the gain depends on PostgreSQL 18's choice of generic plan. Production, CI and the probe all run PG18, but the gain must be measured again on #126's head, which adds ledger_match.seq and its index.

**Deploy:** safe with the previous image and on rollback. It takes no table lock.

**Size:** about 170-220 lines of migration plus tests. Verification takes 1-2 hours of compute.

## 3. Schema PR 3: the approval and export binding. tp-packet-verifier/3 (packet-figure-placeholders slice 3), with #38's stored words version and 'words_changed'
### Items
The /3 migration, from /home/user/ops/designs/lane-b-packet-figure-placeholders.md §6.3. At build time it is synced to ADR 0089, slice 2's final code and the packets verifier identifier fold.
- **packet_verifier_report_valid(jsonb)** (CREATE OR REPLACE, same signature, IMMUTABLE):
  - /3 is /2's keys plus rendered_sha256, matching ^[0-9a-f]{64}$;
  - it adds six new codes of kind 'fact': free_figure, number_word, unknown_fact, fact_not_canonical, fact_contradicted and fact_not_separated (handoff 11-10 §4 item 3);
  - an optional 'canonical' key, on fact_not_canonical only, bounded by the fact-id grammar;
  - /1 and /2 are accepted byte for byte as today.
- **packet_version_current_verifier():** an approval requires /3.
- **packet_version_export_guard():** the export report is /3 and passes, and its narrative_sha256 and rendered_sha256 equal the stored report's.
- **case_activity_belongs' approval-request check** (20261024110000 ~line 102) changes only if the build finds it reads the format.
- **The flip:** the one-line VERIFIER_FORMAT = 'tp-packet-verifier/3', plus the comments in schema/packets.ts:100,126 and the row-factory.ts:154 fixture. It ships with or after slice 4's export render.
Moved up from the rest of 'Handed to Lane A' (#38; /home/user/ops/designs/lane-b-figures-in-words.md §2.2, '(recommended to Lane A)'): packet_version.approved_words_version and packet_version.export_words_version.
- **Columns:** both are nullable text with CHECK ^[0-9a-f]{64}$. Both are defined in packages/db/src/schema/packets.ts before the regeneration.
- **approved_words_version** is set in the approval statement, and the approval guard is widened to it.
- **export_words_version** is set by the export job, which refuses a mismatch with 'approve again'. The review page disables Attest on a mismatch.
- **Failure code:** 'words_changed' is added to packet_export_failure_codes(), with its web text (export-attempts.ts EXPORT_FAILURE_TEXT). Today a mismatch fails as render_failed.
- **App code:** the writers in the web approval handler and the worker export job are in this PR.
D11's REVOKE, if the deploy fact has been stated and D11 has not landed (with its rollback floor; see PR 1's D11 item).

### Why together
- **Same table and functions:** both items change packet_version and the same two trigger functions (the approval guard and the export guard).
- **Same purpose:** both bind what the approver saw to what the export prints.
- **Complementary:** /3's rendered_sha256 binds the narrative's rendered text. The stored words version binds the worksheet's words, which rendered_sha256 does not cover. Together they close the 'approved under one renderer, exported under another' gap (figures-in-words §3.8).
- **One cycle:** one review of the binding and one founder cycle, instead of recreating both guards twice.
- **Ordering:**
  - The PR opens only once slices 2 and 4 have merged, since the flip ships with or after slice 4's export render.
  - The packets verifier identifier fold (MOD-19, MOD-20) has also merged, or its branch or design has been checked and records that it adds no verifier code or report key. Slice 2, the fold and /3 touch the same verifier files, one at a time (handoff 11-10 §2; LANES.md rule 6).
  - /3's codes and keys are synced to slice 2's and the fold's final code. Otherwise a stale code list would need another schema PR.

### Reviews
- (1) Payment engine and money:
  - the export binding;
  - the approval guard;
  - no free-text figure reaching an approval under /3;
  - the words-version refusal and its 'approve again' path.
- (2) UX and brand (LANES.md rule 1), with before and after shots at 1280 px and 390 px of:
  - the review page with Attest disabled on a words-version mismatch;
  - the packet page showing words_changed.
- (3) Database, compliance and deploy order:
  - CREATE OR REPLACE does not revalidate existing rows against the CHECK, so /1 and /2 must stay byte-identical;
  - the previous image fails closed (it cannot approve or export /2), which the design accepts;
  - the new columns' CHECK and their Drizzle definitions;
  - CO-02's regenerated function files;
  - approval bound to the rendered text;
  - D11 and its rollback floor, if it rides.
- Each finding is checked by a skeptic. A completeness critic runs.

### Founder gates
- CO-02 line, and ADR 0063's approval of the latest commit. No freeze exception: packet_version is not ledger-frozen, and no engine file changes.
- The words version is not founder-gated. The heading of #38's §2.2 ('only if the founder asks') governs the stored worksheet, which this PR does not include, and the section's text recommends the words version to Lane A. If the orchestrator reads the heading otherwise, the words version leaves this PR. It is never left waiting on the founder.

### Risk
Medium. No amount is computed.

**Deploy:** fails closed during the rollout.

**Code sync:** the codes and keys must match slice 2's and the fold's final code.

**Writers:** the words-version writers are app code in Lane B's packet files, after slice 4.

**Timing:** slice 2 is in review, slice 4 has not started, and the fold is undesigned. So this PR will probably not be openable when PR 2 merges (see the skip-ahead question).

## 4. Schema PR 4: #85's database rules for payer response letters and source documents (design §7.2, items 1 to 5), with F4 if it is designed in time
### Items
case_line_rules(): a person's 'Window passed' write-off is refused on a window that has not ended (the handler's check, mirrored in Postgres).
console_contract_queue() leaves out response letters, with the index payer_response_by_document (practice_id, document_id) WHERE document_id IS NOT NULL.
payer_response_belongs(): the named letter must be:
- the practice's own;
- top-level;
- a payer_letter or other;
- clean;
- stored;
- named by no contract_version.
contract_version_documents_ok(): refuses a document a payer_response names. Items 3 and 4 take the advisory lock 'document_use:'||id that the handlers already take.
An upload-time link column on source_document (for example filed_for_submission_id), written only at insert and defined in its Drizzle table before the regeneration. Its web half follows in a later Lane B PR.
Conditional, moved up from the rest of 'Handed to Lane A': F4, a reviewed and audited correction of a document's kind. It joins only if its design is written and reviewed before this PR's build starts. D11's REVOKE joins too, if the deploy fact has been stated and D11 has not landed.

### Why together
- **One designed set:** items 1 to 5 come from one design with SQL sketches, each the Postgres mirror of a handler check.
- **Shared document rules:** items 2 to 5 share the response-letter predicate and one lock key.
- **F4:** a kind correction changes what items 3 and 4's triggers read. Designing them together gives one coherent set of source_document rules and one review. If F4 is not ready, it never holds this PR.
- **15b's case close does not join**, although it touches case_line_rules. It is designed only as a §0.5 sketch, its writer is in apps/worker/src/reconcile/ (which Lane B's SUITE-CAP-3 worker PR is changing), and its stated home is milestone PR 8's case schema (see kept apart).
- **Unrelated to the others:** none of these objects touch PR 1-3's objects or the ledger freeze. case_line, payer_response, source_document and contract_version are not frozen.

### Reviews
- (1) Security and PHI:
  - a response letter's pages shown to roles without phi.read;
  - the upload-time link's write path;
  - who may name which document.
- (2) Database and concurrency:
  - the advisory locks taken inside triggers and handlers;
  - console_contract_queue's definer function: its search_path, and its save and restore of app.practice_ids;
  - the index;
  - a count of the existing case_line rows the new refusal would have refused (§7.2 item 1);
  - D11 and its rollback floor, if it rides.
- Add a correctness pass on case_line_rules' write-off branch. Each finding is checked by a skeptic, and a completeness critic runs.

### Founder gates
- CO-02 line, and ADR 0063's approval of the latest commit. No freeze exception.

### Risk
Low to moderate. No amount changes.

**Deploy:** safe with the previous image, since the refusals mirror handler checks that image already applies. The new column is written only by a later web PR.

**Lock:** the index on payer_response is small.

## 5. Schema PR 5: the ledger-freeze batch. #93's F9 (a fifth roi_links_valid() key), plus every other queued ledger item the founder grants in the same ask
### Items
F9: roi_links_valid(jsonb), defined at 20261023120000_recovery_ledger.sql:231 and used as roi_statement's CHECK at :255.
- It still accepts the existing four-key rows, and requires a fifth key, actionable_open_lines, on new rows.
- The ROI statement writer stores the priced_line IDs its actionable figure counted.
Joins only if granted in the same founder message, designed, and measured before this PR's build starts. Each is its own migration file, exactly as granted:
- ledger_entry_within_evidence (SUITE-CAP-3 §14.4 item 12; 76 s of A's 310 s);
- ledger_line_stage (item 7);
- ledger_match_rules' interest branch (item 11);
- SUITE-CAP-3's index or table parts, if its design review needs any.

### Why together
- **Queue place:** F9 is queue item 5 (handoff 11-10 §4), before the relink and before 'the rest', so this PR keeps the fixed order.
- **Frozen table:** F9 changes roi_statement's CHECK, which is ledger-frozen (reconciliation-001.md, 'No migration alters ... roi_statement'). It needs its own founder exception, and would block any PR it joined that needs none.
- **Same ruling, same proof:** the other ledger items need the same kind of ruling, under the same proof set (the LED rows and the ledger oracle) and the same money lens.
- **One cycle:** one founder ask and one approval cycle then cover all of them.
- **Send the ask early:** one combined ask, relayed by the orchestrator, sent well before this PR's turn, so the one-schema-PR slot does not idle on it.
- **15b's four ledger items do not join:** they are done. Interest credited twice, N1's 'allocated' flag and the ledger_match sequence close with #126 (its ADR 0084), and the superseded-claim index is on the base.

### Reviews
- (1) and (2) Two payment-engine and money reviews.
  - A stored statement's actionable figure can be recomputed from the stored IDs.
  - Old four-key rows are still accepted.
  - No change to the recovered total or the proof level.
  - For each joined ledger function: the equivalence argument and the write-equality dumps, as in PR 2.
- Add a database review: the CHECK's treatment of existing rows, and the plan of each joined function. Each finding is checked by a skeptic, and a completeness critic runs.

### Founder gates
- A ledger freeze exception for roi_links_valid and its writer, and for each joined item. One combined ask, sent early.
- CO-02, and ADR 0063's approval.
- #93's open question 3 (whether case.actionable_cents should hold the live figure) is NOT part of this PR. It reverses ADR 0082's stored case total, and is a product ruling.

### Risk
Money-adjacent: a stored statement's figure, plus any joined ledger bodies.

**Size:** a small SQL change, plus the writer and tests.

**Deploy:** safe with the previous image only if the new body still accepts four-key rows written by the old image.

**If the grant is not in:** if the founder's grant has not arrived when this PR's turn comes, the chain skips ahead (see the open questions).

## 6. Schema PR 6: sign-in identity on the "user" row and the reset trigger. The Cognito relink (queue item 6), ADR 0081 A6 (moved from PR 1) and SEC-N5 if queued
### Items
The relink. It is undesigned. The scout note is /tmp/claude-0/-home-user-PhysicalTherapy/6af08ef9-734c-5d6d-a787-51ade7156d78/scratchpad/plan/relink-cognito-subject-scout.txt.
- One SECURITY DEFINER function: compare-and-set from the old cognito_sub to the new one.
- It acts only on an account that is invited, has never enrolled, and has no accepted invitation.
- An optional BEFORE UPDATE OF cognito_sub guard trigger, and an audit event.
- tp_app may INSERT cognito_sub but never UPDATE it.
ADR 0081 A6, moved here from PR 1 by S2's decision of 2026-11-07, which replaces S2's earlier choice to ride PR 1. It is recorded with who, when and why in the schema-chain status file, and S2 enters it in the queue beside the relink. password_reset_requested and password_reset_completed also become security_event rows.
- **Where:** a branch of PR 1's trigger function (CREATE OR REPLACE, with the trigger's WHEN widened under PR 1's NOWAIT lock pattern), or its own trigger on audit_event if the design finds that simpler. After the same actor and object guard, it calls record_security_event('user', NEW.object_id, NULL, purpose), with the purposes 'password_reset_requested' and 'password_reset_completed'. The security_event row it writes does not match the WHEN, so the trigger never fires again on it.
- **A failure must not undo the reset:** the record_security_event call runs in its own BEGIN ... EXCEPTION block. So its failure can never roll back revokeUserSessions (sign-in.ts:533-553), and never change the request's 'code_sent' answer or its 1,500 ms floor (A2, A3; SGN-05).
- **What it changes:** every reset request and every completion gains a second audit_event row (actor = the user, object = the user).
- **Tests:**
  - sign-in.db.test.ts's events() (:113-116) reads object_id = $1 OR actor_id = $1, so the exact lists at :443, :511 and :935 gain the new rows;
  - the build greps every exact audit or security_event list whose journey requests or completes a reset (sign-in.db.test.ts, e2e and hardening tests) and updates each one;
  - new: a request writes one security_event row, and a completion writes one;
  - new: a forced security_event failure still ends the sessions and keeps 'code_sent' inside the floor.
- **Docs:** a dated amendment to ADR 0081 A6 ('a migration left to Lane A' is done here). Its matrix row takes the next free SGN number, checked at claim time, in test-matrix.md, synth matrix.ts and registry.ts, with its fixture generated by `pnpm synth`.
SEC-N5 (ADR 0081 Not covered), if the orchestrator queues it: a reset time on "user", stamped by the password_reset_completed trigger, which authenticated() checks against auth_time.
- It comes only after staging shows that Cognito's auth_time, for a challenge answered after the reset, records the sign-in's start and not its completion. Otherwise the check closes nothing, and SEC-N5 is left out.
D11's REVOKE, if the deploy fact has been stated and D11 has not landed (with its rollback floor).

### Why together
- **Shared lenses:** all three are identity changes on the "user" row or the reset trigger site, under the same two lenses: identity security and database.
- **A6 costs no extra founder cycle here.** This PR happens anyway for the queued relink. In PR 1, A6 would have added the request path and a second write inside the revoke transaction to the PR that the granted ledger PR waits behind.
- **SEC-N5** stamps at the same reset trigger as A6.
- **Disjoint from the others:** none of these touch PR 2-5's objects.

### Reviews
- (1) Identity and sign-in security.
  - Re-pointing a subject is an account-takeover path.
  - Who may run it.
  - Ruling 14: only the founder's break-glass session runs admin-delete-user for a stuck invitee.
  - A6: the request's timing class and answer, and that a security_event failure cannot stop the reset ending sessions.
  - SEC-N5's auth_time semantics.
- (2) Database: the definer function, the guard trigger, tp_app's column grants, the audit, and the trigger's lock (as PR 1's). D11 and its rollback floor, if it rides.
- Each finding is checked by a skeptic. A completeness critic runs.

### Founder gates
- CO-02, and ADR 0063's approval.
- Ruling 14 is the orchestrator's, and the founder can reverse it. A relink path wider than the founder's break-glass session is the founder's call.

### Risk
High stakes, small change. The relink's design comes first.

**Deploy:** safe with the previous image (additive). A6 adds one audit row per reset request and completion.

## 7. Schema PR 7 (first of the rest of 'Handed to Lane A'): mail to role holders. SS-01 D15's suspension and reinstatement mail with Q13, plus #32's unmapped-plan notice
### Items
SS-01 (a), from designs/ss-01-suspension.md D15, §16 and :1187:
- mail to an organization's administrators when PaidWhole suspends or reinstates it: a new mail_send kind and an outbox table;
- Q13 (the founder's ruling of 2026-10-21): a suspension waits for a delivered dunning notice or a recorded contact. This changes billing_standing.
#32, from designs/lane-b-unmapped-plan.md §3.3 and §14:
- the notification kind 'unmapped_plan';
- a recipients function filtered by the mapping.edit permission;
- the notice's mail_send kind;
- no figure codes.
SS-08's dunning words ('New runs have started again' while PaidWhole's suspension lasts): code only.
Shared mail plumbing:
- **operator_record_mail_event:** PR 1 dropped and recreated it with a seventh OUT column. If this PR's kinds need their own undelivered column, it drops and creates it again, re-issuing the grants and keeping mail.db.test.ts:399, as PR 1 did. Otherwise it uses CREATE OR REPLACE.
- **IAM and alarms:** the operator role's IAM is checked for each new kind's stream, as PR 1 had to, and so is each kind's alarm and runbook row.
D11's REVOKE, if it has not landed by then (with its rollback floor).

### Why together
- **Same objects:** both add kinds to the same mail_send CHECKs and extend the same outbox, operator_record_mail_event and expiry.
- **Same new piece:** both need role-filtered recipients (an organization's administrators; mapping.edit holders). One function design and one deliverability review serve both.
- **Why not in PR 1:** SS-01's mail has only a one-paragraph design, and Q13 adds a billing lens.
- **Order:** first of 'the rest', because SS-01's design assigned it next after SS-01.

### Reviews
- (1) Mail, deliverability and correctness: the new kinds, the outbox, event mirroring, expiry, the operator role's sends and the alarms.
- (2) Billing and security:
  - Q13's billing_standing change and its holds; practice_work_hold reads billing_standing by name;
  - the recipients function's tenancy: only people who reach the practice and hold the permission;
  - no PHI in an email body.
- (3) UX and brand on both emails and the notice words, with renders and shots. Each finding is checked by a skeptic, and a completeness critic runs.

### Founder gates
- CO-02, and ADR 0063's approval.
- Q13 is the founder's existing ruling, built as written.
- A manual nonpayment suspension (SS-01 (c)) is not recommended and not included. It goes in only if the founder rules for it.

### Risk
Moderate: mail, billing standing and tenancy. Medium size.

**Deploy:** safe with the previous image if the CHECKs only widen and billing_standing's callers read it by name. A rollback has the same unread-kind behaviour as PR 1, so it needs the same runbook section.

## 8. Schema PR 8: PHI identifier lookups. #120's F3, with provider_adjustment.reference if it is queued
### Items
F3 (approval-summaries/lane-b-model-eval-gate-status.md):
- keyed lookup hashes on patient_ref.member_id, claim.patient_control_number and claim.payer_claim_control_number;
- a backfill;
- a SECURITY DEFINER boolean screen function.
- It lifts Lane B's fail-closed bound of 50,000 identifiers.
If the orchestrator queues it: provider_adjustment.reference, stored in plain text although ADR 0027 calls it PHI (designs/ledger-interest-once.md §14).
- The fix is an encrypted column plus its keyed hash.
- The reconcile decrypts it in memory.

### Why together
- Both are PHI identifier columns on remittance tables, fixed by the same pattern: a keyed hash, encrypted storage and a definer screen.
- They share one PHI and key-custody review.
- Unrelated to every other PR's objects.

### Reviews
- (1) and (2) Two PHI and security reviews:
  - key custody;
  - no identifier in logs, payloads or errors;
  - the screen function's grants.
- Add a database and capacity review of the backfill of claim and patient_ref at real size. Each finding is checked by a skeptic, and a completeness critic runs.

### Founder gates
- CO-02, and ADR 0063's approval.
- The key's infrastructure rides the founder's deploy.
- If the reconcile's decrypt of the adjustment reference is read as inside the ledger freeze, that part needs a founder exception. It then moves to PR 5's ask, and never holds this PR.

### Risk
PHI: high stakes. Capacity: the backfill. Medium size.

## 9. Schema PR 9: store triage's waiting patterns (SUITE-CAP-1 design §14)
### Items
A table holding the waiting patterns that triage computes, so the Cases page stops recomputing 33,332 candidates on each load (20.6-23.7 s measured on 4 CPUs; apps/web/src/lib/routes/triage.ts:253).
#93's open question 3 (case.actionable_cents holding the live figure), only if it is ruled by the time the build starts. It reverses ADR 0082.

### Why together
- Both store what triage computes, so pages read through an index within a bounded time (ADR 0082, ADR 0083).
- Neither is related to the other PRs.

### Reviews
- (1) Payment engine and triage correctness: line stages and the actionable figure.
- (2) Database and capacity. Each finding is checked by a skeptic, and a completeness critic runs.

### Founder gates
- CO-02, and ADR 0063's approval.
- Open question 3 joins only with its product ruling.

### Risk
Moderate: the capacity and correctness of a derived store. No ledger-frozen table.

## 10. Schema PR 10: release-content health. operator_content_coverage() for #59's daily content_due job, with the stored per-content windows if designed
### Items
operator_content_coverage():
- SECURITY DEFINER, with search_path pinned and EXECUTE to tp_operator only;
- returns the release in force and, per content item, its window multirange and its newest effective_from and retrieved dates;
- returns no key, value or quote.
The stored per-content windows (#49's advisory: 10-13 s cold against a 5 s budget), only if they are designed by the time the build starts.

### Why together
- Both read the rule and content objects for release-content health, for the same daily job and the same reviewers.
- They are unrelated to every other queue item.

### Reviews
- (1) Database and security:
  - a definer function reachable by tp_operator over rule tables;
  - no DDL on rule tables, so rule-tables.db.test.ts's snapshot stays unchanged.
- (2) Content and rules correctness. Each finding is checked by a skeptic, and a completeness critic runs.

### Founder gates
- CO-02, and ADR 0063's approval.

### Risk
Low to moderate. Small.

## Kept apart, and why
**ADR 0081 A6 is kept apart from PR 1, and goes to PR 6** (S2's decision, 2026-11-07, revising S2's earlier choice).
- It is in no queue. Its only source is ADR 0081:263-265.
- It saves no founder cycle: PR 6 happens anyway for the queued relink.
- In PR 1 it would add the reset-request path (SGN-05's floor) and a second definer write inside the revoke transaction. That would land on the PR that the granted ledger PR, and D14's move, wait behind.
- In PR 6 its security_event call runs in its own BEGIN ... EXCEPTION block.

**The SUITE-CAP-3 bodies (PR 2) are kept apart from every other item.**
- The grant covers exactly one migration and its text, and a batch never widens a grant.
- Its objects and review lenses are disjoint from password-changed-notice's.
- ledger_entry_within_evidence (item 12), ledger_line_stage (item 7) and the interest branch (item 11) each need a new exception. They go to PR 5's combined ask, never into PR 2, even if designed and measured early.

**D14's acceptance is kept out of PR 2.** That covers step 7b back to A's month, the Known gap line, the CAS-51 and CAS-42.3 budgets, and the fillx variant.
- It is a no-migration follow-up after both PR 2 and Lane B's SUITE-CAP-3 worker PR merge, measured on that tree after item 12's auto_explain.
- If A's month is over 360 s, step 7b stays on F, and the Known gap line is reworded, never removed.

**PR 1 and PR 2 are not merged into one PR**, although that would save a founder cycle.
- Their objects are unrelated, and the standing rule batches only related tables and functions.
- The founder would otherwise be approving a ledger change and an auth change under one line.

**SS-01 D15's mail with Q13, and #32's notice, go to PR 7, not PR 1.**
- They are undesigned or only partly designed, and Q13 adds a billing lens.
- Batching them into PR 1 would hold a ready, designed item for a design cycle.

**The Cognito relink (queue item 6) stays out of PR 1.**
- It is undesigned, and an account-takeover path that needs its own focused review.
- Its objects differ: "user".cognito_sub, against audit_event and mail_send.
- Ruling 14 bounds who may run it.

**SEC-N5 stays out of PR 1.** Cognito's auth_time semantics are unverified, and the check may close nothing. It goes to PR 6 only if it is queued and verified on staging.

**D11's REVOKE:**
- not on #126: its last review round would reset;
- not on PR 2: its grant is exact;
- not on PR 5: it waits on a freeze ruling;
- on PR 1 only with the founder's deploy fact before PR 1's database review; otherwise on the next non-ledger schema PR after that fact.
- Wherever it lands, it carries its rollback floor: never roll back past #104 on that schema.

**The /3 migration (PR 3) stays apart from PR 1, PR 2 and PR 4.**
- Its objects are unrelated to theirs.
- It is gated on slice 4 and on the identifier fold, and batching would hold those PRs on those gates.
- A widen-now, narrow-later split of /3 was rejected. It would leave the Postgres half of the /3 approval check missing in the meantime, and the narrowing would cost a second founder cycle.

**#93's F9 (PR 5) stays apart from #85's items (PR 4) and from PR 3.** F9 changes roi_statement's ledger-frozen CHECK, and its founder exception would block PRs that need none.

**PR 15b's stored case close stays with the milestone PR 8's case schema, as handed over.**
- That is reconciliation-001's PR 8 in Lane A's milestone queue, not this chain's Schema PR 8.
- It changes the case and case_line CHECKs, and the reconcile writes the close.
- Folding it into PR 4's case_line_rules change would pull reconcile code (SUITE-CAP-3's files) and a money lens into PR 4.

**Already done, so not in the chain:**
- the claim.superseded_by_claim_id index: claim_by_superseded, at 20261109090000:140 (SUITE-CAP-1b);
- 15b's interest credited twice, N1's 'allocated' flag and the ledger_match sequence: closed by #126 (its ADR 0084) once it merges.

**Two of #38's items stay out:**
- The stored worksheet (tp-packet/3) is not recommended by its design (§2.2), and is built only if the founder asks.
- The refused-job record in worker.ts and the four payment-engine checklist lines are not schema.

**SS-01 (c), a manual nonpayment suspension,** is not recommended. It is built only on a founder ruling, and then in PR 7.

**F4 stays out of PR 4 if its design is not reviewed before PR 4's build starts.** It then follows as its own PR, and must re-read items 3 and 4's triggers.

**Not schema PRs, never in the chain:**
- PR 6c's engine corrections (the engine freeze);
- the renumbered-reversal loader fix (no migration; a founder freeze question);
- Cognito PR 2;
- the flaky tests (screening journey, csv-arena, FRM-01, the screening capacity harness race);
- #54's settings.ts helper and #53's compute.test.ts line;
- #92's identity.ts comment and UX PR 66;
- #111's coordination;
- the UX reviewer rule.

**Two later ledger items from designs/ledger-interest-once.md §14 are outside this queue:** interest inside CLP04, and a WO's reference read whole. They join PR 5's combined ask only if the orchestrator queues them and the founder grants each.


## Open questions (for the orchestrator unless marked for the founder)
**The input was truncated.** The issue list stopped partway through PR1-D11-no-rollback-floor ('it makes rolling back past ...'), and the plan's reviews field was cut off.
- D11's issue was handled on its visible part and on the evidence: designs/ss-01-suspension.md:201 and :487; the deploy-and-rollback.md SUITE-CAP-1a floor precedent at :296-299. That gives the floor, never rolling back past #104, in the carrier's header, ADR 0080 and deploy-and-rollback.md, plus a deploy fact that covers the rollback target.
- Any issue after it in the list was not seen. Re-send it if one exists.

**NOTE-CRITIC-OPS-FAST-FORWARD is confirmed, and needs no plan change.** /home/user/ops is at 8eab931e, a fast-forward of the same branch from 14de2c10, and the working tree is clean. This revision read origin's tip.
- Since 14de2c10, SUITE-CAP-3's ask was revised: prose changed and proof items were added, and the header says both bodies are exactly as granted. PR 2 now carries those proof items.

**A6 has moved to PR 6 (orchestrator, to note or override).** S2 recorded the decision under the co-founder's standing instruction. If the orchestrator wants A6 sooner, the only cheaper place is PR 1, and the trade-off is stated in PR 1's why_together.

**PR 1's PASSWORD_NOTICE_UNDELIVERED now pages,** departing from design §3.4's non-paging filter, for the reasons recorded. The orchestrator can reverse this. Then the code goes in a counted, non-paging list beside MAIL_PLATFORM_ALARM_CODES, with a named reader and a deliverability.md row.

**security-N-3 is closed by option (a)** in ADR 0091: the app sessions end in the transaction that queues the notice, and Cognito tokens never act as a PaidWhole session. If review (1) finds a surviving provider session can do more than finish a sign-in that already proved both factors, the build switches to (b) before the PR opens. (b) touches words.ts and the web, so it is planned against #129.

**A standing skip-ahead rule (orchestrator).** When the next item's gate is not met, the next ready item opens in its place, and the waiting item keeps its place for when it becomes ready. The gates are PR 3's slice 4 and identifier fold, PR 5's grant, and PR 6's design. It is a reorder, not a batch, so it needs the orchestrator's word.
- Likely first use: PR 4 ahead of PR 3.
- Optionally PR 2 ahead of PR 1, if PR 1's review is still open when #126 merges and PR 2 is measured and ready. D14 makes PR 2's delay costly.

**The founder's deploy fact for D11:** does an image that contains #104 (SS-01) run in every environment, so that the image any rollback returns to contains #104? GitHub shows no deployments or tags. If yes before PR 1's database review starts, D11 rides PR 1 with its rollback floor.

**#129's order against PR 1:** PR 1's UX and brand renders must show the White plate header. #129 should merge first. If it has not, PR 1 renders on its base and again after #129 merges, before the PR opens.

**O-7:** the orchestrator confirms the steps in support-mail.md's 'Password changed, not by me' item. deliverability.md 3.10 points to it.

**One combined founder freeze ask for PR 5, sent early (orchestrator to relay).** It covers F9, plus whichever of within_evidence (item 12), ledger_line_stage (item 7) and the interest branch (item 11) are designed by then. One ruling then serves them all, and PR 5 is not idle at its turn.

**SUITE-CAP-3:** design loop wf_d171f0f0-948 has finished. Its delta review wf_44d7c772-605 is running. Confirm that neither changed the two bodies before cutting PR 2's branch.

**#38's words version in PR 3 (orchestrator):** confirm that §2.2's heading, 'only if the founder asks', governs only the stored worksheet, as its text says ('recommended to Lane A'). If not, the words version leaves PR 3, and it is never founder-gated.

**Queue decisions (orchestrator):**
- SEC-N5 (PR 6) and provider_adjustment.reference (PR 8) are not in 'Handed to Lane A'. Queue them or drop them.
- A6 is now entered beside the relink by S2's record.
- The order of PRs 7-10 within 'the rest' is my recommendation, and the orchestrator may reorder it: SS-01's mail and Q13 first, then F3, then capacity, then content health.

**Time to value against S2's stand-down (~2026-11-10 14:00 UTC).** Realistically this session finishes #126 and PR 1, and gets PR 2 built and measured.
- Build PR 1 now, and PR 2 in parallel on #126's head.
- Run PR 2's measurements with nothing else on the container.
- If they are not open by the stand-down, leave both at a clean point in the RESUME-BLOCK.

**Approval cycles:** this grouping uses 10 founder approval cycles for about 22 queued items, against about 18 if each shipped alone. The batches that save the most: D11 on its first carrier; the words version and words_changed on PR 3; F4 on PR 4; the ledger items on PR 5; A6 and SEC-N5 on PR 6; #32 and SS-08 on PR 7.

