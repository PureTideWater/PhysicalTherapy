# Lane B: PR #106 (co-001/ci-trivy-install-2026-11-04), fresh-clone verification

Verifier: fresh clone, 2026-11-04 05:16Z. Not committed.

## 1. Heads (git ls-remote)
- co-001/ci-trivy-install-2026-11-04 = 78cd55d2ce9b4743c3edc3ff3a19980ed7932a5e (equals the reported head).
- Base claude/build-platform = 4846f043f6133872f1d26e0296a071bca6be48f0 (has not moved; merge base = 4846f043).
- PR #106: open, draft, 7 commits, 20 files, +689/-20.

## 2. CI on 78cd55d2 (29 check runs, all completed)
| Check | Workflow (run) | Result |
| --- | --- | --- |
| all green (required) | ci 41776129104 | success |
| mutation (required) | mutation 41776129109 | success |
| screening-capacity gate (required) | screening-capacity 41776129110 | FAILURE (founder's runner decision, below) |
| approval-of-record (required) | 41776129133 and 41776296655 | success (both) |
| images | ci | success |
| static, lint, unit, build, domain model | ci | success |
| db (1/6) to db (6/6) | ci | success (6/6) |
| e2e (1/3) to e2e (3/3) | ci | success (3/3) |
| changes | mutation | success |
| stryker (matrix) | mutation | skipped (no money package affected) |
| changes | screening-capacity | success (the private-repository fix works: watched paths read, no "could not read Username") |
| capacity | screening-capacity | failure: RUNNER_TOO_SMALL |
| notify | screening-capacity | skipped |
| build (web), build (worker), push, capacity | release-dry-run 41776129135 | success |

### images job (126396791159): Trivy
- "The pinned Trivy" step (step 3) succeeded right after the checkout; it is silent on success, and install.sh refuses under `set -e` on a hash or version mismatch, so success means the pinned archive's SHA-256 matched and the binary reported 0.70.0.
- Both scans: `TRIVY_CMD: /home/runner/work/_temp/trivy-bin/trivy`; setup-trivy `outcome=skipped`; DB cache restore skipped (cache: false); inputs severity HIGH,CRITICAL, ignore-unfixed true, exit-code 1, format table.
- "Running Trivy with options: /home/runner/work/_temp/trivy-bin/trivy image ."; DB "Downloading artifact... repo=\"mirror.gcr.io/aquasec/trivy-db:2\"" then "Artifact successfully downloaded".
- Web scan Report Summary: `/home/runner/work/_temp/image/web.tar (debian 13.7) | debian | 0`, and every node-pkg target 0 (59 rows; none non-zero). Legend "'0': Clean (no security findings detected)".
- Worker scan Report Summary: `/home/runner/work/_temp/image/worker.tar (debian 13.7) | debian | 0`; `app/node_modules/playwright-core/package.json | node-pkg | 0`; `opt/yarn-v1.22.22/package.json | node-pkg | 0`.
- release-dry-run build (web): "The pinned Trivy" succeeded; SBOM step setup-trivy skipped; "Running Trivy with options: /home/runner/work/_temp/trivy-bin/trivy image ghcr.io/puretidewater/physicaltherapy/web:dry-run-41776129135".

### screening-capacity gate (founder's runner decision, stated separately)
- The changes job printed "watched: .github/workflows/screening-capacity.yml" and "watched: packages/synth/src/cases/matrix.ts", so measure=true (this PR's paths are watched, as the description says).
- capacity job 126396839638 (ubuntu-24.04), step "Measure under production limits": "runner 2 CPUs, 7932 MiB ... stopped: RUNNER_TOO_SMALL" / "runner too small: the runner has 2 CPUs; the test needs 4".
- Gate: "CHANGES: success, MEASURE: true, CAPACITY: failure" -> "the capacity measurement did not pass (failure): see its job's summary", exit 1.
- This is the private 2-CPU standard runner; the fix is the founder's (4-core larger runner, GitHub Team, issue #102). The PR does not touch runner sizes or the CPU requirement.

## 3. Fresh clone at 78cd55d2 (under /tmp/laneb-heavy.lock)
- pnpm install --frozen-lockfile: ok.
- vitest tools/test + tools/check-action-pins: 26 files, 383 tests passed.
- pnpm test: 432 files, 7,313 passed, 4 skipped. test:golden: 376 passed. typecheck: 22 projects. lint: 1,749 files, 0/0. lint:logs, verify-content, check:fixtures: passed. synth --all: tree clean.
- BASE=origin/claude/build-platform pnpm actions:check: passed; Trivy v0.70.0 aged as aquasecurity/trivy@8a3177ae, 201.00 days; gitleaks v8.24.3 unchanged, not aged.
- actionlint 1.7.7: only the ubuntu-26.04 runner-label messages (screening-capacity.yml:341, :378), pre-existing.
- BASE=origin/claude/build-platform pnpm toolchain:check: passed, 0 errors, 1 warning.
- Pins independently checked: my own download of trivy_0.70.0_checksums.txt (SHA-256 c45281240bb9211ea9e830fc0bf5cf8acf7c0ca830feb64ac8a0aa932c5c92d9, as the PR states) lists 8b4376d5...a5aa9 Linux-64bit and 2f6bb988...c8fd ARM64, equal to tools/trivy/release.txt.
- Run ids: 41765454724 is screening-capacity (PR #104) and 41765454689 its ci run, as the PR and ci.md say.

git diff --stat 4846f043..78cd55d2:
```
 .github/workflows/ci.yml                           |  11 +
 .github/workflows/release-dry-run.yml              |  15 ++
 .github/workflows/release.yml                      |  12 +
 .github/workflows/screening-capacity.yml           |   4 +-
 ...and-runner-together-and-pin-every-dependency.md | 122 ++++++++-
 docs/product/test-matrix.md                        |   4 +-
 docs/runbooks/ci.md                                |  19 +-
 fixtures/synthetic/CI-11/expected.json             |   2 +-
 fixtures/synthetic/CI-21/expected.json             |   2 +-
 packages/synth/src/cases/matrix.ts                 |   4 +-
 tools/check-action-pins/age.test.ts                |  50 ++++
 tools/check-action-pins/age.ts                     |  14 +-
 tools/check-action-pins/base.ts                    |  18 +-
 tools/check-action-pins/check.test.ts              |   6 +-
 tools/check-action-pins/check.ts                   |   6 +
 tools/check-action-pins/releases.ts                |  66 +++++
 tools/gitleaks/install.sh                          |   2 +-
 tools/test/workflows.test.ts                       | 281 ++++++++++++++++++++-
 tools/trivy/install.sh                             |  64 +++++
 tools/trivy/release.txt                            |   7 +
 20 files changed, 689 insertions(+), 20 deletions(-)
```
Scope: beyond workflows, install script/pins, tests, ADR 0066 and the runbook, the diff also holds the check-action-pins release-age rule (fix-round finding security-supply S1), the CI-11/CI-21 test-matrix rows with their synth copy and generated fixtures (amended rows, no new ID; synth --all reproduces them), and gitleaks install.sh's https-only curl flags. All are explained in the description; none is out of scope for the assigned fix.

## 4. Description claims
All checked claims are true (pins, checksums hash, five trivy-action steps each adding only skip-setup-trivy, install step right after each checkout, TRIVY_CMD, watched paths, run ids, gate behaviour, commit list, local results reproduced). Stale or wrong sentences:
1. Why > Trivy: "The GitHub release assets still download, so re-running cannot pass. No release could scan either."
   Replace with: "get.trivy.dev fails to resolve on every attempt, so re-running cannot pass, and no release could scan either; the GitHub release assets still download, which is what this PR installs from."
   (The same non sequitur is in ADR 0066, Part 2 amendment: "The release assets on GitHub still download, so a re-run cannot pass, and no release could scan." Suggested: "The name fails on every attempt, so a re-run cannot pass, and no release could scan; the release assets on GitHub still download.")
2. Checks > "The required checks report on this page by themselves": now resolved; optionally add: "On 78cd55d2: all green, mutation and approval-of-record passed; the screening-capacity gate failed with RUNNER_TOO_SMALL (2-CPU runner), the founder's decision (#102)."
3. Commands table: the "images" outcome on CI could be added: "CI images job: Trivy 0.70.0 from the pinned asset scanned both images: 0 HIGH/CRITICAL fixed findings."
No other stale sentence found.

## Verdict
The only red required check is the screening-capacity gate, explained as the founder's runner/organization decision (RUNNER_TOO_SMALL on the private 2-CPU runner; this PR's paths are watched). Every other required check is green, and the fix is verified on CI and in the fresh clone.

VERDICT: VERIFIED
