# PR #91 (dependabot-batch, PR C: Dependabot group routing) review: CI and test infrastructure

Written 2026-11-02 from 03:32Z to 03:41Z (`date -u`: Mon Nov 2 03:32:42 UTC 2026 at the start). This file records the
adversarial reviewer for CI and test infrastructure across three rounds (2026-11-01 21:10Z to 2026-11-02 02:33Z) and the
skeptics' verdicts (2026-11-01 21:31Z to 2026-11-02 03:21Z). It is not committed.

- **Pull request:** #91, `co-001/dependabot-group-routing`. This is PR C of the Lane B item "dependabot-batch", the
  routing fix that Dependabot #89 exposed. It changes no package version. Draft, 7 commits, 7 files, +219/-18
  (`pull_request_read get`, 03:31Z).
- **Head:** `651f8b80858868fc973e3ef83ad0af0f80b7a24d`, committed 2026-11-01T18:22:27Z. `git ls-remote` at 03:30:32Z
  shows it unchanged.
- **Base:** `claude/build-platform` was at `bce57f16` when the PR was opened. It has since moved three times:
  - `43565235` (#83, 20:40Z);
  - `4eaf7124` (#92, 02:14:46Z);
  - `877e662f` (#93, 02:42:44Z), the current base (`ls-remote` 03:30:32Z).

  `mergeable_state` is `behind`. The writer ran `git merge-tree --write-tree 651f8b80 877e662f` at 03:31:58Z: clean,
  tree `79f82b48`.
- **Description:** last updated 2026-11-01T18:35:24Z. Every description finding below reads that text, re-read
  unchanged at 03:31Z.
- **Lens:** CI and test infrastructure (design `designs/lane-b-dependabot-batch.md` §8.4 item 3):
  - CI-12's test and its port of Dependabot's assignment;
  - the failing-first commits;
  - the synth matrix entry and fixture;
  - watched paths and the capacity run;
  - mutation selection;
  - CI on the head;
  - trial merges, the merge order and the deadline;
  - the description's Checks.

  Rounds 2 and 3 took the completeness critic's unchecked areas.
  - **Round 2:** the updater image, trial merges, the merge order, the description against §8.3 and §8.5, closing bot
    PRs, the model's input set, the CDK sentence and the dependabot-core citations.
  - **Round 3:** #92, the resolution of the conflict with #94, the deadline claim, #86, O9, and the description's
    remaining sections.

How the review was done:
- **Clones.** Each round worked in its own fresh blobless clone under `review-C/`: `clone-ci-infra`,
  `clone-ci-infra-r2` and `clone-ci-infra-r3`. Every heavy command ran under `flock /tmp/laneb-heavy.lock`. The clones
  were removed at 21:23:41Z, 21:52Z and 02:32Z, together with their worktrees, local `refs/trial/*`, and the blobless
  dependabot-core and github/docs clones.
- **GitHub, read only.** Reads went through `pull_request_read` (get, get_files, get_check_runs), `get_job_logs`,
  `list_pull_requests` and `gh api` GETs. Nothing was pushed, commented, reviewed, approved or merged.
- **Writer's spot check (03:30Z to 03:33Z).** Every line cited below at 651f8b80 was re-read in a fresh blobless clone
  (`review-C/clone-writer`, checked out at 03:30:32Z and removed afterwards). Every one matched:
  - `docs/runbooks/dependency-upgrades.md:47-63, 72-74, 85-86, 104-106, 108, 328-333`;
  - `tools/test/dependabot-config.test.ts:60-76, 77-111, 154, 173, 204, 211-237`;
  - `.github/dependabot.yml:33, 35, 37-47, 48-52, 72-88, 89-91`;
  - ADR 0066 `:28-31, 731-741`;
  - `docs/runbooks/screening-capacity.md:101-103`;
  - `tools/screening-capacity/watched-paths.txt:463`;
  - `packages/synth/src/cases/matrix.ts:430`;
  - `tools/ci/browser-build.test.ts:444-460`;
  - `packages/compliance/src/controls.ts:266`.

  One correction: at the head, ADR 0066's Date line is `:31`, and `:28` is the Part 5 bullet (N11).

  The same clone re-ran two merge checks at 03:31:58Z:
  - `git merge-tree` of 651f8b80 with #94 (`484e9f06`): conflicts only in `docs/runbooks/dependency-upgrades.md`;
  - `877e662f` with `484e9f06`: clean.
- **Paths.** Two short names are used for scratchpad folders:
  - `review-C` means
    `/tmp/claude-0/-home-user-PhysicalTherapy/9403d8f7-c652-5574-8dfa-f848fcb558dc/scratchpad/review-C`;
  - `build-c` means `/tmp/claude-0/-home-user-PhysicalTherapy/9403d8f7-c652-5574-8dfa-f848fcb558dc/scratchpad/build-c`.

  Commit and blob hashes are shortened to 8 hex digits. Any other 64-hex digest would be shortened to 8 hex and an
  ellipsis, but none appears here. All data is synthetic.

## Verdict

**0 B, 4 S, 14 N** in this lens: 18 findings raised, none refuted. The change itself is sound:
- the configuration routes every direct dependency to one group;
- CI-12's port matches dependabot-core line by line;
- the test is red first and green on the head;
- CI is green on the head, with all four required checks (see "What I checked and found sound").

All four S findings concern how and when C merges. That matters because C has a hard deadline: Dependabot's npm run at
2026-11-05T04:31Z. Each is fixed in the description, and S3 also adds one runbook line.
- **S1.** C conflicts with #94 in the runbook's AWS paragraph. The description does not say so, and a resolution that
  keeps B's side drops C's routing statement.
- **S2.** "Merge order" is stale against the orchestrator's rulings and never says what the deadline guard does.
- **S3.** The deadline section never says that C's own merge starts Dependabot within seconds, closing #89 and
  superseding #88 under the new file. Nor does it say how the 11-05 run misroutes if C has not merged.
- **S4.** The capacity gate on the head raised the O9 sizing question, and the description does not record it.

Of the 14 N findings, N1 is a test gap: two rules of the CI-12 model are unpinned. The rest are records: the
description's counts, citations and tables, the ADR amendment, and the runbook's triage lines.

**Cross-lens.** The security and supply-chain record is `lane-b-dependabot-batch-C-review-security-supply.md`. These
findings were raised by both lenses:

| This record | Security-supply record | Note |
| --- | --- | --- |
| S1 | N1 | SS3-S3, rerated N by its skeptic and merged into this finding. Take the higher rating, S. |
| S2 | S1 | |
| S3 | S2 | |
| S4 | S3 | |
| N3 | N6 | |
| N6 | N7 | |
| N7 | N8 | |
| N8 | N9 | |
| N9 | N11 | |
| N10 | N10 | |
| N12 | N13 | |
| N13 | N14 | |
| N14 | N15 | |

S1 to S4 all rewrite the description's "Merge order" and "Must merge before Dependabot's next npm run" sections. Write
those sections once, then read the description back.

## Findings

### S1 (ci-infra-r1-C-CI-S1). C conflicts with #94 in the runbook's AWS paragraph; the description's "Merge order" does not say so, and keeping B's side drops C's routing statement

Also raised by security-supply as SS3-S3 (N1 there). Its skeptic rerated it N and merged it into this finding; the
fix round takes S.

**Where:** `docs/runbooks/dependency-upgrades.md:328-333` at 651f8b80; PR #91 description, "Merge order".

**Scenario:** Both pull requests rewrite the same `- **AWS.**` bullet.
- **Who resolves.** Whichever merges second resolves the conflict under LANES.md rule 6. C must merge before
  2026-11-05T04:31Z, so B is likely second. Ruling 2c lets B merge while #42 waits, though, so C may be the resolver.
- **B's side** keeps three things:
  - the base's "`@aws-sdk/*`, come in their groups";
  - "reaches pricing and packets through the lockfile";
  - its own CDK CLI-bump sentence.
- **Keeping B's side** silently reverts three of C's changes:
  - the statement that `@aws-sdk/*` comes in the `aws-sdk` group because minor-and-patch excludes it;
  - the `minimumCliVersion` sentence;
  - the `packages/contracts`/`packages/db` route.
- **Keeping C's side** drops B's CDK telemetry check (security-supply N1).
- **No test reads the paragraph**, so CI stays green either way (`git grep` at both heads, r3 and the SS3-S3 skeptic).
- **The record.** The description lists only #86 and #42 under "Merge order". Design D10 and §8.7 said C adds no
  conflict with any open PR. That held at the 17:49Z trial, but not after #94 opened at 20:46Z.

**Evidence:**
- **The conflict.** `git merge-tree --write-tree --name-only 651f8b80 484e9f06` gives "CONFLICT (content): Merge
  conflict in docs/runbooks/dependency-upgrades.md":
  - reviewer, 21:16:06Z;
  - skeptic, 21:31:32Z: tree `79bd1d73`, the only conflicted file;
  - writer, 03:31:58Z: tree `fda2ff14`, the same single file.
- **It comes from the two pull requests, not the base move.** The base alone merges cleanly with B: `43565235` gives
  `40e6f93b`, and `877e662f` gives `2b913f95` (03:31:58Z). #83 does not touch the runbook.
- **The hunk** is lines 328-341 of the merged file. C's side runs from "`@aws-sdk/*` come in the `aws-sdk` group, which
  minor-and-patch's exclusions keep theirs" through the `minimumCliVersion` sentence. B's side runs from "`@aws-sdk/*`,
  come in their groups (minor and patch)" through "After a CDK CLI bump, confirm it still honours
  `CDK_DISABLE_CLI_TELEMETRY`…".
- **The resolution below was tested.** r3 built trial `22ebacee`: base `43565235` + C + B, with the paragraph
  resolved (`review-C/r3-scripts/aws-resolved.txt`).
  - vitest: `check.test.ts` 28, `images.test.ts` 32, CI-12 10, compliance 18, which is 88 passed (02:07:08Z);
  - `pnpm lint`: 1,681 files, 0 errors, 0 warnings (02:09:07Z);
  - `pnpm synth --all`: 0 written, tree clean (02:10:15Z).

  Security-supply r3 built the same text independently (`r3s-scripts/aws-merged.txt`; `diff` against
  `aws-resolved.txt` shows them identical, 03:32Z) and tested it on base `4eaf7124` (trial `2c8b5ced`).
- **The other side's record.** #94's description names the conflict and says "Whichever merges second resolves the
  conflict, keeps both changes". #91's does not (`pull_request_read get`, 03:31Z).

**Fix (the skeptic's corrected fix):**
1. Under "Merge order" in #91's description, add:

   > #94 (`co-001/deps-aws-cdk-minor-patch`) conflicts with this pull request only in
   > docs/runbooks/dependency-upgrades.md's AWS paragraph, which both edit (`git merge-tree` of 651f8b80 with
   > 484e9f06). Whichever merges second keeps both: C's routing statement, the `minimumCliVersion` sentence and the
   > contracts/db route, and B's CLI-bump sentence.

2. Give the resolution as the file's exact lines, so the resolver pastes it and does not re-wrap it:

   ```
   - **AWS.** `aws-cdk` with `aws-cdk-lib` and `constructs` come in their group, and `@aws-sdk/*` come in the `aws-sdk`
     group, which minor-and-patch's exclusions keep theirs (minor and patch).
     `pnpm cdk:diff` in the build job shows what a CDK bump changes in the stacks; read it before taking one. The CLI
     moves with the library: a library's cloud assembly names the oldest CLI that reads it (`minimumCliVersion`).
     After a CDK CLI bump, confirm it still honours `CDK_DISABLE_CLI_TELEMETRY`, the `notices` setting and
     `CDK_DISABLE_VERSION_CHECK` (`lib/index.js`, `canCollectTelemetry`, the notices setting and `shouldDisplayVersionMessage`).
     `@aws-sdk/*` reaches pricing and packets through `packages/contracts` and `packages/db`'s manifests and the lockfile,
     so its pull request runs those packages' mutation.
   ```

   If security-supply N12 is taken (it rewords the ungrammatical "keep theirs"), its two lines replace the first two
   here. Append the same text to the status file's note at `lane-b-dependabot-batch-status.md:190-191`, which already
   records the rule (the SS3-S3 skeptic).
3. Record the base moves: the base is now `877e662f`, a clean merge. Merge it in, re-run CI, and redo the §8.6
   fresh-clone verification.

**Skeptic:** Real; could not refute. Checked read-only after `git fetch` at 21:31:29Z.
- **Severity.** S is defensible. N would also be fair, since #94's description already documents the conflict. But under
  ruling 2c C may merge second, and its own description gives that resolver nothing.
- **The resolved text.** Diffed against 651f8b80, it adds only B's two lines. Diffed against 484e9f06, it adds only C's
  changes. No conflict markers remain, and no test quotes the paragraph.
- **The one refinement** was to give the exact wrapped lines, which the fix above now does.

### S2 (ci-infra-r2-C-ci-r2-S1). "Merge order" is stale against the orchestrator's rulings, and leaves out what the deadline guard does

Also raised by security-supply as security-supply-r2-S1 (S1 there). Its skeptic's corrected text is the fuller one.
Write the section once, covering this finding, S1 and S3.

**Where:** PR #91 description, `### Merge order`, bullets 1 and 3. The rulings are at
`approval-summaries/lane-b-dependabot-batch-status.md:17-31`.

**Scenario:** #86 is still a draft, last updated 2026-10-28T08:01:36Z, so the guard is likely to fire. Suppose #86 has
not merged by 2026-11-04 12:00Z, and a merger reads only the description:
1. It says C "merges after #86".
2. It says "While #42 is open, the orchestrator is asked before this merges", and #42 is still open.
3. So the merger waits or asks, and C misses Dependabot's 2026-11-05T04:31Z run.

That run then opens misrouted pull requests again, the outcome this PR exists to prevent.

**Evidence:**
- **The description** says "The Lane B orchestrator ruled that this merges after #86 ... The deadline guard is
  2026-11-04 12:00 UTC." and "While #42 is open, the orchestrator is asked before this merges."
- **The rulings** say otherwise:
  - status `:19-21` (2a/2b): "if #86 has not merged by 2026-11-04 12:00 UTC, C merges without waiting (resolve ADR 0066
    keeping both), before Dependabot's 2026-11-05T04:31Z run";
  - `:22` (2c): "A, B and C may merge while #42 waits on the founder";
  - `:25-31` (the 20:36Z rule): "a verified, green PR merges as soon as it is ready ... Never jump a PR already green and
    waiting with a conflicting file ... C waits for #86 (deadline guard 2026-11-04 12:00 UTC)".
- **Trial merges (r2).** On base `43565235` + C (merge `c8388414`, tree `d9ce3bf4`), with #75 `871faff9`, #84
  `e3299ea2`, #85 `a97d6011`, #90 `06f79c07`, #92 `e4e05a0d`, #93 `87691be4` and #95 `8517ee3a`:
  - C adds no conflict to any of them. #75's three uploads files already conflict with the base.
  - On every merged tree, `pnpm synth --all` wrote 0 files and git status stayed clean.
  - The synth, CI-12 and screening-capacity tests passed.
  - `watched.ts --write` made no diff.

  Logs: `review-C/r2-scripts/trial-synth.log` (21:43:47Z to 21:46:50Z) and `trial-synth-95.log` (21:50Z).
- **Precedent.** A's review rated the same staleness in A's description S
  (`lane-b-dependabot-batch-A-review-security-supply.md`, S3).
- **Since the review (writer, 03:31Z).** #92 merged as `4eaf7124` and #93 as `877e662f`. #90's head is now
  `4e70738d`. This is why the description must not pin other pull requests' heads.

**Fix (the skeptic's corrected fix):** Rewrite "### Merge order" as follows.
1. **#86.** C merges after #86, because both amend ADR 0066 (the 2026-11-01 18:00Z ruling, 2a/2b).
   - Deadline guard: if #86 has not merged by 2026-11-04 12:00 UTC, C merges without waiting, before Dependabot's
     2026-11-05T04:31Z run.
   - `git merge-tree` shows C adds no conflict with #86 (`83167b8f`): the conflicts are the same three files the base
     already has with #86, so #86, merging second, resolves ADR 0066 keeping both.
   - Whichever merges second may also name the 2026-11-01 amendment in ADR 0066's header (P1). But see N11: against
     #86's fix-round head this never conflicts.
2. **The standing rule (2026-11-01 20:36Z).** C merges as soon as it is verified, green and ready. Rule 6 sets the
   steps: base merged in first, CI green on that head, ready, approval-of-record re-run, merge with expectedHeadSha. It
   never jumps a pull request that is already green and waiting and shares a conflicting file with it. Today that means
   #86 and #94.
3. **#94.** Add the #94 line from S1.
4. **#42.** Replace "While #42 is open, the orchestrator is asked before this merges" with: "The orchestrator ruled
   (18:00Z, 2c) that C may merge while #42 waits on the founder. `git merge-tree` with #42 is clean."
5. **Other open pull requests.** Add the trial-merge result, and state that it is re-run against the moved base and
   every open pull request just before the merge.

Security-supply S1's corrected text is the version to use: it handles the guard as the one exception to "never jump",
and it pins no heads.

**Skeptic:** Real; could not refute, and S fits. Checked at about 01:14Z to 01:16Z.
- **The description** was unchanged since 18:35:24Z.
- **The other PRs.** #86 was still a draft at `83167b8f`, #42 was open at `6c28d6a2`, and #91 was `behind`.
- **Trial merges.** In a fresh clone (01:15:35Z), C merged with the base gave `d9ce3bf4`, the same tree as the
  reviewer's. Against that tree:
  - #42, #84, #85, #90, #92, #93 and #95 merge cleanly with and without C;
  - #75 and #86 have the same conflicts as on the base;
  - only #94 gains a conflict from C.
- **The synth claims** were read from the logs, not re-run.
- **Two flaws in the original fix,** corrected above:
  - the description has no #94 line to "keep";
  - the #42 sentence should be replaced with ruling 2c, not just deleted.

### S3 (ci-infra-r3-ci-infra-r3-S1). The deadline section never says what C's own merge does: a change to dependabot.yml on the default branch starts Dependabot within seconds, which closes #89 and supersedes #88 under the new configuration

Also raised by security-supply as SS3-S1 (S2 there).

**Where:** PR #91 description, "Must merge before Dependabot's next npm run";
`docs/runbooks/dependency-upgrades.md:47-74` at 651f8b80. Step 1 reads the runs only "once a week, after Thursday's npm
batch" (`:47`).

**Scenario:** C merges into `claude/build-platform`, the default branch since about 2026-10-26T23:03Z, on 11-02 or
11-03. Within about 10 s Dependabot starts these jobs, all under the new file:
- an npm version job, and probably docker and actions version jobs;
- a "recreate" job for each open group pull request.

What follows:
1. **#89's recreate** rebuilds minor-and-patch, which now excludes `@aws-sdk/*`. Its dependency set differs from #89's
   ten, so Dependabot closes #89 ("dependencies changed") and opens a new minor-and-patch pull request, with stripe and
   any other minor that is due.
2. **#88's recreate** finds `aws-cdk-lib` 2.275.0, and the CLI 2.1147.0 after 11-02T18:57Z. A new aws-cdk pull request
   supersedes #88.
3. **The version job** still lists #89, so its nine `@aws-sdk` packages are marked handled and it opens no aws-sdk pull
   request. Security-supply r1's P1 is right for this job.
4. **On 11-05,** if B has not merged, no open pull request holds `@aws-sdk` any more, so an aws-sdk pull request opens.

Design §8.8 has the outcome right. But #89 is closed and replaced under a new number, not "refreshed down to stripe",
and it happens at C's merge, not on 11-05. B (#94) says it "replaces Dependabot #88 and #89", and §8.8 closes #88 and
#89 when B merges, so the successors would stay open.

**Case (a): C not merged by 11-05, with #87 to #89 open.** The version job opens nothing. The old minor-and-patch holds
all 63 direct dependencies, and an open group pull request marks every member handled. The misrouting comes from
#89's recreate instead:
- it rebuilds minor-and-patch from all 63;
- it also takes exact names such as `aws-cdk-lib`, which #88's recreate proposes too.

The description's claim is true in effect, but neither the description nor the runbook explains either part.

**Evidence:**
- **dependabot-core 85379652** (blobless clone, 01:50Z):
  - `group_update_all_versions.rb:86-104`: open group pull requests are marked handled first.
  - `dependency_snapshot.rb:215-244`: marking adds the group's current members plus the open pull request's
    dependencies. The defer at `:246-251` applies only under an experiment absent from the 10-29 job definition
    (`job.log:72`).
  - `group_update_creation.rb:122` and `:363-372`: a recreate iterates every group member and ignores the handled list.
  - `pattern_specificity_calculator.rb:64-65`: a group with no patterns is never filtered.
  - `dependency_change.rb:141-148` and `group_update_refreshing.rb:54-68`: a different dependency set means close and
    create; changed versions mean supersede.
- **Precedents** (`gh api actions/runs?event=dynamic`, 01:54Z; job logs read 01:57Z):
  - **#27's merge `220f2b4e`** changed only `.github/dependabot.yml` (groups and limits) and the PR template. It reached
    the then-default `main` at 2026-10-20T22:24:06Z. Runs started at 22:24:13Z to 22:24:15Z:
    - npm, docker and actions version jobs, including 39507843042;
    - recreate minor-and-patch 39507847707, which logged "Updating pull request".
  - **#18's merge `8d7acce3`** (2026-10-18T16:28:53Z) was followed by version 39145193782 at 16:29:00Z and recreate
    39145194733 at 16:29:01Z. The recreate logged "Dependencies have changed, closing existing Pull Request ... Creating
    a new pull request for minor-and-patch" at 16:32:38Z.
  - **#48 (`e908c214`)** merged before `claude/build-platform` became the default, and got only conflict recreates.
- **Base pushes recreate nothing.** #87, #88 and #89 are `behind`, with `updated_at` 10-29 (02:03Z). The base pushes
  `bce57f16` and `43565235` recreated none of them. C changes no manifest, so only the configuration change would
  trigger one.
- **The documentation.** github/docs `33b1f4a6`, `options-reference.md:743-748`, lists only schedule, reopen,
  target-branch and conflict as triggers. Push times before 10-27 cannot be verified (the events API).

**Fix (the skeptic's corrected fix):** Rewrite "Must merge before Dependabot's next npm run" in three short parts, and
add one runbook line.
1. **On merge.** GitHub starts Dependabot when `.github/dependabot.yml` changes on the default branch, within about
   10 s.
   - Precedents: #27 merged at 2026-10-20T22:24:07Z, with version run 39507843042 at 22:24:13Z and recreate run
     39507847707 at 22:24:15Z; #18 merged at 16:28:53Z, followed by runs 39145193782 and 39145194733.
   - Each ecosystem gets a version job, and open group pull requests are recreated.
   - **#89** is closed ("dependencies changed"). A new minor-and-patch pull request opens with stripe 23.1.0 and any
     other minor or patch among its 44 members. Security-supply S2's skeptic adds that #89 may be closed with no
     successor if nothing is due.
   - **#88** is superseded by an aws-cdk pull request with `aws-cdk-lib` 2.275.0, plus CLI 2.1147.0 once that is past
     cooldown after 2026-11-02T18:57Z.
   - **The version job** opens no aws-sdk pull request while it lists #89 (`dependency_snapshot.rb:219-243`).
2. **If this has not merged by 11-05.**
   - While #89 is open, the version job opens nothing (`group_update_all_versions.rb:86-110`).
   - The misrouting comes from any recreate of #89: the schedule's rebase check (options reference `:743-748`), or a
     push that puts #89 in conflict.
   - That recreate rebuilds minor-and-patch from every direct dependency (`group_update_creation.rb:122, :363-367`;
     `pattern_specificity_calculator.rb:64-65`). It closes #89 and opens a pull request that again holds `@aws-sdk/*`
     and exact names such as `aws-cdk-lib`.
3. **After the merge, the same day.**
   - List the `event=dynamic` runs created from the merge time. Use
     `gh api "repos/PureTideWater/PhysicalTherapy/actions/runs?event=dynamic&head_sha=<merge sha>"`; the MCP
     `actions_list` has no dynamic filter (security-supply S2's skeptic).
   - Read the npm version and recreate logs: there should be no "belongs to more specific group" line and no "groups
     where no dependencies match" line.
   - Record in the status file and in #94's description which bot pull requests Dependabot closed and which it opened.
   - When B merges, close a successor with the §8.8 comment only if B's merged tree already holds every version it
     proposes. B's CLI 2.1146.1 does not replace an aws-cdk successor carrying 2.1147.0.

**Runbook,** one line before step 1 (after `:47`): "A merge that changes .github/dependabot.yml starts each ecosystem's
version job, and a recreate of every open group pull request, within seconds (#27's merge, 2026-10-20). Read those runs
as step 1 says, on the day of the merge, and note which bot pull requests were closed or replaced."

**Skeptic:** Confirmed, 2026-11-02 03:11Z to 03:19Z. Checked read-only: `git show` at 651f8b80, dependabot-core 85379652
in a blobless clone, `gh api`, and job logs under `review-C/tmp/refute-s1`.
- **The claim holds.** A dependabot.yml merge starts Dependabot at once. Under C's file, #89 is closed and replaced, not
  refreshed. Stripe 23.1.0 is past cooldown (published 2026-10-29T19:58:14Z), and so is `aws-cdk-lib` 2.275.0
  (published 2026-10-26T19:32:02Z).
- **Inferred, not verified.** That #88 gets its own recreate job is inferred: each precedent had only one open group
  pull request.
- **Corrections, applied above:**
  - "within 7 s" becomes "about 10 s" (the recreates came 8 s to 9 s after the merge);
  - case (a) now names what triggers #89's recreate;
  - "B closes the successors" is narrowed. B takes CLI 2.1146.1 and `^3.1160.0`, while a successor may carry 2.1147.0
    or 3.1161.0 (published 2026-10-30T18:46:51Z).

### S4 (ci-infra-r3-ci-infra-r3-S2). The O9 sizing question C's capacity gate raised is not recorded in the description

Also raised by security-supply as SS3-S2 (S3 there). This supersedes the fix in N4.

**Where:** PR #91 description, `## Checks`. Also `docs/runbooks/screening-capacity.md:101-103`, which C does not
change.

**Scenario:** C has to merge the base in, now `877e662f`. Its `packages/synth/src/cases/matrix.ts` is a watched path
(`watched-paths.txt:463`), so capacity runs again. It is likely to print the same sizing warning: C changes no
consumer code, and the numbers are runner noise.

A reader of `screening-capacity.md:101-103` ("the builders take it to the founder before merge") sees two problems:
- the 01:02Z ruling is headed "on O9 for #94";
- C's description does not mention the warning.

The deadline pull request could then stall, or merge with no record against a runbook rule.

**Evidence:**
- **The gate.** Job 124944504688 (`screening-capacity gate`, run 41337319198, head 651f8b80, success) printed at
  2026-11-01T18:53:26Z: "the worst time, S4#1 S4-1's 52.7 s (the middle of S4's three runs), is above 44 s: the
  consumer's size goes to the founder before merge". TIME_WARNINGS lists S4-1 52.7 s, S4-2 51.9 s and S4-3 48.5 s.
  Read with `get_job_logs` at 01:59Z, and by the skeptic at 03:19Z.
- **The runbook.** `screening-capacity.md:101-103` at 651f8b80 reads "the builders take it to the founder before merge
  as a question of the consumer's size (open item O9)".
- **The ruling.** `lane-b-dependabot-batch-status.md:33-36`: O9 is "a standing founder item that blocks the screening's
  launch, not a merge". Issue #41 is open, labelled `revisit`.
- **The description.** `gh api .../pulls/91 --jq .body | grep -ci 'O9|sizing|#41'` returned 0 (security-supply
  skeptic, 03:22:49Z).

**Fix (the skeptic's corrected fix):** Do this in the push that merges the base, not as a separate step.
1. Add a `## Checks` row naming the gate job on the head that merges:

   > `screening-capacity gate` (job <id on the merged head>; on 651f8b80, job 124944504688): passed. It raised the
   > sizing question (O9): S4's middle run, worst time <t> s (52.7 s on 651f8b80), above the 44 s line. This pull
   > request changes no consumer code; its only watched path, `packages/synth/src/cases/matrix.ts`, changes CI-12's
   > assertion text only. Recorded under Lane B's orchestrator ruling of 2026-11-02 01:02 UTC, as already applied to
   > #90: O9 is a standing founder item that blocks the screening's launch, not a merge (issue #41).

2. Add one line under "What waits on a person (none blocks this merge)": "O9, the consumer's size (issue #41), carried
   by the orchestrator in the founder list."
3. Send the orchestrator no new question. Add "Applied the 01:02Z O9 ruling to #91 as written" to the status file, as
   was done for #90 (`:236`).

**Skeptic:** Partly refuted, 03:19Z to 03:21Z. The main defect is confirmed, but the finding overstates the gap.
- **Confirmed:**
  - the gate raised the sizing question on this head;
  - the description has no capacity row and no "O9", "#41" or "Sizing";
  - the runbook still says "before merge";
  - every new head reruns capacity.
- **Refuted:** "no recorded path to merge". The ruling's operative words are general. The session already applied it
  to #90 (status `:236`), and it is stated generally elsewhere:
  - the Lane A handoff, `lanes/lane-b-handoff-to-lane-a-2026-11-03.md:233` and `:263`;
  - LANES.md's claim row, `:204`, the 02:35 UTC entry: "a founder item that blocks launch, not merges (issue #41)".
    The writer read this at 03:30Z.

  So asking the orchestrator to "confirm or widen" adds a round trip that changes nothing.
- **Corrected:**
  - the base is now `877e662f` (`merge-tree` clean);
  - the row must cite the gate on the head that actually merges, not 124944504688.
- Severity S stands. It is the same description gap that kept #90 NOT VERIFIED (status `:235-237`).

### N1 (ci-infra-r1-C-CI-N1). No test pins two rules of the CI-12 model: the applies-to filter, and an exact name scoring 1000

**Where:** `tools/test/dependabot-config.test.ts:81` (exact name 1000) and `:88` (the version-updates filter) in the
model. The test that pins the model is at `:211-237`. The doc comment claims both rules at `:62` and `:70`.

**Scenario:** Two mutants pass all 10 tests:
- mutant 9 removes the version-updates filter at `:88`, so the `security` group joins the competition;
- mutant 6 makes an exact name score 500 at `:81`.

A wrong port of either rule goes unnoticed. In this file `'*'` scores 1 and exact names never compete with each other,
which hides both rules.

**Evidence:** 12 hand mutants of the model, run in a copy (`tools/test/review-mut.test.ts`, 21:19:15Z;
`review-C/mutate-model.py`).
- Killed: 0, 1, 3, 5, 7 and 10.
- Survived: 2, 4, 8 and 11, which are equivalent in this model, and 6 and 9, which are not.

Adding the two cases below (`review-C/add-cases.py`, `review-C/tmp/with-cases.test.ts`) made 6 and 9 fail with
"[ first ] != [ first, second ]" and "[ a, s ] != [ a ]". The head stayed at 10 of 10 (21:23:10Z).

**Fix:** Add to the test at `:211-237`:
- `expect(dependabotMembers({ a: { patterns: ['x'] }, s: { 'applies-to': 'security-updates', patterns: ['x'] } }, 'x')).toEqual(['a']);`
  Only version-update groups take part.
- `expect(dependabotMembers({ first: { patterns: ['x'] }, second: { patterns: ['x'] } }, 'x')).toEqual(['first', 'second']);`
  An exact name scores 1000 and is never given up.

**Skeptic:** Confirmed as a nit. Not verified by a skeptic; the fix round checks it.

### N2 (ci-infra-r1-C-CI-N2). The description misstates the routing counts and two cited facts

**Where:** PR #91 description:
- "Evidence": `aws-sdk` 10, `minor-and-patch` 43;
- "Root cause": "an exclude-pattern match is checked first, `:67`";
- "What it does not change": #42 and ADR 0066.

**Scenario:** The founder's evidence table is wrong in three places:
- **The counts.** It says `aws-sdk` holds 10 direct names and `minor-and-patch` 43, while the same paragraph says "the
  nine `@aws-sdk/*`". The workspace has 9 `@aws-sdk/*` direct names, so the right counts are 9 and 44.
- **The order of checks.** In `contains?`, explicit membership is checked first (`dependency_group.rb:66`) and the
  exclusion second (`:67`).
- **#42.** The description says #42 shares ADR 0066 with this pull request. #42 shares only `test-matrix.md` and synth
  `matrix.ts`.

**Evidence:**
- The counts:
  - A scan of the manifests from `pnpm-workspace.yaml`'s globs gives 63 names, 9 of them `@aws-sdk/` (21:2xZ).
  - The checker's own `build-c/logs/check-route-head.tsv` counts aws-sdk 9 and minor-and-patch 44.
  - `review-C/r2-scripts/route-table.txt` (21:51Z) gives the same.
- PR #89's files hold the same 9 names.
- `dependency_group.rb:66-67` at 85379652.
- `git diff --name-only bce57f16 origin/co-001/pr-06b-mail-streams` against C's 7 files finds only `test-matrix.md`
  and `matrix.ts` in common.

**Fix:** In the description:
- "aws-sdk 9 … minor-and-patch 44";
- "an explicit member is kept first (`:66`), then an exclude-pattern match excludes (`:67`)";
- "No file of #42's except test-matrix.md and synth matrix.ts (rule 6)".

N6 replaces the counts with a full table.

**Skeptic:** Confirmed as a nit. Not verified by a skeptic; the fix round checks it.

### N3 (ci-infra-r1-C-CI-N3). The ADR 0066 amendment cites #89 for `@next/eslint-plugin-next`, which #89 does not contain

Also raised by security-supply as security-supply-r1-N5 (N6 there). That fix also extends "Revisit when".

**Where:** `docs/adr/0066-…-pin-every-dependency.md:735-736`.

**Scenario:** The amendment says run 40818560725 "put the nine `@aws-sdk/*` packages and `@next/eslint-plugin-next` in
minor-and-patch (#89)". A reader who opens #89 finds only the nine `@aws-sdk/*` and stripe. The run assigned
`@next/eslint-plugin-next` to the group but had no update for it, so it is not in that pull request.

**Evidence:**
- `pull_request_read get_files` #89 lists these manifests, plus `pnpm-lock.yaml`, and no `@next/*`:
  - `apps/web`, `apps/worker` and `infra`;
  - `packages/billing`, `contracts`, `db` and `model-gateway`.
- The Dependabot log (job 123265353642) has "Skipping @next/eslint-plugin-next for group 'next' - belongs to more
  specific group 'minor-and-patch'". The reviewer cites it among lines 45-111 of the API copy; the security-supply copy
  has it at `:160`.
- `dependabot.yml:48-51` already says this correctly: "lost their packages to minor-and-patch".

**Fix:** Reword to "…put the nine `@aws-sdk/*` packages in minor-and-patch's pull request (#89) and assigned
`@next/eslint-plugin-next` to minor-and-patch too, …". Security-supply N6 gives the same wording, with the "Revisit
when" extension.

**Skeptic:** Confirmed as a nit. Not verified by a skeptic; the fix round checks it.

### N4 (ci-infra-r1-C-CI-N4). The Checks section omits the capacity run's O9 sizing question

**Superseded by S4,** written after the 01:02Z ruling. Recorded here because it was raised first.

**Where:** PR #91 description, "Checks"; `docs/runbooks/screening-capacity.md:101-110`.

**Scenario:** `matrix.ts` is watched, so the capacity harness ran for 17 minutes. The gate passed, with:
- three "Time (advisory)" warnings;
- "Sizing question (O9): the worst time, S4#1 S4-1's 52.7 s … is above 44 s".

The template asks for "anything that did not pass, with why".

**Evidence:**
- Changes job 124939778371: "watched: packages/synth/src/cases/matrix.ts".
- Gate 124944504688 printed SIZING and TIME_WARNINGS at 18:53:26Z.
- The base push run 41330911481, gate 124925144110, shows S4#2 S4-1 at 52.3 s. So this is a standing condition, not
  caused by this pull request.

**Fix:** Use S4's corrected row.

**Skeptic:** Confirmed as a nit. Not verified by a skeptic; S4's skeptic checked the same facts at 03:19Z.

### N5 (ci-infra-r1-C-CI-N5). The runbook's new closing line sends the weekly triage record to a place a routine triage does not have

**Where:** `docs/runbooks/dependency-upgrades.md:108`.

**Scenario:** The line reads "Each triage is recorded in the item's design (`designs/` on build-ops), steps 1-6 in
order." It fails a routine triage in three ways:
- a routine Thursday triage has no item, so no item design;
- after launch, build-ops may be gone;
- it is the only reference to build-ops in `docs/runbooks`.

Whoever runs the next triage (2026-11-05) cannot follow the step as written.

**Evidence:** `grep -rn build-ops docs/runbooks/` finds only `:108`. The routing scout's §5
(`designs/lane-b-dependabot-batch/scout-routing.md`) proposed "record each weekly triage in the build's status file".

**Fix:** "Record each weekly triage, steps 1-6 in order, in the build's status file (or the item's design when the
triage belongs to an item)." Better still, name one durable place in the repository.

**Skeptic:** Confirmed as a nit. Not verified by a skeptic; the fix round checks it.

### N6 (ci-infra-r2-C-ci-r2-N1). The description gives group counts, not design §8.3's routing table of every direct dependency

Also raised by security-supply as security-supply-r2-N1 (N7 there).

**Where:** PR #91 description, "### Evidence: npm run 40818560725", last bullet. Design §8.3 asks for "C: root cause
with dependabot-core cites, the failing-first evidence, the routing table of every direct dependency". §8.6's
verification re-runs "the routing table".

**Scenario:** Both the founder's approval and §8.6's fresh-clone verification compare against a per-dependency table,
and neither can check a dependency's group from the description. The counts it gives instead are wrong (N2), so a reader
cannot tell which `@aws-sdk` name is "the tenth".

**Evidence:** The test's own first-match owner rule (`dependabot-config.test.ts:204`, which the test asserts equals
`dependabotMembers`) was run over the test's `directDependencies()` at 651f8b80
(`review-C/r2-scripts/route-table.mjs`; output `route-table.txt`, 21:51Z, re-read 03:32Z). The 63 names route as
follows:

| Group | Count | Members |
| --- | --- | --- |
| browser-tests | 3 | `@axe-core/playwright`, `@playwright/test`, `playwright-core` |
| anthropic-sdk | 1 | `@anthropic-ai/sdk` |
| pg-boss | 1 | `pg-boss` |
| next | 2 | `@next/eslint-plugin-next`, `next` |
| aws-sdk | 9 | `client-bedrock-runtime`, `client-cognito-identity-provider`, `client-kms`, `client-rds`, `client-s3`, `client-sesv2`, `client-sts`, `client-textract`, `s3-request-presigner` |
| aws-cdk | 3 | `aws-cdk`, `aws-cdk-lib`, `constructs` |
| minor-and-patch | 44 | every other name |

**Fix:** Replace the counts with the table: group, count and every member, under a `<details>` block if length matters.
Say it was generated from the test's model on the head commit, and that it matches the Ruby port (security-supply N7).

**Skeptic:** Confirmed as a nit. Not verified by a skeptic; the fix round checks it.

### N7 (ci-infra-r2-C-ci-r2-N2). The Checks table omits the §8.5 commands that CI ran green on 651f8b80

Also raised by security-supply as security-supply-r2-N2 (N8 there).

**Where:** PR #91 description, `## Checks` table. Design §8.3 asks for "The §8.5 commands as table rows, each with its
result on the head commit".

**Scenario:** From the description alone, a reviewer cannot tell whether any of these ran on this head:
`test:golden`, `test:oracle`, the four `test:db` shards, build and e2e, or `licenses:check`. The template asks for "each
command run on the head commit and its result".

**Evidence:**
- **CI on 651f8b80 ran all of them green.**
  - The static job 124939777586 (`static.log:731-822`) logged:
    - `pnpm test:golden`: 5 files, 376 tests;
    - `pnpm test:oracle`: agrees with pyx12 on all 687 synthetic 835 fixtures;
    - `pnpm licenses:check`: 185 production packages.
  - db (1/4) 124939777667, (2/4) 124939777695, (3/4) 124939777562 and (4/4) 124939777659.
  - build 124939777735.
  - e2e (1/2) 124940446935 and (2/2) 124940446916.

  Read with `get_check_runs` at 21:51Z.
- **The rows the table does have are sound.** These are logged on 651f8b80 in `build-c/logs/integ-*.log`
  (18:24Z to 18:32Z):
  - lint (1,676 files);
  - `lint:logs` (1,086);
  - both `actions:check` runs.
- **`pnpm test` reconciles with CI**, 6,897 tests in both runs:
  - locally 6,893 passed and 4 skipped;
  - in CI 6,896 passed and 1 skipped.

  The difference is `differential.test.ts`'s `describe.skipIf` (`:383`): 3 tests skipped locally, which CI runs.
  `workflows.test.ts` has 1 skip in both.
- **The failing-first rows reproduce on 651f8b80** (`review-C/r2-scripts/failing-first-rows.log`, 21:47:19Z to
  21:47:22Z): "extra aws-sdk pattern: 2 fail" and "constructs dropped: 3 fail".

**Fix:** Add rows for `test:golden`, `test:oracle`, `test:db` 1/4 to 4/4, build, e2e 1/2 and 2/2, and `licenses:check`,
citing the CI jobs above. Cite them on the head that merges. Add one sentence explaining the 4 local skips against 1 in
CI. The capacity row is S4's.

**Skeptic:** Confirmed as a nit. Not verified by a skeptic; the fix round checks it.

### N8 (ci-infra-r2-C-ci-r2-N3). The new runbook step-2 item treats closing a bot pull request as having no effect, but closing an ungrouped one makes later runs skip that exact version

Also raised by security-supply as security-supply-r2-N3 (N9 there), with this repository's own Dependabot replies as
evidence.

**Where:** `docs/runbooks/dependency-upgrades.md:72-74` at 651f8b80.

**Scenario:** An ungrouped Dependabot pull request arrives, for example a major of a dependency that is not ignored,
which none of the minor/patch groups takes. The build closes it after a replacement that did not take that exact
version: it took an older one, took only part of it, or was later reverted. Dependabot then never proposes that version
again; it waits for a newer one. Nothing in `@dependabot show ... ignore conditions` shows why.

**Evidence:**
- **The job definition.** In the 2026-10-29 job definition (`review-C/tmp/secsup-runlog/job.log:72`),
  `"existing-pull-requests"` lists #16 (typescript 7.0.2) and #17 (`@types/node` 26.6.5).
- **#16 was closed unmerged** on 2026-10-18T16:29:18Z (`list_pull_requests`, head
  `dependabot/npm_and_yarn/typescript-7.0.2`, merged false). So GitHub's service keeps passing a closed, unmerged pull
  request as an existing one.
- **dependabot-core.** In 85379652, `update_all_versions.rb` `pr_exists_for_latest_version?` (about `:298-310`) returns
  true when any existing pull request names the dependency at its latest version.
- **Grouped pull requests** were not verified: `existing-group-pull-requests` was `[]` on 10-29.
- **No documentation.** github/docs `33b1f4a6` does not document what a plain close does.
- **Harmless for this batch.** A takes 1.3.0, the same as #87, and B takes newer versions than #88 and #89.

**Fix:** Extend the item: "… closes the bot's with a comment naming it and its merge commit, once it merges (never
`@dependabot ignore`). Closing an ungrouped Dependabot pull request makes later runs skip that exact version (GitHub still
passes it as an existing pull request), so close one only when the replacement took that version or a later one."
Security-supply N9 adds a step-6 sentence.

**Skeptic:** Confirmed as a nit. Not verified by a skeptic; the fix round checks it.

### N9 (ci-infra-r2-C-ci-r2-N4). Neither the description nor runbook step 1 says which Dependabot updater build ran or will run, and the image is chosen server-side for each run

Also raised by security-supply as security-supply-r2-N5 (N11 there), which adds the ADR's "Revisit when".

**Where:**
- `docs/runbooks/dependency-upgrades.md:49-63` (step 1) at 651f8b80;
- PR #91 description, "### Root cause";
- `tools/test/dependabot-config.test.ts:61` ("ported from dependabot-core 85379652").

**Scenario:** Dependabot changes its group engine before a later Thursday run. CI-12's model is pinned to 85379652 and
still passes, and nobody notices that the updater which ran was different.

**Evidence:**
- **What ran on 10-29.** `job.log:52` shows the run pulled `ghcr.io/dependabot/dependabot-updater-npm:dec480ad2c48`.
- **What `dec480ad` is.** In a blobless clone of dependabot-core (21:39Z), `dec480ad` is "Merge 96a0da19 into
  a887b963", a pull-request merge commit.
  - It is not an ancestor of 85379652. Its only commit off main changes `.github/labeler.yml`.
  - `a887b963` is an ancestor of 85379652.
  - `git diff --name-only dec480ad 85379652` lists 193 files, none under `updater/`, `common/` or `npm_and_yarn/`.

  So the routing files are identical for the run that produced the evidence.
- **The image is not fixed in advance.** dependabot-action `efdd1e48`, `main.ts:78-80`: "The dynamic workflow can
  specify which updater image to use" (`inputs.ts:88`). The action's pinned npm image was `v2.0.20261025165412` at
  `efdd1e48` and is `v2.0.20261028180830` on main `de7cd8d3`. Neither is what ran.
- **Recent changes to the routing files:** `dependency_group.rb` and the engine in `d4875a1a` (2026-08-07), the
  calculator in `b74d9cfd` (2026-07-14), `wildcard_matcher` in 2023.

**Fix:**
- In step 1, add: "Note the updater image in the npm run's log ("Pulling image
  ghcr.io/dependabot/dependabot-updater-npm:<sha>"). When it differs from the last triage's, compare
  dependency_group.rb, dependency_group_engine.rb, pattern_specificity_calculator.rb and wildcard_matcher.rb at that sha
  with 85379652, the commit CI-12's model ports."
- In the description's root cause, add: "run 40818560725 used updater dec480ad (a887b963 plus a labeler-only commit),
  whose updater/, common/ and npm_and_yarn/ equal 85379652's".

Security-supply N11 gives the `git diff --quiet` form and the ADR line.

**Skeptic:** Confirmed as a nit. Not verified by a skeptic; the fix round checks it.

### N10 (ci-infra-r2-C-ci-r2-N5). "Since September 2025" lists #13714, which merged in December 2025

Also raised by security-supply as security-supply-r2-N4 (N10 there). That finding adds that the behaviour was behind an
experiment until 2026-05-19; use its wording.

**Where:** PR #91 description, "### Root cause", the bullet "This has been Dependabot's behaviour since September 2025
(dependabot-core #13044, #13098, #13180, #13714)". The same sentence is in design §6.1.

**Scenario:** A reader who checks the citation finds that one of the four pull requests is three months later than the
sentence implies.

**Evidence:**
- #13044, `6a5b2b40`, merged 2025-09-11. It added `PatternSpecificityCalculator`, with `NO_PATTERNS_SCORE = 500` and the
  `>= 1000` cut-off.
- #13098, `3cc43e4d`, merged 2025-09-18 (scoring in the engine).
- #13180, `d615738a`, merged 2025-09-26.
- #13714, `fafb34ec`, merged 2025-12-18. It added the update-types and applies-to filter.

**Fix:** Take security-supply N10's sentence. It covers this date and the experiment gate.

**Skeptic:** Confirmed as a nit. Not verified by a skeptic; the fix round checks it.

### N11 (ci-infra-r3-ci-infra-r3-N1). The ADR 0066 header item (build check P1) is left to "whichever of this and #86 merges second", but C and #86's fix-round head merge cleanly, so nobody will ever resolve that line

**Where:**
- ADR 0066's header Date line, `:31` at 651f8b80. The finding cited `:28`: that is where `git merge-tree` places the
  conflict with #86's PR head, and at the head itself `:28-30` is the Part 5 bullet (the writer, 03:31Z; security-supply
  S1's skeptic).
- PR #91 description: the Reviewer table row "P1 … Deferred", and the Merge order bullet on #86.

**Scenario:** #86 pushes its fix round, built on WIP `d257fe6d`, which already resolves its conflicts with the base. C
then merges with no conflict in ADR 0066. The header's Date line stays "2026-10-25; Parts 2 and 3 2026-10-26; Part 5
2026-10-28; N32 2026-10-28" with no 2026-11-01 amendment, because the resolution step meant to add it never happens.
The description's merge-tree cites with `83167b8f` are already out of date for the head #86 will merge.

**Evidence:**
- `git merge-tree --write-tree` of `d257fe6d` with 651f8b80, and with base + C, is clean: tree `4c03c9bf` (01:58Z).
  `d257fe6d` contains `43565235`.
- The merged ADR header (lines 3-30) lists Parts 1-5 and N32, but not C's subsection (`:731-741` at 651f8b80).
- On that tree (trial `b5cb4e39`, 02:09:41Z), CI-12 and `workflows.test.ts` passed: 2 files, 134 tests, including the
  simulated Dependabot rewrite.
- Security-supply r3 got the same on base `4eaf7124` + `d257fe6d` + C (tree `b25c0912`, 02:35Z to 02:36Z).

**Fix:** Decide P1 in C itself. Either:
- add C's amendment to the header's Date line ("; Part 2 amended 2026-11-01") when C merges the base in after #86; or
- record in the Reviewer table why the header stays as it is.

In "Merge order", replace the `83167b8f` merge-tree text with a re-run against #86's pushed head just before the merge.

**Skeptic:** Confirmed as a nit. Not verified by a skeptic; the fix round checks it.

### N12 (ci-infra-r3-ci-infra-r3-N2). The Reviewer table lists `security-reviewer` as "Not run", yet the design runs the security and supply-chain review with that agent's brief as its own row, and that review has run

Also raised by security-supply as SS3-N2 (N13 there).

**Where:** PR #91 description, `## Reviewer agents' findings`:
- the row "`payment-engine-reviewer`, `security-reviewer`, `edi-reviewer` | Not run";
- "Their findings will be added here".

**Scenario:** A founder reading the record sees "security-reviewer: Not run" on a supply-chain configuration change. In
fact:
- design §8.4.4 (`:766`) gives the security and supply-chain review `.claude/agents/security-reviewer.md`;
- §8.4.5 (`:784-785`) says it "still runs (item 4) and is its own row";
- that review ran three rounds, and this one three.

The template (`pull_request_template.md:45-47`) asks for "one row per finding" of the agents that ran.

**Evidence:**
- PR body (`pull_request_read get`, 01:47Z and 03:31Z);
- design `:766` and `:784-785`;
- template `:39-51` at `43565235`;
- `review-C/progress/security-supply-r1` to `-r3` and `ci-infra-r1` to `-r3`.

**Fix:**
- Add a row group "Security and supply chain (adversarial, with `.claude/agents/security-reviewer.md`)" and a "CI and
  test infrastructure" row group, one row per finding with its resolution.
- Change the `security-reviewer` cell to "Run as the security and supply-chain review (rows above)".
- Keep payment-engine and EDI as "Not run".

**Skeptic:** Confirmed as a nit. Not verified by a skeptic; the fix round checks it.

### N13 (ci-infra-r3-ci-infra-r3-N3). The Checks table blames the "icudtl.dat Input/output error" line on "the local browser cache"; it is a test's deliberate output

Also raised by security-supply as SS3-N3 (N14 there).

**Where:** PR #91 description, `## Checks`, the `pnpm test` row.

**Scenario:** A reviewer, or the next builder, treats a real local cache fault as noise, or spends time on a cache that
was never involved. The line is the expected stderr of a passing test, and it appears on GitHub's runner too.

**Evidence:**
- `tools/ci/browser-build.test.ts:444-460` at 651f8b80 writes a fake `sha256sum` that prints "sha256sum: $file:
  Input/output error" for `*/icudtl.dat`. The test is "fails by name when sha256sum fails on a file inside the image"
  (CI-5, SEC-3).
- CI's unit job log for 651f8b80 (`review-C/tmp/logs-unit/unit-full.log:781`, 2026-11-01T18:36:33Z) prints
  "sha256sum: chrome-headless-shell-linux64/icudtl.dat: Input/output error". The next line is
  "tools/ci/browser-build.test.ts (29 tests)".
- `build-c/logs/integ-test.log:12` has the same line.

**Fix:** "The `sha256sum: …/icudtl.dat: Input/output error` line is the stderr of browser-build.test.ts's own failing
sha256sum (tools/ci/browser-build.test.ts:444-460); CI's unit job prints it too."

**Skeptic:** Confirmed as a nit. Not verified by a skeptic; the fix round checks it.

### N14 (ci-infra-r3-ci-infra-r3-N4). The second "Why" bullet credits the item's correction 2 with a CI-12 finding it does not contain

Also raised by security-supply as SS3-N4 (N15 there).

**Where:** PR #91 description, `## Why`, bullet 2.

**Scenario:** A reader checks the cited record. Correction 2 names only the file's comment (line 48), and it says "Exact
names kept their groups", which this pull request itself shows to be wrong. The source for CI-12's first-match
assumption is the design (§6.1, §6.3), not the correction.

**Evidence:** Correction 2 is in the status file, at `:76-80` today (the reviewer cited `:70-75`; the file has grown
since; the writer re-read it at 03:33Z). It names the run's lines 168-226, 160 and 2367, and says "The file's comment
… (line 48) is false for wildcard patterns". It does not mention CI-12.

**Fix:** "The item's correction 2 found the misrouting and the false comment (dependabot.yml:48). The design (§6.1,
§6.3) found that CI-12 assumed GitHub's documented first-match rule too, and that exact names sat in two groups."

**Skeptic:** Confirmed as a nit. Not verified by a skeptic; the fix round checks it.

## Refuted findings

None. Every finding this lens raised was confirmed. The skeptics corrected four of them:
- **S1.** The fix now gives the resolution as the file's exact wrapped lines. Severity S was kept, although the
  skeptic thought N fair. The security-supply skeptic rerated its duplicate N.
- **S2.** The fix adds the #94 line rather than "keeping" it, and replaces the #42 sentence with ruling 2c instead of
  deleting it. Use security-supply S1's corrected text, which pins no heads.
- **S3.** "Within 7 s" becomes "about 10 s". Case (a) now names what triggers #89's recreate, and closing successors is
  narrowed to those B fully replaces.
- **S4.** The "no recorded path to merge" half is refuted, because the ruling is general and was applied to #90. So the
  fix records the warning and sends no question to the orchestrator.

## What I checked and found sound

### CI-12 against Dependabot (r1, 21:10Z to 21:23Z)

- **Red and green.**
  - CI-12 passes 10 of 10 on the head (21:11:37Z).
  - With `CI_TREE` pointing at a copy holding `git show bce57f16:.github/dependabot.yml`, 3 of 10 fail (21:11:57Z): the
    group object, the exclusions, and the routing test on "@anthropic-ai/sdk: [anthropic-sdk, minor-and-patch]".
  - The test file is unchanged from `cd79ad7f` to `ae63d8c2`; `fe3158db` only widens the applies-to filter.
- **A new group fails the test.**
  - A new group `stripe` with `["stripe", "@stripe/*"]` and no exclusion: 3 fail (21:18:25Z).
  - The same group with SPECIFIC, the expected object and the intended map updated, but the YAML exclusion forgotten:
    3 fail (21:18:39Z). One failure reads "@stripe/react-stripe-js: [minor-and-patch] != [stripe]", the original bug
    again.
  - A group with an explicit `applies-to: version-updates` that matches no dependency: 2 fail (21:19:46Z), as the
    description says.
- **The model against dependabot-core 85379652** (also its origin/HEAD at 21:11:33Z), read line by line. The port
  matches.
  - `contains?` (`dependency_group.rb:64-70`): nil patterns match all, `[]` matches none, and the exclusion is checked
    after membership.
  - `from_job_config`'s applies-to filter (`:42-47`) and file order (`assign_dependency_to_matching_groups`,
    `:123-132`).
  - `eligible_groups`' update-types overlap (`:196-206`).
  - `can_check_specificity?` (`:121-126`), the `>= 1000` early return (`:111`) and the strict `>` (`:146`).
  - The scores 1000/1000/500/500/wildcard/1/0 (`:182-207`).
  - WildcardMatcher: lower-cased, quoted, `*` as `.*`, anchored.

  Of 12 hand mutants, 4 are equivalent in this model, and 2 survive (N1).
- **The 2026-10-29 evidence.** The Dependabot log of job 123265353642 (4,999 of 5,115 lines read) has:
  - ten "belongs to more specific group" lines: the nine `@aws-sdk/*` and `@next/eslint-plugin-next`;
  - exact names checked in both their group and minor-and-patch;
  - "Skipping pg-boss in group minor-and-patch as it has already been handled by a previous group";
  - "Skipping update group for 'aws-sdk'".

  This confirms the model, test 5 and the root cause.
- **Placement and records.**
  - The test is in the right Vitest project (unit, `tools/test`).
  - The test-matrix row, `matrix.ts:430` and `fixtures/synthetic/CI-12/expected.json` agree word for word with design
    §6.4.
  - `registry.ts:617` is unchanged, and its `assertedBy` names both test files.
  - `workspaceDirs` comes from `pnpm-workspace.yaml`, which `tools/typecheck/run.test.ts` holds equal to pnpm's own
    list. Importing it runs nothing (main is behind an argv guard).
- **Runbook step 1's claim holds.** Under the new file, no name is contained by two version groups, so any "belongs to
  more specific group" line means a misroute.

### CI on the head (r1, 21:15Z to 21:25Z)

There are 23 check runs.
- **The four required checks all passed:** `all green`, `mutation`, `screening-capacity gate` and `approval-of-record`.
  `approval-of-record` run 41337319197 was cancelled by concurrency when the description was edited, and its successor
  41337406033 passed on the same head.
- **unit** (124939777501): `dependabot-config.test.ts` 10 tests (log `:892`); `workflows.test.ts` 116 with 1 skipped,
  including the simulated rewrite. Totals: 404 files, 6,896 passed, 1 skipped.
- **static** (124939777586):
  - `synth --all` wrote 0 of 653 files, and `git diff` was clean;
  - typecheck, verify-content and licenses passed;
  - `toolchain:check` passed with 1 warning (pnpm 10.34.9).
- **mutation.** `affected.ts` gives "shards: none", so the Stryker matrix was skipped, correctly.
- **`cdk:diff`** only synthesized (no credentials; a standing warning).
- **`release-dry-run`** is correctly absent: its trigger paths do not match.
- **GitHub's own `.github/dependabot.yml` check** (run 124939537364): success, "Dependabot config file validation: All
  changes look good".

### Local reproductions (r1)

- `pnpm install --lockfile-only`: no diff (21:15:17Z).
- `pnpm synth --all`: 0 written, 653 unchanged, tree clean (21:15:26Z).
- `watched.ts --write`: `watched-paths.txt` unchanged. `matrix.ts` is watched (`:463`), which correctly triggered the
  capacity run.
- `vitest --project unit tools/test`: 21 files, 292 tests, as the description says (21:21:01Z).

### The updater that ran, the input set and the citations (r2, 21:38Z to 21:52Z)

- **The updater.** `dec480ad` is `a887b963` plus a labeler-only commit, and nothing under `updater/`, `common/` or
  `npm_and_yarn/` differs from 85379652. So the reviewed code is what ran on 10-29 (N9 for the future runs).
- **The model's input set.** The 63 names from `directDependencies()` at `83d71fd6`, the tree the 10-29 run read, are
  identical to the 63 names the engine logged in "Checking specificity for X in group" and "Checking if X needs
  updating". The head's set equals `83d71fd6`'s.
  - No name comes only from the catalog.
  - `@tp/*` and `@paidwhole/brand` are excluded on both sides.
  - The override target `qs` is transitive only.
- **The CDK sentence.** The runbook's `minimumCliVersion` sentence (`dependency-upgrades.md:331`) is accurate.
  `@aws-cdk/cloud-assembly-schema` 54.26.0 documents it as "the minimum version of the CLI here that supports reading
  this assembly", and `manifest.js` writes `cli-version.json`'s 2.1144.0.
- **The citations.** dependabot-core #13044, #13098, #13180 and #13714 exist and implement the cited behaviour (dates:
  N10).
