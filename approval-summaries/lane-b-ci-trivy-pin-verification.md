# Lane B: fresh-clone verification of PR #107 (co-001/ci-trivy-pin-2026-11-04)

Date 2026-11-04. Verifier: fresh clone, separate from the authoring worktree /home/user/ci-trivy-pin.

## 1. Refs (git ls-remote)
- Head `co-001/ci-trivy-pin-2026-11-04` = `41818ac40363fe87b257b93498d2031fdc8bda0e`, as reported.
- Base tip `claude/build-platform` = `4846f043f6133872f1d26e0296a071bca6be48f0`, unchanged (also the merge base). 5 commits, linear on 4846f043.

## 2. CI on 41818ac4 (all 29 check runs finished, 05:55Z)

| Workflow (run) | Check run | Conclusion |
| --- | --- | --- |
| ci (41780411895) | all green (required) | success |
| ci | lint, static, domain model, build, unit | success |
| ci | db (1/6) to db (6/6) | success |
| ci | e2e (1/3) to e2e (3/3) | success |
| ci | images | success |
| mutation (41780411770) | changes | success |
| mutation | mutation (required) | success |
| mutation | stryker (matrix.shard) | skipped (no money package) |
| screening-capacity (41780411830) | changes | success (measure=false) |
| screening-capacity | capacity | skipped |
| screening-capacity | notify | skipped |
| screening-capacity | screening-capacity gate (required) | success |
| approval-of-record (41780411894, 41780520157) | approval-of-record (required) x2 | success |
| release-dry-run (41780411748) | build (web), build (worker), push, capacity | success |

Required: all green, mutation, screening-capacity gate, approval-of-record all success. The gate passed with the capacity job skipped: nothing watched changed, so the capacity runner was not needed (no RUNNER_TOO_SMALL).

**images (job 126410414857).** Step 3 "The pinned Trivy" succeeded right after the checkout. Both scans ran `/home/runner/work/_temp/trivy-bin/trivy image .` (TRIVY_CMD), with setup-trivy skipped (`outcome=skipped`) and actions/cache skipped, severity HIGH,CRITICAL, DB `mirror.gcr.io/aquasec/trivy-db:2`.
- Web image: `/home/runner/work/_temp/image/web.tar (debian 13.7)` plus every node-pkg target: Vulnerabilities 0 on every row.
- Worker image: `worker.tar (debian 13.7)` 0, `app/node_modules/playwright-core/package.json` 0, `opt/yarn-v1.22.22/package.json` 0.
- "Legend: '0': Clean (no security findings detected)". One WARN on the worker: the secret scanner noted `app/dist/main.js.map` (11 MB) is large; informational.
- Steps 11 to 13 (archive identity, headless shell) succeeded.

**release-dry-run.** It ran (`tools/trivy/**` and the workflows changed). build (web) and build (worker): step 3 "The pinned Trivy" success, the SBOM step ran TRIVY_CMD `/home/runner/work/_temp/trivy-bin/trivy` with setup-trivy skipped.

## 3. Fresh clone at 41818ac4
- `pnpm install --frozen-lockfile` (under /tmp/laneb-heavy.lock): passed.
- `vitest run --project unit tools/test/workflows.test.ts tools/check-action-pins`: 6 files, 202 tests passed. The "Trivy" filter in workflows.test.ts: 3 passed.
- `vitest run --project unit tools/test tools/check-action-pins`: 26 files, 378 tests passed (as the description says).
- actionlint: 22 findings, all `[runner-label]` `label "ubuntu-26.04" is unknown`; identical to base 4846f043's actionlint output apart from line numbers (run on a base worktree in the clone). No new finding.
- `pnpm actions:check`: exit 0, "every action is pinned to its release's commit, and every pin new against the base is old enough". It aged tools/trivy/release.txt's v0.70.0 as `aquasecurity/trivy@8a3177aedf7ee0864920eb1852eef031cd3742b8`.
- Changed paths vs the merge base 4846f043 (15, all A/M, no deletion): ci.yml, release-dry-run.yml, release.yml, ADR 0066, docs/runbooks/ci.md, tools/check-action-pins/{age.test.ts, age.ts, base.ts, check.test.ts, check.ts, releases.ts}, tools/gitleaks/install.sh, tools/test/workflows.test.ts, tools/trivy/{install.sh, release.txt}.
- Watched-path check against tools/screening-capacity/watched-paths.txt: 0 hits with a shell `case` loop (the workflow's own logic, glob lines included) and 0 hits with `matchesWatched` (551 lines x 15 paths). No docs/product/test-matrix.md, packages/synth/src/cases/matrix.ts or fixtures/synthetic/** path.
- Spot checks: 5 trivy-action steps (ci 2, release 2, dry run 1), each `skip-setup-trivy: true`; "The pinned Trivy" step in all three workflows; the dry run's two `tools/trivy/**` triggers; both installers' curl `--proto '=https,file' --proto-redir '=https'`; release.txt version 0.70.0 with the two SHA-256 values the description lists.
- Clone removed.

## 4. Description
Every claim checked holds: commits and hashes, 15 files, 378 tests, the 5 trivy-action steps, the actions:check and actionlint results, the watched-path result, and screening-capacity.yml unchanged.

Stale (it was written before CI finished), with exact replacements:
- In "Checks": "No changed path is capacity-watched, so screening-capacity's `changes` job is expected to output `measure=false` and the gate not to need the capacity runner. Its result is the one on this page."
  -> "No changed path is capacity-watched: on `41818ac4`, screening-capacity's `changes` job (run 41780411830) output `measure=false`, the capacity job was skipped, and the `screening-capacity gate` passed without the capacity runner."
- Optional addition after the #106 evidence: "**This PR's CI on `41818ac4`:** ci run 41780411895 `all green` success; `images` job 126410414857 success: "The pinned Trivy" ran right after the checkout, both scans ran `/home/runner/work/_temp/trivy-bin/trivy` with setup-trivy skipped, and both images had **0 HIGH/CRITICAL fixed findings** (every target 0). release-dry-run 41780411748, mutation 41780411770 and approval-of-record success."

Neither is a defect; they are updates.

VERDICT: VERIFIED
