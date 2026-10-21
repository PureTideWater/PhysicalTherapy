# PR 6b, Track B: the screening's own consumer, sized by measurement, and the 60-second time check

Design step only (no code, no commit). Base: `claude/build-platform` at 8e33cb3. **Revision 2**, after one independent
review (§12 lists every finding and what was done). Sources read: HANDOFF.md 5-74, 131-186, 261-313;
reconciliation-001.md 428, 495-527; ADR 0062 619-827; combined audit #7, #16, #31, #33, #53, #76; the PR 6 design's
capacity sections (designs/pr6-53-57-screening.md 164-380); Track A's design (`design/pr6b-zip4-settings.md` §5.1, §6)
and Track C's (`design/pr6b-email-streams.md` D7, D9 and its functions table) where they change the same functions; the
files cited below. Every measurement in §2 was taken in a throwaway clone with synthetic data only. No PHI, no real 835
and no real contract appear anywhere.

Coordination: Track A owns the ZIP+4 lookup, practice settings and #33; Track C owns the email streams (#76). Four
screening functions and the run trigger are changed by more than one track. §3.3.4 gives each one owner, one merged
final body and one place in PR 6b's migration. Tracks A and C adopt that table (open item until they do).

---

## 0. Decisions in one screen

1. **The consumer.** A fourth Fargate service, `screening`, from the worker image with `WORKER_JOBS=screening`: one
   always-on task of **2 vCPU and 4 GiB**, pricing **three screenings at once**, each in its own worker thread (the
   page-reader thread of ADR 0033 is the precedent). Fixed count, no autoscaling (asserted in CDK). Three at once
   replaces audit #53's "two at a time", because two slots measured 55.8 s against the 48-s line (run 4). This is
   recommended and the founder chooses (question 1). It costs about **$74.50 a month in production** once running, more
   than the ~$18 accepted. Question 5 asks whether production runs it before launch.
2. **Why that size (measured, §2).** One screening's pricing runs on one core (`apps/worker/src/screening/job.ts:244-274`
   is synchronous). The binding case is three worst-shape uploads at once with a small one behind, and it needs three
   screenings priced in parallel:
   - two slots leave the third worst upload at 55.8 s;
   - three sharing 2 vCPU finish at 37.5 to 41.1 s;
   - four on 2 vCPU are slower (45.3 to 46.8 s);
   - 0.5 vCPU prices the worst shape alone in 44.1 s and cannot serve three.

   These figures are indicative. The scratch hooks were not kept, and the harness's queue-order check failed in six runs
   (§2.2). PR 6b's first CI run, with the real consumer and the race fixed, is the measurement of record.
