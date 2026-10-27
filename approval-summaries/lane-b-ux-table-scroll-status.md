# Status: every table scrolls by keyboard and shows that it scrolls; phones get one stacked-row layout (`co-001/ux-table-scroll`)

## Current state (2026-10-27 19:45 UTC)
- **PR #79** (draft): https://github.com/PureTideWater/PhysicalTherapy/pull/79. Pushed head **35b14cd**. Every required check was green on it, after the screening flake's one re-run. This session is subscribed to the PR.
- **Reviews:** done (wf_e7456d3d-fde, resumed after the limit). Both say "merge after fixes", with nothing blocking. Findings are in `approval-summaries/lane-b-ux-table-scroll-review-findings.json`:
  - correctness and accessibility: F1 to F4 should fix, N1 to N4 nits;
  - UX and brand: UX-PR79-01 to -03 should fix; -04 to -06 nits; -07 should fix but pre-existing (taken here).
  - Shots: before at e908c21 (49 tour + 21 extra), after at 35b14cd (49 + 25). The pre-change pages ran 422 to 938 px wide at 390; after, all are 390 px.
- **Running:** the fix round wf_90ac8f1b-a42 (from ~19:42 UTC):
  1. merge the base (#76, 085299b);
  2. two fixers on disjoint files: every finding, plus landmark-unique in atPhoneWidth, two new guard rules and an ADR 0078 note;
  3. the fast checks and commits;
  4. the full local suite once;
  5. after shots re-taken where the fixes show.
  - Not pushed yet: one push at the end. Safety check-in 00:51 UTC (trig_01J56Fapi1UMXVELtz8pWWPz).
- **If stopped:** in this session, resume wf_90ac8f1b-a42 with resumeFromRunId. From GitHub alone: the branch is at 35b14cd (the fix round's local commits would be lost); re-run the fix round from the findings file.
- **Next:** one push; the fresh-clone verification reading CI; the base merged again if it moved; mark ready; merge.

The UX review's PR 3 (UX-011 / C-002; UX-079 / C-043 part (a)). Run as a Lane B item by a parallel session (https://claude.ai/code/session_019VghcxKzP9LAj3WK8k6u1D), started by Lane A's orchestrator (session_01TrKDxeLbxVo7t7zwRXFzrg) on 2026-10-27. Follow-on in the same session after this merges: PR 4, `co-001/ux-screening-result-tables` (status `lane-b-ux-screening-result-tables-status.md`).

- **Reserved:** ADR 0078 if the design needs one (shared with PR 4); test-matrix TBL-01 to TBL-04 (a new series); `packages/synth` cases the same if needed, synth module 17 (TBL).
- **GitHub login:** PureTideWater.
- **Machine:** setup script ok except `playwright` (chromium-1194: the proxy refuses storage.googleapis.com). Allowed at 02:00 UTC; ok from 14:07 UTC.
- **Source:** `designs/lane-b-ux-review.md` §3 entry 3, `designs/lane-b-ux-review/synthesis/prs.json` order 3.

## Overlaps
- **#42 (`co-001/pr-06b-mail-streams`, 13f59b1):** none of prs.json's 39 files is a #42 file. The three #42 pages (users, console support, support access) stay out (UX PRs 74 to 76).
- **ux-forms (`co-001/ux-forms`, 17bbb70, another session):** shares `console/compliance/page.tsx`, `console/organizations/[organizationId]/page.tsx`, `p/[practiceId]/cases/page.tsx`, `p/[practiceId]/settings/pricing/page.tsx`, `components/reconciliation/template-mapper.tsx`. The PR merged second keeps both (rule 6).

## Log
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
