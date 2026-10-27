# Security review of #75: the contract PHI check before the model (combined audit #120, ADR 0070 Part 3, MOD-12)

PR #75 (`co-001/contract-phi-check`), head 9b7eadfe, base `claude/build-platform` at e908c214. Reviewed against
`.claude/agents/security-reviewer.md` (its checklist and rules), CLAUDE.md, the design
(`/home/user/ops/designs/lane-b-model-eval-gate.md`: session rulings, section 5, Appendix A.3, M7, M8, M9, M12, m3, m9,
m14, m15) and ADR 0070 Part 3. No migration, so the definer-function checklist has nothing to read:
`packages/db/functions` and `packages/db/migrations` are untouched.

Clone: `/tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/clones/review-security`.
The review's experiments are untracked files there: `packages/model-gateway/src/review-security.test.ts` and
`packages/model-gateway/src/review-security.db.test.ts`. Their outputs are in `scratchpad/phi/sec/`.

## Verdict

The boundary holds. I found no path that sends a contract's pages to a provider without the screen:

- the only provider call is `gateway.ts:392`;
- the request's `user` is the same string the screen reads (`prepared.user`);
- the check is unforgeable and bound to the call's practice;
- tenant isolation and fail-closed behaviour are as the ADR states.

There are two findings of my own, one major and one minor:

- **Major:** each request runs the whole audited read of the practice. That includes requests the gateway refuses
  anyway (a replay, a spent budget), and the rate is limited only by the generic mutation limit, so one contract
  specialist can write tens of thousands of permanent audit rows per second.
- **Minor:** the practice's own access log cannot show who caused a screen, and it lists only the first 50 of a
  screen's reads.

Two further minor findings are the PHI-screen review's (#3 and #6). I reproduced both independently and list them by
cross-reference.

## Findings

### S1. major: the full audited screen runs for calls the gateway refuses anyway, at up to 120 requests a minute per person

- **Where:** `packages/model-gateway/src/gateway.ts:225`. The screen runs before the idempotency check (`:230`) and the
  budget hold (`:249`). `apps/web/src/lib/routes/models.ts:42`: `proposeTermsAction` names no `rateLimit`, so it
  counts against the generic `mutation` bucket (`apps/web/src/lib/http/invoke.ts:365`; 120 a minute per user,
  `rate-limit.ts:41`). `contract-proposals.ts:177-178` builds a fresh check for every request, so the set loaded in
  one request is never reused by the next.
- **Scenario:** the first two cases are proven in `review-security.test.ts` (2 of 2 pass at head, synthetic memory
  records). In each, the request is refused, yet it first reads and audits every member ID and claim of the practice.
  - A specialist re-sends a proposal that already completed: a refresh-resubmit, or a replayed POST with the same
    request key. The screen opens its scope, counts, reads both tables, writes the audit rows, and only then is the
    call refused with `DuplicateModelCallError`.
  - A practice has spent its daily budget (here a zero budget). Every click screens in full and is then refused with
    `ModelBudgetExceededError`.
  - Any contract document: each POST is one full screen. This is measured on Postgres (`review-security.db.test.ts`,
    a practice of 24,999 claims and one member ID, just under the bound). Three requests wrote 75,000 audit rows at
    about 2.4 s a screen on this shared 4-CPU machine. `audit_event` takes about 325 bytes a row with its indexes.
  - The call limiter (2 in flight per practice per process) and the 120-a-minute user bucket are the only brakes. One
    specialist session can therefore write roughly 1 to 6 million rows a minute (0.3 to 2 GB) into `audit_event`.
    That table is append-only for every role (`packages/db/src/authz/audit.ts:8-9`), so the rows can never be
    removed.
- **What the ADR claims:** `gateway.ts:40` and ADR:607 say "no audited read runs for a call that would be refused
  anyway". ADR:851 says each proposal reads "once per click", which reads as a human-paced cost. Both understate
  this. The bound is per check; nothing bounds the per-time cost.
