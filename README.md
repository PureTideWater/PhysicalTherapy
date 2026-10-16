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
(`/p/<practice>/coverage`: the latest complete pricing run's priced shares and unpriced reasons by count, with the remedies of the rules reference, the
dollars waiting on mappings, the request-to-payer letter as a text download) and Contracts (`/p/<practice>/contracts`:
tag an uploaded contract, exhibit or payer letter to its payer, the calendar, sign-off and answers to the specialist's
questions) are the customer's. The contract specialist abstracts, approves field by field and asks questions under
`/p/<practice>/abstraction`, opened under a support grant from the console's Specialist queue
(`/console/specialist-queue`), which counts each practice's work without reading a record. Questions live in
`contract_question` (encrypted with the practice's key).

Pricing (ADRs 0020, 0029 and 0034): `packages/pricing` is the expected-payment engine (Medicare Advantage
non-contracted lines and every contract method: fixed schedule, percent of Medicare, lesser of the schedule and the
line charge, per visit; the NCCI medically unlikely edit stops a line `MUE_EXCEEDED`, a procedure-to-procedure edit
raises an `NCCI_PTP` review flag that never changes the price, and a rate record may define its own percentage or cap,
applied last). `price({ claim, release, settings, asOf })` is pure: the claim's line facts,
each with the agreement `agreementResolver` gave it, a release indexed by `indexRelease`, the practice settings (billing
ZIP, default rounding, the place-of-service split) and the triage date in; one priced or unpriced line out per input line,
each with its JSON trace (`tp-pricing-trace/2`), which `recompute(trace)` reproduces without the engine or a database.
`pnpm test:golden` prices every golden claim with the engine and compares it with `fixtures/golden` beside the worksheet,
the review flags, the variance and the dispute window included (`--report` adds `fixtures/golden/.report/engine.{json,md}`);
`@tp/pricing/testing` builds SYNTHETIC inputs for tests. Claim status 19 prices, 20 and 21 are `SECONDARY_PAYER`, 23
and 25 stop for review (`ENGINE_ERROR` `claim_status_not_priced`, which pages no one); a rate record whose
timed-units rule is `UNKNOWN` leaves its lines `UNITS_RULE_UNKNOWN` (ADR 0033).

Pricing runs (ADR 0035): a billing manager or firm principal creates a run for whole months of service dates on the
Pricing runs screen (`/p/<practice>/pricing-runs`); `createPricingRun` (`@tp/worker/pricing`) refuses a release other
than the newest published one, a period with no lines and a plan with no mapping at all (MAP-01), and records the run
queued with the release and `ENGINE_VERSION`. The worker's `price` job (`apps/worker/src/price`, one practice per job,
one run of a practice at a time, idempotent by run, three attempts) resolves every line through `agreementResolver`,
prices it with `price()` under the run's release (read back from `rule_record`) and stores `priced_line` with its
amounts or reason, its adjustments, its window's end and its trace, then completes the run with its coverage summary in
the same transaction. The database refuses any change to a complete run or its lines, for every role. The run's page
shows its coverage, unpriced reasons, contract versions, variance by payer pattern and lines; each line opens its trace
(`/p/<practice>/lines/<line>?run=<run>`, every step with the rule records it read), and Claims and lines and Coverage read
the latest complete run. `apps/worker/src/price/price.large.db.test.ts` prices 100,000 lines (`TP_LARGE_PRICING_LINES`)
end to end in 55.2 seconds on the development container, against PRD 11's two minutes.

