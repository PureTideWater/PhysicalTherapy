## Your item
#75 is the contract PHI check that runs before the model (combined audit #120, ADR 0070 Part 3, MOD-12). The gateway screens the exact request text (`prepared.user`) against the practice's member IDs, patient control numbers and payer claim numbers. It refuses with a code, fail-closed, in four cases: above 50,000 identifiers (`SCREEN_MAX_IDENTIFIERS`), on any load error, on a check that `patient-records.ts`'s own factories did not issue (a module-private WeakSet), and on a framed request over 1,000,000 bytes (`MAX_REQUEST_BYTES`, P11). An upload panel that offers more than one kind and names none no longer preselects one. That covers the contracts and reconciliation panels: they start on "Choose a kind". The uploads page keeps `initialKind="x12_835"`. Files dropped before a kind, or before an ERA export's system, wait under "Waiting to upload" until the person chooses it and presses Upload. Until now, a payer letter or EOB dropped on the contracts panel was filed as a contract and could send a patient's details to the model. This is the second of Lane B's two PRs for LANES queue item 12; the first was #53 (88a0e4e9). The work is built, reviewed, verified once (FAIL) and fixed twice since. It stopped partway through the merge of base 83d71fd6.

### Branch and head
- Branch `co-001/contract-phi-check` is at **871faff987298fdbf493a092e3d13c2325e64309** (ls-remote, 2026-11-01). That is the PR head. It has no CI because it conflicts.
- Continue from **`co-001/wip-contract-phi-check-5` = 7f77cb19af6c53f260bd3f100874b8357cd8bc48**. That is fix 3 on top of a8bf75ca (docs) and 26388626 (the #74 base merge).
  - 871faff9 and wip-4 a8bf75ca are both ancestors of 7f77cb19, so a fast-forward works.
- Older WIP refs, for the record only: `-4` a8bf75ca and `-2` 4b886fcc are ancestors. `-3` b0c44cec, `-1` 4ee7c665 and `co-001/wip-contract-phi-check` 2e4ce479 are not; they are mid-run snapshots whose work was committed later.
- Base `claude/build-platform` is at 83d71fd62c6d419be61fd7aaa5b9033ef5c18b56 (#81 at 56ed6279, then #78). The merge base with wip-5 is 165c5993.

### PR
- #75 is open and a draft. mergeable_state is `dirty`, with 0 check runs on 871faff9 and none on 7f77cb19.
- The PR's base SHA is a6e754fc.
- The body is 20,965 characters; the PR was last updated 2026-10-28T03:54:09Z.
  - It is stale: it says P11 and P12 are deferred, still uses "Choose the kind of document", and reports CI on 9b7eadf.
  - Its footer names the old session_017SNqG4nQbbt6xqEG1ZDKe6.
- 2 comments, both on unit flakes that test-flakes (#76, 085299b) has since fixed; #76 is in the base. 0 reviews.

### Design
- `designs/lane-b-model-eval-gate.md` on `claude/build-ops` (1,689 lines, commit b9bc818f, 2026-10-26).
  - The parts that apply: §5 (PR C), Appendix A.3, session rulings 1, 3, 4 and 8, and the dispositions M7, M8, M9, M12, m3, m9, m14 and m15.
  - Its review is `designs/lane-b-model-eval-gate/review.md`.
- State: done and built. Departures from the design are recorded in ADR 0070 Part 3 on the branch.
- Supporting records on build-ops:
  - `approval-summaries/lane-b-model-eval-gate-phi-build.md`
  - `…-phi-review-findings-all.md`
  - `…-phi-verify-1-summary.md` (verdict FAIL at f5292c6c: P11, a stale description, the order and twin wording, still a draft)
  - progress files in `approval-summaries/lane-b-model-eval-gate-wip/fix/`: merge2-3, check2-4, fix2-3, shots2-5

### Status file
`approval-summaries/lane-b-model-eval-gate-status.md` exists (its #120 sections). Correct it first. These are the facts live state contradicts:
1. **Sessions.** The header says the session was "started by the orchestrator (session_01CntuGR3wkXMF6kK3at6bGh)".
   - That is Lane B's old orchestrator (the Plan B build chat, completed).
   - The original item session was session_01FmreSD8rXTREwwBkY2B4wh: Lane B's account, idle, BLOCKED since 2026-10-26 10:26.
   - The continuation was session_017SNqG4nQbbt6xqEG1ZDKe6, on Lane A's account. It stopped about 2026-10-28 08:00 and is not visible from this account.
   - Add this session, started by Lane B's orchestrator session_01FcouKNNHsdecRMzfTs7XwW.
2. **Reserved numbers.** It says "MOD-7 to MOD-12"; the correct form is MOD-07 to MOD-12. The LANES row already reads MOD-07 to MOD-12.
3. **Base merge 4.** It says the merge is running (wf_d798a96c-014). That run was lost:
   - nothing past 7f77cb19 is on origin;
   - no merge4, check5 or shots6 progress file exists;
   - its scratchpad is gone.

   The run ID cannot be resumed from a new session.
4. **Expected conflicts.** It lists uploader.tsx, uploader.test.tsx, the uploads page, the test-matrix and the synth matrix and registry. A live merge-tree of 7f77cb19 with 83d71fd6 shows only three conflicts:
   - `apps/web/src/app/p/[practiceId]/uploads/page.tsx`
   - `apps/web/src/components/uploads/uploader.tsx`
   - `uploader.test.tsx` (add/add)

   `test-matrix.md`, `matrix.ts` and `registry.ts` auto-merge, and `watched-paths.txt` auto-merges but is regenerated.
5. **Merge hold.** The request to hold merges lapsed at 11:00 UTC on 2026-10-28 with #75 unmerged (LANES).
6. **Check-in.** "Check-in 10:25 UTC (trig_01FQaHehjSSfphdhoEoqqMJU)" was on Lane A's account. `list_triggers` here returns nothing, so no check-in is scheduled.
7. **Waiting on someone.** "storage.googleapis.com" has been allowed since 2026-10-27; the file's own 14:13 entry already says "playwright ok".
8. **Next step.** It says "See 'Resume at 14:05 UTC' at the top", but no such block exists. The "integrator on 862c9dc8" text was done long ago.
9. **Handoff section.** "Branch at d7447adb" and its "What remains 1–6" are stale. All of these are done: integration, the suite, the PR, the reviews, fix round 1, verification 1, fix 2 (P11 and P12: 4a099795, 4b886fcc), three base merges since the PR opened, and fix 3.
10. **Flaky tests.** "Proposals outside this PR" lists three flaky tests; all three are fixed by #76 (085299b), which is in the base. The fourth bullet (a CLI option to run the twins twice) stays a proposal.
11. **Missing log entries.** The stage log stops at 2026-10-27 ~15:50 with "fix round running". Add entries from git and the wip/fix files:
    - fix round: e552399f to 53076d28
    - base merge f5292c6c (ecebdc90, #76 and #77)
    - verification 1: FAIL
    - fix 2 (4a099795, 4b886fcc)
    - base merge 871faff9 (a6e754fc, #80 and #79): six conflicts, `redact.ts` and ADR 0054 against #80 among them
    - base merge 26388626 and docs commit a8bf75ca (165c5993, #74)
    - fix 3 at 7f77cb19
12. **#32.** "Then … ready; merge … then #32": #32 now runs as its own session. The orchestrator updates LANES.md.
13. **Old paths.** The worktree `/home/user/contract-phi-check` and the old scratchpad (`/tmp/claude-0/…/6db0c9fb-…/scratchpad/phi`) are gone. The screens-fix3 PNGs went with them.
14. **Gallery.** The gallery (V2B2bKoNPjYivH9h7WV5wK) was made from Lane A's account; it is not found from this one. Publish new shots as a new private gallery.

### Reserved numbers
- From LANES.md's claim row: ADR 0070 (Parts 1-3); test-matrix MOD-07 to MOD-12; `packages/synth` cases MOD-07 to MOD-12 if it needs fixtures.
- This PR uses ADR 0070 Part 3 and MOD-12 (row, synth matrix and registry case). Both are already on the branch. #53 used MOD-07 to MOD-11; MOD-13 and MOD-14 are #80's.
- No synth module number and no migration timestamps (this PR has no migration). Nothing else is needed.

### Setup arguments
`co-001/contract-phi-check:/home/user/contract-phi-check`

Run it in the background until it prints OK:
```
git -C /home/user/PhysicalTherapy fetch -q origin claude/build-ops && git -C /home/user/PhysicalTherapy show FETCH_HEAD:tools/setup-container.sh > /tmp/setup-container.sh && bash /tmp/setup-container.sh co-001/contract-phi-check:/home/user/contract-phi-check
```
- If it fails with "node: /opt/node24/bin/node reports 'v24.22.1', not v24.22.0", run `mv /opt/node24 /opt/node24.base-image` and run the script again until it prints OK.
- The `/home/user/screens` worktree is made later by `tools/lane-b-screen-tour/setup.sh` (from `/home/user/ops`).

### Exact next step
**Done:**
- design, build, integrate, draft PR;
- reviews wf_85f2ff34-1ed and wf_fe838a07-52a (the second re-ran security and UX as default agents);
- fix round wf_aa0fc3e3-0ae;
- verification 1 wf_425beb65-3b9 (FAIL);
- fix 2 wf_8a6ef988-e60;
- base merges f5292c6c (by hand), 871faff9 (wf_435f3768-f95) and 26388626 (wf_31aff985-e31);
- fix 3 wf_7cf8f8c4-5e8 and its shots5.

**Remaining:** base merge 4 with the full suite and shots, push, CI, description, verification 2, merge.

1. **Set up and record.**
   - Run setup (above). Check that `gh api user` returns PureTideWater and that `git -C /home/user/PhysicalTherapy config core.hooksPath` is set. If not, run `pnpm hooks:install` and `pnpm gitleaks:install` before any push.
   - `git -C /home/user/ops pull --no-rebase origin claude/build-ops`.
   - Correct the status file (the items above).
   - Commit in `/home/user/ops`, then push with `GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks git -C /home/user/PhysicalTherapy push origin claude/build-ops`. Pull first; never force.
   - Do not edit LANES.md or lanes/lane-b.md: the orchestrator does.
2. **Continue from wip-5 and subscribe.**
   - `git -C /home/user/contract-phi-check fetch -q origin co-001/wip-contract-phi-check-5 claude/build-platform`
   - `git -C /home/user/contract-phi-check merge --ff-only origin/co-001/wip-contract-phi-check-5` (HEAD becomes 7f77cb19).
   - `subscribe_pr_activity` PureTideWater/PhysicalTherapy 75.
3. **Adapt `workflow-scripts/lane-b-model-eval-gate-phi-merge-4-wf_d798a96c-014.js`.** Its phases are merge (staged), check (commit, never push) and shots.
   - `SP`: your own scratchpad. `HEAD='7f77cb19'`, `BASE='83d71fd6'`, `WT='/home/user/contract-phi-check'`.
   - Every PATH becomes `export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH` (drop `/opt/node22/bin`). This applies in RULES and in the shots agent.
   - Commit trailers are the attribution lines your own system prompt gives (Co-Authored-By and Claude-Session with your session URL), never the old session's.
   - The commit subject names #81 as well as #78.
   - The "Earlier reports" lines point to the build-ops copies in `/home/user/ops/approval-summaries/lane-b-model-eval-gate-wip/fix/`.
   - The merge phase's "Expected conflicts" becomes the three files above.
   - The both-sides check names #78 (ADR 0079) and #81 (ADR 0083), not #74. The range 165c5993..83d71fd6 is right.
     - Files both sides changed: the three conflicts, plus `test-matrix.md`, `matrix.ts` and `registry.ts`. Keep every line of both.
     - Regenerate `watched-paths.txt` with `watched.ts --write`, never by hand.
     - Check #78's leave guard (`stillSending` counts only `batch`, while #75's waiting files are in `held`) and its `reportFrom` and `receiptsNotice` props against #75's held files. Record the result.
   - The adversarial re-read already covers #78's download-refusal behaviour. Add #81's matrix and registry entries.
   - The check phase runs the full suite once, each step under `flock /tmp/laneb-heavy.lock`:
     - typecheck; lint, lint:logs, lint:copy; unit; golden; `pnpm test:oracle` (the old script omits it)
     - `pnpm --filter @tp/model-gateway eval`
     - `synth --all`, which must write nothing
     - test:db in 4 shards, each on its own fresh PG18 database on port 5433
     - build, stamp BUILD_COMMIT, then `E2E_PREBUILT=1` e2e
     - `stryker/affected.ts`, engine freeze, check:fixtures, verify-content
     - gitleaks, then the pre-push hook run on its own
   - Shots: screens-fix3 is lost. First take a reference run on 7f77cb19, then the merged head.
     - Use shots5's TOUR_ONLY (in `wip/fix/shots5.md`) without `p.contracts.no-kind.390-dark`, which the tour cannot take.
     - Take them at 1280 and 390 px light and 1280 px dark, following `tools/lane-b-screen-tour/README.md`.
   - Schedule a `send_later` about 5 h 10 min ahead first. The co-founder reported weekly usage under 20% (2026-11-01 14:40 UTC); the orchestrator paces usage.
   - Copy merge4.md, check5.md and shots6.md to `approval-summaries/lane-b-model-eval-gate-wip/fix/`.
   - Archive the script as `workflow-scripts/lane-b-model-eval-gate-phi-merge-4-<newRunId>.js`, and push build-ops.
4. **Push once.**
   - `GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks git -C /home/user/contract-phi-check push origin co-001/contract-phi-check`. It is a fast-forward from 871faff9 and goes through the pre-push hook. Never `--no-verify`, never force. A refused push is fixed by rewriting only the unpushed commits.
   - Then read CI on the head.
   - A flaky failure gets one re-run of the failed job (MCP `actions_run_trigger` `rerun_failed_jobs`), with a PR comment ending in the Claude Code footer. Never merge on red.
5. **Refresh the description** from `.github/pull_request_template.md`, every section present.
   - P11: the cap in bytes (1,000,000), now built and no longer deferred.
   - P12: the records check takes packages/db's scope and pool only, now built.
   - The order wording: the screen is "last before the budget's hold and the call".
   - The twin line: a third of the member IDs are "ZZ" plus 7 digits.
   - The four base merges since the PR opened, with their resolutions: f5292c6c, 871faff9, 26388626, and the new one.
   - Fix 3's wording: "Choose a kind" (replacing "Choose the kind of document" in the wording table) and "ERA export". Shots finding D-2 (later M3-4 and M4-2) is now resolved.
   - The local counts, and CI on the pushed head. The CI paragraph is stale: #76 has merged.
   - The engine freeze and `affected.ts` run against the current base.
   - The shot findings, with the new private gallery's link.
   - The footer gives your session URL.
   - Stay under 65,536 characters. Send with MCP `update_pull_request` and read it back byte for byte.
6. **Verification 2.** Adapt `workflow-scripts/lane-b-model-eval-gate-phi-verify-wf_425beb65-3b9.js`:
   - change its `HEAD` and `SP`, its base (ecebdc90 becomes the merged base) and its PATH (as above);
   - the agent returns its summary, because subagents cannot write summary.md. Save it as `approval-summaries/lane-b-model-eval-gate-phi-verify-2-summary.md`.
   - It works in a fresh clone, reads CI on the head, mutation included, and confirms verification 1's findings are closed.
   - A real fix means one more push and a body update.
7. **Merge, after #86 merges.** If #75 is ready first, tell the orchestrator and wait.
   - Merge the latest base with a merge commit. A trial merge of 7f77cb19 with #82 (96758e44) or #86 (83167b8f) adds no conflict beyond the base's own. Check `reconciliation-001.md` (#82, #86) and `test-matrix.md`, `matrix.ts` and `registry.ts` (#82) by hand, keeping both.
   - Regenerate (`pnpm install --frozen-lockfile`, `watched.ts --write`, `synth --all`) and run the narrow checks.
   - Push, then wait for green on `all green`, `mutation`, `screening-capacity gate` and `approval-of-record` (ruleset 25837331).
   - Update the body's base-merge line. Mark ready and wait for approval-of-record's re-run.
   - `merge_pull_request` with method merge and `expectedHeadSha`.
   - Unsubscribe, read the push runs, remove the worktree, and update the status file.
   - Tell the orchestrator with `send_message` to session_01FcouKNNHsdecRMzfTs7XwW.

### Merge order and dependencies
- **Merges first:** #82 (`co-001/ci-pin-age`, 96758e44, draft, behind), then #86 (`co-001/ci-images-digest`, 83167b8f, draft, clean). #75 merges after #86 (handoff §6).
  - Neither conflicts with #75. #86 already contains 83d71fd6, so its overlap with #75 is the same three files as the base merge.
  - Both-sides files to check by hand: reconciliation-001 (#82, #86); test-matrix, matrix and registry (#82).
- **Conflicts with the base 83d71fd6** (all from #78): this session resolves `uploads/page.tsx`, `uploader.tsx` and `uploader.test.tsx`, keeping both sides (LANES rule 6). Check `test-matrix.md`, `matrix.ts` and `registry.ts` (#78 and #81) by hand.
- **`redact.ts` against #80:** already resolved in 871faff9 (#75's `identifierPattern` widening was dropped with the function, along with ADR 0054, test-matrix, matrix and registry). The handoff's "resolve redact.ts against #80" is done; do not redo it.
- **Merge after #75 and resolve against it:**
  - #84 (e3299ea2): ADR 0054.
  - #85 (29dded52): `contracts/page.tsx` and `uploader.tsx`.
- **No conflict:** #83 (f4a97668, and WIP f5e0ceba) and #42 (be63bdc2).
- **redact-ssn-phone** builds after #75 merges, because #75 changes `packages/model-gateway/src/redact.ts`.

### Waiting on someone
- **F1, founder:** the per-field recall and precision floors. `eval/floors.json` ships unset, and production refuses a real provider until they are set. Does not block the merge.
- **F2, founder (legal):** whether the data-rights addendum covers keeping an accepted proposal as an evaluation example. Nothing is built for it until ruled. Does not block.
- **F3 and F4, Lane A migrations** (proposed in LANES.md "Handed to Lane A"):
  - F3: lookup hashes with a SECURITY DEFINER screen function. It removes the 50,000-identifier bound.
  - F4: a reviewed correction of a document's kind.

  Neither blocks.
- **Wording table, co-founder:** written under `brand.md` and CO-11, and he may reverse any line. Does not block.
- **Approval of record:** before runbook 3i (`APPROVAL_REVIEW_REQUIRED` unset), the merge goes on green checks plus a passed fresh-clone verification (LANES rule 7). If 3i lands first, wait for the founder's APPROVED review of the latest commit.

### Follow-on
None. LANES puts #32 (the unmapped plan) "in the same session", but it is now planned as its own session (S12), and the orchestrator updates the row. At the merge, tell the orchestrator so #84, #85 and redact-ssn-phone can proceed.

### Resume
Resume from your status file: it is your handoff. Do not message the old sessions.
