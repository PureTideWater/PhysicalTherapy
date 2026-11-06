# Skeptic 2 of 3: payment-engine PE-N1 (PR #96, head 50029e64…)

Status: done. Fresh clone at 50029e64… (merge base 43565235…), removed after.

## Reproduction
- stryker/{money,ledger,packets}.config.mjs:7-8 and pricing.config.mjs:7 still say `pnpm stryker run stryker/<pkg>.config.mjs`.
- package.json:39 keeps `"stryker": "stryker"`; no mutation.yml step runs it. CI runs configs by path via tools/stryker/shards.ts:45 -> runStryker (tools/stryker/stryker.ts), and stryker.ts:9-12 says root/pre/post scripts are inert for mutation.
- The PR touched docs/runbooks/ci.md (642 caveats "not as CI does") but none of stryker/*, README.md or package.json.
- Also stale and missed by the finding: README.md:316-317 (`pnpm stryker run stryker/packets.config.mjs`).
- docs/adr/0006 line 34 also names `pnpm stryker run`, but it is a historical decision record; leave it.

## Verdict
Not refuted. Real, nit: doc drift only. The root script still runs Stryker locally, so nothing breaks and no merge is let through; a local run just bypasses the by-path resolution CI uses.

## Refined fix
Point the four config comments and README.md:316-317 at `pnpm -s exec tsx tools/stryker/stryker.ts run stryker/<pkg>.config.mjs` (as CI does; tools/stryker/shards.ts <shard> for a whole shard). Leave ADR 0006 unchanged.
