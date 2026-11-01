## Your item
CI follow-up P1, `ci-pin-age` (PR #82, ADR 0066 Part 5). It holds every action pin and image digest to the same three-day release-age floor that npm versions already meet. The age comes from a time GitHub or Docker Hub recorded. The only way in early is a dated, exact exclude of at most seven days. Hijacked or moved tags fail on CI.

The PR is built and has both reviews, with every finding fixed. The fix round is done. The fresh-clone verification (wf_4dac1326-48a) passed on the code, the local runs and CI. Its 11 description corrections were applied as body v3. Every check is green on 96758e44. Its merge hold lapsed at 2026-10-28 11:00 UTC. It is **first in Lane B's merge order**. Only the base merge and the merge itself remain.

### Branch and head
- `co-001/ci-pin-age` is at **96758e442dd01e2fb393ff6e9cac6f07e58a78c2**. `refs/pull/82/head` is the same. Re-checked with `git ls-remote` at 2026-11-01 15:45 UTC.
- The base `claude/build-platform` is at **83d71fd62c6d419be61fd7aaa5b9033ef5c18b56** (#78). The head does not contain it: the head is 39 commits ahead and 19 behind, and the merge base is 56ed6279.
- WIP ref `co-001/wip-ci-pin-age-f2` is at 7e14ea0e (2026-10-28 04:03Z). It is an ancestor of 96758e44, so there is nothing to continue from it. Leave it.
- Trial merge of 83d71fd6 into 96758e44 (`git merge-tree`): **clean**, tree `d72150bdbcc65c1de6b7265d8fa45a0b7a6a73b3`. That is the tree of GitHub's merge ref `refs/pull/82/merge` = b9669bbf (parents 83d71fd6 and 96758e44), which CI ran green for 96758e44.

### PR
- #82, "CI follow-up P1, ci-pin-age: action pins and image digests held to the three-day floor (ADR 0066 Part 5)".
- State: **open, draft**. `mergeable_state` is `behind`, and GitHub records base 56ed6279.
- Ruleset 25837331 requires strict up-to-date checks: `all green`, `mutation`, `screening-capacity gate`, `approval-of-record`.
- 26 check runs on 96758e44: 24 success and 2 skipped (`notify`, `stryker`).
  - Workflow runs: ci 40649212144, screening-capacity 40649212134, mutation 40649212125, release-dry-run 40649212209, approval-of-record 40649212149.
  - approval-of-record re-ran at 07:57:50Z (run 40653457350).
- No reviews and no comments.
- Body: 29,997 characters, last updated 2026-10-28T07:57:43Z. Its SHA-256 is 7b7c808a… (checked live), the v3 the status file records as read back.

### Design
- `designs/lane-b-ci/follow-up-p1-pin-age.md` on build-ops. **Complete and built.**
  - Written 2026-10-26 against 6ddd587 and folded with `follow-up-p1-pin-age-review.md` (§13).
  - Re-read at ecebdc90 (§14, wf_05b5c43a-d57). That re-read's review, `follow-up-p1-pin-age-reread-review.md`, was folded (§15).
  - §16 records the fix round.
- The follow-ons are both on build-ops: `designs/lane-b-ci/follow-up-p2-trivy-version.md` (+`-review.md`) and `follow-up-p4-mutation-trigger.md` (+`-review.md`).
  - Both were designed, reviewed and folded on 2026-10-26 (commit 11613513), against 6ddd587 plus `co-001/ci-deps` 19e3d98e.
  - **Neither has been re-read against a later base.**
  - ci-speed (#43), ci-mutation (#44) and the runner pin (#24) merged *before* 6ddd587. Since 6ddd587 these have merged: ci-deps #48 (e908c214); #49, which added `content-calendar.yml` and `release-capacity.yml`; #76; ci-browser #77 (ecebdc90); #80; #79; #74; #81; and #78 (83d71fd6). P1 #82 and #86 will merge too.
  - P4 §11 says "the pull request merged later rebases". LANES rule 6 overrides that: merge with a merge commit, never rebase.

### Status file
`approval-summaries/lane-b-ci-deps-status.md` on build-ops. It **exists**: 228 lines, with the RESUME-BLOCK at lines 11–23.

Add a heading "Continued 2026-11-01 by a Lane B item session (<your session id>), started by Lane B's orchestrator (session_01FcouKNNHsdecRMzfTs7XwW)" and rewrite the RESUME-BLOCK. Do not rewrite dated history entries: add a dated one-line "superseded; see the RESUME-BLOCK" note to each of them instead. Correct these first:
1. Line 9's "Waiting on someone: the founder or the triager closes Dependabot PR #33 by hand", and the same words in the RESUME-BLOCK's Dependabot bullet (line 18). **#33 was closed unmerged at 2026-11-01T14:03:52Z.** Nothing waits.
2. The RESUME-BLOCK heading's "waiting on the merge hold", the "Merge hold (the orchestrator, 07:20 UTC)" bullet, and "Next (P1): when the hold lifts". **The hold lapsed at 2026-10-28 11:00 UTC.** #82 is now first in the merge order.
3. "P1 PR #82 (draft; subscribed), head **b574d4e8** on 0dd1ba7e" is wrong on three points:
   - The head is **96758e44**.
   - The subscription belonged to session_01UzQ6wgZgtThBRBxXTFYhRB, which this account cannot see (`get_session`: not found). Re-subscribe.
   - The PR is now `behind`, and the strict ruleset blocks the merge until the base is merged in.
4. "Check-in: trig_01VRYza7kBainue2gH5RZVHo at 10:25 UTC". **No scheduled tasks exist on this account**: `list_triggers` is empty.
5. "Also running: ci-images-digest". **Nothing is running.** #86 (83167b8f; CI 23 success and 2 skipped; no reviews) is a separate item session with its own status file, `lane-b-ci-images-digest-status.md`.
6. "Queued: ci-findings-transport (after ci-images-digest merges…). Then P2, P4." ci-findings-transport is now its own session and starts after #86. This session takes **P2, then P4**, after #82 merges.
7. Line 174's "Follow-ups P1, P2, P4: designed and reviewed, not built … cut each after ci-deps and ci-browser merge", the 10-26 table at lines 219–223, and the 10-26 handoff's "ci-browser at 8b38f48 (pushed; no PR)" (lines 162–172). Three facts replace them:
   - P1 is built (#82).
   - ci-deps (e908c214, #48) and ci-browser (ecebdc90, #77) are merged.
   - P2 and P4 each need a re-read before their build.
8. The 2026-10-27 01:45 entry (line 30) says the proxy refuses storage.googleapis.com. **It has been allowed since 2026-10-27**, so the playwright lines should pass.
   - Add the new container fact: `tools/setup-container.sh` at build-ops 15725ba2 FAILs with "node: /opt/node24/bin/node reports 'v24.22.1', not v24.22.0" on the current base image.
   - The fix is `mv /opt/node24 /opt/node24.base-image`, then run the script again.
9. Line 226's "Proposals outside these PRs: `tools/setup-container.sh` pins pnpm 10.28.0". build-ops' script pins **pnpm 10.34.8** (07e96172). Mark the proposal done.
10. The LANES.md claim row (line 173) still says "P1, P2 and P4 designed and reviewed …, not built".
    - The orchestrator corrects the row and adds "#82 at 96758e44" before spawning (brief F).
    - After pulling, check the row. If it still says "not built", correct it yourself.
    - Add P2's and P4's PR numbers when you open them. Pull first and never force.

### Reserved numbers
The LANES.md claim row (line 173, started 2026-10-26 00:55) reads: "ADR 0066, a new part each; test-matrix and `packages/synth` CI-21 to CI-29". Split per design:
- P1: ADR 0066 **Part 5**, CI-21 to CI-23. All three are used on the branch, with fixtures `fixtures/synthetic/CI-21..23`.
- P2: **Part 6**, CI-24 to CI-26.
- P4: **Part 7**, CI-27 to CI-29.

No other open branch uses CI-21 or higher, or ADR 0066 Part 5 or later (#86 amends ADR 0066 without adding a part). There is no new ADR number, no synth module and no migration. P5 `ci-catalog` is in the same row with no IDs reserved. It is not this session's: it waits for #42.

### Setup arguments
`co-001/ci-pin-age:/home/user/ci-pin-age`

P2 and P4 have no branches on origin yet. The setup script refuses a branch that is not on origin (`setup-container.sh:1069`), so cut them later with `git worktree add` (see Follow-on).

### Exact next step
1. **Machine.** Run this in the background until it prints OK:
   ```
   git -C /home/user/PhysicalTherapy fetch -q origin claude/build-ops && git -C /home/user/PhysicalTherapy show FETCH_HEAD:tools/setup-container.sh > /tmp/setup-container.sh && bash /tmp/setup-container.sh co-001/ci-pin-age:/home/user/ci-pin-age
   ```
   - If it FAILs on node v24.22.1, run `mv /opt/node24 /opt/node24.base-image` and run it again. If build-ops by then carries the orchestrator's change that moves the base image's Node aside, this is not needed.
   - **Hook check:** the hook is the launcher at `<git common dir>/hooks/pre-push`, and `core.hooksPath` must be **unset**. If it is set, git never runs the launcher.
     - `git -C /home/user/PhysicalTherapy config core.hooksPath` must print nothing.
     - `grep -qxF '# paidwhole pre-push launcher' "$(git -C /home/user/PhysicalTherapy rev-parse --path-format=absolute --git-common-dir)/hooks/pre-push"` must succeed.
     - If the hook or gitleaks is missing, run `pnpm hooks:install` and `pnpm gitleaks:install`.
   - Shell: `export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH`. Heavy commands run under `flock /tmp/laneb-heavy.lock`.
2. **Status file.** Edit it in `/home/user/ops` with the corrections above, commit there with your own attribution lines, then pull and push:
   ```
   git -C /home/user/ops pull --no-rebase origin claude/build-ops
   GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks git -C /home/user/PhysicalTherapy push origin claude/build-ops
   ```
   Never force.
3. **Subscribe and check-in.**
   - `subscribe_pr_activity` for PureTideWater/PhysicalTherapy #82. If it says another agent is watching, poll with `pull_request_read get_check_runs` instead.
   - Schedule a `send_later` safety check-in about 5 h 10 min ahead. The account's window resets near 19:10 UTC.
4. **Merge the base.** Re-check `git ls-remote origin refs/heads/claude/build-platform` (expect 83d71fd6). In `/home/user/ci-pin-age`:
   ```
   git fetch origin && git merge --no-ff origin/claude/build-platform -m "Merge claude/build-platform (83d71fd6: #78 refused downloads) into co-001/ci-pin-age before its merge" -m "<one line: no conflict>" -m "<the attribution lines your own system prompt gives>"
   ```
   - Expect no conflict. `git rev-parse HEAD^{tree}` must print `d72150bdbcc65c1de6b7265d8fa45a0b7a6a73b3`.
   - Then, under the lock: `pnpm install --frozen-lockfile`, `pnpm synth --all`, `pnpm exec tsx tools/screening-capacity/watched.ts --write`. `git status --porcelain` must be empty. If a generator writes anything, commit it; never hand-edit.
   - **If the base has moved past 83d71fd6:** merge the latest instead and keep both sides of any rule-6 document. Then:
     - Run the same generators and the unit checks the delta touches.
     - If the delta brings a workflow, manifest or lockfile change (#42 does), also run `BASE=origin/claude/build-platform pnpm actions:check` and `pnpm toolchain:check`.
     - If you resolved a conflict, or the tree is not the one CI already passed, run a one-agent fresh-clone re-verification that reads CI on the new head before step 7. Adapt `workflow-scripts/lane-b-ci-browser-reverify-wf_4b80f4eb-9bb.js`.
5. **Push and CI.**
   - Push through the pre-push hook, never `--no-verify`:
     ```
     GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks git -C /home/user/ci-pin-age push origin co-001/ci-pin-age
     ```
   - Wait for all four required checks on the new head: `all green`, `mutation`, `screening-capacity gate` and `approval-of-record`. `capacity` took 16 minutes last time.
   - Also wait for release-dry-run.
6. **The description's merge line.** Use MCP `update_pull_request`, then read the body back byte for byte. Stay under 65,536 (now 29,997).
   - Under "### The fix round (2026-10-28)", after line 76's "`03e18576` merges `claude/build-platform` at 56ed6279", add: "`<new>` merges `claude/build-platform` at 83d71fd6 (#78), with no conflict; its tree d72150bd… is merge ref b9669bbf's; synth --all and watched.ts --write write nothing".
   - On line 110, change "against the merge base 56ed6279" to 83d71fd6. The count is unchanged: `git diff --shortstat 83d71fd6 b9669bbf` gives 55 files, +7,079 −280.
   - Add a "CI on `<new>`" block with the run ids and the unit count. Keep "CI on `96758e44`" as history.
   - The `edited` event re-runs approval-of-record.
7. **Ready.** Call `update_pull_request` with `draft: false`. Wait for approval-of-record's `ready_for_review` re-run to go green on `<new>`.
8. **Merge.** Call `merge_pull_request` with `merge_method: merge` and `expectedHeadSha: <new>`. Title it in the house form: "Merge pull request #82: …". If the base moved in the meantime, repeat steps 4–7 first.
9. **After the merge.**
   - `unsubscribe_pr_activity` for #82.
   - Read every push run on the merge commit: ci, mutation and screening-capacity, plus release-dry-run or content-calendar if their path filters fire.
   - Fast-forward the main checkout and run `pnpm install` under the lock.
   - `git worktree remove /home/user/ci-pin-age` and delete the local branch. The remote branches stay.
   - Write a status file entry and push it.
   - `send_message` to session_01FcouKNNHsdecRMzfTs7XwW: "#82 merged as <sha>". #86 merges next and resolves against it.

**Pipeline for P1:**
- **Done:** design, build, draft PR, both reviews, the fix round with the full suite at 03e18576, the CI fix 96758e44, and the fresh-clone verification.
- **Remaining:** base merge, CI, description, ready, approval-of-record, merge.
- No workflow script is needed unless step 4's re-verification applies.

### Merge order and dependencies
- **#82 merges first in Lane B's order.** Nothing has to merge before it. #42 (S0, acting Lane A) merges whenever the founder's line lands. If #42 or anything else lands first, merge the new base again (step 4).
- Merging #82 adds conflicts for **#86 only**. Checked with trial merges against base + #82: `docs/adr/0066-…pin-every-dependency.md`, `docs/product/reconciliation-001.md` and `tools/test/workflows.test.ts`. **#86 merges second and resolves them, keeping both sides.**
- No other open branch gains a conflict from #82: #42 be63bdc2; #75 871faff9 and wip-5 7f77cb19; #83 f4a97668 and WIP f5e0ceba; #84 e3299ea2; #85 29dded52; SS-01 f897a282; 1b 358dc53f; interest e0646746. Their existing conflicts with the base are unchanged.
- #42 shares six files with #82: `.github/workflows/ci.yml`, `tools/test/workflows.test.ts`, test-matrix, reconciliation-001, and the synth matrix and registry. The trial merge is clean. #42 runs `pnpm synth --all` afterwards.

### Waiting on someone
- **Nothing blocks #82's merge.** LANES rule 7: a non-schema PR merges on green CI once its fresh-clone verification has passed, until runbook 3i.
- Runbook 3i and `APPROVAL_REVIEW_REQUIRED` stay the founder's.
  - If they land before the merge, wait for the founder's APPROVED review of the latest commit (CLAUDE.md "Merging").
  - Today they block nothing; approval-of-record is green on 96758e44.
- Never approve, request changes or write an approval.
- #33 is closed. Nothing waits on it.
- **Usage:** the co-founder said at 2026-11-01 ~14:40 UTC that weekly usage is under 20%, so go wide.
  - Before each later heavy run (P2's and P4's builds and fix rounds), ask the orchestrator for the current figure (rule 9).
  - Pace at about 11% a day. Start no new heavy run past about 80%.
  - The week resets Friday 2026-11-06 19:00 UTC.
- P2 and P4 have no open founder questions. Two rulings would be the founder's, neither expected and neither blocking:
  - raising P2's 48-hour Trivy database floor (P2 §10);
  - an early exclude for Trivy (P2 §7).

### Follow-on
Do these in this session after #82 merges. Each is its own PR into `claude/build-platform` (never `main`) and goes through the whole pipeline.

**For every script adapted from `workflow-scripts/lane-b-ci-pin-age-*`:**
- Rewrite `SP`, which is the old session's scratchpad in all four scripts.
- Replace the hard-coded `Claude-Session: …session_01UzQ6wgZgtThBRBxXTFYhRB` commit trailer and PR footer (build and fix-round scripts) with your own attribution lines.
- Drop the stale "api.github.com answers 403" fact (build script line 17; re-read script lines 17 and 85). `gh api` now reads repos, pulls, commits, releases and Actions runs. Only some Actions paths, such as `/actions/variables`, return 403.

1. **P2 `co-001/ci-trivy-version`** (ADR 0066 Part 6, CI-24 to CI-26).
   - **Re-read** the design against the latest base, with one reviewer. Adapt `lane-b-ci-pin-age-reread-wf_05b5c43a-d57.js`. Refresh Trivy's latest release and its three-day age, trivy-action, and the `@sigstore/*` versions. P2 imports P1's `releaseAgeMinutes`, so read it from the merged P1.
   - **#86 overlap.** If #86 is still open, also read its hunks:
     - ci.yml `images`: base lines 660–748, around the base's Trivy steps at 690 and 715 (695 and 720 after #82);
     - release.yml, release-dry-run.yml, release-capacity.yml, screening-capacity.yml and ci.md.
     - Prefer cutting after #86 merges. Otherwise the PR merged second resolves.
   - **Other overlaps.** P2 also overlaps #42 (lockfile, test-matrix, synth matrix and registry; P2 §11) and Dependabot #87–#89 (lockfile). Whichever merges second regenerates `pnpm-lock.yaml` with `pnpm install`. Never hand-merge it.
   - **Cut:**
     ```
     git -C /home/user/PhysicalTherapy fetch origin claude/build-platform && git -C /home/user/PhysicalTherapy worktree add -b co-001/ci-trivy-version /home/user/ci-trivy-version origin/claude/build-platform
     ```
     Then run `pnpm install --frozen-lockfile` in it, under the lock.
   - **Build, draft PR and the two reviews** (CI and test infrastructure; security and supply chain): adapt `lane-b-ci-pin-age-build-wf_6cbdbf9d-9c3.js`. It holds Build, Integrate (which opens the draft PR) and Review.
   - **Fix round with the full suite:** adapt `lane-b-ci-pin-age-fix-round-wf_dfb43bb4-b4c.js`. P2 changes `package.json`, `tools/package.json` and `pnpm-lock.yaml`, all watched paths, so the fix round must include `actions:check`, `toolchain:check` and the capacity run.
   - **Verification:** adapt `lane-b-ci-pin-age-verify-wf_4dac1326-48a.js`. Then do the merge steps as for P1.
2. **P4 `co-001/ci-mutation-trigger`** (Part 7, CI-27 to CI-29).
   - Same stages and same cut form. Its re-read may run while P2 waits on CI, with at most 2 heavy workflows per container.
   - Re-read `mutation.yml` as ci-browser left it, and `stryker/shards.json`.
   - It merges after P2, with a merge commit (never the rebase that P4 §11 says). It resolves ADR 0066, the test matrix, the synth matrix and registry, reconciliation-001 and `workflows.test.ts`.
   - It overlaps #84 in `tools/stryker/{affected.test.ts,shards.test.ts}`. #84 also changes `stryker/shards.json`, `stryker/base.mjs` and `tools/stryker/equivalent/packets.json`. Re-check `RUNNER_PROOF_SHARD` (`money-ledger`) after #84's split adds `packets-roles` and `packets-words`. The PR merged second resolves.
   - Its two reviews follow ci-mutation's precedent: CI tooling and security, and payment engine (`approval-summaries/lane-b-ci-mutation-review-{ci-tooling-security,payment-engine}.md`).
   - `mutation.yml` changes, so the fix round includes `actions:check` and `toolchain:check`, and `affected.ts` selects every shard. Budget for that.

**For both:**
- No screens, so no UX review.
- Write the description from `.github/pull_request_template.md` with `update_pull_request` and read it back.
- Subscribe to each PR.
- Before each heavy workflow, schedule a `send_later` about 5 h 10 min ahead.
- Keep a progress file (SAVE).
- Archive each script as `workflow-scripts/lane-b-ci-<trivy-version|mutation-trigger>-<stage>-<runId>.js`.

### Resume
Resume from your status file: it is your handoff. Do not message the old sessions.
