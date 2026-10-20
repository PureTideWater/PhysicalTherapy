# 0062. Screen prospects from aggregate rows without PHI, price each row with the unchanged engine, and send the result by emailed link

- **Status:** accepted
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
  units across codes), takes a five-digit ZIP (`PracticeSettings.zip`, `^\d{5}$`), stops with `ENGINE_ERROR
  locality_needs_zip_plus_four` for a ZIP whose `locality_map` record needs its ZIP+4, and stops with
  `place_of_service_unmapped` for a place of service missing from the split it is given. Nothing under
  `packages/pricing/src` may change.
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
  after it). No ZIP+4: the engine takes a five-digit ZIP alone, so a ZIP whose `locality_map` record needs its ZIP+4
  is refused (`screening_zip_plus_four`, "a free screening cannot price one yet") rather than asked for four digits
  nothing could use. This pull request keeps the refusal until PR 6b lands: the founder's ruling of 11:47 UTC on
  2026-10-18 supersedes ruling 3 and has ZIP+4 localities fixed before launch there (see Owner rulings).
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
  engine needs a split and no rule record carries one (fixtures/golden/QUESTIONS.md, Q08).
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
`locality_map`), `submit_screening()` (prospect, upload with the hash of its rows, run and every row in one call,
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
stored hashes, `locality_map` limited to the run's ZIP, only while the manifest is the one pinned and the release
is not withdrawn), rows, record, complete (`screening_completed`), fail (`screening_failed`) and expire.

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
process on a 4-CPU machine; under production's limits, see Capacity under production limits.

**The release read (audit #53 part 2; the founder's ruling of 2026-10-20).** The job no longer copies the whole
release for each ZIP. The record types no row's key selects (the GPCIs, conversion factors, the assistant and
sequestration records, the code lists and the other small types) are read by `operator_screening_release()` and held
once per release and manifest, two releases at most (`RELEASES_KEPT`; a withdrawal still evicts its entry). The five
types a line looks up by its own key (`pfs_rvu`, `ncci_mue`, `mppr_rate`, `ncci_ptp`, `locality_map`) are read for
each run, in one operator transaction: `operator_screening_run_keys()` returns the distinct codes of the run's
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
upload 1 of each production-shaped scenario in the capacity test. As built, the key set's codes are those of the rows
still to price (the database's function reads `pending` rows), so a run claimed again after a stale attempt reads only
what it still prices; the codes priced equal the key set on every attempt.

**Capacity under production limits (audit #53 part 1; the founder's rulings of 2026-10-20, decisions 13 to 16).**
`.github/workflows/screening-capacity.yml` builds the production images and runs `pnpm screening:capacity`
(`tools/screening-capacity`; docs/runbooks/screening-capacity.md). Web and platform run as containers at production's
task sizes, read from `infra/lib/environments.ts` (a quarter vCPU and 512 MiB with no swap, sharing the runner's last
CPU); Postgres 18 at db.t4g.medium's size or the runner's share of it, with gp3's I/O baseline on the device behind
Docker's data root and a 1 ms delay each way on its interface; every limit is read back before the run counts, and
the harness and Chromium run on the other CPUs. The release is the SYNTHETIC production-shaped release 900100
(`packages/synth/src/release/scale.ts` through `tools/release/scale.ts`: 2,245,245 invented records in CMS's layouts
at the sizes of CMS's public files, the full practitioner PTP table among them, built outside the repository and
loaded by the release loader with its synthetic option). The uploads are the practice shape (the large test's 50,000
rows, held equal to them) and the worst shape (50,000 distinct priced lines over at least 15,000 codes, half of them
in the reduction across codes, a tenth in a quarter whose records change), each alone and three at once with a small
upload behind them. The verdict is split. The job fails on what PR 6 controls: an OOM kill, a restart or an exit the
harness did not cause, anonymous memory above 90% of a task's limit, a limit not applied, a runner too small, a wrong
or unfinished result, a result page that does not open (each emailed link, then its last page of groups), a run that
records no batch for five minutes, or an oracle mismatch. The time from each
submission to its email is measured always and reported as "open, PR 6b" while
`environmentSettings('production').compute.screening` is absent; once PR 6b declares that consumer, a time above 48
seconds on the runner fails the job until staging measures how much faster the runner is than Fargate, and from then
on a time above 60 seconds scaled by that factor. The switch is that declaration, read from the settings the stacks
deploy, and `tools/screening-capacity/report.test.ts` proves both sides of it. The platform container runs
`NODE_ENV=test` with the local outbox, because the worker refuses the outbox in production; every `NODE_ENV` read in
the code the images load is listed in `tools/screening-capacity/env.ts`, with what it selects, and a test fails on
one not listed. Each upload comes from its own client address through one trusted proxy hop, as production's load
balancer gives it, since the screening's limit of ten an address an hour would otherwise refuse the eleventh. The
workflow runs weekly (once the default branch carries workflows), on request, on pushes to `claude/build-platform`
that touch its paths and on pull requests that touch the screening, pricing, the harness or the images; a failure
outside a pull request opens or updates one issue from a job that holds the workflow's only write permission and runs
no repository code. Its report (`tp-screening-capacity/2`) holds counts, times, limits and hashes, never a row, a link
or a token.

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
its last page.

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
  50,000, more), the sorted codes of a refusal's reasons, whether a refused upload was followed by an accepted one of
  the practice (`retried`), the release, and once priced the engine, four whole-percent shares of the file's allowed
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
  the same contact address) replaces it at that screening's own completion (`operator_screening_complete()`), carrying
  over the request of the latest summary that has one, each deletion an audit event (`screening_lead_replaced`, naming
  the request it carried). A failed or abandoned resend deletes nothing, and a refused upload replaces nothing. A
  conversion freezes the summary when the run has none, or gives it the request when it has none (decision 17: a
  different address of the same practice replaces it the same way, with a notice in the console, PR 7). The summary
  goes after its 12 months (`operator_screening_expire()`, `screening_lead_expired`), on withdrawal
  (`screening_lead_withdraw()`, PR 6e's link), or with its request (the cascade #51's deletion uses); a delete
  otherwise is refused (`screening_lead_kept`).
