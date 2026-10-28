# pay-build-E (slice E: route db tests + ADR 0085 + CAS-45..48)
Started 2026-10-28. Fresh start (no earlier progress file).
## Status
- [ ] design read
- [ ] workbench-routes.db.test.ts cases
- [ ] ADR 0085
- [ ] test-matrix.md CAS-45..48
- [ ] matrix.ts CAS-45..48
- [ ] registry entries
- [ ] pnpm synth --all
- [ ] synth unit tests
- [ ] typecheck / eslint / db tests
- design read in full (1-9). A, B, C, D progress files read: A, B, D complete; C complete but e2e blocked on my :618.
- DONE (unblock): workbench-routes.db.test.ts:618 page.documents -> page.letters.unused (C and D e2e builds waited on this)
- RUN apps/web tsc --noEmit (lock) after :618 fix: clean (0 errors). C and D can build e2e now.
- DONE docs/product/test-matrix.md: CAS-45..48 after CAS-39 (word for word from design 4.1)
- DONE packages/synth/src/cases/matrix.ts: CAS-45..48 after CAS-39 (generated from the md rows, so identical)
- DONE packages/synth/src/cases/registry.ts: Lane B comment + CAS-45..48 none(8, ...) per design 4.2
- NEXT: ADR 0085, then the db tests, then synth --all + synth tests
- DONE docs/product/test-matrix.md: CAS-45..48 after CAS-39 (word for word from design 4.1)
- DONE packages/synth/src/cases/matrix.ts: CAS-45..48 after CAS-39 (generated from the md rows, so identical)
- DONE packages/synth/src/cases/registry.ts: Lane B comment + CAS-45..48 none(8, ...) per design 4.2
- NEXT: ADR 0085, then the db tests, then synth --all + synth tests
- DONE docs/adr/0085-...md (new, whole: status/date/deciders/PRD, context, D1-D4, alternatives, consequences, not covered, not verified, revisit)
- WRITTEN workbench-routes.db.test.ts: imports; helpers specialistOf, documentOf, submitted, submittedCase, LETTER_REFUSED, REFUSED_AS_SOURCE, DOCUMENT_USE_LOCK, held, waitingOn; CAS-45 test (Cases block); existing submissions test on submittedCase (+ thisCase after first response, + log names letter); CAS-46; CAS-48 x3 (letter checks + contract lists/handlers; other case group; lock race both ways via 2nd owner connection + pg_locks)
- NEXT: tsc + eslint on the file, then run the db file under the lock
- db run-1 started 2026-10-28T06:56:18Z: workbench-routes.db.test.ts (log scratchpad/payE/db-1.log)
- db run-1 DONE: 12/13 passed; FAIL serializes a tag and a response (CAS-48) - investigating
- FIX race mirror: payer_response needs recorded_by (CHECK payer_response_job_records_reprocessed); held() takes actorId, response recorded in the manager's name
- MUTATION (my file only): held side's lock key -> document_usX: ; running race test, expect FAIL; restore from scratchpad/payE/workbench.before-mutation.ts
- MUTATION result: race test FAILED as expected (no transaction waited for the document's lock); file restored (0 document_usX)
- db run-3 (whole file): 13/13 PASSED
- RUN pnpm synth --all (lock): 4 written (fixtures/synthetic/CAS-45..48/expected.json), 645 unchanged, 0 removed
- RUN synth unit (vitest unit packages/synth, lock): 13 files, 185 tests PASSED
- RUN check:fixtures (lock): PASS
- RUN pnpm typecheck (lock): PASSED, 22 projects, 0 errors (all slices' files in)
- RUN eslint (workbench test, registry.ts, matrix.ts; lock): clean
- RUN gitleaks 8.24.3 (.gitleaks.toml) on copies of all slice-E files: no leaks
- RUN lint:copy (lock): PASS (521 files). Model-name / brand-word sweep of my files: none (substring hits only)
## STATUS: COMPLETE. No e2e owned by slice E. Waits on nothing.
