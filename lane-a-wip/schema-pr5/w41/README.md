# W41, 2026-11-12: the stored-statement preflight (schema PR 5, step 3.3), measured
SYNTHETIC rows only. PostgreSQL 18.4, the machine's defaults, scratch cluster on port 5433; `pr5w41_base` is a database
migrated by `pnpm db:migrate` at f7b777d3 (bodies `49416713dd4d13dd`, `5a8bc6319828acb2`).
- `preflight.sql`: the design's reference block (not a migration). `run_preflight.sql`: steps 3.2 and 3.3 as the
  runner runs a file, rolled back. `load.sql`, `plans.sql`, `options.sql`, `fail.sql`, `writer.sql`, `A.sql` (W35's copy).
- `jobA.sh`, `jobB.sh`: the runs, in order; `out/jobA.log`, `out/jobB.log` hold the clock. `out/m1_writer_lock1b*`:
  run by hand afterwards (writer at 185 s, open 20 s, beside the block with the lock).
- `plans.sql` printed "unterminated quoted string" twice for an `\echo` label (an apostrophe, since removed); every
  EXPLAIN ran.
