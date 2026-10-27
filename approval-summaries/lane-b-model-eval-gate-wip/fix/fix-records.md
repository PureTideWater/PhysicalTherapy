# fix-records progress (PART records)
Started 2026-10-27. Worktree /home/user/contract-phi-check (no commits/stash/reset).
Before-clone (head 9b7eadfe, installed): /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/clones/fix-records-before
Mutant driver: progress/mutants.py; log progress/fix-records-mutants.log (13/13 killed)
## Findings
- F3/S3: CODE DONE (patient-records.ts load(): ciphertext out of withJobScope, decrypt after commit). Unit tests DONE (fail at head: steps order; decrypt fault audited []). DB test DONE (fails at head: {} audit rows; passes after).
- F4: CODE DONE (each read LIMIT left+1; too_many). No packages/db request (cap is isolation-independent). Unit tests DONE (3 race cases, fail at head: names_patient). DB race test DONE (head names_patient; fix screen_unavailable, claim reads 25,001).
- F7: CODE DONE (POSTED_ONLY; COUNT; posting_row readWithAudit). Unit tests DONE. DB tests DONE (head clear; fix names_patient; matched line not read). screen-world.ts: postingReferences, postedClaims, undecryptableClaims.
- N1: DONE: includes test, 4 tampered-scope tests (vi.mock withJobScope wrapper), default branch test (WeakSet.prototype.has spy). Mutants killed.
- F6/S4: DONE: specs.ts Object.freeze map + each spec; spec.ts readonly props; index.ts drops PURPOSE_SPECS; specs.test.ts (4 tests; head 4 failed + 3 unused @ts-expect-error in tsc) log progress/fix-records-specs-before.log
- N2 + stub nit: DONE: doc comment corrected; syntheticRecordsCheck off index.ts, re-exported from testing.ts; lint rules for practiceRecordsCheck call sites (+ argument shape) and syntheticRecordsCheck; scope/pool brand named as packages/db (outside)
- testing-module lint: DONE: transitive reach via import graph (all quote forms, side-effect, re-export, dynamic, require, workspace exports). Head rule misses 7 of 8 synthetic cases (progress/fix-records-lint-before.log); new rule mutants fail as expected.
## Files changed
- packages/model-gateway/src/patient-records.ts (tsc clean)
- packages/model-gateway/src/testing.ts (memory: postings, bulk*, LIMIT, transactional audit, steps, SteppedCipher; re-export syntheticRecordsCheck)
- packages/model-gateway/src/patient-records.test.ts (28 tests pass)
- packages/model-gateway/src/patient-records.db.test.ts
- packages/model-gateway/src/test-support/screen-world.ts
- specs.ts, spec.ts, index.ts, lint.test.ts, specs.test.ts (new)
## Requests for integrator (to write in requests.md)
- gateway.test.ts:379 reads toEqual needs postings: 1
- contract-terms.ts default branch: comment as defensive
## Tests and results
- unit lint.test.ts 15/15; specs.test.ts 4/4 (worktree)
- db patient-records.db.test.ts: worktree 10/10 pass (progress/fix-records-db-after.log); head clone 3 failed/7 passed (progress/fix-records-db-before.log)
- unit patient-records.test.ts: worktree 28/28 pass; head clone 10 failed/18 passed (log progress/fix-records-unit-before.log)

## Done since
- full model-gateway unit run: 458/460 (gateway.test.ts:379 needs postings:1 -> requested; redact.test.ts is the tokenizer part's in-flight redact.ts)
- gateway.db + patient-records.db: 31/31; web models-routes.db + worker permitted.db: 20/20
- tsc model-gateway, apps/web, apps/worker: clean; eslint on my 10 files: clean
- fix/requests.md records section appended
## Left
- write fix/records-docs.md, fix/records.md

## Resumed 2026-10-27 19:15 UTC
- Verified worktree = saved WIP (4ee7c665) for my files; re-ran: tsc gateway/web/worker clean; unit patient-records+specs+lint+contract-terms+prompts pass, gateway.test.ts:379 fails only as requested (postings:1); db patient-records+gateway 31/31; web models-routes.db + worker permitted.db 20/20; eslint my 10 files clean. Logs progress/fix-records-resume-*.log
- Before (head clone with current tests copied in): unit 15 failed/32 passed (3 files); db 3 failed/7 passed. progress/fix-records-resume-before.log
- DONE: lint.test.ts isTestCode (support dirs not test code under apps/web/src/app/) + self-check; before (head-equivalent regex) 2 failed/14; after lint+specs 20/20; tsc+eslint clean. records-docs.md updated. Left: write fix/records.md
- DONE: fix/records.md written (2026-10-27 19:36 UTC). Part complete; nothing left in my files.
