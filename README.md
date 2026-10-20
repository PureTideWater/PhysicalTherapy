# PaidWhole

A contract-payment verification platform for outpatient therapy practices and their billing firms. It ingests copies of 835 remittances and payer contracts, computes expected payment per service line under approved contract versions, groups shortfalls by payer pattern into dispute packets a person approves, and proves recovery by reconciling later remittances to payment posting and deposits.

The build specification is in [docs/product/PRD.md](docs/product/PRD.md), with its reference tabs: [data dictionary](docs/product/data-dictionary.md), [rules reference](docs/product/rules-reference.md), [test matrix](docs/product/test-matrix.md) and the [milestone prompts](docs/product/milestone-prompts.md).

No real PHI, real 835, real contract or real export ever enters this repository.

## Development

Prerequisites: Node 24 (see `.nvmrc` and `engines`; Node 22 runs everything with an engine warning), pnpm 10.28 (`corepack enable` or
`npm install --global pnpm@10.28.0`), and Docker for `pnpm dev`. The local database is PostgreSQL 18, the version CI's
`postgres:18` service and production (`infra/lib/constructs/database.ts`) run; `pnpm dev` starts it from
`docker-compose.yml`. Nothing in the test suites needs Docker: database tests use `DATABASE_URL`, defaulting to the
docker-compose Postgres at `postgres://postgres:test@localhost:5432/postgres`. To run them as CI does against a
PostgreSQL 18 server of your own, point `DATABASE_URL` at its superuser (a UTF-8 cluster with password logins, as the
image initializes one); `E2E_DATABASE` and `E2E_PORT` keep an end-to-end run apart from another on the same machine:

```sh
export DATABASE_URL=postgres://postgres:test@localhost:5433/postgres   # a PostgreSQL 18 superuser
pnpm db:migrate && pnpm test:db
E2E_DATABASE=tp_e2e_pg18 E2E_PORT=3391 pnpm test:e2e
```

An older server (16 or 17) runs the suites too, apart from the domain model test (below), but CI and production run
18, so a change is checked there. The restore drill through `pg_dump` needs client tools at least as new as the server (`PG_BIN_DIR`); without them that one
database test skips and says why.

```sh
pnpm install
pnpm typecheck && pnpm lint && pnpm lint:logs
pnpm lint:copy       # the product-copy lint's findings (CO-11; pnpm test runs it too)
pnpm test            # unit and property tests, with the 100% branch gates
pnpm test:db         # database tests (each creates and drops its own database)
pnpm test:e2e        # builds the web app and runs the Playwright journeys, with the axe check
pnpm build           # web (Next.js standalone) and worker (esbuild bundle)
pnpm dev             # Postgres and MinIO in Docker, then the web app and the worker
pnpm db:migrate      # roles, then forward-only migrations as the owner role (--dev-login: local app login)
pnpm db:migrate --dry-run   # apply the pending migrations in one transaction and roll it back
pnpm db:domain-model --check --strict   # docs/product/domain-model.md against the migrated database (--out rewrites it)
pnpm db:domain-model --summary-since origin/claude/build-platform   # what changed since the last approved document (no database)
pnpm licenses:check  # production dependency licenses against tools/check-licenses/allowlist.json
pnpm synth --all     # regenerate every synthetic fixture (deterministic; --case <id>, --large for PAR-29)
pnpm test:oracle     # pyx12 and packages/edi835 read every synthetic 835 and must agree (TP_ORACLE_PYTHON: a python with pyx12)
```

