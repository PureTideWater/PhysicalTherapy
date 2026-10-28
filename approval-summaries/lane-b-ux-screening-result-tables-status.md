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

## Overlaps (checked 2026-10-28 01:45 UTC)
- **#42** (`co-001/pr-06b-mail-streams` at 6f23c42, 212 files):
  - `apps/web/src/components/screening/result.test.tsx` is now a #42 file, so this PR's unit tests go in a new file.
  - `apps/web/src/lib/screening/labels.ts` is under LANES.md's "Not while #42 is open" (`lib/screening/*`), so it is not edited; a label change goes elsewhere or is recorded "after #42".
  - `apps/web/e2e/screening.ts` is #42's: the new `screening-phone.spec.ts` calls it unchanged, and the PR merged second updates it.
  - `anomalies.tsx`, `coverage.tsx` and `result-summary.tsx` are not #42's.
- **ux-forms** (`co-001/ux-forms`): none of the planned files.

## Log
- 2026-10-28 01:45 UTC: branch cut at a6e754f in `/home/user/ux-screening-result-tables`, installed. Next: the design workflow (scouts, author, one reviewer).

## Waiting on someone
- Nothing.
