# Screening capacity

Trigger: `.github/workflows/screening-capacity.yml`, weekly (Monday 06:41 UTC, once the default branch carries the
workflows), on request, on pushes to `claude/build-platform` that touch its paths, and on every pull request, where its
`screening-capacity gate` job measures only when a watched path changed (audit #53 part 1; docs/adr/0062, "Capacity
under production limits"; the founder's rulings of 2026-10-20, decisions 13 to 16, and of 2026-10-21, Q1, Q7 and Q8).
This runbook is for reading a result, for what to do when it is red, for making the gate a required check, and for
the launch check that opens production's screening. Synthetic data only: the release and the uploads are generated, and
no credential is used.

## What the job does

0. On a pull request, the `changes` job reads the changed file names (no install, no repository code) and measures
   only when one is watched (see "What the gate watches"). The `screening-capacity gate` job then passes at once when
   nothing watched changed, and otherwise only when the measurement passed.
1. Builds both production images from their Dockerfiles and runs `pnpm screening:capacity`
   (`tools/screening-capacity/run.ts`) with the harness and Chromium on Postgres's CPUs, as
   `pnpm -s screening:capacity --print-harness-cpus` gives them (0-1 on a 4-CPU runner).
2. Reads production's limits from `infra/lib/environments.ts` and `infra/lib/constructs/database.ts`: web and platform
   a quarter vCPU and 512 MiB with no swap; the screening consumer (`compute.screening`, PR 6b-3) one task of 2 vCPU and
   4 GiB pricing three screenings at once; Postgres db.t4g.medium's 2 vCPU and 4 GiB on gp3. Lays them out on the
   runner: Postgres on the class's 2 vCPU (CPUs 0-1, shared with the harness and Chromium), the consumer on the next
   2 (2-3), web and platform on the consumer's last (3); Postgres's memory is 4 GiB or what the runner leaves after
   every task and 2.5 GiB. A runner with fewer than 4 CPUs, or one that leaves Postgres under 2 GiB, stops the run as
   "runner too small": a private repository's 2-vCPU standard runner is refused until the 4-core larger runner exists
   (Q1 (d)).
3. Builds the SYNTHETIC scale release 900100 (2,245,245 invented records) in a step of its own when the Actions cache
   has none for the hash of its generator, and saves it straight after, so a failing measurement still caches it.
   Starts Postgres with its limits, a 1 GiB `/dev/shm`, gp3's I/O baseline (io.max) and a 1 ms delay each way (netem on
   Postgres's interface and on the host's end of its link), waits until a client container reaches it over TCP, runs
   the migration image's migrations and logins (the screening login among them; a failure's stderr goes to the job's
   log and its last lines to the report), loads the release and approves a place-of-service split as a synthetic
   specialist.
