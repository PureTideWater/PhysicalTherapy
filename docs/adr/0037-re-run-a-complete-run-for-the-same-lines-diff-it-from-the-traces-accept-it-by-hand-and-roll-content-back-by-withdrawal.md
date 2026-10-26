# 0037. Re-run a complete run for the same lines, diff it from the traces, accept it by hand, and roll content back by withdrawal

- **Status:** accepted; amended 2026-10-26 (`co-001/superseded-rerun`, combined audit #10): a re-run is accepted only
  while nothing in effect for its service dates is newer than it, and only the run in effect is re-run ("Amendment", below)
- **Date:** 2026-10-19
- **Deciders:** founder (engineering)
- **PRD sections:** 5 (J6, J17), 7 (Pricing runs: "compare two runs; re-run under a new release with a diff";
  Internal console: Rule releases), 9 (The release pipeline, steps 1 to 5), 18 (Releases); test matrix PRC-19,
  MAP-03 (PRC-25 to PRC-28 from the amendment); the load-release skill; ADRs 0003, 0008, 0029, 0035 (0038 and 0061 from
  the amendment)

## Context

Milestone 7 asks for "re-run diffs under a new release ... Done when ... a re-run under release 2 lists exactly
the changed lines". PRD 9 step 4: "a re-run of any earlier run under the new release produces a diff of changed
lines before anyone accepts it"; step 5: customers see "what changed, which of their runs would change, and a
button to re-run"; J6: after a mapping correction "prior pricing runs stay as they were, and a re-run is
offered"; PRD 18: "a content rollback by loading the previous release, with runs pinned to the withdrawn
release flagged rather than changed". The load-release skill runs `pnpm release:dry-run <next>` against the
staging snapshot and pastes "the list of runs whose lines change" into the pull request. ADR 0035 made a
complete run immutable and pinned to the newest published release. The plan leaves open: which lines a re-run
prices, what "accepts" changes, how a cause is told from a trace, what a dry run compares, how a rollback is
recorded when a release row is permanent (ADR 0009), and what the console may read.

## Decision

- **A re-run prices the same lines again.** `createRerun` (`apps/worker/src/price/rerun.ts`) records a new run
  of the same practice and period, pinned to the release in force and this engine, with `rerun_of_id` naming
  the complete original and `lines_loaded_by` copied from it (the original's own creation, to the
  microsecond, by the insert itself), so lines loaded after the original are not the re-run's and the two
  compare line for line. A new run of the same months (not a re-run) still picks up every line loaded since.
  The original never changes. The database holds the same rules (`20261019150000_reruns_and_release_withdrawal.sql`).
  *Amended 2026-10-26 (`co-001/superseded-rerun`):* the original must be the run in effect for its period, with no
  first run of overlapping dates queued or being priced (`not_in_effect`, `newer_run_pending`); see the amendment at the end.
- **A re-run is in effect only once accepted.** `accepted_by` and `accepted_at` are set once, on a complete
  re-run, by the person acting, for the roles that map plans (`mapping.edit`, checked again by a restrictive
  policy), never for a run whose release was withdrawn. It is the one step a complete run may take; what it
  priced, its coverage and its lines never change (the same trigger refuses everything else, for every
  role). Accepting again changes nothing. A first run of a period is in effect when it completes, as before.
  For a period, the run in effect is the eligible run (a complete first run or an accepted re-run) that took
  effect last (`coalesce(accepted_at, completed_at)`); Claims and lines read, per line, the eligible run that
  priced it and took effect last, Coverage the eligible run that took effect last, and the line trace the
  same unless a run is asked for. Triage and the audit report read only the run in effect for its period
  (`RUN_IN_EFFECT`, `apps/worker/src/price/in-effect.ts`, which the web app's reads share; the database's
  `pricing_run_in_effect()` holds the same rule for its own checks; ADR 0038).
  *Amended 2026-10-26 (`co-001/superseded-rerun`):* a re-run is accepted only while no run in effect for overlapping
  service dates was priced after it, is pinned to a later release not withdrawn or a later place-of-service split, or
  (for its own dates) holds lines it lacks, no first run of those dates is being priced, none took effect while it was
  being accepted, and what it replaces is what its diff was shown against (the run it replaces, and the runs of other
  dates holding its lines); its diff is exactly what accepting changes; see the amendment at the end.
- **A diff is the stored lines, matched by service line** (`compareRuns`, `apps/worker/src/price/diff.ts`):
  exactly the lines whose expected allowed, unpriced reason, adjustments applied, dispute window (its last day,
  which decides whether the line is actionable, PRD 11 step 8), review flags (the trace's `outcome.review_flags`,
  none on an unpriced line) or terms (the mapping, contract version and rate record that priced it) differ, and
  the lines one run priced and the other did not; each listed line says which of these differ (`changes`), and
  the summary counts the lines whose window or flags moved beside those under another mapping or version.
  `pricing_run_changed_lines(before, after)` counts the same predicate in SQL
  (`20261021090000_run_diffs_and_runs_in_effect.sql` replaced the first, which compared the amount, the reason
  and the adjustments only, so a re-run that moved every window, or a quarterly NCCI update that raised a review
  flag, listed nothing). Each listed line's two priced lines are audited reads (purpose `run_comparison`).
- **The cause comes from the two traces** (`lineCauses`, `causes.ts`, pure): the mapping (another
  `mapping_id` or kind), the contract version (another version or rate record), a rule record (a record of the
  same rule, type and key, whose value or window differs, looked up in `rule_record` by release and SHA-256:
  a record re-sourced under a new hash with the same value is not a cause; a record read in one run only is a
  cause when the line kept its terms), the claim's facts, the practice's settings, the engine; and, when none
  of the line's own inputs changed, "another line of the claim" (the multiple procedure ranking, the per-visit
  carrier), since the engine is pure.