Re-runs, diffs and content rollback (ADR 0037): a complete run is priced again from its page under the release in force
(`createRerun`, `@tp/worker/pricing`): the same practice, period and lines (the original's cut-off), never changing the
original. A re-run's page shows its diff (`compareRuns`): exactly the lines whose expected allowed, unpriced reason,
adjustments, dispute window, review flags or terms (mapping, contract version, rate record) differ, what differs, both
sides, and each line's cause read from the two traces (a rule record whose value changed, a contract version, a mapping,
the claim, the settings, the engine, or another line of the claim). Any two complete runs
compare at `/p/<practice>/pricing-runs/compare?before=<run>&after=<run>`. A re-run is in effect only once a billing
manager or firm principal accepts it (`acceptRun`; the database checks the role and refuses everything else on a
complete run); Claims and lines, Coverage, the line trace, triage and the audit report read the run in effect (the
database refuses a report of any other run, `pricing_run_in_effect()`). The release note
(`/p/<practice>/releases?release=<n>`) shows what a release changed against the one before, the practice's runs in
effect pinned to another release, how many of a run's lines the release in force would change (priced in memory) and
a re-run button. The console's Rule releases (`/console/rule-releases`, platform administrators) shows the published
releases, their notes and record changes, the affected runs per practice as counts, and, from the content checkout the
server is given (`CONTENT_ROOT`; the repository in development), the drafts, the checker's result and "Prepare release
<n>" (`release:assemble`); publishing stays with CI. A content rollback withdraws the release in force
(`rule_release_withdrawal`; `current_rule_release()` is the newest published release not withdrawn): runs pinned to it
keep every line and are flagged, and the screens offer a re-run. SYNTHETIC release 900004
(`fixtures/synthetic/rules/release-synth-900004`, 900001 with the 97110 work RVU changed, built by
`tsx tools/release/synthetic.ts`) is PRC-19's "release 2".

Monitoring, digests and notifications (ADR 0039): once an 835 is done, its parse queues the monitoring chain, each step
a job of one practice keyed by type, practice and subject, three attempts and the operator's alert on the third. `monitor`
(after the rest of the upload batch has landed: it waits while an 835 is still on its way) creates a run for each month
of service dates whose newest line no run covers, under the release in force and in the job's own name
(`pricing_run.created_by_job_id`; a month with an unmapped plan waits); `price` prices it and, for a run the chain created,
queues `triage`, which tells the practice's people in the app and queues `reconcile`, the recovery ledger's step
(ADR 0042, below). The operator's daily `monitoring_schedule` (05:10 UTC, where
`OPERATOR_DATABASE_URL` is set) queues each active practice's `monitor` for the day (which first writes off, window
passed, every open case's line whose window has closed), `reconcile` for the day and `digest` for the month before:
one digest per practice and month, its figures fixed when recorded (new validated variance by payer, cases nearing
deadline, recoveries posted, coverage against the previous digest, contracts expiring), emailed once to each person who
keeps it on (`MAIL_FROM` for SES, otherwise `MAIL_OUTBOX_DIR`; fixed sentences, counts, dollar totals and one link) and
shown at `/p/<practice>/digests/<digest>`. `notification` and `digest` hold counts and totals only: their CHECKs admit
nothing but integers and integer cents keyed by a closed list of figure codes, nested only by payers' opaque IDs. People
read their own notifications at `/p/<practice>/notifications` and set their preferences at `/account/notifications` (in
their own `user.settings`). The monthly variance summary (`/p/<practice>/reports/monthly?month=<YYYY-MM>`, with its CSV)
counts each line of a month once, from its pricing in effect, at the furthest stage it has reached, by payer and in all,
never adding stages together. The notifications, preferences and the summary were pulled forward from milestone 11 and
the v1 reports (ADR 0040); the summary's PDF export comes with the other v1 reports.
`apps/worker/src/monitor/monitor.db.test.ts` runs the chain on SYNTHETIC files through the worker loop: replays of every
step with no duplicate effect (JOB-01), three failures with the alert and the dashboard's run-failed record (JOB-02),
and the digest's counts and totals with no PHI column read (JOB-03).