- **The template.** All eight headings are present, and "The founder's approval" text is unedited.
- **The commits.** There are seven, each touching only the files its message names.

### Trial merges and the base moves (r1 to r3, and the writer)

- **r1.**
  - With #86 (`83167b8f`): the same 3 conflicted files as the base has.
  - With #42 (`6c28d6a2`): clean.
  - With `43565235`: clean, tree `d9ce3bf4`. On that tree, synth gave 265 cases, 657 unchanged, clean, and CI-12, synth
    and `watched.test.ts` passed: 15 files, 201 tests (21:15:59Z).
- **r2 (21:43Z to 21:50Z).** With #75, #84, #85, #90, #92, #93 and #95: synth-clean, tests green (S2 evidence). Every PR
  sharing a file with C was a draft, so the never-jump rule did not hold C back.
- **r3.**
  - **#92** at `b8654622`, then merged as `4eaf7124` at 02:14:46Z:
    - with C, clean (tree `418708a6`);
    - synth 269 cases, 0 written, 661 unchanged, clean;
    - CI-12, `packages/synth` and `tools/screening-capacity`: 22 files, 397 tests;
    - `watched.ts --write` no diff (`review-C/r3-scripts/trial92.log`, 01:48:52Z to 01:53:10Z).

    `4eaf7124` with 651f8b80 is clean (tree `9a7882b8`). That tree differs from the tested one only in `apps/web`
    sign-in files and ADR 0081.
  - **#86's fix-round WIP** `d257fe6d` with C is clean (N11 evidence).
