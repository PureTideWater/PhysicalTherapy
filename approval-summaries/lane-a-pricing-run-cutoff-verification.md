# Verification: PR #118, pricing-run-cutoff (co-001/pricing-run-cutoff)

Verifier, 2026-11-04T23:38Z to 23:43Z UTC. Progress: prc/progress/verify.progress.md.

## 1. Head and base (git ls-remote)
- origin co-001/pricing-run-cutoff = 82bafc0a (the PR's head per the GitHub API).
- origin claude/build-platform = 35422a92; 82bafc0a is the merge of 35422a92, so the base is contained (no re-merge needed for 82bafc0a).
- **The fix round's work is not on origin.** The worktree /home/user/pricing-cutoff is at bf33d5b9, 6 commits ahead of origin, none pushed:
  b51a2614 test(console), 022bd261 fix(console), 488a07f3 test(rerun fail closed), 93998d27 fix(rerun), 61480939 refactor(drop updatedAt), bf33d5b9 docs(cut-off comment).
- **The fix round's suite is dead.** prc/logs/suite/status.txt records only `typecheck rc=0 37s` (head bf33d5b9, merge base 35422a92). lint.log ends at `ELIFECYCLE Command failed` with no result line, and no suite, vitest, eslint or flock process is running. So the suite was killed mid-lint. Lint, unit, golden, db, synth, e2e, Stryker and the engine-freeze check never ran on bf33d5b9.

## 2. CI on the PR head 82bafc0a (all finished)
| Check | Result |
| --- | --- |
| all green (required) | success |
| mutation (required) | success |
| screening-capacity gate (required) | success |
| approval-of-record (required, 2 runs) | success, success |
| static | success |
| domain model | success |
| unit | success |
| lint | success |
| build | success |
| images | success |
| db (1/4), (2/4), (3/4), (4/4) | success x4 |
| e2e (1/2), (2/2) | success x2 |
| capacity | success |
| changes (2 runs) | success x2 |
| stryker (matrix) | skipped |
| notify | skipped |

Mutation scores: none. The stryker matrix was skipped because tools/stryker/affected.ts gives `shards: none (no money path changed)`, with money, pricing, ledger and packets all not affected (prc/logs/affected.log, prc/logs/check/affected.log). So there is no score to quote. This CI covers 82bafc0a only, not the fix round's commits.

## 3. Fresh-clone checks
Not run. The head the fix round reported is not on origin, so a clone at the PR head would verify code that is about to be replaced. Read-only from the worktree: `git diff --stat 35422a92 bf33d5b9` shows 16 files, +452 -53, and nothing under packages/pricing/src.

## 4. The description
- The footer is exact: it ends with the Claude Code line, a blank line, then the session URL.
- Out of date:
  - The reviewer table still says "Not run yet" for the payment-engine and correctness reviews. Both reviews are done (no B or S; payment-engine N1-N5, correctness N1-N2).
  - The description doesn't cover the fix round's changes: console.ts status_since now compared in SQL (the sweep table still calls it "Safe, could be tightened"), rerunReasons failing closed, and PracticeLocation.updatedAt dropped.
  - The Checks table reports results at 82bafc0a and 39d7ecad only.
- For 82bafc0a itself, the claims match: no packages/pricing change, no migration, affected none, base merged.

VERDICT: NOT VERIFIED: the fix round's 6 commits (head bf33d5b9) are not pushed, so the PR head is still 82bafc0a. The fix round's suite died after typecheck: lint was killed and nothing after it ran, so there is no lint, unit, db, e2e, Stryker or engine-freeze result for bf33d5b9. No CI has run on the fix round's head. The fresh-clone 20x regression run and migrate were therefore not done. The PR description is stale: the reviewer rows say "Not run yet" and the fix-round changes are missing. Next: rerun prc/suite.sh on bf33d5b9 under the lock, merge the base if it moved, push through the hook, update the description, then verify again.
