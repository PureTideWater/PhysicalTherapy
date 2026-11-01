# Lane B: ux-home-figures status (co-001/ux-home-figures)

One actionable figure on the home and the ROI statement, and the Recovered tile names its period (the UX review's PR 9;
UX-003 (C-009), UX-015 (C-048), UX-140 (C-183); `designs/lane-b-ux-review.md` §3.2 "UX PR 9";
`designs/lane-b-ux-review/synthesis/prs.json` order 9). Run since 2026-11-01 by session_01FcouKPLmdYyBmbVaUjag2c, a Lane B item session started by Lane B's
orchestrator (session_01FcouKNNHsdecRMzfTs7XwW); before that by session_01L3tN5LCq2aNYetEQBNJYZg (Lane A's orchestrator's
item session, 2026-10-27), as the follow-on of PR 5 (`co-001/ux-download-refusals`, merged as #78, 83d71fd6,
GitHub merged_at 2026-10-28T06:50:22Z).

## Now (2026-11-01 17:00 UTC)
- **Machine:** setup OK (2026-11-01 ~16:59 UTC; every line ok). GitHub login: PureTideWater.
- **Base:** claude/build-platform = 83d71fd6 (unchanged since #78); the design's line references hold.
- **Stage 1 done:** the design `designs/lane-b-ux-home-figures.md` (D1 to D11; the predicate in `apps/worker/src/triage/actionable-now.ts`, exported through `@tp/worker/triage`) and its adversarial review (`wf_132e0b59-2b4`: build with changes; no migration; no frozen code; 13 findings, all taken, dispositions at the design's end, which win). ADR 0082 is taken.
- **Stage 2, builders: running** `wf_21e8bd67-64f` (Core, then Screens and Docs, then Integrate with the CAS-41 gate; a WIP push after each phase), and the before shots `wf_c880ba51-8cf` beside it (started 2026-11-01 17:01 UTC; scripts archived as `workflow-scripts/lane-b-ux-home-figures-{build-wf_21e8bd67-64f,capture-before-wf_c880ba51-8cf}.js`). Safety check-in: send_later `trig_01GGB88QX78UcvhMAH5a2Dnx` at 2026-11-01T22:11Z (cancel when the runs end). #42's file list regenerated: 219 files. The first run (`wf_5fc0815b-69d`) and the before shots (`wf_0f9ac53c-daf`) were lost when Lane A's account hit its weekly limit (~07:55-08:05 UTC 2026-10-28); the builders did not commit and the old scratchpad is gone, so nothing reached origin and neither can be resumed (resumeFromRunId is same-session only). The new build run pushes a WIP snapshot to `co-001/wip-ux-home-figures` after each phase and copies `hom-*.md` progress files to `approval-summaries/lane-b-ux-home-figures-wip/`.
- **Branch:** `co-001/ux-home-figures` = 83d71fd6 (no commits of its own), worktree `/home/user/ux-home-figures` (recreated by setup). No PR. No WIP ref yet.
- **Reserved:** ADR 0082 if needed; test-matrix HOM-01 to HOM-04, a new series; `packages/synth` module 20 (HOM) if needed.
- **Reviews (the brief):** the UX and brand review, and the payment-engine review (`.claude/agents/payment-engine-reviewer.md`,
  as a default workflow agent with that checklist). It changes how a dollar figure is computed and shown: code computes
  every number (CLAUDE.md rule 1), money stays integer cents.
- **For Lane A, if found:** anything that needs a migration or changes frozen code (the engine under packages/pricing,
  the ledger's existing behaviour) is recorded here and left out.
- **#42 files:** #42 at be63bdc2, 219 files (merge base 56ed6279; it does not contain 83d71fd6). Overlap with this PR: rows only, in `docs/product/test-matrix.md` and `packages/synth/src/cases/{matrix,registry}.ts`. Re-check at stage 4 (#42's session is about to merge the base into it).

## Log
- 2026-10-28 06:50 UTC: PR 5 merged (#78; GitHub merged_at 06:50:22Z); PR 9 started: branch cut, status file written.
- 2026-10-28 ~07:30 UTC: design and review done (wf_132e0b59-2b4); dispositions written.
- 2026-10-28 07:36 UTC: builders wf_5fc0815b-69d and before shots wf_0f9ac53c-daf started.

- 2026-10-28 ~07:55-08:05 UTC: Lane A's account hit its weekly limit; wf_5fc0815b-69d and wf_0f9ac53c-daf lost, nothing on origin.
- 2026-11-01 17:00 UTC: taken back by Lane B (session_01FcouKPLmdYyBmbVaUjag2c, started by Lane B's orchestrator); setup OK; base still 83d71fd6; stages 2 onward re-run.
- 2026-11-01 17:01 UTC: builders wf_21e8bd67-64f and before shots wf_c880ba51-8cf started.
- 2026-11-01 17:10 UTC: before shots done (wf_c880ba51-8cf): 35 shots at 83d71fd, 0 failed, 115 tiles in the scratchpad `hom-screens-before` (notes: `approval-summaries/lane-b-ux-home-figures-wip/hom-capture-before.md`). No spec change. The no-BAA empty home cannot be shot on synthetic data (every seeded practice has a BAA); HOM-03's render covers it. The after run uses the same TOUR_ONLY.

## Waiting on someone
- Nothing.

## For Lane A (left out of this PR)
- **F9:** a fifth `roi_links_valid()` key, `actionable_open_lines` (the priced_line IDs a statement's actionable figure counted, whose `variance_cents` never change), so a stored statement's actionable figure can be recomputed. A migration.
- **Open question 3 (PR 11):** should the refreshed stored `case.actionable_cents` hold the live figure (`ACTIONABLE_NOW`)? That would make the home an indexed read with bounded time. If the CAS-41 gate (F1) fails, the home's statement goes there too.

## Proposals (improve as you go, outside this PR)
- **After #42:** the monthly summary's actionable bucket (`lib/monitoring/queries.ts`, its CSV and PDF) counts a case line only through the line predicate and reports the rest apart as out of the figure (F2); "stage-five" in `components/help.ts`, and a copy-lint rule against stage numbers.
- The audit report's run-scoped actionable (no pricing check; its "not cash until it posts" note, which has no proof level to word it by): a follow-up of its own.
- The digest's set of cases nearing their deadline (state open, from today) differs from the home's (every worked state, passed deadlines included): align them in one definition, in its own PR.
