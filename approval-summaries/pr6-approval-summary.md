# PR 6 (free screening): what you are asked to approve

Branch `co-001/pr-06-free-screening`, checked at commit `1de403ec384bd5d2c1d905aeb6e7030acabaf4aa`. One new database migration: `20261104090000_free_screening.sql`.

**Do not sign yet.** PR 5 merges first. After it does, this document is generated again and its fingerprint changes. You will be asked to approve it then, not now.

## What the change is

A prospect who has no account uploads a file of totals: one row for each code, modifiers, units, place of service, payer type and quarter, with the allowed total and the claim count. The system prices each row against Medicare and emails a private link to the result.

**New tables (5)**
- `screening_prospect`: the practice's name, state, 5-digit ZIP and contact email.
- `screening_upload`: the file's fingerprint (hash), its row count, whether it was accepted, and the coded reasons for a refusal.
- `screening_place_of_service_split`: which places of service count as facility and which as non-facility. A contract specialist (a person, never a model) approves it. It is never edited in place, and the latest approval is the one in force.
- `screening_run`: one pricing of an accepted upload. It is fixed to the rule release and split in force at the time, and it stores only a scrambled form of the link's secret.
- `screening_result`: one line for each uploaded row: its totals, the engine's Medicare figure times the claim count, the difference, and why a row could not be priced.

**New functions (28)**

The website uses these. Each one runs with fixed rights, and none of them gives direct access to the tables:
- `screening_status`: is screening open (a published rule release and an approved split)?
- `screening_zip_status`: does the release map this ZIP, and does it need a ZIP+4?
- `submit_screening`: stores an accepted upload and its rows, queues the pricing, and writes an audit event.
- `reject_screening_upload`: stores a refused upload (hash, count and reasons only) and writes an audit event.
- `screening_result_summary`, `screening_result_groups`, `screening_result_coverage`, `screening_result_rows`: read a result by its link. They give the totals, the anomalies by code and payer, the coverage, and the top rows.
- `convert_screening`: turns a screening into an audit request and writes an audit event.
- `console_screening_splits`, `console_approve_screening_split`: let the specialist see and approve the split.

The background jobs use these:
- `operator_screening_due`, `operator_screening_claim`, `operator_screening_release`, `operator_screening_rows`, `operator_screening_record`, `operator_screening_complete`, `operator_screening_fail`: find, price, record and finish (or fail) a run.
- `operator_screening_expire`: deletes everything 30 days after the upload and logs each deletion.

The database runs these internally, as rule checks and guards:
- `screening_rejection_valid`, `screening_rejections_valid`: a refusal reason can never hold a column heading or a cell.
- `screening_split_valid`: checks the split's format. `screening_modifiers_valid` checks the modifiers' format.
- `screening_split_in_force`: finds the latest approved split.
- `screening_kept_until_expiry`: nothing is deleted before its 30 days are up.
- `screening_run_rules`: a run only moves forward, and its link and its conversion are each set once.
- `screening_result_inserted`, `screening_result_rules`: rows are added with their run, and each is priced once.

## Why

- CO-04 (free screening) and CO-12's screening tables.
- Your decisions D18 to D21 (all option a), with D11 for the wording.
  - D18: the tables follow the existing audit-request pattern.
  - D19: each row is priced by the unchanged engine and multiplied by its count.
  - D20: a fixed list of payer types, and a split the specialist approves.
  - D21: limits per business domain, per free-mail address and per IP, and a private link that lasts 30 days and is emailed.

## What it does not change

- The pricing engine. No file under `packages/pricing/src` changed.
- The golden test lines (`fixtures/golden`) and the content releases (`content/releases`).
- The ledger, and what counts as recovered.
- The catalog test and its rules, the row-level security rules, and the cross-tenant test.
- The PHI registry: still 44 tables. None of the new tables is in it, because none holds patient data.

## No upload bytes, no PHI

- The file is read in the prospect's browser and never leaves it. The server receives only the cleaned-up rows of totals and re-checks them. It stores the file's hash, its row count, and coded reasons, never a byte of the file.
- A file with a name, date of birth, member ID, date of service or claim number column is refused in the browser, naming the column, and nothing is sent.
- If the server catches such a file itself, it records only the hash, the count and a coded reason such as "column 6, date of service". It never records the heading or any value.
- A test (SEC-17) reads the database's own description of these tables. It confirms there are no patient-shaped columns, no date columns, no practice link, and no access for any other role.
- The link's secret is 32 random letters (about 150 bits). Only its scrambled form is stored, and it is never logged.
- The emails, pages and results never say "owed", "underpaid" or "recovered", and they show the logo without the tagline.

## Changes in the domain-model document

- **Item to approve (C5), changed from "proposed" to "decided and built".** The screening tables are built like the audit request. Each forces row-level security, has an owner-only policy, has no practice link and no PHI-registry entry, and is written only through the functions above. The catalog file is unchanged. Approving the document also approves the fifth table, the place-of-service split, which CO-12 does not list: the engine needs a split, and no rule record holds one.
- **Five information-only rows (D22 to D26).** The five new tables are not in the original data dictionary.
- The number of items to approve stays at 23. Nothing about any existing table changed: only rows were renumbered and counts updated.

## Fingerprint

The document's SHA-256, as the repository's own check computes it, is:

`3b2e537fc1b6cd5c0d6e9bb03713c12f112cac774d546a07ed43ccec2782a3fd`

This will change when the document is generated again after PR 5 merges.

## Is it safe to run with the current version still live?

Yes. The migration only adds things. It does not alter or remove any existing table, function, policy, check or permission. It does not touch rule, ledger or pricing tables. The only links to existing tables are references to `prospect_request` and `user`, and neither table changes.

The current website and worker ignore the new tables. Rollout order: run the migration, then the new worker, then the new website.

## Two points for you, recorded in ADR 0062

1. **ZIP+4.** D20 said to ask for a ZIP+4 where needed, but the engine cannot use one. For now, such ZIPs are refused. Allowing them needs either an engine change, approved separately, or your ruling to keep refusing them.
2. **The Medicare figure is somewhat high.** It is shown "before the reduction across codes", so it runs high, roughly $5 to $6 per line. Codes affected by that reduction are therefore never flagged as anomalies.

Real prospects can use screening only after release 1 is published. All tests used synthetic data only.