- **Fix:**
  1. In `limited()`, compute the idempotency key and call `store.completedCall` before `this.screen(...)`. Both are
     reads, and `prepared.inputHashes` exists by then.
  2. Before the screen, peek at the budget read-only: `store.spentSince(practiceId, utcDayStart(now)) >= budgetMicro`
     refuses as `ModelBudgetExceededError`, with the existing log line. Keep the atomic `hold` after the screen, so a
     refused call still holds no budget and writes no `model_call` row.
  3. Give `proposeTermsAction` its own rate bucket, for example `model_screen`: user 20 per 10 minutes. This is a code
     change only: add it to `RateBucket`, `RATE_BUCKETS` and `RATE_LIMITS`; `rate_limit_take()` accepts any bucket
     matching `^[a-z][a-z0-9_]{0,31}$`. Reusing `export` (60 per 10 minutes) would also do.
  4. Add tests that a replay and a zero-budget call take no screen connection (`records.reads.connects === 0`), and a
     route test that the propose action is limited by its bucket.
  5. State the per-time bound in ADR 0070 Part 3 under Consequences.

### S2. minor: the practice's access log shows a screen's reads as "a job of the practice", cannot show who caused them, and lists only 50 of them

- **Where:**
  - `packages/db/functions/practice_access_log.sql` labels any non-user, non-system actor "a job of the practice", via
    `system`, and returns no `request_id`.
  - `apps/web/src/lib/routes/settings.ts:834` pages with `next` set to the last row's `at` only, and the function
    filters `e.at < before_at`.
  - Every audit row of one screen is written by one statement in one transaction (`patient-records.ts:271-282`), so
    they all share one `at` (`DEFAULT now()`).
