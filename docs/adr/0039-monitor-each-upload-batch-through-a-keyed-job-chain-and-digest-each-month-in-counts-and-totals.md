# 0039. Monitor each upload batch through a keyed job chain, digest each month on the operator's schedule, and keep notifications to counts and totals

- **Status:** accepted (amends 0004 for the monitor and reconcile subjects, and 0038 for triage of the chain's runs;
  amended by [0040](0040-judge-lines-from-their-pricing-in-effect-hold-per-visit-and-ncci-lines-for-review-and-set-practice-settings-in-the-console.md): the daily monitor closes passed windows, figures keyed by a closed list, and what was pulled forward from milestone 11;
  amended by [0064](0064-resolve-a-split-zips-locality-from-the-zip-plus-four-files-ranges-the-one-engine-change-the-freeze-allows.md):
  months that wait on the practice's pricing location, and a location save that queues the plan by its request,
  "Amendment (PR 6b-2)" below)
- **Date:** 2026-10-15
- **Deciders:** founder (engineering)
- **PRD sections:** 5 (J11, J12), 6 (Monitoring jobs and notifications; Reports and exports), 7 (Practice dashboard,
  Reports, Settings), 8 (job and job_run, notification, digest; pricing_run), 15 (Worker; Email), 18 (Layers:
  Integration), 19 (Runbooks: Job failure; Monitoring and alerts); Data dictionary, Operations; test matrix JOB-01 to
  JOB-04; milestone 7 prompt; ADRs 0004, 0019, 0035, 0037, 0038

## Context

Milestone 7 asks for "the monthly monitoring jobs (parse, price, triage, reconcile) with singleton keys, and digests
that carry counts and totals only". J11: "On each new upload batch (or on a schedule), the worker parses, prices under
the current versions, triages, updates the ledger and sends a digest email with counts and dollar totals only (no
PHI): new validated variance by payer, cases nearing deadline, recoveries posted, coverage changes, contracts
expiring. Failure: a failed job retries three times, then raises an alert to the operator and shows on the practice
dashboard as last run failed." PRD 6 adds "schedules" and "in-app notifications"; PRD 8 says notification and digest
hold "counts and totals only" and "no PHI field exists on the table"; J12 asks for the monthly variance summary with
"headline totals never mix stages".

What the plan leaves open: what an "upload batch" is (nothing records one: a browser asks for one PUT per file, a zip
expands into entries), who creates a pricing run nobody asked for (pricing_run.created_by was a person), which period
a monitoring run prices, what the digest's period is and when it goes out, which step sends it, how a job that reaches
many practices stays one practice per job, how "no PHI column referenced" is proven, where preferences live, and what
reconcile does before the ledger exists.

## Decision

**The chain, one practice per job, each step keyed.** Every step is its own pg-boss queue with the exclusive policy,
three attempts with backoff, the operator's alert line on the third failure and a job_run row per attempt (ADRs 0004
and 0019, unchanged). The keys are type, practice and subject; the subject is the step's idempotency key in job_run:

| Step | Queued by | Subject | What it does |
| --- | --- | --- | --- |
| parse_835 | intake | the document | as before; when the document is done (loaded, duplicate, held, or failed on its last attempt) it queues monitor, held 120 seconds so the rest of its batch can land |
| monitor (new) | parse_835, or the daily schedule | the document, or the day (UTC) | plans the practice's months (below) and queues price for every run the chain created that is still queued |
| price | monitor (or a person) | the run | as before (ADR 0035); a complete run the chain created queues triage, again on a replay |
| triage | price (or a person) | the run | as before (ADR 0038); for a run the chain created it then writes the run's in-app notifications and queues reconcile |
| reconcile | triage | the run (it was the document in ADR 0004) | the ledger's step: milestone 9 fills it in; until then it checks the run is complete, logs that it ran, and job_run records it |
| digest | the daily schedule | the month (YYYY-MM) | the month's digest (below) |

Every step is idempotent by its data, not only by its key, so a replay after the first finished has no duplicate
effect (JOB-01): parse loads a document once (ADR 0027), monitor creates a run only for a month no run covers, price
leaves a finished run, triage adds only what changed (ADR 0038), notifications are unique per person, kind and subject,
a digest is unique per practice and month and sent once. A failure to queue the next step after a step committed fails
that step, so its retry (or the operator's replay with the same key, PRD 19's runbook) queues it; a parse that cannot
queue monitor only logs it, and the daily schedule plans the practice.

**A batch is what is still on its way.** monitor plans nothing while an 835 of the practice created within the last
hour is still awaiting its bytes, at intake or waiting for its parse; the parse of each of them queues monitor again
when it is done, so the last document of a batch plans for all of it. A document stuck longer than the hour no longer
holds the plan back; a batch whose last file intake held (not an 835, quarantined) after the last parse had planned
waits for the daily schedule.

