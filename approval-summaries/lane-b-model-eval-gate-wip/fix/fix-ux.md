# fix-ux progress (PART ux, PR #75 fix round)
Started 2026-10-27 ~20:05 UTC (resumed run; no earlier progress file existed; none of my files were modified in the worktree at start).

## Decisions (made 20:20)
- UX-1: hold files in browser while waiting for kind OR an ERA export's system (one mechanism; closes UX-049 too: same harm,
  same code, PR touched its cause). Inline error under the select (id upload-kind-error / upload-format-error, role=alert,
  keyed by attempt so a repeat is announced), aria-invalid + aria-describedby (error first, then help, as field.tsx), focus
  to the select on each attempt. Explicit "Upload N files" + "Clear" (never start on select change: arrow keys fire change).
  Dedupe re-drops by name+size+lastModified. A new choice while files are held joins them and waits for the button.
  Additions with per-file problems refused (alert), held unchanged. Server refusal puts the files back into held.
  Focus: Upload -> "This batch" card (tabIndex -1); Clear -> Choose files button; server refusal -> Upload button.
  era-exports.spec.ts:100-104 must change (request to integrator).
- UX-5: resolved by UX-1 (message derived from state); a kind/system change while files are held clears stale problems.
- UX-4: help line under kind select "A document’s kind cannot be changed once it is uploaded." tied by aria-describedby.
- UX-2: names_patient new words (misfiled letter/EOB step first, then contract/exhibit hand entry).
- UX-3: split screen_failed into its own notice (retry), screen_unavailable keeps hand entry; both say "the practice’s patient records".
  models-routes.db.test.ts:631/:635 need ?model=screen_failed (request). Also add screen_limited (gateway part's request 4) with my words.
- N-1: map screen_invalid -> screen_unavailable (its words are true: not checked; hand entry), not the generic refused.
- N-2: one sentence on the propose card. N-3: contracts region aria-labelledby its CardTitle; e2e locator updated.

## Done
- UX-1/UX-5/UX-4 code in uploader.tsx (held files, KindField, HeldFiles, afterChoosing, waitingFor, waitingText, heldWith,
  KIND_HELP; batchProblems lost its unused format param and the two waiting messages; CHOOSE_KIND_FIRST removed).
  uploader.test.tsx rewritten: before 15 failed | 9 passed (fix-ux-uploader-before.log), after 24/24 (fix-ux-uploader-after.log).

## Files changed
(none yet)

## Tests and results
(none yet)

 - Browser proof (Chromium 1.56, real Uploader bundled by esbuild; harness scratchpad/phi/fix-ux-harness: build.cjs, drive.cjs,
   drive-before.cjs; results after.json, before.json). Before (head bundle): files dropped, select no aria-invalid/describedby,
   focus BODY, repeat drop inserts nothing (silent), stale alert after kind chosen. After: held + listed, aria-invalid,
   describedby "upload-kind-error upload-kind-help", focus select, repeat re-inserts the alert, 3 ArrowDowns change kind
   with 0 requests, Upload sends 2 files as contract and focuses "This batch", 403 keeps files + focus Upload, Clear ->
   focus Choose files, Uploads 835 starts at once, ERA without system holds + focuses system select, Upload sends formatId.

- UX-2, UX-3 (+screen_limited), N-1 in notices.ts / path.ts; path.test.ts rewritten: before 3 failed (fix-ux-path-before.log),
  after 3/3 (with uploader: 27/27, fix-ux-path-after.log).
- N-2 propose card sentence (abstraction version page.tsx:111-114); N-3 contracts region aria-labelledby its CardTitle (page.tsx:192-194).
- e2e contracts.spec.ts step rewritten (held, focused, described, re-announced, Clear, Upload sends 1 request, batch focused).
- tsc -p apps/web clean; eslint on all my files clean (a React Compiler bailout fixed by computing `waiting` after the
  callbacks); pnpm lint:copy clean (514 files).
- e2e contracts.spec.ts PASSED 20:36 (1 passed, 2.5 min with the build; E2E_DATABASE=tp_e2e_ux, port 3197; log fix-ux-e2e-contracts.log).
- requests.md "## ux" written (era-exports.spec.ts, models-routes.db.test.ts screen_failed, screen_limited half done +
  contract-proposals.ts comments, optional gateway wording, named region names).

- docs file written (fix/ux-docs.md); part file written (fix/ux.md); harness rerun after the last edit (after.json) and
  styled shots (held-*.png, no sideways scroll at 390); wide unit run 275/275; models-routes db: only the expected
  screen_failed case fails (request 2).

## Left
Nothing in my files. For the integrator: requests.md "## ux" items 1-4; ux-docs.md. DONE 20:46 UTC.
