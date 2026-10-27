# fix-gateway progress (PART gateway; PR #75 fix round)
Started 2026-10-27 ~19:40 UTC (resumed run; no earlier gateway progress file; none of my files modified in worktree at start).
## Status
- [ ] read S1, S2, nit, design s5, ADR Part 3, my files
- [x] read S1, S2, nit, ADR Part 3, design 5.2/5.5, records/tokenizer requests (records asks me: gateway.test.ts:379 postings:1; models-routes screen_failed reads assertion; permitted.db two-example decrypt-failure test)
## Key facts found
- apps/web/src/lib/http/rate-limit.ts is a #42 file (LANES.md:88): the skeptic's 'model_screen' route bucket cannot land here.
- rate_limit_take(bucket,subject,hits,window) is SECURITY DEFINER, granted to tp_app, accepts any bucket name: callable from my code on services.pool.
- practice_access_log has no id cursor/request_id: S2's code fix needs a migration (Lane A) + settings.ts (after #42).
## Plan (S1 + nit)
1. gateway.ts limited(): idempotency lookup + read-only budget peek (spentSince >= budget) before the screen; CallContext.beforeScreen hook run after every cheap refusal, right before a purpose's screen (a throw refuses).
2. contract-proposals.ts: beforeScreen = take per-practice + per-person screen limits (rate_limit_take on services.pool, own connection) then record person's event (so event iff screen about to read); a names_patient memory per server (WeakMap by services; key practice+document; holds no identifier) so a re-click of a misfiled document is refused without reading.
3. Tests: gateway unit (connects 0 for replay / zero budget / hook order), web db (audit rows per click before/after), nit (no event on pre-screen refusals).
- Decisions: limits taken in the web's beforeScreen on services.modelPool (never services.pool: the request txn holds one; ADR 0055), buckets model_screen (hour) + model_screen_day (day), subjects practice + person (HMAC like rateSubjectHash); limited -> notice screen_unavailable for now (request a dedicated 'screen_limited' notice from UX/notices.ts + path.ts); names_patient memory per services (WeakMap), key practice:document:pagesHash, 1 h, cap 1000; no 'clear' caching (no record version without a migration).
- [ ] step 1: gateway.test.ts new tests (write, run before) -> gateway.ts
- [x] step 1 DONE: gateway.test.ts (records' postings:1 applied; MOD-12 order pins now expect completedCall+spentSince called, hold not; new tests: replay connects 0, budget-spent connects 0, beforeScreen order/throw/no-screen-purpose; unserved-variant test gains step not called). Before: 4 failed/49 (progress/fix-gateway-unit-before.log). gateway.ts: idempotency + spentSince peek before screen, CallContext.beforeScreen, refuseOverBudget helper, doc steps 0-12. After: 53/53 (fix-gateway-unit-after.log). tsc: only eval/gate.golden.test.ts 'joins' (tokenizer's pending request).
- Requests to write: contract-terms.ts:486-487 doc ("before the idempotency key, the budget and the call (gateway.ts, step 4)") and spec.ts:47 doc -> new order; ADR 0054:282 + ADR 0070:605,883 docs.
- [ ] step 2: contract-proposals.ts (limits + event in beforeScreen + names_patient memory) + models-routes.db tests
- before-clone: scratchpad/phi/clones/fix-gateway-before = 9b7eadfe + every other part's WIP + my tests, without my gateway.ts/contract-proposals.ts (installed).
- web db BEFORE (progress/fix-gateway-web-db-before.log): 5 failed/11: budget {events 3, screens 3, reads 18} per 3 clicks; names {3,3,18}; limits TypeError; MOD-11 events 3 no reads; kill switch events 1 no reads. S2 pin + screen_failed reads (records' F3) pass.
- models-routes.db.test.ts written: S1 describe (budget, remembered, limits), S2 pin describe, nit asserts in MOD-11 & kill switch, records' screen_failed reads assertion; heldRows/screenCounts helpers.
- [ ] contract-proposals.ts implementation in progress (doc comment + imports done)
- [x] contract-proposals.ts DONE: SCREEN_LIMITS (model_screen practice 20/h, user 20/h; model_screen_day practice 60/d, user 100/d), screenLimitSubject, takeScreenLimits on modelPool (stop at first refusal; MODEL_SCREEN_LIMITED log), ScreenLimitedError -> problem screen_unavailable (SCREEN_LIMITED_PROBLEM), beforeScreen = limits then recordContractScreenRequested; names_patient memory (WeakMap per services, key practice:document:sha256(pages), 1 h, cap 1000). ProposeServices gains sealer.
- [x] test-support/model-world.ts: seeder's services gain a sealer (proposeTerms' caller; needed to compile).
- web tsc clean. web db AFTER: 16/16 (fix-gateway-web-db-after.log).
- gateway.db: new test 'screens no call it refuses without the screen' BEFORE (clone): fails 20 vs 10 (replay screened again, 10 rows) (fix-gateway-gwdb-before.log); AFTER: gateway.db + patient-records.db 32/32 (fix-gateway-gwdb-after.log).
- [ ] next: permitted.db test (records' request: two examples, decrypt failure -> both screen_failed, reads once per example); permitted.ts doc on reorder; S2 page label?; lint/eslint; requests.md; docs.md; final report
- [x] permitted.db.test.ts: new 'spent budget reads none' (S1) BEFORE fails (names_patient first) / AFTER pass; records' requested 'screen_failed twice, reads per example kept' (passes both: records' F3). permitted.db 10/10 after. logs: fix-gateway-permitted-{before,after}.log
- [x] permitted.ts doc comment (reads only when gateway first screens). models.ts top doc (screen limits + memory).
- [x] eslint my 9 files clean; tsc web + worker clean; model-gateway tsc only the tokenizer's eval 'joins'; lint:logs pass.
- [ ] next: S2 page label decision; full unit runs (gateway pkg, web http/routes unit); requests.md; gateway-docs.md; gateway.md report
- [x] wide unit (model-gateway pkg, web models/routes/http, worker models): 801/802, the 1 = tokenizer's redact.test.ts bound test (pending records' request) (fix-gateway-unit-wide.log)
- [x] route-tests 10 + 11 (propose + reject_proposal routes) 1150/1150 (fix-gateway-route-tests.log)
- [x] gateway.ts: spec.screen called on the spec (binding kept); gateway+contract-terms+patient-records unit 128/128
- S2 decision: no page change (the page alone cannot page a tie or name the cause; a label without the link is copy for UX later); pin test + after-#42 patch + Lane A function change + ADR text.
- [ ] next: requests.md section, gateway-docs.md, gateway.md report
- [x] requests.md gateway section written (items 1-7)
- [x] gateway-docs.md written (16 items)
- [x] final db: gateway.db + patient-records.db + models-routes.db + permitted.db 58/58 (fix-gateway-db-final.log); model-gateway tsc: only the tokenizer's eval 'joins'
- [ ] write fix/gateway.md (report) and return it
- [x] DONE: fix/gateway.md written 20:09 UTC. Part complete.
