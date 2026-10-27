# Status: every table scrolls by keyboard and shows that it scrolls; phones get one stacked-row layout (`co-001/ux-table-scroll`)

## Current state (2026-10-27 16:50 UTC)
- **PR #79** (draft, into `claude/build-platform`): https://github.com/PureTideWater/PhysicalTherapy/pull/79. Head **35b14cd**, on base e908c21. The description is from the template, written with update_pull_request and read back byte for byte. This session is subscribed to it.
- **Build:** done (wf_2dbe5cca-58e, 14:12-16:43 UTC), 11 commits: tests first and the components (faa7bf1, 40314fb), four site slices (1508bb9, fe20307, 2a25282, 47b97c8), page fixes (af13cc0), e2e (b81f365), guard, ADR 0078, matrix and synth (8d3ce4e), and two fixes (61ba77e: the scroll-state functions live in scroll-table.tsx so no new file joins the screening closure; 35b14cd). The checker's results on 35b14cd: typecheck, lint, lint:copy, lint:logs, verify-content and synth all clean; unit 6,294 passed, 4 skipped (+32); every edited e2e spec passed once; tables-phone test 1 took 1.1 min.
- **Running:** wf_e7456d3d-fde (from ~16:48 UTC), the two adversarial reviews in fresh clones. (1) Correctness and accessibility of the component and its rollout. (2) Before and after shots (e908c21 and 35b14cd; 1280 light, 390 light, 1280 dark, plus states of a capture spec of its own), then the UX and brand review. Safety check-in 21:56 UTC (trig_017YuBqUNr39BguH9ofh4CAr).
- **If stopped:** in this session, resume wf_e7456d3d-fde with resumeFromRunId. From GitHub alone: the branch is pushed; re-run the reviews (script `workflow-scripts/lane-b-ux-table-scroll-reviews-wf_e7456d3d-fde.js`, with `SP` rewritten).
- **Next:** the fix round (every finding, then the full local suite once, then one push), the fresh-clone verification reading CI, and the merge.

The UX review's PR 3 (UX-011 / C-002; UX-079 / C-043 part (a)). Run as a Lane B item by a parallel session (https://claude.ai/code/session_019VghcxKzP9LAj3WK8k6u1D), started by Lane A's orchestrator (session_01TrKDxeLbxVo7t7zwRXFzrg) on 2026-10-27. Follow-on in the same session after this merges: PR 4, `co-001/ux-screening-result-tables` (status `lane-b-ux-screening-result-tables-status.md`).

- **Reserved:** ADR 0078 if the design needs one (shared with PR 4); test-matrix TBL-01 to TBL-04 (a new series); `packages/synth` cases the same if needed, synth module 17 (TBL).
- **GitHub login:** PureTideWater.
- **Machine:** setup script ok except `playwright` (chromium-1194: the proxy refuses storage.googleapis.com). Allowed at 02:00 UTC; ok from 14:07 UTC.
- **Source:** `designs/lane-b-ux-review.md` §3 entry 3, `designs/lane-b-ux-review/synthesis/prs.json` order 3.

## Overlaps
- **#42 (`co-001/pr-06b-mail-streams`, 13f59b1):** none of prs.json's 39 files is a #42 file. The three #42 pages (users, console support, support access) stay out (UX PRs 74 to 76).
- **ux-forms (`co-001/ux-forms`, 17bbb70, another session):** shares `console/compliance/page.tsx`, `console/organizations/[organizationId]/page.tsx`, `p/[practiceId]/cases/page.tsx`, `p/[practiceId]/settings/pricing/page.tsx`, `components/reconciliation/template-mapper.tsx`. The PR merged second keeps both (rule 6).

## Log
- 2026-10-27 16:43-16:50 UTC: build done (11 commits, head 35b14cd, pushed); draft PR #79 opened and subscribed; reviews workflow wf_e7456d3d-fde started.
- 2026-10-27 14:07 UTC: resumed after the usage hold; setup all ok (playwright too). 14:20: the design review folded in (section 12, all 16 accepted; DR-10 also takes the words "As PaidWhole recorded it" in place of "as the engine recorded it"). 14:12: build workflow wf_2dbe5cca-58e started.
- 2026-10-27 01:42 UTC: setup done; branch `co-001/ux-table-scroll` cut at e908c21 in `/home/user/ux-table-scroll`, installed. Next: the design workflow (scouts, author, one reviewer).
- 2026-10-27 02:30 UTC: the design workflow finished; design and review pushed; holding until 14:05 UTC (the orchestrator's usage hold, 94% weekly).
- 2026-10-27 01:50 UTC: design workflow wf_76fa3626-8c5 running (three scouts: inventory, mechanics, tests and consumers; one author writing `designs/lane-b-ux-table-scroll.md`; one adversarial reviewer). Notes in this session's scratchpad `design/`. If this session ends mid-run, a new session re-runs the design stage.

## Waiting on someone
- Nothing. (storage.googleapis.com was allowed at 02:00 UTC.)
