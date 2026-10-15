# Therapy contract-payment platform

A contract-payment verification platform for outpatient therapy practices and their billing firms. It ingests copies of 835 remittances and payer contracts, computes expected payment per service line under approved contract versions, groups shortfalls by payer pattern into dispute packets a person approves, and proves recovery by reconciling later remittances to payment posting and deposits.

The build specification is in [docs/product/PRD.md](docs/product/PRD.md), with its reference tabs: [data dictionary](docs/product/data-dictionary.md), [rules reference](docs/product/rules-reference.md), [test matrix](docs/product/test-matrix.md) and the [milestone prompts](docs/product/milestone-prompts.md).

No real PHI, real 835, real contract or real export ever enters this repository.

## Development

Prerequisites: Node 24 (see `.nvmrc` and `engines`; Node 22 runs everything with an engine warning), pnpm 10.28 (`corepack enable` or
`npm install --global pnpm@10.28.0`), and Docker for `pnpm dev`. Nothing in the test suites needs Docker:
database tests use `DATABASE_URL`, defaulting to the docker-compose Postgres at
`postgres://postgres:test@localhost:5432/postgres`.

```sh
pnpm install
pnpm typecheck && pnpm lint && pnpm lint:logs
pnpm test            # unit and property tests, with the 100% branch gates
pnpm test:db         # database tests (each creates and drops its own database)
pnpm test:e2e        # builds the web app and runs the Playwright smoke test
pnpm build           # web (Next.js standalone) and worker (esbuild bundle)
pnpm dev             # Postgres and MinIO in Docker, then the web app and the worker
pnpm db:migrate      # roles, then forward-only migrations as the owner role (--dev-login: local app login)
pnpm db:migrate --dry-run   # apply the pending migrations in one transaction and roll it back
pnpm licenses:check  # production dependency licenses against tools/check-licenses/allowlist.json
```

