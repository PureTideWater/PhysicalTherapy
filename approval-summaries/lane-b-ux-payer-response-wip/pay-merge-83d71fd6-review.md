# Adversarial review of merge 90ec40ab (PR #85 x claude/build-platform 83d71fd6)

Status: done. No defect found; no follow-up commit (HEAD stays 90ec40ab).

## Files checked
- Single-side files (base-only vs 83d71fd6; PR-only vs 29dded52): all identical except the two the merge meant to change (response-letter.browser.test.tsx, CAS-47/expected.json). No file outside either delta changed.
- uploader.tsx: vs 83d71fd6, adds only the PR's five changes plus the in-a-form paragraph; vs 29dded52, adds only #78's leave guard, stillSending, reportFrom/receiptsNotice, DownloadLinks, imports and header paragraph. inFlight = pending || stillSending(batch) has the same meaning. OK.
- lib/routes/uploads.ts: uploadGate (PR) + cameFrom/returnPage/REPORT_FROM/returnTo (#78). OK.
- test-matrix.md, synth matrix.ts, registry.ts: CAS-41 (#81) before CAS-45..48; DLR-01..04 intact; CAS-47 text identical in doc and matrix.ts. OK.
- response-letter.browser.test.tsx: new leave-guard test uses existing harness helpers. OK on reading.

## Generators
- watched.ts --write: 539 lines, no change. pnpm synth --all: 0 written, 654 unchanged, 0 removed (EMR 0/16). pnpm install --frozen-lockfile: nothing written. git diff --exit-code: clean. Neither side changed a manifest, the lockfile or packages/db/functions.

## Checks run
- vitest --project unit on uploads, packets (incl. browser), download-link/refusal, http/download-refusal, write-off, packages/synth, tools/brand-copy: 23 files, 447 tests passed, none skipped.
- eslint on the merged files: exit 0. pnpm typecheck: 22 projects passed (warm cache). pnpm verify-content: passes.
- No merged file is on LANES.md's "Not while #42" list; no model identifier in the merge's diff.

## Findings
- None blocking. Both sides intact in all 5 overlapping files; the new CAS-47 leave-guard test is sound and uses the existing harness (server.put hold/fail, releasePut, retries).
- Note: the test's last assertion (no question after the press) holds trivially, since the batch is sent by then. The real guarantee is that the press is held while inFlight, which the existing CAS-47 test covers.
- Note: design 3.7 says #78's leave guard protects the in-form upload too; the merged header comment and the test match this. ADR 0085 does not mention the guard, and doesn't need to (ADR 0079 owns it).
