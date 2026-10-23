# PR 6b-4 build summary (wf_886baacd-e56, 2026-10-23)

## M1 (head 356af63)

M1 (database) for PR 6b-4 is built and pushed to co-001/pr-06b-mail-streams at head 356af63, in three commits: c203d7b, 7100d39 and 356af63.

What was built:
- **Migration** packages/db/migrations/20261107090000_mail_streams.sql. It was written through the new-migration marker route under the founder's standing permission. Each write or edit set the marker with a shell touch and removed it right after. No permission check refused it. The marker was never committed and no other migration was touched.
- **Tables:**
  - mail_recipient_key: one hex pepper, fixed.
  - mail_stream: three seeded rows, all sending and confirmed.
  - mail_send: one row per SES message ID. It holds no address and no hash of one. Kept 30 days on the screening stream and 90 days on the others.
  - screening_mail_refusal: the keyed hash of a refused address, kept 365 days (Q11 (b)).
  - screening_bounce_mark: 7-day marks (Q10 (a)).
  - support_grant_notice and support_grant_notice_recipient: registered tenant tables with forced RLS, a tenant policy, an owner policy, a restrictive read policy that mirrors support_grant's, and SELECT for tp_app.
  - dunning_notice_recipient: billing's, owner-only.
  - Changed tables: screening_run.client_subject, invitation.undelivered_at and undelivered_reason, the notification kind support_notice_undelivered, and an audit_event_record policy that reserves notice_undelivered, mail_stream_paused and mail_stream_resumed.
- **Triggers:** the screening refusals and the run's mail gate, in the order D2 pins.
- **Functions:** the design's section 3 functions, plus screening_mail_gate() for tp_screening only.
- **submit_screening():** recreated on 6b-3's body with client_subject added. A db test diffs the two bodies.
- **Dropped:** the three functions the outboxes replace.
- **Header:** says the migration is safe with the previous image running and lists five deploy-window effects.

packages/db changes:
- Drizzle schema in operations, tenancy, billing, onboarding, screening and index, with the closed-list constants.
- domain-model/areas.json places the new tables.
- New mail.db.test.ts (24 tests).
- screening.db.test.ts gains 8 tests: D7's body diff, D2's refusal order, the refusal list end to end, prospect links, the bounce budget, the spread pause and the run gate. It also tests closed-first in its setup.
- hardening.db.test.ts covers the reserved actions.
- Pinned lists updated in catalog.db.test.ts, location.db.test.ts, migrate.db.test.ts and screening-queue.db.test.ts.
- row-factory.ts now handles a foreign key paired with practice_id. It is not in my file list, but nobody else owns it, and the cross-tenant test needed it.

Docs:
- ADR 0065 is new. It records the founder's Q1, Q9, Q10 (a), Q11 (b) and Q12 rulings of 2026-10-21. Its "Revisit when" also records the capacity decision you asked to keep in view: the free runner with advisory time on pull requests was chosen to save cost, to be revisited before the screening opens and once production has traffic (GitHub issue #41, ADR 0062).
- data-retention.md gains every value the mail path keeps.
- domain-model.md is regenerated on a fresh PostgreSQL 18 database. Its SHA-256 is 07c4a8eeca46ef5f2fdbc0974f23c4bf0ebb257f79fd7cc2b7bef8a1735d5b31 and the approval line is line 7327, left blank.
- The Cross-checks block shows 97 Drizzle tables and 97 migrated tables, nothing missing on either side, 0 column differences and 0 catalog problems. No false difference.
- data-dictionary.md is unchanged: it stays a verbatim import (reconciliation-001 D2 (a)), and the domain model records the new tables.

The ADR 0062 "Revisit when" entry itself was not written. ADR 0062 is M3's file under the plan's ownership, so the capacity note lives in ADR 0065 for now (see open items).

