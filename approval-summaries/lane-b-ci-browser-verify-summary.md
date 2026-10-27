# PR #77 (co-001/ci-browser): fresh-clone verification

**Verdict: FAIL, on the pull request description only.** The code, the local runs and CI pass every check. The description is wrong in two places and is missing two records. All four fixes are edits to the description: no commit is needed, so CI and the review of the head stay valid. Re-verifying after the fix means re-reading the description only.

(Saved by the session from the agent's return value; the agent could not write report files.)

- **Head:** 64843249…, confirmed with `git ls-remote` at the start and again at 21:42 UTC.
- **Base:** claude/build-platform 085299bd…, merged in. Scope and failing-first use e908c214….
- **Where and when:** a fresh clone at /home/user/verify-cib, detached at the head, on 2026-10-27 from 21:10 to 21:42 UTC. The clone is now removed.
- **Toolchain:** Node 24.22.0, pnpm 10.34.8. Each heavy command ran under `flock /tmp/laneb-heavy.lock`.
- **Logs:** local runs are in /tmp/claude-0/-home-user-PhysicalTherapy/5b1bc8b7-7846-5c40-a0f8-306593ba96be/scratchpad/verify/logs/. CI logs read with `get_job_logs` are in /tmp/claude-0/-home-user-PhysicalTherapy/5b1bc8b7-7846-5c40-a0f8-306593ba96be/scratchpad/verify/joblogs/.
- **GitHub:** read only. Nothing was commented, reviewed, approved, merged or pushed.

## Mismatches and the fix each needs

1. **`tools/screening-capacity/measure.test.ts` is now shared with #42 but not listed.**
   - #42 started changing it at head 6f23c42b, updated 21:05:40Z, after the fix round read #42's files.
   - Add it to "Shared with #42" (rule 6) with this evidence:
     - the hunks are disjoint: #42 has `-7,7` and `-100,6`; this branch has `-1,4`, `-15,8`, `-24,11` and `-246,16`;
     - `git merge-tree` with 6f23c42b auto-merges it;
     - only ADR 0062 conflicts, and that conflict is already known.
   - Note it for whichever of the two pull requests merges second.
   - The file is not on the LANES.md:84-92 list, so rule 6 alone should cover it. The orchestrator should confirm that.
2. **The failing-first count is from 367a659f, not the head.** Replace "31 red, 29 behaviour reds (27 + 2)" with: 34 red at 64843249's tests, which is 32 behaviour reds (30 in `workflows.test.ts`, 2 in `browser-version.test.ts`) plus the 2 `node_modules` readers. 367a659f's tests give 31. The difference (+5/−2) is the fix round's rewrite of the dry-run tests and bd7dbd1d.
3. **This run's results are not recorded.** The section "What this pull request's CI must show (recorded here when it has run)" has not been updated since CI finished; the description was last edited at 20:52:56Z. It needs:
   - the runs: ci 40581096032 and the sibling runs;
   - the counts: unit 6,352 + 1; db 3,152 / 2,615 / 2,534 / 922 = 9,223 + 0; e2e 27 + 27; golden 376;
   - the baseline step's seven SHA-256s written on 26.04 and equal to the committed files (ADR 0058's host-independence proof);
   - the three `--image` checks, each with its version line;
   - the containerd `.Id` equal to `target` in `images`;
   - the dry run's six merged outputs and its checked loads;
   - the runner images: 26.04 20261012.163.1 and 20261025.179.1; 24.04 20261012.334.1 and 20261025.353.1;
   - the apt key's `ImageVersion` values 20261023.163.3 and 20261026.180.1, and 0 kept / 0 discarded;
   - release-capacity's result (check 7).
4. **The A9 note is not linked by its commit** (acceptance 8; it does not block the merge). Link https://github.com/PureTideWater/PhysicalTherapy/blob/dd9e0d66…/designs/lane-b-ci/ci-browser-a9.md (claude/build-ops, 21:19:31Z). Its verdict reads "Overall verdict: pass, no finding".

## 1. Scope (acceptance 1): passes, except #42's `measure.test.ts`

