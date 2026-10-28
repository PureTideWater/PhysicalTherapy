# merge79 re-check: merge of a6e754f (#79) into /home/user/ux-forms (#74), IN PROGRESS (uncommitted)

Started 2026-10-28 UTC. HEAD 34f7427, MERGE_HEAD a6e754f, base 0dd1ba7. 101 staged paths, 0 unmerged, 0 unstaged at start.
Logs: scratchpad/merge79-logs/<step>.log (runner scratchpad/bin/m79-run.sh: one command under flock /tmp/laneb-heavy.lock).
Never commit/push/reset/stash/abort; orchestrator commits.

## Audit items (both confirmed real, both fixed, both git-added)
- A1 (ADR 0078 D5 "each row form's copy has its own request key" vs ADR 0077 D1 pin): REAL. FormKeys renders randomUUID() per render and ActionForm's heldKey is a per-instance useRef, so StackedRows' two copies would each render their own key and pin; a dropped press in one copy + a press in the other after crossing stackBelow sends a fresh key. No StackedRows caller with row forms yet (no runtime defect). Fix: one bullet under ADR 0077 "Not covered" (this PR's ADR; 0078 left as #79 merged it): both copies of a row get one key and one pin with the 34th PR. git-added.
- A2 (brand.css scroller :focus-visible outline-offset -2px covers the 2 px danger border): REAL, proved in Chromium 1248 (pixel row at the left edge of a focused aria-invalid input in a [data-scroller]: before = focus colour on both border pixels, red gone; after = 2 red px then 2 focus px). Fix: one rule after the scroller focus rule, scoped like the danger rule (input/select, not checkbox/radio; textarea uses an inset ring already): outline-offset -4px. git-added.

## Commands (status / counts)
- PostgreSQL 18 on 5433 was down (container restart; pg18.log ends 01:34 with no shutdown). Started with the setup script's own start command only (su postgres pg_ctl -D /root/pgdata18 -o '-p 5433 -k /tmp' -l /tmp/pg18.log start), NOT the whole /tmp/setup-container.sh (it fetches/fast-forwards/installs; not during an open merge). Pre-existing DB tp_e2e_uxforms (not mine, leave).
- PHASE A driver started (bin/m79-phase-a.sh, background; status merge79-logs/phase-a.status; skips steps already exit=0; if interrupted rerun it): 01 install --frozen-lockfile, 02 watched.ts --write, 03 typecheck, 04 lint, 05 lint:copy, 06 lint:logs, 07 check:fixtures, 08 synth --all, 09 test (ENGINE_FREEZE_BASE=a6e754f). Dirt (unstaged/untracked) logged after install/watched/synth/test.
- PHASE B plan (after A): 10 pnpm build; e2e shard 1/2 and 2/2 with E2E_PREBUILT unset (the stamp refuses an uncommitted tree, so the web server builds itself), --workers=2, E2E_DATABASE=tp_m79_e2e, E2E_PORT=4791; then drop DB, rm /tmp/tp-e2e-tp_m79_e2e-*.
- 01 pnpm install --frozen-lockfile: PASS "Already up to date" (2.2 s); tree unchanged.
- 02 watched.ts --write: PASS, watched-paths.txt 535 lines, unchanged (nothing to add).
- 03 pnpm typecheck: PASS 22 projects (warm incremental cache).
- 04 pnpm lint: PASS 1,639 files in 3 groups (packages 501, apps/web 607, . 531), 0 errors, 0 warnings, 158 s.
- 05 pnpm lint:copy: PASS 519 files.
- 06 pnpm lint:logs: PASS 1,064 files.
- 07 pnpm check:fixtures: PASS 333 guard files, 3,828 text files searched.
- 08 pnpm synth --all: PASS 253 cases (249 + TBL-01..04), 0 written, 645 unchanged, 0 removed; EMR 8 formats, 16 unchanged; no unstaged/untracked file.
- 09 pnpm test (ENGINE_FREEZE_BASE=a6e754f, PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers): PASS 392 files, 6,565 passed, 1 skipped (6,566), 0 failed, 412 s (one skip only, as on 34f7427: the browser tests ran). No unstaged/untracked file after.
- PHASE B driver started (bin/m79-phase-b.sh, background; status merge79-logs/phase-b.status; skips steps exit=0; if interrupted: drop tp_m79_e2e, rerun): 10 build, 11 e2e 1/2, 2/2.
- 10 pnpm build: PASS worker + web (Next.js Turbopack, compiled 43 s), 87 s; no unstaged/untracked file after.
- 11 e2e shard 1/2 (--workers=2, web server built the merge tree, E2E_PREBUILT unset): PASS 31 passed, 0 failed, 0 flaky, 0 skipped (7.0 min), 02:30:35-02:37:37.
- 11 e2e shard 2/2: PASS 31 passed, 0 failed, 0 flaky, 0 skipped (6.9 min), 02:37:37-02:44:34.
- e2e total: 62 passed, 0 failed, 0 flaky over all 28 spec files (playwright --list: 62 tests in 28 files; tables-phone.spec.ts included). No screenshot baseline updated; no unstaged/untracked file after.
- CLEANUP: tp_m79_e2e dropped 02:44:34, /tmp/tp-e2e-tp_m79_e2e-* removed, scratchpad m79-e2e-results removed, nothing on 4791, no web server or Playwright left running. Pre-existing tp_e2e_uxforms + its /tmp/tp-e2e-tp_e2e_uxforms-* left (not mine). PostgreSQL 18 left running on 5433.
- FINAL: merge uncommitted (HEAD 34f7427, MERGE_HEAD a6e754f), 102 staged paths (the 101 + ADR 0077), 0 unmerged, 0 unstaged, 0 untracked, `git diff --cached --check` clean, no model identifier in the added lines. Failures from combining the PRs: none.
## STATUS: COMPLETE
