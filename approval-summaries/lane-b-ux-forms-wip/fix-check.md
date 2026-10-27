# Fix round part 1: integration check (PR #74, co-001/ux-forms @ 4f0b526 + uncommitted fixes)
Started 2026-10-27. Worktree /home/user/ux-forms. Logs: scratchpad/check-logs/

## 1. status / diff
- 44 modified + 1 untracked (split-form.browser.test.tsx). Every file is on F1, F2, F3 or records' list (forms-keep-input.spec.ts: original e2e fix + F2 + records; forms-harness + action-form.browser.test: F1 + records; terms/page: F2 + records).
- #42-list hits: docs/product/test-matrix.md, packages/synth/src/cases/matrix.ts, registry.ts: all three already in the PR's diff (e908c21..4f0b526), shared docs (LANES rule 6, as build-2b-check). OK.

## 2. checks (each under flock /tmp/laneb-heavy.lock)
- typecheck: PASS, 22 of 22 projects (log check-logs/typecheck.log)
- lint: PASS, 1,624 files in 3 groups, 0 errors, 0 warnings
- lint:copy: PASS, 517 files
- lint:logs: PASS, 1059 files
- unit (vitest --project unit apps/web packages/ui packages/synth; browser tests in Chromium 1194): PASS, 87 of 87 files (web 72, ui 2, synth 13), 1061 of 1061 tests, none skipped, 51.9 s
- unit extra (tools/screening-capacity, tools/brand-copy, tools/fixture-check): PASS, 10 files, 247 tests
- check:fixtures: PASS, 333 files guarded, 3798 searched
- db (PG18 on 5433, scratch databases): PASS, 3 of 3 files, 1203 of 1203 tests (onboarding-routes 18, route-tests.5 598, route-tests.10 587; support.create_ticket 32, console.publish_terms 32), 71 s. No other *.db.test.ts holds a changed string (grep: old duplicate text, "opaque ID", document reference words).
- e2e setup: scratchpad/bin/e2e-check.sh <run> <args>; E2E_DATABASE=tp_e2e_uxcheck, E2E_PORT=4781 (mine; drop + rm /tmp/tp-e2e-tp_e2e_uxcheck-* at end). tp_e2e_uxforms + its /tmp dirs pre-existed (other runs'), left alone.
- gitleaks 8.24.3 (repo .gitleaks.toml + .gitleaksignore) on all 45 changed files: 0 findings
- e2e run c1 (7 specs of record + hardware-key, reports, layout-1280, mapping: pages/CSS this round changed), --workers=2, server built from the dirty tree (.next/BUILD_ID 19:31:57Z): PASS, 30 of 30 in 5.9 min (forms-keep-input 6, packets 2, sign-in 6, onboarding 5, contracts 1, triage 1, pricing 1, hardware-key 3, reports 3, layout-1280 1, mapping 1); no flaky, none skipped. Log check-logs/c1.log
- CLEANUP done: tp_e2e_uxcheck dropped (5433), /tmp/tp-e2e-tp_e2e_uxcheck-* removed, port 4781 free, no tp_test_* left. Note: apps/web/.next is now this dirty-tree build (unstamped); E2E_PREBUILT needs a fresh build + stamp after the commit.

## 3. failures
- None. Nothing to fix; nothing to prove on e908c21.
- Worktree unchanged by this check (45 entries before and after; no file edited).

## STATUS: COMPLETE
