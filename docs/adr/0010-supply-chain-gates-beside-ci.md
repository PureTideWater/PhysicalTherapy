# 0010. Run the image, SBOM, license and dependency-update gates in their own workflows beside ci.yml

- **Status:** accepted; amended 2026-10-25 by [0066](0066-run-ci-as-parallel-jobs-behind-one-gate-measure-mutation-on-every-money-package-move-the-browser-and-runner-together-and-pin-every-dependency.md), Part 1: the image and license gates run as ci.yml jobs under its `all green` gate ("Amendment (2026-10-25)", below); amended 2026-10-26 by its Part 2: every action pinned by SHA and held by rule, and Dependabot's groups, days and cooldowns (marked below)
- **Date:** 2026-10-15
- **Deciders:** founder (engineering)
- **PRD sections:** 15 (CI row), 16 (dependency and image hygiene), 17 (milestone 0: "CI with every gate from section 18"), 18 (layers: security and performance; continuous integration)

## Context

Section 18 puts a container scan on every pull request, and section 16 adds weekly dependency updates, a
software bill of materials per release and a license allowlist, all as CI gates. `.github/workflows/ci.yml` is
the plan's own workflow, imported verbatim from the Starter kit; it has `pnpm audit --prod` and the gitleaks
secret scan but no container scan, SBOM or license step, and no performance step. It is not edited.

## Decision

- **ci.yml's `images` job** (amended 2026-10-25, ADR 0066; it was `.github/workflows/supply-chain.yml`, beside
  ci.yml) runs on every pull request and every push to the build branch. It builds `apps/web/Dockerfile` and
  `apps/worker/Dockerfile` and scans each image with Trivy, failing on any HIGH or CRITICAL finding that has a fixed
  version (`ignore-unfixed`: a finding with no fix cannot be acted on in a pull request; it is reported in the table and
  tracked to closure). ci.yml's `static` job runs `pnpm licenses:check`. Both are under `all green`, the one check the
  ruleset requires of ci.yml.
- **`pnpm licenses:check`** (`tools/check-licenses`) reads `pnpm licenses list --prod --json` and fails on any
  production dependency whose SPDX expression the allowlist (`tools/check-licenses/allowlist.json`) does not
  satisfy. The allowlist is permissive licenses only (MIT, ISC, Apache-2.0, BSD, 0BSD, CC0, Unlicense, BlueOak,
  Python-2.0, and CC-BY-4.0 for data such as caniuse-lite). A package outside it needs a named exception with a
  written reason; the only ones are sharp's prebuilt libvips binaries (LGPL-3.0-or-later, loaded dynamically and
  unmodified by Next.js image optimization), which counsel confirms before the first customer release. A stale
  exception fails too.
- **`release.yml`** builds each image, scans it the same way, writes its SBOM (SPDX JSON, by Trivy) and keeps it
  as a run artifact, and only then pushes the scanned image. A failed scan publishes nothing.
- **`.github/dependabot.yml`** opens weekly update pull requests for the pnpm workspace (minor and patch grouped),
  the GitHub Actions in the workflows and both Dockerfiles' base images. Each passes every gate before a person
  merges it. (Amended 2026-10-26, ADR 0066 Part 2: npm in named groups with a three-day cooldown, the actions
  in one group and the base images with compose's PostgreSQL in another, each with seven, on three different days,
  configured on the build branch until launch.)
- **The performance gate** (section 18: "the large fixture: 10,000 claims parse and 100,000 lines price within
  targets; regression fails the build") arrives with the code it measures, as `.github/workflows/performance.yml`
  on pull requests: the parser's throughput with the large fixture in milestone 2, and pricing throughput in
  milestones 5 and 7. It runs the measurement against a committed baseline and fails on a regression beyond the
  target. Until then there is nothing to measure.
- `tools/test/workflows.test.ts` reads the workflow files and checks each gate is wired, in order (no runner or
  Docker daemon exists where the repository is built).

## Alternatives considered

| Option | Why not |
| --- | --- |
| Add the steps to ci.yml | ci.yml is the plan's verbatim Starter kit file |
| Scan only on release tags | Section 18 runs the container scan on every pull request |
| Fail on unfixed findings too | Blocks every pull request on a base-image CVE nobody can fix; the table still shows them |
| A separate SBOM tool (syft) | Trivy already reads the image; one tool to pin and update |
| A copyleft-tolerant allowlist | Section 16 asks for an allowlist; exceptions with written reasons keep each one a decision |

## Consequences

- The action versions are pinned by tag; dependabot proposes their updates weekly. (Amended 2026-10-25: ci.yml's are
  pinned to full commit SHAs with their versions, as the release and capacity workflows' are; ADR 0066. Amended
  2026-10-26: every workflow's actions are, publish-content's included, each held to its release's commit by
  `pnpm actions:check`; ADR 0066, Part 2.)
- The ruleset requires ci.yml's `all green`, which needs the image and license gates with every other ci.yml job (a
  repository setting, outside the code; amended 2026-10-25, ADR 0066: it was the `supply-chain` checks next to `ci`).
- None of these workflows can run where the repository was built (no Docker daemon, no GitHub runner); their
  first real run is the first pull request.

## Revisit when

A scan finding needs a waiver, a new license appears in production dependencies, or milestone 2 adds the
performance workflow.

## Amendment (2026-10-25): the gates run as ci.yml jobs

ADR 0066, Part 1 (`co-001/ci-speed`, combined audit #109, adopted by the founder on 2026-10-20) rewrites ci.yml as
parallel jobs behind one gate, so the reason for a separate workflow, that ci.yml was the plan's verbatim file and not
to be edited, no longer holds, and PRD 18 asks for "one workflow on every pull request". `supply-chain.yml` is deleted:

- the image gate is ci.yml's `images` job, both images in one job (one concurrency slot), the worker built and scanned
  whatever the web image's result, with the same build and the same Trivy scan;
- the license gate is the `pnpm licenses:check` step of ci.yml's `static` job;
- both report through `all green`, so the ruleset requires one check of ci.yml instead of `ci`'s and three of
  `supply-chain`'s (`docs/runbooks/github-governance.md`, step 4A).

What the gates check is unchanged: the same Dockerfiles, severities, `ignore-unfixed` and allowlist. release.yml's build,
scan and SBOM are unchanged. `tools/test/workflows.test.ts` reads the gates in ci.yml.
