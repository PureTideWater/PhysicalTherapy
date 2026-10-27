# PR C (#120) settle-code: co-001/contract-phi-check, worktree /home/user/contract-phi-check, on 862c9dc8

Nothing committed, stashed, reset or checked out. No migration. No docs/ or synth matrix/registry file touched.

## Items settled

1. **The web's screen event comes from the gateway (paths adaptation 1, screen proposal).** `apps/web/src/lib/models/contract-proposals.ts` now calls `recordContractScreenRequested(scope, { practiceId, documentId, requestId, screenId })` from @tp/model-gateway. That function uses `screenAuditRequestId`, the same function the check's reads use, so the two request IDs cannot drift. The inline `recordAuditEvent` and `${requestId}:screen:${screenId}` are gone, and so are the now-unused `recordAuditEvent` and `CONTRACT_SCREEN_PURPOSE` imports. The gateway index already exported what this needs (`recordContractScreenRequested`, `screenAuditRequestId`, `CONTRACT_SCREEN_PURPOSE`), so nothing new is exported. The join test in models-routes.db.test.ts (the event's request ID equals the reads') still passes. Request IDs are randomUUID (http/handler.ts, next.ts), so `<uuid>:screen:<uuid>` is 80 characters, within the 128 the audit column allows.
2. **refused_rose (paths open item): kept fail closed, as recommended.**
   - Documented in the module doc comment of `apps/worker/src/models/permitted.ts`:
     - a refused:names_patient example still counts among the variant's refused calls;
     - the first run after the check ships fails `refused_rose:<variant>` against an earlier run;
     - the comparison is made again against a run on the current code.
   - That comment's request ID is also corrected to `evaluate-permitted:<run>:screen:<run>`.
   - A pin was added to `apps/worker/src/models/permitted.db.test.ts` (misfiled practice):
     - `refused_rose:default` against an earlier report whose calls were made;
     - `[]` against a second run on the current code.
   - Docs agent: record this in ADR 0070 Part 3 and the runbook (see below).
3. **Callers of proposeContractTerms and ContractPagesInput.**
   - There are three production callers: the web's proposeTerms, the worker's permitted run, and eval/harness.ts. Each passes `patientRecords`.
   - The e2e helper (models.ts) uses `RequestInputs` (`requestFor` only).
   - fixtures.test.ts and every other test compile.
   - `pnpm typecheck` passes on 22 projects, apps/web with e2e included.
4. **e2e uploads.**
   - Every upload through the contracts or reconciliation panel already chooses a kind:
     - contracts.spec.ts:42 and its new refusal step;
     - packets.spec.ts:437 (payer_letter on /contracts);
     - reconciliation.spec.ts:56;
     - ledger.ts:77, which ledger-patient-share.spec uses.
   - Every other upload goes through /uploads, which keeps `initialKind="x12_835"`: brand, layout-1280, viewer-phi, triage, uploads, mapping, monitoring, onboarding, packets, pricing, remittances, reports, unattested, and contracts.spec:66. era-exports selects its kinds.
   - The only users of `<Uploader>` are the uploads, contracts and reconciliation pages. No #42 e2e file was touched.
5. **The e2e practice's records do not make the e2e contracts refuse.**
   - models.spec's practice is a fresh journeyPractice holding only fixtures/synthetic/CAS-08/remit.835. No db:seed records are in it, and no other spec uses MODELS_PRACTICE.
   - A script took every CLP01, CLP07 and NM109 of CAS-08 (more than the loader stores) through `screenSet` with the shipped rules. It then ran `pagesName` over draftContract's pages (CONTRACT_PAGES plus each title, "SYNTHETIC MODEL-PROPOSED AGREEMENT" and "SYNTHETIC HAND-ABSTRACTED AGREEMENT"). Result: **false for both**, so no fixture or seed change is needed. Script: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/scripts/e2e-screen.ts.
   - No other e2e spec proposes a contract.
6. **Screen-part open items inside these files.**
   - The per-cause load code (decrypt, query or scope) stays as the screen built it: the check has no logger, and MODEL_INPUT_SCREEN_FAILED is the only trace. I kept that because it is safer (no message is logged). It is a possible follow-up, not a defect.
   - watched-paths.txt is the suite agent's to regenerate (`watched.ts --write`). No new import edges came from my changes.

## Bugs found in the adversarial read (each fixed, with a test that fails without the fix)

A. **A way around the screen (fixed): the screen read the input's pages a second time, after `prepare` had framed them.**
   - An input whose `pages` read differently on each access (a getter or a Proxy) could:
     - answer the screen with clean pages;
     - have a page naming a patient framed and sent.
   - Fix: `screenContractPages` (`packages/model-gateway/src/functions/contract-terms.ts`) now checks `prepared.user`, the exact text the call sends: `check.namesPatient([prepared.user])`.
   - The doc comment says why the frame adds no run the screen could take for an identifier:
     - each page sits on lines of its own, and a newline ends a run;
     - the frame's words have no digit, and every kept identifier has one;
     - the frame's page numbers and count stand alone, below every floor.
   - Its parameter type is `{ readonly user: string }`.
   - Test, in gateway.test.ts:
     - name: "screens the text the call would send, so pages that read clean only when the screen asks for them are refused";
     - setup: `pages` is a getter that returns the clean contract only when `screenContractPages` is on the stack;
     - expected: names_patient, with no completedCall, no provider request and no model_call row.
   - I confirmed the test fails with `input.pages` restored and passes with the fix.
   - The golden gate test still shows zero false refusals over set v2 with the twin practice.
