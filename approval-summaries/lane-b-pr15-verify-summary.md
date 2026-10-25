**PR #45 (PR 15, ledger tests LED-12 and LED-13) at f4d125b: verification result: does not pass yet. Every local and CI check passes, and the code needs no change. One should-fix stands, in the PR description only: it says the PR adds 1 unit test, when CI runs 8 more. Four minor notes.**

**What passed:**
- **Clean start:** a fresh copy of the repository at f4d125b installs with the exact locked dependencies (Node 24.22.0).
- **The merge commit:** f4d125b's parents are b7e15e8 and de8f9b5. Merging the two parents again reproduces f4d125b's tree exactly, so nothing was edited by hand in the merge. The base is still de8f9b5.
- **Scope** (against de8f9b5):
  - Tests and documents only. No non-test file changes under `packages/ledger/src` or `apps/worker/src/reconcile` (`test-support/` included).
  - Nothing changes in `packages/pricing`, `packages/edi835/src`, `packages/db`, `content/releases`, any migration, the domain model, the ADRs, CO-09's text, `CLAUDE.md`, `.claude` or `.github`.
  - The ledger's only change is `totals.test.ts`: 19 lines added, 0 deleted.
  - The two ledger database test files lose only three lines: the widened `@tp/money` import and the two header-comment lines. Every existing test and every existing oracle case is byte-identical, and the oracle's harness is unchanged.
  - The files changed are the design's section 4 list. LED-12 has 15 generated files where the design planned 11. The four extra files are CSVs added by recorded review fixes: design-review SF-1 and payment-engine N-5.
- **Fixtures:** `pnpm synth --all` writes nothing, twice (192 cases, 475 unchanged). `pnpm check:fixtures` passes (248 files read, 2,809 searched; all synthetic).
- **The ledger's database tests**, on PostgreSQL 18: 51 of 51 pass. That is the base's 42 plus 9: seven LED-12 tests, one LED-13 test and one oracle case. I counted the base's 42 from de8f9b5's own copies of the two files, and every base test name is still there.
- **Unit tests:** `packages/ledger` and `packages/synth` pass (26 files, 332 tests), the LED-13 property among them. The ledger's coverage is 100% on all four measures (branches 415 of 415).
- **Mutation testing, run here:**
  - The canary gets 5 of 5 cases right on Node 24.22.0.
  - The money-ledger shard takes 3 min 25 s.
  - The gate passes: money 96.58% and ledger 98.13%. All 31 ledger survivors match the 31 recorded equivalents, with none stale and none now killed.
- **The rows, word for word:**
  - LED-12's text is identical in seven places: the design's L1 (a) text (sections 3 and 7, and A.3), `test-matrix.md`, `matrix.ts`, LED-12's `expected.json` and item 15's quote.
  - LED-13 keeps CO-09's words in all four of its places.
  - Item 15 names the founder (Tyler Williams), the co-founder's relay, the date and the time (about 02:05 UTC). It quotes his words exactly as the lane log records them, and records the co-founder's approval of the wording.
  - Its quotes of PRD 13 and ADR 0042 match those documents.
- **The fix round** (0e56e01 to b7e15e8): all ten dispositions hold in the code, and no test was weakened.
  - One assertion became exact: the case must be at `awaiting_response`, where before it only had to be not resolved.
  - LED-13's period check no longer uses the ledger's own functions to check themselves; it sums each period in plain SQL.
  - I re-ran four of the fix round's mutants. Each failed exactly where the fix round said:
    - the period's last day left out: the property fails at its new line, with the same counterexample;
    - the practice's period figures ignoring the end date: LED-13 fails, 12.00 against 30.00;
    - recovered counting approvals: LED-13 fails, 30.00 against 60.00;
    - an adjustment counted as the line's cash: only the new adjustments-alone check test fails (1 of 51).
  - `matches()` reads 13 of the table's 20 columns, and its comment names the other 7 correctly.
- **CI on f4d125b:** all 22 check runs finished. 21 succeeded, and `notify` was skipped by design. The four required checks are green: `all green`, `mutation`, `screening-capacity gate` and `approval-of-record` (both of its runs).
  - **Mutation:** the changes job chose only the money-ledger shard, because the ledger is "affected by `totals.test.ts`". The shard's canary got 5 of 5 on Node 24.22.0. The gate passed with exactly the local scores.
  - **Database tests:** 9,049 passed and 1 skipped, against the base's 9,040 and 1 (push run 40223130551), so +9 as designed.
    - Each shard ran the same files as on the base, with matching file lists: 30, 30, 29 and 29, 118 in all.
    - Shard 2 runs `ledger.db.test.ts` and gained 8 tests. Shard 3 runs `ledger-oracle.db.test.ts` and gained 1. Shards 1 and 4 are unchanged.
  - **Unit tests:** 4,996 passed and 1 skipped, against the base's 4,988 and 1, so +8.
    - One is the new LED-13 property.
    - The other seven come from an existing test that parses every synthetic 835 once each; the 7 new LED-12 835s add one case each.
    - I confirmed this two ways: the list of test names differs from the base only by the property, and the parse test shows the seven LED-12 files.
  - **The 835 oracle:** pyx12 agrees with all 637 synthetic 835s, 7 more than the base's 630, so the LED-12 files are included. The oracle also fails on any 835 that no fixture declares.
  - **Timing:** `all green` passed 13 min 10 s after the run started. The PR could merge 18 min 51 s after the start, once the capacity gate finished.
- **The PR description's rule-6 section** now says the branch merged de8f9b5 cleanly, with parents b7e15e8 and de8f9b5. Both statements are true.
  - Its six-file list of files both sides changed is exact.
  - PR #42 is still at 13f59b1, and it still conflicts only in `consumer.db.test.ts`, against both this head and the base.

**One should-fix (the PR description; no code change):**
- **The unit-test count is wrong in three places.**
  - What changes says "1 more unit test". The fix-round table says "The base had 4,663". The 0e56e01 table says "(base 4,663, so +1: the LED-13 property)".
  - CI runs 8 more unit tests, as on this head (above). It was +8 at 0e56e01 too: base 9c57d2d 4,658 + 1 skipped, against 0e56e01's 4,666 + 1.
  - So 4,663 was never a measured base. It came from the list of test names, which counts the 835 parse test once.
  - **Fix:** say 8 more unit test runs: one new test, plus the parse test's seven new LED-12 cases. State the base as 9c57d2d's 4,658 passed and 1 skipped on CI, or 4,659 in all.
  - The design's verifier step 3 and its Appendix B expect +1 for the same reason. Count deltas should come from runs, not from the list of test names.

**Four minor notes:**
- **Stale cross-references:** two findings rows (design-review N-3 and test-integrity/N-2) point to a section called "Merging beside PR #44". It is now "Merging after PR #44".
- **CI on this head is not in the description:** it says CI was green on 0e56e01 and b7e15e8. It could add f4d125b's figures above.
- **The capacity run is not in the description:**
  - The screening-capacity workflow measured this PR, because synth's case files are on its watched list.
  - It passed, with the advisory time warning (S4 at 53.1 to 53.8 s against 48 s) and the O9 sizing notice.
  - The base's own push run on de8f9b5 gives the same warnings (worst 53.8 s). So this is the free runner's standing condition (issue #41), not this PR's.
- **Slow runner:** db shard 4 spent 10 min 9 s installing Playwright's system packages, against 2 min 10 s of tests. That is the slow package mirror PR #44's verification also saw, and nothing this PR changes.

**Still to come:** correct the description. Code, tests and CI need nothing more. Then the merge on green checks, as ADR 0063 allows before the founder's own review is required.
