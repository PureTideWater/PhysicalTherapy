# PR #91 (dependabot-batch, PR C: Dependabot group routing) review: security and supply chain

Written 2026-11-02 from 03:33Z to 03:41Z (`date -u`: Mon Nov 2 03:41:33 UTC 2026 at the last check). This file records
the adversarial reviewer for security and supply chain across three rounds (2026-11-01 21:12Z to 2026-11-02 02:44Z) and
the skeptics' verdicts (2026-11-02 01:16Z to 03:25Z). It is not committed.

- **Pull request:** #91, `co-001/dependabot-group-routing`. This is PR C of the Lane B item "dependabot-batch", the
  routing fix that Dependabot #89 exposed. Draft, 7 commits, 7 files, +219/-18. It changes no package version,
  manifest or lockfile (`pull_request_read get`, 03:31Z).
- **Head:** `651f8b80858868fc973e3ef83ad0af0f80b7a24d`, committed 2026-11-01T18:22:27Z. `git ls-remote` at 03:30:32Z
  shows it unchanged.
- **Base:** `claude/build-platform` was at `bce57f16` when the PR was opened. It is now `877e662f`, after #83
  (`43565235`), #92 (`4eaf7124`, 02:14:46Z) and #93 (`877e662f`, 02:42:44Z).
  - `mergeable_state` is `behind`.
  - `git merge-tree --write-tree 651f8b80 877e662f`: clean, tree `79f82b48` (writer, 03:31:58Z).
  - The description was last updated 2026-11-01T18:35:24Z and is unchanged at 03:31Z.
