# PR C (#120) suite: co-001/contract-phi-check, worktree /home/user/contract-phi-check

The suite ran on HEAD 9b7eadfe, three commits on top of the merge 862c9dc8. Nothing was pushed, and every heavy step ran under flock /tmp/laneb-heavy.lock with Node 24.

## Settled between the code and docs agents
- Every one of the docs agent's items 1-8 was checked against the code, and the docs were already consistent:
  - the screen reads `prepared.user`;
  - lint.test.ts keeps testing.ts to tests;
  - the web records `recordContractScreenRequested`;
  - the five MODEL_INPUT_* log codes match gateway.ts:287-301;
  - refused_rose is described the same way in permitted.ts, the ADR and the runbook;
  - synth drift is zero;
  - watched-paths.txt is unchanged.
- One gap was closed. ADR 0070 Part 3's "Where the build departs from the design" now lists two more departures, so there are 19, as the docs commit says:
  - 18: the screen reads `prepared.user` where the design's step 3 (design :922) passed `input.pages`;
  - 19: `src/testing.ts` is kept to tests by a lint.test.ts case the design did not have.

## Steps and totals (as the runners printed them)
1. `pnpm synth --all`, run twice. Both runs printed: 237 case(s); 0 file(s) written, 637 unchanged, 0 removed; 8 EMR export format(s); 0 written, 16 unchanged, 0 removed.
2. `pnpm --filter @tp/model-gateway eval`:
   - contracts propose-contract-terms/1 (default), local-deterministic: 63 documents, precision 0.996941, recall 0.996941, quotes off their page 0;
   - narratives: 300 of 300 without a critical error;
   - "gate: passed".
   - Not re-recorded: the set did not change (the eval/sets.ts diff only changes a type).
   - `gitleaks dir packages/model-gateway/eval`: no leaks found (~540 KB).
3. `tsx tools/screening-capacity/watched.ts --write`: 531 lines, unchanged (the file's 2-line change is the builders', already committed).
4. `pnpm typecheck`: passed, 22 projects in 21.0 s wall.
5. `pnpm lint`: passed, 1,620 files in 3 groups, 0 errors, 0 warnings.
6. `pnpm lint:logs`: 1057 files scanned; every log call uses allowlisted fields.
7. `pnpm lint:copy`: 514 files read; the product copy keeps the brand's words.
8. `pnpm test`, first run: 2 failed | 379 passed (381) files; 2 failed | 6290 passed | 33 skipped (6325) tests. Both failures were this PR's, and both are fixed (see Fixes).
   - Targeted rerun of the 2 files: 207 passed.
   - Full rerun: 381 passed (381) files; 6292 passed | 33 skipped (6325) tests; exit 0 with coverage.
9. `pnpm test:golden`: 5 files, 380 passed (380).
10. `pnpm test:oracle`:
    - pyx12 4.0.0 agrees with all 688 synthetic 835 fixtures (677 valid with identical summaries, 11 malformed and rejected as expected);
    - packages/edi835 agrees with pyx12 on every segment, amount, balance and verdict.
11. `pnpm test:db`, 4 shards one after another as ci.yml runs them. Each shard ran on its own fresh database (phi_suite_shard_N at localhost:5433), created, migrated with pnpm db:migrate and dropped afterwards.
    | Shard | Files | Tests |
    |---|---|---|
    | 1/4 | 32 passed | 3153 passed, 1 skipped (3154) |
    | 2/4 | 32 passed | 2059 passed (2059) |
    | 3/4 | 32 passed | 3094 passed, 1 skipped (3095) |
    | 4/4 | 32 passed | 928 passed (928) |
    | Total | 128 | 9234 passed, 2 skipped |
12. `pnpm build`: exit 0 (web "Compiled successfully in 26.2s"; worker Done).
13. `tools/stryker/affected.ts --event pull_request --base e908c214`, run before and after the commit:
    - money, pricing, ledger and packets: not affected;
    - any=false, packages=[], shards=[];
    - so no shard runs, and the gate passes as mutation.yml's does: "No money path changed: no mutation run."
