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
pnpm synth --all     # regenerate every synthetic fixture (deterministic; --case <id>, --large for PAR-29)
pnpm test:oracle     # pyx12 and packages/edi835 read every synthetic 835 and must agree (TP_ORACLE_PYTHON: a python with pyx12)
```

Synthetic data and the 835 oracle (ADRs 0021 to 0024): `packages/synth` generates every test-matrix case and
thirty-five oracle variants into `fixtures/synthetic/<case>/`, each with an `expected.json` stating the outcome, and holds
the twin generator, which runs on real files only in production. `pnpm test:oracle` needs pyx12 for the interpreter it
runs: CI installs it with pip; locally use a virtualenv outside the source tree (`tools/test-oracle/README.md`).
The parser, `packages/edi835` (ADR 0025), turns bytes or a stream of chunks into typed loops, events and a report
(`parse835`, `parse835Stream`); a held transaction set carries every reason with its segment and element.

Uploads and intake (ADR 0026): the Uploads screen (`/p/<practice>/uploads`) asks for one PUT target per file, and the
worker's `intake` job scans, hashes, deduplicates, sniffs and expands zips before queuing `parse_835` per clean 835.
Locally the browser PUTs to the web app's own receiver, which seals the bytes into `DOCUMENTS_DIR` (default
`tp-documents` under the system's temporary directory; the worker reads the same one), and the web app queues jobs on
`QUEUE_DATABASE_URL` (a login that owns pg-boss's schema; `pnpm dev` sets it). In staging and production the target is
a presigned S3 PUT (`DOCUMENTS_BUCKET`, `DOCUMENTS_KMS_KEY_ID`) and GuardDuty gives the scan's verdict; the worker
waits up to `SCAN_WAIT_SECONDS` (600) for it. The database holds the malware gate too (ADR 0032): a finding is never
cleared, only a clean document is scanned or queued for parse, and a zip entry is clean only with its zip. A zip whose
entries would expand past 100 times its size is refused whole, and an entry its first bytes hold is never written.
`TP_LARGE_ZIP_MB` sizes the large-zip intake test (`apps/worker/src/intake/intake.large.db.test.ts`, 256 MiB by default;
the weekly `large-zip` workflow runs 2048).

Parse and load (ADRs 0027 and 0031): the worker's `parse_835` job (`apps/worker/src/parse`) parses each clean 835 twice
as a stream, once for the parser's final report and once to load every loadable transaction set, with the report, in
one transaction: `remittance`, `claim`, `service_line` (a professional line's place of service from CLP08),
`adjustment`, `provider_adjustment`, `patient_ref` (by pseudonym of the name and member ID, identifiers encrypted) and
the payer and plan rows of the mapping queue. A resent payment under a new envelope loads zero rows, like a resent file. Held sets never load; their reasons and positions are in
`parse_report`, which the upload's receipt and its CSV report show. CARC and RARC are checked against the newest
published rule release (with none, every code loads flagged unknown); a value outside one of the 835 structure's own
code sets holds its transaction set (EDI_SYNTAX `invalid_code`). Every practice job's attempts are recorded in
`job_run` for the practice home's last run and its run-failed banner. The Remittances (`/p/<practice>/remittances`) and
Claims and lines (`/p/<practice>/claims`, the net view by default) screens read them; their PHI columns show only to
roles that read PHI.

Contracts (ADR 0028): `packages/contracts` holds the typed rate records (Zod over the stored JSON; cents as `Cents`,
percentages as `Decimal`; commercial flags off unless the contract says so), the workflow services (`createContract`,
`createDraftVersion`, `addRateRecord`, `proposeVersion`, `approveRateRecordField`, `approveVersion`, `signOffVersion`,
`amendVersion`, `supersedeVersion`, `mapPlan`, `correctMapping`), evidence resolution (`EvidenceResolver` over a
`PageSource`) and `agreementResolver`, which is pure over the records `loadAgreementRecords` returns. A rate record whose
scope names no codes is a general term for every code; beside a code exhibit it is `AMBIGUOUS_RATE` (ADR 0033). The web
app never parses an uploaded document (ADR 0033): intake reads each clean contract, exhibit and payer letter once in its
own worker thread under a memory cap, a deadline and page, text and inflation caps (`@tp/contracts/pages`: pdf.js for
text PDFs, an .xlsx a page per sheet, a CSV a page per 50 rows, `TextractPageReader` behind `ScannedPageReader` for
scans), seals its page text beside the original and records `page_text_status`; the screens cite from that stored
text. An .xls exhibit is refused at upload and held at intake. The database holds the version states, the non-overlapping windows, the freeze of approved
and signed-off versions and the approval and sign-off checks. A contract specialist reaches a practice under a support
grant, as a support engineer does.

Mapping, coverage and contract screens (ADR 0030): Payer and plan mapping (`/p/<practice>/mapping`, unmapped plans and
their dollars first; a plan's page shows its mapping history and how its lines resolve now), Coverage
(`/p/<practice>/coverage`: zero priced until pricing runs, the unpriced reasons and remedies of the rules reference, the
dollars waiting on mappings, the request-to-payer letter as a text download) and Contracts (`/p/<practice>/contracts`:
tag an uploaded contract, exhibit or payer letter to its payer, the calendar, sign-off and answers to the specialist's
questions) are the customer's. The contract specialist abstracts, approves field by field and asks questions under
`/p/<practice>/abstraction`, opened under a support grant from the console's Specialist queue
(`/console/specialist-queue`), which counts each practice's work without reading a record. Questions live in
`contract_question` (encrypted with the practice's key).

Pricing (ADRs 0020 and 0029): `packages/pricing` is the expected-payment engine, phase one (Medicare Advantage
non-contracted and percent-of-Medicare terms). `price({ claim, release, settings, asOf })` is pure: the claim's line facts,
each with the agreement `agreementResolver` gave it, a release indexed by `indexRelease`, the practice settings (billing
ZIP, default rounding, the place-of-service split) and the triage date in; one priced or unpriced line out per input line,
each with its JSON trace (`tp-pricing-trace/1`), which `recompute(trace)` reproduces without the engine or a database.
`pnpm test:golden` prices every golden claim with the engine and compares it with `fixtures/golden` beside the worksheet,
the variance and the dispute window included (`--report` adds `fixtures/golden/.report/engine.{json,md}`);
`@tp/pricing/testing` builds SYNTHETIC inputs for tests. Claim status 19 prices, 20 and 21 are `SECONDARY_PAYER`, 23
and 25 stop for review (`ENGINE_ERROR` `claim_status_not_priced`, which pages no one); a rate record whose
timed-units rule is `UNKNOWN` leaves its lines `UNITS_RULE_UNKNOWN` (ADR 0033).

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

**Milestone 5 is not complete.** Its done check rests on "the specialist's 100 golden lines", and PRD 20 says milestone 5
cannot close without a reimbursement specialist. Every golden line in `fixtures/golden` (119 lines in 64 claims) was
computed by the independent worksheet, not by the specialist, and says `"specialist_verified": false`: the engine
matching them to the cent shows that two readings of the plan agree, not that either is right. A specialist finishes it
by answering every question in `fixtures/golden/QUESTIONS.md` (and ADR 0029's), checking each claim's worksheet, and
setting `specialist_verified` to true claim by claim; any changed answer becomes a reviewed golden change through
`/golden-diff`, never a regeneration.

**Milestone 3: the 2 GB check has been run.** Its done check includes "a 2 GB zip queues per file". The intake test
(`apps/worker/src/intake/intake.large.db.test.ts`) runs at 256 MiB by default; the 2 GiB run
(`TP_LARGE_ZIP_MB=2048`, one source document and one parse_835 job per entry, bounded memory) passed on
2026-10-15 in the build environment in 166 s against PostgreSQL 16. The weekly `large-zip` workflow repeats it
on CI's PostgreSQL 18.

**Milestone 2 is not complete.** Its done check asks for "code-set validation against release 1", and release 1 does
not exist (milestone 0's note below): the parser checks CARC and RARC against SYNTHETIC release 900001 in every test,
and against the newest published release in the worker, of which there is none yet. A person finishes it by loading
release 1's CARC, RARC and claim-status code lists (milestone 0) and running `pnpm test:db` and `pnpm test:oracle`
against it.

**Milestone 0 is not complete.** Its done check ("release 1 loads into an empty database") needs the 2026 CMS
and X12 files, which cannot be downloaded from the environment the repository was built in (cms.gov, x12.org
and ncdoi.gov refuse it). The drafts in `content/drafts` are hand-typed from the plan's own rules reference, a
secondary source, and stay at L1; they are not release 1 content. [content/sources/README.md](content/sources/README.md)
lists what a person with network access does to finish it.

| Path | What lives there |
| --- | --- |
| `apps/web` | Next.js App Router: UI, route handlers, server actions |
| `apps/worker` | pg-boss worker: intake, parse, price, triage, reconcile, digest and export jobs |
| `packages/*` | `db`, `edi835`, `contracts`, `rules`, `pricing`, `triage`, `packets`, `ledger`, `model-gateway`, `ui`, `synth`, `money`, `observability` |
| `infra` | AWS CDK app, one stack per environment |
| `tools` | log lint, content checker, release scripts, CI guards |
| `content` | global rule drafts, sources and prepared releases (CI publishes `content/releases`) |
| `fixtures` | synthetic and golden test data, never real |
| `docs/adr` | architecture decisions |
