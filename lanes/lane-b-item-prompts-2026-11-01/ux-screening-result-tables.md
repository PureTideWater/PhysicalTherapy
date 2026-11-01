## Your item
UX PR 4, `ux-screening-result-tables`, makes the screening result readable on a phone and makes its rows say what they are. It closes UX-005 and UX-043, and closes UX-042 and UX-132 in part. The three result tables (anomalies, top rows, coverage) move onto PR 3's `StackedRows`, the copy is fixed, and ADR 0078 gets a dated amendment. PR 3 merged as #79 (a6e754f). Done so far: the build, the draft PR, both adversarial reviews (14 findings, all taken) and the code for every finding. The fix-round commits sit on the WIP ref and have never been checked. Still to do: the base merge, the fast checks, the full local suite, the shots and their recheck, one push, the description, the verification and the merge. It matters because the public screening result breaks at 390 px (UX-005), and this is the funnel's first screen.

### Branch and head
- Branch `co-001/ux-screening-result-tables` is at **f4a9766838b613b9c9f084d85c5290b043a48ca5** (ls-remote, 2026-11-01 16:01 UTC). This is the clean base merge of 165c599 (#74).
- Continue from the WIP ref `co-001/wip-ux-screening-result-tables` at **f5e0ceba2a5213ef8f206bcfef0e142da3a61a3e**.
  - It descends from f4a97668, so a fast-forward works.
  - It has no CI (0 check runs).
  - Its commits:
    - c0a8fe0b: merges 56ed6279 (#81)
    - d0152f43: UXR-01
    - e901e477: UXR-05
    - 857ca333: P4-RC-01, -04, -06; UXR-02, -03, -04
    - f5e0ceba: P4-RC-02, -03, -05; UXR-06
- UXR-07 and UXR-08 need no code; they go in the description.
- The WIP does not contain the base 83d71fd6 (#78).

### PR
- #83 is open and a **draft**. Base `claude/build-platform`; head f4a97668.
- GitHub reports **mergeable false, mergeable_state `dirty`**. It conflicts with the base 83d71fd6 in `docs/product/test-matrix.md` and `packages/synth/src/cases/registry.ts`.
- Description: 9,056 chars, written at f4a9766, last updated 2026-10-28T05:34:11Z.
- CI on f4a97668: 20 success and 2 skipped (notify and the stryker matrix stub). Every required check in ruleset 25837331 is green on that head: all green, mutation, screening-capacity gate and approval-of-record.
- No reviews and no comments.
- Subscribe from your own session. The old session was on Lane A's account. If `subscribe_pr_activity` says another agent is already watching, no events will reach you: poll with `pull_request_read` and `gh api` instead. Never message the old session.

### Design
- `designs/lane-b-ux-screening-result-tables.md` on build-ops is complete.
  - Its one review is folded in as §12, and §12 wins (dc1e3f1a, 2026-10-28 03:05).
  - Lane A confirmed §12.1 Q1, with three conditions for 4b (0df0d259).
  - §11 specifies UX PR 4b.
- It was written at a6e754fc. Re-read §11's file:line pins against #42's merged tree before 4b.
- Review: `designs/lane-b-ux-screening-result-tables-review.json`.
- Scouts' notes: `approval-summaries/lane-b-ux-screening-result-tables-wip/design/{screen,tests,words}.md`.
- Progress files: `approval-summaries/lane-b-ux-screening-result-tables-wip/progress/p4-*.md` (scouts, design, build).
- Findings and the shots sample: `approval-summaries/lane-b-ux-screening-result-tables-review-findings.json`.
  - Keys: `.correctness.findings` (P4-RC-01 to -06), `.ux_and_brand.findings` (UXR-01 to -08), `.shots.sample` and `.shots.missing`.

### Status file
`approval-summaries/lane-b-ux-screening-result-tables-status.md` exists; its last entry is 2026-10-28 07:25 UTC. Correct these first:
1. **MERGE HOLD block:** the hold lapsed at 11:00 UTC on 2026-10-28 with #75 unmerged. No message will come. The order now is to merge after #84 (handoff §6).
2. **Session:** the owning session session_019VghcxKzP9LAj3WK8k6u1D (Lane A's account) is stopped. "This session is subscribed to the PR" no longer holds for this item. The orchestrator is now Lane B's, session_01FcouKNNHsdecRMzfTs7XwW.
3. **"Running: the fix round wf_4147d4ff-acd":** it is not running. It stopped after its Fix step and left the WIP at f5e0ceba (06:37Z).
   - Its fast-check results, the full suite and the recheck shots never landed.
   - Its scratchpad went with the old container: p4-reviews.json, pr42-files.txt, p4-fix*.md, the p4-screens-before/after shots and index, `capture/…capture.spec.ts` and `screening-result-harness.mts`.
   - "Shots: before at 165c599 and after at f4a9766" survive only as descriptions in the findings JSON.
4. **"Safety check-in 10:20 UTC (trig_014vh315v1NTqmgwpDQghedC)":** that one-shot was on Lane A's account and is not found from this one. Its time (2026-10-28 10:20) is long past. This account has no pending scheduled task, only fired one-shots from 10-25 and 10-26.
5. **"#81 merged … the PR is behind; the fix round merges it first":**
   - The WIP already holds 56ed6279.
   - The base is now 83d71fd6 (#78), and the PR reads `dirty`, not behind.
   - A trial merge of f5e0ceba with 83d71fd6 conflicts in `docs/product/test-matrix.md` and `packages/synth/src/cases/registry.ts`.
6. **"Next: the fix round (every finding …)":** every finding's code is done (see Branch and head). What remains is the base merge, the fast checks, the suite, the shots and recheck, the push, the description, the verification and the merge.
7. **Overlaps "#42 (… at 6f23c42, 212 files)"**, and the fix script's #42 list at 46974a25:
   - #42 is now at be63bdc2, with 219 files against 83d71fd6.
   - It still changes `result.test.tsx`, `e2e/screening.ts`, `e2e/screening.spec.ts` and `lib/screening/*`, plus `pnpm-lock.yaml`.
   - The trial merge of f5e0ceba with be63bdc2 is clean.
   - The only shared files are test-matrix, synth matrix and registry, and `watched-paths.txt`.
8. **Overlaps list:** it names ux-forms, which merged as #74 (165c5993). It lacks:
   - #85: test-matrix, synth matrix and registry; #85 merges second and resolves.
   - #75 and #84: no conflict in trial; they merge before #83, so #83's base merge keeps their rows.

### Reserved numbers
- LANES.md claim row, verbatim: "ADR 0078 if the design needs one (shared by both PRs); test-matrix TBL-01 to TBL-04 (PR 3) and TBL-05 to TBL-08 (PR 4), a new series; `packages/synth` cases the same if needed, synth module number 17 (TBL)".
- What this PR uses:
  - ADR 0078, a dated amendment;
  - TBL-05 to TBL-08, new;
  - TBL-01, -03 and -04, reworded;
  - synth module 17.
- No migration and no migration timestamp.
- 4b reuses TBL-08 (reworded, design §11.5). If it needs anything new, send a COUNTER REQUEST.
- The row's lane cell and its "running in the same session (session_019Vghcx…)" text are stale, and the row does not name #83. The orchestrator edits LANES.md; you do not.

### Setup arguments
`co-001/ux-screening-result-tables:/home/user/ux-screening-result-tables`

### Exact next step
1. **Machine.** Run this in the background until it prints OK:
   ```
   git -C /home/user/PhysicalTherapy fetch -q origin claude/build-ops && git -C /home/user/PhysicalTherapy show FETCH_HEAD:tools/setup-container.sh > /tmp/setup-container.sh && bash /tmp/setup-container.sh co-001/ux-screening-result-tables:/home/user/ux-screening-result-tables
   ```
   - If it fails with "node: /opt/node24/bin/node reports 'v24.22.1', not v24.22.0", run `mv /opt/node24 /opt/node24.base-image` and run the script again.
   - Then check: `pg_isready -h localhost -p 5433 && ls /opt/pw-browsers >/dev/null && echo ready`.
   - Usage (rule 9): the co-founder put the week under 20% at 14:40 UTC. Start no heavy run past about 80%.
2. **Records first.**
   - Pull: `git -C /home/user/ops pull --no-rebase origin claude/build-ops`.
   - Correct the status file (all 8 points above), add your session's URL, and commit with your trailer.
   - Push (pull first; never force):
     ```
     GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks git -C /home/user/PhysicalTherapy push origin claude/build-ops
     ```
3. **Worktree to the WIP.**
   ```
   git -C /home/user/ux-screening-result-tables fetch -q origin co-001/wip-ux-screening-result-tables && git -C /home/user/ux-screening-result-tables merge --ff-only FETCH_HEAD
   ```
   - HEAD must be f5e0ceba.
   - Call `subscribe_pr_activity` (PureTideWater/PhysicalTherapy, 83); see the caveat under PR.
   - Before each heavy workflow, schedule a `send_later` about 5 h 10 min ahead, and cancel it when the run ends.
4. **Adapt `/home/user/ops/workflow-scripts/lane-b-ux-screening-result-tables-fix-wf_4147d4ff-acd.js`.**
   - `SP`: your scratchpad.
   - TRAILER: Claude-Session set to your session.
   - PATH line: add `/opt/pnpm-bin`.
   - `${SP}/p4-reviews.json`: point it at the findings JSON (`.correctness.findings` and `.ux_and_brand.findings`, not `reviews[0]` and `reviews[1]`). Drop the references to `progress/p4-review-ux.md` and `p4-screens-index.md`; they are gone, so use `.shots`.
   - `${SP}/pr42-files.txt`: regenerate it at #42's current head (`git diff --name-only origin/claude/build-platform...origin/co-001/pr-06b-mail-streams`; be63bdc2 now).
   - Head: f5e0ceba.
   - Keep progress files, and copy them to `approval-summaries/lane-b-ux-screening-result-tables-wip/progress/` at each stage end.

   Phases:
   - **Merge and fast checks** (replaces Fix; the findings are done):
     1. `git merge --no-ff origin/claude/build-platform` (83d71fd6 or later), message "Merge claude/build-platform (#78) into co-001/ux-screening-result-tables", with the trailer.
     2. Resolve test-matrix.md and registry.ts by keeping both sides' rows (rule 6).
     3. Run the generators under the lock: `pnpm install --frozen-lockfile`, then `pnpm exec tsx tools/screening-capacity/watched.ts --write`, then `pnpm synth --all`.
     4. Commit their output in the merge, or in a follow-up commit named for the generator. Then confirm `git status --porcelain` is empty.
     5. Run the lost step-3 checks:
        - typecheck, lint and lint:copy;
        - the web unit tests: `result.test.tsx` unedited and passing, `result-tables.test.tsx`, `stacked-rows.test.tsx`, `words.test.ts` and `tables.test.ts`;
        - `watched.test.ts`.
     6. **#42 cross-check, read-only, never committed or pushed:**
        - In a scratch worktree, merge #42's current head (be63bdc2 now) into the merged head, then run `pnpm install --frozen-lockfile` (#42 changes the lockfile).
        - Run the whole web unit project. UXR-05 changed `counted()`, which every screen uses.
        - Build, then run `screening.spec.ts` and `screening-phone.spec.ts`, with their own `E2E_DATABASE` and `E2E_PORT`.
        - Remove the worktree afterwards.
        - Before pushing, report any #42 pin the PR breaks to the orchestrator (send_message session_01FcouKNNHsdecRMzfTs7XwW).
   - **Suite:** keep the phase as written, using the commands in `approval-summaries/lane-b-ux-table-scroll-fix-suite.md`:
     - test:db in 4 shards as CI does (that file ran 6), one after another on PG18 at 5433. Check the file total against `vitest list --project db`.
     - Build, stamp, then e2e with `E2E_PREBUILT=1`.
     - `tools/stryker/affected.ts`, then the gate.
     - The known flake rule for screening.spec.ts SCR-01..07.
   - **Shots and recheck:**
     - Take before at the base you merged (83d71fd6 or later) and after at the new head, per `/home/user/ops/tools/lane-b-screen-tour/README.md` "From another lane", with `TOUR_ONLY='screening-result.*,screening.*'` (comma-separated).
     - Rebuild the lost capture spec and harness from the JSON's `shots.sample`: no-anomaly, band.820, top-rows-scrolled.390, top-rows-tab-focus.1280, default.390-dark, harness several/others/others-item, top-rows-item.390. Add states for the one-other-group sentence and for the top audit link at 390 and 1280.
     - Archive only the spec and harness under `approval-summaries/lane-b-ux-screening-result-tables-wip/capture/`. PNGs and tiles never go on a branch (the repository is public); share them as a private gallery (`tools/lane-b-screen-gallery`).
     - Tile with `/usr/bin/python3 -I /home/user/ops/tools/lane-b-screen-tour/tile.py <TOUR_DIR> <id-prefix ...>`. Pillow is in /usr/bin/python3, not in /opt/py312-ci.
     - A `ux-brand-reviewer` agent gives a verdict, with shot ids, for UXR-01 to -06 and P4-RC-01, -03 and -04.

   Every heavy command runs under `flock /tmp/laneb-heavy.lock` with `export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH`. Archive the script as `workflow-scripts/lane-b-ux-screening-result-tables-finish-<runId>.js`.
5. **Push once:** a fast-forward from f4a97668, through the pre-push hook. Never use `--no-verify`; never force. If the push is refused, rewrite only the commits not yet pushed.
   ```
   GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks git -C /home/user/ux-screening-result-tables push origin co-001/ux-screening-result-tables
   ```
6. **Description.** Rewrite it from `.github/pull_request_template.md`, with every section present, using MCP `update_pull_request`. Read it back byte for byte. Keep it under 65,536 and end it with your session's PR attribution lines. It must cover:
   - the fix round and its commit ids;
   - the base merges of #81 and #78;
   - the suite counts;
   - the shots sample, listed in the reviewer table;
   - UXR-07 (UX-040 stays open until 4b; 4b lands before the first release tag) and UXR-08 (deferred to 4b);
   - the #42 cross-check;
   - the 4b plan.
7. **Verification.** Adapt `workflow-scripts/lane-b-ux-table-scroll-verify-wf_c49ed9e6-4c8.js` with PR #83, the new head, your SP and the findings JSON. One agent works from a fresh clone and reads CI on the head.

Stages done: the design and its review, the build, the draft PR, both reviews, and the fix-round code.
Stages left: the base merge, the checks, the suite, the shots and recheck, the push, the description, the verification, then the merge (below).

### Merge order and dependencies
- **Order** (handoff §6): #82 → #86 → #75 → #84 → **#83** → #85.
  - Merge only after #84 has merged. Check it with `pull_request_read`.
  - #83 and #84 do not conflict. If #84 stalls, ask the orchestrator rather than reorder on your own.
- **At merge time:**
  1. Merge the then-current base with a merge commit.
     - In test-matrix.md, `packages/synth/src/cases/{matrix,registry}.ts`, ADRs and docs, keep both sides.
     - Regenerate `pnpm-lock.yaml` (`pnpm install`), `watched-paths.txt` (`watched.ts --write`) and the fixtures (`synth --all`) with their generators; never merge them by hand.
     - Run the checks the merge touches.
  2. Push. CI must be green on that head for all green, mutation, screening-capacity gate and approval-of-record (ruleset 25837331).
  3. Mark ready, then wait for approval-of-record's re-run.
  4. `merge_pull_request` with method `merge` and `expectedHeadSha`.
  5. Unsubscribe, read the push runs, remove the worktree, update the status file, and archive.
- **Conflicts:**
  - With the base 83d71fd6: test-matrix.md and registry.ts. #83 resolves them.
  - With #85: test-matrix, synth matrix and registry. #85 merges second and resolves.
  - With #42 (be63bdc2), #82 (96758e44), #84 (e3299ea2) and #75's wip-5 7f77cb19: none.
  - Trials against #75's PR head 871faff9 (`uploader.tsx`) and #86 83167b8f (test-matrix, registry) conflict only through base commits that one side lacks. #83's own diff touches neither `uploader.tsx` nor anything of #86's. Once those PRs are in the base, #83 keeps their rows at its base merge.

### Waiting on someone
- **#83:** nothing. It merges on green required checks once the fresh-clone verification has passed (LANES.md rule 7). Runbook 3i is not in force, and PureTideWater authors every PR. Not blocking.
- **4b:** waits for #42 to merge. #42 first needs its acting-Lane-A round (S0), then the founder's committed domain-model approval line, which is the founder's decision. This blocks 4b only, not #83.
- **4b release-tag check:** `git ls-remote --tags origin` returned 0 tags at 2026-11-01 16:01 UTC. Tags are the founder's alone. If a tag exists when 4b is ready, the labels part goes to Lane A as a new version with a migration, which then needs the founder's domain-model approval. That blocks only the labels part.
- **For information** (status-file proposals, for the launch checklist): 4b and UX PR 63 should land before the first release tag. Not blocking.

### Follow-on
UX PR 4b, `co-001/ux-screening-result-words`, in this same session, through the whole pipeline as its own PR. The branch does not exist yet.
- **If #42 has not merged when #83 merges:** record "4b waiting on #42" in the status file and stop at a clean point.
- **Branch:** cut it from `claude/build-platform` the day #42 merges. No migration (Q1 yes).
- **Spec:** design §11, plus §12.1's three Lane A conditions:
  1. Update the `labels.test.ts` VERSIONS comment for 2026-11-05: name 4b's three changed strings and state the rule in its exact words, "a version may be re-pinned under its name only while no release tag contains it (the founder creates tags; the first tag releases it)". Leave the hash map's other entry alone.
  2. Run `git ls-remote --tags origin` again before 4b merges.
  3. Record the decision and its reasons in the 4b PR description and its status file.
- **Also take** the status file's "For UX PR 4b" proposals:
  - UXR-08: "the last entry";
  - "Medicare figure, …";
  - GroupStatus says "its" for one row;
  - rescope `screening.spec.ts:517`.
- **Status file:** create `approval-summaries/lane-b-ux-screening-result-words-status.md`.
- **Reviews:** two, per LANES.md rule 1. One is UX and brand on design §7.1's states. The other uses §7.2's lens narrowed to words and tones, plus the labels re-pin and Lane A's conditions. §11.1's "one" review yields to rule 1.
- **Claim row:** the orchestrator adds 4b to it.

### Resume
Resume from your status file: it is your handoff. Do not message the old sessions.
