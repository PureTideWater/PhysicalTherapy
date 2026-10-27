# Status: every table scrolls by keyboard and shows that it scrolls; phones get one stacked-row layout (`co-001/ux-table-scroll`)

## Current state (2026-10-27 22:00 UTC)
- **PR #79** (draft): https://github.com/PureTideWater/PhysicalTherapy/pull/79. Pushed head **88a66bd**, on base 085299b (#76 merged in at e0557d9). CI is running on it. This session is subscribed to the PR.
- **Fix round:** done (wf_90ac8f1b-a42, 19:42-21:45 UTC). All 15 review findings are fixed in 18165df, ccc4e1f, d8169b8 and 88a66bd (`approval-summaries/lane-b-ux-table-scroll-fix.json`). Also taken:
  - axe's landmark-unique in atPhoneWidth;
  - two new guard rules: a repeated literal label, and wrap-anywhere on a td or th;
  - `components/dates.tsx` (UtcTime, WholeDates).
- **Full local suite once on 88a66bd** (`approval-summaries/lane-b-ux-table-scroll-fix-suite.md`): all 26 steps pass.
  - unit 380 files, 6,303 passed, 4 skipped;
  - golden 376; oracle 687 fixtures;
  - db 127 files, 9,222 passed, 1 skipped;
  - e2e 56 of 56 (screening passed first time);
  - stryker: no shard affected, the gate passed.
- **Shots re-taken at 88a66bd** (`approval-summaries/lane-b-ux-table-scroll-shots-recheck.md`): every UX finding shows fixed.
- **Running:** the gallery prep (wf_aad33eec-f05); then the private galleries are published and named in the PR description.
- **Next:**
  1. the PR description: the checks, the reviewers' table, the galleries;
  2. the fresh-clone verification reading CI on 88a66bd;
  3. the latest base merged again if it moved;
  4. mark ready, then merge;
  5. then PR 4.

The UX review's PR 3 (UX-011 / C-002; UX-079 / C-043 part (a)). Run as a Lane B item by a parallel session (https://claude.ai/code/session_019VghcxKzP9LAj3WK8k6u1D), started by Lane A's orchestrator (session_01TrKDxeLbxVo7t7zwRXFzrg) on 2026-10-27. Follow-on in the same session after this merges: PR 4, `co-001/ux-screening-result-tables` (status `lane-b-ux-screening-result-tables-status.md`).

- **Reserved:** ADR 0078 if the design needs one (shared with PR 4); test-matrix TBL-01 to TBL-04 (a new series); `packages/synth` cases the same if needed, synth module 17 (TBL).
- **GitHub login:** PureTideWater.
- **Machine:** setup script ok except `playwright` (chromium-1194: the proxy refuses storage.googleapis.com). Allowed at 02:00 UTC; ok from 14:07 UTC.
- **Source:** `designs/lane-b-ux-review.md` §3 entry 3, `designs/lane-b-ux-review/synthesis/prs.json` order 3.

## Overlaps
- **#42 (`co-001/pr-06b-mail-streams`, 13f59b1):** none of prs.json's 39 files is a #42 file. The three #42 pages (users, console support, support access) stay out (UX PRs 74 to 76).
- **ux-forms (`co-001/ux-forms`, 17bbb70, another session):** shares `console/compliance/page.tsx`, `console/organizations/[organizationId]/page.tsx`, `p/[practiceId]/cases/page.tsx`, `p/[practiceId]/settings/pricing/page.tsx`, `components/reconciliation/template-mapper.tsx`. The PR merged second keeps both (rule 6).

