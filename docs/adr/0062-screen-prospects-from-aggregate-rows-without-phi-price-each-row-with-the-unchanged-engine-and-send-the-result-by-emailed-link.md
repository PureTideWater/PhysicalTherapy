# 0062. Screen prospects from aggregate rows without PHI, price each row with the unchanged engine, and send the result by emailed link

- **Status:** accepted; amended by [0064](0064-resolve-a-split-zips-locality-from-the-zip-plus-four-files-ranges-the-one-engine-change-the-freeze-allows.md) (ZIP+4 localities and quarters outside the loaded content, PR 6b); amended 2026-10-26 by [0066](0066-run-ci-as-parallel-jobs-behind-one-gate-measure-mutation-on-every-money-package-move-the-browser-and-runner-together-and-pin-every-dependency.md), Part 2 (the release restores no cache, in "Amendment (ADR 0066, Part 2)" below); and by [0065](0065-send-mail-in-three-ses-streams-record-each-messages-delivery-send-notices-from-an-outbox-and-pause-the-screening-stream-alone.md) (the screening's mail stream: its sender, cut-off, readiness, address checks, refusal list and bounce budget, PR 6b-4; in "Amendment (PR 6b-4)" below)
- **Date:** 2026-10-18
- **Deciders:** the owner (D11 option a and D18 to D21 option a, in `docs/product/reconciliation-001.md`, approved 2026-10-17; the four rulings of 2026-10-18 below, by the founder, Tyler Williams, and the founder's approval of 2026-10-18 after the best-option audit, items 6 and 1, with the ruling of 11:47 UTC that supersedes ruling 3); the build (PR 6 of Change Order 001) and its review of 2026-10-20
- **PRD sections:** 2 (what a screening must never claim), 5 (J1, the audit request), 7 (public pages), 8 (Invariants), 11 (the engine, Medicare Advantage non-contracted pricing), 15 (Request path; links only in email), 16 (Tenant isolation; logging discipline); Change Order 001, CO-04, CO-09 (SCR-01 to SCR-06, SEC-17; SCR-07 added by the founder's ruling), CO-11 and CO-12; ADRs 0014, 0019, 0029, 0034, 0038 and 0053

## Context

CO-04 asks for "a no-PHI screening flow for prospects": an aggregate upload, "one row per code, modifier set, units,
place of service, payer product and service-date band, carrying allowed-amount total and claim count", priced
under "the Medicare fee schedule (locality from the practice's ZIP) and the Medicare Advantage non-contracted rule,
with the standard therapy adjustments", answering with "anomalies by code and payer product, missing-contract
coverage, and the dollars that cannot be priced without a contract. Never a dollar labelled owed or underpaid."
Its design names four tables with "no `practice_id`", outside the RLS catalog, results that "expire after 30 days",
and limits "by email domain and IP". Its acceptance: "an upload with a date-of-service or member-ID column is
rejected with the column named; a clean upload returns a result in under 60 seconds for 50,000 rows; no screening
output contains the words owed, underpaid or recovered; conversion from screening to audit is logged as an event."

What the repository held, and what constrains the design:

- The catalog test (`packages/db/src/catalog.ts`) refuses a table the application role writes without row-level
  security, and every PHI table must carry `practice_id`. A prospect has no practice, so no practice data key.
- The engine (`price()` in `packages/pricing`) reaches the fee schedule only through the agreement outcome
  `MA_NONCONTRACTED`, whose terms (`MA_NONCONTRACTED_TERMS` in `@tp/contracts`) are Original Medicare's: 100% of
  the current year's fee schedule at the practice's locality, the non-qualifying conversion factor, every flag on
  and no rounding of its own. It prices a claim's lines together (the multiple procedure reduction ranks a day's
  units across codes), takes a five-digit ZIP and, where that ZIP's `locality_map` record needs it, the ZIP+4
  (`PracticeSettings.zipPlusFour`), whose `locality_map_plus_four` range names the locality (ADR 0064), and stops with
  `place_of_service_unmapped` for a place of service missing from the split it is given. Nothing under
  `packages/pricing/src` changes but PR 6b's ZIP+4 lookup, by the founder's ruling of 2026-10-18 11:47 UTC (ADR 0064).
- `prospect_request` (ADR 0053) is the pattern: a public table with row-level security forced, written only
  through a SECURITY DEFINER function.
- Platform jobs run as `tp_operator` (ADRs 0014 and 0019), which owns nothing and has no table grants; it cannot
  read `rule_record`. pg-boss refuses a send to a queue that does not exist.
- The URL guard admits a path segment that is a UUID or a lowercase word, so a base64url token is refused.
- A route handler's JSON body is bounded at 1 MB; a server action's at 11 MB.

## Decision

**Tables outside the PHI catalog, written only through definer functions (D18 a).** Migration
`20261104090000_free_screening.sql` adds five tables in schema `public`, each with row-level security forced, one
policy (`<table>_owner`, for `tp_owner` alone), `REVOKE ALL FROM PUBLIC` and no other grant, no `practice_id` and no
`phi_table_registry` row; `catalog.ts` and the cross-tenant test do not change:

- `screening_prospect`: the practice's name, state, five-digit ZIP and the contact address, lower case and one the
  mail service can send to (plain ASCII, an RFC 5322 dot-atom before the @, a dotted domain with no trailing dot
  after it). The ZIP+4 is asked for only when the ZIP's `locality_map` record needs it, and is kept only then
  (`zip_plus_four`, deleted with the prospect at 30 days). A ZIP that needs one and lacks it is refused as
  `screening_zip_plus_four` ('enter the ZIP+4'), one the ZIP+4 file does not list as `screening_zip_plus_four_unknown`,
  and one whose ZIP+4 list is not loaded as `screening_locality_not_loaded`, with or without a ZIP+4, so a prospect is
  never asked for a ZIP+4 the screening cannot use (PR 6b, ADR 0064; its review round's finding 22). The result's
  heading names the ZIP+4 kept (finding 21).
- `screening_upload`: its row count, accepted or rejected, and the rejection reasons, which
  `screening_rejections_valid()` holds to at most 20 objects of a code, a column position, a row, a first row, a
  field and a PHI kind: never a header's text or a cell's value. No byte of the file is stored, and no hash of it.
  An accepted upload keeps `rows_sha256`, the SHA-256 of its rows as the server accepted them, in their canonical
  form (`encodeScreeningRows`), which `submit_screening()` computes from the rows it stores and never takes from the
  caller; a refused upload keeps none (`screening_upload_rows_hashed`). On an accepted upload, three numbers of the
  rows of fewer than 11 claim lines the browser left out (`left_out_rows`, `left_out_claim_lines`,
  `left_out_allowed_cents`): never which rows. Their CHECKs hold them to what a browser could have counted (each row
  left out 1 to 10 claim lines, at most $25,000.00 a claim line, no more than 50,000 rows sent and left out together)
  and to zero on a rejected upload.
- `screening_place_of_service_split`: the platform's default facility or non-facility setting per place of
  service, approved by a contract specialist (`rate_record.approve`, the existing permission; the matrix is
  frozen until PR 14), append-only, the latest approval in force. A fifth table beside CO-12's four, because the
  engine needs a split and no rule record carries one (fixtures/golden/QUESTIONS.md, Q08). `place_of_service_split`
  since PR 6b (ADR 0064): also the default for every place a practice has not set, pinned on each pricing run.
- `screening_run`: an accepted upload pinned at creation to the release in force (`current_rule_release()`, with
  no foreign key so no DDL touches `rule_release`) and its manifest hash, and to the split in force; queued,
  pricing (re-claimed when stale, at most three attempts), complete or failed (`screening_run_rules`). Only the
  SHA-256 of the result link's token is stored; the conversion is set once.
- `screening_result`: one row per uploaded row, its facts as decoded and, once priced, the engine's amount for the
  line priced alone before sequestration (read from its trace, rounded once under the trace's rule, its unrounded
  value beside it: the figure before the reduction across codes), that amount times the claim count, the difference
  from the allowed total in the file, and whether the engine's trace ranked the code in the reduction across a
  visit's codes (`in_reduction_pool`, the mppr adjustment's `in_pool`); for such a code, the same four figures for
  the row priced again as a later code of a visit (`reduced_line_cents`, `reduced_line_unrounded`, `reduced_cents`,
  `reduced_difference_cents`: the fully reduced figure) and that pricing's trace SHA-256; with the engine's unpriced
  reason and detail and the trace's SHA-256. Its CHECKs make MA contracted and commercial rows exactly
  `contract_required` and medicaid and other rows exactly `not_screened`, hold a priced row to `expected_cents =
  expected_line_cents * claim_count` and `difference_cents = expected_cents - observed_allowed_cents`, give the
  fully reduced figure to a priced pooled row and to no other (`screening_result_reduced`), hold it to the same two
  equations and to at most the figure before the reduction (`screening_result_reduced_figures`), take only a real code's shape
  (CPT Category I, II, III, PLA or MAAA, or HCPCS Level II: never five letters, which may be a name), at least 11 and
  at most 100,000 claim lines (`screening_result_claim_count`; see the floor below), and at most $25,000.00 of
  allowed amount a claim line (so an identifier typed under the allowed total is refused, never kept as dollars).

A screening's prospect, upload, run and rows expire 30 days after its upload: the reads refuse a run from its
`expires_at` on, a delete before then is refused (`screening_kept_until_expiry`) unless a later screening of the same
practice has replaced it (below), and the `screening_expiry` job deletes prospect, upload, run and rows together, each
prospect an audit event (`screening_expired`). *Amended by the founder's rulings of 2026-10-20 (see The CO-04
amendment, below):* this sentence first said every row but the split expires; what outlives the 30 days is a
counts-only outcome of every screening, kept with no end date, and a converted or consenting practice's frozen
summary, kept 12 months from the upload.

The application role calls `screening_status()`, `screening_zip_status()` (an invoker function over the global
`locality_map`; since PR 6b `locality_status()`, over `locality_map` and `locality_map_plus_four`, ADR 0064), `submit_screening()` (prospect, upload with the hash of its rows, run and every row in one call,
`screening_submitted`, deleting any earlier screening of the same practice, `screening_replaced`),
`reject_screening_upload()` (`screening_rejected`; like the submission, it records nothing while screening is
closed), the reads by token hash (`screening_result_summary`, which also says whether the run's release has since
been withdrawn; `_group_totals` and `_groups`, the groups one page at a time with the counts over every group and the
sums of those off the page; `_coverage`; `_rows`; every figure a bigint sum in SQL), `convert_screening()` (a
`prospect_request` in the screening's name and address, and `screening_converted`, which outlives the expiry) and
the console's two split functions. Where an allowed total stands is `screening_standing()`'s, in SQL, from the
stored figures (the owner's ruling 1 of 2026-10-18): `anomaly` when it is more than $5 a claim line (ADR 0038's
default threshold, exceeded) below the row's lowest figure, the fully reduced one for a code in the reduction across
codes and the one figure otherwise; `within_reduction_range` from the fully reduced figure up to below the figure
before the reduction; `below_by_threshold_or_less`; or `at_or_above` the figure before the reduction. The rows read
gives each row's standing; a group (a code under a payer product) is an anomaly when one of its rows is, with how many
(`anomaly_rows`), and otherwise stands as its sums do; both read the largest difference from the lowest figure first.
PRD 11's worked example, golden claim G01, allowed exactly as one visit, is within each pooled row's range and is
never an anomaly. The operator
role calls `operator_screening_*()`: due, claim (which also says whether the pinned release is still there as
pinned: published, its manifest unchanged and not withdrawn), release (the pinned release's records with their
stored hashes, `locality_map` limited to the run's ZIP, and since PR 6b `locality_map_plus_four` beside it, keyed by
the run's ZIP, only while the manifest is the one pinned and the release is not withdrawn), rows, record, complete (`screening_completed`), fail (`screening_failed`) and expire.

**The browser parses; the server checks again (D18 a).** `apps/worker/src/screening/format.ts`
(`@tp/worker/screening-format`, browser-safe, `@tp/money` alone) holds the eight columns and their spellings, the
PHI kinds checked in order (claim numbers, member IDs, dates of birth, dates of service with any date-shaped header,
names), by a header's whole spelling and then by its words (an ID word after what it identifies, record and account
numbers, a claim's or a visit's number, a person's name; the payer's, provider's and practice's names and "patient
responsibility" are left out), and a header whose normalizing would throw letters away is never one of the eight;
the row rules (calendar quarters only; a day in a band, in any spelling a spreadsheet writes, is a date-of-service
column; dollars through `parseAmount`, at most $25,000.00 a claim line; a real code's shape) and the canonical rows
the form sends. Reasons are kept 20 at most, patient information first, so its column is named however many other
problems a file has, with how many there were. The page reads the file locally and sends the header's canonical
column names (never the text typed), the row count and the canonical rows to a server action, and never a hash of
the file, which would cover the rows it leaves out; the file input has no name. The server checks the form's fields,
the header names and every row again; a refusal is recorded by count and coded reasons alone, and its messages name
a column by position and kind ("Column 4 holds member IDs; remove it and upload again"), never a header or a cell,
and tell a person to remove a column that is not one of the eight, never to rename it.

**At least 11 claim lines a row (the founder's ruling of 2026-10-18 on the best-option audit's item 6).** A row of
fewer, with its quarter beside the practice's name and ZIP, can be one patient's service line, which is not
de-identified under HIPAA Safe Harbor, and a prospect has no business associate agreement. The floor is 11, the CMS
small-cell standard (CMS suppresses a count of 1 to 10), and it is one setting, `SCREENING_MIN_CLAIM_LINES` in
`format.ts`, enforced three times:

- The browser (`screenTable`) checks every row as before, then leaves out each clean row of fewer than 11 claim
  lines: it is never sent. A row left out is checked like any other first, so a day in its band still refuses the
  file and a row repeating another's key is still a repeated row. The page says how many rows, claim lines and
  dollars it left out (for example, "Left out: 2 rows of fewer than 11 claim lines each, 11 claim lines and $436.84
  allowed in your file. They are not sent, and no figure includes them"), and a file whose every row is left out is
  refused with those numbers, since nothing is left to screen. The form sends the three numbers beside the rows it
  keeps. The page dates a file's quarters by the server's clock (the page's `serverTime`, moved on by the browser's
  own clock since), never the computer's own: the rows sent are numbered among themselves, so once small rows are
  left out a row's number there is not its number in the file, and with both checks on one clock the server never
  refuses a row the page sent (a computer whose clock is wrong also refuses no quarter the server takes).
- The server (`decodeScreeningRows`) refuses a row of fewer than 11 claim lines that a request sent around the
  browser, by its row number ("Row 2 sums fewer than 11 claim lines; a screening takes a row of at least 11 claim
  lines, because a row of fewer can describe one patient's care: leave it out"), named with the patient information
  ahead of any other problem. The refusal is recorded as any other is, by the row count and the coded reasons, here
  `too_few_claim_lines` with the row and the field `claim_count` alone, and no hash: the rows refused hold the small
  row, so a hash of them, keyed or not, would be derived from it. Nothing of the row's code, claim count, quarter or
  dollars is stored or logged. It takes the browser's three numbers only when they are ones the browser could have
  counted beside the rows sent (`leftOutPlausible`), and records nothing otherwise; blank is none.
- The database refuses a stored row of fewer (`screening_result_claim_count`, `BETWEEN 11 AND 100000`), whoever
  writes it, and `format.test.ts` holds that CHECK and the upload's left-out CHECKs to the setting.

The result shows the rows left out as the browser counted them ("Left out before sending": rows, claim lines and
allowed in your file), apart from every other figure, when there are any. The three numbers are sums over the rows
left out, with no code, modifier, units, place of service, payer product or quarter beside them, so no service line
can be read from them. They are not nothing, though: when one row of one claim line is left out, they are that line's
count and allowed amount, stored beside the practice's name and ZIP and shown on the result, without its key. That is
why no hash of the file is kept (the review of 2026-10-20 found that the file's hash, with no key, beside the rows
kept and these sums, let a left-out row be found by trial in seconds), and why the page, the refusals and the result
state the risk the floor answers ("because a row of fewer can describe one patient's care"), never that no row can
describe one patient: a row of 11 or more lines can. The template file and the upload page state the floor in plain
words ("Each row sums at least 11 claim lines. A row of fewer could describe the care of one patient, so your browser
leaves it out before anything is sent, and the page tells you how many rows, claim lines and dollars it left out"),
and the column guide says it beside the claim count. The template states it where a prospect fills it, in a
spreadsheet away from the page: its rules come first, each a note line above the header (a first cell beginning with
#), in plain ASCII so a spreadsheet that reads a CSV without a byte-order mark shows them as written. The page's
reader skips a note row above the header, as written or as a spreadsheet saves it (padded with empty cells, as CSV or
tab-separated text), and a note's own commas never choose the delimiter; a header that begins with a `#` column has
other cells and is checked as a header, so a patient-information column beside it is still refused, and a note below
the header is a row, refused by its number. Counsel confirms the number, and whether it counts claim lines or
patients: a plan of care can give one patient 11 lines in a quarter, and a row of totals cannot say how many patients
its lines are. If counsel says patients, a patient-count column is added to the format and the row (a new migration)
and the floor moves to it. Counsel also confirms what the floor's own rows do not settle: whether the result may show
a left-out total of fewer than 11 claim lines as counted, or should say "fewer than 11 claim lines" instead (the
founder's ruling has the result say what was left out, so it shows the count until counsel answers); and whether one
screening a practice at a time (below) is the right scope for the rule against deriving a small cell by subtraction.

**One accepted screening a practice, so no small cell is derived by subtraction (the review of 2026-10-20, under the
founder's ruling on the audit's item 6).** The CMS cell-size suppression policy the ruling cites forbids a cell of
1 to 10 shown directly and one derived from others by subtraction or any other formula. Each row of a screening sums
at least 11 claim lines, but two screenings of one practice held at once could be subtracted: a row of 12 claim
lines in one and the same row at 11 in the next (a prospect uploading again after taking denied lines out, as the
template now asks, or after a late claim) give one claim line with its code, modifiers, units, place of service,
product, quarter and dollars, and a row left out of the first (its count and dollars in that upload's sums) that
reaches 11 in the next gives the same. So a practice keeps one accepted screening at a time: `submit_screening()`
deletes any earlier accepted screening of the same practice, prospect, upload, run and rows, each an audit event
(`screening_replaced`), in the call that stores the new one. The same practice is the same ZIP and practice name
(compared in lower case with each run of white space as one space, `screening_practice_key()`), or the same contact
address. Two submissions of one practice at once take the same advisory locks in one order, so the later waits for
the earlier, sees it and replaces it. `screening_kept_until_expiry` lets an unexpired screening go only when another
accepted screening of the same practice exists (`screening_replaced()`), and a row deleted with its prospect or
upload goes with it. A refused upload holds no row: it replaces nothing and is not replaced. The upload page, the
result, the email and the page a closed link opens say that a later screening for the same practice, or from the
same address, replaces the earlier one, whose link then stops opening it. A practice that screens again under
another name and from another address is not matched; that, with the rule's scope, is in counsel's question above.

**Denied lines out of every total (the founder's ruling of 2026-10-18 on the best-option audit's item 1, the
template's part).** A denied line pays nothing for a reason that is not a rate (no authorization, a visit limit
reached, a duplicate, timely filing, a service not covered), and a row of totals cannot say which of its lines were
denied, so a denied line inside a row would read as a shortfall against Medicare. The template's note lines and the
upload page tell the prospect to leave denied lines out of every total and claim count, because a denial is not a
rate variance; the column guide says so beside the allowed total and the claim count. Reading the payer's denial
codes in the paid audit's triage is PR 6d, not this pull request.

**Each row priced by the unchanged engine, alone and as a later code of a visit, its figure before sequestration
read from the engine's trace, multiplied outside it (D19 a, D20 a; the owner's rulings 1 and 2 of 2026-10-18).**
`apps/worker/src/screening/adapter.ts` makes each `medicare_ffs` or `ma_noncontracted` row a one-line claim under
`MA_NONCONTRACTED` with `MA_NONCONTRACTED_TERMS` and a fixed in-code mapping, dated its band's first day, charge
and observed zero (the row's allowed total is compared outside the engine), at the prospect's ZIP with the run's
split, and calls `price()`. The figure compared is the engine's own amount before sequestration: the trace's
sequestration step's `before_cents` (no step follows it under these terms), rounded once under the rule the trace's
rounding step names, its unrounded value kept beside it; a priced trace without that step, or with an adjustment
after it, stops the run rather than yield a figure, and sequestration is never worked out here. When the trace ranks
the code in the reduction across codes (the mppr adjustment's `in_pool`), the engine prices the row a second time,
unchanged, as a later code of a visit: a two-line claim whose first line is the row's own line with one unit and
whose second line is the row (`screeningVisitClaim`). Both lines' units have the same practice-expense part, so the
engine ranks the first line's unit first (a tie goes to the lower line number) and reduces every unit of the second;
the adapter checks that in the second line's trace (its ranking starts on line 1 and every one of its units is
reduced) and refuses anything else. That line's amount before sequestration is the fully reduced figure; the row
priced alone is the figure before the reduction across codes. For G01's 97110 GP x2 at SYNTHETIC locality 00011 the
two are 3,684 and 3,145 cents a line, and for 97140 GP 2,458 and 1,820: exactly what the engine gives those codes
inside G01's visit, ranked after 97530. Each figure is multiplied by the claim count in bigint. A code outside the
reduction keeps one figure. Unpriced reasons pass through as the engine gives them. A row shows no figure
(`rates_change_in_band`) when a trace names a record that does not cover its whole quarter, or when the engine prices
either of its lines differently (another outcome, amount or set of records) on any day inside the quarter where a
record of the pinned release starts or the day after one ends: those are engine calls too, so a record absent on the
quarter's first day and in force later (a medically unlikely edit, say) is not missed. Lines are memoized by code,
modifiers, units, place of service and band. The figure priced alone is labelled "Expected under Medicare, before
the reduction across codes" wherever it appears, and so is every figure worked out from it ("One claim line,
expected under Medicare, before the reduction across codes"; "Difference, before the reduction across codes"); the
second is "Expected under Medicare, fully reduced across codes", with its line ("One claim line, expected under
Medicare, fully reduced across codes") and its difference ("Difference, fully reduced across codes"). The page says
that every figure is before Medicare's sequestration, because payers normally report allowed amounts before it (for
the specialist to confirm, Q21). MA contracted and commercial rows are
never priced: their allowed totals are "the dollars that cannot be priced without a contract".

**A platform job prices and emails (D21 a).** The web app sends `screening_price` with the run's ID (singleton key
`screening_price:<id>`); every minute the same job sweeps runs queued over 30 seconds and runs whose pricing is ten
minutes stale. A run is claimed, its release read by key (The release read, below), its pending
rows priced and recorded 5,000 a statement, then completed and its link emailed in one operator transaction: a
failed send rolls the completion back and a later claim sends it. After a third attempt, or when the pinned
release is not there as pinned or has been withdrawn (checked at every claim, so a release this process has cached
is never used after its withdrawal), the run fails, the failure is committed, and then the contact is sent a link
to start again; a notice the mail service refuses is logged by the run's ID and the run stays failed. The sweep takes
each due run on its own: one that throws (its contact's address refused by the mail service, say) is logged
(`SCREENING_RUN_FAILED`, by its ID) and the sweep goes on, so no one run holds up the others. Every worker creates
the platform queues, so the web app's send never meets a missing queue; a send that fails anyway leaves the run to
the sweep. 50,000 rows run from the server action to the emailed link in about 8 seconds here with each pooled
code priced twice (8.3 s on 2026-10-18; about 4 seconds before the rulings), against CO-04's 60, in one unlimited
process on a 4-CPU machine; under production's limits, see Capacity under production limits. *Since PR 6b-3 the
platform prices no screening: the screening's own consumer (`WORKER_JOBS=screening`, three runs at once in worker
threads, as `tp_screening`) works `screening_price` and a minute's `screening_sweep` that sends due runs again rather
than pricing them; a run is stale after 2 minutes without progress, not 10 minutes in pricing (Amendment (PR 6b-3)).*

**The release read (audit #53 part 2; the founder's ruling of 2026-10-20).** The job no longer copies the whole
release for each ZIP. The record types no row's key selects (the GPCIs, conversion factors, the assistant and
sequestration records, the code lists and the other small types) are read by `operator_screening_release()` and held
once per release and manifest, two releases at most (`RELEASES_KEPT`; a withdrawal still evicts its entry). The five
types a line looks up by its own key (`pfs_rvu`, `ncci_mue`, `mppr_rate`, `ncci_ptp`, `locality_map`, and since PR 6b
a sixth, `locality_map_plus_four` beside `locality_map`, keyed by the run's ZIP) are read for each run, in one operator transaction: `operator_screening_run_keys()` returns the distinct codes of the run's
Medicare rows still to price and the prospect's ZIP, from the run's own rows and never a caller's, and
`operator_screening_run_records()` returns, for each code, its relative values and MPPR rate with no modifier, its
medically unlikely edit and its same-code pair (a screening claim is one line, or two lines of one code), with the
general practice-expense MPPR rate and the ZIP's locality, by equality on `rule_record_identity`. The engine reads both
through a keyed view (`apps/worker/src/price/keyed-release.ts`, generic so audit #31's Release-operations pull request
can reuse it): shared types from the shared index, keyed types only by the keys fetched, a fetched key that has no
record answering null. A lookup outside the keys fetched sets a sticky violation (its record type and its key's field
names, never a value) and throws; because the engine turns any throw into a row priced ENGINE_ERROR, the pricer checks
the violation after every engine call, and a row whose code is not in the key set, or codes priced unequal to it after
the last batch, stop the run the same way: the job fails it as `RELEASE_READ_OUTSIDE_FETCH` before the batch is
recorded, so no row is ever stored on a lookup the run did not make (audit #31's rule). The days on which a line is
priced again are the change days of the shared types and of the run's records; the old read also held days on which
records change only for codes and pairs no row asks for, where no line's pricing can change. The pricer's memo keeps a
compact record per distinct line (its figures, reason and two trace hashes, each computed once), never an engine
trace. Each phase (the shared read or its reuse, the keyed read, pricing, recording) logs `elapsed_ms` and
`record_count`, two numbers-only fields added to the log allowlist, beside the run's ID. The output is proved equal to
the old read's by an oracle, `adapter.ts` and the read path exactly as they were at commit 3c1b289, frozen in
`apps/worker/src/screening/test-support` and imported only by tests and the capacity harness's oracle: row for row on a
test-local release built for the cases where the two could differ (`release-cache.db.test.ts`), and by SHA-256 over
upload 1 of each production-shaped scenario in the capacity test. *PR 6b changed one identifier in `legacy-release.ts`,
the split table's name; the read path and the adapter are otherwise as at 3c1b289. Split-ZIP runs are proved against a
whole-release oracle (ADR 0064).* As built, the key set's codes are those of the rows
still to price (the database's function reads `pending` rows), so a run claimed again after a stale attempt reads only
what it still prices; the codes priced equal the key set on every attempt.

**Capacity under production limits (audit #53 part 1; the founder's rulings of 2026-10-20, decisions 13 to 16).**
`.github/workflows/screening-capacity.yml` builds the production images and runs `pnpm screening:capacity`
(`tools/screening-capacity`; docs/runbooks/screening-capacity.md). Web and platform run as containers at production's
task sizes, read from `infra/lib/environments.ts` (with no swap, sharing the runner's last CPU: the web half a vCPU and
1 GiB since the founder's ruling of 2026-10-22, a quarter vCPU and 512 MiB before it, the platform a quarter vCPU and
512 MiB); Postgres 18 at db.t4g.medium's size or the runner's share of it, with gp3's I/O baseline on the device behind
Docker's data root, a 1 GiB `/dev/shm` and a 1 ms delay each way on its link (netem on its own interface, which delays
what it sends, and on the host's end of its veth pair, which delays what it receives: one alone delayed one direction
and could never reach the 2 ms the check asks for); Postgres counts as ready once a client container on the services'
network reaches it over TCP; every limit is read back before the run counts, and the harness and Chromium run on the
other CPUs. The release is the SYNTHETIC production-shaped release 900100
(`packages/synth/src/release/scale.ts` through `tools/release/scale.ts`: 2,245,245 invented records in CMS's layouts
at the sizes of CMS's public files, the full practitioner PTP table among them, built outside the repository and
loaded by the release loader with its synthetic option). The uploads are the practice shape (the large test's 50,000
rows, held equal to them) and the worst shape (50,000 distinct priced lines over at least 15,000 codes, half of them
in the reduction across codes, a tenth in a quarter whose records change), each alone and three at once with a small
upload behind them, sent once the three large runs exist so that it is queued behind them (each pricing job's place in
the queue is recorded from pg-boss). S1, S4 and S5 start from a cold Postgres (restarted, the page cache dropped, both
recorded); S4's three worst uploads are variants of the worst shape that differ from S1's and from each other in most of
their codes, sharing the release's pooled and corrected codes, which every worst upload prices. The verdict is split.
The job fails on what PR 6 controls: an OOM kill, a restart or an exit the harness did not cause (Postgres's own
included), anonymous memory above 90% of a task's limit, a limit or a cold start not applied, a runner too small, a
wrong or unfinished result, a result page that does not open (each emailed link, then its last page of groups), a run
that records no batch for five minutes or stays queued while nothing in its scenario moves, a small upload not queued
and started behind the large ones, an oracle mismatch or an oracle that compared fewer rows than the upload's Medicare
rows (S1-1, S2-1 and S3-1, the last priced from the shared types the platform held), or a run that measured other than
S1 to S5. The harness keeps deadlines of its own inside the job's 90 minutes (no scenario starts after 60, one still
running at 70 ends there), writes its report after every scenario, and keeps every container's log beside it. The
time from each
submission to its email is measured always and reported as "open, PR 6b" while
`environmentSettings('production').compute.screening` is absent; once PR 6b declares that consumer, a time above 48
seconds on the runner fails the job until staging measures how much faster the runner is than Fargate, and from then
on a time above 60 seconds scaled by that factor. The switch is that declaration, read from the settings the stacks
deploy, and `tools/screening-capacity/report.test.ts` proves both sides of it. A consumer declared while the harness
still prices screenings in the platform container one at a time (`HARNESS_RUNS_SCREENING_CONSUMER`, false) fails the
job as "consumer not run", so time is never enforced over the wrong topology: PR 6b runs the consumer's own service
and concurrency in the harness and sets it (the capacity review of PR #31). The platform container runs
`NODE_ENV=test` with the local outbox, because the worker refuses the outbox in production; every `NODE_ENV` read in
the code the images load is listed in `tools/screening-capacity/env.ts`, with what it selects, and a test fails on
one not listed. Each upload comes from its own client address through one trusted proxy hop, as production's load
balancer gives it, since the screening's limit of ten an address an hour would otherwise refuse the eleventh. The
workflow runs weekly (once the default branch carries workflows), on request, on pushes to `claude/build-platform`
that touch its paths and on pull requests that touch the screening, pricing, the harness or the images; a failure
outside a pull request opens or updates one issue from a job that holds the workflow's only write permission and runs
no repository code. Its report (`tp-screening-capacity/2`) holds counts, times, limits and hashes, never a row, a link
or a token. *Since PR 6b-3 time is enforced: the harness runs the consumer as production will, the workflow is a
required check through its gate job, and the report (`tp-screening-capacity/4`) names the consumer and both image IDs
(Amendment (PR 6b-3)). Since the founder's ruling of 2026-10-23, S4 runs three times, its time judged on the middle run,
the report is `tp-screening-capacity/5` and the job's timeout 100 minutes; the founder's second ruling that day moved
the measurement to GitHub's 8-core larger runner (`/6`), which needs an organization, and the third ("Free: time
advisory") put it back on the free 4-CPU runner with time advisory on pull requests and binding on a release's run,
the report recording the mode and the layout that ran (`tp-screening-capacity/7`; Amendment (PR 6b-3), Owner rulings
(2026-10-23)).*

**The result page holds one page of groups (audit #53 part 1, found by the capacity test's first local run).** The
page read and rendered every group by payer product and code, and a worst-shape result's 20,507 groups exhausted the
web task's heap. Its memory is now bounded whatever the result's size. `screening_result_groups(token, page,
per_page)` gives one page of groups, numbered in one total order (the largest difference from the lowest figures
first, then payer product and code), at most 100 a call; the page asks for 50 (`?groups=N`, the first page unless a
whole number is given, the last for one past it). `screening_result_group_totals(token, page, per_page)` gives, over
every group, how many there are, how many are anomalies and how many are within the range of the reduction across
codes, and, for the groups the page does not show, their count, anomalies, rows, claim lines and summed figures. Both
read one invoker function, `screening_result_ranked_groups()`, which no role may call, so the order and the sums are
written once. The card's description takes its counts from the database, the table's last row is the other groups'
sums, and links reach the first, previous, next and last pages, never prefetched. The summary is one row, the coverage
is bounded by the closed lists of products, dispositions and reasons, and the top rows stay at 25, so nothing on the
page grows with the file. The page offers no download, and none is added: every group is reachable a page at a
time, and its figures are the database's. `apps/web/src/lib/screening/result-page.large.db.test.ts` builds a
worst-shape result (the capacity test's 50,000 rows through the upload route, SYNTHETIC figures recorded by the
operator functions) and proves the paging, the sums against the summary and, in a process of its own under a 512 MiB
heap (the web task's memory), that the read and render of the first, a middle and the last page each list 50 groups
or the last 7 in about 140 KB of HTML and add under 10 MiB to the heap; the harness opens each emailed link and then
its last page. Each read ranks every group in SQL: about 0.2 s at the worst shape on PostgreSQL 18, because
`screening_standing()`, which the ranking calls for every row and every group, is a SQL-standard body (`RETURN`) the
planner inlines; with a `SET search_path` of its own it was not inlined and a read took 0.47 s, which put that test's
sweep of all 206 pages at 109.6 s of its 120 s on CI (7bcb5fc). The test now reads the pages four at a time and states
each step's time limit with the measurements behind it.

**An unguessable link, emailed only.** The token is 32 letters a to z drawn by rejection sampling from the
operating system's random bytes (about 150 bits), letters only so the URL guard admits it, at
`/screening/results/[resultId]`. It reaches the email alone: the database stores its SHA-256, and it is in no log,
job payload or audit event. The browser only says to check the email, so the link verifies the contact. The email
holds the link and the row count: no figure, date or code.

**Limits per domain, per free-mail address and per address (D21 a).** A `screening` rate-limit bucket counts 10
an hour per client address and 20 a day per account, the account being the email's domain for a business address
and the mailbox for a listed free-mail domain (`apps/web/src/lib/screening/rate.ts`: the large webmail services
and the large United States internet providers, and their subdomains). A mailbox is counted once however its
address is spelled: NFKC and lower case, a domain's trailing dots dropped, googlemail.com read as gmail.com, a
"+tag" dropped at a free-mail domain and a Gmail address's dots dropped; the address stored and mailed to is the one
typed. Subjects are stored as
the rate limiter's keyed hash only. The input schema is bounded text, so the limit counts before any deep check.
The conversion counts against the public form's limit.

**Words (D11 a).** Screening outputs carry the lockup without the tagline (the prospect email variant and the
public header), and never say owed, underpaid or recovered: "below the figure before the reduction across codes",
"below the fully reduced figure", "below the Medicare figure" (a code with one figure), "at or above both Medicare
figures", "allowed in your file", "difference", "within the range of the reduction across codes", "cannot be priced
without a contract". The copy lint reads the screening paths, the worker's screening module included.

**Outcomes, leads and attribution (audit #57; the founder's rulings of 2026-10-20, decisions 7 to 12 and 17 to 19).**
Migration 20261104090000 also keeps what the screening teaches about the funnel, written by the definer functions
from day one, and four tables more, each built as the five are (row-level security forced, the owner's policy alone,
no `practice_id`, no registry row, no other role's privilege):

- `screening_outcome`: one counts-only row for every screening, a refused one included, kept with no end date. Its
  stage (refused, accepted, priced or failed), the month (UTC, `YYYY-MM`), how the prospect heard of us, the channel
  (computed by `marketing_channel()` from the campaign medium and the kind of paid click, never a caller's), a campaign
  code only when the founder lists it in `marketing_campaign` at submission (`other` otherwise, null with none),
  whether the prospect consented, bands of the row counts (`screening_count_band()`: none, up to 100, 1,000, 10,000,
  50,000, more), the sorted codes of a refusal's reasons, whether an accepted screening followed a refused upload of
  the practice still kept (`after_refusal`, on the accepted outcome: a flag on the refused one would tie its reasons,
  through a small cohort, to the practice's later converted outcome and its request), the release, and once priced
  the engine, four whole-percent shares of the file's allowed
  total (floored, so they sum to 97 to 100; all 0 when the total is 0), the band of the rows `screening_standing()`
  names anomalies and the band of their summed gap below their lowest figure (`screening_difference_band()`, the
  narrowest step $1,000), how soon the result was first opened (`screening_open_band()`, by UTC days from the upload),
  whether an audit was requested, and whether a later screening replaced it. Never a name, an email, a ZIP, an exact
  count, a date or a dollar figure, so the difference of two outcomes is never a cell of claim lines; two screenings
  of a practice whose one row differs by one claim line leave outcomes that differ in no count. It links to its
  upload while the screening is kept and is unlinked (`ON DELETE SET NULL`) in the transaction that deletes it, at
  expiry or replacement; an unlinked outcome is sealed (`screening_outcome_rules`), and DELETE and TRUNCATE are refused.
  No audit event names one.
- `screening_lead` and `screening_lead_product`: the frozen summary of a converted or consenting prospect's
  screening, kept 12 months from the upload (decision 10). `screening_freeze_lead()` (an invoker function, called only
  inside the definers) copies the practice's name, state, ZIP and contact address, how they heard of us and the
  attribution, the consent's hash, the release, manifest, engine, the labels' version (`screening_labels_version()`,
  equal to `SCREENING_LABELS_VERSION` in `labels.ts`, whose words a test pins to their version) and the first open,
  and bigint sums over the stored rows with the filters of `screening_result_summary()` and
  `screening_result_coverage()`, by payer product too. Every row sums at least 11 claim lines, so every claim-line sum
  is 0 or at least 11 (`screening_lead_product_cells`); the left-out claim lines and dollars are kept only at 11 or
  more. A practice keeps one summary at a time: a later screening of the practice (the same ZIP and practice name, or
  the same contact address) replaces it at that screening's own completion (`operator_screening_complete()`), each
  deletion an audit event. The request of the latest summary of the same ZIP and practice name goes over to the later
  screening's summary (decision 17: from any address, with a notice in the console, PR 7; `screening_lead_replaced`,
  naming the request). A summary that matched by the contact address alone (a billing firm's address screening
  another client, or the same practice renamed) is deleted for the subtraction rule but its request is left without a
  summary, never carried onto another practice's figures (`screening_lead_left_request`, naming the request). A failed
  or abandoned resend deletes nothing, a refused upload replaces nothing, and a completion after the screening's
  expiry is refused (the job fails the run as `EXPIRED`). A conversion freezes the summary on its request alone, never
  with a consent the prospect withdrew, when the run has none, or gives it the request when it has none (a summary
  already carrying an earlier request keeps that one, and the conversion form says the new request has none of its
  own). The result page and the result email say whether this screening's summary is kept and with what
  (`screening_result_summary()`'s and `operator_screening_complete()`'s `kept_with`: none, its own request, an earlier
  request it took over, or consent), so a later prospect whose screening took over a request is told that their
  details are kept with it for 12 months, never that they are deleted. The summary
  goes after its 12 months (`operator_screening_expire()`, `screening_lead_expired`), on withdrawal
  (`screening_lead_withdraw()`, PR 6e's link), or with its request (the cascade #51's deletion uses); a delete
  otherwise is refused (`screening_lead_kept`).
- `marketing_campaign`: the campaign codes the founder lists (`console_register_marketing_campaign()`, a platform
  administrator; its screen is PR 7's), append-only, each with an ID the listing's audit event names. That a listed
  campaign is one sent to many people is the founder's rule, kept by review; PR 7's reports show a campaign's cohort
  only at 11 or more (Owner rulings (2026-10-21)). Every row that keeps a link's campaign code keeps it only when it is
  listed here as the row is written, `other` for any other code (Owner rulings (2026-10-21)).
- `screening_prospect` gains `source` (the closed list of decision 8, optional), `utm_source`, `utm_medium`,
  `utm_campaign` (kept only when listed, `other` otherwise) and `paid_click` (from the attribution cookie),
  `referring_firm` (optional, screened by
  `textPhiFindings`), `followup_consent_sha256` (null until PR 6e captures consent) and `screening_terms_sha256` (the
  SHA-256 of the screening terms accepted, decision 19; null until the terms' wording, the founder's and counsel's,
  and its checkbox land). `screening_run` gains `first_opened_at`: set by the result page's signal
  (`screening_result_opened()`, POST `/api/screening/opened`, sent only after two seconds visible and a first
  interaction, `focusin` among them) or by the conversion, never by the link's GET, which a mail scanner also makes.
- `prospect_request` gains the same attribution, `from_screening` (set by `convert_screening()`, which now writes the
  request itself, since no later update may set it), and `declined_reason`, the closed list of decision 9, required on
  the console's decline (`not_recorded` for a request declined before the list, or by the previous image; a decline
  that names it is refused, and the migration that follows the previous image's retirement makes a decline with no
  reason raise instead of recording `not_recorded`). Every new
  CHECK on it writes its list inline and calls no function, because the application role updates the table directly
  (the bug migration 20261030110000 fixed for `prospect_payers_valid`); `prospect_request_fixed()` keeps the new
  columns fixed and a declined request's status and reason, with one exception for the backfill. A second,
  twelve-argument `submit_prospect_request()` takes the attribution; the six-argument one stays for the previous image.
- Consent capture, the withdrawal page, the reminder job (`operator_screening_reminders_due()`,
  `operator_screening_reminder_sent()`) and their emails are PR 6e's, on these columns and functions with no
  migration; the console's funnel, lead list and campaign screen are PR 7's.

**The attribution cookie (decision 11).** `pw_first_touch`, first-party, set by the proxy (`src/proxy.ts`), which
otherwise authorizes nothing and touches no database: on a page GET (never `/api` or Next's assets) whose URL carries
a valid `utm_*` code after normalisation (lower case, trimmed, each run of white space or `+` a hyphen, then
`^[a-z0-9][a-z0-9._-]{0,63}$` or dropped, and dropped too when it has an identifier's shape: nine or more digits, an
SSN, a date, an email address or a phone number by `textPhiFindings`, a Medicare Beneficiary Identifier, or digits
alone; a name has no shape a check can see) or a click-ID parameter, and no such cookie yet, it sets the three codes and
the kind of paid click (`paid_search` for `gclid`, `gbraid`, `wbraid` or `msclkid`; `paid_social` for `fbclid`,
`li_fat_id`, `ttclid` or `twclid`), read by presence alone, so the click ID never leaves the URL. `Max-Age` 30 days,
`Path=/`, `HttpOnly`, `SameSite=Lax`, `Secure` on https; the first visit wins. The screening and request-audit
handlers read it on the server (`src/lib/http/attribution.ts`), check every value again, and pass the four values; the
database's CHECKs hold the same shape, and the database keeps the campaign code only when the founder lists it
(`other` otherwise; Owner rulings (2026-10-21)), so a name typed into a link's campaign stays in the visitor's own
cookie and is stored nowhere. No script reads it, no third party receives it, and nothing logs it. The
privacy notice (#51) discloses it; counsel confirms the disclosure. Until that review is recorded a production server
neither sets the cookie nor reads it (docs/product/legal-surfaces.md, `attribution-cookie`;
`src/lib/legal-surfaces.ts`), so no campaign code is kept from a visit before the disclosure exists, from the first
production deploy on.

**The CO-04 amendment.** CO-04 says results "expire after 30 days (a platform job deletes them)". A screening's
result, rows and the prospect's details still do. What outlives them, by the founder's rulings of 2026-10-20: the
counts-only outcome (no end date, decision 12), and for a practice that requested an audit or consented, the
screening's totals with its practice name, ZIP, email and how it heard of us, kept with the request for 12 months from
the screening (decision 10). Every surface that deletes or collects says so in the plain list of decision 7, from one
wording (`apps/worker/src/screening/wording.ts`): the result page (by what its summary is kept with), the email (the
same), the closed link's page, the upload form's email hint and the "sent" alert (each saying what is kept if an
audit is requested from the screening or was from an earlier one of the same practice name and ZIP code, never
whether one was), the request-audit form and the conversion form. Each is a legal surface (docs/product/legal-surfaces.md);
a production server keeps the screening closed while any of the screening's waits for counsel's review.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| A separate schema and role for screening (D18 b) | A second tenancy model to secure and test; the catalog test already proves the public-schema pattern. |
| Upload bytes to S3 under a platform key (D18 c) | A mistaken upload holding PHI would reach storage; a file with no practice has no practice key. |
| Price a row's visit composition (D19 c), or show a range computed outside the engine (D19 b) | Asks the prospect for what an aggregate has not got, or computes a number outside the engine. The owner's ruling 1 gets the range from the engine itself: both ends are `price()` outputs. Revisit if prospects send visit-level aggregates. |
| A fully reduced figure from a higher-valued pool code ahead of the row | Depends on which codes the release carries and their practice-expense parts at the place of service; the row's own code with one unit always ranks first by the engine's tie rule, and the second line's cut is its own whatever ranks first. |
| Compare against the engine's final amount, after sequestration | What PR 6 first did: a payer's allowed amount is normally before sequestration, so a row allowed in full looked about 3% (SYNTHETIC; 2% real) above the figure and up to that much of a shortfall was hidden. The owner's ruling 2 compares before it. |
| Ask for a ZIP+4 where the locality map needs one | The engine takes a five-digit ZIP alone (`PracticeSettings.zip`), so this pull request refuses such a ZIP. The founder's ruling of 11:47 UTC on 2026-10-18 supersedes ruling 3: PR 6b takes a ZIP+4 in practice settings and the screening and has the engine resolve the locality from it, before launch. *Built in PR 6b (ADR 0064).* |
| Keep a row of fewer than 11 claim lines and hide it in the result | It would still be stored: one patient's service line in tables built as non-PHI, from a prospect with no BAA. |
| Say what was left out in the browser alone, storing nothing of it | The result, opened later from the emailed link, could not say that its figures leave rows out, and its totals would not match the prospect's file. Three sums with no code or quarter beside them name no service line (with one row left out they are its count and dollars, which counsel confirms). |
| Hash the file in the browser and keep that hash (what PR 6 first did) | The file holds the rows left out, so its hash, with no key, beside the rows kept and the left-out sums, let a left-out row be found by trial in seconds (the review of 2026-10-20). The hash kept is the database's own, of the rows it stores, which says nothing they do not. |
| Keep a refused upload's hash, or an HMAC of it under a server key | The rows refused can hold the very row the floor withholds, and a code derived from them is derived from that line, keyed or not (45 CFR 164.514(c)). A refusal keeps its count and coded reasons alone. |
| Refuse a new upload whose row differs by 1 to 10 claim lines from the same row held | It cannot see the rows left out of the earlier upload, it tells the prospect something of what is held, and the prospect cannot fix the file; replacing the earlier screening needs no comparison at all. |
| Replace by the rate limit's account (a business address's domain) | A billing firm or a health system screens many practices from one domain, and their screenings are different practices' data, which no subtraction joins. The same address, or the same practice name and ZIP, is the practice. |
| Keep the template a header line alone, its rules only on the page | A prospect fills the template in a spreadsheet, away from the page; the floor and the denied-lines rule belong where the totals are typed. Note lines the reader skips put them there without a second file or format. |
| Date the quarters by the computer's own clock | A wrong clock would refuse a quarter the server takes, or send one it refuses; and once small rows are left out, the server's row number would not be the file's. |
| Refuse a whole file in the browser when a row is small | A practice's file of totals has many small cells (a rare code, a quarter's tail); refusing it would turn most prospects away for rows that are left out safely. The founder ruled to leave them out and say how much was left out. |
| Count patients rather than claim lines | A row of totals has no patient count. Counsel decides; if counsel says patients, a patient-count column is added and the floor moves to it. |
| Infer the product from payer names (D20 b), or price everything as MA non-contracted (D20 c) | A guess about a contract; MA contracted rows must never price as non-contracted. |
| Rate-limit by domain and IP only (D21 b) | Every gmail.com prospect would share one count. |
| Show the result in the browser only (D21 c) | Nothing verifies the contact, and the result could not be reopened. |
| A base64url token | The URL guard refuses it; 32 letters carry about 150 bits. |
| Say "we keep anonymous counts" (decision 7 b) | Says less than what is kept, counsel may not accept "anonymous", and it is not true while a request is kept, whose outcome can be matched to it. |
| Free text for how a prospect heard of us (decision 8 b) | Cannot be counted, and can hold anything typed. |
| Keep a converted prospect's summary as long as the request (decision 10 b), or not past 30 days without consent (c) | A period tied to #51's request retention is not one stated period; 30 days loses the summary the founder takes to the scoping call. |
| A session-only or last-touch attribution cookie (decision 11 b, c) | Loses the prospect who returns another day, or the channel that first brought them. |
| Delete outcomes after a fixed period, such as seven years (decision 12 b) | Gives up long-run cohort trends and adds a deletion job; an unlinked outcome names no one. |
| Replace a summary only from the same email (decision 17 b) | Either two summaries of one practice are held, to be subtracted into a small cell, or a colleague at another address cannot convert. |
| No conversion flag on the outcome (decision 18 b) | Conversion by what the result showed cannot be counted. In return no outcome would match a request; the wording says that while a request is kept, its outcome can be matched to it. |
| Record an open on the link's GET | A mail scanner opens every link it is sent; an open counted there means nothing. |
| A validator function for each closed list in its CHECK | The application role updates `prospect_request` directly, and Postgres checks EXECUTE on a CHECK's function on every update (migration 20261030110000's bug). The lists are inline, and a test holds them equal to the TypeScript. |

## Consequences

- Real prospects wait for release 1: `current_rule_release()` is null in production, so `screening_status()` is
  closed, and nothing about a prospect is recorded while it is, not even a refused upload. Tests price under
  SYNTHETIC release 900001 only (and 900004, withdrawn in a test).
- A row of totals cannot say which code led its visits, so a code in the reduction across codes gets two figures, both
  the engine's: priced alone (before the reduction; PRD 11's example, golden claim G01, by 15.3% above the visit) and
  priced as a later code of a visit (fully reduced). A visit priced with the reduction puts the code between them, so
  a row there is within the range of the reduction across codes and never an anomaly; one is an anomaly only more than
  $5 a claim line below the fully reduced figure (the owner's ruling 1). The threshold is ADR 0038's, exceeded
  ("more than"), where PR 6 first used "at least".
- Every figure is the engine's before sequestration, read from its trace (the owner's ruling 2), because a payer's
  allowed amount is normally reported before it: a row allowed in full at the figure shows no difference. Whether
  that holds for every payer's allowed amount is for the reimbursement specialist to confirm with
  fixtures/golden/QUESTIONS.md, Q21 (which asks it of the engine's own lines; the golden lines and QUESTIONS.md are
  unchanged by this pull request, so the note is here). The engine is not touched.
- A ZIP whose locality needs its ZIP+4 is priced from it; D20's "ZIP+4 asked only where `locality_map` requires it" is
  met (PR 6b).
- A Medicare row in a quarter outside the release's loaded MPPR and MUE content is left out and counted, with the
  loaded quarters named (audit #7, PR 6b).
- A row of fewer than 11 claim lines is never sent by the page, stored or priced (the founder's ruling on the
  audit's item 6): the browser leaves it out and counts it, the server refuses one sent around the browser by its
  row number, and the database refuses one stored. A practice whose rows are mostly small sees much of its file left
  out, with the rows, claim lines and dollars left out said in the browser and on the result. Whether 11 counts
  lines or patients waits for counsel; until then a row of 11 or more lines can still be one patient's plan of care.
- A practice has one screening at a time: a later one for the same practice name and ZIP, or from the same address,
  replaces the earlier, whose link stops opening it, and the upload page, the result and the email say so before it
  happens. A billing firm that screens several practices from one address keeps one of them open at a time. The hash
  kept covers the rows the server accepted, so it says nothing the stored rows do not; two files differing only in a
  row left out store the same hash.
- The template and the upload page tell the prospect to leave denied lines out of every total (the founder's ruling
  on the audit's item 1); a file that keeps them shows them as a difference below the Medicare figure, which the
  screening cannot tell from a rate variance. The paid audit's triage of denials is PR 6d.
- A result priced under a rule release since withdrawn says so above its figures and may still be converted to an
  audit request, which prices nothing from the screening (the owner's ruling 4).
- The platform split is a fifth table the domain model shows as a divergence from CO-12; approving the document
  approves it, and the four of audit #57 with it.
- Every screening leaves a counts-only outcome for good, a refused one included; while a converted or consenting
  practice's summary or its request is kept, its outcome can be matched to them (the same month and release, and
  `converted`), which the wording says and counsel confirms. Once both are gone the outcome holds only a month,
  bands, whole-percent shares, closed codes and the release. A converted prospect who resends a file keeps the summary
  the founder takes to the scoping call: it moves to the later screening at that screening's completion, with its
  request. A billing firm screening several practices from one address keeps one summary of them at a time.
- The attribution cookie is a cookie the proxy now sets outside production; the privacy notice (#51) must disclose it
  before any production server sets it, and until that review is recorded none does. The screening terms' hash is null until their wording and checkbox exist; making it required needs
  a later migration or the wording before this one merges (open).
- What proves audit #57: SEC-17 at nine tables, the grants, the closed lists against `pg_get_constraintdef`, the
  bands, channel and refusal codes, the outcome's lifecycle (written at submission, refusal, completion and failure;
  shares, anomaly and difference bands; after a refusal and superseded; fixed columns, one-way stage, flags and first open
  once; unlinked on expiry and replacement, then sealed; DELETE and TRUNCATE refused), the pair of outcomes that
  reveals no cell, the summary's freeze, sums, labels version, first open, 12 months, replacement at completion (by
  address and by ZIP and name, the request carried only by the same practice), `kept_with`, withdrawal and a conversion
  after it, reminders, expiry and cascade, a completion after expiry, the lock order beside the opened signal, a
  conversion, a completion, a failure and the expiry job, the attempt's fence, and the re-linking test
  (`packages/db/src/screening.db.test.ts`); the backfill of declined requests (`migrate.db.test.ts`); the routes'
  attribution, the opened signal and the conversion (`apps/web/src/lib/screening/routes.db.test.ts`); the request's
  attribution and the console's decline as the application role (`onboarding-routes.db.test.ts`); the cookie, the
  proxy, the source and decline lists and the signal (`attribution.test.ts`, `proxy.test.ts`,
  `opened-signal.test.tsx`); the wording (`upload-form.test.tsx`, `message.test.ts`, `labels.test.ts`); and the
  screening journey (`e2e/screening.spec.ts`).
- What proves it: SEC-17 (`packages/db/src/screening.db.test.ts`, from the catalog), SCR-01 to SCR-06
  (`apps/worker/src/screening/*.test.ts`, `apps/web/src/lib/screening/routes.db.test.ts`,
  `screening.large.db.test.ts`, `apps/web/src/components/screening/result.test.tsx`, the copy lint and the screening
  journey). The rulings in particular: G01's 97110 and 97140 as SYNTHETIC rows, between their two figures (within
  the range) and more than $5 a line below the fully reduced one (an anomaly), 97161 with one figure, a row allowed
  in full at the figure before sequestration with no difference (`adapter.test.ts`, `screening.db.test.ts`); a ZIP
  needing its ZIP+4 refused (`routes.db.test.ts`, `screening.db.test.ts`); a result under a withdrawn release
  converted with its notice (`routes.db.test.ts`, `screening.db.test.ts`). The floor, SCR-07: 10 claim lines left
  out and 11 kept in the browser, with the rows, claim lines and dollars left out counted to the cent
  (`format.test.ts`, `parse.test.ts`), refused at 10 and taken at 11 by the server's decode and route, a direct POST
  around the browser with a row of one claim line refused by its row number and storing nothing of the row
  (`routes.db.test.ts`), the CHECK refusing 1 and 10 and taking 11, and the left-out numbers held to what a browser
  could count (`packages/db/src/screening.db.test.ts`), the result's card (`result.test.tsx`) and the journey, which
  leaves two small rows out of what it sends (`e2e/screening.spec.ts`). The template's note lines: their words,
  plain ASCII, skipped as written and as a spreadsheet saves them, a `#` header still checked, a note below the
  header refused, and the quarters dated by the server's clock (`parse.test.ts`, the page's `serverTime` in
  `routes.db.test.ts`); the journey downloads the template, reads its rules, and sends it filled with its notes
  kept. The hash: the database's own over the rows stored, equal to `encodeScreeningRows` of the rows sent, none on
  a refusal, a hash a request sends never kept, and two files differing only in a row left out storing the same one
  (`packages/db/src/screening.db.test.ts`, `routes.db.test.ts`, `parse.test.ts`, the journey). One screening a
  practice: a row of 12 claim lines and the same row at 11 never held together, the earlier link not found, a
  screening replaced from the same address and one whose row was left out, another practice's kept, a refused upload
  replacing nothing, two submissions at once leaving one, and a replaced run never priced or emailed
  (`packages/db/src/screening.db.test.ts`, `routes.db.test.ts`, `apps/worker/src/screening/screening.db.test.ts`).
- What proves it (audit #53): SCR-09, the release read: every stored row of runs at two ZIPs in two localities over
  every 2026 band deep-equal to the oracle's and none ENGINE_ERROR, on a test-local release that corrects a used code's
  relative values and starts a used code's edit mid-quarter, changes an unused code's values, an unasked pair, the
  conversion factor and sequestration mid-quarter, holds a same-code pair and leaves a priced code without relative
  values; sixteen runs at sixteen ZIPs reading the shared types once and holding one entry, at most two releases held;
  a view missing one code's relative values or MPPR rate, a row outside the key set and codes priced unequal to it each
  failing the run as `RELEASE_READ_OUTSIDE_FETCH` with no row stored ENGINE_ERROR (`release-cache.db.test.ts`); the
  view's five keyed types refusing a lookup outside the fetch with the first violation kept, and a fetched key with no
  record answering null (`keyed-release.test.ts`); the compact memo equal to the frozen pricer and holding no trace
  (`adapter.test.ts`); the oracle frozen and out of the product (`oracle-imports.test.ts`). SCR-08, the capacity test:
  its limits from production's settings (`limits.test.ts`), its `NODE_ENV` departures listed (`env.test.ts`), its split
  verdict and time switch (`report.test.ts`), its readers and Docker arguments (`measure.test.ts`), the scale release
  and uploads (`packages/synth/src/release/scale.test.ts`, `screening/uploads.test.ts`, `tools/release/scale.test.ts`;
  the practice shape held equal to the large test's rows there), the workflow's wiring (`tools/test/workflows.test.ts`),
  and the workflow's runs themselves.

## Owner rulings (2026-10-18)

The questions this pull request put to the owner, ruled by the founder, Tyler Williams, on 2026-10-18:

1. **The reduction across codes (D19).** For a row whose code is in the multiple procedure reduction pool, the
   unchanged engine prices the row twice: alone (the figure before the reduction across codes) and as a subsequent
   procedure of a visit, so that the reduction applies to it (the fully reduced figure). The second pricing is an
   ordinary input to `price()`, and the reduction is never reimplemented outside the engine. Both figures are engine
   outputs times the count, in bigint. A row is an anomaly only when its observed amount is more than the anomaly
   threshold (ADR 0038's $5 a line) below the fully reduced figure; a row between the two figures is labelled
   "within the range of the reduction across codes", never an anomaly. Both figures are shown, labelled. Rows outside
   the pool keep one figure. *Built:* the two-line claim above; `screening_standing()`; the labels and the standing
   chips.
2. **Sequestration.** The comparison is against the engine's own figure before sequestration, read from the engine's
   trace (the step before sequestration in the calculation the engine already returns), because payer allowed amounts
   are normally reported before sequestration; sequestration is never recomputed outside the engine. The
   reimbursement specialist confirms this later (fixtures/golden/QUESTIONS.md, Q21). *Built:* `beforeSequestration()`
   reads the trace's step and rounds it once under the trace's rule; the trace carries the amount, so nothing had to be
   computed in its place.
3. **ZIP+4.** As the founder, Tyler Williams, ruled at 11:47 UTC on 2026-10-18: ZIP+4 localities are fixed before
   launch in their own pull request, PR 6b: practice settings and the screening accept a ZIP+4, the engine resolves
   the locality from it, five-digit ZIPs and the golden lines are unchanged, and the change order's engine freeze is
   loosened for that lookup only. *Built in PR 6b (ADR 0064):* the engine resolves the locality from the ZIP+4 file;
   practice settings and the screening take a ZIP+4; five-digit ZIPs and the golden lines are unchanged, proved by a
   differential test against the base engine.
4. **A withdrawn release.** A result priced under a release later withdrawn keeps its notice and may still be converted
   to an audit request (the audit prices nothing from the screening). *Built:* unchanged, now tested.

The founder's approval of 2026-10-18 after the best-option audit of that day (its items 6 and 1), by the founder,
Tyler Williams, under the standing rule of that day (choose the best option for accuracy, quality, user
experience, privacy and compliance, never weighted by build effort):

5. **At least 11 claim lines a row (audit item 6, critical).** One setting enforced in the browser, in the server's
   check and in a database rule; the browser leaves small rows out before sending and says how many rows, claim
   lines and dollars it left out, and the result says so too; a request around the browser is refused with the row
   numbers, and nothing about the refused rows is stored but what the rejection reasons allow; the template and the
   upload page state the floor in plain words; counsel confirms the number and whether it counts lines or patients.
   *Built:* the floor above, SCR-07; after the review of 2026-10-20, no hash of the file or of a refused upload, and
   one accepted screening a practice at a time, so that no small cell is derived by subtraction (see One accepted
   screening a practice).
6. **Denied lines (audit item 1, the template's part).** The screening template and the upload page tell prospects
   to leave denied lines (zero-paid for authorization, visit limit, duplicate, timely filing, not covered) out of
   their totals, because a denial is not a rate variance. *Built:* the template's note lines, the page's rules and the
   column guide; the triage change is PR 6d.

What stays open: the specialist's answer to Q21 (should a payer's allowed amount turn out to be reported after
sequestration, the comparison is put to the owner again); counsel's answer
on the floor (the number; lines or patients; whether a left-out total under 11 claim lines may be shown as counted;
and the scope of one screening a practice); and visit-level aggregates (see Revisit when).

## Owner rulings (2026-10-20): what outlives a screening (audit #57) and the screening terms (audit #51)

The founder, Tyler Williams, accepted on 2026-10-20 the recommended answer to every question in the PR 6 design for
audits #53 and #57 (decisions 7 to 19 of that day). Those on what a screening keeps, built here:

7. **What the pages say is kept:** the plain list (ranges of rows, a dollar range, the shares priced, how the
   prospect heard of us, whether the result was opened and an audit requested, the release and the month), and after
   an audit request that the screening's totals, practice name, ZIP, email and how the prospect heard of us are kept
   with the request for 12 months. *Built:* `src/lib/screening/retention.ts` on every surface named above, and the
   result email. Counsel confirms the wording before the screening opens.
8. **How a prospect heard of us:** the nine answers (a search engine; my billing firm; a colleague or another
   practice; a professional association; a conference, webinar or event; LinkedIn or other social media; an email
   from PaidWhole; an article, newsletter or podcast; something else), optional. *Built:* `PROSPECT_SOURCES` and
   their labels, on both forms.
9. **Why a request was declined:** the eleven reasons, required on the console's decline. *Built:*
   `prospect_request.declined_reason`, `OFFERED_DECLINED_REASONS`, and `not_recorded` for past declines.
10. **How long a requester's summary is kept:** 12 months from the screening, as a consenting prospect's. *Built:*
    `screening_lead.expires_at`.
11. **The attribution cookie:** first-party, 30 days, the first visit wins, the campaign codes and the kind of click,
    never the click ID. *Built:* `pw_first_touch` above.
12. **How long counts-only outcomes are kept:** no end date. *Built:* `screening_outcome`, never deleted.
17. **A later screening from a different email of the same practice (same ZIP and name):** it replaces the earlier
    summary and carries the request over, with a notice in the console (PR 7). Counsel confirms. *Built:* the
    replacement at completion.
18. **Whether an outcome records the conversion:** yes, with the open band; the wording says the record can be
    matched to a kept request. *Built:* `converted` and `first_open_band`.
19. **The screening terms' fingerprint (#51's part in PR 6):** the column now, in this migration, so PR 6 needs one
    approval. *Built:* `screening_prospect.screening_terms_sha256`, nullable until the terms' wording (the founder's and
    counsel's) and its checkbox exist; the definer functions already take it.

Decisions 13 to 16 (the 60-second promise and its test, audit #53) are recorded with the release read and the
capacity test.

What stays open: counsel on the reworded surfaces and the cookie disclosure, on keeping a converted prospect's summary
12 months without consent, on unlinked outcomes and the stated linkage while a summary or request is kept, on a
different address replacing a request's summary and on telling that address so; the founder on a summary that matches
by the contact address alone (built: deleted, its request left without one; kept as built, Owner rulings (2026-10-21));
the terms' wording and whether their hash is required; PR 6e's
consent capture, withdrawal page and reminders; PR 7's funnel, lead list and campaign screen (a schema PR for its read
functions).

## Owner rulings (2026-10-20): the 60-second promise at production size (audit #53)

The founder, Tyler Williams, accepted on 2026-10-20 the recommended answer to every question in the PR 6 design
(decisions 7 to 19 of that day), and folded audit #53's parts 1 and 2 into this pull request. Those on the screening's
60-second promise and its test, built here (The release read; Capacity under production limits):

13. **If the speed test is red at launch:** the screening does not open until the latest capacity run on the image
    being deployed passes with time enforced. *Built:* the capacity test; time becomes enforced with PR 6b's
    declaration of the screening's consumer. *Built in PR 6b-3:* bound to both images by the launch check
    (`tools/screening-capacity/launch-check.ts`) and the web's `SCREENING_LAUNCH` (Amendment (PR 6b-3)), a value the
    CDK app computes at synthesis from the release's report, never one passed by hand (the founder's ruling of
    2026-10-22). *Since the founder's third ruling of 2026-10-23:* only the release's binding run counts; a pull
    request's advisory run, whose time only warns, never opens production, whatever its verdict. *Since the
    verification of PR 6b-3's capacity changes:* "the release's" is enforced: only the report `release.yml` measured on
    the tag and attested in that same run (GitHub's artifact attestation, verified with `gh attestation verify` at
    synthesis) opens production; a binding report measured anywhere else, or edited, is refused.
14. **Which file the promise covers:** any accepted 50,000-row file, the worst shape included. PR 6b sizes the
    screening's own consumer to that file and reports its size and monthly cost before building it, which may exceed
    the roughly $18 a month accepted. *Built:* the worst shape is measured alone and three at once, beside the
    practice shape. *Built in PR 6b-3:* the consumer the founder chose (Q1 (a)), one task of 2 vCPU and 4 GiB pricing
    three at once, about $74.50 a month; an upload in the waiting tier (Q7) is outside the promise.
15. **Where the time check draws the line:** at 48 seconds on GitHub's runner until staging measures how much faster
    the runner is than Fargate, then at 60 seconds scaled by that factor. *Built:* `TIME_ALLOWANCE_MS`,
    `TIME_PROMISE_MS` and `RUNNER_TO_FARGATE` (null until staging measures it) in `tools/screening-capacity/limits.ts`;
    `timeVerdict()` in `report.ts`: 47.9 s passes, 48.1 s fails as the allowance, 60.1 s as the promise. *Enforced
    from PR 6b-3:* every upload of every scenario, the small ones included. *Since the founder's ruling of 2026-10-23:*
    S4 runs three times and its time is judged on the middle run, every other check in all three; the line is unchanged
    (Amendment (PR 6b-3), Owner rulings (2026-10-23)). *Since the founder's third ruling that day:* "GitHub's runner"
    is the free 4-CPU runner again (the second ruling's 8-core larger runner needs an organization), and the line binds
    a release's capacity run, which alone opens production; on a pull request a time above it is a warning.
16. **How PR 6 merges before its consumer exists:** the test fails PR 6 on everything PR 6 controls; time shows as
    "open, PR 6b" until PR 6b declares the consumer in `infra/lib/environments.ts`, which switches it on in tested
    code. *Built:* `timeRule()` reads `compute.screening`; `report.test.ts` holds today's settings to "open" and a
    declared consumer to "enforced", and fails a declared consumer the harness does not yet run ("consumer not run").
    *Closed in PR 6b-3:* production's settings declare the consumer, `HARNESS_RUNS_SCREENING_CONSUMER` is true, and
    `report.test.ts` holds production's settings to "enforced" and settings without a consumer to "open".

The first local run (the process runtime of `tools/screening-capacity/containers.ts`, on a shared 4-CPU machine, its
Postgres unlimited; 2026-10-20, images at 1d8acd0) is recorded in the PR 6 approval summary with the load average
beside its times; it is not a measurement under production's limits. Every stored row equalled the oracle's for both
shapes, and no task met its memory limit while pricing. It found one failure PR 6 controls: the result page renders
every product-and-code group (`screening_result_groups()` has no limit), and a worst-shape result's 20,507 groups
exhaust the web task's JavaScript heap (Node sizes it from the task's 512 MiB, about 256 MB), so the page does not
open and the task exits; the practice shape's 72 groups open. The page now holds one page of groups (The result page
holds one page of groups, above). The second local run (the same runtime, 2026-10-20, images at ed3572f, S1 and S4)
opened every emailed link and then its last page of groups with HTTP 200, the worst shape's 20,507 groups included;
web's anonymous memory peaked at 215 MiB with one worst-shape upload and 285 MiB with three and a small one at once,
against 512 MiB and the 90% line at 461 MiB; no task exited, met its limit or was killed, and S1's stored rows equalled
the oracle's. Its only failing checks are the Postgres limits the process runtime cannot apply. No run of the Docker runtime has yet produced a report: the first CI run (39520324078, at f500b1f) stopped at
the migration task 0.23 s after starting it, and its error kept no stderr; the harness now keeps it, waits for Postgres
over TCP, delays both directions, keeps Postgres for the oracle and saves every container's log (the review of PR #31).
The second (39536429652, at cfd23cd) kept it: Node could not start as the images' user, since BuildKit gave the RDS
bundle's `ADD --chmod=644` to /etc/ssl and /etc/ssl/certs (moby/buildkit#5943) and Node reads /etc/ssl/openssl.cnf as
it starts; neither production image could have started. Both now add the bundle without `--chmod`, set the modes as
root and read the bundle with Node as `node` in the build (8f6e4d5, held by tools/test/workflows.test.ts). The third
(39537310623, at 8f6e4d5, a 4-CPU runner) is the first Docker run with a report, every scenario measured under the
task limits: verdict pass, time open (PR 6b). Times to email: S1-1 (worst, cold) 69.7 s; S2-1 and S3-1 (practice)
11.4 s and 10.0 s; S4 (three worst variants at once, cold) 62.0, 94.8 and 127.8 s, its small upload 116.7 s behind
them; S5 (three practice shapes, cold) 32.0 to 49.2 s, its small upload 40.9 s; S1-1, S2-1 and S3-1 equalled the
oracle. These are the runner's figures, not Fargate's (staging's factor stays open).
A third local run (the process runtime, 2026-10-21, the harness of cfd23cd over images built from f500b1f's working tree with this round's job changes, every scenario) compared
S1-1, S2-1 and S3-1 with the oracle at 50,000, 18,432 and 18,432 Medicare rows, each equal, and queued and started the
small upload behind the three large ones in S4 and S5; its times are not measurements (the machine was running other
suites).

What stays open: staging's runner-to-Fargate factor; the weekly schedule, which fires once the default branch carries
workflows (audit #54); #31's check of the scale release's
counts against release 1's real sources. *Decided in PR 6b-3:* the consumer (Q1 (a): three at a time, not two, on one
2 vCPU/4 GiB task) and the share, cap and honest message (Q7, Q12); the runner (Q1 (d), then the founder's rulings of
2026-10-23: the free 4-CPU runner for every capacity run, at no cost while the repository is public, with time advisory
on pull requests and binding on a release's run); the keyed-record cache, not built (the keyed read
measured 2.3 to 3.8 s for the worst shape and 0.0 to 0.1 s for the practice shape, and the promise is sized on a cold
cache, where a cache cannot help).

## Owner rulings (2026-10-21)

The founder, Tyler Williams, ruled on 2026-10-21 on what PR 6's review of that day left open. The question on the
campaign code was whether a code from a landing page's link is kept only when it is on the founder's list, because a
shape check cannot catch a person's name typed inside a code.

- **A summary that matches by the contact address alone: kept as built.** A later screening from the same contact
  address under another practice name or ZIP deletes the earlier kept summary at its own completion, so the practice
  never has two exact-totals records to subtract, and carries no request: the request stays, without a summary, and is
  never carried onto another practice's figures. *Built:* `operator_screening_complete()` and its event
  `screening_lead_left_request`, naming the request (`screening.db.test.ts`).
- **The result page and the email say when a summary is kept with an earlier request.** A screening whose summary
  took over the request of an earlier screening with the same practice name and ZIP says so, and that the details are
  kept with that request for 12 months from this screening. *Built:* `kept_with` (`earlier_request`) from
  `screening_result_summary()` and `operator_screening_complete()`, in one wording for both (`wording.ts`,
  `retention.ts`).
- **Deletion goes through PR 6e's withdrawal link.** A consenting prospect deletes their kept summary with the link
  PR 6e sends; PR 6 builds the database's part (`screening_lead_withdraw()`, by the token's SHA-256, its products
  with it, an audit event, an unknown token answered alike) and no other way to delete a summary early. A summary kept
  with a request still goes with the request (#51's deletion).
- **Requests keep `utm_campaign` only when it is on the founder's list; source and medium keep the shape checks.**
  Every row that keeps a link's campaign code keeps it only when it is listed in `marketing_campaign` as the row is
  written, `other` when a code was given that is not listed, and null when none was: `screening_prospect`,
  `screening_lead` and `prospect_request` (`utm_campaign`) and `screening_outcome` (`campaign`), the only four columns
  that hold one. *Built:* in Postgres, so no write path can store an unlisted code: `marketing_campaign_kept()` names
  the code as kept, and a trigger on each table (`marketing_campaign_listed_only()`, `screening_outcome_campaign_listed()`)
  applies it before every insert and every update that names the column, whoever writes: the definer functions, the
  owner's own statements, and any role later granted a write (the trigger runs as the writer, who must then read the
  list too, or the write fails). The application role writes none of these columns directly (no grant). A code of
  the wrong shape is refused by the trigger under the column's constraint name before the CHECK could print the row,
  so no error carries it. An outcome takes its prospect's code as kept, so the two never differ, and a kept summary and
  a conversion's request copy the prospect's. The triggers sit beside the tables' immutability guards: the application
  role's review of a request names only the columns it is granted and never fires its trigger, and an update that
  names the column meets the guard (`prospect_request_fixed()`, `screening_lead_rules()`, `screening_outcome_rules()`,
  and `reject_change()` on a prospect), so a row's code is set once, as it is written. `utm_source` and `utm_medium`
  are kept as given, under their shape checks, and the web layer keeps its shape checks on all three. **A code listed
  later does not change a row already stored as `other`:** the code that row was given was never stored, so nothing
  can be reclassified; only rows written after the listing keep it. Where the code goes: the visitor's own first-touch
  cookie, in their browser, may still carry it; no log line, job payload, audit event, error message or email does
  (`routes.db.test.ts` searches the services' log lines, the queued jobs, the emails, a refusal and the audit trail
  for one; the e2e journey proves an unlisted code from a landing link stored as `other`, and registers its listed
  campaign through `console_register_marketing_campaign()`).
- **PR 7's campaign reports use a minimum cohort of 11.** A report shows a campaign's counts only for a cohort of 11
  or more outcomes, the CMS small-cell standard the screening's rows already keep. Built with PR 7's read functions;
  nothing in PR 6 reports a cohort.
- **The images fix went to `claude/build-platform` as its own pull request.** #32 (8f6e4d5 cherry-picked, the two
  Dockerfiles byte-identical) merged as 5df4108; PR 6 merged that base, so its images are the base's.

What stays open: counsel and the founder on the wording of what a request and a kept summary keep, which still says
"the campaign codes ... of the link you came from" and may now say that the campaign code is kept only when it is one
we list (`retention.ts`, `wording.ts`); PR 7's campaign screen, from which the founder lists codes.

## Revisit when

Release 1 is published (screening opens); the specialist answers Q37 (a ZIP+4 the ZIP+4 file does not list); counsel
answers on the floor (the number, whether it counts claim lines or patients, the left-out totals and the scope of one
screening a practice); the reimbursement specialist
answers Q21 (the owner's ruling 2: which figure a payer's allowed amount is compared with); prospects ask for
visit-level aggregates (the reduction across codes); or the permission matrix gains a dedicated permission for
platform pricing defaults (PR 14); counsel answers on the reworded surfaces, the attribution cookie's disclosure or
the linkage between an outcome and a kept request; the screening terms' wording lands (its hash may then be required);
PR 6e builds consent capture on the columns here; or PR 7's funnel needs read functions over the outcomes. Since PR
6b-3, also when: staging measures the runner-to-Fargate factor (decision 15's line moves to 60 s scaled by it); the
images move to ARM (#136); the web's share of S4 on Fargate (10 to 18 s on one quarter-vCPU web in the design's
stand-in; 6.9 s locally on the half vCPU the founder chose on 2026-10-22) dominates there; accounts use their share or
the day reaches its cap for days on end; or lone files near the line (then splitting one run across threads, considered
and not built).

Since PR 6b-4, also when:
- **The capacity decision is revisited** (GitHub issue
  [#41](https://github.com/PureTideWater/PhysicalTherapy/issues/41), label "revisit"). How the screening's 60-second
  promise is measured was chosen to save cost, not as the best option: GitHub's free 4-CPU runner, the time advisory
  on a pull request and binding on a release behind its attested report (the founder's third ruling of 2026-10-23,
  "Free: time advisory"). The free runner shares its CPUs among the consumer, Postgres and the harness, which
  production does not, and its times follow the host (S4 took 38 to 57 s on the same code). On 2026-10-23 the founder
  asked that this decision be kept in view, although it was not the most optimized one, so that it is taken up again
  once the platform is in production. Revisit it twice: before the screening opens, and again once production has
  traffic. Measure on AWS staging (recommended: production's own task sizes, which also gives decision 15's
  runner-to-Fargate factor) or on an 8-core runner, which needs an organization on GitHub Team. Then settle the sizing
  question O9 (a worst time above 44 s). Until then, production's screening opens only on a release's attested
  binding report that passes (decision 13). The address checks PR 6b-4 adds (DNS and SES validation, run together, at
  most one 2-s timeout) fall inside the promise, and the harness charges them (ADR 0065).
- the screening stream is paused in production (ADR 0065): read the reason and the window's counts before resuming.

## Amendment (PR 6b)

ADR [0064](0064-resolve-a-split-zips-locality-from-the-zip-plus-four-files-ranges-the-one-engine-change-the-freeze-allows.md) records how a screening takes the ZIP+4 of a ZIP that Medicare splits between payment localities, keeps it only
then, and prices its rows at the locality the ZIP+4 file's range names. It records how a Medicare row in a quarter
outside the release's loaded MPPR and MUE content is left out by the browser and counted, refused when sent anyway,
and named on the result (audit #7). It records the split's rename to `place_of_service_split`, every practice's default
for a place it has not set, with the audit action `screening_split_approved` and the object type
`screening_place_of_service_split` kept, so the approval history reads under one name.

The founder, Tyler Williams, answered PR 6b's questions on 2026-10-21 (about 22:30 UTC: "Do all the recommended options
for these questions as long as it optimizes the app"). Those this record's screening and console build:

- **Q2 (a):** the practice's ZIP+4 lives on its location record, `practice_site`, one per practice and undated, set in
  Settings > Pricing settings and in the console; the screening's own ZIP+4 stays on `screening_prospect` (ADR 0064).
- **Q6 (a):** a Medicare row in a quarter outside the loaded content is left out and counted, as the claim-line floor's
  rows are: three numbers on `screening_upload` (`outside_content_rows`, `outside_content_claim_lines`,
  `outside_content_allowed_cents`), kept with the upload for its 30 days and never copied to `screening_lead` or
  `screening_outcome`; a request that sends one anyway is refused by its row (`band_outside_content`), and
  `submit_screening()` refuses it too (`screening_band_outside_content`).
- **Q11 (a):** no change to what the pages say is kept for the ZIP+4: it is entered in the same "ZIP code" field, goes
  with the prospect at 30 days and is never kept with a request, and the words already cover it (counsel confirms
  that "ZIP code" reads as including it).
- **Q12:** the recommended wording, for counsel to confirm before the screening opens. The new sentences a prospect
  reads, word for word:
  - the ZIP code field's hint: "Five digits, or ZIP+4 if you know it. A few ZIP codes span more than one Medicare
    payment area; for those we ask for the ZIP+4.";
  - a ZIP that needs its ZIP+4: "This ZIP code spans more than one Medicare payment area. Enter the full ZIP+4, such as
    27601-1234, so the screening uses the right one.";
  - a ZIP+4 the list does not hold (right under either answer to Q37, so never "check the four digits"): "Medicare’s
    ZIP+4 list in force does not list this ZIP+4. If the four digits after the hyphen are right, a screening cannot price
    this ZIP+4 yet.";
  - a ZIP whose ZIP+4 list is not loaded, with or without its ZIP+4 (said before any ZIP+4 is asked for): "PaidWhole has
    not loaded Medicare’s ZIP+4 list for this ZIP code yet, so a screening cannot price it. Try again later.";
  - before a file is chosen: "Medicare rows of 2026-Q1 to 2026-Q4 are screened; rows of other quarters are left out and
    counted." (no content loaded: "PaidWhole has no Medicare content loaded yet, so Medicare rows are left out and
    counted."), and the two Medicare products' notes end "for the quarters PaidWhole has loaded";
  - the upload page, before sending: "12 rows (380 claim lines, $41,200.00) in quarters before 2026-Q1 were left out:
    PaidWhole has the Medicare content for 2026-Q1 to 2026-Q4 loaded." (one row: "1 row (12 claim lines, $500.00) in a
    quarter before 2026-Q1 was left out: ..."; quarters after the content: "in quarters after 2026-Q4"; quarters between
    loaded runs: "in quarters outside the loaded content", the runs named as "2025-Q1 to 2025-Q4 and 2026-Q2 to
    2026-Q4"; no content loaded at all: "... were left out: PaidWhole has no Medicare content loaded yet.");
  - the result page, under "Not screened: quarters outside the loaded content": "12 rows ($41,200.00) in quarters before
    2026-Q1 were not screened: PaidWhole has not loaded the Medicare content for them." The result keeps no row's
    quarter, so it says "before" the first quarter loaded only when the release's content runs to the screening's own
    quarter (no row may lie after it), and "in quarters outside the loaded content" otherwise; it is a label, under
    `screening-labels/2026-11-05`;
  - when every row is left out: "Nothing is left to screen: every row was left out, as counted below."; a row sent
    around the browser: "Row 12, service band: PaidWhole has not loaded the Medicare content for that quarter, so a
    Medicare row in it cannot be screened." (the server's: "Row 12: the service band’s quarter is outside the Medicare
    content PaidWhole has loaded, so a Medicare row in it cannot be screened; leave it out");
  - the result's three engine details: "The ZIP spans more than one Medicare locality and no ZIP+4 was given", "Medicare’s
    ZIP+4 list has no locality for this ZIP+4 on the quarter’s first day" and, for a row in a quarter with no ZIP+4
    list of the ZIP in force (`no_locality_plus_four`, a gap in PaidWhole's content that PR 6b-1's review split from the
    unlisted ZIP+4), "PaidWhole has not loaded Medicare’s ZIP+4 list for this ZIP on the quarter’s first day".

## Amendment (PR 6b-3): the screening's own consumer and the time check

### Owner rulings (2026-10-21)

The founder, Tyler Williams, answered PR 6b's questions on 2026-10-21 (about 22:30 UTC; every recommended answer
accepted). Those this record's consumer and its time check build:

- **Q1 (a), the consumer:** one always-on task of 2 vCPU and 4 GiB pricing three screenings at once, each in its own
  worker thread, about $74.50 a month per environment, with no scaling target. Three at once replaces audit #53's
  adopted "two at a time": two slots measured 55.8 s for the third worst file against the 48-s line in the design's
  stand-in, three 37.5 to 41.1 s. It gives up zone redundancy: a crash or a lost zone adds about 3 minutes, and nothing
  is lost (SCR-19).
- **Q1 (b) and (c), before launch:** production's consumer runs no task until a deploy passes `ScreeningConsumer=running`
  (about $0.40 a month until then, its secret); staging's runs from its first released deploy, always on, so staging
  measures decision 15's runner-to-Fargate factor on production's task and runs the deployed image every day.
- **Q1 (d), CI:** the capacity workflow and the release's capacity job run on a runner large enough for the layout, and
  a smaller one is refused as too small, so production's screening cannot open on its measurement. *As now built (the
  founder's third ruling of 2026-10-23, below):* both run on GitHub's free 4-CPU runner (`ubuntu-24.04`) while the
  repository is public, at no cost; a runner with fewer than 4 CPUs is refused as too small. Once the repository is
  private its standard runner has 2, and the capacity test needs a 4-core larger runner (about $22 a month), which
  itself needs an organization on GitHub Team.
- **Q7, the share, the cap and fairness:** every upload is accepted. An account's share is 100,000 rows a UTC day (two
  worst-shape files) and the day's cap 1,000,000 rows of uploads within their shares (ten accounts' shares); an
  account's k-th upload past its share waits at priority -k (at most -20), so heavy accounts take turns, and one past
  the cap at -1; waiting uploads are priced when no normal run waits, and the prospect is told. This gives up the
  60-second promise for a firm's third and later large file on a busy day.
- **Q8, the merge rule:** the capacity test is a required check from PR 6b-3 on, through an always-running gate job
  that passes at once when no watched path changed; the founder sets the rulesets (docs/runbooks/screening-capacity.md,
  "Making it required").
- **Q12, PR 6b-3's wording:** the "sent" page's four states as recommended (usually within a minute; can take a few
  minutes when every slot is busy; one sentence for an upload over its account's share; one for an upload over the
  day's cap), each new sentence in PR 6b-3's description word for word, for the founder and then counsel before the
  screening opens.

### Owner rulings (2026-10-22)

The founder, Tyler Williams, answered what PR 6b-3's review round left open on 2026-10-22 (about 23:00 UTC; "Do the
recommended for everything if it optimizes things"), recorded in reconciliation-001 and, for the service and its cost,
ADR 0049:

- **The size (open item O9):** the web task at half a vCPU and 1 GiB in every environment, from a quarter vCPU and 512
  MiB, about $18.02 a month more in production (two web tasks) and $9.01 more in staging and in dev (us-east-1
  on-demand Fargate prices, to be read again on AWS's pages before they are relied on, O12); the consumer stays one task
  of 2 vCPU and 4 GiB with three threads. The review round found the web's quarter vCPU the largest share of the worst
  time: three 11-MB uploads at once reached the queue after 14.6 to 16.0 s on it (CI 15.2 s) and after 6.9 s on half a
  vCPU, and S4's three worst times fell from 46.2, 40.0 and 39.3 s to 38.0, 34.6 and 37.6 s (the process runtime,
  indicative only). CI's run on 7abb99c (job 120130643798), before this size, measured a worst of 46.0 s (S4-1 and
  S4-3). Only if CI's worst time is still above 44 s with the larger web do a consumer of 4 vCPU and 8 GiB and GitHub's
  8-core runner go back to the founder; the 48-s line and the 44-s question do not change. *Built:* `compute.web` in
  `infra/lib/environments.ts` (`cpu: 512, memoryMiB: 1024`), which the capacity harness reads for the web it measures,
  and which the launch check holds a report's web to. The web's command sets no heap flag: Node 24 sizes V8's heap from
  the container's memory limit (a 560 MiB heap limit at 1 GiB, 259 MiB at 512 MiB, measured), so the heap follows the
  task.
- **The launch value:** the CDK app computes `ScreeningLaunch` at synthesis from the release's capacity report with
  `launchCheck()` against the ECR images the stack deploys, and refuses a value passed by hand (Decision 13, bound to
  both images, below; docs/runbooks/deploy-and-rollback.md, steps 3 and 4).
- **The wording (Q12):** approved by the founder as written; counsel confirms it before the screening opens (O4). The
  "sent" alert (`apps/web/src/lib/screening/sent.ts`, `SCREENING_SENT_WAIT`):
  - `soon`: "We have your file. The result is emailed to the address you gave as a link, usually within a minute of
    when you sent it."
  - `minutes`: "We have your file. Other screenings were ahead of it when it arrived, so the result, emailed to the
    address you gave as a link, can take a few minutes."
  - `waiting`: "We have your file. It is screened after the files sent within today’s limits, so the result, emailed to
    the address you gave as a link, can take longer than usual."
  - `sent`: "We have your file. The result is emailed to the address you gave as a link."

  The result email (`apps/worker/src/screening/message.ts`, `SCREENING_WAITED`), one line for a waiting-tier upload:
  - `account_share`: "It waited behind other screenings because, with it, your email address or its organization had
    sent more than one day’s share of rows for screening that day."
  - `daily_cap`: "It waited behind other screenings because the screening had reached its limit for that day."

### Owner rulings (2026-10-23)

The founder, Tyler Williams, ruled three times on 2026-10-23 on the capacity test's runner and its time verdict: first
"Stay free: median of 3" (about 03:05 UTC), then, when the median of three failed on the free runner too, "8-core runner"
(about 08:30 UTC, asked about 04:45), which replaced the first ruling's choice of runner and kept its median of three, and then, when the
8-core runner could not be had without an organization, "Free: time advisory", which replaces the second ruling's
runner, keeps the median of three in both modes, and makes the time advisory on pull requests and binding at
production's launch.

**The first ruling: "Stay free: median of 3".** The capacity test measured the same code twice on GitHub's free 4-CPU
runner: S4 (three worst-shape uploads at once and
a small one behind them) at 38.3, 37.6 and 35.3 s on 19aa09c, a pass, and at 51.4, 51.4 and 45.2 s on 54ec890, the
founder's commit of the domain model's approval line, a fail; the second runner was slower throughout (the release
loaded in 262 s against 219 s). The cause is the runner, not the consumer: the harness's layout of the time put
Postgres, the harness and Chromium on CPUs 0-1 and the consumer on 2-3 with the web and the platform on CPU 3, a
contention production does not have, which swings with the host's speed. Asked whether to move the
measurement to GitHub's 8-core larger runner (about $44 a month), the founder, Tyler Williams, ruled on 2026-10-23:
"Stay free: median of 3".

- **What it does:** the capacity workflow and the release's capacity job keep the free 4-CPU runner (replaced by the
  second ruling, below). S4 runs three times
  in every capacity run (S4#1, S4#2 and S4#3, each as S4 always ran: a cold Postgres, restarted with its page cache
  dropped, then web, platform and the consumer fresh; the same uploads from the same ZIPs, each run's under practice
  names and addresses of its own, so none replaces another). The runs are ordered by their worst upload's time to
  email, the small one included (one never emailed counts as the slowest; until the verification of PR 6b-3's capacity
  changes they were ordered by their worst large upload, so two runs whose small upload alone was above 48 s could
  pass), and S4's time verdict is the middle run's: its four uploads, the small one included, against the 48-s line, and its worst time against the 44-s sizing question, which the gate's
  warning and the launch check's note carry. Every other scenario's time is judged as before, on its one run.
- **What it does not do:** it excuses no other check. Correctness (the oracle comparisons as before, row counts,
  nothing pending, no `ENGINE_ERROR`, nothing stalled, every run emailed, the result pages), queue order, the slots used
  at once, no waiting tier, the platform pricing none, the time metric within its bounds, no OOM kill or restart, the
  cold start and the limits applied hold in all three runs. The 48-s line, the 44-s question and every other verdict are
  unchanged; two runs of three above the line still fail. It still measures the runner's contention, which production
  does not have: the median takes the host's swing out of S4's verdict, not the contention out of the measurement.
  GitHub's 8-core larger runner, with Postgres, the consumer, the web, the platform and the harness each on CPUs of
  their own, remained the option that measures production's layout, and the second ruling took it.
- **Built:** `tools/screening-capacity/scenario-runs.ts` (`REPEATED_SCENARIO`, `REPETITIONS`), `uploads.ts` (S4's three
  runs), `report.ts` (`repeatedScenario()`, the verdict, `worstTime()` and the summary's line naming every run's times
  and the middle run, which the harness also logs), the report `tp-screening-capacity/5` (each of S4's runs a scenario of
  its own with its repetition, and `repeated`), and `launch-check.ts`, which reads the middle run again from the
  measurements, refuses a report naming another, and refuses `tp-screening-capacity/4` as any older format. The two
  more runs take about 3 minutes (CI's S4 took 59 s on 19aa09c and 78 s on 54ec890 from its cold restart to S5's
  start), so both capacity jobs' timeouts went from 90 to 100 minutes; the harness's deadlines (60 and 70 minutes)
  stay. Test matrix SCR-08; docs/runbooks/screening-capacity.md, "S4's three runs".

**The second ruling: "8-core runner"** (its runner replaced by the third ruling, below). The median of three failed on
the free runner as well: on 35bcc56, the commit
that built it, S4's three runs measured 52.8 to 56.9 s (the middle run, S4#2, 56.2, 55.6 and 55.3 s), with every
correctness check holding in all three, and the release loaded in 270 s. The free runner's times followed the host's
speed: the same code's S4 worst was 38.3 s with the release loaded in 219 s (19aa09c), 51.4 s at 262 s (54ec890) and
56.9 s at 270 s (35bcc56), 38 to 57 s, and the three runs of one capacity run share one host, so their median cannot
take a slow host out. Asked to choose between GitHub's 8-core larger runner (about $44 a month), the free runner with
the pull request's time reported as a warning and enforced only at decision 13's launch gate, and the 8-core runner with
a larger consumer, the founder, Tyler Williams, ruled on 2026-10-23: "8-core runner".

- **What it does:** both capacity jobs (`.github/workflows/screening-capacity.yml`'s `capacity` and `release.yml`'s
  `capacity`) run on GitHub's 8-core larger runner, `runs-on: paidwhole-8core` (Linux x64, Ubuntu 24.04, 8 cores and
  32 GB, created by the founder in the organization's Actions runner settings, its runner group allowing public
  repositories; GitHub offers larger runners to organizations on its Team or Enterprise Cloud plan, and this
  repository's owner is a personal account today, so an organization on such a plan owns it first); every other job, the
  gate included (it only reads the result), stays on `ubuntu-24.04`. The harness
  measures production's layout, every service on CPUs of its own: Postgres on 0-1 (db.t4g.medium's 2 vCPU), the
  consumer on 2-3 (`compute.screening`'s 2 vCPU), the web on 4 and the platform on 5 (each its quota within its own
  CPU), and the harness, its child processes and Chromium on 6-7, derived from `environments.ts`'s sizes
  (`limits.ts`, `cpuNeeds()` and `cpuLayout()`), so the contention of the free runner's layout, which production does
  not have, is out of the measurement.
- **What it keeps:** the median of three (the first ruling's S4 verdict, every other check in all three runs), which
  costs about 3 minutes a run and guards against what noise the larger runner's host still has; the 48-s line; the
  44-s question; every verdict's meaning. If the middle run's worst time is still above 44 s on the 8-core runner, the
  4 vCPU and 8 GiB consumer goes back to the founder, as the ruling of 2026-10-22 agreed.
- **Cost:** GitHub bills a larger runner by the minute, public repository or not: about $0.032 a minute for 8-core
  Linux, about $44 a month by the design's estimate (about 1,375 runner minutes), in place of the 4-core larger
  runner's $22 that Q1 (d) planned once the repository is private (PRD 19; the price to be read again on GitHub's
  pricing page before it is relied on, O12).
- **Built:** `runnerTooSmall()` requires 8 CPUs and names each service's need; `--print-harness-cpus` prints 6-7; the
  report, `tp-screening-capacity/6`, records the layout (`expected.layout`) and the CPUs the harness ran on
  (`harnessAffinity`); the verdict fails a layout in which two services share a CPU, a container on CPUs other than its
  own, and a harness not on its own; the launch check refuses a report measured on any layout other than the one this
  checkout derives from production's settings, and `/5` (the free runner's shared layout) as an older format, because
  decision 13 opens production only on a measurement of production's layout. `.github/actionlint.yaml` names the
  runner's label, which actionlint does not otherwise know. Until the founder creates the runner, the capacity job
  waits in GitHub's queue and the gate does not pass (docs/runbooks/screening-capacity.md, "The 8-core runner").

**The third ruling: "Free: time advisory".** The 8-core runner could not run: on 273b28d both capacity jobs named
`paidwhole-8core` and the measuring job stayed queued, because GitHub's larger runners exist only for organizations on
GitHub Team or Enterprise Cloud, and this repository's owner, PureTideWater, is a personal account (GitHub's API gives
its owner type as User); every other check on the pull request was green, the domain model's approval included. On the
free runner the same code's S4 had taken 38.3, 51.4 and 52.8 to 56.9 s, following the host's speed and the shared-CPU
layout, and every correctness check held every time. With no organization and no cost, the founder, Tyler Williams,
ruled on 2026-10-23 (the third ruling that day, replacing the 8-core runner): "Free: time advisory".

- **What it does:** both capacity jobs run on GitHub's free 4-CPU runner again (`runs-on: ubuntu-24.04`), in the layout
  every run had before the 8-core ruling: Postgres, the harness and Chromium on CPUs 0-1, the consumer on 2-3, and the
  web and the platform on 3, the consumer's last (`limits.ts`, `sharedLayout()`); a runner of eight CPUs or more still
  gets CPUs of their own (`ownLayout()`), derived the same way, and the report says which ran. `.github/actionlint.yaml`,
  which named the 8-core runner's label, is gone. The harness takes a time mode from the workflow (`--time-mode`, with no
  default) and the report records it (`timeMode`). `screening-capacity.yml` (pull requests, the build branch, the weekly
  and requested runs, never a release) runs **advisory**: the time verdicts (the 48-s line, S4 judged on its middle run
  of three, the 44-s sizing question) are computed, printed and annotated as before, but as warnings
  (`verdict.timeWarnings`, `::warning title=Time (advisory)::`), handed to the gate, which prints them again and passes;
  every other check fails the job as before. `release.yml`'s capacity job runs **binding**: a time above the line fails
  it, as every check does.
- **Where the time still binds:** at production's launch (decision 13). The launch check accepts only a binding report
  that passes with time enforced, read again from its measurements in binding mode whatever mode the report records
  (S4's middle run of three included), on the tag's commit and both images' config digests; it refuses an advisory
  report whatever its verdict, naming the mode, and accepts the free runner's layout, where the release now measures. As
  this ruling was first built it also accepted CPUs of their own (an 8-CPU runner's) and any report recording
  `binding`; since the verification of PR 6b-3's capacity changes (below) it accepts only the layout the release's
  runner gives and only the release's attested report. The report was `tp-screening-capacity/7`, and is `/8` since that
  verification; every older format is refused.
- **What it does not do:** it loosens no other check. The oracles, the row counts, nothing pending or stalled, every
  upload emailed and its result pages open, the queue order, the slots used at once, no upload in the waiting tier (the
  account's share and the day's cap), the platform pricing none, the time metric within its 2-s bound, the limits and
  cold starts applied, memory under 90% of each limit, no OOM kill or restart, all still fail a pull request's job, in
  each of S4's three runs. The 48-s line, the 44-s question and the median of three are unchanged in both modes. What it
  gives up: a pull request no longer blocks on time, so a slowdown can merge unnoticed, a warning on its checks aside,
  until a release is measured; a release whose run fails on time still pushes its images (a security fix must ship) but
  cannot open production's screening, so a slowdown found then holds the launch until it is fixed. The free runner's
  shared CPUs still put a contention production does not have into every measurement, the release's included, so a
  binding run can fail on the host's speed rather than the code's; the median of three takes some of that out, not all.
- **The faithful option:** GitHub's 8-core larger runner, each service on CPUs of its own (the second ruling), remains
  the measurement of production's layout once an organization on GitHub Team owns the repository
  (docs/runbooks/screening-capacity.md, "The 8-core runner"); the harness already takes its layout, and the launch
  check takes it once `RELEASE_RUNNER` moves with the release's runner (it refuses it until then: the verification of
  PR 6b-3's capacity changes, below).
- **Cost:** none while the repository is public, where GitHub's standard runners are free. PRD 19's consumer line goes
  back to $149 (2 × $74.50) from $193 ($149 + $44), and its totals to $1,361 to $2,021 at ten customers, its rows'
  sums ($82 + $149 + $155 + $130 + $45 + $50 + $750 and $82 + $149 + $155 + $130 + $45 + $160 + $1,300; the totals
  stated before were $15 and $5 above them, a gap carried from the original plan's rounded $1,200 to $1,850, which the
  verification of PR 6b-3's capacity changes found), and $2,376 to $3,576 at fifty ($177 + $149 + $420 + $200 + $180 +
  $250 + $1,000 and $227 + $149 + $470 + $250 + $180 + $800 + $1,500), PRD 15's monthly cost with them. Once the
  repository is private its standard runner has 2 CPUs, which the harness refuses as too small, and the capacity test
  needs a 4-core larger runner (about $22 a month), which itself needs an organization on GitHub Team.
- **Built:** `limits.ts` (`sharedLayout()` and `ownLayout()`, `cpuLayout()` choosing by the runner's CPUs,
  `runnerTooSmall()` requiring the shared layout's 4 CPUs and naming each need), `env.ts` (`layoutDepartures()`: the
  shared layout's two harsher departures recorded again), `report.ts` (`TimeMode`, the verdict's `timeWarnings`, the
  layout read again from the report's own limits, `jobResult()` for the job's exit code, annotations and outputs),
  `run.ts` (`--time-mode`), `launch-check.ts`, both workflows and `tools/test/workflows.test.ts`; test matrix SCR-08 and
  SCR-20; docs/runbooks/screening-capacity.md, "Time advisory and binding".

### The verification of PR 6b-3's capacity changes (2026-10-23): only the release's attested report opens production

An independent verification of the third ruling's build, at `848841b`, found that decision 13's "the release's report"
was not enforced: the launch check verified a report's format, mode, measurements, commit, image digests, the web, the
platform and the consumer, and the layout, but never where the report came from. Anyone could run the harness with
`--time-mode binding` on a machine of their own (an 8-CPU one got the layout of CPUs of their own, which the check
accepted), on the release's images and the tag's commit, pass the 48-s line on a faster CPU than GitHub's runner, which
that line is calibrated to while the runner-to-Fargate factor is unknown, and open production with it. A report edited
by hand passed too: `expected.screening`, `expected.screeningTasks` and `expected.postgres` could differ from
production's with no refusal, and a scenario other than S4 given a repetition escaped time judgment. A re-run of the
release's capacity job replaced the release's report and recorded no attempt. Fixed at the root, under the standing rule:

- **Provenance, signed:** `release.yml`'s report job attests `screening-capacity.json` with
  `actions/attest-build-provenance` (pinned to its v4.2.2 commit, read with `git ls-remote`) and keeps the attestation's
  bundle as the release asset `screening-capacity.sigstore.json` beside the report. Only that job has `id-token: write`
  and `attestations: write`, and it runs nothing but the attestation and `gh`, never the code it measured. Sigstore's
  certificate, issued from GitHub's OIDC token, names `release.yml` at `refs/tags/<tag>`, the repository, the commit,
  the event, a GitHub-hosted runner and the run and attempt; the signature is in Sigstore's public transparency log and
  the repository's attestations. Artifact attestations are free for a public repository.
- **Provenance, verified:** the deploy names the bundle (`-c tp:launchAttestation=<screening-capacity.sigstore.json>`,
  with `tp:launchReport` and `tp:launchTag`, all three together), and the CDK app, through an injectable reader as for
  the images' digests, runs `gh attestation verify` on the report with that bundle, `--repo
  PureTideWater/PhysicalTherapy`, `--signer-workflow PureTideWater/PhysicalTherapy/.github/workflows/release.yml`,
  `--source-ref refs/tags/<tag>`, `--source-digest <the tag's commit>`, `--deny-self-hosted-runners` and SLSA
  provenance, then reads gh's verified result again with every field exact (gh compares some without case or by
  prefix): the statement names the SHA-256 of the bytes the check read, the signer and build signer are release.yml on
  the tag, the source is this repository at the tag's ref and commit, the runner GitHub-hosted, the event a push, and
  the run the one the report records. A refusal names gh's reason.
- **Provenance, recorded:** the harness records `GITHUB_WORKFLOW_REF`, `GITHUB_RUN_ID` and `GITHUB_RUN_ATTEMPT` in the
  report (`workflow`; `tp-screening-capacity/8`), and the launch check requires the ref to be the tag's release.yml and
  names the run and the attempts that measured and attested it in its note, beside the attestation (defence in depth).
  A re-run is named as one; every attempt's attestation stays on record.
- **The release runner's layout only:** the check accepts the layout the release's runner gives (`RELEASE_RUNNER`,
  `ubuntu-24.04` and 4 CPUs: the shared one) and refuses CPUs of their own until a release measures on 8 CPUs;
  `tools/test/workflows.test.ts` holds release.yml's runner to `RELEASE_RUNNER`.
- **Every declared size:** the check holds every expected size production declares to what the harness derives from
  production's settings (`productionLimits()`): the web and the platform, each consumer task's vCPUs and memory and
  their number, Postgres's vCPUs and memory on the release layout's CPUs, the storage's baseline, and the consumer's
  tasks, vCPUs, memory and concurrency.
- **Every scenario judged on time:** a scenario is one of S4's three runs only when its name, scenario and repetition
  agree (S4#1 to S4#3); every other is judged on time whatever repetition it records.
- **S4's order:** S4's runs are ordered by the worst of all four uploads, the small one included, so two of three runs
  with an upload above 48 s fail whichever upload it was (ordered by the large uploads alone, the probe S4#1 at 30 and
  50 s, S4#2 at 35 and 30 s, S4#3 at 40 and 50 s passed). The 48-s line, the 44-s question, the founder's time-advisory
  ruling and every correctness verdict are unchanged.
- **What it does not prove:** that the code which measured is honest. It proves which workflow run wrote the report:
  the tag's own code with its locked dependencies, on a tag only the founder creates and no one moves (the release-tag
  rulesets). Nor does it bind a deploy made outside the CDK app: whoever holds production's deploy credentials can set
  the task's environment directly, which the account's access controls and CloudTrail govern.
- **A private repository:** artifact attestations for a private repository need GitHub Enterprise Cloud. Making the
  repository private needs this revisited first (open item O15), or the release's reports go unattested and production's
  screening cannot open.
- **Built:** `release.yml` (the report job's attestation and permissions), `report.ts` (`workflowRun()`, the format,
  S4's order, `judgedOnTime()`), `run.ts`, `launch-check.ts` (`RELEASE_REPOSITORY`, `RELEASE_WORKFLOW`,
  `RELEASE_RUNNER`, `verifyReportAttestation()`, the attestation and size checks), `infra/lib/screening-launch.ts` and
  `infra/lib/app.ts` (`tp:launchAttestation`), their tests and `tools/test/workflows.test.ts`; test matrix SCR-08 and
  SCR-20; docs/runbooks/screening-capacity.md, "The launch check (decision 13)" and "Provenance"; the deploy runbook,
  steps 3 and 4.

### The consumer, as built

`WORKER_JOBS=screening` (`apps/worker/src/main.ts`, `config.ts`) runs the screening's queues alone, with
`SCREENING_DATABASE_URL` (the login `tp_screening_login`, which may only `SET ROLE tp_screening` and holds nothing of
its own) and pg-boss's own login, and refuses the application and operator logins; the practice and platform services
refuse the screening login. `tp_screening` holds EXECUTE on the nine pricing functions and `operator_screening_queue()`
alone; `tp_operator` keeps the nine for one release and loses them in the next schema pull request (O10). The main
thread holds pg-boss, the job heartbeats, the worker heartbeat and the sweep; three long-lived worker threads
(`screening/threads.ts`) each price one run at a time with `priceScreeningRun()` unchanged, through their own
connections, mail sender and release cache. Each of the four holds at most 896 MiB of old generation
(`--max-old-space-size=896`, #31's explicit limit): Node gives a worker thread its process's flag whatever its
`resourceLimits` ask (measured on Node 24), so the design's 512 MiB main heap with 1,024 MiB threads would have held
every thread to 512; one limit of 896 keeps the design's sum, 3,584 MiB, under 90% of the task's 4,096, and a thread out
of memory fails alone: its job fails, it is replaced, and its run is claimed again. A thread that fails logs its code
(`screening thread failed`). `screening_price` leaves the platform's jobs (the queue's name is unchanged, so queued jobs
move with no copy); a run in the waiting tier goes to `screening_price_waiting` instead, which the consumer works with
one thread fewer than it has, and its pool never gives a waiting run the last idle thread, so the waiting tier never
holds all three and a normal upload that arrives meanwhile starts at once (pg-boss never preempts a job it is working;
the review of 2026-10-22). Both queues and their jobs carry pg-boss's 60-second heartbeat (`updateQueue` at the
consumer's start, since `createQueue` leaves an existing queue as it was, and on every send; pg-boss copies it onto a
job when the job is queued, so a job queued before the consumer first started has none and falls back to pg-boss's
15-minute expiry for that one deploy window), a run is stale after 2 minutes without progress (`progress_at`, moved
forward by the claim and every recorded batch), and a minute's `screening_sweep` sends due runs again at their priority
instead of pricing them, so a dead consumer's run is priced again in about 3 minutes. Graceful stop waits 110 s under
the service's 120-s stop timeout.

**Queue order (Q7).** `submit_screening()` keeps on each run when the web began receiving the upload (`received_at`,
clamped to the last ten minutes), the rate limiter's keyed subject of the screening bucket's account
(`screening_run.rate_subject`, the HMAC the web computes; the account itself never reaches the database), its tier
(`wait_reason`: `account_share`, `daily_cap` or none) and pg-boss priority (`queue_priority`), by two sums over the UTC
day's uploads (`screening_queue_tier()`, `screening_wait_limits()`), read from `screening_queue_tally`: one append-only
entry per accepted upload (the keyed subject, the row count and the tier, nothing else), written beside the run, read by
no role, and deleted by the expiry once the UTC day after its own has ended. The cap counts the normal tier only, so one
firm's surplus does not use up everyone else's protection. No lock is taken for the sums, since a lock would serialise
every 50,000-row insert behind the next: concurrent submissions can overshoot the share or the cap by what is in flight
at once, a few files. pg-boss takes jobs by priority, then age; `operator_screening_due()`, the queue gauge and
`screening_wait()` order the same way, and the web tells the prospect which of the four states applies. A later
screening of the same practice or contact address replaces an earlier one and deletes its run, but not its tally entry,
so a replaced upload still counts toward its account's share and the day's cap: summed over the runs that remained (as
first built), one mailbox resubmitting 50,000-row files never passed its share and the cap never counted them (the
review of 2026-10-22).

**What the prospect is told (Q12, as changed by the review of 2026-10-22; approved by the founder on 2026-10-22, and
for counsel to confirm before the screening opens).** The
"sent" page has four states, read from the `wait` the web puts in the redirect: `soon` (a thread was free for it when it
arrived), `minutes` (the runs being priced and those ahead of it filled every thread), `waiting` (the waiting tier, for
either reason) and `sent` (no claim at all: the fallback for a missing or unknown `wait`, and what the web shows when
its read of the wait fails after the run is stored). The page gives one neutral sentence for both waiting tiers, never
the reason: the reason (over the account's share, or the day's cap) is in the emailed result alone, which reaches only
the mailbox's owner, since an "account" sentence on the page would tell anyone who types an address at a domain that the
domain's organization screened over 100,000 rows that day. No state says "right now" or "busy", which a reload or a
bookmark would make false. Each new sentence is in PR 6b-3's description word for word.

**Metrics.** `screening result emailed` with `elapsed_ms` from `received_at` until the send returned and the completion
committed (TimeToEmailMs, alarmed above 60 s); `screening result emailed after waiting`, with the tier's code, for a
waiting run, outside that alarm; `screening queue` with the normal tier's queued runs and its oldest wait
(OldestQueuedMs); the heartbeat; and the failure lines. `received_at` is the web proxy's stamp (`src/proxy.ts`,
`x-tp-received-at`), written when the request's headers arrive, before Next reads a server action's body, and always
over any copy the client sent, so no browser moves the start of its own measurement; as first built it was taken at the
handler's start, after Next had parsed the up-to-11 MB body, and under S4 on CI it missed 3.2 to 3.9 s of the web's
share (the review of 2026-10-22).

**The release read.** One copy of a release's shared types per thread (three small copies, 2,184 records each in the
scale release; #31's "one copy per release" as three, measured and accepted, not a founder question). The shared read
(`operator_screening_release()`) enumerates the release's record types by a loose index scan of `rule_record_by_type`
and reads each type but the six keyed ones (`pfs_rvu`, `ncci_mue`, `mppr_rate`, `ncci_ptp`, `locality_map`,
`locality_map_plus_four`) by the index, so it never scans `rule_record` (the earlier filter planned a parallel
sequential scan of the whole table, 705 ms warm for 2,184 rows and about 13 s cold on gp3); a plan test holds it. The
keyed-record cache is not built: the keyed read measured 2.3 to 3.8 s for the worst shape, and the promise is sized on
a cold cache. The keyed read probes `rule_record_identity` per key whatever the statistics say:
`operator_screening_run_keys()` is estimated at its one row (`ROWS 1`; at the default 1,000 the planner reckoned 43,000
wanted keys and, with no statistics on a release just loaded, hash-joined all 2.2 million records), and the release
loader runs `VACUUM (FREEZE, ANALYZE) rule_record` once a load commits, so the first screenings after a load neither
plan without statistics nor set every page's hint bits. CI's first capacity run on PR 6b-3 met both in S1, its first
scenario after the load: S1-1 recorded no batch for five minutes.

### Capacity under production limits, as built

The harness (`tools/screening-capacity`) runs the consumer as production will: a `screening-1` container from the worker
image with `WORKER_JOBS=screening`, `SCREENING_CONCURRENCY=3`, the screening and queue logins only and the production
command with its 896 MiB heap, at `compute.screening`'s 2 vCPU and 4,096 MiB, beside a platform container that prices no
screening (a run the platform's log shows priced fails the job). On GitHub's free 4-CPU runner, where both capacity jobs
measure (the founder's third ruling of 2026-10-23), Postgres gets db.t4g.medium's 2 vCPU on CPUs 0-1, which the harness,
its child processes and Chromium share, the consumer its 2 on 2-3, and the web and the platform the consumer's last CPU
(each its fractional quota inside it; the web at production's half vCPU and 1 GiB read from `compute.web`, the founder's
ruling of 2026-10-22): two harsher departures, which swing S4's times with the host's speed; a runner with fewer than 4
CPUs is too small. A runner of eight CPUs or more gives every service CPUs of its own, as production has them (Postgres
0-1, the consumer 2-3, the web 4, the platform 5, the harness 6-7), all derived from `environments.ts`'s sizes, and the
report records which layout ran. Time is enforced (`HARNESS_RUNS_SCREENING_CONSUMER`): every upload of every scenario,
the small ones included, is judged against 48 s on the runner, S4's on the middle of its three runs (the founder's
ruling of 2026-10-23, Owner rulings (2026-10-23) above); a time above the line fails a binding run (a release's) and is a
warning in an advisory one (every other run's, the third ruling). The report (`tp-screening-capacity/4`, `/5` since the
first ruling of 2026-10-23, `/6`, with the layout, since the second, `/7`, with the time mode and the layout's kind,
since the third) names the consumer as measured (tasks, vCPUs, MiB, threads) and both image IDs, and fails a
consumer measured at another size, its three threads not pricing S4's and S5's large uploads at once, an upload in the
waiting tier (every scenario upload is a prospect of its own, at a domain of its own, so none crosses a share), and the
consumer's time-to-email line missing or out of its bounds: never above the time from the harness's click on "Screen the
file" to the line itself (the metric starts at the web's receipt, as the proxy stamps it, after the click and the POST,
and is logged once the completion commits), never more than 2 s below the harness's time (the browser's send and the
transfer before the receipt), which proves the metric covers the web's share and the send. The harness times each upload
from that click, not from Playwright's request event, which reaches the harness after the POST has left: with the
receipt stamped at the POST's headers, the web received S1-1's POST in the local smoke run 81 ms before the harness
heard of it, and the logged time came out above the harness's. The process runtime's layout holds what the worker image
installs beside its bundle (`node_modules/playwright-core` at the pinned version), and the harness stops with
`PROCESS_IMAGES_INCOMPLETE` when it is missing. With a web image built for a static host, the harness's browser is
served `/_next/static/` from the web container and fails any other request for that host. Two harness defects found by
the design are fixed: the small upload is sent once the large uploads' pg-boss jobs exist, not their runs (a quarter-CPU
web could queue the small one first), and the process runtime execs every service under `taskset -c <its cpuset>`,
because under cgroup v1 a process that joins a cpuset keeps only the overlap with the affinity it inherited from the
pinned harness (three pricing processes ran on one CPU). A worst time above 44 s, within 8% of the line, is reported in
the summary and the report as a sizing question for the founder before merge (O9), never as a pass to rely on or a wider
limit. The design's measurements on a 4-CPU machine (S4's worst 41.1 s with three processes in a 2-vCPU pool; memory
1,119 MiB of 4,096) are indicative: they used a process stand-in for the threads whose hooks were not kept, and the
queue-order race made their verdicts fail. PR 6b-3's first CI capacity run, with the real threads, is the measurement of
record.

**Decision 13, bound to both images.** The release builds, scans and measures the worker image and the production web
image (with production's static origin) exactly as it pushes them, attests the report in the same run, and keeps the
report, its SHA-256, its summary and the attestation's bundle as assets of the tag's release. The launch value is
computed, never typed (the founder's ruling of 2026-10-22): production's deploy names the report, the bundle and its tag
as context (`cdk deploy tp-production -c tp:launchReport=<file> -c tp:launchAttestation=<bundle> -c tp:launchTag=<tag>
--parameters ImageTag=<tag>`), and the CDK app (`infra/lib/screening-launch.ts`) runs the launch check
(`tools/screening-capacity/launch-check.ts`, `launchCheck()`) at synthesis on the images the stack deploys,
`<WebRepositoryUri>:<tag>` and `<WorkerRepositoryUri>:<tag>` in the deploy's account and region, each read by its
manifest in ECR (the copies ECS runs), and on the report's attestation as `gh attestation verify` checks it against the
bundle. It gives `<tag>:<the report's SHA-256>` only for the binding Docker-runtime report `release.yml` measured on the
tag and attested in that run, of the tag's commit (an advisory report, whose time only warned, is refused whatever its
verdict: the founder's third ruling of 2026-10-23; a report measured anywhere else, or edited, carries no attestation of
that run and is refused: the verification of PR 6b-3's capacity changes) that passes with time enforced (as recorded and as this checkout's `verdict()`
reads its measurements again in binding mode, S4's time on its middle run of three, the middle run the report names
being the one its measurements give), on
both images by config digest (the report's IDs, `docker image inspect -f {{.Id}}` on the release runner's
classic overlay2 image store, where an image's ID is its config's SHA-256, against the `config.digest` of each image's
manifest in ECR, an index resolved to its linux/amd64 manifest; nothing is pulled, so the deployer's image store does
not matter, and the containerd store's `{{.Id}}`, a manifest's digest, is never read: the verification of PR 6b-3), with
every size production declares as the harness derives it (the web, the platform, each consumer task and their number,
Postgres and the storage) and the consumer production declares, on the layout the release's runner gives, the free
runner's shared CPUs (the founder's third ruling of 2026-10-23; CPUs of their own refused until a release measures on
8 CPUs);
the stack writes it into the web's `SCREENING_LAUNCH` and its `ScreeningLaunch` output, and its rule
`ScreeningLaunchImageTag` refuses the deploy unless `ImageTag` is that tag. A refused report stops the synthesis, naming
decision 13 and each reason; a deploy with no report closes the screening, since context holds for one invocation and
nothing carries over. No stack declares a `ScreeningLaunch` parameter, so CloudFormation refuses one passed with
`--parameters`, and the app stops on context that would set it by hand (`-c ScreeningLaunch`, `-c tp:screeningLaunch`),
naming decision 13. The consumer runs whenever the deploy carries a launch value (the condition
`ScreeningConsumerRunning`, now settled at synthesis: released, and either `ScreeningConsumer=running` or a launch
value). Run on its own, `launch-check.ts` previews the value. The web opens production's screening only when
`SCREENING_LAUNCH` names the image tag it runs. Staging and development are not gated. *As first built* the check
printed the value for a `ScreeningLaunch` parameter the deployer passed; the stack checked its form and the web its tag,
but neither could tell a printed value from one typed by hand.

**The required check.** Every pull request runs the workflow; its `changes` job reads the changed file names, and the
`screening-capacity gate` job passes at once when none is watched and otherwise only when the measurement passed every
check but time, which is advisory there and whose warnings it prints again (the founder's third ruling of 2026-10-23);
it fails when the paths cannot be read or the measurement failed, timed out or was cancelled, and it runs even when the
run is cancelled (`always()`: a job skipped by its condition counts as passing a required check). The watched list
(`tools/screening-capacity/watched-paths.txt`) is derived, not kept by hand: the import closure of the worker's and
the web's screening entry points and the harness, and the files no import reaches (the Dockerfiles, the web's Next
config, the manifests and the lockfile, the migrations, the workflow); a unit test holds the committed list equal to
what `watched.ts` derives, and the changes job reads it from the base and the head as data. A run whose worst time is
above 44 s (S4's from its middle run) posts a warning annotation and the gate prints the sizing question, so it shows on
the pull request's checks. A path filter on the trigger would leave a required check pending on every other pull request.

## Amendment (ADR 0066, Part 2): the release restores no cache, so the attested report depends only on its own run

Decision 13's binding report is measured by `release.yml`'s capacity job on the release's own images and attested as
that workflow's on the tag. Until 2026-10-26 that job restored three things another run could have saved: the pnpm
store (`setup-node … cache: pnpm`), the SYNTHETIC scale release (`actions/cache/restore`, keyed on
`packages/synth/src/release/**`, `tools/release/scale.ts`, `packages/rules/src/**` and release 900001's directory, but
not on the lockfile or the generator's other imports), and, through trivy-action's default `cache: 'true'`, the
scanner's binary and its vulnerability database. A tag's run may restore caches its default branch saved, and the
founder's F1 (a) makes `claude/build-platform`, whose push runs save all of these, the default branch until launch.
So a cache hit could serve a scale release built by other code, and a scanner and database from another run, inside
the measurement and the scan the attestation vouches for.

From ADR 0066's Part 2 on, `release.yml` restores nothing:
- the scale release is built in the run from the tag's commit (about 22 s; the push run 39977565861's "Build the scale
  release" took 15:24:36 to 15:24:58 UTC);
- setup-node takes no `cache` and sets `package-manager-cache: false`, and pnpm/action-setup keeps `cache: false`, so
  the store is filled from the registry by the lockfile's integrity hashes;
- both trivy-action steps set `cache: false` and a `cache-dir` under `runner.temp`, as ci.yml's `images` job does;
- setup-buildx sets `cache-binary: false`, and no build sets `cache-from` or `cache-to`.

`tools/test/workflows.test.ts` holds release.yml to each of those inputs by name, and `tools/check-action-pins`
follows every `actions/cache*` the actions nest to the top-level input that gates it, which must be `false` in
release.yml, failing an ungated one. Its three uploads (the bill of materials, the image and the capacity report) set
`overwrite: true`, so a re-run of a failed job replaces what its first attempt left; the capacity report's provenance
is unchanged, since only the report job attests, and it attests the report its own run downloaded.
`.github/workflows/release-dry-run.yml` runs the release's build and hand-over steps on every pull request that changes
release.yml, `tools/screening-capacity/image-id.ts` or either Dockerfile, so its actions run on a pull request before a
tag ever runs them. The attested report then depends only on its own run, at about 22 s a tag.

## Amendment (PR 6b-4): the screening's mail stream

Audit #76 found the screening's result mail unfit for addresses a stranger types: one shared sender, nothing recorded
of delivery, and nothing to stop a run of bad addresses from costing the account the mail every customer depends on.
ADR [0065](0065-send-mail-in-three-ses-streams-record-each-messages-delivery-send-notices-from-an-outbox-and-pause-the-screening-stream-alone.md)
records the three streams; this records what changes for the screening, built under the founder's rulings of
2026-10-21 (Q1 (g), Q9, Q10 (a), Q11 (b) and Q12, every recommended answer accepted), with counsel to confirm the
wording before the screening opens (open item O4; `docs/product/legal-surfaces.md`, `screening-mail-paused` and
`screening-mail-address`, which keep production's screening closed until their review is recorded).

**The sender (Q12).** Results and failure notices go from `results@screening.<domain>` (display name "PaidWhole"), an
identity of its own on its own SES configuration set, with Reply-To the support address, so the screening's
reputation is its own and a prospect's reply reaches the support desk. The screening set uses no SES suppression list:
SES keeps no prospect's address.

**The cut-off (Q9; D6).** In a 7-day window since the last resume, the screening stream pauses when its permanent
bounces pass 3% of its sends (floor 200) or its complaints other than `not_spam` pass 0.08% (floor 2,500), when the
account's bounce or complaint rate reaches half of SES's review level (2.5%, 0.05%), or when SES puts the account under
review. Only a platform administrator resumes it, in the console, with a reason (the cause fixed, or a false alarm).
The other streams never pause.

**Closed while the mail cannot go (D7, D8).** `screeningOpen()` reads `screening_mail_status()`: while the stream is
paused the page is closed everywhere and says so, and `submit_screening()` refuses an upload that raced the pause
(`screening_paused`); in staging and production it is also closed until the mail path is proven (the stream sending,
SES confirmed, and a delivered and a bounced probe within 48 hours and since the last resume); development ignores
readiness, which has no probes. A run queued before the pause is neither claimed, completed nor failed while the stream
is not sending: it waits, and is priced and emailed after the resume if that is within its 30 days.

**The address checks (Q1 (g); D9).** In order, each only after the one before passes:

1. the browser, as the prospect leaves the field: a likely typo of a large mail provider's domain (within one edit, or
   two for a domain of eight characters or more) suggests the provider, and an ending that is no top-level domain in
   use warns (a snapshot of the ICANN list; `tlds.ts`); both are soft, and the prospect may keep the address as typed;
2. the server runs the rate limit and the upload's own checks, unchanged (nothing below runs for an upload they
   refuse), then repeats the browser's two hints unless the prospect kept the address;
3. DNS (the domain does not exist, has only a null MX, or has neither an MX nor an address: refused) and SES's
   validation (a LOW verdict on validity, syntax, DNS records or the mailbox: refused; a MEDIUM on validity or the
   mailbox: a warning the prospect may answer by keeping the address), together, so the added worst case is one
   2-second timeout; a timeout or an error accepts and logs a warning by code; SES is asked at most 1,000 times a day in
   production and 50 in staging (the rate limiter's global bucket `screening_validation`), then DNS alone, with
   `MAIL_VALIDATION_CAP_REACHED` paging the operator;
4. `submit_screening()`'s refusal list and bounce budget (below).

Every refused address, whatever refused it, gets one sentence, so the form says nothing about any earlier screening,
and nothing about a customer's mail, which the refusal list never holds. No log line, issue or error names the address
or its domain. The harness charges the checks' worst case on every upload, so the 60-second promise holds with them
(the plan's G1; ADR 0065).

**The delivery state (D11; the plan's D9).** A prospect's delivery state is its result mail's record (`mail_send`,
keyed to the prospect, set null when the prospect goes), not a column on the immutable prospect; PR 7 adds its read
function with the lead list.

**What is kept of a refused address (Q11 (b)).** A keyed hash (the pepper in an owner-only table no role reads) of a
screening address that bounced permanently or was reported as spam on the screening stream, kept 365 days from its
latest such outcome, used only to refuse a new screening to it. The pages say so and never call it deleted:
`REFUSED_ADDRESS_KEPT` joins the result page's notice (with no request), the closed link's page, the upload form's hint
and the "sent" alert. It is the only value derived from a screening address kept past its prospect, with the budget's
marks.

**The bounce budget (Q10 (a)).** Each run keeps, for its 30 days, the rate limiter's keyed hash of the client address
(`client_subject`, new, passed by the web as `submit_screening()`'s last parameter) beside the email account's
(`rate_subject`); a screening permanent bounce leaves a 7-day mark on each, and a subject with 3 live marks is refused a
new screening (`screening_bounce_budget`), so one client or one email account cannot close the screening for everyone.

**The wording (Q12, the recommended wording; counsel confirms it before the screening opens).** The new sentences a
prospect reads, word for word:

- the page while the stream is paused, under "New screenings are paused": "Too many of our recent result emails could
  not be delivered, so we have stopped sending them while we fix it. Screenings uploaded before the pause are kept and
  will be emailed when we resume, if that is within 30 days of the upload. Result links already sent still work.",
  then "Meanwhile, you can request an audit.";
- an upload that raced the pause: "New screenings are paused while we fix our result emails. Try again later.";
- every refused address: "We cannot send email to this address. Check it, or use another address.";
- a mailbox SES could not confirm: "We could not confirm this mailbox exists. Check the address, or keep it as
  typed.";
- a likely typo of a large provider's domain: "Did you mean @gmail.com? Check the address, or keep it as typed.", with
  the button "Use jane@gmail.com" (the message names no address, so the server's answer carries none);
- an ending one edit from a common one: "This address ends in “.cmo”. Did you mean “.com”? Check it, or keep it as
  typed.", with the button "Use office@harborpt.com";
- any other ending in no use: "This address ends in “.qqq”, which is not a domain ending in use. Check it, or keep it
  as typed.";
- the box that keeps a questioned address: "Keep this address as typed";
- the bounce budget: "Several recent screening results sent from this connection, or to this email account, could not
  be delivered, so we cannot take another screening from it for up to 7 days. Check the email address, or request an
  audit instead.";
- what is kept: "If email to the address you gave cannot be delivered, or is reported as spam, we keep a coded form of
  it that cannot be read back as the address, for 12 months, only so that we never send to it again."

**What proves it.** `apps/web/src/lib/screening/address.test.ts` and `validation.test.ts` (the hints, the DNS
verdicts, the validation table, the cap, the timeouts and the logs), `routes.db.test.ts` (paused and not ready closing
the page, one sentence for DNS, validation and the refusal list, the checks never run for an upload the row checks or
the rate limit refuse, the client subject and the budget), `packages/db/src/screening.db.test.ts` and `mail.db.test.ts`
(the refusal order, the list, the budget, the run's gate), and the end-to-end cut-off journey
(`apps/web/e2e/mail-cutoff.spec.ts`: a seventh hard bounce in a week pauses the stream, the page says so, a platform
administrator resumes it, and the screening opens once SES and the probes confirm); test matrix SCR-21, SCR-22 and
SEC-18.