- **The dry run prices in memory, twice** (`runReleaseImpact`, `impact.ts`): a run's lines under its own
  release and under the release tried, with the practice's agreements and settings as they are now and the
  run's triage date, by the price job's own engine; a line would change when the same things differ
  (`linePricesDiffer`: the diff's predicate over the rows the price job would store).
  So the count is the release's own effect, whatever else changed since the run (a re-run's diff names those
  causes). `pnpm release:dry-run <n>` reads release n from `content/releases` or `content/outgoing` and checks
  every complete run of every practice in `DATABASE_URL` (the staging snapshot), as the owner role, one practice
  at a time in a job-style scope, every claim read audited (purpose `release_impact`) in the dry run's name;
  nothing else is written. RELEASE.md, being hashed content, no longer claims anything about runs: it says
  the dry run lists them in the pull request.
- **A content rollback is a withdrawal.** `rule_release_withdrawal` (global, read-only to the application
  role, append-only) names the release in force, the newest published release below it (in force again) and
  the reason. `current_rule_release()` is the newest published release not withdrawn; runs pin it, the trigger
  checks it, and the 835 loader checks code lists against it. `pnpm release:rollback <n> --reason <text>` loads
  the published release before n from `content/releases` when the database lacks it ("loading the previous
  release"), then withdraws n. Runs pinned to n keep every line; screens flag them and offer a re-run. A
  withdrawal is permanent; a correction is a new release number.
- **SYNTHETIC release 900004 is PRC-19's "release 2"**: release 900001 with its relative values re-parsed from
  `fixtures/synthetic/cms/PPRRVU_SYNTHETIC_900004.csv`, which differs in the 97110 work RVU alone (0.31 to 0.41;
  a work value, so the multiple procedure ranking, by practice expense, cannot move another line). Built by
  `tools/release/synthetic.ts`; 900002 and 900003 were already the golden lines' releases.
- **Screens.** Pricing runs: compare any two complete runs (`/p/[practiceId]/pricing-runs/compare?before&after`),
  re-run a complete run under the release in force from its page (*amended 2026-10-26:* the run in effect only), the
  re-run's page with its diff and the Accept button (*amended 2026-10-26:* exactly what accepting it changes, against each
  line's pricing in effect, and in the button's place why it can no longer be accepted), run state badges (in effect, awaiting acceptance, release withdrawn), and a notice when runs in
  effect are pinned to another release. The customer release note (`/p/[practiceId]/releases?release=`): the
  release's notes and its record changes against the release before (by type, and the first 50 records with the
  fields that differ), whether it is in force or withdrawn, the practice's runs in effect pinned to another
  release, "how many lines would change" per run (in memory, for `mapping.edit` roles) and a re-run button. The
  console's Rule releases (`/console/rule-releases?release=&check=1`, `rule_release.manage`): published
  releases with their standing, notes and record changes, the affected runs per practice as counts
  (`console_release_runs()`, a reviewed scope function: no run, line or claim is read), and, from the content
  checkout the server is given (`CONTENT_ROOT`; in development the repository), the drafts by file, type and
  level, the checker's result on request, the prepared releases with their RELEASE.md, and "Prepare release
  <next>" (the assembler, into `content/outgoing/<next>`, the next unused real number). Never publish: CI
  publishes on merge.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| A re-run prices every line loaded by its own creation | The diff would mix new lines with changed ones; PRC-19 asks for exactly the affected lines. A new run of the same months does this when it is wanted |
