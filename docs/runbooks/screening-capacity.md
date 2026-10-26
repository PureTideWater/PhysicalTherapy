# Screening capacity

Trigger: `.github/workflows/screening-capacity.yml`, weekly (Monday 06:41 UTC, once the default branch carries the
workflows), on request, on pushes to `claude/build-platform` that touch its paths, and on every pull request, where its
`screening-capacity gate` job measures only when a watched path changed (audit #53 part 1; docs/adr/0062, "Capacity
under production limits"; the founder's rulings of 2026-10-20, decisions 13 to 16, of 2026-10-21, Q1, Q7 and Q8, and of
2026-10-23, S4's median of three and "Free: time advisory").
This runbook is for reading a result, for what to do when it is red, for making the gate a required check, and for
the launch check that opens production's screening. Synthetic data only: the release and the uploads are generated, and
no credential is used.

## What the job does

0. On a pull request, the `changes` job reads the changed file names (no install, no repository code) and measures
   only when one is watched (see "What the gate watches"). The `screening-capacity gate` job then passes at once when
   nothing watched changed, and otherwise only when the measurement passed every check but time, which is advisory here
   (see "Time advisory and binding").
1. On GitHub's free 4-CPU runner (`runs-on: ${{ inputs.runner || 'ubuntu-24.04' }}`: ubuntu-24.04, the release's
   runner, on every event but a dispatch that names ubuntu-26.04, the founder's F5 probe, "The ubuntu-26.04 probe"
   below), builds both production images from their Dockerfiles into archives, loads each once its identity is read
   from its bytes and the loaded tag proved that image ("Running it elsewhere" and docs/adr/0066, Part 3, say how), and
   runs `pnpm screening:capacity --time-mode advisory` (`tools/screening-capacity/run.ts`) with the harness, its child
   processes and Chromium on Postgres's CPUs, as `pnpm -s screening:capacity --print-harness-cpus` gives them (0-1).
   The release's capacity job (`release.yml`) runs the same harness on the same runner with `--time-mode binding`, and
   its report job attests the report as that run's ("Provenance", below).