- **Lens:** security and supply chain (design `designs/lane-b-dependabot-batch.md` §8.4 item 4, run with
  `.claude/agents/security-reviewer.md`'s brief). The review covered:
  - what the configuration lets in, and how: grouping, majors, ignores, cooldown and security updates;
  - the code GitHub actually runs: dependabot-core and the updater image;
  - schema and GitHub's validation;
  - the supply-chain commands;
  - outbound calls, telemetry, PHI and tenancy;
  - the weekly triage as a control;
  - what Dependabot does at and after the merge.

  Rounds 2 and 3 covered the completeness critic's unchecked areas, the same lists as the CI lens's record.

How the review was done:
- **Clones.** Each round used its own fresh blobless clone under `review-C/`: `clone-secsupply`, `clone-secsup-r2`
  and `clone-secsup-r3`. The rounds also used worktrees and these upstream clones, all blobless:
  - dependabot-core;
  - dependabot-action;
  - github/docs;
  - SchemaStore.

  Every heavy command ran under `flock /tmp/laneb-heavy.lock`. Everything was removed (21:27Z, about 21:55Z and
  02:44Z).
- **Running upstream code.** Round 1 ran dependabot-core's own Ruby: four files, read in full first and copied out of
  the clone, with sorbet stubbed. That harness executes downloaded code, so it is evidence only and must not run in CI.
- **GitHub, read only.** Reads went through `pull_request_read` (get, get_files, get_check_runs), `get_job_logs`,
  `list_pull_requests` and `gh api` GETs. Nothing was pushed, commented, reviewed, approved or merged. The 10-29 npm
  job log was downloaded once with `gh api .../actions/jobs/123265353642/logs` into its own directory
  (`review-C/tmp/secsup-runlog`, 744,546 bytes) and read as data.
- **Writer's spot check (03:30Z to 03:36Z).** Every line at 651f8b80 cited below was re-read in a fresh blobless clone
  (`review-C/clone-writer`, removed afterwards), and every one matched:
  - `docs/runbooks/dependency-upgrades.md:47-63, 72-74, 85-86, 104-106, 108, 328-333`;
  - `.github/dependabot.yml:33, 35, 37-47, 48-52, 72-88, 89-91`;
  - `tools/test/dependabot-config.test.ts:61, 77-111, 88, 211-237`;
  - ADR 0066 `:28-31, 731-741`;
  - `docs/runbooks/screening-capacity.md:101-103`;
  - `tools/screening-capacity/watched-paths.txt:463`;
  - `packages/synth/src/cases/matrix.ts:430`;
  - `tools/ci/browser-build.test.ts:444-460`;
  - `packages/compliance/src/controls.ts:266`.

  The writer also re-checked:
  - the general O9 wording: LANES.md `:204`, the 02:35 UTC entry, "a founder item that blocks launch, not merges
    (issue #41)";
  - `lanes/lane-b.md:1313`.
- **Paths.** `review-C` means
  `/tmp/claude-0/-home-user-PhysicalTherapy/9403d8f7-c652-5574-8dfa-f848fcb558dc/scratchpad/review-C`. Commit and blob
  hashes are shortened to 8 hex digits. No other 64-hex digest appears here (any would be shortened to 8 hex and an
  ellipsis). All data is synthetic.

## Verdict

**0 B, 3 S, 15 N** in this lens: 18 findings raised and none refuted. One finding was raised as S and rerated N by its
skeptic: N1 (SS3-S3), merged into the CI lens's S1, which keeps S.

The change is sound as a supply-chain control.
- **The routing.** Under dependabot-core's own code, every one of the 63 direct dependencies lands in exactly one
  group, the intended one. Nothing is ungrouped, and no "more specific group" skip occurs.
- **Unchanged gates.** The security group, the ignored majors, the 3-day cooldown and the release-age floor are
  unchanged on every merged tree.
- **No runtime change.** No runtime code, outbound call, telemetry, PHI path or tenancy surface changes.

Round 1 found nothing above N. All three S findings are in the description, and concern how and when C merges against a
hard deadline: Dependabot's npm run at 2026-11-05T04:31Z.
- **S1.** "Merge order" contradicts the orchestrator's rulings and never says what the deadline guard does.
- **S2.** The deadline section misstates how the 11-05 run misroutes. It also leaves out that C's merge starts
  Dependabot itself, which closes #89 and opens a successor, and it has no check of those runs after the merge.
- **S3.** The O9 sizing question the gate raised on the head is not recorded.

The 15 N findings fall into two groups.
- **The runbook as a control:**
  - the signals and log read in step 1 (N2);
  - GitHub's validation check (N3);
  - stored ignores, read read-only (N4);
  - majors in security jobs (N5);
  - closed individual pull requests (N9);
  - a trigger to re-check the port (N11).
- **Records:** the rest.

**Cross-lens.** The CI and test-infrastructure record is `lane-b-dependabot-batch-C-review-ci-infra.md`. These findings
were raised by both lenses:

| This record | CI record | Note |
| --- | --- | --- |
| S1 | S2 | Use this record's corrected text. |
| S2 | S3 | |
| S3 | S4 | |
| N1 | S1 | Take the higher rating, S. |
| N6 | N3 | |
| N7 | N6 | |
| N8 | N7 | |
| N9 | N8 | |
| N10 | N10 | Use this record's sentence. |
| N11 | N9 | |
| N13 | N12 | |
| N14 | N13 | |
| N15 | N14 | |

S1, S2, S3 and N1 all rewrite the same two description sections. Write those sections once, then read the description
back.

## Findings

### S1 (security-supply-r2-S1). "Merge order" contradicts the orchestrator's rulings and leaves out what the deadline guard does

Also raised by the CI lens as ci-infra-r2-C-ci-r2-S1 (S2 there). This record's corrected text is the one to use.

**Where:** PR #91 description, `### Merge order` (body read with `pull_request_read get` at 21:42Z, 01:16Z and 03:31Z);
`approval-summaries/lane-b-dependabot-batch-status.md:17-31`.

**Scenario:** It is 2026-11-04 12:00Z, and #86 has still not merged. A merger follows the description.
- **The #42 sentence.** It says "While #42 is open, the orchestrator is asked before this merges". #42 is still open,
  waiting on the founder, so the merger asks and waits.
- **The guard.** It names the 2026-11-04 12:00 UTC guard but never says what the guard does. Nothing tells the merger
  that C now merges without waiting and resolves ADR 0066 keeping both sides.
- **The outcome.** If no answer comes before 2026-11-05T04:31Z, Dependabot's npm run opens misrouted pull requests
  again.
- **What else is missing.** The description also leaves out:
  - ruling 2a, "never ahead of a PR already green and waiting";
  - the 20:36Z standing rule: base merged in, CI green on that head, ready, approval-of-record re-run, merge with
    expectedHeadSha, and never jump a green, waiting PR that has a conflicting file.

**Evidence:**
- **The rulings** in the status file:
  - the 18:00 ruling 2c (`:22-23`): "A, B and C may merge while #42 waits on the founder; only the schema chain is
    serial";
  - 2a/2b (`:19-21`): if #86 has not merged by 2026-11-04 12:00 UTC, "C merges without waiting (resolve ADR 0066
    keeping both)";
  - the 20:36Z standing rule (`:25-31`).
- **The description** was last updated at 18:35Z, after the 18:00 ruling. It still carries design §8.7's superseded
  instruction: "First, for every merge … while #42 waits … ask the orchestrator", at
  `designs/lane-b-dependabot-batch.md:822`.
- **Precedent.** The orchestrator recorded the same staleness in A's description as an S finding.
- **Trial merges** (r2, 21:48Z to 21:52Z):
  - On base `43565235` + C (`31ba8cf5`), C merges cleanly with #84, #85, #90, #92, #93 and #42.
  - #75 conflicts only in its own three uploads files, the same as the base does.
  - On every merged tree, `pnpm synth --all` wrote 0 files and git stayed clean, and `packages/synth` + CI-12 passed
    (14 files, 195 tests; #75: 15 files, 202 tests). Logs: `review-C/ss2-logs/c-*.log`.
  - The CI-12 row, the `matrix.ts` entry, `expected.json`, `dependabot.yml` and the test file are blob-identical to C's
    in every trial.

**Fix (the skeptic's corrected fix):** Replace the whole `### Merge order` section with the text below. Fill each
`<placeholder>` from checks the fix round actually runs at its own head.

> ### Merge order
> - **The rules.** Lane B orchestrator rulings: lane-b-dependabot-batch-status.md, 2026-11-01 18:00 UTC (2a-2c) and
>   20:36 UTC.
>   - This pull request waits for #86, because both amend ADR 0066.
>   - It then merges as soon as it is ready: fresh-clone verification passed; the latest claude/build-platform merged
>     in with a merge commit; CI green on that head; ready; approval-of-record re-run; merge with expectedHeadSha.
>   - #42 does not hold it (ruling 2c: only the schema chain is serial).
> - **Deadline guard.** If #86 has not merged by 2026-11-04 12:00 UTC, this pull request stops waiting for it and
>   merges as above, before Dependabot's 2026-11-05T04:31Z npm run.
>   - This is the one exception to waiting for #86.
>   - It is safe because this pull request adds no conflict with #86. `git merge-tree` of this head merged with the
>     base, against #86, gives the same three files as the base alone: ADR 0066's header (the Part 5 bullet and Date
>     line, :28-31), reconciliation-001.md and tools/test/workflows.test.ts. #86 resolves those against the base in any
>     case.
>   - Whichever of this and #86 merges second keeps both, and may name this amendment in ADR 0066's header (deferred
>     P1).
> - **Never jump.** Except as the guard allows for #86, this never merges ahead of a pull request that is already
>   green, waiting and conflicting with it. Today that is #94, in the runbook's AWS paragraph. Whichever merges second
>   keeps both, with the resolved text in <ci-infra S1's fix>.
> - **No conflict added** (`git merge-tree` of this head merged with base <sha>, at <UTC time>):
>   - #42, #84, #85, #90, #92, #93 and #95 merge cleanly;
>   - #75 conflicts only in its three uploads files, as the base does.
> - **Shared record files.** #42, #75, #84, #85, #90, #92, #93 and #95 also edit test-matrix.md and synth matrix.ts.
>   Whichever merges second keeps both PRs' rows and re-runs `pnpm synth --all` (LANES.md rule 6). Record only the
>   merged-tree runs actually made, with time and heads.
> - **Before merging.** Re-run these checks against the current heads just before the merge, and record the result in
>   the status file. Do not pin other PRs' head SHAs here.

Delete "While #42 is open, the orchestrator is asked before this merges."

In `## Why`, replace "D10 (its own pull request, ahead of the #88/#89 pull request, which waits on #42)" with "D10 (its
own pull request, so it can merge before Dependabot's 2026-11-05T04:31Z npm run whatever happens to the #88/#89 pull
request, #94)".

Two notes from the writer, from merges since the skeptic ran: #92 and #93 have merged (`4eaf7124`, `877e662f`), so they
drop out of the lists. CI lens N11 shows that #86's fix-round head merges with C without any ADR 0066 conflict, so the
"deferred P1" line should be decided in C.

**Skeptic:** Confirmed; could not refute. Checked at 01:16Z to 01:18Z.
- **The description** is a draft at head 651f8b80, `updated_at` 18:35:24Z. #42 is still a draft at `6c28d6a2`. #86 is
  still a draft, last updated 2026-10-28T08:01:36Z, so the guard is likely to fire.
- **Citation slips** that do not change the finding: 2c is at `:22-23` and the 20:36Z rule at `:25-31`.
- **Five corrections to the fix,** all applied above:
  - **(a) The guard against "never jump".** The original stated both without saying which wins. The guard is the
    exception for #86, and jumping #86 costs nothing: on base + 651f8b80, `git merge-tree` against `83167b8f` gives
    the same three conflicted files at the same ADR lines as the base alone (01:17Z).
  - **(b) Stale trial list.** #85 had moved to `a97d6011` at 21:57:44Z, and #95 was missing. The 01:17Z re-run on base
    + 651f8b80:
    - clean with #42, #84, #85, #90, #92, #93 and #95;
    - #75 conflicts only in its uploads files;
    - #94 conflicts in the runbook, where the base alone merges cleanly with it.

    "`pnpm synth --all` writes nothing on each" is not verified for every tree, so the text records only runs actually
    made.
  - **(c)** It now names the shared record files.
  - **(d)** It adds "verified" to the 20:36Z steps.
  - **(e)** The same staleness in "## Why" is now fixed too.
- **The ADR's line numbers.** At 651f8b80, ADR 0066 `:28` is the Part 5 bullet and the Date line is `:31`.

### S2 (security-supply-r3-SS3-S1). The deadline section misstates how the 2026-11-05 run misroutes and leaves out that C's merge starts Dependabot itself; there is no post-merge check of those runs

Also raised by the CI lens as ci-infra-r3-ci-infra-r3-S1 (S3 there). Write one fix from both corrected fixes.

**Where:**
- PR #91 description, "Must merge before Dependabot's next npm run";
- `docs/runbooks/dependency-upgrades.md:61-63` (step 1) and `:72-74` (step 2's new bullet) at 651f8b80.

**Scenario:** Three cases.

**(a) C has not merged by 2026-11-05T04:31Z, and #87, #88 and #89 are open.** The version job opens no new pull
request: under the old file, minor-and-patch holds all 63 direct dependencies, and #89 is open, so every name is marked
handled. The schedule's recreate of #89 then rebuilds it from all 63 members, minor and patch only; a refresh does not
skip what it has handled. The result is:
- the nine `@aws-sdk/*` in minor-and-patch again;
- exact-name minors that #88's own recreate also takes, such as `aws-cdk-lib` and the `aws-cdk` CLI.

These are the duplicates that, according to the description, no run had shown.

**(b) The open-pull-requests limit of 8.** It is not reached: at most 7 group pull requests.
- The pre-pass handles minor-and-patch's members while its pull request is open, so they get no individual majors.
- The majors of `next`, `@next/eslint-plugin-next` and `pg-boss` are ignored.
- `@aws-sdk` 4.x and `aws-cdk-lib` 3.x do not exist.

**(c) C merges first.** Within seconds Dependabot starts an npm version job and recreates the open group pull requests
under the new file.
1. The version job opens no aws-sdk pull request, because #89's dependencies are still handled. Round 1's P1 is right
   for this job.
2. #89's recreate keeps only the non-excluded members, so the dependency names differ, and Dependabot closes #89 as
   "dependencies changed". It opens a successor with a new number, or none if nothing is due.
3. #87 and #88 are superseded if newer versions are due.
4. On 11-05 no open pull request lists `@aws-sdk`. So an aws-sdk group pull request opens if the version locked then is
   older than the newest version past the 3-day cooldown.

Design §8.8 is right about that outcome. It is wrong that #89 is "refreshed down to stripe": #89 is closed and
replaced. It is also wrong on timing: this happens at the merge, not on 11-05. A's and B's closing step then targets
numbers that are already closed.

**Evidence:**
- **dependabot-core 85379652** (origin/main at 02:30Z, own blobless clone):
  - `group_update_all_versions.rb:86-104`: the pre-pass that marks groups with an open pull request as handled.
  - `dependency_snapshot.rb:215-243`: marks the group's current members plus the pull request's dependencies.
  - `dependency_snapshot.rb:246-251`: defers only under the experiment `individual_prs_for_semver_excluded_dependencies`,
    which is absent from the 10-29 job definition (`job.log:72`).
  - `refresh_group_update_pull_request.rb:122-156`.
  - `group_update_creation.rb:360-372`: a refresh of its own group ignores the handled marks.
  - `dependency_change.rb:141-148`: when the names differ, the pull request is replaced.
  - `group_update_refreshing.rb:54-69`: close and create, or supersede.
- **The documentation.** github/docs `33b1f4a6`, `options-reference.md:743-745`: Dependabot "checks for changes when:
  Your schedule runs".
- **Precedents** (`gh api runs?event=dynamic`, 02:31Z to 02:41Z):
  - **`220f2b4e`**, merged 2026-10-20T22:24:06Z. It started npm version 39507843042 at 22:24:13Z, and npm recreate
    minor-and-patch 39507847707 at 22:24:15Z (log `:4993` "Updating pull request for minor-and-patch").
  - **`8d7acce3`**, merged 10-18T16:28:53Z. It started 39145193782 at 16:29:00Z, and the recreate 39145194733 at
    16:29:01Z (`:4093` "Dependencies have changed, closing existing Pull Request").

  The runs' `head_sha` is the target branch's head. Base pushes `bce57f16`, `43565235` and `4eaf7124` started no
  Dependabot run.
- **The registry** (`npm view`, 02:42Z):
  - `@aws-sdk/client-s3` latest is 3.1161.0 (2026-10-30T18:46:51Z); #94 locks 3.1160.0.
  - next, pg-boss, playwright and axe have nothing newer than what is locked (02:39Z).
- **Not verified:**
  - docker and actions runs on an npm-only change (both precedents changed all three sections);
  - whether all three open group pull requests are recreated (each precedent had one).

**Fix (the skeptic's corrected fix):**
1. **The description's deadline section.** Add that merging this changes `.github/dependabot.yml` on the default
   branch. That change starts an npm version run, and a recreate of the open group PR or PRs, within seconds (about
   10 s; the CI lens's skeptic). Cite the precedents: 39145193782 and 39145194733 after `8d7acce3`; 39507843042 and
   39507847707 after `220f2b4e`. Then say what follows:
   - The version run opens no aws-sdk PR, because #89's dependencies are still marked handled.
   - The recreate of #89 under the new file drops `@aws-sdk/*`. Dependabot closes #89, either as "dependencies changed"
     with a successor under a new number, or with no successor when none of its 44 members is due.
   - #87 and #88 may be superseded if a newer version is due. Whether all open group PRs are recreated is not verified.
   - On 2026-11-05T04:31Z, an aws-sdk group PR opens if the locked `@aws-sdk/*` is older than the newest version past
     the 3-day cooldown.
   - If C has not merged by then, that run's recreate rebuilds #89 from every direct dependency, as a new PR: the
     `@aws-sdk/*` and the aws-cdk minors #88 already holds.
2. **A post-merge check,** in the description's plan and in design §8.8 step 2 for C:
   1. Within an hour of the merge, list the runs:
      `gh api "repos/PureTideWater/PhysicalTherapy/actions/runs?event=dynamic&head_sha=<merge sha>" --jq '.workflow_runs[] | [.id,.name,.conclusion,.created_at] | @tsv'`.
      With MCP, use `actions_list list_workflow_runs` filtered on branch `claude/build-platform`, then filter by event
      and `head_sha` yourself. The MCP event list has no "dynamic".
   2. Read every run's log with `get_job_logs` (`return_content`, a large `tail_lines`), green runs included. No log
      may contain a "belongs to more specific group" line.
   3. Record what happened to #89: closed with a successor, or closed with none. A successor must list no
      `@aws-sdk/*`.
   4. Record the numbers then open for each group. A's and B's §8.8 close step names the PR actually open for what
      each takes, and closes it only if A or B takes everything it holds. Anything else goes to the weekly triage.
3. **Runbook step 1** (`docs/runbooks/dependency-upgrades.md`, after `:63`), one sentence: a change to
   `.github/dependabot.yml` on the default branch starts these runs at once (version and recreate, `head_sha` the
   change's commit), so read them then, as this step reads the weekly ones.

Outside the PR, correct the design §8.8 note (`designs/lane-b-dependabot-batch.md:874-875`).

**Skeptic:** The main claim, (c), holds; the skeptic failed to refute it. Case (a) and "no post-merge check" go too
far. Checked read-only after `git fetch origin co-001/dependabot-group-routing` (FETCH_HEAD 651f8b80, 03:20:58Z).
- **The runs start within seconds.** `gh api runs/<id>` at 03:21:40Z confirmed the precedents. The local logs show:
  - "Detected existing pull request ... Deferring creation" (`39145193782.log:227-228`);
  - "Dependencies have changed, closing existing Pull Request" (`39145194733.log:4093-4097`);
  - "Updating pull request for 'minor-and-patch'" (`39507847707.log:4993`).

  Both precedents were on `main` when it was the default branch (ADR 0063 `:524`). No `dependabot.yml` change has
  merged on the build branch since it became the default.
- **#89 is closed at C's merge, not on 11-05.** #89 is "Bump the minor-and-patch group with 10 updates" (`gh api
  pulls/89`, 03:24:44Z):
  - `group_update_creation.rb:122` compiles only `group.dependencies`, and the exclusions drop `@aws-sdk/*`;
  - `dependency_change.rb:141-148` replaces the pull request;
  - `group_update_refreshing.rb:35-38` closes it with no successor if nothing is due.
- **On (a):** the duplication changes the names, so #89 is closed and replaced. "Opens misrouted pull requests again"
  is correct in effect; it misses only the duplication.
- **On "no post-merge check":** §8.8 step 2 already reads the runs for the merge SHA, but acts only on red runs. A
  misrouted run is green.
- **Wrong in the original fix:**
  - the MCP event enum and the missing `head_sha` filter;
  - #89 may be closed with no successor;
  - a successor is not automatically a duplicate for A or B to close.
- **Not verified:** which ecosystems run after an npm-only change, and whether all open group pull requests are
  recreated.

### S3 (security-supply-r3-SS3-S2). The O9 sizing line on C's capacity gate is not recorded; every C head is measured

Also raised by the CI lens as ci-infra-r3-ci-infra-r3-S2 (S4 there).

**Where:** PR #91 description, `## Checks`; `tools/screening-capacity/watched-paths.txt:463`
(`packages/synth/src/cases/matrix.ts`, changed by C); `docs/runbooks/screening-capacity.md:101-103`.

**Scenario as raised:** The fix round merges the base and pushes. `matrix.ts` still differs from the base, so the
capacity run measures again. Suppose S4's middle run is above 44 s again (it was 52.7 s on 651f8b80).
- The gate prints "the consumer's size goes to the founder before merge".
- Read literally, the runbook then holds C for the founder's answer, against a hard 11-05T04:31Z deadline.
- The 01:02Z ruling names #94 alone.

**Evidence:**
- **The gate.** Job 124944504688 (head 651f8b80, success, 18:53:26Z), log `:56` and `:60`: "the worst time, S4#1
  S4-1's 52.7 s ... is above 44 s: the consumer's size goes to the founder before merge".
- **The ruling.** Status `:33-36` is "on O9 for #94", with the reason "runner noise, not a #94 regression".
- **Issue #41** (open) records the free runner at 38.3 s to 56.9 s on the same code.
- **C's only watched change** is the matrix row text (`matrix.ts:430`). No consumer code changes.
- **C's description is silent:** `grep -ci 'O9|sizing|#41'` over the body returned 0 (03:22:49Z).

**Fix (the skeptic's corrected fix):** Send the orchestrator no request.
- **Why no request is needed.** The 02:35 UTC entry already gives the ruling in general terms: "a founder item that
  blocks launch, not merges (issue #41)" (LANES.md `:204`, ops commit `9a07fa24`; also `lanes/lane-b.md:1313`). The
  session already applied it to #90 (status `:235-236`).
- **Two additions** to the fix round's rewrite of #91's description:
  1. A Checks row:

     > screening-capacity gate: pass. Sizing question (O9): S4's middle run, S4#1, worst S4-1 52.7 s on 651f8b80 (job
     > 124944504688). The same consumer code measured 52.3 s on base bce57f16 and 37.1 s on 43565235. This PR's only
     > watched path is the CI-12 row text in packages/synth/src/cases/matrix.ts (watched-paths.txt:463); no consumer
     > code changes. Runner noise. It is a standing founder item, issue #41
     > (https://github.com/PureTideWater/PhysicalTherapy/issues/41), and blocks the screening's launch, not this merge
     > (orchestrator rulings 2026-11-02 01:02 UTC and 02:35 UTC).

  2. The same point in one line, in the section on what waits on a person, noting that none of it blocks the merge.
- **After the base-merge push,** replace 52.7 s and the job id with the new head's middle-run worst time and gate job.
  If that time is at or below 44 s, record that instead.
- **Do not hold C** for an answer from the founder.

**Skeptic:** Partly confirmed, partly refuted. Checked read-only, 03:21Z to 03:23Z.
- **Confirmed:**
  - the gate ran on 651f8b80 (`get_workflow_job`) with MEASURE true and the SIZING line, repeated as a `##[warning]`;
  - `matrix.ts` is C's only watched file, and its change is the row text;
  - the description is silent;
  - the ruling is worded "on O9 for #94";
  - the same gap counted against A (A-verification `:124-128`).
- **Refuted:** that C would be held, or would break the runbook by merging.
  - The runbook says to take the question to the founder before merge, not to wait for an answer, and the question is
    already with the founder (issue #41, the founder list).
  - The ruling is stated generally at LANES.md `:204` (02:35 UTC) and in the handoff (`:233`, `:262-263`).
  - It was already applied to #90.
- **Severity S kept:** the change is to the description only, and the same gap left #90 NOT VERIFIED.

### N1 (security-supply-r3-SS3-S3, raised as S; the skeptic rerates N). The resolved AWS paragraph for C x #94 is written down nowhere, and a one-sided resolution drops B's CDK telemetry check

The skeptic merged this into the CI lens's S1 (ci-infra-r1-C-CI-S1), which keeps S. The fix round takes S there.

**Where:** `docs/runbooks/dependency-upgrades.md:328-333` at 651f8b80, against #94 `484e9f06` (its two telemetry lines
after the `cdk:diff` line); PR #91 description, "Merge order".

**Scenario as raised:** Whichever of C and B merges second resolves the one conflicting hunk by keeping its own side.
- **If C keeps its side,** B's lines on `CDK_DISABLE_CLI_TELEMETRY`, the `notices` setting and
  `CDK_DISABLE_VERSION_CHECK` vanish. That is the check that keeps the CDK CLI's default telemetry and notices fetch
  off at each CLI bump.
- **If B keeps its side,** C's routing sentence and its manifests wording vanish.

CI stays green either way: no test reads the paragraph, and lint does not check its text. The runbook is also the
cited evidence of the `dependency_and_image_hygiene` control.

**Evidence:**
- **The conflict.** `git merge-tree` of `75bc1e90` (base `4eaf7124` + C) with `484e9f06` conflicts only in that file,
  in one hunk (02:31Z).
- **The resolved trial,** `2c8b5ced` (tree `45e70cd5`, `review-C/r3s-scripts/aws-merged.txt`):
  - vitest on `tools/check-toolchain` `check.test.ts` and `images.test.ts`, CI-12, `packages/compliance` and
    `infra/test/cli-settings.test.ts`: 6 files, 95 tests (02:37:16Z);
  - `pnpm lint`: 1,691 files, 0 errors, 0 warnings (02:39:11Z).
- **B's lines are accurate.** B's installed CLI, `aws-cdk` 2.1146.1, has `lib/index.js` containing
  `canCollectTelemetry`, `CDK_DISABLE_VERSION_CHECK`, `shouldDisplayVersionMessage` and `CDK_DISABLE_CLI_TELEMETRY`.
- **The compliance control.** `packages/compliance/src/controls.ts:266` cites `docs/runbooks/dependency-upgrades.md` for
  control `dependency_and_image_hygiene` (SOC2 CC7.1/CC8.1, HIPAA 164.308(a)(1)(ii)(B)).
- **The same text twice.** The CI lens's `r3-scripts/aws-resolved.txt` is identical (`diff`, writer, 03:32Z).

**Fix (the skeptic's corrected fix):** One finding with the CI lens's S1, in the description only. There is no commit,
so CI and the review are not reset. Under "Merge order", add the bullet: "#94 (`co-001/deps-aws-cdk-minor-patch`) and
this pull request conflict only in `docs/runbooks/dependency-upgrades.md`'s AWS bullet, in one hunk (`git merge-tree`,
<UTC time>). Whichever merges second keeps both (LANES.md rule 6) by replacing the bullet with exactly this:", followed
by:

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

End the bullet with: "The design's section 8.6 verification then runs again on the resolved head."
- If N12 is taken, its first two lines replace the first two here.
- In the status file, append the same text to the note at `:190-191` ("the second merged keeps both"), which already
  records the rule. Do not write a new rule.

**Skeptic:** Partly confirmed (03:23:49Z to 03:25Z). The gap is real but overstated, so N, not S.
- **Confirmed:**
  - `git merge-tree --write-tree 651f8b80 484e9f06` exits 1, with one hunk in the runbook;
  - #91's description does not mention #94;
  - no test or lint rule reads the paragraph;
  - the text is exactly the union of both sides. Applied to the merge-tree output
    (`review-C/tmp/refute-ss3s3-032521`), it keeps every C line and B's two lines, and drops only three unchanged base
    lines that C rewrote.
- **Overstated:**
  - **"Written down nowhere."** The keep-both rule is recorded at LANES.md rule 6 (`:34`), LANES.md `:171` (naming this
    pair), the status file `:190-191` and `:253`, design §8.7, and #94's own description. Only the exact text is
    unwritten.
  - **"Silently."** A content conflict is resolved by hand, and keeping one side breaks rule 6.
  - **"B's ADR 0012 amendment relies on it."** The amendment carries the check itself (ADR 0012 at `484e9f06`,
    `:166-167`).
- **Not verified:** the reviewer's trial `2c8b5ced` and its runs were not re-run.

### N2 (security-supply-r1-N1). Runbook step 1 names only one of the routing-failure signals and gives no way to read the log

**Where:** `docs/runbooks/dependency-upgrades.md:61-63`.

**Scenario:** Dependabot changes how a group with no patterns is matched, and minor-and-patch, now patternless with
only exclude-patterns, matches nothing. Its 44 dependencies then go ungrouped and become individual pull requests,
capped by `open-pull-requests-limit` 8 (`dependabot.yml:33`).
- **No signal from step 1.** No "belongs to more specific group" line appears, so step 1 reads the run as clean.
- **The only log signals** are:
  - the group engine's WARN "Please check your configuration as there are groups where no dependencies match: -
    minor-and-patch";
  - "Skipping update group for ... as it does not match any allowed dependencies".
- **No way to read the log.** Step 1 says to read "the npm run's log", but its command only lists runs.

**Evidence:**
- **The WARN's source.** dependabot-core 85379652, `dependency_group_engine.rb:159-179`, writes it.
- **Run 40818560725**, job 123265353642, downloaded with `gh api .../actions/jobs/123265353642/logs` at
  2026-11-01T21:21Z (744,546 bytes, 5,115 lines). Lines 250-251 hold "groups where no dependencies match: - aws-sdk",
  and line 2367 holds "Skipping update group for 'aws-sdk' as it does not match any allowed dependencies", beside the
  skips at `:160` and `:168-226`.
- **Under the head configuration**, each of the 7 version groups has at least one direct member. This comes from
  core's engine run in Ruby over the 63 direct names. So on today's manifests the WARN fires only if a group's packages
  leave the manifests or the routing breaks.

**Fix:** In step 1, after the CI-12 sentence: "…or a `groups where no dependencies match` warning or `does not match
any allowed dependencies` line naming a group whose packages are still in the manifests. Read it with
`job=$(gh api repos/PureTideWater/PhysicalTherapy/actions/runs/<id>/jobs --jq '.jobs[0].id'); gh api repos/PureTideWater/PhysicalTherapy/actions/jobs/$job/logs | grep -E 'belongs to more specific group|no dependencies match|does not match any allowed'`."

**Skeptic:** Confirmed as a nit. Not verified by a skeptic; the fix round checks it.

### N3 (security-supply-r1-N2). No document names GitHub's own Dependabot config check; CI-12 proves the file's meaning, not that GitHub accepts it

**Where:** `docs/runbooks/dependency-upgrades.md:61-63` and the merge steps; `.github/dependabot.yml:72-88`.

**Scenario:** A later edit to `dependabot.yml` passes CI-12 but fails GitHub's validator, for example an
`exclude-patterns` list with a repeated entry, which the schema forbids (`uniqueItems`). It could merge on the four
required checks alone. Dependabot then stops using the file on the default branch, and only a banner says so. Today
this risk is closed only because someone happened to look.

**Evidence:**
- On head 651f8b80, check run 124939537364, ".github/dependabot.yml":
  - app `dependabot`, title "Dependabot config file validation";
  - concluded success, "All changes look good", completed 2026-11-01T18:33:33Z (`gh api commits/651f8b80/check-runs`,
    21:18Z).
- The required checks are "all green", "mutation", "screening-capacity gate" and "approval-of-record" (PR #91 body).
  This check is not among them.
- `grep -rni 'config file validation'` over `docs/`, `.github` and `tools` finds nothing (21:19Z).

**Fix:** In the runbook, in step 1's fix sentence or wherever `dependabot.yml` changes are described: "A pull request
that changes `.github/dependabot.yml` merges only with its `.github/dependabot.yml` check (GitHub's Dependabot config
file validation) green, besides CI-12." Making the check required is proposal P2.

**Skeptic:** Confirmed as a nit. Not verified by a skeptic; the fix round checks it.

### N4 (security-supply-r1-N3). Step 6 lists stored ignores only through a pull-request comment, a write, but the run log already shows them read-only

**Where:** `docs/runbooks/dependency-upgrades.md:104-106`.

**Scenario:** A `@dependabot ignore` stored on some pull request can silently suppress versions for a dependency,
including security-relevant minors. The weekly triage can find it only by posting `@dependabot show … ignore
conditions`. That is a write, which read-only sessions may not do. The design's triage record shows step 6 was skipped
for exactly that reason.

**Evidence:**
- **The source field.** dependabot-core 85379652, `updater/lib/dependabot/job.rb:481-490`: an ignore condition's
  `source` tells config-file rules apart from those created by `@dependabot ignore` commands.
- **The 10-29 npm log,** line 72, is the INFO "Job definition: {…}". Parsed at 21:22Z, it holds:
  - `ignore-conditions` with five entries (`@next/eslint-plugin-next`, `@types/node`, `next`, `pg-boss`,
    `typescript`), each with `source: .github/dependabot.yml`;
  - `security-updates-only: false`.

**Fix:** Add to step 6: "Read-only first: the run's log line 'Job definition:' lists every ignore condition with its
`source`; any whose source is not `.github/dependabot.yml` was stored by a comment (on 2026-10-29 all five came from
the file)." Keep `@dependabot show` as the per-dependency fallback. N9 adds closed individual pull requests to this
step.

**Skeptic:** Confirmed as a nit. Not verified by a skeptic; the fix round checks it.

### N5 (security-supply-r1-N4). The runbook says the file's major ignores also bind security updates; dependabot-core applies only `versions` ignores in a security job (pre-existing text)

**Where:** `docs/runbooks/dependency-upgrades.md:85-86`, which reads "a file `ignore` entry applies to security updates
too, so Dependabot opens nothing". #91 does not change it; it was introduced in `e28e237f`.

**Scenario:** Take an advisory on `next` that is fixed only in a new major.
1. The runbook says Dependabot opens nothing, so the triager starts a hand upgrade.
2. But the security job ignores `update-types` conditions. It may open a `security` group pull request that moves next
   across the major the file ignores.
3. The result is a duplicate change, or an unexpected major in a security pull request.

Not verified against a live security run.

**Evidence:**
- **dependabot-core 85379652:**
  - `common/lib/dependabot/config/ignore_condition.rb:41-42` has `return versions if security_updates_only`, so
    update-types are dropped;
  - `update_config.rb:36-49` passes `security_updates_only` through;
  - `job.rb:499-501` logs " (doesn't apply to security update)" for update-types ignores.
- **All five npm ignores** in `dependabot.yml:37-47` are update-types only.
- **GitHub's documentation.** github/docs `33b1f4a6`, `controlling-dependencies-updated.md:177`: "update-types only
  affects version updates, not security updates". This is said of `allow`.

**Fix:** Replace the claim with: "the file's `ignore` entries name update types, and Dependabot applies those to version
updates only: a security update may still open a `security` pull request that crosses the major. Read it as a deliberate
upgrade (below); when none opens, do it by hand…". Fix it here, since #91 already edits the triage steps.

**Skeptic:** Confirmed as a nit. Not verified by a skeptic; the fix round checks it.

### N6 (security-supply-r1-N5). The ADR 0066 amendment says #89 contained `@next/eslint-plugin-next`; it did not

Also raised by the CI lens as ci-infra-r1-C-CI-N3 (N3 there).

**Where:** `docs/adr/0066-run-ci-as-parallel-jobs-behind-one-gate-measure-mutation-on-every-money-package-move-the-browser-and-runner-together-and-pin-every-dependency.md:735-736`
and `:740-741`.

**Scenario:** Someone audits the supply-chain record. They read that run 40818560725 "put the nine `@aws-sdk/*`
packages and `@next/eslint-plugin-next` in minor-and-patch (#89)", and look in #89 for an eslint-plugin-next bump that
never existed.

The amendment's "Revisit when" also leaves out the trigger that would actually break the fix: dependabot-core changing
how `exclude-patterns` or a patternless group matches.

**Evidence:**
- `gh api repos/PureTideWater/PhysicalTherapy/pulls/89` at 21:21Z: "Bumps the minor-and-patch group with 10 updates",
  the nine `@aws-sdk/*` and stripe 23.0.0 to 23.0.1, with no `@next` package.
- Log line `:160` shows only the assignment: "Skipping @next/eslint-plugin-next for group 'next' - belongs to more
  specific group 'minor-and-patch'".
- The `dependabot.yml` comment (`:48-51`) gets this right ("lost their packages to minor-and-patch"). PR #91's body
  says the same thing, but the body is not a file.

**Fix:**
- Change `:735-736` to: "…so npm run 40818560725 assigned the nine `@aws-sdk/*` packages and `@next/eslint-plugin-next`
  to minor-and-patch, and its pull request (#89) carried the nine…".
- Extend "Revisit when" (`:740-741`) with: "or dependabot-core changes how `exclude-patterns` or a group without
  patterns matches (step 1 of the triage reads each run for it)". N11 widens this to any change of group assignment.

**Skeptic:** Confirmed as a nit. Not verified by a skeptic; the fix round checks it.

### N7 (security-supply-r2-N1). The description has no per-dependency routing table, which design §8.3 asks for and §8.6's verification re-checks

Also raised by the CI lens as ci-infra-r2-C-ci-r2-N1 (N6 there, with the full table).

**Where:**
- PR #91 description, "Evidence" ("browser-tests 3 ... minor-and-patch 43");
- design `designs/lane-b-dependabot-batch.md:723-724` (§8.3, C: "the routing table of every direct dependency");
- §8.6 ("C: the CI-12 test against the new config and the routing table").

**Scenario:** The founder reviewing #91, or the §8.6 verifier, cannot see which group each of the 63 direct
dependencies lands in.
- The only routing evidence in the description is a set of group counts, and those counts are wrong (CI lens N2).
- So a reader cannot check without a harness that, for example, infra's `@aws-sdk/client-sts` or
  `@next/eslint-plugin-next` moved.

**Evidence:**
- **The body** (21:42Z) gives only "browser-tests 3, anthropic-sdk 1, pg-boss 1, next 2, aws-sdk 10, aws-cdk 3,
  minor-and-patch 43".
- **The routing on the head,** under the Ruby-faithful run (`review-C/secsup-scripts/route-head.out`, VERSION job):
  - 19 names go to their specific groups:
    - browser-tests: `@playwright/test`, `playwright-core`, `@axe-core/playwright`;
    - anthropic-sdk: `@anthropic-ai/sdk`;
    - pg-boss: `pg-boss`;
    - next: `next`, `@next/eslint-plugin-next`;
    - aws-sdk: the nine `@aws-sdk/*`;
    - aws-cdk: `aws-cdk`, `aws-cdk-lib`, `constructs`.
  - The other 44 go to minor-and-patch, 63 in all.
- **The two runs agree.** The CI lens's run of the test's own model (`r2-scripts/route-table.txt`) gives the same.

**Fix:**
- Add a collapsed table to "Evidence". List the 19 names with their group and the old configuration's groups, then
  one line: "the other 44 direct dependencies: minor-and-patch only (unchanged)".
- Correct the counts to aws-sdk 9 and minor-and-patch 44.
- Say the table is the CI-12 model's output on 651f8b80 and that it matches the Ruby port.

**Skeptic:** Confirmed as a nit. Not verified by a skeptic; the fix round checks it.

### N8 (security-supply-r2-N2). The Checks table leaves out §8.5's commands, although CI ran every one of them on 651f8b80

Also raised by the CI lens as ci-infra-r2-C-ci-r2-N2 (N7 there).

**Where:** PR #91 description, `## Checks` table; design `:787-796` (§8.5) and `:726-727` (§8.3: "The §8.5 commands as
table rows").

**Scenario:** A reader of the Checks table finds no record that any of these ran on this head:
- `test:golden` and `test:oracle`;
- the four `test:db` shards;
- build, stamp and e2e;
- `screening:capacity`, with its O9 sizing warning;
- `licenses:check`.

They did run, in CI, but the description cites none of their results or run IDs. That leaves the §8.6 cross-check
with nothing to read.

**Evidence:**
- **The check runs on 651f8b80** (`gh api commits/651f8b80/check-runs`, 21:49Z):
  - static 124939777586 ran `pnpm test:golden` (`static.log:731`), `pnpm test:oracle` ("pyx12 4.0.1 agrees with all
    687 synthetic 835 fixtures", `:804-805`) and `pnpm licenses:check` ("185 packages", `:822`);
  - db (1/4) to (4/4): 124939777667, 124939777695, 124939777562 and 124939777659;
  - build 124939777735;
  - e2e (1/2) 124940446935 and (2/2) 124940446916;
  - capacity 124940176863 and the screening-capacity gate 124944504688.

  All succeeded.
- **The description's local rows hold up:**
  - `integ-lint.log` (HEAD 651f8b80, 1,676 files, exit 0);
  - `integ-lint-logs.log` (1,086 files);
  - `integ-actions*.log` (exit 0);
  - the m2/m3 rows re-run on 651f8b80 at 21:50Z: 2 fail, and 3 fail including "constructs: [aws-cdk,
    minor-and-patch]".
- **The `pnpm test` counts reconcile:** 6,893 + 4 = 6,897 = CI's 6,896 + 1. The extra 3 are the engine-freeze
  differential's `describe.skipIf` block (`differential.test.ts:383`, `:426`, `:448`, `:470`), which CI runs with
  `ENGINE_FREEZE_BASE`.

**Fix:**
- Add one row per §8.5 command, each giving the CI job ID on the head with its result line: golden; oracle 687/687;
  licenses 185; db 1-4; build; e2e 1-2; capacity and the gate (S3's row).
- Explain the skips: "4 skipped = the engine-freeze differential's 3 (CI runs them) + 1".
- Cite them on the head that merges.

**Skeptic:** Confirmed as a nit. Not verified by a skeptic; the fix round checks it.

### N9 (security-supply-r2-N3). The new runbook step-2 item treats closing a bot pull request as neutral, but closing an individual (ungrouped) one stores a per-version suppression that step 6 cannot see

Also raised by the CI lens as ci-infra-r2-C-ci-r2-N3 (N8 there).

**Where:** `docs/runbooks/dependency-upgrades.md:72-74` (step 2, the new item) and `:104-106` (step 6) at 651f8b80;
design §8.8's comment "Closing this pull request ignores nothing" (`designs/lane-b-dependabot-batch.md:868`).

**Scenario:** A major that no group takes arrives as an individual pull request, for example a stripe or `@aws-sdk/*`
major. Minor-and-patch and aws-sdk take only minor and patch, and the file ignores neither.
1. Following step 2, a person takes it as the build's own pull request and closes the bot's.
2. Dependabot then records that exact version as handled, and every later npm job carries it in
   `existing-pull-requests`.
3. If the replacement took a different version or was reverted, Dependabot never proposes that version again.

Step 6 promises that `@dependabot show <dep> ignore conditions` lists every stored suppression, and that the file's
entries are the only ones. Neither holds here: this suppression is not an ignore condition.

**Evidence:** This repository's own history (`gh api issues/<n>/comments`, 21:45Z):
- **Individual pull requests.** #16 (typescript 7.0.2) and #17 (`@types/node` 26.6.5) were closed by PureTideWater at
  2026-10-18T16:29Z. Each got dependabot[bot]'s reply "OK, I won't notify you again about this release, but will get in
  touch when a new version is available".
- **A grouped pull request.** #33 was closed 2026-11-01T14:03:52Z and got "This pull request was built based on a group
  rule. Closing it will not ignore any of these versions".
- **The job definition.** The 2026-10-29 job definition (`job.log:72`) has `existing-pull-requests` = [#16 typescript
  7.0.2, #17 `@types/node` 26.6.5], closed and unmerged, yet carried 11 days later. Its `ignore-conditions` hold only
  the file's 5 entries.
- **Design §8.8's sentence holds for #87, #88 and #89,** which are all grouped.

**Fix:**
- Extend `:72-74`: "... (never `@dependabot ignore`). Closing a grouped pull request ignores nothing. Closing an
  individual one makes Dependabot skip that exact version for good: the version stays in each job's
  existing-pull-requests, and `@dependabot show` does not list it. Close one only when the replacement took that
  version or a newer one, and record which."
- At step 6 add: "closed individual pull requests also count (today #16 and #17, both covered by the file's major
  ignores)".

**Skeptic:** Confirmed as a nit. Not verified by a skeptic; the fix round checks it.

### N10 (security-supply-r2-N4). "Dependabot's behaviour since September 2025" is inaccurate: the behaviour was behind an experiment until 2026-05-19, and the update-types overlap dates from December 2025

Also raised by the CI lens as ci-infra-r2-C-ci-r2-N5 (N10 there). This record's sentence is the one to use.

**Where:** PR #91 description, "Root cause": "This has been Dependabot's behaviour since September 2025 (dependabot-core
#13044, #13098, #13180, #13714)". The same sentence is in design §6.1 (`designs/lane-b-dependabot-batch.md:535-536`).

**Scenario:** A reader dates the misrouting from September 2025, or uses these four pull requests to decide when the
configuration started misrouting. In fact:
- the specificity skip ran only for actors in the `group_membership_enforcement` experiment until the flag was removed
  on 2026-05-19;
- the update-types and applies-to filtering that the CI-12 port models arrived on 2025-12-18.

**Evidence:** dependabot-core, own blobless clone, read 21:41Z to 21:44Z.
- #13044, `6a5b2b40` (2025-09-11), changes only `group_dependency_selector.rb`.
- #13098, `3cc43e4d` (2025-09-18), adds `return false unless
  Dependabot::Experiments.enabled?(:group_membership_enforcement)` (`dependency_group_engine.rb:114` at `3cc43e4d`).
- #13180, `d615738a`, is from 2025-09-26.
- #13714, `fafb34ec` (2025-12-18), is "Enhance dependency group specificity handling with update type and applies_to
  checks".
- #14861, `58e3d213` (2026-05-19), is "Remove group_membership_enforcement experiment flag ... rolled out to 100% of
  actors".
- At 85379652, `git grep Experiments` over the engine, the selector and the calculator finds nothing.

**Fix:** Replace the sentence with: "Introduced behind the group_membership_enforcement experiment in September 2025
(#13044, #13098, #13180), its update-types and applies-to filter added in December 2025 (#13714), and on for every
repository since 2026-05-19 (#14861, 58e3d213)." Make the same change in design §6.1.

**Skeptic:** Confirmed as a nit. Not verified by a skeptic; the fix round checks it.

### N11 (security-supply-r2-N5). Nothing triggers a re-check of the CI-12 port when Dependabot's group assignment changes, and GitHub picks the updater image for each run

Also raised by the CI lens as ci-infra-r2-C-ci-r2-N4 (N9 there).

**Where:**
- ADR 0066 `:740-741` ("Revisit when: Dependabot documents its group precedence, or a group is added");
- `docs/runbooks/dependency-upgrades.md:61-63` (step 1);
- `tools/test/dependabot-config.test.ts:61` ("ported from dependabot-core 85379652").

**Scenario:** Before or on 2026-11-05, dependabot-core merges a change to group assignment. One candidate is open PR
#16467 (`65b74b1a`, "Fix wildcard group assignment with a patternless fallback"), which lowers `NO_PATTERNS_SCORE` from
500 to 1.
- CI-12 still models 85379652 and stays green, because it tests the model, not Dependabot.
- Nothing in the runbook or the ADR asks anyone to notice.
- The head configuration happens to survive #16467: with the model changed to score 1, the routing test passes, and
  only the 2026-10-29 evidence test fails (21:53Z).
- A future change to `exclude-patterns` or to `contains?` would not be caught until misrouted pull requests appear.

**Evidence:**
- **What ran.** Run 40818560725 pulled `ghcr.io/dependabot/dependabot-updater-npm:dec480ad` (`job.log:52`), not the
  image that `github/dependabot-action@main` pins (`Dockerfile.npm` at `efdd1e48`: `v2.0.20261025165412`).
- **The image is chosen per run.** The action takes `params.updaterImage || updaterImageName(...)`
  (dependabot-action `src/main.ts:78-80` at `de7cd8d3`), so GitHub's dynamic workflow chooses the image for each run.
  The 2026-11-05 image cannot be known in advance.
- **`dec480ad` is equivalent to 85379652 for routing.** It is "Merge 96a0da19 into a887b963", a pull-request merge
  commit and not an ancestor of 85379652.
  - Its first parent, `a887b963`, is an ancestor; `96a0da19` changes only `.github/labeler.yml`.
  - `git diff --quiet dec480ad 85379652 -- updater common npm_and_yarn` reports identical trees.
  - The blob hashes match: `dependency_group.rb` `733eb098`, `dependency_group_engine.rb` `e1e34c2f`,
    `pattern_specificity_calculator.rb` `c29865e0`, `wildcard_matcher.rb` `d0d60a1a`, `group_dependency_selector.rb`
    `dd2e1222`, `ignore_condition.rb` `a56c4f35`, and the cooldown files (21:40Z).

  So the reviewed code is the code that ran on 2026-10-29.

**Fix:**
- In runbook step 1, add: "Read the npm run's `Pulling image ghcr.io/dependabot/dependabot-updater-npm:<sha>` line. If
  `git diff --quiet 85379652 <sha> -- common/lib/dependabot/dependency_group.rb common/lib/wildcard_matcher.rb updater/lib/dependabot/dependency_group_engine.rb updater/lib/dependabot/updater/pattern_specificity_calculator.rb`
  (in a blobless dependabot-core clone) fails, re-read the change against CI-12's port
  (tools/test/dependabot-config.test.ts:61) and record it."
- In the ADR amendment at `:740-741`, extend "Revisit when" with "or dependabot-core changes its group assignment (the
  npm run's updater image; runbook step 1)".

**Skeptic:** Confirmed as a nit. Not verified by a skeptic; the fix round checks it.

### N12 (security-supply-r3-SS3-N1). C's AWS routing sentence is ungrammatical ("which minor-and-patch's exclusions keep theirs")

**Where:** `docs/runbooks/dependency-upgrades.md:328-329` at 651f8b80.

**Scenario:** A reader cannot tell what "keep theirs" refers to, or whether "(minor and patch)" applies to aws-cdk,
aws-sdk or minor-and-patch. This is the sentence that tells triage which pull request an `@aws-sdk` bump arrives in.

**Evidence:** The text at `:328-329` reads: "`@aws-sdk/*` come in the `aws-sdk` group, which minor-and-patch's exclusions
keep theirs (minor and patch)." The paragraph is rewritten for the #94 conflict anyway (N1; CI lens S1).

**Fix:** "- **AWS.** `aws-cdk`, `aws-cdk-lib` and `constructs` come in the `aws-cdk` group and `@aws-sdk/*` in the
`aws-sdk` group, minor and patch only; minor-and-patch excludes their patterns, so none of them comes in its pull
request." These lines then replace the first two lines of the resolved paragraph in N1 and in the CI lens's S1.

**Skeptic:** Confirmed as a nit. Not verified by a skeptic; the fix round checks it.

### N13 (security-supply-r3-SS3-N2). The reviewer table lists `security-reviewer` as "Not run", but the security and supply-chain review ran three rounds under that agent's brief

Also raised by the CI lens as ci-infra-r3-ci-infra-r3-N2 (N12 there).

**Where:** PR #91 description, "Reviewer agents' findings".

**Scenario:** A reader of the approval-of-record page concludes that no security review happened for a change to a
supply-chain control. Design §8.4.5 requires that review as a row of its own, and the template (`:45-47`) asks for the
agents that ran to be named.

**Evidence:**
- Design §8.4.4 ("each given .claude/agents/security-reviewer.md", `:766`) and §8.4.5 ("The security and supply-chain
  review still runs (item 4) and is its own row", `:784-785`).
- `pull_request_template.md:45-47`.
- The body says the findings "will be added here".
- Rounds r1 (N1-N5), r2 (S1, N1-N5) and r3 exist (this record).

**Fix:** Add a row "Security and supply-chain review (`.claude/agents/security-reviewer.md` brief), rounds 1-3", with
one row per finding and its resolution. Keep "Not run" only for `payment-engine-reviewer` and `edi-reviewer`.

**Skeptic:** Confirmed as a nit. Not verified by a skeptic; the fix round checks it.

### N14 (security-supply-r3-SS3-N3). The Checks row's icudtl.dat explanation is wrong: the line comes from a test's own fake sha256sum

Also raised by the CI lens as ci-infra-r3-ci-infra-r3-N3 (N13 there).

**Where:** PR #91 description, Checks, the `pnpm test` row ("from the local browser cache; no test depends on it").

**Scenario:** A later reader sees the I/O error in CI and treats it as local cache noise. It is in fact the expected
stderr of the unreadable-file case of CI-5 and SEC-3.

**Evidence:** `tools/ci/browser-build.test.ts:444-460` at 651f8b80 writes a fake `sha256sum` that prints "sha256sum:
$file: Input/output error" for `*/icudtl.dat`, and asserts at `:460` that one file was not hashed. CI's unit job on the
head prints the same line (CI lens N13).

**Fix:** "the `sha256sum ... icudtl.dat: Input/output error` line is tools/ci/browser-build.test.ts's own unreadable-file
case (:444-460), expected on every run".

**Skeptic:** Confirmed as a nit. Not verified by a skeptic; the fix round checks it.

### N15 (security-supply-r3-SS3-N4). The Why section credits CI-12's assumption to the item's correction 2, which names only the comment

Also raised by the CI lens as ci-infra-r3-ci-infra-r3-N4 (N14 there).

**Where:** PR #91 description, Why, bullet 2.

**Scenario:** The record misattributes where the CI-12 gap was found. Correction 2 also says "Exact names kept their
groups", while C's own text says an exact name was in two groups.

**Evidence:** `lane-b-dependabot-batch-status.md:76-80` (correction 2; re-read by the writer at 03:33Z) names only the
comment at line 48 and the wildcard losses. The CI-12 assumption comes from design §6.1 and §6.3.

**Fix:** "correction 2 found the comment's first-match claim false for wildcard patterns; the design (§6.1, §6.3) found
CI-12 assumed the same rule and that exact names sat in two groups".

**Skeptic:** Confirmed as a nit. Not verified by a skeptic; the fix round checks it.

## Refuted findings

None. Every finding this lens raised was confirmed. The skeptics corrected four of them:
- **S1.** The fix now states the guard as the one exception to "never jump". It adds #95, the shared record files and
  "verified", fixes "## Why", and pins no heads.
- **S2.** The fix lists runs with `gh api`, since the MCP has no dynamic-event filter. It allows #89 to close with no
  successor, and it closes a successor only when A or B takes everything in it.
- **S3.** The deadline-hold scenario is refuted: the ruling is general (LANES.md `:204`, 02:35 UTC) and was already
  applied to #90. So the fix records the warning and asks the orchestrator nothing.
- **SS3-S3,** now N1. It was rerated from S to N and merged into the CI lens's S1, which keeps S. "Written down nowhere"
  holds only for the exact text: the keep-both rule is recorded in five places.

## What I checked and found sound

### The configuration, as Dependabot runs it (r1, 2026-11-01 21:12Z to 21:27Z)

- **Diff scope.** `git diff --stat bce57f16 651f8b80` shows 7 files, none of them a manifest, `pnpm-lock.yaml` or
  `pnpm-workspace.yaml`.
  - `dependabot.yml` changes only the comment at `:48-52` and the 13 exclude-patterns at `:72-88`.
  - These are unchanged: the cooldown (`:34-35`, `default-days` 3), the ignores (`:37-47`), the security group
    (`:89-91`, `applies-to: security-updates`, patterns `["*"]`), the days, `open-pull-requests-limit` 8 (`:33`), and
    the actions, docker and compose entries.

  CI-12 still pins all of them.
- **dependabot-core 85379652, read** (blobless clone):
  - `dependency_group.rb:52-70` and `:109-122` (`contains?`);
  - `wildcard_matcher.rb:10-18`;
  - `dependency_group_engine.rb:30-57` (version jobs see only version-updates groups; `applies_to` defaults to
    "version-updates"), `:107-132` and `:189-225`;
  - `pattern_specificity_calculator.rb:55-81`, `:99-153` and `:182-235`;
  - `group_dependency_selector.rb:205-265`;
  - `group_update_creation.rb:351-375` and `:461-536`;
  - `semver_grouping_rules.rb:42-71`;
  - `group_update_all_versions.rb:82-143`;
  - `dependency_snapshot.rb:126-193`;
  - `refresh_group_update_pull_request.rb:90-183`.

  `Job::DependencyGroupDefinition` passes `exclude-patterns` through in its rules.
- **Core's own Ruby, run.** Four core files ran over the 63 direct names (all 22 tracked `package.json` files across
  the four dependency fields, plus the catalog) and 15 edge names (`@aws-sdk/client-sqs`, `@next/env`, case variants,
  `next-auth`, `aws-cdk-local`, …).
  - **On the head,** every name is in exactly one group, the intended one, with 0 ungrouped and 0 "more specific"
    lines. No second-layer filter applies for major, minor or patch. The security job sees only `security`, which takes
    every name.
  - **On the base,** the 10-29 skips are reproduced, and 13 exact names are in two groups.

  Outputs: `review-C/secsup-scripts/route-head.out` and `route-base.out`.
- **Differential fuzz.** The test's model (test lines 77-111, taken verbatim) was run against core's engine over 6,000
  random configurations, 1,922 of them with a specificity give-up: 0 mismatches (`secsup-scripts/fuzz*`).
- **Majors, ignores and cooldown.**
  - Membership is by name, and update-types are applied after the update checker runs
    (`semver_grouping_rules.rb:42-71`).
  - A major rejected by a group's update-types becomes an individual pull request, as before.
  - The ignores bind version updates as before (security updates: N5).
  - Cooldown is job-level (`group_update_creation.rb:581`).
  - The 10-29 job definition shows `default-days` 3, 7 groups with `security` filtered out, and
    `existing-group-pull-requests` [].
- **Schema and validation.**
  - Both the head and base `dependabot.yml` validate against SchemaStore `d227d9f5` `dependabot-2.0.json` (ajv 8.20.0,
    21:15Z).
  - github/docs `33b1f4a6` documents `exclude-patterns` (`dependabot-options-reference.md:334`, `:374-376`), and shows a
    group with `exclude-patterns` and no patterns (`dependabot-version-updates-groups-yaml-example.md:17-22`).
  - GitHub's own validation check run 124939537364: success (N3).
- **Supply-chain commands** on the head, with `BASE=origin/claude/build-platform`, under flock:
  - `pnpm install --frozen-lockfile`: ok;
  - `pnpm toolchain:check`: 0 errors, 1 warning (pnpm 10.34.9), "the lockfile adds no version against the base",
    `minimumReleaseAge` 4320, and `trustPolicy` no-downgrade not loosened (21:19:27Z);
  - `pnpm licenses:check`: 185 production packages;
  - CI-12: 10 of 10.

  No version was added, so there is no publish-age, provenance, licence, install-script, maintainer or deprecation
  question.
- **No runtime surface.** No new outbound call, telemetry or header. The test only reads files, and
  `tools/typecheck/run.ts` and `lint/run.ts` are guarded against running on import (`:328`, `:226`). There is no PHI,
  document text, prompt or log path, and no tenant or RLS surface. The CI-12 fixture is `synthetic: true`.
- **Step 1's signal cannot fire falsely** under the head. No name is contained by two version groups, minor-and-patch
  never checks specificity, and the security, actions and docker jobs each have one group.

### The code that ran, the input set and Dependabot's close behaviour (r2, 21:40Z to 21:55Z)

- **The updater.** `dec480ad` equals 85379652 under `updater/`, `common/` and `npm_and_yarn/` (N11 evidence). Every
  earlier fuzz and port at 85379652 therefore stands for the 10-29 run. The grouping files last changed on 2026-08-07.
  The head configuration routes every dependency correctly under open core PR #16467's change too (21:53Z).
- **The input set.** The test's own `directDependencies()`, run with tsx at the head, gives exactly the 63 names in the
  10-29 job's "Checking if … needs updating" lines (empty diff). The 569-name "Dependency Snapshot" includes transitive
  packages.
  - No catalog-only name exists.
  - Neither Dependabot nor the test treats the `workspace:` `@tp/*` packages or the override target
    (`typed-rest-client>qs`) as dependencies.
  - The manifests are unchanged since `83d71fd6`.

  Files: `review-C/ss2-testset.txt` and `ss2-checked.tsv`.
- **Trial merges.** With #84, #85, #90, #92, #93 and #42, every merge is clean and synth-clean (S1's evidence). Two of
  them add direct dependencies, and CI-12 passes on both merged trees:
  - #42 adds `@aws-sdk/client-sqs`, which routes to aws-sdk;
  - #90 adds `@opentelemetry/api`, which routes to minor-and-patch.
- **The CDK sentence.** `cloud-assembly-schema` 54.26.0 documents `minimumCliVersion` as "the minimum version of the CLI
  … that supports reading this assembly" (`schema/cloud-assembly.schema.json:12-13`), and `manifest.js` writes it from
  `cli-version.json` (2.1144.0).
- **Close behaviour.** Closing a grouped pull request ignores nothing (#33). The 10-29 job's ignore conditions are only
  the file's five, with cooldown `default-days` 3 and `security-updates-only` false.

### The new base, #86, the resolution and the description's other sections (r3, 2026-11-02 02:27Z to 02:44Z)

- **The new base and #92.** #92 merged as `4eaf7124`, and changes no manifest, lockfile or `dependabot.yml`.
  `merge-tree` with 651f8b80 is clean (tree `9a7882b8`). On trial `75bc1e90`, with a frozen install:
  - synth: 269 cases, 0 written, 661 unchanged, clean;
  - CI-12, `packages/synth` and `tools/screening-capacity`: 22 files, 397 tests;
  - `watched.ts --write`: no diff;
  - `toolchain:check`: 0 errors, 1 warning, "lockfile adds no version against the base";
  - `licenses:check`: 185 packages.

  Logs: `review-C/r3s-scripts/trial-newbase.log`, 02:28:47Z to 02:39Z.
- **Other open PRs** at 02:38Z: base + C merges cleanly with #42 `9426a8d1`, #90 `4e70738d`, #93 `d1e4c4c4`, #95
  `8517ee3a` and #96 `50029e64` (ADR 0066 Part 7). All were drafts.
- **#86.** `4eaf7124` + `d257fe6d` (#86's fix-round WIP) + C gives tree `b25c0912` in either order. On it, CI-12 and
  `workflows.test.ts` pass (134 tests, including the simulated Dependabot rewrite), and synth is clean
  (`r3s-scripts/trial-86.log`, 02:35Z to 02:36Z). ADR 0066's header is unchanged on that tree.
- **The resolved AWS paragraph.** Tests and lint pass on it (N1), and B's CLI has every symbol B's lines name.
- **The limit and cooldown.** The limit of 8 is not reached. Cooldown applies in refresh jobs too
  (`group_update_creation.rb:580` passes no cooldown only for security jobs).
- **The freeze exception** is correct. `change-order-001.md:10` is rule 4, and the security program in
  `reconciliation-001.md:486-494` does not include the Dependabot configuration.
- **Security on every merged tree.** No runtime code, outbound call, telemetry or header is added, and no path for PHI,
  document text or prompts. CI's CDK path (`pnpm cdk:diff`) already runs with telemetry off on the base. These are
  unchanged on every merged tree:
  - the security group and its `applies-to`;
  - the majors' ignores;
  - the 3-day cooldown;
  - the release-age floor.

### Not verified

- Whether Dependabot runs docker and actions jobs on an npm-only change.
- Whether all three open group pull requests are recreated on one configuration change.
- Which dependabot-core image GitHub picks for 11-05.
- Whether #86 merges before 2026-11-04 12:00Z. It is plausible, but its R3 push and CI had not happened.
- How a live security run treats the update-types ignores (N5).

## Proposals outside PR C's files (not built)

- **P1. Release C from waiting for #86** (r3 P1, for the orchestrator; the CI lens's P3 agrees). C adds no conflict at
  either #86 head:
  - at `83167b8f`, the same conflicts as the base;
  - at `d257fe6d`, a clean merge, tree `b25c0912` in both orders.

  The 20:36Z rule orders only pull requests that conflict, so the wait adds only deadline risk.
- **P2. Make GitHub's Dependabot config validation check required** for pull requests touching
  `.github/dependabot.yml`, or read it in the merge procedure (r1 P2; N3). This is the founder's ruleset.
- **P3. Prove the service passes `exclude-patterns` through** (r1 P3). On the first npm run after the merge, read the
  "Job definition" line and confirm that minor-and-patch's rules carry `exclude-patterns`. This is the only live proof
  that GitHub's service passes the key to the updater; the core code and the validator are already proven. Record it in
  the status file, with S2's post-merge check.
- **P4. A dependabot-core watch** (r1 P4; N11). Compare upstream's `dependency_group.rb`, `dependency_group_engine.rb`,
  `pattern_specificity_calculator.rb` and `wildcard_matcher.rb` against 85379652, and flag a change for re-review. The
  Ruby harness in `review-C/secsup-scripts` is evidence only and must not run in CI, because it executes downloaded
  code.
- **P5. The pnpm 10.34.9 `packageManager` bump** (r1 P5) is still due (`toolchain:check`'s warning). Outside this PR.
- **P6. Design §8.7, §8.8 and §6.1** (r2 P1, P2; r3 P2):
  - strike §8.7's "First, for every merge … ask the orchestrator" (`:822`), which ruling 2c superseded;
  - qualify §8.8's "Closing this pull request ignores nothing" (`:868`) as true for grouped pull requests only;
  - correct §8.8's note (`:874-875`): C's merge closes #89 as "dependencies changed", may open a successor and may
    supersede #87 and #88; A and B close the successors only when they take everything in them; on 11-05 an aws-sdk PR
    opens only if what is locked then is older than 3.1161.0;
  - make N10's correction in §6.1 (`:535-536`).
- **P7. After the 2026-11-05T04:31Z run** (r2 P3; r3 P5):
  - read its "Pulling image …dependabot-updater-npm:<sha>" line and diff the four grouping files against 85379652;
  - if C has merged, confirm the run has no "belongs to more specific group" line and no WARN "groups where no
    dependencies match";
  - after any `dependabot.yml` change, read the immediate runs the same way (S2's runbook line).

  Record each in the item's status file.
- **P8. Reading upstream pull requests** (r2 P4). Dependabot's REST API for dependabot-core pulls answered 403 for this
  session, while `git fetch` of `refs/pull/*` worked. Reviewers who need upstream pull requests should use `git fetch`,
  or request read access with `add_repo`.
- **P9. Two stored per-version suppressions exist today** (r2 P5): #16 (typescript 7.0.2) and #17 (`@types/node`
  26.6.5), carried in every npm job's `existing-pull-requests`. Both are covered by the file's major ignores now. They
  would silently suppress those exact versions if the major ignores were ever removed, and reopening and re-closing
  them changes nothing. Note them in the next weekly triage record.
- **P10. A test for the AWS paragraph in B's own file** (r3 P3; N1's skeptic). Have `infra/test/cli-settings.test.ts`
  assert that the runbook's AWS bullet names `CDK_DISABLE_CLI_TELEMETRY`, `notices` and `CDK_DISABLE_VERSION_CHECK`, so
  a one-sided conflict resolution fails CI.
- **P11. The O9 rule in the runbook** (r3 P4, now answered). The orchestrator's 02:35 UTC entry states the O9 ruling
  generally, so no new ruling is needed. Bring `docs/runbooks/screening-capacity.md:101-103` in line with it (the CI
  lens's P2).

## Commands and logs

All under `review-C/`:
- **Progress notes:** `progress/security-supply-r1.progress.md`, `security-supply-r2.progress.md` and
  `security-supply-r3.progress.md`.
- **Round 1:** `secsup-scripts/`:
  - `route.rb` and `rb/` (the core files);
  - `route-head.out` and `route-base.out`;
  - `fuzz.rb`, `fuzz.mjs`, `fuzz2.mjs` and `fuzz*-cases.json`;
  - `model.ts`, `validate.mjs`, `jobdef.mjs`, `deps.mjs` and `deps.tsv`;
  - `logs/` (`install.log`, `toolchain.log`, `licenses.log`, `ci12.log`).

  The 10-29 job log is `tmp/secsup-runlog/job.log`.
- **Round 2:**
  - `ss2-logs/c-{42,75,84,85,90,92,93}.log` (trial merges);
  - `ss2-scripts/`;
  - `ss2-jobdef.json`, `ss2-checked.tsv`, `ss2-testset.txt`, `ss2-direct*.tsv`, `ss2-snapshot.txt` and
    `ss2-install.log`.
- **Round 3:**
  - `r3s-scripts/` (`trial-newbase.log`, `trial-86.log`, `trial-B.log`, `aws-merged.txt`, `conflict.md`, `resolve.py`,
    `guc.rb`);
  - `tmp/r3s-dynlogs` (the precedents' Dependabot logs);
  - `tmp/r3s-gate` (the capacity gate log).
- **The skeptics' downloads:** `tmp/refute-ss3s3-032521`.
- **The writer's clone:** `clone-writer`, used 03:30Z to 03:36Z, removed afterwards. The other reviewer's files were
  not touched.