Packets, submissions and payer responses (ADR 0041): `packages/packets` assembles a packet version from a case and
its approved records (the practice and payer, the signed-off contract version's verified rate record with its document,
page, quoted clause and page hash, or the Medicare Advantage regulation; the rule releases; the pattern statement's
facts; the line schedule with each line's trace reference; prompt-pay interest from the state record as its own line;
the evidence list with its gaps; the requested action), drafts the pattern statement by code, and holds the verifier:
every figure of a narrative must be among the version's inputs and every sentence must cite one of its numbered sources
(`verifyNarrative`, no options). Identifiers are placeholders in every version (`{{claim_control_number:3}}`) and are
inserted from the claim and patient records only by the `packet_export` job, which prints the PDF with Chromium, writes
the CSV schedule, stores both sealed and records their SHA-256 on the version. The database holds the rest
(`20261023090000_packets_submissions_and_responses.sql`): a version never changes (an edit is a new version, which
clears the approval); approval needs a passing verifier (a CHECK), the version's hash and `packet.approve`, and refuses
the packet's drafter and the version's writer unless no one else may approve the practice's packets, then only 24 hours
after writing, flagged `approved_alone`; a Medicare Advantage non-contracted packet waits for a contract specialist's
confirmation; only the job exports, once; a submission carries the export's hashes and follows up in 45 days; a
response answers the latest submission, and a denial with a category may reopen the case for the next dispute level
within its window. A case's state (submitted, awaiting response, partially resolved, resolved) now derives from its
lines and submissions. Recording a response writes no ledger entry and no stage. The workflow is `@tp/worker/packets`
(`writePacketVersion`, `approvePacketVersion`, `confirmRegulation`, `requestPacketExport`, `logSubmission`,
`recordPayerResponse`, `submissionLog`, `followUpsDue`, `acceptedPayerResponses` for the ledger); its screens are
milestone 8's second part. `apps/worker/src/packets/packets.db.test.ts` runs CAS-08 to CAS-15 and LED-01 on SYNTHETIC
fixtures.