14. `pnpm check:fixtures`: 341 file(s) read by the guard and 3792 text file(s) searched for an X12 header; every table carries SYNTHSENDER or is pinned, and every interchange is synthetic.
15. `pnpm verify-content`: every content set passes (content/drafts: 10 records, no problems).
16. `tools/engine-freeze/check.ts e908c214`, run before and after the commit: let through by the exception: Nothing; Problems: None.
17. `pnpm actions:check`: not run, because no workflow, manifest or lockfile changed.
18. E2E:
    - `bash /tmp/setup-container.sh co-001/contract-phi-check:/home/user/contract-phi-check` printed OK. Playwright 1.56.1 chromium-1194 is now present in /opt/pw-browsers.
    - After committing, apps/web/.next/BUILD_COMMIT was stamped 9b7eadfe. The build in step 12 is of a tree identical to HEAD.
    - `E2E_PREBUILT=1 pnpm test:e2e --workers=2` with DATABASE_URL=postgres://postgres:test@localhost:5433/postgres: **54 passed (8.1m)**, exit 0. This includes contracts.spec.ts (the drop-before-choosing-a-kind refusal) and models.spec.ts.

## Fixes (this PR's failures, each with a test that fails without it)
- **tools/brand-colors/scan.test.ts failed.** The brand color check read "#120" as a 3-digit hex color in 16 of this PR's source comments.
  - Fix: those comments now cite "combined audit item 120", the form the base already uses (e.g. "combined audit item 135" in registry.ts).
  - Files: model-gateway contract-terms(.test), gateway(.db).test, lint.test, patient-records(.test, .db.test), redact(.test), spec.ts; synth registry, workflow, index, screen/patient-twins.
  - One comment in lint.test.ts was reflowed to stay within 120 columns.
  - The scan test itself is the test.
- **packages/edi835/src/fixtures.test.ts, "zip entries", failed on MOD-12/contract-and-eob.zip** (TypeError reading `zip.entries`). This PR's zip of a contract and an EOB carries no 835 batch expectation, and the test cast every `kind: 'zip'` file to one.
  - Fix: the test now reads only zips that carry a batch expectation.
  - A new case, "reads the zips of 835s the PAR cases name", holds that PAR-27 and PAR-28 are still read, so the filter cannot silently drop them.
  - This file is outside the builders' list but needed for this PR's fixture. It is a test file and not an engine file, and the engine freeze passes.

## Failures not this PR's
None.

## Adaptations from the design
- All 19 are in ADR 0070 Part 3, "Where the build departs from the design": the builders' 17, plus 18 and 19 above.
- The code agent's adaptations: the gateway's event writer is departure 13, refused_rose is kept fail closed (Consequences, the runbook and permitted.ts), and the testing-module guard is 19.
- This run added one: the issue is cited as "combined audit item 120" in source comments. Docs keep "#120", because the brand scan does not read .md.

## Wording a person sees that this PR adds (exact strings)
- **Notices shown on the contract page:**
  - apps/web/src/lib/models/notices.ts:26 (names_patient): "This document names a patient of the practice, so it was not sent to the model. Enter its terms by hand. If it is a payer letter or an EOB, it was filed as the wrong kind."
  - apps/web/src/lib/models/notices.ts:27 (screen_unavailable; also shown for screen_failed): "This document could not be checked for patient details, so it was not sent to the model. Enter its terms by hand."
  - screen_invalid falls to the existing `refused` notice.
- **Upload panel:**
  - apps/web/src/components/uploads/uploader.tsx:87, CHOOSE_KIND_FIRST: "Choose the kind of document first, then choose the files again." It is used at :126 and is shown under the existing "Nothing was uploaded" error.
  - apps/web/src/components/uploads/uploader.tsx:90, CHOOSE_KIND_PLACEHOLDER: "Choose the kind of document". It is rendered at :393.
  - The other batch messages at :122/:130/:136/:138 existed at e908c214 (:179-191). They were moved into `batchProblems`, not added.
- **Error texts of the refusal, InputRefusedError messages.** They are not shown in the UI, which maps codes to the notices above:
  - packages/model-gateway/src/functions/contract-terms.ts:481: "this document names a patient of the practice and was not sent"
  - packages/model-gateway/src/functions/contract-terms.ts:483: "this document could not be checked for patient details and was not sent"
  - packages/model-gateway/src/functions/contract-terms.ts:506: "a contract is sent only with the practice records check the gateway issues"
