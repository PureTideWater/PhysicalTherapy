# Skeptic 2 of 3, PE-B1

Clone at 50029e64… made, offline install ok. Next: reproduce s09 (catalog typescript bump).

## Classifier reproduced (head 50029e64…)
- s09: catalog typescript ^6.0.3 -> ^6.0.4, lockfile specifier and versions moved to 6.0.4: affected.ts says all four packages not affected, shards none, "pnpm-workspace.yaml catalog."typescript" (imported by no closure and no tooling)".
- s10: root package.json devDependencies.typescript catalog: -> ^6.0.4: same, shards none.
- @stryker-mutator/core 10.1.1 ts-config-preprocessor.js :45 and :85 `await import('typescript')`; core's package.json does not name typescript; resolved from that file it reaches node_modules/.pnpm/typescript@6.0.3 (the root devDependency).
Next: canary with a stub typescript.

## Stryker reaches typescript (reproduced)
- Canary at 50029e64… with --logLevel debug: two "TSConfigPreprocessor Rewriting file" lines (the run itself then failed on debug logging a circular ProjectFile, unrelated). The preprocessor runs because no config sets inPlace and the default tsconfigFile, the root tsconfig.json, exists.
- Canary at the default log level with the real link: rc 0, verdict 5 of 5 as expected.
- Root node_modules/typescript swapped for a stub whose parseConfigFileTextToJson throws: rc 1, "Unexpected error occurred while running Stryker Error: stub typescript". Link restored afterwards (.pnpm/typescript@6.0.3).
- manifests.ts mirror() (:271-275) treats a name as global only when it matches TEST_TOOLING or globalNames; typescript is in neither, so it lands in inert.

## Verdict
Not refuted. Severity: blocking. The PR's central claim is that the classifier fails closed on what every shard loads; here it fails open on a package every shard's Stryker run imports, and the inert verdict is written into ci.md and ADR 0066 Part 7. The worst case is a red push run after the merge, not a silently wrong score, but the required check passes on a change it should test.
Refined fix: add 'typescript' to TEST_TOOLING (an exact name, so typescript-eslint is not caught); add a guard test that scans the installed TEST_TOOLING packages' dist for bare import()/require()/from specifiers and requires each one to be declared in that package's manifest, in TEST_TOOLING, or on a reasoned allowlist (json-schema type-only, svelte for .svelte only); add catalog and root-devDependency typescript cases to the CI-27 fixture expecting every package and shard; correct ci.md:194-197 and ADR 0066 Part 7's inert list.
Clone removed after the run.
