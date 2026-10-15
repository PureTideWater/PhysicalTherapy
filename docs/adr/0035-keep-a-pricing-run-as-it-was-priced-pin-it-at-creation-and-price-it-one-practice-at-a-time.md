# 0035. Keep a pricing run as it was priced, pin it at creation, and price it one practice at a time

- **Status:** accepted
- **Date:** 2026-10-18
- **Deciders:** founder (engineering)
- **PRD sections:** 5 (J6, J7), 7 (Pricing runs, Claims and lines, Coverage), 8 (`pricing_run`, `priced_line`), 9 (the
  release pipeline step 4), 11 (Inputs, step 9, the performance target), 16 (job rules); test matrix MAP-01 to MAP-05,
  PRC-12, PRC-14, PRC-15, JOB-01; ADRs 0004, 0019, 0028, 0029, 0034

## Context

Milestone 7's second part asks for "pricing runs with pinned releases and versions". PRD 5, J7: "A run is created for
a practice and a period, pinned to the current rule release and the contract versions in force on each service date.
It records engine version, created by, status and a coverage summary. A complete run and its lines never change; a
new release means a new run. A run with a rule-release mismatch is refused." PRD 11 asks every priced line to keep its
expected allowed, the unrounded amount, the observed allowed, the variance, its reason when unpriced, the adjustments,
the dispute window's end and the full trace, and puts 100,000 lines inside two minutes. The engine (`@tp/pricing`,
ADRs 0029 and 0034) is pure and prices one claim at a time from resolved agreements; the resolver and the guard live
in `@tp/contracts` (ADR 0028). What the plan leaves open: who may create a run, which lines a period holds, which day
the dispute windows are judged on, how a run reaches the release's records, what "variance by payer pattern" groups
by, and what happens when the engine or the job fails part way.

## Decision

- **Two PHI tables, each row written once** (`packages/db/migrations/20261018090000_pricing_runs.sql`). `pricing_run`
  holds the practice, the inclusive period of service dates, the release number (a foreign key to `rule_release`),
  the engine version, the creator, the status (`queued`, `running`, `complete`, `failed`), the coverage summary, a
  fixed failure code and the completion time. `priced_line` holds one row per run and service line (unique), with the
  mapping, contract version and rate record it was priced under, the method, `expected_allowed_cents`,
  `expected_unrounded` (numeric without a scale, ADR 0029), `observed_allowed_cents`, `variance_cents`,
  `unpriced_reason`, `adjustments_applied`, `window_ends_on` and the trace. Checks make a row either priced (amounts,
  method, the unrounded amount within a cent of the rounded, the variance equal to expected less observed) or unpriced
  (a reason and no amounts), and a rate record name its version and a version its mapping.
- **The database keeps a run as it was priced, for every role.** A trigger on `pricing_run` starts every run queued,
  never lets its practice, period, release, engine or creator change, allows only queued to running to complete or
  failed, sets `completed_at` itself, refuses `complete` unless the coverage counts exactly the run's stored lines,
  refuses lines on a failed run, and refuses any change to a complete or failed run and every delete. `priced_line`
  refuses UPDATE and DELETE; a statement trigger refuses lines for a run that is not open or of another practice, and
  a service line, mapping, version or rate record of another practice. TRUNCATE is refused on both. RLS on
  `app.practice_ids` as on every PHI table, and a restrictive policy makes the application role create runs only in
  its own actor's name.