3. **Its database identity.** A NOLOGIN role `tp_screening` with EXECUTE on the nine pricing functions and one new queue
   function, and nothing else.
   - Its login `tp_screening_login` switches to it (`INHERIT FALSE, SET TRUE`, as billing's login does) and holds
     nothing of its own.
   - `tp_screening` is in the catalog's no-`SET ROLE` and owns-nothing lists and in the role bootstrap.
   - `tp_operator` keeps the nine for one release and loses them in the next schema PR (add, then remove:
     docs/runbooks/deploy-and-rollback.md:67-68).
4. **The platform stops pricing screenings** by code: `screening_price` leaves `PLATFORM_JOB_TYPES`. The queue name is
   unchanged, so queued jobs move with no copy and no loss. pg-boss's job heartbeat is set on the existing queue
   (`updateQueue`) and on every send, so a dead task's run is claimed again in about 3 minutes, not 15 (§3.7).
5. **Queue order** (the numbers are the founder's: question 2). Every upload is accepted, and an upload goes to a lower
   priority in two cases:
   - it is past its account's daily share (recommended 100,000 rows, two worst-shape files);
   - it is past the daily cap (recommended 1,000,000 rows of within-share uploads, ten accounts' shares).

   Normal uploads are priority 0. An account's k-th upload over its share goes at −k, so heavy accounts take turns.
   Lower-priority uploads are priced when no normal run waits, and the prospect is told the result can take longer.
   The "sent" page has four honest states, and their wording is the founder's and counsel's (question 3).
6. **Metrics and alarms**:
   - time to email, measured from the web's receipt of the upload until the send returns (alarm above 60 s);
   - the oldest normal-priority queued run (alarm above 2 minutes);
   - heartbeat, failed runs, and uploads sent to wait.
7. **Time check switched on**: PR 6b declares `compute.screening` in `infra/lib/environments.ts`, and the harness runs
   the consumer as production will, so time is enforced at 48 s (decision 15).
8. **Decision 13 is bound to both images.**
   - `release.yml` builds, scans and measures the production web image (with production's asset origin) and the
     worker image, then pushes exactly those images.
   - A launch check verifies both image IDs against the report, which is kept as a release asset.
   - The web stays closed unless `ScreeningLaunch` names the tag's passing report.
9. **#31's screening part**:
   - the ZIP+4 keys in Track A's shape (`locality_map_plus_four`, keyed by the five-digit ZIP);
   - one copy of the release per thread;
   - a shared read that probes the index and excludes the **six** keyed types.
10. **Schema changes: yes**:
    - a role and its grants;
    - five columns on `screening_run` and three indexes;
    - three new functions;
    - seven changed bodies, the run trigger among them (four merged with Tracks A and C).

    The domain model is regenerated and needs the founder's SHA-256 approval. **Engine change: none** from this track.

---

## 1. What exists (with citations)

| Fact | Where |
| --- | --- |
| Screening is a platform job, scheduled every minute as a sweep and sent per run by the web | `apps/worker/src/jobs/platform.ts:36-46, 82-92, 213-223`; `apps/worker/src/jobs/enqueue.ts:40-43`; `apps/web/src/lib/screening/routes.ts:497-503` |
| The platform works every platform queue one job at a time | `apps/worker/src/worker.ts:186-195` (`batchSize: 1`, no `localConcurrency`) |
| Every worker creates the platform queues with `QUEUE_OPTIONS` | `apps/worker/src/worker.ts:173-175`; `apps/worker/src/jobs/registry.ts:100-105` |
| pg-boss creates a queue with `INSERT … ON CONFLICT DO NOTHING`: options passed to `createQueue` for an existing queue are ignored; a job copies the queue's heartbeat at insert | `pg-boss@12.38.0/dist/plans.js:1024-1080, 2862`; `types.d.ts:575-579, 808-811`; `updateQueue` at `dist/manager.js:2415` |
| The exclusive policy's unique index covers states up to `active` | `plans.js:1278` |
| Graceful stop waits 30 s; ECS waits 60 s | `apps/worker/src/worker.ts:204`; `infra/lib/constructs/compute.ts:53` |
| The platform task: 0.25 vCPU, 512 MiB, one task, OperatorRole, operator and queue logins | `infra/lib/environments.ts:82-88`; `infra/lib/constructs/compute.ts:258-287` |
| Every task is x86_64; services roll with min 100%, max 200%, circuit breaker | `compute.ts:338, 370-387` |
| Job split: `practice` or `platform` (else error) | `apps/worker/src/config.ts:84-98`; `apps/worker/src/main.ts:48-58, 69-82` |
| The screening job always runs `SET LOCAL ROLE tp_operator` | `apps/worker/src/screening/operator.ts:34-41` |
| The pricing functions are granted to `tp_operator`, each revoked from PUBLIC by name (no default privileges) | `packages/db/migrations/20261104090000_free_screening.sql:1967-1999` |
| `created_at` is the submission transaction's start; the web has parsed and checked the rows before it | migration :401; `routes.ts:421-489` |
| A claim goes stale only after 10 minutes in `pricing` | migration :1617, :1638 |
| A `pricing` to `pricing` update must add one attempt; `record` only locks the run | migration :427-430, :1748 |
| Completion and the send are in one transaction; `now()` there is that transaction's start | `job.ts:287-293` |
| Shared types held once per release and manifest, at most two, per process | `job.ts:106-125, 192-203` |
| Keyed read per run, by codes and the prospect's ZIP; five keyed types | `job.ts:204-230`; `apps/worker/src/price/keyed-release.ts:32, 85-94`; migration :1657-1717 |
| The sweep prices due runs inline, one after another | `job.ts:343-369` |
| Time is "open, PR 6b" until `compute.screening` exists | `tools/screening-capacity/limits.ts:75-92, 170-177`; `tools/screening-capacity/report.ts:45-70, 243-250` |
| The harness pins web and platform to the runner's last CPU and Postgres to the rest; a 2-CPU runner gives Postgres one CPU | `limits.ts:140-157`; `limits.test.ts:44-48`; `.github/workflows/screening-capacity.yml:143` |
| Every upload of a scenario has the same email domain, so the same rate-limit account | `tools/screening-capacity/uploads.ts:105`; `apps/web/src/lib/screening/rate.ts:114-135` |
| The web keeps production's screening closed until counsel's review is recorded | `apps/web/src/lib/screening/routes.ts:319-335` |
| The "sent" page says "usually within a few minutes" | `apps/web/src/app/screening/page.tsx:40-50` |
| Screening rate limits: 10 an hour per address, 20 a day per account (business domain, or free-mail mailbox) | `apps/web/src/lib/http/rate-limit.ts:50`; `rate.ts:114-135` |
| The screening grant test checks every `%screening%`/`%marketing%` function against an app list and an operator list | `packages/db/src/screening.db.test.ts:472-527` |
| The catalog: the app role may not `SET ROLE` billing, e-signature, operator or owner; five roles must own nothing | `packages/db/src/catalog.ts:466-471, 494-509` |
| The role bootstrap creates and grants CONNECT and USAGE to an explicit list | `packages/db/src/roles.ts:75-86, 124-126, 147, 153, 167-168` |
| Login memberships: inherit, switch (`INHERIT FALSE, SET TRUE`) or mark | `apps/worker/src/deploy/logins.ts:70-87`; `logins.db.test.ts:72` |
| Release: `ubuntu-24.04`; scans one build and pushes a second; the runbook rebuilds the web per environment | `.github/workflows/release.yml:18, 37-44, 69-80`; `docs/runbooks/deploy-and-rollback.md:41-46` |
| A service's count is 0 until `ImageTag` names a release | `infra/lib/deploy-parameters.ts:122-125` |
| Region: CDK's default; the diff tool defaults to us-east-1 | `infra/lib/app.ts:37`; `infra/lib/cdk-diff-plan.ts:39` |
| Production's database: db.t4g.medium (burstable Graviton) | `infra/lib/environments.ts:79, 128` |

---

## 2. Sizing by measurement

### 2.1 Machine, method and departures
- **Machine**: 4 vCPU Intel Xeon @ 2.10 GHz, 1 thread per core (lscpu), 16 GB, Linux 6.18, cgroup v1, Node 24.22.0,
  PostgreSQL 18.4 on 5433. The Docker daemon is not running, so every run used the harness's `ProcessRuntime`
  (`tools/screening-capacity/containers.ts:494-640`). A probe confirmed the four CPUs run in parallel (three pinned
  spin loops: 2,676-2,722 ms each against 2,786 ms alone).
- **Clone**: `claude/build-platform` 8e33cb3 in the scratchpad; `pnpm --filter @tp/worker build` and
  `pnpm --filter @tp/web build`, laid out as the images lay them out (worker `dist/` and `migrations/`, the web's
  standalone server with `.next/static` and `public`). Release: `tools/release/scale.ts` (58 s), synthetic release 900100,
  2,245,245 records, manifest `38034fe1…9014`, loaded once into `tp_pr6b_design_trackb_main` (319 s) and reused.
- **Scratch-only hooks. Their code was not kept** (the clone was deleted before review), so no row of §2.2 can be
  reproduced from this file. What each hook did, so it can be rebuilt:
  - `TP_CAP_CPUS` and `TP_CAP_MEM` gave the platform service the consumer's size, replacing
    `productionLimits().platform` (`limits.ts:76-92`). At 8e33cb3 the platform service prices the screenings.
  - `TP_CAP_CPUSET` replaced the platform's `taskCpuset` from `postgresLimit` (`limits.ts:140-157`).
  - `TP_CAP_PROCS=N` made `ProcessRuntime.startService` (`containers.ts:581-584`) start N platform processes in that
    one cgroup.
    - N processes sharing one quota stand for N screening threads in one task. They have separate heaps, as isolates
      do, but each has its own Node baseline, so the memory figures are an upper bound.
  - `TP_SCREENING_CONCURRENCY` set `localConcurrency` on the `screening_price` worker (`worker.ts:186-195`).
  - `TP_CAP_REUSE` skipped the release load (with `--keep-database`).
  - Each service was exec'd under `taskset -c <its cpuset>`, for the affinity finding below.

  The measurement of record is PR 6b's first CI capacity run, which runs the real thread pool and has the queue-order
  race fixed.
- **Command template** (each row of §2.2 gives its values):
  ```
  TP_CAP_REUSE=1 TP_CAP_CPUS=<vCPU> TP_CAP_MEM=<MiB> TP_CAP_CPUSET=<cpus> TP_SCREENING_CONCURRENCY=<k> TP_CAP_PROCS=<n> \
    taskset -c <harness cpus> pnpm -s screening:capacity --out runs/<label> --runtime process --images images \
    --admin-url postgres://postgres:***@localhost:5433/postgres --database tp_pr6b_design_trackb_main \
    --release-dir scale-release --scenarios <list> --keep-database
  ```
  Postgres was pinned (`taskset -a -p`) to CPUs 0-1, two CPUs as db.t4g.medium has, sharing them with the harness and
  Chromium. Run 9 was the exception, on CPU 0. The web stayed at its production limit (0.25 vCPU, 512 MiB) on CPU 3.
- **Departures from CI's Docker run, and which way**:
  - Gentler on the database phases: Postgres unlimited in memory, a warm OS cache, not restarted, no 1 ms delay.
  - Harsher: Postgres shares its CPUs with the harness and Chromium.
  - Harsher: in the 2-vCPU runs the web shares CPU 3 with the consumer.
  - As in CI: "fresh platform" restarts the consumer, so its shared types are cold in S1, S4 and S5.
  - Gentler than production after a long flood: Postgres ran on two full CPUs. db.t4g.medium earns 24 CPU credits an
    hour (a 20% baseline per vCPU) and bursts on its balance. One three-at-once burst uses about one credit. RDS runs
    T4g instances in Unlimited mode, so a drained balance is billed, not throttled (AWS's documentation; not verified
    here, §4).
- **Load**: every run started with a one-minute load average of 0.29 to 1.16 (`uptime` before each); none needed a repeat
  under the 1.5 rule.

### 2.2 Results (seconds from submission to email; phases of the consumer)

| # | Label | Consumer limits | Harness, Postgres CPUs | Scenario: times to email | Phases (worst shape) | Harness verdict and notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | c1v-2g-S1 (fresh load) | 1 vCPU, 2 GiB, CPU 2, 1 at a time | 0-1, 0-1 | S1 41.1 | shared 9.6, keyed 3.8 (150,423 records), pricing 13.6, recording 4.7 | first scan after the bulk load set hint bits; shared load not representative; load 0.56 |
| 2 | c1v-S1S4 | 1 vCPU, 2 GiB, CPU 2, 1 at a time | 0-1, 0-1 | S1 32.4; S4 35.0, 54.4, 75.4, small 54.2 | S1: shared 2.0, keyed 3.2, pricing 14.5, recording 4.1 | **failed: queue order** (race); serial: the third worst waits for two; load 0.83 |
| 3 | c1v-conc2-S4 | 1 vCPU, 2 GiB, CPU 2, **2 at a time** in one process | 0-1, 0-1 | S4 55.1, 55.3, 74.6, small 19.4 | interleaved runs' recording 16.8-17.0 (waiting on the shared event loop) | **failed: queue order** (race); no throughput gain over serial; load 0.81 |
| 4 | p2x1v-S1S4 | 2 processes × 1, 2 vCPU pool, CPUs 2-3 | 0-1, 0-1 | S1 27.1; S4 37.0, 37.4, 55.8, small 23.6 | S1: shared 2.0, keyed 2.7, pricing 10.8, recording 3.7 | two slots: third worst 55.8 s; load 0.29 |
| 5 | c05v-S1 | 0.5 vCPU, 1 GiB, CPU 2 | 0-1, 0-1 | S1 44.1 | shared 2.0, keyed 3.3, pricing 27.2, recording 4.0 | alone, 4 s under the line; load 0.77 |
| 6 | p3in2v-S4 | **3 processes in a 2 vCPU pool**, CPUs 2-3 | 0-1, 0-1 | S4 40.0, 38.3, 38.7, small 14.7 | pricing 14.8-16.7, keyed 2.5-3.4, recording 4.0-4.2 | **failed: queue order** (race); load 0.95 |
| 7 | **p3in2v-all** | **3 processes in a 2 vCPU pool**, 4 GiB, CPUs 2-3 | 0-1, 0-1 | S1 28.4; S2 12.4; S3 8.7; S4 39.4, 41.1, 37.5, small 13.4; S5 22.4, 22.1, 22.1, small 16.1 | S4: pricing 16.5-17.7, keyed 2.3-2.8, recording 4.3-4.8 | **every time under 48 s; verdict failed on queue order (the harness race), not on time, memory, a restart or the oracle**; consumer anon peak 1,119 MiB of 4,096; oracle equal for S1-1 (50,000 rows), S2-1 and S3-1 (18,432 each); load 1.16 |
| 8 | p4in2v-S4 | 4 processes in a 2 vCPU pool, CPUs 2-3 | 0-1, 0-1 | S4 46.8, 45.3, 45.8, small 19.2 | pricing 16.3-17.8 | **failed: queue order** (race); a fourth slot slows the large ones; load 0.97 |
| 9 | p3x1v-pg1-S4S5 | 3 processes × 1, 3 vCPU pool, CPUs 1-3 | **0, 0** | S4 47.6, 48.7, 47.6, small 17.2; S5 22.2, 21.8, 22.4, small 15.7 | keyed 6.1-6.2, recording 9.6-10.0 | **failed: queue order** (race); Postgres on one CPU is the bottleneck; load 0.49 |
| - | p3x1v-S4S5 (discarded) | 3 × 1, CPUs 1-3 | 0-1 | S4 62.4-63.9 | pricing 36-39 | invalid: see the affinity finding |

Every run's web phase (submission to its job's creation) took:
- 4.7-6.6 s alone;
- 10.2-18.5 s for three large uploads at once on one 0.25-vCPU web, which was throttled in 50-80% of periods.

Memory:
- one worst-shape screening peaks at 341-355 MiB anon in its process;
- two interleaved, at 446 MiB;
- three processes, at 1,119-1,174 MiB.

**What the small-upload times mean.** In the runs that failed queue order, the small upload's job was created before
a large one's. So its 13.4-23.6 s is the time of a small upload that took a slot ahead of a large one, not one waiting
behind three busy slots. The large uploads then carry that wait (one small pricing, about 1-2 s), so their times are
slightly pessimistic.

Expected time for a small upload truly behind three busy slots, **estimated from run 7 and not measured**:
- it is sent once the large runs exist, 10-18.5 s into the scenario;
- the first slot frees at about 37.5 s;
- its own pricing is about 1-2 s on a thread that already holds the shared types;
- so it is emailed about 39-40 s into the scenario, about **21-30 s after its own submission**.

That leaves 18 s or more under the line. PR 6b's harness fix (§5.1) measures it.

### 2.3 What the measurements decide
- **One screening uses one core for its JavaScript.** A second core in the same cgroup cut a lone worst screening from
  32.4 s to 27.1-28.4 s with no code change: pricing fell from 14.5 s to 10.8-13.9 s through V8's GC helper threads.
  Nothing else of one screening is parallel.
- **Splitting one screening across threads: considered, not recommended.** A lone run's 5,000-row batches
  (`job.ts:244-274`) could be priced on idle threads.
  - It gains at most about 2× on the pricing phase in 2 vCPU: about 6-7 s of a lone worst file's 28 s.
  - It gains nothing in S4, which is throughput-bound and sets the size.
  - Each helper thread needs the run's keyed view (150,423 records in the worst shape), so peak memory rises when the
    consumer is busiest.
  - Batches recorded by several threads would also need the attempt fence (migration :1748) held across threads.

  Revisit if staging's factor puts lone files near the line.
- **The binding case is three worst uploads at once.** It needs three screenings priced in parallel. With two slots the
  third waits a whole screening (55.8 s, run 4). Serial is 75.4 s (run 2).
- **Two at a time in one Node process is no better than one** (run 3). The second run only waits on the event loop
  while the first prices, so concurrency inside one task needs threads (or processes).
- **Three screenings sharing 2 vCPU meet 48 s with 6.9 s to spare** (run 7, worst 41.1 s).
  - A fourth slot costs the large ones about 5 s (run 8).
  - Three dedicated 1-vCPU slots price at least as fast. On this machine, and on a 4-CPU runner, they leave Postgres one
    CPU and land at the line (run 9).
- **The database phases matter at three at once.** With Postgres on 2 CPUs, the keyed read and recording take
  2.3-4.8 s; on 1 CPU, 6.1-10.0 s. Production's db.t4g.medium has 2 vCPU (`infra/lib/environments.ts:128`). So the
  harness must give Postgres the class's 2 vCPU (§5.1).
- **0.5 vCPU is too small** even alone (44.1 s, run 5).

**Affinity finding (a harness bug to fix in PR 6b).** Under cgroup v1, a process that joins a cpuset keeps the
intersection of its inherited affinity and the cpuset. A probe: a shell under `taskset -c 0-1` that joins cpuset `1-3`
gets `Cpus_allowed_list: 1`; joining `2`, it gets `2`.
- The process runtime starts services from a harness that the workflow pins to `0-(n-2)` (`screening-capacity.yml:143`).
- So a service cpuset that overlaps those CPUs silently shrinks to the overlap. In the discarded run, three processes
  ran on one CPU and pricing took 3× as long.
- Fix: `ProcessRuntime.startService` (`containers.ts:581-584`) execs each service under `taskset -c <its cpuset>`.
  Docker is not affected.

**Queue-order finding (a harness race to fix in PR 6b).** The small upload is sent once the large uploads' *runs*
exist (`run.ts:434-449`). But the web sends a run's job only after its transaction commits (`routes.ts:497-503`).
- On a 0.25-vCPU web, the small upload's job was created before a large one's in runs 2, 3, 6, 7, 8 and 9.
- `report.ts:274-283` then failed "queue order", although pg-boss behaved correctly.
- Fix: the harness waits for the large uploads' `pgboss.job` rows (`queueTimes`, `run.ts:324-330`) before it sends the
  small one.

### 2.4 The size chosen, and the margin
- **2 vCPU, 4 GiB (Fargate's least memory at 2 vCPU), one task, three screenings at once.** On this machine:
  - S4's worst, 41.1 s (14% under 48 s);
  - S1, 28.4 s; S5, 22.4 s;
  - memory, 27% of the limit;
  - a small upload behind three busy slots, an estimated 21-30 s (§2.2).
- **Margin for Fargate being slower.** Decision 15 puts the line at 48 s on GitHub's runner until staging measures the
  runner-to-Fargate factor. That leaves 25% (60/48) for Fargate by construction.
  - These figures are this machine's, not the runner's. The first CI run of PR 6b's build is the measurement of record,
    and it measures the thread pool, not this process stand-in.
  - If that run is above 44 s (8% under the line), the builders report it before merge as a sizing question to the
    founder, not a tuning.
- **Where the rest of the 48 s goes.** 10-18 s of S4 is the single web task taking in three 50,000-row uploads at
  0.25 vCPU.
  - Production runs two web tasks (`environments.ts:137`); the harness runs one (a listed harsher departure).
  - The time-to-email metric now counts that share (§3.5).
  - If staging shows the web's share dominating on Fargate, the web's size becomes a founder question, outside this
    track's scope.

---

## 3. The consumer

### 3.1 Settings (`infra/lib/environments.ts`)
```ts
export interface ScreeningServiceSettings extends ServiceSettings {
  /** Screenings priced at once in one task, each in its own worker thread (docs/adr/0062). */
  readonly concurrency: number;
  /** 'deploy': runs from the first released deploy; 'launch': held at 0 until the ScreeningConsumer parameter is 'running' (question 5). */
  readonly starts: 'deploy' | 'launch';
}
export interface ComputeSettings { …; readonly screening: ScreeningServiceSettings; }
// compute(): every environment; production's `starts` follows question 5 (recommended 'launch')
screening: { cpu: 2048, memoryMiB: 4096, desiredCount: 1, concurrency: 3, starts: 'deploy' },
```
- `tools/screening-capacity/limits.ts:76-84` drops its cast, because `compute.screening` is now typed.
- `ScreeningConsumer` becomes `ScreeningServiceSettings`.
- The harness reads `desiredCount` and ignores `starts`.
- Staging carries the same size, so its measurement of the factor is of production's task.

### 3.2 Worker and web code
- **`apps/worker/src/config.ts`**: `readWorkerJobs` accepts `screening`.
  - It requires `SCREENING_DATABASE_URL` and `QUEUE_DATABASE_URL`, and refuses `DATABASE_URL` and
    `OPERATOR_DATABASE_URL`.
  - `readScreeningWorkerConfig()` reads those, `SCREENING_CONCURRENCY` (an integer 1-8), `MAIL_FROM`, `APP_ORIGIN`,
    `STATIC_ASSET_ORIGIN` and the heartbeat.
  - `all` (development, tests) also works screening jobs when `SCREENING_DATABASE_URL` is set. It uses a
    `tp_screening_dev` login in `packages/db/src/roles.ts`, which switches to `tp_screening` as `BILLING_DEV_LOGIN`
    does (`roles.ts:168`).
- **`apps/worker/src/jobs/screening.ts` (new)**:
  - `SCREENING_JOB_TYPES = ['screening_price', 'screening_sweep']`;
  - payloads: `screening_price` keeps `SCREENING_PRICE_PAYLOAD`, and `screening_sweep` is `{}`;
  - schedule: `screening_sweep: '* * * * *'`;
  - `PLATFORM_JOB_TYPES` loses `screening_price` and keeps `screening_expiry`; `platform.ts:213-223` moves here.
- **`apps/worker/src/jobs/registry.ts`**: `SCREENING_QUEUE_OPTIONS = { ...QUEUE_OPTIONS, heartbeatSeconds: 60 }` and
  `SCREENING_JOB_HEARTBEAT_SECONDS = 60`. The option is pg-boss's queue option (`types.d.ts:575-579, 808-811`).
- **`apps/worker/src/jobs/enqueue.ts:40-43`**: `enqueueScreeningRun(boss, runId, { priority })` sends with the run's
  `singletonKey`, `priority` and `heartbeatSeconds: 60`. A job carries its own heartbeat even when it was sent before
  any worker updated the queue (`plans.js:2862`).
- **`apps/worker/src/worker.ts`**:
  - Every worker creates the screening queues with `SCREENING_QUEUE_OPTIONS`, as `worker.ts:173-175` does for the
    platform queues, so the web's send never meets a missing queue.
  - A screening worker runs at start:
    - `boss.updateQueue('screening_price', { heartbeatSeconds: 60 })`, because `createQueue` leaves an existing queue's
      options as they were (`plans.js:1024-1080`);
    - `boss.unschedule('screening_price')`, since the platform's old sweep schedule lives in `pgboss.schedule`;
    - `boss.schedule('screening_sweep', …)`.
  - It works `screening_price` with `{ batchSize: 1, localConcurrency: concurrency }` and `screening_sweep` with
    `{ batchSize: 1 }`.
  - A `screening_price` job with an empty payload (a schedule fired before the unschedule) runs the sweep.
- **`apps/worker/src/screening/threads.ts` and `thread.ts` (new)**: `thread.ts` is bundled as `dist/screening-thread.js`
  beside `page-thread.js`, through the entry points in `apps/worker/build.ts`.
  - The pool keeps `concurrency` long-lived worker threads. Each has its own operator pool (2 connections on
    `SCREENING_DATABASE_URL`), mail sender, logger and release cache.
  - Each thread runs `priceScreeningRun()` unchanged for the run ID it is handed, and posts back the outcome.
  - `resourceLimits.maxOldGenerationSizeMb` is 1024 per thread (measured peak 341-446 MiB a process).
  - A thread that exits (out of memory, a crash) fails only its job and is replaced; its run is recovered as in §3.7.
  - The main thread holds pg-boss, the job heartbeats, the worker heartbeat and the sweep, and prices nothing, so a
    busy thread never delays a heartbeat.
- **`apps/worker/src/screening/operator.ts:34-41`**: the role set in each transaction becomes a parameter. The
  screening consumer uses `SCREENING_ROLE` (`tp_screening`); `screening_expiry` stays `tp_operator`.
- **`apps/worker/src/screening/job.ts`**:
  - The sweep (`343-369`) stops pricing inline.
    - It still fails runs that are out of attempts.
    - It **re-sends** each due run's `screening_price` job with its singleton key, its `queue_priority` and the
      heartbeat. The policy is exclusive per key, so there is no duplicate.
    - It logs the queue gauge from `operator_screening_queue()`: message `screening queue`, `record_count` = normal
      queued runs, `elapsed_ms` = the oldest normal queued run's age.
    - Every pricing then goes through pg-boss's priority order and the three slots.
  - After a send (`284-313`), the elapsed time is measured once the send has returned: `Date.now()` minus the run's
    `received_at` as `operator_screening_complete()` returns it. It is logged as one of:
    - `screening result emailed`, for a normal-priority run that no pause held;
    - `screening result emailed after waiting`, for a run in the waiting tier or held by a mail pause.

    Allowed log fields only (`packages/observability/src/fields.ts:49`).
  - `SCREENING_STALE_SECONDS = 120`, which a db test holds equal to the SQL interval.
- **`apps/web/src/lib/screening/routes.ts`**:
  - The handler takes `receivedAt = new Date()` when it starts (`routes.ts:416`), before any parsing.
  - It passes that and `screeningRateAccount(contactEmail)` (`rate.ts:114-135`) to `submit_screening`.
  - After the submit, `screening_wait(run)` gives `queue_priority`, `wait_reason`, `pricing` and `queued_ahead`.
  - The job is sent with `{ priority: queue_priority }`.
  - The redirect is `/screening?sent=1&wait=soon|minutes|account|day`:
    - `account` or `day` when `wait_reason` is set;
    - `minutes` when `pricing + queued_ahead >= SCREENING_SLOTS`, the web's new setting (`desiredCount × concurrency`);
    - `soon` otherwise.
  - A waiting-tier upload logs `screening upload sent to wait`, with `error_code: SCREENING_ACCOUNT_SHARE` or
    `SCREENING_DAILY_CAP`.
- **`apps/web/src/app/screening/page.tsx:40-50`**: the first sentence of the "sent" alert follows `wait`. The wording is
  question 3's.

### 3.3 Database (PR 6b's migration; "Safe with the previous image running" as §3.3.6 says)

#### 3.3.1 Role, login, bootstrap and catalog
- **`packages/db/src/roles.ts`**:
  - `WANTED_ROLES` gains `tp_screening`: NOLOGIN, INHERIT, and NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE
    NOREPLICATION.
  - The dev logins gain `tp_screening_dev`.
  - `managedRoles()` (`124-126`) adds `tp_screening` after `JOB_ROLE`.
  - `grantStatements()` adds `tp_screening` to the `CONNECT ON DATABASE` grant (`147`) and the `USAGE ON SCHEMA public`
    grant (`153`), and adds `switchesTo(SCREENING_DEV_LOGIN, SCREENING_ROLE)` beside billing's (`168`).
  - `tp_screening` owns nothing and is a member of nothing.
- **`apps/worker/src/deploy/logins.ts`**: `tp_screening_login`, from `TP_SCREENING_LOGIN_USERNAME`/`_PASSWORD`, is
  granted `[logins.screening, SCREENING_ROLE, 'switch']`, i.e. `WITH INHERIT FALSE, SET TRUE` (`logins.ts:75`).
  - That is billing's pattern. `asOperator` always runs `SET LOCAL ROLE` (`operator.ts:40`), so the login holds nothing
    until it switches.
  - It has no other membership. Its rotation `_clone` is the same.
- **`packages/db/src/catalog.ts`**:
  - the app role's no-`SET ROLE` list (`466`) gains `SCREENING_ROLE`, so a membership granting `tp_app` the switch
    fails the catalog;
  - the owns-nothing list (`494-500`) gains `['screening', SCREENING_ROLE]`;
  - `REVIEWED_SCOPE_FUNCTIONS` is unchanged, since no function here sets `app.practice_ids`.

#### 3.3.2 Columns on `screening_run`
| Column | Type and CHECK | Rule |
| --- | --- | --- |
| `received_at` | `timestamptz NOT NULL`, `CONSTRAINT screening_run_received CHECK (received_at BETWEEN created_at - interval '10 minutes' AND created_at)` | When the web began receiving the upload, by the web's clock. `submit_screening()` clamps the value it is given into that range: `least(greatest(coalesce(received, now()), now() - interval '10 minutes'), now())`. It never refuses a prospect over a clock. Existing rows are backfilled `= created_at` before `SET NOT NULL` |
| `account_sha256` | `text NOT NULL`, `CHECK (account_sha256 ~ '^[0-9a-f]{64}$')` | SHA-256 of the rate-limit account (`domain:<d>` or `address:<mailbox>`, `rate.ts:114-135`), set by `submit_screening()`. Backfill: SHA-256 of `'run:' \|\| id`. The plain address sits beside it in `screening_prospect` for the same 30 days and is deleted with it (`operator_screening_expire`), so the hash exposes nothing new |
| `wait_reason` | `text NULL`, `CHECK (wait_reason IN ('account_share', 'daily_cap'))` | Set once at submission (§3.4) |
| `queue_priority` | `smallint NOT NULL DEFAULT 0`, `CONSTRAINT screening_run_priority CHECK (queue_priority BETWEEN -20 AND 0 AND (queue_priority = 0) = (wait_reason IS NULL))` | pg-boss priority, higher first. 0 is pg-boss's default, so the previous web image's sends rank as normal |
| `progress_at` | `timestamptz NULL`, `CHECK (progress_at IS NULL OR status <> 'queued')` | Set by the claim and by every recorded batch; moves forward only |

`screening_run_rules()` lists `received_at`, `account_sha256`, `wait_reason` and `queue_priority` among the columns a
run keeps.

**Indexes**:
- `screening_run_created_at ON screening_run (created_at)`, for the day's sums;
- `screening_run_account_day ON screening_run (account_sha256, created_at)`, for the account's sum;
- `screening_run_waiting ON screening_run (queue_priority DESC, created_at) WHERE status = 'queued'`, for due, wait and
  queue.

#### 3.3.3 New functions (`SET search_path = pg_catalog, public, pg_temp`; counts only)
- **`screening_wait_limits() RETURNS TABLE (account_rows integer, daily_rows integer)`**: IMMUTABLE, **SECURITY
  INVOKER**, revoked from PUBLIC and granted to no role.
  - It returns question 2's numbers and is called only inside `submit_screening()`, which runs as the owner.
  - Nothing in the web reads the numbers (the earlier `SCREENING_DAILY_ROW_CAP` constant is dropped).
  - It passes the grant test as a function granted to no role and not a definer (`screening.db.test.ts:525`).
- **`operator_screening_queue() RETURNS TABLE (queued integer, queued_waiting integer, pricing integer, oldest_queued_ms bigint)`**:
  STABLE, SECURITY DEFINER.
  - `queued` and `oldest_queued_ms` count normal-priority runs only. `queued_waiting` counts the waiting tier.
- **`screening_wait(run uuid) RETURNS TABLE (queue_priority smallint, wait_reason text, pricing integer, queued_ahead integer)`**:
  STABLE, SECURITY DEFINER.
  - `queued_ahead` counts queued, unexpired runs that pg-boss takes first: a higher priority, or the same priority and
    created earlier.
  - An unknown run returns no row.

#### 3.3.4 The shared screening functions: one owner, one final body, one place
PR 6b ships one migration file. If the tracks split it, the shared section goes in the last file. Its sections run in
this order:
1. Track A's tables, columns and helpers (`rule_record` type CHECK with `locality_map_plus_four`, `practice_site`,
   `screening_prospect.zip_plus_four`, `locality_status()`, the split rename);
2. Track C's tables and helpers (`mail_stream` and its pause and resume times, the mail-event table,
   `mail_recipient_sha256()`, `screening_mail_status()`);
3. this track's columns, backfills and indexes (§3.3.2), and `screening_wait_limits()`;
4. **the shared functions below, each written once in its final form**;
5. this track's `operator_screening_queue()` and `screening_wait()`;
6. **privileges, once, last** (§3.3.5).

No track writes its own copy of a function in this table. The owner writes the body and its db tests from the merged
specification, and the other tracks review it.

| Function | How | Owner | Final signature and returns | Merged body (each track's part) |
| --- | --- | --- | --- | --- |
| `submit_screening` | DROP the PR 6 signature (migration :1047-1050), CREATE | **Track A** | Track A's parameters (`plus_four text` after `zip5`; under its Q6 (a), three out-of-span counts after `allowed_cents_left_out`), then **`received timestamptz, rate_account text`** before `request text`. RETURNS uuid, unchanged. "Signature unchanged" (revision 1) is withdrawn | Refusals in this order, before anything is recorded: closed (`screening_status()`) and **C** `screening_paused`; **A**'s ZIP status (`screening_zip_unknown`, `screening_zip_plus_four`, `screening_zip_plus_four_unknown`, `screening_locality_not_loaded`); **C** `contact_undeliverable`; **A** `screening_band_outside_content`. Then the insert as today, with **B**'s `received_at`, `account_sha256`, `wait_reason` and `queue_priority` (§3.4) |
| `operator_screening_claim(uuid)` | DROP, CREATE (the return type changes) | **Track A** | PR 6's eight columns plus **A** `zip_plus_four text` | **C**: no row while the screening stream is paused. **B**: stale means `progress_at < now() - interval '2 minutes'` (it was `started_at` over 10 minutes, :1638); the claim sets `progress_at = now()` |
| `operator_screening_due(integer, integer)` | DROP, CREATE (the return type changes) | **Track B** | `(run_id uuid, status text, attempts integer, queue_priority smallint)`. The previous image selects `run_id, status, attempts` by name (`operator.ts:64`), so the extra column is harmless | **B**: the same staleness; `ORDER BY queue_priority DESC, created_at, id`. **C**: no row while paused |
| `operator_screening_complete(uuid, text, text, text, text, integer)` | DROP, CREATE (the return type changes) | **Track B** | `(contact_email text, row_count integer, kept_with text, received_at timestamptz, wait_reason text, held_by_pause boolean)` | **C**: raises `screening_mail_paused` while paused, before any update. **B**: the three new columns; `held_by_pause` is true when the screening stream was resumed after the run's `received_at` (Track C's resume time) |
| `operator_screening_release(uuid)` | CREATE OR REPLACE (ACL kept) | **Track B** | unchanged | **B**: probes `rule_record_by_type` (§7.3). **A**: `locality_map_plus_four` is the sixth keyed type it leaves out |
| `operator_screening_run_records(uuid)` | CREATE OR REPLACE | **Track A** | unchanged | **A**: adds `('locality_map_plus_four', {zip})` keyed by the five-digit ZIP |
| `operator_screening_record(…)` | CREATE OR REPLACE | **Track B** | unchanged | **B**: `UPDATE screening_run SET progress_at = now() WHERE id = $1 AND status = 'pricing' AND attempts = $17` replaces the `PERFORM … FOR SHARE` (:1748), with the same refusal when no row matches |
| `screening_run_rules()` (trigger) | CREATE OR REPLACE | **Track B** | trigger | **B**: the four new fixed columns; a new first branch where `pricing` to `pricing` at the same attempt may change only `progress_at`, and only forward (`>=`); the claim branch may set `progress_at` |

Not shared, and unchanged by this track:
- `operator_screening_run_keys(uuid)` keeps `(codes, zip)`. Revision 1's ZIP+4 return is withdrawn (§7.1).
- `operator_screening_fail`.
- Track C alone changes `operator_screening_reminders_due`. Track A alone changes `screening_status()` and the split
  functions.

#### 3.3.5 Privileges (the migration's last section)
```sql
-- Every function this migration creates, or drops and creates, is revoked from PUBLIC by name (there are no default
-- privileges: free_screening.sql:1967-1985); CREATE OR REPLACE keeps an ACL, so those are not repeated.
REVOKE ALL ON FUNCTION submit_screening(<final signature>), operator_screening_claim(uuid), operator_screening_due(integer, integer),
  operator_screening_complete(uuid, text, text, text, text, integer), screening_wait_limits(), operator_screening_queue(),
  screening_wait(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION submit_screening(<final signature>), screening_wait(uuid) TO tp_app;
-- The one-release overlap: the previous image's platform task still claims and completes.
GRANT EXECUTE ON FUNCTION operator_screening_claim(uuid), operator_screening_due(integer, integer),
  operator_screening_complete(uuid, text, text, text, text, integer) TO tp_operator;
GRANT EXECUTE ON FUNCTION operator_screening_due(integer, integer), operator_screening_claim(uuid),
  operator_screening_release(uuid), operator_screening_run_keys(uuid), operator_screening_run_records(uuid),
  operator_screening_rows(uuid, integer, integer, integer),
  operator_screening_record(uuid, integer[], text[], bigint[], numeric[], bigint[], bigint[], boolean[], bigint[], numeric[],
    bigint[], bigint[], text[], text[], text[], text[], integer),
  operator_screening_complete(uuid, text, text, text, text, integer), operator_screening_fail(uuid, text, text, integer),
  operator_screening_queue() TO tp_screening;
-- Next schema PR after PR 6b deploys: REVOKE EXECUTE ON FUNCTION <the nine above> FROM tp_operator.
```
Track A's and Track C's own new functions keep their own REVOKE and grant lines in this section.

`tp_screening` is not granted:
- `operator_screening_expire`, which stays the platform's;
- `operator_screening_reminders_due` and `operator_screening_reminder_sent`, which PR 6e decides;
- any table, or any other function.

#### 3.3.6 Safety with the previous image, the PHI registry, the domain model
- **Previous image.** Track A's new `submit_screening` signature fails the previous web's submissions during the deploy
  window. The screening is closed in production until release 1, so no prospect reaches it there. The previous web's
  sends use pg-boss's default priority 0, which is normal.
  - The previous platform task keeps `tp_operator`'s grants. It reads `due` by column name.
  - Its `claim` and `record` calls work against the new bodies: the trigger accepts the claim's `progress_at`, and
    `record` only adds an update.
- **PHI registry**: unchanged. The screening tables hold aggregate rows, with no practice and no patient
  (`20261015140000_tenancy.sql:137-146`). `tp_screening` reads no table. `account_sha256` is a prospect's contact
  identifier, with the same 30-day life as the address beside it. It is not PHI.
- **Domain model**: regenerated (the role, grants, five columns, three indexes, three new functions, seven changed
  bodies). It needs the founder's SHA-256 approval.

### 3.4 Queue order: the account share, the daily cap, and the honest message
- **At submission**, `submit_screening()` reads `screening_wait_limits()` and makes two sums over today's runs (UTC):
  - the account's rows: `account_sha256` equal, `created_at` since the UTC day began, plus this upload's;
  - the day's normal-tier rows: `wait_reason IS NULL`, plus this upload's.

  It then sets the tier:
  - **account_share**, when the account's rows exceed its share. Priority is `−least(20, 1 + the account's earlier
    waiting-tier runs today)`, so an account's 3rd worst-shape upload goes at −1 and its 4th at −2. Heavy accounts take
    turns, and no account's surplus goes ahead of another's first surplus file.
  - otherwise **daily_cap**, at −1, when the day's normal-tier rows exceed the cap;
  - otherwise normal, at 0.
- **The cap counts only normal-tier rows.** One firm's surplus therefore does not use up the protection meant for
  everyone else. With the recommended numbers, the cap is reached only by at least ten accounts' full shares, or twenty
  worst-shape files from twenty accounts.
- **No lock is taken for the sums.** A lock would serialise every submission's 50,000-row insert behind the next. So
  concurrent submissions can overshoot the cap by what is in flight at once, a few files. This is stated in ADR 0062.
- **Order.** pg-boss fetches by priority, then age (`plans.js:1271-1275`). The sweep re-sends with the stored priority,
  and `operator_screening_due` orders the same way.
  - A waiting-tier run is priced as soon as no normal run is queued ahead of it.
  - Starvation is bounded by the normal tier's daily rows (the cap): about 20 worst-shape files a day, minutes of work.
- **It is not a refusal** and keeps no new data beyond the hashed account (§3.3.2).
- **The harness**: `tools/screening-capacity/uploads.ts:105` gives each upload its own domain
  (`…upload<n>.capacity-<scenario>.synthetic.test` becomes `capacity-<scenario>-upload<n>.synthetic.test`).
  - S4 stands for three different prospects, as the audit intends. Today all its uploads share one rate-limit account,
    so the third worst would be over the account's share.
  - The report fails any scenario upload that lands in the waiting tier.
- **The promise.** Waiting-tier uploads are outside decision 14's 60 seconds; this is how audit #53's adopted daily cap
  works. The account share extends it to one heavy account, which is question 2.

### 3.5 Metrics and alarms (`infra/lib/constructs/monitoring.ts`, a contract file `infra/lib/screening.ts`)
Log group `/tp/<env>/screening` (a year, the environment key, as `monitoring.ts:139-143`).

| Metric (namespace `TherapyPlatform/Screening`) | From | Alarm (operator topic) |
| --- | --- | --- |
| `Heartbeat` | the worker heartbeat line | two missed 60-s beats, missing data breaching; OK on recovery |
| `JobFailedOnLastAttempt` (existing metric) | the job-failure line | the existing alarm |
| `TimeToEmailMs` (value `$.elapsed_ms`) | `screening result emailed`: from the web's `received_at` until the send returns | Maximum > 60,000 in a 5-minute period (the promise broken for anyone in the normal tier) |
| `OldestQueuedMs` (value `$.elapsed_ms`) | `screening queue`: the oldest **normal-priority** queued run | Maximum > 120,000 for 2 of 2 one-minute periods, missing not breaching |
| `RunFailed` | screening lines at level error, or `PRICING_ATTEMPTS_EXHAUSTED` | Sum ≥ 1 in 5 minutes |
| `UploadsSentToWait` (web log group) | `screening upload sent to wait` | Sum ≥ 1 in an hour |

- `TimeToEmailMs` still leaves out the browser's own upload time before the web receives the first byte. That is the
  prospect's network, not ours. The harness bounds it (§5.3).
- The waiting tier and runs held by a mail pause are logged under `screening result emailed after waiting` (Track C's
  exclusion), so they do not breach the promise alarm. A capped day does not hold `OldestQueuedMs` in alarm, and that
  alarm no longer duplicates `UploadsSentToWait`.
- Each alarm's text is fixed and names the environment, never a value from a log (`monitoring.test.ts:121`).

### 3.6 Infrastructure
- **`infra/lib/constructs/compute.ts`**:
  - `WORKER_JOBS.screening = 'screening'`;
  - `SCREENING_STOP_TIMEOUT = Duration.seconds(120)` (Fargate's maximum);
  - task definition `tp-<env>-screening`: 2048, 4096, X86_64 until #136; task role `ScreeningRole`;
  - container `screening`, from the worker image, running `COMMANDS.worker`:
    - URLs: `SCREENING_DATABASE_URL` (the screening secret) and `QUEUE_DATABASE_URL` (the queue secret, role
      `tp_queue`);
    - settings: the common ones, plus `WORKER_JOBS`, `WORKER_HEARTBEAT_SECONDS`, `SCREENING_CONCURRENCY`, `MAIL_FROM`,
      `APP_ORIGIN` and `STATIC_ASSET_ORIGIN`;
  - service `tp-<env>-screening`, with the same circuit breaker and rolling settings, waiting on the migration run. Its
    count is:
    - `countOnceReleased(desiredCount)` when `starts` is `'deploy'`;
    - when `starts` is `'launch'`, 0 until the `ScreeningConsumer` parameter is `running` (a second condition beside
      `Released`, `deploy-parameters.ts:122-125`);
  - **no Application Auto Scaling target** for the service;
  - the web gains `IMAGE_TAG` (the `ImageTag` parameter), `SCREENING_LAUNCH` and `SCREENING_SLOTS`;
  - the migration task gains `loginField(database.screeningSecret, LOGIN_SECRET_VARIABLES.screening)`.
- **`infra/lib/launch.ts:23`**: `ConnectionUrl.variable` gains `'SCREENING_DATABASE_URL'`.
- **`infra/lib/constructs/database.ts`**:
  - `SCREENING_LOGIN = 'tp_screening_login'`;
  - `ScreeningLoginSecret` (`rds.DatabaseSecret`, the environment key, the same excluded characters), with the
    multi-user hosted rotation (`database.ts:206-213`);
  - `network.screeningSecurityGroup` among the clients (`database.ts:211`).
- **`infra/lib/constructs/network.ts`**: `ScreeningSecurityGroup`.
  - No ingress. Egress only to 443 on `endpointSecurityGroup` and on the S3 gateway prefix list (image layers), and to
    5432 on the database.
  - SES, Secrets Manager, CloudWatch Logs and ECR are interface endpoints (`network.ts:16-25`), so no route through NAT
    is needed, and none is allowed. The service that prices what strangers upload can reach no host but AWS's.
- **`infra/lib/constructs/screening-role.ts` (new)**: `ses:SendEmail` on the account's identities (as
  `operator-role.ts:159-163`). Track C narrows it to its screening identity and configuration set.
- **`infra/lib/deploy-parameters.ts`**:
  - `ScreeningLaunch`: default `closed`, pattern `^(closed|v[0-9A-Za-z.\-]{1,60}:[0-9a-f]{64})$`;
  - `ScreeningConsumer`: `held` or `running`, default `held`. It is used only where `starts` is `'launch'` (question 5).
- **`infra/lib/platform-stack.ts`**: the wiring (role, log group, props).

### 3.7 How the platform stops, and how a deploy moves queued jobs without loss
- **Stopping.** The new platform image no longer lists `screening_price`, so it neither schedules nor works it
  (`worker.ts:186-195` iterates `PLATFORM_JOB_TYPES`).
  - Its `tp_operator` grants stay for one release. So the previous image's platform task, still running during the
    rolling deploy, finishes what it holds, or loses it to the fenced claim, without permission errors or false
    job-failure alarms.
- **Queued jobs.** The queue (`screening_price`) and every run live in Postgres, not in a task. The name is unchanged,
  so the new consumer works the jobs the previous image queued. ECS starts the new task before it stops the old one
  (min 100%, max 200%, `compute.ts:381-382`).
- **In flight.** On SIGTERM the consumer stops fetching and waits for its threads: `boss.stop` is graceful for 110 s,
  under the 120-s stop timeout. A worst-shape screening took at most 41 s three at once here.
- **A run cut off anyway** (a crash, a lost task, a lost zone) keeps its recorded batches. Recovery:
  1. The job's heartbeat (60 s, on the queue and on each job) stops. pg-boss fails the job on its next supervision,
     which releases the exclusive key (`plans.js:1278`, states up to `active`).
  2. Its retry, or the sweep's re-send once the run's `progress_at` is 2 minutes old, claims the run again.
  3. The next attempt prices only the rows still pending, fenced by its attempt, with at most three attempts.

  Nothing is lost, and that prospect waits about 3 minutes. Without the heartbeat, the job stays `active` until
  pg-boss's 15-minute default expiry and blocks the re-send.
  - The heartbeat applies on a database where the queue already exists, through `updateQueue` and the per-job option.
    `createQueue` alone would not apply it (`plans.js:1024-1080`).
  - A thread that dies alone fails its job at once, and the same path recovers it.
- **Rollback across PR 6b** is run from the previous tag's checkout, because the previous image does not know
  `WORKER_JOBS=screening`. Its platform prices again, because `tp_operator`'s grants are kept.
  - If that rollback deletes `ScreeningLoginSecret`, redeploying PR 6b first needs
    `DROP ROLE tp_screening_login, tp_screening_login_clone`, so that the migration task recreates the login from the
    new secret. The runbook says both.
  - Per audit #136 (`combined-report.md`, "before the first staging deploy"), no environment has been deployed yet. So
    PR 6b's first deploy has no previous image, and these rules hold for every later deploy.

---

## 4. Monthly cost (founder's questions 1, 4 and 5)

**Region**: the stacks take CDK's default region (`infra/lib/app.ts:37`). Nothing pins one, and the diff tool assumes
us-east-1 (`cdk-diff-plan.ts:39`). Prices below are us-east-1; us-east-2 lists the same Fargate rates.

**Prices, read 2026-10-21.** This container's proxy refused `aws.amazon.com` (HTTP 403 on CONNECT; WebFetch could not
resolve it). So these figures come from search results of the pages below and are **flagged unverified** until they are
read on AWS's own pages.
- **Fargate Linux on demand** ([aws.amazon.com/fargate/pricing](https://aws.amazon.com/fargate/pricing/)):
  - x86: $0.04048 per vCPU-hour (the page's per-second 0.000011244 × 3,600) and $0.004445 per GB-hour;
  - ARM (Graviton): $0.03238 per vCPU-hour (0.0000089944 × 3,600) and $0.00356 per GB-hour;
  - the memory rates come from third parties, [cloudchipr.com](https://cloudchipr.com/blog/aws-fargate-pricing) and
    [vantage.sh](https://www.vantage.sh/blog/fargate-pricing);
  - 20 GB of ephemeral storage is included.
- **CloudWatch** ([pricing](https://aws.amazon.com/cloudwatch/omni/pricing/)): a custom metric $0.30 a month (the first
  10,000), a standard alarm $0.10, log ingestion $0.50 per GB, storage $0.03 per GB-month.
- **Secrets Manager** ([pricing](https://aws.amazon.com/secrets-manager/pricing/)): $0.40 a secret a month, $0.05 per
  10,000 calls.
- **GitHub larger runners**
  ([docs.github.com](https://docs.github.com/en/billing/reference/actions-runner-pricing)): Linux x64 4-core $0.012 a
  minute, 8-core $0.022. They need a Team plan or above, and included minutes do not apply.
- **RDS T4g surplus CPU credits** (Unlimited mode): billed per vCPU-hour above the earned balance. The rate is not
  read here (unverified). Expected use is far inside the earned balance (§2.1), so it is $0 at expected volume.

**Can the image run on ARM?** Yes:
- `node:24-slim` is multi-arch;
- the bundle is plain JavaScript (`pg-native` excluded, `apps/worker/build.ts`);
- Playwright ships arm64 Chromium, and the consumer uses no Chromium anyway.

It needs arm64 images from CI and a capacity run on arm64 first: audit #136 (final pass, before the first staging
deploy).

**Per task-month (730 hours)**:
- 2 vCPU/4 GiB x86: $59.10 + $12.98 = **$72.08** (ARM $57.67);
- 1 vCPU/2 GiB x86: $36.04 (ARM $28.84);
- 0.5 vCPU/1 GiB x86: $18.02 (the audit's "about $18").

**What the recommended consumer adds each month, per environment**
| Item | Production (once running) | Basis |
| --- | --- | --- |
| Fargate, one task 2 vCPU/4 GiB, always on | $72.08 | above |
| CloudWatch: 5 new metrics, 5 alarms | $1.50 + $0.50 | §3.5; a metric with no data in a month costs nothing |
| CloudWatch Logs: about 20 MB a month | under $0.05 | heartbeat and gauge lines each minute, about 8 lines a screening |
| Secrets Manager: the login's secret | $0.40 | its rotation Lambda runs once a rotation period: under $0.01 |
| NAT, data transfer | $0 | no internet egress; interface-endpoint processing $0.01/GB, negligible |
| **Total** | **≈ $74.50** (ARM after #136 ≈ $60.10) | |

- **Production before launch** (question 5): about $74.50 a month while the screening stays closed, or about $0.40 (the
  secret) if held at 0 until launch.
- **Staging**, carrying the same task and always on: about $74.50.
- **CI** (question 4), once the repository is private:
  - the capacity workflow on a 4-core larger runner: about 45 minutes a run and about 40 runs a month (pushes and pull
    requests on its paths, the weekly run, releases), ≈ $22 a month;
  - the release workflow's capacity job: ≈ $0.54 a release, inside the 40 runs.

**Options (recommended first)**
| | A (recommended): 1 task, 2 vCPU/4 GiB, three at once in threads | B: 3 tasks, 1 vCPU/2 GiB, one each | C: 1 task, 1 vCPU/2 GiB, step-up to 3 on queue depth |
| --- | --- | --- | --- |
| Production a month (x86) | ≈ $74.50 | ≈ $110.50 | ≈ $38.60 (two scaling alarms included) plus the hours stepped up |
| S4 worst-case time, this machine | 41.1 s (measured, three processes standing for three threads) | not measurable faithfully on 4 CPUs; pricing at least as fast as A, Postgres-bound at 47.6-48.7 s when sharing | third worst 75.4 s, small 54.2 s (measured serial); a step-up arrives minutes after the burst |
| Lone worst file | 28.4 s | 32.4 s | 32.4 s |
| CI runner for an honest run (Postgres keeps the class's 2 vCPU) | 4-core | 8-core ($0.022/min, Team plan); until it exists, time cannot be enforced faithfully | 4-core |
| What it gives up | one task: a crash or a lost zone delays in-flight and queued screenings ~3 minutes (never loses one); a thread pool is new code | $36 a month more, a dearer CI runner, slower lone files; gains zone redundancy and per-screening isolation | decision 14's promise for any two large files at once (needs the founder to change that ruling); audit #53's "never uncapped scaling" still holds but the step-up is reactive |

A variant of A with two tasks, for zone redundancy, costs ≈ $146.60.

---

## 5. The time check (decisions 13 to 16)

### 5.1 Harness: run the consumer as production will
- **`tools/screening-capacity/limits.ts`**:
  - `ProductionLimits` gains `screening: ContainerLimit` (2, 4096), `screeningTasks` (1) and `screeningConcurrency` (3).
  - `platform` stays `taskLimit(settings.compute.platform)` (0.25, 512).
  - `HARNESS_RUNS_SCREENING_CONSUMER = true`.
  - A layout function replaces `postgresLimit`'s CPU rule (`140-144`):
    - consumer CPUs = ⌈cpus × tasks⌉;
    - **Postgres = the database class's vCPUs (2 for db.t4g.medium)** on the first CPUs, with the harness and Chromium;
    - the consumer on the next CPUs;
    - web and platform on the last consumer CPU (a listed harsher departure).

    On a 4-CPU runner: Postgres `0-1`, consumer `2-3`, web and platform `3`.
  - Postgres memory subtracts every task's memory.
  - `runnerTooSmall` fails a runner with fewer CPUs than the class's vCPUs plus the consumer CPUs (4 for option A), or
    one that leaves Postgres under 2 GiB. A 3-CPU runner would leave Postgres one CPU, which run 9 showed lands at the
    line.
- **`tools/screening-capacity/env.ts`**:
  - `screeningEnvironment()`: `WORKER_JOBS=screening`, the screening and queue logins, `SCREENING_CONCURRENCY` from the
    settings, and `NODE_ENV=test` with `MAIL_OUTBOX_DIR` for the same reason as the platform's (`env.ts:1-15`);
  - `HARNESS_LOGINS` and `loginsEnvironment` gain the screening login;
  - `DEPARTURES` gains the shared last CPU and the burst-credit note (§2.1);
  - `NODE_ENV_READS` is unchanged in count (the new reader is in `config.ts`, whose entry's text names it).
- **`tools/screening-capacity/containers.ts`**:
  - service names gain `screening-1…N`;
  - Docker runs each with `--cpus`, `--memory` equal to `--memory-swap`, and the consumer cpuset;
  - the process runtime execs each service under `taskset` (§2.3).
- **`tools/screening-capacity/run.ts`**:
  - starts the consumer task(s) beside web and platform, and restarts them where a scenario asks for a fresh consumer;
  - reads phase lines from their logs;
  - sends the small upload once the large uploads' **jobs** exist (§2.3);
  - records the platform's jobs: a `screening_price` among them fails the run ("platform priced a screening");
  - records each upload's logged `elapsed_ms` and tier.
- **`tools/screening-capacity/uploads.ts:105`**: one email domain per upload (§3.4).
- **The static asset origin.** When the measured web image carries production's asset origin (§5.4), the harness's
  Chromium routes `<origin>/_next/static/*` to the web container's own `/_next/static/*`, which the image keeps.
  - `run.ts` adds a Playwright `context.route`, and the report fails any request that left for the static origin.
  - The builder verifies this with S1 on a web image built with a dummy origin.
- **`tools/screening-capacity/report.ts`**:
  - `REPORT_FORMAT` becomes `tp-screening-capacity/4`, with `consumer: { tasks, cpus, memoryMiB, concurrency }` and
    `images: { web, worker }` (image IDs);
  - `limitProblems` and the memory, restart and OOM checks cover every consumer container (90% of 4,096 MiB);
  - time is enforced;
  - the queue-order check stays as written, since it holds for any slot count once the harness waits for the jobs;
  - an upload in the waiting tier fails the scenario.
- **`.github/workflows/screening-capacity.yml`**:
  - the harness's CPUs come from the layout (`pnpm screening:capacity --print-harness-cpus`) instead of `0-(n-2)`
    (`:143`);
  - `runs-on` (`:74`, `:167`) names the 4-core larger runner once the repository is private (question 4).

### 5.2 The line (decision 15)
The constants are unchanged: `TIME_ALLOWANCE_MS = 48_000`, `TIME_PROMISE_MS = 60_000`, `RUNNER_TO_FARGATE = null`
(`limits.ts:170-177`). Every upload of every scenario is judged, the small ones included. No scenario upload may be in
the waiting tier.

### 5.3 Tests that change
- **`tools/screening-capacity/limits.test.ts`**:
  - `17-25` expect:
    - `compute.screening` = `{ cpu: 2048, memoryMiB: 4096, desiredCount: 1, concurrency: 3, starts: … }`;
    - `limits.screening` = `{ cpus: 2, memoryMiB: 4096 }`;
    - `limits.platform` still 0.25/512;
    - `screeningConsumer` not null.
  - `44-54` expect:
    - 4 CPUs/16 GB: Postgres 2 CPUs `0-1` and 4,096 MiB, consumer `2-3`, web and platform `3`;
    - 2 CPUs/7 GB: "the runner has 2 CPUs; the test needs 4 (2 for Postgres, db.t4g.medium's, and 2 for the screening
      consumer)";
    - 3 CPUs: the same refusal, naming 3.
- **`tools/screening-capacity/report.test.ts`**:
  - `30-37`: the real settings replace `withConsumer()`.
  - `134-140`: `timeRule(environmentSettings('production'), RUNNER_TO_FARGATE)` equals ENFORCED, and a settings object
    without `compute.screening` (built in the test) is still OPEN. That proves the switch both ways.
  - `142-153`: asserts `HARNESS_RUNS_SCREENING_CONSUMER` is `true`, and keeps "consumer not run" for
    `timeRule(settings, null, false)`.
  - `162-178`: unchanged (47.9 s pass, 48.1 s allowance, 60.1 s promise, the factor case).
  - New cases fail when:
    - a consumer container was measured at a size other than the one declared ("limit not applied");
    - the platform ran `screening_price`;
    - an upload was in the waiting tier;
    - a request left for the static origin.
  - New: an upload whose logged `elapsed_ms` is above its harness time, or more than 2 s below it, fails "time metric
    out of bounds".
    - The harness's clock starts at the browser's POST, before the web's `received_at`, so the logged value is never
      above it.
    - The upload's transfer over loopback is well under 2 s.
    - This proves that the metric covers the web's share and the send.
- **`tools/screening-capacity/env.test.ts`, `measure.test.ts`**: the screening environment and log parsing.

### 5.4 Decision 13: the screening does not open until the latest capacity run on the image being deployed passes with time enforced
1. **The release workflow builds, measures and pushes exactly what production deploys.** `.github/workflows/release.yml`
   is restructured:
   - `build` builds the worker image and the web images:
     - `web`, with no asset origin;
     - `web-staging` and `web-production`, each with its `STATIC_ASSET_ORIGIN` from a repository variable
       (`STAGING_STATIC_ASSET_ORIGIN`, `PRODUCTION_STATIC_ASSET_ORIGIN`), set once each environment's CloudFront exists.

     Each image is scanned and described by an SBOM.
   - `capacity` runs the Docker harness, with time enforced, on the worker image and `web-production` exactly as built.
     It runs on the same 4-core runner as the capacity workflow (question 4).
   - `push` pushes **the scanned and measured images** with `docker push`, never a rebuild. Today `release.yml:69-80`
     rebuilds after scanning (`:37-44`), and the runbook builds the deployed web image locally, unscanned
     (`deploy-and-rollback.md:41-46`).
   - The report, its summary and its SHA-256 are kept **as assets of the GitHub release for the tag**:
     - a small `report` job with job-scoped `contents: write`, which runs only `gh release upload`;
     - also uploaded as a workflow artifact.

     Release assets do not expire; artifacts do.
   - A red capacity run does not stop the push, because a security fix must ship. It keeps the screening closed.
2. **The runbook** (`docs/runbooks/deploy-and-rollback.md` step 2) pulls `web-<env>:<tag>` and `worker:<tag>` and pushes
   them unchanged to the environment's repositories, which keeps their image IDs. It no longer builds the web.
3. **The launch check** (`tools/screening-capacity/launch-check.ts`, unit-tested on synthetic reports) takes the
   release's report asset, the tag, and both images as pulled. It verifies:
   - runtime `docker`, `verdict.pass` and `verdict.time === 'enforced'`;
   - that the report's commit equals the tag's commit;
   - **that both image IDs equal the report's** (`docker image inspect -f {{.Id}}`);
   - that the report's consumer equals `environmentSettings('production').compute.screening`.

   It prints `ScreeningLaunch=<tag>:<report SHA-256>`, or exits non-zero.
4. **The deploy** (runbook step 3) passes that value, or `closed`. On the first launch it also passes
   `ScreeningConsumer=running` (question 5).
5. **The web enforces it.** `screeningOpen()` (`routes.ts:324`) keeps production closed unless `SCREENING_LAUNCH` is
   `${IMAGE_TAG}:<64 hex>`.
   - CloudFormation keeps a parameter's previous value when a deploy omits it. Binding the value to the tag means a stale
     value closes the screening instead of vouching for a new image.
   - Closing does not stop the consumer, so runs already queued are still priced.
   - Staging and development are not gated, because the e2e journey and the factor measurement need them open.
6. **Smoke check** (runbook step 4): `/screening` shows the open form only when the deploy passed a launch value.

### 5.5 Should the capacity workflow be a required check now?
**Recommended: yes, from PR 6b.** From then on it is the only test of a user-facing promise.
- It is required on pull requests into `claude/build-platform`, and on the launch pull request.
- It is implemented as an always-running `gate` job that passes at once when no watched path changed. A path-filtered
  required check would otherwise block every other pull request.
- It adds about 45 minutes to screening and pricing pull requests, and ≈ $0.54 a run once the repository is private.

The founder decides how it joins the merge rule (question 4).

---

## 6. ADRs and documents to amend
- **ADR 0049**: the compute table gains `screening`:
  - `WORKER_JOBS=screening`; ScreeningRole, SES send only; the screening and queue logins;
  - one task per service still holds (the screening service runs one, with no scaling target);
  - its security group has no internet egress (endpoints and S3 only), a deliberate exception to the app tier's "HTTPS
    anywhere" (`network.ts:98-100`);
  - the `ScreeningLaunch` and `ScreeningConsumer` parameters; the cost line; x86 until #136.
- **ADR 0062**:
  - an "Owner rulings" section for the founder's answers: size and cost, three slots in place of the audit's two, the
    share and cap, the wording, the required check and runners, the consumer before launch;
  - "Capacity under production limits", as built: time enforced, the consumer in the harness, the affinity and
    queue-order fixes, one domain per upload, Postgres at the class's vCPUs, the time metric's bounds, this document's
    measurements marked indicative;
  - "The release read": one copy per release per thread, the index-probing shared read, the six keyed types;
  - the queue order and its overshoot without a lock;
  - decisions 13 to 16 marked built, decision 13 binding both images;
  - "What stays open" loses the consumer and the keyed-record cache (decided: not built, §7) and keeps staging's
    factor;
  - "Revisit when" gains: staging measures the factor; ARM (#136); the web's share of S4 on Fargate; sustained use of
    the share or the cap; lone files near the line (splitting a run across threads).
- **ADR 0014 / ADR 0019**, wherever they list the platform jobs: `screening_price` moves to its own service.
- **reconciliation-001**: decisions 13 to 16 "as built". Line 428's check is unaffected by this track.
- **docs/product/test-matrix.md**:
  - SCR-08 (`:163`): the consumer at production's size and thread count; time enforced at 48 s; Postgres at the class's
    vCPUs; the small upload behind the large ones' jobs; the platform pricing none; one account per upload; the metric's
    bounds;
  - SCR-09 (`:164`): adds "the shared types read by the record-type index; six keyed types, `locality_map_plus_four`
    keyed by ZIP" (with Track A's SCR-15);
  - new rows (Track A takes SCR-15 and SCR-16):
    - **SCR-17**: queue order by account share and daily cap;
    - **SCR-18**: the "sent" page's four wait states;
    - **SCR-19**: a run whose consumer died is priced again within about 3 minutes, nothing lost;
    - **SCR-20**: production's screening opens only with a launch value for the deployed tag's passing report, on both
      image IDs.
- **Runbooks**: deploy-and-rollback (the images copied, not built; the launch check; both parameters; the smoke check;
  rollback across PR 6b), and a short screening-capacity section (reading a red run).
- **PRD 19 Monthly costs**: the consumer's line after the founder's answer.

---

## 7. #31's screening part ("caches one copy per release and looks up the ZIP's locality separately")
**Already built by PR 6 (#53 part 2)**:
- the shared types are held once per release and manifest, at most two releases (`job.ts:106-125`);
- the ZIP's locality is fetched per run in the keyed read (`keyed-release.ts:92`; migration :1696-1716,
  `locality_map {zip}`);
- a lookup outside the fetch fails as `RELEASE_READ_OUTSIDE_FETCH`.

**Left for PR 6b**
1. **ZIP+4 in the keyed fetch, in Track A's shape.** `locality_map_plus_four` records are keyed by the five-digit ZIP
   (Track A §5.1).
   - `operator_screening_run_keys()` is **unchanged** and returns `(codes, zip)`.
   - `operator_screening_run_records()` adds `('locality_map_plus_four', {zip})`, so the fetch holds whatever the lookup
     reads, whether or not a ZIP+4 was given.
   - The prospect's ZIP+4 reaches the pricer from `operator_screening_claim()`'s new `zip_plus_four` column.
   - `KEYED_RECORD_TYPES` (`keyed-release.ts:32`) gains the type.
   - `screeningRequestedKeys(codes, zip)` (`:85`) keeps its signature, and its body adds
     `locality_map_plus_four: [{ zip }]`.
   - Tests, which Track A owns: a ZIP+4 prospect prices from its ZIP+4 locality; a key set with the plus-four record
     dropped fails `RELEASE_READ_OUTSIDE_FETCH` before any batch.
2. **One copy per release per thread.** Each of the three threads holds its own shared types (2,184 records in the scale
   release): three small copies, stated in ADR 0062. `release-cache.db.test.ts` proves one per release per thread.
3. **The shared read stops scanning the table.** Measured on the scale release:
   - `operator_screening_release()`'s filter `record_type NOT IN (…)` plans a parallel sequential scan of all of
     `rule_record`: 2,076 MB, 210,850 buffers read and 747,687 rows removed per worker, 705 ms warm, for 2,184 rows;
   - probing `rule_record_by_type` (`rule_content.sql:37`) with the type list reads 229 buffers in 1.3 ms;
   - cold on gp3's baseline (125 MiB/s), the scan alone would cost about 13 s of the 48, and it grows with every release
     loaded.

   The rewrite enumerates the release's record types by a loose index scan over that index (a recursive CTE on
   `(release_no, record_type)`), removes the **six** keyed types (`pfs_rvu`, `ncci_mue`, `mppr_rate`, `ncci_ptp`,
   `locality_map`, `locality_map_plus_four`), and reads each remaining type by the index. It keeps "every type but the
   keyed" without listing the shared types.
   - A db test asserts the six-type list equals `KEYED_RECORD_TYPES`.
   - A plan test asserts no sequential scan of `rule_record`.
4. **The keyed-record cache** (ADR 0062's open item): **not built**.
   - Measured keyed reads are 2.3-3.8 s for the worst shape (150,423 records) and 0.0-0.1 s for the practice shape.
   - The promise is sized on a cold cache, where a cache cannot help.
   - Revisit if staging's factor makes the keyed read material.

---

## 8. Tests that prove each rule
| Rule | Tests |
| --- | --- |
| The consumer's job split and settings | `apps/worker/src/config.test.ts` (screening requires its two URLs, refuses the application and operator URLs, concurrency 1-8) |
| The platform no longer prices; the consumer works only screening queues with its concurrency; the sweep re-sends with priority and heartbeat | `apps/worker/src/worker.test.ts`, `jobs/platform.test.ts`, `jobs/registry.test.ts`, a new `jobs/enqueue.test.ts` |
| The heartbeat on an existing queue | a db test: create `screening_price` with `QUEUE_OPTIONS` (PR 6's shape), start a screening worker, and read `pgboss.queue.heartbeat_seconds = 60`; a job the web sends carries 60 |
| Recovery after the consumer dies (SCR-19) | a worker db test: SIGKILL the consumer process mid-run (after one recorded batch), start a new one, and assert the run is claimed again at attempt 2 and emailed within 4 minutes of the kill, its earlier batches kept |
| Thread pool: dispatch, a thread's death fails only its job, drain on stop | `apps/worker/src/screening/threads.test.ts` (unit) |
| Role, login, bootstrap, catalog | `packages/db/src/migrate.db.test.ts:405-415` (`tp_screening`'s attributes); `apps/worker/src/deploy/logins.db.test.ts:52-80` (the screening login: `tp_screening` with `inherits: false, switches: true`, nothing else; reads no table before `SET ROLE`; runs the ten functions after it; cannot `SET ROLE tp_operator`); `packages/db/src/catalog.db.test.ts`: `GRANT tp_screening TO tp_app WITH INHERIT FALSE, SET TRUE` gives "may SET ROLE tp_screening", and a relation owned by `tp_screening` gives "owns"; a new `packages/db/src/roles.test.ts`: `managedRoles` and the CONNECT/USAGE statements name `tp_screening` |
| Exact grants, none to PUBLIC | `packages/db/src/screening.db.test.ts:472-527` gains a `screening` column (`has_function_privilege(tp_screening, …)`) and `forScreening` (the nine and `operator_screening_queue`); `forApp` gains `screening_wait`; the nine stay in `forOperator` for the overlap release and leave it in the next schema PR; the definer rule becomes "granted to any of the three lists" (so `screening_wait_limits`, INVOKER and ungranted, passes) |
| Queue order (SCR-17) | `apps/worker/src/screening/screening.db.test.ts`: an account's third 50,000-row upload goes to −1 and its fourth to −2; another account's first goes to 0; the cap counts the normal tier only; `due` orders by priority then age; `screening_wait` counts `queued_ahead` by that order; the four new columns are immutable; a same-attempt `pricing` update may only move `progress_at` forward |
| Staleness, `received_at`, complete's columns | the same file: stale after 120 s of no progress, not before; `received_at` clamped into its CHECK; complete returns `received_at`, `wait_reason`, `held_by_pause` |
| The merged shared functions | Track A's and C's db tests for their parts (refusal order pinned: paused before ZIP, ZIP before undeliverable) |
| The web: wait states, the over-share log line, production closed unless the launch value names the image tag (SCR-18, SCR-20) | `apps/web/src/lib/screening/routes.db.test.ts` |
| One copy per release per thread; six keyed types; no sequential scan | `release-cache.db.test.ts`, `screening.db.test.ts` |
| Oracle equality under the new topology | the capacity run's S1-1, S2-1, S3-1 (unchanged comparison) |
| Infra | `infra/test/compute.test.ts`:<br>- four services, five task definitions; 2048/4096 X86_64;<br>- the count condition per `starts`;<br>- exactly the screening and queue secrets; `WORKER_JOBS`, `SCREENING_CONCURRENCY`; stop timeout 120 s;<br>- the web's three new settings;<br>- **no `AWS::ApplicationAutoScaling::ScalableTarget` whose resource ID names `tp-<env>-screening`**;<br>- the contract tests at 460-561.<br>Also `network.test.ts`, `database.test.ts`, `monitoring.test.ts:102` ("and no other" updated), a new `screening-role.test.ts`, `deploy-parameters.test.ts` (both parameters), `launch.test.ts` |
| cdk-diff-plan | unchanged code (`infra/lib/cdk-diff-plan.ts`); CI's synth proves the stacks build; with credentials, `pnpm cdk:diff` shows the new service against staging |
| e2e | the screening journey runs with a `WORKER_JOBS=screening` worker beside the platform's; the "sent" page's wording for each wait state |
| Golden | unchanged: no engine file changes (`git diff --stat <base> -- packages/pricing/src ':!**/*.test.ts'` holds only Track A's lookup) |
| Capacity | the CI run with time enforced, every scenario under 48 s, the platform pricing no screening, no upload in the waiting tier, the time metric within its bounds, no request to the static origin |
| Launch check | `tools/screening-capacity/launch-check.test.ts`: a pass, a fail, time open, a wrong commit, a wrong worker image ID, a wrong web image ID, a different consumer size |
| Release workflow | `tools/test/workflows.test.ts` gains: release's push job pushes the measured image references and runs no `docker build`; its capacity job and the capacity workflow name the same runner; the report job alone has `contents: write` |