The pre-push hook (`.githooks/pre-push`; docs/adr/0063, audit item #20 (e)) checks on your machine, before GitHub
receives them, the files and secrets CI's fixture and gitleaks steps would only find after the push. Install it once
per clone, after `pnpm install`, for the clone and every linked worktree of it:

```sh
pnpm hooks:install      # the launcher in the clone's own .git/hooks/pre-push (tools/pre-push/install.sh)
pnpm gitleaks:install   # the pinned gitleaks CI runs, its SHA-256 checked (tools/gitleaks/install.sh)
```

A Claude Code session does both when it starts (`.claude/hooks/session-start.sh`) and says in its context what is
missing. The launcher runs the `.githooks/pre-push` of the working tree a push is made from, whichever branch the push
sends; a working tree whose branch has none (cut before the hook, or from `main`, which has none until launch) is
refused. Push such a branch from a working tree of the clone that has the hook (`git push origin <branch>` there checks
its commits); a branch cut from `main` for a pull request into `main` is always pushed that way, never by merging
`claude/build-platform` into it. It replaces the first instruction, a relative `core.hooksPath` of `.githooks`, which
git skipped with no warning in any checkout of such a branch; the installer removes that setting, refuses any other
`core.hooksPath`, and never overwrites a pre-push hook of your own.
The hook finds gitleaks through `GITLEAKS` (an absolute path), then the pinned one, then `PATH`; it needs 8.19 or
later, and without one it refuses every push that sends a new commit and says so.

For each push it takes the commits the remote does not have yet (a new branch, an update, or a bare commit pushed by
its hash, as in `git push origin <sha>:refs/heads/salvage/x`), judged by the remote's tracking refs or, for a remote
you have not fetched or a URL, by what `git ls-remote` says it holds. It runs the fixture check over every file they
write, read from git's objects rather than the working tree (`tools/fixture-check/commits.ts`), and gitleaks over the
same commits with `.gitleaks.toml` and `.gitleaksignore`, merges read by what they add beyond their parents, with
color, external diffs and textconv drivers off, and refuses the push when gitleaks says it read fewer commits than
those that add a line. A refusal names the file, the commit and the rule, never the value; rewrite the commits without
it, and never push with `--no-verify`. A deletion, or a push of commits the remote already has, checks nothing.

The fixture check reads every CSV, TSV and spreadsheet; under `fixtures/` and `packages/synth/` every `.txt`, `.dat`
or extensionless file; every `.835`, `.837`, `.edi`, `.x12` and `.era` file; and by content every X12 interchange
(after white space or a UTF-8 or UTF-16 byte-order mark), zip, gzip, OLE2 file and PDF. A PDF passes only when
packages/synth wrote it (its Producer names the synthetic exhibit or scan writer), so a real contract or EOB is
refused. It also searches every text file, whatever its name and wherever it is, for an X12 interchange header
anywhere in it (after a line of other text, mid-line, in a Markdown code block) and refuses one whose ISA06 is not
SYNTHSENDER, by the pattern the edit hook (`.claude/hooks/fixture-guard.sh`) applies to what a session writes; prose
that only names the segment ("ISA*00 opens an interchange") passes. It cannot judge a picture: an image of a document
is not read, and never belongs in the repository.
`tools/hooks/pre-push.test.ts` runs the hook through real pushes.

The domain model gate (CO-02; reconciliation-001, D1 and D2): `docs/product/domain-model.md` describes the schema the
migrations build, by area: every table and view with its keys, PHI flag, row-level security, policies, invariants and
privileges, and every divergence from the Data dictionary tab with its reviewed explanation. It is generated, never
edited by hand. `pnpm db:domain-model` (`packages/db/src/domain-model`) reads the catalog of the database at
`DATABASE_URL` (or `--database-url`) in a read-only transaction and migrates nothing; the area map and the explanations
are `packages/db/domain-model/areas.json` and `divergence-explanations.json`. To regenerate it, on a new database:

```sh
psql postgres://postgres:test@localhost:5432/postgres -c 'CREATE DATABASE tp_domain_model'
export DATABASE_URL=postgres://postgres:test@localhost:5432/tp_domain_model
pnpm db:migrate && pnpm db:domain-model --out --strict
```

A table no area places, or under `--strict` an unexplained or stale divergence, exits 2; `--check` exits 1 when the
document differs from the schema. The commit and branch sit on a provenance line that `--check` ignores; it says so when
the generator's inputs had uncommitted changes. It is skipped only as the document's fifth line, where the generator
writes it, and only with a commit of 7 to 40 hexadecimal digits (or `unknown`) and a branch that is a git ref name
(letters, digits, `.`, `_`, `/`, `-`); the tool refuses any other `--commit` or `--branch` (exit 2), and a provenance
line moved elsewhere or with other text in those fields is compared and hashed like any other line. `pnpm test:db` makes
the same comparison on its own scratch database (`domain-model.db.test.ts`), so a migration merged without regenerating
the document fails. Its second case is the approval: the founder's name, a `YYYY-MM-DD` date (from 2026-10-16, when the
change order was issued, to today) and the document's SHA-256 on the "Approved by" line (`--require-approval`, which
prints the hash to sign when it refuses). The name must be exactly an entry of the reviewed approver list,
`packages/db/domain-model/approvers.json` (apart from spaces at either end, in the same case), and never a placeholder
(TBD, N/A, name, first name, last name, full name, founder, approver, VERIFY ONLY, Claude, in any case and their common
spellings such as T.B.D., N.A., VERIFY-ONLY or ClaudeCode, or text in angle brackets) or a name with no letters. The
list names each approver with the GitHub login whose review is the approval of record, and changes only under that
approval (docs/adr/0063): the `approval-of-record` job requires of a pull request that changes the approval line or the
list an APPROVED review of its latest commit from the login, on the base branch's list, of the person the line names,
never from its author. It passes, saying why, until the repository variable `APPROVAL_REVIEW_REQUIRED` is `true`
(`docs/runbooks/github-governance.md`, step 5). The hash covers every
line but that one (the last line) and the provenance line, and must be the hash of both the regenerated text and the
committed one, so any schema change, or an edit to the document alone, leaves it awaiting a new approval, and no
migration merges without one (CLAUDE.md, Schema gate). The document lists each applied migration's SHA-256 and each
function body's, and shows a disabled or replica-only trigger as not enforced, rewrite rules and default privileges, so
an edit to a migration after it was signed fails the gate too (`domain-model-drift.db.test.ts`). Milestone 1 does not
start until the founder approves the document; until then that case fails. The document records PostgreSQL's major
version beside the catalog's own text, so it is checked on PostgreSQL 18, as CI runs; on an older server its drift case
fails (on 16, at the version line alone).