The recovery ledger (ADR 0042): `ledger_entry` (`20261023120000_recovery_ledger.sql`) holds signed integer cents by
stage (approved, posted, deposited, recouped, reversed, adjusted, interest), each with its evidence, and no role can
update, delete or truncate one (LED-10); a correction is a new entry. Every entry but a payer response's approval comes
from a standing `ledger_match` of its evidence, so nothing is posted or deposited without a matched export row, and a
line reaches payer approved or recovered only where its entries put it (the database refuses any other event: the
flagged-as-recovered shortcut fails). `packages/ledger` holds the pure rules at 100% branch coverage with fast-check
properties: `ledgerTotals` (recovered is the practice's proof level, posted by default or deposited, plus recoupments,
net of reversals; approved and interest are their own figures; a forward balance counts nothing), the matching
decisions with a tolerance of zero, pro-rata allocation, the posting and EFT templates and the ROI statement. The
`reconcile` job (after triage, after intake stores a posting or EFT export, and daily) reads waiting exports into rows
once per fingerprint (LED-08), approves what accepted payer responses accept (`acceptedPayerResponses`), matches new
claims to open case lines by payer claim control number, then patient control number, service date and code
(approved for a higher allowed, LED-02; a recoupment for a lower one; a payment of what a response accepted confirms
it; otherwise a payer response "reprocessed, no change" through `recordPayerResponse`), lists what matches nothing for
a person (LED-03), posts each case line's share of a matched check (LED-04, allocated pro rata when the check posted
in part, LED-09) and deposits by TRN02 and amount (LED-05), takes back PLB WO and reversals at once, reopening the line
and its case and telling the owner (LED-06), records interest beside principal, and writes the quarter before's ROI
statement once, which the database checks against the entries it links (LED-11). A person with `posting.reconcile`
matches by hand and reverses a match with an exactly offsetting entry (LED-07) through `@tp/worker/ledger`, whose
screens are milestone 9's second part; the dashboard's recovered this quarter and the digest's recoveries now read the
ledger. `apps/worker/src/reconcile/ledger.db.test.ts` runs LED-01 to LED-11 and
`apps/worker/src/reconcile/ledger-oracle.db.test.ts` is the ledger oracle (PRD 18): five synthetic export scenarios
whose known outcomes are compared with plain SQL sums.

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
build runs with the local providers only for the e2e suite, which sets `TP_ALLOW_LOCAL_PROVIDERS=e2e`. The suite
prepares its own database (`E2E_DATABASE`, default `tp_e2e`, on `E2E_ADMIN_URL`'s server; `E2E_PORT`, default 3100),
with SYNTHETIC rule release 900001 loaded for its pricing run.

Global rule content (PRD section 9; [content/sources/README.md](content/sources/README.md) lists the files
release 1 needs):

```sh
pnpm rules:import --type <type> --year <year> --file <path> --url <url>   # a public CMS or X12 file -> L1 drafts
pnpm verify-content [dir...]       # the content checker: drafts and releases, or a fixture release
pnpm release:assemble <n>          # drafts at L2 or higher -> content/outgoing/<n> with RELEASE.md and MANIFEST.json
pnpm release:dry-run <n>           # what release n changes, and how many lines of each complete run in DATABASE_URL it would change
pnpm release:load <n> [--dir <d>]  # load a published release (or a directory outside fixtures/) into DATABASE_URL
pnpm release:rollback <n> --reason <text>  # withdraw release n, the one in force, loading the published release before it if needed
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

**Milestone 6 is not complete.** Triage, the five-stage status model, case grouping (report-only), the pursuit-cost
estimate, the audit report (PDF printed by Playwright's Chromium, plus the line CSV) and the independent reviewer's
checklist are built (ADR 0038; the Anomalies, Cases and Reports screens and the reviewer checklist). Its done check has
two parts. "An independent reviewer signs the checklist" works in the application: a reimbursement reviewer reaches the
practice under a support grant and signs over the report's SHA-256, and an unsigned report cannot be released. "The
three hand-run audits reproduce from the app line for line" remains open: it needs the three real audits and a
reimbursement specialist, which this repository does not have. What stands in for it is the synthetic audit
`fixtures/synthetic/audit/AUDIT-01`: its declarative `inputs.json`, an 835 built from it by `packages/synth`
(`tsx packages/synth/src/audit-cli.ts` regenerates it), and the expected report and line CSV computed from the inputs
alone by `tools/audit-worksheet` (Python, `python3 -I tools/audit-worksheet/audit_worksheet.py write`). The test
`apps/web/src/lib/routes/audit-e2e.db.test.ts` uploads, parses, maps, signs off the contracts, prices, triages and
reports it through the routes and the jobs, and the report matches the worksheet figure by figure and line for line.
Triage and the report judge every line from its pricing in effect (ADR 0040): a per-visit line is judged with its visit
(at most the visit's net shortfall) and, with a line carrying an NCCI review flag, stays validated for review until the
specialist answers QUESTIONS Q44 and Q41; each case in a report shows this run's share beside the whole case, so the
headline, the cases and the line CSV reconcile. A platform administrator sets a practice's billing ZIP and its pricing
and triage settings (place-of-service split, rounding, materiality, anomaly and pursuit-cost settings) in the internal
console at `/console/practices/<practice>` until the practice's own Settings screen exists (milestone 11); pursuit cost
is "not estimated" until the staff rate and minutes are set.

**Milestone 7 is not complete.** Its engine part, its pricing runs and the re-run diffs under a new release are built
(ADRs 0034, 0035 and 0037): a re-run under SYNTHETIC release 900004, a "release 2" that changes one relative value,
lists exactly the two affected lines with their cause (test matrix PRC-19, `apps/worker/src/price/rerun.db.test.ts`),
and `pnpm release:dry-run` names the run and its two lines. The monthly monitoring jobs and their digests are built (ADR
0039). The done check against a real release 2 waits for real releases 1 and 2 (milestone 0's note below), and the golden
lines wait on the specialist, as milestone 5's do. Test matrix PRC-18 ("turning a flag off never lowers the amount")
holds for every method and flag but one case the specialist decides (QUESTIONS Q44): turning NCCI on can stop the line
that carries a per-visit amount for its medically unlikely edit, and the next line then carries the visit under its own
patient share and modifiers, so the claim's total can rise. The reading that makes PRC-18 hold everywhere (the first
included line carries the visit whatever its outcome) changes what golden line G146 expects, which only the specialist
may do; `packages/pricing/src/properties.test.ts` compares every other claim and states the exception as an example.

**Milestone 5 is not complete.** Its done check rests on "the specialist's 100 golden lines", and PRD 20 says milestone 5
cannot close without a reimbursement specialist. Every golden line in `fixtures/golden` (326 lines in 150 claims, 207 of
them milestone 7's across five fixture payers, whose done check needs the specialist too) was
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
| `apps/worker` | pg-boss worker: intake, parse, monitor, price, triage, audit report, reconcile, digest and export jobs |
| `packages/*` | `db`, `edi835`, `contracts`, `rules`, `pricing`, `triage`, `packets`, `ledger`, `model-gateway`, `ui`, `synth`, `money`, `observability` |
| `infra` | AWS CDK app, one stack per environment |
| `tools` | log lint, content checker, release scripts, CI guards |
| `content` | global rule drafts, sources and prepared releases (CI publishes `content/releases`) |
| `fixtures` | synthetic and golden test data, never real |
| `docs/adr` | architecture decisions |
