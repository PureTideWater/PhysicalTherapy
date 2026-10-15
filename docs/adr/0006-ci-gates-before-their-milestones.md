# 0006. Every CI command exists from milestone 0; placeholders fail closed

- **Status:** accepted
- **Date:** 2026-10-15
- **Deciders:** founder (engineering)
- **PRD sections:** 17 (milestone 0), 18 (testing and release), `.github/workflows/ci.yml`

## Context

`ci.yml` runs every gate from the first pull request (`synth --all`, `test:golden`, `test:oracle`,
`db:migrate`, `test:db`, `test:e2e`, `cdk:diff`, `stryker run`), but most of what those gates test arrives in
later milestones. A placeholder that always passes would let real work land ungated later.

## Decision

- **Placeholders pass only while there is nothing to check.** `pnpm verify-content` fails if any file other
  than a README exists in `content/drafts` or `content/outgoing` before the checker exists; `pnpm test:oracle`
  fails if any X12 file exists under `fixtures/synthetic` before the pyx12 comparison exists. `pnpm synth`,
  `db:migrate`, `db:seed` and `release:*` accept their real arguments, change nothing and say so.
- **`pnpm test:golden`** runs the Vitest `golden` project with `--passWithNoTests`; `--report` sets
  `TP_GOLDEN_REPORT` to `fixtures/golden/.report` for the golden tests to write into.
- **Coverage gates are live now.** `pnpm test` runs with coverage, and 100% branch thresholds apply per glob to
  `packages/pricing/src`, `packages/ledger/src`, `packages/edi835/src` and `packages/db/src/authz`, where the
  authorization helpers will live.
- **`pnpm cdk:diff`** asks STS for the caller identity (one attempt, ten-second timeout). With working
  credentials it runs `cdk diff tp-staging`; otherwise it synthesizes every stack and prints that the diff
  against staging needs credentials, so the step proves the CDK app synthesizes on every pull request.
- **`pnpm test:e2e`** builds the web app and serves the standalone `server.js` the container runs, then runs
  the Playwright smoke test. It uses Playwright's Chromium where installed (`PLAYWRIGHT_BROWSERS_PATH`) and the
  runner's Google Chrome (`channel: 'chrome'`) where not, so CI downloads no browser.
- **`pnpm stryker run`** mutates `packages/pricing/src`, `packages/ledger/src` and
  `packages/packets/src/verifier` with the Vitest runner, breaking below 85%. The runner plugin is named
  explicitly because pnpm does not place it beside `@stryker-mutator/core`.

## Consequences

- Milestone 2 must land fixtures and the oracle comparison together; part B must land the checker with the
  first draft.
- The authorization helpers' location is fixed by the coverage glob; code elsewhere is not gated.