- **Diff size:** `git diff --name-only e908c214 HEAD` lists 70 files. 65 differ from 085299bd; the other 5 are #76's test files, which came in with the base merge.
- **Protected paths:** the same command over `packages/pricing`, `packages/ledger`, `packages/db/migrations`, `content`, `tools/verify-content`, `.claude/hooks/protect-content.sh`, `docs/product/domain-model.md` and `packages/db/domain-model` is empty. There is no migration and no `.sql` file anywhere in the diff.
- **publish-content.yml and its frozen copy:** `diff <(git show e908c214:…) …` shows one line in each, `23c23 runs-on: ubuntu-24.04 → ubuntu-26.04`.
- **build-stamp.ts:** `git diff --stat e908c214 HEAD -- apps/web/scripts/` is empty.
- **LANES.md:84-92, "Not while #42 is open":** only `shell.tsx` changes (allowed by Q2). `run.ts`, `report.ts`, `report.test.ts`, `test-support/measurements.ts` and `screening.spec.ts` are untouched. No infra, db schema, observability, worker or other web file on the list changes.
- **#42's files:** read with `gh api …/pulls/42/files?per_page=100&page=1..3`, because the proxy refuses `--paginate`. #42 is a draft, open, head 6f23c42b, 212 files. This branch changes 11 of them: the 10 the description lists, plus `measure.test.ts` (mismatch 1). `git merge-tree --write-tree HEAD 6f23c42b` conflicts only in ADR 0062.

## 2. Local runs (acceptance 2): pass

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | exit 0 |
| vitest unit subset: `tools/test`, `tools/ci`, `tools/screening-capacity`, `packages/synth` | **718 passed** of 718, 46 files |
| actionlint 1.7.7 with `-shellcheck= -pyflakes= -ignore 'label "ubuntu-26\.04" is unknown'` | exit 0. Without the `-ignore`, exactly 22 label errors |
| `pnpm typecheck` | 22 projects passed |
| `pnpm lint` | 1,620 files, 0 errors, 0 warnings |
| `node tools/ci/browser-build.ts` against /opt/pw-browsers | exit 0. Headless shell 287 files, tree `333985b3…`; Chromium 301 files, tree `2f991090…`. Each "equal to browser.json in every file" and printing `Google Chrome for Testing 156.0.8078.4` |
| `pnpm synth --all`, then `watched.ts --write` | 0 written, 631 unchanged, EMR 16 unchanged; watched list 533 lines; `git status` clean |
| `pnpm lint:logs`; `pnpm verify-content` (extra) | 1,057 files, every log call allowlisted; every content set passes |

## 3. Failing first (acceptance 3): reproduced; the description's count is stale

| Run | Result |
|---|---|
| `CI_TREE=<git archive e908c214>` with the head's `workflows.test.ts` and `browser-version.test.ts` | **34 failed**, 95 passed, 1 skipped (130), all `AssertionError`. `browser-version.test.ts` 4 (2 behaviour reds + 2 `node_modules` readers), `workflows.test.ts` 30. All green on the head |
| Same tree with 367a659f's two test files, restored afterwards | **31 failed** (27 + 4). This is where the description's 31 = 29 + 2 comes from |
| Difference between the two | Red only with the head's tests: the dry run's triggers, its build legs, push/capacity, SBOM, and per-matrix artifact names. Red only with 367a659f's tests: two old dry-run tests |
| Fix-round red: `CI_TREE=<git archive 367a659f>`, `-t 'the brand baselines, regenerated from nothing'` | **3 failed**, 111 skipped: the step `rm`s the snapshots; "build-stamp: the working tree has uncommitted changes" ×2. All 3 pass on the head |
| Extra sample: `CI_TREE=<git archive daea87c0>` | 8 failed of 114: the fix round's dry-run rewrite accounts for 7 and bd7dbd1d for 1. This matches the description's "7 red of 114" and "1 red" |

## 4. CI on 64843249: passes

**Check runs:** 35 in total. 32 succeeded. The two `notify` jobs (122460860634, 122469873046) were skipped by design. release-capacity's run was in progress at the time; see check 7. All pull-request runs used GitHub's merge commit 7174b39c (64843249 merged into 085299bd).

