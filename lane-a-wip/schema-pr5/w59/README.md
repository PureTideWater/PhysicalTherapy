# W59, 2026-11-12 23:05 to 23:50 UTC: schema PR 5, build step 4 (the measurements)
SYNTHETIC rows only. PostgreSQL 18.4, the machine's defaults, port 5433, 4 cores, pages cached. WIP ref
`co-001/wip-schema-pr5` at `7b05fd87` (the migration file's SHA-256 in `out/migration_sha256.txt`; the domain model's
appendix prints the same). Every database below is a scratch one on this machine only.

## 1. Both bodies on a freshly migrated database (`out/hashes_fresh.txt`, `out/compare_granted.txt`)
- `pnpm db:migrate` on an empty database (`w59_fresh`, 53 migrations): `roi_links_valid` `13c4dd46b9203095`,
  `roi_statement_rules` `ad925199131cb411`, stored with `search_path` then `plan_cache_mode=force_custom_plan`.
- The two generated function files against the asks' appendices, `CREATE OR REPLACE` to `$function$;`
  (`compare_granted.sh`): Appendix A equal byte for byte; Appendix D2 equal but for the one header line
  ` SET plan_cache_mode TO 'force_custom_plan'` after the `SET search_path` line.

## 2. The preflight on the REAL migration file, 1,000,000 four-key statements of 40 IDs in 1,000 practices (2,135 MB)
`job1.sh`, `run_real.sql`, `fail_real.sql`, W41's `load.sql` and `writer.sql`; `w59_base` is migrated through
`20261114090000` by the real runner (`migrate-base.mts`). Each run is the whole file as the runner runs it (tp_owner,
one transaction, lock_timeout 5 s), rolled back, but the last.

| Run | Whole file | The migration's own notice | File |
| --- | --- | --- | --- |
| statistics never gathered | **196.1 s** | scan 193.4 s, lock wait 0, closing 2.77 s | `out/m1_never_real.txt` |
| VACUUM ANALYZE first | **187.7 s** | scan 187.5 s, lock wait 0, closing 0.16 s | `out/m1_analyzed_real.txt` |
| a writer's transaction open 20 s across the closing (from 185 s) | **206.1 s** | scan 189.7 s, **lock wait 16.0 s**, closing 0.33 s; 1,000,001 checked, 1 practice read again | `out/m1_writer20_real.txt` |
| a writer's transaction open 120 s (from 150 s): the lock cannot be had | **refused at 219.7 s** | `roi_statement stayed in use for 30 seconds at the preflight's closing count; run the deploy again`; both bodies after: today's (`49416713dd4d13dd`, `5a8bc6319828acb2`) | `out/m1_writer120_real.txt` |
| three `{}` statements in two practices | **refused at 189.8 s** | `3 of 1000003 stored ROI statements, in 2 of 1000 practices, fail the new roi_links_valid; nothing is changed` (counts only); both bodies after: today's | `out/m1_fail_real.txt` |
| the REAL runner (`migrate()`), committed | **184.1 s** | both bodies the granted ones, header line stored, 53 migrations | `out/m1_runner_commit2.txt` |
| empty table | 4 ms for section 3 | scan 2 ms, closing 1 ms | `out/base_empty_real.txt` |

- **The limit (5 minutes) is met with pages cached:** 184 to 206 s; the 30-second refusal lands at 220 s. Cold storage
  was not measured (the recorded residual stands).
- Locks at the end of a passing run (`pg_locks`): ACCESS SHARE on `roi_statement`, its three indexes, `practice` and
  two of its indexes, and one SHARE lock on `roi_statement`. The scope after the block is `{}`.
- `out/m1_runner_commit.txt` is job1's first try through the runner: the migration ran, then the runner's ownership
  check refused the harness's own scratch table (`m_p`, owned by postgres) and rolled back. Not a finding about the
  migration; the table was dropped and the run repeated.

## 3. T14: D2's block (the real `roi_statement_rules`) on the real schema (`job2.sh`, `gen_sess.sh`, `out/t14/`)
tp_app in practice A's scope, tenant policies on, 200 other practices with 1,000,000 priced lines and case lines
present, the quarterly INSERT of a five-key statement listing A's month (30,795 lines in 1,200 cases), rolled back.
Median ms (min to max):

| State | A's month | The daily repeat (ON CONFLICT DO NOTHING) | Four keys |
| --- | --- | --- | --- |
| S1: never analyzed, tables empty when the session first ran the trigger, month loaded under it | 514 (503 to 723) | 452 (382 to 459) | - |
| S2: never analyzed, at A's month | 503 (473 to 544) | 431 (427 to 514) | 7 |
| S2 with 1,000,000 priced lines in the practice | 705 (694 to 846) | 635 (571 to 730) | 6 |
| S3: analyzed, at A's month | 428 (397 to 747) | 417 (377 to 509) | 5 |
| S3 grown to 1,000,000 lines, statistics stale | 680 (646 to 807) | 652 (634 to 712) | 7 |
| S3 analyzed at 1,000,000 lines | 646 (578 to 813) | 602 (544 to 674) | 10 |

- **T14's bound (D's block at A's month at most 1 s in every state) holds:** the slowest single run is 846 ms.
- One plan in every state (`*_explain.txt`): `priced_line_pkey` and `case_line_once`, one index scan each per listed
  line (loops=30795).
- Beyond T14: a statement listing all 1,000,000 lines of the practice takes 28 to 29 s (linear in the lines listed).

## 4. The writer's cost at practice A's month (note 4.1): OVER the 1 s bound, stopped for a ruling
The real schema with every row the predicate reads: the seed is SYNTHETIC CAS-08 as the suite builds it
(`w59-world.db.test.ts`, run once from `apps/worker/src/reconcile/` and removed; not in the repository), copied by
`clone_month.sql` to 30,795 lines in 1,200 open cases, each line `priced_line_pricing_check` = `current` (checked for
all 30,795), with 200 other practices' 1,000,000 lines present. The query texts are printed from the repository's own
constants (`gen-writer-sql.mts`, `sql/`): before = `9887dd77`'s `OPEN_CASES_ACTIONABLE` (the figure alone), after =
`7b05fd87`'s (the figure and the list), one-pass = the note's alternative, NOT built. tp_app in A's scope, five runs
each, median ms (min to max) (`gen_writer_sess.sh`, `summ.sh`, `out/writer/`):

| | never analyzed | analyzed |
| --- | --- | --- |
| before | 3,666 (3,594 to 3,784) | 3,246 (3,203 to 3,546) |
| **after (built)** | **6,899 (6,441 to 7,623)** | **6,105 (5,866 to 6,563)** |
| growth | **+3.23 s** | **+2.86 s** |
| the note's one-pass form (not built) | 3,681 (3,450 to 3,818) | 3,293 (3,071 to 3,675) |
| the INSERT, five keys (the trigger's block) | 528 (448 to 575) | 543 (506 to 593) |
| the INSERT, four keys | 6 | 8 |
| the daily repeat | 475 (407 to 510) | 514 (498 to 523) |

- The reconcile's statement step (query + INSERT) at A's month: today 3.3 to 3.7 s; as built 6.6 to 7.4 s (+3.4 to
  +3.8 s, past T14's "no slower than today by more than 1 s"); with the one-pass form about 3.8 to 4.2 s (+0.55 s).
- The stored five-key links object for the month is 1,279,906 bytes (four keys: 48,079).
- W59 did not change the writer.
