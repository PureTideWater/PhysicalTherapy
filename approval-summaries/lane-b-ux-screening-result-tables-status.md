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

## Current state (2026-10-28 03:05 UTC)
- **Branch:** `co-001/ux-screening-result-tables` pushed at a6e754f (no commits yet). #42 is still an open draft (6f23c42), so the scope is the design's: everything that keeps every pin of #42's `result.test.tsx`, plus a follow-on, UX PR 4b, the day #42 merges.
- **Design:** done and reviewed. `designs/lane-b-ux-screening-result-tables.md`: its section 12 folds in all 10 findings of `designs/lane-b-ux-screening-result-tables-review.json` (build with changes, no migration; one blocking, P4-DR-01, the stream lock taken inline). ADR 0078 gets a dated amendment.
- **Closes here:**
  - UX-005 (the stacked rows at 390; the anomalies table fits at 1280);
  - UX-043 ("Claim lines");
  - UX-042 in part: the sign key;
  - UX-132 in part: the code is gone from the cell, and "PaidWhole", not "the engine";
  - UX-040 on the phone (the rows copy in the unpriced tone);
  - UX-154's top-rows sentence (for UX PR 85's entry).
- **Waits for #42** (UX PR 4b, `co-001/ux-screening-result-words`, design section 11):
  - UX-040 in the table copy;
  - UX-206, the count sentence;
  - the "$5 a claim line" wording;
  - UX-042's header names and UX-132's reason words (both in `labels.ts`).
- **Running:** the build wf_9184e225-f39 (from ~03:05 UTC): A (StackedRows) first, then B (the result tables and words) and C (the browser proof) in parallel, then D (documents, synth, `watched-paths.txt` by its generator), then a checker. Safety check-in 06:49 UTC (trig_012Z6LWe5FpAY22BmWsUz8K4).
- **If stopped:** in this session, resume wf_9184e225-f39. From GitHub alone: re-run the build from the design. The scouts' notes and progress files are in `lane-b-ux-screening-result-tables-wip/`.
- **Next:** push; the draft PR (template); the before and after shots (design 7.1 and P4-DR-09); two reviews (UX and brand; the correctness of the two copies and of the result's words, 7.2); the fix round with the full suite; the verification; the merge.

## Overlaps (checked 2026-10-28 01:45 UTC)
- **#42** (`co-001/pr-06b-mail-streams` at 6f23c42, 212 files):
  - `apps/web/src/components/screening/result.test.tsx` is now a #42 file, so this PR's unit tests go in a new file.
  - `apps/web/src/lib/screening/labels.ts` is under LANES.md's "Not while #42 is open" (`lib/screening/*`), so it is not edited; a label change goes elsewhere or is recorded "after #42".
  - `apps/web/e2e/screening.ts` is #42's: the new `screening-phone.spec.ts` calls it unchanged, and the PR merged second updates it.
  - `anomalies.tsx`, `coverage.tsx` and `result-summary.tsx` are not #42's.
- **ux-forms** (`co-001/ux-forms`): none of the planned files.

## Log
- 2026-10-28 ~01:50-03:00 UTC: the design workflow wf_9855cdd7-e28 (three scouts, author, reviewer). 03:00: the review folded in (section 12). 03:05: build started.
- 2026-10-28 01:45 UTC: branch cut at a6e754f in `/home/user/ux-screening-result-tables`, installed. Next: the design workflow (scouts, author, one reviewer).

## Waiting on someone
- **Lane A**, before UX PR 4b starts: confirm Q1 (design 12.1). The recommended option is taken: `screening-labels/2026-11-05` is released at the first deploy from main, so 4b re-pins its hash under the same name with no migration. If Lane A objects, the labels part goes to Lane A's next schema PR on the screening.
