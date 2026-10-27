# PR 42 (6b-4) prepare: merge #76 + M3 follow-up (progress)
- Start 2026-10-27: /home/user/pr6b4 clean at 6f23c42b (pushed head), branch co-001/pr-06b-mail-streams. No earlier run.
## Steps
- [x] 1. merge origin/claude/build-platform (085299b, #76): clean, 6 test files, no overlap with the PR. pnpm install --frozen-lockfile: lockfile unchanged (sha checked); watched.ts --write: 537 lines, no change. #76's 6 test files on merged tree: 189 pass. MERGE COMMITTED afd7ff22 (parents 6f23c42b, 085299bd)
- [ ] 2. M3 follow-up (probe_missed from last proof; marker route; failing-first db test; runbook+ADR 0065; infra wiring)
- [ ] 3. regenerate domain model on fresh PG18
- [ ] 4. checks
- [ ] 5. commits
- [ ] 6. ops designs amended (pr6b-email-streams.md, pr6b-plan.md D2), not committed
- 2. design: probe_missed = open AND confirmed AND least(delivered-or-fallback, bounced-or-fallback) <= now()-26h; a proof counts only since resumed_at, else falls back to probe_sent_at (null -> not missed). probe_due unchanged. Job logs missed on EVERY run (not only when due) -> alarm stays ALARM until proof back.
- 2. failing-first tests written: mail-events.db.test.ts new it (review M3) + mail.db.test.ts rows (sent-and-lost, not-sent, mixed, resume, unconfirmed). Ran on unfixed tree (scratch dbs from tp_pr6b4v_test_1): BOTH FAIL as expected (scratchpad/pr42v/failing-first.log)
- NEXT: marker route edit of operator_mail_streams in the migration; job change in mail-events.ts; infra desc/comments + infra test; runbook; ADR 0065
- 2. DONE in tree (uncommitted): migration operator_mail_streams via marker route (marker touched, Edit, removed; verified absent); mail-events.ts logs missed before the due check; streams.ts + operations.ts comments; infra mail.ts MAIL_PROBE_HOURS {24,26,48} + comments; monitoring.ts MISSED description (hours, 3.7); infra test 'pages a stream with no probe back in 26 hours ... (review M3)'. After fix: mail-events.db + mail.db 40/40 pass (fixed-1.log); infra mail-streams+monitoring+worker streams 126/126 (infra-1.log)
- 3. regenerated (pre-commit) on tp_pr6b4v_dm_1 (PG 18.4, 45 migrations): 98 tables, 1 view, 47 registered, 226 divergence rows (23 to approve), 0 explanation problems; functions 375 files, 1 written (operator_mail_streams), 0 removed. SHA 8ea57066… (approval line 7333). Regenerate after commit for provenance.
- NEXT: runbook + ADR 0065 docs; then commits (db, domain model, worker, infra, docs)