**The four required checks:**
- `all green` (122466177800): success, "every job it needs succeeded (8 jobs)".
- `mutation` (122468194986): "mutation gate: passed". Every undetected mutant is a recorded equivalent.
  - money 96.58% (226/234)
  - pricing 98.67% (1,934/1,960)
  - ledger 98.48% (2,018/2,049)
  - packets 97.75% (4,310/4,409)
- `screening-capacity gate` (122469870895): success.
- `approval-of-record` (122460354303 and 122463410642): success, "needs no review of record".

**Counts:**

| Suite | CI result | Job |
|---|---|---|
| unit | **6352 passed, 1 skipped** (6353) | 122460356771 |
| db | 3,152 + 2,615 + 2,534 + 922 = **9,223, 0 skipped**, 32+32+32+31 = 127 files; the restore drill ran (7 tests) | 122460355629, 122460355754, 122460355432, 122460355404 |
| e2e | **27 + 27 = 54** | 122461666053, 122461666069 |
| golden | `pnpm test:golden` **376 passed** in CI, so no local run was needed | static 122460355545 |

**Browser check:**
- **On the runner:** "equal to browser.json in every file" for both builds, with the version line, in unit, db 1-4 and e2e 1-2.
- **With `--image`:** "Google Chrome for Testing 156.0.8078.4", 287 files, tree `333985b3…`, "equal to browser.json in every file" in:
  - `images` (122460355420, `tp-worker:scan`);
  - screening-capacity `capacity` (122460450130, `tp-worker:capacity`);
  - release-dry-run `build (worker)` (122460354366, step 9).

**e2e (1/2) baseline step:**
- 4 passed (49.9 s). Seven "A snapshot doesn't exist at /home/runner/work/_temp/baselines/…, writing actual". No error.
- It printed seven SHA-256s. `sha256sum -c` in the clone gives **7 OK**, and the set equals `git ls-files` of the snapshot directory.
  - `7ddf673c…`, `04be07d1…`, `4b3a7781…`, `e5e0370e…`
  - `0517b2a1…`, `3ece4f0b…`, `e982852d…`

**images (122460355420):**
- Docker 29.4.2, containerd snapshotter, Ubuntu 26.04.1.
- "worker: config sha256:592b481f…, target sha256:9f601a10…, loaded as sha256:9f601a10… on the containerd image store": `.Id` equals `target`.
- Trivy read both archives through `input:`; both clean.

**release-dry-run (40581096066):**
- `build (web)` and `build (worker)` each printed archive SHA-256, config and descriptor. Web: `dd9f6cf7…`, `6e71fd98…`, `dcb6a351…`. Worker: `93514dbf…`, `0a6428f7…`, `f501b02c…`.
- `push` and `capacity` each received all six outputs. For each image they printed "web.tar.gz: OK" or "worker.tar.gz: OK", then "…, the image built", with `.Id` equal to the config digest on the classic store (Docker 28.0.4).

**screening-capacity `capacity` (122460450130):**
- Classic-store loads, with `.Id` equal to the config digest.
- `--image` passed.
- Verdict "pass (time advisory)". The middle S4 run's 52.3 s raises the O9 warning, but the base's push run 40567044160 gives the same warning (54.0 s), so it is not this PR's.

**apt cache:** 0 kept, 0 discarded in every browser job, as expected on a pull request.

**Runner images:**

| Image | Jobs |
|---|---|
| 26.04 20261012.163.1 | unit; db 1, 2, 4; e2e ×2; all green; lint; build; domain model; content-calendar check; approval-of-record ×2; mutation gate; 5 stryker shards |
| 26.04 20261025.179.1 | db 3; static; stryker pricing-rest and pricing-recompute; both `changes` jobs; screening-capacity gate |
| 26.04, version not read | `images`: its log is 5,405 lines, the tool returns the last 5,000, and the REST log endpoint is refused. `docker info` shows Ubuntu 26.04.1 and the job's label is ubuntu-26.04 |
| 24.04 20261012.334.1 | screening-capacity capacity; dry-run `build (worker)`, `push`, `capacity` |
| 24.04 20261025.353.1 | dry-run `build (web)` |

