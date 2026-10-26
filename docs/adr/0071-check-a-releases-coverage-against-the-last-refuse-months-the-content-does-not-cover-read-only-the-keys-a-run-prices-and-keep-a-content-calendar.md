# 0071. Check a release's coverage against the last, refuse months the content does not cover, read only the keys a run prices, and keep a content calendar

- **Status:** accepted (`co-001/release-content-checks`, combined audit #7, #30, #31 and #59). Amends
  [0008](0008-rule-records-and-releases.md) (a release's coverage is refused when it
  shrinks; below). A later pull request, after #42 merges, appends the alarms, the heap flags and the daily content job
  ("The split", below).
- **Date:** 2026-10-26
- **Deciders:** the founder, Tyler Williams, who adopted the combined best-option audit in full on 2026-10-20 (about
  15:10 UTC; items #7, #30, #31 and #59 among it, each placed in the release-operations pull request before PR 7, and
  its 19 freeze exceptions granted, #30's among them), under the standing rule of 2026-10-18; the co-founder, under the
  founder's delegation of 2026-10-25 (LANES.md), for the choices the design reports as taken, and by his ruling of
  2026-10-26 (about 00:20 UTC, "Don't ask for approvals anymore just build and optimize") for the cost and security
  trade-offs Q1 and Q2, both taken as recommended; the build (Lane B, LANES queue item 14), for the rest, each
  reversible.
- **PRD sections:** 9 (content releases: the checker, the record types and their refresh), 11 (the engine's content
  reads, through its trace), 12 (triage), 16 (operations security: what a public issue may hold), 18 (the checks and
  the weekly tests); 19's runbooks (`docs/runbooks/content-updates.md`); Change Order 001 and reconciliation-001's
  checks (the content pipeline); test matrix RCC-01 to RCC-08; ADRs 0008, 0062 and 0064.

## Context

The combined audit (`/home/user/ops/audits/combined/combined-report.md`) found four gaps in how rule content reaches a
price:

- **#7, missing Medicare content silently prices without its limits.** The engine reads the per-code MPPR list, the
  general MPPR rate and the MUE on each line's date; when the release holds no record for that date the line prices
  without the reduction or the unit limit and looks right. The audit's option: compute outside the engine the dates
  each such content is loaded for, refuse a month whose lines read one outside them, naming the content and quarter,
  show the customer what waits, plan the month again once a release covers it, hold a priced line that read outside
  them, word a fee-schedule gap, and log one content alert per run.
- **#30, quarterly content updates can drop a quarter, or keep old values all year.** RVU, GPCI, ZIP and MUE files
  carry no dates of their own and took the calendar year by default; nothing refused a release that stopped covering
  dates its predecessor covered. The audit's option: import each quarterly file for exactly its stated quarter,
  cross-checked against what the file declares; refuse a release that covers less than the one before, beyond a
  look-back, the source's own closings and a signed withdrawal; refuse gaps inside a content.
- **#31, real-size rule releases will not fit in memory.** Each price job, triage and report read the whole release
  (about 2.25 million records at production shape, more once #30 keeps every quarter). The audit's option: fetch only
  the keys a run's lines can look up, fail loudly on a lookup outside them, read two types in triage and reports, set
  an explicit heap limit, and test weekly at real size under production limits.
- **#59, nobody is told when CMS publishes or when the loaded content runs out.** The audit's option: a reviewed
  content calendar, a scheduled workflow that opens an issue with the exact import commands, the console's "Content
  due", the customer's loaded-through dates, and a runbook with the target time to load.

The frozen content pipeline constrains #30: reconciliation-001's check "`tools/verify-content`,
`.claude/hooks/protect-content.sh` and `.github/workflows/publish-content.yml` are unchanged". So does the engine
freeze: no file under `packages/pricing` changes, so every engine behaviour here is read through its trace.

## Decision

### The exception (#30)

The founder's adoption of the combined audit on 2026-10-20 granted its 19 freeze exceptions (`HANDOFF.md`); #30's
reads "Content checker and importer: added refusals only, which touches the frozen content pipeline. Freeze exception:
yes". This pull request uses it, and only for added refusals:

- `tools/verify-content/check.ts` gains problems, never loses or rewords one: in real content only, whatever a record's
  source method, a quarterly record's window that leaves one CMS quarter (C1), a per-code MPPR window that is open or
  leaves its calendar year (C2), a ZIP record whose quoted lines state another quarter (C3), a hand-typed quarterly or
  per-code MPPR record (C15), one stored source file's records with different windows (C16, keyed on `source.path`,
  so two quarters of identical bytes under two names pass), and an RVU, GPCI or MUE record whose window is not inside
  the quarter its stored file states (title lines, stored name or `source.url`, read by the importer's own
  `statedQuarter`) or does not start on the file's stated effective day (C17); in every set, a gap inside a content
  (C4); on a numbered release, a missing, unreadable or wrong `COVERAGE.md` (one that is not byte for byte what the
  assembler writes, or whose JSON repeats a key, among them), a release numbered below one already prepared or
  published, a previous release whose files are not those its own `MANIFEST.json` seals, and a coverage loss no
  allowance explains (C5 to C14); on the drafts, a malformed or stale `COVERAGE-WITHDRAWN.md`, one listing a range
  twice among them (D1, D2). Its `index.ts` is unchanged. The assembler refuses the same low release number before it
  writes.
- `packages/rules/src/import.ts` refuses, before anything is written (I1 to I8): an undated file's open window; a
  quarterly file that states no quarter, or two; a quarterly file's window not given, or leaving its stated quarter; a
  `--year` other than that quarter's; a stated effective day the window does not start on; a per-code MPPR window
  leaving its calendar year; a draft of the same name that holds another window, which it never replaces (the same
  window re-imports over its own draft). The ZIP5 parser refuses a line with no year and quarter at 76-80, or another
  quarter's (Z1, Z2), in the ZIP9 parser's words; a line of the wrong length gets a length message.
- Every set or import that passed before and still passes yields the same records; nothing refused before passes now;
  `.claude/hooks/protect-content.sh` and `.github/workflows/publish-content.yml` are unchanged by it. The real drafts
  hold no record the new rules refuse: their only `mppr_rate` record is the hand-typed, open general reduction, which
  none of them reads.

reconciliation-001 records the exception under its content-pipeline check.

### Coverage (#30 R3)

A content is a record type, with `mppr_rate` split as `rule_release_content_span()` splits it (ADR 0064): per-code
rates (`key ? 'hcpcs'`) and the general reduction (`key ? 'component'`). An identity is a record type and its
canonical key; its coverage is the merged dates its records are in force. A release must cover, for every identity
the previous release covered, every date it covered. The previous release is the highest number below it in
`content/releases` or `content/outgoing` (`previousReleaseNumber`, which fails closed on any error but a directory
that does not exist yet). Three allowances, each listed in the release's `COVERAGE.md` by the assembler and
recomputed by the checker:

- **Before the look-back.** Dates before January 1 of the prepared year less six. Six years covers line data's
  retention ("contract term plus six years", PRD 19) and every Medicare window, so a re-run of a retained month never
  meets a release that dropped its dates. The cutoff is anchored on the release's recorded prepared date, never on
  today, so the same release checks the same way on any day.
- **Closed by the source's own dates.** For the types whose window comes from the file (NCCI PTP, CARC, RARC, claim
  status codes, conversion factors): an open record of the previous release closed, in the new one, on the day before
  the lost range by a record with the same start, and, for the parsed NCCI PTP and X12 code-list types, only when the
  row that closing record quotes states that end date: an end typed into a draft by hand closes nothing. Nothing else
  is closed by source; a quarterly or hand-typed type gets no carve-out.
- **Withdrawn on purpose,** by `content/drafts/COVERAGE-WITHDRAWN.md`: exact ranges, each with one reason and two
  named people, for the newest release. The assembler copies its entries into `COVERAGE.md` and `RELEASE.md`, and
  removes the note only once the release verifies.

`COVERAGE.md` is a heading, a short summary and exactly one `json` block (`tp-release-coverage/1`): the release, the
previous release, the prepared date, the look-back and its cutoff, per content the record count, merged windows,
newest start and newest retrieved date, and the three allowance lists. It is written before the manifest seals the
release. The checker holds a compact coverage map of the previous release, one interned string per identity and never
a record, at most two maps a run (#30 R5; a test bounds 2,000,000 PTP identities at 320 MiB of heap).

**The two-person withdrawal.** The names are compared trimmed and case-folded, which catches a slip and nothing more:
one person can type two names. The second signature of record is the founder's code-owner review of the pull request
that adds `content/drafts/COVERAGE-WITHDRAWN.md` (`.github/CODEOWNERS` `*`).

**Amends ADR 0008.** Its alternatives table held that "listing the exclusions in RELEASE.md and the dry-run's removed
counts make a missing record type visible instead". Visibility alone is not enough: a release whose coverage shrinks
beyond the allowances is now refused, by the assembler before it writes and by the checker on every pull request.

### The quarter rule and gaps (#30 R1, R2, R4)

The quarterly types are `pfs_rvu`, `pfs_gpci` (it ships in every quarterly RVU zip), `ncci_mue`, `locality_map` and
`locality_map_plus_four`. An import of one takes a window inside the one CMS quarter the file states, read from the
ZIP files' YYYYQ at 76-80, or for PPRRVU, GPCI and MUE from the quarter tokens and effective dates in its title lines,
its file name and the last path segment of its required download address, failing closed (`statedQuarter`, exported
from `@tp/rules`). A quarter token ends at any character that is not a letter or digit (an underscore no longer joins
it to the next word), an RVU token may carry CMS's revision letter (`RVU24AR`), and `Eff` or `Effective` may be
followed by a space, underscore, colon, dot or dash. Every RVU zip of a year ships `GPCI2026.csv`, often with the same
bytes, so it is renamed per quarter (`GPCI2026_Q4.csv`) before import: one stored file holds one window (C16), and the
importer never replaces another quarter's draft of the same name. Inside, not equal to: CMS reissues a quarter's file with values that take effect mid-quarter,
and the correction loads as two windows, the original up to the day before and the corrected file from its stated
effective day. The checker's no-gap rule (a content's merged windows may hold no hole between its first start and its
last end; `locality_map_plus_four` is sparse by design and keeps its own check) and the existing overlap refusal then
cover each quarter of the content once, whole. The per-code MPPR list keeps its calendar-year default but is never
open and never leaves one year. So no record can widen a content's span, which #7's refusal reads, beyond the quarter
or year its file states.

### Months the content does not cover (#7)

**The failure codes** are `waiting_on_content_mppr`, `waiting_on_content_mue` and `waiting_on_content_mppr_mue`. A
line "read" a content when its trace shows the read (`contentReads()`), never from the flags alone; triage's
`TriageFacts.contentNotLoaded` is required, never read as false when absent. A run any of whose
lines read the per-code MPPR, the general MPPR or the MUE on a day outside that content's span (from
`rule_release_content_span()`, ADR 0064, called and not changed) fails with no line kept. The codes name the families
exactly: one code would leave the screens to guess the families from the spans afterwards, and could name a family no
line needed. The quarter is worked out when read, from the run's period and its release's spans, both immutable, so
nothing new is stored. `pricing_run.failure_code` has only its shape CHECK, so the codes need no migration.

