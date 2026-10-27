# Lane B: ux-download-refusals status (co-001/ux-download-refusals)

A refused download comes back to its form, never a JSON page (the UX review's PR 5; UX-010, cluster C-004). Run by
session_01L3tN5LCq2aNYetEQBNJYZg, a Lane B item session started 2026-10-27 by Lane A's orchestrator
(session_01TrKDxeLbxVo7t7zwRXFzrg). Follow-on in this session after it merges: PR 9 `co-001/ux-home-figures`
(status `lane-b-ux-home-figures-status.md`).

## Now (2026-10-27 19:50 UTC)
- **PR #78** (draft) into claude/build-platform: https://github.com/PureTideWater/PhysicalTherapy/pull/78. Head **53c7224** (the regenerated screening watched list; CI on 63aaa7f was green but `unit`, its watched-list test) after 63aaa7f (c1eff40 the code and tests, 63aaa7f ADR 0079, test-matrix DLR-01 to DLR-04 and synth module 18). Description from the template, written with update_pull_request and checked byte for byte. Subscribed to its activity.
- **Stage 4, reviews: done** (`wf_1c44b1a2-762`, resumed once after the 5-hour limit). Security: SEC-01 should-fix, SEC-02 and SEC-03 nits. UX and brand (74 after shots at 63aaa7f): UX-DLR-01 to 07 should-fix, 08 to 15 nits. Each verified by an independent skeptic: 16 real, UX-DLR-12 and 13 not defects. Findings and verdicts: `approval-summaries/lane-b-ux-download-refusals-review-findings.json`.
- **Stage 5, fix round, running:** `wf_959acf20-bf4` (script archived): core, then the letter, the in-place downloads and the packet page, and the docs in parallel, then the re-read and the full local suite once and a local commit; the session then pushes once. CI was green on every check on 53c7224 (19:32 UTC).
- **Next:** push the fix round; stage 6, the fresh-clone verification reading CI; stage 7, merge (base merged in, CI green, ready, merge with expectedHeadSha).
- **If this container is gone:** the branch and PR hold the work; re-run the reviews from their archived script in a new session (no resume across sessions); the before shots are only in this scratchpad, so retake them at e908c21 with the same TOUR_ONLY (in `approval-summaries/lane-b-ux-download-refusals-wip/dlr-capture-before.md`).
- **Before shots:** 70 at e908c21 (wf_c067d77c-56b); the tour's refused-download caps are on claude/build-ops (a5c50b1f, then the ForgetRefusal tolerance).
- **Design:** `designs/lane-b-ux-download-refusals.md` (§6 wins); review `designs/lane-b-ux-download-refusals-review.json`.
- **Reserved and used:** ADR 0079; test-matrix DLR-01 to DLR-04; `packages/synth` module 18 (DLR).
- **Migration:** none. **#42 files:** none but the shared test-matrix, matrix.ts and registry.ts (rows added).
- **GitHub login:** `PureTideWater`. **Machine:** every setup line OK, playwright included.
- **Overlaps:** ux-forms PR #74 (open; compliance page, reports pages, compliance route, synth lines) and ux-table-scroll (in build): LANES rule 6.
- **Safety check-in:** send_later at 2026-10-28T00:20Z.

## Log
- 2026-10-27 01:45 UTC: machine set up; brief, LANES.md, lanes/lane-b.md read; branch cut; #42 file check done.
- 2026-10-27 01:55 UTC: design written; next, its adversarial review (workflow).
- 2026-10-27 02:10 UTC: review done (`designs/lane-b-ux-download-refusals-review.json`); dispositions written (design §6). Holding until 14:05 UTC (usage).
- 2026-10-27 14:20 UTC: resumed on the orchestrator's message (the 14:05 check-in did not fire); setup OK, playwright included.
- 2026-10-27 14:30 UTC: build workflow `wf_64b87764-990` and before-shots workflow `wf_c067d77c-56b` started.

- 2026-10-27 16:00 UTC: build done (wf_64b87764-990, six agents; typecheck, lint, 1,166 unit tests, copy and log lints, synth, 21 e2e tests all passed). The session added ForgetRefusal and reworded the notices that said "Reload the page" (R16), re-ran tsc, eslint, 433 unit tests, lint:copy and the e2e (4 of 4).
- 2026-10-27 16:10 UTC: committed c1eff40 and 63aaa7f, pushed; draft PR #78 opened and subscribed; reviews workflow wf_1c44b1a2-762 started.
- 2026-10-27 16:27 UTC: CI on 63aaa7f: every check green but `unit` (the screening-capacity watched list, a generated file, missed the two new lib/http modules); regenerated with watched.ts --write (53c7224), pushed at 19:09 after `capacity` passed.
- 2026-10-27 17:11 UTC: the account's 5-hour limit stopped the session; resumed 19:08 UTC on the orchestrator's message; setup re-run (PostgreSQL was down), OK.
- 2026-10-27 19:32 UTC: CI green on every required check on 53c7224.
- 2026-10-27 19:45 UTC: reviews done and verified; fix round wf_959acf20-bf4 started.

## Waiting on someone
- Nothing.

## Proposals (improve as you go, outside this PR)
- One shared YYYY-MM month schema in `lib/routes/schemas.ts` (the regex is written out in monitoring.ts, report-documents.ts, pricing.ts and remittances.ts).
- `apps/web` could declare `fast-check` (a root devDependency today), so property tests there need no hand-seeded generator.
- The Reports screen's paging is not kept on a refused download from a later page (the notice shows in the right section of page 1).
- `reports/monthly/page.tsx` 404s when its GET form sends a month that is not YYYY-MM (a browser without type=month); ux-forms territory.
- The repo's PostToolUse typecheck hook runs a full apps/web tsc after every edit, outside the heavy lock.
- In e2e, the `export` rate limit's per-address bucket is shared by every spec (no trusted proxy); fine today.
