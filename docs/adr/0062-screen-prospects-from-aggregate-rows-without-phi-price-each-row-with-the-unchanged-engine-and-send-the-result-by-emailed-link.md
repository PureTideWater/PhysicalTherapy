# 0062. Screen prospects from aggregate rows without PHI, price each row with the unchanged engine, and send the result by emailed link

- **Status:** accepted
- **Date:** 2026-10-18
- **Deciders:** the owner (D11 option a and D18 to D21 option a, in `docs/product/reconciliation-001.md`, approved 2026-10-17; the four rulings of 2026-10-18 below, by the founder, Tyler Williams); the build (PR 6 of Change Order 001)
- **PRD sections:** 2 (what a screening must never claim), 5 (J1, the audit request), 7 (public pages), 8 (Invariants), 11 (the engine, Medicare Advantage non-contracted pricing), 15 (Request path; links only in email), 16 (Tenant isolation; logging discipline); Change Order 001, CO-04, CO-09 (SCR-01 to SCR-06, SEC-17), CO-11 and CO-12; ADRs 0014, 0019, 0029, 0034, 0038 and 0053

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
  nothing could use; D20's ZIP+4 waits for the owner (see Consequences).
- `screening_upload`: the file's SHA-256, its row count, accepted or rejected, and the rejection reasons, which
  `screening_rejections_valid()` holds to at most 20 objects of a code, a column position, a row, a first row, a
  field and a PHI kind: never a header's text or a cell's value. No byte of the file is stored.
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
  (CPT Category I, II, III, PLA or MAAA, or HCPCS Level II: never five letters, which may be a name), at most
  100,000 claim lines, and at most $25,000.00 of allowed amount a claim line (so an identifier typed under the
  allowed total is refused, never kept as dollars).

Every row but the split expires 30 days after its upload: the reads refuse a run from its `expires_at` on, a delete
before then is refused (`screening_kept_until_expiry`), and the `screening_expiry` job deletes prospect, upload, run
and rows together, each prospect an audit event (`screening_expired`).

