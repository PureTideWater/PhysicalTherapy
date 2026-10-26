# PR #53 fix round: integration and full suite (part integrate)

Worktree /home/user/model-eval-gate, branch co-001/model-eval-gate. Base of the fix round: 3791fec2. New head: 75954972.
Nothing was pushed. Part reports: scratchpad/meg/fix/permitted.md, metric.md and synth.md. Progress log:
scratchpad/meg/progress/fix-suite.md. Step logs: scratchpad/meg/fix/logs/.

## Findings: final dispositions

Severity is the skeptic's verified severity where one exists. Otherwise it is the reviewer's.

| id | reviewer | verified severity | disposition | commit |
|---|---|---|---|---|
| B1 | ai-safety | major (blocking per reviewer) | Fixed. Served history survives a version change. Test: record-permitted.test (before fails, after passes; permitted.md) | 6b02d05e (+ recordPermitted and the `served` format in bbc13e91) |
| M1 | ai-safety | major | Fixed. `--against` is tied to the report that was served (`againstProblems`), with the strictest workable rule | 6b02d05e, bbc13e91 |
| M2 | ai-safety | major | Fixed. A left-out scope field is stated as not stated and counted as `widened`. The integrator added three pieces: production defaults (contract-terms SCOPE_UNSTATED), unstated rows on the review screen (display.tsx and the new display.test.tsx), and `statedKeys.rateRecord` in the permitted run. Before logs: suite-before-m2prod.log and suite-before-statedkeys.log | bbc13e91 (production and display), 6b02d05e (statedKeys) |
| M3 | ai-safety | major | Fixed. Each contract variant is measured on its own | 6b02d05e, bbc13e91 |
| m1 | ai-safety | minor | Fixed, to the verdict's scope. recordBaseline refuses runs whose calls failed | bbc13e91 |
| m2 | ai-safety | minor | Fixed. A label that obeys an injection is counted. The integrator added the CLI `tallyText`, which prints `widened` (suite-before-tallytext.log) | bbc13e91 |
| m3 | ai-safety | nit (refuted) | No change. approveVersion refuses an uncited record, and so does resolve(null) (`not_cited`). Evidence is in synth.md | none |
| m4 | ai-safety | minor | Fixed. Duplicate keys are refused, and the import-time parse stays eager but fails loud and closed | bbc13e91 |
| n1 | ai-safety | nit | Fixed. The recompute reads the cases, not the report's metadata | bbc13e91 |
| n2 | ai-safety | nit | Fixed. The twin key holds conflicts by key | bbc13e91 |
| n3 | ai-safety | nit | Fixed. A new fault covers merged codes that verify | bbc13e91 |
| n4 | ai-safety | nit | Fixed per field where the set allows it. Where it does not, the limit is documented (metric.md) | bbc13e91 |
| S1 | security | minor | Fixed. Outcomes are allowlisted as measured, which is stricter than the verdict's denylist | 6b02d05e |
| S2 | security | minor | Fixed. Set v2 uses synthetic-range NPIs and TINs only, and the set is regenerated with synth --all | 0e2f7ed9 |
| S3 | security | nit (refuted; improvement taken) | Done. CODEOWNERS names the prices and the judge files, and codeowners.test holds them (before 2 failed, after 8/8) | 0e2f7ed9 |
| N1 | security | nit | Fixed. serving `evaluable` is bound to the permitted run in gateway.ts | 6b02d05e |
| N2 | security | nit | Resolved before the fix round, in merge a3e08b37, which kept both sides of codeowners.test. codeowners.test passes 8/8. watched.ts --write leaves watched-paths.txt unchanged (517 lines) | a3e08b37 (no fix-round change) |
| N3 | security | nit | Fixed. The spliced check was added and the runbook now describes it | 6b02d05e, 75954972 |
| N4 | security | nit | Fixed. A zero-example report is tied to a production run | 6b02d05e, 75954972 |
| integrator proposal | — | — | Fixed. An unreadable `--against` exits 2 without the path or the content | 6b02d05e |
| BASELINE_NOTE (integrator) | — | — | Fixed. The note is written by recordBaseline/recordPermitted, not by hand (suite-before-note.log) | bbc13e91 |

## The full suite, in lane-b.md's order, each step under flock /tmp/laneb-heavy.lock

