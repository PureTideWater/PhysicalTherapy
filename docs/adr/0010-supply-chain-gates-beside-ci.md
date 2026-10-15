# 0010. Run the image, SBOM, license and dependency-update gates in their own workflows beside ci.yml

- **Status:** accepted
- **Date:** 2026-10-15
- **Deciders:** founder (engineering)
- **PRD sections:** 15 (CI row), 16 (dependency and image hygiene), 17 (milestone 0: "CI with every gate from section 18"), 18 (layers: security and performance; continuous integration)

## Context

Section 18 puts a container scan on every pull request, and section 16 adds weekly dependency updates, a
software bill of materials per release and a license allowlist, all as CI gates. `.github/workflows/ci.yml` is
the plan's own workflow, imported verbatim from the Starter kit; it has `pnpm audit --prod` and the gitleaks
secret scan but no container scan, SBOM or license step, and no performance step. It is not edited.

## Decision

- **`.github/workflows/supply-chain.yml`** runs on every pull request beside ci.yml. Its `images` job builds
  `apps/web/Dockerfile` and `apps/worker/Dockerfile` and scans each image with Trivy, failing on any HIGH or
  CRITICAL finding that has a fixed version (`ignore-unfixed`: a finding with no fix cannot be acted on in a pull
  request; it is reported in the table and tracked to closure). Its `licenses` job runs `pnpm licenses:check`.
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
  merges it.
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

- The action versions are pinned by tag; dependabot proposes their updates weekly.
- Branch protection must require the `supply-chain` checks next to `ci` (a repository setting, outside the code).
- None of these workflows can run where the repository was built (no Docker daemon, no GitHub runner); their
  first real run is the first pull request.

## Revisit when

A scan finding needs a waiver, a new license appears in production dependencies, or milestone 2 adds the
performance workflow.
