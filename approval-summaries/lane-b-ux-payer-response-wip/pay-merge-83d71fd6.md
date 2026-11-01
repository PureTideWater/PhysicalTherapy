# Merge of claude/build-platform 83d71fd6 (#81, #78) into co-001/ux-payer-response (29dded52)

## Progress
- HEAD 29dded52 confirmed; worktree clean; no earlier run.
- git fetch origin claude/build-platform: origin/claude/build-platform = 83d71fd6 (not moved).
- Files both sides touched: uploader.tsx, lib/routes/uploads.ts, docs/product/test-matrix.md, packages/synth/src/cases/matrix.ts, registry.ts.
- git merge --no-ff --no-commit origin/claude/build-platform: conflicts in uploader.tsx (3 hunks), test-matrix.md, synth matrix.ts, registry.ts; uploads.ts auto-merged.

## Resolutions
- uploader.tsx hunk 1 (header doc): both paragraphs: #78's leave-guard sentence, then this PR's in-a-form paragraph, plus one sentence on how they meet (guard asks only while the letter is sent; Retry re-arms; the form's press, held while in flight, never meets it).
- uploader.tsx hunk 2 (props): this PR's onBatchChange/single/headingLevel then #78's reportFrom/receiptsNotice.
- uploader.tsx hunk 3 (Receipts): this PR's <Heading> level with #78's DownloadLinks wrapper and reportFrom on ReceiptList.
- uploader.tsx improvement: this PR's `inFlight` now uses #78's exported `stillSending(batch)` (one definition of "still sending", same three phases) instead of a duplicate inline check.
- Interaction analysis: the form's press is held while inFlight, and ActionForm posts by fetch (no unload), so the guard never meets the press; the guard asks while the letter's PUT runs (a reload would cut it off and lose what was typed: wanted); Retry (type=button) re-arms it through send() -> 'uploading'. New browser test in response-letter.browser.test.tsx (CAS-47) proves all three; CAS-47's assertion (test-matrix.md and synth matrix.ts) gains the matching clause.
- test-matrix.md, matrix.ts, registry.ts: CAS-41 (#81) row/entry placed before CAS-45..48 (ID order); DLR rows auto-merged in their own section.
- lib/routes/uploads.ts (auto-merged): keeps this PR's uploadGate (and uploadsPage using it) and #78's cameFrom/returnPage import, REPORT_FROM import and uploadReport's returnTo. Checked by diff against 83d71fd6.

## Commands and results
- pnpm install --frozen-lockfile (flock): lockfile up to date, nothing written.
- pnpm exec tsx tools/screening-capacity/watched.ts --write: 539 lines, no change.
- pnpm synth --all (flock): 1 written (fixtures/synthetic/CAS-47/expected.json, the new clause), 653 unchanged, 0 removed; staged.
- pnpm typecheck (flock): passed, 22 projects.
- vitest --project unit on components/uploads, components/packets, download-link, download-refusal, packages/synth: 20 files, 249 tests passed.
- vitest --project unit --reporter=verbose response-letter.browser.test.tsx + uploader.test.tsx: 17 passed, none skipped (Chromium installed), including the new leave-guard test.
- eslint on uploader.tsx, uploader.test.tsx, response-letter(.browser.test).tsx, routes/uploads.ts, synth matrix.ts, registry.ts: clean.
- pnpm verify-content: every content set passes.
- prettier --check warns on these files, but it warns the same on both parents' copies and is not part of pnpm lint: pre-existing, not touched.
- Merge commit: 90ec40ababcf98a81519ff30e5208186065b88c8 (parents 29dded52, 83d71fd6). Not pushed.