**Months, priced under the release in force, by the job.** monitor takes one practice's advisory lock, finds the
release in force (none: nothing is priced, logged) and every calendar month of service dates (a line's own date, else
its claim's first) whose newest line no queued, running or complete run of the practice covers (a run whose period
holds the whole month and whose cut-off is at or after that line's load; a failed run covers nothing). Each such month
gets a run for exactly that month through createPricingRun, as a person's would be made: the release pinned, the plans
checked (MAP-01: a month with an unmapped plan waits, logged, and is planned again on the next trigger), the engine
version recorded. The run is the job's: pricing_run.created_by is now nullable beside created_by_job_id (the monitor
job's ID, its actor), exactly one is set, a job creates first runs only, and the restrictive insert policy admits a
person in their own name or an actor that is not a person in its own. The screens say "monitoring" where they named a
person. A run a person creates is not chained: its creator triages it from the Cases screen, as ADR 0038 has it.

**The schedule is the operator's, the jobs are each practice's.** A platform job, monitoring_schedule, runs daily at
05:10 UTC as tp_operator, reads the active practices' IDs only (operator_active_practice_ids(), a SECURITY DEFINER
function granted to tp_operator alone) and queues, for each practice, that practice's monitor job for the day and its
digest for the month before. It reads no practice's data and opens no practice's transaction (SEC-06). The digest of a
month is sent on the first such morning; the later mornings are replays that change nothing. Workers without the
operator connection run no schedule (ADR 0019).

**The digest: one per practice and month, figures fixed when recorded, sent once.** For a month that has ended, in the
practice's job scope under a per-practice lock: new validated variance (lines whose stage reached validated during the
month, with the variance of the priced line triage validated them on), by payer (keyed by the payer's opaque ID);
cases nearing deadline (open, deadline within 14 days of the digest's day, PRD 7's dashboard window) with their
actionable total; recoveries posted (zero until the ledger); coverage (each line's result in the run in effect, by lines
and billed dollars) beside the previous digest's; contracts expiring (a signed-off version ending within 90 days with
no later signed-off version). The row is recorded with its figures, the practice's people who keep in-app notifications
on are told in the app, the ones who keep the digest email on are each sent one email through the existing mail
interface (SES, the local outbox in development), and the digest is marked sent. The email is fixed sentences with
counts and dollar totals, payers by rank ("Payer 1") never by name, and one link of opaque IDs to the digest's page,
which shows the same sentences with the payers named. Delivery is at least once: a failure before the mark sends the
same figures again on the retry; once marked, never again.

**Notifications.** In-app, one per person, kind (monitoring_run, digest) and subject (the run or the digest), with the
same figures rule. A person reads and marks only their own; a practice job writes them only for people who reach the
practice now (user_reaches_practice_now(): an active user with MFA, not internal, through the practice's group or a
grant in force; support grants never count) and reads them only in its own practice, as INSERT ... ON CONFLICT DO
NOTHING needs. Recipients come from practice_notification_recipients(), which only a practice job may call, in its one
practice: people do not list each other's addresses.

**Counts and totals only, in the schema.** notification and digest have only IDs, a code, timestamps and two jsonb
columns; their CHECKs (figures_are_counts, figures_are_cents) admit an object keyed by snake_case codes whose values are
JSON integers (counts) or integer cents as text (totals), or one level of those keyed by codes or opaque IDs. Any text,
float or name is refused. totals_cents is the data dictionary's own name; the catalog test admits a jsonb _cents column
only where CENTS_FIGURE_COLUMNS lists it and its CHECK calls figures_are_cents. JOB-03's test checks the table columns,
the CHECKs, and every statement the digest and the run's notification issue against the encrypted, lookup and patient
reference columns.

**Preferences live in the user's settings**: "user".settings jsonb, `{"notifications": {"digest_email", "in_app"}}`,
both on unless turned off, set by the person themselves (the self update policy) on /account/notifications; the
database admits nothing else in it.

**The monthly variance summary (J12)** is a Reports screen for a month of service dates: each line counted once, at the
furthest stage it has reached (its latest stage event), with counts, billed charges and, for validated and actionable,
the variance of the priced line the stage names; actionable lines written off from a case shown apart; payer approved
and recovered zero until the ledger; the lines with no stage by how the run in effect left them; by payer beside it;
every figure links to its stage's screen; no figure adds stages. It downloads as a CSV of counts and totals (no line,
so report.read).

