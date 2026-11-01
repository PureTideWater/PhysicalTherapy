## Your item
UX PR 6, `co-001/ux-sign-in-time`, is the UX baseline review's sixth pull request. It closes the "now" part of UX-012 (C-007) and the step marker of UX-128 (C-042). Each sign-in step after the password will state the limit that binds today. That limit is 3 minutes, and key registration's is 15 minutes, both read from one constant, `apps/web/src/lib/auth/step-limits.ts`. The server closes the step at that limit. One polite warning comes one minute before it closes, or two minutes on a step of ten minutes or more. "Start again" returns to `/sign-in` with the email kept in a sealed HttpOnly cookie. The invited paths are numbered: "Step 1 of 2" for an invited customer and "Step 1 of 3" for an invited staff member. Today a step closes without warning and starts over from an empty form (WCAG 2.2.1). The PR has no migration and no infra or Cognito change. The 15-minute Cognito session belongs to UX PR 66.

### Branch and head
- Branch `co-001/ux-sign-in-time` is at `165c59932a261db62529b9ce4eb99f295df173ab`, #74's merge commit. The branch has no commits of its own (ls-remote, 2026-11-01 ~14:50 UTC).
- The base `claude/build-platform` is at `83d71fd62c6d419be61fd7aaa5b9033ef5c18b56`, 23 commits ahead. Those commits include #81 (56ed6279) and #78 (83d71fd6). 165c5993 is an ancestor of the base, so the branch fast-forwards.
- No WIP refs exist on origin for this item. Nothing has been built.

### PR
None yet. Open a draft PR into `claude/build-platform` at the build stage. A `head=PureTideWater:co-001/ux-sign-in-time&state=all` query returns 0.

### Design
All paths are on `claude/build-ops` at 15725ba2. The design files were last committed in f926e1a3 (2026-10-28 05:13Z).
- `designs/lane-b-ux-sign-in-time.md` (946 lines) is a **partial draft**. It has the header, §1, §2.1–2.11, §3 (slices A–D, 3.5, 3.6) and §4, including §4.5's SGN-01..04 rows and registry entries written word for word.
  - §§5–8 are missing:
    - §5 docs: ADR 0081, and how it relates to 0016 and 0077.
    - §6: every string, and the shots.
    - §7: no migration, and the proposals outside the PR.
    - §8: risks.
  - No review exists (`designs/lane-b-ux-sign-in-time/review.md` is absent), and no revision has run.