| step | command | result |
|---|---|---|
| 1 | `pnpm synth --all` | 206 cases. 3 written (MOD-07/08/10 expected.json), 528 unchanged. Rerun at 75954972: 0 written, 531 unchanged, 0 removed. EMR: 16 unchanged. `git diff --exit-code -- fixtures/synthetic` is clean |
| 1 | `pnpm eval` gate, then `--record --new-set` (set_changed) | New report 0b130094...json, then gate passed. Orphan reports 55649a4f... and 13abefc3... deleted. baseline.json names only 0b130094 |
| 1 | `gitleaks dir packages/model-gateway/eval --no-banner` | no leaks found, about 535 KB scanned. No key-named field holds a long hex value |
| 3 | `pnpm typecheck` | passed, 22 projects, 41.2 s |
| 3 | `pnpm lint` | passed, 1,510 files, 0 errors |
| 3 | `pnpm lint:logs` | 1006 files ok |
| 3 | `pnpm lint:copy` | 492 files ok |
| 3 | `pnpm test` (unit) | Test Files 1 failed, 332 passed (333). Tests 1 failed, 5211 passed, 3 skipped (5215). 205.62 s. The failure was this PR's: tools/screening-capacity/env.test.ts counted NODE_ENV in the new checkPermittedGateway error string in apps/worker/src/models/permitted.ts. Fixed by rewording the string to "a production deployment". Rerun of env.test plus worker permitted.test: 2 files, 16 tests pass |
| 3 | `pnpm test:golden` | Test Files 4 passed (4). Tests 221 passed (221). 20.58 s |
| 3 | `pnpm test:oracle` | pyx12 4.0.0 agrees with all 637 fixtures (626 valid, 11 malformed and rejected). edi835 agrees on every segment, amount, balance and verdict |
| 3 | `pnpm db:migrate && pnpm test:db --shard=i/4` | Run as ci.yml does on a public repo: 4 shards, each on its own fresh database shardN at localhost:5433, migrated by itself, run one after another. 1/4: 30 files, 3097 passed, 1 skipped (3098), 198.73 s. 2/4: 30 files, 2578 passed, 228.96 s. 3/4: 30 files, 2501 passed, 267.69 s. 4/4: 29 files, 895 passed, 190.29 s. Union: 119 files, each run once. 0 failed |
| 3 | `pnpm build` | exit 0 (web and worker) |
| 3 | stamp: `git rev-parse HEAD > apps/web/.next/BUILD_COMMIT` | The first e2e attempt (stamp 3791fec2, uncommitted tree) was refused by build-stamp, which requires a clean tree. After the commits the tree was clean and byte-identical to what had been built, so BUILD_COMMIT was restamped as 75954972 |
| 3 | `E2E_PREBUILT=1 pnpm test:e2e --workers=2` (DATABASE_URL=postgres://postgres:test@localhost:5433/postgres) | 51 passed (7.9 m) |
| 3 | `tsx tools/stryker/affected.ts --event pull_request --base 6ddd587` (at 75954972) | money, pricing, ledger and packets are not affected. Shards: none ("no money path changed"). No mutation shard ran, so the gate has nothing to score; mutation.yml passes in this case |
| 3 | `pnpm check:fixtures` | 266 files read, 3227 searched. Every table carries SYNTHSENDER or is pinned, and every interchange is synthetic |
| 3 | `pnpm verify-content` | every content set passes |
| 3 | `tsx tools/engine-freeze/check.ts <merge-base origin/claude/build-platform = 4d99df80>` | Problems: None |
| 3 | `tsx tools/screening-capacity/watched.ts --write` | 517 lines, no change, nothing kept |

Failures that are not this PR's: none hit in this run. The packets verifier property flake (seed 2019154346) did not occur.

## Step 4: git diff --stat 3791fec2

The diff covers 52 files, all of them fix-round files:
- the permitted path (worker and gateway)
- the metric, tally and score code, the formats, contract-terms and the models display
- synth set v2 and x12 factory, with the regenerated MOD-07/08/09/10/11 fixtures
- CODEOWNERS and its test
- ADR 0070, the runbook, test-matrix.md and matrix.ts, the README
- baseline.json and one report (0b130094 replaces 55649a4f)

Nothing in migrations, content/releases, fixtures/golden or packages/pricing/src. A scan of the added lines for model identifiers found nothing. All data is synthetic: no PHI.

## Commits (not pushed)

- 6b02d05e: Hold the permitted run to what production served (PR #53 review fixes: B1, M1, M3, S1, N1, N3, N4)
- bbc13e91: Count a widened rate record and refuse unmeasured baselines (PR #53 review fixes: M2, m1, m2, m4, n1-n4). The shared files go here: eval/baseline.ts with recordPermitted, eval/cli.ts, src/index.ts, the baseline format at /4 with `served`, gate.golden.test.ts, and the re-recorded baseline and report
- 0e2f7ed9: Give contract set v2 synthetic identifiers and name the serving judge's owners (PR #53 review fixes: S2, S3)
- 75954972: Make ADR 0070, the model evaluation runbook, the test matrix and the README true of the fixed gate

Each message ends with the two required trailer lines. Shared files were committed whole with the second commit and were not split by hunk, so 6b02d05e alone does not build. The head builds and passes the suite.