## Log
- 2026-10-27 21:45-21:55 UTC: fix round done; full suite green on 88a66bd; pushed (one push; the commits were first saved on `co-001/wip-ux-table-scroll`).
- 2026-10-27 19:39 UTC: both reviews done (merge after fixes; 15 findings, all taken). 19:42: the fix round wf_90ac8f1b-a42 started, with the base (#76) merged in first.
- 2026-10-27 ~17:11 UTC: the account's 5-hour limit stopped the reviews workflow (all three agents mid-run; the before tour run had its 49 shots; the correctness review had one finding, F1). The machine restarted. 19:08: resumed on the orchestrator's message; setup re-run (all ok); wf_e7456d3d-fde resumed with resumeFromRunId and a RESUMED note (each agent continues from its progress file, copied to `lane-b-ux-table-scroll-wip/progress/`). Safety check-in moved to 00:19 UTC (trig_01EX8La4gBcbgfPmHhwMXmnQ).
- 2026-10-27 16:51-17:03 UTC: CI on 35b14cd: `e2e (2/2)` failed only in `screening.spec.ts:135` (the known race at :339 and the retry at helpers.ts:87, LANES.md "Handed to Lane A", 2026-10-25; #42's file, no fix exists yet). One comment on PR #79 said so, and the one re-run of the failed jobs passed: every required check green on 35b14cd (all green, mutation, screening-capacity gate, approval-of-record). The re-run is spent for this head.
- 2026-10-27 16:43-16:50 UTC: build done (11 commits, head 35b14cd, pushed); draft PR #79 opened and subscribed; reviews workflow wf_e7456d3d-fde started.
- 2026-10-27 14:07 UTC: resumed after the usage hold; setup all ok (playwright too). 14:20: the design review folded in (section 12, all 16 accepted; DR-10 also takes the words "As PaidWhole recorded it" in place of "as the engine recorded it"). 14:12: build workflow wf_2dbe5cca-58e started.
- 2026-10-27 01:42 UTC: setup done; branch `co-001/ux-table-scroll` cut at e908c21 in `/home/user/ux-table-scroll`, installed. Next: the design workflow (scouts, author, one reviewer).
- 2026-10-27 02:30 UTC: the design workflow finished; design and review pushed; holding until 14:05 UTC (the orchestrator's usage hold, 94% weekly).
- 2026-10-27 01:50 UTC: design workflow wf_76fa3626-8c5 running (three scouts: inventory, mechanics, tests and consumers; one author writing `designs/lane-b-ux-table-scroll.md`; one adversarial reviewer). Notes in this session's scratchpad `design/`. If this session ends mid-run, a new session re-runs the design stage.

## Waiting on someone
- Nothing. (storage.googleapis.com was allowed at 02:00 UTC.)

## Proposals (improve as you go; not built here)
- **With UX PR 4 (next, same session):** reword TBL-01, TBL-03 and TBL-04 (and matrix.ts byte for byte, then regenerate fixtures) to name what is now asserted: the keyboard proof of the cue, the two new guard rules, landmark-unique, role=list, the Badge and long-key wrap.
- **Three nits the re-check found, each a measured trade-off** (in a later UX PR):
  - (A) the packet line schedule's Patient placeholder breaks after "{{" so twelve columns fit at 1263 px;
  - (B) Cases at 390: Payer and plan takes 3 lines (the Owner column's email floor);
  - (C) whole hashes wrap with a 2 to 4 character tail; try a span of half the hash's width (`w-[33ch]`).
- Hashes still cut outside tables: cases/[caseId]/submissions:333, the packet page's document label, pricing-runs list:63, terms:38.
- The Hash component's break-all lowers a column's min-content: give it a floored block variant for table cells. SelectField sets a column to its longest option: make it compressible app-wide.
- UtcTime and WholeDates for dates in prose and fact lists app-wide (the contract version's dispute window breaks "2026-10- / 27"); a guard rule for date cells.
- tools/screening-capacity/watched.ts follows CSS @import (brand.css reaches the screening page but is not watched).
- tabTo checks that a focused box is not clipped by any ancestor; landmark-unique in expectAccessible at 1280 after a discovery run.
- The reviewer checklist (.claude/agents/ux-brand-reviewer.md): "a table that fits keeps whole words; wrap-anywhere on a cell lowers its min-content"; "never cut to a hover title" (file names, hashes); free text a person typed takes a floor.
- The tour: a populate step leaving a model proposal, a specialist ledger shortfall and a compliance evidence record; a long synthetic exhibit page so the cited box overflows.
- When #42's pages are wrapped (UX PRs 74 to 76): UtcTime for console/support:93-96 and support-access:57.
- Design P10: drop the receipts section's own aria-label.
