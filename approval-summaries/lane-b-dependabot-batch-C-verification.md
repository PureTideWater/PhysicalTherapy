# Lane B dependabot-batch, PR C (#91): fresh-clone verification, round 2, of 07b5382b

Fresh-clone verifier, round 2. I made a `git clone --filter=blob:none` of PureTideWater/PhysicalTherapy into
`merge-C/verify-r2` (scratchpad) and detached it at the pull request's head as GitHub gives it. The verification was
read only: nothing was pushed, committed, commented, reviewed, approved, edited or marked ready on GitHub. Work files
are in `merge-C/verify-r2-work/`: job logs, the base's capacity logs, merge-tree, the routing check, the description as
read back, the AWS resolver's output and a copy of round 1's record (`verification-r1-record.md`). Progress is in
`merge-C/progress/verify-r2.progress.md`. The verification ran 2026-11-02T10:13Z to 10:20Z.

Round 1 (09:50Z to 10:04Z, same head) found one defect, D1, in the description only: the "This head" column read
"Running", the O9 paragraph gave 651f8b80's numbers, and two nits (push time 09:45:01Z, #86's fix-round head
a5bc1170). The updater's round 2 edited the description at 10:11:59Z, with no commit and no push. This round checks
that edit, re-reads CI, re-runs the clone checks and re-checks every claim that can change with time.

- **Head:** 07b5382b0c87c34f21fe057554d2bb85d94c9a73, unchanged since round 1. "Merge claude/build-platform into
  co-001/dependabot-group-routing", parents b1fd5df1 and 2affb854; tree c8571f81.
  - GitHub at 10:18Z: open, draft, `mergeable_state: clean`, 25 commits, 7 files, +313 -31. Body 51,452 characters,
    last updated 10:11:59Z, unchanged between my reads at 10:14Z and 10:18Z.
  - The merge ref is c0505476; its tree is the head's tree c8571f81, so CI tested exactly this tree.
  - GitHub's activity API: the branch's last push is `651f8b80..07b5382b` at 2026-11-02T09:45:03Z. Nothing since.
