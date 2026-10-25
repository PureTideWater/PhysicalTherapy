**PR #44 (CI 4 of 4, mutation testing) at 7542aae: verification result: passes. Every local and CI check passes. Four minor notes, none of them blocking.**

**What passed:**
- **Clean start:** a fresh copy of the repository installs with the exact locked dependencies.
- **Scope** (against the base, 9c57d2d):
  - The pricing engine has no change outside its tests.
  - The ledger changes only in 12 test files, each by additions only (0 lines deleted).
  - The one non-test money change is `cents.ts:85`. It removes a fallback that the pattern at `:73` makes unreachable, so behaviour is unchanged.
  - The golden claims, migrations, the domain model, content releases and the apps are untouched.
- **Freeze check:** passes for PR 44, with nothing let through.
- **Golden tests:** 188 pass (38 − 5 + 154 claims + 1). The test that holds every claim to exactly one test passes.
- **Ledger proofs:** LED-01 to LED-11 and the ledger oracle pass on PostgreSQL 18 (11 files, 1,285 tests). The files that assert them are unchanged.
- **Mutation testing, run here:**
  - The canary gets 5 of 5 cases right.
  - The money and ledger run scores money at 96.58% and the ledger at 98.13%. Every surviving mutant is a reviewed equivalent, and the gate passes.
  - The negative proof: I deleted one assertion from the money tests, and the gate failed. It named the three mutants that assertion had killed, all in `cents.ts`. With the assertion restored, the gate passes again.
- **Other checks:** typecheck, lint, the workflow linter, 840 tooling and synthetic-data tests, and the fixture regeneration (no change) all pass.
- **CI on 7542aae:**
  - All four required checks are green.
  - Each of the six mutation shards ran its canary at 5 of 5 on Node 24.22.0, and each finished within 15 minutes. packets-rest was the longest, at 10 min 6 s.
  - The gate passed with exactly the local scores: money 96.58%, ledger 98.13%, pricing 98.67%, packets 95.87%. All 164 undetected mutants are recorded equivalents, each reviewed by someone other than its proposer.
  - `all green` took 15 min 58 s; the second end-to-end shard set it. The pull request could merge 16 min 8 s after its first run started, when the screening-capacity gate finished last.
- **The slow end-to-end shard is the runner's fault, not this PR's:**
  - The PR changes nothing the end-to-end jobs run: no app file, no CI job, no browser setting.
  - The tests themselves took 3.7 minutes, against 3.8 on the base.
  - The extra 10 minutes were one download of system packages, 25.9 MB from Ubuntu's Azure mirror at 43 kB/s. On the base's run the same download took 1 second.
  - PR #43's three runs took 3:24 to 4:44 for the same shard.
- **Review fixes:** every fix holds in the code.
  - A deleted or renamed money test now still triggers its package's mutation run (checked here directly).
  - The two pricing records the review rejected are killed by a new test.
  - No test or check was weakened beyond the moves the fix round recorded.

**Four minor notes:**
- **"Blocks the merge" (PR description):**
  - The description says a red mutation result "blocks the merge" and calls the gate "the required `mutation` job". No ruleset or branch protection exists yet, so today the block is the merge rule in ADR 0063, not GitHub.
  - The last commit corrected ADR 0066 to say exactly that, but the description and one line of ADR 0066 (`:333`) still give the old wording.
  - The description also says every finding that held was fixed, but N4 was recorded for Lane A rather than fixed (its row in the table says so).
- **Merge-time figure:** the description does not give the merge-time figure the design asks for. It is 16 min 8 s, above.
- **For the browser PR (ci-browser):** the end-to-end jobs download about 26 MB of system packages on every run. When the mirror is slow, CI goes past its 12-minute target. Taking them from a cache or an image would remove that.
- **packets-rest margin:** its time depends on the runner: 5:50 on the earlier head and 10:06 here, for the same 1,341 mutants. Rebalancing the shards (open item O7) would keep a wider margin under 15 minutes.

**Still to come after the merge:** the first push run's mutation gate, a re-run's report overwrite, and a docs-only pull request's time.
