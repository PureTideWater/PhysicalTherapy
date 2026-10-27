# Status: every table scrolls by keyboard and shows that it scrolls; phones get one stacked-row layout (`co-001/ux-table-scroll`)

## Current state (2026-10-27 14:30 UTC)
- **Branch heads:** `co-001/ux-table-scroll` pushed at e908c21 (no commits pushed yet; the build commits locally in `/home/user/ux-table-scroll`). `claude/build-platform` e908c21.
- **Design:** done and reviewed. `designs/lane-b-ux-table-scroll.md`, its section 12 folds in all 16 findings of `designs/lane-b-ux-table-scroll-review.json` (build with changes; no migration). ADR 0078 is needed (in the build).
- **Running:** the build workflow wf_2dbe5cca-58e (from ~14:12): slice A (components, tests first), then B1, B2, C, D (the sites) in parallel, a commit agent, then E (e2e) and F (guard, ADR, matrix, synth) in parallel, then an integrator and checker. Each agent keeps `progress/build-*.md` in the session scratchpad. Safety check-in 19:35 UTC (trig_013PmsSm5p87anHEnBkPDx7n).
- **Machine:** setup re-run 14:07 UTC, every line ok, `playwright` included (chromium-1194 laid out from Chrome for Testing).
- **If the build is stopped:** in this session, resume wf_2dbe5cca-58e with resumeFromRunId. From GitHub alone: the local commits are lost if they were not pushed; re-run the build from the design.
- **Next:** push the branch, open the draft PR (template), the before and after shots (e908c21 and the head; design section 8.1), then the two adversarial reviews (UX and brand; correctness and accessibility of the component and its rollout, design 8.2).

The UX review's PR 3 (UX-011 / C-002; UX-079 / C-043 part (a)). Run as a Lane B item by a parallel session (https://claude.ai/code/session_019VghcxKzP9LAj3WK8k6u1D), started by Lane A's orchestrator (session_01TrKDxeLbxVo7t7zwRXFzrg) on 2026-10-27. Follow-on in the same session after this merges: PR 4, `co-001/ux-screening-result-tables` (status `lane-b-ux-screening-result-tables-status.md`).

- **Reserved:** ADR 0078 if the design needs one (shared with PR 4); test-matrix TBL-01 to TBL-04 (a new series); `packages/synth` cases the same if needed, synth module 17 (TBL).
- **GitHub login:** PureTideWater.
- **Machine:** setup script ok except `playwright` (chromium-1194: the proxy refuses storage.googleapis.com). Allowed at 02:00 UTC; ok from 14:07 UTC.
- **Source:** `designs/lane-b-ux-review.md` §3 entry 3, `designs/lane-b-ux-review/synthesis/prs.json` order 3.

## Overlaps
- **#42 (`co-001/pr-06b-mail-streams`, 13f59b1):** none of prs.json's 39 files is a #42 file. The three #42 pages (users, console support, support access) stay out (UX PRs 74 to 76).
- **ux-forms (`co-001/ux-forms`, 17bbb70, another session):** shares `console/compliance/page.tsx`, `console/organizations/[organizationId]/page.tsx`, `p/[practiceId]/cases/page.tsx`, `p/[practiceId]/settings/pricing/page.tsx`, `components/reconciliation/template-mapper.tsx`. The PR merged second keeps both (rule 6).

## Log
- 2026-10-27 14:07 UTC: resumed after the usage hold; setup all ok (playwright too). 14:20: the design review folded in (section 12, all 16 accepted; DR-10 also takes the words "As PaidWhole recorded it" in place of "as the engine recorded it"). 14:12: build workflow wf_2dbe5cca-58e started.
- 2026-10-27 01:42 UTC: setup done; branch `co-001/ux-table-scroll` cut at e908c21 in `/home/user/ux-table-scroll`, installed. Next: the design workflow (scouts, author, one reviewer).
- 2026-10-27 02:30 UTC: the design workflow finished; design and review pushed; holding until 14:05 UTC (the orchestrator's usage hold, 94% weekly).
- 2026-10-27 01:50 UTC: design workflow wf_76fa3626-8c5 running (three scouts: inventory, mechanics, tests and consumers; one author writing `designs/lane-b-ux-table-scroll.md`; one adversarial reviewer). Notes in this session's scratchpad `design/`. If this session ends mid-run, a new session re-runs the design stage.

## Waiting on someone
- Nothing. (storage.googleapis.com was allowed at 02:00 UTC.)