- **Operator log lines, fixed text**, at packages/model-gateway/src/gateway.ts:287, 290, 293, 296 and 301. Each begins "a model call was refused before it was sent: ...":
  - "its input names a patient of the practice"
  - "its input names more than one patient"
  - "the practice holds more identifiers than the screen reads"
  - "it carried no records check the gateway issued for its practice"
  - "its screen could not read the practice records"
- **Developer-facing ScopeError texts** at packages/model-gateway/src/patient-records.ts:143, 146, 149, 153, 159 and 243. They are fixed sentences with no identifiers.

## Commits (on top of 862c9dc8)
Each message ends with the Co-Authored-By and Claude-Session lines.
- 25be3ab6 model-gateway, web, worker: the parts settled (prepared.user screened, the web's event through recordContractScreenRequested, testing.ts kept to tests, refused_rose fail closed pinned)
- 11ab0b86 docs: ADR 0070 Part 3 ...; ADR 0054's amendment; PRD 14 and 16; reconciliation-001 item 16; the MOD-12 test-matrix row; model-evaluation runbook; MOD-12 assertedBy and expected.json regenerated by pnpm synth --case MOD-12
- 9b7eadfe model-gateway, synth, edi835: comments cite combined audit item 120 (the brand color check read "#120" as hex); the parser's zip-entry test reads only zips of 835s, and PAR-27/PAR-28 are still read

## Pre-push checks (not pushed)
- `gitleaks git --log-opts="e908c214..HEAD"`: 6 commits scanned, no leaks found.
- `.githooks/pre-push origin`, run standalone with the ref line on stdin: "3 commits checked: 0 file(s) read by the fixture guard, 30 text file(s) searched for an X12 header, and gitleaks found no secret." Exit 0.

## Diff stat, e908c214..HEAD
- 57 files changed, 3847 insertions(+), 123 deletions(-). The full list is in /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/logs/diffstat.txt.
- **What the diff holds:**
  - apps/web: the e2e contracts.spec and models.ts, three pages, the uploader and its test, models/*, models-routes and uploads db tests;
  - apps/worker: models/permitted(.db.test);
  - docs: ADRs 0054 and 0070, PRD, reconciliation-001, test-matrix, runbooks/model-evaluation;
  - fixtures/synthetic/MOD-12/*;
  - packages/edi835/src/fixtures.test.ts;
  - packages/model-gateway: eval (gate.golden.test, harness, sets) and src;
  - packages/synth: matrix, registry, workflow, index, screen/patient-twins;
  - tools/screening-capacity/watched-paths.txt.
- **What it does not hold:**
  - no migration;
  - no content/releases;
  - none of #42's non-shared files (no e2e env/mail*/prepare/screening*).
- **Added lines:**
  - no model identifier: the only hits for model-name words are two mentions of "CLAUDE.md";
  - every identifier is synthetic: ZZ-prefixed member IDs, SYNPCN PCNs, 77-prefixed claim numbers, 9-prefixed member IDs, 555 phones, 000xx ZIPs, SYNTHVILLE and SYNTHSENDER.

## Open items
- **Improvements outside this PR's files, named and not made:**
  - eslint.config.js: a no-restricted-imports rule for `@tp/*/testing` outside tests. It would be stronger than lint.test.ts's scan.
  - packages/db scope.ts: a brand (WeakSet) on real scopes, so `practiceRecordsCheck` refuses a hand-built `authorizedBy` or pool.
  - packages/model-gateway/src/permitted.ts: a sentence in permittedRegressions saying that refused:names_patient counts toward refused_rose.
  - The brand color scan could skip `#<digits>` issue references in comments, or the repository could adopt "audit item N" everywhere. As it stands, any 3-, 4-, 6- or 8-digit issue cited as "#NNN" in a .ts file fails it.
  - The MOD-12 row in matrix.ts and the doc drops the design's clause "the upload panel leaves the kind unset". Restoring it and adding uploader.test.tsx, uploads.db.test.ts and e2e/contracts.spec.ts to the registry would cover N4.
  - README's model gateway section could gain a line on the contract screen.
- **Still open from the builders:**
  - the person's event and the screen's reads commit in two transactions (F3 removes this);
  - load failures are traced only as MODEL_INPUT_SCREEN_FAILED;
  - F3 and F4 are Lane A's.
- The status file's handoff "What remains" can now tick the docs and the suite. That file is the orchestrator's.
