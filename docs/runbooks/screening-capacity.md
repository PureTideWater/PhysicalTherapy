# Screening capacity

Trigger: `.github/workflows/screening-capacity.yml`, weekly (Monday 06:41 UTC, once the default branch carries the
workflows), on request, on pushes to `claude/build-platform` that touch its paths and on pull requests that touch the
screening, pricing, the harness or the images (audit #53 part 1; docs/adr/0062, "Capacity under production limits";
the founder's rulings of 2026-10-20, decisions 13 to 16). This runbook is for reading a result, and for what to do
when it is red. Synthetic data only: the release and the uploads are generated, and no credential is used.

## What the job does

1. Builds both production images from their Dockerfiles and runs `pnpm screening:capacity`
   (`tools/screening-capacity/run.ts`) with the harness and Chromium on every CPU but the last.
2. Reads production's limits from `infra/lib/environments.ts` and `infra/lib/constructs/database.ts` (web and platform
   a quarter vCPU and 512 MiB with no swap; Postgres db.t4g.medium's 2 vCPU and 4 GiB on gp3) and sizes Postgres to the
   runner: min(2, CPUs less one) CPUs and min(4 GiB, the runner less 3.5 GiB). A runner of one CPU, or one that leaves
   Postgres under 2 GiB, stops the run as "runner too small".
3. Builds the SYNTHETIC scale release 900100 (2,245,245 invented records; kept in the Actions cache by the hash of
   its generator), starts Postgres with its limits, gp3's I/O baseline (io.max) and a 1 ms delay each way (netem),
   runs the migration image's migrations and logins, loads the release, approves a place-of-service split as a
   synthetic specialist, and restarts Postgres so the first scenario starts cold.
4. Starts web and platform and reads every limit back (docker inspect, io.max, the median of 50 `SELECT 1` round trips,
   at least 2 ms).
5. Runs five scenarios: S1 the worst shape alone (fresh Postgres and platform), S2 the practice shape alone (fresh
   platform), S3 the practice shape again in the same container, S4 three worst-shape uploads at once with a small one
   behind them, S5 the same with the practice shape. Each upload's page reads its file first (not timed); the time
   runs from the server action's request to the email in the outbox.
6. Compares upload 1 of S1 and of S2 with the oracle (the old read path and adapter, frozen at 3c1b289) by SHA-256.
7. Writes `screening-capacity.json` (format `tp-screening-capacity/2`) and `summary.md` to the run's artifact and the
   job summary.

## Reading a result

- The job summary's first line gives the verdict and how time was judged: `time open, PR 6b` until
  `infra/lib/environments.ts` declares the screening's consumer (`compute.screening`), `time enforced` after.
- The uploads table gives, per upload, the seconds to email and each phase's seconds: the shared types' read (or 0 when
  held from an earlier run), the keyed read with its record count, pricing, recording, and the queue wait (from the
  submission to the job's first phase line). In S4 and S5 the later uploads wait for the earlier ones: the platform
  prices one run at a time.
- The containers table gives each scenario's anonymous memory peak against the limit (the failing line is 90%),
  `memory.peak` (page cache included), how often the limit was reached, OOM kills and CPU throttling.
- `screening-capacity.json` adds the runner, the limits applied beside production's, the departures and which way each
  moves the result, the release's manifest hash, the shapes' counts, the platform jobs that ran and the oracle's hashes.
  It holds no row, link or token.

## When it is red

1. Read the failing checks at the end of the summary. Each names its scenario and container or upload.
2. `runner too small` or `limit not applied`: the measurement did not happen under production's limits; nothing about
   the screening is known from it. Check the runner image (cgroup v2, sudo for `tc` and `nsenter`), Docker's data
   root's device, and `docker inspect` of the named container. Run again once fixed.
3. `OOM kill`, `restart or exit`, `memory above 90%`: the screening does not fit its task. This is a defect of the
   screening or of the consumer's size: reproduce with the same shape (`--scenarios S1`), read the phases' record
   counts, and fix before merging. PR 6b's consumer is sized from these figures. `restart or exit` with "JavaScript
   heap out of memory" in the service's log is Node's heap limit, which it sets from the task's memory (about half of
   512 MiB), reached before the cgroup's: no OOM kill is counted. A service that exited is started again before the
   next scenario, so the later scenarios are still measured.
4. `row count`, `rows still pending`, `ENGINE_ERROR rows`, `stalled`, `not emailed`, `result link did not open`,
   `result's last page of groups did not open`: the result is wrong or unfinished. Read the platform's log in the job
   (IDs and codes only) for the run's `error_code`; `RELEASE_READ_OUTSIDE_FETCH` means a lookup outside the keys the
   run fetched, a defect of the key set or the engine's reads (ADR 0062, The release read). A result page that does
   not open while web's log says "JavaScript heap out of memory" is the page holding more than its one page of groups:
   run `apps/web/src/lib/screening/result-page.large.db.test.ts`, which renders the worst shape under a 512 MiB heap
   (ADR 0062, The result page holds one page of groups).
5. `oracle mismatch`: the new read path priced a row differently from the old one. Treat it as a pricing defect: run
   `apps/worker/src/screening/release-cache.db.test.ts`, find the first differing row by comparing the stored rows
   with `legacyOutcomes()` for the run, and fix before merging.
6. `time: ... fail`: only once time is enforced. Above 48 s on the runner while the runner-to-Fargate factor is
   unknown ("allowance"), above 60 s scaled by it once known ("promise"). The screening does not open while the latest
   run on the image being deployed is red (decision 13); PR 6b's consumer size, concurrency and row cap are the levers.
7. A failure outside a pull request opens or comments on the one issue labelled `screening-capacity`; close it when a
   run passes.

## Running it elsewhere

- With Docker: build the images as tagged in the workflow, then
  `taskset -c 0-$(( $(nproc) - 2 )) pnpm screening:capacity --out <dir> --release-dir <dir> --web-image tp-web:capacity --worker-image tp-worker:capacity`.
- Without Docker (a developer machine, cgroups under root): build the worker (`pnpm --filter @tp/worker build`) and the
  web app (`pnpm --filter @tp/web build`, then the static files and `public` beside the standalone server as
  `apps/web/scripts/start-standalone.sh` does), lay them out as the images do (a directory with `worker`, holding `dist`
  and `migrations`, and `web`, the standalone server), and run
  `pnpm screening:capacity --runtime process --images <dir> --admin-url <superuser URL> --database tp_capacity --out <dir>`.
  The web and platform processes run in cgroups at production's limits, their output in `<out>/logs`; Postgres is the
  server named, unlimited and warm, so the run reports its limits as not applied and never passes. Its times are
  indications, with the load average beside them. Roles belong to the whole server, so the run's four logins carry a
  suffix of its own and are dropped with its database (kept, and named, with `--keep-database`); while it runs, a test
  on the same server that lists a role's members (the billing test does) sees them, so run it on a server no test
  suite is using.