---

## 9. Out of scope
- The pricing engine (no change from this track).
- Track A's ZIP+4 lookup and settings (#33, #16), beyond the shared table.
- Track C's mail streams (#76), beyond the shared table. That covers configuration sets, the bounce cut-off and the
  screening subdomain. The "sent" page's closed state while #76 pauses the stream is Track C's.
- PR 6e's reminders. They stay on `tp_operator` unless PR 6e decides otherwise.
- PR 7's console.
- arm64 images (#136).
- The web task's size and the RDS class.
- A keyed-record cache, and splitting one run across threads.
- The revoke of `tp_operator`'s grants (the next schema PR after PR 6b deploys).
- Creating the Team organization and its runners (the founder's setup, already accepted with the audit).

---

## 10. Questions for the founder (recommended answer first)
1. **The consumer's size and monthly cost.** Recommended: **A**, one always-on task of 2 vCPU and 4 GiB pricing three
   screenings at once.
   - It costs ≈ $74.50 a month in production once running (≈ $60.10 on ARM after #136), plus the same task in staging
     (≈ $74.50), so that staging measures production's task.
   - **Three slots replaces audit #53's "two at a time"**, which you adopted, because two slots miss the 48-s line
     (55.8 s, run 4).
   - A gives up: one task, so a crash or a lost zone delays screenings by about 3 minutes (none is lost).
   - **B**, three 1-vCPU tasks: ≈ $110.50 a month and zone redundancy. It needs an 8-core CI runner (≈ $40 a month once
     private) and prices lone files more slowly.
   - **C**, one 1-vCPU task with a capped step-up: ≈ $38.60, but two large files at once break the 60-second promise,
     which would change your decision 14.
   - A with two tasks: ≈ $146.60.
2. **The account share, the daily cap and the fairness rule.** Recommended:
   - **an account's share of 100,000 rows a UTC day** (two worst-shape files; the rate limit lets an account send 20);
   - **a daily cap of 1,000,000 rows of within-share uploads** (ten accounts' shares, twenty worst files);
   - an account's k-th upload over its share waits at priority −k;
   - uploads over either limit are accepted, priced when no normal upload waits, and told it can take longer.

   What the options give up:
   - The recommended rule gives up the 60-second promise for a firm's third and later large file on a busy day.
   - A cap alone, with no account share, gives up protection from one firm. One account's own allowance
     (20 × 50,000 = 1,000,000 rows) would put every later prospect that day over the cap.
   - A lower share or cap protects the promise sooner in a flood but tells more genuine prospects to wait; higher, the
     reverse.
3. **What the "sent" page promises** (with counsel). Recommended:
   - normally, "The result is emailed … usually within a minute";
   - when every slot is busy, "Many screenings are running right now, so yours can take a few minutes";
   - over the account's share, "Your organization has run several screenings today, so this one waits behind other
     practices' screenings and can take longer than usual. We email the link as soon as it is ready";
   - over the daily cap, "We have had an unusually large number of screenings today, so yours can take longer than
     usual. We email the link as soon as it is ready."

   Today's text says "usually within a few minutes" (`page.tsx:44`). Keeping it gives up telling prospects about the
   60-second promise you ruled on.
4. **The capacity test, its runners and the merge rule.** Recommended:
   - a required check from PR 6b, through an always-running gate job;
   - **both the capacity workflow and the release workflow's capacity job** on a 4-core larger runner once the
     repository is private: ≈ $22 a month in all, with the Team organization you accepted with the audit (its move is
     planned before PR 7).

   Until that runner exists, a private repository's 2-vCPU standard runner is refused as too small. So no release can
   produce a passing report, and production's screening cannot open. That does not delay the launch as planned, which
   waits for release 1 and counsel.
   - The standard runner instead would give up decision 13 and 15's faithful measurement: Postgres would get one CPU
     and land at the line.
   - A self-hosted 4-CPU runner gives up security: it runs pull requests' code on a machine you would patch and secure.
   - Not requiring the check gives up catching a change that breaks the promise before it merges. The weekly and push
     runs would still catch it after.
5. **Whether production runs the consumer before the screening launches.** Recommended:
   - **hold production's consumer at 0** (`starts: 'launch'`) until the first launch value is deployed, and set
     `ScreeningConsumer=running` with it;
   - keep staging always on, so that it measures the factor.

   This saves ≈ $74.50 a month for every month before launch: nothing can be queued in production before then
   (`routes.ts:319-335`; `screening_status()`). It gives up exercising production's consumer before launch (staging and
   the launch check cover the same image) and adds one parameter to the launch runbook. Running it from the first
   deploy gives up that money for no prospect's benefit.

---

## 11. Open items
- **Tracks A and C must adopt §3.3.4's shared-function table.** Their designs still specify their own bodies for
  `submit_screening`, `claim`, `due`, `complete` and `release`, and the builds conflict until they adopt it. Track C
  also supplies the screening stream's resume time that `held_by_pause` reads.
- The runner-to-Fargate factor (staging, decision 15). Until then, 48 s on the runner.
- The thread pool is measured here only through a process stand-in, and the scratch hooks were not kept. PR 6b's first
  CI capacity run is the measurement of record: a report above 44 s becomes a sizing question before merge, and S4's
  small upload is measured with the race fixed (estimated 21-30 s).
- The web's 10-18 s share of S4 on one 0.25-vCPU web. Watch it in staging.
- Harness fixes found here: the process runtime's cpuset/affinity collapse; the small upload's queue-order race; one
  account per scenario.
- `release.yml` pushes a rebuild rather than the scanned image, and the deployed web image is built locally, unscanned
  (both fixed by §5.4).
- The static origin's harness route needs the builder's check with a dummy origin (§5.1).
- The revoke of the nine functions from `tp_operator`, in the first schema PR after PR 6b deploys.
- Prices were read from search results, not AWS's pages (the proxy refused them), and the RDS surplus-credit rate was
  not read. Re-read them before the founder signs.

---

## 12. Review (revision 2: every finding, what was done, and why)
| # | Finding (severity) | Verified? | What was done |
| --- | --- | --- | --- |
| 1 | Tracks A, B and C redefine the same functions with conflicting specs; ZIP+4 key shape contradicts Track A (blocking) | **Confirmed**: Track A drops and recreates `submit_screening` with `plus_four` and `claim` with `zip_plus_four` (`pr6b-zip4-settings.md:712-723`); Track C changes submit, due, claim and complete (`pr6b-email-streams.md:205-207, 413-415`); revision 1 said "signature unchanged" and had `run_keys` return the ZIP+4 | §3.3.4: one owner, one merged body and one place in the migration for each shared function; privileges once, last (§3.3.5); "signature unchanged" withdrawn; §7.1 rewritten to Track A's shape (`run_keys` unchanged, `screeningRequestedKeys(codes, zip)` keeps its signature); six keyed types. Open item: A and C adopt the table |
| 2 | The grant test turns red; REVOKE FROM PUBLIC missing (should fix) | **Confirmed**: `screening.db.test.ts:519-525` requires definer exactly when granted; the migration revokes PUBLIC by name (:1967-1985) | The cap function becomes `screening_wait_limits()`, INVOKER, no grant; the web constant is dropped; REVOKE for every created or recreated function (§3.3.5); the test gains a `tp_screening` column and `forScreening`, `screening_wait` joins `forApp`, the overlap is spelled out (§8) |
| 3 | Catalog and role bootstrap not extended; the login should switch, not inherit (should fix) | **Confirmed**: `catalog.ts:466, 494-500`; `roles.ts:124-126, 147, 153`; billing's login `INHERIT FALSE, SET TRUE` (`logins.db.test.ts:72`); `asOperator` always switches (`operator.ts:40`) | §3.3.1: both catalog lists, `managedRoles`, CONNECT and USAGE, the dev login; the login is a `switch` membership; tests in `catalog.db.test.ts`, `logins.db.test.ts`, a new `roles.test.ts` |
| 4 | The heartbeat is not applied to an existing queue, so recovery is 15 minutes (should fix) | **Confirmed**: `create_queue` is `ON CONFLICT DO NOTHING` (`plans.js:1024-1080`); jobs copy the queue's heartbeat at insert (:2862); the option is in `types.d.ts:575-579`, not `plans.d.ts` | `SCREENING_QUEUE_OPTIONS` everywhere, `updateQueue` at consumer start, `heartbeatSeconds` on every send (so jobs sent before the update carry it), §3.2 and §3.7; a db test of the stored setting and a kill test (§8, SCR-19) |
| 5 | TimeToEmailMs leaves out the web's share (should fix) | **Confirmed**: `created_at` defaults to `now()` at the submit transaction's start (:401), after parsing (`routes.ts:421-489`); complete's `now()` precedes the send (`job.ts:287-293`) | `received_at` from the web's request start, clamped into a CHECK (§3.3.2); elapsed measured after the send returns (§3.2). The reviewer's test ("at least the harness's time") cannot hold, because the harness's clock starts at the browser's POST, before the server receives it. The test instead bounds the logged value within 2 s below the harness's time and never above it (§5.3) |
| 6 | The daily cap equals one account's allowance (should fix) | **Confirmed**: 20 a day × 50,000 = 1,000,000 (`rate-limit.ts:50`) | An account share with turn-taking priorities, a cap counting the normal tier only (§3.4); question 2 states both numbers and what each gives up. Also found: every harness upload shares one account (`uploads.ts:105`), so S4 would cross the share; fixed with one domain per upload |
| 7 | Decision 13 narrowed for the web image (should fix) | **Confirmed**: the runbook rebuilds the web per environment (`deploy-and-rollback.md:41-46`) | The best option, built with no question needed, since it meets the ruling as worded: `release.yml` builds, scans and measures `web-production` and pushes it unchanged; the launch check verifies both image IDs (§5.4); the harness routes the static origin (§5.1). It also closes an unscanned-image gap |
| 8 | Measurement claims overstate verdicts; not reproducible (should fix) | **Confirmed**: runs 2, 3, 6, 7, 8 and 9 failed queue order; the hooks' code is gone with the clone | Run 7 restated ("every time under 48 s; verdict failed on queue order"); the verdict column; the hooks described per file:line, with the rows marked indicative; the expected small-upload time behind three slots given as an estimate (21-30 s); PR 6b's CI run named the measurement of record. The diff could not be saved after the fact, and re-measuring was not done in this design step |
| 9 | Launch depends on a 4-CPU release runner once private (should fix) | **Confirmed**: `release.yml:18` is `ubuntu-24.04`; a private standard runner has 2 vCPU | The release capacity job needs the same 4-core runner; question 4 covers it, with what happens until it exists; the report is kept as a release asset (§5.4) |
| 10 | The consumer before launch is a running-cost decision (should fix) | **Confirmed**: `countOnceReleased` runs it from the first released deploy (`deploy-parameters.ts:122-125`) | Question 5, recommending holding production at 0 until launch (`starts`, `ScreeningConsumer`), staging always on |
| 11 | Question 1 does not say three slots departs from audit #53 (nit) | **Confirmed** (`combined-report.md:675`) | Stated in decision 1 and question 1 |
| 12 | Splitting one screening across threads never evaluated (nit) | **Confirmed** | §2.3: considered and not recommended (no gain in S4, which sets the size; the keyed view copied per helper raises memory when busiest); revisit condition in ADR 0062 |
| 13 | Smaller corrections (nit) | (a)-(f) **confirmed**; (g) **confirmed** in kind (db.t4g.medium is burstable, `environments.ts:79, 128`) | (a) priorities 0 and negative; (b) `OldestQueuedMs` counts the normal tier; (c) `screening_run_rules()` listed, and needed (:427-430 refuses a same-attempt `pricing` update); (d) `runnerTooSmall` requires the class's vCPUs plus the consumer's; (e) SCR-08 and SCR-09 updated, SCR-17 to SCR-20 added; (f) a CDK assertion of no scaling target; (g) burst credits in the departures and the cost, rate unverified |
