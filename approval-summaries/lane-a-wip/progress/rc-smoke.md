# rc-smoke (SUITE-CAP-1b claim: RUNNER_TOO_SMALL needs only 4 CPUs)
Head 048bc8437b75128f572851b84129ea8a9e9b0376.
## Checked
- limits.ts: requiredCpus = sharedLayoutCpus = postgres(2)+consumer(2) = 4; runnerTooSmall also needs Postgres memory >= MIN_POSTGRES_MIB.
- Repo public (gh api): ubuntu-26.04 = free 4-CPU runner. Workflow comment: private repo -> 2 CPUs -> RUNNER_TOO_SMALL.
- Run 40479127979 (schedule, build-platform e908c21, job 122104699853, label ubuntu-24.04): "harness on CPUs 0-1"; "runner 4 CPUs, 15989 MiB; runtime docker"; A 100000 lines; verdict: fail (A triage, A audit report failed; JOB_FAILED 2).
- Run 40584379787 (workflow_dispatch on co-001/ci-browser 6484324, job 122471867560, ubuntu-26.04): runner 4 CPUs 15983 MiB; verdict: fail (same).
- Notify job runs on dispatch failure too (event != pull_request): a dispatch opens/comments issue "Release capacity test failing".
## Smoke
(pending)
- Scratch worktree $S/rc at 048bc84: pnpm install --frozen-lockfile ok; pnpm --filter @tp/worker build ok.
- rc-img/worker = dist + packages/db/migrations + node_modules/playwright-core (cp -RL, 1.64.1); rc-img/web empty (server.js check filtered by run.ts).
- Chromium: HOME=$S/rc-home with .cache/ms-playwright -> /opt/pw-browsers (worker env passes HOME only).
- --print-harness-cpus here: 0-1 (4 CPUs, 16 GiB).
## Smoke result (done)
- HOME=$S/rc-home flock /tmp/laneb-heavy.lock taskset -c 0-1 pnpm exec tsx tools/release-capacity/run.ts --out $S/rc-out --runtime process --images $S/rc-img --admin-url postgres://postgres:test@localhost:5433/postgres --database tp_rcsmoke_1 --small -> exit 0
- "runner 4 CPUs, 16091 MiB; runtime process" -> passed RUNNER_TOO_SMALL; "verdict: pass" (19 jobs completed attempt 1, peak 421.9 MiB, locks max 1). Commit recorded as `unknown` (images dir not a git checkout).
- Copies: logs/rc-smoke.log, logs/rc-smoke-summary.md, logs/rc-smoke-release-capacity.json
- Cleanup: worktree removed, rc-img/rc-home/rc-out removed, tp_rcsmoke_1 dropped by harness (drop if exists confirmed).
