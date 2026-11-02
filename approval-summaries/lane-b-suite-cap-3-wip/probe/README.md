# SUITE-CAP-3 reconcile profile probe

Profiles one reconcile pass (`reconcilePractice`, apps/worker/src/reconcile/pass.ts, as the reconcile job calls it) at
real size on SYNTHETIC rows only, to find the pass's growth terms. The same scripts run against any checkout: `TP_REPO`
names it (the base clone at 83d71fd6, or a candidate fix's worktree). Every repository module is imported by absolute
path from `TP_REPO` (`common.mts`, `repo()`), so nothing is copied into a checkout and no tracked file changes. Nothing
logs a row: results hold IDs, counts, times and heap figures; the timeline's fingerprints are of SQL text (code).

Method (rebuilt from SUITE-CAP-1a's probe record, whose scripts were lost): a client proxy over the job scope's
`scope.client.query` times each statement (family, fingerprint, rows, duration, heapUsed at the statement); the time in
TypeScript between statements is the gap between one statement's answer and the next one's send, by phase; the heap is
sampled every 50 ms and at each statement, and measured live (after two `gc()`) before and after the pass; an
advisory-lock monitor reads `pg_locks` every 200 ms on its own superuser connection; `PracticeCipher.prototype`'s
`decrypt`, `encrypt` and `lookupHash` are counted by column and phase. The pass runs in a child process under
`node --max-old-space-size=560 --expose-gc`.

## Files
- `cluster.sh up|down|status <dir> [port]`: the private PostgreSQL 18 cluster (port 5494; shared_buffers 128MB as the
  shared 5433 cluster; max_locks_per_transaction 4096, since the base takes about five advisory locks per line in one
  pass and fails 53200 on a default cluster at this size). Its data directory must be outside /tmp/claude-0.
- `seed.mts <N> <R|A>`: a database migrated from empty (`createMigratedDatabase`), SYNTHETIC release 900001, one
  practice (ledger settings: proof level posted, materiality 10.00), the original 835s loaded by the parse_835 job, a
  fixed-schedule contract signed off (97110, 97112, 97140, 97530, 97116 at 50.00 a unit), one run priced and triaged (all
  N lines actionable, 30.00 short each), then step 7b's reprocessing 835s (each claim's reversal and correction paying
  every line its expected 100.00; checks of 20 original claims, 100 checks a file) loaded by the parse job; the posting
  export (one line-level row per case line, step 7b's) written to `$OUT/<seed>/posting-export.csv`; ANALYZE; the
  database renamed `cap3_<r|a>_<N>_seed` (the template of every measured copy) and `meta.json` written beside the export.
  Practice keys are under the local development master key, so the pass (another process) opens the cipher.
- `pass.mts <db url> <meta.json> <out prefix> [export.csv]`: the measured pass (the export staged first as intake
  leaves a clean one, not timed, and the pass is that export's reconcile; without an export, the plain reconcile).
  Writes `<out>.json` and `<out>.timeline.ndjson`.
- `probe.sh seed|copy|pass|shape|drop`: one step per call; `copy <seed> <state> <shape>` makes
  `<seed minus _seed>_<state>_<shape>` from the template and applies the schema state by hand as `tp_owner` in one
  transaction: (a) nothing; (b) `state-b.sql`, section 4 of SUITE-CAP-1b's 20261109090000 (claim_by_superseded, 1b's
  D15); (c) `state-c.sql`, its sections 3 to 6 (line_status_head and its backfill, claim_by_superseded,
  line_status_rules() on the head row, the ledger triggers on the practice's `ledger:` lock), taken verbatim from
  `1b-20261109090000.sql` (358dc53f). Sections 1 (preflight) and 2 (the NOWAIT table locks) are deploy mechanics.
- `prep.sh pre|from|P`: shape P's approvals pass once per N (in state b), then a copy per state converted from (b)
  (`state-c-from-b.sql` is sections 3, 5 and 6), then the measured postings pass. The approvals write the same rows in
  every state (the triggers only check).
- `statsx.sh <seed> <state> <stats db>`: the statistics control. A fresh step-7b copy (`<..>_<state>_7bs`) whose
  ledger and stage tables (ledger_entry, ledger_match, line_status, line_status_head) carry the planner statistics of
  `<stats db>` (the same seed after its own 7b pass, analyzed), restored with PostgreSQL 18's
  `pg_restore_relation_stats` / `pg_restore_attribute_stats` (the generated calls are kept as `$OUT/<db>.stats.sql`),
  then the 7b pass. A seeded database's ledger is empty, so the trigger functions' cached plans are made for an empty
  ledger; a running deployment's ledger is not. The control separates that from real growth.
- `fillx.sh <seed> <state> [rows]`: the shared-ledger control. A fresh step-7b copy (`<..>_<state>_7bf`) whose
  ledger_entry already holds ROWS (default 100,000) SYNTHETIC rows of a tenant that is no practice (written as superuser
  with session_replication_role = replica, then ANALYZE), as a running multi-tenant deployment's ledger would; RLS keeps
  them out of the pass. Separates the trigger plans cached on an empty ledger from real growth.
- `runq.sh <queue file>`: a detached queue (setsid nohup) of probe/prep/statsx steps, each under the heavy lock,
  skipping a step whose result json exists; resumable after a restart.
- `matrix.sh "<probe step>" ...`: steps one after another, each under `flock /tmp/laneb-heavy.lock`.
- `analyze.py <results>`: the overview, per-family tables, the fits (growth exponent k of each family's time, count
  and time per call between N points; share of the pass), each family fitted to a*N + b*N^2 and projected to 10,000 and
  20,000 lines, and the states (a), (b), (c) side by side at each N.
- `explain.sql`: the plans of claimLines, both candidate queries and the stage select for one case line, as tp_app in
  the practice's scope (`psql -d <db> -v practice=<id> -f explain.sql`).

## Shapes and denominators
- Lines per claim 4 (as price.large); each claim has 4 of the 5 codes, one date of service (a visit), units 2.
- Claims per patient (patient control number) 12, one claim a date.
- Spread R (realistic): 20 short claims a date, consecutive dates from 2026-01-01, so each (code, date) holds 16
  original claims (and in the reprocessing 16 corrections): the by-patient candidate query decrypts about 16 claims a
  line whatever N. Spread A (adverse): all N lines on 20 dates (2026-06-01 on), so each (code, date) holds N/100 claims
  and the by-patient query's decrypts grow with N per line.
- Cases: one per code (pattern), so a case holds N/5 lines (a payer underpaying a code across the period).
- (P) postings only: `pre` (the plain reconcile: approvals from the reprocessing) then `P`, the export's reconcile, in
  which every case line is matched by one line-level row and posted (the measured pass).
- (7b) step 7b: the export's reconcile with the reprocessing not yet reconciled: approvals and postings in one pass.

## Commands

```sh
export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH
S=/tmp/claude-0/-home-user-PhysicalTherapy/6c15628c-0d1e-52dc-840b-36ff1c157316/scratchpad
R=$S/cap3-probe
$R/cluster.sh up /tmp/laneb-suitecap3-pg-1
export TP_REPO=<checkout> OUT=$S/cap3-results-<name>      # ADMIN_URL defaults to the private cluster (5494)
$R/matrix.sh "seed 2000 R" "seed 6000 R"
$R/matrix.sh "shape cap3_r_2000_seed c 7b" "shape cap3_r_2000_seed c P"          # 7b; P with a per-state pre
flock /tmp/laneb-heavy.lock $R/prep.sh pre cap3_r_6000_seed                     # P's approvals once (state b)
flock /tmp/laneb-heavy.lock $R/prep.sh P cap3_r_6000_seed c                     # P's measured pass in state c
python3 -I $R/analyze.py $OUT > $OUT/profile.md
$R/cluster.sh down /tmp/laneb-suitecap3-pg-1
```

To compare a candidate fix, seed with the base (the seed's writes do not depend on the reconcile code) and run the
passes with `TP_REPO` set to the candidate; compare the pass's totals and `after` counts (`posted_cents`, stage counts),
not hashes (IDs differ between seeds).
