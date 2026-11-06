# Lane B: ux-home-figures status (co-001/ux-home-figures)

One actionable figure on the home and the ROI statement, and the Recovered tile names its period (the UX review's PR 9;
UX-003 (C-009), UX-015 (C-048), UX-140 (C-183); `designs/lane-b-ux-review.md` §3.2 "UX PR 9";
`designs/lane-b-ux-review/synthesis/prs.json` order 9). Run since 2026-11-01 by session_01FcouKPLmdYyBmbVaUjag2c, a Lane B item session started by Lane B's
orchestrator (session_01FcouKNNHsdecRMzfTs7XwW); before that by session_01L3tN5LCq2aNYetEQBNJYZg (Lane A's orchestrator's
item session, 2026-10-27), as the follow-on of PR 5 (`co-001/ux-download-refusals`, merged as #78, 83d71fd6,
GitHub merged_at 2026-10-28T06:50:22Z).

## Now (2026-11-02 02:50 UTC): MERGED
- **PR #93 merged** 2026-11-02 02:42:45 UTC (GitHub merged_at) as 877e662f (method merge, expectedHeadSha d1e4c4c4), into claude/build-platform. Unsubscribed. Worktree `/home/user/ux-home-figures` and the local branch removed (the remote branch stays); main checkout fast-forwarded to 877e662f and `pnpm install` run. Push runs on 877e662f: ci success, screening-capacity success, mutation success. **Stopped at a clean point** (no follow-on, per the pacing call).
- **Stages, all done:** 1 design and review (wf_132e0b59-2b4); 2 build (wf_21e8bd67-64f; af3b6d89), before shots (wf_c880ba51-8cf); 3 draft PR and description (wf_b80e9712-f4a); base merge 1 (#82, #83: 87691be4, wf_4a5f0f16-f8c); 4 reviews (wf_a1a88081-22f: payment-engine and UX/brand with 38 after shots; no blocking; 23 real findings); 5 fix round (wf_768311e7-b88: all fixed, a fourth round's 4 fixed, full local suite once; 30c055c9); description republished (wf_52437a96-5cc); base merge 2 (#92: d1e4c4c4, rows kept both sides, SGN 19 then HOM 20; wf_7be2d381-b60); 6 fresh-clone verification (wf_e45d195a-ebd: scope, #42 overlap, HOM rows, ADR 0082; CI on d1e4c4c4 read after it completed: every check green, all green, mutation, screening-capacity gate and approval-of-record included; description brought to the head); 7 ready, approval-of-record re-run green, merged.
- **Merge order:** the 20:36 UTC rule; no conflicting PR was ready ahead (#42, #85 drafts).
- **Freeze exception:** none needed (payment-engine review). **Migration:** none. packages/pricing, packages/ledger, packages/db untouched.
- **Reserved numbers used:** ADR 0082; test-matrix HOM-01 to HOM-04; synth module 20 (HOM). Nothing else.
- **WIP refs:** `co-001/wip-ux-home-figures` (27a848c1, snapshot 4) and `co-001/wip-ux-home-figures-2` (b29b1a31, snapshot 3, pushed by the resumed build at 2026-11-01 20:33 UTC under the next free name) are this session's own and superseded by the merge; left in place (never force or delete without the orchestrator). The remote branch `co-001/ux-home-figures` stays at d1e4c4c4.
- **Follow-on:** none taken (pacing call 2026-11-02 02:10 UTC: no new item after the merge). #46 (Verified seal) stays undesigned for the orchestrator to assign.

## Log
- 2026-10-28 06:50 UTC: PR 5 merged (#78; GitHub merged_at 06:50:22Z); PR 9 started: branch cut, status file written.
- 2026-10-28 ~07:30 UTC: design and review done (wf_132e0b59-2b4); dispositions written.
- 2026-10-28 07:36 UTC: builders wf_5fc0815b-69d and before shots wf_0f9ac53c-daf started.

- 2026-10-28 ~07:55-08:05 UTC: Lane A's account hit its weekly limit; wf_5fc0815b-69d and wf_0f9ac53c-daf lost, nothing on origin.
- 2026-11-01 17:00 UTC: taken back by Lane B (session_01FcouKPLmdYyBmbVaUjag2c, started by Lane B's orchestrator); setup OK; base still 83d71fd6; stages 2 onward re-run.
- 2026-11-01 17:01 UTC: builders wf_21e8bd67-64f and before shots wf_c880ba51-8cf started.
- 2026-11-01 17:10 UTC: before shots done (wf_c880ba51-8cf): 35 shots at 83d71fd, 0 failed, 115 tiles in the scratchpad `hom-screens-before` (notes: `approval-summaries/lane-b-ux-home-figures-wip/hom-capture-before.md`). No spec change. The no-BAA empty home cannot be shot on synthetic data (every seeded practice has a BAA); HOM-03's render covers it. The after run uses the same TOUR_ONLY.
- 2026-11-01 ~19:00 UTC: the account's 5-hour limit stopped wf_21e8bd67-64f in Integrate (hom-integrate and hom-wip-3 failed); Core, Screens and Docs had finished; WIP snapshot 2 on origin `co-001/wip-ux-home-figures` = f22eeffc. Integrate had measured the CAS-41 gate before the stop: 100k month, as tp_app, medians of 5: today's three statements 8300.1 + 8590.3 + 1422.0 = 18312.4 ms vs the new HOME_CASES 7775.4 ms (gate passes, 0.42x); whole dashboard() 47.4-48.1 s vs base 56.3-64.1 s. Typecheck, lint (one fix), lint:copy, lint:logs, synth, watched.ts (+1 line, kept) and the Stryker affected check (no money shard) done.
- 2026-11-01 20:00 UTC: machine restarted; setup re-run (PostgreSQL up); wf_21e8bd67-64f resumed with resumeFromRunId (Integrate continues: unit, db shards, build, e2e).
- 2026-11-01 ~20:30 UTC: Integrate done; af3b6d89 committed and pushed; draft PR #93 opened and subscribed.
- 2026-11-01 20:56 UTC: description done; base 43565235 merged (87691be4), checked, pushed; stage 4 reviews wf_a1a88081-22f started.
- 2026-11-01 ~21:40 UTC: reviews done (no blocking; 23 real findings across both lenses, all taken); CI on 87691be4 all green; fix round wf_768311e7-b88 started.
- 2026-11-01 ~23:00 UTC: the account's 5-hour limit stopped wf_768311e7-b88 after the fixes (money, screens, records) and the UX fourth-round review; the engine fourth-round review, four skeptics and the suite failed. Uncommitted fixes saved as WIP `co-001/wip-ux-home-figures` 27a848c1 (snapshot 4).
- 2026-11-02 01:05 UTC: machine restarted; setup re-run (PG up); wf_768311e7-b88 resumed with resumeFromRunId.
- 2026-11-02 ~02:40 UTC: fix round done; 30c055c9 pushed; PR description being republished.
- 2026-11-02 ~02:20 UTC: base merge 2 (#92) d1e4c4c4 pushed; the 30c055c9 run's e2e and capacity were cancelled by that push (not defects).
- 2026-11-02 02:41 UTC: CI green on d1e4c4c4; verification complete; PR marked ready; approval-of-record re-run green.
- 2026-11-02 ~02:47 UTC: **merged as 877e662f**; unsubscribed; worktree cleaned.
- 2026-11-02 ~03:30 UTC: push runs on 877e662f all green (ci, screening-capacity, mutation). Item done; session stopped at a clean point.
- 2026-11-06 ~19:25 UTC: HOLD check after the weekly reset (orchestrator's request): #93 merged (877e662f, in claude/build-platform); LANES.md claim row already records the merge; no other lane or session changed this item since 2026-11-02. Nothing to resume; STOPPED, done.

## Waiting on someone
- Nothing.

## For Lane A (left out of this PR)
- **F9:** a fifth `roi_links_valid()` key, `actionable_open_lines` (the priced_line IDs a statement's actionable figure counted, whose `variance_cents` never change), so a stored statement's actionable figure can be recomputed. A migration.
- **Open question 3 (PR 11):** should the refreshed stored `case.actionable_cents` hold the live figure (`ACTIONABLE_NOW`)? That would make the home an indexed read with bounded time. If the CAS-41 gate (F1) fails, the home's statement goes there too.

## Proposals (improve as you go, outside this PR)
- Fix round 4, F1: the out-of-figure words call a line a person reopened to an earlier stage "moved on past actionable"; name that cause apart.
- Fix round 4, F3: the case page's Payer approved fact has no "to date" or patient's-share clause, unlike both tiles.
- WholeDates could take quarter keys (UX-R1-04 used a local whitespace-nowrap span).
- The design file's wording (F8/HOM-02 "that stands", D7 "none yet", the D8 Cases sentence, the Payer approved notes) is behind the code; the PR description and ADR 0082 hold the final words.
- After #42: reconciliation-001.md's freeze record gets ADR 0082's sentence (engine-r1-E4).
- **After #42:** the monthly summary's actionable bucket (`lib/monitoring/queries.ts`, its CSV and PDF) counts a case line only through the line predicate and reports the rest apart as out of the figure (F2); "stage-five" in `components/help.ts`, and a copy-lint rule against stage numbers.
- The audit report's run-scoped actionable (no pricing check; its "not cash until it posts" note, which has no proof level to word it by): a follow-up of its own.
- The digest's set of cases nearing their deadline (state open, from today) differs from the home's (every worked state, passed deadlines included): align them in one definition, in its own PR.
