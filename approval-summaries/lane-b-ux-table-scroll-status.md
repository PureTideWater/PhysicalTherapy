# Status: every table scrolls by keyboard and shows that it scrolls; phones get one stacked-row layout (`co-001/ux-table-scroll`)

## Resume at 14:05 UTC (written 2026-10-27 02:10 UTC; the orchestrator's hold until the weekly reset at 14:00 UTC)
- **Branch heads:** `co-001/ux-table-scroll` pushed at e908c21 (the base, no commits yet). `claude/build-platform` e908c21.
- **Running at the hold:** the design workflow wf_76fa3626-8c5 (script `workflow-scripts/lane-b-ux-table-scroll-design-wf_76fa3626-8c5.js`). Scouts done (notes in `approval-summaries/lane-b-ux-table-scroll-wip/design/`); the author was writing `designs/lane-b-ux-table-scroll.md`; the reviewer had not started. This entry is updated when it finishes.
- **To continue in this session:** the check-in at 14:05 (trig_014JmG4RLDV8nbmCHPYPkTCM) re-runs `/tmp/setup-container.sh` (storage.googleapis.com is now allowed, so Playwright's Chromium should lay out), then resumes wf_76fa3626-8c5 with resumeFromRunId if it was stopped, else takes "Next" below.
- **From GitHub alone (container gone):** cut the worktree from `origin/co-001/ux-table-scroll`; copy the wip notes to a scratchpad `design/`, rewrite the script's `SP` constant, and re-run the design workflow (its scouts' notes let the author start at once; each agent continues from its progress file in `wip/progress/`). If `designs/lane-b-ux-table-scroll.md` exists on claude/build-ops, run only the review agent.
- **Next:** fold the design review into the design ("After the design review" section), then the build workflow.

The UX review's PR 3 (UX-011 / C-002; UX-079 / C-043 part (a)). Run as a Lane B item by a parallel session (https://claude.ai/code/session_019VghcxKzP9LAj3WK8k6u1D), started by Lane A's orchestrator (session_01TrKDxeLbxVo7t7zwRXFzrg) on 2026-10-27. Follow-on in the same session after this merges: PR 4, `co-001/ux-screening-result-tables` (status `lane-b-ux-screening-result-tables-status.md`).

- **Reserved:** ADR 0078 if the design needs one (shared with PR 4); test-matrix TBL-01 to TBL-04 (a new series); `packages/synth` cases the same if needed, synth module 17 (TBL).
- **GitHub login:** PureTideWater.
- **Machine:** setup script ok except `playwright` (chromium-1194: the proxy refuses storage.googleapis.com). Local screenshots (the UX review's before and after shots) wait on the person: storage.googleapis.com. CI's e2e is the record for tests.
- **Source:** `designs/lane-b-ux-review.md` §3 entry 3, `designs/lane-b-ux-review/synthesis/prs.json` order 3.

## Overlaps
- **#42 (`co-001/pr-06b-mail-streams`, 13f59b1):** none of prs.json's 39 files is a #42 file. The three #42 pages (users, console support, support access) stay out (UX PRs 74 to 76).
- **ux-forms (`co-001/ux-forms`, 17bbb70, another session):** shares `console/compliance/page.tsx`, `console/organizations/[organizationId]/page.tsx`, `p/[practiceId]/cases/page.tsx`, `p/[practiceId]/settings/pricing/page.tsx`, `components/reconciliation/template-mapper.tsx`. The PR merged second keeps both (rule 6).

## Log
- 2026-10-27 01:42 UTC: setup done; branch `co-001/ux-table-scroll` cut at e908c21 in `/home/user/ux-table-scroll`, installed. Next: the design workflow (scouts, author, one reviewer).
- 2026-10-27 01:50 UTC: design workflow wf_76fa3626-8c5 running (three scouts: inventory, mechanics, tests and consumers; one author writing `designs/lane-b-ux-table-scroll.md`; one adversarial reviewer). Notes in this session's scratchpad `design/`. If this session ends mid-run, a new session re-runs the design stage.

## Waiting on someone
- The person: allow storage.googleapis.com (Playwright's Chromium) for the before and after shots.
