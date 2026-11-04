# Completeness critic over #96 reviews (head 50029e64…)

Clone: /home/user/rv-p4-critic (read only, removed at end). Merge base 43565235…
Logs: /tmp/claude-0/-home-user-PhysicalTherapy/84980be8-4825-5e0c-971b-13455480b76c/scratchpad/p4/logs/critic/

## Checked
- (started) clone made, diffstat read; offline frozen install ok.
- Read manifests.ts in full, affected.ts diff, mutation.yml diff.
- #86 trial merge (origin/co-001/wip-ci-images-digest 5c01f150… into 50029e64…, worktree /home/user/rv-p4-critic-merge, uncommitted): conflicts only in ADR 0066 and reconciliation-001.md (docs). tools/test/workflows.test.ts auto-merges; vitest run on it: 126/126 pass (logs/critic/merge86-workflows.txt). The runtime step has no expression and writes no output, so #86's value table (T3/T6 rows, the affected step fingerprint 4d1e744c…) is untouched. No code hazard; doc conflicts only.
- Read the PR description (pull_request_read get #96), ci.md additions, runtime.ts, gate.ts and verdict.ts diffs, stryker.ts.
- Baseline suite tools/stryker + tools/test/workflows.test.ts: 15 files, 284 tests green (78 s).
- Mutant batch C01-C15 running (script scratchpad/p4/critic-scripts/mut.py; results logs/critic/mut-results.txt). Each mutant restored with git checkout after its run.
- Checked and sound so far: Stryker's project reader has no .gitignore input (ALWAYS_IGNORE plus ignorePatterns only); the instrumenter's babel runs with configFile:false/babelrc:false, so no babel config file is an unlisted input; the root depends on no workspace package, so a workspace package's `bin` cannot reach the root node_modules/.bin; affectedSince diffs from the merge base.

- Mutants C01-C15 done (logs/critic/mut-results.txt; suite tools/stryker + tools/test/workflows.test.ts, 284 tests). Killed: C03, C08, C09, C10, C11, C12, C14. Survived: C01 (catalog `node` rule), C02 (tools/package.json workspace: entry the tooling imports -> owners), C04 (non-string specifier inert), C05 (workflow comments-only check without source text), C06 (C1 controls dropped), C07 (readWhole data-entry rule), C13 (packages value/source compare), C15 (equivalent: falls to "a key no table lists"). None of these is in S2's list. Tree clean after each.
- Probes on the repo graph (logs/critic/probe.txt, probe2.txt): package tsconfigs reach their packages (sound); nested src/package.json gives none, and money's tests are unchanged with {"type":"commonjs"} there (no effect, dropped); `.nvmrc`, `vitest.config.ts`, `.editorconfig` none (not read by a mutation step: setup-node is given node-version); lockfile-only integrity/tarball edit of decimal.js gives none, but toolchain:check's lockfileResolutionRule refuses a non-npmjs tarball and a frozen install fails a wrong integrity (loud, dropped); `timeout-minutes: 5` -> `0x5` (same parsed value) gives all four at the head, and would be inert under C05.
- `.gitattributes`: local commit 671d1e89… then 9e21c2fb… (never pushed) adding eol=crlf rules; affected.ts --base 50029e64… printed `shards: none` both times (ga-affected.txt, ga2-affected.txt). A fresh detached worktree checkout of 9e21c2fb… has CRLF in docs/product/unpriced-reasons.md and money/pricing sources; vitest on packages/pricing, packages/money and packets words.test.ts: 2 failed (pricing unpriced-reasons.test.ts, packets words.test.ts), 409 passed (ga2-tests.txt). The packets golden .txt case alone passed (its test normalises CRLF).
- #84: PE-S1 skeptics already did the trial merge; nothing further.

## Gaps
- G1 (should): `.gitattributes` (root or nested) is in no global input, but actions/checkout applies it to every file every shard reads (design §2 rule (b)). Evidence above. Mitigation: the unit job sees the same checkout, so loud breaks are blocked by `all green`; a quiet change in bytes is not. Fix: add `.gitattributes` and `**/.gitattributes` to GLOBAL_INPUTS and ADR Part 7's list, with an affected.test.ts case.
- G2 (should, joins S2): eight more fail-closed rules no test kills: C01, C02, C04, C05, C06, C07, C13 (C15 equivalent). C05 is the strongest: the comments-only shortcut's source-text compare is what keeps a scalar rewritten to the same parsed value (0x5 for 5) from being called inert.
- G3 (nit): the PR description says the 'fewer than its owners' case asserts both readings of 'read whole' (an import, a data entry); it asserts only the import (C07 survives). No DATA_FILES glob matches a package.json today, so the gap is latent.
- G4 (nit): ci.md's all-four list names "`tools/package.json`'s module fields", but the code (and manifests.test.ts:263) gives its owners for `name` and `exports` unless a global file imports that name.
- #86: no hazard (see Checked).
- Cleanup: clone, both worktrees and the local probe commits removed.
