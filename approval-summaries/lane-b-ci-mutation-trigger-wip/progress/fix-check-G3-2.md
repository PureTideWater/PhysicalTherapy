# Verifier round 2, G3 (documents and wording)

Started 2026-11-04. Clone /home/user/fx-p4-G3-2 (read only).

## Checks
- Clone at 05d3291b..., same as the WIP ref; co-001/ci-mutation-trigger still 50029e64... on origin. Install --frozen-lockfile exit 0.
- N51 source claim: core 10.1.1's ts-config-preprocessor.js has `await import('typescript')` at lines 45 and 85, skipped when inPlace; core's manifest declares no typescript; it resolves to .pnpm/typescript@6.0.3, the root's own. Matches ADR and ci.md.
- Scenarios (local throwaway commits on 05d3291b..., reset after each; log scratchpad/p4/logs/fix/G3-2/scenarios.log), affected.ts --event pull_request:
  - typescript moved in the catalog, the root manifest, tools/package.json: all four, 7 shards, reason "(the test tooling, every package)". Matches ADR N51 and ci.md.
  - typescript-eslint catalog move and lockfile move: none (harmless, as the TEST_TOOLING comment says).
  - root .gitattributes linguist-only line; nested packages/pricing/src/.gitattributes: all four "(a global input, every package)". apps/.gitattributesx: none. Matches N56 and ci.md.
  - changed path with LF + ::warning, DEL under fixtures/golden, U+0085, U+2028: all four, JSON-quoted, \u007f/\u0085/  escaped, 0 lines starting with ::. café.md and plain doc: none. Matches N52, ci.md, CI-27.
  - workspace userAgent: all four ("a key no table lists"); .npmrc user-agent: all four. Matches N54 and runtime.ts comment.
  - lockfile-only typescript first try renamed snapshot keys only (importer version left): none, which is a flawed scenario, not a finding; rerun with importer versions moved (scenarios2.log).
- Line length: lines over 120 chars are 42 (ci.md) and 110 (ADR) at both 50029e64... and the head; no added line over 120. The repair report's "17 and 32" figures are counted some other way; the claim "same as at 50029e64" holds.
- PE-N1: no stryker/*.config.mjs or README says `pnpm stryker run`; ci.md:651 still names it on purpose as the root script that does not run as CI does. stryker.test.ts holds the four comments.
- Lockfile-only typescript move, importer versions moved too (scenarios2.log): all four, "pnpm-lock.yaml moves typescript@6.0.3, typescript@6.0.4". N51 "or the lockfile" holds. yaml lockfile move: all four.
- FINDING (should): the repository's own replay figures are stale after C-G1 (and possibly B1). ADR 0066 Part 7 "Measured", the replay bullet, still says "full runs 22 -> 15 ... and no package widened or lost on any" and "about 296.9 runner-minutes" saved, while N56 in the same Part says #46 now runs every shard. docs/product/reconciliation-001.md line 665 (unchanged on this branch) says "full runs drop from 22 to 15 and none is widened" and "the changes job checks its own runtime before it decides" (now the gate job too, and the checkout). Repair 1 called only the PR description's figures pending.
- N47 text unchanged, N55 restates it ("N47 reads: ..."), the notice-amends-notice pattern; acceptable.
- runtime.ts (heavy.log): good args exit 0 with ", at the commit tested"; --pnpm 10.0.0, --pnpm "", --commit 50029e64..., --commit "" each exit 1 with the ::error:: ci.md and N54/N55 name. workflows.test.ts holds both jobs' step text (RUNTIME_CHECK). Nit: ci.md says it prints "then that this is the pinned one ... It also prints checkout: commit"; the checkout line in fact comes before the verdict line.
- npm_execpath under `pnpm -s exec`: undefined; user agent pnpm/10.34.8. N54 and runtime.ts comment hold.
- verify-content exit 0; synth --all and watched.ts --write leave no diff.
- Suite at head: tools/stryker + tools/test 35 files, 495/495.
- 50029e64's test files at the head: 455/457; the 2 failures are one assertion, the changes job's exact step list (old `runtime.ts` with no arguments vs the head's `--pnpm ... --commit ...`), the second being the Dependabot-rewrite copy that reruns that test. Stricter, not looser. Working tree restored, git status clean.
- Nit: mutation.yml header comment, a short line ("... (GITHUB_SHA). Stryker runs by") left by the edit.
- Verdict: not resolved as a whole for G3: one should (stale replay figures and runtime sentence in ADR 0066 Part 7 Measured and reconciliation-001.md), three nits. Nothing loosened. Clone removed.
