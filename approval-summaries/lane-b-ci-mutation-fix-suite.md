# Fix suite: co-001/ci-mutation (draft PR #44), the fix round's merge, base merge, re-read, full suite, push

The head is **7542aae**, pushed to `origin/co-001/ci-mutation` once, through the pre-push hook. The hook checked 15 commits, and gitleaks found no secret; nothing was forced and `--no-verify` was not used. The base is `claude/build-platform` at 9c57d2d, which is PR #43 (ci-speed) merged. PR #44's body was updated, read back with `gh api`, and is byte-identical to the text sent. It ends with the two attribution lines.

The logs are in `/tmp/claude-0/-home-user-PhysicalTherapy/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad/ci-mutation/suite-run/`. That folder holds:
- a log per command;
- `mutation/`, with each shard's canary, shard and view logs, `times.txt`, `gate.log` and `gate-summary.md`;
- `neg/`, the negative proof's reports;
- `old-reports/`, the integrator's reports from 9099fac, moved out of `reports/mutation`.

## The branch

`git log --first-parent 9099fac..7542aae`:

| Commit | What |
| --- | --- |
| e932840 | Merge co-001/ci-mutation-fa (5f9f2ed), clean (an earlier run of this suite) |
| 86b4b5f | Merge co-001/ci-mutation-fb (fba28f8), clean (an earlier run) |
| 221856f | payment-engine/N2's ledger half: allocation.test.ts's harness as FA gave pricing's (an earlier run). Against the merge base it is still additions only (84 added, 0 deleted). Against 9099fac it shows 41/18, because it edits lines this PR itself added |
| 2506056 | ADR 0066 Part 4 and the runbook (an earlier run). They give the fix round's scores, 164 undetected, the NaN-sort non-equivalent, the one hardening rule, and mismatches.ts's reason naming Unicode 17.0 |
| da4d7e9 | Merge origin/claude/build-platform (9c57d2d) under rule 6 (an earlier run; the resolution is in the commit message and the PR body) |
| 7542aae | This run's adversarial re-read fixes (below) |

**Step 2, the base.** `origin/claude/build-platform` is still at 9c57d2d, so there was nothing more to merge.

## Step 3: the adversarial re-read of 9099fac..HEAD

What was read:
- every fix commit's diff;
- the merge's remerge-diff for each conflicted file: ADR 0066, the runbook, the test matrix, matrix.ts, registry.ts, workflows.test.ts and ADR 0063;
- README, ADR 0064, ADR 0047 and reconciliation-001 against the base;
- the full current text of these tools: `affected.ts`, `gate.ts`, `workspace.ts`, the `watched.ts` changes, `vitest.mutation.config.ts` and `mutation.yml`.

What was checked:
- No conflict markers anywhere.
- Every test this round removed or rewrote was one this PR added: `rounding.test.ts`'s cast test, the old year-basis test, and the `sorts: 1` assertions. Against the base, money, pricing and ledger tests delete only import lines.
- No closure file imports `child_process`, `worker_threads` or `readline` (probe: `repositoryClosures`), so the `node:fs` reader backstop has no side door.
- The temporary git repo in `affected.test.ts` sets its own identity (`-c user.name/user.email`), so it works on CI.

Found and fixed in **7542aae**:
1. **Unicode listing completeness.** Nothing required that an equivalent whose reason says it rests on Unicode data is listed in `tools/stryker/unicode.json`. A future entry could say so and still be scored on any Node's data. New test, `gate.test.ts`: "lists every recorded equivalent whose reason says it rests on Unicode data". It failed first, with mismatches.ts's record taken out of the listing, and passes as committed. The runbook names it.
2. **The guard's test** gains two cases: packages given when nothing is affected, and packages that are not a JSON array. Both fail closed (2 good, 16 bad).
3. **ADR 0066 Part 4** made consistent:
   - It now names `importGraph()`, not `importClosure()`, as the closures' reader.
   - "`mutation` is a required check" becomes "one of the required checks once the founder applies the ruleset". That is Part 1's wording, since no ruleset exists yet.
   - "The merged head and the pull request's own CI run measure the same scores" becomes what this run measured: all six shards on the head merged with Part 1 give the same scores, mutant for mutant (verified below). The pull request's CI then measures them again.
   - Three over-long lines are rewrapped.
4. **The CI runbook:** "Its `mutation` job is one of the required checks above."
5. **`tools/golden-worksheet/engine.ts`:** its header comment is rewrapped (comment only).

