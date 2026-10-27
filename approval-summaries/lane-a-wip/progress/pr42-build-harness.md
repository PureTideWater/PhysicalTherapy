# PR 6b-4 fix round: harness builder (progress)

Clone: /tmp/claude-0/-home-user-PhysicalTherapy/e99dbc78-96e5-5013-a491-2b14e5309bfe/scratchpad/pr42/build-harness
Branch: fix-harness at 098636e3… (base merge)
Items: M4, M5 (paragraph only), e2e screening flake (spec:135, helpers:87), capacity harness race (run.ts link 404), Wording section.

## Status
- [x] clone + checkout
- [ ] pnpm install --frozen-lockfile (under lock)
- [ ] M4
- [ ] capacity race
- [ ] e2e flake
- [ ] e2e retry (hardware key)
- [ ] wording
- [ ] M5 paragraph
- [ ] checks

## Notes

## Resume 2026-10-27 ~14:25 UTC (earlier run stopped after clone + install)
- Clone clean at 098636e3 on fix-harness; install-harness.log shows pnpm install --frozen-lockfile done (502 packages).
- [x] install (done in earlier run; log in scratchpad/pr42/install-harness.log)
- /opt/pw-browsers/chromium-1194 EXISTS now (db builder ran e2e with PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers): run e2e locally under the lock.
- Other builders touched: db builder routes.ts (S4 precheck before checkScreeningAddress), worker screening/job.ts (M6/M7);
  infra builder validation.ts (bounded() race, MAIL_VALIDATION_REFUSED), web config/services. Keep M4's web change small.

## Items
- [x] Capacity race REAL (code path read): run.ts opened each link right after reading the outbox file; job.ts sends inside
  the completion's transaction and COMMITs after send returns (asOperator: BEGIN read committed; no deferred constraints on
  screening/mail tables), so the file can precede the commit. Fix: measure.ts untilComplete() polls runFacts status until
  'complete' (LOG_WAIT_MS total), run.ts waits before opening; late runs logged and opened as sent. Tests: measure.test.ts
  3 new cases (18/18 pass). eslint clean. Commit d352abac.
  Product judgment: keep send-inside-transaction (a refused send, SendingPausedException, rolls the completion back; D3).
  Commit fails after send only on connection/server loss (READ COMMITTED, no deferred triggers) -> one dead-link email, then
  the sweep reclaims the stale run in ~2 min and sends a working link. Send-after-commit trades that for a committed run
  with no email and loses the pause rollback. No product change; ADR note.
- [x] M4 REAL: run.ts:965 copied MAIL_CHECK_DELAY_MS into mail.addressCheckMs; report.ts:573 compared that. Fix: web routes.ts
  times checkScreeningAddress (performance.now) and logs 'screening address checked' {screening_run_id, elapsed_ms} after the
  run is stored; measure.ts addressCheckTimes(); run.ts reads runtime.logs('web') per scenario -> UploadMeasure.addressCheckMs;
  report.ts addressCheckProblems() per upload (missing -> 'address checks not measured', <2000 -> 'not charged'); mail = {screeningReady, heldLines};
  summary span; ADDRESS_CHECK_CHARGE_MS comment cites CI 47.7 s (M5 comment). Tests: report.test 3 failing cases + M4 test
  (shown failing on old report.ts: 6 fail), measure.test web-log reader, routes.db.test line logged with run id >=300 ms.
  Checks: capacity unit 7 files 198/198; routes.db.test 50/50 (PG18 5433); eslint (heap 6 GiB) clean; lint:logs 1065 ok.
  Commit 99ae18a8. Conflict note: db builder's e5dc7708 edits routes.ts just above (S4 precheck) -> integrator merges.
- M5: no code change; paragraph in adr_notes.
- [~] e2e flake (uncommitted): screening.spec reads outcome stage with run status in one statement (stage = complete?priced:accepted;
  run in queued|pricing|complete) and the consumer step asserts stage priced + engine + shares. REAL: CI 40229005858 job
  121276766373 (:339 'priced' vs 'accepted'); completion sets run complete + outcome priced in one tx (operator_screening_complete).
- [~] e2e retry (uncommitted): helpers.ts registerOrRestoreKeyAndSignIn: keeps the virtual authenticator's credentials in
  E2E_DEV_AUTH_DIR/virtual-keys/<persona>.json after registration and after sign-in; on hardware_key_required restores it
  (signCount+1) and signs in. hardware-key.spec adds a second first-sign-in for contract-specialist in a fresh context.
  REAL: helpers.ts:87 expected register-key, got hardware-key?reason=hardware_key_required (dev provider keeps the key).
- [~] wording (uncommitted): messages.ts paused text/refusal, bounce budget; retention.ts REFUSED_ADDRESS_KEPT; console page cut-off,
  marks label, resume note; users page complained (settings.ts undeliveredReason); ADR 0062 wording; legal-surfaces row; runbook 3.4;
  tests: routes.db (paused, budget), result.test (kept), mail-routes.db (reason), mail-cutoff.spec (console text).
  Checks so far: lint:copy 522 ok; unit web screening + legal-surfaces + brand-copy 12 files 155 ok; db routes + mail-routes 56 ok;
  web tsc ok; eslint 12 files ok. e2e running: screening, hardware-key, mail-cutoff, mail-notices (log scratchpad/pr42/e2e-harness.log,
  DB tp_pr6b4_harness_1, port 4937) -> drop DB after.
- Commit aea4974f docs: ADR 0062 G1 line (M4), staged by hunk.

## M5 paragraph (for adr_notes / PR body)
Capacity on this pull request, as CI measured it (review M5). CI's screening-capacity run on 13f59b1 (job 120636639361,
advisory) ran S4 three times: S4#1's uploads took 46.2, 47.6, 46.0 and 33.9 s; S4#2's 44.6, 47.1, 47.7 and 32.5 s;
S4#3's 45.2, 46.0, 47.8 and 32.8 s. Ordered by each run's worst upload, the middle run is S4#2, whose worst upload (S4-3,
47.7 s) is 0.3 s under the 48-s line: the time verdict passed, and the job raised the sizing warning (above 44 s, the
consumer's size goes to the founder before merge; open item O9). The local smoke reported earlier (S4#1 at 34.1 s, no
time warning) is not the measurement of record. Nothing is resized here: the consumer's size stays the founder's
decision, open as issue #41 (decide before launch), with this measurement as its input.
