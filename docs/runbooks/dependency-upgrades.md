# Dependency upgrades: Dependabot's pull requests, the release age, and the upgrades made on purpose

How the repository's dependencies move (PRD 16, dependency and image hygiene; docs/adr/0066, Part 2): the pnpm
workspace, the GitHub Actions the workflows pin, the node image both Dockerfiles build from and the PostgreSQL image of
`docker-compose.yml`. Dependabot proposes the routine updates in grouped weekly pull requests; the upgrades that move a
major, a schema or a rendering are pull requests of their own, made on a plan. This runbook is for the build at the
weekly triage and for whoever makes one of those pull requests.

Three rules hold everywhere:
- **No Dependabot pull request merges as it stands.** A person reads every one (below), and it merges only through the
  same gates as any pull request: the four required checks, branches up to date, and from runbook step 5 the founder's
  approval (docs/adr/0063).
- **Every resolution waits three days.** `pnpm-workspace.yaml`'s `minimumReleaseAge: 4320` refuses a version
  published less than three days ago, and `pnpm toolchain:check` refuses one the lockfile adds, whoever resolved it.
  The one way in for a younger version is a dated exclude for that exact version (below). That is the founder's F2 (b).
- **Each version sits in one place.** `package.json`'s `packageManager` for pnpm, the catalog in
  `pnpm-workspace.yaml` for a shared tool (every manifest names it `catalog:`), the Dockerfiles' `FROM` lines for the
  node image, `docker-compose.yml` for PostgreSQL, each workflow's pin for an action
  (`tools/test/no-duplicated-versions.test.ts` holds it). A pull request that moves a version moves that one line.

## What Dependabot opens, and when

`.github/dependabot.yml`, read from the default branch, which is `claude/build-platform` until launch (F1 (a);
docs/runbooks/github-governance.md, "The default branch until launch"):

| Ecosystem | Day (UTC) | Cooldown | Pull requests |
| --- | --- | --- | --- |
| npm | Thursday 04:31 | 3 days, every update type | one per group, at most 8: `browser-tests`, `anthropic-sdk`, `pg-boss`, `next`, `aws-sdk`, `aws-cdk`, `minor-and-patch`; and `security` for security updates |
| GitHub Actions | Tuesday 04:37 | 7 days | one, every action |
| the node image and compose's postgres | Wednesday 04:43 | 7 days | one, `container-images` |

Majors are ignored for `@types/node`, `typescript`, `next`, `@next/eslint-plugin-next`, `pg-boss`, the node image and
compose's postgres: each moves in a pull request of its own (below). Monday holds the weekly mutation (05:23),
large-zip (06:17) and capacity (06:41) runs, so no ecosystem runs then.

npm's cooldown equals the release age on purpose (the co-founder's CQ1 (a)). Dependabot hands pnpm its own release
age whenever that is longer than the repository's: its update checker probes each candidate with the version's
semver-specific cooldown, uncapped, and skips a version that fails, and pnpm re-checks every locked direct dependency on
such a resolution. With 7 days for minors and 14 for majors, an update would be dropped silently whenever any locked
direct dependency was younger than that. Do not add semver-specific days to the npm entry; actions and images support
only `default-days`.

## The weekly triage

Once a week, after Thursday's npm batch:

1. **Dependabot's own runs.** A run that opens no pull request is visible only as an Actions run with
   `event=dynamic`:

   ```sh
   since=<last triage date, YYYY-MM-DD>
   gh api "repos/PureTideWater/PhysicalTherapy/actions/runs?event=dynamic&created=>=$since" --paginate \
     --jq '.workflow_runs[] | [.id, .name, .conclusion, .created_at] | @tsv'
   ```

   Open each `failure` and read its log; fix the cause in a pull request (run 40223237798 of 2026-10-25 is the
   example: every npm update failed with `ERR_PNPM_NO_MATURE_MATCHING_VERSION`, because a locked version was under
   three days old). A successful run whose log says "release-age block detected" dropped a version without a pull
   request; under CQ1 (a) it should not occur, so record it and find which locked version caused it.
2. **Each open Dependabot pull request.** Read its checks, then its changes:
   - all green: read the release notes of every major or minor in it for a change in behaviour our code relies on,
     then take it as a pull request of the build's own: merge the build branch in, add what the notes call for, and
     say in the description what was read. A `minor-and-patch` group can be taken whole once its notes are read;
   - red: read the failing check. A red test that names a real incompatibility is the update's work; a red check that
     is not about the update (a flaky journey, a runner lost) is fixed or re-run as any other (docs/runbooks/ci.md);
   - `browser-tests`: red by design (below);
   - a group that moves a money closure's packages runs mutation in full; read its survivors like any other.
3. **The exception lists.** Remove every release-age exclude whose expiry has passed, from both lists (below);
   `pnpm toolchain:check` warns of each on every run until then. Read the audit exceptions likewise.
