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
