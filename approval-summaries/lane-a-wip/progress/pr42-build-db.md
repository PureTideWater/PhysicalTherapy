# PR 42 fix round: db builder progress

Clone: /tmp/claude-0/-home-user-PhysicalTherapy/e99dbc78-96e5-5013-a491-2b14e5309bfe/scratchpad/pr42/build-db
Branch: fix-db from 098636e3…
Items: S1, S2, S4, S6, M1 (blocking), M2, M6 (= known (c)), M7, M8, M9
Env: PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH; PG18 on 5433 (DATABASE_URL=postgres://postgres:test@localhost:5433/postgres)
Marker route: touch <clone>/.claude/.allow-protected-edit, Edit migration, rm marker (never committed)

## Status
- [x] clone + checkout, pnpm install --frozen-lockfile (exit 0)
- [x] read findings md + json (json = same text)
- [x] AWS docs: docs.aws.amazon.com refused by the proxy (403). Sources used instead:
  - SESv2 SDK model in node_modules (@aws-sdk/client-sesv2 3.1152.0 dist-types models_0.d.ts): Complaint.ComplaintSubType
    "Can either be null or OnAccountSuppressionList. If the value is OnAccountSuppressionList, SES accepted the message,
    but didn't attempt to send it because it was on the account-level suppression list."
  - AWS's own SES developer guide source (github.com/awsdocs/amazon-ses-developer-guide, archived 2023-06, commit
    5b3d642, doc-source/*.md), cloned to scratchpad/awsdocs: event-publishing-retrieving-firehose-contents.md (bounce
    types table; Permanent/Suppressed "recent history of bouncing as an invalid address"; Permanent/
    OnAccountSuppressionList "does not count toward your bounce rate metric"; Complaint complaintSubType; Reject reason
    "Bad content" only, never delivered; DeliveryDelay fields), notification-contents.md:226 (complaintSubType null or
    OnAccountSuppressionList), sending-email-global-suppression-list.md ("SES counts the messages that you send to
    addresses on the global suppression list toward the bounce rate"; Permanent/Suppressed), sending-email-suppression-
    list.md:15-16 (account list not counted; global list counted).
  - OnConfigurationSetSuppressionList is not in the 2023 snapshot: kept as suppressed (not counted), like the account list.

## Plan / dispositions (fill as done)
1. M1 real (blocking): parser drops complaintSubType. Fix in events.ts: Complaint + OnAccountSuppressionList ->
   bounce/permanent/on_account_suppression_list (state suppressed); an unknown non-null subtype -> unreadable (DLQ).
2. M2 real: migration maps Permanent/Suppressed (global) -> bounced (counted); + 'undetermined' subtype recorded.
3. S2 real: canonical mailbox inside mail_recipient_sha256 (SQL) + TS twin in @tp/db used by rate.ts; agreement db test.
4. S1 real: refusal-list check moves into the run's BEFORE INSERT trigger after the budget; order closed; rows; paused;
   budget; contact_undeliverable (plan D2's order was the planner's, not a founder ruling: ADR 0065 records the change).
5. S4 real: tp_app definer screening_submit_precheck (closed, paused, budget, list) before the hint and address checks.
   Residual: a ZIP the DB refuses still spends a validation (rate-limited; proposal).
6. M8 real: console_mail_streams returns the effective window start.
7. M9 real: operator_mail_cutoff() each mail_events run (rule once, in mail_stream_cutoff()).
8. M6 real: failure notice inside the failure's transaction; pause -> rollback; other send error -> commit + log.
9. M7 real: out-of-attempts stale run whose rows are all recorded is finished (completed on its last attempt + sent)
   before it is failed (no 6b-3 body copied, no fence reuse); reviewer's give-back rejected (fence reuse; queued CHECK).
10. S6 real: digest send error reduced to its name.

## Commits
- 0ca64f42 M1 (worker: parser reads Complaint/OnAccountSuppressionList as suppressed bounce). Reproduced first:
  events.test.ts new case failed on the old parser (event 'complaint', bounceKind null); mail-events.db.test.ts new case
  failed on the old parser (no NOTICE_UNDELIVERED). After: events.test 11/11, mail-events.db + mail.db 36/36. eslint clean.
  Note: mail.db.test 'pauses the screening alone on the account's signals' failed once in ~10 runs (not reproduced in
  the next 9 runs); watch it.
- 1c8ccb2f M2 (db: global Suppressed -> bounced; account/config-set suppression stays suppressed; 'undetermined'
  subtype kept). Marker route worked (no refusal). Failing first: 3 tests (mail.db counts, screening.db refusal list and
  marks). After: mail.db + screening.db 93/93; events.test 11/11; tsc packages/db clean; eslint clean.
- c1daa301 S2 (db: mail_recipient_canonical + canonicalMailbox() in @tp/db runtime; rate.ts uses it; spellings table in
  packages/db/src/test-support/mailbox-spellings.ts). Failing first: screening.db S2 test (complaint to +tag spelling,
  janedoe spelling accepted), mail.db agreement test (function missing). After: mail.db+screening.db 95/95;
  routes.db (web) 49/49; mail-address.test + rate.test 6/6; tsc web+db clean; eslint clean.
  NFKC chosen (superset of NFC; rate key already NFKC); ASCII-only trim/lower for TS/SQL exact agreement.
- 9a99cedc S1 (db: screening_run_mail_refusal = budget then list; helpers screening_bounce_budget_spent,
  screening_contact_refused; upload gate = pause only). Failing first: D2 test (listed+budgeted gave contact_undeliverable)
  and grants test. After: screening.db + mail.db 95/95. ADR 0065 update deferred to one docs commit at the end.
- e5dc7708 S4 (db definer screening_submit_mail_refusal(email, account, client) for tp_app: closed, paused, budget, list;
  routes.ts calls it before the hint and address checks; clientSubject computed earlier). Failing first: routes.db SCR-21
  tests (validations spent: 2 and 3 calls). After: screening.db + mail.db + routes.db 145/145 (70+25+49+...);
  catalog/hardening/cross-tenant/access 1240/1240; tsc web clean; eslint clean.
  Residual (proposal): a ZIP the DB refuses still spends one validation (not in the precheck to avoid copying 6b-2's rule).
- f3f7e897 M8 (db: mail_window_counts returns starts_at; console_mail_streams.window_starts_at = effective start;
  console-mail.ts doc). Failing first: console test (43200 min shown vs 10080). After: mail.db + mail-routes.db 32/32.
- 9acaefb7 M9 (db: mail_stream_cutoff helper + operator_mail_cutoff definer for tp_operator; worker reconcile calls
  it). Failing first: mail.db M9 (function missing), mail-events.db M9 (no pause). After: mail.db+mail-events.db+
  screening.db 109/109; tsc worker clean; eslint clean.
- 33e1005a S6 (worker: DigestSendFailed with sendErrorName only). Failing first: digest job.test (raw MessageRejected
  with address). After: job.test 3/3; monitor.db (uses digestHandler) 20/20; tsc worker; eslint clean.

## Checks
