# 0064. Resolve a split ZIP's locality from the ZIP+4 file's ranges, the one engine change the freeze allows

- **Status:** accepted (PR 6b-1, the engine part); amends [0029](0029-price-a-claim-at-a-time-from-resolved-agreements-and-recompute-every-amount-from-its-trace.md) (the trace's two optional keys), [0033](0033-read-contract-pages-at-intake-in-a-bounded-thread-hold-general-terms-and-price-what-the-review-found-unsettled.md) (the locality rule) and [0034](0034-price-every-contract-method-hold-ncci-edits-for-review-and-keep-the-golden-lines-first.md) (`ENGINE_VERSION`). PR 6b-2 amends it with the practice's location record, the pricing settings taken at onboarding, the months that wait for them, the split every practice defaults to and the screening's ZIP+4 ("Amendment (PR 6b-2)", below; the founder's answers of 2026-10-21 to Q2, Q3, Q5, Q6 and Q11 (a)).
- **Date:** 2026-10-21
- **Deciders:** the founder, Tyler Williams: the ruling of 11:47 UTC on 2026-10-18 that supersedes ADR 0062's owner ruling 3 (`docs/product/reconciliation-001.md`, the engine freeze at line 428 and the Approval at line 499), and on 2026-10-21 (about 22:30 UTC) the answers to PR 6b's 13 questions ("Do all the recommended options for these questions as long as it optimizes the app"; every recommended answer of `designs/pr6b-plan.md` section 3 accepted), of which this pull request builds Q3 (a) and Q4 (a); the build (PR 6b-1 of Change Order 001)
- **PRD sections:** 9 (rule records and releases), 11 (the engine: step 2 and the trace), 18 (the pricing oracle); Change Order 001 and reconciliation-001's checks (lines 423-454); test matrix PRC-16, PRC-21 and PRC-22; ADRs 0020, 0029, 0033, 0034, 0037 and 0062

## Context

CMS prices a Medicare line at the payment locality of the place of service. Its quarterly "ZIP Code to Carrier
Locality File" archive holds two fixed-width files: ZIP5, one line per five-digit ZIP, and ZIP9, nine-digit codes
"only ... for the identified problem areas" (CMS transmittal R1249CP, CR 5578): the ZIPs whose ZIP5 line carries the
plus-four flag at position 21, because they span localities. A Medicare contractor returns a claim for such a ZIP
without its ZIP+4 as unprocessable (First Coast, "ZIP codes requiring a nine-digit ZIP code").

What the repository held at `8e33cb3`, and what constrains the design:

- The engine takes a five-digit ZIP (`PracticeSettings.zip`, `/^\d{5}$/`) and reads the `locality_map` record in
  force on the service date, whatever the basis year (QUESTIONS Q07). A record with `plus_four_required` true stops
  every fee-schedule line with `ENGINE_ERROR locality_needs_zip_plus_four` (ADR 0033): no input carried a ZIP+4.
- `cms_zip5_locality` reads the flag; nothing read the ZIP9 file, and no record type could hold it.
- Change Order 001 froze the engine: no non-test file under `packages/pricing/src` changes, `fixtures/golden` stays
  unchanged, and no DDL touches `rule_release`, `rule_record` or `rule_release_withdrawal`. The founder's ruling of
  11:47 UTC on 2026-10-18 loosened the freeze for this lookup alone: ZIP+4 localities are fixed before launch in PR 6b,
  five-digit ZIPs and the golden lines unchanged.