**The precedence of a run's stops:** a read outside the fetch (PaidWhole's defect, never hidden), then the location
(the customer's step), then content. It holds over the whole run because no stop throws inside the batch loop: each
line's stop is recorded, the run prices on to its end storing nothing more after the first, and the stops are judged
after the loop. The transaction is rolled back either way. When a run meets both a location stop and a content gap, the
customer's location step is shown first: the content wait is learned on the next run, and a location-refused run logs
no `CONTENT_NOT_LOADED` line, even when every line also read content outside its span.

A month failed `release_read_outside_fetch` has no wait: it is planned again at each monitoring trigger and fails at
its first bad batch until the defect is fixed, then prices by itself. The customer is told it was logged for the
operator and that the month is priced again by itself once fixed, never that the operator was alerted, since no alarm
reads the line yet.

The monitor does not plan such a month again while the release in force is the failed run's own, or covers no more of
the month for the code's families, and the practice's mappings and contract versions are unchanged since the run; a
release that covers more, a newer line or changed terms plan it again. Coverage shows the waiting months with their
quarter, families, lines and billed dollars, and one sentence per fee-schedule quarter (terms priced on the service
date) or year (terms locked to a year) not loaded; it is the same computation as #59's banner, and reads only the
`pfs_rvu` windows of the release in force. Its headline adds the waiting months' lines and dollars, never their
claims, which a claim spanning two months would count twice. A content gap on a GPCI or a conversion factor under
`LOCKED:<year>` terms is judged, as the engine looked it up, against that basis year (any window meeting it); the
locality and the plus-four keep the service date. Triage holds a priced
line whose trace read MPPR or MUE outside its release's spans as `CONTENT_NOT_LOADED`, never actionable, and the audit
report names it. The remedy tables and `docs/product/unpriced-reasons.md` are unchanged.

**One content alert per run:** a run refused `waiting_on_content_*`, or a complete run with lines stopped by other
content not loaded for their dates, logs `CONTENT_NOT_LOADED` once with a line count (warn, "pricing run found lines
stopped by rule content not loaded for their dates"); the monitor logs `WAITING_ON_CONTENT` per plan (warn); a run
failed `release_read_outside_fetch` logs `RELEASE_READ_OUTSIDE_FETCH` once (error, "pricing run read rule content
outside the keys it fetched"). Until the alarm lands no alarm reads these lines, and the operator checks the worker's
log for the three codes daily (docs/runbooks/content-updates.md, section 8). **The engine-error page stays** as it is:
a content gap that pages as `PRICING_ENGINE_ERROR` today keeps paging until the content alert has its own alarm, which
needs `infra/lib/constructs/monitoring.ts`, a #42 file, and a content-refused run whose other lines stopped on engine
errors that page also logs that line. Dropping the page first would leave content gaps with no alarm.

### Reading a release by key (#31)

**The keyed reader's contract** (`ReleaseSource`): a caller asks for each batch's keys (`claimsRequestedKeys`: the
codes, pairs and localities its claims can look up), and the source fetches the keys it has not fetched yet in this
run, one probe of `rule_record_identity` per key (fenced with `OFFSET 0`, so the planner never scans or joins the
release), and the types that are not keyed whole, once per release and manifest per process. The view serves exactly
the records the whole-release index serves for every key asked (an oracle test holds every stored row, traces included,
byte-equal); any other keyed lookup sets `violation` and throws, and the caller fails the run as
`release_read_outside_fetch` before that batch is stored, logging `RELEASE_READ_OUTSIDE_FETCH` for the operator. The
release-impact check and the dry run read both releases through it, the dry run through a source of its own per run
(over the shared index), so one run's keys never hide another's miss. Triage and the audit report read only
`mppr_rate` and `conversion_factor` through a typed reader that throws `ReleaseTypeNotRead` on any other type.
`diff.ts` joins `rule_record` on its identity columns, not on `sha256`, which no index covers.

**The heap limits** are today's automatic sizes made explicit (`infra/lib/heap.ts`: worker 560 MiB, platform 259, web
560), so wiring them changes no behaviour.

**The weekly real-size test** (`tools/release-capacity/`, `.github/workflows/release-capacity.yml`) runs the
production worker image at the worker task's limits, with production's command and the heap flag, under the SYNTHETIC
quarterly scale release 900110 (every quarterly type per CMS quarter for seven years, about 4.17 million records),
built outside the repository. A 100,000-line month prices while another practice's audit report prints and four 835s
parse, as one worker runs every job type's loop at once; then triage and a report. It fails on any job not complete,
a count off, an OOM kill or restart, `memory.peak` above 90% of the task, a concurrent phase whose memory was sampled
fewer than once each 2 seconds, or a read outside the fetch; times are recorded and advisory, as the founder ruled for
the screening's test. A failure, a cancel (the 180-minute timeout among them) or an advisory (the windows query over its
5 s budget, handed on as the job's `advisories` output) opens or comments on an issue, the advisory lines in its body;
an advisory on a pass goes to its own issue, "Release capacity advisory". **It leaves the five 50,000-row screenings to
screening-capacity's weekly S1 to S5:** the screenings run in their own task with its own limits, so running them again
in the worker's harness would measure nothing new.

### The content calendar (#59)

`packages/rules/src/calendar.ts` (exported only as `@tp/rules/calendar`, so the screening-capacity closure is
unchanged) holds every content family but PaidWhole's own, with its cadence, lead, source page and import commands;
`contentDue()` reports content ending within 45 or 14 days, ended, a period due with no draft, an open-ended content
overdue, and calendar entries never reviewed or reviewed more than 13 months ago, with the import commands for every
period a family lacks up to today, each only for the contents it lacks then (an import command must load one of its
entry's contents). Before any release is published the
drafts are judged, and the titles say so. The entries ship unreviewed, and the workflow reports that until a reviewer
confirms each against its source page: dates that cannot be checked from here are never presented as reviewed. The
console shows "Content due" from the release in force, reading the checkout's drafts again only once a file under
them or the prepared releases changes; the customer's Releases page lists every dated family of the release in force,
loaded through a date, in force with no end, loaded only from a later date, only partly loaded, or not loaded, reading
only those families' record types (the content-through cache is keyed by release, manifest and record-type set). `docs/runbooks/content-updates.md` holds the calendar's table (held equal to it by a test) and the
target time to load: in a published release 14 days before the period starts, or within 3 business days of a late
publication.

`.github/workflows/content-calendar.yml` runs daily: a `check` job that only reads, and a `notify` job that alone holds
`issues: write`, checks nothing out, runs no repository code and opens one issue per finding not already open under
the same title, reading every page of the open issues. It opens at most 20 new issues a run, counting only titles not
already open, so no finding is starved by older ones staying open; the rest are listed in one issue, "Content
calendar: findings not filed", which closes once every finding is filed. A check that did not finish, or handed on no
findings list, opens or comments on one "Content calendar check failing" issue at every such run. The findings file
holds every finding (each body at most 6,000 characters; a cut body keeps its source and runbook and says how many
lines were cut and where the rest is), bounded at 700,000 bytes so its base64 fits a job output.

**The source watch** reads each entry's page over https from the calendar's own hosts only, following at most three
redirects itself under the same rule, for at most 20 seconds and 5 MiB; anything else is "unreachable". It reads
double-quoted, single-quoted and unquoted links, and matches the entry's pattern against every decoded name, so a new
period's file is a finding whatever its name holds. A recorded entry whose page links no matching file any more is a
finding of its own, `source_lost`: the watch cannot see the source.

**Why issues on a public repository hold only public references** (Q1, taken as recommended under the co-founder's
ruling of 2026-10-26). The repository is public, so its issues are. They hold only calendar data, public CMS and X12
page addresses, file names seen on those pages (each in a code span: a name of letters, digits, dot, underscore and
hyphen as it is, any other matching name percent-encoded, which leaves only those characters and `%`, so no
third-party name can mention a person, link an issue or break the rendering, and none is missed), repository release
numbers and import commands. Nothing comes from a database, a customer or
production. Turning the issues off until the repository is private would lose #59's main signal before release 1.

**The two scheduled workflows** (Q2, taken as recommended under the same ruling): the calendar daily, up to 15
minutes, and the real-size test weekly, up to 180, on the free 4-CPU runner. Free while the repository is public. Once
private, the calendar's about 450 standard minutes a month (plus a check run per push or pull request touching the
calendar or `content/`) stay inside GitHub Team's included 3,000; but the private standard runner has 2 CPUs, which the
real-size test refuses as RUNNER_TOO_SMALL before measuring, so it then needs the same 4-core larger runner as
screening-capacity's (an organization on GitHub Team; docs/runbooks/screening-capacity.md, "The 8-core runner"),
about 780 larger-runner minutes a month billed beyond the included minutes. Until its label changes with
screening-capacity's, a private weekly run fails every week without measuring. The weekly run is #31's only proof that
release 1 fits the worker. Neither is a required check, and both schedules fire only from the default
branch (the founder's ruling F1 (a)).

### The split, and Lane A's function

What needs a #42 file waits for a later pull request after #42 merges: the content alerts' metric filters and alarms
(`CONTENT_NOT_LOADED`, `WAITING_ON_CONTENT`, `RELEASE_READ_OUTSIDE_FETCH` paging the operator, and the daily job's
stages), after which content-gap lines leave the
engine-error page; the heap flags in the task commands (`infra/lib/constructs/compute.ts`); the daily `content_due`
platform job (`apps/worker/src/jobs/platform.ts`) with `tools/screening-capacity/watched-paths.txt` regenerated for
it; the monthly digest's and Pricing settings' waiting months; screening-capacity's S1 to S5 moved onto 900110; and
whether NCCI PTP becomes a fourth span content or a triage hold, since a PTP quarter not loaded drops `NCCI_REVIEW`
holds without notice today.
Its test-matrix rows take numbers RCC reserves.

The daily job runs as `tp_operator`, which has no grant on any rule object. It needs Lane A's
`operator_content_coverage()`: one migration, SECURITY DEFINER with `search_path` pinned and EXECUTE to `tp_operator`
only, returning the release in force and, per content, the date multirange of its windows, the newest
`effective_from` and the newest retrieved date, with no key, value or quote. It is preferred to a GRANT on
`rule_record`, which is DDL on a rule table and would change the engine freeze's rule-table catalog. So #59's
"Database: no" holds for this pull request and not for the daily job; the function is handed to Lane A (LANES.md). This
pull request has no migration.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| A single `waiting_on_content` failure code | The screens would have to guess the families from the spans afterwards, and could name one no line read |
| The keyed read without a per-run cache | Every batch would probe the same codes and pairs again; the cache is bounded by the run's distinct keys, not the release |
| A `.json` coverage file | `readRelease`, the loader and `publish-content.sh` read every `.json` in a release; a `.md` with one JSON block is ignored by all three, so the frozen publish path needs no change |
| A hash on each withdrawn entry | The note is reviewed in its pull request and sealed by the manifest; a hash the author computes proves nothing more |
| A look-back from today | The same release would check differently on different days; the recorded prepared date makes it deterministic |
| A GRANT on `rule_record` for `tp_operator` | DDL on a rule table (reconciliation-001) and a change to the rule-table catalog; a SECURITY DEFINER function returns only windows |
| The daily platform job now, through `fields.ts` | It needs `platform.ts`, a #42 file, and Lane A's function; its log fields belong with its first user |

## Consequences

- A release that drops a quarter, a code or a date fails `pnpm release:assemble` and `pnpm verify-content`, naming
  each range; a deliberate withdrawal is a reviewed file. The first real PPRRVU, GPCI or MUE download may be refused
  because it states its quarter in a way the patterns do not read: a parser pull request adds the statement, and never
  removes the refusal.
- A Medicare Advantage month dated after its release's MPPR or MUE fails as waiting on that content instead of pricing
  without the limit, and prices by itself once the content loads. A commercial fixed-fee month still prices.
- Price jobs, triage and reports hold the keys they price and two types, not the release; the weekly test proves it at
  the size #30 produces.
- The checks that prove it: RCC-01 to RCC-08 (`docs/product/test-matrix.md`), `pnpm verify-content` on the drafts and
  fixture releases 900001 to 900007, the engine freeze's check with no exception, and `tools/test/workflows.test.ts`
  for both workflows.

## Revisit when

- The first real CMS download shows how each file states its quarter (the patterns are the contract until then).
- Lane A's #8 stores per-release counts and windows at load: the web then reads them instead of aggregating a release.
- The repository turns private: move release-capacity's runner label with screening-capacity's to the 4-core larger
  runner, read the two workflows' minutes against the budget, and whether issues stay the signal.
- The first review of each calendar entry confirms its file pattern against the page (the fix round could not reach
  cms.gov; a page that links per-period sub-pages matches nothing and reads as `source_lost` once files are recorded).
- The later pull request lands the content alarm: the engine-error page then stops counting content gaps.
