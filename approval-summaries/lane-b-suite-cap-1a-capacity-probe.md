# SUITE-CAP-1a probe (before and after)

Reproduces, through the job code, the defects SUITE-CAP-1a fixes (design `suite-cap-1-triage-locks.md` 1.4, 8.3, 15),
on SYNTHETIC rows only. The same scripts run against any checkout: `TP_REPO` names it (the base clone at 085299bd, or the
head worktree `/home/user/suite-cap-1-bounded-reads`). Every repository module is imported by absolute path from
`TP_REPO`, so nothing is copied into the checkout. Nothing logs a row: results hold IDs, counts, times and heap figures.

Files:
- `common.mts`: statement labels, the timed scope (a proxy over `scope.client.query`; no code under test changes), heap
  sampling (every 50 ms and at each statement), live heap (`heapUsed` after two `gc()`), the advisory-lock monitor
  (`pg_locks`, every 200 ms, on the superuser's own connection).
- `seed.mts`: migrate a database from empty, load SYNTHETIC release 900001 (the large tests' release; the weekly
  harness's release 900110, `tools/release/scale.ts --shape quarterly`, about an hour to load, is not needed for this
  shape), then practice B (20,000 lines) priced, triaged and `ANALYZE`d, then practice A (100,000 lines) priced and
  `ANALYZE`d. Shape of `price.large.db.test.ts` (claims of four lines; half Medicare Advantage non-contracted, half under
  a SYNTHETIC 110% contract, 365-day window cited and verified; claim numbers sealed with the practice key), except the
  paid amounts, set so two thirds of the lines are short as in design 8.3 (66,666 validated, 33,334 actionable).
- `triage.mts`: A's triage (`executeTriage`) in a child under the heap flag.
- `report.mts`: A's audit report (`generateAuditReport`) in a child under the heap flag, printing with Chromium.
- `probe.sh`: one step per call. `cluster.sh`: the private cluster.

## Commands

```sh
export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH
S=/tmp/claude-0/-home-user-PhysicalTherapy/b8fe4f4f-26ab-5bdd-9556-0e8c28ea8bc8/scratchpad
R=$S/repro

# Probe B (today's per-line trigger lock fails 53200): default cluster, A only.
export TP_REPO=<repo> ADMIN_URL=postgres://postgres:test@localhost:5433/postgres OUT=$S/results/<name>-5433 LINES_B=0
flock /tmp/laneb-heavy.lock $R/probe.sh seed
flock /tmp/laneb-heavy.lock $R/probe.sh triage
flock /tmp/laneb-heavy.lock $R/probe.sh report
$R/probe.sh drop

# The 1a defects: private cluster (port 5493, max_locks_per_transaction 1024, shared_buffers 128MB as 5433; its data directory outside /tmp/claude-0, see cluster.sh).
$R/cluster.sh up /tmp/laneb-suitecap1a-pg-repro
export TP_REPO=<repo> ADMIN_URL=postgres://postgres:test@localhost:5493/postgres OUT=$S/results/<name>-5493; unset LINES_B
flock /tmp/laneb-heavy.lock $R/probe.sh seed                     # B priced+triaged+analysed, A priced
flock /tmp/laneb-heavy.lock $R/probe.sh triage                   # a) HEAP=560
flock /tmp/laneb-heavy.lock $R/probe.sh report                   # b) HEAP=560 (base: heap out of memory)
HEAP=0 flock /tmp/laneb-heavy.lock $R/probe.sh report -noflag    # c) no heap flag, to reach the patient-balance step
$R/probe.sh drop
$R/cluster.sh down /tmp/laneb-suitecap1a-pg-repro
```

Results land in `$OUT`: `<step>.json` (the figures), `<step>.timeline.ndjson` (each statement's start, duration, rows,
heap), `<step>.log` / `.stderr`, and on a heap abort `<step>-fatal/report.*.json` (Node's diagnostic report with the
JavaScript stack). The report's `print.htmlSha256` and `outcome.csvSha256` are recorded for comparing two runs on the
same database; across separately seeded databases the IDs differ, so compare figures, not hashes.

The report step's triage is the report job's own `triageInScope` (a re-triage of A after the triage step committed).

## Before (base 085299bd, 2026-10-27; results in `$S/results/base-5433-probeB` and `$S/results/base-5493`)

| Step | Result |
| --- | --- |
| B, 5433, triage (560) | 53200 "out of shared memory" at 52.7 s, in the validated `advanceStages` (11.0 s into it); 14,407 advisory locks sampled |
| B, 5433, report (560) | 53200 at 47.3 s, in its own triage's validated write; 14,533 locks sampled |
| a) 5493 triage (560), run 2 | 248.0 s; actionable `advanceStages` 200.9 s (33,334 rows); candidates 35.7 s; validated 7.0 s; case lines 3.2 s; heap sampled peak 536.6 MiB; live with the candidate rows held 415.6 MiB; live after judging 75.0 MiB; 66,667 advisory locks (run 1: 260.4 s, actionable 207.9 s, peak 509.2 MiB, live after judging 74.8 MiB) |
| b) 5493 report (560) | JavaScript heap out of memory at about 62 s (twice), in `gatherReport` during `lineDeadlines` (content.ts:529) with `runLines`' 100,000 rows held: live heap 511.7 MiB at that point; Node's report has no JavaScript stack (the abort is in a collection) |
| c) 5493 report (no flag) | ready, 842.5 s; patient-balance step 766.0 s, of which `claimLines` 718.7 s (two calls of 50,000 rows: the missing `claim_by_superseded` index, SUITE-CAP-1b) and about 47 s the grouping 1a fixes; heap sampled peak 761.8 MiB; live with lines held 515.8 MiB; live at print 135.4 MiB; print 0.4 s |

The Check phase on 1a's head should expect `claimLines` to stay at about 720 s without the index (1b), so compare the
patient-balance step less `claimLines`, and the report's completion under 560 rather than its total time.

## After (head of co-001/suite-cap-1-bounded-reads with the Check phase's claim-order fix, 2026-10-28; results in `$S/results/head-5493`)

| Step | Result |
| --- | --- |
| a) triage (560) | 52.2 s; actionable `advanceStages` 4.1 s; candidates 37.1 s; validated 6.5 s; case lines 3.2 s; sampled peak 134.0 MiB; live with a batch held 84.7 MiB; live after judging 76.2 MiB; 66,667 advisory locks (1b) |
| b) report (560) | ready, 726.3 s; patient balance 653.6 s (claimLines 650.4 s, 34 calls, 100,072 rows; 3.2 s besides); sampled peak 157.4 MiB; live with lines held 59.7 MiB; at print 40.2 MiB |
| c) report (no flag) | ready, 721.1 s; patient balance 647.5 s (claimLines 644.2 s; 3.3 s besides); sampled peak 295.5 MiB; live 63.4 MiB; at print 40.1 MiB |

The probe's own `patientBalance` and `gather` fields read null on the head (its labels predate the cursors): `../phases.py <timeline>` computes them.
