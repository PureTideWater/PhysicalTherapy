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