- The scouts are done: `designs/lane-b-ux-sign-in-time/scout-{flow,timer,security}.md`.
- Author progress is in `approval-summaries/lane-b-ux-sign-in-time-wip/sgn-author.md`. It records s1–s4 as written, its next entry is "s5 docs", and it holds every decision taken so far. Copies of the scouts' progress files, `sgn-scout-{flow,timer,security}.md`, are in the same folder.
- **Facts that live state contradicts.** The author fixes these in its re-read, before §5:
  1. **#42 has moved.** The header gives #42's head as `6f23c42b`; it is now `be63bdc2`. "Read at 165c599" must be re-verified at 83d71fd6.
     - On the design's own paths, the base delta touches only:
       - `apps/web/scripts/synthetic-personas.ts` (+6/−1: two personas from #78);
       - the three shared documents;
       - synth `types.ts` and `common.ts`.
     - **It also moves files the design cites in `lib/http/`:**
       - `next.ts` is +3/−22. `signInFor` moved to the new `lib/http/sign-in-for.ts:9-17`, so `next.ts:55-58` is stale.
       - In `next.ts`, `COOKIE_OPTIONS` moved from :23 to :25, the Cache-Control comment from :18-20 to :20-22, `loadPublicPage` from :139 to :120, and `runSignInStep` from :249 to :230.
       - `handler.ts` is +99/−8, and `setCookieHeader` moved from :44-46 to :47-49.
       - `guardMessage` now uses the new `minutesWords` (`lib/http/download-refusal-words.ts:69`). Consider it for §6's "N minutes" words.
     - Next to the design's paths, the delta changes `components/field.tsx` (+35/−21, `FieldWords` hints) and `fields.test.tsx` (+14), and adds `components/refusal-notice.tsx` (84 lines, an `Alert`). Re-read §2.8 against them.
     - On be63bdc2 (after #42 merges), `e2e/helpers.ts` `refusal()` moves from :63-65 to :66-68. In `identity.ts`, the "three days" comment moves from :41-42 to :45-46, and `tempPasswordValidity` from :82 to :89.
  2. **§3.6's open-PR table is stale.**
     - #78 and #81 are merged, and #33 is closed.
     - Open now: #42, #75, #82, #83, #84, #85, #86, #87, #88 and #89.
     - **#85 (29dded52) changes `components/test-support/forms-harness.tsx` (+121/−2), which slice B also edits.**
     - "Build from 165c599" now means 83d71fd6.
  3. **#78 has merged.** The SGN section goes after "Download refusals (DLR)" (`test-matrix.md:353`; the design calls it "Downloads (DLR)"). SGN's entries go after DLR's in `matrix.ts` and `registry.ts`, and `'SGN'` goes after `'DLR'` in `CASE_MODULES` (`types.ts:9`).
  4. **Slice D omits `packages/synth/src/cases/common.ts`.** `MODULE_NUMBER: Record<CaseModule | 'VAR', number>` (line 18) must gain `SGN: 19`, or typecheck fails.
  5. **The scratchpad is lost**, along with everything the design cites from it:
     - `scratchpad/sgn-pr42-rest-clean.txt` (:19), `sgn-pr42-union.txt` (:22), `sgn-files.txt` (:569), `sgn-pr{n}-files.txt` (:661);
     - `scratchpad/sgn-repro/` (§1 :48-52, the observations and the PNGs).
     - Regenerate the file lists from the REST files API. Cite §1's reproduction as `scout-flow.md` 1.2. PNGs never go on a branch.
- **Still true.** On be63bdc2, `infra/lib/constructs/identity.ts:11` (`accessToken: Duration.minutes(15)`) and `:14` (`authSession: Duration.minutes(3)`) are unchanged, so SGN-01's text pin holds. #42's `e2e/helpers.ts` and `e2e/hardware-key.spec.ts` are read, never edited.

### Status file
`approval-summaries/lane-b-ux-sign-in-time-status.md` exists. Live state contradicts it in the places below. Correct them first and commit to build-ops:
1. **Who runs it.** "Run by session_01TAgFZo3SGSTBEfKRjX1jeG … started by Lane A's orchestrator" is wrong. Write this session's own id (from `get_session`), under Lane B's orchestrator session_01FcouKNNHsdecRMzfTs7XwW, 2026-11-01.
2. **PR 7.** "then PR 7 (`co-001/ux-sign-in-recovery`) in the same session" is wrong. UX PR 7 and UX PR 8 get their own sessions later.
3. **The hold.** "Now: paused after the design, for UX PR 10" and "Resume after PR 10 merges" no longer apply.
   - #85 (UX PR 10) is still an open draft at 29dded52, `mergeable_state` dirty.
   - The co-founder's go-wide answer (2026-11-01 ~14:40 UTC, weekly usage under 20%, relayed by Lane B's orchestrator) lifts the hold. This item runs now, in parallel.
4. **Resuming.** "Resume … with `resumeFromRunId: wf_3c17f552-0ea`" cannot be done from a new session. Rerun the author from §5, then the review and the revision, from the committed scouts and draft.
5. **The branch.** "Branch … Not pushed yet" is wrong. It is on origin at 165c5993 with no commits, and the base is now 83d71fd6.
6. **The worktree.** "worktree /home/user/ux-sign-in-time (pnpm install done)" is wrong. The worktree does not exist in this container; setup creates it.
7. **"Running: … wf_3c17f552-0ea … `progress/sgn-*.md` in this session's scratchpad … Check-in trig_01K7rHNZ7R1ntNDdusLkiDLC at 08:21 UTC" is wrong on every point:**
   - Nothing is running.
   - The scratchpad is gone; its copies are in `approval-summaries/lane-b-ux-sign-in-time-wip/`.
   - `list_triggers` returns no scheduled tasks.
8. **Next.** "Next: builders; the draft PR; …" is wrong. Next is the design's §§5–8, then its review and revision. Nothing is built.

Add a log row dated 2026-11-01 for the takeover. Do not edit LANES.md line 184, which still says "in the same session" and "UX PR 10 first": the orchestrator updates claim rows.

### Reserved numbers
As LANES.md's claim row has them (the ux-forms row, line 184):
- **ADR:** 0081 if needed, shared with PR 7.
- **Test matrix:** SGN-01 to SGN-04 for PR 6 and SGN-05 to SGN-08 for PR 7, a new series.
- **Synth module:** 19 (SGN) if needed.
- **Status files:** `lane-b-ux-sign-in-time-status.md` and `lane-b-ux-sign-in-recovery-status.md`.
- **Migration timestamps:** none. The PR has no migration.

The design uses ADR 0081, SGN-01 to SGN-04 and module 19. All three are still free on 83d71fd6 and on every open head:
- No 0081 file exists and no `SGN-` row exists.
- `MODULE_NUMBER` ends at DLR 18 on the base, and earlier on the other heads.

The ADR file name is `docs/adr/0081-state-and-enforce-each-sign-in-steps-limit-warn-before-it-closes-and-start-again-with-the-email-kept.md`.

### Setup arguments
```
git -C /home/user/PhysicalTherapy fetch -q origin claude/build-ops && git -C /home/user/PhysicalTherapy show FETCH_HEAD:tools/setup-container.sh > /tmp/setup-container.sh && bash /tmp/setup-container.sh co-001/ux-sign-in-time:/home/user/ux-sign-in-time
```
- Run it in the background until it prints OK. It creates `/home/user/ops` and installs the pre-push hook.
- If it fails with "node: /opt/node24/bin/node reports 'v24.22.1', not v24.22.0", run `mv /opt/node24 /opt/node24.base-image` and run it again.
- storage.googleapis.com has been allowed since 2026-10-27, so the Playwright line works.

### Exact next step
**Done:** the three scouts, and the author through §4 with the SGN rows.

**Remaining:** the author's §§5–8, the design review, the revision, the builders, the before shots, the draft PR, two reviews, the fix round with the full suite, the fresh-clone verification, and the merge.

**Always:**
- Never `--no-verify` and never force-push.
- Never approve or request changes on a PR.
- Never open a PR into `main`.
- Never write an approval line.
- Synthetic data only.
- If the design turns out to need a migration, a regenerated `docs/product/domain-model.md`, or a Cognito or infra change, stop and record it under "Handed to Lane A" (LANES.md rule 2).

1. **Setup** (above). Then fast-forward the branch to the base (83d71fd6):
   ```
   git -C /home/user/ux-sign-in-time merge --ff-only origin/claude/build-platform
   ```
   Then, with `export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH`, run `flock /tmp/laneb-heavy.lock pnpm install --frozen-lockfile` in the worktree. The lockfile did not change in the delta.
2. **Status file corrections** (above). Commit between the two commands:
   ```
   git -C /home/user/ops pull --no-rebase origin claude/build-ops
   GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks git -C /home/user/PhysicalTherapy push origin claude/build-ops
   ```
   Many sessions now share build-ops. If the push is refused as non-fast-forward, pull again and push again. Never force.
3. **Finish the design.** Adapt `workflow-scripts/lane-b-ux-sign-in-time-design-wf_3c17f552-0ea.js` into a new run.
   - **Script changes:**
     - Drop the Scout phase and pass in the three committed `scout-*.md` files.
     - Set `SP` to this session's scratchpad. Seed `SP/progress/sgn-author.md` from the wip copy.
     - In `COMMON`, change the base from 165c599 to 83d71fd6.
     - Line 13: replace "The next PR in this session is UX PR 7" with "UX PR 7 is a later session's; keep §3.5's hooks for it".
     - Line 14: add `/opt/pnpm-bin` to PATH.
     - Line 15: replace `gh pr view 42` (refused, GraphQL 403) and the stale `pr42-files.txt` with `gh api repos/PureTideWater/PhysicalTherapy/pulls/42` and its REST files API.
   - **Before starting:** schedule a `send_later` about 5 h 10 min ahead.
   - **Author:**
     - First apply the five corrections under "Design", re-verifying every file:line at 83d71fd6.
     - Then write §§5–8 to the script's line-37 spec, in the style of `designs/lane-b-ux-forms.md`:
       - §5: ADR 0081 in outline (decision, alternatives, consequences, not covered); ADR 0016's status line and its note; the two ADR 0077 notes.
       - §6: every string, exact, and the before and after shots at 1280 and 390 px light and 1280 px dark. Use the screen tour's ids, plus `cap()` additions with a `clock` option. Those additions go on `claude/build-ops` in `tools/lane-b-screen-tour/capture/tour.spec.ts` and `designs/lane-b-ux-review/route-map.json`; pull first and push through the hook.
       - §7: no migration, and the proposals outside the PR, including the stale "three days" comment in `identity.ts`, noted for Lane A.
       - §8: risks.
   - **Review:** one adversarial reviewer with the security lens (`.claude/agents/security-reviewer.md`) and the UX lens (`.claude/agents/ux-brand-reviewer.md`) writes `designs/lane-b-ux-sign-in-time/review.md`.
   - **Revise:** add the "Review and dispositions" section.
   - **Afterwards:**
     - Archive the script as `workflow-scripts/lane-b-ux-sign-in-time-design-2-<runId>.js`.
     - Commit the design, the review and the progress files to build-ops.
4. **Build.** Adapt `lane-b-ux-download-refusals-build-wf_64b87764-990.js`.
   - Slices A to D run in parallel, with no file in two slices. Slice D includes `common.ts`.
   - Then an integration check: typecheck, lint, `lint:logs`, unit, the touched db tests, and `pnpm synth`, which writes `fixtures/synthetic/SGN-01..04/expected.json`.
   - Take the before shots on 83d71fd6 with an adaptation of `lane-b-ux-download-refusals-capture-before-wf_c067d77c-56b.js`, using the tour states from §6.
     - Follow `/home/user/ops/tools/lane-b-screen-tour/README.md`: `TOUR_REF` is the base, then the head.
     - PNGs and tiles never go on a branch; share them through a private gallery (`tools/lane-b-screen-gallery`).
5. **Draft PR, as soon as there is a commit.**
   - Push with `git -C /home/user/ux-sign-in-time push origin co-001/ux-sign-in-time`, through the hook.
   - Open the PR with MCP `create_pull_request` (draft, base `claude/build-platform`).
   - Write the description from `.github/pull_request_template.md`, every section present ("None" rather than omitted), and keep it under 65,536 characters. Send it only through MCP `update_pull_request` and read it back.
   - Call `subscribe_pr_activity`.
6. **Two reviews.** Adapt `lane-b-ux-download-refusals-reviews-wf_1c44b1a2-762.js`:
   - **Security review:** the kept-email cookie, enumeration, logs and the server deadline.
   - **`ux-brand-reviewer` review:** with after shots taken through the README's "From another lane" section.
   - Each review runs in a fresh clone, and a skeptic checks each finding. The script refuses to continue if a review returns nothing.
7. **Fix round.** Adapt `lane-b-ux-download-refusals-fix-wf_959acf20-bf4.js`. Run the full suite once, then push once.
   - **The suite:**
     - unit, golden and oracle;
     - test:db in 4 shards, one after another, each on a fresh PG18 database on port 5433;
     - build, stamp, then e2e with `E2E_PREBUILT=1`, including the real 3-minute test;
     - the affected Stryker shards, then the gate;
     - `pnpm verify-content` and synth's check.
   - Run every heavy command under `flock /tmp/laneb-heavy.lock` with the PATH from step 1.
   - Run at most 2 heavy workflows per container, and keep a progress file for every agent.
8. **Fresh-clone verification**, reading CI on the head. Adapt `lane-b-ux-download-refusals-verify-4-wf_f6ddc946-253.js`.
9. **Merge.**
   - Merge the latest base in with a merge commit. Regenerate `pnpm-lock.yaml` and `watched-paths.txt` if they conflict, never hand-merge them, and never touch `domain-model.md`.
   - Wait for green on `all green`, `mutation`, `screening-capacity gate` and `approval-of-record`.
   - Mark the PR ready and wait for approval-of-record's re-run.
   - Call `merge_pull_request` with method merge and `expectedHeadSha`.
   - Unsubscribe, read the push runs, clean the worktree, and update the status file.

### Merge order and dependencies
- **Nothing must merge first.**
  - The PR lands on nothing. No open PR or unmerged branch touches `lib/auth/`, `lib/routes/sign-in.ts`, `app/sign-in/`, `components/test-support/browser.ts`, `components/hardware-key.tsx`, ADR 0016, or synth `types.ts`/`common.ts` (checked against every head, except `main`'s own branches).
  - It need not wait for handoff §6's order (#82, #86, #75, #84, #83, #85).
  - In every conflict below, the PR merged second resolves and keeps both sides (LANES.md rule 6). Expect that to be this PR.
- **Shared documents** (`docs/product/test-matrix.md`, `packages/synth/src/cases/matrix.ts`, `registry.ts`) are also touched by:
  - #42 be63bdc2, #75 871faff9 (and wip-5 7f77cb19), #82 96758e44, #83 f4a97668 (and WIP f5e0ceba), #84 e3299ea2 and #85 29dded52;
  - the schema chain: SS-01 f897a282, 1b 358dc53f and interest e0646746.
  - #86 and #87–#89 touch none of them.
- **`apps/web/src/components/test-support/forms-harness.tsx`** conflicts with #85 (29dded52, +121/−2).
- **`apps/web/scripts/synthetic-personas.ts`, `scripts/seed.ts` and `scripts/seed.db.test.ts`** are also changed by the schema chain's branches (SS-01, 1b, interest). None of these is a PR yet.
- **`docs/adr/0077-…md`:** #75's wip-5 (7f77cb19, and wip-4 a8bf75ca) edits lines 142–150. This PR adds notes after :47 and :246. The hunks are separate, so a clean merge is expected; the PR merged second checks.
- **#42:** this PR only reads its files (`e2e/helpers.ts`, `e2e/hardware-key.spec.ts`, `infra/lib/constructs/identity.ts`). The SGN-01 pin holds after #42 merges. Line references then shift as listed under "Design".
- **Downstream:**
  - UX PR 7 builds on this PR: the kept-email helpers, `StepTimer`, `StepHeading`, `advance`, an amendment to ADR 0081, and SGN-05..08.
  - UX PR 8 depends on PR 7.
  - UX PR 66 (`co-001/ux-sign-in-session`, after #42) moves the constants in `step-limits.ts`.

### Waiting on someone
None of these blocks the merge.
- **UX PR 66:** the 15-minute Cognito session, in `identity.ts` and `infra/test/identity.test.ts`. It is not this PR. It is a Cognito/infra change for Lane A, or for an acting-Lane-A session the orchestrator assigns. Its weaker 15-minute setting is a security trade-off for the founder (rule 8).
- **The stale "three days" comment in `identity.ts`** (:41-42 on the base, :45-46 on be63bdc2; `INVITATION_DAYS` is 7): recorded for Lane A. It is #42's file.
- **WCAG 2.2.1 residue:** recorded for audit #103.
- **UX-128's step counting:** the co-founder already ruled, and design §2.7 follows that ruling.
- **Usage (rule 9):** the co-founder reported under 20% weekly at 2026-11-01 ~14:40 UTC. Before each later heavy run, check the current figure through the orchestrator. Start no new heavy run past about 80%.
- **Runbook 3i and `APPROVAL_REVIEW_REQUIRED`** stay the founder's. Until then, merge on green checks after the fresh-clone verification.

### Follow-on
None. UX PR 7 (`co-001/ux-sign-in-recovery`) and UX PR 8 (`co-001/ux-account-security`) get their own sessions later. Leave the hooks for PR 7 that design §3.5 describes, and do not start either one.

### Resume
Resume from your status file: it is your handoff. Do not message the old sessions.
