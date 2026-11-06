# Verifier round 3, G3 (documents and wording)

Started 2026-11-04. Clone /home/user/fx-p4-G3-3 (read only).

## Checks
- Clone at f23850fa..., same as the WIP ref; co-001/ci-mutation-trigger still 50029e64... on origin. Repair 2 is 6 commits over 05d3291b.... Install --frozen-lockfile exit 0.
- runtime.ts (logs G3-3/runtime.log): off a runner, no flags / one flag / both exit 0; --pnpm 10.0.0 and --commit 50029e64... exit 1 with the ::error:: lines ci.md's rows name. GITHUB_ACTIONS=true: no flag, each one missing exit 1 with "The runtime check runs without --pnpm \"$(pnpm --version)\" / --commit \"$GITHUB_SHA\" on a runner"; both good exit 0. Output order runtime, pnpm --version, checkout, verdict matches ci.md. Both jobs' step text matches (mutation.yml:74, :201), step name "The runtime is the pinned one" matches ci.md.
- affected.ts (G3-3/affected.log), throwaway commits reset: gitlink at packages/a\n::warning ...: all four, JSON-quoted, 0 lines starting ::/##[ on stdout+stderr; doc-only: none; --base with LF+::warning: exit 1, git's message printed, second line quoted, 0 command lines; nested packages/pricing/.gitattributes: all four "(a global input, every package)". Every child_process use in affected.ts goes through runGit; its imports spawn nothing. ADR control-character bullet and N52 addendum hold.
- ci.md troubleshooting rows: strykerBin's three messages (stryker.ts:39/43/48) match the row; runtime and checkout rows match runtime.ts text.
- FINDING (should): ADR 0066 Part 7 Measured (line 1864) says "#46, which edits only the root `.gitattributes`". gh api: #46 changed 377 files (ADR 0068, packages/db/functions/*.sql, fixtures, packages/compliance/src/controls.ts ...); it adds the root .gitattributes, its only global or money-path change. N56 (line 1956) and reconciliation-001 ("a root .gitattributes edit") are fine.
- FINDING (nit): ci.md 479-481 "So does every line of an error that holds one" reads as if such an error affects all four (it fails the job, exit 1), and omits that printable also quotes a line starting `::` or `##[` with no control character (ADR says so).
- FINDING (nit): ci.md 516-517 ragged wrap left by the edit: "the commit tested"). Every shard's canary verdict names its" / "runtime and the commit it checked out".
- Line lengths: ci.md 49 lines over 120 chars vs 45 at 50029e64...; the 4 extra are the new troubleshooting table rows; no added prose line over 120 (reconciliation-001 is one line per paragraph throughout).
- Suite at head (unit, tools/stryker + tools/test): 35 files, 499/499.
- 50029e64's test files at the head (affected, manifests, runtime, stryker, workflows tests swapped in): 455/457; the 2 failures are the changes job's exact step list (old `runtime.ts` with no flags vs the head's `--pnpm ... --commit ...`) and its Dependabot-rewrite copy, as in round 2. Stricter, not looser. Test files restored; git status clean.
- verify-content exit 0. Repair 2 changed no test-matrix row or fixture; CI-29 still describes both jobs' checks correctly (it does not mention that the flags are required on a runner, which is acceptable).
- Verdict: not resolved for G3. One should (the ADR's "#46, which edits only the root .gitattributes"; #46 changed 377 files) and two nits (the ci.md error-quoting sentence, a ragged wrap). Nothing loosened. Clone removed.
