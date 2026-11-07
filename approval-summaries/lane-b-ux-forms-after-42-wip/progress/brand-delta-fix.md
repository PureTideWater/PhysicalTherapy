# brand-delta-fix (BD-1)
- Start: HEAD bceda579 = origin/co-001/wip-ux-forms-after-42, clean. PG18 on 5433 was down; started with `su postgres -c "/opt/pg18/bin/pg_ctl -D /root/pgdata18 -o '-p 5433 -k /tmp' -l /tmp/pg18.log start"`.
- BD-1 (should): routes.ts:294 every-row too_few_claim_lines had two semicolons.
  - old: `...because a row of fewer can describe one patient’s care; choose a file with rows of at least ${floor} claim lines`
  - new: `...because a row of fewer can describe one patient’s care, so choose a file with rows of at least ${floor} claim lines`
- Tests first: routes.db.test.ts:280 pin changed; red 1 failed / 55 passed (logs/bd1-red.log), then code.
- Green under /tmp/laneb-heavy.lock (scratchpad ufa42/logs/bd1-*.log): routes.db.test.ts 56/56 (5433); lib/routes/messages.test.ts 49/49; typecheck 23 projects; lint 1,873 files 0/0; lint:copy 596 files.
- No apps/web/src/lib/screening/messages.test.ts exists; messages.ts (browser twin), per-row branch, ADR 0062 untouched. e2e grep for the old literal: no hits.
- Design /home/user/ops/designs/lane-b-ux-forms-after-42.md:560 string row updated.
- Commit 109654d691caaac7585c003b75d65a5865d344f2 pushed fast-forward to co-001/wip-ux-forms-after-42 (bceda579..109654d6). PR branch not pushed.
