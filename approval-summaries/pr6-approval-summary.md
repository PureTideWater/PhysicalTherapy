# PR 6 (free screening): what you are asked to approve

Branch `co-001/pr-06-free-screening`, checked at commit `3c1b289357d04d1b10ff631c6e56fdcfa3f94d0e` (after your rulings of October 18, 2026 on the best-option audit's items 6 and 1, your ZIP+4 ruling of 11:47 UTC that day, and the review fixes of October 20). One new database migration: `20261104090000_free_screening.sql`. It is this pull request's own migration, not yet merged and applied only to scratch databases, so these changes were made in it in place; no other migration changed.

**Do not sign yet.** PR 5 merges first. After it does, this document is generated again and its fingerprint changes. You will be asked to approve it then, not now. The approval line is still blank, and no one has been added to the approver list.

## What the change is

A prospect who has no account uploads a file of totals: one row for each code, modifiers, units, place of service, payer type and quarter, with the allowed total and the claim count. Each row must add up to at least 11 claim lines. The system prices each row against Medicare and emails a private link to the result.

**New tables (5)**
- `screening_prospect`: the practice's name, state, 5-digit ZIP and contact email.
- `screening_upload`: a fingerprint (hash) of the rows the server accepted, the row count, whether it was accepted, the coded reasons for a refusal, and three totals for the small rows the browser left out (how many rows, their claim lines, their allowed dollars).
- `screening_place_of_service_split`: which places of service count as facility and which as non-facility. A contract specialist (a person, never a model) approves it. It is never edited in place, and the latest approval is the one in force.
- `screening_run`: one pricing of an accepted upload. It is fixed to the rule release and split in force at the time, and it stores only a scrambled form of the link's secret.
- `screening_result`: one line for each row sent: its totals, the engine's Medicare figure times the claim count, the difference, and why a row could not be priced. For a code in the reduction across codes it also holds the second, fully reduced figure. A row here always has at least 11 claim lines.

**New functions (31)**

The website uses these. Each one runs with fixed rights, and none of them gives direct access to the tables:
- `screening_status`: is screening open (a published rule release and an approved split)?
- `screening_zip_status`: does the release map this ZIP, and does it need a ZIP+4?
- `submit_screening`: stores an accepted upload and its rows, computes the fingerprint of those rows itself, replaces any earlier screening of the same practice, queues the pricing, and writes audit events.
- `reject_screening_upload`: stores a refused upload (row count and coded reasons only, no fingerprint) and writes an audit event.
- `screening_result_summary`, `screening_result_groups`, `screening_result_coverage`, `screening_result_rows`: read a result by its link. They give the totals, the rows left out before sending, the anomalies by code and payer, the coverage, and the top rows, with both figures where a code has two and where each row and group stands.
- `convert_screening`: turns a screening into an audit request and writes an audit event.
- `console_screening_splits`, `console_approve_screening_split`: let the specialist see and approve the split.

The background jobs use these:
- `operator_screening_due`, `operator_screening_claim`, `operator_screening_release`, `operator_screening_rows`, `operator_screening_record`, `operator_screening_complete`, `operator_screening_fail`: find, price, record and finish (or fail) a run.
- `operator_screening_expire`: deletes everything 30 days after the upload and logs each deletion.

The database runs these internally, as rule checks and guards:
- `screening_rejection_valid`, `screening_rejections_valid`: a refusal reason can never hold a column heading or a cell.
- `screening_split_valid`: checks the split's format. `screening_modifiers_valid` checks the modifiers' format.
- `screening_split_in_force`: finds the latest approved split.
- `screening_practice_key` (new): the practice's name as compared, in lower case with extra spaces removed.
- `screening_replaced` (new): whether a later screening of the same practice exists.
- `screening_kept_until_expiry`: nothing is deleted before its 30 days are up, unless a later screening of the same practice replaces it.
- `screening_run_rules`: a run only moves forward, and its link and its conversion are each set once.
- `screening_result_inserted`, `screening_result_rules`: rows are added with their run, and each is priced once.
- `screening_standing`: says where an allowed total stands against a row's figures.

## Why

- CO-04 (free screening) and CO-12's screening tables.
- Your decisions D18 to D21 (all option a), with D11 for the wording.
- Your rulings of October 18, 2026: the four on the first review, your approval after the best-option audit (items 6 and 1), and your ZIP+4 ruling of 11:47 UTC, below.

## Your rulings of October 18, 2026

They are recorded in ADR 0062 ("Owner rulings (2026-10-18)", rulings 1 to 6) and in the Approval section of `docs/product/reconciliation-001.md`, each in your name and dated.

1. **Reduction across codes (D19).** A code in Medicare's multiple procedure reduction gets two figures, both from the unchanged engine: priced on its own, and priced as a later code of a visit (fully reduced). A row is an anomaly only when its allowed total is more than $5 a claim line below the fully reduced figure.
2. **Sequestration.** Every figure is the engine's amount before sequestration, read from the engine's own calculation. The reimbursement specialist confirms this later (Q21).
3. **ZIP+4, superseded.** Your first ruling kept refusing a ZIP whose locality needs a ZIP+4. **You superseded it at 11:47 UTC on October 18, 2026:** ZIP+4 localities are fixed before launch in their own pull request, **PR 6b**. In PR 6b, practice settings and the screening accept a ZIP+4, and the engine finds the locality from it; five-digit ZIPs and the golden test lines are unchanged; and the change order's freeze on the engine is loosened for that lookup only. ADR 0062 marks ruling 3 as superseded, in your name, with the time. The Approval section of reconciliation-001 says the same, and its engine check now names PR 6b's lookup as the one exception. **This pull request still refuses such a ZIP until PR 6b lands**, with a clear message ("this ZIP code spans two Medicare localities, and a free screening cannot price one yet"). The upload page says a ZIP that spans two Medicare localities cannot be screened yet. PR 6 itself changes nothing in the engine.
4. **Withdrawn release.** A result priced under a release that is later withdrawn keeps its notice and can still be converted to an audit request.
5. **At least 11 claim lines a row (audit item 6, critical).** See "The 11-claim-line floor" below.
6. **Denied lines (audit item 1, the template's part).** See "Denied lines" below. Changing how the paid audit's triage reads denials is PR 6d, not this pull request.

## The 11-claim-line floor (audit item 6)

A row with only a few claim lines can be one patient's care (with its quarter, next to the practice's name and ZIP), which is not de-identified under HIPAA, and a prospect has no business associate agreement with us. So every row must add up to at least **11 claim lines**, the CMS small-cell standard. It is **one setting** (`SCREENING_MIN_CLAIM_LINES = 11`), enforced in three places:

- **In the browser.** A row of fewer than 11 claim lines is left out before anything is sent. The page says how many rows, claim lines and dollars it left out, for example: "Left out: 2 rows of fewer than 11 claim lines each, 11 claim lines and $366.24 allowed in your file. They are not sent, and no figure includes them." If every row is too small, nothing is sent.
- **On the server.** A request built to get around the browser, with a small row in it, is refused, naming the row: "Row 2 sums fewer than 11 claim lines; a screening takes a row of at least 11 claim lines, because a row of fewer can describe one patient's care: leave it out." Nothing about the refused rows is stored except the row count and the coded reason (row number and "claim count"). No code, quarter, dollars or fingerprint of them is kept.
- **In the database.** A rule (`screening_result_claim_count`, 11 to 100,000) refuses any stored row of fewer than 11 claim lines, and a second rule keeps the "left out" totals consistent with the floor (each left-out row 1 to 10 claim lines). A test fails if the database rule and the setting ever differ.

The result says so too: a "Left out before sending" section shows the rows, claim lines and dollars the browser left out, apart from every figure.

**Two protections added by the review of October 20, under your same ruling:**
- **No fingerprint of the file.** The browser used to send a hash of the whole file, which included the small rows. Together with the left-out totals, a small row's details could have been worked out by trial. Now the database computes the fingerprint itself, from the rows it accepted only. A refused upload keeps no fingerprint at all.
- **One screening per practice at a time.** The CMS standard also forbids working out a small number by subtracting two larger ones (for example, the same row at 12 claim lines in one screening and 11 in the next). So a new screening from the same practice (same practice name and ZIP, or same email address) replaces the earlier one, and the earlier link stops working. Each replacement is an audit event (`screening_replaced`). The upload page, the result, the email and the page an old link opens all say so.

**What counsel still has to confirm** (recorded in ADR 0062): the number 11; whether it should count claim lines or patients (a plan of care can give one patient 11 lines in a quarter; if counsel says patients, a patient-count column is added later with a new migration); whether the result may show a left-out total under 11 claim lines; and how wide "the same practice" should be.

## Denied lines (audit item 1, the template's part)

A denied line (no authorization, visit limit reached, duplicate, timely filing, not covered) pays nothing for a reason that is not about the rate. Inside a row of totals it would look like a shortfall against Medicare. So the screening template and the upload page tell prospects to leave denied lines out of every total and claim count, because a denial is not a rate variance.

- The downloadable template now starts with note lines (each beginning with #, which the page skips), in plain words: what a row is (totals only, no patient information), the 11-claim-line rule, and: "Leave denied lines out of every total and claim count: a line the payer paid nothing on because it was denied, for a missing authorization, a visit limit, a duplicate, timely filing or a service not covered. A denial is not a rate variance, and a screening compares rates."
- The upload page lists the same two rules, and the column guide repeats them beside the allowed total and the claim count.

## What changed in the schema since the version you last saw (commit `dfd48f8`)

All of it is inside `20261104090000_free_screening.sql`. No other migration changed.
- `screening_upload`: `file_sha256` is now `rows_sha256` (the fingerprint of the accepted rows, empty on a refused upload); **3 new columns** for what the browser left out (`left_out_rows`, `left_out_claim_lines`, `left_out_allowed_cents`, whole cents); new checks: the fingerprint is there exactly when the upload is accepted, each left-out row is 1 to 10 claim lines and at most $25,000 a line, a refused upload leaves nothing out, and accepted plus left-out rows stay within 50,000.
- `screening_result`: the claim count's rule is now **11 to 100,000** (it was 1 to 100,000).
- `screening_prospect`: **2 new indexes** to find the earlier screening of the same practice.
- A refusal can now carry the reason `too_few_claim_lines` (a row number and the claim-count field, nothing else).
- **2 new functions** (`screening_practice_key`, `screening_replaced`), so there are 31 screening functions, and 271 functions in the schema (was 269).
- `submit_screening` takes no fingerprint and takes the three left-out totals; `reject_screening_upload` takes no fingerprint; `screening_result_summary` also returns the left-out totals; `screening_kept_until_expiry` lets a replaced screening go early.

## What it does not change

- The pricing engine. No file under `packages/pricing/src` changed.
- The golden test lines (`fixtures/golden`, including `QUESTIONS.md`) and the content releases (`content/releases`).
- The ledger, and what counts as recovered.
- The catalog test and its rules, the row-level security rules, and the cross-tenant test.
- The PHI registry: still 44 tables. None of the new tables is in it, because none holds patient data.

## No upload bytes, no PHI

- The file is read in the prospect's browser and never leaves it. The server receives only the rows of totals of at least 11 claim lines, and checks them again. It stores a fingerprint of the rows it accepted, the row count, the three left-out totals and coded reasons, never a byte of the file.
- A file with a name, date of birth, member ID, date of service or claim number column is refused in the browser, naming the column, and nothing is sent. If the server catches one itself, it records only the count and a coded reason such as "column 6, date of service".
- A test (SEC-17) reads the database's own description of these tables: no patient-shaped columns, no date columns, no practice link, and no access for any other role.
- The link's secret is 32 random letters (about 150 bits). Only its scrambled form is stored, and it is never logged.
- The emails, pages and results never say "owed", "underpaid" or "recovered", and they show the logo without the tagline.

## Changes in the domain-model document

- **Item to approve (C5), "decided and built".** The screening tables are built like the audit request (row-level security forced, owner-only policy, no practice link, no PHI-registry entry, written only through the functions above). C5's explanation now also says what an upload keeps (the accepted rows' fingerprint, the three left-out totals, never the file), that no row of fewer than 11 claim lines is stored, and that a practice keeps one screening at a time. Approving the document also approves the fifth table, the place-of-service split, which CO-12 does not list.
- **Five information-only rows (D22 to D26).** The five new tables are not in the original data dictionary.
- The number of items to approve stays at 23; 84 tables, 1 view, 44 in the PHI registry. Nothing about any existing table changed.

## Fingerprint

The document's SHA-256, as the repository's own check computes it, is:

`afba214a550ea030936ab5ccba51d4173a8cd0ea843c17ca761e85bb4fa3c2c3`

(It was `07b0a49e...` at the version you last saw, and `7359829a...` after the floor alone.) The migration's own SHA-256 is `fd88506d7276cdb12c9320d4bacca60439a2cafef8f33392ee0beb8d8b1385ce`. **This will change again when the document is generated again after PR 5 merges**, and that later version is the one you will be asked to sign.

## Is it safe to run with the current version still live?

Yes. The migration only adds things. It does not alter or remove any existing table, function, policy, check or permission. It does not touch rule, ledger or pricing tables. The only links to existing tables are references to `prospect_request` and `user`, and neither table changes.

The current website and worker ignore the new tables. Rollout order: run the migration, then the new worker, then the new website.

## Speed

The 50,000-row screening stays well under its 60-second limit: the browser read it in 0.3 seconds, it was stored in 2.5 seconds, and the link was emailed 5.5 seconds after the upload (test run at this commit on October 20).

## What stays open

- Counsel's answer on the floor: the number 11, claim lines or patients, whether a left-out total under 11 claim lines may be shown, and how wide "the same practice" is.
- PR 6b (ZIP+4 localities) before launch; until it lands this pull request refuses a ZIP that needs a ZIP+4.
- PR 6d (reading denials in the paid audit's triage).
- The specialist's answer to Q21. If a payer's allowed amount turns out to be reported after sequestration, the comparison comes back to you.
- Real prospects can use screening only after release 1 is published. All tests used synthetic data only.
