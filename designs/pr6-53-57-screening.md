# PR 6 design: the screening's 60-second promise at production size (#53, parts 1 and 2) and the funnel's schema (#57)

Design contract for `co-001/pr-06-free-screening` (worktree `/home/user/pr6`, head `3c1b289`). Written 2026-10-20 from the
combined audit (items 53 and 57, adopted in full by the founder on 2026-10-20), `/home/user/ops/HANDOFF.md` (sections of
2026-10-18 and 2026-10-20), ADR 0062, the migration `20261104090000_free_screening.sql`, the worker's screening job and
adapter, the engine's release reads and error handling (`packages/pricing/src/engine.ts`), `infra/lib/environments.ts`,
`.github/workflows/*` and `tools/test/workflows.test.ts` on `claude/build-platform` (262d37d), and the audit request
(`prospect_request`, migrations `20261030090000` and `20261030110000`; `apps/web/src/lib/routes/onboarding.ts`,
`console-onboarding.ts`). Revised the same day after an independent review (§10).

All new schema goes into the unmerged migration `20261104090000_free_screening.sql`. No file under
`packages/pricing/src`, `fixtures/golden`, `content/releases` or `fixtures/synthetic/rules/release-synth-90000{1..4}`
changes. Synthetic data only, everywhere.

---

## 1. Decisions in one page