- **Writer (03:31:58Z).** Against the current base `877e662f` (#93), C merges cleanly (tree `79f82b48`). Against #94,
  only the runbook conflicts (S1).

### The C x #94 resolution and the description's other sections (r3)

- **The resolution.** On the resolved paragraph (S1), tests, lint and synth are green. No test reads the paragraph: the
  quoted runbook headings appear only inside message strings. So the resolution rests on a person's read alone.
- **The freeze exception** is sound. Against `change-order-001.md:10` (rule 4) and `reconciliation-001.md:471-494`, a
  Dependabot configuration change is in neither the content pipeline nor the security program.
- **The open-pull-requests limit** is enforced by GitHub's service, not by dependabot-core (no limit logic in
  `operations/`; docs `options-reference.md:536-552`). The limit of 8 is not reached: at most 7 group PRs. Not verified
  live.

### Not verified

- The first 116 lines of the Dependabot job log.
- The lint and e2e job logs, which were not read line by line. Both checks are green, and the change is unrelated.
- Local `pnpm lint` and `pnpm typecheck`, which were not re-run (CI's lint and static jobs passed on the head).
- Whether GitHub keeps closed grouped pull requests in `existing-group-pull-requests`.
- Which updater image the 11-05 run will use.
- Whether all three open group pull requests are recreated on one configuration change.
- Whether docker and actions jobs run on an npm-only change.

## Proposals outside PR C's files (not built)

- **P1. `docs/runbooks/ci.md:204-214`** (r1 P1). "The weekly read of Dependabot's own runs" repeats dependency-upgrades
  step 1 but did not get the new signal. Add "Any `belongs to more specific group` line in the npm run's log means the
  routing broke (dependency-upgrades.md step 1; CI-12)", or point to step 1.
- **P2. `docs/runbooks/screening-capacity.md:101-103`** (r1 P2; S4's skeptic). Send the sizing question to the founder
  list (issue #41), as something that blocks the launch, not a merge, matching the 01:02Z and 02:35Z rulings. Every
  watched-path pull request and base push still shows S4 above 44 s: 52.3 s on base push 41330911481, 52.7 s on #91.
  #83's description also omitted it.
- **P3. Release C's wait for #86** (r3 P1, for the orchestrator). The 20:36Z rule orders only pull requests that
  conflict. C adds no conflict to #86's head `83167b8f`, and it merges cleanly with #86's resolved WIP `d257fe6d` (tree
  `4c03c9bf`, with CI-12 and `workflows.test.ts` green). Merging earlier also means the first live npm run on the new
  file happens at merge, days before 11-05, with time to react (S3).
- **P4. #94, design §8.8 and the status file** (r3 P2). Plan for Dependabot closing #88 and #89 and opening successors
  as soon as C merges (S3).
  - B's description should name the successor pull requests.
  - §8.8's note at `designs/lane-b-dependabot-batch.md:874-875` ("refresh #89 down to stripe") should say that #89 is
    closed and replaced at C's merge.
  - Record the reconciliation with security-supply r1's P1. P1 holds for any job that starts while #89 is open, and
    §8.8's 11-05 aws-sdk PR holds once #89 is gone.
- **P5. Design D10 and the §8.7 trial-merge table** (r1 P5). Add C x B (#94), which conflicts in the runbook's AWS
  paragraph. §8.1 planned an AWS sentence in both pull requests without noting the overlap. §8.7's paragraph "First, for
  every merge … while #42 waits … ask the orchestrator" (`:822`) is still in the design under the "Superseded" note, so
  strike it too (r2 P1).
- **P6. `build-c/check.md:13`** (r1 P6). It carries the wrong 10/43 counts that flowed into the description. Correct the
  record when the description is fixed (N2).
- **P7. The closing comment in design §8.8** (r2 P2). "Closing this pull request ignores nothing" (`:868`) is exact
  only for grouped pull requests. All three of this item's are grouped, so it is harmless here (N8).
- **P8. The CLI floor** (r2 P3, B's domain). `minimumCliVersion` comes from the transitive
  `@aws-cdk/cloud-assembly-schema` (54.26.0 gives 2.1144.0), not from `aws-cdk-lib`'s own version. So a lockfile
  regeneration can raise it with no library bump. B's merge-time regeneration should record the schema package's
  version next to the CLI version.
- **P9. The weekly triage record** (r2 P4) could include the updater SHA from the npm run's log (N9).
- **P10. The status file** (r3 P4). Record that #92 merged as `4eaf7124` at 02:14:46Z and #93 as `877e662f` at
  02:42:44Z. C's base merge-in is clean (tree `79f82b48`), but it re-runs capacity because `matrix.ts` is watched, so
  the O9 warning is likely again (S4).
- **P11. Watch dependabot-core** (r3 P5). The 10-20 recreate shows that an earlier minor-and-patch pull request carried
  `@anthropic-ai/sdk` 0.135.0. Without C's exclusions, a recreate of an old-configuration minor-and-patch pull request
  can pull a 0.x "minor" of a gated SDK past its group. That is one more reason C must merge before any recreate of #89.

## Commands and logs

All under `review-C/`:
- **Progress notes:** `progress/ci-infra-r1.progress.md`, `ci-infra-r2.progress.md` and `ci-infra-r3.progress.md`.
- **Round 1:**
  - mutation scripts `mutate-model.py` and `add-cases.py`;
  - the proposed test file with N1's two cases, `tmp/with-cases.test.ts`;
  - CI logs `tmp/logs-unit`, `tmp/logs-dependabot` and `tmp/tools-test.log`.
- **Round 2:** `r2-scripts/`:
  - `trial-synth.log` and `trial-synth-95.log`;
  - `failing-first-rows.log`;
  - `route-table.mjs` and `route-table.txt`;
  - `direct-at-rev.py` with `direct-*.names` and `direct-*.tsv`;
  - `snapshot-names.txt`.
- **Round 3:** `r3-scripts/`:
  - `trial92.log`;
  - `trialB.log` and `trialB-report.json`;
  - `trial86.log` and `trial86-report.json`;
  - `aws-resolved.txt` and `resolve-aws.py`.
- **The skeptics' downloads:** `tmp/refute-s1` (S3's job logs).
- **The writer's clone:** `clone-writer`, used 03:30Z to 03:33Z, removed afterwards. The other reviewer's files
  (`secsup-*`, `ss2-*`, `r3s-*`) were not touched.