The application role calls `screening_status()`, `screening_zip_status()` (an invoker function over the global
`locality_map`), `submit_screening()` (prospect, upload, run and every row in one call, `screening_submitted`),
`reject_screening_upload()` (`screening_rejected`; like the submission, it records nothing while screening is
closed), the four reads by token hash (`screening_result_summary`, which also says whether the run's release has
since been withdrawn, `_groups`, `_coverage`, `_rows`, every figure a bigint sum in SQL), `convert_screening()` (a
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
problems a file has, with how many there were. The page reads the file locally, hashes it, and sends the hash, the
header's canonical column names (never the text typed), the row count and the canonical rows to a server action;
the file input has no name. The server checks the form's fields, the header names and every row again; a refusal is
recorded by hash, count and coded reasons, and its messages name a column by position and kind ("Column 4 holds
member IDs; remove it and upload again"), never a header or a cell, and tell a person to remove a column that is not
one of the eight, never to rename it.

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
that every figure is before sequestration, as payers report allowed amounts. MA contracted and commercial rows are
never priced: their allowed totals are "the dollars that cannot be priced without a contract".

**A platform job prices and emails (D21 a).** The web app sends `screening_price` with the run's ID (singleton key
`screening_price:<id>`); every minute the same job sweeps runs queued over 30 seconds and runs whose pricing is ten
minutes stale. A run is claimed, its release read and cached per process by release, manifest and ZIP, its pending
rows priced and recorded 5,000 a statement, then completed and its link emailed in one operator transaction: a
failed send rolls the completion back and a later claim sends it. After a third attempt, or when the pinned
release is not there as pinned or has been withdrawn (checked at every claim, so a release this process has cached
is never used after its withdrawal), the run fails, the failure is committed, and then the contact is sent a link
to start again; a notice the mail service refuses is logged by the run's ID and the run stays failed. The sweep takes
each due run on its own: one that throws (its contact's address refused by the mail service, say) is logged
(`SCREENING_RUN_FAILED`, by its ID) and the sweep goes on, so no one run holds up the others. Every worker creates
the platform queues, so the web app's send never meets a missing queue; a send that fails anyway leaves the run to
the sweep. 50,000 rows run from the server action to the emailed link in about 8 seconds here with each pooled
code priced twice (8.3 s on 2026-10-18; about 4 seconds before the rulings), against CO-04's 60.

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
public header), and never say owed, underpaid or recovered: "below the Medicare figure", "allowed in your file",
"difference", "within the range of the reduction across codes", "cannot be priced without a contract". The copy lint reads the screening paths, the worker's
screening module included.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| A separate schema and role for screening (D18 b) | A second tenancy model to secure and test; the catalog test already proves the public-schema pattern. |
| Upload bytes to S3 under a platform key (D18 c) | A mistaken upload holding PHI would reach storage; a file with no practice has no practice key. |
| Price a row's visit composition (D19 c), or show a range computed outside the engine (D19 b) | Asks the prospect for what an aggregate has not got, or computes a number outside the engine. The owner's ruling 1 gets the range from the engine itself: both ends are `price()` outputs. Revisit if prospects send visit-level aggregates. |
| A fully reduced figure from a higher-valued pool code ahead of the row | Depends on which codes the release carries and their practice-expense parts at the place of service; the row's own code with one unit always ranks first by the engine's tie rule, and the second line's cut is its own whatever ranks first. |
| Compare against the engine's final amount, after sequestration | What PR 6 first did: a payer's allowed amount is normally before sequestration, so a row allowed in full looked about 3% (SYNTHETIC; 2% real) above the figure and up to that much of a shortfall was hidden. The owner's ruling 2 compares before it. |
| Ask for a ZIP+4 where the locality map needs one | The engine takes a five-digit ZIP alone (`PracticeSettings.zip`); the owner's ruling 3 keeps the refusal until release 1's real locality map loads. |
| Infer the product from payer names (D20 b), or price everything as MA non-contracted (D20 c) | A guess about a contract; MA contracted rows must never price as non-contracted. |
| Rate-limit by domain and IP only (D21 b) | Every gmail.com prospect would share one count. |
| Show the result in the browser only (D21 c) | Nothing verifies the contact, and the result could not be reopened. |
| A base64url token | The URL guard refuses it; 32 letters carry about 150 bits. |

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
  `locality_map` requires it" is not met. The owner's ruling 3 keeps the refusal; an engine change, separately
  approved, is revisited when release 1's real locality map loads.
- A result priced under a rule release since withdrawn says so above its figures and may still be converted to an
  audit request, which prices nothing from the screening (the owner's ruling 4).
- The platform split is a fifth table the domain model shows as a divergence from CO-12; approving the document
  approves it.
- What proves it: SEC-17 (`packages/db/src/screening.db.test.ts`, from the catalog), SCR-01 to SCR-06
  (`apps/worker/src/screening/*.test.ts`, `apps/web/src/lib/screening/routes.db.test.ts`,
  `screening.large.db.test.ts`, `apps/web/src/components/screening/result.test.tsx`, the copy lint and the screening
  journey). The rulings in particular: G01's 97110 and 97140 as SYNTHETIC rows, between their two figures (within
  the range) and more than $5 a line below the fully reduced one (an anomaly), 97161 with one figure, a row allowed in
  full at the figure before sequestration with no difference (`adapter.test.ts`, `screening.db.test.ts`); a ZIP
  needing its ZIP+4 refused (`routes.db.test.ts`, `screening.db.test.ts`); a result under a withdrawn release
  converted with its notice (`routes.db.test.ts`, `screening.db.test.ts`).

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
4. **A withdrawn release.** A result priced under a release later withdrawn keeps its notice and may still be converted
   to an audit request (the audit prices nothing from the screening). *Built:* unchanged, now tested.

What stays open: the specialist's answer to Q21 (should a payer's allowed amount turn out to be reported after
sequestration, the comparison moves to the engine's final amount, which the trace also carries); the engine change for ZIP+4 localities,
when release 1's locality map loads; and visit-level aggregates (see Revisit when).

## Revisit when

Release 1 is published (screening opens), and its real locality map loads (the owner's ruling 3: ZIP+4 localities
and the engine); the reimbursement specialist answers Q21 (the owner's ruling 2: which figure a payer's allowed
amount is compared with); prospects ask for visit-level aggregates (the reduction across codes); or the permission
matrix gains a dedicated permission for platform pricing defaults (PR 14).
