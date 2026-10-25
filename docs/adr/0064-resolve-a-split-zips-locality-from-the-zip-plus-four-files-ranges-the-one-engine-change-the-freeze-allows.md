# 0064. Resolve a split ZIP's locality from the ZIP+4 file's ranges, the one engine change the freeze allows

- **Status:** accepted (PR 6b-1, the engine part); amends [0029](0029-price-a-claim-at-a-time-from-resolved-agreements-and-recompute-every-amount-from-its-trace.md) (the trace's three optional keys), [0033](0033-read-contract-pages-at-intake-in-a-bounded-thread-hold-general-terms-and-price-what-the-review-found-unsettled.md) (the locality rule) and [0034](0034-price-every-contract-method-hold-ncci-edits-for-review-and-keep-the-golden-lines-first.md) (`ENGINE_VERSION`). PR 6b-2 amends it with the practice's location record, the pricing settings taken at onboarding, the months that wait for them, the split every practice defaults to and the screening's ZIP+4 ("Amendment (PR 6b-2)", below; the founder's answers of 2026-10-21 to Q2, Q3, Q5, Q6 and Q11 (a)).
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
  *Amended 2026-10-25 (`co-001/ci-mutation`; docs/adr/0066, Part 4):* the label, the engine-change step, the patch,
  10.0.0 and `runner.test.ts` are gone; see the amendment at the end.
- The test matrix gains PRC-21 (with a fixture under 900006) and PRC-22.
- A release that loads 900006 needs PR 6b-2's CHECK; the closed-list test that holds `RULE_RECORD_TYPES` equal to the
  CHECK's 17 values comes with it.

## Revisit when

- CMS's ZIP9 record layout is read and differs from the one recorded here (open item O1), or release 1's ZIP9 content
  loads;
- the specialist answers Q37 (a ZIP+4 the ZIP9 file does not list);
- PR 6b-2 lands (the practice's location, settings at onboarding, the screening's ZIP+4), or the multi-site pull
  request gives each site its own location;
- *(settled 2026-10-22)* PR 5's trigger on `rule_release_withdrawal`, which PR 6b-1's rule-table check found: the
  founder, Tyler Williams, accepted it on 2026-10-22 as an exception to reconciliation-001's rule-table check (it only
  takes the advisory lock `pricing_current:withdrawal`, writing nothing and changing no rule data, and serializes a
  withdrawal with the approval, the export guard, the attestation and the submission's flag, so no packet goes out as
  current under a release being withdrawn; ADR 0061, Owner ruling (2026-10-22)). The catalog snapshot keeps it as it
  stands; any other DDL on a rule table still needs its own ruling;
- *(settled 2026-10-25)* a release of `@stryker-mutator/vitest-runner` supports Vitest 5, and the patch is dropped (the
  canary says whether it still works): 10.1.1 does, and the patch is dropped (the amendment of 2026-10-25 below).

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
  `tools/engine-freeze/exception.json` (rewritten for this pull request in PR 6b-1's format: `pull_request` 36, no
  engine file, no golden file) names it exactly as `check.ts` prints it, its one `rule_table_ddl` entry; the rule
  tables' catalog snapshot (`tools/engine-freeze/rule-tables.catalog.json`) is regenerated for the widened CHECK by
  `rule-tables.db.test.ts`'s update path, and `check.ts` lets the snapshot change only under that entry. A closed-list
  test holds `RULE_RECORD_TYPES` equal to the CHECK's 17 values.
- **Q5 (a):** the permission `pricing_settings.set` for the practice administrator, the billing manager (a firm's under
  a grant, as it signs off contracts) and so the firm principal; the reimbursement reviewer is denied it, as every
  write. A granted exception to "the permission matrix changes only in PR 14"; one of the pull request's two
  adversarial reviews uses the security-reviewer checklist.
- **Q6 (a):** a Medicare row whose quarter is outside the release's loaded content is left out by the browser and
  counted on the upload (three numbers, never which rows, deleted with the upload at 30 days); a request that bypasses
  the browser is refused by the server and by `submit_screening()` (`screening_band_outside_content`).