- Releases 900001 to 900005 are frozen (110 golden claims pin 900001's manifest); 900001 flags 00012 and carries no
  ZIP9 file.

## Decision

**The founder's rulings this pull request builds, recorded 2026-10-21.**
- The ruling of 11:47 UTC on 2026-10-18: the engine resolves a ZIP+4's locality, and nothing else under
  `packages/pricing/src` changes. `git diff --stat <base> -- packages/pricing/src ':!**/*.test.ts'` lists exactly
  `engine.ts`, `reasons.ts`, `recompute.ts`, `trace.ts` and `types.ts`; `testing.ts` and `index.ts` are unchanged.
- **Q3 (a), granted as an exception to reconciliation-001's rule-table check:** a new rule record type,
  `locality_map_plus_four`. Widening `rule_record`'s record-type CHECK by it lands in PR 6b-2's migration, the first
  pull request that loads a release holding one; this pull request has no migration and loads 900006 into no
  database. Until then `loadRelease` of such a release fails closed at the CHECK, which is harmless before launch.
- **Q4 (a), granted as an exception to "`pnpm test:golden` passes with `fixtures/golden` unchanged":** golden claims
  G196 to G199 under the SYNTHETIC release 900006, with every existing golden file byte-identical
  (`--diff-filter=MDRT` empty). The golden builder adds them, QUESTIONS Q37 and the README's count; the independent
  worksheet reads the ZIP9 file itself by the CMS layout, never the release's ranges.

**The record.** One `locality_map_plus_four` record per flagged ZIP and window, keyed `{zip}` (five digits), whose
value is `{state, ranges: [{from, to, carrier, locality, rural_indicator}]}`: inclusive four-digit bounds, sorted by
`from`, never overlapping, one to 10,000 of them. Consecutive codes of one carrier, locality and rural indicator fold
into one range; a code the file does not list is in no range. One record per ZIP rather than one per code keeps a
release a few thousand records, not a line per nine-digit code (audit #31), keeps the lookup an exact key, so
`IndexedRelease` and a keyed read by ZIP are unchanged, and leaves a search of a few ranges inside the engine. The
schema refuses a range that ends before it starts, ranges out of order or overlapping, a bound that is not four
digits, an empty list and an extra field. The key's ZIP 000xx already marks a SYNTHETIC record (`guards.ts`).

**The ZIP9 file and its parser (`cms_zip9_locality`).** ZIP5's positions 1-21 (state 1-2, ZIP 3-7, carrier 8-12,
pricing locality 13-14, rural indicator 15, plus-four flag 21, which must be 1), then one plus-four code at 22-25, in
80-character records whose year and quarter (YYYYQ) at 76-80 must be one value for the file, the quarter the import
window starts in, so a file of another quarter never takes this window's localities. *Open item O1, unconfirmed:* the builder could not read CMS's own
record layout: from the build's session www.cms.gov, www.cms.hhs.gov and www.dir.ca.gov could not be reached (the
fetch failed to resolve them and the egress proxy refused the connection). A web search found only the California
DIR copy (2020), a third-party copy, which puts a single plus-four at 22-25 with the flag at 21, and no "low" or
"high" field. The parser follows that layout, as the design
does, and its first review question asks a reader to confirm it against the layout document shipped in the archive
before any record reaches L2. If CMS's layout is a low and high pair (22-25 and 26-29), only the parser changes: a
pair is a range, and the record holds either. Until the layout is read, a line holding a second four-digit code at
26-29 is refused, so a pair layout cannot load as single codes whose pairs' insides would read as "not listed". The
parser refuses a line that is not 80 characters or is off the layout, a flag other than 1, a code that is not four
digits, a year and quarter that is not YYYYQ or not the window's, a code mapped twice and a ZIP in two states. Each record quotes the first and
last line of each range (`ParsedRow.quotes`, which the record builder uses in place of the one quote), so
`pnpm verify-content` finds every quote in the stored file. The notes say "N lines folded into M ranges of Z ZIP
codes". No real CMS content was downloaded or committed.

**Completeness at assembly.** `release:assemble` refuses a release in which a `locality_map` record with
`plus_four_required` true is not covered, on every date of its window, by `locality_map_plus_four` records of the
same ZIP (`plusFourGaps`, naming the first date left uncovered): a release without the quarter's ZIP9 file would stop
every such practice's fee-schedule lines though the practice gave its ZIP+4. "The same quarter's" is read from the
files: a plus-four record counts only when every line it quotes carries the flagged ZIP5 line's year and quarter and its
state is the ZIP5 record's; one of another quarter or state is named, and covers nothing. The check runs on the real-release path
only; the SYNTHETIC releases are rendered, never assembled, so 900001 keeps flagging 00012 without a ZIP9 file.

**The engine (`ENGINE_VERSION` `phase-two/2`).**
- `PracticeSettings.zipPlusFour`, optional: four digits, or null or absent. Every existing caller compiles
  unchanged; nothing in `apps/` passes one until PR 6b-2. A ZIP+4 that is not four digits is `invalid_settings`.
