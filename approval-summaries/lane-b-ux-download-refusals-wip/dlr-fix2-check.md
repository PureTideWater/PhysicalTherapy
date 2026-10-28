# dlr-fix2-check: adversarial re-read of 872f05b3 (on f4b01073) and the full local suite

Started 2026-10-27. Worktree /home/user/ux-download-refusals, head 872f05b3.

## Review (git diff f4b01073..872f05b3, 19 files)
- download-link.tsx `below`: notice before or after children at fixed slots, so children never remount when the notice
  changes; nested case honours below; focus by ref unchanged. OK.
- reviewer checklist: header wrapped in DownloadLinks below, PDF ?from=review and /review/csv hrefs unchanged, no
  download attribute (303 fallback kept). Notice lands after the header, where the arrived notice was. OK.
- packet page export history: CardContent flex-col gap-4; RefusalNotice renders null with no notice (no empty gap
  child); hrefs keep ${shownVersion}; the only DownloadRefusal on the page. OK.
- console evidence export: DownloadLinks + DownloadLink surface=console; downloadHandler sends attachment, so fetch saves
  it. OK.
- nine Forbidden branches: fragment sibling ForgetRefusal, only when downloadRefusal() reads a refusal; Coverage
  also={LETTER_CONTROLS} (letter.tsx has no 'use client', so the constant is a real array in a server page);
  Reports also={RETURN_ONLY}; monthly none (month is the page's key). OK.
- words: no new user-facing text; e2e asserts the product's rate_limited words; the 429 stand-in body matches
  outcomeResponse's shape (same as download-refusals.spec's Uploads step). OK.
- #42 files: only packages/synth/src/cases/registry.ts (DLR-04 row, allowed). components/shell.tsx untouched. No model id.
- GAP FOUND: the new source test read `<DownloadRefusal forget={X}>` only in the page's own source, so Coverage's
  also={LETTER_CONTROLS} (its notice is in components/coverage/letter.tsx) was not held: dropping it passed.
  FIX: download-refusal.test.ts noticeSources() also reads the components a page imports (../components/*.tsx).
  13 passed; mutation (Coverage's also dropped) fails it with 'the notice forgets LETTER_CONTROLS'; restored.

## Checks (scratchpad/dlrf2c/*.log, results.txt; each under flock /tmp/laneb-heavy.lock)
- db shards: none. No route.ts or lib/routes file changed; no *.db.test.ts imports a changed page or component
  (grep over the 127 db test files); oracle.db.test.ts uses @tp/synth scale rows, not the DLR-04 entry.
- e2e plan: no E2E_PREBUILT (build-stamp refuses a dirty tree, and the commit comes after the pass), so playwright
  builds the working tree itself after the root pnpm build. DB tp_e2e_pr78b, port 3179, dropped after (dlrf2c/e2e.sh).
- suite started (bg, dlrf2c/suite.sh): typecheck, lint, lint:copy, lint:logs, test, synth --all + diff, watched + diff
- typecheck: exit 0 (30 s)
- lint: exit 0, 1,629 files in 3 groups, 0 errors, 0 warnings (113 s)
- lint:copy: exit 0, 530 files; lint:logs: exit 0, 1,064 files
- typecheck detail: 22 projects; apps/web rechecked (check 8.38 s)
- pnpm test: exit 0, 383 files, 6,477 passed, 4 skipped (258 s), coverage thresholds met
- pnpm synth --all: 240 cases, 0 written, 632 unchanged, 0 removed; EMR 8 formats, 16 unchanged; git diff --exit-code
  fixtures packages/synth: exit 0
- watched.ts --write: 532 lines; git diff --exit-code tools/screening-capacity: exit 0
- tree after: only apps/web/src/lib/http/download-refusal.test.ts modified (the fix)
- e2e started (bg, dlrf2c/e2e.sh): pnpm build, then the six specs, then drop tp_e2e_pr78b
- pnpm build: exit 0 (18 s, web + worker); tree after: only the test fix modified
- e2e (playwright built the working tree itself; E2E_ADMIN_URL 5433, tp_e2e_pr78b, port 3179, --workers=2):
  download-refusals 1, onboarding 5, monitoring 1, packets 2, reports 3, uploads 3 = 15 passed (5.0 min), exit 0
- dropped tp_e2e_pr78b (DROP DATABASE), /tmp/tp-e2e-tp_e2e_pr78b-* removed (0 left), nothing listening on 3179
- NEXT: commit, then Part 2 in the ops summary
- committed 74ca6afc… (74ca6afc) on co-001/ux-download-refusals: the test fix only (1 file,
  +8 -2). Not pushed. Tree clean.
- appended "Part 2" with its table to /home/user/ops/approval-summaries/lane-b-ux-download-refusals-fix-suite.md (not committed)
- DONE.
