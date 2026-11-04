# screening-capacity on 4846f043 (push run 41763423983): why it failed

## Verdict
This is not #94's fault and not a code defect. The repository became **private** between the PR run (2026-11-02 ~10:43Z)
and the merge (2026-11-04 02:50Z). GitHub's standard `ubuntu-24.04` runner for a private repository has 2 vCPU and 8 GB,
not the 4 vCPU and 16 GB a public repository gets. The harness refuses anything under 4 CPUs before it starts a
container (`RUNNER_TOO_SMALL`), as it was built to. This is expected and documented, not flakiness and not an outage.
- Owner: the founder. The fix is a runner and plan decision with a cost, and it belongs to whoever owns the repository's
  visibility and plan.
- Re-run allowed: **no**.

## The exact failing lines (job 126356184270, step "Measure under production limits", 02:55:59-02:56:08Z)
```
harness on CPUs 0-1
[capacity 2026-11-04T02:56:07.669Z] runner 2 CPUs, 7932 MiB, load 2.64 1.59 0.68; harness on CPUs 0-1; runtime docker; time mode advisory
[capacity 2026-11-04T02:56:07.670Z] stopped: RUNNER_TOO_SMALL
[capacity 2026-11-04T02:56:08.274Z] verdict: fail (time advisory)
  run not finished: RUNNER_TOO_SMALL
  partial run: measured no scenario; a verdict needs S1, S2, S3, S4#1, S4#2, S4#3, S5
  runner too small: the runner has 2 CPUs; the test needs 4: 2 for Postgres (db.t4g.medium's), which the harness and Chromium share, and 2 for the screening consumer (compute.screening's), whose last the web and the platform share
  runner too small: Postgres would have -260 MiB; the test needs 2048 MiB
  (then the follow-on lines: "limit not applied: web/platform/screening-1/postgres: no limits read", "oracle not compared: S1-1 ...")
 ELIFECYCLE  Command failed with exit code 1.
##[error]Process completed with exit code 1.
```
Every line after the two "runner too small" lines follows from them: no container was started, so no limit or oracle was
ever read. The runner was ubuntu-24.04 image 20261101.360.1 (runner 1000008338, centralus).

## Causes ruled out
- **Cached scale release.** Restore hit key `screening-scale-release-3739e6dfe894f49dcbfcee22bcb45191bb7622e0c75fa174b449ea504b00f791`
  (19,526,288 B). The PR run (125228651914) and the base's push run (41428286155, job 125220223745) restored the same
  key, and both measured green. The key hashes `packages/synth/src/release/**`, `tools/release/scale.ts`,
  `packages/rules/src/**` and `fixtures/synthetic/rules/release-synth-900001/**`. `git diff 21fa10df 4846f043` on those
  paths is empty, so the restored tree matches 4846f043's generator. "Build the scale release" was skipped because the
  cache hit, which is correct. The harness never read the release anyway.
- **Images, Docker, Postgres.** Both images built and loaded, and their identity checks passed (steps 5, 6 and 9 green).
  The headless shell and the browser checks passed. The harness stopped before it started any container.
- **#94's dependencies (aws-cdk-lib 2.275, CLI 2.1146.1, @aws-sdk ^3.1160.0, stripe ^23.1.0).** On e3fc02e4 the same
  images and harness measured green: "runner 4 CPUs, 15983 MiB", then "verdict: pass (time advisory)" at 11:00:30Z, with
  S4#2 time warnings of 53.5 / 54.0 / 52.3 s (advisory). Nothing #94 changed is reached before the CPU check.
- **The runner, in the sense of a lost or broken machine.** Ruled out too. The runner did exactly what GitHub's
  standard private-repository runner does.

## Why the repository is private (evidence)
- `gh api repos/PureTideWater/PhysicalTherapy` returns `"private": true, "visibility": "private"`, owner type `User`,
  and `updated_at` `2026-11-04T02:51:33Z`. The repository is still on the founder's personal account, not an
  organization.
- The push ci run proves it independently. ci.yml line 305 is
  `shard: ${{ fromJSON(github.event.repository.private && '[1,2,3,4,5,6]' || '[1,2,3,4]') }}` (db), and line 506 is
  `... private && '[1,2,3]' || '[1,2]'` (e2e). Its comments say "Six shards on a private repository's 2-CPU runners, four
  on the public 4-CPU ones" and "Three shards on a private repository's 2-CPU runners, two otherwise". The PR run on
  e3fc02e4 ran 4 / 2 (public). The push run on 4846f043 ran 6 / 3 (private). That answers the shard question: the
  matrix follows the repository's visibility, not push versus pull request.