**#53 part 2, the release read (built in PR 6).**
- The screening stops copying the whole release per ZIP. The small record types (those no row's key selects) are
  cached **once per release and manifest**. The types a line looks up by its own key (`pfs_rvu`, `ncci_mue`,
  `mppr_rate`, `ncci_ptp`, `locality_map`) are read **per run, by the keys the run's rows can ask for**. The database
  returns the key set it used (the run's codes and ZIP) beside the records.
- The engine reads the release through a keyed view that refuses any lookup outside that key set. The engine turns a
  throw into a row-level `ENGINE_ERROR`, so the view also records a **sticky violation**. The pricer checks it after
  every engine call and the job fails the run as `RELEASE_READ_OUTSIDE_FETCH` before that batch is recorded. No row
  is ever stored on a lookup the run did not make (audit #31's rule).
- The pricer's memo keeps a compact record per distinct line (figures and hashes) instead of the engine's traces.
- An oracle proves the output equal: HEAD's `adapter.ts` and read path, frozen whole at `3c1b289` in test support,
  against the new path. It runs on an edge-case fixture in every CI run and on 50,000-row uploads in the capacity job.

**#53 part 1, the capacity test (built in PR 6).**
- A workflow builds the **production images** and runs them as Docker containers under **cgroup limits equal to the
  production task sizes**, read from `infra/lib/environments.ts`: web and platform 0.25 vCPU and 512 MiB with no
  swap; the database at most db.t4g.medium (2 vCPU, 4 GiB), with gp3's I/O baseline and a network delay.
- Inputs: a production-shaped synthetic release, and two upload shapes: a **practice shape** (HEAD's 50,000-row test
  file, 12 codes) and a **worst shape** (50,000 distinct priced lines over at least 15,000 codes). Each runs alone
  and as three at once with a small upload behind them.
- **Split verdict.** The job fails on what PR 6 controls: an OOM kill, a restart, memory above 90% of a limit, a limit
  not applied, a wrong or unfinished result, an oracle mismatch, a runner too small. The **time** verdict (48 s, §7 Q9)
  is measured and reported as "open, PR 6b" until `environments.ts` declares the screening's own consumer; from then
  on it fails the job. The switch is code, not a judgment (§7 Q10).
- It runs weekly, on demand, on pushes to `claude/build-platform` that touch its paths, and on pull requests that
  touch the screening, pricing and harness paths. A failure outside a pull request opens or updates one issue.

**#57, the schema and what is written from day one (built in PR 6).**
- **Attribution.** Both forms (the screening and `/request-audit`) carry a closed-list `source` (optional),
  `utm_source`, `utm_medium` and `utm_campaign` (normalised, shape-checked, from a first-party HttpOnly cookie the
  proxy sets), the kind of paid click (from the presence of a click-ID parameter, never its value), and an optional
  `referring_firm`. Campaign codes are counted on outcomes only from a registry the founder keeps.
- **Outcome rows.** `screening_outcome` is a counts-only row for every screening, refused ones included: stage, month,
  source, channel, listed campaign, **bands** of row counts, whole-percent shares, an anomaly band, a dollar band, an
  open band, `converted`, `retried`, and the release. It never holds a name, email, ZIP, exact count, date or dollar
  figure. It links to its live upload until expiry or replacement, and is kept with no end date.
- **Frozen summary.** `screening_lead` and `screening_lead_product` keep a frozen summary for a converted or consenting
  prospect for 12 months: one per practice at a time, every claim-line sum 0 or at least 11, with the release, the
  labels version and the attribution. A later screening of the practice replaces it **at its completion**, and a
  summary kept with an audit request carries the request over.
- **Consent, withdrawal and reminder.** The columns and SQL are in PR 6 (the founder's ruling: #57's columns go into
  PR 6's migration). PR 6e builds the consent capture, the withdrawal page and the reminder job on them, with no
  migration.
- **Result opened.** Recorded by a POST the result page sends only after 2 s visible and a first interaction, and by
  a conversion. Never by the link's GET.
- **Lost reasons.** `prospect_request.declined_reason` is a closed list, required on the console's decline.
- **Wording.** Every surface that promises deletion or collects attribution says what is kept (§7 Q1).

---

## 2. #53 part 2: one copy per release, keyed reads, equal output

### 2.1 What HEAD does
`apps/worker/src/screening/job.ts` caches `indexStoredRelease(...)` per `release:manifest:zip`, up to 16 entries.
`operator_screening_release(run)` returns every record of the pinned release, with `locality_map` limited to the run's
ZIP. `ScreeningPricer` memoizes the engine's whole `LinePricing` (with its trace) per distinct line.

### 2.2 The new read

| Read | Function (tp_operator, definer) | Returns | Held |
| --- | --- | --- | --- |
| Shared | `operator_screening_release(run uuid)` (changed) | The pinned release's records whose type is **not** `pfs_rvu`, `ncci_mue`, `mppr_rate`, `ncci_ptp` or `locality_map` | Once per `(release_no, manifest_sha256)`; at most 2 entries |
| Key set | `operator_screening_run_keys(run uuid) RETURNS TABLE (codes text[], zip text)` (new) | The run's distinct priced codes (sorted) and the prospect's ZIP | That run only |
| Per run | `operator_screening_run_records(run uuid)` (new) | For each code `c` in that set: `pfs_rvu {hcpcs:c, modifier:''}`, `ncci_mue {hcpcs:c}`, `mppr_rate {hcpcs:c, modifier:''}`, `ncci_ptp {column1:c, column2:c}`; the general `mppr_rate {component:'practice_expense'}`; `locality_map {zip}` | That run only |

- **Codes come from the database.** All three keep HEAD's guards (run `pricing`; release published with the pinned
  manifest and not withdrawn). The codes are the run's own `screening_result` rows with `payer_product IN
  ('medicare_ffs','ma_noncontracted')`, never the caller's. Lookups are equality joins on `rule_record_identity
  (release_no, record_type, key, effective_from)`. No DDL touches a rule table. The job reads keys and records in one
  operator transaction.
- **Why same-code pairs only.** A screening claim is one line, or two lines of the same code (`screeningVisitClaim`),
  so `procedureToProcedure` asks only for `(c, c)`.
- **The keyed view** (`apps/worker/src/price/keyed-release.ts`, new, generic so #31's Release-operations PR can reuse it):
  - `keyedRelease({ shared, records, requested })` builds an `IndexedRelease`. `requested` is per type
    (`pfs_rvu`, `ncci_mue`, `mppr_rate`, `ncci_ptp`, `locality_map`); production derives it from `(codes, zip)` with
    `screeningRequestedKeys`.
  - Shared types are served from the shared index. A keyed lookup whose key is in `requested` is served from the
    run's index, and may legitimately return null (a code with no MUE, most same-code pairs).
  - A keyed lookup outside `requested` sets `view.violation` (record type and key shape only, no value; the first
    one is kept and never cleared) and throws `ReleaseReadOutsideFetch`.
  - `ref` returns the stored `sha256`, as `indexStoredRelease` does.
  - Its contract, in the module comment: a caller checks `violation` after every `price()` call and before it stores
    anything. The engine's `attempt()` (engine.ts line 243) and the MPPR step's `try/catch` (line 678) turn any throw
    into `ENGINE_ERROR 'unexpected'`; the flag is what makes the failure loud.
- **The pricer** (`adapter.ts`, `ScreeningPricer`):
  - Before pricing a row it checks that the row's code is in `codes`; otherwise it throws `ReleaseKeysMismatch`.
  - After each engine call (`priceScreeningLine`, `priceScreeningLaterProcedure`, the change-day calls included) it
    throws `ReleaseReadOutsideFetch` if `view.violation` is set. These throws happen outside the engine.
  - After the last batch the job asserts that the codes priced equal `codes`.
- **Job flow** (`job.ts`): claim; the shared entry (load on a miss); keys and records; the view and the pricer; the
  batches as today. Any of the throws above, or the final mismatch, calls `failScreeningRun(run,
  'RELEASE_READ_OUTSIDE_FETCH')` before the current batch is recorded, logs `error_code` and returns `failed`. A
  withdrawal still evicts the entry. `RELEASES_KEPT` goes from 16 to 2, keyed by release and manifest.
- **Timings logged.** Each phase (shared load, keyed read, pricing, recording) logs `elapsed_ms` and `record_count`,
  numbers only, with `screening_run_id`. The capacity harness reads them from the container log.
- **Change days.** `releaseChangeDays(shared) ∪ releaseChangeDays(run records)`.
- **Compact memo.** Per distinct line: the disposition, `lineCents` and `lineUnrounded` (alone and fully reduced),
  `inReductionPool`, reason and detail, `changesInBand`, and the two trace SHA-256s, each computed once. A row's
  outcome is that record times the row's count less its allowed total, through the same `figureOf` and
  `screeningOutcome`. No trace is kept past its line.

**Why this is equal in output.** The engine reads only the keys listed (`ncci_mue`, `ncci_ptp`, `locality_map`,
`pfs_rvu`, `pfs_gpci`, `conversion_factor`, `mppr_rate` by code and general, `assistant_modifier`, `sequestration`),
so every value it reads is the same record with the same stored hash. The only other input that changes is the set
of change days, and the new set is a subset of HEAD's: HEAD also held days on which records change for codes and
pairs no row uses. A line's pricing changes only on a change day of a record it looks up. Those days are in both
sets, and at the first one in a band the trace names a different record, so `samePricing` is false in both and
`rates_change_in_band` is the same row for row. The oracle tests this.

**Why not cache the whole release once.** At production shape (§3.2) one whole copy holds the pair table, about 660 MB
of live heap by audit #31's measure, against a 512 MB task. Without the pairs it is still about 150 MB of fee schedule
and MUE quarters, and its cold load at a quarter vCPU sits inside the first prospect's 60 s.

**No cross-run cache of keyed records in PR 6.** A bounded per-release cache would not shorten the worst shape, whose
codes are cold by construction, and a typical therapy file's keyed read is a few hundred records. It would hold memory
the 512 MiB task needs across runs. The capacity job reports the keyed read's seconds per run, for the first run after
Postgres starts and for a repeat. PR 6b chooses no cache, a bounded cache or the keyed types held whole on its larger
consumer from that measurement (open item 4).

### 2.3 Proof of equal output
- **Oracle.** `apps/worker/src/screening/test-support/legacy-adapter.ts` is `adapter.ts` at `3c1b289` verbatim
  (import paths aside): `ScreeningPricer`, `screeningOutcome`, `figureOf`, `beforeSequestration`, `samePricing`,
  `changeDaysInBand`, `releaseChangeDays`, `priceScreeningLine`, `priceScreeningLaterProcedure` and the rest.
  `test-support/legacy-release.ts` freezes the read path: HEAD's `operator_screening_release` SQL as an owner query,
  a copy of `indexStoredRelease`, and HEAD's job sequence. Only tests import them (a test asserts this). The engine is
  shared, since `packages/pricing/src` does not change.
- **Fixture equality in CI.** `apps/worker/src/screening/release-cache.db.test.ts` publishes a test-local synthetic
  release (900_050, inserted by the test as `screening.db.test.ts` does; nothing committed) with:
  - two ZIPs in two localities;
  - a mid-quarter `pfs_rvu` correction and a mid-quarter `ncci_mue` record for codes the rows use;
  - a mid-quarter `pfs_rvu` change on a code no row uses, and a mid-quarter `ncci_ptp` change on a pair no claim
    asks for, each inside a band the rows use (the days HEAD counts and the new path does not);
  - a mid-quarter `conversion_factor` change and a mid-quarter `sequestration` change (shared types);
  - a same-code `ncci_ptp` pair;
  - a priced-product row whose code has no `pfs_rvu` record (a key legitimately absent);
  - a code in the reduction pool and one outside it.

  It prices about 400 rows over both ZIPs and every band through the job. Every stored `screening_result` row (all
  figures, unrounded values, reasons, trace hashes) must deep-equal the oracle's `ScreeningRowOutcome`, and none may
  carry `ENGINE_ERROR`.
- **Production shape** (§3.6 step 12). Upload 1 of each shape is compared with the oracle, by SHA-256 over the rows'
  canonical encoding.

---

## 3. #53 part 1: the capacity test under production limits

### 3.1 Limits, and how the harness differs from production
Docker cgroup v2 limits on the **production images** (`apps/web/Dockerfile`, `apps/worker/Dockerfile`, built in the
job), with production commands (`node apps/web/server.js`; `node --enable-source-maps dist/main.js` with
`WORKER_JOBS=platform`; the migration image's `dist/migrate.js` then `dist/logins.js`).

| Container | Limit | Source |
| --- | --- | --- |
| web | `--cpus=0.25 --memory=512m --memory-swap=512m`, `--cpuset-cpus` the runner's last CPU | `environmentSettings('production').compute.web` (256, 512) |
| platform | the same, same CPU | `compute.platform` (256, 512) |
| postgres:18 | `--cpus=min(2, nproc-1)` on the other CPUs; `--memory` = min(4 GiB, runner memory less 1 GiB for web and platform and 2.5 GiB for browser, harness and system); I/O `io.max` at gp3's baseline (3,000 IOPS each way, 125 MiB/s) on the device behind Docker's data root; `netem` 1 ms each way on its interface | `database.instanceType` t4g.medium (2 vCPU, 4 GiB) and the storage type in `infra/lib/constructs/database.ts` (gp3), through tables in `limits.ts` that throw on an unknown class or type |

- **Why containers.** Running unlimited and scaling cannot show an OOM kill, GC under pressure or CPU starvation.
- **The harness and Chromium** are pinned (`taskset`) to the Postgres CPUs, so they never take the quota-limited
  CPU. The browsers parse before timing starts and are closed before the oracle runs. Release generation and the
  oracle run as child processes that exit, so their heap is not held during measurement.
- **What differs, and which way.**
  - Postgres CPUs and memory: fewer on a 2-vCPU, 7 GB runner (harsher).
  - One web container takes every upload where production has two web tasks (harsher).
  - Network: 2 ms round trip to Postgres, more than an in-VPC round trip plus Multi-AZ's synchronous commit (harsher).
  - Disk: gp3's baseline, without its burst (equal or harsher).
  - Mail: a file write instead of an SES call of about 0.1 s (gentler by that).
  - The worker runs `NODE_ENV=test` with `MAIL_OUTBOX_DIR`, because it refuses the outbox in production
    (`apps/worker/src/config.ts`). `tools/screening-capacity/env.ts` lists every `NODE_ENV` read in the code the two
    images load: the worker's five config readers, `models/permitted.ts`, and `packages/model-gateway` (`config`,
    `gateway`, `evaluated`). Each selects a provider or requires a setting; none changes pricing, the queue or the
    database session. A test fails on a read not on the list. A production escape for the worker's mail was
    rejected: it would put a switch in production's configuration that sends mail nowhere, for a test.
  - The web runs `NODE_ENV=production` with the e2e suite's `TP_ALLOW_LOCAL_PROVIDERS=e2e`.
  - The platform container keeps every platform handler and schedule production wires. The screening sweep and
    support mail run each minute against local providers; daily jobs run only if their time falls in the window.
    The report lists every platform job that ran in each scenario, from pg-boss's job table, with its seconds.
- **The run proves its limits.** `docker inspect` shows `NanoCpus=250000000`, `Memory=MemorySwap=536870912` and the
  cpusets; Postgres's `io.max` reads back as set; the median of 50 `SELECT 1` round trips from the platform container
  is at least 2 ms. Otherwise the run fails ("limit not applied").
- **Runner size.** Fewer than 2 CPUs, or less than 2 GiB left for Postgres under the rule above, fails as "runner too
  small". A private repository's standard runner (2 vCPU, 7 GB) gives Postgres 1 CPU and 3.5 GiB.

### 3.2 The production-shaped synthetic release
`packages/synth/src/release/scale.ts` writes **synthetic CMS-format source files**, invented values, for
`SCALE_RELEASE_SHAPE`. Counts are at or above CMS's current public files; each count's basis is recorded in the file.

| Type | Per period | Periods | About |
| --- | --- | --- | --- |
| `pfs_rvu` | 19,000 codes; 2% corrected mid-quarter | 2025, 2026 | 38,800 |
| `pfs_gpci` | 109 localities | 2 | 218 |
| `locality_map` | 42,000 ZIPs; 3% need a ZIP+4 | 2 | 84,000 |
| `conversion_factor` | 2 | 2 | 4 |
| `mppr_rate` | 150 codes, plus the general record | 2 | 302 |
| `ncci_mue` | 15,000 codes | 8 quarters | 120,000 |
| `ncci_ptp` | 2,000,000 pairs (the full practitioner table) | open-ended, quarterly ends | 2,000,000 |
| code lists and small types | CARC 400, RARC 1,200, claim status 300, prompt pay 51, the rest | | 2,100 |

- **Assembly.** `tools/release/scale.ts` runs the sources through the **same** `PARSERS`, `buildParsedRecords` and
  manifest builder as `tools/release/synthetic.ts`. Every record has `source.synthetic = true`. The release is
  `SCALE_RELEASE_NUMBER = 900_100` (reserved, unused by any committed fixture), written to `$RUNNER_TEMP`, never the
  repository; the pair table in quarterly files of at most 250,000 records. It may be kept in the Actions cache,
  keyed by the SHA-256 of the generator's files.
- **Load.** Into the scratch database only, through `loadRelease` with its synthetic test option. ZIPs are invented
  five-digit values; some coincide with real ZIPs, with invented localities and values.

### 3.3 The uploads (`packages/synth/src/screening/uploads.ts`)
- **Practice shape (three).** The rows `screening.large.db.test.ts` generates: 50,000 rows over 12 codes, 8 modifier
  sets, 2 places, units 1 to 6, 8 bands and all six products, which is 9,216 distinct priced lines. A test holds the
  generator equal to the large test's rows.
- **Worst shape (three).** 50,000 rows, every one priced (`medicare_ffs` and `ma_noncontracted` alternating), all
  (code, modifiers, units, place, quarter) distinct; **at least 15,000 distinct codes**, every one of the release's
  150 pooled codes among them, and at least 50% of rows pooled (priced twice); units 1 to 8; places 11 and 22; the
  eight quarters, at least 10% of rows in a quarter with a mid-quarter record change; 11 to 60 claim lines a row; at
  most $25,000 a line.
- Each upload of a scenario has its own ZIP (three localities, none needing a ZIP+4), practice name and
  `@…synthetic.test` address, distinct across scenarios, so none replaces another.
- **Small upload (one per concurrent scenario).** 25 rows across all six products, at a fourth ZIP.

### 3.4 Scenarios and verdict

| Scenario | What |
| --- | --- |
| S1 | Worst shape, one upload alone: fresh Postgres, fresh platform container |
| S2 | Practice shape, one upload alone: fresh platform container |
| S3 | Practice shape, the same codes again in the same container (shared entry warm) |
| S4 | Worst shape: three at once, the small one submitted behind them within 1 s; fresh platform container |
| S5 | Practice shape: the same as S4 |

| Check | Verdict |
| --- | --- |
| Memory | **Fails**: an OOM kill (`State.OOMKilled`, or `memory.events` `oom_kill` above 0), a restart or exit of a container the harness did not stop, or sampled `anon` memory (`memory.stat`, every 500 ms) of web or platform above 90% of its limit (460.8 MiB). `memory.peak` (page cache included) and `memory.events` `max` are reported. |
| Limits | **Fails**: not applied (§3.1), or runner too small |
| Results | **Fails**: a result link not opening (HTTP 200), its row count not the upload's, a row still `pending`, a stored row with `ENGINE_ERROR`, a run in `pricing` that records no batch for 5 minutes (stalled), or an upload not emailed when the scenario's 30-minute cap ends |
| Equality | **Fails**: an oracle hash differs (§2.3) |
| Time to email | Per upload, from its submission (the server action's request start in Playwright) to its email in the outbox (polled every 250 ms). Above 48 s is "allowance", above 60 s "promise broken" (§7 Q9). **Reported as "open, PR 6b"** while `environmentSettings('production').compute.screening` is absent; **fails** once it exists, measured under that consumer's size and concurrency, for the shapes the founder's answer to §7 Q8 names. |

Phase seconds per run (shared load, keyed read with its record count, pricing, recording, queue wait) are reported
beside each time.

### 3.5 Where it runs: `.github/workflows/screening-capacity.yml`

```yaml
name: screening-capacity
on:
  schedule: [{ cron: "41 6 * * 1" }]   # weekly; fires once the default branch carries workflows (audit #54)
  workflow_dispatch:
  push:
    branches: [claude/build-platform]
    paths:
      - apps/worker/src/screening/**
      - apps/worker/src/price/**
      - apps/worker/src/jobs/**
      - apps/worker/src/worker.ts
      - apps/worker/src/mail/**
      - apps/web/src/lib/screening/**
      - apps/web/src/app/screening/**
      - apps/web/src/components/screening/**
      - apps/web/src/proxy.ts
      - packages/pricing/src/**
      - packages/rules/src/**
      - packages/contracts/src/**
      - packages/money/src/**
      - packages/db/migrations/**
      - packages/synth/src/release/**
      - packages/synth/src/screening/**
      - tools/screening-capacity/**
      - tools/release/scale.ts
      - infra/lib/environments.ts
      - infra/lib/constructs/database.ts
      - apps/web/Dockerfile
      - apps/worker/Dockerfile
      - pnpm-lock.yaml
      - .github/workflows/screening-capacity.yml
  pull_request:
    paths:
      - apps/worker/src/screening/**
      - apps/worker/src/price/**
      - apps/web/src/lib/screening/**
      - apps/web/src/app/screening/**
      - apps/web/src/components/screening/**
      - packages/pricing/src/**
      - packages/rules/src/**
      - packages/synth/src/release/**
      - packages/synth/src/screening/**
      - packages/db/migrations/*screening*.sql
      - tools/screening-capacity/**
      - tools/release/scale.ts
      - infra/lib/environments.ts
      - apps/web/Dockerfile
      - apps/worker/Dockerfile
      - .github/workflows/screening-capacity.yml
permissions: { contents: read }
concurrency:
  group: screening-capacity-${{ github.event_name == 'pull_request' && github.ref || github.sha }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
jobs:
  capacity:
    runs-on: ubuntu-24.04
    timeout-minutes: 90
    steps: checkout, pnpm, node 24 (as ci.yml pins them), install --frozen-lockfile,
           buildx build web and worker (load; GitHub Actions cache),
           pnpm screening:capacity --out "$RUNNER_TEMP/screening-capacity",
           upload-artifact (if: always()) screening-capacity.json and summary.md, retention-days: 90
  notify:
    needs: capacity
    if: failure() && github.event_name != 'pull_request'
    runs-on: ubuntu-24.04
    permissions: { issues: write }
    steps: gh issue: one open issue labelled screening-capacity, opened or commented with the run URL and verdict
           (no checkout; runs no repository code)
```

- **Triggers.** Schedules fire only from the default branch, and `main` holds plan documents until launch. Pushes
  measure every change to the build branch that can move the result (migrations and the lockfile included). Pull
  requests run it only where the screening, pricing, harness or images change, so schema PRs elsewhere and Dependabot
  lockfile PRs do not, and their push to the build branch measures them after merge.
- **Every push is measured.** Pushes group by commit and are never cancelled; only a pull request's older run is.
- **Green unless PR 6 broke something it controls.** The exit status follows §3.4, so the job is green on PR 6 while
  time is open. It is not a required check (path-filtered). The founder decides how this fits the merge rule (§7 Q10).
- **Notify.** The `notify` job holds the only write permission and runs no repository code; the tracker links the
  issue. A pull request's failure shows on the pull request.
- **Pins.** Action versions and SHA pins follow ci.yml as governance leaves it. PR 6 merges `claude/build-platform`
  (262d37d, the runner pin and its test) before adding this file.

### 3.6 Harness: `tools/screening-capacity/run.ts` (`pnpm screening:capacity`)
1. Read the limits (`limits.ts`) and the runner (nproc, memory, CPU model, kernel); fail if too small.
2. Generate the scale release in a child process (or restore it from cache).
3. Create a Docker network; start Postgres with its limits, `io.max` and `netem`.
4. Run migrate and logins from the worker image; load the release; approve a split as a synthetic specialist.
5. Start web and platform; wait for the web health route and the worker's `worker started` line. Verify the limits.
6. For each scenario S1 to S5: open the scenario's `/screening` pages in Playwright and let each browser parse (not
   timed); submit; wait for the emails; sample `memory.stat` every 500 ms; read `memory.peak`, `memory.events` and
   `cpu.stat` (`nr_throttled`, `throttled_usec`) at the end; read the phase timings from the platform log and the
   platform jobs that ran from pg-boss. Start a fresh platform container where §3.4 says.
7. Open every result link.
8. Close the browsers.
9. Run the oracle in a child process, unlimited, over upload 1 of S1 and of S2, and compare.
10. Write the report; exit non-zero on any failing check.

### 3.7 How the result is recorded
`screening-capacity.json` (`"format": "tp-screening-capacity/2"`): commit SHA, image digests, runner, limits applied
next to production's (and the "harsher or gentler" list of §3.1); release shape and manifest SHA-256; upload shapes
(rows, distinct lines, distinct codes, pooled share); per scenario and upload: submitted, emailed, seconds, phase
seconds, verdict; per container: anon peak and samples, `memory.peak`, events, OOM, restarts, throttling; platform
jobs run; oracle hashes and rows compared; the verdict with its reasons, time marked open or enforced. No token or
link. A Markdown table goes to `$GITHUB_STEP_SUMMARY` and both files to the artifact. ADR 0062 ("What proves it")
and the PR 6 approval summary cite the first run's URL and figures.

### 3.8 What the first run should show
Nothing is assumed; both shapes are measured. HEAD's 8.3 s covered the practice shape (9,216 distinct priced lines over
12 codes, about a third of the rows priced) in one unlimited Node process on a 4-CPU machine. At a quarter vCPU the
practice shape alone is likely several times slower. The worst shape alone is about five times the engine work
(50,000 distinct lines, half priced twice) and is likely minutes. In the concurrent scenarios the platform prices one
run at a time (`boss.work(type, { batchSize: 1 })`, `localConcurrency` 1), so the later uploads add the queue wait.
PR 6 is expected to be green on its own checks and to report time as open. PR 6b's consumer (size, two at a time, row
cap, honest message) is sized from these figures and from the founder's answers to Q8 and Q9. The screening does not
open until time is enforced and green (Q7).

---

## 4. #57: schema and day-one writes

### 4.1 Closed lists
TypeScript in `packages/db/src/schema/onboarding.ts`, exported by `@tp/db/runtime`. In SQL each list is written
**inline** in every CHECK that uses it (`col IN (...)`), never through a validator function: Postgres checks
`EXECUTE` on a function in a CHECK on every UPDATE, and tp_app updates `prospect_request` directly (the bug migration
`20261030110000` fixed for `prospect_payers_valid`, ADR 0053). A test reads each constraint with
`pg_get_constraintdef` and holds its literals equal to the TypeScript list. No new CHECK calls a function on a table a
granted role writes directly (the existing `prospect_request_payers` keeps its grant to tp_app).
- `PROSPECT_SOURCES` (Q2): `search`, `billing_firm`, `colleague`, `association`, `event`, `social`, `paidwhole_email`,
  `article`, `other`.
- `PROSPECT_DECLINED_REASONS` (Q3): `no_response`, `not_now`, `price`, `too_little_to_recover`, `chose_other`,
  `doing_it_themselves`, `data_unavailable`, `compliance_declined`, `not_a_fit`, `not_a_prospect`, `other`, plus
  `not_recorded` (backfill and the previous image only; never offered).
- `MARKETING_CHANNELS`: `none`, `email`, `paid_search`, `paid_social`, `social`, `partner`, `event`, `content`, `other`.
- `PAID_CLICKS`: `paid_search` (any of `gclid`, `gbraid`, `wbraid`, `msclkid` present), `paid_social` (`fbclid`,
  `li_fat_id`, `ttclid`, `twclid`). Only presence is read; the value never leaves the URL.
- `marketing_channel(utm_medium text, paid_click text) RETURNS text IMMUTABLE` (invoker, no grant; called only inside
  definers). The medium maps: null to `none`; `email`, `newsletter` to `email`; `cpc`, `ppc`, `paid_search`, `sem` to
  `paid_search`; `paid_social` to `paid_social`; `social`, `organic_social`, `linkedin` to `social`; `partner`,
  `referral`, `affiliate` to `partner`; `event`, `conference`, `webinar` to `event`; `content`, `blog`, `podcast`,
  `article` to `content`; anything else to `other`. When that gives `none` or `other` and `paid_click` is set, the
  channel is `paid_click`. The database computes the channel, never the caller.
- `SCREENING_COUNT_BANDS`: `none` (null or 0), `1_100`, `101_1k`, `1k_10k` (1,001 to 10,000), `10k_50k` (10,001 to
  50,000), `over_50k`. SQL `screening_count_band(n bigint)`.
- `SCREENING_DIFFERENCE_BANDS`: `none`, `under_1k`, `1k_to_10k`, `10k_to_50k`, `50k_to_250k`, `250k_or_more`. SQL
  `screening_difference_band(gap_cents bigint)` returns `none` for null and for 0 or less, then splits at < 100000,
  1000000, 5000000 and 25000000 cents.
- `SCREENING_OPEN_BANDS`: `same_day`, `1_2_days`, `3_7_days`, `8_30_days`, by UTC calendar days from the upload. SQL
  `screening_open_band(uploaded timestamptz, opened timestamptz)`.
- **UTM values.** `apps/web/src/lib/http/attribution.ts` lower-cases, trims, and turns each run of whitespace or `+`
  into `-`; the result must match `^[a-z0-9][a-z0-9._-]{0,63}$` (also every UTM column's CHECK) or it is dropped.
- `screening_labels_version() RETURNS text IMMUTABLE` returns `'screening-labels/2026-10-18'`, equal to
  `SCREENING_LABELS_VERSION` in `apps/web/src/lib/screening/labels.ts`; labels change only under a new version (test).

### 4.2 `screening_prospect` and `screening_run`: new columns (kept 30 days, or until replaced)

| Table.column | Type and CHECK | Written by | First PR |
| --- | --- | --- | --- |
| `screening_prospect.source` | `text`, `screening_prospect_source CHECK (source IS NULL OR source IN (<PROSPECT_SOURCES>))` | `submit_screening`, `reject_screening_upload` (tp_app), from the form | PR 6 |
| `.utm_source`, `.utm_medium`, `.utm_campaign` | `text`, the UTM shape | same, from the cookie | PR 6 |
| `.paid_click` | `text`, `CHECK (paid_click IN ('paid_search', 'paid_social'))` | same, from the cookie | PR 6 |
| `.referring_firm` | `text`, `CHECK (btrim(referring_firm) <> '' AND length(referring_firm) <= 200 AND referring_firm = btrim(referring_firm))`; screened by `textPhiFindings` in the handler | same, from the form | PR 6 |
| `.followup_consent_sha256` | `text`, `CHECK (~ '^[0-9a-f]{64}$')`: the SHA-256 of the exact consent wording ticked; null = none | `submit_screening` (the handler passes null until PR 6e) | PR 6e |
| `screening_run.first_opened_at` | `timestamptz`, `screening_run_opened CHECK (first_opened_at IS NULL OR status = 'complete')` | `screening_result_opened`, `convert_screening` | PR 6 |

`screening_prospect_fixed` is unchanged. `screening_run_rules`' complete-to-complete branch is rewritten: the
conversion pair may be set once and `first_opened_at` may go from null to a value once, in the same update or apart;
every other column stays as it was.

### 4.3 `screening_outcome` (new; kept with no end date)

```sql
CREATE TABLE screening_outcome (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The live screening's upload while it is kept; null once it expires or is replaced.
  upload_id uuid UNIQUE REFERENCES screening_upload (id) ON DELETE SET NULL,
  screened_month text NOT NULL CONSTRAINT screening_outcome_month CHECK (screened_month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  stage text NOT NULL CONSTRAINT screening_outcome_stage CHECK (stage IN ('refused', 'accepted', 'priced', 'failed')),
  source text CONSTRAINT screening_outcome_source CHECK (source IS NULL OR source IN (<PROSPECT_SOURCES>)),
  channel text NOT NULL CONSTRAINT screening_outcome_channel CHECK (channel IN (<MARKETING_CHANNELS>)),
  -- A code from marketing_campaign when it is listed there at submission; 'other' when not; null with no campaign code.
  campaign text CONSTRAINT screening_outcome_campaign CHECK (campaign IS NULL OR campaign = 'other' OR campaign ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  consented boolean NOT NULL DEFAULT false,
  row_band text NOT NULL CONSTRAINT screening_outcome_row_band CHECK (row_band IN (<SCREENING_COUNT_BANDS>)),
  left_out_band text NOT NULL DEFAULT 'none' CONSTRAINT screening_outcome_left_out_band CHECK (left_out_band IN (<SCREENING_COUNT_BANDS but over_50k>)),
  refusal_codes text[] NOT NULL DEFAULT '{}' CONSTRAINT screening_outcome_refusal_codes CHECK (screening_refusal_codes_valid(refusal_codes)),
  retried boolean NOT NULL DEFAULT false,      -- a refused upload the practice followed with an accepted one
  release_no integer CONSTRAINT screening_outcome_release CHECK (release_no > 0),
  engine_version text CONSTRAINT screening_outcome_engine CHECK (engine_version ~ '^[a-z0-9][a-z0-9./-]{0,31}$'),
  priced_share_pct smallint CHECK (priced_share_pct BETWEEN 0 AND 100),
  contract_share_pct smallint CHECK (contract_share_pct BETWEEN 0 AND 100),
  could_not_price_share_pct smallint CHECK (could_not_price_share_pct BETWEEN 0 AND 100),
  not_screened_share_pct smallint CHECK (not_screened_share_pct BETWEEN 0 AND 100),
  anomaly_band text CONSTRAINT screening_outcome_anomaly_band CHECK (anomaly_band IN (<SCREENING_COUNT_BANDS but over_50k>)),
  anomaly_difference_band text CONSTRAINT screening_outcome_difference_band CHECK (anomaly_difference_band IN (<SCREENING_DIFFERENCE_BANDS>)),
  first_open_band text CONSTRAINT screening_outcome_open_band CHECK (first_open_band IN (<SCREENING_OPEN_BANDS>)),
  converted boolean NOT NULL DEFAULT false,
  superseded boolean NOT NULL DEFAULT false,
  CONSTRAINT screening_outcome_refused CHECK ((stage = 'refused') = (cardinality(refusal_codes) > 0)
    AND (stage <> 'refused' OR (release_no IS NULL AND left_out_band = 'none' AND NOT consented AND NOT superseded))
    AND (NOT retried OR stage = 'refused')),
  CONSTRAINT screening_outcome_pinned CHECK ((stage = 'refused') = (release_no IS NULL)),
  CONSTRAINT screening_outcome_accepted_rows CHECK (stage = 'refused' OR row_band NOT IN ('none', 'over_50k')),
  CONSTRAINT screening_outcome_priced CHECK (
    (stage = 'priced') = (engine_version IS NOT NULL) AND (stage = 'priced') = (priced_share_pct IS NOT NULL)
    AND (stage = 'priced') = (contract_share_pct IS NOT NULL) AND (stage = 'priced') = (could_not_price_share_pct IS NOT NULL)
    AND (stage = 'priced') = (not_screened_share_pct IS NOT NULL) AND (stage = 'priced') = (anomaly_band IS NOT NULL)
    AND (stage = 'priced') = (anomaly_difference_band IS NOT NULL)),
  -- Each share floors, so the four sum to 97..100; all zero only when the file's allowed total is zero.
  CONSTRAINT screening_outcome_shares CHECK (stage <> 'priced'
    OR (priced_share_pct + contract_share_pct + could_not_price_share_pct + not_screened_share_pct BETWEEN 97 AND 100)
    OR (priced_share_pct + contract_share_pct + could_not_price_share_pct + not_screened_share_pct = 0)),
  CONSTRAINT screening_outcome_band CHECK (stage <> 'priced' OR (anomaly_band = 'none') = (anomaly_difference_band = 'none')),
  CONSTRAINT screening_outcome_opened CHECK (first_open_band IS NULL OR stage = 'priced'),
  CONSTRAINT screening_outcome_converted CHECK (NOT converted OR stage = 'priced')
);
CREATE INDEX screening_outcome_by_cohort ON screening_outcome (screened_month, source, channel, campaign);
```

- **Helper.** `screening_refusal_codes_valid(text[])`: distinct, ascending, each a code of `screening_rejection_valid`'s
  list, at most 13 (invoker; only definers write this table).
- **`screening_outcome_rules`, BEFORE UPDATE.**
  - Fixed: `id`, month, source, channel, campaign, `consented`, `row_band`, `left_out_band`, `refusal_codes`, `release_no`.
  - `upload_id` may go from a value to null, once.
  - `stage` moves only from `accepted` to `priced` or `failed`; the figures are set only on the move to `priced`.
  - `first_open_band` goes from null to a value once; `converted`, `superseded` and `retried` go from false to true once.
  - A row whose old `upload_id` is null refuses every change.
- **Deletion.** `reject_change` refuses DELETE (row) and TRUNCATE (statement).
- **Writers** (each inside a definer function; every number computed in SQL):
  - **Submission.** `submit_screening` inserts `accepted` with `upload_id`, the month (`to_char(now() AT TIME ZONE
    'UTC', 'YYYY-MM')`), source, `channel = marketing_channel(utm_medium, paid_click)`, the campaign (listed code,
    `other` or null), `consented`, `row_band = screening_count_band(n)`, `left_out_band`, and the pinned release. It
    sets `retried = true` on the practice's refused outcomes still linked (same email, or same ZIP and
    `screening_practice_key`), and `superseded = true` on the outcomes of the screenings it replaces, before it
    deletes them; the cascade then nulls `upload_id`.
  - **Refusal.** `reject_screening_upload` inserts `refused` with the band of the upload's row count and the sorted,
    distinct `code`s of its reasons (no row, column or field).
  - **Completion.** `operator_screening_complete` sets `priced`, `engine_version`, the shares (`100 * part / total`
    integer division on bigint sums of `observed_allowed_cents`; parts priced, `contract_required`,
    `unpriced`+`rates_change_in_band`, `not_screened`; all 0 when the total is 0), `anomaly_band` (the count of rows
    whose `screening_standing(...) = 'anomaly'`), and the band of Σ(`coalesce(reduced_cents, expected_cents) -
    observed_allowed_cents`) over those rows.
  - **Failure.** `operator_screening_fail` sets `failed`.
  - **Opened.** `screening_result_opened` and `convert_screening` set `first_open_band` if still null.
  - **Conversion.** `convert_screening` sets `converted`.

### 4.4 `screening_lead` and `screening_lead_product` (new; 12 months from the upload)

```sql
CREATE TABLE screening_lead (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id uuid UNIQUE REFERENCES screening_upload (id) ON DELETE SET NULL,      -- the live screening, while kept
  practice_name text NOT NULL CONSTRAINT screening_lead_practice_name CHECK (btrim(practice_name) <> '' AND length(practice_name) <= 200 AND practice_name = btrim(practice_name)),
  state text NOT NULL CONSTRAINT screening_lead_state CHECK (state IN (<the 56 codes screening_prospect_state lists>)),
  zip text NOT NULL CONSTRAINT screening_lead_zip CHECK (zip ~ '^[0-9]{5}$'),
  contact_email text NOT NULL CONSTRAINT screening_lead_contact_email CHECK (<screening_prospect_contact_email's expression>),
  source text CONSTRAINT screening_lead_source CHECK (source IS NULL OR source IN (<PROSPECT_SOURCES>)),
  utm_source text CONSTRAINT screening_lead_utm_source CHECK (utm_source ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  utm_medium text CONSTRAINT screening_lead_utm_medium CHECK (utm_medium ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  utm_campaign text CONSTRAINT screening_lead_utm_campaign CHECK (utm_campaign ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  paid_click text CONSTRAINT screening_lead_paid_click CHECK (paid_click IN ('paid_search', 'paid_social')),
  referring_firm text CONSTRAINT screening_lead_referring_firm CHECK (btrim(referring_firm) <> '' AND length(referring_firm) <= 200 AND referring_firm = btrim(referring_firm)),
  consent_sha256 text CONSTRAINT screening_lead_consent CHECK (consent_sha256 ~ '^[0-9a-f]{64}$'),
  -- The withdrawal (unsubscribe) link's token, stored only as its SHA-256; consent-based leads only (PR 6e).
  withdrawal_token_sha256 text UNIQUE CONSTRAINT screening_lead_withdrawal_token CHECK (withdrawal_token_sha256 ~ '^[0-9a-f]{64}$'),
  reminder_sent_at timestamptz,                                                  -- the reminder before deletion (PR 6e)
  prospect_request_id uuid UNIQUE REFERENCES prospect_request (id) ON DELETE CASCADE,
  release_no integer NOT NULL CHECK (release_no > 0),
  release_manifest_sha256 text NOT NULL CHECK (release_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  engine_version text NOT NULL CHECK (engine_version ~ '^[a-z0-9][a-z0-9./-]{0,31}$'),
  labels_version text NOT NULL CHECK (labels_version ~ '^screening-labels/20[0-9]{2}-[0-9]{2}-[0-9]{2}$'),
  screened_at timestamptz NOT NULL,
  result_first_opened_at timestamptz,
  row_count integer NOT NULL CHECK (row_count BETWEEN 1 AND 50000),
  claim_lines bigint NOT NULL CHECK (claim_lines >= 11),
  observed_cents bigint NOT NULL CHECK (observed_cents >= 0),
  anomaly_rows integer NOT NULL CHECK (anomaly_rows BETWEEN 0 AND 50000),
  left_out_rows integer NOT NULL CHECK (left_out_rows BETWEEN 0 AND 50000),
  left_out_claim_lines integer CHECK (left_out_claim_lines >= 11),          -- kept only at 11 or more; else null
  left_out_allowed_cents bigint CHECK (left_out_allowed_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT screening_lead_basis CHECK (consent_sha256 IS NOT NULL OR prospect_request_id IS NOT NULL),
  CONSTRAINT screening_lead_consent_only CHECK (consent_sha256 IS NOT NULL OR (withdrawal_token_sha256 IS NULL AND reminder_sent_at IS NULL)),
  CONSTRAINT screening_lead_left_out CHECK ((left_out_claim_lines IS NULL) = (left_out_allowed_cents IS NULL)
    AND (left_out_claim_lines IS NULL OR left_out_rows > 0)),
  -- Frozen at 12 months; a withdrawal moves it to now() just before the lead is deleted.
  CONSTRAINT screening_lead_expiry CHECK (expires_at > screened_at AND expires_at <= screened_at + interval '12 months')
);
CREATE INDEX screening_lead_by_expiry ON screening_lead (expires_at);
CREATE INDEX screening_lead_by_contact ON screening_lead (contact_email);
CREATE INDEX screening_lead_by_practice ON screening_lead (zip, screening_practice_key(practice_name));
```

`screening_lead_product` is unchanged from the reviewed design:

```sql
CREATE TABLE screening_lead_product (
  lead_id uuid NOT NULL REFERENCES screening_lead (id) ON DELETE CASCADE,
  payer_product text NOT NULL CHECK (payer_product IN ('medicare_ffs', 'ma_noncontracted', 'ma_contracted', 'commercial', 'medicaid', 'other')),
  row_count integer NOT NULL CHECK (row_count BETWEEN 1 AND 50000),
  claim_lines bigint NOT NULL CHECK (claim_lines >= 11),
  observed_cents bigint NOT NULL CHECK (observed_cents >= 0),
  priced_rows integer NOT NULL DEFAULT 0 CHECK (priced_rows >= 0),
  priced_claim_lines bigint NOT NULL DEFAULT 0,
  priced_observed_cents bigint NOT NULL DEFAULT 0 CHECK (priced_observed_cents >= 0),
  expected_cents bigint NOT NULL DEFAULT 0 CHECK (expected_cents >= 0),   -- before the reduction across codes
  lowest_cents bigint NOT NULL DEFAULT 0 CHECK (lowest_cents >= 0),       -- fully reduced for pooled rows, the one figure otherwise
  pooled_rows integer NOT NULL DEFAULT 0,
  anomaly_rows integer NOT NULL DEFAULT 0,
  could_not_price_rows integer NOT NULL DEFAULT 0,
  could_not_price_claim_lines bigint NOT NULL DEFAULT 0,
  could_not_price_observed_cents bigint NOT NULL DEFAULT 0 CHECK (could_not_price_observed_cents >= 0),
  PRIMARY KEY (lead_id, payer_product),
  CONSTRAINT screening_lead_product_cells CHECK ((priced_claim_lines = 0 OR priced_claim_lines >= 11)
    AND (could_not_price_claim_lines = 0 OR could_not_price_claim_lines >= 11)),
  CONSTRAINT screening_lead_product_medicare CHECK (payer_product IN ('medicare_ffs', 'ma_noncontracted')
    OR (priced_rows = 0 AND priced_claim_lines = 0 AND priced_observed_cents = 0 AND expected_cents = 0 AND lowest_cents = 0
        AND pooled_rows = 0 AND anomaly_rows = 0 AND could_not_price_rows = 0 AND could_not_price_claim_lines = 0 AND could_not_price_observed_cents = 0)),
  CONSTRAINT screening_lead_product_partition CHECK (payer_product NOT IN ('medicare_ffs', 'ma_noncontracted')
    OR (priced_rows + could_not_price_rows = row_count AND priced_claim_lines + could_not_price_claim_lines = claim_lines
        AND priced_observed_cents + could_not_price_observed_cents = observed_cents)),
  CONSTRAINT screening_lead_product_figures CHECK (lowest_cents <= expected_cents AND pooled_rows <= priced_rows AND anomaly_rows <= priced_rows)
);
```

- **Differences are not stored.** A read computes them as expected or lowest less observed, in SQL.
- **Freezing.** `screening_freeze_lead(run uuid, request_id uuid, withdrawal_token text, request text) RETURNS uuid`,
  **SECURITY INVOKER**, no grant: only definers call it, so it runs as the owner. Bigint sums over `screening_result`
  with the filters of `screening_result_summary` and `screening_result_coverage`. It copies the prospect's practice,
  state, ZIP, email, consent and attribution (source, UTM codes, `paid_click`, firm); the run's release, manifest,
  engine and `first_opened_at`; the label version from `screening_labels_version()`; the left-out claim lines and
  allowed amount only at 11 or more. `expires_at = screened_at + 12 months`. A consent lead without a withdrawal token
  is refused. Audit event `screening_lead_kept` (object `screening_lead`).
- **Who freezes, and replacement at completion.**
  - `operator_screening_complete(run, token_sha256, withdrawal_token_sha256, engine, request)` (signature grows;
    unmerged), in its transaction after the run is complete:
    1. The **replaced leads** are the leads of the same practice (same email, or same ZIP and
       `screening_practice_key`) screened before this upload.
    2. The **carried request** is the `prospect_request_id` of the most recently screened replaced lead that has one.
    3. It deletes every replaced lead. Audit event `screening_lead_replaced`, object `prospect_request` (the request
       a lead carried) or `screening_lead`. PR 7's console shows it on the request ("summary replaced by a later
       screening").
    4. If the prospect consented, or a request is carried, it freezes this run's lead with that request.
  - `convert_screening` (PR 6) freezes the lead when the run has none, or sets `prospect_request_id` when the lead
    has none. If the lead already carries an earlier request, the new request is still marked `from_screening` and
    the lead stays with the earlier one.
  - So a failed or abandoned replacement deletes nothing, and a corrected file keeps the summary the founder takes
    to the scoping call.
- **`screening_lead_rules`, BEFORE UPDATE.** Fixed except, each once: `upload_id` to null; `result_first_opened_at`,
  `prospect_request_id`, `withdrawal_token_sha256` and `reminder_sent_at` from null to a value; `expires_at` to a value
  no later than `now()` (withdrawal).
- **Product rows.** BEFORE UPDATE `reject_change`; deleted only with their lead.
- **`screening_lead_kept`, BEFORE DELETE.** Allows a delete only when:
  - `expires_at <= now()` (expiry and withdrawal); or
  - a **complete** run of the same practice was uploaded after `screened_at` (replacement); or
  - its `prospect_request` no longer exists (the cascade from #51's request deletion).

  TRUNCATE is refused on both tables.
- **Deleted by:** `operator_screening_complete` (replacement); `operator_screening_expire` (new third return column
  `leads`, up to `at_most` past `expires_at`, event `screening_lead_expired`); `screening_lead_withdraw` (PR 6e); the
  request cascade (#51).
- **Withdrawal and reminder (SQL in PR 6, callers in PR 6e).**
  - `screening_lead_withdraw(token_sha256 text, request text) RETURNS void` (tp_app, definer): for the lead with that
    withdrawal hash, sets `expires_at = now()`, deletes it (products cascade), writes `screening_lead_withdrawn`.
    An unknown token does nothing; the route answers alike.
  - `operator_screening_reminders_due(within_days integer, at_most integer) RETURNS TABLE (lead_id uuid, contact_email
    text, expires_at timestamptz)` (tp_operator): consent leads with no reminder whose `expires_at` falls within
    `within_days`. PR 6e's job sets the number of days.
  - `operator_screening_reminder_sent(lead uuid, request text) RETURNS boolean` (tp_operator): sets
    `reminder_sent_at` once, event `screening_lead_reminded`.

### 4.5 `prospect_request`: new columns (kept as long as the request; #51 sets that period)

| Column | Type and CHECK | Written by | First PR |
| --- | --- | --- | --- |
| `source` | `text`, `prospect_request_source CHECK (source IS NULL OR source IN (<PROSPECT_SOURCES>))` | `submit_prospect_request` (new 12-argument overload, tp_app) from `/request-audit`; `convert_screening` copies the prospect's | PR 6 |
| `utm_source`, `utm_medium`, `utm_campaign` | `text`, the UTM shape | same | PR 6 |
| `paid_click` | `text`, `CHECK (paid_click IN ('paid_search', 'paid_social'))` | same | PR 6 |
| `referring_firm` | `text`, as in §4.2 | same | PR 6 |
| `from_screening` | `boolean NOT NULL DEFAULT false` | `convert_screening` | PR 6 |
| `declined_reason` | `text`, `prospect_request_declined_reason CHECK (declined_reason IS NULL OR declined_reason IN (<PROSPECT_DECLINED_REASONS>))`; `prospect_request_declined CHECK ((status = 'declined') = (declined_reason IS NOT NULL))` | console decline (`reviewProspect`, tp_app; `GRANT UPDATE (declined_reason) ON prospect_request TO tp_app`; policy `prospect_request_platform_review` unchanged) | PR 6 |

Every CHECK here uses only built-ins, so tp_app's direct UPDATEs need no `EXECUTE`.

**Migration order** (the table is in an applied migration; nothing in it is edited):
1. `ALTER TABLE ... ADD COLUMN` for each new column, with its CHECK (except `prospect_request_declined`).
2. `CREATE OR REPLACE FUNCTION prospect_request_fixed()`, built-ins only (it runs as tp_app):
   - The five attribution columns, `paid_click` and `from_screening` join the fixed list.
   - **Backfill exception.** When `OLD.status = 'declined'`, `OLD.declined_reason IS NULL`, `NEW.declined_reason =
     'not_recorded'` and every other column is unchanged (`updated_at` aside, which its own trigger sets), the update
     is allowed and `reviewed_at` keeps its value. After step 3 no row meets this, so it never fires again.
   - Otherwise a declined request's status and reason are fixed, as a converted one's are.
   - A move to `declined` with no reason gets `not_recorded` (the previous image's decline).
   - Otherwise `reviewed_at := now()`, as today.
3. `UPDATE prospect_request SET declined_reason = 'not_recorded' WHERE status = 'declined'`.
4. `ADD CONSTRAINT prospect_request_declined`.

The six-argument `submit_prospect_request` stays for the previous image (dropped later; open item 7).

### 4.6 `marketing_campaign` (new; kept with no end date)

```sql
CREATE TABLE marketing_campaign (
  code text PRIMARY KEY CONSTRAINT marketing_campaign_code CHECK (code ~ '^[a-z0-9][a-z0-9._-]{0,63}$' AND code <> 'other'),
  label text NOT NULL CONSTRAINT marketing_campaign_label CHECK (btrim(label) <> '' AND length(label) <= 120 AND label = btrim(label)),
  added_by uuid NOT NULL REFERENCES "user" (id),
  added_at timestamptz NOT NULL DEFAULT now()
);
-- reject_change BEFORE UPDATE OR DELETE (row) and BEFORE TRUNCATE (statement): a listed code stays listed.
```

The founder lists campaigns that go to many people, so a one-off code never reaches an outcome. An outcome takes the
code only if it is listed at submission; listing it later does not reclassify `other`.
`console_register_marketing_campaign(code text, label text) RETURNS void` (tp_app, definer; a person with platform
permission `organization.manage`; event `marketing_campaign_registered`) is in PR 6; its route and screen are PR 7's.

### 4.7 Functions and grants (changed or new)

| Function | Role | Change |
| --- | --- | --- |
| `submit_screening(practice, state_code, zip5, email, codes[], modifier_sets[], unit_counts[], places[], products[], bands[], allowed_cents[], claim_counts[], rows_left_out, claim_lines_left_out, allowed_cents_left_out, heard_from, campaign_source, campaign_medium, campaign_name, click_kind, firm, consent_sha256, request)` | tp_app | Stores the prospect columns and the outcome; marks `retried` and `superseded`; deletes replaced screenings as today. Leads are no longer touched at submission. |
| `reject_screening_upload(practice, state_code, zip5, email, row_count, reasons, heard_from, campaign_source, campaign_medium, campaign_name, click_kind, firm, request)` | tp_app | Stores attribution and a `refused` outcome. |
| `convert_screening(...)` | tp_app | Signature unchanged. Calls the new overload with the prospect's attribution, sets `from_screening`, sets `first_opened_at` and `first_open_band` if null, sets `converted`, freezes or attaches the lead. |
| `screening_result_opened(token_sha256 text) RETURNS void` | tp_app (new) | For a complete, unexpired run, the first time: sets `first_opened_at`, the outcome's band and the lead's `result_first_opened_at` if a lead exists; event `screening_result_opened` (object `screening_run`). Otherwise does nothing. |
| `screening_lead_withdraw(token_sha256 text, request text) RETURNS void` | tp_app (new) | §4.4. |
| `submit_prospect_request(contact, email, organization, location_count, payer_names, arrangement, heard_from, campaign_source, campaign_medium, campaign_name, click_kind, firm)` | tp_app (new overload) | Attribution on `/request-audit`. |
| `console_register_marketing_campaign(text, text)` | tp_app (new) | §4.6. |
| `operator_screening_release(uuid)` | tp_operator | Shared types only. |
| `operator_screening_run_keys(uuid)`, `operator_screening_run_records(uuid)` | tp_operator (new) | §2.2. |
| `operator_screening_complete(uuid, text, text, text, text)` | tp_operator | Writes the outcome; replaces and freezes leads (§4.4). |
| `operator_screening_fail` | tp_operator | Also writes the outcome. |
| `operator_screening_expire(integer, text) RETURNS TABLE (prospects, runs, leads)` | tp_operator | Also deletes expired leads. |
| `operator_screening_reminders_due(integer, integer)`, `operator_screening_reminder_sent(uuid, text)` | tp_operator (new) | §4.4. |
| `marketing_channel`, `screening_count_band`, `screening_difference_band`, `screening_open_band`, `screening_refusal_codes_valid`, `screening_labels_version`, `screening_freeze_lead`, and the trigger functions `screening_outcome_rules`, `screening_lead_rules`, `screening_lead_kept` | none | SECURITY INVOKER; `REVOKE ALL ... FROM PUBLIC`. |

Every definer function sets `search_path = pg_catalog, public, pg_temp`. No validator function for the closed lists
exists (§4.1). The migration header is rewritten:
- **Altered:** `prospect_request` gains columns, CHECKs, a column grant, a replaced trigger function and a second
  `submit_prospect_request`.
- **Safe with the previous image running:** yes. Its review, decline and conversion updates meet only built-in CHECKs
  (proved as tp_app, §6), its decline gets `not_recorded`, and it calls the six-argument function.

### 4.8 RLS, the PHI registry and the catalog

| Table | RLS | Policies and grants | In `phi_table_registry`? | Why |
| --- | --- | --- | --- | --- |
| `screening_outcome` | ENABLE + FORCE | `screening_outcome_owner FOR ALL TO tp_owner`; `REVOKE ALL FROM PUBLIC`; no grant | No | No patient; bands, whole-percent shares of an undisclosed total and closed codes; no free text, name, email, ZIP, date, exact count or `_cents`. No practice to scope by. |
| `screening_lead` | ENABLE + FORCE | `screening_lead_owner` only; no grant | No | A prospect practice's business contact and attribution, and sums over rows of at least 11 claim lines each (CMS small-cell standard, ADR 0062). No patient identifier exists to register. Personal data of a business contact, covered by the privacy notice, kept 12 months. |
| `screening_lead_product` | ENABLE + FORCE | owner only; no grant | No | The same sums by payer product, each claim-line sum 0 or at least 11 by CHECK. |
| `marketing_campaign` | ENABLE + FORCE | owner only; no grant | No | Campaign codes and labels the founder enters. |
| `screening_prospect`, `screening_run` (new columns) | unchanged | unchanged | No | Campaign codes, closed-list answers, a screened firm name and a time are not health information. |
| `prospect_request` (new columns) | unchanged | plus `GRANT UPDATE (declined_reason)` | No | As ADR 0053: a business request with no PHI. |

The catalog and cross-tenant tests are unchanged and must pass. None of the new tables has `practice_id`; `_cents`
columns are bigint. SEC-17's owner-only list grows to nine tables (the eight screening tables and
`marketing_campaign`). Its timestamp list adds `screening_run.first_opened_at`, `screening_lead.screened_at`,
`result_first_opened_at`, `reminder_sent_at`, `created_at`, `expires_at` and `marketing_campaign.added_at`. No new
column matches SEC-17's PHI-shaped pattern.

### 4.9 Small cells, re-linking and what an outcome can be matched to
1. **An outcome has nothing to subtract.** Bands, whole percents with no total, a dollar band whose narrowest step
   is $1,000, a month, an open band and flags. The difference of two outcomes is never a cell of claim lines.
2. **What an outcome can be matched to, said plainly.** While a converted or consenting prospect's lead is kept, or
   their audit request is, their outcome can be matched to it: the lead holds the same release and month and the sums
   the shares come from, and the request holds `from_screening` and its date beside the outcome's month and
   `converted`. The wording (Q1) and counsel (open item 8) say so. Once both are gone, an outcome holds only a month,
   bands, whole-percent shares, closed codes and the release. No kept row holds an exact count, a date finer than
   the month, or the sums behind the shares, and no audit event names an outcome. Replacement and expiry unlink it in
   the transaction that deletes the screening (`ON DELETE SET NULL`).
3. **One readable exact-totals record per practice.** A new accepted screening deletes the practice's earlier
   screening at submission (HEAD). It replaces the earlier lead at its own completion (§4.4). Before then it has no
   readable result (no token), so no reader ever holds two exact-totals records of one practice. A refused upload
   replaces nothing.
4. **A lead cannot store a small cell.** Every stored claim-line sum is over whole rows of at least 11 lines, so it is
   0 or at least 11, held by CHECK; the left-out sums are kept only at 11 or more.
5. **Converted requests.** A request keeps `from_screening` and no totals. Its summary is the lead, carried to the
   practice's next completed screening.

### 4.10 Retention

| Data | Kept | Deleted by |
| --- | --- | --- |
| Prospect, upload, run and rows, with the new columns | 30 days, or until replaced (unchanged) | `operator_screening_expire`; `submit_screening` |
| `screening_outcome` | No end date (Q6); unlinked at 30 days or on replacement | Never (DELETE and TRUNCATE refused) |
| `screening_lead`, `screening_lead_product` | 12 months from the upload (Q4); sooner on replacement at the next completion, on withdrawal (PR 6e), or with its request | `operator_screening_expire`; `operator_screening_complete`; `screening_lead_withdraw`; the cascade |
| `marketing_campaign` | No end date | Never |
| `prospect_request` columns | As the request (#51) | #51's job |
| `pw_first_touch` cookie | 30 days (Q5) | The browser |

### 4.11 Day-one writes
- **Attribution cookie** (`apps/web/src/proxy.ts`, `apps/web/src/lib/http/attribution.ts`):
  - On a page GET (not `_next` or `/api`) whose URL has a valid `utm_*` after normalisation or a click-ID parameter,
    and no `pw_first_touch` cookie yet, the response sets `pw_first_touch`: URL-encoded `s`, `m`, `c` (each
    normalised and shape-checked) and `k` (`paid_search` or `paid_social`, never the click ID).
  - `Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax`, plus `Secure` on https. First touch. The proxy still
    authorizes nothing; its comment and ADR 0062 note this one cookie.
  - The screening and request-audit handlers read it server-side and pass the four values. No script, no third
    party, never logged.
- **Forms.** `upload-form.tsx` and the request-audit form gain an optional `heardFrom` select (§4.1 labels,
  `z.enum(PROSPECT_SOURCES).optional()`, blank meaning none) and an optional `referringFirm` (at most 200 characters,
  refused by `textPhiFindings` with the form's existing message).
- **Opened signal** (`apps/web/src/components/screening/opened-signal.tsx`, client, on the result page):
  - It counts visible time (`visibilitychange`) and waits for a first `pointerdown`, `keydown`, `focusin`, `wheel`,
    `scroll` or `touchstart`. `focusin` counts screen-reader users who move focus without a key or pointer event.
  - At 2,000 ms visible and one interaction it sends one `fetch('/api/screening/opened', { method: 'POST',
    keepalive: true, body: JSON { resultId } })` and removes its listeners. No storage, no cookie.
  - Route `public.screening_opened` (handler, POST, `phi: false`, bucket `screening_signal: { address: { hits: 120,
    windowSeconds: 3600 } }`, input `{ resultId: field(64) }`). A malformed token returns before the database. It
    always answers 204 with the same body.
  - The page's GET records nothing, so a mail scanner counts as no open. Converting also records the open.
- **Console decline.** `reviewProspect`'s input becomes `{ prospectId, status: 'contacted' | 'declined',
  declinedReason }`, the reason required when declining (`z.enum` of the list without `not_recorded`). The prospects
  page's decline form adds the select. Showing attribution, "From a screening" and replacement notices is PR 7.

### 4.12 Wording that changes (prospect-facing; text for the founder and counsel, Q1; the copy lint covers all)
- `apps/web/src/components/screening/result-summary.tsx`: the result page, with a converted variant.
- `apps/worker/src/screening/message.ts`: the result email.
- `apps/web/src/app/screening/results/[resultId]/not-found.tsx`: the closed link.
- `apps/web/src/components/screening/upload-form.tsx`: the email hint and the "About your practice" card.
- `apps/web/src/app/screening/page.tsx`: the "sent" alert.
- `apps/web/src/app/request-audit/page.tsx`: the form, which now collects attribution.
- `apps/web/src/components/screening/convert-form.tsx`: one sentence on the summary kept with the request.

---

## 5. Files to change

**Migration and database**
- `packages/db/migrations/20261104090000_free_screening.sql`: §2.2 and §4, and the header.
- `packages/db/src/schema/screening.ts` (Drizzle: four tables; new prospect and run columns),
  `packages/db/src/schema/onboarding.ts` (`prospect_request` columns, the closed lists); exports in `schema/index.ts`
  and `@tp/db/runtime`.
- `packages/db/src/migrate.db.test.ts`: the table and owner list gains the four tables.
- `packages/db/src/screening.db.test.ts`: SEC-17 at nine tables and the new timestamps; the grants test's `forApp`
  (`screening_result_opened`, `screening_lead_withdraw`, `console_register_marketing_campaign`) and `forOperator`
  (`operator_screening_run_keys`, `operator_screening_run_records`, `operator_screening_reminders_due`,
  `operator_screening_reminder_sent`), its filter widened to `%marketing%`; the tests of §6.
- `packages/db/domain-model/areas.json`: the four tables in `billing`, its `about` updated.
  `divergence-explanations.json`: the CO-12 screening entry rewritten for nine tables, the new definer functions and
  the outcome, lead and campaign rules; an entry for any new `prospect_request` divergence `--strict` reports.
  `docs/product/domain-model.md` regenerated **last**.

**Worker**
- `apps/worker/src/price/keyed-release.ts` (new) and its test.
- `apps/worker/src/screening/job.ts` (flow, failure code, phase timings), `operator.ts` (`releaseRecords`, new
  `runKeys` and `runRecords`, `completeRun`'s withdrawal argument, the `expire` result's `leads`), `adapter.ts`
  (compact memo, key checks), `expiry.ts`, `message.ts` (wording).
- `apps/worker/src/screening/test-support/legacy-adapter.ts` and `legacy-release.ts` (new oracle);
  `release-cache.db.test.ts` (new), `adapter.test.ts`, `screening.db.test.ts`, `message.test.ts`.
- `packages/observability/src/fields.ts` and `fields.test.ts`: `elapsed_ms` and `record_count` (numbers).

**Web**
- `apps/web/src/proxy.ts`; `apps/web/src/lib/http/attribution.ts` (new); `apps/web/src/lib/http/rate-limit.ts`
  (`screening_signal`).
- `apps/web/src/lib/screening/routes.ts` (submit attribution, `screeningOpened`, `SCREENING_ROUTES`);
  `apps/web/src/app/api/screening/opened/route.ts` (new).
- `apps/web/src/lib/screening/labels.ts` and `messages.ts`.
- `apps/web/src/components/screening/upload-form.tsx`, `opened-signal.tsx` (new), `result-summary.tsx`,
  `convert-form.tsx`; `apps/web/src/app/screening/page.tsx`; `apps/web/src/app/screening/results/[resultId]/page.tsx`
  and `not-found.tsx`.
- `apps/web/src/lib/routes/onboarding.ts` and `apps/web/src/app/request-audit/page.tsx`;
  `apps/web/src/lib/routes/console-onboarding.ts` and `apps/web/src/app/console/prospects/page.tsx`.
- `apps/web/src/lib/routes/index.ts` and `registry.test.ts`; `onboarding-routes.db.test.ts`,
  `console-routes.db.test.ts`, `apps/web/src/lib/screening/routes.db.test.ts`, `apps/web/e2e/screening.spec.ts`.

**Synthetic data and tools**
- `packages/synth/src/release/scale.ts`, `packages/synth/src/screening/uploads.ts` (new, with tests), exported from
  `packages/synth/src/index.ts`.
- `tools/release/scale.ts` (new, with a test).
- `tools/screening-capacity/{run,limits,env,containers,measure,uploads,oracle,report}.ts` (new) and tests of the pure
  parts; scripts in `tools/package.json` and the root `package.json` (`screening:capacity`).
- `.github/workflows/screening-capacity.yml` (new); `tools/test/workflows.test.ts`.

**Docs**
- ADR 0062: "The release read", "Capacity under production limits", "Outcomes, leads and attribution", "The CO-04
  amendment"; amends "cached per process by release, manifest and ZIP" and "Every row expires 30 days after the
  upload".
- `docs/product/reconciliation-001.md` Approval: the 2026-10-20 rulings (#53 parts 1 and 2, #57's schema, the CO-04
  amendment) and the answers to §7. `change-order-001.md` stays as written.
- `docs/product/test-matrix.md`: SCR-08 to SCR-14.
- `docs/runbooks/screening-capacity.md` (new: reading a result, the split verdict, what to do when it is red).
- The PR 6 approval summary, rewritten after regeneration.

---

## 6. Tests that prove each rule

| Rule | Test |
| --- | --- |
| Equal output, fixture (SCR-09) | `release-cache.db.test.ts`: §2.3, every stored row deep-equal to the oracle's through the job; none `ENGINE_ERROR`; the oracle files imported by tests only |
| Equal output, production shape | Capacity step 9: SHA-256 of upload 1's stored rows equals the oracle's, for each shape |
| One copy per release | `release-cache.db.test.ts`: 16 runs at 16 ZIPs read the shared types once, hold one entry and read keys and records per run |
| No silent "not found" | `keyed-release.test.ts`: for each of the five types, a key outside `requested` throws and sets `violation` (first kept); a key inside but absent returns null with no violation. `release-cache.db.test.ts`, through the job and the real engine: a view missing one `pfs_rvu` key, and one missing a code's `mppr_rate` key, each fail the run as `RELEASE_READ_OUTSIDE_FETCH`, the batch unrecorded, no stored row `ENGINE_ERROR`; a row code outside `codes`, and codes priced unequal to `codes`, fail the same way |
| SQL reads exactly the keys | `screening.db.test.ts`: `operator_screening_release` returns no keyed type; `operator_screening_run_keys` returns the run's distinct Medicare codes and its ZIP; `operator_screening_run_records` returns those keys' records and nothing else; nothing for a run not pricing or a re-manifested or withdrawn release; no caller-supplied codes |
| Compact memo | `adapter.test.ts`: outcomes equal the legacy pricer's on SCR-02's rows; no `PricingTrace` retained |
| Limits from production | `limits.test.ts`: web and platform 256/512 from `environmentSettings('production')`; t4g.medium 2/4096; gp3 3,000 IOPS and 125 MiB/s; unknown class or type throws; Postgres memory by the runner rule; too small on CPU or memory |
| Production fidelity | `env.test.ts`: every `NODE_ENV` read in `apps/worker/src` and `packages/*/src` (tests aside) is on `env.ts`'s list |
| Verdict rules | `report.test.ts`: without `compute.screening`, 120 s is "open, PR 6b" and the job passes; with it, 47.9 s passes, 48.1 s fails ("allowance"), 60.1 s fails ("promise"); an OOM, a restart, a 91% anon sample, an unapplied limit (CPU, memory, `io.max`, round trip under 2 ms), a wrong row count, an unfinished upload, an `ENGINE_ERROR` row or a hash mismatch each fail with its reason; no link or token in the report |
| Synthetic release | `tools/release/scale.test.ts` (small shape): every record synthetic, manifest valid, 900_100 reserved and unused, loader takes it only with the synthetic option; `packages/synth` tests: counts follow the shape |
| Uploads | `uploads.test.ts`: the practice shape equals the large test's rows; the worst shape has 50,000 distinct priced lines, at least 15,000 codes, all 150 pooled codes, at least 50% pooled, at least 10% in a change band, 11+ claim lines and at most $25,000 a line |
| Workflow wiring | `workflows.test.ts`: pinned `ubuntu-24.04`; schedule, dispatch, push and pull-request path lists as §3.5; concurrency by commit for pushes, cancelling only pull requests; `timeout-minutes`; `contents: read`; `notify` alone has `issues: write`, needs `capacity`, skips pull requests, has no checkout; artifact `if: always()` |
| Capacity (SCR-08) | The workflow run itself |
| SEC-17 at nine tables | `screening.db.test.ts`: no PHI-shaped name, no `date` type, the listed timestamps, no `practice_id`, no registry row, owner-only policy, no grants; no integer count, `_cents`, `claim_lines`, timestamp or day count on `screening_outcome` |
| Grants | `screening.db.test.ts`: each definer granted to its one role and none to PUBLIC; `screening_freeze_lead` and every helper invoker and ungranted; the onboarding test holds the new `submit_prospect_request` to tp_app |
| Closed lists | `apps/web/src/lib/routes/onboarding-routes.db.test.ts`: each list's TypeScript equals the literals `pg_get_constraintdef` prints for every CHECK using it |
| Console review as tp_app (finding 1) | `apps/web/src/lib/routes/console-routes.db.test.ts` after the migration: `reviewProspect` contacted and declined (with a reason) and `convertProspect` succeed as tp_app; the previous image's decline (no reason) stores `not_recorded`; a contacted row with a reason, a declined row's status or reason change, and `not_recorded` through the route are refused |
| Backfill | `packages/db/src/migrate.db.test.ts`: migrate a temporary directory to the migration before, insert a declined request as the owner, apply the rest; its reason becomes `not_recorded` and `reviewed_at` is unchanged; the exception refuses any other change |
| Outcome lifecycle (SCR-10) | `screening.db.test.ts`: written on submit, refusal, completion (shares floor-sum 97–100; the difference band at 0, 99,999 and 100,000 cents and each edge, `none` for null and 0; anomaly band from `screening_standing`'s count) and failure; channel from medium and click kind; campaign listed, `other`, null; `retried` set by a later accepted upload of the practice and not by another practice's; fixed columns refuse change; flags and open band set once; unlinked on expiry and replacement; a sealed row refuses change; DELETE and TRUNCATE refused |
| Re-linking (finding 6) | Same file: after expiry, and after the lead's and the request's deletion, no outcome column equals an exact count, date or sum held by any lead, request or audit event; no audit event names an outcome; while a lead is kept, its outcome is found by month and release (documents the stated linkage) |
| Leads (SCR-11) | Same file and `routes.db.test.ts`: frozen at conversion, sums equal to `screening_result_summary` and `_coverage`; labels version equal to `labels.ts`; frozen at completion when consent is set, refused without a withdrawal token; attribution and `first_opened_at` copied; `expires_at` 12 months on; delete before expiry refused unless replaced, withdrawn or the request is gone |
| Replacement (SCR-14) | Same file: a converted lead is replaced at the completion of the practice's next screening, the new lead carries the request and `screening_lead_replaced` names it; a failed or uncompleted replacement leaves the old lead; a ZIP-and-name match from another email replaces it the same way; the product CHECK refuses 10 and takes 11; a refused upload deletes no lead |
| Withdrawal and reminder | Same file: withdrawal deletes the lead and its products with its event, an unknown token does nothing; reminders due only for consent leads within the window, sent once |
| First open | `routes.db.test.ts`: `screening_result_opened` sets the run, outcome and lead once; a conversion without a signal sets them; a lead frozen after the open copies it |
| Attribution (SCR-12) | `attribution.test.ts` (normalisation of capitals, spaces and `+`; drop; encode; click kinds by presence, never the value); a proxy test (sets once, never overwrites, never on `/api` or `_next`); `routes.db.test.ts` and the onboarding routes' db test: both forms store source, codes, click kind and firm; conversion copies them and sets `from_screening`; `marketing_channel` mapping table |
| Opened by a person (SCR-13) | `opened-signal.test.tsx` (fake timers): no send on load, none after 2 s without interaction, one after both (each event, `focusin` included), never twice; the result page's GET records nothing; the route answers alike for unknown, expired and valid tokens |
| End to end | `apps/web/e2e/screening.spec.ts`: land with `utm_*` and a `gclid`, screen, open, scroll, opened recorded, convert, the request carries attribution and `from_screening`, the result page shows the converted wording; console decline with a reason |
| Wording | `result.test.tsx` (both variants), `message.test.ts`, form tests, the copy lint |
| Invariants | `pnpm test:db` (catalog and cross-tenant) unchanged and green; `pnpm db:domain-model --check --require-approval` after the founder signs |

---

## 7. Founder questions (recommendation first)

**Q1. The wording on every surface that deletes or collects** (counsel reviews before the screening opens).
- **Recommended:**
  - Result page: "This link opens it until {date}, or until a later screening for the same practice or from the
    same email address replaces it. Then we delete the result: its rows and figures, and the practice name, ZIP
    code and email address you gave. We keep a record of counts that names no one: ranges for how many rows the file
    had, how many were left out and how many were anomalies, a dollar range for the anomalies, what share of the
    allowed dollars could be priced, how you heard of us and the kind of link you came from, whether and how soon the
    result was opened and whether an audit was requested, the rule release used, and the month."
  - Result page after converting: "Because you requested an audit, we keep this screening's totals, with your
    practice name, ZIP code, email address and how you heard of us, with your request for 12 months from the
    screening. This link still closes on {date}. We also keep a record of counts for every screening that names no
    one; while we keep your request, yours can be matched to it."
  - Email: "The link opens it for 30 days from your upload, or until a later screening for the same practice or from
    this address replaces it. Then we delete the result and your details, and keep only a record of counts that names
    no one: ranges of the file's rows and dollars, the shares priced, how you heard of us, whether the result was
    opened or an audit requested, the release and the month."
  - Closed-link page: "...and then the result and the details given with it are deleted. We keep only a record of
    counts that names no one."
  - Upload form, email hint: "The result is emailed here as a link that opens it for 30 days, or until a later
    screening of the practice replaces it. Then we delete the result and what you enter here, and keep only a record
    of counts that names no one." The "About your practice" card: "Used to price your file at your locality and to
    send the result."
  - "Sent" alert, added: "Then we delete it with your details, and keep only a record of counts that names no one."
  - Request-audit form: "We keep your request, with how you heard of us and the campaign link you came from, to
    follow up on it." (#51 adds the period.)
  - Convert form: "Your request includes this screening's totals, which we keep with your request for 12 months from
    the screening."
  - PR 6e adds the consent line.
- **(b)** "We keep anonymous counts." Gives up saying what is kept. Counsel may not accept "anonymous", and it is not
  true while a request is kept.
- **(c)** Keep today's wording. Not possible while outcomes are kept: it would reverse the CO-04 amendment.

**Q2. The source list.**
- **Recommended:** a search engine; my billing firm; a colleague or another practice; a professional association
  (APTA, AOTA, ASHA or a state chapter); a conference, webinar or event; LinkedIn or other social media; an email
  from PaidWhole; an article, newsletter or podcast; something else. Optional.
- **(b)** Free text. Gives up counting, and can hold anything typed.
- **(c)** A shorter list. Gives up telling associations and events apart from colleagues.

**Q3. The lost reasons on decline.**
- **Recommended:** stopped responding; not now; price; too little to recover; chose another vendor or their billing
  firm; doing it themselves; could not provide remittances or contracts; their compliance or security review said
  no; not a fit; not a prospect (spam, vendor, student, duplicate); other.
- **(b)** Five reasons (no response, price, not a fit, chose other, other). Gives up the reasons that steer the product.

**Q4. How long a converted prospect's frozen summary is kept.**
- **Recommended (a):** 12 months from the screening, as a consenting prospect's. One rule and one sentence.
- **(b)** As long as the audit request (#51 sets that). Gives up a single stated period.
- **(c)** Not beyond 30 days without consent. Gives up the summary at the scoping call for prospects who did not tick.

**Q5. The attribution cookie.**
- **Recommended (a):** first-party, HttpOnly, 30 days, first touch, holding the three campaign codes and the kind of
  paid click (never the click ID).
- **(b)** Session only. Gives up every prospect who comes back another day.
- **(c)** Last touch. Gives up the channel that first brought them.
- The privacy notice (#51) discloses whichever is chosen.

**Q6. How long counts-only outcomes are kept.**
- **Recommended (a):** no end date. They name no one once unlinked and once the prospect's lead and request are gone.
- **(b)** A fixed period (for example seven years). Gives up long-run cohort trends, and adds a deletion job.

**Q7. If the capacity test is red when release 1 is ready.**
- **Recommended (a):** the public screening does not open until the latest run on the image being deployed is green
  with time enforced. Keeps CO-04's promise; PR 6b sizes its consumer to meet it.
- **(b)** Open with PR 6b's honest "this can take a few minutes" when the queue is deep, and treat 60 s as a target.
  Gives up the stated promise.

**Q8. Which file the 60-second promise covers** (CO-04: "under 60 seconds for 50,000 rows").
- **Recommended (a):** any accepted 50,000-row file, the worst shape included. PR 6b sizes the consumer to it and
  reports its size and monthly cost before building, since that may exceed the roughly $18 a month accepted.
- **(b)** A realistic practice file, and the page says "usually". Gives up a guarantee for large or unusual files.
- **(c)** Lower the row cap until the worst shape meets 60 s on the accepted consumer. Gives up the largest practices.

**Q9. Where the time check fails** (was open item 4).
- **Recommended (a):** at 48 s until staging measures how much faster the runner's cores are than Fargate's, then at
  60 s scaled by that factor. Gives up nothing on Fargate; on the runner, a run between 48 and 60 s fails though it
  met the promise there.
- **(b)** At the literal 60 s, with 48 to 60 s a warning. Gives up the margin: a run that passes on a faster runner
  core may miss 60 s on Fargate.

**Q10. How PR 6 merges while time cannot yet pass** (D4 (a): merge when CI is green).
- **Recommended (a):** the split verdict of §3.4. The job fails on everything PR 6 controls and reports time as
  "open, PR 6b" until `environments.ts` declares the screening consumer; from then on time fails the job. The switch
  is in code and tested. Gives up enforcing time before PR 6b. The screening cannot open before then anyway (Q7),
  and PR 6 still fails on every check it controls.
- **(b)** Enforce time now and merge PR 6 with a red, non-required check. Gives up the green-CI rule.
- **(c)** Hold PR 6 until PR 6b is built and merge them together. Gives up landing PR 6's schema and read now, and
  delays PR 6's approval and everything queued behind it.

**Q11. May a later screening from a different email replace a summary kept with an audit request?** (with counsel)
- **Recommended (a):** yes, when it matches the practice by ZIP and name, at its completion, carrying the request,
  with the replacement shown on the request in the console. Keeps one summary per practice, so two cannot be
  subtracted into a small cell. Gives up protection against someone outside the practice resending a file under its
  name and ZIP; the console notice and the new contact address make that visible.
- **(b)** Only the same email replaces it. Gives up either one summary per practice (two could be subtracted) or the
  other person's ability to convert.

**Q12. Whether an outcome records that the screening converted.**
- **Recommended (a):** yes (`converted`, with the open band). It measures conversion by what the screening showed
  (shares, anomalies, opened). The wording says that while a request is kept, its outcome can be matched to it.
- **(b)** No. Conversion is counted from requests by month, source, channel and campaign. Gives up conversion by
  result and whether opening predicts converting. In return no outcome ever matches a request.

---

## 8. Out of scope
- #53 parts 3 and 4 (PR 6b): the screening's own consumer, role and login, two at a time, the task and daily row caps,
  time-to-email metrics and alarm, the "few minutes" message, the small-behind-large scheduling, and the choice of a
  keyed-record cache.
- Consent capture and its wording, the withdrawal page and route, the reminder job and emails (PR 6e, on PR 6's SQL).
- The console funnel, lead list, scorecard, campaign registry screen, attribution and replacement notices on the
  prospects page, and their read functions (PR 7).
- The privacy notice, cookie disclosure, legal-text store and audit-request retention (#51's legal-surfaces PR).
- Keyed reads for price jobs, triage and reports, the explicit heap limit, and the loader at real size (#31). The keyed
  view is built here to be reused there.
- ZIP+4 (PR 6b), email streams (#76), the engine, golden lines and committed fixture releases.
- Calibrating the runner against Fargate (needs staging).

## 9. Open items
1. PR 6 merges `claude/build-platform` (262d37d) before adding the workflow, and again after PR 5 merges (HANDOFF).
2. The weekly schedule fires only once the default branch carries workflows (#54).
3. A private repository's 2-vCPU, 7 GB runner gives Postgres 1 CPU and 3.5 GiB (harsher). A larger runner can be named
   once the Team organization exists.
4. PR 6b declares `compute.screening` (size and concurrency) in `environments.ts`, which switches the time verdict on;
   sizes the consumer from the measurements and Q8 and Q9; makes small-behind-large pass; and chooses the keyed-record
   cache from the keyed read's measured seconds.
5. PR 6e builds consent, withdrawal and reminders on PR 6's columns and functions, with no migration.
6. PR 7's funnel, lead-list and campaign-list read functions make PR 7 a schema PR needing approval (not on the HANDOFF
   list today).
7. The six-argument `submit_prospect_request` is dropped once no image calls it.
8. Counsel: the reworded surfaces and the cookie disclosure; keeping a converted prospect's summary 12 months without
   consent; that unlinked outcomes are not personal data, and the stated linkage while a lead or request is kept
   (§4.9); a different email replacing a request's summary (Q11); the small-cell questions (ADR 0062), now also
   covering the lead's left-out sums.
9. The scale-release counts follow CMS's public files; #31 re-checks them against release 1's real sources.
10. After the build: regenerate the domain model, rewrite the approval summary, and ask the founder for the new SHA-256
    (with the PR 6 limits still awaiting confirmation: $25,000 a claim line, 100,000 claim lines a row, the free-mail
    list).
11. `proxy.ts`'s "reads no cookie" becomes "reads and sets only the attribution cookie"; ADR 0062 records it.
12. **For the orchestrator, #51.** #51 places the screening checkbox, stored by version, in PR 6. Its column belongs in
    this migration so PR 6 asks for one approval; proposed: `screening_prospect.screening_terms_sha256 text NOT NULL
    CHECK (~ '^[0-9a-f]{64}$')`, the SHA-256 of the accepted text. Its wording is the founder's and counsel's.
    #51's request deletion cascades to `screening_lead`. HEAD's `screening_run.converted_prospect_request_id` has no
    ON DELETE action, and `screening_run_converted` ties it to `converted_at`. So #51's job deletes a request only after
    its converted run has expired (30 days at most), or #51's migration gives that key an action.
13. The tracker links the open `screening-capacity` issue.

---

## 10. Review (independent review of 2026-10-20; each finding checked against the code)

| # | Finding | Verdict | What changed |
| --- | --- | --- | --- |
| 1 | prospect_request CHECKs call functions tp_app cannot execute | Real (tp_app updates the table directly in `console-onboarding.ts`; migration 20261030110000 fixed the same bug) | Lists written inline in every CHECK, no validator functions; trigger body built-ins only; equality test reads `pg_get_constraintdef`; tp_app tests of contacted, declined, convert and the previous image's decline (§4.1, §4.5, §6) |
| 2 | A lookup outside the fetch does not fail the run | Real (`attempt()` line 243, MPPR `try/catch` line 678) | Sticky violation checked by the pricer after every engine call; `RELEASE_READ_OUTSIDE_FETCH` before the batch is recorded; the key set returned by `operator_screening_run_keys` and asserted against the rows; real-engine tests for a missing `pfs_rvu` and `mppr_rate` key (§2.2, §6) |
| 3 | The capacity job red on PR 6 with no merge rule | Real | Split verdict. One departure from the proposed fix: a single upload alone is reported, not failed, until the consumer exists, because finding 4 shows the worst shape alone cannot meet 60 s at a quarter vCPU, which PR 6 does not control. PR path filter narrowed; migrations and lockfile on push only, except screening migrations; Q10 (§3.4, §3.5) |
| 4 | The first run is likely red for every upload; which file the 60 s covers | Real | Two shapes measured alone and concurrently; §3.8 corrected; Q8 |
| 5 | Founder decisions in open items; one against the ruling | Real | Withdrawal and reminder columns and SQL in PR 6, as the ruling puts #57's columns there (no question needed); open item 4 is Q9 (§4.4, §7) |
| 6 | Unlinked outcomes can be re-linked | Real | Counts, left-out and anomaly rows and first open as bands; `converted boolean` replaces the day count; the linkage stated plainly in §4.9, Q1 and to counsel; structural re-linking test; Q12 |
| 7 | The deletion wording leaves out what is kept and turns false after conversion | Real | Every kept category listed; converted variant; upload form, "sent" alert and request-audit form added (§4.12, Q1) |
| 8 | A converted prospect who resends loses the summary | Real | The request is carried over. One change beyond the proposed fix: the old lead is replaced at the new screening's completion, not at submission, so a failed or abandoned resend deletes nothing. Replacement event on the request; Q11 (§4.4, §4.9) |
| 9 | Converted leads never record the first open | Real | `screening_run.first_opened_at`; the freeze copies it; conversion records the open; `focusin` (§4.2, §4.11) |
| 10 | No campaign, partner or refusal answers after 30 days | Real | The lead copies the attribution; campaign on outcomes only from `marketing_campaign`; `retried`; click-ID presence maps to paid channels (§4.1, §4.3, §4.6) |
| 11 | Trigger rules contradict the backfill | Real | One exception spelled out; `reviewed_at` otherwise as HEAD (§4.5) |
| 12 | Missing tests and files would turn CI red | Real (`migrate.db.test.ts` table list; the grants test requires ungranted `%screening%` functions to be invoker) | Both tests updated; `screening_freeze_lead` invoker; CO-12 text rewritten (§5) |
| 13 | The oracle is not independent; the fixture misses the differing days | Real | `adapter.ts` and the read path frozen whole; fixture adds the unused-code and unused-pair changes, conversion factor and sequestration changes, and a code with no `pfs_rvu` (§2.3) |
| 14 | The keyed read is always cold; the worst upload may not exercise it | Partly | Worst shape at 15,000+ codes, every pooled code; keyed-read seconds and records reported per run. Not adopted: the cross-run cache, because it cannot shorten the worst shape (cold codes), typical files read a few hundred records, and it holds memory the 512 MiB task needs. PR 6b decides from the measurement (§2.2, open item 4) |
| 15 | The harness is less faithful than claimed | Real | NODE_ENV reads listed and held by a test (no production mail escape, reason given); other platform jobs run and are reported; anon memory and `memory.events`; browsers closed and the oracle in a child process; too small on memory; CPU pinning; `netem` and `io.max`, verified; the differences listed with their direction (§3.1) |
| 16 | Workflow details | Real | Pushes grouped by commit, only pull requests cancelled; failure opens or updates an issue from a separate job with the only write permission; summary corrected (§1, §3.5) |
| 17 | Small schema and coordination points | Real | Bands `none` for null and 0 or less; UTM normalisation; `prospect_request_id ON DELETE CASCADE` with the delete rule; #51's PR 6 column raised for the orchestrator (open item 12) |


## Founder ruling (2026-10-20)
The founder accepted the recommended answer to every question in this design (see scratchpad/design/decisions-2026-10-20.md). Build to the recommended answers and record each ruling in the ADR.