| A separate acceptance table | The row factory of the generated cross-tenant tests could not build an acceptance of a complete re-run; one once-only step on the run, like a release's publication step (ADR 0009), keeps every priced value immutable |
| Every run needs acceptance | J7's first run of a period has nothing to compare with; acceptance is the re-run's gate (J17) |
| Causes from record hashes alone | A re-sourced CMS file gives every record a new hash; only the values say what changed |
| The dry run compares release n with the stored lines | A mapping corrected since would count as the release's impact in its pull request |
| Reconstruct each line's agreement from its trace for the dry run | The trace does not hold the whole mapping and version; today's agreements, priced both ways, isolate the release |
| Store a release-impact table filled by a worker job | More machinery than the plan asks; the check runs per run on request, in memory, and the re-run itself is the exact diff |
| Roll back by loading release n-1 again | A loaded release is already loaded; the newest number stays in force. A withdrawal row says which release is out and why, and changes nothing else |
| Route parameters for release numbers (`/releases/[releaseNo]`) | Path parameters name opaque IDs only (the registry's rule); a query parameter carries the number |

## Consequences

- PRC-19 holds end to end: `apps/worker/src/price/rerun.db.test.ts` re-runs the PRC-19 run under 900004 and the
  diff lists exactly the two 97110 lines, each caused by the `pfs_rvu` 97110 record, which the two releases' records
  alone predict; the dry run's in-memory count for the run (2 of 4) agrees before the re-run exists; the rollback
  of 900004 flags the re-run, changes no row, refuses its acceptance, and a re-run under 900001 brings the lines
  back. The same flow runs through the screens (`reruns-routes.db.test.ts`) and the CLI (`tools/release/dry-run.db.test.ts`).
- The console's "Prepare" writes into the server's content checkout; in production there is none unless one is
  mounted, and the screen says to use the release commands.
- A dry run reads every practice's claims as the owner role against the database it is given; its audit
  events name the dry run's ID. In production use it runs against the staging snapshot only.
- The customer's "how many lines would change" prices one run in memory per request; a very large run makes
  that request slow (the re-run itself runs in the worker).

## Revisit when

A practice's run outgrows an in-memory check in a request, the monthly runs arrive (they create first runs
through the same service), or a release needs to be
reinstated after a withdrawal.

## Amendment (`co-001/superseded-rerun`, 2026-10-26): a re-run is accepted only while nothing in effect for its service dates is newer

