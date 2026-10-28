# Lane B: ux-download-refusals status (co-001/ux-download-refusals)

A refused download comes back to its form, never a JSON page (the UX review's PR 5; UX-010, cluster C-004). Run by
session_01L3tN5LCq2aNYetEQBNJYZg, a Lane B item session started 2026-10-27 by Lane A's orchestrator
(session_01TrKDxeLbxVo7t7zwRXFzrg). Follow-on in this session after it merges: PR 9 `co-001/ux-home-figures`
(status `lane-b-ux-home-figures-status.md`).

## Now (2026-10-28 06:55 UTC): MERGED
- **PR #78 merged** into claude/build-platform as **83d71fd** (2026-10-28 06:51 UTC), head ab50600, by merge_pull_request with method merge and expectedHeadSha, after: every required check and every other job green on ab50600 (all green, mutation, screening-capacity gate, approval-of-record, re-run after ready and after the final description edit); the fresh-clone verification `wf_f6ddc946-253` passed on ab50600 with the base unchanged (56ed6279); the description final (25,926 characters, checked byte for byte). Unsubscribed. Main checkout fast-forwarded to 83d71fd and installed; worktree and local branch removed (the remote branch stays). The merge's push runs on 83d71fd all passed (ci 40646308313, screening-capacity 40646308310, mutation 40646308297; read 07:35 UTC).
- **Next item, in this session:** PR 9, `co-001/ux-home-figures` (status `approval-summaries/lane-b-ux-home-figures-status.md`).

## The record of this PR
- **Stage 4, reviews: done** (`wf_1c44b1a2-762`, resumed once after the 5-hour limit). Security: SEC-01 should-fix, SEC-02 and SEC-03 nits. UX and brand (74 after shots at 63aaa7f): UX-DLR-01 to 07 should-fix, 08 to 15 nits. Each verified by an independent skeptic: 16 real, UX-DLR-12 and 13 not defects. Findings and verdicts: `approval-summaries/lane-b-ux-download-refusals-review-findings.json`.
- **Stage 5, fix round: done.** Part 1 `wf_959acf20-bf4` (aa4176f, f4b0107; the full local suite passed on f4b0107, record `approval-summaries/lane-b-ux-download-refusals-fix-suite.md`), part 2 `wf_9a7d5490-4a9` (872f05b, 74ca6af; typecheck, lint, 6,477 unit, 15 e2e). Base merged (e36a68b, no conflicts, generators clean; setup re-run for #77's Chromium 1248); typecheck, lint, 6,562 unit, build and 18 e2e passed on it. One push.
- **Stage 6, verification: passed on e36a68b** (`wf_8a1a9b4b-bb5`, record `approval-summaries/lane-b-ux-download-refusals-verify.json`): tree, claims, fast checks and CI all hold. The base has since moved to 0dd1ba7e (#80) and the ruleset needs an up-to-date branch. The UX re-check on retaken shots at e36a68b (`screens-after2`, 74 shots): every earlier fix holds; new UX-DLR-16 (should-fix: no busy state on an in-place download) and UX-DLR-17 (nit: the contract's mark stays after a payer fix), both this PR's own; UX-DLR-18 (nit: a link in the permission state) needs `components/shell.tsx`, a #42 file: after #42.
- **Fix round part 3: done** (`wf_7cff40a0-7fc`): 4a5f8d8 and the merge cadcdc2; on cadcdc2 typecheck, lint, lint:copy, lint:logs, 6,636 unit, synth and watched clean, no money path, 9,222 db (six shards), build, 55 of 55 e2e (record: the fix-suite file's Part 3). Then the session's b459ba7 (focus only from a download link or the page): 493 unit, tsc, eslint, lint:copy, e2e 9 of 9.
- **Stage 6 again:** `wf_8de2d690-097` on b459ba7: tree, claims, fast checks and CI all hold (CI green on every check), but **not passed**: the base moved to a6e754fc (#79, ux-table-scroll) and the merge conflicts in 10 files (four pages, receipts.tsx, the synth and test-matrix rows, synthetic-personas.ts).
- **The merge of #79: done** (`wf_5d10d874-4af`): ten conflicts resolved keeping both sides; an adversarial check against both parents found one defect (Safari focuses #79's scroller, so an in-place refusal would not take the focus), fixed in f47437e with an e2e step; the full local suite on f47437e passed (6,679 unit, 9,222 db, 57 of 57 e2e; record: the fix-suite file's Part 4).
- **Stage 6, third time:** `wf_bb341b5c-a85` on f47437e: tree, claims, merge and fast checks hold; CI then completed green on every check (03:11 UTC). But the base moved again: **#74 (ux-forms, ADR 0077) merged** (165c5993).
- **The merge of #74: done** (`wf_6f9b6698-23e`, resumed once): ten conflicts resolved keeping both sides; UX-DLR-11 done (the letter on ADR 0077's SelectField, Field and FieldError; scroll-padding-top); the adversarial check's F1 to F4 fixed (4136bd3); its e2e found F5, every Coverage render throwing (a server call into a 'use client' module), fixed with a guard test (a0099fa); the full local suite on a0099fa passed (6,789 unit, 9,222 db, 63 of 63 e2e; fix-suite Part 5).
- **The merge of #81: done** (ab50600, no conflicts, generators clean): typecheck, lint (1,669 files), lint:copy, lint:logs, 6,797 unit, synth and watched clean, no money path, 9,283 db (129 files), build, stamp, 63 of 63 e2e. Pushed once.
- **Stage 6, fourth time, running:** `wf_f6ddc946-253`, the fresh-clone verification on ab50600 reading its CI; the description is rewritten (25,566 characters, checked byte for byte).
- **Then:** stage 7 when the verification passes and CI is green on ab50600: mark ready, wait for approval-of-record's re-run, merge with expectedHeadSha of that head; then PR 9 (`co-001/ux-home-figures`). Earlier plan for reference: stage 6, the fresh-clone verification reading CI; stage 7, merge (base merged in, CI green, ready, merge with expectedHeadSha).
- **If this container is gone:** the branch and PR hold the work; re-run the reviews from their archived script in a new session (no resume across sessions); the before shots are only in this scratchpad, so retake them at e908c21 with the same TOUR_ONLY (in `approval-summaries/lane-b-ux-download-refusals-wip/dlr-capture-before.md`).
- **Before shots:** 70 at e908c21 (wf_c067d77c-56b); the tour's refused-download caps are on claude/build-ops (a5c50b1f, then the ForgetRefusal tolerance).
- **Design:** `designs/lane-b-ux-download-refusals.md` (§6 wins); review `designs/lane-b-ux-download-refusals-review.json`.
- **Reserved and used:** ADR 0079; test-matrix DLR-01 to DLR-04; `packages/synth` module 18 (DLR).
- **Migration:** none. **#42 files:** none but the shared test-matrix, matrix.ts and registry.ts (rows added).
- **GitHub login:** `PureTideWater`. **Machine:** every setup line OK, playwright included.
- **Overlaps:** #79 (ux-table-scroll), #74 (ux-forms) and #81 merged into the base while this PR ran; each merged in keeping both sides (LANES rule 6).
- **Safety check-in:** send_later at 2026-10-28T10:25Z.

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
- 2026-10-27 22:25 UTC: fix round part 1 done, full suite passed (6,463 unit, 9,222 db, 55 e2e); part 2 started; design §7 records the fix round's changes.
- 2026-10-27 22:37 UTC: fix round part 2 done; base ecebdc90 merged (e36a68b); pushed once; PR description rewritten (checked byte for byte); verification wf_8a1a9b4b-bb5 started.
- 2026-10-27 22:47 UTC: CI green on every check on e36a68b.
- 2026-10-27 ~23:00 UTC: the 5-hour limit stopped the verification's two agents; resumed 00:16 UTC after setup (PostgreSQL was down).
- 2026-10-28 00:40 UTC: verification passed on e36a68b; UX re-check found UX-DLR-16 and 17 (this PR's) and 18 (after #42); part 3 started; the tour's refused-page check also takes a permission state (claude/build-ops).
- 2026-10-28 01:40 UTC: part 3 done (UX-DLR-16, 17; base 0dd1ba7e merged); b459ba7 (focus rule); pushed once; description rewritten; verification wf_8de2d690-097 started.
- 2026-10-28 01:48 UTC: CI green on b459ba7; the verification found the base moved (#79) with 10 conflicting files; merge workflow wf_5d10d874-4af started.
- 2026-10-28 ~02:50 UTC (the earlier entries' 03:15 and 03:20 were written ahead of the clock): the merge of #79 done and checked (646f060, f47437e); pushed once; description rewritten; verification wf_bb341b5c-a85 started.
- 2026-10-28 03:11 UTC: CI green on every check on f47437e; the base moved to 165c5993 (#74); merge workflow wf_6f9b6698-23e started.
- 2026-10-28 ~04:20 UTC: the 5-hour limit stopped the #74 merge's review agent mid-e2e; resumed 05:14 UTC after setup (PostgreSQL was down).
- 2026-10-28 05:45 UTC: the #74 merge done (a0099fa, F5 found by the e2e and fixed); the base moved again (#81, clean).
- 2026-10-28 06:27 UTC: #81 merged (ab50600); the full local suite passed; pushed once.
- 2026-10-28 06:46 UTC: the fresh-clone verification passed on ab50600 (wf_f6ddc946-253); marked ready; description's last rows filled in; approval-of-record green after each.
- 2026-10-28 06:51 UTC: **merged as 83d71fd.** Post-merge steps done; push runs queued.

## Waiting on someone
- Nothing.

## Proposals (improve as you go, outside this PR)
- One shared YYYY-MM month schema in `lib/routes/schemas.ts` (the regex is written out in monitoring.ts, report-documents.ts, pricing.ts and remittances.ts).
- `apps/web` could declare `fast-check` (a root devDependency today), so property tests there need no hand-seeded generator.
- The Reports screen's paging is not kept on a refused download from a later page (the notice shows in the right section of page 1).
- `reports/monthly/page.tsx` 404s when its GET form sends a month that is not YYYY-MM (a browser without type=month); ux-forms territory.
- The repo's PostToolUse typecheck hook runs a full apps/web tsc after every edit, outside the heavy lock.
- In e2e, the `export` rate limit's per-address bucket is shared by every spec (no trusted proxy); fine today.
- **Security, outside this PR (from the security review):** download GETs do not check `Sec-Fetch-Site`, so a cross-site top-level navigation can start a download and its export record (a packet export's download is the reviewer's evidence, ADR 0061). Its own PR: refuse a cross-site navigation to a recording download (or record only same-site ones).
- `e2e/journeys.ts` signedOffSchedule inserts a contract document ID that is not an RFC 9562 UUID, so `opaqueId` refuses it and that receipt's Report answers not_found (test data only).
- **The screening-capacity gate's advisory timing warnings** (S4 52.7 to 54.2 s against 48 s; the consumer's size, O9) are on the base as on this PR's heads: HANDOFF O9 and issue #41 carry them; nothing for this PR.
- **After #42 (UX-DLR-18):** `Forbidden` (components/shell.tsx) takes an optional link, so the packet page's and the reviewer checklist's permission states link the case and the audit report.
- An e2e for the export review's checklist opening after the second in-place download (packets.spec.ts still reloads by hand).
- An e2e for the export review's ticks surviving an in-place refusal (unit and the reviewer-checklist step cover the path).