- Only when the ZIP's `locality_map` record says `plus_four_required` true: without a ZIP+4 the line stays
  `ENGINE_ERROR locality_needs_zip_plus_four`; with one, the ZIP's `locality_map_plus_four` record in force on the
  service date (never the latest of a LOCKED basis year: the locality follows the service date, Q07) and its range
  holding the ZIP+4 name the carrier and locality whose GPCI prices the line, never a neighbour's locality. Two new
  details tell the stops apart (review of 2026-10-22): no such record in force is `ENGINE_ERROR no_locality_plus_four`,
  a gap in the content like `no_locality` and never the practice's ZIP+4; a record with no range holding the code is
  `ENGINE_ERROR zip_plus_four_not_in_locality_map`, and the trace names the record read. `UNPRICED_REASONS` and
  `REVIEW_DETAILS` are unchanged, so both details page the operator, and `docs/product/unpriced-reasons.md` (which
  lists reasons, not details) is unchanged.
- A ZIP that needs no ZIP+4 never reads one: given one, it prices exactly as without it.
- The trace keeps its format, `tp-pricing-trace/2`, and gains three optional keys: `settings.zip_plus_four`, verbatim
  and present only when a ZIP+4 is given; `steps.fee_schedule.locality.plus_four` (the plus-four record, the ZIP+4, the
  range's bounds, each four digits, and its carrier and locality), present only when the ZIP+4 decided the locality;
  and `steps.fee_schedule.locality.plus_four_unlisted`, the plus-four record read, present only when it held no range
  for the ZIP+4, so a re-run's diff names that record's version rather than "a rule record the line now reads". The
  locality's own `carrier` and `locality` stay the ZIP5 record's. A trace of a five-digit input has none of the keys:
  it is phase-two/1's trace key for key but for `engine`. The schema stays strict, so an image that predates the keys
  refuses a trace carrying them.
- `recompute(trace)` holds the step to what it was computed for, and accepts only the step the engine writes: the
  flag (a flagged ZIP's priced line must carry the step, an unflagged one must not), the plus-four record's type and
  its key against the settings' ZIP, its ZIP+4 against the settings' (absent settings compare as none), the ZIP+4
  inside the recorded range, the record's window over the service date, no `plus_four_unlisted` on a priced line, and
  the GPCI's key against the range's carrier and locality.

**What a re-run shows.** A pricing run pins `engine_version`. A run created under phase-two/1 and still queued when
phase-two/2 deploys fails `engine_version_mismatch` (`apps/worker/src/price/execute.ts:170-172`) and is created again.
A re-run of a complete phase-two/1 run lists no changed line for any practice priced from a five-digit ZIP, which is
every practice until PR 6b-2: the amounts, reasons, adjustments and windows are equal, as the differential test proves.
A line that changes for another reason names the engine among its causes ("phase-two/1 to phase-two/2",
`causes.ts:172-173`). PR 6b-2 makes a ZIP+4 change name the setting rather than the release.

**Release 900006** (`tsx tools/release/synthetic.ts`): every file of 900001 unchanged but its GPCIs, parsed from
`GPCI_SYNTHETIC_900006.csv` (900001's locality 01 and 99999-02: work 1.000, PE 1.050, MP 0.700), and
`ZIP9_SYNTHETIC.txt` for 00012: 0000-4999 in locality 01, 5000-8999 in locality 02, 9000-9999 not listed. The
9,000-line ZIP9 file is rendered by the same tool, and unit tests hold it and 900006 equal to the rendering and
900001, 900004 and 900005 unchanged. The new GPCI table is pinned in the fixture guard's `pinned-tables.json`, as
900001's is.

**How the freeze is proved (PRC-22).** `tools/engine-freeze` (the golden builder's, hardened by the review of
2026-10-22):
- `exception.json` names the five files and the golden additions, and the pull request it is declared in
  (`pull_request`, 35); it applies only in that pull request (CI passes `PR_NUMBER`) and only when that pull request
  adds or edits it, and each of its entries must be used, so an exception carried into a later pull request by a
  one-byte or mode-only edit lets nothing through.
- `check.ts` fails any other engine path; any other file of `packages/pricing` but a test (its `package.json`,
  `tsconfig.json` or a copy of the engine beside `src`), exception or not; a workspace package that resolves
  `@tp/pricing` or `@tp/pricing/testing` anywhere but `packages/pricing/src`; any modified golden claim; any change to
  releases 900001 to 900005 or to a release a golden claim at the base pins (900006 once G196-G199 merge); an added
  golden file outside the list; and, in a migration the pull request adds or changes, DDL on or a write to the rule
  tables, a replacement, change or drop of a function their triggers execute, a grant on every table of a schema, a
  write granted on a view that reads them, a Unicode-escaped name and dynamic SQL built at run time, unless the
  exception names the statement (none here).
- `rule-tables.db.test.ts` holds the migrated catalog of the three rule tables (columns, constraints and the foreign
  keys to them, indexes, triggers with their functions' source hash and settings, policies, every role's grants,
  comments, inheritance, rules, and the views a role may write them through) to `rule-tables.catalog.json`, which
  `check.ts` lets change only under an exception that lists `rule_table_ddl`.
- `differential.test.ts` prices the 150 existing golden claims and 20,000 generated five-digit claims with the base
  engine, extracted with the base's own `@tp/money`, `@tp/rules`, `@tp/contracts` and their workspace dependencies,
  and with the head engine; it requires equal results but for `engine`, and for every line equal recomputations (the
  head's of its trace, the base's of its own, and the head's of the base's stored trace). It does not skip in CI.
  Third-party packages come from the head's lockfile. The engine's own property tests add: an unflagged ZIP prices the same with no ZIP+4 and with any
four digits; every code of 00012 prices at the locality its range names, and a code no range holds stops; a
five-digit input's trace carries neither new key.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| Keep refusing a split ZIP (ADR 0062's ruling 3) | Superseded by the founder's ruling of 11:47 UTC on 2026-10-18 |
| One record per nine-digit code, keyed `{zip, plus_four}` | A line per code of every split ZIP in every release, held in memory by the screening's cache (audit #31); the engine would look up a key that may not exist rather than read one record |
| Ranges inside the `locality_map` record | Changes a frozen record type's shape and every stored record's hash, and mixes two source files in one record, which `verify-content` cannot quote-check |
| The ZIP5 record's locality for a ZIP+4 the ZIP9 file does not list | A guess until the specialist answers Q37. If the answer is "the ZIP5 locality", the importer adds ranges covering the unlisted codes, quoting the ZIP5 line: a content change, not an engine change |
| The plus-four record by the LOCKED basis year | The locality follows the service date (Q07), as `locality_map` does |
| A new trace format (`tp-pricing-trace/3`) | The keys are optional and every stored trace stays valid; `ENGINE_VERSION` names the engine that wrote it |
| The completeness check on the SYNTHETIC releases too | 900001 flags 00012 without a ZIP9 file on purpose and is frozen; the release tests check 900006 against it instead |

## Consequences

- A practice whose billing ZIP spans localities prices from its ZIP+4 once PR 6b-2 passes the ZIP+4; until then
  nothing in `apps/` passes one, and every pricing path is as before.
- Every five-digit input, the 150 existing golden claims and releases 900001 to 900005 are unchanged; the golden set
  grows to 154 claims and 330 lines with G196 to G199.
- Branch coverage of `packages/pricing` stays 100%. Mutation testing measures the change: the pull request carries the
  `money` label, and `.github/workflows/mutation.yml` runs Stryker on a label as well as a push, fails an engine change
  that lacks the label, and runs a canary first (`tools/stryker/canary`), every one of whose mutants must be killed.
  The review of 2026-10-22 found the vitest runner (`@stryker-mutator/vitest-runner` 10.0.0) selecting no test for any
  covered mutant under Vitest 5, which names tests by `fullTestName` ("a > b"), so every runtime mutant survived
  (ADR 0047 had seen the symptom on the verifier); `patches/@stryker-mutator__vitest-runner@10.0.0.patch`, applied at
  install through `pnpm-workspace.yaml`, names a test as Vitest does, and `tools/stryker/runner.test.ts` holds it.
- The test matrix gains PRC-21 (with a fixture under 900006) and PRC-22.
- A release that loads 900006 needs PR 6b-2's CHECK; the closed-list test that holds `RULE_RECORD_TYPES` equal to the
  CHECK's 17 values comes with it.

## Revisit when

- CMS's ZIP9 record layout is read and differs from the one recorded here (open item O1), or release 1's ZIP9 content
  loads;
- the specialist answers Q37 (a ZIP+4 the ZIP9 file does not list);
- PR 6b-2 lands (the practice's location, settings at onboarding, the screening's ZIP+4), or the multi-site pull
  request gives each site its own location;
- the founder rules on PR 5's trigger on `rule_release_withdrawal`, which PR 6b-1's rule-table check found and
  reconciliation-001 records as a departure put to the founder: either way the catalog snapshot follows the ruling;
- a release of `@stryker-mutator/vitest-runner` supports Vitest 5, and the patch is dropped (the canary says whether
  it still works).

## Amendment (PR 6b-2, 2026-10-21): the practice's location, pricing settings at onboarding, the months that wait, the split, the screening's ZIP+4 and the content span

Migration `20261105090000_pricing_location_and_zip_plus_four.sql` (audit #33, #16's minimal record, #7's screening part
and #31's ZIP+4 key). Its schema is approved with `docs/product/domain-model.md` (CO-02).

**The founder's answers this amendment builds, recorded 2026-10-21** (about 22:30 UTC, PR 6b's 13 questions, every
recommended answer accepted):
- **Q2 (a):** the practice's pricing location is its own record, `practice_site`, one per practice and undated, set in
  Settings > Pricing settings (and by the platform administrator at creation and from the console). The multi-site pull
  request adds windows, NPIs and therapists per location and drops the unique index.
- **Q3 (a):** `rule_record`'s record-type CHECK takes `locality_map_plus_four`, a granted exception to
  reconciliation-001's rule-table check. It is the migration's one statement on a rule table, and
  `tools/engine-freeze/exception.json` (rewritten for this pull request: no engine file, no golden file) names it
  exactly as `check.ts` prints it. A closed-list test holds `RULE_RECORD_TYPES` equal to the CHECK's 17 values.
- **Q5 (a):** the permission `pricing_settings.set` for the practice administrator, the billing manager (a firm's under
  a grant, as it signs off contracts) and so the firm principal; the reimbursement reviewer is denied it, as every
  write. A granted exception to "the permission matrix changes only in PR 14"; one of the pull request's two
  adversarial reviews uses the security-reviewer checklist.
- **Q6 (a):** a Medicare row whose quarter is outside the release's loaded content is left out by the browser and
  counted on the upload (three numbers, never which rows, deleted with the upload at 30 days); a request that bypasses
  the browser is refused by the server and by `submit_screening()` (`screening_band_outside_content`).
- **Q11 (a):** no wording change for the ZIP+4 in what the pages say is kept: the words already cover a ZIP+4 entered
  in the ZIP code field (counsel confirms).

**The location.** `practice_site (practice_id, zip, zip_plus_four, updated_by)`: the ZIP five digits, the ZIP+4 four or
null (`practice_site_zip`, `practice_site_zip_plus_four`), one per practice (`practice_site_one_per_practice`). It holds
no PHI but has a NOT NULL `practice_id`, so it is registered and forced, with the tenant policy and the owner's for the
definer functions. The application role holds SELECT alone; a location is never deleted or truncated and changes only
its ZIP, ZIP+4 and who set them (`practice_site_rules`). A practice is created with its location in the same
transaction, whoever inserts it: the deferred constraint trigger `practice_has_site` checks at commit. The migration
backfills each practice's `practice.zip`; `practice.zip` is deprecated (never read or written; the application role
may no longer insert or update it) and is dropped by the multi-site pull request.

**Its status in a release.** `locality_status(release, zip5, plus_four, period_from, period_to)` and
`practice_location_status(practice, release, period_from, period_to)` (both invoker, granted to `tp_app`) answer from
the closed list `ready | no_release | zip_missing | zip_unknown | locality_not_loaded | zip_plus_four_needed |
zip_plus_four_unknown`, with the carrier and locality when ready. One order differs from the design's literal "first
match wins": a flagged ZIP with no ZIP+4 is `zip_plus_four_needed` before the release's missing ZIP+4 list is
`locality_not_loaded`, so under 900001 the customer is first asked for the ZIP+4 and, once it is given, told the list
is not loaded (the design's own journey, steps 5 and 6). A ZIP+4 that is not four digits is held by no range.

**Who sets it.** `practice_set_location()` (definer) refuses anyone but a person who holds `pricing_settings.set` in
a practice of the transaction's scope, and a malformed ZIP or ZIP+4 by the constraint's name, upserts the row and
returns its status under the release in force; it keeps the caller's scope. `console_set_practice_location()` is the
platform administrator's (`organization.manage`), runs in the one practice's scope and restores the caller's (a
reviewed scope function in `packages/db/src/catalog.ts`), and returns null for a practice that does not exist.
`console_set_practice_settings()` keeps its signature, so the previous image's save works: a ZIP that differs from the
location's sets it and clears its ZIP+4, the same ZIP or none leaves it, and `practice.zip` is never written.
`console_practice_settings()` reads the location's ZIP.

**No run without a location.** `pricing_run_rules()` (still invoker) refuses a run, a re-run included, of a practice
of the caller's scope that has no location (`pricing_run_location_missing`). A run of a practice outside the scope is
left to the tenant policy's refusal after the trigger, so a probe from another practice learns nothing about that
practice's location (a refinement of the design, found by the generated cross-tenant test). A location that is not
ready (`zip_plus_four_needed` and the like) still gets its run: the run fails `location_not_ready` only when a line
needs the location (ADR 0039's amendment, the worker's part).

**The split, every practice's default.** `screening_place_of_service_split` becomes `place_of_service_split` (its
constraint, index, triggers, policy, primary key and foreign key renamed; `screening_split_valid` becomes
`place_of_service_split_valid`, its ACL kept). The audit action `screening_split_approved` and object type
`screening_place_of_service_split` keep their names, so the approval history reads under one name. Each pricing run
pins the split in force (`pricing_run.place_of_service_split_id`, set by `pricing_run_rules()` through the definer
`place_of_service_split_in_force()`; another value is refused, `pricing_run_split_pinned`; fixed once inserted; null
on every earlier run and when none is approved), and the price job reads it through the definer
`pricing_run_split(run)`, which answers only in the run's own practice's scope. `console_place_of_service_splits()` and
`console_approve_place_of_service_split()` replace the screening's console functions.