Combined audit #10, adopted by the founder with the whole audit on 2026-10-20, built under the founder's standing
rule of 2026-10-18 (the best option only). The Decision above let a person accept any complete re-run, and let a
re-run take effect simply by being accepted last. Accepting an older re-run could then take a month's late lines out
of effect, or put its lines back on an older release or mapping: a first run X of February prices a late line, then
a re-run R of the first run F, created before X, is accepted; R took effect last, so it is in effect for February,
and the late line, priced only by X, has no pricing in effect at all (Coverage, triage, Claims and lines and the audit
report all read the run in effect). Two re-runs of one run accepted out of order, and a re-run of a multi-month
period accepted after a single month was priced again, regress every shared line the same way.

**The rule.** For a re-run R of the original O, where a run took effect at `coalesce(accepted_at, completed_at)`
(`IN_EFFECT_SINCE`) and two runs overlap when they belong to the same practice and their periods share a service date:

- **Newer pricing.** A run X's pricing is newer than R's when X was priced no earlier than R
  (`X.completed_at >= R.completed_at`), or X pinned, when it was created, an input newer than R's: a later rule
  release that has not been withdrawn, or a place-of-service split approved later (ordered as
  `place_of_service_split_in_force()` orders them, `approved_at` then ID; a run that pinned no split is older than
  one that pinned a split). Both pricing transactions take the practice's execution lock (`pricing_run:<practice>`)
  before they read mappings, contract versions, settings, location and the claim's live facts. `completed_at` is the
  pricing transaction's `now()`, which begins before the lock is granted, so the price job checks, under the lock
  and before it reads anything, that no run of the practice with a later `completed_at` has already completed; if
  one has, the transaction begins again (`apps/worker/src/price/execute.ts`, at most five times in one attempt, then
  the job retries). `completed_at` order is therefore the order in which runs read their inputs, for first runs and
  re-runs alike. A tie counts as newer. A withdrawn release is never newer: after a rollback, a re-run under the
  reinstated release is the one wanted. The split is read through `pricing_run_split()`, the definer that answers
  for a run of a practice in scope (the application role cannot read the split table). The run's triage date (its
  creation day, the engine's `as_of`) is fixed at creation too but is not compared: it sets only the trace's window
  status as of that day; `window_ends_on` does not depend on it, no amount does, and triage judges every window on
  its own date (`packages/triage/src/actionable.ts`, `WINDOW_PASSED`).
- **Superseded.** R is superseded when O is not eligible (an unaccepted re-run, or not complete: R's diff is then
  against no pricing in effect), or when some eligible run X other than O and R overlaps R, took effect after O
  (`(since(X), X.id) > (since(O), O.id)`, the ordering `RUN_IN_EFFECT` and `PRICED_IN_EFFECT` use), and either holds
  newer pricing or, for R's exact period, has a later cut-off (`coalesce(lines_loaded_by, created_at)`), so it holds
  lines loaded after R's.
- **A newer run being priced.** A first run of an overlapping period that is `running` may have begun pricing before
  the acceptance began; once it completes, R would be superseded. A **queued** first run does not stop an acceptance:
  its status change to `running` commits after the acceptance's check, so it is priced after R and ranks after it,
  holding every line by its own cut-off.
- **A run that took effect meanwhile.** An eligible overlapping run whose `since` is at or after the accepting
  transaction's own `now()` committed while the acceptance waited for the lock, from a transaction that began later.
  Accepting R would stamp an `accepted_at` that ranks before it (the trigger requires `accepted_at = now()`), so R
  would be accepted but not in effect. The acceptance is refused; a new attempt starts a new transaction and judges
  that run like any other.
- **Accepted.** R is accepted when it is complete, unaccepted and not pinned to a withdrawn release, as before, and,
  read under the lock, is not superseded, has no newer first run being priced, and saw nothing take effect
  meanwhile. Once accepted, R is the run in effect for its period at its commit, and holds the lines and the newest
  pricing of every run it replaces.