## Step 4: the full suite on 7542aae

Every heavy command ran under `flock /tmp/laneb-heavy.lock`, one at a time, in the foreground. The environment was Node 24.22.0 (Unicode 17.0, ICU 78.3) and PG18.4 on 5433.

The database suite and e2e were each split into shards that ran one after another. CI does the same, and that keeps every call under the tool's 10-minute limit.

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Exit 0 |
| `pnpm check:fixtures` | 234 guarded, 2,793 searched; every interchange synthetic |
| `pnpm typecheck` | 22 projects passed (73 s) |
| `pnpm lint` | 1,487 files in 3 groups, 0 errors, 0 warnings (122 s) |
| `pnpm lint:logs` | 997 files, every log call allowlisted |
| `pnpm verify-content` | Every content set passes |
| `env -u PR_NUMBER pnpm -s exec tsx tools/engine-freeze/check.ts 9c57d2d` | No non-test file under packages/pricing/src changes; let through nothing; no problems |
| Design 3.4.4 step 1, against 9c57d2d | <ul><li>pricing non-test diff: empty;</li><li>ledger numstat: 12 `*.test.ts` files, 0 deletions each, no non-test file;</li><li>money non-test files: exactly `cents.ts`, the `:85` line;</li><li>`fixtures/golden`: no diff;</li><li>no migration, no `content/releases` change</li></ul> |
| Model identifiers in `git diff 9c57d2d HEAD` and the commit messages | None; only the attribution lines |
| `pnpm synth --all`, then `git status` | 190 cases: 0 written, 459 unchanged, 0 removed; 8 EMR formats: 0 written, 16 unchanged; clean |
| `pnpm synth --large` | Wrote the PAR-29 10,000-claim remittance (gitignored) |
| `pnpm test` (unit, with coverage) | 320 files, 4,986 passed, 3 skipped, exit 0. Branches: money 56/56, pricing 594/594, ledger 415/415, edi835 714/714 (100%) |
| `pnpm test:golden` | 4 files, 188 passed |
| `pnpm test:oracle` | pyx12 4.0.0 agrees on all 630 synthetic 835s (619 valid, 11 malformed rejected); edi835 agrees with pyx12 |
| `pnpm licenses:check` | 189 production packages, all allowed |
| `actionlint` | Exit 0, no output |
| `pnpm db:migrate` (`DATABASE_URL=postgres://postgres:test@localhost:5433/postgres`) | Nothing to apply (44 already applied) |
| `pnpm test:db --shard=i/6`, i = 1 to 6, one after another | 20+20+20+20+19+19 files: 118 files, 9,040 passed, 1 skipped, 0 failed. The union of the six shards' files equals `vitest list --project db` (118), each file once. Shard times: 180, 77, 182, 127, 209 and 106 s |
| `pnpm build`, then `git rev-parse HEAD > apps/web/.next/BUILD_COMMIT` | Exit 0 (91 s) |
| `E2E_PREBUILT=1 E2E_DATABASE=tp_e2e_cimut E2E_PORT=3147 PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers pnpm test:e2e --shard=1/2 --workers=2`, then `--shard=2/2` | 26 + 25 = **51 passed**, 0 failed. The build stamp: "the build is 7542aae…'s" |
| The canary + `verdict.ts --shard <s>`, first in each shard | 5 of 5 in all six, each on Node v24.22.0 (Unicode 17.0, ICU 78.3) |
| `tools/stryker/shards.ts <shard>` for the six shards, one after another | All exit 0. Stryker's times: <ul><li>pricing-engine 8 min 17 s;</li><li>pricing-recompute 3 min 49 s;</li><li>pricing-rest 5 min 48 s;</li><li>packets-scan 5 min 55 s;</li><li>packets-rest 8 min 13 s;</li><li>money-ledger 39 s + 3 min 10 s</li></ul> |
| `gate.ts reports/mutation --expected '<all six>'` | **mutation gate: passed.** <ul><li>money 96.58% (226/234, 8 undetected, all recorded, 7 load failures left out);</li><li>pricing 98.67% (1,934/1,960, 26, 12 load failures);</li><li>ledger 98.13% (1,633/1,664, 31);</li><li>packets 95.87% (2,299/2,398, 99, 2 load failures).</li></ul>164 undetected, all reviewed equivalents |
| These six shards' reports against FA's full run (`fa/runs/full/reports`), keyed by mutant identity | 6,277 mutants with the same status; 0 differ; 0 on one side only |
| Negative: a scratch copy of the reports with one killed `cents.ts:83:26` mutant set to Survived, then the gate | Exit 1, exactly 1 problem: "money: unexplained Survived packages/money/src/cents.ts:83:26 StringLiteral …" |
| `tools/stryker/affected.ts --event pull_request --base origin/claude/build-platform --github-output <f>` | `any=true`, all four packages, all six shards |
| `pnpm -s db:domain-model --summary-since origin/claude/build-platform` | No change (SHA-256 6d7a143d…) |

