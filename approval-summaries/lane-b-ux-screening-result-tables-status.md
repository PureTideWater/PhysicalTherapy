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

## Current state (2026-11-01 17:35 UTC)
- **PR #83** (draft): https://github.com/PureTideWater/PhysicalTherapy/pull/83. Head **f4a9766** (the clean base merge of 165c599, #74). CI on f4a9766: 20 success, 2 skipped (notify, the stryker matrix stub); every required check green. GitHub reads it mergeable false, `dirty`: it conflicts with the base in `docs/product/test-matrix.md` and `packages/synth/src/cases/registry.ts`.
- **Fix-round code:** done for every finding, on the WIP ref `co-001/wip-ux-screening-result-tables` at **f5e0ceba** (descends from f4a9766; no CI): c0a8fe0b merges 56ed6279 (#81); d0152f43 UXR-01; e901e477 UXR-05; 857ca333 P4-RC-01, -04, -06, UXR-02, -03, -04; f5e0ceba P4-RC-02, -03, -05, UXR-06. UXR-07 and UXR-08 need no code (they go in the description). The WIP lacks the base 83d71fd6 (#78) and bce57f16 (#82).
- **The old fix round wf_4147d4ff-acd did not finish:** it stopped after its Fix step (06:37Z 2026-10-28). Its fast checks, the full suite and the recheck shots never landed, and its scratchpad (p4-reviews.json, pr42-files.txt, p4-fix*.md, the shots and index, the capture spec and harness) went with the old container. The 2026-10-28 shots survive only as descriptions in the findings JSON (`.shots`). Its safety check-in (trig_014vh315v1NTqmgwpDQghedC, Lane A's account, 2026-10-28 10:20) is long past and not visible from this account.
- **Next:** the base merge of claude/build-platform (bce57f16 or later) with the generators, the fast checks and the #42 cross-check (read-only); the full local suite once; after shots of only the states the fix round changed (the person's instruction 2026-11-01: no redundant UX check of what already passed one); one push; the description; the fresh-clone verification; merge after #84.

## Overlaps (checked 2026-11-01 16:01 UTC)
- **#42** (`co-001/pr-06b-mail-streams`, now at be63bdc2, 219 files against 83d71fd6): still changes `result.test.tsx`, `e2e/screening.ts`, `e2e/screening.spec.ts`, `lib/screening/*` and `pnpm-lock.yaml`. A trial merge of f5e0ceba with be63bdc2 is clean; the only shared files are the test matrix, synth matrix and registry, and `watched-paths.txt`. `result.test.tsx`, `labels.ts`, `e2e/screening.ts` stay untouched here.
- **#85:** test-matrix, synth matrix and registry; #85 merges after #83 and resolves.
- **#75, #84, #86, #82:** no conflict in trial with #83's own diff; those merging first are kept by #83's base merge (rule 6).
- **ux-forms** merged as #74 (165c5993) and is in the branch.

## Log
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
