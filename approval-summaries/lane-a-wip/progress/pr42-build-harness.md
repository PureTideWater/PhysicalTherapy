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