- **Re-run creation.** A run is re-run only while it is the run in effect for its exact period (`RUN_IN_EFFECT`) and
  no first run of an overlapping period is `queued` or `running`. A run already replaced, or a re-run nobody
  accepted, is priced again by re-running the run in effect, whose diff is against the pricing a person would
  actually replace.

The fragments (`SUPERSEDES_RERUN`, `RERUN_SUPERSEDED`, `NEWER_RUN_RUNNING`, `NEWER_RUN_PENDING`,
`TOOK_EFFECT_MEANWHILE`) sit in `apps/worker/src/price/in-effect.ts` beside the rule they refine, and
`rerunBlock()` (`apps/worker/src/price/rerun.ts`) is the one reading the service and the screens share. Newness is
judged by when a run was priced and by its pinned release, never by when it took effect: the moment a person clicks
Accept is not the age of the pricing, so a re-run priced after the pricing it would replace is accepted whichever
acceptance came first.

**Refusal codes.** `RerunRefusedError` gains `superseded`, `newer_run_pending` (acceptance: a first run of overlapping
dates is being priced; creation: one is queued or being priced), `changed_meanwhile`, `diff_changed` (the pricing
the acceptance would replace is not what the person's diff was against: another run replaced, or other runs holding
its lines) and `not_in_effect` (creation).
`release_withdrawn` stays ahead of `superseded`, because its remedy is the more basic one; `diff_changed` comes last,
after the refusals that say the re-run cannot be accepted at all. Each message names the state, never a value, and
reads after the form's label ("This re-run: ...", "This run: ...", the route ending it with a full stop); the older refusals (`not_found`, `not_rerun`,
`not_complete`, `release_withdrawn`) are reworded to read the same way. `rerunBlock` exports the pages' acceptance
state too (`RERUN_ACCEPTANCE`: `release_withdrawn`, `superseded`, `newer_run_pending` or `awaiting`, in that order),
so no badge says "awaiting acceptance" beside a withdrawn release.

**The lock and the race analysis.** `acceptRun` refuses any isolation level but READ COMMITTED (a plain `Error`, a
programming fault, for the reason `pricing_current_read_lock()` gives), then takes the practice's `pricing_current`
key exclusively (`pg_advisory_xact_lock(hashtextextended('pricing_current:' || practice_id, 0))`, the key the
`pricing_run_pricing_current_lock` trigger already takes at every acceptance and completion, and that packet approvals
and exports take shared, docs/adr/0061) in a statement of its own, before the re-run's row lock and before its checks.
Each later statement takes a fresh snapshot that sees every acceptance and completion committed before the lock was
granted. The execution key is not used: it is held for a whole run's pricing (up to two minutes, PRC-20), while a
completion holds `pricing_current` only from its completion UPDATE to commit.

- *Two acceptances at once.* The second waits for the first, then reads it eligible. If the first re-run is newer
  in pricing, the second is refused `superseded`, whatever the timestamps; otherwise, if the second's transaction
  began after the first's, it is accepted and ranks after it; otherwise it is refused `changed_meanwhile`, and made
  again it is accepted. Either way the period ends on the re-run priced last.
- *A completion during an acceptance.* A run's `running` status commits in its own transaction before its pricing
  transaction begins, so whenever X's pricing (and the `now()` that becomes its `completed_at`) has started, the
  acceptance reads X `running` (refused `newer_run_pending`) or `complete` (newer in pricing: `superseded`, or
  `changed_meanwhile`). An X still queued at the check is priced after R and ranks after it, which is right.
- *Deadlocks.* Acceptance takes the advisory lock, then its own row; a completion holds its own row, then the advisory
  lock; neither needs the other's row, and two acceptances take the lock first. During a rolling deploy, an old web task
  (row, then lock) and a new one (lock, then row) accepting the **same** re-run can deadlock once: Postgres aborts one
  with 40P01, no data is wrong, and a resubmit succeeds or finds it already accepted.

