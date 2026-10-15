# 0037. Re-run a complete run for the same lines, diff it from the traces, accept it by hand, and roll content back by withdrawal

- **Status:** accepted
- **Date:** 2026-10-19
- **Deciders:** founder (engineering)
- **PRD sections:** 5 (J6, J17), 7 (Pricing runs: "compare two runs; re-run under a new release with a diff";
  Internal console: Rule releases), 9 (The release pipeline, steps 1 to 5), 18 (Releases); test matrix PRC-19,
  MAP-03; the load-release skill; ADRs 0003, 0008, 0029, 0035

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
- **A re-run is in effect only once accepted.** `accepted_by` and `accepted_at` are set once, on a complete
  re-run, by the person acting, for the roles that map plans (`mapping.edit`, checked again by a restrictive
  policy), never for a run whose release was withdrawn. It is the one step a complete run may take; what it
  priced, its coverage and its lines never change (the same trigger refuses everything else, for every
  role). Accepting again changes nothing. A first run of a period is in effect when it completes, as before.
  For a period, the run in effect is the eligible run (a complete first run or an accepted re-run) that took
  effect last (`coalesce(accepted_at, completed_at)`); Claims and lines read, per line, the eligible run that
  priced it and took effect last, Coverage the eligible run that took effect last, and the line trace the
  same unless a run is asked for.
- **A diff is the stored lines, matched by service line** (`compareRuns`, `apps/worker/src/price/diff.ts`):
  exactly the lines whose expected allowed, unpriced reason or adjustments applied differ, and the lines one
  run priced and the other did not. `pricing_run_changed_lines(before, after)` counts the same predicate in
  SQL. Each listed line's two priced lines are audited reads (purpose `run_comparison`).
- **The cause comes from the two traces** (`lineCauses`, `causes.ts`, pure): the mapping (another
  `mapping_id` or kind), the contract version (another version or rate record), a rule record (a record of the
  same rule, type and key, whose value or window differs, looked up in `rule_record` by release and SHA-256:
  a record re-sourced under a new hash with the same value is not a cause; a record read in one run only is a
  cause when the line kept its terms), the claim's facts, the practice's settings, the engine; and, when none
  of the line's own inputs changed, "another line of the claim" (the multiple procedure ranking, the per-visit
  carrier), since the engine is pure.
- **The dry run prices in memory, twice** (`runReleaseImpact`, `impact.ts`): a run's lines under its own
  release and under the release tried, with the practice's agreements and settings as they are now and the
  run's triage date, by the price job's own engine; a line would change when the same three things differ.
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
  re-run a complete run under the release in force from its page, the re-run's page with its diff and the
  Accept button, run state badges (in effect, awaiting acceptance, release withdrawn), and a notice when runs in
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
through the same service), triage reads runs (it should read the run in effect), or a release needs to be
reinstated after a withdrawal.
