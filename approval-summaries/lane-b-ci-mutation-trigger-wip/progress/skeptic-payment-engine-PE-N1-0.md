# Skeptic 1 of 3: PE-N1 (payment-engine review of #96, head 50029e64…)

Status: done. Fresh clone at 50029e64… checked, then removed.

## Reproduction
- stryker/{money,pricing,ledger,packets}.config.mjs lines 7-8 at the head still say `pnpm stryker run stryker/<pkg>.config.mjs`.
- tools/stryker/stryker.ts header (CI-29) says Stryker runs "never `pnpm stryker` or a bin by name", and the root
  `stryker`/`prestryker`/`poststryker` scripts "stay inert for mutation"; mutation.yml line 27 says the same.
  CI runs `pnpm -s exec tsx tools/stryker/stryker.ts run <config>` (canary step; shards.ts for package configs).
- docs/runbooks/ci.md:642 caveats `pnpm stryker run <config>` as "not as CI does" and gives the by-path form; the
  four config comments carry no caveat. README.md:316 also still cites `pnpm stryker run`.
- The config files are not changed by P4; P4's by-path rule is what makes their comments stale.

## Verdict
Real (not refuted). Comment-only: no effect on the classifier, on which shards run, or on any money-path gate.
Severity: nit.

## Refined fix
In each of the four configs replace the command with
`pnpm -s exec tsx tools/stryker/stryker.ts run stryker/<pkg>.config.mjs` (as CI's shards.ts runs it), optionally
noting the root `pnpm stryker` script is not the CI path. Consider the same wording at README.md:316.
