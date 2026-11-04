# Skeptic 3 of 3, PE-B1 (payment-engine review of #96, head 50029e64…)

Status: done. Verdict: not refuted; real; blocking.

## Reproduction (fresh clone /home/user/sk-p4-payment-engine-PE-B1-2 at 50029e64…, removed after)
- Frozen offline install under the heavy lock, rc 0.
- s09: catalog typescript ^6.0.3 -> ^6.0.4, every lockfile typescript key and version moved to 6.0.4 (no 6.0.3 left).
  affected.ts --event pull_request: any=false, packages=[], shards=[];
  "pnpm-workspace.yaml catalog."typescript" (imported by no closure and no tooling)".
- s10: root package.json devDependencies.typescript "catalog:" -> "^6.0.4": any=false, shards=[];
  "package.json devDependencies."typescript" (imported by no closure and no tooling)".
- Base (merge base 43565235…): GLOBAL_INPUTS lists package.json and pnpm-workspace.yaml whole-file, so both
  scenarios run all four packages, all seven shards there. Regression confirmed.
- Reachability: @stryker-mutator/core@10.1.1 dist/src/sandbox/ts-config-preprocessor.js:45, :85
  `await import('typescript')`; core's package.json does not declare typescript; resolved from core's file it is
  node_modules/.pnpm/typescript@6.0.3 via the root's node_modules/typescript link (the root devDependency;
  .pnpm/node_modules has no typescript). No config sets inPlace or tsconfigFile, so the default tsconfig.json
  (root, extends ./tsconfig.base.json) is rewritten in every Stryker run. (The reviewer's stub-typescript canary
  failure was not rerun; the code path and resolution are confirmed directly.)
- Not "already handled": ADR 0066 Part 7 "What it does not bound" names the hoisting limit for a NEW root dependency
  reached through .pnpm/node_modules; this is an existing root devDependency moving, reached by the root link, and
  the ADR and ci.md say nothing runs only when "none of the mutation tooling imports" what moved, which is false here.
- Fix checked: with 'typescript' added to TEST_TOOLING (working tree only), s09 and s10 both give all four packages
  and all seven shards.

## Severity: blocking
The classifier answers "none" for a change every shard's Stryker run loads, a regression from the base, on a trigger
Dependabot's Thursday npm group reaches routinely. Consequence: a breaking or behaviour-changing typescript release
merges with mutation green unmeasured, and the next push run turns every shard red (blocking later money PRs),
or a quieter tsconfig re-serialisation change goes unmeasured.

## Refined fix
1. TEST_TOOLING gains 'typescript' (covers catalog, root specifier and lockfile moves through lockedPackages).
2. Guard test over the installed TEST_TOOLING packages' dist: every bare import()/require()/from target is declared
   (dependencies, peer, optional) in that package's manifest, or is in TEST_TOOLING, or is on a reasoned allowlist
   (json-schema: types only; svelte: instrumenter, .svelte files only, none in the repo).
3. CI-27 fixture: a catalog typescript move and a root devDependencies.typescript move are global (all seven).
4. ADR 0066 Part 7 and docs/runbooks/ci.md:194-197: name typescript as test tooling (Stryker's tsconfig rewrite),
   and note the undeclared-import guard beside the hoisting limit.
