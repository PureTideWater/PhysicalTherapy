# Fix check G1, round 1 (B1/PE-B1, N1, N2, N3)

Started 2026-11-04. Target WIP head 30efef6d...

## Setup
- Clone /home/user/fx-p4-G1-1 at 30efef6d... (= origin/co-001/wip-ci-mutation-trigger); install --frozen-lockfile exit 0 under the heavy lock.
- Logs: scratchpad/p4/logs/fix/G1-1/.

## Checks
- Unit job coverage: vitest.config.ts unit project includes `{apps,packages,infra,tools}/**/*.test.{ts,tsx}`; ci.yml unit job runs `pnpm test` (= `vitest run --project unit --coverage`). So affected.test.ts's guard runs in CI's unit job. PASS.
- N3 runtime.ts CLI at head: pinned + HEAD exit 0; --pnpm 10.35.0 exit 1; --commit HEAD~1 exit 1; 12-hex commit exit 1; --pnpm= (empty) exit 1; unknown flag exit 1. No flags exits 0 (flags optional; workflows.test.ts holds both jobs to the full RUNTIME_CHECK line). PASS.
- N3 workflow: gate's check is after install, before download-artifact, under run=='true'; actions/checkout default ref = GITHUB_SHA for push, pull_request (merge ref), schedule, dispatch. PASS.
