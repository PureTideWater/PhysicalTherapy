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
3. Builds the SYNTHETIC scale release 900100 (2,245,245 invented records) in a step of its own when the Actions cache
   has none for the hash of its generator, and saves it straight after, so a failing measurement still caches it.
   Starts Postgres with its limits, a 1 GiB `/dev/shm`, gp3's I/O baseline (io.max) and a 1 ms delay each way (netem on
   Postgres's interface and on the host's end of its link), waits until a client container reaches it over TCP, runs
   the migration image's migrations and logins (a failure's stderr goes to the job's log and its last lines to the
   report), loads the release and approves a place-of-service split as a synthetic specialist.
4. Starts web and platform and reads every limit back (docker inspect, io.max, the median of 50 `SELECT 1` round trips
   from a client container, at least 2 ms).
5. Runs five scenarios: S1 the worst shape alone, S2 the practice shape alone (fresh platform), S3 the practice shape
   again in the same container, S4 three worst-shape uploads at once (variants 1 to 3, differing from S1's and from
   each other in most of their codes) with a small one behind them, S5 the same with the practice shape. S1, S4 and S5
   first stop web and platform, restart Postgres with the page cache dropped, and start both again (both recorded). The
   small upload is sent once the three large runs exist, and each pricing job's queue and start times are recorded. Each
   upload's page reads its file first (not timed); the time runs from the server action's request to the email in the
   outbox. No scenario starts after 60 minutes of the harness, and one still running at 70 ends there.
6. Stops web and platform and compares S1-1, S2-1 and S3-1 (the last priced from the shared types the platform held)
   with the oracle (the old read path and adapter, frozen at 3c1b289) by SHA-256, each over all of its upload's Medicare
   rows; then removes Postgres.
7. Writes `screening-capacity.json` (format `tp-screening-capacity/3`) and `summary.md` after every scenario and at the
   end, and saves each container's stdout and stderr to `logs/<setup or scenario>-<service>.log` (IDs, codes and
   numbers by the logger's allowlist, result links masked) before removing it; all three go to the run's artifact,
   and the summary to the job summary.
8. Writes the image layer cache (mode=min) only on a push to `claude/build-platform`; every run reads it.

## Reading a result

- The job summary's first line gives the verdict and how time was judged: `time open, PR 6b` until
  `infra/lib/environments.ts` declares the screening's consumer (`compute.screening`), `time enforced` after. A
  declared consumer the harness does not run yet fails as `consumer not run`: set `HARNESS_RUNS_SCREENING_CONSUMER`
  (`tools/screening-capacity/limits.ts`) only once the harness runs the consumer's service and concurrency.
- The uploads table gives, per upload, the seconds to email and each phase's seconds: the shared types' read (or 0 when
  held from an earlier run), the keyed read with its record count, pricing, recording, the queue wait (from the
  submission to the job's first phase line), and when its pricing job was queued and started. In S4 and S5 the later
  uploads wait for the earlier ones, the small one last: the platform prices one run at a time.
- The containers table gives each scenario's anonymous memory peak against the limit (the failing line is 90%),
  `memory.peak` (page cache included), how often the limit was reached, OOM kills and CPU throttling.
- `screening-capacity.json` adds the runner, the limits applied beside production's, the departures and which way each
  moves the result, the release's manifest hash, the shapes' counts, the platform jobs that ran and the oracle's hashes.
  It holds no row, link or token.

## When it is red

1. Read the failing checks at the end of the summary. Each names its scenario and container or upload. `run not
   finished` names the step that stopped and the last lines of its stderr; the whole stderr is in the job's log
   (`[capacity] … stderr:` lines), and each container's log is in the artifact's `logs/`. "node: OpenSSL configuration
   error … Permission denied … /etc/ssl/openssl.cnf" there means the image's user cannot traverse /etc/ssl: an `ADD` or
   `COPY` with `--chmod` into it gives that mode to the directories (moby/buildkit#5943; run 39536429652). The images'
   build now fails on it before the harness runs.
2. `runner too small`, `limit not applied` or `cold start not applied`: the measurement did not happen under
   production's limits; nothing about the screening is known from it. Check the runner image (cgroup v2, sudo for `tc`,
   `nsenter`, `ip` and `drop_caches`), Docker's data root's device, and `docker inspect` of the named container. Run
   again once fixed. `partial run` or `deadline`: not every scenario ran (`--scenarios`, or the harness's own deadline);
   the verdict needs S1 to S5.
3. `OOM kill`, `restart or exit`, `memory above 90%`: the screening does not fit its task. This is a defect of the
   screening or of the consumer's size: reproduce with the same shape (`--scenarios S1`), read the phases' record
   counts, and fix before merging. PR 6b's consumer is sized from these figures. `restart or exit` with "JavaScript
   heap out of memory" in the service's log (the artifact's `logs/`) is Node's heap limit, which it sets from the task's
   memory (about half of 512 MiB), reached before the cgroup's: no OOM kill is counted. A service that exited is started
   again before the next scenario, so the later scenarios are still measured. `OOM kill: … postgres` or `restart or
   exit: … postgres`: a backend met Postgres's memory limit, or the server went down; the runs that retried after it
   are not a measurement.
4. `row count`, `rows still pending`, `ENGINE_ERROR rows`, `stalled`, `not emailed`, `result link did not open`,
   `result's last page of groups did not open`, `queue order`, `submission time not captured`: the result is wrong or
   unfinished, or the scenario did not have its shape. Read the platform's log in the artifact (IDs and codes only) for
   the run's `error_code`; `RELEASE_READ_OUTSIDE_FETCH` means a lookup outside the keys the
   run fetched, a defect of the key set or the engine's reads (ADR 0062, The release read). A result page that does
   not open while web's log says "JavaScript heap out of memory" is the page holding more than its one page of groups:
   run `apps/web/src/lib/screening/result-page.large.db.test.ts`, which renders the worst shape under a 512 MiB heap
   (ADR 0062, The result page holds one page of groups).
5. `oracle mismatch`, `oracle not compared` or `oracle compared N rows`: the new read path priced a row differently
   from the old one, or the comparison did not cover the upload's Medicare rows. Treat it as a pricing defect: run
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
