# Lane B dependabot-batch, PR A (#90): fresh-clone verification, round 2, of cf124313

Fresh-clone verifier, round 2 (after the description-only fix of round 1's defect D1). Clone: `git clone
--filter=blob:none` of PureTideWater/PhysicalTherapy into `merge-A/verify-r2` (scratchpad), detached at the pull
request's head as GitHub gives it. Read only: nothing pushed, committed, commented, reviewed, approved or marked ready.
Work files: `merge-A/verify-r2-work/` (job logs, the cited capacity runs, merge-tree, the description as read back);
progress `merge-A/progress/verify-r2.progress.md`. 2026-11-02T03:40Z to 03:47Z. This file replaces the round-1
verification of the same head (NOT VERIFIED on defect D1 only).

- **Head:** cf124313d0e0dbf252b0db6c785de47b215ebeaa (unchanged since round 1; `origin/co-001/deps-anthropic-sdk-1`
  is the same). It is "Merge claude/build-platform into co-001/deps-anthropic-sdk-1", with parents 4e70738d and 877e662f.
  GitHub at 03:46:07Z: open, draft, `mergeable_state: clean`, 27 commits, 14 files, +658 -21, body last updated
  03:39:45Z. CI's merge ref 6d9fdba2 (cf124313 into 877e662f) has tree c7d2d26a, the same as the head's tree, so CI
  tested exactly this tree.
- **Base:** `origin/claude/build-platform` 877e662f14d28a2110caec3bdfebdaaca4e2f49c (#93; merge commit dated
  02:42:44Z, API `merged_at` 02:42:45Z). Fetched again at 03:46:07Z (FETCH_HEAD and the branches API agree): unchanged,
  and an ancestor of the head. **baseMoved: false.**
- Round 2 made no commit and no push. `git diff 877e662f cf124313` is still 14 files, +658 -21. None of the three base
  merges (f5664b5b, 4e70738d, cf124313) changes a `package.json`, `pnpm-lock.yaml` or `pnpm-workspace.yaml` against its
  first parent.

## Check runs on cf124313

CI had finished before the verifier started (03:40:49Z), so there was nothing to wait for. Nothing new had started by
03:46:07Z. There are 24 check runs: 22 success, 2 skipped, none failed. Every workflow run is `pull_request`, attempt 1,
success:
- ci 41380933504
- mutation 41380933499
- screening-capacity 41380933648
- approval-of-record, four runs: 41380933582 (the push), and 41382976480, 41384106485 and 41384317127 (started by the
  description edits at 03:24:58Z, 03:37:22Z and 03:39:45Z)

| Check | Conclusion | Verdict line from its log |
| --- | --- | --- |
| **all green** (required), job 125074118041 | success | "all green: every job it needs succeeded (8 jobs)." static, lint, unit, db, domain-model, build, e2e and images each succeeded |
| **mutation** (required), job 125071532039 | success | "changes: success; stryker: skipped; any: false; packages: []; shards: []", then "No money path changed: no mutation run." |
| **screening-capacity gate** (required), job 125076629492 | success | "the capacity measurement passed every check but time, which is advisory here; a release's capacity run holds it binding". It gave two warnings. Time (advisory): S4#1 S4-1 52.2 s and S4#1 S4-3 51.8 s, "fail (allowance: above 48 s on the runner)". Sizing question (O9): "the worst time, S4#1 S4-1's 52.2 s (the middle of S4's three runs), is above 44 s: the consumer's size goes to the founder before merge" |
| **approval-of-record** (required), all four runs: jobs 125071379439, 125077580142, 125081015838, 125081668357 | success ×4 | "This pull request changes neither the approval line of docs/product/domain-model.md nor packages/db/domain-model/approvers.json, so it needs no review of record." Notice: `APPROVAL_REVIEW_REQUIRED` is unset |
| capacity, job 125071419227 | success | S4#1 52.2/45.7/51.8/33.2 s; S4#2 54.2/51.9/53.8/41.4; S4#3 50.3/50.9/51.1/38.5; S5 17.5/17.8/…; "verdict: pass (time advisory)" |
| changes (screening-capacity), job 125071379643 | success | `measure=true`. It lists six watched paths: `packages/model-gateway/package.json`, `src/config.ts`, `src/providers/anthropic.ts`, `packages/synth/src/cases/matrix.ts`, `registry.ts` and `pnpm-lock.yaml` |
| changes (mutation); static; lint; unit; db (1/4) to (4/4); domain model; build; images; e2e (1/2), (2/2) | all success | counts below |
| stryker (`${{ matrix.shard }}`) | skipped | no shard selected; the mutation gate requires `skipped` here |
| notify (screening-capacity) | skipped | |

The four required verdict lines were read with the GitHub MCP `get_job_logs` (return_content; tail 60 to 100 lines).
All 19 job logs were also saved with `gh api .../actions/jobs/<id>/logs`, and none contains `##[error]`. Their only
warnings are:
- build: no AWS credentials, so the stacks were synthesized
- capacity: the two time warnings and O9
- static: pnpm 10.34.9 is newer than `packageManager`, which is not this pull request's

## Counts

These are the same CI runs that round 1 read, so the counts are identical to round 1's, and the difference from round
0 (4e70738d) is unchanged.

| Suite | CI on cf124313 | Against 4e70738d (round 0) |
| --- | --- | --- |
| unit (`pnpm test --coverage`) | 416 files; 7,014 tests: 7,013 passed, 1 skipped. Coverage 67.99 / 65.44 / 62.36 / 68.18 % | +4 files, +34 tests, all from #93's six unit files (round 1's per-file diff). The same skip (`tools/test/workflows.test.ts`, actionlint is absent on CI's unit runner) |
| db (`test:db`, 4 shards) | 131 files (33 + 33 + 33 + 32); 9,306 passed (3,161 + 2,620 + 2,569 + 956), 0 skipped | +2 files, +7 tests, all from #93 (`home-figures.db` 5, `actionable-now.db` 1, `pricing-current-routes` 4 to 5) |
| e2e (2 shards) | 34 + 34 = 68 passed; shard 1's brand-baseline re-check: 4 passed | none |
| golden (`test:golden`, static job) | 5 files, 376 passed | none |
| static, other | synth 275 cases: 0 written, 667 unchanged; 8 EMR formats: 16 unchanged. `check:fixtures` 333 read, 3,926 searched. gitleaks: 23 commits, no leaks. 4 released prompt versions unchanged. oracle (pyx12) agrees on all 687. `pnpm audit --prod` 0; `--audit-level=high` 1 moderate. `toolchain:check` 0 errors, 1 warning; 1 lockfile version added, with the registry's integrity and no weaker trust | +4 synth cases and +14 searched files, from #93's HOM fixtures |

The only difference from round 1 is the number of check runs: 22 then, 24 now (22 success, 2 skipped). The two new runs
are the approval-of-record runs started by round 2's two description edits, and both succeeded.

## What the verifier ran in the clone

All steps ran under one hold of `flock /tmp/laneb-heavy.lock` (03:42:30-03:43:15Z), and `git status --porcelain` was
empty after each.

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | pass; 22 projects; "Lockfile is up to date, resolution step is skipped" |
| `pnpm exec vitest run --project unit packages/model-gateway` | 25 files, 478 passed. This equals round 1, round 0, the full local suite at 442d7a81, and the description |
| `pnpm test:golden` | 5 files, 376 passed (= CI = the description) |
| `pnpm install --lockfile-only` | lockfile unchanged |
| `pnpm synth --all` | 275 cases: 0 written, 667 unchanged, 0 removed; 8 EMR formats: 0 written, 16 unchanged |
| `pnpm exec tsx tools/screening-capacity/watched.ts --write` | 543 lines, unchanged |
| `git merge-tree --write-tree` of cf124313, and of 877e662f, with each of the 12 other open heads (03:43:36Z; `verify-r2-work/merge-tree-verify.txt`) | below |

## Claims in the description, checked

The description was read back with `gh api .../pulls/90` at 03:42Z and again at 03:46Z: 47,365 characters (47,369
bytes), sha256 c8b01e38…. It is byte-identical to the updater's `merge-A/pr-body-r2.md`. Its diff against round 1's
body (`verify-r1-work/body-live.md`) is exactly the six changes the updater lists, and nothing else moved. Claims that
round 1 checked and that did not change still hold: the pull request's diff, the commits, the CI runs and the record
files are all unchanged. Every changed claim was checked again:

| Claim | Checked against | Holds? |
| --- | --- | --- |
| O9: this pull request changes six watched paths (the gateway's `package.json`, `config.ts`, `providers/anthropic.ts`, the synth `matrix.ts` and `registry.ts`, `pnpm-lock.yaml`), CI's changes job lists them, and that is why the gate measured | The changes job's log (`watched:` lines, `measure=true`). The pull request's 14 files matched against `watched-paths.txt` (`*` crosses `/`) give exactly those six; `package.json` matches through `packages/*/package.json` | yes |
| O9: the warning appeared on heads without this change (4eaf7124, d1e4c4c4) and with it (4e70738d), and not on 877e662f, which also lacks it | `git merge-base --is-ancestor 1825913e`: absent from 4eaf7124, d1e4c4c4 and 877e662f; present in 4e70738d and cf124313 | yes |
| O9 numbers. This head: run 41380933648 (03:03-03:21Z), S4#1 52.2, 45.7, 51.8 s (small 33.2), worst 52.2 s, S4-1 and S4-3 time advisory, "pass (time advisory)", gate success. 4e70738d: run 41378497739, S4#3 48.8/51.1/52.0, worst 52.0. 4eaf7124: push run 41376674163, worst 51.8. d1e4c4c4: run 41377178037, worst 54.8. 877e662f: push run 41379177620, S4#1 the middle run, worst 38.4, not raised | Each run's capacity log was fetched again. Each run's head sha was read through the API (4e70738d, 4eaf7124, d1e4c4c4, 877e662f, cf124313). 877e662f's gate has `SIZING` and `TIME_WARNINGS` empty. Its middle run is S4#1, the median of the run worsts 38.4, 36.3 and 39.1 | yes, every number and run |
| O9: issue #41 link; a founder item that blocks the screening's launch, not the merge (the 01:02 UTC ruling) | issue #41 is open: "Revisit before launch: how the free screening's 60-second promise is measured (capacity test, decisions 13-16)"; the ruling as the task gives it | yes |
| Merge order step 1: #93 (877e662f, merged 2026-11-02T02:42:44Z), merged in as cf124313, and still the base at 03:34:53Z | 877e662f's commit date is 02:42:44Z (the API's `merged_at` is 02:42:45Z). The branch tip has been 877e662f since then; it was still 877e662f at 03:41Z and 03:46Z | yes |
| Merge-tree at 03:35:13Z. 13 open with this one: #42, #75, #84, #85, #86, #87, #88, #89, #91, #94, #95, #96. No head moved since 03:22:05Z | The open list at 03:43:36Z: the same 13. Every head sha equals the 03:22:05Z list (`logs-r1/open-prs-2.tsv`) and the 03:35:13Z list | yes |
| Conflicts with this head only. #94 (484e9f06) and #89 (83f04cbd) in `packages/model-gateway/package.json` (lines 16-17, adjacent ranges). #87 (20c180a0) in `pnpm-lock.yaml`. `pnpm-lock.yaml` merges cleanly with #94 | the verifier's merge-tree. #94's conflict hunk is the `@anthropic-ai/sdk` and `@aws-sdk/client-bedrock-runtime` lines. #94 shares the lockfile, and it merges cleanly | yes |
| Conflicts with the base and this head alike, in the same files. #75: the three uploads files. #85: `reconciliation/display.test.tsx`. #86: ADR 0066, `reconciliation-001.md` and `tools/test/workflows.test.ts`. #95: `p/[practiceId]/page.tsx` and `dashboard/queries.ts`. Clean: #42, #84, #88, #91, #96. In all, 3 / 4 / 5 | the verifier's merge-tree, for this head and for the base | yes, file for file |
| #94: 484e9f06, draft, behind the base, 27 check runs: 26 success, 1 skipped | GitHub now (`mergeable_state: behind`; 877e662f is not its ancestor) | yes |
| Shared record files. #42, #75, #84, #85, #95 and #96 edit `test-matrix.md`, `matrix.ts` and `registry.ts`; #91 edits `test-matrix.md` and `matrix.ts`. `README.md` is shared with #95, `model-evaluation.md` with #75, and `pnpm-lock.yaml` with #42 | each pull request's files since its merge base, intersected with this pull request's files | yes |
| Merge order under the 20:36 UTC rule: only #94 orders it | the conflict list | yes |
| "No conflict added" at 03:22:05Z and 03:35:13Z on cf124313 | the 03:22:05Z and 03:35:13Z outputs (`logs-r1/merge-tree-r1b.txt`, `logs-r2/merge-tree-r2.txt`) and the verifier's 03:43:36Z run agree | yes |
| Checks: "At 2026-11-02T03:34:53Z the base was still 877e662f, an ancestor of this head: no further merge, so nothing further was re-run and nothing was pushed" | the base fetch; the branch is still cf124313 (pushed in round 1); `recheck-r2.md` | yes |
| Checks: "CI on cf124313: 22 check runs, 20 success and 2 skipped (the stryker shard … and notify), none failed" | the check-runs API | yes as of 03:34:53Z, the time the paragraph states. See the note below |
| Re-check table on cf124313: install 22 projects; synth 275 / 0 / 667, 16 EMR; watched 543; verify-content; check:fixtures 333 / 3,926; typecheck 22; lint 1,700, 0 / 0; unit 44 files 721 passed; `affected.ts` no shard | the updater's logs (`merge-A/logs-r1/`, unchanged); the clone's install, synth and watched; CI's static job (the same synth and fixture numbers) and mutation job (`any: false`) | yes |
| Gate results: golden 5 / 376; gateway unit 25 files / 478 | the clone | yes |
| Findings table: the new D1 row (the O9 item's two phrases; job 125071379643 lists six watched paths, `config.ts` and `providers/anthropic.ts` among them; the fix is the description) and the Reviewer section's sentence about D1 | round 1's record (defect 1); CI's changes job; this description | yes |
| Findings table: every commit named exists and does what its row says | All 32 eight-hex shas in the body resolve. All of this branch's are ancestors of cf124313. The only non-ancestors are other pull requests' heads: #87 20c180a0, #94 484e9f06, #89 83f04cbd, #88 f69063f0. The rows other than D1 are unchanged from round 1, which checked them | yes |
| Template sections, markers and footer | Eight `##` sections in the template's order (What changes, Why, What it does not change, Checks, Reviewer agents' findings, Freeze exception, Domain model, The founder's approval). The required-checks sentence and its markers are byte-equal to `.github/pull_request_template.md` at 877e662f (unchanged at the head). The approval section begins with the template's text and is followed only by the footer. The footer is exactly the emoji line, a blank line and the session URL | yes |
| No model name or identifier | The body's only hits are the mandated footer and the phrase "model id" (generic). The diff's added lines have none. The 27 commit messages have none outside the mandated trailer, and each ends with a blank line and exactly the two required lines | yes |

**Note (not a defect).** The Checks paragraph's count, "22 check runs, 20 success and 2 skipped", was true at
03:34:53Z, the time that paragraph states. It now reads 24 runs (22 success, 2 skipped) because each description edit
starts an approval-of-record run. Round 2's two edits (03:37:22Z, 03:39:45Z) started 41384106485 and 41384317127, and
both succeeded. A description cannot hold a live count of these runs, since editing it adds one. "None failed" and
every required check's state still hold.

## Defects

None. Round 1's D1 is fixed. The O9 item now names the six watched paths, says why the gate measured, and says the
warning appeared on heads with and without the change but not on 877e662f. "With the same consumer code" now reads "on
heads with and without this pull request's change". The fix took no commit and no push, and the approval-of-record
re-runs it started are green.

## Verdict

**VERIFIED.**
- The head cf124313 contains the current base, 877e662f (unchanged at 03:46:07Z; baseMoved false), and CI tested its
  own tree.
- All four required checks are green on this head. all green covers 8 jobs. mutation selected no shard. The
  screening-capacity gate passed with time advisory and raised O9, which is a launch item under the 01:02 UTC ruling.
  approval-of-record passed all four runs.
- The clone checks pass: frozen install, gateway unit 25 / 478, golden 5 / 376. The lockfile-only install, `synth --all`
  and `watched.ts --write` leave git clean.
- The description reads back byte-identical to the updater's file. Every factual claim checked holds, including the
  conflict list, which was re-run at 03:43:36Z.

Before the merge, the merge rule still applies:
- Mark it ready.
- Confirm the approval-of-record re-run.
- Re-run the merge-tree checks against the then-current heads.
- Merge with `expectedHeadSha` cf124313d0e0dbf252b0db6c785de47b215ebeaa.

The only order is against #94, which is still draft and behind the base.

Verifier: fresh clone, 2026-11-02T03:40Z to 03:47Z. At 03:46:07Z #90 was cf124313, draft, `clean`, on base 877e662f.
The clone was removed afterwards. Not committed.