4. **`check-toolchain`'s warnings.** A newer pnpm 10.x at least three days old: make the `packageManager` pull request
   (below). An action whose tag moved under an unchanged pin (a push run's warning from `pnpm actions:check`): read
   why upstream moved it; a pin is a commit, so nothing we run changed, but a moved tag on a security tool is reported
   to the founder.
5. **Stored ignores.** `@dependabot ignore …` comments on a pull request are stored by GitHub, outside the file. List
   them with `@dependabot show <dependency> ignore conditions` on any Dependabot pull request, and remove one with
   `@dependabot unignore <dependency>`; the file's `ignore` entries are the only ones meant to exist.

For the first four weekly batches after the switch, read the bot queue time as `docs/runbooks/ci.md` says.

## The release age (F2 (b))

pnpm 10.34.8 checks the release age only when it resolves: `pnpm install --frozen-lockfile` never does, and
Dependabot's security updates run with the gate off. So `pnpm toolchain:check` checks what lands: every lockfile entry a
pull request adds against its base must have been published at least three days before, or be excluded.

**A young locked version stops every full re-resolution.** pnpm re-checks every locked direct dependency on
`pnpm update` and on Dependabot's runs, so a version under three days old merged into the lockfile (by a person, or by a
security update under an exclude) stops every npm run until it is three days old. That is what failed every update on
2026-10-25 (Stryker 10.1.1, merged at 47 hours old). Merge such a version only when it is needed now, and expect
Dependabot's npm runs to fail until it ages.

**Adding an exclude for a young security fix.** Only for a version that fixes an advisory and cannot wait:
1. In `pnpm-workspace.yaml`, add the exact version to `minimumReleaseAgeExclude`: `- 'name@x.y.z'`. Never a bare name,
   a `*` pattern or a `||` union: pnpm accepts them, `check-toolchain` refuses them, since each entry needs one expiry.
2. In `tools/check-toolchain/release-age-exceptions.json`, add the same entry: `package` (`name@x.y.z`), `advisory`
   (the GHSA id), `reason`, `added` and `expires` as UTC instants. The expiry must be no earlier than the version's
   publish time plus three days (`npm view <name> 'time["x.y.z"]'`), so it covers the whole young window, and no later
   than seven days after `added`.
3. Resolve (`pnpm install --lockfile-only`), run `pnpm toolchain:check`, and say in the pull request's description why
   the fix cannot wait three days.

Once expired the exclude changes no resolution: an expired entry fails only a pull request that edits either list, and
is a warning everywhere else until the weekly triage removes it from both.

## The trust policy

