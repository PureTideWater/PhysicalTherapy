# Skeptic 2 of 3: ci-tooling-security B1 (typescript judged inert)

Clone: /home/user/sk-p4-ci-tooling-security-B1-1 at 50029e64… (offline frozen install, --ignore-scripts). Removed after.

## Reproduction
1. Local commit: catalog `typescript: ^6.0.3` -> `^6.0.2`, lockfile typescript@6.0.3 -> 6.0.2 (54 lines).
   `tsx tools/stryker/affected.ts --base 50029e64…`: all four packages "not affected",
   `read and affecting no package: pnpm-workspace.yaml catalog."typescript" (imported by no closure and no tooling)`,
   `shards: none`. Log: scratchpad/p4/logs/skB1-2-affected.txt.
2. Instead of a planted stub, a Node resolve hook (--import, logs every bare `typescript` resolution) during
   `tsx tools/stryker/stryker.ts run tools/stryker/canary/stryker.config.mjs` (rc 0): one hit, from
   @stryker-mutator/core dist/src/sandbox/ts-config-preprocessor.js -> .pnpm/typescript@6.0.3/.../typescript.js,
   in the Stryker main process. Log: scratchpad/p4/logs/skB1-2-tstrace.txt, skB1-2-canary.txt.
3. Reached on every shard: no inPlace and no tsconfigFile override in stryker/base.mjs or the canary config, root
   tsconfig.json exists, so preprocess() parses it (parseConfigFileTextToJson, resolveProjectReferencePath).
4. Core 10.1.1 declares typescript in neither dependencies nor peers. It is the only undeclared bare import in core's dist.
5. Not covered: TEST_TOOLING lacks it; lockedPackages follows only declared edges from tooling and closures.

## Mitigating points (for severity)
- The design (§2, after rule (b)) names phantom requires via a root dependency as the lockfile rule's limit, on
  Part 7's revisit list. So the class is a known limit. This instance is concrete and known now, and rule (b)
  ("no step reads it") is plainly false for it.
- The effect fails closed: a typescript whose JS API breaks makes later mutation runs error out (red), and it does
  not let a mutant through silently. The cost is that the run is charged to the wrong PR, and the tooling-move PR
  merges with no run (Dependabot moves typescript often; 7.x changes the JS API).

## Verdict
Not refuted. Real and reachable. Severity I would assign: should (fix before merge). Fix: add 'typescript' to
TEST_TOOLING, which also brings its lockfile snapshots into the tooling closure. Add a guard test over installed
tooling dist files that counts dynamic import() as well as static import and require, and treats optional peers as
undeclared. Record it under R4 / Part 7.
