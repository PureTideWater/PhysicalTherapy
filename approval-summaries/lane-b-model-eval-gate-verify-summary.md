# PR #53 fresh-clone verification (co-001/model-eval-gate @ f8e0bb17)

I could not write `/tmp/claude-0/-home-user-PhysicalTherapy/d485e7a2-2267-518e-ad2a-69386433675d/scratchpad/meg/verify/summary.md`. The tool refused it because subagents may not write report files, so the full summary is below instead.

## Verdict: FAIL (description only; the code, tests and CI pass)

The code is ready to merge. CI is green on f8e0bb17, every required check included. All local checks pass, every fixed finding is in the code and has a test, and the forbidden paths are untouched. The PR still fails on two counts:
- the description makes false or stale claims;
- the PR touches one file of PR #42 outside the allowed list.

None of the fixes needs a commit. They are all edits to the description, plus one ruling to record. Editing the description does not dismiss a review or rerun CI.

### What must change
1. **False claim: the fault `swapRows` does not exist.** The fault is `swappedRows` (`packages/model-gateway/eval/faults.ts:187`; the test is at `eval/gate.golden.test.ts:472`). Rename it in the "New faults" bullet.
2. **Stale claim: "Wrong but verified is wrong plus extra"** (the "What the gate counts" bullet). The code counts `wrongVerified` as wrong + extra + widened (`src/tally.ts:41`). This bullet contradicts the description's own review section ("counted as `widened`, inside wrong-but-verified").
3. **Overstated claim: "Each fault fails the gate with its own problem code."** Several faults fail the gate with the same codes:
   - `swappedRows` and `crossRowQuote` both fail only with `regressed('amount')`, that is recall_regressed or precision_regressed on amount (`gate.golden.test.ts:473, 484`). Their `not_in_row` is a verifier rejection, not a gate problem code.
   - `dropDecoy` and `unpairConflict` both end on `conflict_unflagged`.
   Reword it to say "each fails the gate with the problem codes its test names".
4. **Incomplete list: the "New faults" bullet leaves out three faults the PR adds.** They are `dropScope`, `labelInjection` and `mergeRowsSpanning` (`faults.ts`). The first two appear only in the review table, and `mergeRowsSpanning` (review n3) appears nowhere by name.
5. **Stale section: "CI on the earlier head 3791fec2".** Report CI on f8e0bb17 instead. Every check succeeded, and `images` passed on its first run (no Trivy 404).
6. **Boundary: one file of PR #42 outside the allowed list.** `infra/test/compute.test.ts` is outside the allowed set. The change is one line, at about line 570: the permitted-cli assertion now expects `readGatewayConfig(process.env, { serving: 'evaluable' })`. PR #42 edits other hunks of the file (lines 264, 367, 393 and 661). `git merge-tree` of f8e0bb17 with PR #42's head 13f59b12 auto-merges this file cleanly. The change is needed, because the test pins this PR's own source. But neither the description nor the design's Session rulings (only ruling 2, `watched-paths.txt`) declares the overlap. Either the description should name it under "What it does not change" as a non-conflicting shared file, or the orchestrator should rule on it.

Optional: the "Checks" table could add a row with the CI totals on f8e0bb17 (below).

## Evidence, check by check

### 1. Fresh clone
- **Location:** `/tmp/claude-0/-home-user-PhysicalTherapy/d485e7a2-2267-518e-ad2a-69386433675d/scratchpad/meg/verify-clone`, freshly cloned and checked out detached at f8e0bb175fff6a18df34e506f45f2e32108d10c2.
- **Branch has not moved:** `git ls-remote` shows `co-001/model-eval-gate` at f8e0bb17, so this is still the head.
- **Base:** `claude/build-platform` is at 7ef421be, which is also the merge base, so the branch is up to date with its base. The PR is 12 commits ahead.
- **Install:** `pnpm install --frozen-lockfile` exited 0.

### 2. Claims in the description, checked against the clone
Every claim not listed under "What must change" holds:
- **Formats:**
  - baseline `tp-model-eval-baseline/4` (`src/baseline-format.ts:26`);
  - report `tp-model-eval-report/3` (`eval/harness.ts:44`);
  - correction `tp-eval-correction/2`;
  - permitted report `/2`.
- **Tally:** `src/tally.ts` has `tp`, `wrong`, `extra`, `rejected`, `rejected_right`, `rejected_extra`, `missed` and `widened`. Both `eval/score.ts` and `src/permitted.ts` import it.
- **Problem codes are all present in the code:**
  - `wrong_verified_rose`, `wrong_verified_on_faithful`, `wrong_verified_above_reference`;
  - `conflict_unflagged`, `twin_differs`, `twin_canary`, `twin_incomplete`;
  - `recall_below_floor`, `precision_below_floor`, `floor_unset`;
  - `set_changed`, `new_set_with_change`, `incomplete_report`, `spliced_report`, `unmeasured_cases`;
  - `not_in_row`, `not_evaluated`, `SCOPE_UNSTATED`, `report_inconsistent`;
  - `against_*` and `serving_invalid`.