- `marketing_campaign`: the campaign codes the founder lists (`console_register_marketing_campaign()`, a platform
  administrator; its screen is PR 7's), append-only.
- `screening_prospect` gains `source` (the closed list of decision 8, optional), `utm_source`, `utm_medium`,
  `utm_campaign` and `paid_click` (from the attribution cookie), `referring_firm` (optional, screened by
  `textPhiFindings`), `followup_consent_sha256` (null until PR 6e captures consent) and `screening_terms_sha256` (the
  SHA-256 of the screening terms accepted, decision 19; null until the terms' wording, the founder's and counsel's,
  and its checkbox land). `screening_run` gains `first_opened_at`: set by the result page's signal
  (`screening_result_opened()`, POST `/api/screening/opened`, sent only after two seconds visible and a first
  interaction, `focusin` among them) or by the conversion, never by the link's GET, which a mail scanner also makes.
- `prospect_request` gains the same attribution, `from_screening` (set by `convert_screening()`, which now writes the
  request itself, since no later update may set it), and `declined_reason`, the closed list of decision 9, required on
  the console's decline (`not_recorded` for a request declined before the list, or by the previous image). Every new
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
`^[a-z0-9][a-z0-9._-]{0,63}$` or dropped) or a click-ID parameter, and no such cookie yet, it sets the three codes and
the kind of paid click (`paid_search` for `gclid`, `gbraid`, `wbraid` or `msclkid`; `paid_social` for `fbclid`,
`li_fat_id`, `ttclid` or `twclid`), read by presence alone, so the click ID never leaves the URL. `Max-Age` 30 days,
`Path=/`, `HttpOnly`, `SameSite=Lax`, `Secure` on https; the first visit wins. The screening and request-audit
handlers read it on the server (`src/lib/http/attribution.ts`), check every value again, and pass the four values; the
database's CHECKs hold the same shape. No script reads it, no third party receives it, and nothing logs it. The
privacy notice (#51) discloses it; counsel confirms the disclosure.

**The CO-04 amendment.** CO-04 says results "expire after 30 days (a platform job deletes them)". A screening's
result, rows and the prospect's details still do. What outlives them, by the founder's rulings of 2026-10-20: the
counts-only outcome (no end date, decision 12), and for a practice that requested an audit or consented, the
screening's totals with its practice name, ZIP, email and how it heard of us, kept with the request for 12 months from
the screening (decision 10). Every surface that deletes or collects says so in the plain list of decision 7: the
result page (and its converted variant), the email, the closed link's page, the upload form's email hint, the "sent"
alert, the request-audit form and the conversion form.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| A separate schema and role for screening (D18 b) | A second tenancy model to secure and test; the catalog test already proves the public-schema pattern. |
| Upload bytes to S3 under a platform key (D18 c) | A mistaken upload holding PHI would reach storage; a file with no practice has no practice key. |
| Price a row's visit composition (D19 c), or show a range computed outside the engine (D19 b) | Asks the prospect for what an aggregate has not got, or computes a number outside the engine. The owner's ruling 1 gets the range from the engine itself: both ends are `price()` outputs. Revisit if prospects send visit-level aggregates. |
| A fully reduced figure from a higher-valued pool code ahead of the row | Depends on which codes the release carries and their practice-expense parts at the place of service; the row's own code with one unit always ranks first by the engine's tie rule, and the second line's cut is its own whatever ranks first. |
| Compare against the engine's final amount, after sequestration | What PR 6 first did: a payer's allowed amount is normally before sequestration, so a row allowed in full looked about 3% (SYNTHETIC; 2% real) above the figure and up to that much of a shortfall was hidden. The owner's ruling 2 compares before it. |
| Ask for a ZIP+4 where the locality map needs one | The engine takes a five-digit ZIP alone (`PracticeSettings.zip`), so this pull request refuses such a ZIP. The founder's ruling of 11:47 UTC on 2026-10-18 supersedes ruling 3: PR 6b takes a ZIP+4 in practice settings and the screening and has the engine resolve the locality from it, before launch. |
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
- A ZIP whose `locality_map` record needs its ZIP+4 is refused, with the message that a free screening cannot price
  one yet, and no ZIP+4 is asked for or kept: the engine takes a five-digit ZIP alone (`PracticeSettings.zip`) and
  stops with `ENGINE_ERROR locality_needs_zip_plus_four` for such a locality, so D20's "ZIP+4 asked only where
  `locality_map` requires it" is not met by this pull request. The founder's ruling of 11:47 UTC on 2026-10-18
  supersedes ruling 3: PR 6b meets it before launch, and the refusal stays in this pull request's code until PR 6b
  lands.
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
- The attribution cookie is a cookie the proxy now sets; the privacy notice (#51) must disclose it before the
  screening opens. The screening terms' hash is null until their wording and checkbox exist; making it required needs
  a later migration or the wording before this one merges (open).
- What proves audit #57: SEC-17 at nine tables, the grants, the closed lists against `pg_get_constraintdef`, the
  bands, channel and refusal codes, the outcome's lifecycle (written at submission, refusal, completion and failure;
  shares, anomaly and difference bands; retried and superseded; fixed columns, one-way stage, flags and first open
  once; unlinked on expiry and replacement, then sealed; DELETE and TRUNCATE refused), the pair of outcomes that
  reveals no cell, the summary's freeze, sums, labels version, first open, 12 months, replacement at completion (by
  address and by ZIP and name), withdrawal, reminders, expiry and cascade, and the re-linking test
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
3. **ZIP+4.** Screening keeps refusing a ZIP whose locality needs its ZIP+4, with the clear message; an engine change is
   revisited when release 1's real locality map loads. *Built:* unchanged (`screening_zip_plus_four`).
   *Superseded at 11:47 UTC on 2026-10-18 by the founder, Tyler Williams:* ZIP+4 localities are fixed before launch in
   their own pull request, PR 6b: practice settings and the screening accept a ZIP+4, the engine resolves the locality
   from it, five-digit ZIPs and the golden lines are unchanged, and the change order's engine freeze is loosened for
   that lookup only. This pull request keeps the refusal in its code until PR 6b lands.
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
sequestration, the comparison is put to the owner again); ZIP+4 localities, in PR 6b before launch; counsel's answer
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
12 months without consent, on unlinked outcomes and the stated linkage while a summary or request is kept, and on a
different address replacing a request's summary; the terms' wording and whether their hash is required; PR 6e's
consent capture, withdrawal page and reminders; PR 7's funnel, lead list and campaign screen (a schema PR for its read
functions).

