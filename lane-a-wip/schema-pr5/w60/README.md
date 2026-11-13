# W60, 2026-11-13 00:00 to 00:10 UTC: schema PR 5, the writer's one-pass form (the note's 4.1), measured
SYNTHETIC rows only. PostgreSQL 18.4, the machine's defaults, port 5433, 4 cores, pages cached. WIP ref
`co-001/wip-schema-pr5` at `5d060ada`. W59's scratch databases did not survive the machine; the month was built again
by W59's method and scripts (`w60-world.db.test.ts`, run once from `apps/worker/src/reconcile/` and removed, not in the
repository; `clone_month.sql` unchanged): `w60_wm`, practice A with 30,795 lines in 1,200 open cases, every line's
`priced_line_pricing_check` = `current`, 200 other practices' 1,000,000 lines present (`out/clone_month.txt`).

## 1. The three texts (`gen-writer-sql.mts`, `sql/`), printed from the repository's own constants
- before PR 5: `FOUR_KEY_OPEN_CASES` (the figure alone); equal to W59's `q_before.sql` but for whitespace.
- the plain path, as built by step 2 (`7b05fd87`): the tests' `PLAIN_PATH_OPEN_CASES`; equal to W59's `q_after.sql`
  but for whitespace.
- one-pass, as built now: `OPEN_CASES_ACTIONABLE` at `5d060ada`.

## 2. The writer's query at A's month, as tp_app in A's scope, five runs each, median ms (min to max)
`job.sh`, W59's `gen_writer_sess.sh` and `summ.sh` unchanged; `out/wm_never.txt`, `out/wm_analyzed.txt`, `out/summary.txt`.

| | never analyzed | analyzed |
| --- | --- | --- |
| before PR 5 | 3,989 (3,414 to 4,025) | 3,639 (3,305 to 3,860) |
| the plain path (step 2) | 7,654 (7,431 to 7,856) | 6,994 (6,829 to 8,568) |
| **one-pass (built)** | **3,818 (3,460 to 3,846)** | **3,373 (3,263 to 3,804)** |
| one-pass against before, medians | **-0.17 s** | **-0.27 s** |
| the plain path against before, medians | +3.67 s | +3.36 s |
| the INSERT, five keys (the trigger's block) | 530 (509 to 638) | 599 (564 to 643) |
| the INSERT, four keys | 7 | 8 |
| the daily repeat | 547 (522 to 571) | 506 (473 to 539) |

- **The note's bound (the query's added cost within 1 s at A's month) is met:** the one-pass form is level with the
  query before PR 5 in both planner states (its slowest run, 3,846 and 3,804 ms, is below before's slowest).
- The reconcile's statement step on the medians: before (query + four-key INSERT) 4.00 s never analyzed and 3.65 s
  analyzed; one-pass (query + five-key INSERT) 4.35 s and 3.97 s: **+0.35 s and +0.33 s**, the trigger's block less
  the query's gain, within T14's "no slower than today by more than 1 s".
- The machine was a little slower than W59's (before: 3,246 to 3,666 there); every row here is from one session.

## 3. Identical output
- On A's month (`out/wm_equal.sql`, `out/wm_equal_analyzed.txt`; as tp_app in A's scope, one statement, both texts):
  1,200 cases, 30,795 lines, 92,385,000 cents on both paths; rows (order, case, figure, list) in one and not the
  other: 0 and 0. Run in the analyzed state (the never-analyzed comparison was lost to a harness fault: tp_app may
  not create temporary tables; a result cannot differ by planner state, but it is said here).
- In the suite (`statement-lines.db.test.ts`): at every check of T5 and T11 (the CAS worlds with HOM-01's CAS-08, the
  two CAS-03 worlds, written-off, stale, unpriced, null, zero and negative variances; LED-06 through payer approved,
  recovered and the recoupment) both texts in one transaction answer the same rows, and the stored list is the plain
  path's.
- On a generated month (`statement-paths.db.test.ts`): 10,000 lines in the suite; **31,000 lines once**
  (`STATEMENT_PATHS_LINES=31000`, `out/paths_31000.txt`: 2 of 2): the same rows, each figure equal to
  `ACTIONABLE_NOW('c')` run as its own query, and the stored statement equal to the four-key writer's in every column
  with the plain path's list.
- "The golden fixtures": `fixtures/golden` holds pricing lines only (no remittance a case or statement can be built
  from; `pnpm test:golden` prices them and does not touch the writer). The statement fixtures the comparison ran on
  are the synthetic CAS and LED ones above. Said to the orchestrator as a reading, not hidden.
