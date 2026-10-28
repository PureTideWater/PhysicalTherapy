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

**MERGE HOLD** (Lane A's orchestrator, 2026-10-28 07:20 UTC): #83 does not merge until #75 (contract-phi-check) merges, or until 11:00 UTC, whichever comes first, because both touch the test matrix, synth matrix and registry. Every stage up to the merge goes on. After the hold, merge the base into #83 once (rule 6), then merge as usual. The orchestrator messages when the hold lifts. (#78 merged at 06:50 UTC.)

## Current state (2026-10-28 05:50 UTC)
- **PR #83** (draft): https://github.com/PureTideWater/PhysicalTherapy/pull/83. Head **f4a9766**, the clean base merge of 165c599 (#74). Every check passed locally on it (unit 6,581; e2e 26 of 26 over 11 specs). The description is from the template, written with update_pull_request and read back byte for byte. This session is subscribed to the PR.
- **Build:** done (wf_9184e225-f39, 03:05-04:05 UTC), 6 commits:
  - 995f568 and 8c23530, StackedRows' description and the 40% term column;
  - ed08391, the three tables on StackedRows and the words;
  - cf36117, `screening-phone.spec.ts` and `atPhoneWidth`'s `lists` option;
  - 5a4cbe5, the ADR 0078 amendment, TBL-05 to TBL-08, TBL-01, -03 and -04 reworded, synth and `watched-paths.txt` by its generator;
  - 0c261ee, a cleanup.
- **The checker's results on 0c261ee** (all pass):
  - typecheck, lint, lint:copy, lint:logs, synth and verify-content clean;
  - unit 6,475 passed, 4 skipped, with #42's `result.test.tsx` unedited and passing;
  - `watched.test.ts` 6 of 6;
  - the large result page test: page 1 is 387 KB, was 144 KB, under the 512 KiB cap;
  - e2e 6 of 6: screening-phone, screening (no flake), tables-phone, layout-1280.
- **The two copies differ in tone on purpose** (P4-DR-03): on a phone an anomaly shows in the unpriced tone; the table copy keeps Short until UX PR 4b (#42's pins).
- **`watched-paths.txt`, by its generator:** +`components/screening/table-parts.tsx`, +`components/stacked-rows.tsx`; `lib/copy/words.ts` stays on the merged tree, because #74's sign-in imports it.
- **CI on f4a9766:** every check green (all green, mutation, screening-capacity gate, approval-of-record). Since then #81 merged (56ed627), so the PR is "behind"; the fix round merges it first.
- **Reviews:** done (wf_7237972d-adf). Both say "merge after fixes" (`approval-summaries/lane-b-ux-screening-result-tables-review-findings.json`).
  - Correctness: P4-RC-01 should fix, -02 to -06 nits. No defect in what renders; 0 mismatches between the copies.
  - UX and brand: UXR-01 should fix (the audit request at the foot of a longer page worsens UX-134: a link at the top is taken here), -02 to -08 nits.
  - Shots: before at 165c599 and after at f4a9766.
- **Running:** the fix round wf_4147d4ff-acd (from ~06:20 UTC):
  1. the base merge of 56ed627 (#81), with the generator;
  2. every finding;
  3. the full local suite once;
  4. the shots re-taken.
  - Safety check-in 10:20 UTC (trig_014vh315v1NTqmgwpDQghedC).
- **Next:** the fix round (every finding, the full local suite once, one push); the fresh-clone verification reading CI; mark ready; merge. Then, the day #42 merges, UX PR 4b.

## Overlaps (checked 2026-10-28 01:45 UTC)
- **#42** (`co-001/pr-06b-mail-streams` at 6f23c42, 212 files):
  - `apps/web/src/components/screening/result.test.tsx` is now a #42 file, so this PR's unit tests go in a new file.
  - `apps/web/src/lib/screening/labels.ts` is under LANES.md's "Not while #42 is open" (`lib/screening/*`), so it is not edited; a label change goes elsewhere or is recorded "after #42".
  - `apps/web/e2e/screening.ts` is #42's: the new `screening-phone.spec.ts` calls it unchanged, and the PR merged second updates it.
  - `anomalies.tsx`, `coverage.tsx` and `result-summary.tsx` are not #42's.
- **ux-forms** (`co-001/ux-forms`): none of the planned files.

## Log
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
