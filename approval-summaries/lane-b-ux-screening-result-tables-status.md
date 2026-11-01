# Status: the screening result reads on a phone, and its rows say what they are (`co-001/ux-screening-result-tables`)

The UX review's PR 4 (UX-005, UX-040, UX-042, UX-043, UX-132, UX-206; clusters C-008, C-107, C-118, C-119, C-061, C-203). It is the follow-on of PR 3 (#79, merged as a6e754f) in the same session (https://claude.ai/code/session_019VghcxKzP9LAj3WK8k6u1D), and builds on PR 3's `ScrollTable` and `StackedRows`.

- **Reserved:** ADR 0078 (shared with PR 3; amended here if needed); test-matrix TBL-05 to TBL-08; `packages/synth` module 17 (TBL).
- **Source:** `designs/lane-b-ux-review.md` §3 "UX PR 4" and `synthesis/prs.json` order 4.
- **Copy rules:** the screening's (no "owed", "underpaid" or "recovered").
- **Carried from PR 3:**
  - reword TBL-01, TBL-03 and TBL-04 to name what PR 3's fix round added;
  - reorder the anomalies table's columns into the brand's order (DR-08: `brandOrderProblems` empty, and the table's header order equal to the fields' order);
  - scope any `data-slot` locator to `[data-stacked-copy]` or `:visible` (ADR 0078's renders-twice note).
  - `action-form.tsx`'s refusal hand-off stays UX PR 34's.

**Merge order** (handoff §6, from 2026-11-01): #82 (merged 17:19 UTC as bce57f16) → #86 → #75 → #84 → **#83** → #85. #83 merges only after #84 has merged. (The 2026-10-28 MERGE HOLD lapsed at 11:00 UTC that day with #75 unmerged; no message will come.)

**Session:** https://claude.ai/code/session_01FcouKRDfoFAeXZK4Thp8M8 (Lane B item session, GitHub login PureTideWater), started 2026-11-01 by Lane B's orchestrator session_01FcouKNNHsdecRMzfTs7XwW. The earlier owner session_019VghcxKzP9LAj3WK8k6u1D (Lane A's account) is stopped and its PR subscription no longer holds.

## Current state (2026-11-01 18:45 UTC)
- **PR #83** (draft): https://github.com/PureTideWater/PhysicalTherapy/pull/83. Head **71536c60**, pushed once (fast-forward from f4a97668, through the pre-push hook). CI running.
- **Commits since f4a97668:** c0a8fe0b merges 56ed6279 (#81); d0152f43 UXR-01; e901e477 UXR-05; 857ca333 P4-RC-01, -04, -06, UXR-02, -03, -04; f5e0ceba P4-RC-02, -03, -05, UXR-06; **9289504d** merges bce57f16 (#78, #82; test-matrix and registry kept both sides; watched-paths regenerated; synth unchanged); **520a88f6** P4-FX-correctness-1, P4-FX-words-scope-1 (ADR 0078 wording); **71536c60** P4-FX-words-scope-2 (a withdrawn release's notice comes before the new audit link).
  - The last three were rebuilt locally before the push with identical trees, because git had left its "# Conflicts:" block after the merge's trailer lines (a4efd583 → 9289504d, a006e609 → 520a88f6, 621ef0d6 → 71536c60). Never pushed in their first form.
- **Finish workflow wf_2f124449-b78** (17:30–18:35 UTC, 16 agents):
  - Base merge clean apart from the two expected files; typecheck, lint:copy, 81 targeted unit tests, verify-content passed.
  - **Full suite at a4efd583 (tree = 9289504d):** every step passed but one. pnpm test: 406 files, 6,914 passed, 4 skipped, **1 failed: packages/model-gateway/src/redact.property.test.ts:325 MOD-13**, seed-dependent (2 of 13 runs), not caused by this PR (model-gateway, packets and the lockfile unchanged from bce57f16). test:db 4 shards: 129 files (= vitest list), 9,283 passed, 1 skipped. e2e: 64 passed (SCR-01..07 passed first time). golden 376, oracle 687 agree, stryker affected none, gate passed. Table: `approval-summaries/lane-b-ux-screening-result-tables-finish-suite.md`.
  - **#42 cross-check** (be63bdc2 merged into a4efd583, read-only): clean merge; web unit 89 files, 1,206 tests passed (result.test.tsx pins included); build passed; screening.spec.ts and screening-phone.spec.ts 3 of 3. **No #42 pin broken.** Worktree removed.
  - **Review of the fix-round delta only** (two lenses, three skeptics per finding): every original finding fixed (UXR-07, -08 are description items). Three new nits confirmed and fixed (520a88f6, 71536c60); after those, targeted checks passed (typecheck, eslint, lint:copy, 76 unit tests).
  - **After-only shots of the changed states** (the person's ruling 2026-11-01: no redundant UX check; the before state is in the findings JSON): 9 shots, 114 tiles; verdicts UXR-01..04, P4-RC-01, -04 all fixed, no new defect; UXR-05, -06, P4-RC-03 code only. Index: `approval-summaries/lane-b-ux-screening-result-tables-finish-shots.md`. Spec and harness archived under `…-wip/capture/`. The gallery stays private in the scratchpad (PNGs never on a branch).
- **Handed on (not this lane):** MOD-13. redact.ts years()/iso() accept a four-digit year below 100 (claim number 00230426 written "0023-04-26" reads as a date and is not redacted). A PHI-redaction gap, seed 1162287068 reproduces it. Sent to the orchestrator. It can turn CI's unit job red on an unlucky seed; that would not be this PR's.
- **CI on 71536c60:** 22 check runs, 20 success, 2 skipped (notify, stryker), none failed; all four required checks green. Unit 406 files, 6,919 passed (MOD-13 did not trip); db 129 files, 9,284 passed; e2e 64 of 64, no flake.
- **Description:** rewritten from the template (wf_a898fcc2-e82: draft, two claim checkers with 16 corrections applied or answered, written with update_pull_request), read back identical (31,658 chars).
- **Verification:** PASS (fresh clone, CI read, every finding and P4-FX fix spot-checked, generators re-run with no diff, 423 targeted unit tests). Two nits: the capacity gate's advisory S4 time warning (from the base, a standing founder item, not this PR's), and the draft state with the merge order.
- **READY; waiting on #84** (and #86 and #75 before it; at 20:40 UTC all three are open drafts, #86 and #75 dirty). Nothing more is pushed to #83 while it waits. When #84 merges: merge the base in again (keep both sides' TBL/DLR rows; regenerate watched-paths, synth, lockfile if touched), run the checks the merge touches, push, CI green on that head, update the description's base-merge and CI rows, mark ready, wait for approval-of-record's re-run, merge with method merge and expectedHeadSha.
- **#42 moved** to c65f9cf2 after the cross-check (a merge of #78, which #83 holds, and two documentation commits). Not re-run: nothing in those commits touches #83's files (the person's rule against redundant checks); the base merge at #83's merge time re-checks the shared rows anyway.

## Overlaps (checked 2026-11-01 16:01 UTC)
- **#42** (`co-001/pr-06b-mail-streams`, now at be63bdc2, 219 files against 83d71fd6): still changes `result.test.tsx`, `e2e/screening.ts`, `e2e/screening.spec.ts`, `lib/screening/*` and `pnpm-lock.yaml`. A trial merge of f5e0ceba with be63bdc2 is clean; the only shared files are the test matrix, synth matrix and registry, and `watched-paths.txt`. `result.test.tsx`, `labels.ts`, `e2e/screening.ts` stay untouched here.
- **#85:** test-matrix, synth matrix and registry; #85 merges after #83 and resolves.
- **#75, #84, #86, #82:** no conflict in trial with #83's own diff; those merging first are kept by #83's base merge (rule 6).
- **ux-forms** merged as #74 (165c5993) and is in the branch.

## Log
- 2026-11-01 20:40 UTC: description written and read back; fresh-clone verification PASS on 71536c60 with CI green. Ready; waiting on #84 (order #86, #75, #84, then #83). Check-ins every ~45 min.
- 2026-11-01 19:57 UTC: resumed wf_a898fcc2-e82 after the 5-hour limit stopped its first agent (~19:00); PostgreSQL restarted by the setup script.
- 2026-11-01 18:55 UTC: the describe-and-verify workflow wf_a898fcc2-e82 started (script archived): the description drafted from the template, two claim checkers, written and read back; then the fresh-clone verification reading CI on 71536c60.
- 2026-11-01 18:45 UTC: finish workflow done; three local commits rebuilt for a clean merge message; pushed 71536c60 (one push). MOD-13 handed to the orchestrator. Next: the description and verification workflow.
- 2026-11-01 17:30 UTC: the finish workflow wf_2f124449-b78 started (script archived): base merge of bce57f16 (#78, #82) with the generators and quick checks; then, side by side, the full suite once, the #42 cross-check (read-only, be63bdc2), a review of only the unreviewed fix-round delta (two lenses, each finding put to three skeptics), and after-only shots of only the states the fixes changed with one targeted UX verdict (UXR-01..04, P4-RC-01, -04). Why after-only: the person ruled 2026-11-01 "no need to do the ux check on things that have already passed a ux check"; the before state is in the findings JSON. Safety check-in trig_01HAXoFU1JAbMJTUAEzWQ5a6 at 22:36 UTC. subscribe_pr_activity on #83 failed ("Could not subscribe"): polling with pull_request_read instead.
- 2026-11-01 17:35 UTC: taken back by Lane B (this session). Machine set up (OK); worktree fast-forwarded to the WIP f5e0ceba. Status file corrected (the merge hold, the session, the old fix round, the check-in, the base, the overlaps). Next: the base merge and fast checks.
- 2026-10-28 07:25 UTC: the fix round's commits so far (c0a8fe0 the #81 merge, d0152f4, e901e47, 857ca33, f5e0ceb) saved on `co-001/wip-ux-screening-result-tables` (no CI). The full suite is next in the workflow; if this container is lost, continue from that branch.
- 2026-10-28 07:20 UTC: merge hold on #83 until #75 merges or 11:00 UTC (the orchestrator).
- 2026-10-28 05:52 UTC: CI green on f4a9766. 06:12: both reviews done (merge after fixes; 14 findings, all taken). 06:20: fix round started.
- 2026-10-28 05:40 UTC: the base merge f4a9766 (#74) is clean, the generator re-run and all checks pass; pushed. 05:45: draft PR #83 opened, its description read back, subscribed. 05:48: the reviews workflow started.
- 2026-10-28 05:15 UTC: resumed on the orchestrator's message (the 5-hour limit had stopped the session ~04:05-04:27; the build had already finished at 04:05, nothing to resume). Check-in moved to 10:20 UTC. Next: the base merge's result, then the draft PR.
- 2026-10-28 04:05 UTC: build done at 0c261ee (all checks pass); 05:13: the machine had restarted (PostgreSQL down): setup re-run, OK; 0c261ee pushed; 05:20: base merge (#74) started.
- 2026-10-28 03:20 UTC: Lane A agreed Q1 (re-pin under the same name, no migration), with three conditions for 4b, recorded in design 12.1.
- 2026-10-28 ~01:50-03:00 UTC: the design workflow wf_9855cdd7-e28 (three scouts, author, reviewer). 03:00: the review folded in (section 12). 03:05: build started.
- 2026-10-28 01:45 UTC: branch cut at a6e754f in `/home/user/ux-screening-result-tables`, installed. Next: the design workflow (scouts, author, one reviewer).

## Waiting on someone
- Nothing. (Q1 decided, design 12.1. Lane A confirmed it at ~03:20 UTC, with three conditions UX PR 4b must meet: the `labels.test.ts` comment and the rule's exact words; `git ls-remote --tags origin` again before 4b merges, and if any tag exists the labels part goes to Lane A as a new version; the decision recorded in 4b's PR description.)

## Proposals (improve as you go; not built here)
- **Before the first release tag** (for LANES.md or the launch checklist):
  - UX PR 4b must land: until then the table copy's Short is UX-040, still open (UXR-07);
  - so must UX PR 63: the result's answer and next step stay far down a long page.
- **For UX PR 4b:**
  - the page sentence's "the table’s last row" becomes "the last entry" (UXR-08);
  - "Expected under Medicare, …" becomes "Medicare figure, …" (design P5);
  - GroupStatus says "its" for one row;
  - scope `screening.spec.ts:517` to `[data-stacked-copy="table"]`.
- **Stacked items:** a stacked anomaly item could show its standing chip with the heading, as coverage shows its outcome, so a reader scanning 50 cards finds the anomaly.
- **Page weight:** the 512 KiB cap measures renderToString only; the served page also carries the RSC flight payload, so measure what a phone downloads.
- **`StackedRows`:** a shared `copiesAgree(html)` check for every paired caller.
- **Width-threshold e2e steps:** derive the viewport from the measured scrollbar width (this PR's 994, and #79's 1263).
- **The tour:** screening-result shots at 994 and 768 px, and a "one other group" harness state.
- **The reviewer checklist:** "a stacked list's items carry their own hooks, never the table's"; "a status that is a sentence wraps above a floor in its cell".
