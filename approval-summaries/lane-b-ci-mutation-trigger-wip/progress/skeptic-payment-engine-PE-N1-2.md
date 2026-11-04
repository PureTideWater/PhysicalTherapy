# Skeptic 3 of 3, PE-N1 (#96 payment-engine review), head 50029e64…

Fresh clone /home/user/sk-p4-payment-engine-PE-N1-2 at 50029e64… (removed after).

Reproduction:
- stryker/{money,ledger,pricing}.config.mjs:7 and packets.config.mjs:8 say `pnpm stryker run stryker/<pkg>.config.mjs`.
- tools/stryker/stryker.ts header and mutation.yml:27 say Stryker runs by path, "never `pnpm stryker` or a bin by name"; root package.json:39 keeps `"stryker": "stryker"`, inert for CI.
- docs/runbooks/ci.md:642 caveats the root script ("not as CI does") and gives the by-path form; the configs do not.
- Also README.md:316 names `pnpm stryker run stryker/packets.config.mjs` as how the packets run "now" (not in the finding).

Verdict: not refuted; real, documentation only, nit. No CI or gating effect: shards.ts and the canary step run by path; the comments only steer a local run through the root script and bin by name.
Refined fix: change the four config comments to `pnpm -s exec tsx tools/stryker/stryker.ts run stryker/<pkg>.config.mjs` (as tools/stryker/shards.ts runs them), and the same for README.md:316.