## Owner rulings (2026-10-20): the 60-second promise at production size (audit #53)

The founder, Tyler Williams, accepted on 2026-10-20 the recommended answer to every question in the PR 6 design
(decisions 7 to 19 of that day), and folded audit #53's parts 1 and 2 into this pull request. Those on the screening's
60-second promise and its test, built here (The release read; Capacity under production limits):

13. **If the speed test is red at launch:** the screening does not open until the latest capacity run on the image
    being deployed passes with time enforced. *Built:* the capacity test; time becomes enforced with PR 6b's
    declaration of the screening's consumer.
14. **Which file the promise covers:** any accepted 50,000-row file, the worst shape included. PR 6b sizes the
    screening's own consumer to that file and reports its size and monthly cost before building it, which may exceed
    the roughly $18 a month accepted. *Built:* the worst shape is measured alone and three at once, beside the
    practice shape.
15. **Where the time check draws the line:** at 48 seconds on GitHub's runner until staging measures how much faster
    the runner is than Fargate, then at 60 seconds scaled by that factor. *Built:* `TIME_ALLOWANCE_MS`,
    `TIME_PROMISE_MS` and `RUNNER_TO_FARGATE` (null until staging measures it) in `tools/screening-capacity/limits.ts`;
    `timeVerdict()` in `report.ts`: 47.9 s passes, 48.1 s fails as the allowance, 60.1 s as the promise.
