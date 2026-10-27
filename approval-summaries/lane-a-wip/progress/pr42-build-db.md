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
- 8389f6e0 M6 + d1b51bff M7 (split from one working state; M6-only state tested: worker screening.db 23/23; full state
  29/29 with consumer tests; unit screening 73/73; eslint clean). Was: (in progress) M6+M7 in apps/worker/src/screening/job.ts: failScreeningRun sends inside the failure's transaction
  (pause -> rethrow -> rollback); completeOnAttempt helper; finishOrFail for out-of-attempts stale runs (complete on last
  attempt when no pending rows; else fail PRICING_ATTEMPTS_EXHAUSTED; SCREENING_FINISH_FAILED warn when completion fails).
  Failing first: worker screening.db M6 ('failed' instead of 'mail_paused') and M7 (failed: 1). Tests written; running.
- b827846c ADR 0065 docs commit (done). Was TODO: ADR 0065 docs commit (S1 order, S2 canonical key + NFKC, S4 precheck + ZIP residual, M1/M2 mapping,
  M7 finish, M8, M9, Revisit: global-suppression on screening set in O11); broad checks; final report.

- NEXT: broad checks under the lock: typecheck (pnpm typecheck), lint on touched files, unit tests (worker/web/db
  touched dirs), test:db files touched on a fresh migrated DB (they migrate fresh each run), lint:logs, lint:copy.

- 9a88568c test-matrix rows SCR-21, SCR-22, SEC-18, SEC-19.

## Checks
- pnpm typecheck (whole repo, 22 projects): passed.
- eslint --max-warnings=0 on every touched .ts file: passed.
- pnpm lint:logs: passed (1067 files). pnpm lint:copy: passed (522 files).
- unit tests packages/db, apps/worker, apps/web/src/lib: 1569/1570 pass; the 1 failure is apps/worker/src/web-entries.test.ts,
  PRE-EXISTING at base 098636e3 (same 13 offending modules at base and HEAD, via apps/web/src/lib/routes/route-tests/world.ts
  -> test-support/triage-world.ts -> @tp/worker runtime.ts; checked with a copy of the test's traversal on a base worktree).
  Not from this round: open item for the integrator.
- test:db on touched files: 22 files, 1550 tests passed (fresh migrated DBs, PG18). Files: (packages/db mail, screening, catalog, cross-tenant, hardening,
  access, location, migrate, screening-queue; worker mail-events, support-notices, billing, screening/*, monitor; web
  mail-routes, screening/*; tools oracle).
- d16941bc capacity watched list (+packages/db/src/mail-address.ts); 05ad949d job.ts comment. tools/screening-capacity unit
  7 files 191 passed; eslint job.ts clean.
- /opt/pw-browsers/chromium-1194 EXISTS: running e2e mail-cutoff, mail-notices, screening, onboarding with
  PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers E2E_DATABASE=tp_pr6b4_db_1 E2E_PORT=4936 (PG18 5433); log
  scratchpad/pr42/e2e-db.log. Drop tp_pr6b4_db_1 afterwards.

## Proposals / open items (for the final report)
- Runbook deliverability.md (another builder's file): staging check with --reason COMPLAINT (M1); second send to the
  hard-bounced screening address within minutes to read whether Permanent/Suppressed arrives on the screening set (M2, O11);
  cut-off text: global-list bounces count, account-list suppressions do not; cut-off read each run (M9).
- ops designs/pr6b-email-streams.md lines 375, 737-743 mapping and refusal order, plan D2 order: orchestrator's.
- web-entries.test.ts pre-existing failure at base (route-tests/world.ts -> test-support/triage-world.ts -> runtime.ts).
- S4 residual: ZIP refusals still spend one validation.
- M3 not mine; if its fix needs operator_mail_streams' probe_missed, it is the migration (offer).
- known item (a) bound not recorded by me (not assigned).
- domain model + packages/db/functions regeneration by the integrator (schema changed).

## Resume 2026-10-27 14:20 UTC (run interrupted at e2e start, log empty)
- Clone clean at 05ad949d, branch fix-db. chromium-1194 present and genuine (Chrome for Testing 141.0.7390.37 =
  playwright-core 1.56.1 browsers.json revision 1194). Re-running the e2e journeys under the lock (log
  scratchpad/pr42/e2e-db.log); tp_pr6b4_db_1 left from the interrupted start, prepare.ts recreates it.
- e2e at 05ad949d (pinned chromium-1194, PG18, tp_pr6b4_db_1): mail-cutoff, mail-notices, screening, onboarding: 9 passed (4.0m), exit 0.
- NEW improvement (in progress): routes.ts S4 precheck moved AFTER the free typo hint (precheck-first made a mistyped
  address on the list read ADDRESS_REFUSED while an unlisted one read the hint: a small list oracle and a lost fix-it hint).
  Test: routes.db 'says the likely typo of a mistyped address on the refusal list as of any other'. Running fail-first.
