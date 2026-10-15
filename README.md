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

Tenancy and audit (ADRs 0013 to 0015): every query runs in a scope from `@tp/db` (`withActor`,
`withPracticeScope`, `withJobScope`, one practice per job), PHI reads go through `readWithAudit`, and `pnpm test:db`
runs the catalog test and the cross-tenant tests generated from the catalog. The worker runs its platform jobs (the
nightly audit copy and the monthly restore drill) only when `OPERATOR_DATABASE_URL` names a login that can
`SET ROLE tp_owner`; locally add `AUDIT_COPY_DIR=<dir>`. The local restore drill uses `pg_dump` and `pg_restore`, which
must be at least as new as the server (`PG_BIN_DIR` points at them); the database test of that path skips, saying
why, where they are older.

Global rule content (PRD section 9; [content/sources/README.md](content/sources/README.md) lists the files
release 1 needs):

```sh
pnpm rules:import --type <type> --year <year> --file <path> --url <url>   # a public CMS or X12 file -> L1 drafts
pnpm verify-content [dir...]       # the content checker: drafts and releases, or a fixture release
pnpm release:assemble <n>          # drafts at L2 or higher -> content/outgoing/<n> with RELEASE.md and MANIFEST.json
pnpm release:dry-run <n>           # what release n changes, and the pricing runs it would change
pnpm release:load <n> [--dir <d>]  # load a published release (or a directory outside fixtures/) into DATABASE_URL
```

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