- **Other faults named in the description exist and are tested:** `crossRowQuote`, `mergeRows`, `flipFlag`, `wrongMethod`, `wrongDate`, `amendedOnOriginal`, `takeStruck`, `obeyInjection`, `quoteInjection`, `dropDecoy`, `failTwin` and `unpairConflict`.
- **Wording strings:**
  - The `not_evaluated` notice is word for word in `apps/web/src/lib/models/notices.ts`.
  - "the value is not on its codes' row" is in `components/models/display.tsx`.
  - The five "Not stated: …" rows are built from `display.tsx:79-83` plus the "Not stated: " prefix at line 134, and `display.test.tsx` checks them.
- **CODEOWNERS:** 9 new lines for the founder: baseline.json, floors.json, reports/, config/models.json, evaluated.ts, baseline-format.ts, floors-format.ts, eval/baseline.ts and eval/floors.ts. `tools/test/codeowners.test.ts` holds them. `pinned-tables.json` pins V02's `exhibit.csv`; its sha256 c8b354e1… matches and the file has 40 code rows.
- **Set v2:** `set.json` is `tp-eval-contract-set/2` with 63 cases:
  - 40 C cases from v1. Only their `truth.json` changed (now `tp-eval-contract/2`) plus MOD-01's `expected.json`; no document bytes changed.
  - 18 V cases, V01 to V18.
  - 5 L cases, generated into the git-ignored `MOD-09/generated/`, pinned by hash and written by rename. They run to 80/80/80/40/40 pages, and L05 has 60 records.
  - Unfaithful cases: V05, V07, V08, V09 and V13.
  - The eval reports 9 conflict pairs and 3 twins.
  - Every NPI is in the 99 range and every TIN starts `00-` (S2).
- **Test matrix:** rows MOD-07 to MOD-11 are present, and there is no MOD-12. `matrix.ts` (lines 293-315) and `registry.ts` (lines 460-469) have the matching entries, and every `assertedBy` file exists.
- **ADRs:** ADR 0070 has Parts 1 and 2, with Part 3 reserved. ADRs 0051, 0052 and 0054 are amended. ADR 0070 Part 2 records that `assertEvaluated`, `unevaluatedModels`, `EVALUATED_PURPOSES` and `MissingEvaluation` were removed. They are absent from the tree, and on the base their only non-test caller was `config.ts`.
- **Runbook:** `docs/runbooks/model-evaluation.md`. Its flags (`--provider`, `--variant`, `--only`, `--report`, `--record`, `--new-set`, `--against`, `record-permitted`) match `eval/cli.ts`.
- **Other documents:** reconciliation-001 item 16 is amended; PRD 14 and 18 and the README are changed.
- **Oracle:** `tools/test-oracle/compare.ts` skips oracle-less generated files, and a test covers it.
- **Baseline:** `baseline.json` has two local entries naming report 0b130094…, whose file hash matches. Every floor in `floors.json` is null. The recompute test is at `gate.golden.test.ts:295`. The old-counts demonstration is at `gate.golden.test.ts:622` and `score.test.ts:345`.
- **Base merge:** the diff from 75954972 to f8e0bb17 is exactly PR #54's content (26 files). This supports "tree identical apart from the base merge of #54".

### 3. Boundaries
- **Size:** `git diff --stat origin/claude/build-platform...f8e0bb17` shows 170 files, +31,347 / -1,369.
- **Forbidden paths:** nothing changed under `content/releases`, `fixtures/golden`, `fixtures/synthetic/rules`, `packages/db/migrations`, `packages/pricing/src` or `packages/ledger/src`. `content/` as a whole is unchanged.
- **Overlap with PR #42** (open; head 13f59b12; 143 files):
  - Allowed: `test-matrix.md`, `reconciliation-001.md`, `matrix.ts`, `registry.ts` and `watched-paths.txt`.
  - Outside the list: `infra/test/compute.test.ts` (must-change item 6).
  - The only conflict in a trial merge-tree of PR #53 with PR #42 is `apps/worker/src/screening/consumer.db.test.ts`. PR #53 does not touch that file; the conflict is between the base and PR #42.
- **No model names or identifiers:**
  - Searched all 29,326 added lines for model family names and id patterns. The only model id is `local-deterministic`.
  - The "claude" hits are CLAUDE.md, `.claude` and the `claude/build-platform` branch name.
  - None of the added PDFs contains one either.
- **Fixtures are synthetic:** `pnpm check:fixtures` passed (266 guard files, 3,235 text files searched).