**The execution order, closed.** `completed_at` is when a pricing transaction began, before it was granted the
execution lock; it reads its inputs a few statements later. Two executions at once (a rolling deploy's overlap, or
more than one worker task) could otherwise read in one order and be stamped in the other: a re-run R queued before an
overlapping first run X, both picked up together, X's transaction beginning first and R's taking the lock first,
would leave X, which read a mapping corrected in between, ranked as priced before R, and R accepted over it
(payment-engine review of PR #50, F1). The price job's check under the lock closes this for first runs and re-runs
alike: a run that began later and completed first makes the waiting transaction begin again, with a later `now()`,
before it reads anything. The check reads committed rows at READ COMMITTED under the lock already held, so it holds
for any caller of `executePricingRun`; a session-level lock taken before `BEGIN` would give the same order but needs
the shared transaction helper to hold a lock across its transaction on a pooled connection, and every job context to
pass it on. One window is left for the deploy that ships this check: a worker of the earlier version, executing at
the same moment as a new one, does not check. Production runs one worker task today (`infra/lib/environments.ts`), so
it needs an overlap of the deploy itself; the damage would be a shared line keeping older pricing, never a lost line.
A first run stuck in `running` blocks acceptance and re-runs of overlapping dates, and the refusal names it; a new
price job for that run resumes and finishes it.

**PRD 9 step 4.** "A re-run of any earlier run under the new release" is read as the practice's runs in effect that
are pinned to an earlier release, the ones the release note lists (`runsInEffect`). A run already replaced is priced
again by re-running the run that replaced it, and the refusal names that run.

**The diff base: exactly what accepting changes.** A re-run's page, and the compare page where Accept is offered,
list exactly what accepting it changes (`compareAcceptance`, `apps/worker/src/price/diff.ts`; payment-engine review
of PR #50, F4): for each line the re-run or the run it replaces priced, the line's pricing in effect now
(`PRICED_IN_EFFECT`, whichever run of any period holds it) against its pricing once the re-run is accepted (the
re-run's line where it priced one, since accepted last it holds every line it priced; otherwise the pricing in effect
of the runs left, those of other periods). The run it replaces is the run in effect for its period: the original, or
a run of the same period that took effect after the original but is not newer than the re-run (`rerunBlock`'s
`replacesId`). A line a run of other service dates holds is compared with that run, and the page names it; with
none, the diff is the replaced run's and the re-run's, as before. No other line's pricing in effect moves, because
the re-run takes effect for its own period only. The compare page offers Accept only against the run it replaces,
and otherwise links to that comparison. The Accept forms post what the diff was against, the replaced run and the
runs of other dates it read (`replacesId` and `heldByIds`), and `acceptRun` requires both of every caller. Under the
lock it reads the replaced run again and the runs of other dates the diff would read now (`acceptanceHeldBy`, the
same statement), and refuses `diff_changed` when either differs: another re-run of the same run accepted meanwhile
(security review of PR #50, F1), or a re-run of other dates accepted meanwhile that is not newer than this one, so
not superseding it, but now holding some of its lines. Priced lines never change, so those runs are everything the
diff depends on. The page then refreshes to the diff that holds. An acceptance already recorded stays as it is,
whatever the request names. A comparison of any two runs elsewhere stays the two runs' diff (`compareRuns`).
`acceptRun` compares the two sets whole and has no bound; the Accept route takes at most 200 `heldByIds`
(`ACCEPT_HELD_BY_LIMIT`), which keeps a request, and the page that names each run, a sane size. Past it neither page
offers an Accept form the route would refuse every time: each says why in its place, and that a new run of these
service dates prices them under what is in force now (re-review of PR #50, N1).

**The screens.** A re-run that can no longer be accepted shows why in place of the Accept button, with a link to the
run to use, and says which condition holds (`NEWER_BECAUSE`: priced after it, pinned to a later release or split, or
holding lines loaded later): the run in effect for its service dates, and, only when that run was priced after the
re-run and would price nothing differently now, that there is nothing more to accept (otherwise the re-run of that run
is offered, since a re-run superseded by its cut-off, release or split alone may have read newer settings); the runs
of other service dates holding newer pricing (and a re-run of the run in effect again); or the run being priced.
Each run is named by a link that tells it from the others of the same dates (its period, release and the second it
was priced). Badges read "Can no longer be accepted" (superseded, or pinned to a withdrawn release:
`RERUN_ACCEPTANCE`) and "Re-run waiting for a newer run". A run not in effect offers no re-run, and links to the run in
effect. A refusal refreshes the page (`ActionForm`'s `refreshOnError`), so the explanation replaces a stale button and
takes the focus the refused form held; the explanations are notes (`role="status"`), never alerts announced on load,
and a refusal whose only issue is a hidden field reads its issue under "Not done" without the generic "Check the fields
marked below." (UX review of PR #50). A refused Re-run on the releases page whose run leaves the list on the refresh is
said after the list, which takes the focus. The Re-run button a superseded re-run's page offers names the run in effect
and wraps at a phone's width; the runs list and the compare page name each run to the second; what accepting changes
leads with its count, and when it changes nothing says so once; a note in place of a Re-run button while a first run is
being priced names the run to re-run once it finishes, which depends on that run's dates (UX recheck of PR #50).

**No migration.** Every input exists (`pricing_run`'s period, status, `rerun_of_id`, `release_no`,
`lines_loaded_by`, `completed_at`, `accepted_at`, `created_at`, and `rule_release_withdrawal`), as do the lock key
and its trigger. `docs/product/domain-model.md` and the catalog are unchanged. No customer data exists yet, so no line
already taken out of effect needs repair.

**Alternatives considered (this amendment).**

| Option | Why not (or when we would switch) |
| --- | --- |
| The audit's rule alone: refuse when the original is not in effect for its exact period | Closes the late line, the out-of-order re-runs and the chains, but lets a multi-month re-run regress the lines it shares with a month priced since, which its diff never shows; and it refuses the second of two re-runs accepted in order, where accepting improves every line |
| Newness judged by when a run took effect (`since(X) > greatest(since(O), R.created_at)`) | Treats the moment of acceptance as the age of the pricing: accepting one of two re-runs refuses the other even when the other was priced later, and the refusal then says something false |
| Newness judged by `X.completed_at > R.created_at` | Correct, but refuses a valid acceptance when R was created before X was priced and priced after it. Comparing the two pricing stamps, plus the pinned release, is exact under the same lock argument and accepts strictly more; it needs the meanwhile guard either way |
| Refuse when any overlapping eligible run other than the original took effect after it | A person's multi-month run could be re-run only until the monitor prices one late line in any of its months, and never again |
| Compare cut-offs only | Two re-runs of one original share a cut-off |
| Walk `rerun_of_id` to the eligible ancestor | A re-run of an unaccepted re-run would be acceptable while its diff is against a run never in effect; refusing such chains, and no longer creating them, is honest |
| Change the reads instead (a line falls back to an older run when the newest lacks it) | Changes what "in effect" means for triage, reports, Coverage, Claims and lines and the database's own functions, which only a migration keeps in step, and still regresses shared lines |
| Accept, then queue a fresh first run of the period | Hides the problem behind a run nobody asked for, with no diff before it takes effect (J17) |
| Refuse acceptance while a first run is queued, as well as running | Adds no safety, and a run stuck in `queued` would block acceptance indefinitely. Kept for re-run creation, where it avoids a wasted re-run |
| Refuse re-run creation while any overlapping run, re-runs included, is running | Closes the residual window for re-runs too, but refuses a second re-run for as long as the first is being priced, to close a window of under a millisecond |
| Judge newness by whether any input changed between the two pricings | Settings and location carry no change stamps the code reads; a wrong "nothing changed" would let a regression through. The pricing stamp is exact and conservative |
| A session-level execution lock taken before the pricing transaction begins (fix round) | Gives the same order by construction, but the job's transaction helper (`withJobScope`, shared by every request and job) would hold a lock across its transaction on a pooled connection, which leaks unless the connection is destroyed when the unlock fails, and every job context and test double would have to pass the lock on or silently lose the order. The check under the lock tests the exact property on committed rows, whatever the caller |
| Compare the triage date (the run's creation day) as an input fixed at creation (fix round) | It changes no amount and no window's end, only the trace's window status as of that day, and triage judges every window on its own date; refusing on it would refuse a re-run over a run created a day later for nothing it would regress |
| `replacesId` optional, checked only when a caller gives it (fix round) | A caller that leaves it out would accept a change nobody saw; required, every caller states the diff it showed |
| Keep the diff against the replaced run alone, and name the runs of other dates whose lines move (fix round) | The person would still not see the pricing those lines leave, or lines on which the replaced run and the re-run agree but the run holding them does not; J17 asks for exactly the lines that would change, which `compareAcceptance` lists at the cost of one more read of the lines in effect |
| Bind an acceptance to the moment its page was read, refusing it when any overlapping run took effect since (fix round) | Simpler, but refuses for a run that holds none of the re-run's lines; the replaced run and the runs the diff read are exactly what it depends on |

**Consequences (this amendment).**

- The test matrix gains PRC-25 to PRC-28, asserted by `apps/worker/src/price/rerun.db.test.ts` (the late line, the
  two orders and the two acceptances at once, with no 40P01, overlapping periods, a withdrawn release, a later release
  or a later split priced before the re-run, the cut-off alone, two executions at once, a run being priced or queued,
  an acceptance against a diff no longer current, the READ COMMITTED guard, and parity with `pricing_run_in_effect()`
  and with the pages' acceptance state),
  `apps/worker/src/price/rerun-rule.property.test.ts` (a model of runs, releases, splits, withdrawals, corrections,
  reversals and executions at once, each begun, read under the lock and committed in its own step: no priceable line
  loses pricing in effect, none regresses to pricing read or pinned earlier, judged from what each run read and
  pinned rather than from the rule's stamp, an accepted re-run is in effect, a re-run newer than every overlapping run
  is acceptable, and each rejected rule above, an execution without the restart and a rule without the split are
  named counter-examples),
  `apps/web/src/lib/routes/reruns-routes.db.test.ts` (the screens' data and refusals) and `apps/web/e2e/pricing.spec.ts`.
- Existing tests that accepted an older re-run after a newer run, or re-ran a run no longer in effect, are rewritten to
  accept or re-run the run in effect (`rerun.db.test.ts`'s PRC-19 tail, `diff-location.db.test.ts`,
  `reruns-routes.db.test.ts`).
- Every caller of `acceptRun` names the run it replaces and the runs of other dates its diff read (`replacesId`,
  `heldByIds`); the worker's tests that accept a re-run name its original, or the run the page would show, and read
  the runs as the page does (`acceptanceHeldBy`). `rerun.db.test.ts` checks under overlapping periods that the diff
  lists exactly the lines whose pricing in effect accepting then changes.
- The rule lives in the service only. A path that sets `accepted_at` or inserts a re-run without `acceptRun` or
  `createRerun` is not checked; none exists today, and the application role's column grant is unchanged.

**Revisit when** the database mirror lands: `pricing_run_rules()` refusing an acceptance that is not acceptable
(through a `pricing_run_rerun_acceptable(run)` built from the same predicate) and a re-run of a run not in effect
(through `pricing_run_in_effect()`), with the domain model's rule lines and database tests. It is the house pattern
("the database checks the same"), recommended for the next migration that touches `pricing_run`.