- **Q11 (a):** no wording change for the ZIP+4 in what the pages say is kept: the words already cover a ZIP+4 entered
  in the ZIP code field (counsel confirms).

**The location.** `practice_site (practice_id, zip, zip_plus_four, updated_by, confirmed_by, confirmed_at)`: the ZIP
five digits, the ZIP+4 four or null (`practice_site_zip`, `practice_site_zip_plus_four`), one per practice
(`practice_site_one_per_practice`); who last set the ZIP or ZIP+4 (null when backfilled), and the person of the
practice who last saved or confirmed it and when, both or neither (`practice_site_confirmed`; below). It holds no PHI
but has a NOT NULL `practice_id`, so it is registered and forced, with the tenant policy and the owner's for the
definer functions. The application role holds SELECT alone; a location is never deleted or truncated and changes only
its ZIP, ZIP+4, who set them and who confirmed them, and its `updated_at` and `updated_by` move only when the ZIP or
ZIP+4 changes (`practice_site_rules`). A practice is created with its location in the same transaction, whoever
inserts it: the deferred constraint trigger `practice_has_site` checks at commit. The migration
backfills each practice's `practice.zip`; `practice.zip` is deprecated (never read or written; the application role
may no longer insert or update it) and is dropped by the multi-site pull request.

**Its status in a release.** `locality_status(release, zip5, plus_four, period_from, period_to)` and
`practice_location_status(practice, release, period_from, period_to)` (both invoker, granted to `tp_app`) answer from
the closed list `ready | no_release | zip_missing | zip_unknown | locality_not_loaded | zip_plus_four_needed |
zip_plus_four_unknown`, with the carrier and locality when ready. One order differs from the design's literal "first
match wins": a flagged ZIP with no ZIP+4 is `zip_plus_four_needed` before the release's missing ZIP+4 list is
`locality_not_loaded`, so under 900001 the customer is first asked for the ZIP+4 and, once it is given, told the list
is not loaded (the design's own journey, steps 5 and 6): a practice needs its ZIP+4 anyway. The screening does not
follow it: a prospect is told the ZIP+4 list is not loaded before being asked for a ZIP+4 the screening could not use
(`submit_screening()`, below; the review round's finding 22). A ZIP+4 that is not four digits is held by no range.
`locality_not_loaded` is a gap in PaidWhole's content wherever a stop or a status is classified, as the engine's
`ENGINE_ERROR no_locality_plus_four` is (PR 6b-1's review split it from `zip_plus_four_not_in_locality_map`): the
price job never fails a run on it at any status (only `locality_needs_zip_plus_four` and
`zip_plus_four_not_in_locality_map`, and `no_locality` for a ZIP on no list, are the customer's step), so the run
completes and the line pages the operator; no month waits on the billing ZIP for it; Pricing settings says there is
nothing to change; a re-run under a release that loads the ZIP+4 list names that record as the release's, not the
settings; and the screening refuses such a ZIP+4 as `screening_locality_not_loaded` ("try again later") and labels a
row stopped on it "PaidWhole has not loaded Medicare’s ZIP+4 list for this ZIP on the quarter’s first day" (under
`screening-labels/2026-11-05`, unreleased until this pull request merges).

**Who sets it.** `practice_set_location()` (definer) refuses anyone but a person outside the platform's staff
(`user_is_internal()`) who holds `pricing_settings.set` in an active practice of the transaction's scope, and a
malformed ZIP or ZIP+4 by the constraint's name, upserts the row and returns its status under the release in force; it
keeps the caller's scope. The save is the person's confirmation of the location (`practice_site.confirmed_by` and
`confirmed_at`, both or neither, `practice_site_confirmed`). `practice_confirm_location(practice, shown_zip,
shown_zip_plus_four)` (definer, the same guard, granted to `tp_app` alone) confirms the location the person was shown:
it locks the row and refuses it when the row no longer holds exactly that ZIP and ZIP+4 (`practice_site_changed`: a
page loaded before a change, or a confirmation that waited on the console's change and reads the row once that
commits), and when it leaves something to change under the release in force (`ready` or `locality_not_loaded` pass;
otherwise `practice_site_settled`), and records the person and the time on the row; Getting started's "Confirm your billing ZIP" reads `confirmed_at >= updated_at` there, under the
row's tenant policy, so every role that opens the practice reads the same answer. `practice_site_rules()` moves
`updated_at` and `updated_by` only when the ZIP or ZIP+4 changes, whoever writes the row, so a save of the same
location neither lists runs as priced before a change nor undoes a confirmation. `console_set_practice_location()` is
the platform administrator's (`organization.manage`), runs in the one practice's scope and restores the caller's (a
reviewed scope function in `packages/db/src/catalog.ts`), clears the confirmation when the ZIP or ZIP+4 changes, and
returns null for a practice that does not exist or is deleted. `console_set_practice_settings()` keeps its signature,
so the previous image's save works: a ZIP that differs from the location's sets it and clears its ZIP+4 and the
confirmation, for a person and an active practice alone; the same ZIP or none leaves it, and `practice.zip` is never
written (that branch is dropped once the previous image is gone, a follow-up). `console_practice_settings()` (dropped
and recreated for its new column, its grant restated) reads the location's ZIP and ZIP+4, so the console shows the
stored location and its status now and starts its form from it.

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
`pricing_run_split(run)`, which answers only in the run's own practice's scope, with the split's settings and when it
was approved (the re-run's diff names both approvals). `console_place_of_service_splits()` and
`console_approve_place_of_service_split()` replace the screening's console functions.

**The screening's ZIP+4.** `screening_prospect.zip_plus_four` is kept only when the ZIP's `locality_map` record needs
it, and deleted with the prospect. `submit_screening()` takes it after the ZIP and refuses `screening_zip_unknown`,
`screening_zip_plus_four` (enter the ZIP+4), `screening_zip_plus_four_unknown` and `screening_locality_not_loaded`
from `locality_status()`, the last first, before any ZIP+4 is asked for, when the release in force holds no
`locality_map_plus_four` record of the ZIP; `screening_zip_status()` is dropped. `screening_result_summary()` returns
the prospect's ZIP+4 (kept as before), and the result's heading names it. `operator_screening_claim()` returns the ZIP+4, and the
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
price jobs reading the backfilled `practice.zip` rather than a location saved through the new image. And a seventh,
found by the review round: a run the previous image's web or monitor inserts in the window is pinned by
`pricing_run_rules()` to the split in force, but the previous image's price job prices it from `practice.settings`
alone (it reads no split), so the run completes, immutable, naming a split its traces did not use, and a place the
practice has not set stops as `ENGINE_ERROR place_of_service_unmapped`. It happens only where a split is approved
before the new worker runs: approve no split until the new worker is running, or re-run each run pinned in the window.
The migration's header lists it as its seventh effect.

**The Data dictionary stays verbatim** (reconciliation-001, D2 (a)): the domain model records `practice_site` and the
seventeenth record type, as it records every accepted divergence, in place of the edit to `data-dictionary.md` the
design proposed.

## Review round (PR 6b-2, 2026-10-22)

Three adversarial reviews (security and tenancy, the security-reviewer method the founder's Q5 (a) asked for; pricing
runs, waits, the split and the diff, the payment-engine method; the screening, its wording and accessibility) found 23
items. What changed without the migration:

- **A waiting month whose location became ready is always planned.** `waitingOnLocation()` (`apps/worker/src/monitor/
  plan.ts`) keeps a month waiting only while the location's status over it is still one a line cannot price at
  (`zip_missing` or `LOCATION_NOT_READY_STATUSES`). Its times alone could not prove a run read the saved location: a run
  created while a save was still open had a `created_at` later than the save's `updated_at` (both their transaction's
  start) yet priced with the old location, and the month then waited until a new line or release.
- **The save's monitor job is sent after the save commits.** A route's handler hands it to `afterCommit`
  (`apps/web/src/lib/http/route.ts`, run by `invoke.ts` once the transaction has committed, for practice and console
  routes alike), so an idle worker never plans with the old location and spends the save's request key. A failure to
  send is logged by code; the daily plan takes the month up. The other routes that queue jobs inside their transaction
  are unchanged (a follow-up).
- **The stops are judged from the location the run prices with.** `executePricingRun()` reads the location's status in
  the pricing transaction, with `locality_status()` over the very ZIP and ZIP+4 `runSettings()` read there, not from the
  run's first transaction; a location saved between the two is the one priced and the one judged.
- **A re-run's causes name the new release's change to the new location's records.** When the ZIP and the release both
  change, `lineCauses()` asks the other run's release for each location record a line read in one run only
  (`OtherRelease`, looked up by `compareRuns()`); a record that release lacks, or holds with another value or window,
  is a release cause beside the settings. The gap section 3.6 of the design gave up is closed.
- **The screens.** Pricing settings words the save's notice by the location it leaves, offers "Confirm the billing ZIP"
  only when nothing is left for the customer to change (the handler refuses it otherwise, with the status's sentence),
  and Getting started then asks for the status's own step ("Add your billing ZIP+4"); a month whose run stopped on the
  old location and whose location now prices reads "Being priced with the new location."; the months priced before the
  location changed are the runs whose traces read another ZIP or ZIP+4, not the runs older than the last save; the
  waiting months' table scrolls in a region the keyboard reaches; a refused field is marked invalid, described by its
  error and focused; the re-run diff says when the earlier run had no split at all; the copy lint reads
  `packages/contracts/src/location.ts`.
- **Wording (for the founder and then counsel, Q12):** `zip_plus_four_unknown` no longer asks anyone to "check the four
  digits" while Q37 is open; `locality_not_loaded` names the ZIP+4 list over the whole release and the month over a
  month; "more than one" payment area, never "two"; months "are priced by themselves once it is set", never "priced
  again"; "tell us" links the support form; the screening says which quarters' Medicare rows it screens before a file
  is chosen.

**The migration's part (the same day).** The fixes that change `20261105090000_pricing_location_and_zip_plus_four.sql`
waited for the new-migration marker, which this round's first session could not set. They landed on the founder's
permission, relayed to the build on 2026-10-22, to use the marker route for this one unmerged migration: the marker was
set for the edits alone and removed before any test ran, no other migration changed, and every fix landed with a test
that failed on the migration before it:

- **Postgres refuses the confirmation itself, and every role that opens the practice reads it** (findings 1, 8 and 9).
  `practice_confirm_location()` and `practice_site.confirmed_by` and `confirmed_at`, above. A viewer, an analyst, a
  support engineer, a reviewer, another practice's administrator, a platform administrator and a job are refused as
  the application role; the billing manager and the firm principal confirm and then see their own confirmation; a
  location that still asks the customer for something is refused (`practice_site_settled`). The audit events stay.
- **A deleted practice's location is never set** (finding 2), by `practice_set_location()`,
  `practice_confirm_location()` or the previous image's `console_set_practice_settings()`, whose ZIP branch also
  requires a person.
- **A save of the same ZIP and ZIP+4 changes nothing but the confirmation** (finding 11), whoever writes the row.
- **The console shows the stored ZIP+4 and the status now** (finding 14): the form starts from the stored location;
  the links back carry `?location=saved` and `?created=<practice>` alone, and the pages read the status from the
  database, so a reload or an edited link never shows a status the location does not have.
- **The re-run diff names when each split was approved** (finding 16), read through `pricing_run_split()`.
- **The screening result names the ZIP+4** (finding 21), "00012-5001" in its heading.
- **The screening says the ZIP+4 list is not loaded before asking for a ZIP+4** (finding 22), as above.
- **The header lists the seventh deploy-window effect** (finding 7).

**The verification's two findings (the same day).** The fresh-clone verification of 98a5e49 passed and found two nits,
both fixed in the pull request:

- **A confirmation can be recorded against a location the person was never shown** (finding 1). Reproduced on
  PostgreSQL 18 with two connections: `practice_confirm_location()` read the old location's status, waited on the
  console's change's row lock, then stamped the confirmation on the new row; and without any race, the confirm form
  posted only the box, so a page loaded before the console's change confirmed the new location unseen and Getting
  started's step read done. The form now carries the ZIP and ZIP+4 its page shows (hidden fields, checked by the
  route's schema); the handler refuses another location before it confirms, and `practice_confirm_location(practice,
  shown_zip, shown_zip_plus_four)` locks the row (`SELECT ... FOR UPDATE`), compares it with those values and refuses
  any difference (`practice_site_changed`), keeping every other guard, the definer's `search_path`, no PUBLIC EXECUTE
  and the one grant to `tp_app`; the one-argument function is gone (the migration is unmerged, so there is one
  signature). Either refusal confirms and audits nothing, and the page is read again with "The billing ZIP changed
  since this page loaded. Review it, then confirm." (for the founder and then counsel, Q12). A confirmation that holds
  the row first is of what its page showed, and the console's change that waits on it then clears it. The tests failed
  on 98a5e49: the race on two connections and the stale values as the application role, the stale form and the change
  committed while the confirmation waited through the route (on 98a5e49 both confirmed the new location), and the
  existing refusals sent with the location as it stands. The onboarding journey now also confirms from a page whose
  location changed after it loaded. The migration changed once more on the founder's permission of 2026-10-22 for this one
  unmerged migration: the marker was set for the edits alone and removed before any test ran.
- **The location paragraph above described `practice_site` before the review round** (finding 2): it now lists
  `confirmed_by` and `confirmed_at` and says what `practice_site_rules()` lets change.

## Amendment (`co-001/ci-mutation`, 2026-10-25): mutation by path, on Stryker 10.1.1, without the label or the patch

Combined audit #54, adopted by the founder with the whole audit on 2026-10-20, replaces what the Consequences above
describe for mutation testing (docs/adr/0066, Part 4, gives the decision in full):

- **No label.** `.github/workflows/mutation.yml` no longer runs on the `labeled` and `unlabeled` events, and no longer
  fails an engine change that lacks the `money` label. It runs on every pull request (default types), on every push to
  `claude/build-platform`, weekly and on request. A pull request runs every shard of each money package whose closure it
  changes (`tools/stryker/affected.ts`: the package's code and tests and what they import, upstream workspace packages
  included, its data files, and the third-party packages the lockfile resolves for it). An engine change always reaches
  pricing's closure, so it is always measured, and a forgotten label can no longer leave one unmeasured.
- **Stryker 10.1.1, no patch.** `@stryker-mutator/vitest-runner` 10.1.1 names a test as Vitest 5 does, and reports a
  mutant that breaks a test file's load as a RuntimeError, not a survivor (10.0.0, patched, still counted those as
  Survived: 20 of `trace.ts`'s mutants). `patches/@stryker-mutator__vitest-runner@10.0.0.patch`, its
  `patchedDependencies` entry and `tools/stryker/runner.test.ts` are deleted.
- **The canary has five cases** (`tools/stryker/canary/expected.json`), each held to an expected status per mutant, and
  runs first in every shard job. Its first case is the old canary: runtime mutants selected by their tests' names, which
  is what `runner.test.ts` held. The other four cases cover load failures, the workspace aliases, the seed and prefix
  selection. On 10.0.0 with this ADR's patch, cases 2 and 5 fail; without the patch, all five do.
- **The gate** is the required `mutation` job (`tools/stryker/gate.ts`). It requires each fully-run money package above
  85% and no survivor that is not recorded as equivalent. This ADR's engine change is measured like every other.