16. **How PR 6 merges before its consumer exists:** the test fails PR 6 on everything PR 6 controls; time shows as
    "open, PR 6b" until PR 6b declares the consumer in `infra/lib/environments.ts`, which switches it on in tested
    code. *Built:* `timeRule()` reads `compute.screening`; `report.test.ts` holds today's settings to "open" and a
    declared consumer to "enforced".

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
the oracle's. Its only failing checks are the Postgres limits the process runtime cannot apply. The first CI run's URL
and figures are cited here once it runs.

What stays open: staging's runner-to-Fargate factor; PR 6b's consumer (its size, two screenings at a time, the row
cap and the honest message), sized from these measurements and decisions 14 and 15; the choice of a cache for keyed
records, from the keyed read's measured seconds (PR 6b); the weekly schedule, which fires once the default branch
carries workflows (audit #54); a larger runner once the Team organization exists; #31's check of the scale release's
counts against release 1's real sources.

## Revisit when

Release 1 is published (screening opens); PR 6b lands (ZIP+4 localities: the refusal here is replaced); counsel
answers on the floor (the number, whether it counts claim lines or patients, the left-out totals and the scope of one
screening a practice); the reimbursement specialist
answers Q21 (the owner's ruling 2: which figure a payer's allowed amount is compared with); prospects ask for
visit-level aggregates (the reduction across codes); or the permission matrix gains a dedicated permission for
platform pricing defaults (PR 14); counsel answers on the reworded surfaces, the attribution cookie's disclosure or
the linkage between an outcome and a kept request; the screening terms' wording lands (its hash may then be required);
PR 6e builds consent capture on the columns here; or PR 7's funnel needs read functions over the outcomes.
