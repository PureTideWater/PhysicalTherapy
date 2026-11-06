# Skeptic 1 of 3: ci-tooling-security B1 (typescript judged inert)

Clone: /home/user/sk-p4-ci-tooling-security-B1-0 at 50029e64… (offline frozen install). Removed after.

## Reproduction
1. Local commit on 50029e64…: catalog `typescript: ^6.0.3` -> `^6.0.2`, lockfile 6.0.3 -> 6.0.2.
   `tsx tools/stryker/affected.ts --base 50029e64…` printed every package "not affected",
   `read and affecting no package: pnpm-workspace.yaml catalog."typescript" (imported by no closure and no tooling)`,
   `shards: none`. Log: scratchpad/p4/logs/skB1-0-affected.txt.
2. Replaced the clone's node_modules/typescript symlink (not the store file) with a stub that throws.
   `tsx tools/stryker/stryker.ts run tools/stryker/canary/stryker.config.mjs` exited 1:
   `ERROR Stryker ... Error: PLANTED typescript loaded by Stryker core`, stack through
   TSConfigPreprocessor.rewriteTSConfigFile (ts-config-preprocessor.js:45) <- preprocess:36.
   Log: scratchpad/p4/logs/skB1-0-planted.txt.
3. Why it is reached on every shard: runs start at the repo root (stryker.ts spawn cwd: root), root tsconfig.json
   exists, no config sets inPlace (stryker/base.mjs, canary config), so the preprocessor parses it with typescript.
4. Stryker core 10.1.1 declares no typescript (deps/peers); `require.resolve('typescript')` from core resolves
   node_modules/.pnpm/typescript@6.0.3 via the root symlink (no .pnpm/node_modules hoist). The only undeclared bare
   dynamic import in core dist is typescript (execa and @stryker-mutator/api are declared).
5. Not handled elsewhere: TEST_TOOLING = vitest, @vitest/*, @stryker-mutator/*, fast-check, tsx; the lockfile
   closure of tooling snapshots does not hold typescript; the purity tests that import typescript are EXCLUDED from
   mutation runs (vitest.mutation.config.ts:52,56), so no closure imports it.

## Verdict
Not refuted. Real and reachable. Severity: blocking (breaks design §2 rule (b), a step reads it; the required gate
passes a tooling move it is specified to run on). Effect mostly loud (later runs fail), but the tooling-move commit
itself merges untested, the same class TEST_TOOLING exists to catch.
