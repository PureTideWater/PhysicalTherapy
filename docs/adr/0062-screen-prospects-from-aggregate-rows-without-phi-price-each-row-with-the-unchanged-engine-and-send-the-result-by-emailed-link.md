# 0062. Screen prospects from aggregate rows without PHI, price each row with the unchanged engine, and send the result by emailed link

- **Status:** accepted
- **Date:** 2026-10-18
- **Deciders:** the owner (D11 option a and D18 to D21 option a, in `docs/product/reconciliation-001.md`, approved 2026-10-17); the build (PR 6 of Change Order 001)
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
- `screening_result`: one row per uploaded row, its facts as decoded and, once priced, the engine's line amount
  (rounded once by the engine, its unrounded value beside it), that amount times the claim count, the difference
  from the allowed total in the file, and whether the engine's trace ranked the code in the reduction across a
  visit's codes (`in_reduction_pool`, the mppr adjustment's `in_pool`), with the engine's unpriced reason and
  detail and the trace's SHA-256. Its CHECKs make MA contracted and commercial rows exactly `contract_required` and
  medicaid and other rows exactly `not_screened`, hold a priced row to `expected_cents = expected_line_cents *
  claim_count` and `difference_cents = expected_cents - observed_allowed_cents`, take only a real code's shape
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
the console's two split functions. A group is below by the threshold when its difference is positive and at least
$5 a claim line (ADR 0038's default); it is an anomaly only when no row of it is in the reduction across a
visit's codes, and otherwise is reported as below the Medicare figure before that reduction: a row priced alone
is before the reduction, which for a typical therapy visit is itself more than $5 a line (PRD 11's worked example,
golden claim G01, paid exactly as one visit, would otherwise show two of its three codes as anomalies). The operator
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

**Each row priced alone by the unchanged engine, multiplied outside it (D19 a, D20 a).**
`apps/worker/src/screening/adapter.ts` makes each `medicare_ffs` or `ma_noncontracted` row a one-line claim under
`MA_NONCONTRACTED` with `MA_NONCONTRACTED_TERMS` and a fixed in-code mapping, dated its band's first day, charge
and observed zero (the row's allowed total is compared outside the engine), at the prospect's ZIP with the run's
split, and calls `price()`. The engine's rounded amount is multiplied by the claim count in bigint. Unpriced reasons
pass through as the engine gives them. A row shows no figure (`rates_change_in_band`) when its trace names a record
that does not cover its whole quarter, or when the engine prices the line differently (another outcome, amount or
set of records) on any day inside the quarter where a record of the pinned release starts or the day after one ends:
those are engine calls too, so a record absent on the quarter's first day and in force later (a medically unlikely
edit, say) is not missed. Lines are memoized by code, modifiers, units, place of service and band. The Medicare
figure is labelled "Expected under Medicare, before the reduction across codes" wherever it appears, and so is every
figure worked out from it: the one claim line's ("One claim line, expected under Medicare, before the reduction
across codes") and the difference ("Difference, before the reduction across codes"). MA contracted and commercial rows are never priced: their allowed totals are "the dollars that cannot be
priced without a contract".

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
the sweep. 50,000 rows run from the server action to the emailed link in about 4 seconds here.

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
"difference", "cannot be priced without a contract". The copy lint reads the screening paths, the worker's
screening module included.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| A separate schema and role for screening (D18 b) | A second tenancy model to secure and test; the catalog test already proves the public-schema pattern. |
| Upload bytes to S3 under a platform key (D18 c) | A mistaken upload holding PHI would reach storage; a file with no practice has no practice key. |
| Price a row's visit composition (D19 c), or show a range computed outside the engine (D19 b) | Asks the prospect for what an aggregate has not got, or computes a number outside the engine. Revisit if prospects send visit-level aggregates. |
| Infer the product from payer names (D20 b), or price everything as MA non-contracted (D20 c) | A guess about a contract; MA contracted rows must never price as non-contracted. |
| Rate-limit by domain and IP only (D21 b) | Every gmail.com prospect would share one count. |
| Show the result in the browser only (D21 c) | Nothing verifies the contact, and the result could not be reopened. |
| A base64url token | The URL guard refuses it; 32 letters carry about 150 bits. |

## Consequences

- Real prospects wait for release 1: `current_rule_release()` is null in production, so `screening_status()` is
  closed, and nothing about a prospect is recorded while it is, not even a refused upload. Tests price under
  SYNTHETIC release 900001 only (and 900004, withdrawn in a test).
- A row is priced as one line, so the reduction across a visit's codes is not applied and the Medicare figure
  can overstate a multi-code visit (PRD 11's example, golden claim G01, by 15.3%); every figure built from it (the
  line's, the row's and the difference) carries the label, and a code in the reduction is never called an anomaly
  on that figure alone. D19 (a) accepted a labelled overstatement; that it is about $5 to $6 a line for typical
  therapy codes, on top of ADR 0038's $5 threshold, is put to the owner with this pull request.
- The engine's sequestration applies to the payer's share, the amount less the patient share, and a screening row
  carries no patient share, so the figure is after sequestration taken from the whole amount, while the allowed
  amount in a payer's remittance is normally before sequestration (fixtures/golden/QUESTIONS.md, Q21): a row paid in
  full shows its allowed amount about 2% above the figure, which can hide a shortfall of up to about 2% and offsets
  part of the reduction's overstatement. The page says so (`MEDICARE_FIGURE_NOTE`); Q21's effect on screening is
  for the specialist. Neither touches the engine.
- A ZIP whose `locality_map` record needs its ZIP+4 is refused, and no ZIP+4 is asked for or kept: the engine takes
  a five-digit ZIP alone (`PracticeSettings.zip`) and stops with `ENGINE_ERROR locality_needs_zip_plus_four` for such
  a locality, so D20's "ZIP+4 asked only where `locality_map` requires it" cannot be met without an engine change,
  which this pull request may not make. Put to the owner: a separately approved engine change that takes a ZIP+4
  locality, or a ruling that screening refuses such ZIPs until then (what it does now).
- A result priced under a rule release since withdrawn says so above its figures; it can still be converted to an
  audit request, which prices nothing from the screening.
- The platform split is a fifth table the domain model shows as a divergence from CO-12; approving the document
  approves it.
- What proves it: SEC-17 (`packages/db/src/screening.db.test.ts`, from the catalog), SCR-01 to SCR-06
  (`apps/worker/src/screening/*.test.ts`, `apps/web/src/lib/screening/routes.db.test.ts`,
  `screening.large.db.test.ts`, the copy lint and the screening journey).

## Revisit when

Release 1 is published (screening opens); prospects ask for visit-level aggregates (the reduction across codes);
the engine and the rule records carry ZIP+4 localities; or the permission matrix gains a dedicated permission for
platform pricing defaults (PR 14).
