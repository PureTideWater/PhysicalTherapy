# PR #86 (ci-images-digest): adversarial review, CI and test infrastructure

Reviewed tree: WIP head **b2a41a00…** (`co-001/wip-ci-images-digest`: 83167b8f… + merge of bce57f16… (#82) + the table
citation fix 5143563f… + the N32 renumber). Base `claude/build-platform` bce57f16…. Fresh blobless clone, detached at
b2a41a00, `pnpm install --frozen-lockfile` under the heavy lock (exit 0). Read only: nothing pushed, commented or
reviewed. Written 2026-11-01. Progress notes: `lane-b-ci-images-digest-wip/progress/review-ci-infra.md`.

**Verdict: sound to merge after the fix round. No blocker.** The fix does what it claims on GitHub's runner and
buildx. I confirmed this in the runner and buildx sources at the versions R2 ran, and in R2's logs. T1 to T6 fail on
every regression I tried. One should-fix (S1): T6's line citations go stale silently, and #42's merge will make four of
them wrong while CI stays green. Five nits.

---

## Findings

### S1. T6's line citations go stale silently, and #42's merge breaks four of them (should fix in this PR)

- **Where:** `tools/test/workflows.test.ts:3267-3351` (`BOUNDED_VALUES`) and `:3358`. Line 3358 is the only check on
  the citations:
  `expect(row.bound, key(row)).toMatch(/[\w-]+\.(?:ya?ml|ts|mjs|sh):\d+/)`. It checks their format and nothing else.
- **Scenario 1: an edit above a cited line.** Add one comment line at the top of every workflow, leaving the frozen
  `publish-content.yml` alone (tree `m6b`). `CI_TREE=… vitest run --project unit tools/test/workflows.test.ts` gives
  **120 passed, 0 failed, 1 skipped**, the same as the unmodified tree. Every workflow citation in the table is now
  one line off, and CI stays green.
- **Scenario 2: #42, a non-CI change.**
  - `git merge-tree --write-tree b2a41a00 be63bdc2` is clean (tree 06b57e50…). On that tree, after `pnpm install
    --frozen-lockfile`, workflows.test.ts gives **121/121 passed**.
  - #42 rewrites `tools/screening-capacity/report.ts` and `run.ts`, so four of the table's citations point at unrelated
    code on the merged tree:

    | Cited at b2a41a00 | What it shows on the merged tree | Where the code moved |
    | --- | --- | --- |
    | `report.ts:835-838` (`sizingQuestion`) | lines of the report's footer | `:932-935` |
    | `report.ts:635-639` (the time line) | a queue filter | about `:692-696` |
    | `report.ts:866-867` (`outputs['time-warnings']`) | a memory table row | `:963-964` |
    | `run.ts:1036-1039` (the `GITHUB_OUTPUT` loop) | the oracle's push | about `:1092-1095` |

    The bounds themselves do not change: `jobResult` and `sizingQuestion` read the same on the merged tree.
- **Scenario 3: #82's merge.** It already moved 27 ranges across 47 rows. Those were remapped by hand in 5143563f, and
  the fix round's own edits to any workflow will move them again.
- **Why it matters:**
  - The table is the reviewed record of "each listed with its bound" (ADR 0066 N32), and its citations are the
    reviewer's pointer to each bound.
  - A stale pointer is worse than none, and nothing turns red when one goes stale.
  - Pinning the line numbers with an anchor check would be no better: any lane that edits a cited file (here #42, a
    product PR) would turn red on a table it never touched.
- **Fix (the merge's P6, done now, inside this PR's file).** Cite each producer structurally and resolve it in the test,
  so no row carries a line number:
  - **Workflow producers.** The row names its job and step id (`{ job: 'db', step: 'runner-image' }`) or the job output
    (`{ needs: 'changes', output: 'shards' }`). The test then asserts the following, and fails naming the row if the
    producer is renamed or removed:
    - the step id exists in that job;
    - a `run:` step's script writes `<name>=` to `$GITHUB_OUTPUT`, or runs the tool the row cites;
    - a `uses:` step is one of the few actions known to produce that output (`actions/cache/restore` gives
      `cache-primary-key`; `actions/attest-build-provenance` gives `bundle-path`);
    - for a `needs` value, the needed job declares that output.
  - **Tool producers.** Cite them as `path#symbol`, for example `tools/screening-capacity/report.ts#sizingQuestion` or
    `tools/content-calendar/render.ts#MAX_FILE_BYTES`. The test asserts that the file declares the symbol.
  - **Effect.** The test is then always correct and fails when a producer goes away. #42, ci-findings-transport and
    every later CI change no longer need to edit this table for a line shift.
  - **Cost.** About 67 rows rewritten and a small resolver. The resolver gets its own fixture test, in T4's style: a
    renamed step id and a deleted symbol each turn it red.
  - **Until it lands.** The status file's pointer for ci-findings-transport is already stale: the `over` row is at
    `:3293` at b2a41a00, not `:3239`.

### N1. T5 fails on a harmless eighth build step

- **Where:** `workflows.test.ts:3374`, `expect(builds).toHaveLength(7)`.
- **Scenario:** tree `m5` copies release-capacity's build step under a new name, with `BUILDX_METADATA_PROVENANCE:
  disabled` set. The only failure in the whole file is T5: `expected [ … ] to have a length of 7 but got 8`. A new image
  build that follows the rule fails a rule test, and the message does not say what to change.
- **Fix:** keep the test from passing on an empty match without counting:
  - assert that the seven known steps are among the steps found (`expect(builds.map(where)).toEqual(expect.arrayContaining([...]))`
    over their `where` names);
  - keep the existing per-step `env` assertion.

  A missing or renamed build step still fails, an eighth step without the env still fails (tree `m5b`), and an eighth
  step with the env passes.

### N2. T6's content-calendar `check` row gets GitHub's job-output limit wrong

- **Where:** `workflows.test.ts:3286`, which says "933,336 characters: a job output, under GitHub's 1 MB".
- **Why it is wrong:**
  - GitHub approximates job outputs in UTF-16 (`output-limitations.md:1`, quoted in the design's §2.5). So 933,336
    base64 characters count as about 1,866,672 bytes, over 1 MB.
  - The design says this itself (§3: "past GitHub's 1 MB job-output limit once counted as UTF-16, about 1.87 MB").
  - The row repeats `render.ts:17`'s mistaken comment.
- **Fix:** reword the row as "up to 933,336 characters, about 1.87 MB counted as UTF-16, over GitHub's 1 MB job-output
  limit (ci-findings-transport's to fix with the environment string)".
- **Also name the item in the ADR.** `ci-findings-transport` appears only in the test's `over` tag, and ADR 0066 N32
  says only "an item of its own". Naming it there gives the tag a reference inside the repository.

### N3. reconciliation-001's entry cites labels that exist only outside the repository

- **Where:** `docs/product/reconciliation-001.md:665`, which cites "(C1, C2)", "(C3, C4)", "(C5 to C8)" and "(C11)".
- **Why it is wrong:**
  - These are the choice numbers of `ops/designs/lane-b-ci/ci-images-digest.md`. `git grep -n "C11\b" -- docs` finds
    only this line, and no document in the repository defines C1 to C11.
  - The ruling entries around it define their own labels (F1 to F7, CQ1 to CQ3, Q2, P1).
  - C11 is "red runs of record (R0)", and R0 never ran: GitHub refused the description on create.
- **Fix:** drop the C labels, or replace them with ADR 0066 N32's own sub-bullets. Name the runs of record as the PR's
  `ci` runs: R1 40652135443, R2 40653896254, and R3 when it runs.

### N4. T3 bounds each expression, not each environment string; ci.md's sentence on the error is too narrow

- **Scenario:** tree `m11` sets `NOTES: "${{ vars.A }}${{ vars.B }}${{ vars.C }}"` on a step. Each value is admitted as
  one level of `vars`, at most 48 KB, but together they can reach 147,456 bytes, over 131,072. The N32 describe passes
  4/4. The same is true of `secrets`.
- **ci.md wording:** `docs/runbooks/ci.md:150-152` says "Argument list too long on any step means a value over 131,072
  bytes reached its environment". The kernel limit applies to the string `NAME=value` with its NUL, so a 131,060-byte
  value already fails. E2BIG also comes from the total of the environment and arguments (`ARG_MAX`, 2,097,152 here).
- **Fix:**
  - T3 refuses more than two 48 KB contexts (`vars`, `secrets`) in one scalar. That is a few lines in `visit`, since
    the expressions of one string are already in hand.
  - ci.md reads: "an environment string (`NAME=value`) over 131,072 bytes, or the whole environment over the
    system's ARG_MAX".

### N5. P2: the build record still carries the event, publicly, for 90 days (one part in scope, the rest a proposal)

Answered in full under point 3 below. In short:
- **In scope:** setting `DOCKER_BUILD_RECORD_RETENTION_DAYS: 7` on the seven `env:` lines this PR adds, with T5 holding
  it, brings the records in line with this repository's own diagnostic artifacts.
- **Proposal:** removing the event from BuildKit altogether (`provenance-add-gha=false`) stays P2, because #82's rule
  refuses it.

### Agreed, not new

ADR 0066 `:983-984` "whose Part 5 took N29 to N31" is merge-check-1's nit. Part 5's notices are N23 to N31
(`:1630-1650`). It should read "whose Part 5 notices, N23 to N31, include an N29 of their own".

---

## The four points every reviewer checks

### 1. N29 renumbered to N32: complete and correct, and nothing of #82's was changed

- **No collision.** Part 5's notices are N23 to N31 (`ADR:1630-1650`). N32 appears nowhere on bce57f16, and merge-check-1
  also checked every `co-001/*` branch.
- **Every place renamed.** `grep -n "\bN32\b"` finds all 16 places, the same 16 that held N29 at 83167b8f:
  - ci.yml:667 and :687; release-dry-run.yml:113; release-capacity.yml:64; release.yml:104; screening-capacity.yml:174;
  - ci.md:152 and :432;
  - ADR :31, :45 and :981;
  - reconciliation-001:663;
  - workflows.test.ts:1927, :2842, :2844 and :3265.
- **The remaining N29s** are ADR :983 (this branch's old name, on purpose), :984 (#82's range) and :1642 (#82's own N29,
  unchanged against bce57f16).
- **The heading.** The Deciders sentence sits under Part 3 (`:45`), as intended.

### 2. T6's line citations

- **Correct at this head: yes.**
  - All 67 rows parse.
  - An anchor pass checked that each cited workflow range holds its step's `id:`, its output name, or for cache rows
    the `key:` line the row describes. Every row passed.
  - I spot-checked 15 tool citations by hand, among them `render.ts:17-18` and `:127-135`, `checks.ts:181-195`,
    `release-capacity/run.ts:535-536`, `affected.ts:776`, `publish-content.sh:15-19` and `:49`, `content-calendar.yml:60`
    (`base64 -w0`, so no newlines) and `:78`, and `release-capacity.yml:141`. All are correct.
  - merge-check-1 compared all 75 citations with 83167b8f's content.
- **Do they drift?** Yes, on any edit above a cited line, in workflows or in tools.
- **Robust? No.** A drift never turns CI red: it passes silently (S1, with the m6b and #42 evidence).

### 3. P2: what the build record carries, who can read it, and whether it is in scope

- **What it carries.** build-push-action's post step runs `docker buildx history export --finalize` and uploads the
  `.dockerbuild` as an artifact (`src/main.ts:193-228` at c3c9e263…). R2's images job did so: 70.12 KB as artifact
  12800604026 and 65.02 KB as 12800384581 (log lines 2961-3004).
  - The record holds BuildKit's history for the build. Its provenance carries the builder's `provenance.d/github_actions_context.json`.
  - buildx's docker-container driver writes that file when setup-buildx creates the builder (`driver.go:177-185`,
    default on at `factory.go:53`).
  - The file holds `github_event_name` and `github_event_payload` (the whole `GITHUB_EVENT_PATH` file), plus the actor
    and actor id, the ref, the repository and owner ids, and the run and runner fields (`util/ghutil/ghutil.go:23-41`
    and after, at v0.38.1).
  - On a pull request the payload holds the PR object: its description and title, its head and base, and the
    repository and sender objects. On release.yml's tag push it holds the push payload.
  - `BUILDX_METADATA_PROVENANCE` does not touch the record: `provenance.go:26-28` only skips copying it into the
    metadata file.
  - I did not download a record. The proxy refuses the download, and this task allows GitHub reads only through the MCP
    tools. These contents come from the source.
- **Who can read it.**
  - The repository is public: R2's e2e matrix ran 2 shards, which is `fromJSON(github.event.repository.private &&
    '[1,2,3]' || '[1,2]')` at ci.yml:506, and the capacity job's comment says the same. So any signed-in GitHub user can
    download the records.
  - They are kept **90 days**: R2's two records expire 2027-01-26T08:01:41Z, because build-push-action sets no
    retention and `DOCKER_BUILD_RECORD_RETENTION_DAYS` is unset.
  - The same run's playwright artifacts expire 2026-11-04, after the 7 days the workflow sets. Every upload the
    repository makes itself sets a retention of 1, 7, 14 or 90 days.
- **Scope.** Nothing new is exposed, since the description is public on the PR. But each record keeps a snapshot of the
  description and of commit messages for 90 days, past any edit.
  - **Removing the event entirely is a proposal (P2).** It means `provenance-add-gha=false` on the builder, which #82's
    rule refuses: `tools/check-action-pins/buildkit.ts:46` requires driver-opts to be exactly
    `image=moby/buildkit:vX.Y.Z@sha256:<digest>`.
  - **The retention part is in scope.** `DOCKER_BUILD_RECORD_RETENTION_DAYS: 7` goes on the same seven `env:` lines,
    and T5 asserts it beside `BUILDX_METADATA_PROVENANCE`. This is the cheaper half of P2, and the security reviewer
    should weigh in on it (N5).

### 4. R2's images log read per §6.4: the status file's item is confirmed

- **The log.** Job 122700187970 was read whole: `original_length` 3,037, and 3,037 lines read.
- **The two `Metadata` groups**, at log lines 983 and 2555, with timestamps stripped and the `::stop-commands::` and
  masked lines dropped:
  - they measure **780 and 783 bytes** of UTF-8;
  - each has exactly the keys `buildx.build.ref`, `containerimage.config.digest`, `containerimage.descriptor`,
    `containerimage.digest` and `image.name`.
- **Counts in the log:**

  | Searched for | Count |
  | --- | --- |
  | `buildx.build.provenance` | 0 |
  | `github_event_payload` | 0 |
  | `synthetic length-test row` | 0 |
  | `Argument list too long` | 0 |
  | `E2BIG` | 0 |
  | `##[error]` | 0 |

- **`BUILT` and the identity steps:**
  - web `sha256:326bb524…` (line 2914), and the step prints `web: config sha256:326bb524…` (line 2916);
  - worker `sha256:bca9c01c…` (line 2940), loaded on the containerd store (line 2943).
- **The env reached both builds.** Each build step's env shows `BUILDX_METADATA_PROVENANCE: disabled` (lines 468 and
  1499).
- **Versions:**
  - runner 2.338.0;
  - buildx "v0.38.0 0dbe87f3…". The tags v0.38.0 and v0.38.1 both peel to 0dbe87f3…, so the ADR's "v0.38.1" is the same
    code;
  - BuildKit v0.34.1.
- **The other R2 builds:**

  | Job | Lines read (all) | `Metadata` size | provenance | ruler |
  | --- | --- | --- | --- | --- |
  | release-dry-run `build (worker)` 122700187835 | 2,116 | 815 bytes | 0 | 0 |
  | release-dry-run `build (web)` 122700188314 | 1,505 | 812 bytes | 0 | 0 |
  | screening-capacity `capacity` 122700247351 | 1,948 | 784 and 787 bytes | 0 | 0 |

  The capacity job's identity lines match, and its gate 122706928679 succeeded.
- **Confirmed** to the byte.

---

## The focus: the fix as GitHub's runner and buildx actually behave

### `fromJSON(x || '{}')` on every path

Read in actions/runner **v2.338.0**, the version R2's runner reported:
- **The order.** `StepsRunner.cs:113-138` evaluates the step's `env` first. On an error it sets `evaluateStepEnvFailed`,
  fails the step and never evaluates `if:`. The condition is evaluated later (`:200-241`).
- **An empty string.** `FromJson.cs` calls `JToken.ReadFrom` on it, so `fromJSON('')` throws.
- **Memory.** Template evaluation allows 10 MB (`PipelineTemplateEvaluator.cs:52`, passed through as `MaxMemory`), so
  parsing even a 132 KB metadata is no risk.

Every path, with this head's conditions (ci.yml:745 and :757):

| Path | `steps.<id>.outputs.metadata` | `BUILT` | Result |
| --- | --- | --- | --- |
| Build failed | unset, so null | `null \|\| '{}'` gives `{}`, so `''` | `if` false: skipped |
| Build skipped (an earlier step failed) | null | `''` | skipped |
| Run cancelled | null, or the output if the build finished | `''` or the digest | `!cancelled()` false: skipped |
| Built, metadata without the key | JSON without the key | `''` (a missing key is null, and null becomes `''`) | runs; `-z` gives the step's own `::error … buildx built nothing it reported`, exit 1 |
| Built, with the key | JSON | the digest | the comparison |

- **Output that is not JSON** fails the step closed. build-push-action only sets the output after parsing the file it
  wrote (`main.ts:137-143`).
- **T2 checks the shell side.** Its emulator yields `JSON.parse(m || '{}')[key] ?? ''`, the same values, and it runs the
  real scripts for the empty-output, missing-key and other-digest cases.

### `BUILDX_METADATA_PROVENANCE: disabled` at the pins in use

- **buildx v0.38.1 (0dbe87f3…):**
  - `util/confutil/metadata.go` matches `"disabled"` exactly. `Disabled` falls through `ParseBool` to `min`, and T5
    refuses it (tree `m8`).
  - `build/provenance.go:26-28` returns before reading the record.
  - `build/build.go:980` still writes `buildx.build.ref`.
  - `commands/build.go:217-221` applies the mode only with `--metadata-file`.
- **build-push-action c3c9e263… (v7.4.0):** `main.ts:105` hands `process.env`, the step's env included, to buildx.
- **Nothing else changes:**
  - The images are exported before the metadata is resolved: R2's `ImageID` and `Digest` groups are present, and the
    identity steps match.
  - The post step's record export and the build summary still run (R2 lines 2960-3005).
  - release.yml builds with `push: false`, `load: true` and `provenance: false`. Its only attestation is
    `actions/attest-build-provenance` on the capacity report (`release.yml:446-450`), which is untouched.
  - No step reads `outputs.digest`, `imageid` or the metadata's provenance.
- **buildx is not pinned.** No setup-buildx step sets `version:`, so buildx comes with the runner image; BuildKit is
  pinned by digest. A future buildx could change the variable's meaning. c2 alone already keeps the environment at a
  71-byte value, so the defect cannot come back that way; only the log copies could.

### Do T1 to T6 bite, and do they spare harmless changes?

Each mutated tree was run with `CI_TREE` against the whole file. The baselines: the head passes 121/121, and the
unmodified copy 120 with 1 skipped.

| Mutation | What fails |
| --- | --- |
| m1: `METADATA` back on the web identity step | T1 (pin), T2 (`spawnSync bash E2BIG`), T3, T6 (66 rows found against 67) |
| m2: `steps.Worker.outputs['METADATA']` on another step | T3: "…env.META: steps.worker.outputs.metadata whole, in ${{ … }}" |
| m3: `github.event.pull_request.title` in e2e's env | T3: "…not a bounded github value"; the e2e env pin also fails |
| m3b: `toJSON (github.event.head_commit)` in a `run:` | T3, #82's token rule, T2 |
| m10: the whole metadata as a job output | T3 and T6 |
| m4: the env dropped from screening-capacity's worker build | T5 alone, naming `screening-capacity.yml capacity Build the worker image` |
| m8: `Disabled` | T5 (and the dry-run equality test) |
| m9: `Docker/Build-Push-Action@` | T5, whose lower-case match works |
| m5b: an eighth step without the env | T5 |
| m7: the env moved to the job | T5. This is stricter than buildx needs, but it is what ci.md says |
| m5: an eighth step with the env | T5's count alone (**N1**) |
| m11: three `vars` in one string | nothing (**N4**) |
| m6b: line shifts | nothing (**S1**) |

T3 reads every key that can reach a process, and no more. The runner's schema (`workflow-v1.0.json` at v2.338.0) gives
step `shell` as `non-empty-string`, which takes no expression. The keys that take contexts and reach a process are
exactly those `unboundedValueProblems` visits.

The lexer also fails closed:
- a `}}` inside a string literal leaves an unclosed quote, which is refused;
- parenthesised paths come back as "a wildcard or a computed index";
- `$GITHUB_ENV` has one writer in the repository (`git grep` finds only ci.yml:289), and no tool writes it.

### The arithmetic

- `MAX_ARG_STRLEN` is 32 pages, 131,072 bytes per string, its NUL included: E2BIG when `len+1 > 131,072`. `ARG_MAX` is
  the separate total.
- T2's 132,377 + 9 + 1 = 132,387 is right.
- T6's `4·⌈700,000/3⌉ + 13 + 1 = 933,350 > 131,072` is right.
- The 98,292-byte threshold is right: `13 + 4·⌈n/3⌉ + 1 ≤ 131,072` holds exactly for `n ≤ 98,292`.
- T2's environment sum is a conservative stand-in for the per-string limit.
- The only wording problems are N2 (UTF-16) and N4 (ci.md).

### The merge with #82

- merge-check-1's evidence stands, and on this head:
  - actionlint 1.7.7 with the test's own flags exits 0 on all workflows;
  - workflows.test.ts passes 121/121.
- The env lines this PR adds stay out of the steps #82's rules read:
  - the Action pins env and `tokenProblems`;
  - the driver-opts rule at `buildkit.ts:46`.
- #82's token rule also catches m3b, so the two rules overlap there.

### The documents against the code

- **ADR 0066 N32** matches the code and R2. Its "the event stops being printed in each build's log" is confirmed by the
  zero counts above.
- **ci.md's two edits** match T3 and T5. The one narrowing is N4.
- **reconciliation-001's facts** match. Its labels are N3.

### What #42 and ci-findings-transport would trip on

- **#42 (be63bdc2…).**
  - `git merge-tree --write-tree b2a41a00 be63bdc2` is clean.
  - `.github/` and workflows.test.ts on the merged tree are byte-identical to b2a41a00: #42 carries the hand-over patch.
  - On the merged tree, `pnpm install --frozen-lockfile` exits 0 and workflows.test.ts passes 121/121.
  - Nothing turns red. What breaks silently is S1's four citations.
- **ci-findings-transport.** It turns T6 red by design, through three assertions:
  - the `over` row;
  - the `FINDINGS_B64` env assertion;
  - the `MAX_FILE_BYTES` assertion.

  Its own edits to `render.ts` or `content-calendar.yml` would also move the rows' line citations silently, which S1's
  fix ends. It should also inherit N2's corrected UTF-16 bound.

---

## For the record, outside the repository

- **The status file.** Its RESUME-BLOCK names the `over` row at `:3239` (now `:3293`) and still needs this round's
  outcome.
- **The design.** §9.1 still names #42 at 46974a25, §9.2 #82 at b574d4e8, and line 15, §8 and C9 still say N29.
- **The merge report's P6** is S1 here: recommended now, not deferred.