- **Mutation:** all seven shards ran on 26.04, each with its canary 5 of 5.
- **Runner labels in the YAML:** 22 jobs on 26.04 and 8 on the chain. 17 of the 22 ran on this PR's run.

## 5. The description against the findings

**Confirmed:**
- **Versions and lockfile:**
  - the version bumps and the catalog line `pnpm-workspace.yaml:22`;
  - the lockfile diff is 37 insertions and 43 deletions, with one `playwright-core@1.64.1` and only `fsevents@2.3.3`.
- **Worker image and browser check:**
  - the Dockerfile lines `:21` and `:33`;
  - the docker run forms in `browser-build.ts:285` and `:291`;
  - the 287 and 301 file counts.
- **Baselines:**
  - every old and new SHA-256 prefix and byte count in the table;
  - pixels, re-counted with PIL: six pictures 0; the cover without the seal **1,611 in 234 × 27 at (83, 418)**, 0.19%, and 0 after a 1 px shift.
- **Runners:** 22 jobs on 26.04 and 8 on the chain.
- **Header:**
  - in `shell.tsx`: the `data-slot` attributes, the visually hidden words and `md:relative`, with no `aria-label` and no `title`;
  - 14 specs with 72 `expectAccessible` calls.
- **Local numbers:** every number in the "Local" table that was re-run matches.
- **CI predictions:** all hold, and the counts match.
- **Commits and follow-ups:**
  - the 23 commits named in the description are ancestors of the head with matching subjects;
  - UX-5 is committed on claude/build-ops (e02ce68c).
- **Unchanged files:** `run.ts`, `report.ts`, `report.test.ts`, `measurements.ts`, `build-stamp.ts` and the domain model ("No change"; the strict check passed).

**Mismatches:** items 1 to 4 at the top.

## 6. Attribution and secrets: pass

- **Attribution:** 68 commits in e908c214..HEAD (59 non-merge). 67 end with the two attribution lines (the co-author trailer with the noreply address, then the session-link trailer). The exception is 085299bd, GitHub's merge commit for PR #76 on the base branch, which is not this branch's commit.
- **Model names:** I searched case-insensitively for the model family names and the identifier prefix. There are 0 hits in the diff's added or removed lines, 0 in file names, and 0 in commit messages once the two trailer lines are removed. The only model-family word in the range is in the required co-author trailer.
- **gitleaks** 8.24.3 (SHA-256 `e18325d5…`), run as `git --log-opts=e908c214..HEAD --redact .` with the repository's config: 58 commits scanned (the 59 non-merge commits less 45b2a977, which changes PNGs only), **no leaks found**, exit 0.

## 7. release-capacity dispatch 40584379787: finished; the failure is SUITE-CAP-1, not this PR

- **`capacity` job (122471867560):** ubuntu-26.04 20261012.163.1, Docker 29.4.2, containerd, kernel 7.0.0-1017-azure.
- **Steps 1-10 succeeded**, including step 6, the `--image tp-worker:capacity` check on 26.04: "Google Chrome for Testing 156.0.8078.4", 287 files, "equal to browser.json in every file".
- **The measurement:**
  - the scale release (900110, 4,172,393 records) loaded in 561 s;
  - every concurrent phase completed;
  - the verdict was **fail**: "A triage (triage) ended failed, not completed", "A audit report (audit_report) ended failed, not completed", "the worker logged JOB_FAILED 2 times", and a QUEUE_ERROR line;
  - the windows query took 52 s cold (advisory).
- **Notify (122486968200)** opened or updated the advisory issue.
- **Why it is not this PR's:** the base's scheduled run 40479127979 (job 122104699853, on e908c214, ubuntu-24.04) failed with the same three verdict lines and a 51 s windows query. That is SUITE-CAP-1 (LANES.md:188, handed to Lane A).
- **Not read:** the worker's own error text is in the run's artifact, and the blob host that serves it is refused here.