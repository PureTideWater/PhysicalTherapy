# p4 build C (apps/web/e2e/a11y.ts lists option + apps/web/e2e/screening-phone.spec.ts), progress

- [x] read design (whole, incl. section 12), review json, scouts' tests.md; a11y.ts, screening.ts, screening.spec.ts,
      #42's mail.ts lock (760065) and streamTest shape, stacked-rows.tsx, scroll-table.tsx, status.tsx, db functions
- e2e plan: tree is dirty (B and me), so build-stamp refuses; build once under the lock, then run with
  scratchpad/p4c/pw.config.mts = repo config minus its build step (build-e's pattern), PG18 on 5433,
  E2E_DATABASE=tp_e2e_p4c E2E_PORT=3184 --workers=2
- [x] a11y.ts lists option (PhoneWidthOptions.lists; valuesOutOfView: no visible list / no item / dd says nothing, not rendered, past an edge by >0.5 px / chip cut by >1 px)
- [x] screening-phone.spec.ts written (stream fixture pg_advisory_lock_shared(760065) auto 240 s, consumer depends on it; steps: upload at 390, outbox poll 90 s, run complete poll 30 s, DB lists WITH ORDINALITY; 390 first load; no-script 390; 820; 1280 (top rows overflow + cue); 994 fits)
- [x] tsc: no error in my files (11 in B's result-tables.test.tsx, tests-first); eslint clean on both (p4c/eslint1.log)
- [x] B components done 03:26 (B line 17: tsc clean)
- [x] build 1 (p4c/build1.log) rc0 69 s, ~03:28 (B at line 17)
- [x] e2e run 1: screening-phone.spec.ts alone (p4c/run1.log): PASSED first time, test 8.8 s, run 40.4 s (1 worker), build of ~03:28
- [x] run 2 (p4c/run2.log, build ~03:28, --workers=2): 5 passed in 1.6 m: screening-phone 8.7 s; screening.spec.ts :147 26.7 s and :692 1.3 s (no flake); tables-phone :171 54.8 s, :293 16.0 s
  widths (min-content via temp log): anomalies 806 px in 894 (1280) and 864 (994); coverage 556; top rows 1195 in 894/864 (scrolls)
- [x] TEMP lines removed (grep TEMPORARY = 0)
- [x] negative control of the lists check (p4c/neg, page.setContent, outside the worktree): good passes; missing list,
      empty list, value that says nothing, value past the window (clipped, so sideways check passes), cut chip: each reported
- [x] after TEMP removal: apps/web tsc rc0; eslint clean on both files (p4c/eslint2.log); pnpm lint:copy 517 files pass
- [x] run 3 (p4c/run3.log), final file: screening-phone 1 passed, test 7.7 s, run 36.6 s
- [x] run 4 (p4c/run4.log): --repeat-each=3 --workers=1: 3 passed (7.5, 7.3, 7.4 s), 53.7 s
- last e2e result: PASS (run 3, run 4), on the build of 03:27 which holds B's final components (last edit 03:25:32)
- e2e db tp_e2e_p4c dropped. apps/web/.next holds an unstamped build of the dirty tree (no BUILD_COMMIT).
STATUS: slice C DONE, not committed.