2. Reads production's limits from `infra/lib/environments.ts` and `infra/lib/constructs/database.ts`: web half a vCPU
   and 1 GiB (the founder's ruling of 2026-10-22 on the sizing question, O9) and platform a quarter vCPU and 512 MiB,
   both with no swap; the screening consumer (`compute.screening`, PR 6b-3) one task of 2 vCPU and
   4 GiB pricing three screenings at once; Postgres db.t4g.medium's 2 vCPU and 4 GiB on gp3. Lays them out on the
   runner from those sizes (`limits.ts`, `cpuNeeds()` and `cpuLayout()`): on the free 4-CPU runner, as every run before
   the 8-core ruling, Postgres on the class's 2 vCPU (CPUs 0-1), which the harness, its child processes and Chromium
   share, the consumer on its 2 (2-3), and the web and the platform on 3, the consumer's last (their fractional quotas
   inside it); on a runner of eight CPUs or more each service on CPUs of its own (Postgres 0-1, the consumer 2-3, the web
   4, the platform 5, the harness 6-7). The report says which layout ran. Postgres's memory is 4 GiB or what the runner
   leaves after every task and 2.5 GiB. A runner with fewer than 4 CPUs, or one that leaves Postgres under 2 GiB, stops
   the run as "runner too small", naming each need (a private repository's 2-CPU standard runner among them).
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
   most of their codes) with a small one behind them, three times (S4#1, S4#2 and S4#3, uploads S4-1 to S4-4 in each:
   the founder's ruling of 2026-10-23, below), S5 the same with the practice shape. S1, each of S4's runs and S5 first
   stop every service, restart Postgres with the page cache dropped, and start them again (both recorded). Every upload
   is a different prospect at a domain of its own, so none crosses an account's daily share (Q7); S4's runs send the
   same files from the same ZIPs under practice names and addresses of their own (`capacity.s4r2.upload1@…` for S4#2's
   first), so no run replaces another's screening, and the whole run's 750,000 large rows stay under the day's cap. The small upload is
   sent once the large uploads' pricing jobs are in pg-boss, and each pricing job's queue and start times are recorded.
   Each upload's page reads its file first (not timed); the time runs from the harness's click on "Screen the file"
   (before the browser sends the POST, so never after the web's receipt) to the email in the outbox. Each run's tier is read from the database, and the consumer's own time-to-email line (TimeToEmailMs) from
   its log. With `--static-asset-origin`, the pages' requests to that host are served from the web container's own
   `/_next/static/`. No scenario starts after 60 minutes of the harness, and one still running at 70 ends there.
6. Stops every service and compares S1-1, S2-1 and S3-1 (the last priced from the shared types the thread held) with the
   oracle (the old read path and adapter, frozen at 3c1b289) by SHA-256, and S1-2 (a ZIP split across localities, with
   its ZIP+4) with the whole-release oracle, each over all of its upload's Medicare rows; then removes Postgres.
7. Writes `screening-capacity.json` (format `tp-screening-capacity/8`: the GitHub Actions run that measured
   (`workflow`, from `GITHUB_WORKFLOW_REF`, `GITHUB_RUN_ID` and `GITHUB_RUN_ATTEMPT`; null outside Actions), the time mode (`timeMode`), the verdict's time
   warnings (`verdict.timeWarnings`, an advisory run's), the layout and which it was (`expected.layout`, its `kind`
   `shared` or `own`) and the CPUs the harness ran on (`harnessAffinity`), the consumer as measured, both image IDs (each
   image's config digest, `docker image inspect -f {{.Id}}` on the runner's classic overlay2 image store), each
   upload's time, logged time and tier, each of S4's runs as a scenario of its own with its repetition, and `repeated`,
   S4's three runs' times and the middle one), its SHA-256 (`screening-capacity.sha256`, the value the launch check prints)
   and `summary.md` after every scenario and at the end, and saves each container's stdout and stderr to
   `logs/<setup or scenario>-<service>.log` (IDs, codes and numbers by the logger's allowlist, result links masked)
   before removing it; all four go to the run's artifact, and the summary to the job summary. Annotates each warning
   (an advisory run's time verdicts, `Time (advisory)`, and the sizing question, `Sizing question (O9)`) and hands them
   to the gate as outputs (`time-warnings`, `sizing`); exits non-zero on any failing check.
8. Writes the image layer cache (mode=min) only on a push to `claude/build-platform`; every run reads it.

## Reading a result

- The job summary's first line gives the verdict and how time was judged: `time advisory` on this workflow's runs and
  `time enforced` on a release's binding run, since PR 6b-3 declares the screening's consumer (`compute.screening` in
  `infra/lib/environments.ts`) and the harness runs it (`HARNESS_RUNS_SCREENING_CONSUMER`). Settings with no consumer
  would read `time open, PR 6b`.
- The next line names the consumer as measured (tasks, vCPUs, MiB, screenings at once) and both image IDs, the line
  after it the layout (on the free runner `Layout: shared CPUs: Postgres on CPUs 0-1, the screening consumer on 2-3, the
  web on 3, the platform on 3 and the harness with Chromium on 0-1 (Postgres and the harness share CPUs 0-1; the
  screening consumer, the web and the platform share CPU 3); the harness ran on CPUs 0-1.`), and the next the time
  mode (`Time mode: advisory. …` or `Time mode: binding. …`).
- The uploads table gives, per upload (S4's as `S4#2 S4-1`, its run and its upload), the seconds to email, the consumer's logged time (TimeToEmailMs, from the web's
  receipt) and tier, and each phase's seconds: the shared types' read (or 0 when held from an earlier run), the keyed
  read with its record count, pricing, recording, the queue wait (from the submission to the job's first phase line),
  and when its pricing job was queued and started. In S4 and S5 the three large uploads price at once, one thread
  each, and the small one waits for the first free thread. The Time column of S4's two runs that are not the middle one
  says `not judged (S4#2 is the middle run)`; the line below the table gives every run's four times and names the middle
  run, and the job's log says the same before the verdict.
- The containers table gives each scenario's anonymous memory peak against the limit for web, platform and
  `screening-1` (the failing line is 90%), `memory.peak` (page cache included), how often the limit was reached, OOM
  kills and CPU throttling.
- A line headed "Sizing question for the founder" appears when the worst time the verdict judges (S4's from its middle
  run) is above 44 s (within 8% of the 48-s line): the run still passes, and the builders take it to the founder before merge as a question of the consumer's
  size (open item O9), never as a tuning or a wider limit. It also shows on the pull request's checks: the harness
  posts a warning annotation ("Sizing question (O9)", naming the upload and its time), and the capacity job passes it
  to the gate, which prints it beside its pass. The founder answered it on 2026-10-22 for PR 6b-3: the web at half a
  vCPU and 1 GiB in every environment, the consumer unchanged; only if CI's worst time is still above 44 s after that
  do a consumer of 4 vCPU and 8 GiB and GitHub's 8-core runner go back to the founder. The 48-s line and the 44-s
  question stay as they are. On 2026-10-23 the founder ruled that S4 is judged on its middle run of three, so the
  question reads the middle run's worst time, never the slowest run's; it is a warning in both time modes (below).
- In an advisory run, a time above the line is listed after the failing checks under "Time warnings (advisory: they do
  not fail this run; a binding run fails on each)", word for word as a binding run would fail on it, annotated on the
  pull request's checks as `Time (advisory)` and printed again by the gate, which passes.
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
   again once fixed. `runner too small: the runner has 2 CPUs; the test needs 4: …` means a runner smaller than the
   free 4-CPU one (a private repository's standard runner; each need is named). `layout: measured on …, and the layout
   the harness gives a runner of N CPUs is …` means the report's layout is not the one the harness gives its runner, and
   `limit not applied: harness: CPU affinity …, not 0-1` (`not 6-7` on eight CPUs) that the harness was not pinned
   where the layout puts it (`taskset -c "$(pnpm -s screening:capacity --print-harness-cpus)"`): either way the
   measurement is not of the layout it names. `partial run` or `deadline`: not every scenario ran (`--scenarios`, or the harness's own
   deadline);
   the verdict needs S1 to S5 with S4's three runs (`--scenarios S4` runs all three). A report of S4 run once, from
   before the founder's ruling of 2026-10-23, reads as partial, and the launch check refuses its format.
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
   which it sets from the task's memory (about 560 MiB at web's 1 GiB, about 259 MiB at platform's 512 MiB), reached
   before the cgroup's: no OOM kill is counted. A
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
   scaled by it once known ("promise"). Every upload is judged, the small ones behind the large included, S4's in its
   middle run (`time: S4#2 S4-1 48.1 s (the middle of S4's three runs), …`). In an advisory run (this workflow's) it is a
   warning: the job and the gate pass, and the slowdown is the reviewer's to read before merge. In a binding run (a
   release's) it fails the run, and the screening does not open while the latest run on the image being deployed is red
   (decision 13). The levers are the consumer's size and concurrency, and the share and cap, each the founder's (Q1,
   Q7); never widen the line, and never re-run to get a luckier middle run.
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
    run passes. An advisory run's time warnings fail nothing, so they open no issue: read the build branch's weekly and
    push runs' summaries for them.

## S4's three runs (the founder's ruling of 2026-10-23)

The same code measured S4 at 38.3, 37.6 and 35.3 s on 19aa09c (pass) and at 51.4, 51.4 and 45.2 s on 54ec890 (fail),
the second runner slower throughout (the release loaded in 262 s against 219 s). The cause is the runner, not the
consumer: on GitHub's free 4-CPU runner the layout of the time put Postgres, the harness and Chromium on CPUs 0-1, the
consumer on 2-3 and the web and the platform on CPU 3, which the consumer also used, a contention production does not
have and which swings with the host's speed. Asked whether to move to GitHub's 8-core larger runner (about $44 a
month), the founder, Tyler Williams, ruled on 2026-10-23: "Stay free: median of 3". The second ruling that day moved
the measurement to that runner and kept the median of three ("The 8-core runner", below); the third, since that runner
needs an organization, put it back on the free runner with time advisory on pull requests and binding on a release's
run, the median of three kept in both ("Time advisory and binding", below).

What it does:

- S4 runs three times in every capacity run, as S4 always ran (a cold Postgres, restarted with its page cache dropped,
  then web, platform and the consumer fresh; the same uploads).
- S4's time verdict is taken from the middle run: the three runs are ordered by their worst upload's time to email, the
  small one included (a run with an upload never emailed counts as the slowest), and the middle run's four uploads are
  judged against the 48-s line, and its worst time against the 44-s sizing question. The gate's warning
  and the launch check's note use that time.
- Every other scenario's time verdict is unchanged (one run each).

What it does not do:

- It excuses nothing else. Every other check holds in all three runs, as in every scenario: the results (row counts,
  nothing pending, no `ENGINE_ERROR`, nothing stalled, every run emailed, the result pages), queue order, the slots used
  at once, no waiting tier, the platform pricing none, the time metric within its bounds, no OOM kill or restart, the
  cold start and the limits applied. The oracle comparisons (S1-1, S1-2, S2-1, S3-1) are as before.
- It does not change the 48-s line, the 44-s question or any other verdict. Two of three runs with an upload above 48 s
  still fail, whichever upload it was: the runs are ordered by all four uploads, so the middle run has one above the
  line too (the verification of PR 6b-3's capacity changes; ordered by the large uploads alone, two runs whose small
  upload was the slow one could pass).
- On the free runner it still measures the runner's contention, which production does not have: the median takes the
  swing out of one verdict, not the contention out of the measurement. GitHub's 8-core larger runner, each service on
  CPUs of its own, takes the contention out ("The 8-core runner", below), once an organization owns the repository.

The two more runs take about 3 minutes (CI's S4 took 59 s on 19aa09c and 78 s on 54ec890 from its cold restart to
S5's start), so the capacity job's timeout, and the release's capacity job's, went from 90 to 100 minutes; the
harness's own deadlines (60 and 70 minutes) are unchanged. The three runs stay in both time modes (the founder's third
ruling of 2026-10-23): a pull request's run warns on the middle run's time, a release's fails on it.

## Time advisory and binding (the founder's third ruling of 2026-10-23)

The founder's second ruling of 2026-10-23 moved both capacity jobs to GitHub's 8-core larger runner, and on 273b28d the
measuring job stayed queued: GitHub's larger runners exist only for organizations on GitHub Team or Enterprise Cloud,
and this repository's owner, `PureTideWater`, is a personal account (GitHub's API reports its owner type as User).
Every other check on the pull request was green. The founder, Tyler Williams, ruled on 2026-10-23, the third ruling
that day, replacing the 8-core runner: "Free: time advisory", no organization and no cost.

- **Where it runs:** both capacity jobs on GitHub's free 4-CPU runner (`runs-on: ubuntu-24.04`, which the release's
  capacity chain keeps while every other job runs on ubuntu-26.04: the founder's F5), in the layout every run had
  before the 8-core ruling (Postgres, the harness and Chromium on 0-1, the consumer on 2-3, the web and the
  platform on 3). `tools/test/workflows.test.ts` holds both jobs' runner and mode, and that no runner label is named
  for actionlint (`.github/actionlint.yaml` is gone).
- **Advisory** (`--time-mode advisory`: `screening-capacity.yml`, so every pull request, push, weekly and requested
  run; none is a release): the time verdicts (the 48-s line, S4 judged on its middle run of three, the 44-s sizing
  question) are computed and printed as before, but listed as time warnings, annotated as warnings
  (`Time (advisory)`), and handed to the gate, which prints them again and passes. Every other check fails the job and
  the gate as before: the results and the oracles, nothing pending or stalled, every upload emailed, the queue order,
  the slots used, no waiting tier, the platform pricing none, the time metric within its 2-s bound, the limits applied,
  memory under 90% of each limit, no OOM kill or restart. A cancelled measurement fails the gate.
- **Binding** (`--time-mode binding`: `release.yml`'s capacity job): time fails the run as every other check does.
- **Decision 13:** the launch check accepts only the binding report release.yml measured on the tag and attested in
  that run ("The launch check (decision 13)", below), passing with time enforced, read again from its measurements in
  binding mode (the median of three included); it refuses an advisory report whatever its verdict, naming the mode, and
  any report the release's run on the tag did not attest. Production's screening still cannot open until a release
  passes the time-enforced capacity check.
- **What it gives up:** a pull request no longer blocks on time, so a slowdown can merge unnoticed, a warning on its
  checks aside, until a release is measured; a release whose run fails on time still pushes its images but keeps
  production's screening closed until a later release passes. The free runner's shared CPUs put a contention
  production does not have into every measurement, the release's included, so a binding run can fail on a slow host;
  the median of three takes some of that out, not all. Read a pull request's time warnings before merging it.
- **Cost:** none while the repository is public. Once it is private, its standard runner has 2 CPUs, which the harness
  refuses as too small, and the capacity jobs need a 4-core larger runner (about $22 a month), which itself needs an
  organization on GitHub Team (PRD 19; read the prices again on GitHub's pricing page, O12).

## The 8-core runner (the faithful option, once an organization exists)

GitHub's 8-core larger runner measures production's layout, each service on CPUs of its own: Postgres 0-1, the
consumer 2-3, the web 4, the platform 5, and the harness, its child processes and Chromium 6-7. The founder's second
ruling of 2026-10-23 chose it after the median of three failed on the free runner too (on 35bcc56 S4's three runs
measured 52.8 to 56.9 s, every correctness check holding; the free runner's S4 followed the host's speed, 38.3 s with
the release loaded in 219 s on 19aa09c, 51.4 s at 262 s on 54ec890 and 56.9 s at 270 s on 35bcc56). It could not run
without an organization, and the third ruling replaced it ("Time advisory and binding", above). It stays the faithful
option: the harness already gives a runner of eight CPUs or more this layout (`cpuLayout()`) and the report records it as
`own`; the launch check refuses it until a release measures there (`RELEASE_RUNNER`, step 5). The CPUs are the runner's logical CPUs; which of them are threads of one
physical core is the host's, not the harness's.

**Prerequisite:** GitHub's documentation offers GitHub-hosted larger runners only to organizations and enterprises on
the GitHub Team or GitHub Enterprise Cloud plan. This repository's owner, `PureTideWater`, is a personal account, which
has no runner settings of this kind; an organization on such a plan must own this repository first (a repository moves
with Settings → General → Transfer ownership). Confirm on GitHub's documentation and pricing pages before acting (O12).

**Moving to it, once that organization exists (the founder creates the runner; a pull request moves the jobs):**

1. GitHub → the organization that owns this repository → Settings → Actions → Runners → New runner → New GitHub-hosted
   runner.
2. Name: `paidwhole-8core`, exactly. Platform: Linux x64. Image: Ubuntu 24.04, the versioned image, not "latest", so
   the image stays pinned, as every job's runner is pinned to a versioned image (audit #19). Size: 8 cores, 32 GB RAM. Runner group:
   the one chosen in the next step. Create it.
3. Settings → Actions → Runner groups → that runner group: tick "Allow public repositories" (while this repository is
   public), and under repository access allow this repository. Save.
4. Keep the repository's fork pull-request setting (Settings → Actions → General, "Approval for running fork pull
   request workflows from contributors") at least at its default: a fork's pull request that changes a watched path
   would measure on this runner, which is billed by the minute.
5. A pull request then sets `runs-on: paidwhole-8core` on both capacity jobs, names the label in
   `.github/actionlint.yaml` (actionlint refuses an unknown label), changes `tools/test/workflows.test.ts` to hold
   it, and moves `RELEASE_RUNNER` in `tools/screening-capacity/launch-check.ts` to that label and 8 CPUs, so the launch
   check accepts the layout of CPUs of their own and refuses the shared one; whether the pull request's time stays
   advisory there is the founder's to rule.

**Cost:** GitHub bills a larger runner by the minute, public repository or not: about $0.032 a minute for 8-core Linux,
about $44 a month by the design's estimate (about 1,375 runner minutes), and the organization's plan apart from it.
Read the prices again on GitHub's pricing page before relying on them (O12).

## The ubuntu-26.04 probe (the founder's F5)

Every job of every workflow runs on ubuntu-26.04 but the release's capacity chain (`release.yml`'s four jobs,
`release-dry-run.yml`'s three and this workflow's `capacity`), which stays on `RELEASE_RUNNER`'s ubuntu-24.04, so a
binding measurement is never made on another runner image than the launch check accepts. The move of the chain is
decided by numbers: dispatch the workflow once on 26.04,

```
gh workflow run screening-capacity.yml -f runner=ubuntu-26.04
```

and record on issue #41 the report, the measuring job's `docker info` (its image store: 26.04's Docker 29 keeps images
in the containerd store) and the times against the 24.04 runs. The probe is advisory: its failure opens no
screening-capacity issue (the `notify` job skips it), and the launch check refuses its report, which is not
`release.yml`'s run. Moving the chain is the founder's ruling; the pull request that does it changes `RELEASE_RUNNER`,
the release workflows' `runs-on` and `RELEASE_CHAIN` in `tools/test/workflows.test.ts` together.

## Making it required (the founder's Q8)

The founder ruled on 2026-10-21 that the capacity test becomes a required check from PR 6b-3. The build makes the
check sound; the founder sets the rule, in the same ruleset as the other required checks
(docs/runbooks/github-governance.md, step 4A, whose list docs/adr/0066 set on 2026-10-25). Steps 1 to 3 below are
done for the build branch: applied 2026-10-25 21:14 UTC (ruleset 25837331, "Protect the build branch"), the gate among
its four required checks. "Protect main" gains the same checks once the launch pull request is open (governance
runbook, step 8).

1. GitHub → the repository → Settings → Rules → Rulesets → the ruleset that protects `claude/build-platform` (and the
   one that will protect `main` for the launch pull request).
2. Under "Require status checks to pass", the required checks, each with the source GitHub Actions:
   <!-- required-checks -->`all green`, `mutation`, `screening-capacity gate` and
   `approval-of-record`<!-- /required-checks -->. For this test, add the gate, never `capacity`: the measuring job is skipped on pull requests that change no watched
   path, and a skipped required job would leave them pending.
3. Save. From then on a watched pull request merges only after a measurement that passes every check but time, whose
   verdicts show on its checks as warnings ("Time advisory and binding"; the measuring job took 13:20 to 16:00 on runs
   39977565861, 40018476404 and 39978142533, and the gate about 12 to 19 minutes on five runs of 2026-10-25, so it, not
   ci's `all green` at about 10 minutes, sets when such a pull request can merge), and every other pull request passes the gate in about a minute.

Why it is sound: every pull request runs the workflow (no path filter on the trigger), so the gate is always reported;
the gate fails when the changed paths cannot be read, and when a watched change's measurement failed, timed out or was
cancelled. It runs whatever happened before it (`if: always()`), a cancelled run included: GitHub counts a job its own
condition skipped as passing a required check, so a gate that did not run after a cancel would have let a pull request
merge with no measurement. A run cancelled by a newer push fails its gate on the old commit, which no longer gates the
pull request; the new commit's own run reports.
The measuring job runs on the free 4-CPU runner while the repository is public. Once it is private its standard runner
has 2 CPUs, which the harness refuses as too small, so the gate cannot pass on a watched pull request until both
capacity jobs move to a 4-core larger runner, which needs an organization on GitHub Team (about $22 a month).

### What the gate watches

`tools/screening-capacity/watched-paths.txt`, derived by `tools/screening-capacity/watched.ts` and never edited by hand:
every file the measured images and the harness run, so no change on the screening's path merges with a green gate and
no measurement. It is the import closure of the entry points (the worker bundle's `main.ts` and its pricing thread, the
migration and login tasks, the web's screening pages, actions and routes with the proxy, the root layout and error
pages, and the harness), each relative import and each workspace package's export followed to its file, and the files
no import reaches that still change what is measured: the Dockerfiles, the web's Next config, the packages' manifests,
the lockfile, the migrations, the settings the harness reads, the fixture release, the workflow, and the capacity
job's own setup (`tools/ci/apt-archives.sh`, `tools/ci/browser-build.ts` and the `apps/web/e2e/browser.json` and
`apps/web/e2e/browser-builds/*.sha256` it reads), which runs there on the release's runner image and nowhere else. After a change
that adds an import on that path, regenerate it (`pnpm exec tsx tools/screening-capacity/watched.ts --write`) and commit
it: a unit test fails while the committed list differs from what the code derives. The `changes` job reads the list
from the pull request's base and its head as data (it runs no repository code) and measures when a changed file
matches a line of either; a line is a path, or a pattern whose `*` also matches across `/`.

## The launch check (decision 13)

Production's screening opens only on the capacity report `release.yml` measured on the tag being deployed and attested
in that same run: binding, passing with time enforced, on both image IDs. The release workflow measures the
`web-production` and worker images exactly as built, attests the report with GitHub's artifact attestation, and keeps
the report, its SHA-256, its summary and the attestation's bundle (`screening-capacity.sigstore.json`) as assets of the
tag's GitHub release. The deploy names the report and the bundle, and the CDK app runs the check at synthesis and sets
the launch value itself (the founder's ruling of 2026-10-22; docs/runbooks/deploy-and-rollback.md, steps 3 and 4):

```
gh release download <tag> --pattern 'screening-capacity.*' --dir <dir>
cdk deploy tp-production -c tp:launchReport=<dir>/screening-capacity.json \
  -c tp:launchAttestation=<dir>/screening-capacity.sigstore.json -c tp:launchTag=<tag> --parameters ImageTag=<tag>
```

The app (`infra/lib/screening-launch.ts`) reads the images the stack deploys, `<WebRepositoryUri>:<tag>` and
`<WorkerRepositoryUri>:<tag>` in the deploy's account and region, each by its manifest in ECR, so the images checked are
those ECS runs, whatever image store the deployer's Docker uses, and verifies the report's attestation with `gh
attestation verify` against the bundle ("Provenance", below). A report the check accepts gives `<tag>:<the report's
SHA-256>`, which the stack writes into the web's `SCREENING_LAUNCH`, with a rule that refuses the deploy unless
`ImageTag` is that tag; a refused report stops the synthesis, naming decision 13 and each reason; the three `-c` values
go together, and none keeps production's screening closed. The value is never a parameter, and context that sets it by
hand stops the synthesis. To preview the check before the deploy:

```
pnpm exec tsx tools/screening-capacity/launch-check.ts --report <dir>/screening-capacity.json \
  --attestation <dir>/screening-capacity.sigstore.json --tag <tag> \
  --web-image <WebRepositoryUri>:<tag> --worker-image <WorkerRepositoryUri>:<tag>
```

It prints the value the deploy will compute, or each reason and a non-zero exit. It checks:

- the report's format (`tp-screening-capacity/8`; every older one is refused: a report of S4 run once, `/5` and `/6`,
  which record no time mode, and `/7`, which records no run) and the Docker runtime;
- its time mode (binding, the release's; an advisory report, a pull request's, is refused whatever its verdict, the
  mode named);
- its provenance: the run the report records (`workflow`: `GITHUB_WORKFLOW_REF`, `GITHUB_RUN_ID` and
  `GITHUB_RUN_ATTEMPT`, which the harness reads from the runner) must be
  `PureTideWater/PhysicalTherapy/.github/workflows/release.yml@refs/tags/<tag>`, and the report's bytes must carry that
  run's attestation ("Provenance", below); the note on an accepted report names the run and the attempts that measured
  and attested it;
- a pass with time enforced as recorded and as the checkout's own `verdict()` reads the measurements again in binding
  mode, whatever mode the report records (S4's time on its middle run, the middle run the report names being the one
  its measurements give; every other scenario judged on time whatever repetition it records);
- the layout release.yml's runner gives production's sizes (`RELEASE_RUNNER` in `launch-check.ts`: the free 4-CPU
  `ubuntu-24.04` runner's shared CPUs). A report measured on CPUs of their own, an 8-CPU runner's, is refused until a
  release measures there ("The 8-core runner", above); `tools/test/workflows.test.ts` holds release.yml's runner to
  `RELEASE_RUNNER`, so the two move together;
- the tag's commit, and both images by config digest (the report's IDs, which the harness reads with `docker image
  inspect -f {{.Id}}` on the runner's classic overlay2 image store, where an image's ID is its config's SHA-256, against
  the config digest each image's manifest in ECR names, read with `docker buildx imagetools inspect --raw` and an index
  resolved to its linux/amd64 manifest; nothing is pulled);
- every size production declares, as the harness derives it from `infra/lib/environments.ts` and the database
  construct: the web and the platform (the web's half vCPU and 1 GiB since 2026-10-22), each consumer task's vCPUs and
  memory and their number, Postgres at db.t4g.medium's 2 vCPU and 4 GiB on the release layout's CPUs 0-1, the storage
  at gp3's baseline, and the consumer as measured against `compute.screening` (its tasks, vCPUs, memory and
  concurrency). A report that agrees with itself at another size, which its own verdict passes, is refused.

A note of the founder's sizing question (a worst judged time above 44 s, read again from the measurements, S4's from its
middle run) does not stop it: the merge settles that question. The web keeps production closed unless
`SCREENING_LAUNCH` names the tag it runs, so a deploy of another tag without its own report closes the screening.

### Provenance

Until the verification of PR 6b-3's capacity changes, the check accepted any report that said `binding`: anyone could
run the harness with `--time-mode binding` on a machine of their own, on the release's images and the tag's commit, or
edit a report, and open production with it. Now only the release's report opens it:

- **Signed:** `release.yml`'s report job attests `screening-capacity.json` with `actions/attest-build-provenance`
  (pinned to a commit, v4.2.2). Sigstore's certificate for the signature is issued from GitHub's OIDC token for that job,
  which no workflow can write: it names the signing workflow and its ref
  (`https://github.com/PureTideWater/PhysicalTherapy/.github/workflows/release.yml@refs/tags/<tag>`), the repository,
  the commit, the event (`push`), the runner (GitHub-hosted) and the run and attempt. The statement names the report's
  SHA-256. The signature is entered in Sigstore's public transparency log and stored in the repository's attestations
  (`https://github.com/PureTideWater/PhysicalTherapy/attestations`); the bundle is kept beside the report. Only the
  report job has `id-token: write` and `attestations: write`, and it runs nothing but the attestation and `gh`, never
  the code it measured.
- **Verified:** the launch check runs `gh attestation verify <report> --bundle <bundle> --repo
  PureTideWater/PhysicalTherapy --signer-workflow PureTideWater/PhysicalTherapy/.github/workflows/release.yml
  --source-ref refs/tags/<tag> --source-digest <the tag's commit> --deny-self-hosted-runners --predicate-type
  https://slsa.dev/provenance/v1 --format json`, then reads gh's verified result again, each field exactly: the
  statement names the SHA-256 of the bytes it checked, the signer and the build signer are release.yml on the tag, the
  repository, ref and commit are this one's and the tag's, the runner is GitHub-hosted, the event a push, and the run is
  the one the report records. A report measured anywhere else (a pull request's run, a branch's, a fork's, a machine of
  one's own) has no such attestation, and one changed by a single byte after it was signed matches none; each is
  refused, naming why.
- **On the deployer's machine:** `gh` (2.89.0 has every flag the check passes; an older gh that lacks one is refused,
  naming the flag), with the bundle on disk, needs no GitHub login, and fetches Sigstore's trusted roots on first use
  from `tuf-repo-cdn.sigstore.dev` and `tuf-repo.github.com`; where they cannot be reached the check is refused, naming
  gh's error, and the screening stays closed.
- **A re-run:** re-running the release's capacity job replaces the release's assets with the new report and bundle; the
  report records its attempt and the check's note names it. Every attempt's attestation stays in the repository's
  attestations and Sigstore's log, so the earlier reports' digests remain on record.
- **What it does not prove:** that the code which measured is honest. It proves which workflow run wrote the report: the
  tag's own code, with its locked dependencies. A tag is created only by the founder and never moved or deleted (the
  release-tag rulesets, docs/runbooks/github-governance.md, 4C), and the release's actions are pinned to commits. Nor
  does it bind a deploy made outside the CDK app: whoever holds production's deploy credentials can still set the
  task's environment directly, which the account's access controls and CloudTrail govern, not this check.
- **If the repository goes private:** artifact attestations for a private repository need GitHub Enterprise Cloud
  (GitHub's plans give them to public repositories only below it). Making the repository private therefore needs this
  revisited before the next release (open item O15), or every release's report goes unattested and production's
  screening cannot open.

## Running it elsewhere

- Anywhere, the machine needs 4 CPUs (the free runner's shared layout; eight or more gives each service its own); with
  fewer the harness stops as "runner too small" before it starts anything, naming each need. Every run names its time
  mode (`--time-mode advisory` or `--time-mode binding`, no default): advisory to read the times as warnings, binding
  as a release does. Only the binding report release.yml measures on a tag and attests in that run can open
  production: a report measured anywhere else, binding or not, has no such attestation and is refused ("Provenance").
- With Docker: build the images as tagged in the workflow, then
  `taskset -c "$(pnpm -s screening:capacity --print-harness-cpus)" pnpm screening:capacity --out <dir> --release-dir <dir> --web-image tp-web:capacity --worker-image tp-worker:capacity --time-mode advisory`
  (add `--static-asset-origin https://<host>` for a web image built with `STATIC_ASSET_ORIGIN`). The report's image IDs
  are the images' config digests only on Docker's classic image store (overlay2, as on the release's ubuntu-24.04
  runner); under the containerd image store (the default for new Docker Desktop and Docker Engine 29 installs, and on
  the ubuntu-26.04 runner) they are the manifests' or indexes' digests, which the launch check refuses, so such a report
  can never open production's screening. The release does not take the store on trust: its build reads each saved
  archive's config digest from the archive's bytes (`node tools/screening-capacity/image-id.ts <archive>`, which also
  gives the top-level descriptor the containerd store's `.Id` names) and leaves it, with the archive's SHA-256, as a job
  output; its capacity and push jobs check each archive against those outputs before `docker load`, and prove the
  loaded tag is that image on their store (the config digest on the classic store, the top-level descriptor on
  containerd's) before anything is installed or pushed. Once #42 has merged, the harness reads the archives itself
  (`--image-archive`, `--expect-image`) and the report names its runner image and image store (docs/adr/0066, Part 3).
- Without Docker (a developer machine, cgroups under root): build the worker (`pnpm --filter @tp/worker build`) and the
  web app (`pnpm --filter @tp/web build`, then the static files and `public` beside the standalone server as
  `apps/web/scripts/start-standalone.sh` does), lay them out as the images do (a directory with `worker`, holding
  `dist`, `migrations` and `node_modules/playwright-core`, the one the lockfile installs for the worker, which the
  worker image copies beside its bundle from its build stage: `cp -RL apps/worker/node_modules/playwright-core
  <images>/worker/node_modules/`; and `web`, the standalone server), and run
  `pnpm screening:capacity --runtime process --images <dir> --admin-url <superuser URL> --database tp_capacity --out <dir> --time-mode advisory`.
  Pin the harness as the workflow does (`taskset -c "$(pnpm -s screening:capacity --print-harness-cpus)"`). The web,
  platform and consumer processes run in cgroups at production's limits, each exec'd under `taskset -c` with its own
  cpuset (under cgroup v1 a process that joins a cpuset otherwise keeps only the overlap with the harness's CPUs), their
  output in `<out>/logs`; Postgres is the server named, unlimited and warm, so the run reports its limits as not applied
  and never passes. Its times are indications, with the load average beside them. Roles belong to the whole server, so
  the run's six logins (the migration task's: the web's, the worker's, the operator's, the queue's, billing's and the
  screening consumer's) carry a suffix of its own and are dropped with its database (kept, and named, with
  `--keep-database`); while it runs, a test on the same server that lists a role's members (the billing test does)
  sees them, so run it on a server no test suite is using. A layout that lacks what the images hold (the worker's
  bundles, its migrations, `playwright-core` at the lockfile's version, the web's server) stops the run before anything
  starts, as `PROCESS_IMAGES_INCOMPLETE`, each missing path named; without `playwright-core` every worker process would
  stop as it loads its bundle and the run as `PLATFORM_NOT_READY`, which says nothing of why.
