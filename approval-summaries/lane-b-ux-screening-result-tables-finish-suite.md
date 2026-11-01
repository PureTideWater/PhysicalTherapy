# PR #83 fix round: full local suite

Worktree /home/user/ux-screening-result-tables, branch co-001/ux-screening-result-tables. Nothing pushed. No rebase, reset, stash, amend or force. No migration.

## Head

Final head: a4efd583af1464da390cfcb3a21cf1468981a421 (local only, 6 first-parent commits ahead of origin's f4a97668).

On top of origin's PR head f4a97668:
- c0a8fe0b Merge claude/build-platform (#81) into co-001/ux-screening-result-tables.
- d0152f43 UXR-01.
- e901e477 UXR-05.
- 857ca333 P4-RC-01, -04, -06, UXR-02, -03, -04.
- f5e0ceba P4-RC-02, -03, -05, UXR-06.
- a4efd583 Merge claude/build-platform (bce57f16: #78, #82) into co-001/ux-screening-result-tables.

Merge base with origin/claude/build-platform: bce57f167bc2217dc25ebbc1cabceb10a195a0a0 (PR #82). This is the local ref; it was not fetched again.

There is no fix commit. The one failure (pnpm test) is not caused by the diff (see "The one failure"). The tree was clean before and after the suite.

## Scope checks (on git diff bce57f16 HEAD, 27 files)

- From pr42-files.txt, the diff touches only these four files, all within the task's exceptions:
  - docs/product/test-matrix.md: +11/-7. The TBL-01, TBL-03 and TBL-04 rows are reworded, and TBL-05 to TBL-08 are added.
  - packages/synth/src/cases/matrix.ts: +27/-3.
  - packages/synth/src/cases/registry.ts: +15/-0.
  - tools/screening-capacity/watched-paths.txt: +2/-0. The merge step regenerated it with watched.ts --write.
- The diff does not touch apps/web/src/lib/screening/*. It also leaves these four files alone: components/screening/result.test.tsx, lib/screening/labels.ts, e2e/screening.ts and e2e/screening.spec.ts.
- Nothing changes under packages/db, packages/pricing, packages/ledger or packages/money. No migration.
- Model identifiers in the diff: none.
- Commit messages: none outside the attribution lines. The merge subjects name the branch claude/build-platform. One problem carries over from the merge step: a4efd583's message ends with git's "# Conflicts:" block (3 lines) after the two trailer lines. This needs an amend, which the rules forbid, so it is left for the orchestrator.

## Full local suite on a4efd583

Every command ran under `flock /tmp/laneb-heavy.lock`, one at a time, with Node v24.22.0, pnpm 10.34.8, Playwright 1.64.1 and PG18.4 on 5433.
- Logs: scratchpad/suite83/*.log.
- Runners: scratchpad/suite83/run.sh and phase1-4.sh.
- Step lines: scratchpad/suite83/results.tsv.

| Command | Result | Counts | Time |
| --- | --- | --- | --- |
| pnpm install --frozen-lockfile | Pass | Already up to date, 22 projects | 3 s |
| pnpm check:fixtures | Pass | 333 files read, 3,894 searched | 1 s |
| pnpm typecheck | Pass | 22 projects (22 of 22 warm) | 20 s |
| pnpm lint | Pass | 1,680 files in 3 groups (packages 501, apps/web 630, root 549), 0 errors, 0 warnings | 96 s |
| pnpm lint:copy | Pass | 538 files | 2 s |
| pnpm lint:logs | Pass | 1,087 files | 2 s |
| pnpm verify-content | Pass | Every content set passes | 1 s |
| pnpm -s exec tsx tools/engine-freeze/check.ts bce57f16 (merge base) | Pass | No non-test pricing change, nothing let through, no problems | 1 s |
| pnpm synth --all | Pass | 265 cases: 0 written, 657 unchanged, 0 removed. EMR: 8 formats, 16 unchanged | 2 s |
| git diff --exit-code && test -z "$(git status --porcelain)" | Pass | Tree clean | 0 s |
| pnpm test | **Fail (not the diff)** | 406 files: 405 passed, 1 failed. 6,919 tests: 6,914 passed, 1 failed, 4 skipped. The failure is packages/model-gateway/src/redact.property.test.ts:325 (MOD-13), seed 1162287068 | 241 s |
| redact.property.test.ts alone, FC_SEED=1162287068 (vitest config outside the repo, scratchpad/suite83/seed-repro) | Fail, reproduced | The same counterexample, so the failure is deterministic. 2 of 5 tests fail with this seed | 6 s |
| same file, unseeded, once | Fail | Another seed (-1919993884) with the same shape | 8 s |
| same file, unseeded, 10 times | Pass | 10 of 10 passed. Overall, 2 of 13 runs of the file failed | 100 s |
| same, FC_SEED=1162287068 FC_VERBOSE=2 -t MOD-13 | Fail, as expected | Found the original draw before shrinking (see "The one failure") | 5 s |
| pnpm test:golden | Pass | 5 files, 376 tests | 22 s |
| pnpm test:oracle (TP_ORACLE_PYTHON=/opt/py312-ci/bin/python3) | Pass | pyx12 4.0.0 agrees on all 687 (676 valid, 11 malformed), and edi835 agrees | 50 s |
| pnpm db:migrate (fresh tp_pr83_migrate on 5433, dropped afterwards) | Pass | Applied 44, none before (schema_migrations: 44) | 1 s |
| pnpm exec vitest list --project db --filesOnly | Pass | 129 files | 1 s |
| DATABASE_URL=…5433/postgres pnpm test:db --shard=1/4 | Pass | 33 files, 3,190 passed, 1 skipped | 506 s |
| same, --shard=2/4 | Pass | 32 files, 2,615 passed | 139 s |
| same, --shard=3/4 | Pass | 32 files, 2,552 passed | 323 s |
| same, --shard=4/4 | Pass | 32 files, 926 passed | 111 s |
| test:db total | Pass | 129 files, the same as `vitest list --project db` (129): 9,283 passed, 1 skipped, 0 failed | 1,079 s |
| pnpm build | Pass | Web (cold: no .next before) and worker (esbuild) | 62 s |
| build-stamp.ts --write a4efd583af14… | Pass | Stamped a4efd583. --expect and both web servers read "the build is a4efd583…'s" | 0 s |
| E2E_ADMIN_URL=…5433/postgres E2E_PREBUILT=1 E2E_DATABASE=tp_e2e_pr83 E2E_PORT=3183 pnpm test:e2e --shard=1/2 --workers=2 | Pass | 32 passed. layout-1280.spec.ts:131 passed | 303 s (5.0 min) |
| same, --shard=2/2 | Pass | 32 passed. screening-phone.spec.ts:135 (this PR's phone read) passed, and so did tables-phone.spec.ts:171 and :293. screening.spec.ts:147 (SCR-01 to SCR-07, SCR-18) passed, so no flake re-run was needed | 296 s (4.9 min) |
| e2e total | Pass | 64 passed, 0 failed. tp_e2e_pr83 dropped, and its /tmp/tp-e2e-tp_e2e_pr83-* directories removed | 599 s |
| pnpm -s exec tsx tools/stryker/affected.ts --event pull_request --base bce57f16 | Pass | No shards: money, pricing, ledger and packets are all not affected (any=false, shards=[]) | 14 s |
| pnpm -s exec tsx tools/stryker/gate.ts (empty reports dir, --expected '[]') | Pass | "No money path changed: no mutation run, nothing to judge." Mutation gate passed | 1 s |

## The one failure

The failure is in packages/model-gateway/src/redact.property.test.ts:325 (MOD-13). The test's second property fails with the same seed.

**Not caused by the diff:**
- `git diff bce57f16 HEAD -- packages/model-gateway packages/packets` is empty, and the lockfile does not change.
- fast-check draws a new seed on each run.
- The base has the same code, so the same seeds fail there.

**The counterexample:**
- After shrinking: patient "CLAIM CLAIM", claim number 00000101 written as "Claim 0000-01-01". Shrinking moves toward PARTS[0] = 'CLAIM' and toward zeros, so the "CLAIM" name is a side effect of shrinking.
- The original draw (from the FC_VERBOSE=2 replay): claim number 00230426 written as "0023-04-26" and "00−23−0426".

**The cause is a four-digit year below 100. The code and its test read it in two different ways:**
- The redactor treats it as a date:
  - `iso()` and `years()` in packages/model-gateway/src/redact.ts accept year 0023 as a calendar date.
  - `iso()` never checks the year. Date.UTC maps years 0 to 99 to 19xx, and that only affects the month-length check.
  - So "0023-04-26" counts as an "other date", and `matchesIn` keeps the dashed digits-only claim number inside it (`inOtherDate(range) && DASHED.test(...)`).
  - The claim number reaches the model unredacted.
- The test's oracle does not:
  - `separatedDateReadings()` validates the date with Date.UTC, which turns year 23 into 1923.
  - So it finds no date, and it expects the claim number to be redacted.

**Scope:** this is outside PR #83's diff and lane, so it was not fixed here.

## Proposals

- In packages/model-gateway/src/redact.ts, give no date reading for a four-digit year below a stated floor (at least 1000). With that, "0023-04-26" is redacted as the claim number it is.
  - Add the named case to redact.test.ts: claim 00230426 written as "Claim 0023-04-26".
  - State the floor in the oracle explicitly, instead of relying on Date.UTC's 1900 mapping.
  - This belongs in its own model-gateway pull request. Until it lands, any PR's unit job can fail on a random seed: 2 of 13 runs here.
- Push the six local commits (c0a8fe0b..a4efd583) so that CI covers the head this suite ran on. The orchestrator owns the push; this step does not push.
- a4efd583's message keeps git's "# Conflicts:" block after its trailers. The orchestrator decides whether that stands, because fixing it needs an amend, which this step may not do.
