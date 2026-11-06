# sc-1b-route (real-size runs route scout)
started 2026-11-02; status: gathering facts
## Findings (in order)
- No prior progress file; fresh start.
- /home/user/sc1b at ce408d2f; worktree has 2 uncommitted modifications (ADR 0083, synth registry.ts) from another agent - not mine, untouched.
- head release-capacity.yml: runs-on ubuntu-26.04 (both jobs), workflow_dispatch (no inputs), cron Tue 03:29; 358dc53f read ubuntu-24.04. timeout 180 min. Step runs run.ts with --worker-image tp-worker:capacity, FULL_SIZE (no --small), no --keep-database. ONE image per run (head's) - no base run.
- KEY: code contradicts "RUNNER_TOO_SMALL below 8 CPUs". limits.ts requiredCpus = sharedLayoutCpus = 4 (Founder 'Free: time advisory' 2026-10-23 reverted the 8-core rule). Evaluated runnerTooSmall() via tsx: this container (4 CPU, 16091 MiB) -> [] ; GitHub 4-CPU/16GB -> []. pg 4096 MiB, layout shared (pg 0-1, worker on 3). ownLayout needs 8 (optional, nicer layout).
  => the prior builder's RUNNER_TOO_SMALL claim is not what the code says. Need to verify why (docker? memory?).
- Docker daemon NOT running in this container (no /var/run/docker.sock) -> docker runtime cannot run here. cgroup v1 (cpu, cpuset, memory rw) present -> ProcessRuntime (design 8.2) is supported here. PG18 5433; Chromium in /opt/pw-browsers.
- Migrations come from the worker image (dist/migrate.js) -> --worker-image <base> runs the base schema: before/after valid with the head harness.
- GitHub (gh api reads): owner User, public, default claude/build-platform. release-capacity runs: 40479127979 (schedule, 10-27, e908c214, ubuntu-24.04) and 40584379787 (workflow_dispatch on co-001/ci-browser 64843249, ubuntu-26.04): BOTH logged "runner 4 CPUs, ~15.98 GB; runtime docker", FULL_SIZE, release loaded (452/561 s), measured, verdict fail (A triage + A report failed = known 53200), ~27-31 min total. NO RUNNER_TOO_SMALL on GitHub's free 4-CPU runner. Release manifestSha256 0b700554...8723 identical on both -> deterministic.
- Precedent: dispatch on a non-default branch works (co-001/ci-browser).
- Harness diff base(43565235)...head: run.ts/checks.ts/scenario.ts +798/-130 -> base's harness lacks 1b's phases 7b/7c and checks; workflow builds ONE image from its own ref (no base-image input) -> a workflow dispatch gives CAS-42.5 but not CAS-42.6's "before" (head harness on base image).
- Origin of the 8-CPU claim: runbook screening-capacity.md:267 says run.ts stops RUNNER_TOO_SMALL on a PRIVATE repo's 2-CPU runner; the 8-core rule (273b28d) was reverted by the founder's "Free: time advisory" (2026-10-23). Code + runbook:478 say 4 CPUs suffice (shared layout); 8 gives 'own' layout only.
- release-capacity checks.ts has NO Postgres-limits check -> process runtime can pass (departures recorded in summary).
- dockerd/containerd binaries present but daemon not running; `tc` absent (netem host side) -> local Docker route not faithful/not ready; reject.
- gh token = PureTideWater (admin). Proxy 403 on actions/runners and actions/permissions; runs/jobs/logs reads work. Dispatch endpoint untested (no dispatch by rule).
- Issue #73 "Release capacity test failing" open: a failing dispatch comments on it (notify job).
- RISK (all routes): FULL_SIZE step 7b reconciles all of A's actionable lines (~33k, probes' shape) in ONE reconcile job at 0.5 vCPU; builder R measured 6,000 lines = 341.8 s unthrottled, superlinear -> likely beyond pg-boss's 15-min attempt / 45-min JOB_WAIT -> head run expected to fail at 7b for SUITE-CAP-3's reason (Lane B), not the runner. No flag to size 7b separately.
- tools/release and apps/worker/Dockerfile unchanged base...head -> same release 900110 bytes both sides.
## Recommendation (final)
CAS-42.5: dispatch release-capacity.yml on co-001/suite-cap-1-triage-locks (free 4-CPU ubuntu-26.04). CAS-42.6: design 8.2 local process runtime here, head harness, base+head image dirs, one release dir, under flock. No founder action, $0. Withdraw "waiting on the founder / RUNNER_TOO_SMALL".
status: DONE