B. **A way around the screen (guard added): production code could import `@tp/model-gateway/testing`.**
   - Its `memoryPracticeRecords` and `syntheticPracticeCheck` issue a real practice check over an in-memory practice. The screen accepts that check for the practice, yet it reads none of the practice's records.
   - Nothing imports it outside tests today, and the eslint config has no rule against it.
   - Guard: a new test in `packages/model-gateway/src/lint.test.ts`, "leaves the testing module's checks to tests: no other source imports it". It checks static and dynamic imports, both the package specifier and relative paths.
   - It allows: *.test.ts(x), test-support/, route-tests/, apps/web/e2e/, and packages/model-gateway/eval/ (the synthetic evaluation, whose gateway refuses a practice ID: eval/reference.ts imports registerOutput).
   - It fails if a production source imports the module.

Checked, no defect found:
- PHI in logs and errors: the screen's messages are fixed sentences, ScopeError texts are fixed, the gateway line carries only practice_id and error_code, and lint:logs is clean.
- The worker logs IDs only.
- Tenant isolation:
  - the check's own job scope is asserted to be one practice, a service actor and the screen ID;
  - the cipher must be the practice's;
  - both read queries are filtered by practice_id and run under row-level security;
  - the cross-tenant tests pass.
- The modelPool sizing (perProcess + 1) holds, because a call holds no store connection while its screen runs.

## Files changed (this run)
- packages/model-gateway/src/functions/contract-terms.ts (A)
- packages/model-gateway/src/gateway.test.ts (A's test)
- packages/model-gateway/src/lint.test.ts (B)
- apps/web/src/lib/models/contract-proposals.ts (1)
- apps/worker/src/models/permitted.ts (doc comment: 2, and the request ID wording)
- apps/worker/src/models/permitted.db.test.ts (2's pin)

## Tests and results (Node 24, each under flock /tmp/laneb-heavy.lock; db on 5433)
| Run | Result |
|---|---|
| vitest unit: packages/model-gateway, apps/web/src/lib/models, apps/web/src/components/uploads | 27 files, 452 passed |
| vitest golden: packages/model-gateway | 56 passed (22 s) |
| vitest db: packages/model-gateway, apps/worker/src/models/permitted.db.test.ts, apps/web/src/lib/routes/models-routes.db.test.ts, uploads.db.test.ts | 5 files, 62 passed |
| A's test with the fix reverted | fails as expected; passes with the fix |
| pnpm typecheck | 22 projects pass |
| eslint --max-warnings=0 on the 6 changed files | clean |
| pnpm lint:logs | clean (1057 files) |

## For the docs agent (ADR 0070 Part 3 and related)
- **Adaptation:** the screen checks the prepared request's text (`prepared.user`), not `input.pages`. What is checked is what is sent, which closes the getter or Proxy way around the screen. The frame adds no run the screen could match.
- **refused_rose:** kept fail closed (session-ruling rule: the safer option). The first permitted run after PR C, on a practice with an example whose document names a patient, fails `refused_rose:<variant>` against an earlier report. Compare again against a run on the current code. This is documented in apps/worker/src/models/permitted.ts and pinned in its db test. It belongs in ADR 0070 Part 3 and the permitted-run runbook.
- **The event writer:** the web records `contract_screen_requested` through the gateway's `recordContractScreenRequested`. Paths adaptation 1 (the inline ID) is now resolved, so record it as built this way.
- **New guard:** only tests, their support files, the e2e and eval/ may import @tp/model-gateway/testing (lint.test.ts).
- **The e2e result:** the models practice's CAS-08 records do not refuse the e2e contracts. No e2e spec needs a change for the empty starting kind.
- Earlier builders' items still to record: the screen part's adaptations 1-3, 5, 7 and 8, and the measurement table; the paths part's adaptations 2-6; and the upload part's adaptations.

## Improvements outside this PR's files (named, not made)
- eslint.config.js: a no-restricted-imports rule for `@tp/*/testing` outside test code. That would be stronger than B's repository-scan test.
- packages/db scope.ts: a brand (module WeakSet) on real scopes, so `practiceRecordsCheck` could refuse a hand-built `authorizedBy` or pool. Today a fake pool written in-repo can still feed a check; the lint guards and review are what stop that.
- packages/model-gateway/src/permitted.ts: a sentence in permittedRegressions' doc comment saying that refused:names_patient counts toward refused_rose.
- Still open from the paths part: the person's event and the screen's reads commit in two transactions. F3 removes that.