`trustPolicy: no-downgrade` refuses a version when an earlier version of the same package was published with stronger
evidence (a trusted publisher over provenance over none): the sign a maintainer's account may have published it
without the project's pipeline. An exclude is for one fixed old version only, never a new release:
`trustPolicyExclude` in `pnpm-workspace.yaml`, mirrored in `tools/check-toolchain/trust-exceptions.json` with its reason
and date; `check-toolchain` holds the two equal and fails an entry the lockfile no longer resolves. Today it holds
`semver@6.3.1` (2023, no provenance, after 7.5.1 with it), reached through `@babel/core` (the co-founder's CQ2 (a)). A
new trust failure on a recent version is a security question for the founder, not an exclude.

## Transitive packages and overrides

A transitive package moves by a lockfile refresh when its parent's range allows the fixed version
(`pnpm update <name>`). When a parent pins the old version exactly, use an override in `pnpm-workspace.yaml`'s `overrides`, scoped to
that parent (`"parent@major>child": "x.y.z"`), and add its entry to `tools/check-toolchain/overrides.json`: the selector,
the version, the reason, the date added and `removeWhen`, the event that makes it unnecessary (the parent moving to a
range that allows the fix). `check-toolchain` fails an override without its entry, or one whose target has left the
lockfile; remove both then. The qs override (`typed-rest-client@2>qs`, 6.16.1) goes when Stryker depends on
typed-rest-client 3, or on a typed-rest-client whose qs range reaches 6.16.0.

## pnpm itself

Dependabot never moves `packageManager` (it reads it only to choose the pnpm it runs), so a person does, in a one-line
pull request:
1. When `pnpm toolchain:check` warns that a newer 10.x is at least three days old (the weekly triage), set
   `packageManager` to `pnpm@<that version>`. Both Dockerfiles install the version it names, and the workflows'
   `pnpm/action-setup` switches to it, so nothing else names a version.
2. Run `pnpm install --lockfile-only` under the new pnpm (with `--fix-lockfile` if `tools/check-licenses`' libc rule
   names an entry written before pnpm wrote libc fields), then `pnpm licenses:check` and `pnpm toolchain:check`.

`check-toolchain` refuses a `packageManager` pnpm under three days old unless that exact version has a live exclude in
both lists (CQ3 (a)): `pnpm/action-setup` switches to it with `pnpm self-update` in its own directory, where the
workspace's release age never applies.

**The outage this prevents.** An advisory published against the pinned pnpm turns `static` red on every pull request of
both lanes. The remedy is the same pull request to the first fixed version, with its dated exclude if it is under three
days old, merged first; every other pull request then merges the build branch in.

**Leaving major 10.** GitHub's list of the package managers Dependabot supports names pnpm "v7, v8, v9, v10"; a lockfile
from pnpm 11 or 12 would rest on support GitHub does not state, though dependabot-core already handles both in code.
Move when GitHub's list names pnpm 11 or later, in a pull request of its own; pnpm 11.3 and later also check every
lockfile entry against the release age and the trust policy on every install (`trustLockfile`), which would let
`check-toolchain`'s lockfile rule go.

## Base images and PostgreSQL

- **The node image.** Both Dockerfiles build every stage from one `node:24-trixie-slim@sha256:…` reference.
  Dependabot's `container-images` pull request moves the digest within major 24; check the images job's scan and the
  capacity measurement. To read a digest by hand, take the field `digest` (the index digest) of
  `curl -sS https://hub.docker.com/v2/repositories/library/node/tags/24-trixie-slim`.
- **Node 24 to 26, on a plan, before Gate 1.** Node 26 is LTS from 2026-10-28. One pull request moves the Dockerfiles'
  `FROM`, `.nvmrc`, `engines`, `@types/node` (major ignored until then) and the workflows' `node-version` together,
  and `mutation.yml`'s exact Node with `tools/stryker/unicode.json` after the Unicode-bound equivalents are checked
  again on the new Node (docs/runbooks/ci.md, "Recording an equivalent"). The images, e2e, capacity and mutation
  jobs prove it.
- **PostgreSQL's major.** `docker-compose.yml`'s `postgres:18-trixie@sha256:…` moves within 18 by Dependabot. A major
  moves with production's RDS engine version (`infra/lib/constructs/database.ts`) in one pull request, after the
  domain model's `--check` passes on the new server: a catalog change shows as drift in the `domain model` job, and a
  regenerated document is Lane A's (CO-02).

## The upgrades made on purpose

- **Next minors.** The `next` group brings `next` and `@next/eslint-plugin-next` together (majors ignored). Read the
  release notes for caching, middleware and server-action changes; the build job's production build and the e2e
  journeys are the proof. A Next major is its own pull request with its migration guide.
- **pg-boss, whose minors migrate its schema.** pg-boss's schema version moves with its minors (26 at 12.0.0, 46 at
  12.38.0). The worker migrates it at start (`apps/worker/src/main.ts:93, 110, 129`) while the web app's queue client
  starts with `migrate: false` (`apps/web/src/lib/uploads/queue.ts:36`) and refuses a schema that does not match. So a
  deploy that starts the web before the worker can fail. The procedure, before the first staging deploy (infrastructure
  pull request (d)): the pre-traffic migration task migrates pg-boss's schema with the application's, every runtime
  `PgBoss` sets `migrate: false`, and a test enforces it. Until then take a pg-boss minor only in its own pull request,
  and deploy the worker first.
- **Playwright, with its baselines.** The `browser-tests` group moves `@playwright/test`, `playwright`,
  `playwright-core`, `@axe-core/playwright` and `axe-core` together. It is red by design: a new Playwright pins a new
  Chromium, whose rendering moves the brand journey's seven baselines (and, from docs/adr/0066's Part 3, the
  `browser.json` check names the expected and found builds). Regenerate them on Linux with Playwright's Chromium
  (`pnpm --filter @tp/web exec playwright test e2e/brand.spec.ts --update-snapshots`), have a person inspect the seven
  images, and commit them in the same pull request (docs/adr/0058).
- **TypeScript 7.** Its own pull request, once typescript-eslint declares support (8.72.0 declares
  `typescript <6.1.0`); `typecheck.sh`'s time and `pnpm typecheck`'s are re-measured.
- **The Anthropic SDK.** The `anthropic-sdk` group is never merged as it stands: a model-gateway change passes the
  evaluation gate first (packages/model-gateway; PRD 18), in a deliberate pull request.
- **AWS.** `aws-cdk` with `aws-cdk-lib` and `constructs`, and `@aws-sdk/*`, come in their groups (minor and patch).
  `pnpm cdk:diff` in the build job shows what a CDK bump changes in the stacks; read it before taking one.
  `@aws-sdk/*` reaches pricing and packets through the lockfile, so its pull request runs those packages' mutation.

## Actions

The `actions` pull request rewrites every pin (`owner/repo@<sha> # vX.Y.Z`) to each action's newest release at least
seven days old. The workflow tests find steps by the action's name, so a pin bump alone stays green;
`pnpm actions:check` reads each new pin's tag and inputs from GitHub. Read each action's release notes for a removed input or
a changed default. `publish-content.yml` takes the same pins under the founder's standing exception F4; any other change
to it fails its frozen-copy test. An action added by hand is pinned the same way, at its latest release
(docs/runbooks/ci.md, "Changing CI").
