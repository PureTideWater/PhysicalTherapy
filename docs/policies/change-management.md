---
policy: change-management
title: Change management
version: 0.2
status: draft, awaiting the security official's approval
owner: security official
review: yearly
---

# Change management policy

## Purpose and scope

How a change reaches production: application code, migrations, infrastructure, rule content, dependencies and
configuration. The repository is `PhysicalTherapy`, private, in the company's GitHub organization. `main` is the
default branch and the launch branch; until launch the build lands on `claude/build-platform`, and at launch that
branch merges into `main` through one reviewed pull request (docs/adr/0063). The GitHub settings this policy relies
on are set by the founder, the repository's only administrator, as `docs/runbooks/github-governance.md` gives them;
until a setting is in place, the rule that relies on it is not met.

## Rules

1. **Every change is a pull request, and GitHub enforces how it merges.** A ruleset on `main` and one on
   `claude/build-platform` enforce exactly this:
   - **No one is exempt.** The bypass list is empty, so the rules hold the administrator too. The one exception is on
     `main`: the content publisher, a GitHub App whose key only the `publish-content` workflow running on `main` can
     read, commits a release that was already reviewed (rule 4). It is set up before launch.
   - **No direct push, force push or deletion.** Neither branch can be deleted or rewritten, and nothing reaches
     either except by merging a pull request.
   - **One approval, by the founder, of the latest commit.** A pull request needs one approving review. The founder is
     the code owner of every path (`.github/CODEOWNERS`) and Code Owners review is required, so only the founder's
     approval counts. An approval is dismissed when a new commit is pushed. GitHub never counts an author's approval
     of their own pull request, and the build agent, which authors pull requests under its own GitHub account, never
     submits a review.
   - **Required checks.** A pull request into `claude/build-platform` also needs five checks from GitHub Actions to
     pass on its latest commit, with the branch up to date with its base: `check` (the `ci` workflow, which runs the
     gates of rule 2), `images (web)`, `images (worker)` and `licenses` (the `supply-chain` workflow), and
     `approval-of-record`. Once enforced (`APPROVAL_REVIEW_REQUIRED`), `approval-of-record` fails a pull request that
     changes the domain model's approval line or the approver list until an approver other than its author approves
     its latest commit. `main` holds no workflow until launch, so it requires no check until then; at launch it
     requires the same five.
   - **The build merges.** Once the approval and the checks are in place, the build performs the merge. The founder
     approves; the founder does not need to merge.

   The approval applies from the day the build agent has its own GitHub account (runbook step 3). Until then the build
   works as the founder's account, which cannot approve its own pull requests, so neither ruleset requires an approval
   and a pull request into `claude/build-platform` merges on its five checks; the date the approval took effect is
   written in docs/adr/0063 and checked by the first quarterly review (rule 9).

   Not enforced by GitHub, and checked by the quarterly review instead: each pull request is opened from
   `.github/pull_request_template.md` (what changes, why, what it does not change, the checks run, the reviewer
   agents' findings and how each was resolved, the freeze-exception answer, the domain model's SHA-256 when a
   migration changes it, and the founder's approval), and the reviewer agents (payment engine, security, EDI) run
   before anything that touches money, tenancy or parsing merges.
2. **CI gates must pass:** typecheck, lint, the log lint, unit and property tests with the coverage gates, the
   database suite (the catalog test and the cross-tenant tests) on freshly migrated databases, the golden and oracle
   suites, the build, the end-to-end journeys, the CDK synthesis, the secret scan, the dependency audit, the license
   allowlist and the container scan.
3. **Migrations are forward-only.** A migration already merged is never edited or renamed; a fix is a new migration.
   A migration merges only with `docs/product/domain-model.md` regenerated in the same pull request and its approval
   line signed by the founder (CO-02). Every migration is dry-run in CI before it is applied, and runs as a job before
   the new image takes traffic; a change that cannot roll forward safely is split into add, backfill and remove steps.
4. **Rule content** (fee schedules, code lists, state rules) is drafted with its sources, checked by the content
   checker, reviewed and approved in a pull request, and published after the merge to `main` by the `publish-content`
   workflow, which runs the checks again, moves the release to `content/releases/<n>`, and commits and tags it with
   the content publisher's credential; it is never edited by hand once released.
5. **Releases are tagged images.** CI builds each image once, records its software bill of materials, and promotes the
   same image from staging to production. Rollback is redeploying the previous image.
6. **Dependencies** are pinned in the lockfile, updated weekly through reviewed pull requests, audited with
   `pnpm audit --prod`, and checked against the license allowlist. Dependabot's pull requests need the founder's
   approval like any other.
7. **Emergency changes** follow the same path. The rulesets have no bypass for people, so an emergency change still
   needs the founder's approval and the required checks: what shortens is the wait, not the review. It is noted in the
   incident record when there is one, and the next quarterly review includes it. If the founder cannot approve,
   nothing merges; a second approver is added only by the founder, under a new version of this policy.
8. **No real data in development.** Changes are built and tested with synthetic data only; a developer machine, CI and
   the repository never hold PHI.
9. **A quarterly independent review of merged pull requests.** Each quarter, someone independent of the build (an
   outside engineer engaged for it; never the founder, whose approvals are what is reviewed, and never the build
   agent) reviews:
   - **The sample:** every pull request merged in the quarter that changed a migration, the domain model or its
     approval, the approver list, `.github/`, `.claude/`, `CLAUDE.md` or a content release, and every emergency change;
     and at least 10 others chosen at random from the quarter's merged pull requests (all of them when there are
     fewer).
   - **For each pull request:** the founder approved the commit that merged; the required checks passed on it; no one
     approved their own change; the template's sections are filled in, each reviewer agent's finding has a
     resolution, and the freeze-exception answer fits the change; and, for a migration, the approval line's SHA-256 is
     the document's.
   - **The settings:** both rulesets as the runbook sets them, with no bypass but the content publisher; the
     repository's people and their roles; `APPROVAL_REVIEW_REQUIRED` set to `true`; and every change to these in the
     organization's audit log.

   The reviewer writes what was sampled, each exception and what was done about it, then signs and dates it. The
   security official records it in the evidence checklist by reference and SHA-256 (a record of kind `change_review`,
   which the console accepts once a migration adds the kind; until then the signed document is kept with the
   program's records). An exception is fixed, or accepted in writing by the security official with the reason.

## Evidence

The rulesets, each merged pull request's reviews and checks, and the organization's audit log are collected by the
compliance platform from GitHub. The `approval-of-record` and `ci` results stay with each pull request. The quarterly
review is a record in the evidence checklist (`packages/compliance/src/controls.ts`, change management). The release
workflow keeps the SBOM per image.

## Versions

- **0.2 (2026-10-20):** rule 1 states what the rulesets enforce: one approval by the founder on every pull request
  once the build agent has its own account, Code Owners review, the required checks, and the build merging; rules 3, 4,
  6 and 7 follow from it; rule 9 adds the quarterly independent review. Rule 1 of 0.1 claimed a review by someone
  other than the author and branch protection on `main` that were not yet in place.
- **0.1:** the first draft, written from the plan.
