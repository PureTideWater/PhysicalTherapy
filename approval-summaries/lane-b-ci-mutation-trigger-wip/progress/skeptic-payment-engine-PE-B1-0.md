# Skeptic 1 of 3: PE-B1 (typescript bump runs no shard), #96 at 50029e64…

Status: done. Verdict: not refuted, the finding is real. Severity: blocking.

## Reproduction (fresh clone /home/user/sk-p4-payment-engine-PE-B1-0, removed after)
- Offline frozen install under the heavy lock, rc 0.
- s09 (local commit): catalog typescript ^6.0.3 -> ^6.0.4, lockfile moved to match. Ran `affected.ts --event pull_request --base 50029e64…`:
  all four packages "not affected", shards none, inert line `pnpm-workspace.yaml catalog."typescript" (imported by no closure and no tooling)`.
- s10: root devDependencies.typescript "catalog:" -> "^6.0.4". Same result: none, inert `package.json devDependencies."typescript"`.
- Mechanism: @stryker-mutator/core 10.1.1 dist/src/sandbox/ts-config-preprocessor.js:45 and :85 `await import('typescript')`; core's package.json does not declare typescript. createRequire from that file resolves to node_modules/.pnpm/typescript@6.0.3 (the root devDependency). base.mjs sets no inPlace and tsconfig.json exists at the root, so preprocess() runs on every non-inPlace Stryker run, i.e. every shard.
- Reachable: Dependabot's npm groups ignore typescript majors only, so a typescript patch or minor arrives as a routine catalog move.
- ci.md:194-197 says "nothing when no closure and none of the mutation tooling imports what moved". The mutation tooling does import it, so the doc claim is also wrong.

## Fix check
- With 'typescript' added to TEST_TOOLING (affected.ts:129), the same s09 diff gives all four packages and all seven shards
  ("catalog.\"typescript\" (the test tooling, every package); pnpm-lock.yaml moves typescript@6.0.3, typescript@6.0.4").

## Severity reasoning
A "none" verdict for an input every shard's Stryker run loads breaks the PR's fail-closed claim, and that is the central risk. The failure would show up loudly on the next push run, not as a silent survivor. Even so, the tsconfig typescript re-serialises is the one the sandboxed tests compile under, so it is a real input to the run. The fix is small. Blocking.