- **Base:** `origin/claude/build-platform` 2affb854bed69724508a0ca2171cba6c962134e9 (#95's merge, on #42's 22789493).
  - Fetched at 10:18:33Z. FETCH_HEAD and the branches API agree. It is an ancestor of the head. **baseMoved: false.**
- `git diff 2affb854 07b5382b`: 7 files, +313 -31 (`.github/dependabot.yml`, ADR 0066, `test-matrix.md`,
  `dependency-upgrades.md`, `fixtures/synthetic/CI-12/expected.json`, synth `matrix.ts`,
  `tools/test/dependabot-config.test.ts`). No manifest, lockfile or workspace file.

## Check runs on 07b5382b

The background poll (every 60 s, up to 90 minutes) found CI already complete at 10:13:42Z: **23 check runs, 21 success,
2 skipped, none failed, none in progress.** Every workflow run is attempt 1.

These are the same 22 check runs round 1 read, with the same IDs and conclusions, plus one new run. The description
edit at 10:11:59Z started approval-of-record run 41426856386 (job 125215440540, event `pull_request`), which ran
10:12:07-10:12:26Z and succeeded.

| Check | Conclusion | Verdict line from its log |
| --- | --- | --- |
| **all green** (required), job 125207724048 | success | "all green: every job it needs succeeded (8 jobs)." The needs table lists static, lint, unit, db, domain-model, build, e2e and images, each success |
| **mutation** (required), job 125203793315 | success | "changes: success; stryker: skipped; any: false; packages: []; shards: []", then "No money path changed: no mutation run." |
| **screening-capacity gate** (required), job 125210117320 | success | env `CHANGES: success`, `MEASURE: true`, `CAPACITY: success`, `SIZING:` empty, `TIME_WARNINGS:` empty; "the capacity measurement passed every check but time, which is advisory here; a release's capacity run holds it binding". No warning was emitted |
| **approval-of-record** (required), job 125215440540 (the description edit), and jobs 125203462564 (push) and 125204939017 (round 1's edit) | success ×3 | "This pull request changes neither the approval line of docs/product/domain-model.md nor packages/db/domain-model/approvers.json, so it needs no review of record." Notice: `APPROVAL_REVIEW_REQUIRED` is unset |
| capacity, job 125203531616 | success | "verdict: pass (time advisory)". "S4 ran three times …: S4#1 42.0, 41.2, 42.0 and 31.6 s; S4#2 40.7, 39.9, 40.7 and 29.1 s; S4#3 38.8, 41.1, 40.3 and 28.7 s. Ordered by each run's worst upload …, the middle run is S4#3 (41.1 s)". No time-warning or sizing line, and 0 `##[warning]` lines |
| changes (screening-capacity) 125203462392 | success | `measure=true`; "watched: packages/synth/src/cases/matrix.ts" |
| changes (mutation) 125203462871; static 125203463377; lint 125203463576; unit 125203463251; db 1/4 to 4/4 125203463578, 125203463840, 125203463663, 125203463606; domain model 125203463562; build 125203463540; images 125203463510; e2e 1/2 125204054002, 2/2 125204054056 | all success | counts below |
| stryker (`${{ matrix.shard }}`) 125203795833 | skipped | no shard selected; the mutation gate requires `skipped` here |
| notify (screening-capacity) 125210119972 | skipped | |

I read the four required verdicts with the GitHub MCP `get_job_logs` (return_content, tail 60 to 80). I also saved all 21
non-skipped job logs with `gh api .../actions/jobs/<id>/logs` (`verify-r2-work/jobs/`). None contains `##[error]`. The
only `##[warning]` lines are the two round 1 recorded:
- build: no usable AWS credentials, so every stack was synthesized
- static: pnpm 10.34.9 is newer than `packageManager` 10.34.8, the base's pin

Domain model: the document matches the schema at `20261107090000_mail_streams.sql`, and the 375 function names, and
it carries an approval for this text. GitHub's Dependabot config file validation has no check suite on this head.
`git diff 651f8b80 07b5382b -- .github/dependabot.yml` is empty, and on 651f8b80 check run 124939537364 passed.

## Counts

| Suite | CI on 07b5382b (from the logs) |
| --- | --- |
| unit | 430 files; 7,292 tests: 7,291 passed, 1 skipped. Statements 67.62 %, lines 67.8 %. `dependabot-config.test.ts` 10 tests |
| db (4 shards) | 35 + 35 + 35 + 34 = 139 files; 3,219 + 2,787 + 2,666 + 977 = 9,649 passed, 0 skipped |
| e2e (2 shards) | 35 + 35 = 70 passed; shard 1's brand re-check 4 passed |
| golden (static) | 5 files, 376 passed |
| static, other | oracle: pyx12 4.0.1 agrees with all 688 (677 valid, 11 malformed), and edi835 agrees with it. synth 287 cases: 0 written, 680 unchanged; 8 EMR formats, 16 unchanged. `check:fixtures` 334 read, 4,026 searched. gitleaks: 22 commits, no leaks. 4 released prompt versions unchanged. `pnpm audit --prod`: none; `--audit-level=high`: 1 found (moderate). `toolchain:check`: passed, 0 errors, 1 warning; the lockfile adds no version. Licences 188 packages. lint:logs 1,114 files |
| lint | 1,745 files in 3 groups, 0 errors, 0 warnings |

**Difference from the previous verification: none.** Round 1 read the same jobs (same job IDs, attempt 1), and every count
is identical. The only change in CI is the third approval-of-record run, which the description edit started; it
succeeded. Round 1's comparisons still stand: against the base 2affb854's own push CI the head differs only by +3 unit
tests (CI-12 has 7 tests at the base and 10 here), and the differences from b1fd5df1's local suite and from 651f8b80
are #42's, #95's and the earlier base moves.

## What the verifier ran in the clone

All steps ran under one hold of `flock /tmp/laneb-heavy.lock`, 10:15:20-10:15:30Z. I waited 10:13:48-10:15:20Z while
B's base-capacity run held the lock. Each step exited 0, and `git status --porcelain` was empty after each. There were 0
untracked files at the end.

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | all 22 workspace projects; "Lockfile is up to date, resolution step is skipped"; 502 packages, reused from the store |
| `pnpm exec vitest run --project unit tools/test/dependabot-config.test.ts` | 1 file, **10 passed**, each of the ten CI-12 cases by name |
| `pnpm install --lockfile-only` | all 22 projects; the lockfile unchanged |
| `pnpm synth --all` | 287 cases: 0 written, 680 unchanged, 0 removed; 8 EMR formats: 0 written, 16 unchanged |
| `pnpm exec tsx tools/screening-capacity/watched.ts --write` | `watched-paths.txt`: 551 lines, unchanged |
| The independent routing check (`verify-r2-work/scripts/routes.py`, round 1's Python port, run with `/usr/bin/python3 -I` because the CI Python lacks PyYAML) | 65 direct names over 22 manifests and the catalog, each in exactly its first-match group: browser-tests 3, anthropic-sdk 1, pg-boss 1, next 2, aws-sdk 10, aws-cdk 3, minor-and-patch 45. Byte-identical to round 1's output |
| `git merge-tree --write-tree --name-only` of 07b5382b, and of 2affb854, with each open pull request's head and both fix-round branches (10:16:51Z, `verify-r2-work/merge-tree-verify.txt`) | below |
| `python3 -I fix-C/tmp/aws-rule/resolve-aws.py` on the conflicted runbook of 07b5382b × 484e9f06 | exit 0; "8 lines from #94's 5 and #91's 6". The output is byte-identical to `merge-C/logs/runbook-resolved-94-484e9f06.md`, and its AWS bullet equals the description's 8-line bullet |

## Claims in the description, checked

I read the description back with `gh api .../pulls/91 --jq .body` at 10:14Z and 10:18Z. Both reads are identical, and
equal to `merge-C/pr-body-r2.md` plus gh's one trailing newline. The stored body is 51,452 characters (51,483 bytes;
`pr-body-r2.md` sha256 6a2ca72f…). `diff pr-body-r1.md pr-body-r2.md` has 14 hunks (`verify-r2-work/body-r1-r2.diff`),
all in the places D1 named or in time stamps the refresh moved. I did not re-read the body through the connector: the
gh read is of the same stored body.

### The round-2 changes

| Claim (changed text) | Checked against | Holds? |
| --- | --- | --- |
| D1a. The "This head" column, all 11 cells: unit 430 files, 7,291, 1 skipped (125203463251); golden 5 / 376 (125203463377); oracle 688, pyx12 4.0.1; db 3,219 / 2,787 / 2,666 / 977, 139 files (job IDs in shard order); build 125203463540; e2e 35 and 4 (125204054002), 35 (125204054056); licences 188; lint 1,745, 0 / 0, lint:logs 1,114; mutation "No money path changed" (125203793315); capacity 125203531616, gate 125210117320, run 41423203420, with the three S4 runs' 12 times and "middle run S4#3, worst 41.1 s, below the 44 s line"; dependabot.yml not run on this head, the file identical to 651f8b80's | the saved job logs, value for value; the job IDs against the check-run list; `git diff 651f8b80 07b5382b -- .github/dependabot.yml` (empty) | yes |
| D1a. The CI paragraph: "pushed 2026-11-02T09:45:03Z by GitHub's activity record; runs 41423203365, 41423203367 and 41423203420: done at 10:00:26Z, all green. 22 check runs: 20 succeeded and 2 were skipped …; none failed. … the merge ref c0505476 has the head's tree, c8571f81" | the activity API (09:45:03Z); the latest completion among those 22 check runs is 10:00:26Z (the gate); the merge ref's tree | yes. Now 23 check runs: the 23rd is the approval-of-record that this edit started, and it succeeded (N1 below) |
| D1b. The O9 paragraph: this head raised no sizing question, S4#3 worst 41.1 s, below 44 s, gate outputs empty. It was raised on 651f8b80 (S4#1, 52.7 s) and on the base 2affb854 (push run 41415623520, S4#3, 54.8 s). 52.3 s on bce57f16 and 37.1 s on 43565235 mean runner noise. The 01:02 and 02:35 UTC rulings; issue #41; it blocks the screening's launch, not this merge | the head's capacity and gate logs. The base run 41415623520 (push, 2affb854): capacity 125178692631 "the middle run is S4#3 (54.8 s)" and "sizing question for the founder (O9): the worst time, S4#3 S4-3's 54.8 s … is above 44 s"; gate 125185914785 with `SIZING` set. The 651f8b80, bce57f16 and 43565235 figures are unchanged text that round 1 checked. Issue #41 is open, "Revisit before launch: how the free screening's 60-second promise is measured …". The status file has the 01:02 UTC ruling at line 33 | yes |
| "What waits on a person": "This head raised no sizing question (S4's middle run, worst 41.1 s); the previous head 651f8b80 and the base 2affb854 did" | as above | yes |
| D1c. "Against #86's fix-round head 5c01f150 (`co-001/wip-ci-images-digest`, pushed 09:21:08Z) … the merge is clean" | activity API: `a5bc1170 → 5c01f150` at 2026-11-02T09:21:08Z, still the branch head; merge-tree of 5c01f150 with the head and with the base: clean | yes |
| The Dependabot read at 10:07Z: #98 (18 updates) is the one open bot pull request; #97 closed 07:42:39Z; "#95's merge (08:47:25Z) had started no run by 10:07Z" | the dynamic runs since 07:30Z: only 41407378320 (07:36:20Z, head 22789493), none later, as of 10:18Z. #98 is open at c61e910b (opened 07:45:01Z, last updated 07:45:05Z). #97 closed 07:42:39Z | yes |
| "at 10:05Z #94 was a draft at 484e9f06" | #94 is still a draft at 484e9f06, last updated 2026-11-01T20:48:27Z | yes |
| The exact conflict list (merge-tree at 10:06:01Z; seven other pull requests open at 10:05:36Z, each at its 09:45Z head). The head adds a conflict only with #94 (484e9f06), in the runbook's AWS bullet, and #94 also conflicts with the base in `apps/web/package.json`, `apps/worker/package.json`, `packages/model-gateway/package.json` and `pnpm-lock.yaml`. #75 (871faff9), #85 (a97d6011) and #86 (83167b8f) conflict only where the base does. #84 (e3299ea2), #96 (50029e64) and #98 (c61e910b) are clean | the open list at 10:16:40Z: the same seven, same heads as `logs/open-prs-r1b.tsv` (09:45Z) and `logs/open-prs-r2.tsv` (10:05:36Z). My merge-tree at 10:16:51Z matches the updater's `logs/r2-merge-tree.log` file for file, for all nine refs (also #94's fix branch f43f809d: the runbook plus the base's `apps/web`, `apps/worker` and lockfile). The runbook has one conflict hunk, identical to round 1's apart from the marker label | yes |
| The resolved AWS bullet: "#94's head was unchanged at 10:05Z, and the verification's own run of the resolver on it gave the same bytes" | the resolver run again on this round's conflicted file: byte-identical output; the bullet equals the description's | yes |
| The re-check note: "At 10:05Z the base was still 2affb854, already in this head, so there was no further merge and nothing to re-run; the conflict list was refreshed (`merge-C/recheck-r2.md`)" | the base at 10:18:33Z is still 2affb854; `recheck-r2.md` exists and says so | yes |
| The verification paragraph: "(2026-11-02 09:50Z to 10:04Z) found every required check green, its own checks passing and one defect, in this description only (D1) …; All four are corrected in this text, with no commit" | round 1's record (copy at `verify-r2-work/verification-r1-record.md`); the four corrections, above; no new commit on the branch | yes |
| `merge-tree` row of the re-check table (10:06:01Z) | as above | yes |

### Claims unchanged since round 1, re-checked on the same tree

| Claim | Checked against | Holds? |
| --- | --- | --- |
| The diff: the 13 patterns on `minor-and-patch`, the ADR amendment and its Status entry, CI-12, the test-matrix row, synth and `expected.json`; no manifest or lockfile | `git diff --stat` and `--name-only`; `synth --all` writes 0 files; CI-12 10 / 10 in the clone | yes |
| Evidence: 65 names on this head (#90's `@opentelemetry/api` to m&p 45; #42's `@aws-sdk/client-sqs` to aws-sdk 10). The 20-row table and the list of 45 | the routing check: each of the 20 table rows' "this head" group matches; the list of 45 equals the routed `minor-and-patch` set; table and list cover all 65 names | yes |
| Findings tables: every commit named exists and does what its row says | All 25 commits of `2affb854..07b5382b` resolve, and so do the named commits outside it: 03d497fb and f5acf30b are in the head via the base, and 0f60ae43 and a84a498b are the earlier base merges. Each subject names its row's finding (for example 42a3eb66 "pin that a security-updates group never contests a dependency (check N1)", 833705ef "ADR 0066 header: Part 2's entry names the 2026-11-01 amendment …", b1fd5df1 "… print the empty group's name and the existing pull requests (check N3)"), and each touches the file its row names | yes |
| Commit messages | all 25 end, in the raw commit object, with a blank line and exactly the two required lines, each once | yes |
| Template sections, markers, footer | eight `##` sections in the template's order. The required-checks sentence and its markers are byte-equal to `.github/pull_request_template.md`, which is unchanged base to head. The approval section is the template's paragraph followed only by the footer. The body ends with exactly the emoji line, a blank line and the session URL | yes |
| No model name or identifier | body: only the mandated footer ("Claude Code", `claude-code` in its URL), plus branch names and the `.claude/agents/` path; diff `+` lines: none; commit messages: only the trailer | yes |
| Merge order: the 2026-11-01 20:36 UTC rule with its 2026-11-02 08:52 UTC update (no wait for #86; the 2026-11-04 12:00 UTC guard moot) | the status file on `claude/build-ops` (fetched 10:18Z) is unchanged since ebd6387b (08:51:20Z). Line 52: "C (#91) no longer waits for #86 … the 2026-11-04 12:00 UTC guard is moot. Under the 20:36 first-ready rule, C, B (#94) and D each merge as soon as verified and green. Recorded in #91's description before its merge." | the description matches the recorded update (see "Ruling conflict") |

Round 1's other checks (the root cause and its dependabot-core lines, the precedent runs, the 651f8b80 column, the
local suite rows, the skips) cover text that is unchanged on an unchanged tree, so they still stand.

## Observations (not defects)

- **N1.** The CI paragraph's "22 check runs: 20 succeeded and 2 were skipped" was exact when written. GitHub now lists
  23, because the edit that wrote the sentence started approval-of-record 125215440540, which succeeded. Every
  description edit adds such a run, so no edit can state the final count. Nothing is red or missing, and the sentence
  names the three CI runs it counts. No change is needed. If the description is edited again for another reason, it
  could say "plus one approval-of-record run per description edit".
- The round-2 report says the connector readback is byte-identical. I confirmed only the gh read, which is of the same
  stored body, and its sha256 matches the connector readback file the updater saved.

## Ruling conflict (carried from round 1, for the session that merges)

The workflow's task text still says "after #86 … deadline guard 2026-11-04 12:00 UTC". The status file records the newer
08:52 UTC update (ebd6387b, line 52): C no longer waits for #86, and the guard is moot. The description follows the
update. #86 is still an open draft at 83167b8f. C adds no conflict with #86's head (only the base's three files) or with
its fix-round head 5c01f150 (clean).

I can confirm the record and what it says, not its provenance beyond that record. The session that merges should rely
on the status file's update, or confirm it with the orchestrator, before merging ahead of #86. This decision belongs to
the merge; the description is accurate either way.

## Defects

None. D1 from round 1 (D1a, D1b and both D1c nits) is fixed in the description, as checked above.

## Verdict

**VERIFIED.**
- CI on 07b5382b is complete and green. All four required checks succeeded: all green, mutation, the
  screening-capacity gate (no sizing question on this head) and approval-of-record (all three runs).
- The clone checks pass and leave git clean.
- The description is accurate.
- The head contains the current base 2affb854 (baseMoved: false at 10:18:33Z).
- The clone `merge-C/verify-r2` was removed after this record was written.
