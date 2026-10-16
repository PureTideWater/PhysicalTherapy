---
policy: change-management
title: Change management
version: 0.1
status: draft, awaiting the security official's approval
owner: security official
review: yearly
---

# Change management policy

## Purpose and scope

How a change reaches production: application code, migrations, infrastructure, rule content, dependencies and
configuration.

## Rules

1. **Every change is a pull request** against `main`, reviewed and approved by someone other than its author before
   it merges. Branch protection on `main` requires the review and the `ci` workflow's checks; nobody pushes to `main`
   directly.
2. **CI gates must pass:** typecheck, lint, the log lint, unit and property tests with the coverage gates, the
   database suite (the catalog test and the cross-tenant tests) on freshly migrated databases, the golden and oracle
   suites, the build, the end-to-end journeys, the CDK synthesis, the secret scan, the dependency audit, the license
   allowlist and the container scan.
3. **Migrations are forward-only.** A migration already merged is never edited or renamed; a fix is a new migration.
   Every migration is dry-run in CI before it is applied, and runs as a job before the new image takes traffic; a
   change that cannot roll forward safely is split into add, backfill and remove steps.
4. **Rule content** (fee schedules, code lists, state rules) is drafted with its sources, checked by the content
   checker, reviewed in a pull request, and published by CI on merge; it is never edited by hand once released.
5. **Releases are tagged images.** CI builds each image once, records its software bill of materials, and promotes the
   same image from staging to production. Rollback is redeploying the previous image.
6. **Dependencies** are pinned in the lockfile, updated weekly through reviewed pull requests, audited with
   `pnpm audit --prod`, and checked against the license allowlist.
7. **Emergency changes** follow the same path with a shortened review (any second engineer); the review is completed
   in writing within one business day and noted in the incident record when there is one.
8. **No real data in development.** Changes are built and tested with synthetic data only; a developer machine, CI and
   the repository never hold PHI.

## Evidence

Branch protection and CI results are collected by the compliance platform from GitHub; the release workflow keeps the
SBOM per image.