- **Pinned at creation.** `createPricingRun` (`apps/worker/src/price/create.ts`, run in the creator's scope) takes the
  period and the release the screen showed; the release must be the newest published one, or the run is refused with
  `RuleReleaseMismatchError` (the trigger refuses the same insert on its own). It records this engine's
  `ENGINE_VERSION`; a run executed by another engine version fails (`engine_version_mismatch`). The contract versions
  are pinned by date: each line's version is the signed-off one in force on its service date when the run executes,
  and the line records it. A new release, mapping or sign-off never changes a run; the screen offers a new run of the
  same period instead (`rerunReasons`).
- **Who and which lines.** A run is created by the roles that map plans (`mapping.edit`: the billing manager and the
  firm principal), since a run is what a mapping is for. A period is whole months on the screen and inclusive service
  dates underneath; its lines are those whose service date (the claim's first service date where the line has none)
  falls inside it, of claims that are neither reversals nor superseded, loaded before the run was created. A period
  with no lines is refused; a period over a plan with no mapping at all is refused through `@tp/contracts`'
  `assertPracticePricingAllowed` (MAP-01), at creation and again at execution (`unmapped_plan`). A line outside every
  mapping's dates is left unpriced with `NO_MAPPING`, one by one (MAP-02).
- **The release from the database.** The run's release is read back from `rule_record` (the records the loader stored,
  each with its SHA-256) and indexed the way `@tp/pricing` indexes a release directory, so every trace names the
  records and the release manifest it read. The practice's ZIP and settings are passed through as stored; a malformed
  setting reaches the engine and is refused by it, line by line.
- **The triage date is the run's creation day (UTC).** Windows and timely-filing states depend on the day they are
  judged; a run judged on the day it was created reads the same whenever its job runs or replays.
- **Executing a run** (`executePricingRun`, the `price` job, one practice per job in `withJobScope`). The run goes to
  `running` in a transaction of its own; then, holding a transaction-scoped advisory lock per practice (one run of a
  practice at a time), its claims are read through `readWithAudit` in pages of 500, resolved, priced and stored in one
  `INSERT ... SELECT FROM jsonb_to_recordset` per page, the coverage is totalled from the stored rows, and the run
  completes, all in one transaction. A failed attempt leaves no lines and the next attempt starts over. A line whose
  resolution throws is `ENGINE_ERROR resolution_failed`; every engine error is stored as the engine reports it and the
  run goes on; when one pages the operator, the job logs `pricing run recorded engine errors for the operator` and a
  CloudWatch metric filter and alarm (`infra/lib/constructs/monitoring.ts`) raise it.
- **The job (ADRs 0004 and 0019).** Idempotent by run: the singleton key is `price:<practice>:<run>`, a run already
  complete or failed is left as it is, and a replay changes nothing (JOB-01). A missing run is retried (the job can
  arrive before the creating transaction is visible) and, on the last attempt, logged and left. Three attempts in all;
  on the third failure the run is marked `failed` with `job_failed` and the worker's last-attempt alert fires.
- **The coverage summary** (`tp-pricing-coverage/1`, `apps/worker/src/price/coverage.ts`) is read back by the screens
  through a schema: lines and billed charge, priced lines and charge, each of the twelve unpriced reasons with its
  lines and charge, engine errors by detail (and whether each pages the operator), lines per contract version, and the
  variance by payer pattern. A pattern is the payer, plan, mapping kind, contract version and rate record a line was
  priced under, with its underpaid and overpaid lines and cents; triage refines it later. Dollars are billed charge,
  so shares are of what was billed, worked out in integers.
- **Screens.** Pricing runs (`/p/[practiceId]/pricing-runs`: every run with its period, release, engine, versions,
  shares and underpaid total; the create form), a run (`/pricing-runs/[runId]`: its pins, coverage, unpriced reasons
  with remedies, versions, variance by payer pattern and lines), the line trace (`/lines/[lineId]?run=`: expected
  allowed and the unrounded amount, variance or reason, window end, and every trace step in the engine's order with
  the rule records and release it read), Claims and lines (expected allowed and status from the latest complete run),
  and Coverage (shares and reasons by count from the latest complete run, replacing the zeros). The trace and the
  window end carry the line's dates, so they show to the roles that read PHI.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| Price each line in its own transaction and resume part-way | A run that completes is all of its lines or none; resuming needs a cursor the database would have to trust. Revisit if a practice's month outgrows one transaction |
| Pin the contract versions at creation as a list | PRD 5 pins "the contract versions in force on each service date"; recording each line's version keeps the pin and the trace in one place |
| Let a newer release reprice a complete run | PRD 5: "A complete run and its lines never change; a new release means a new run" |
| Judge windows on the day the job runs | A replay or a retry the next day would change a window's state |
| Read the release from `content/releases` on disk | The worker's container need not carry the content; the database holds the records the loader verified, with their SHA-256 |
| Count coverage dollars as paid or allowed | Unpriced lines have no expected amount and their paid amount says little; billed charge is what every line has |
| A run per practice and month, created by a schedule | The monthly runs and their digests are the milestone's monitoring part, not this one; the schedule will create runs through the same service |

## Consequences

- 100,000 synthetic lines (one practice, one month, Medicare Advantage and a percent-of-Medicare contract) price end
  to end in 55.2 seconds on the development container (created in 0.2 s, executed in 55.0 s), inside PRD 11's two
  minutes (`apps/worker/src/price/price.large.db.test.ts`; the number of lines is `TP_LARGE_PRICING_LINES`).
- A practice's runs execute one at a time; a second run waits for the first.
- The trace is stored whole on each line (format 2, ADR 0034); `recompute` works every stored line out again in the
  database tests.
- Re-run diffs (PRC-19), the monthly runs and the monitoring digests are not built; the screen only offers a new run
  when a mapping, a sign-off or a release has changed since.

## Revisit when

A practice's period holds more lines than one transaction should carry, the monthly schedule arrives, re-run diffs are
built, or triage needs a pattern of its own.