Tenancy and audit (ADRs 0013 to 0015, 0018 and 0019): every query runs in a scope from `@tp/db` (`withActor`,
`withPracticeScope`, `withJobScope`, one practice per job; a practice job reaches the database only through its
context's `transaction`), PHI reads go through `readWithAudit`, every stored object is sealed with its practice's data
key (`PracticeObjectStore`), and `pnpm test:db` runs the catalog test and the cross-tenant tests generated from the
catalog. The worker runs its platform jobs (the nightly audit copy, the monthly restore drill and the support notices)
only when `OPERATOR_DATABASE_URL` names a login that can `SET ROLE tp_operator` (every platform transaction runs as that
role, which owns nothing); locally add `AUDIT_COPY_DIR=<dir>`, and the local restore drill dumps and restores with
`RESTORE_DRILL_ADMIN_URL` (a superuser; it defaults to the operator URL). It uses `pg_dump` and `pg_restore`, which
must be at least as new as the server (`PG_BIN_DIR` points at them); that database test skips, saying why, where they
are older, and a server-side copy of the source is restored and checked instead, whatever the tools. With
`NODE_ENV=production` the worker refuses every local implementation (S3 with `AUDIT_COPY_LOCK_MODE`, RDS, SES and an
https `APP_ORIGIN` are required), and so does the web app for its identity and key providers.

Sign-in and authorization (ADRs 0016 and 0017): `pnpm db:migrate --dev-login && pnpm db:seed` creates the synthetic
organizations, practices, agreements and one person for every persona (`apps/web/scripts/synthetic-personas.ts`; each
signs in as `<key>@synthetic.test` with the password `Synthetic-<key>-Pass-2026!` and the TOTP code `personaTotpCode(key)`
gives). The web server then signs in through the local identity provider (`TP_AUTH_PROVIDER=dev`, the default outside
production; `TP_DEV_AUTH_DIR` is its directory, and invitations' temporary passwords land in its `outbox`), or Cognito
(`TP_AUTH_PROVIDER=cognito`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`). Production also needs `AUTH_COOKIE_SECRET`,
`TP_KEY_PROVIDER` and `APP_ORIGIN`. Internal roles register a hardware key on their first sign-in and use it from then on.
Every page, server action and route handler runs a route registered in `apps/web/src/lib/routes`; `pnpm test:db` generates
the session, MFA, role and cross-tenant tests for each. The worker's `support_grant_notices` platform job emails practice
administrators about support access (`MAIL_FROM` for SES, otherwise the `MAIL_OUTBOX_DIR` directory). The production
build runs with the local providers only for the e2e suite, which sets `TP_ALLOW_LOCAL_PROVIDERS=e2e`.

Global rule content (PRD section 9; [content/sources/README.md](content/sources/README.md) lists the files
release 1 needs):

```sh
pnpm rules:import --type <type> --year <year> --file <path> --url <url>   # a public CMS or X12 file -> L1 drafts
pnpm verify-content [dir...]       # the content checker: drafts and releases, or a fixture release
pnpm release:assemble <n>          # drafts at L2 or higher -> content/outgoing/<n> with RELEASE.md and MANIFEST.json
pnpm release:dry-run <n>           # what release n changes, and the pricing runs it would change
pnpm release:load <n> [--dir <d>]  # load a published release (or a directory outside fixtures/) into DATABASE_URL
```

**Milestone 1 is not complete.** Its done check includes "the restore job runs on staging", and nothing can be deployed
from the environment the repository was built in (no AWS credentials, and the compute arrives in milestone 11). The
repository holds what the drill needs there (ADR 0019): the `OperatorRole` task role, the operator login's secret, the
RDS and SES endpoints, the scratch-instance name and the job-failure alarm. A person with staging credentials finishes it:

1. `cdk deploy tp-staging`, then run `pnpm db:migrate` against the staging database as `tp_owner_login`, and create
   `tp_app_login` and `tp_operator_login` from their secrets as members of `tp_app` and `tp_operator`.
2. Run the worker image as a one-off ECS task in the `app` subnets with the `OperatorSecurityGroupId` security group
   and the `OperatorRoleArn` task role, `NODE_ENV=production`, `OPERATOR_DATABASE_URL` from the operator login,
   `AUDIT_COPY_BUCKET` and `AUDIT_COPY_LOCK_MODE` from the stack outputs, `MAIL_FROM` (a verified SES identity),
   `APP_ORIGIN`, `RESTORE_DRILL_MODE=rds`, `RESTORE_DRILL_SOURCE_INSTANCE` (`DatabaseInstanceId`),
   `RESTORE_DRILL_SCRATCH_INSTANCE` (`RestoreDrillInstanceId`), `RESTORE_DRILL_INSTANCE_CLASS`,
   `RESTORE_DRILL_SUBNET_GROUP` (`DatabaseSubnetGroup`), `RESTORE_DRILL_SECURITY_GROUPS` (`DatabaseSecurityGroupId`),
   and `NODE_EXTRA_CA_CERTS` pointing at the RDS certificate bundle, then send it a `restore_drill` job.
3. Check the `restore_drill` row (outcome `passed`, row counts, no catalog problems), that the scratch instance is gone,
   and that a PUT without `If-None-Match` to the documents bucket is refused (ADR 0018). Record the result in the PR.

**Milestone 0 is not complete.** Its done check ("release 1 loads into an empty database") needs the 2026 CMS
and X12 files, which cannot be downloaded from the environment the repository was built in (cms.gov, x12.org
and ncdoi.gov refuse it). The drafts in `content/drafts` are hand-typed from the plan's own rules reference, a
secondary source, and stay at L1; they are not release 1 content. [content/sources/README.md](content/sources/README.md)
lists what a person with network access does to finish it.

| Path | What lives there |
| --- | --- |
| `apps/web` | Next.js App Router: UI, route handlers, server actions |
| `apps/worker` | pg-boss worker: parse, price, triage, reconcile, digest and export jobs |
| `packages/*` | `db`, `edi835`, `contracts`, `rules`, `pricing`, `triage`, `packets`, `ledger`, `model-gateway`, `ui`, `synth`, `money`, `observability` |
| `infra` | AWS CDK app, one stack per environment |
| `tools` | log lint, content checker, release scripts, CI guards |
| `content` | global rule drafts, sources and prepared releases (CI publishes `content/releases`) |
| `fixtures` | synthetic and golden test data, never real |
| `docs/adr` | architecture decisions |
