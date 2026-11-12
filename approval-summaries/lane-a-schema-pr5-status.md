# Schema PR 5 (the ledger-freeze batch): status

## RESUME-BLOCK (W30, session_019i9ifDPVj1VzzJE78QWvC3; updated 2026-11-12 about 06:50 UTC; STOPPED at step 1)
- **Brief:** build schema PR 5 exactly as granted (Appendices A and D), measuring first; stop on a fault or a time past
  the note's limits. Base 93e137f9.
- **State: STOPPED at step 1, nothing built.** Both of the note's measurements pass its limits (figures below). No
  migration written, `/new-migration` not invoked, no test, no code, no domain-model change, no counter taken, no PR.
  The branch `co-001/wip-ledger-freeze-batch` exists only locally, at the base, with no commit: nothing to push.
- **Told the orchestrator:** the blocker at about 05:55 UTC (Appendix D's time); the preflight's figure with this
  record.
- **Not decided here (the founder's or the co-founder's):** whether a slow plan "traces to Q2's text" (the note,
  section 6: the founder's reading, not the build's); which proof the preflight runs (the note, section 5: a decision
  to record, not a tuning). Under the narrow reading (N1) nothing but A and D is granted, so no other text was tried,
  timed or written. A design session, not this build, would propose a replacement text for a new ask.
- **Next:** nothing unless the orchestrator says so. A resumed build starts again at step 2 of the brief, on a text the
  founder has granted, and re-runs `measurements/` below against it first.
- **Facts checked (do not re-derive):** on a database migrated to 93e137f9 (PostgreSQL 18.4), today's bodies hash to
  `49416713dd4d13ddf0766e35db60cc7306cebb8e06ee89ea7345beae2b5e51a3` (`roi_links_valid`) and
  `5a8bc6319828acb29a7f57aad9ebd57501734a71826a1e4d1d6953db9e85965c` (`roi_statement_rules`); the ask's Appendix A and D,
  applied as `tp_owner` and read back from `pg_proc.prosrc`, hash to
  `13c4dd46b9203095db8f26e124ed3652e5ec58bf5a46f0b28fd561b6cd1f2da4` and
  `ba8293836b9cd5aafd67dddf29d891f9f958059109c043f59f5223605ab42360`: the granted values. The texts are sound as text;
  what fails is their running time.
- **Holds:** nothing running; no WIP ref pushed; no counters. Scratch databases `pr5_*` on this session's machine only.

## Step 1's measurements (W30, 2026-11-12; SYNTHETIC rows only)

Scripts and raw output: `lane-a-wip/schema-pr5/measurements/` (`out/` holds each run's output; the plans are in the
`*_explain_*` files). PostgreSQL 18.4, the machine's defaults (`shared_buffers` 128 MB, `work_mem` 4 MB, `jit` on,
`plan_cache_mode` auto), 4 cores. Databases migrated by the runner to 93e137f9; rows loaded by a superuser with
triggers off (`session_replication_role = replica`), CHECKs on; the measured statements run as the roles that run them
in production (`tp_app` in a job's scope for the insert; `tp_owner` for the migration's steps).

### 1. Appendix D's block on the real schema: FAILS the note's bound (1 s at the month, in every state)

One insert of a five-key statement listing 30,795 priced lines on 1,200 cases of practice A (each service line also has
one superseded priced line), as `tp_app` in a job's scope, rolled back. Except in S5, 200 other practices hold
1,000,000 priced lines and case lines. "D's block" is the nested statement's own time (`auto_explain`, node timing off).