### 4. Local runs (all under flock /tmp/laneb-heavy.lock)
| Check | Result |
|---|---|
| `pnpm typecheck` | passed, 22 projects |
| `pnpm test:golden` | 4 files, 221 passed (21.1 s) |
| `pnpm --filter @tp/model-gateway eval` | `gate: passed` on the committed baseline: 63 documents; faithful cases tp 2,339 with wrong, extra, widened and rejected all 0; 9 conflict pairs, none unflagged; 3 twins, none differing; narratives 300/300 |
| `pnpm synth --all` | 0 written, 533 unchanged, 0 removed (EMR: 16 unchanged); `git status` clean |
| `watched.ts --write` | 517 lines; `watched-paths.txt` unchanged (`git status` clean) |
| `engine-freeze/check.ts 7ef421be` (PR_NUMBER=53) | Problems: None; let through by the exception: Nothing |
| `pnpm verify-content` | every content set passes |

### 5. Findings the description marks fixed
Each one is confirmed in the code and covered by a test that was read. Tests run:
- the 13 files for B1, M1, M2, M3 and S1 (record-permitted, gateway, tally, score, contract-terms, permitted, config, baseline-format, floors-format, evaluated, display.test.tsx, worker permitted and permitted-serving): 206 tests passed;
- eval.test, codeowners, oracle compare, watched, env and infra compute: 6 files, 172 passed;
- the golden suite: 221 passed.

| Finding | Fix in the code | Test |
|---|---|---|
| B1 | `baseline.served` history; `servedBefore` (`eval/baseline.ts:616-617`) | `record-permitted.test.ts:142` |
| M1 | `againstProblems` (`baseline.ts:511`): `against_is_report`, `same_run`, `provider`, `not_production`, `not_served` | `record-permitted.test.ts:156` |
| M2 | `widened` in the tally; `SCOPE_UNSTATED` in contract-terms; "Not stated" rows on the screen | tally, score, contract-terms, display and permitted tests, and the golden `dropScope` test (line 506) |
| M3 | each variant tallied and recorded on its own examples | `record-permitted.test.ts:188` |
| S1 | allowlist of measured outcomes | `record-permitted.test.ts:210`, `refused:phi_boundary` included |
| m1 | `unmeasured_cases` | score and golden tests |
| m2 | `labelInjection` | golden test |
| m4 | duplicate entries refused | baseline-format and evaluated tests |
| n1 to n4 | covered as the dispositions describe | golden, score and tally tests |
| N1 | `serving_invalid` at `gateway.ts:142` | covered |
| N3 | `report_inconsistent` | `record-permitted.test.ts:118` |
| N4 | a zero-example report must be a production run | `record-permitted.test.ts:92` |
| S2 | synthetic NPIs and TINs | `eval.test.ts:382` |
| S3 | CODEOWNERS lines | `codeowners.test` |
| m3, S3 (refuted) | no change needed | — |

### 6. CI on f8e0bb17 (22 check runs, all completed)
- **Success:**
  - all green, mutation, screening-capacity gate;
  - approval-of-record (2 runs);
  - static, lint, unit, db 1/4 to 4/4;
  - build, domain model, images, capacity;
  - e2e 1/2 and 2/2, changes (2 runs).
- **Skipped:** notify, and stryker (matrix): no money path changed.
- **Failed:** none.
- **Required checks:** all green, mutation, screening-capacity gate and approval-of-record are all success.

How the job logs were read: `gh api …/jobs/<id>/logs` is refused at its storage redirect (403 through the proxy), so they were read through the GitHub connector's job-log reader instead.

| Suite | CI on f8e0bb17 | Description (local) | Difference and why |
|---|---|---|---|
| unit | 335 files, 5,233 passed, 1 skipped (5,234) | after #54: 335 files, 5,231 passed, 3 skipped | Same 5,234 tests. Two tests that use Chromium (`it.skipIf(!chromiumInstalled())`) were skipped locally and run in CI, which installs Playwright's browsers. |
| golden (static job) | 4 files, 221 passed | 4 files, 221 passed | none |
| db (sum of 4 shards) | 30+30+30+30 = 120 files; 3,097 + 2,578 + 2,501 + 898 = 9,074 passed, 1 skipped | 119 files, 9,071 passed, 1 skipped (at 75954972) | +1 file and +3 tests, from #54's new `apps/web/src/lib/routes/defaults-routes.db.test.ts` (3 tests, in shard 4). The local db run predates the #54 merge. |
| e2e | 26 + 25 = 51 passed | 51 passed | none |

Progress log: `/tmp/claude-0/-home-user-PhysicalTherapy/d485e7a2-2267-518e-ad2a-69386433675d/scratchpad/meg/progress/verify.md`. Logs: `/tmp/claude-0/-home-user-PhysicalTherapy/d485e7a2-2267-518e-ad2a-69386433675d/scratchpad/meg/verify/`.