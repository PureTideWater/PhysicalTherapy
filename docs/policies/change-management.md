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

1. **Every change is a pull request, and GitHub enforces how it merges.** Rulesets on `main`, on `claude/build-platform`
   and on the release tags enforce exactly this:
   - **No one is exempt.** The bypass lists are empty, so the rules hold the administrator too, with two exceptions. On
     `main`'s pull-request rule, the content publisher, a GitHub App whose key only the `publish-content` workflow
     running on `main` can read, commits a release that was already reviewed (rule 4); it is set up before launch, and
     `main`'s history rules, which have no bypass at all, keep it from deleting or force-pushing `main`. And only the
     founder, as the repository's administrator, creates a release tag (rule 5).
   - **No direct push, force push or deletion.** Neither branch can be deleted or rewritten, and nothing reaches either
     except by merging a pull request.
   - **Release tags.** A `v*` tag starts the release workflow; only the founder creates one, and no one moves or deletes
     one. A `content-release-*` tag is created only by the content publisher, and never moved or deleted.
   - **One approval, by the founder, of the latest commit.** A pull request needs one approving review. The founder is
     the code owner of every path (`.github/CODEOWNERS`) and Code Owners review is required, so only the founder's
     approval counts. An approval is dismissed when a new commit is pushed. GitHub never counts an author's approval of
     their own pull request, and the build agent, which authors pull requests under its own GitHub account, never
     submits a review.
   - **Required checks.** A pull request into `claude/build-platform` also needs five checks from GitHub Actions to pass
     on its latest commit, with the branch up to date with its base: `check` (the `ci` workflow) and `images (web)`,
     `images (worker)` and `licenses` (the `supply-chain` workflow), which together run the gates of rule 2, and
     `approval-of-record`. Once enforced (`APPROVAL_REVIEW_REQUIRED`), `approval-of-record` fails a pull request that
     changes the domain model's approval line or the approver list until an approver other than its author approves its
     latest commit. `main` holds no workflow until launch, so it requires no check until then; at launch it requires the
     same five.
   - **The build merges.** Once the approval and the checks are in place, the build performs the merge. The founder
     approves; the founder does not need to merge.

   The approval applies from the day the build agent works under its own GitHub account (runbook step 3i): from then on
   the build merges no pull request without it, and from runbook step 5, set as soon as the rulesets of step 4 exist,
   GitHub requires it. Until 3i the build works as the founder's account, which cannot approve its own pull requests, so
   a pull request into `claude/build-platform` merges on its five checks. Both dates are written in docs/adr/0063, and
   the first quarterly review (rule 9) checks every pull request merged from the first.

   What Write still allows: a collaborator with Write, the build agent included, can push other branches and run a
   workflow from one, and such a workflow can publish an image to the repository's registry. So no image reaches
   production on GitHub's word alone: the deploy checks that the release tag's commit is on `main` (rule 5).

   Not enforced by GitHub, and checked by the quarterly review instead: each pull request's description follows
   `.github/pull_request_template.md` (what changes, why, what it does not change, the checks run, the reviewer agents'
   findings and how each was resolved, the freeze-exception answer, the domain model's SHA-256 when a migration changes
   it, and the founder's approval), which GitHub offers only from `main`, so until launch the build fills it in by its
   own rule; and the reviewer agents (payment engine, security, EDI) run before anything that touches money, tenancy or
   parsing merges.
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
   workflow, which runs the checks again, moves the release to `content/releases/<n>`, and commits and tags it with the
   content publisher's credential once `publish-content.yml` takes the publisher's token, in its own pull request before
   launch (until then it cannot run, since it is not on `main`); it is never edited by hand once released.
5. **Releases are tagged images.** Only the founder creates a release tag, on a commit merged to `main`, and before a
   deploy the deployer checks that the tag's commit is on `main` (`git merge-base --is-ancestor`;
   docs/runbooks/deploy-and-rollback.md). CI builds each image once, records its software bill of materials, and
   promotes the same image from staging to production. Rollback is redeploying the previous image.
6. **Dependencies** are pinned in the lockfile, updated weekly through reviewed pull requests, audited with
   `pnpm audit --prod`, and checked against the license allowlist. Dependabot's pull requests need the founder's
   approval like any other. Its security updates open against `main`, which holds no manifest until launch; one that
   opened there would wait for the founder's ruling, and the build never approves or merges one.
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
     approved their own change; the template's sections are filled in, each reviewer agent's finding has a resolution,
     and the freeze-exception answer fits the change; and, for a migration, the approval line's SHA-256 is the
     document's.
   - **Releases:** every release tag deployed in the quarter names a commit on `main` that merged through a pull request
     the founder approved, and the founder created the tag.
   - **The settings:** every ruleset as the runbook sets them (the build branch's, `main`'s two, the release tags' two
     and the content release tags' two), with no bypass but the content publisher's on `main`'s pull-request rule and on
     creating a content release tag, and the administrator's on creating a release tag; the repository's people and
     their roles; `APPROVAL_REVIEW_REQUIRED` set to `true`; and every change to these in the organization's audit log.
   - **The security contact:** `security.txt`'s Expires date (apps/web/src/lib/security/disclosure.ts) lies more than
     120 days ahead; if not, the build renews it before the next review, since from 30 days before it the unit tests
     fail every pull request.

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

- **0.2 (2026-10-20):** rule 1 states what the rulesets enforce: one approval by the founder on every pull request once
  the build agent has its own account, Code Owners review, the required checks, release tags only the founder creates,
  and the build merging; rules 3 to 7 follow from it; rule 9 adds the quarterly independent review. Rule 1 of 0.1
  claimed a review by someone other than the author and branch protection on `main` that were not yet in place.
- **0.1:** the first draft, written from the plan.