| State | Whole insert | D's block | Plan of the `found` count |
| --- | --- | --- | --- |
| S1: never analyzed, tables empty when the session first planned (7 inserts on empty tables), then the month loaded | 191.3 s | 191.0 s | nested-loop semi join |
| S1 with a forced generic plan | 193.5 s (189.0 s without `auto_explain`) | 193.3 s | the same |
| S2: never analyzed, at the month, a fresh session | 189.8 s | 189.5 s | the same |
| S2-1M: never analyzed, 1,000,000 lines in the practice (the statement still lists 30,795) | 558.1 s | 557.9 s | the same (1,361,077,410 comparisons) |
| S3: analyzed, at the month | 194.5 s | 194.2 s | the same |
| S3-stale: analyzed at the month, then grown to 1,000,000 lines, not analyzed again | 552.0 s | 551.8 s | the same |
| S3-1M: analyzed at 1,000,000 lines, inserts 1 to 5 of a session | 3.5 to 4.2 s | 3.4 s | hash semi join |
| S3-1M: the same session's insert 6 (the cached generic plan) | 579.9 s | - | (the slow plan; stopped during insert 7) |
| S5: one practice alone holds lines, analyzed, at the month | 191.7 s, 190.8 s | 191.5 s, 190.6 s | nested-loop semi join |
| S5 with a forced generic plan | 192.0 s | 191.8 s | the same |
| For comparison: a four-key statement (D's block skipped), every state | 7 to 8 ms (18 to 20 ms the first) | - | - |

- **Cause (the plans agree):** in the `found` count the planner expects 1 row from the join of `case_line` and
  `priced_line` (the tenant policy's `practice_id = ANY (...)` and the body's `practice_id = NEW.practice_id` are
  both applied to each table and their selectivities multiplied) and 100 elements from
  `jsonb_array_elements_text(NEW.links -> 'actionable_open_lines')`. So it joins them by a nested-loop semi join whose
  inner side re-reads the whole list for each line: 30,795 lines against 30,795 IDs, 474,150,615 comparisons. The time
  grows with the square of the listed lines: about 1 s at 2,200 lines, about 190 s at 30,795. The `cents` sum (a hash
  semi join) and the `linked` count are fast in every state.
- The ask's 0.2 s was measured on stand-alone tables without policies (the note, section 5); on the real schema with
  the policies the plan differs.
- A's CHECK on the same five-key statement: 141 ms. Statement 3.2 (A) applies in 46 ms, 3.4 (D) in 14 ms.
- **What it would mean in production:** the reconcile job inserts the quarterly statement daily (the BEFORE trigger
  fires before `ON CONFLICT`), so each practice with a few thousand actionable lines would hold its reconcile
  transaction for minutes every day; at A's month over 3 minutes, at 1,000,000 lines over 9.
- Not measured (the run was cut once the bound had failed in every state): a 1,000,000-line list; a practice loaded
  since the last ANALYZE; the writer's statement step.

### 2. The preflight scan at 1,000,000 stored statements: FAILS the note's limit (5 minutes)

The migration's steps 3.2 to 3.4 as the runner runs a file (`tp_owner`, one transaction, `lock_timeout` 5 s), rolled
back. 1,000,000 four-key statements of 40 IDs (table 2,135 MB) over 1,000 practices.

| Case | Time of 3.3's scan |
| --- | --- |
| 1,000,000 four-key statements, 1,000 practices in scope (scope text 37,001 characters) | **764.9 s (12 min 45 s)**, measured whole, once |
| the same, 10,000 practices in scope (370,001 characters) | about 97 minutes, extrapolated: 5,000 statements in 29.06 s (5.8 ms a statement); the whole run not made |
| 10,000 five-key statements of 30,795 line IDs (table 12 GB), 1,000 practices in scope | about 25 minutes, extrapolated: 100 statements in 15.3 s (153 ms a statement); the whole run not made |

- **Where the time goes (20,000 statements sampled, 1,000 practices):** the new `roi_links_valid` alone, no policy:
  3.93 s (197 microseconds a statement, about 4.9 an ID; 1,000,000 statements about 3.3 minutes). With the tenant
  policy as the owner role: 15.92 s (796 microseconds a statement). So three quarters of the scan is the policy's
  `practice_id = ANY (current_setting('app.practice_ids', true)::uuid[])`, evaluated as a filter on each row of the
  sequential scan, the scope's text parsed again each time: it grows with rows times practices. The database review's
  finding 2 (suspected, not measured) is confirmed. A count of the same 1,000,000 statements through the policy
  alone takes 0.77 s, because that query reads an index with the policy as its condition, evaluated once.
- **Locks at the end of the migration's transaction (`pg_locks`):** ACCESS SHARE on `roi_statement` and its three
  indexes and on `practice` and two of its indexes; the transaction's own ID locks; nothing stronger on any table. As
  the note's section 5 says, the scan blocks nobody; it holds back vacuum's horizon for as long as it runs.
- At launch the table is empty, so the real first run is milliseconds (the note, section 5); the figure is for the
  record and for a database restored and migrated again.
- The second whole run was lost to this session's own sampling beside it (it held the function's catalog row past the
  5 s `lock_timeout`); the samples above ran for under a minute beside the measured run.

### What stops, by the brief and the note
- Section 6 of the note: T14's bound is 1 s at the month in every state; past it "the build stops and tells the
  orchestrator". Measured: 190 s and more in seven of eight states, and in the eighth from a session's sixth insert.
- Section 5 of the note: past 5 minutes at 1,000,000 statements "the build stops and tells the orchestrator; it does
  not swap in the cheaper `links = '{}'` test on its own". Measured: 12 min 45 s.
- The brief: a fault in a granted text is never repaired by the build, and only A and D are granted.

## RESUME-BLOCK (W29, session_019i9ifE4gRYJeq78K4egWh3; 2026-11-12, after the reviews and the fix round; W29's brief is done)
- **Done:** the plan's "Revision 2026-11-12" (build-ops f742dcfc); the note `designs/lane-a-ledger-freeze-batch.md`;
  the second ask, a draft, `approval-summaries/lane-a-ledger-freeze-ask-2-2026-11-12.md`; two reviews of the note
  (`reviews/lane-a-ledger-freeze-batch-money.md`, `reviews/lane-a-ledger-freeze-batch-database.md`), one fix round.
- **Facts W29 checked on the base:** the writer is `apps/worker/src/reconcile/statements.ts` (`generateRoiStatement`,
  `OPEN_CASES_ACTIONABLE`); the figure's predicate is `apps/worker/src/triage/actionable-now.ts`; `case_line_once` is
  UNIQUE (service_line_id); a migration reads a forced-RLS table by `set_config('app.practice_ids', <all practices>,
  true)` and sets it back to `'{}'` (20261109090000_line_status_heads.sql:127-132).