4. Starts web, platform (`WORKER_JOBS=platform`, which prices no screening since PR 6b-3) and the consumer
   (`screening-1`: the worker image with `WORKER_JOBS=screening`, `SCREENING_CONCURRENCY=3`, the screening and queue
   logins only, and production's command with its 896 MiB heap), waits for each worker's start line, and
   reads every limit back (docker inspect, io.max, the median of 50 `SELECT 1` round trips from a client container, at
   least 2 ms).
5. Runs five scenarios: S1 the worst shape alone with a small upload behind it, S2 the practice shape alone (fresh
   consumer), S3 the practice shape again in the same consumer (its first idle thread, which priced S2 and holds the
   shared types), S4 three worst-shape uploads at once (variants 1 to 3, differing from S1's and from each other in
   most of their codes) with a small one behind them, S5 the same with the practice shape. S1, S4 and S5 first stop
   every service, restart Postgres with the page cache dropped, and start them again (both recorded). Every upload is
   a different prospect at a domain of its own, so none crosses an account's daily share (Q7). The small upload is
   sent once the large uploads' pricing jobs are in pg-boss, and each pricing job's queue and start times are recorded.
   Each upload's page reads its file first (not timed); the time runs from the harness's click on "Screen the file"
   (before the browser sends the POST, so never after the web's receipt) to the email in the outbox. Each run's tier is read from the database, and the consumer's own time-to-email line (TimeToEmailMs) from
   its log. With `--static-asset-origin`, the pages' requests to that host are served from the web container's own
   `/_next/static/`. No scenario starts after 60 minutes of the harness, and one still running at 70 ends there.
6. Stops every service and compares S1-1, S2-1 and S3-1 (the last priced from the shared types the thread held) with the
   oracle (the old read path and adapter, frozen at 3c1b289) by SHA-256, and S1-2 (a ZIP split across localities, with
   its ZIP+4) with the whole-release oracle, each over all of its upload's Medicare rows; then removes Postgres.
7. Writes `screening-capacity.json` (format `tp-screening-capacity/4`: the consumer as measured, both image IDs, each
   upload's time, logged time and tier), its SHA-256 (`screening-capacity.sha256`, the value the launch check prints)
   and `summary.md` after every scenario and at the end, and saves each container's stdout and stderr to
   `logs/<setup or scenario>-<service>.log` (IDs, codes and numbers by the logger's allowlist, result links masked)
   before removing it; all four go to the run's artifact, and the summary to the job summary.
8. Writes the image layer cache (mode=min) only on a push to `claude/build-platform`; every run reads it.

## Reading a result

- The job summary's first line gives the verdict and how time was judged: `time enforced` since PR 6b-3, because
  `infra/lib/environments.ts` declares the screening's consumer (`compute.screening`) and the harness runs it
  (`HARNESS_RUNS_SCREENING_CONSUMER`). Settings with no consumer would read `time open, PR 6b`.
- The next line names the consumer as measured (tasks, vCPUs, MiB, screenings at once) and both image IDs.
- The uploads table gives, per upload, the seconds to email, the consumer's logged time (TimeToEmailMs, from the web's
  receipt) and tier, and each phase's seconds: the shared types' read (or 0 when held from an earlier run), the keyed
  read with its record count, pricing, recording, the queue wait (from the submission to the job's first phase line),
  and when its pricing job was queued and started. In S4 and S5 the three large uploads price at once, one thread
  each, and the small one waits for the first free thread.
- The containers table gives each scenario's anonymous memory peak against the limit for web, platform and
  `screening-1` (the failing line is 90%), `memory.peak` (page cache included), how often the limit was reached, OOM
  kills and CPU throttling.
- A line headed "Sizing question for the founder" appears when the worst time is above 44 s (within 8% of the 48-s
  line): the run still passes, and the builders take it to the founder before merge as a question of the consumer's
  size (open item O9), never as a tuning or a wider limit. It also shows on the pull request's checks: the harness
  posts a warning annotation ("Sizing question (O9)", naming the upload and its time), and the capacity job passes it
  to the gate, which prints it beside its pass.
- `screening-capacity.json` adds the runner, the limits applied beside production's, the departures and which way each
  moves the result, the release's manifest hash, the shapes' counts, the jobs that ran by queue and the oracle's
  hashes. It holds no row, link or token.

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
   `limit not applied: screening-1 …` means the consumer was not measured at the size environments.ts declares (or,
   on the process runtime, `CPU affinity … not 2-3`: a service whose affinity collapsed to the harness's CPUs; it is
   exec'd under `taskset` to prevent exactly that). `consumer not run` or `consumer not measured`: the harness did not
   run the declared consumer as production will.
3. `OOM kill`, `restart or exit`, `memory above 90%`: the screening does not fit its task. This is a defect of the
   screening or of the consumer's size: reproduce with the same shape (`--scenarios S1`), read the phases' record
   counts, and fix before merging. The consumer's main thread and each of its three pricing threads hold at most
   896 MiB of heap (Node gives every thread the process's `--max-old-space-size`), 3,584 MiB together, under 90% of its
   4 GiB; a thread out of memory logs `screening thread failed` with
   `SCREENING_THREAD_OUT_OF_MEMORY` and is replaced (`screening thread replaced`), its run claimed again. `restart or
   exit` with "JavaScript heap out of memory" in web's or platform's log (the artifact's `logs/`) is Node's heap limit,
   which it sets from the task's memory (about half of 512 MiB), reached before the cgroup's: no OOM kill is counted. A
   service that exited is started again before the next scenario, so the later scenarios are still measured. `OOM
   kill: … postgres` or `restart or exit: … postgres`: a backend met Postgres's memory limit, or the server went down;
   the runs that retried after it are not a measurement.
4. `row count`, `rows still pending`, `ENGINE_ERROR rows`, `stalled`, `not emailed`, `result link did not open`,
   `result's last page of groups did not open`, `queue order`, `submission time not captured`: the result is wrong or
   unfinished, or the scenario did not have its shape. Read the consumer's log in the artifact (`screening-1`; IDs and
   codes only) for the run's `error_code`; `RELEASE_READ_OUTSIDE_FETCH` means a lookup outside the keys the run
   fetched, a defect of the key set or the engine's reads (ADR 0062, The release read). `stalled` on the first scenario
   after the load, with the consumer's log silent, is the keyed read planned as a hash join of the whole release: the
   release loader analyzes and freezes `rule_record` once a load commits and `operator_screening_run_keys()` is
   estimated at one row, so it should not recur; check that the load step's log ends with the loader's result, and
   read the plan with `auto_explain` (`log_nested_statements`) on the kept database. A result page that does
   not open while web's log says "JavaScript heap out of memory" is the page holding more than its one page of groups:
   run `apps/web/src/lib/screening/result-page.large.db.test.ts`, which renders the worst shape under a 512 MiB heap
   (ADR 0062, The result page holds one page of groups).
5. `oracle mismatch`, `oracle not compared` or `oracle compared N rows`: the new read path priced a row differently
   from the old one, or the comparison did not cover the upload's Medicare rows. Treat it as a pricing defect: run
   `apps/worker/src/screening/release-cache.db.test.ts`, find the first differing row by comparing the stored rows
   with `legacyOutcomes()` for the run, and fix before merging.
6. `time: ... fail`: above 48 s on the runner while the runner-to-Fargate factor is unknown ("allowance"), above 60 s
   scaled by it once known ("promise"). Every upload is judged, the small ones behind the large included. The
   screening does not open while the latest run on the image being deployed is red (decision 13). The levers are the
   consumer's size and concurrency, and the share and cap, each the founder's (Q1, Q7); never widen the line.
7. `slots not used`: the first three large uploads of S4 or S5 did not price at once, so the consumer did not run its
   three threads (read `screening-1`'s log for `screening thread failed` or `screening threads could not be
   replaced`). `platform priced a screening`: the platform's log shows a run's phase or time-to-email line; the
   platform's jobs must not include `screening_price` (apps/worker/src/jobs/platform.ts).
8. `waiting tier`: a scenario upload went below normal priority (Q7: an account past its 100,000-row share of the UTC
   day, or the day past its 1,000,000-row cap). Every scenario upload is its own account and the run is far under the
   cap, so this is a defect of the tier (`screening_queue_tier()`) or of the uploads' domains (`uploads.ts`).
9. `time metric not logged` or `time metric out of bounds`: the consumer's TimeToEmailMs for the run is missing, above
   the time from the harness's click to its own line, or more than 2 s below the harness's time. The metric must start
   at the web's receipt of the upload (`screening_run.received_at`, the proxy's stamp) and end once the send returned and the completion
   committed; a value far below the harness's time leaves out the web's share, which the production alarm would then
   miss.
10. `request left for the static origin`: with `--static-asset-origin`, a page asked the static host for something the
    web container does not serve under `/_next/static/`. The measured web image was built with that origin
    (`STATIC_ASSET_ORIGIN`); pass the same value to the harness.
11. A failure outside a pull request opens or comments on the one issue labelled `screening-capacity`; close it when a
    run passes.

## Making it required (the founder's Q8)

The founder ruled on 2026-10-21 that the capacity test becomes a required check from PR 6b-3. The build makes the
check sound; the founder sets the rule:

1. GitHub → the repository → Settings → Rules → Rulesets → the ruleset that protects `claude/build-platform` (and the
   one that will protect `main` for the launch pull request).
2. Under "Require status checks to pass", add the check `screening-capacity gate` (source: GitHub Actions). Add the
   gate, never `capacity`: the measuring job is skipped on pull requests that change no watched path, and a skipped
   required job would leave them pending.
3. Save. From then on a watched pull request merges only after a passing measurement with time enforced (about 45
   minutes), and every other pull request passes the gate in about a minute.

Why it is sound: every pull request runs the workflow (no path filter on the trigger), so the gate is always reported;
the gate fails when the changed paths cannot be read, and when a watched change's measurement failed, timed out or was
cancelled. It runs whatever happened before it (`if: always()`), a cancelled run included: GitHub counts a job its own
condition skipped as passing a required check, so a gate that did not run after a cancel would have let a pull request
merge with no measurement. A run cancelled by a newer push fails its gate on the old commit, which no longer gates the
pull request; the new commit's own run reports.
Once the repository is private, its standard runner has 2 vCPU and every measurement stops as "runner too small" until
the founder creates the 4-core larger runner and its label replaces `ubuntu-24.04` in this workflow's `capacity` job and
in the release's capacity job (Q1 (d), open item O14).

### What the gate watches

`tools/screening-capacity/watched-paths.txt`, derived by `tools/screening-capacity/watched.ts` and never edited by hand:
every file the measured images and the harness run, so no change on the screening's path merges with a green gate and
no measurement. It is the import closure of the entry points (the worker bundle's `main.ts` and its pricing thread, the
migration and login tasks, the web's screening pages, actions and routes with the proxy, the root layout and error
pages, and the harness), each relative import and each workspace package's export followed to its file, and the files
no import reaches that still change what is measured: the Dockerfiles, the web's Next config, the packages' manifests,
the lockfile, the migrations, the settings the harness reads, the fixture release and the workflow. After a change
that adds an import on that path, regenerate it (`pnpm exec tsx tools/screening-capacity/watched.ts --write`) and commit
it: a unit test fails while the committed list differs from what the code derives. The `changes` job reads the list
from the pull request's base and its head as data (it runs no repository code) and measures when a changed file
matches a line of either; a line is a path, or a pattern whose `*` also matches across `/`.

## The launch check (decision 13)

Production's screening opens only when the latest capacity report for the image being deployed passes with time
enforced, on both image IDs. The release workflow measures the `web-production` and worker images exactly as built
and keeps the report as an asset of the tag's GitHub release. Before a deploy that should open the screening:

```
gh release download <tag> --pattern screening-capacity.json
docker image rm <WebRepositoryUri>:<tag> <WorkerRepositoryUri>:<tag>
docker pull <WebRepositoryUri>:<tag> && docker pull <WorkerRepositoryUri>:<tag>
pnpm exec tsx tools/screening-capacity/launch-check.ts --report screening-capacity.json --tag <tag> \
  --web-image <WebRepositoryUri>:<tag> --worker-image <WorkerRepositoryUri>:<tag>
```

The images are the copies the deploy's step 2 pushed to ECR, pulled back from ECR, so the IDs checked are those ECS
runs (docs/runbooks/deploy-and-rollback.md, step 3).

It prints `ScreeningLaunch=<tag>:<the report's SHA-256>` for the deploy's `ScreeningLaunch` parameter, or each reason
and a non-zero exit, and then the deploy passes `ScreeningLaunch=closed`. It checks the report's format, the Docker
runtime, a pass with time enforced as recorded and as the checkout's own `verdict()` reads the measurements again, the
tag's commit, both image IDs against the images pulled back from ECR (`docker image inspect -f {{.Id}}`), and the
consumer measured against `compute.screening` for production. A note of the founder's sizing question (a worst time
above 44 s) does not stop it: the merge settles that question. The web keeps production closed unless `SCREENING_LAUNCH`
names the tag it runs, so a value a later deploy keeps by omission closes the screening rather than vouching for another
image.

## Running it elsewhere

- With Docker: build the images as tagged in the workflow, then
  `taskset -c "$(pnpm -s screening:capacity --print-harness-cpus)" pnpm screening:capacity --out <dir> --release-dir <dir> --web-image tp-web:capacity --worker-image tp-worker:capacity`
  (add `--static-asset-origin https://<host>` for a web image built with `STATIC_ASSET_ORIGIN`).
- Without Docker (a developer machine, cgroups under root): build the worker (`pnpm --filter @tp/worker build`) and the
  web app (`pnpm --filter @tp/web build`, then the static files and `public` beside the standalone server as
  `apps/web/scripts/start-standalone.sh` does), lay them out as the images do (a directory with `worker`, holding
  `dist`, `migrations` and `node_modules/playwright-core` at the version `apps/worker/package.json` pins, which the
  worker image installs beside its bundle: `npm install --no-save playwright-core@1.56.1` in `worker`; and `web`, the
  standalone server), and run
  `pnpm screening:capacity --runtime process --images <dir> --admin-url <superuser URL> --database tp_capacity --out <dir>`.
  Pin the harness as the workflow does (`taskset -c "$(pnpm -s screening:capacity --print-harness-cpus)"`). The web,
  platform and consumer processes run in cgroups at production's limits, each exec'd under `taskset -c` with its own
  cpuset (under cgroup v1 a process that joins a cpuset otherwise keeps only the overlap with the harness's CPUs), their
  output in `<out>/logs`; Postgres is the server named, unlimited and warm, so the run reports its limits as not applied
  and never passes. Its times are indications, with the load average beside them. Roles belong to the whole server, so
  the run's six logins (the migration task's: the web's, the worker's, the operator's, the queue's, billing's and the
  screening consumer's) carry a suffix of its own and are dropped with its database (kept, and named, with
  `--keep-database`); while it runs, a test on the same server that lists a role's members (the billing test does)
  sees them, so run it on a server no test suite is using. A layout that lacks what the images hold (the worker's
  bundles, its migrations, `playwright-core` at the pinned version, the web's server) stops the run before anything
  starts, as `PROCESS_IMAGES_INCOMPLETE`, each missing path named; without `playwright-core` every worker process would
  stop as it loads its bundle and the run as `PLATFORM_NOT_READY`, which says nothing of why.