- **Scenario:** proven on Postgres (`review-security.db.test.ts`, output `sec/accesslog.json`). An internal contract
  specialist under support grant SQ-77 proposes a document of a practice holding 301 identifier rows. The practice
  administrator then pages through Settings, Access log, exactly as the route pages it.
  - The 301 reads were audited, but the log lists only 50 of them, labelled `a job of the practice | system | no
    ticket`.
  - The next page jumps past the other 251 to the person's `contract_screen_requested` event (`<email> | support |
    SQ-77`).
  - Nothing on either page ties the 50 reads to that event, because the join is by `request_id` and the view does
    not expose it.
  - At the bound, a click lists 50 of up to 50,000 reads.

  ADR 0070 Part 3 says "the trail says who caused the screen and joins to its reads by request ID". That holds only
  for an operator querying `audit_event` directly, not for the practice's own access report. A filtered "who read
  claim X" still lists the screen's read of X, but as a job.

  The paging defect is older than this PR: any `readWithAudit` of more than 50 rows ties on `at`. This PR raises it
  from a few dozen rows a request to tens of thousands.
- **Fix:**
  - In this PR: add to "What it gives up" that the practice's access log shows screen reads as a job, cannot show the
    person who caused them, and lists only the first 50 of a screen's reads. Add a db test that pins today's
    behaviour, so F3 changes it knowingly.
  - For Lane A, with F3: `practice_access_log` pages on `(at, id)` (the route's `next` carries both), and labels
    `purpose = 'contract_screen'` reads by their joined `contract_screen_requested` event. F3's single screen event
    with only the matched rows would remove most of the problem.
  - Do not put the person's `grant_id` on the screen's reads to get a "support SQ-77" label. That would make the
    support ticket's trail say the person read every patient, which M8 rules out.

### S3. minor (= PHI-screen review #3, reproduced): a decrypt failure rolls back every audit row of reads already made

- **Where:** `packages/model-gateway/src/patient-records.ts:156-165` and `:283-293`. The decrypt runs inside the
  `withJobScope` callback whose transaction also holds `readWithAudit`'s audit rows.
- **Scenario:** a practice where one claim's patient control number is sealed for another column (the state
  `models-routes.db.test.ts` builds for its `screen_failed` case). My Postgres run (`sec/accesslog-decrypt.json`): the
  outcome is `screen_failed`, and under the screen's request ID only the person's `contract_screen_requested` event
  remains. Zero of the screen's `read` rows are kept, although both tables were read and earlier values were
  decrypted. Because the corrupt row stays, every later click of every contract repeats this: a full read with no
  read audited.
- **Fix:** return the ciphertext rows from the job scope, so the audit rows commit, and decrypt and build the set
  after `withJobScope` resolves. A decrypt failure then answers `screen_failed` with every read audited. Have the
  web's `screen_failed` test assert that the screen's reads exist.

### S4. minor (= PHI-screen review #6): the spec that decides whether the screen runs is mutable

- **Where:** `packages/model-gateway/src/specs.ts:11` (`as const` is type-only), the exported `PURPOSE_SPECS`, and
  `contractTermsSpec` (`functions/contract-terms.ts:522`).
- **Scenario:** any in-process code runs `PURPOSE_SPECS.proposeContractTerms.screen = undefined`, and
  `gateway.ts:275` (`spec.screen?.(…)`) skips the screen for every caller. The WeakSet and `Object.freeze` protect the
  check object but not the spec.
- **Fix:** `Object.freeze` each spec and `PURPOSE_SPECS`, and make `screen` readonly. Better still, have the gateway
  call `screenContractPages` for `proposeContractTerms` whatever the spec says. Add a test pinning
  `PURPOSE_SPECS.proposeContractTerms.screen === screenContractPages` and frozenness.

## Nits

- **ADR:602 and `patient-records.ts:18-20` overclaim.** They say "a stub that returns nothing cannot be supplied", but
  `authorizedBy` and `pool` are duck-typed. `testing.ts`'s `memoryPracticeRecords` is exactly such a stub, issued and
  bound to a practice. The PHI-screen review notes this too.
  - Say instead that no production caller supplies one.
  - Add a `lint.test.ts` case: outside tests, `practiceRecordsCheck` is called only from `contract-proposals.ts` (with
    `services.modelPool`) and `permitted.ts` (with `services.pool`).
- **`lint.test.ts`'s testing-module guard checks direct importers only.** It also allows any path containing
  `/test-support/` or `/route-tests/`. A production module that imports a test-support module which imports
  `testing.ts` passes. Check transitive importers, or forbid production imports of those directories.
- **The orphan-event gap is wider than the ADR's list.** ADR:745-748 says the person's event is also recorded when
  the gateway refuses before the screen, naming the kill switch and an unserved variant. It is equally recorded for:
  - `busy` (the limiter);
  - a purpose not served;
  - `phi_boundary`;
  - `prepare`'s refusals (`no_text`, `too_many_pages`, `input_invalid`).

  Say "any refusal before the screen".
- **The ADR should say who authorizes the screen's read in the web.** It is authorized in the handler, from the
  person's Postgres-computed scope (`open_practice_scope`). Postgres then trusts the job scope's `app.practice_ids`,
  as it does for every job. This is the first web path that opens a job scope, and until F3's `SECURITY DEFINER`
  function, Postgres does not re-check the requester. The design accepts this (M8), but "What it gives up" does not
  say it.

## Improvements

- With S1's pre-screen checks, the m3 sentence becomes true as written. Consider also refusing, before the screen, a
  call whose `mostCost` alone exceeds the budget.
- F3's proposal to Lane A should name S2 (the access-log label and cursor) and S1 (one event per screen, not one row
  per identifier), so the interim's costs are retired together.
- For memory, I concur with the PHI-screen review's #5: make `identifierRuns` short-circuit. The screen runs before
  the budget and idempotency checks, on the web request's event loop.

## What I checked and found sound

- **Every path to the model.**
  - `proposeContractTerms` has three callers: the web's `proposeTerms`, the worker's permitted run and the eval
    harness. `contractTermsSpec` is reached only through `PURPOSE_SPECS` in `gateway.ts`.
  - `provider.complete` is called only at `gateway.ts:392`. `eval/faults.ts` and `eval/harness.ts` wrap a provider;
    they do not bypass the gateway.
  - Both real providers send only `request.system` and `request.user`, and `request.user` is `prepared.user`, the
    very string the screen read. The retry reuses the same request. So pages that change between screen and call (a
    getter or proxy on `pages` or `kind`) cannot reach the provider unscreened.
  - The frame adds no digit-bearing run.
- **The check object.**
  - It is read from the input once (`contract-terms.ts:504`), frozen before its WeakSet add, and identity-checked.
    Proxies, `Object.create` and copies are refused as `screen_invalid` (tested).
  - The practice match makes a check for another practice, a synthetic check on a practice call and a practice check
    on an evaluation call all `screen_invalid`.
  - `checkContext` ties a null practice to an evaluation actor, and only `eval/` builds one.
  - A reused check is bound to its practice and request; no production code caches one across requests.
  - A practice check for A built with a scope for B is refused at construction (db test).
- **Tenant isolation.**
  - `withJobScope` sets `app.practice_ids` to `ARRAY[$2::uuid]` with `is_local` true, the actor to the screen ID as
    `service`, and refuses an ID that names a person. `load()` asserts the opened scope again.
  - Both queries filter `practice_id = $1` under the unchanged FORCE RLS tenant policies, and `readWithAudit` refuses
    a foreign row.
  - The cross-tenant db test passes: another practice's identical identifiers never match.
  - The worker builds one check per practice per run, never across practices.
- **The audit trail.**
  - One read row per returned row, actor the screen ID (`service`), purpose `contract_screen`, request ID
    `<request>:screen:<screen>`.
  - That ID fits `^[A-Za-z0-9._:-]{1,128}$`: 80 characters on the web (a UUID request ID) and 99 on the worker.
  - The person's one `contract_screen_requested` event joins by that ID (`models-routes.db.test.ts`), and the person
    is never a reader.
  - The rows satisfy `audit_event_record`.
  - The rollback gap is as listed, plus S2 and S3.
- **What leaks.**
  - `pnpm lint:logs` passes (1,057 files).
  - The new log lines are fixed sentences with `practice_id` and `error_code` only (m15, recorded), and every new
    error message is a fixed sentence.
  - The notice parameter is a closed `z.enum(MODEL_NOTICES)`, and the redirect carries the code only.
  - No PHI appears in a URL, key, filename or job payload.
  - The upload panel's problems name no file.
- **The oracle (m14).**
  - Only `contract_specialist` holds `rate_record.edit`, and it lacks `file.upload`. Every role with `file.upload`
    holds `phi.read`.
  - A version names only its own practice's documents, and the kind check limits the screen to contracts and
    exhibits that someone else uploaded and the specialist can already open.
  - So a person without `phi.read` cannot choose page text to ask "is this member ID our patient".
  - Timing and `screen_unavailable` reveal only whether the practice holds more than 50,000 identifiers.
  - m14 holds.
- **Memory.**
  - The decrypted set lives in the check's closure for one request (web) or one run (worker), and goes with it. No
    retention path exists: errors carry no values, and the logger gets codes.
  - Concurrency is bounded by the limiter (4 per process, 2 per practice) and the bound.
- **The upload panel's server rule.**
  - `requestUploads` requires `kind: z.enum(DOCUMENT_KINDS)`, and the new db test pins a missing, empty, unknown and
    null kind.
  - The only web insert of `source_document` is `uploads.ts:243`.
  - Zip entries inherit the zip's kind (listed), and the screen catches an EOB inside one (gateway db test).
- **The PR #42 boundary.** The two PRs share exactly five files: `docs/product/reconciliation-001.md`,
  `docs/product/test-matrix.md`, `packages/synth/src/cases/matrix.ts`, `packages/synth/src/cases/registry.ts` and the
  regenerated `tools/screening-capacity/watched-paths.txt`. All five are allowed.
- **Secrets.** gitleaks 8.24.3 (the repository's `.gitleaks.toml`) over e908c214..9b7eadfe scanned 6 commits and
  found no leaks.
- **Fixtures.**
  - `pnpm check:fixtures` passes.
  - MOD-12's values are invented and marked: SYNTHETIC text and names, ZZ and SYN prefixes, 99-prefixed NPIs, the
    TIN 00-0481549, ZIPs 00011 and 00013, the 555-555-0142 phone number and a 99 routing number.
  - The PDF titles begin with SYNTHETIC and the producer is the synth package. The zip holds two synthetic PDFs.
  - The twin practice is generated in memory only.
- **Tests run in my clone at head.**
  - Unit: 6 files (redact, patient-records, contract-terms, gateway, lint, web `path.test.ts`), 140 passed.
  - Database: 5 files (`patient-records.db`, `gateway.db`, `models-routes.db`, `permitted.db`, `uploads.db`), 62
    passed.
  - The review experiments: `review-security.test.ts` (2 pass) and `review-security.db.test.ts` (3 pass).

I did not judge the screen's matching itself (the tokenizer, the floors, the false refusals): that is the PHI-screen
review's, and I concur with its findings #1 to #8. Nothing here declares the system HIPAA compliant.