**JOB-02 and JOB-04.** The dashboard's run-failed banner (job_run, unchanged) names the step and its next action; the
worker heartbeat and its alarm are unchanged.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| One run per batch covering every month it touched | "The run in effect" is by exact period (ADR 0037); month runs keep the monthly runs and the summary aligned |
| A digest at the end of every chain | A batch spanning several months, or weekly uploads, would mail several digests a month; J11's "or on a schedule" and "monthly" read as one digest a month |
| A batch table recorded at upload | The browser asks for files one by one and zips expand at intake; what is still on its way says the same without a new record |
| A system user as the creator of monitoring runs | A user who signs in to nothing, holds no membership and must be excluded everywhere people are counted; the job is already the actor |
| Restricting digest inserts to jobs in SQL | The generated cross-tenant probe inserts as a person (as job_run's does); the application writes digests only from the job |
| Payer names in the email | Names are not PHI, but the plan says counts and totals only; the link carries the reader to the names |
| Per-recipient delivery records | Adds a table for a rare partial failure; at-least-once is stated instead |

## Consequences

- `pnpm test:db` gains the chain on synthetic files (`apps/worker/src/monitor/monitor.db.test.ts`: batch, MAP-01 wait,
  run, triage, reconcile, notifications, the digest by preference, replays of every step, three failures and the
  alert, a failed run planned again, JOB-03) and the screens (`apps/web/src/lib/routes/monitoring-routes.db.test.ts`);
  the generated route and cross-tenant tests cover the new routes and tables.
- The e2e worker keeps monitor, reconcile and digest as placeholders, so each spec's runs are its own.
- Milestone 9 fills reconcile in (and posting and EFT reconciliation, which may need a document-keyed job of their
  own); recoveries in the digest and summary then read the ledger.
- The run-failed banner stays until a job with the failed job's own key succeeds: a month priced again by a new run
  does not clear a failed price job's banner.

## Revisit when

Milestone 9 (the ledger fills reconcile and recoveries), milestone 11 (the Settings screen for practice materiality
and preferences, SES configuration sets), volumes where a daily no-op digest job per practice matters, or a customer who
wants a digest per batch.

## Amendment (PR 6b-2, 2026-10-21): months that wait on the practice's pricing location

Audit #33 (and #7's rule that a month waits only when one of its lines needs what is missing), built under the
founder's answers of 2026-10-21 (about 22:30 UTC) to PR 6b's Q2 (a), the practice's one pricing location
(`practice_site`), and Q5 (a), `pricing_settings.set` for the people who set it; docs/adr/0064 records the location
itself.

- **No run while the location is missing.** `createPricingRun()` checks `practice_location_status()` after the
  mapping guard and throws `PricingLocationWaiting` (`zip_missing`) instead of creating a run whose every line, fixed
  fees included, would stop as `ENGINE_ERROR invalid_settings`; Postgres refuses the same insert, re-runs included
  (`pricing_run_location_missing`), which `recordRun()` reports the same way. The plan lists the month as waiting on
  the location, with its status, and creates nothing.
- **A run whose line stops on the location fails, keeping nothing.** The price job reads the location's status over
  the run's period once, when the run starts. At `zip_unknown`, `zip_plus_four_needed` or `zip_plus_four_unknown`
  (`LOCATION_NOT_READY_STATUSES` in `@tp/contracts`; and an empty location on a run created before locations existed),
  a line the engine stops on the location (`locality_needs_zip_plus_four`, `zip_plus_four_not_in_locality_map`, and
  `no_locality` only for a ZIP on no Medicare list) rolls the pricing transaction back whole, and the run fails
  `location_not_ready` in a transaction of its own, with no line kept. It is the customer's step, which Coverage and
  Pricing settings name: the operator is not paged and triage is not queued. A month whose lines never read the
  locality (a fixed schedule, per visit) prices as before; with a ready location, or a content gap
  (`locality_not_loaded`), a stopped line stays `ENGINE_ERROR` for the operator, as before. A line stopped as
  `ENGINE_ERROR no_locality_plus_four` (PR 6b-1's review: the release has no ZIP+4 file of the ZIP in force on the
  line's date) is a content gap at every status, never a location stop: the run completes, the line pages the
  operator, and the practice is never asked to change its ZIP or ZIP+4.
- **Such a month is not priced again every day.** A failed run never covers a month, so the plan would create one a
  day. It waits instead (`waitingOnLocation()`) while the newest run of exactly that month failed `location_not_ready`
  under the release in force, its cut-off at or after the month's newest line, and was created at or after the
  location was last saved. A save of the location, a new release in force or a newer line plans it again. The job
  logs `LOCATION_NOT_READY` with the count of waiting months, as information.
- **A save queues the plan by its request.** `monitor` takes a third payload, `{ practice_id, request_id }`, the
  save's request ID (as `audit_event.request_id` records it), keyed `monitor:<practice>:<request>`: a daily job that is
  queued or active, and may have read the old location, never swallows the save, and a second send of the same save
  is refused while the first waits. No reconcile is queued for it.
- **The split the run pinned.** The price job and the release dry run price with `runSettings()`: the location's ZIP
  and ZIP+4, the practice's rounding and own places of service, and every place it has not set from the
  place-of-service split the run pinned (`pricing_run_split()`, read as the application role). The trace keeps the
  merged places; the re-run diff names the settings keys that differ, and skips a record read in one run only for the
  location's three record types when the ZIP or ZIP+4 changed.

Tests: `apps/worker/src/monitor/monitor.db.test.ts` (PRC-23: a practice with no location gets no run, a month that
needs its ZIP+4 fails once and is not re-created on the next day's plan, a save planned by its request prices it beside
a queued daily job, a new release in force plans it again), `apps/worker/src/price/price.db.test.ts` (PRC-23 and
PRC-24, as the worker's login), `apps/worker/src/jobs/registry.test.ts` and `apps/worker/src/monitor/job.test.ts`.