Each approval opens with the changes since the last approved document (docs/adr/0063): `pnpm db:domain-model
--summary-since <ref>` compares the document at a git ref (the base branch, whose document is approved) with the working
tree's, or with the text `--out` or `--check` generates, and prints one line per change, row-level security, policies,
the PHI registry and grants first, then tables, columns, constraints, functions, triggers and the divergence rows, with
both documents' SHA-256 and approval state. CI's `check` job writes it into its job summary, and a pull request that
regenerates the document opens its description with it.

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
the weekly `large-zip` workflow runs 2048). Its memory bound counts what the path holds after full collections (the db
project's workers run with `--expose-gc`), never the garbage V8 has yet to collect, whose amount depends on the Node version.

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
never adding stages together, and lists every packet of the practice approved alone by its writer in a single-user
practice (the audit flag's gap, CAS-10; its CSV counts them). The notifications, preferences and the summary were
pulled forward from milestone 11 and the v1 reports (ADR 0040); the summary's PDF export comes with the other v1 reports.
`apps/worker/src/monitor/monitor.db.test.ts` runs the chain on SYNTHETIC files through the worker loop: replays of every
step with no duplicate effect (JOB-01), three failures with the alert and the dashboard's run-failed record (JOB-02),
and the digest's counts and totals with no PHI column read (JOB-03).

Packets, submissions and payer responses (ADR 0041): `packages/packets` assembles a packet version from a case and
its approved records (the practice and payer, the signed-off contract version's verified rate record with its document,
page, quoted clause and page hash, or the Medicare Advantage regulation; the rule releases; the pattern statement's
facts; the line schedule with each line's trace reference; prompt-pay interest from the state record as its own line;
the evidence list with its gaps; the requested action), drafts the pattern statement by code, and holds the verifier:
every figure of a narrative must be among the version's inputs and every sentence must cite one of its numbered sources
(`verifyNarrative`, no options). It reads a narrative as it shows (ADR 0047): each character in its NFKC form, so
fullwidth, superscript and mathematical digits are the digits they show; a hidden character (a zero-width space, a soft
hyphen, a direction control) and a figure in another script's digits fail it where they stand; counts, ordinals and
multiples in words (a dozen, the fifth, twice, half, a level IV appeal, March fifth) and fractions are figures; and the
case's own identifiers (the schedule rows' patient and insured names, member IDs and claim numbers, read from the
canonical records when the version is written) fail it wherever they appear, without regard to case, the report giving
positions only. A version stores its narrative in NFKC. Identifiers are placeholders in every version (`{{claim_control_number:3}}`) and are
inserted from the claim and patient records only by the `packet_export` job, which prints the PDF with Chromium, writes
the CSV schedule, stores both sealed and records their SHA-256 on the version. The database holds the rest
(`20261023090000_packets_submissions_and_responses.sql`): a version never changes (an edit is a new version, which
clears the approval); approval needs a passing verifier (a CHECK), the version's hash and `packet.approve`, and refuses
the packet's drafter and the version's writer unless no one else may approve the practice's packets, then only 24 hours
after writing, flagged `approved_alone`, and only with the current verifier's report (`tp-packet-verifier/2`); a
Medicare Advantage non-contracted packet waits for a contract specialist's confirmation, which they give on their
Regulations to confirm page (`/p/<practice>/abstraction/regulations`, under a support grant, counted on the console's
specialist queue); only the job exports, once, under the version's own practice and packet; a submission sends the
current version (or one an edit replaced, sent before the edit), carries the export's hashes and follows up in 45 days; a
response answers the latest submission, and a denial with a category may reopen the case for the next dispute level
within its window. A case's state (submitted, awaiting response, partially resolved, resolved) now derives from its
lines and submissions. Recording a response writes no ledger entry and no stage. The workflow is `@tp/worker/packets`
(`writePacketVersion`, `approvePacketVersion`, `confirmRegulation`, `requestPacketExport`, `logSubmission`,
`recordPayerResponse`, `submissionLog`, `followUpsDue`, `acceptedPayerResponses` for the ledger); its screens are
the workbench below. `apps/worker/src/packets/packets.db.test.ts` runs CAS-08 to CAS-15 and LED-01 on SYNTHETIC
fixtures. Mutation testing of the verifier (`pnpm stryker run stryker.verifier.config.mjs`, Stryker's command runner over
the packets unit suite, since under Vitest 5 the vitest runner reports these mutants survived without running a test)
scored 86.17% on 2026-10-16: 1,377 of 1,598 mutants killed (ADR 0047).

The workbench (ADR 0044; migration `20261024110000_case_workbench.sql`) is three screens under each case, every
filter and page in the URL with opaque IDs only:

- **Cases** (`/p/<practice>/cases`) lists cases by state, payer, owner and deadline (colored: passed, within 14 days,
  later) with their actionable totals. Beside them are the payer patterns waiting in the run in effect: ready, held
  below the case materiality, or joining an open case. A person with `case.work` opens a ready pattern as a case
  (`openCaseOnPattern`; a held one is refused, CAS-04) and sets the practice's per-line and per-case materiality, told
  the consequence first.
- **The case** (`/p/<practice>/cases/<case>`) shows its lines with their traces. A line past its window is struck
  through, marked `WINDOW_PASSED` and out of the actionable total. The case also shows its deadline, pursuit cost, the
  ledger's payer approved and recovered, its packet and dispute, its notes and a timeline read from every record of
  the case. People assign its owner, add notes, write a line off with a reason from the closed list (confirmed with
  its consequence) and reopen one with a reason. Notes, assignments and approval requests are `case_activity`,
  append-only, the words encrypted with the practice's key.
- **The packet builder** (`/p/<practice>/cases/<case>/packet`) shows the citation, the line schedule with traces,
  interest as its own line, the evidence list and the numbered sources. Identifiers show as placeholders. The narrative
  editor runs the server's own verifier check (`@tp/packets/check`) on every keystroke and lists the mismatches; the
  stored result of a saved version alone gates approval. The approval panel says what the database will answer:
  blocked with its reason, the drafter refused, a single-user practice's 24-hour countdown with its audit flag, or
  ready for a second person. A person requests approval; an approver approves; the export (PDF and CSV, `phi.export`)
  runs in the worker, and its history lists each version's SHA-256.
- **Submissions and responses** (`/p/<practice>/cases/<case>/submissions`) logs the submission (date, channel,
  reference, the export's hash attached) and the payer's response with its document (accepted, partial, denied, more
  information requested). Follow-ups default to 45 days and surface overdue on the dashboard; the daily monitor tells
  the case's owner in the app once when a follow-up has come with no response (`follow_up` notifications). A denial with a reason
  can reopen the case for a second-level dispute within its window.

Every mutation is a route in the registry with a Zod schema, a role check in the handler and in Postgres, an audit
event, and no effect when repeated. `apps/web/src/lib/routes/workbench-routes.db.test.ts` runs the screens' cases
through the routes. `apps/web/e2e/packets.spec.ts` is the milestone 8 done check in the browser: a figure not in the
input blocks approval, the drafter cannot approve, a second person approves and exports, and the export's hash is in
the submission log.

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
claims to open case lines by payer claim control number, then patient control number, service date and code, each
case line against its own line of the claim (`pairLines`: the same code, modifiers, units and date, else the same code
and date, one to one; ADR 0046) and against what the remittances have paid it (approved for a higher allowed, LED-02;
a recoupment for a lower one; a payment of what a response accepted confirms it, and a payment of part of it leaves a
shortfall for a person, never a take-back; otherwise a payer response "reprocessed, no change" through
`recordPayerResponse`), lists what matches nothing for a person (LED-03), posts each case line's share of a matched
check (LED-04, allocated pro rata when the check posted in part, LED-09; a row with line detail posts only its line;
no row proves more than its amount, which Postgres holds too) and deposits by TRN02 and amount (LED-05), takes back PLB WO and reversals at once, reopening the line
and its case and telling the owner (LED-06), records interest beside principal, and writes the quarter before's ROI
statement once, which the database checks against the entries it links (LED-11). A person with `posting.reconcile`
matches by hand and reverses a match with an exactly offsetting entry for each of its entries and their adjustments,
the latest first (LED-07). An entry's amount is corrected by a specialist (PRD 13; ADR 0047): `ledger.adjust`, which
only the contract specialist holds, under a support grant, on their Ledger corrections page
(`/p/<practice>/abstraction/ledger`), with a reason. Postgres keeps every row's entries between zero and its amount, a
line's posted and deposited at or below its approved, and every correction between zero and what its entry's evidence
shows, for every role; only
the reconcile job writes posting and EFT rows, from a stored clean export of their kind, and an export the database
refuses a row of is unreadable without stopping the rest (ADR 0046); the dashboard's recovered this quarter and the digest's recoveries now read the
ledger. `apps/worker/src/reconcile/ledger.db.test.ts` runs LED-01 to LED-11 and
`apps/worker/src/reconcile/ledger-oracle.db.test.ts` is the ledger oracle (PRD 18): five synthetic export scenarios
whose known outcomes are compared with plain SQL sums.

Reconciliation in the product (ADR 0043): the monitoring chain reconciles every upload batch. After a document whose
batch prices nothing, `monitor` queues `reconcile` keyed by the document; otherwise triage queues it after the run. So
an adjusted remittance or a PLB take-back reaches the ledger after its parse. The Reconciliation screen
(`/p/<practice>/reconciliation`, `?case=<case>` for one case's ledger) shows:

- the ledger's totals by stage, recovered with its proof level;
- the uploader for posting and EFT exports (the same scanned intake) and what became of each export;
- what matches nothing, beside its candidates and counted in no total;
- each case line's linkage from its remittance (ERA) to its posting and deposit, with recoupments, interest and entries;
- the ledger's entries.

A billing manager or firm principal (`posting.reconcile`) matches by hand and reverses a match, each with a reason and
a confirmation; a line's shortfall (an approval a remittance paid in part) is the contract specialist's to correct; a
corrected posting export's take-back row is listed beside the match it offsets. The posting template is mapped once at `/p/<practice>/reconciliation/template`, by the same people, through
`set_practice_posting_template` (migration `20261024120000_reconciliation_and_roi_documents.sql`; the proof level stays
the administrator's). It is a built-in template or the practice's own column mapping, previewed on a sample read in the
browser and never uploaded. ROI statements (`/p/<practice>/reports/roi`) are quarterly (the daily reconcile) or on
demand. Each figure is recomputed on its page from the entries it links. The worker's `roi_statement` job prints the
PDF through the audit report's Chromium pipeline and records its key and SHA-256 once; the CSV (`roiStatementCsv`)
lists each figure's entries. `apps/worker/src/reconcile/chain.db.test.ts` runs every LED case through the worker loop
and intake on SYNTHETIC files, and `apps/web/e2e/reconciliation.spec.ts` is J10 in the browser: payer approved, posted,
deposited, a recoupment, the ROI statement and a reversal. That is milestone 9's done check: the flagged-as-recovered
shortcut fails, a recoupment reduces recovered by its amount, and the ROI statement recomputes from its entries. With
milestones 8 and 9 built, `packages/synth` traces every case through milestone 9 to its tests
(`CODE_BUILT_THROUGH_MILESTONE`). Fees are the group's paid invoices, shared among its practices (milestone 11, ADR
0050). Pursuit hours stay at zero, stated on the statement, until a time log, which PRD 12 and 13 rely on ("replaced by actual logged time",
"pursuit hours logged") but no milestone of the plan schedules, so it is an open decision (ADR 0047). The proof level is set only through `setLedgerSettings` until the practice's Settings screen
(milestone 11): see the milestone 9 note below.

The practice dashboard and the Reports screen (ADR 0045; migration
`20261025090000_report_documents_and_export_history.sql`):

- **The dashboard** (`/p/<practice>`) shows the headline as three numbers, each linking to its stage: actionable (the
  Cases screen's figure), payer approved and recovered (the ledger's, at the practice's proof level). Flagged and
  validated sit below them with their labels and link to Claims and lines filtered to the stage (`?stage=`). Beside
  them are the data freshness (the last file, the last run, and the run-failed banner with its job reference), the
  coverage, cases by state, deadlines in 14 days, overdue follow-ups, recovered this quarter (the ledger's alone) and
  each queue with its count. With no file yet it shows "Upload your first 835 files".
- **The Reports screen** (`/p/<practice>/reports`) generates, lists and links every report:
  - audit reports, released once the reviewer signs;
  - the monthly summary;
  - ROI statements;
  - the coverage report, new: the Coverage screen as a PDF and a CSV.

  A coverage report or a month's summary (`report_document`) stores its figures as generated. The worker's
  `report_document` job prints the PDF; the CSV is computed from the stored figures. Each report's page has a link to
  share within the organization, with opaque IDs only. The export history lists every download of every report file
  from the audit log (`practice_export_history`), the line-level exports marked. The line CSV and a packet's export
  stay `phi.export`: a viewer is refused them and exports nothing.

The Playwright journeys run on a fresh e2e database in practices of their own: J8 (`triage.spec.ts`), J11
(`monitoring.spec.ts`, the digest landing in the local outbox) and J12 (`reports.spec.ts`). J10's payer response is a
step in `packets.spec.ts`. The e2e worker runs the monitoring chain's planning step for J11's and J10's practices
(`e2e/worker.ts`), so in J10 (`reconciliation.spec.ts`) every 835 reaches the ledger through the chain's own monitor,
price, triage and reconcile; the spec only starts the monitor job a parse queued without its two-minute batch wait
(`chainFrom` in `e2e/journeys.ts`). What the e2e does not wait for is the daily schedule: J11 queues the day's monitor
and `packets.spec.ts` the day's reconcile, each as `queueMonitoringSchedule` queues it. Each journey runs axe-core's
WCAG 2.1 AA rules on the screens it touches and moves through
one control by keyboard (`e2e/a11y.ts`).

The model gateway (ADR 0048; `packages/model-gateway`; migrations `20261029090000_model_gateway.sql` and
`20261029100000_model_gateway_operator.sql`) is the only code that calls a model; the lint refuses the provider SDKs
anywhere else, and `src/lint.test.ts` proves it on a fixture test file. `ModelGateway` exposes the four purposes
(`proposeContractTerms`, `readDenialLetter`, `draftPacketNarrative`, `suggestEvidenceRequests`), each with a pinned
prompt version under `prompts/<purpose>/v<n>/` (with a changelog per prompt), an output schema and a verifier, and
each call logs one `model_call` row of hashes, counts and codes (never text). The provider is configuration:
`MODEL_PROVIDER=bedrock` (the production default: `BEDROCK_REGION` or `AWS_REGION`, optionally `BEDROCK_ENDPOINT` for
the VPC endpoint), `anthropic` (`ANTHROPIC_API_KEY`) or `local` (the default elsewhere: the deterministic provider,
which answers only outputs registered for the exact request, from code or `MODEL_LOCAL_FIXTURES_DIR`). Model
identifiers are pinned per prompt version in its `prompt.json`; prices are in `config/models.json`, and production
refuses a real provider until a person confirms them there. Outside production the gateway sends no practice's material
to a real provider. The kill switch (`model.kill_switch`), the denial-letter reader (`model.read_denial_letter`, v1.5,
off by default) and the daily budget (`model.daily_budget_cents`, 500 by default) are rows in `feature_flag`, set by a
platform administrator on the console's model features screen (`/console/models`, which also shows each practice's model
calls and cost today against its budget) through `set_feature_flag()`; each attempt is cut at 60
seconds with one retry under the same idempotency key. Before a call the gateway holds the most it can cost against the
practice's budget under a per-practice lock (`model_budget_hold`, migration `20261031090000_model_budget_holds.sql`), so
calls made at once cannot all pass it, and the budget codes it logs raise an alarm to the operator (ADR 0054). Verifiers
match a written amount, percentage, year or date as a whole figure of its quote and a code as a whole token; terms are
proposed only from a contract or an exhibit; the letter reader refuses a letter without its patient's identifiers or
naming another patient of the practice; a narrative figure must sit in its role (ADR 0054).

The gateway in the product (ADR 0052; `apps/web/src/lib/models`, routes in `src/lib/routes/models.ts`; migrations
`20261029190000_model_proposals.sql` and `20261029191000_practice_data_rights.sql`): on a draft version's Rate record
review the contract specialist can have the model propose the terms from one of its documents; candidates whose every
field checks against its page become model rate records the specialist still approves field by field, and the rest stay
on the screen for hand entry. The packet builder can draft a version's narrative with the model, written and verified
as any version and approved by a second person; the coverage screen can suggest what to obtain for its gaps. Each call
runs in the person's name and is logged in `model_call`; what it proposed is a `model_proposal` row; the decision
(accepted, accepted with the changed fields named, rejected) is recorded when the person approves the version, sends
the packet for approval or keeps the checklist; a corrected contract proposal becomes an evaluation example only under
the practice's signed data-rights agreement. With the kill switch on, the budget spent or no model path configured,
the screens offer hand entry and nothing is sent. The e2e suite runs the gateway on the local provider
(`MODEL_LOCAL_FIXTURES_DIR`, written by `e2e/models.ts`).

The evaluation (ADR 0051; `packages/model-gateway/eval`): 40 synthetic contracts and exhibits (tables, prose, scanned
image-only PDFs with their recorded Textract lines) with ground-truth rate records, and 300 synthetic narrative cases
with their required facts, generated by `pnpm synth --all` into `fixtures/synthetic/MOD-01` and `MOD-03`.
`pnpm --filter @tp/model-gateway eval` scores a provider field by field (precision and recall) and runs every narrative
through the packets verifier; `eval/baseline.json` holds the committed baseline, and `pnpm test:golden` fails a change
that lowers either, puts a quote off its page or lets one narrative fail. CI runs it on the local provider, which
proves the path and the gate (injected faults fail it), not a model. Each baseline entry records its prompt version's
content hash; CI's `tools/check-releases-immutable.sh` refuses an edit to a released prompt version, and production
refuses a real provider until the baseline records the gate for every current prompt version and model it pins
(`--variant ambiguous` evaluates the larger contract model). Inside the PHI boundary the worker image's
`evaluate-permitted` task (`node dist/evaluate-permitted.js --practice <id> [--report <file>] [--against <file>]`, or
`pnpm --filter @tp/worker eval:permitted`) replays a practice's permitted examples through the gateway in its own scope
and reports field-level counts, problem codes and example IDs only; with `--against` any regression exits 1 (ADR 0054).

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

Production compute (ADR 0049; `infra/`): each environment's stack runs the web app, the worker's practice jobs and its
platform jobs as three Fargate services (`WORKER_JOBS=practice` and `platform`; unset, one worker runs both) in private
subnets, behind an HTTPS-only load balancer with a WAF web ACL (rate limits and AWS managed rules), with CloudFront for
`/_next/static/` and `/brand/` only (the web image built with `--build-arg STATIC_ASSET_ORIGIN=<StaticAssetsOrigin>`
loads its assets from there, ADR 0055; email embeds the brand's lockup from there, ADR 0058). A migration task (the
worker image's `dist/migrate.js`, then `dist/logins.js`, which creates the application, operator, queue and billing
logins from their secrets) runs before any service moves to a new release; pg-boss connects as its own login in the
role `tp_queue`, which owns the `pgboss` schema. Deploy-time values (host names,
certificates, the sender, the image tag) are CloudFormation parameters; `-c tp:skipMigrations=true` redeploys a previous
image. Uptime, certificate-expiry and failed sign-in alarms go to the operator. Nothing has been deployed.

Billing (ADR 0050; `packages/billing`, `apps/worker/src/billing`; migration `20261029150000_billing.sql`): an
organization's administrator (a group's practice administrator, a firm's principal) manages its plan (monthly or
annual), its payment method (ACH or card, through Stripe Elements) and its invoices at `/settings/billing`; platform
administrators see every organization's standing and issue audit invoices at `/console/billing`. Stripe's events arrive
at `POST /api/billing/webhook`, verified by signature and recorded once by event ID. Billing's transactions run as the
role `tp_billing`, which has no privilege on any table that can hold PHI, on a login of their own that alone may switch
to it (`BILLING_DATABASE_URL`; locally `tp_billing_dev`), never the application's (ADR 0055). An invoice unpaid 30 days after its payment
failed suspends the organization: new runs are refused with the reason (routes, jobs and the database), every screen
stays readable, and runs start again the moment it is paid. The nightly `usage_snapshot` job counts each organization's
practices for milestone 12. Development and the e2e suite run a local simulator of Stripe's test mode (its test bank
accounts and cards are on the billing page; `BILLING_LOCAL_DIR` holds its state). `docs/runbooks/billing.md` lists what an
operator sets before launch.

Customer sign-in and production readiness (ADR 0053; routes in `apps/web/src/lib/routes/onboarding.ts`,
`console-onboarding.ts`, `settings.ts`, `support.ts`, `compliance.ts`; migrations `20261030090000` to `20261030110000`):
the public audit request at `/request-audit`; the console's audit requests, invitations (seven days, sent again by an
administrator), agreements by upload or by the e-signature vendor's signed webhook (`/api/agreements/webhook`), and terms
of use by version, which every customer accepts at `/terms` before anything else; the practice's Settings sections
(`/p/<practice>/settings`) and the organization's users and roles; CSRF tokens and origin checks on every mutation,
rate limits in Postgres, a nonce-based Content-Security-Policy and the fixed security headers; the maintenance switch,
the public `/status` page, error pages, help on every screen and support tickets at `/support`; and the SOC 2 Type I
evidence checklist at `/console/compliance` (`packages/compliance`), whose export the compliance platform ingests. The
policies are drafts in `docs/policies/` for the security official; the incident runbook is
`docs/runbooks/incident-response.md`. Production needs `SUPPORT_EMAIL` (the stack's `SupportEmail` parameter),
`SECURITY_EMAIL` (`SecurityEmail`), `TRUSTED_PROXY_HOPS` and `TP_ENVIRONMENT`, which the stack sets, and an https
`APP_ORIGIN`.

The security contact (audit item #20 (f)): `/.well-known/security.txt` (RFC 9116) names `SECURITY_EMAIL` as its Contact,
the public disclosure page `/security` as its Policy, English as its language and its own address under `APP_ORIGIN` as
Canonical, with an `Expires` date set in `apps/web/src/lib/security/disclosure.ts`; `disclosure.test.ts` fails 30 days
before that date, when the address is checked and the date moved on, less than a year ahead. That failure is in `pnpm
test`, so from 30 days before the date (2027-03-31 for today's 2027-04-30) every pull request's `check` is red until the
renewal merges; the change-management policy's quarterly review renews it when fewer than 120 days remain. The page says
how to report, what to include, what not to do and what to expect, with no sign-in and no form. Production refuses to
start without `SECURITY_EMAIL`, or with it equal to the support address, whose mail opens tickets only for accounts. Its
response times and its good-faith research statement are drafts for the security official and counsel, listed in
`docs/product/legal-surfaces.md` and marked where they render (`data-legal-surface`), which
`tools/test/legal-surfaces.test.ts` holds together; a production server leaves both out until their review is recorded.

Review fixes for milestones 10 and 11 (ADR 0055): a model call never waits on the connection its request holds (the
gateway's store has its own small pool, every pool gives up on a connection after ten seconds, a server makes at most
four model calls at once and a practice two, and the load balancer checks `GET /api/health`, which touches the
database); the e-signature webhook records agreements as `tp_esign` from its own login (`ESIGN_DATABASE_URL`; locally
`tp_esign_dev`); request bodies are counted as they stream and refused past their route's limit; support tickets are
screened for written dates, names after a title and identifiers; an invitation to an address already in use answers
the same way wherever the address belongs; platform administrators suspend and reinstate an organization from the
console; a late `invoice.payment_failed` still starts the dunning clock, the dunning job reaches every new failure, and
an organization subscribes once; mail to the support address opens a ticket (SES receiving into the stack's support
inbox, the platform `support_mail` job; locally `.eml` files in `SUPPORT_MAIL_DIR`; docs/runbooks/support-mail.md);
deployed intake reads scanned pages with Textract; and the deploy, restore-drill and key-rotation runbooks are in
`docs/runbooks/`. `docs/runbooks/github-governance.md` is the founder's guide to the repository's GitHub settings: a
company organization on GitHub Team, a private repository, the build agent's own account, the rulesets for
`claude/build-platform`, `main` and the release tags with the founder's approval on every pull request,
`APPROVAL_REVIEW_REQUIRED`, approving from the GitHub app, the content publisher and the launch (docs/adr/0063).

The brand and the product's words (ADRs 0056 to 0058; Change Order 001, CO-01 and CO-11): `packages/brand`
(`@paidwhole/brand`; its README is the drop-in's wiring guide, headed by where this repository differs) holds the tokens,
the mark, the fonts, the logo art and the product's words (the tagline, the descriptor, the independence claim, the seal
and badge text and the Verified definition); the specification is [docs/brand/BRAND.md](docs/brand/BRAND.md). The web
app wears it through `packages/brand/src/tailwind-theme.css`, `next/font/local` (`apps/web/src/lib/fonts.ts`) and
`apps/web/src/components/brand`; the worker's PDFs through `apps/worker/src/report/brand.ts`; email takes the lockup's PNG
from the CloudFront static host (`STATIC_ASSET_ORIGIN`; with none, mail goes without the art), while the application's
own response headers stay as ADRs 0053 and 0055 set them. The Verified seal and badge render only from the ledger's
`reportReconciliation()` (ADR 0057). `pnpm test` holds the rules: hex colors stand only in `tokens.css`, `tokens.ts` and
`mark.ts` in `packages/brand/src` and in the email template (`tools/brand-colors`); no source names Google's font hosts
(`tools/brand-fonts`, beside an ESLint rule against `next/font/google`); and the copy lint (`tools/brand-copy`) refuses
ProofPack, AI and intelligence in product copy, "recovered" without posted or deposited, and the brand's words typed out
instead of imported, with a reviewed exception only as a `brand-copy-exempt: <reason>` comment; stage values and other
codes are not copy and keep their names. The brand journey (`apps/web/e2e/brand.spec.ts`) compares the header at 1280
and 390 px and the report cover with and without the seal, and at a strict tolerance the header's lockup band and the
cover's top band, against baselines in `apps/web/e2e/brand.spec.ts-snapshots/`, beside computed checks of the lockup's
colors, face and place and the cover's ground; the baselines are made with Playwright's Chromium on Linux, which CI
installs before the unit tests. After a deliberate change to either, or
an upgrade of `@playwright/test`, regenerate them on Linux with
`pnpm --filter @tp/web exec playwright test e2e/brand.spec.ts --update-snapshots`, look at them and commit them.

**Milestone 11 is not complete.** Its done check is "a new customer signs up, enrolls MFA, pays by test ACH and reaches
the dashboard; Type I readiness checklist green". The first half holds on the local providers
(`apps/web/e2e/onboarding.spec.ts`): Cognito's invitation email through SES, a real e-signature vendor and Stripe are
not reached from the build environment. The checklist is not green, and the repository cannot make it so: every
repository source of evidence is in place and checked on each build (`packages/compliance/src/controls.test.ts`), but
the six policies await the security official's approval, none of the people's records (access and vendor reviews, the
tabletop, the risk analysis, the attestations, the security official) exists, no restore drill has run in an
environment, and the deletion test and the monthly report of reads by role are milestone 12's. The criteria mapping is
a proposal for the security official and the auditor.

**Milestone 11's billing is not verified against Stripe.** Its done check is "a test ACH payment completes; a suspended
organization can read but not run". Both hold against the local test-mode simulator (`apps/worker/src/billing/billing.db.test.ts`,
`apps/web/src/lib/routes/billing-routes.db.test.ts`, `apps/web/e2e/billing.spec.ts`), and the Stripe provider is tested
against the SDK with a mocked client; no call has reached Stripe (no keys, and api.stripe.com is refused from the build
environment). A person with Stripe test keys finishes it in staging as the runbook's step 4 says. The plan and audit
prices in `packages/billing/config/plans.json` are placeholders (`confirmed: false`), which production refuses to bill at.

**Milestone 10 is not complete.** Its done check is "every quote verifies, the narrative gate passes with zero
failures, and the lint fails a test file that imports the provider directly". The lint check is met
(`packages/model-gateway/src/lint.test.ts`). The verifiers, the evaluation harness on the 40 synthetic contracts and the
300 synthetic narratives (742 of 742 fields, no quote off its page, 300 of 300 narratives passing; ADR 0051) and the
features on their screens (ADR 0052; `apps/web/src/lib/routes/models-routes.db.test.ts`, `apps/web/e2e/models.spec.ts`)
are built and tested, but only on the local deterministic provider: the build has no model access, so no real model
has answered anything. The real gate needs a model: `pnpm --filter @tp/model-gateway eval --provider configured
--record` run with credentials on the synthetic sets, and `evaluate-permitted` inside the PHI boundary on the practices'
permitted examples, before the milestone closes; until a real provider's entries are committed, production refuses it
(ADR 0054). The Bedrock and Anthropic providers are tested against their SDKs with mocked clients, and
their pinned prices are unconfirmed (ADR 0048). PRD 20's choice of model path waits on counsel's read of both
agreements; Bedrock is the default until then.

**Milestone 9's proof level is set in Settings.** The practice administrator sets posted or deposited at
`/p/<practice>/settings/proof-level` (milestone 11, ADR 0053), which states and counts what the change does to lines
already recovered before it is saved, and queues the reconcile that applies it.

**Milestone 1 is not complete.** Its done check includes "the restore job runs on staging", and nothing can be deployed
from the environment the repository was built in (no AWS credentials, no Docker to build the images). Everything the drill
needs is in the stack now (ADR 0019 and 0049): the platform service runs the platform jobs, the restore drill among them,
under `OperatorRole` with the operator login and every `RESTORE_DRILL_*` setting. A person with staging credentials
finishes it:

1. Deploy staging as ADR 0049's "Deploying" says: the first deploy with ImageTag `none`, the images pushed under a release
   tag, then the deploy with that ImageTag, whose migration task migrates and creates the logins.
2. Let the platform service run the drill on its schedule (the first Monday of each month, 06:00 UTC).
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
console at `/console/practices/<practice>`; the practice's own Settings screen (milestone 11) sets materiality and the
pursuit cost, which is "not estimated" until the staff rate and minutes are set.

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
2026-10-15 in the build environment in 166 s against PostgreSQL 16, and on 2026-10-17 in 223 s against PostgreSQL
18.4 on Node 24, with memory measured after full collections. The weekly `large-zip` workflow repeats it on CI's
PostgreSQL 18.

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
| `packages/*` | `db`, `edi835`, `contracts`, `rules`, `pricing`, `triage`, `packets`, `ledger`, `model-gateway`, `ui`, `synth`, `money`, `observability`, `brand` (`@paidwhole/brand`: tokens, the mark, fonts and logo assets) |
| `infra` | AWS CDK app, one stack per environment |
| `tools` | log lint, content checker, release scripts, CI guards |
| `content` | global rule drafts, sources and prepared releases (CI publishes `content/releases`) |
| `fixtures` | synthetic and golden test data, never real |
| `docs/adr` | architecture decisions |
| `docs/brand` | the PaidWhole brand specification ([BRAND.md](docs/brand/BRAND.md)) |
