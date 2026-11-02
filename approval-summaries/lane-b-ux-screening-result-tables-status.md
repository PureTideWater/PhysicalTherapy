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

## Current state (2026-11-01 20:50 UTC): MERGED
- **#83 merged** at 20:40 UTC 2026-11-01 as **43565235** (method merge, expectedHeadSha 71536c60), by the orchestrator's ruling of 20:36 UTC: a verified, green PR merges as soon as it is ready; only PRs that conflict with each other keep the §6 order (#83 conflicts with none of #86, #75, #84; #85 merges after it and resolves the shared rows).
- **Before the merge:** the base had not moved (bce57f16), so no new base merge; CI on 71536c60 (22 runs, all four required checks green) had run against it. The description gained the order ruling, was written with update_pull_request together with ready-for-review, and read back identical. approval-of-record re-ran after ready (run 124971307249, success, 20:40:17).
- **Head history:** f4a97668 → 71536c60 (c0a8fe0b, d0152f43, e901e477, 857ca333, f5e0ceba, 9289504d, 520a88f6, 71536c60). Full detail in the PR description and the Log.
- **Results of record:** full local suite (`approval-summaries/lane-b-ux-screening-result-tables-finish-suite.md`), after-only shots and verdicts (`…-finish-shots.md`), the fresh-clone verification (`…-wip/progress/verify83.md`): PASS.
- **Cleaned up:** the worktree /home/user/ux-screening-result-tables removed; the check-ins deleted; no PR subscription was held (subscribe had failed).
- **Push runs on 43565235:** ci 41348075952, mutation 41348076075 and screening-capacity 41348076076, all success.
- **Handed on:** MOD-13 (model-gateway redaction of a year below 100), to the orchestrator.

## Follow-on: UX PR 4b — WAITING ON #42
- **4b waiting on #42** (`co-001/pr-06b-mail-streams`, open draft, head 6c28d6a2 at 20:50 UTC; it needs its acting-Lane-A round and the founder's domain-model approval line, the founder's decision). This blocks 4b only.
- The day #42 merges: cut `co-001/ux-screening-result-words` from claude/build-platform; create `approval-summaries/lane-b-ux-screening-result-words-status.md`; re-read design §11's file:line pins against #42's merged tree; run the whole pipeline (two reviews per rule 1; Lane A's three conditions of §12.1; `git ls-remote --tags origin` again before merge: 0 tags at 20:50 UTC); take the "For UX PR 4b" proposals below, and the one-other branch ("the last entry is the one other group…", P4-RC-01), which design 3.4's table does not list yet.

## Overlaps (checked 2026-11-01 16:01 UTC)
- **#42** (`co-001/pr-06b-mail-streams`, now at be63bdc2, 219 files against 83d71fd6): still changes `result.test.tsx`, `e2e/screening.ts`, `e2e/screening.spec.ts`, `lib/screening/*` and `pnpm-lock.yaml`. A trial merge of f5e0ceba with be63bdc2 is clean; the only shared files are the test matrix, synth matrix and registry, and `watched-paths.txt`. `result.test.tsx`, `labels.ts`, `e2e/screening.ts` stay untouched here.
- **#85:** test-matrix, synth matrix and registry; #85 merges after #83 and resolves.
- **#75, #84, #86, #82:** no conflict in trial with #83's own diff; those merging first are kept by #83's base merge (rule 6).
- **ux-forms** merged as #74 (165c5993) and is in the branch.

## Log
- 2026-11-02 02:10 UTC: PAUSED on the co-founder's pacing call (7-day limit at its warning level, resets 2026-11-06 19:00 UTC). Nothing was running: #83 is merged and 4b has not started. One check-in kept, 2026-11-06 19:15 UTC. Exact next step: if #42 has merged, cut co-001/ux-screening-result-words from claude/build-platform and run 4b's pipeline per "Follow-on" above; otherwise keep waiting on #42.
- 2026-11-01 20:50 UTC: #83 MERGED as 43565235 (orchestrator ruling 20:36: merge now). Description updated with the ruling and read back; ready; approval-of-record re-ran green; merged with expectedHeadSha 71536c60. Worktree removed, check-ins deleted. 4b waiting on #42.
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