**A note on running.** packets-rest's first attempt was killed by `timeout` at 597 s. The clock had started before `flock` acquired the lock, and the other workflow held the lock for about two minutes in between. The shard's Stryker process exited with it, and nothing was left running. The stale `.stryker-tmp` sandbox was removed. The shard was then re-run in full with `budgeted.sh`, which waits for the lock and then gives the command only what is left of the 590 s. The canary.json it used is from the same head. Every other shard ran once.

## Steps 5 and 6

- `git push origin co-001/ci-mutation`: 9099fac..7542aae.
- PR #44's body, updated through `update_pull_request` and read back identical:
  - the base-merge note;
  - What changes, Why and What it does not change, all against 9c57d2d;
  - the "Fix round" checks table, plus the build's own table kept below it;
  - the "Reviewer agents' findings" table, one row per finding (22 rows, `<reviewer>/<id>`, severity, one line, resolution with commit);
  - the Lane A PR 6c list and the founder notes;
  - the domain-model summary against 9c57d2d;
  - the template's ending, unchanged.
- **CI on 7542aae: all four required checks passed.** The PR body's checks row was updated with these results and read back identical.
  - `all green`: ci run 40219164530; static, lint, unit, db 1-4, domain model, build, e2e 1-2 and images all succeeded.
  - `mutation`: run 40219164294.
    - `changes` chose all four packages and all six shards.
    - The stryker jobs took 4 min 5 s (money-ledger), 4 min 13 s (pricing-recompute), 6 min 3 s (pricing-engine), 6 min 10 s (pricing-rest), 6 min 17 s (packets-scan) and 10 min 6 s (packets-rest).
    - The gate passed with exactly the local scores (money 96.58%, pricing 98.67%, ledger 98.13%, packets 95.87%), so every verdict carried Unicode 17.0 and ICU 78.3.
    - The workflow ran from 18:00:25 to 18:11:37 UTC.
  - `screening-capacity gate`: run 40219164336.
  - `approval-of-record`.

## For Lane A's PR 6c

1. Validate line numbers before `price` sorts and ranks a claim's lines: a safe integer, at least 1, unique. Or use a comparator that is total over every number. Then `sorts.test.ts`'s NaN case can also assert result order (payment-engine/N4).
2. A year basis the engine cannot read as `LOCKED:<four digits>` should stop the line (ENGINE_ERROR), not price at the records in force. This is a money-path defect and a founder question. The fix flips `engine.test.ts`'s "frozen engine, current behaviour, a known defect (Lane A PR 6c)" test. `YearBasis`'s `` `LOCKED:${number}` `` is also wider than the contracts schema (payment-engine/S2).
3. For a two-digit place of service, read only the settings object's own keys (`Object.hasOwn`). Today an inherited key is read (found while verifying payment-engine/N1).
4. Give an unknown rounding rule a detail of its own, instead of 'unexpected'.
5. A new pricing source file needs its shard in `stryker/shards.json`. Only a declarations-only file may go in `noMutants`.

## Open items

- **The design's remaining CI items.** A1′ for the head, `overwrite` on a re-run, and the first push run after this merges.
- **packets-rest on CI.** It took 10 min 6 s, within the design's 15 minutes and the job's 30. If it nears either, rebalance `stryker/shards.json`.
- **payment-engine/N2's ledger half was applied** (221856f, an earlier run of this suite). It is additions only against the base, but it edits lines this PR added, which shows 18 deletions against 9099fac. If the co-founder reads the additions-only rule against 9099fac rather than the base, the fix is to revert 221856f. FA's validated patch is the same change.
- **payment-engine/S1's possible later money change:** an explicit MoneyError guard in `multiplyCents` for text cast past `Cents`. It is outside this PR's one-money-change rule, and it is the founder's call.
- **The PR stays a draft.** It merges only after the founder approves the latest commit and the required checks are green (ADR 0063).