- I cannot see who changed the visibility or exactly when (the audit log is outside this session's repository scope).
  Only the owner can change it.

## The design already expects this outcome
- Comment in screening-capacity.yml: "Once the repository is private its standard runner has 2, so this label (and the
  release's capacity job's, the same runner) becomes a 4-core larger runner, which needs an organization on GitHub Team
  ... until then a private run is refused as too small and the screening cannot open."
- docs/runbooks/screening-capacity.md line 353: "Once it is private its standard runner has 2 CPUs, which the harness
  refuses as too small, so the gate cannot pass on a watched pull request until both capacity jobs move to a 4-core
  larger runner, which needs an organization on GitHub Team (about $22 a month)."
- The same runbook, line 128: "`runner too small: the runner has 2 CPUs; the test needs 4: …` means a runner smaller than
  the free 4-CPU one (a private repository's standard runner; each need is named)."
- The same runbook, line 471, an extra consequence: "artifact attestations for a private repository need GitHub
  Enterprise Cloud ... Making the repository private therefore needs this revisited before the next release (open item
  O15), or every release's report goes unattested and production's screening cannot open."
- docs/runbooks/github-governance.md's path is step 2b, transfer to an organization (on Team), then step 2c, make it
  private. The repository is now private but still under the personal account `PureTideWater` (owner type User), so
  step 2b looks skipped or not done yet. Without an organization, GitHub's larger runners cannot be bought.

## Fix (the founder's decision)
1. Finish the governance runbook's step 2: transfer to an organization on GitHub Team, then step 2e onward. Then move
   both capacity jobs (screening-capacity.yml's `capacity` and release.yml's capacity job; RELEASE_RUNNER in
   tools/screening-capacity/launch-check.ts) to a 4-core larger runner label, about $22 a month. That is a workflow
   change for the build after the founder rules. The workflow tests and the toolchain/actions checks apply.
2. Settle O15 (attestations on a private repository) before the next release.
3. Until then, every watched pull request's "screening-capacity gate" will fail the same way, and so will every push and
   the weekly schedule. Each failure comments on issue #102. Making the repository public again would also restore the
   4-CPU runner, but ADR 0063 rejects that option.
- Do not lower the harness's 4-CPU minimum. The minimum is the production layout (db.t4g.medium's 2 vCPU plus the
  consumer's 2).

## Re-run: not allowed
docs/runbooks/ci.md, "3. Re-running": "Re-run failed jobs only for an infrastructure failure (a runner lost, a download
refused, a service that did not start), never for a test that failed: a test that passes on a re-run is a flaky test,
and is fixed." This is not one of those infrastructure failures. It is a deterministic refusal on every 2-CPU runner,
and a re-run would land on the same private 2-CPU runner and fail identically. docs/runbooks/screening-capacity.md
(line 125 onward) says of `runner too small` that "the measurement did not happen under production's limits ... Run
again once fixed."

## The issue
Issue #102, "Screening capacity test failing" (label screening-capacity, OPEN, created 2026-11-04T02:56:42Z by notify,
no comments): "The screening capacity test failed on claude/build-platform at 4846f043f6133872f1d26e0296a071bca6be48f0:
https://github.com/PureTideWater/PhysicalTherapy/actions/runs/41763423983. The run's artifact holds
screening-capacity.json and summary.md with each failing check."

## Local reproduction
There is no Docker here, so the full harness cannot run. This machine has 4 CPUs (nproc 4). The cheap check passed:
`pnpm exec vitest run tools/screening-capacity/limits.test.ts`, 11/11. That includes
`runnerTooSmall(runner(2, 7_168))` returning `"the runner has 2 CPUs; the test needs 4: ..."` and
`"Postgres would have -1024 MiB; ..."`, the same rule that gave -260 MiB on the runner's 7932 MiB.

## Related (another lane)
The ci images job's Trivy failure (126356134153) is a separate finding: per ci.md, the fix is a base-image or package
bump, or an ADR 0010 record. Nobody has yet shown that going private caused it.
