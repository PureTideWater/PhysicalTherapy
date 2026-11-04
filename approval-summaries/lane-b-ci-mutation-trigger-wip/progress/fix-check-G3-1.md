# Fix check G3, round 1 (documents and wording)
Started 2026-11-04. Clone /home/user/fx-p4-G3-1 (read only). Target WIP head 30efef6d…

## Checks
- Clone at 30efef6d… confirmed (HEAD = origin WIP).
- Read the doc/config diff 50029e64…30efef6d… (ADR 0066 Part 7, ci.md, test matrix, synth, README, four stryker configs, mutation.yml) against the code diff (affected.ts, manifests.ts, runtime.ts, stryker.ts).
- ADR S2 consequence says "Each was shown killing its mutant (M01 to M16)": the build's logs cover M01–M05 and M08–M16; M06 (postinstall) and M07 (prepublishOnly) were controls already killed at 50029e64, not rerun. M-numbers are defined only in ops files, not in the repo. Candidate nit.
- Install (frozen lockfile) exit 0.
- N51 claims: core's package.json declares no typescript (grep count 0); ts-config-preprocessor.js has `import('typescript')` at two lines. Confirmed.
- N53 claim: node_modules/.bin/tsx sets NODE_PATH to include <root>/node_modules/.pnpm/node_modules. Confirmed.
- N54 claim: `pnpm -s exec node` sees npm_execpath undefined, user agent pnpm/10.34.8. Confirmed.
- C-G4 ci.md wording on tools/package.json name/exports matches classifyPackage (loadedName → global; else owners). Confirmed by code read.
- ci.md "catalog, root or tools/package.json move of typescript runs every shard": tested in manifests.test.ts:177 (three cases). Will confirm by run.
- C-G3 corrected wording: the data-entry half matches manifests.test.ts:601 (synthetic DATA_FILES glob over apps/site/package.json; script edit → ledger). The import half is NOT "the by-path-loaded test's case": it is packages/ledger/src/index.ts importing '../package.json' in the "fewer than its owners" test (manifests.test.ts:590–598). Issue (should): fix the parenthesis.
- No stale `pnpm stryker run` in configs/README; ci.md:648 keeps it deliberately as the people's root script. OK.
- Gate job's runtime step: `if: run == 'true'`, after install, before download-artifact and the gate; matches ADR N55, ci.md, CI-29. OK.
- New lines in ci.md (4) and ADR (1) exceed the 120-column wrap the files otherwise keep. Nit.
- Head suite (tools/stryker + tools/test) at 30efef6d…: 35 files, 492/492 passed (logs/fix/G3-1/head-suite.log).
- 50029e64…'s five changed test files run against head source: 455/457; the 2 failures are the one exact-command assertion of the changes job's runtime step (old `runtime.ts` without `--pnpm/--commit`), and the Dependabot-copy test re-running that same assertion. A deliberate change of the run line, not a loosening (logs/fix/G3-1/old-tests-at-head.log).
- Probe (logs/fix/G3-1/probe.log), affected() over the real tree: `.gitattributes` and `packages/pricing/src/.gitattributes` → all four; `docs/gitattributes.md`, `docs/.gitattributes-notes`, `.gitmodules` → none (as N56 says). Paths with LF+`::warning`, U+2028, DEL, U+0085 → all four, printed JSON-quoted with \n,  , \u007f, \u0085; `docs/a b.md`, `docs/é.md` → none.
- Probe checkRuntime: the strings ci.md quotes (`runtime: pnpm --version prints 10.34.8`, `checkout: commit <sha>`, "The checkout is not the commit tested") are what it prints; pnpm other/empty, commit other/empty → status 1; matches → 0.
- Nit: a `.gitattributes` reason prints "(mutation tooling, every package)", the generic global-input label; ci.md files it under what the runner reads.
- CI-27 (`.gitattributes`) asserted by affected.test.ts:833 (root and three nested); CI-29 gate step asserted by workflows.test.ts (RUNS.mutation includes RUNTIME_CHECK, order install → runtime → gate). OK.
- PE-N1 probes: ledger config comment back to `pnpm stryker run` → test red (exit 1); README back to `pnpm stryker run` → red; harmless rewording of the comment's tail → green.
- `pnpm synth --all` leaves no diff; CI-27/CI-29 matrix rows equal their fixture assertions; verify-content exit 0.
- M06 (postinstall dropped) and M07 (prepublishOnly dropped) run myself against head's manifests+affected tests: both KILLED (6 and 3 failed; logs/fix/G3-1/mut-M06.log, mut-M07.log). So the ADR's 'M01 to M16' holds in substance; the M-numbers stay undefined inside the repo (nit).
- Installed-tooling walk approximated outside the test: 219 packages, so the ADR's "about 200" holds. N53's child-process test exists (stryker.test.ts:90). N54's userAgent claim: not in WORKSPACE_INERT_KEYS, test manifests.test.ts:561. OK.
- Clone removed.

## Result
Resolved: yes; nothing loosened. Issues: 1 should (C-G3 corrected wording mislabels the import half), 3 nits (ADR mutant IDs undefined in the repo; unwrapped long lines in ci.md and the ADR; `.gitattributes` reason label "mutation tooling"). PE-S1 pending by design.
