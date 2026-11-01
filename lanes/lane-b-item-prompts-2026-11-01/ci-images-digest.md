## Your item
ci-images-digest is PR #86. CI's `images` job (from #77) put buildx's whole `metadata` output into one environment variable (`METADATA`). Even with `provenance: false` set, buildx still writes `buildx.build.provenance` into that output, and it holds the whole `pull_request` event, description included. On #42 (job 122624309161, run 40630123457) the variable reached 132,387 bytes, over Linux's 131,072 limit, so bash never started. The fix has four parts:
- each identity step takes only `fromJSON(steps.<id>.outputs.metadata || '{}')['containerimage.config.digest']`;
- all seven `docker/build-push-action` steps set `BUILDX_METADATA_PROVENANCE: disabled`;
- `tools/test/workflows.test.ts` adds a closed allowlist of the values that may reach a process, each with its bound (T1–T6);
- documents: ADR 0066 Part 3 notice N29 (to be renumbered, see below), `docs/runbooks/ci.md` and reconciliation-001.

The change touches CI only: no money, no tenancy, no screen, no migration. It must merge so that a long PR description, such as #42's was, can never stop `images` again. `ci-findings-transport` waits for it.

### Branch and head
- Branch `co-001/ci-images-digest` is at **83167b8f659acf526c1c3252ec6e0f3e69a0086c** (ls-remote at 2026-11-01 15:55Z; equals `refs/pull/86/head`).
- The head already contains the base 83d71fd6 (#78), and `claude/build-platform` is still 83d71fd6.
- Commits on top of the base:
  - eeac99e2: c1, red tests (the PR opened on it)
  - 9ec30e1d: c2, the digest lines (R1's head)
  - c9a23640: c3, red, T5
  - 96cf5ccc: c4, provenance disabled
  - abe84f0d: c5, ADR 0066 N29, ci.md, reconciliation-001
  - 620ca983: T3 also reads a job's `defaults` and a step's `working-directory`
  - 83167b8f: merge of 83d71fd6 (R2's head)
- All seven commit messages say "N29". They stay as they are (no force push).
- WIP refs: none. There is no `co-001/wip-ci-images-digest*` on origin.

### PR
#86 is open and a draft. Author PureTideWater, base `claude/build-platform`.
- Mergeable `clean`. No reviews, no comments, no review comments, no labels, no requested reviewers.
- Created 2026-10-28T07:40:14Z. `updated_at` is 08:01:36Z, which is the R2 push. 7 commits, +737 −18, 9 files.
- Checks on 83167b8f: 25 check runs in 5 workflow runs. 23 succeeded and 2 were skipped (`notify`, `stryker`). They include `all green` (08:10:17Z), `mutation`, `screening-capacity gate` (08:19:36Z) and `approval-of-record`.
- The body is 125,892 characters:
  - 25,831 characters outside the ruler (25,699 before it, 132 after it);
  - a collapsed "Length-test appendix" holding a ruler of 100,061 characters (from `| Row | Characters so far` through the newline after row `1000`), SHA-256 `5bb5e558463de9bf85c0b6dc560387edbd87a6b45f444d2f6ffe05191a55675f`, re-checked in the live body.
- The footer names the old session (session_01UzQ6wgZgtThBRBxXTFYhRB).

### Design
- `designs/lane-b-ci/ci-images-digest.md` on build-ops: 1,205 lines, SHA-256 `3088a50f88fb53a2c43e4e26278f0a2b430a7c7a72cdb09566a877b6e2c3a332`. Only 7af84163 has touched it.
- The review `designs/lane-b-ci/ci-images-digest-review.md` (260 lines) is folded in, in the section "Review (2026-10-28)" at line 1159: 16 items, of which 14 were fixed, 1 fixed in part (S4) and 1 moved (N7). The design is done.
- Stale sections:
  - §9.1 describes #42 at 46974a25. It is now be63bdc2.
  - §9.2 describes #82 at b574d4e8. It is now 96758e44.
  - Line 15 and §8/C9 say "N29, after the N23 to N28 that #82 holds". #82's Part 5 now uses N23–N31.
- §6.3 holds the push protocol: read the description before the push, the A7 edit check, waiting for the previous push's `images` job, and the explicit merge message. §6.4 explains how to read sizes from a run's log.
- No re-design is needed: #78 touched none of this branch's files (83167b8f's message).

### Status file
`approval-summaries/lane-b-ci-images-digest-status.md` exists (103 lines) and is stale: its RESUME-BLOCK is dated 2026-10-28 06:41 UTC. Correct these first:
1. **"Design folded; build starting"; "Next: the build's result; then the draft PR and R0."** In fact the item is built, PR #86 is an open draft at 83167b8f with CI green, and the next stage is the two reviews.
2. **The build list "c1…c5".** The real commits are the ones listed under "Branch and head". Two are missing from the file: 620ca983 and 83167b8f.
3. **The scratchpad and scripts.** Everything in `scratchpad/imgdigest/` went with the old container: the progress files, `handoff/42-port.patch`, `appendix.mjs`, `measure.py`, `payload_size.py`, `local-proof.mjs` and `local-proof-bash.sh`. The build's workflow scripts were never archived in `workflow-scripts/`.
4. **"Worktree `/home/user/ci-images-digest` (local; not pushed yet)".** The branch is pushed. The worktree does not exist until setup creates it.
5. **"Runs of record R0, R1, R2".** What actually happened:
   - **R0** was never run. GitHub refused the description on the create call at 07:38 ("body is too long (maximum is 65536 characters)"). The PR opened on eeac99e2 without the ruler, and its ci run 40651583762 was cancelled by R1's push.
   - **R1** passed on 9ec30e1d: ci 40652135443, `images` job 122694617018.
   - **R2** passed on 83167b8f: ci 40653896254 (`images` job 122700187970), screening-capacity 40653896246 (capacity job 122700247351, gate 122706928679), release-dry-run 40653896300, mutation 40653896273, approval-of-record 40653896226.
   - **R2's `images` log** was read on 2026-11-01 (3,037 lines, so it is complete). Both `Metadata` groups are 780 and 783 bytes, and their keys are `buildx.build.ref`, `containerimage.config.digest`, `containerimage.descriptor`, `containerimage.digest` and `image.name`. There is no `buildx.build.provenance`, no ruler row and no "Argument list too long". The `BUILT` values are web `sha256:326bb524…10ae` and worker `sha256:bca9c01c…862e`. The capacity job and both release-dry-run builds show no provenance and no ruler either.
   - **R2's description.** The pre-push read was not recorded; it was lost with the scratchpad. Reconstruction: the last edit was approval-of-record run 40653851814 at 08:01:18 on 9ec30e1d. No other approval-of-record run exists before R2's `synchronize` (40653896226, 08:01:41) or since. So R2's event carried the current body of 125,892 characters (inferred).
   - **The PR body is stale too.** R2 still reads "pending" in both of its tables.
6. **"#42's head (46974a25) still has the METADATA lines".** #42 is at be63bdc2 and carries the hand-over patch byte for byte: `git apply --check -R` is clean at be63bdc2 and at 83167b8f.
   - The patch can be recovered exactly from this status file's `diff` block: 49 lines, 3,456 bytes, SHA-256 `8cf981fbd42a39a00357c293454440774c101699f2cd96a55dc5e0b28eec221f`, re-checked.
   - It applies forward at 83d71fd6 and at 96758e44.
7. **"The one numbered item is ADR 0066's notice N29 (after #82's N23 to N28)".** #82 at 96758e44 now uses N29, N30 and N31 in Part 5 (ADR 0066:1622–1627), so the numbers collide. After #82, the next free notice is **N32**, unless #82 changes before it merges.
8. **"`git apply --check` clean at 165c5993, 56ed6279, 46974a25 and b574d4e8".** The heads that matter now are 83d71fd6, be63bdc2 and 96758e44, with the results in item 6.
9. **"ci-findings-transport … for the orchestrator to claim and place".** It was claimed on 2026-10-28 at 06:55 (LANES.md:197). It has not started: there is no branch on origin and no status file.
10. **The owner**, in both the header paragraph and the RESUME-BLOCK. The item is no longer the old CI session's (session_01UzQ6wgZgtThBRBxXTFYhRB). Lane B's orchestrator (session_01FcouKNNHsdecRMzfTs7XwW) took it back on 2026-11-01 and runs it in this new item session. Record this session's own ID.

### Reserved numbers
- None reserved. LANES.md:196's claim row says "None expected". If a number is needed, put a COUNTER REQUEST at the top of the status file.
- ADR 0066 notice N29 is not a rule-4 counter, but it collides with #82's N29. Renumber it to the next free notice after #82's merged ADR 0066: N32 if #82's Part 5 stays as at 96758e44. Do this at the base merge that brings #82 in.

### Setup arguments
`co-001/ci-images-digest:/home/user/ci-images-digest`

### Exact next step
Done so far: the design and its review, the build, the draft PR, R1 and R2 (green).
Still to do: correct the records and the body, two reviews, the fix round, verification, and the merge.

Rules for every step:
- Every heavy command runs under `flock /tmp/laneb-heavy.lock`, after `export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH`.
- Every agent keeps a progress file (the SAVE rule).
- Schedule a `send_later` about 5 h 10 min ahead before each heavy workflow.
- Usage: the co-founder reported weekly usage under 20% at 2026-11-01 14:40 UTC ("go wide"). The orchestrator paces the lane.
- Archive each script as `workflow-scripts/lane-b-ci-images-digest-<stage>-<runId>.js`.
- In each archived script you adapt, rewrite:
  - `SP` (the old `/tmp/claude-0/-home-user-PhysicalTherapy/5b1bc8b7-…/scratchpad` and `320d184a-…/scratchpad` are gone);
  - any `PNPM` path (`/opt/pnpm-bin`);
  - the `Claude-Session:` line (this session's URL);
  - the branch, worktree and heads.
- Rule 2: no migration and no domain-model regeneration in this PR.

1. **Machine.** Run this in the background until it prints OK:
   ```
   git -C /home/user/PhysicalTherapy fetch -q origin claude/build-ops && git -C /home/user/PhysicalTherapy show FETCH_HEAD:tools/setup-container.sh > /tmp/setup-container.sh && bash /tmp/setup-container.sh co-001/ci-images-digest:/home/user/ci-images-digest
   ```
   - If it fails with "node: /opt/node24/bin/node reports 'v24.22.1', not v24.22.0", run `mv /opt/node24 /opt/node24.base-image` and run the script again.
   - storage.googleapis.com is allowed.
   - Then call `subscribe_pr_activity` for PureTideWater/PhysicalTherapy #86. If it says another session is watching, record that and poll with `pull_request_read` and the check runs instead. Do not message that session.
2. **Records.**
   - Rewrite the status file's header and RESUME-BLOCK with the corrections above.
   - Save the ruler under `approval-summaries/lane-b-ci-images-digest-wip/`. It is the live body from `| Row | Characters so far` through the newline after row `1000`: 100,061 characters, SHA-256 `5bb5e558…`. Prefer a small generator whose output is checked against that hash; otherwise save a copy.
   - Commit, then push:
     ```
     git -C /home/user/ops pull --no-rebase origin claude/build-ops
     GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks git -C /home/user/PhysicalTherapy push origin claude/build-ops
     ```
     Push from the main checkout (rule 10). Never force, never `--no-verify`.
3. **Correct the PR body now, with no push.** An edit starts only approval-of-record. Make these changes:
   - **R2 row:** passed, with the run and job IDs and the log facts from status item 5.
   - **R2 row of "Before each push":** 125,892 characters and `5bb5e558…`. State that the pre-push read was not recorded (lost), and give the reconstruction: last edit 08:01:18 (40653851814), none before 08:01:41 or since.
   - **#42:** the port and the trial now name be63bdc2, which is clean under merge-tree and carries the patch byte for byte. "#42's description is 95,324 characters" becomes "was 95,324 at 46974a25". It is 61,992 now.
   - **The N29/N32 collision with #82**, in C9 and the trial-merge paragraph.
   - **P5 answered** by reading the repository's settings (2026-11-01): `merge_commit_title` MERGE_MESSAGE, `merge_commit_message` PR_TITLE. The default copies no description, and the merge still uses the explicit message.
   - Keep the ruler. End the body with the Claude Code footer and this session's link.
   - Send it with MCP `update_pull_request`, then read it back and check the length and the ruler's SHA-256.
4. **Reviews.** Two default workflow agents run in parallel, each in a fresh clone at 83167b8f and read-only on GitHub.
   - Reviewers:
     - CI and test infrastructure;
     - security and supply chain, with the checklist in `.claude/agents/security-reviewer.md`.
   - Adapt the Review phase of `workflow-scripts/lane-b-ci-pin-age-build-wf_6cbdbf9d-9c3.js` (lines 96–117). Alternatively, use `lane-b-ci-browser-reviews-wf_7b903031-7ca.js` without its capture and UX legs.
   - Add a guard that throws if a review returns empty text. Neither archived script has one.
   - Output files: `approval-summaries/lane-b-ci-images-digest-review-{ci-infra,security-supply}.md`.
   - Point both reviewers at:
     - the N29 collision;
     - T6's line citations, which drift when a workflow changes;
     - P2: the build-record artifact still carries the event;
     - R2's `images` log, re-read per §6.4 to confirm status item 5.
5. **Fix round.** Adapt `lane-b-ci-pin-age-fix-round-wf_dfb43bb4-b4c.js`.
   - Fix every finding as the review recommends; for security, take the safer option.
   - If #82 has merged by then, merge the base in this same round: one push, then one capacity run of up to 100 minutes.
   - **If the shape changes**, do this before any push:
     - If #42 is still open: build the new patch against #42's live head, check it with `git apply --check` there, and send it with its SHA-256 to the orchestrator (session_01FcouKNNHsdecRMzfTs7XwW) with `send_message`.
     - If #42 has merged, skip the patch: this branch's base merge takes the new shape.
     - "Shape" means the two `BUILT` env lines, the two `built="$BUILT"` lines, or T1's pins.
   - Re-run merge-tree against #42's live head, and run this branch's `workflows.test.ts` on that merged tree (`CI_TREE`).
   - Run the full local suite once:
     - unit, golden, oracle;
     - test:db in 4 shards, one after another, each on a fresh PG18 database on port 5433;
     - build, stamp, then e2e with `E2E_PREBUILT=1`;
     - `tools/stryker/affected.ts`, then the gate (no shard was affected on 83167b8f);
     - `pnpm verify-content` and the synth check;
     - `pnpm actions:check --offline`, `BASE=origin/claude/build-platform pnpm actions:check` and `BASE=origin/claude/build-platform pnpm toolchain:check`. The body has no toolchain:check row yet.
   - Update the body's Checks and Reviewer tables and read the body back.
   - Before the push, follow §6.3: read the description and note its length, the ruler's SHA-256 and the time. Make no edit between that read and the push. After the push's run starts, check the approval-of-record runs for edits in that window.
   - Push once, then wait for `images` and `capacity`.
6. **Verification.** Adapt `lane-b-ci-pin-age-verify-wf_4dac1326-48a.js`: one agent in a fresh clone, reading CI on the head. Apply its description corrections and read the body back.
7. **Merge, after #82 merges.**
   - If the base has moved, merge the latest base with a merge commit; adapt `lane-b-ci-deps-base-merge-wf_c7faec69-54e.js`. Resolve the conflicts by keeping both sides (see "Merge order"); the merge commit only resolves.
   - In a separate commit in the same push, renumber N29 to the next free notice (N32) in:
     - ADR 0066: the Date line, the Part 3 notice and its Deciders sentence;
     - the comments of `ci.yml`, `release.yml`, `release-dry-run.yml`, `release-capacity.yml` and `screening-capacity.yml`;
     - `ci.md`, reconciliation-001 and `workflows.test.ts` (including the `describe` title);
     - the body.
   - Note in the ADR and the body that the commit messages say N29.
   - Regenerate with `pnpm install --frozen-lockfile`, `tools/screening-capacity/watched.ts --write` and `pnpm synth --all`. Never hand-merge these files.
   - Run `vitest --project unit tools/test`, actions:check and toolchain:check.
   - Read the description before the push (§6.3), then push with the ruler in place.
   - Require green on that head for `all green`, `mutation`, `screening-capacity gate` and `approval-of-record`, and record its runs of record, including the `images` log read.
   - **Then cut the body below 65,536 characters in one edit** (decision below) and read it back.
   - Mark the PR ready with MCP `update_pull_request` (`draft: false`). Wait for approval-of-record's re-run to pass, then call `merge_pull_request` with:
     - method `merge`;
     - `expectedHeadSha` set to the merging head;
     - `commit_title` "Merge pull request #86: <title>" and `commit_message` the title again (§6.3).
   - Afterwards: unsubscribe, read the push runs on `claude/build-platform`, clean the worktrees, update the status file, and send the orchestrator the merge commit.

**Body-size decision (the recommended option, recorded in the status file and in the body's Checks).**
- Keep the ruler through every remaining push, so that the head that merges gets its own run of record.
- Cut the appendix in one edit, only after that head's runs are green and recorded. Without it the body is about 26k characters, under the 65,536 cap documented at `.github/pull_request_template.md:64`, `.claude/skills/new-migration/SKILL.md:17` and `docs/runbooks/github-governance.md:463`. GitHub applies that cap when a PR is created; an edit accepted 125,892 characters. Note this in the body.
- Keep in the body: the ruler's length and SHA-256, how to regenerate it, and every run of record's run and job IDs.
- In the same edit, rewrite the statements that promise the ruler stays: the `<details>` summary ("kept until the merge"), the Checks paragraph ("stays over 100,000 characters until the merge … nobody removes or shortens the ruler before the merge") and the integrator's choices.

Why this option:
- ci.yml, screening-capacity.yml and mutation.yml start only on `opened`, `synchronize` and `reopened`, the defaults. release-dry-run starts only on those too, filtered by paths. So the edit starts only approval-of-record and costs no run of record.
- Cutting now would leave the fix-round head and the merged head without a run of record, and no edit can create one afterwards.
- Keeping the ruler through the merge would leave the PR's lasting record over the documented cap.
- The merge message is not a reason: it is explicit, and the repository's default is PR_TITLE.
- If any push is needed after the cut, put the ruler back first.

### Merge order and dependencies
- **#82 first** (`co-001/ci-pin-age`, 96758e44, draft, `behind`, session S2).
- **Conflicts with #82.** #86 merges second and resolves them by keeping both sides (rule 6). The trial merge-tree was re-run on 2026-11-01:
  - ADR 0066:28–35: #86's Date line ("N29 2026-10-28") against #82's Part 5 summary and Date line ("Part 5 2026-10-28", :31);
  - reconciliation-001:659: the end of the 2026-10-26 ruling, where both sides append;
  - `tools/test/workflows.test.ts:13`, the imports: #82 adds `readDockerfile`, #86 adds `MAX_FILE_BYTES`.
  - Then the N32 renumbering. T1–T6 must pass on #82's workflows, and #82's `{ BASE, GITHUB_TOKEN }` hunk must sit beside this branch's lines.
- **#42** (be63bdc2): the trial merge is clean, and the patch is in be63bdc2. There is no order constraint; whichever merges second merges the base.
  - If #86 merges first, #42 takes #86's version at its base merge (LANES.md:196).
  - If #86's shape changed and #42 merges first, #86 resolves to its own version.
- **Other branches.** Against #75, #83, #84, #85, SS-01, 1b and interest, #86 adds no conflict of its own; the trial conflicts are each branch's own conflicts with the base. 1b and interest also change `docs/runbooks/ci.md`; they merge later and resolve it.
- **Waiting on #86:** ci-findings-transport (S11).

### Waiting on someone
- **Founder: nothing blocks the merge.**
  - Runbook 3i and `APPROVAL_REVIEW_REQUIRED` remain the founder's. Until 3i, merge on green checks once the fresh-clone verification passes (LANES.md rule 7). PureTideWater authors the PR and cannot review it.
  - For information, not blocking: P1 (`publish-content.yml:55`, frozen under F4).
  - P5 is answered by the live setting (PR_TITLE); changing that setting stays the founder's.
- **Co-founder:** none.
- **Lane:** #82 must merge first. That blocks the merge only.

### Follow-on
None in this session. ci-findings-transport (LANES.md:197, `co-001/ci-findings-transport`) is the orchestrator's S11, run as its own session after #86 merges. Leave it these in the status file's last block:
- design §12 P3;
- the T6 row `over: 'ci-findings-transport'` (`workflows.test.ts:3239`);
- the "over 98,292 bytes" bound.

### Resume
Resume from your status file: it is your handoff. Do not message the old sessions.