- difference: The refusal gate is a trigger on screening_upload (screening_upload_mail_gate, BEFORE INSERT WHEN status = 'accepted'), not screening_prospect_mail_gate on screening_prospect. reject_screening_upload() also inserts a prospect, and a refused upload is never emailed; D9 says no address check runs for an upload that fails the row checks. The D2 order still holds because the upload is inserted before the run inside submit_screening().
- difference: screening_prospect_mail_forget is not created, although the plan and task list it. Design D13 creates it only under Q11's alternative, and the founder chose 12 months, so the trigger would do nothing.
- difference: client_subject is the last parameter, after request, with DEFAULT NULL, so the previous web's 30-argument call still works in the deploy window. It is nullable because the web has no client address without a trusted proxy; a run without one is held to its account's budget alone.
- difference: The bounce budget refuses at 3 live marks on either the account subject (screening_run.rate_subject from 6b-3) or the client subject. There is no prospect column (section 5, D6).
- difference: support_grant_notice_recipient has an id uuid primary key and UNIQUE (notice_id, user_id) (support_grant_notice_recipient_once), because the generated cross-tenant tests need a single-column key. The composite foreign key (notice_id, practice_id) to support_grant_notice is kept, and the row factory was extended for it.
- difference: The pepper is stored as 64 hex characters (text) and decoded in mail_recipient_sha256(). Drizzle and the domain model's cross-check have no bytea type.
- difference: Both notice tables also have a restrictive tp_app SELECT policy that mirrors support_grant's: the practice's owning group, or a platform administrator.
- difference: All three mail_stream rows are seeded with ses_enabled_confirmed_at = now(): no stream has been paused yet. The reconcile clears it if SES reads the set disabled. In production and staging the screening still opens only once the probes have returned.
- difference: Readiness needs the delivered and bounced probes within 48 hours and since the last resume. The design said only within 48 hours; its e2e journey expects probes after a resume.
- difference: probe_due and probe_missed track an outstanding probe. A probe is due daily once the last one came back, at once after a resume, and again when one has been unanswered for 26 hours, which also sets probe_missed.
- difference: The invitation flag is set only by kind cognito on the transactional stream. The design said any transactional message; only Cognito's message is an invitation.
- difference: Parameter names differ where the design's clash: operator_open_support_notice(target, ...), because grant is a reserved word, and the billing functions use (target_invoice, notice_stage, ...). operator_record_mail_event's notice_undelivered returns the support grant's ID, which is what NOTICE_UNDELIVERED logs.
- difference: console_pause_mail_stream accepts only stream 'screening' and reason 'operator'. console_resume_mail_stream accepts cause_fixed or false_alarm.
- difference: The CHECK on mail_send is named mail_send_expiry_window; the trigger keeps the name mail_send_expiry.
- difference: Added guards: mail_recipient_key_fixed and mail_recipient_key_no_truncate (the pepper never changes), screening_run_client_subject_fixed, and updated_at triggers on the new tables.
- difference: screening_mail_sending(), mail_recipient_sha256() and every helper or trigger function are SECURITY INVOKER with no grant. 6b-3's screening test requires that every function a role may call runs as the owner and no other does.
- difference: An undelivered complaint is not counted as undelivered for the outboxes: a complaint means the message arrived. Undelivered is bounced, suppressed, rejected or failed.
- difference: failure_code keeps the SES error name when it matches ^[A-Za-z]{1,64}$ and stores 'Unrecognized' otherwise.
- difference: NOTIFICATION_KINDS gains follow_up and support_notice_undelivered. The other catalog.ts lists are unchanged; only the test lists grew.
- difference: screening-queue.db.test.ts (6b-3's D7 test) now compares the live body with client_subject stripped. The full diff against 20261106090000 is in screening.db.test.ts.
- difference: data-dictionary.md is unchanged: it stays a verbatim import (reconciliation-001 D2 (a)).
- open: The capacity revisit you asked to keep in view is recorded in ADR 0065's "Revisit when" (issue #41). ADR 0062's own "Revisit when" entry, which the task asks for, belongs to M3, who amends ADR 0062 under the plan's ownership, so M1 did not edit it. M3 or the integrator should add it.
- open: reconciliation-001's PR 6b-4 entry (the 2026-10-21 rulings) is not in M1's files. M2, M3 or the integrator should add it.
- open: The founder's approval: domain-model.md SHA-256 is 07c4a8eeca46ef5f2fdbc0974f23c4bf0ebb257f79fd7cc2b7bef8a1735d5b31 and the approval line is line 7327. Do not post it yet: the review round may change the migration, which changes the hash.
- open: M2 must move apps/worker off the dropped functions. support-notices.ts and dunning.ts still call them. billing.db.test.ts pins billing_owner_emails and support-notices.db.test.ts calls operator_record_support_notice, so those worker db tests fail until M2 updates them.
- open: M3: the screening route should pass client_subject ($31) and map screening_paused, screening_contact_undeliverable and screening_bounce_budget to sentences. console.ts reads console_support_grants() with SELECT *, which now returns the new columns.
- open: Rollback: rolling back to the previous tag leaves support-access and dunning notices failing until the new image returns, because their functions are dropped. Nothing is sent twice or lost. Pre-launch only.
- open: A bounce that arrives after its run was replaced or expired leaves no bounce marks: the run's subjects are gone. The address still goes on the refusal list.
- open: No apps, e2e or full test:db run was done by M1, as the task directs; CI on the draft PR runs them.
- open: Still open from the plan: O4 (counsel on the refusal-hash, bounce-budget and paused wording), O11 (staging checks after phase 2), O13 (PR 6e reminders must read the mail gate and the refusal list), O12 (re-read the AWS prices on AWS's own pages).

## M2 (head b7c705a)

M2 (worker) for PR 6b-4 is built, committed and pushed. Your capacity request is covered: ADR 0062's "Revisit when" now records the decision (free runner, time advisory, chosen to save cost). It points to GitHub issue #41 to revisit before the screening opens and once production has traffic, by measuring on AWS staging or an organization's 8-core runner, then the sizing question O9. M3 added it in 6851bde; M2 did not edit ADR 0062.

What M2 built:
- Every email now has exactly one recipient. It goes through its stream's SES configuration set (`<MAIL_STREAM_PREFIX>-<stream>`) and carries its identity as SES tags (tp_kind, tp_subject, tp_practice, tp_recipient), never an address. A tag value failing ^[A-Za-z0-9_-]{1,64}$ is refused before anything is sent. Senders return SES's message ID.
- The screening's email comes from its own sender (SCREENING_MAIL_FROM, shown as "PaidWhole"), with Reply-To set to SCREENING_REPLY_TO.
- The local sender still writes `to` as a one-element array, so existing outbox readers keep exact matching. When MAIL_EVENTS_DIR is set, it also writes the events SES's simulator would send.
- A new events parser reads SES events and the two account alarms. It never reads a bounce's diagnosticCode, and snake-cases bounce subtypes and complaint types.
- New platform job mail_events, every minute:
  - keeps the screening's SES set matching the database (disabled while paused, re-disabled if something re-enables it, enabled then confirmed after a resume; the other two sets are never touched);
  - sends daily probes only to SES's simulator, only after the identities are verified;
  - drains the SQS queue (at most 1,000 messages or 50 s), recording each event once per message, in any order, and deleting it from the queue only after the record commits;
  - pauses the screening stream on an account alarm or unhealthy SES enforcement, and logs IDs and codes only.
- New nightly mail_expiry job (03:50 UTC) deletes expired mail records.
- Support-access notices and dunning notices now go from recorded outboxes: one message per recipient, each in its own transaction. A failed send is recorded in a new transaction and retried after 1, 5, 15 and 60 minutes; retries reach only recipients still pending, and a permanent SES refusal fails at once. A notice with no administrator records notice_undelivered and never notice_sent.
- New dunning_notices job every minute sends the dunning retries; the daily billing_dunning job opens each stage's outbox and sends at once.
- The monthly digest is tagged and goes on the transactional stream.
- Screening consumer:
  - It reads screening_mail_gate() inside the claim's transaction. A run found not sending is not claimed and spends no attempt; the job ends 'mail_paused' with "screening run waits: email paused" (SCREENING_MAIL_PAUSED).
  - Neither sweep sends or fails anything while the stream is not sending.
  - If the database refuses (screening_mail_paused) or SES refuses (SendingPausedException), the step rolls back and the run is left as it was; the stale rule picks it up after the resume.
  - A run received before the stream's last resume is logged "screening result emailed after waiting", which keeps it out of the 60-second metric.
- Capacity harness:
  - It seeds the screening stream sending and ready, and gives the web MAIL_CHECK_DELAY_MS=2000, so every upload's time to email includes the address checks' worst case (G1).
  - The report gains `mail` {addressCheckMs, screeningReady, heldLines}. The verdict fails a run whose checks weren't charged, whose stream wasn't ready, or whose consumer logged a run held by the mail gate.
- ADRs 0014, 0019 and 0050 are amended and ADR 0039 has a note.

- difference: MailMessage.to stays a readonly string[]; exactly one recipient is enforced at run time by every sender (MailAddressError) rather than by `to: string`. Builders return MailContent, and the identity travels beside it as `identity` {stream, kind, subjectId?, practiceId?, recipientUserId?}. This keeps every existing outbox reader and test unchanged.
- difference: A third new platform job, dunning_notices (every minute), sends the dunning retries. Without it the migration's 1/5/15/60-minute retries would wait for the daily billing_dunning job. The daily job still opens the stage's outbox and sends at once.
- difference: Three log fields were added to the allowlist: invoice_id, invitation_id and queue_message_id. This is needed to log NOTICE_UNDELIVERED with the invoice, INVITATION_UNDELIVERED with the invitation, and MAIL_EVENT_UNREADABLE with the SQS message ID. Pause reasons and probe streams are logged as fixed messages, one per reason or stream, because lint:logs only accepts fixed text.
- difference: The consumer reads the gate in the claim's own transaction, not a separate one. The run's resumed_at is read again inside the completion transaction. The design's `held_by_mail_pause: true` field is replaced by the existing 'screening result emailed after waiting' message with error_code SCREENING_MAIL_PAUSED, which the TimeToEmailMs metric filter already excludes. SCREENING_WAIT_CODES is unchanged because the web's test pins it.
- difference: Account alarms are recognized by the metric in the CloudWatch event (Reputation.BounceRate or Reputation.ComplaintRate), not by alarm name or ARN.
- difference: The local events directory is written and read only when MAIL_EVENTS_DIR is set; there is no default. The simulator mapping applies only to addresses at simulator.amazonses.com; any other address gets Send and Delivery.
- difference: Configuration:
- MAIL_EVENTS_QUEUE_URL is required wherever MAIL_FROM is set, not only in production.
- A platform worker using SES must have SCREENING_MAIL_FROM and SCREENING_REPLY_TO, because it probes the screening stream.
- MAIL_IDENTITIES_VERIFIED is required in production and defaults to true in development.
- difference: The reconcile re-reads the screening set right after enabling it and confirms on that read in the same run, rather than waiting for the next run.
- difference: SES Open, Click and Subscription events, and alarm state changes other than ALARM, are deleted as ignored rather than left for the dead-letter queue. A malformed message is left for the DLQ. An event the database refuses is logged MAIL_EVENT_NOT_RECORDED_<SQLSTATE> and left to be received again.
- difference: Capacity harness:
- 'A paused stream claims nothing' is proven by the worker db tests (screening.db.test.ts), not by a harness run.
- The harness instead fails a run whose consumer logged a held run, whose stream was not seeded ready, or whose checks were not charged.
- The report gains an optional `mail` field without a format bump (still tp-screening-capacity/8, so the launch check and infra tests are unchanged); the verdict fails a report that lacks it.
- The seed also sets probe_sent_at, so the platform does not send probes during the measurement.
- difference: NOTICE_UNDELIVERABLE is now logged once per notice, with its grant's or invoice's ID, instead of once per run without an ID.
- open: The user's capacity note: ADR 0062's 'Revisit when' entry (issue #41) was committed by M3 in 6851bde. M2 did not edit ADR 0062.
- open: M3 or the integrator: regenerate tools/screening-capacity/watched-paths.txt (pnpm exec tsx tools/screening-capacity/watched.ts --write) in the commit that adds the web's address.ts, tlds.ts and validation.ts imports. watched.test.ts fails in the shared tree until then.
- open: M3: fix the one lint error in the uncommitted apps/web/src/lib/screening/validation.ts (auto-fixable).
- open: M3, e2e journeys: @tp/worker/runtime now exports createPlatformHandlers, runMailEvents, LocalMailEventSource, MemoryMailControl, sendSupportGrantNotices, expireMail, parseMailQueueMessage, simulatorOutcome and MAIL_PROBE_RECIPIENTS. LocalMailSender takes a third argument {eventsDir, streamPrefix}. e2e/worker.ts still builds it without an events directory.
- open: M3, infra: the platform alarm codes in the worker's MAIL_LOG_CODES equal infra's MAIL_PLATFORM_ALARM_CODES and MAIL_WARNING_CODES today, but no test holds them equal yet. The task environment variables in 4e4a90f match what the worker requires.
- open: Several files outside M2's listed paths were touched because the change needs them:
- packages/observability/src/fields.ts (three log fields);
- apps/worker/src/screening/message.ts and threads.ts (one type each);
- worker.test.ts, consumer.db.test.ts and message.test.ts;
- tools/screening-capacity/test-support/measurements.ts and watched-paths.txt;
- pnpm-lock.yaml (committed early in f5acf30, before M3's web changes). M3's web lockfile changes remain uncommitted.
The integrator should confirm each.
- open: One test database, tp_test_ba19459e43e0467e9c5fc2b3e42d15f5, was still open with 4 connections at the end. It is in use by another builder's run, so M2 left it.
- open: Not M2's, still open: reconciliation-001's PR 6b-4 entry; the founder's domain-model approval (do not post until the review round is done); O4 counsel wording; O11 staging checks; O12 re-reading AWS prices; O13 PR 6e reminders reading the mail gate and refusal list.
- open: Residual case, as the design states: if SES accepts a notice and its record's commit then fails, that one recipient gets one extra copy on the retry.
- open: Rollback (M1's note still applies): the previous image's support and dunning jobs fail at the dropped functions until the new image is back.

## M3 (head 89998f4)

I finished M3 of PR 6b-4 and pushed it to co-001/pr-06b-mail-streams (head 89998f4). One blocker remains, in M2's code: the web production build fails. `apps/worker/src/mail/streams.ts` imports the full `@tp/db` entry, and `apps/worker/src/billing/dunning.ts` now pulls it into the web bundle. Changing that import to `@tp/db/runtime` fixes it. With that edit applied locally, both new e2e journeys passed on port 4951. I did not commit the edit, because apps/worker is M2's.

**Infra (4e4a90f, b7df9e2)**
- The stack now owns three SES configuration sets: transactional, notices and screening.
- It owns two identities, MailFromAddress's domain and `screening.<domain>`, verified in two phases behind `MailIdentitiesVerified`.
- Mail events reach an encrypted queue with a dead-letter queue. Only the two rules can write to them.
- An SQS endpoint is added, limited to this account's queues.
- 15 alarms are wired, the SES grants are narrowed per set, and the screening role can use only its own identity and set.
- New since the summary: the database parameter group sets `log_parameter_max_length` and `log_parameter_max_length_on_error` to 0, so no bind value reaches the database log. This holds open item O11 in the template instead of a hand check.

**Web (89998f4)**
- Address checks in order: a typo hint and an unknown-ending warning in the browser, then the upload's own checks and the rate limit, then the same hints on the server, then DNS and SES validation together. SES validation is capped at 1,000 a day in production and 50 in staging.
- Every refused address gets one sentence.
- The screening closes while its mail stream is paused (everywhere) or not proven ready (staging and production).
- The web passes the client's keyed subject to `submit_screening` for the bounce budget.
- The kept refused-address sentence is added to four places: the upload form's hint, the "sent" alert, the closed-link page and the result page with no request.
- A new `/console/mail` page lets a platform administrator pause and resume the screening stream with a reason.
- Support-access notice delivery shows on the grant page and the console's support list; a notification links to the grant.
- The users page flags an undelivered invitation.
- The paused wording and the address wording are now two legal surfaces (`screening-mail-paused`, `screening-mail-address`), so production's screening stays closed until counsel's review is recorded.
- Two e2e journeys: the cut-off (SCR-21) and an undelivered notice (SEC-19).
- A new `mail-routes.db.test.ts` covers the console routes, notice states, notifications and invitations.
- The typo hints now name only the provider domain or the endings, so no form issue or error carries an address.

**Docs (b6d1c9c, 6851bde)**
- New `docs/runbooks/deliverability.md`.
- `docs/runbooks/deploy-and-rollback.md` gains the two mail phases, a launch checklist (O5, O11, O14) and rollback across PR 6b-4.
- Amendments to ADRs 0049, 0055 and 0062. ADR 0062 also records the capacity decision under "Revisit when", pointing to issue #41.
- Test matrix rows SCR-21, SCR-22, SEC-18, SEC-19 and JOB-05, with the synth matrix, registry and generated expected files kept in step.

- difference: If SES already holds a hand-verified identity for either domain, the deploy runbook says to delete it before the first deploy instead of `cdk import`. An import cannot name the configuration set that the same deploy creates. No environment sends mail before its first release, so nothing is lost.
- difference: The typo hint names only the provider domain ("Did you mean @gmail.com? …"), not the whole address, so no form issue or InputError message carries an address. The browser's "Use …" button still offers the whole suggested address.
- difference: A near-miss ending (for example .cmo) gets its own sentence naming only the two endings.
- difference: Added two legal surfaces, screening-mail-paused and screening-mail-address, to SCREENING_LEGAL_SURFACES. Counsel's confirmation of the Q12 wording is now enforced in production rather than a promise.
- difference: The RDS bind-value logging that design open item 5 and O11 said to verify by hand is now set in the parameter group, with an infra test.
- difference: The staging suppression-list check in the runbook uses a synthetic mailbox put on the account's list (checks) and a hard bounce to a nonexistent mailbox on a domain you control (additions), instead of a simulator complaint, whose absence from the list would prove nothing. Hand-sent check messages are tagged tp_kind=probe so the platform can read them and counts them toward nothing.
- difference: The console's undelivered list names a customer's user by the sign-in email the console's other screens show. It never shows a screening address or SES's own recipient record.
- difference: screeningOpen returns `reason` as optional, so tools/test/legal-surfaces.test.ts's pinned `return { open: false, releaseNo: null };` lines still hold.
- difference: Added apps/web/src/lib/routes/mail-routes.db.test.ts, not in the design's file list, for the console mail routes, notice delivery, the notification and invitations.
- difference: The TLD snapshot comes from the public suffix list's ICANN section, not IANA (unreachable).
- open: BLOCKING, M2's file: the web production build fails (`next build`: "Failed to collect page data for /api/billing/[organizationId]/setup-intent"; import.meta.dirname is undefined in packages/db/src/migrate.ts). Cause: apps/worker/src/mail/streams.ts (commit 8a21e93) imports `MAIL_STREAM_KINDS, MailKind, MailStream` from '@tp/db', and the web reaches it through apps/worker/src/billing/public.ts, then dunning.ts, then mail/streams.ts. Fix: change that import to '@tp/db/runtime'. With it, both e2e specs pass locally. Until then, CI's `pnpm build` and every e2e job fail.
- open: M2's directory: tools/screening-capacity/watched-paths.txt is stale, so watched.test.ts fails. Run `pnpm exec tsx tools/screening-capacity/watched.ts --write`; it adds apps/web/src/lib/screening/address.ts, tlds.ts and validation.ts. Without it the capacity gate does not watch the address checks.
- open: M2's file: the result email's kept wording (apps/worker/src/screening/wording.ts, emailKept, the 'none' case; legal surface screening-kept-email) still says the details given are deleted, with no sentence about the 12-month coded form of a bounced or reported address. Q11 (b) says no page may call it deleted. The four web surfaces now say it (REFUSED_ADDRESS_KEPT).
- open: O4: counsel reviews the new wording before the screening opens. Production stays closed meanwhile because `screening-mail-paused` and `screening-mail-address` are now in SCREENING_LEGAL_SURFACES; the refusal-hash sentence is also in the existing screening-kept-* rows.
- open: O5: the launch checklist is in docs/runbooks/deploy-and-rollback.md under "Before the screening opens in production".
- open: O11, staging after phase 2 (docs/runbooks/deliverability.md, section 2.4): whether Cognito needs a sending-authorization policy on the stack's identity; that the screening set's empty SuppressedReasons neither checks against nor adds to the account's list; whether account reputation metrics publish at launch volume. The RDS bind-value logging is now set in the template; whether RDS accepts log_parameter_max_length and log_parameter_max_length_on_error for the PG18 parameter family is proven only by cdk synth, so the first deploy confirms it.
- open: O12: re-read the SES, SQS endpoint, CloudWatch and validation prices on AWS's own pages before the first deploy.
- open: O13 (PR 6e): reminders and withdrawal confirmations go on the screening stream, read the mail gate and the refusal list, and carry List-Unsubscribe.
- open: O14, the founder's actions: set the DNS records from the stack's outputs; add a DMARC reports mailbox (rua) on the parent domain (the outputs carry no rua); register both domains with Google Postmaster Tools and Microsoft SNDS; set the required-check ruleset.
- open: O15: refresh tlds.ts from IANA every quarter. The first snapshot came from the public suffix list's ICANN section in aws-cdk-lib 2.273.0, because IANA's list was unreachable through the proxy (403).
- open: SES email feedback forwarding is left at the identity default (on). Account-level VDM engagement metrics being off is a runbook rule, not enforced by the stack.
- open: The full e2e suite was not run; only the two new specs. The shared and exclusive advisory-lock fixture in screening.spec.ts typechecks but has not run in a full parallel suite.
- open: The reconciliation-001 entry for PR 6b-4 is not M3's.

## Integrator: draft PR #42 head 65791691e47952047d4bb71deb2b4c24c6cb0203

Domain model SHA-256 07c4a8eeca46ef5f2fdbc0974f23c4bf0ebb257f79fd7cc2b7bef8a1735d5b31, approval line 7327

### Smoke
Indicative only. This was a local process-runtime run on a 4-CPU container: advisory mode, S1 and S4, with the address checks charged at 2,000 ms on every upload (G1). Seconds to email:
- S1-1: 27.5. S1-2: 2.6.
- S4#1: 34.1, 32.8, 31.4 and 23.5 (small).
- S4#2: 33.3, 29.4, 32.6 and 21.1.
- S4#3: 36.8, 33.6, 34.1 and 25.3.

The middle run is S4#1, whose worst upload took 34.1 s. There were no time warnings: every upload stayed under the 48-s line and the 44-s question. The release took 301.8 s to load.

Every correctness check held:
- Every upload was emailed in the normal tier.
- S1-1 matches the frozen oracle and S1-2 matches the whole-release oracle.
- The large uploads were queued after 5.6 to 8.1 s, with the small one behind them.
- No OOM kill and no limit reached. The consumer peaked at 1,150 of 4,096 MiB and the web at 326 of 1,024 MiB.
- Mail: addressCheckMs 2000, screeningReady true, heldLines 0.

The verdict says 'fail (time advisory)'. Every reason is something this kind of run cannot meet, not a bug: it ran only two scenarios, the process runtime's Postgres has no limits applied and no cold start, and the S2-1 and S3-1 oracles were not run. The report is /tmp/claude-0/-home-user/e7bf8d14-3b4c-5e38-9cea-a1f92a95083e/scratchpad/pr6b4/smoke1/summary.md.

### Checks
- [pass] `git pull --no-rebase origin co-001/pr-06b-mail-streams; git status`: Already up to date at 89998f4, clean tree.
- [pass] `pnpm typecheck`: Whole repository, exit 0.
- [pass] `NODE_OPTIONS=--max-old-space-size=6144 pnpm lint`: Exit 0.
- [pass] `pnpm lint:copy`: 496 files read.
- [pass] `pnpm lint:logs`: 982 files scanned, every log call uses allowlisted fields.
- [pass] `npx vitest run --project unit apps/worker apps/web infra tools/screening-capacity tools/test packages/synth`: First run on 89998f4: 1 failure, in tools/screening-capacity/watched.test.ts. The watched list was missing M3's address.ts, tlds.ts and validation.ts, a seam between builders. Fixed in bcec96f by regenerating it with watched.ts --write. Final tree: 165 files, 2,426 tests passed.
- [pass] `pnpm build (web and worker)`: Failed on 89998f4: Next's build traced packages/db/src/migrate.ts through apps/worker/src/mail/streams.ts (M2), which billing/dunning.ts brings into the web through @tp/worker/billing. Fixed in 92656c8 by importing @tp/db/runtime instead. Build passes after the fix.
- [pass] `npx vitest run --project unit apps/worker/src/web-entries.test.ts`: New guard test. It failed with the old import, naming streams.ts as imported by billing/dunning.ts, and passes after 92656c8.
- [pass] `PR_NUMBER=42 pnpm -s exec tsx tools/engine-freeze/check.ts 49514e8`: Run as ci.yml runs it. No non-test file under packages/pricing/src changed, nothing let through, no problems.
- [pass] `git diff --name-only $(git merge-base origin/claude/build-platform HEAD)`: 143 files, every one owned by a builder or the integrator. Exactly one migration added (20261107090000). Nothing under packages/pricing/src, fixtures/golden, content/releases or tools/engine-freeze/exception.json. No applied migration edited, no marker. pnpm-lock.yaml is M3's file but M2 also changed it, for client-sqs.
- [pass] `pnpm install --frozen-lockfile --offline`: Lockfile up to date.
- [pass] `DATABASE_URL=<fresh PG18 tp_pr6b4_integrator_1> pnpm db:migrate && pnpm -s db:domain-model --check`: Matches the committed text exactly. 98 tables, 47 registered, 0 explanation problems. Approval line 7327 is blank.
- [pass] `psql: pg_proc, pg_class, pg_policy and phi_table_registry on the migrated database`: Every new SECURITY DEFINER function sets search_path, gives no EXECUTE to PUBLIC and has exactly its grant. All 8 new tables have RLS enabled and forced and are owned by tp_owner. Only the 2 registered notice tables grant SELECT to tp_app.
- [pass] `pnpm synth --all; git diff --exit-code -- fixtures/synthetic`: 451 case files and 16 EMR files unchanged.
- [pass] `taskset -c 0-1 pnpm screening:capacity --runtime process --images <layout> --admin-url ...:5433 --database tp_pr6b4_smoke_1 --time-mode advisory --scenarios S1,S4`: Every correctness check held. The verdict fails only on items a two-scenario process run cannot meet (see smoke). The harness dropped the database.
- [pass] `pnpm -s db:domain-model --summary-since origin/claude/build-platform`: Opens the PR body. The body was written through the MCP tool and matches the local file byte for byte. The gh path had stripped the attribution line.

### Open items
- Your capacity note is recorded. ADR 0062's "Revisit when" (M3, 6851bde) and ADR 0065 point to GitHub issue #41. The free runner with time advisory on PRs was chosen to save cost. Revisit before the screening opens and once production has traffic, by measuring on AWS staging or an 8-core runner, then settle sizing question O9. I added the same note, with the 2026-10-21 rulings, to reconciliation-001 (6579169). No builder had written it there, though the computed task required it.
- The founder approves the domain model's SHA-256 only after the review round. Until then CI fails the approval case of domain-model.db.test.ts, as expected.
- The review round has not run yet. It is two adversarial reviews, one using the security-reviewer checklist (G5: IAM, addresses, reserved audit actions).
- Residuals for the reviewers, all from my read of the diffs: (a) a run completion that commits just before a concurrent pause still sends, until the platform disables the SES set within a minute. (b) Someone who types a mailbox they know is valid and gets refused can infer that it bounced or was reported as spam on the screening stream in the last 12 months. This needs counsel, with O4. (c) A failure notice sent after the failure commits can be lost to a pause that lands in between. (d) The harness's addressCheckMs is the configured delay, not a measured one, and the charge is skipped past the stand-in's daily cap of 50. This holds today at about 20 uploads per database.
- Founder actions: phase 1 deploy, then DNS records from the stack's outputs (DKIM, MAIL FROM MX and SPF, DMARC). Phase 2 with MailIdentitiesVerified=true. SES production access. Postmaster Tools and SNDS (O5, O14). Staging checks after phase 2 (O11). Re-read the AWS prices (O12).
- Counsel (O4): the paused page, the refused-address sentences, the bounce-budget refusal and the refusal-hash sentence, before the screening opens.
- PR 6e (O13): reminders on the screening stream must read the mail gate and the refusal list. Also List-Unsubscribe headers, and whether reminders stay on tp_operator.
- Plan O15: refresh the TLD snapshot and the typo list every quarter. Q13 belongs to the billing PR.
- Doc nit in M3's file, reported and not fixed: docs/runbooks/deliverability.md section 2 step 5 says "Q1 (b)" for the SES plan; it should say Q1 (f).
- Differences from the design, listed in the PR body: the refusal gate sits on accepted screening_upload rows, not on screening_prospect. screening_prospect_mail_forget is not created (the founder chose Q11 (b)). Only screening_run.client_subject was added, as the last parameter with default null. screening_mail_gate is granted to tp_screening only and screening_mail_sending to no role. The helper functions are invoker functions, not definers. data-dictionary.md is unchanged. The pepper comes from gen_random_uuid. RDS log_parameter_max_length is set to 0. The builders' reports arrived truncated, so any further departures are in ADR 0065's Alternatives table.
- CI on draft PR 42 runs what was not run locally: the full test:db, e2e, golden and the advisory capacity workflow.