**The screening's ZIP+4.** `screening_prospect.zip_plus_four` is kept only when the ZIP's `locality_map` record needs
it, and deleted with the prospect. `submit_screening()` takes it after the ZIP and refuses `screening_zip_unknown`,
`screening_zip_plus_four` (enter the ZIP+4), `screening_zip_plus_four_unknown` and `screening_locality_not_loaded`
from `locality_status()`; `screening_zip_status()` is dropped. `operator_screening_claim()` returns the ZIP+4, and the
keyed read holds the ZIP's `locality_map_plus_four` record (the sixth keyed type, left out of
`operator_screening_release()`). The labels move to `screening-labels/2026-11-05` (`screening_labels_version()`).

**The content a release has loaded (audit #7).** `rule_release_content_span(release)` (invoker, `tp_app`) gives, for
the per-code reduction, the general reduction and the MUE, the union of their records' windows, with a FILTER so a
content with no record is the empty span, never every date. `submit_screening()` refuses a Medicare row whose quarter
(`screening_band_days()`, no grant) is not inside every span, and stores the three counts of the rows the browser left
out for that reason (`outside_content_rows`, `outside_content_claim_lines`, `outside_content_allowed_cents`: 11 to
100,000 claim lines a row, at most $25,000.00 a claim line, none on a refused upload, and the floor's and these rows
with the accepted ones at most 50,000). `band_outside_content` joins the rejection codes (14 now), and
`screening_result_summary()` returns the three counts beside the floor's (a column set the design's table did not list;
the result page's sentence needs them).

**Deploy window.** Safe with the previous image running but for: practice creation in the console (it writes
`practice.zip` and no location), the split's console approval (renamed), the screening's submission (new signature;
closed in production until release 1), a run created by one image and priced by the other (`engine_version_mismatch`;
the month is planned again), the old image's strict trace schema refusing a trace with a ZIP+4, and the old image's
price jobs reading the backfilled `practice.zip` rather than a location saved through the new image.

**The Data dictionary stays verbatim** (reconciliation-001, D2 (a)): the domain model records `practice_site` and the
seventeenth record type, as it records every accepted divergence, in place of the edit to `data-dictionary.md` the
design proposed.
