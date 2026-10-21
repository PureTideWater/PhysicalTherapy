# PR 6 (free screening): what you are asked to approve

Branch `co-001/pr-06-free-screening`, pull request #31, checked at commit `6a4ec80be` (October 21, 2026). It sits on `claude/build-platform` at `5df4108`, which already holds PR 5 and the images fix (#32). There is one new database migration, `20261104090000_free_screening.sql`. It is this pull request's own migration and has not been merged, so this round changed it in place. No other migration changed.

**This is the version to sign.** PR 5 has merged, and the document was generated again on top of it. The approval line is blank, and no name was added to the approver list. You sign the document's SHA-256 below.

## What the change does, in plain words

A prospect with no account uploads a file of totals: one row for each code, modifiers, units, place of service, payer type and quarter, with the allowed total and the claim count. No patient information is allowed. Each row must add up to at least 11 claim lines. The system prices each Medicare row with the unchanged engine and emails a private link to the result. The prospect can turn the result into an audit request.

The schema change adds **nine tables** and **55 functions**, adds eight columns to `prospect_request`, and replaces that table's guard function. Nothing else that already exists changes.

**Tables for a screening (kept 30 days, then deleted)**
- `screening_prospect`: the practice's name, state, 5-digit ZIP and contact email, how they heard of us, the campaign codes of the link they came from, a referring firm, and fingerprints of the consent and screening terms they accepted.
- `screening_upload`: a fingerprint of the rows the server accepted, the row count, accepted or refused, coded reasons for a refusal, and three totals for the small rows the browser left out.
- `screening_place_of_service_split`: which places of service count as facility and which as non-facility. A contract specialist (a person, never a model) approves it. It is never edited, and the latest approval is the one in force.
- `screening_run`: one pricing of an accepted upload. It is fixed to the rule release and split in force at the time. It stores only a scrambled form of the link's secret, and when the result was first opened.
- `screening_result`: one line for each row: its totals, the engine's Medicare figure times the claim count, and the difference. A code in the reduction across codes also gets its fully reduced figure. Every stored row has at least 11 claim lines.

**Tables for what outlives a screening (your rulings of October 20)**
- `screening_outcome`: one counts-only line for every screening, kept with no end date. It holds bands and shares, never a name, email, ZIP, exact count, date or dollar figure.
- `screening_lead` and `screening_lead_product`: the frozen summary of a converted or consenting practice's screening, kept 12 months.
- `marketing_campaign`: the campaign codes you list. It is new in this round, under your ruling of October 21 below.

**Functions.** The website reaches the tables only through fixed-rights functions: submit, refuse, read a result by its link, record that the link was opened, convert to an audit request, withdraw a kept summary, approve the split and list a campaign. The background jobs have their own functions to price, finish, expire and send reminders. The database's own guards check every value and stop rows from being changed.

## Your ruling of October 21, and how it is built

The question was whether a link's campaign code should be kept only when it is on your list. A format check cannot catch a person's name typed into a code, for example `jane-doe-follow-up`.

- **Built in the database.** Four columns can keep a campaign code: the prospect's, the kept summary's, the audit request's and the outcome's. Each one keeps the code only when you have listed it at the moment the row is written. Any other code is stored as `other`, and no code is stored as empty. A trigger on each table does this for every writer: the website's functions, the owner's own statements, and any role given write access later.
- **A code you list later changes nothing already stored.** A row that kept `other` keeps it, because the code it was given was never stored.
- **The code goes nowhere else.** No log line, job, email, error message or audit event carries an unlisted code. Only the visitor's own first-visit cookie, in their own browser, may still hold it.
- **Listing a code** takes a platform administrator, and each listing is an audit event. PR 7 builds the screen for it. Today it is the function `console_register_marketing_campaign`.
- **Source and medium** keep their format checks, as you ruled.
- **Your other rulings that day are recorded and built as described:** a match on the contact address alone deletes the earlier kept summary and carries no request. The result page and the email say when a summary is kept with an earlier request. A kept summary is deleted early only through PR 6e's withdrawal link. PR 7's campaign reports show a cohort only at 11 or more. The images fix merged on its own as #32.

**Proved on a fresh database at this commit** (PostgreSQL 18, all 42 migrations, synthetic data):
- A listed code (`verify-listed`) was kept as written.
- An unlisted code (`jane-doe-follow-up`) was stored as `other` in every table.
- An empty code stayed empty.
- When the website's database role wrote to these tables directly, Postgres refused every attempt with "permission denied". It has no way to write them except through the functions.
- After the unlisted code was listed, nothing stored earlier changed. No table held the unlisted code anywhere.

## What changed since the version you last saw

You last saw commit `3c1b289`, document SHA-256 `afba214a...`, from October 20. Everything new is inside the same migration:
- **Four new tables:** `screening_outcome`, `screening_lead`, `screening_lead_product` and `marketing_campaign` (described above).
- **New columns:**
  - `screening_prospect` gains eight: how they heard of us, three campaign codes, the kind of paid click, a referring firm, and the consent and terms fingerprints.
  - `screening_run` gains when the result was first opened.
  - `prospect_request` gains eight: the same attribution columns, whether it came from a screening, and why it was declined (from a closed list, required on a decline).
- **24 new functions (55 in all, up from 31):**
  - The outcome bands and the marketing channel.
  - Freezing, keeping and withdrawing a summary.
  - Reminders.
  - The release read per run (audit #53).
  - The result page read one page of 50 groups at a time, so the largest result opens within the web task's memory.
  - "Result opened".
  - The campaign list and its triggers.
  - A second form of the audit-request function that takes the attribution.
- **One existing function replaced:** `prospect_request_fixed()`, the guard that stops an audit request from being changed. It now also protects the decline reason and the new columns.
- **Faster result reads:** the standing check runs inline, and a page read of the largest shape fell from about 0.47 s to about 0.2 s.
- **The document's own cross-check is corrected.** It had listed four false column differences on the outcome table's share columns, because the checker did not know the small-integer column type. The columns always matched. The checker now reads one shared type map, a test fails if the schema ever uses a type it does not know, and the document now reports 0 differences, as the base does.
- **PR 5 merged underneath this branch.**
  - The two migrations change no common object.
  - A full comparison of the database before and after PR 6's migration found every object PR 5 added unchanged: functions, triggers, rules, policies, permissions and the worker's own login.
  - Where both migrations meet, PR 5's additions are all present: the audit trail's four triggers, the rule-withdrawal lock, its user links, its permissions for the website, and the worker's `tp_job` login.

## What it does not change

- The pricing engine. No file under `packages/pricing/src` changed.
- The golden test lines (`fixtures/golden`), the content releases (`content/releases`), and the ledger or what counts as recovered.
- Any earlier migration, `approvers.json`, or the approval line, which the generator left blank.
- The catalog test, the row-level security rules and the cross-tenant test. All nine new tables force row-level security, and only the owner may read or write them.
- The PHI registry. It still has 44 tables. None of the new tables holds patient data, so none is in it.

## What you approve in the document

- Items C1 and C5. C5 covers the screening tables, built like the audit request: row-level security forced, an owner-only policy, no practice link, no PHI-registry entry, and written only through the functions. Approving C5 also approves the fifth table, the place-of-service split, which CO-12 does not list.
- Nine information-only rows: the nine new tables are not in the original data dictionary.
- The totals: 23 items to approve, 88 tables, 1 view, 44 in the PHI registry.

## Fingerprint

The document's SHA-256, the hash the approval line must carry, is:

`a17f33aa3b3ace6efcf11171789b6cfbdb0193f0dc76be5b28cdd47840deebfe`

- It was `afba214a...` at the version you last saw. An earlier draft of this round showed `bf20bbc3...`; it differed only in the false cross-check line above.
- The document you approved for PR 5, now on `claude/build-platform`, is `6f72ea56...`.
- The migration's own SHA-256 is `8bc938ac54150a7d1d93255acb4610851b3d2bd85f37d6b7a521a6ed950b0a43`.

The repository's check confirms that the document matches the schema and refuses only because the approval line is blank.

## Is it safe to run with the current version still live?

Yes. The migration adds tables and functions. The only existing table it changes is `prospect_request`: eight new columns, a decline-reason permission for the website, the replaced guard, and the campaign trigger. Declines recorded before this change get the reason `not_recorded`. The current website keeps working: its review, decline and conversion still pass. The migration does not touch rule, ledger or pricing tables.

Rollout order: run the migration, then the new worker, then the new website.

## Checks at this commit

- **The cross-check fix (`e297346`):** the new type-map test failed without the fix, naming the four columns, and passed with it; typecheck, lint, the domain-model tests and the schema test passed, and the regenerated document matches the schema.
- **Fresh clone at `26de663`** (the same schema and code apart from the cross-check fix):
  - All 42 migrations applied from zero on PostgreSQL 18.
  - The document check passed.
  - The catalog and cross-tenant tests passed, 1,126 of 1,126, in 17 seconds.
  - The largest-result page test passed 3 of 3 in 39 seconds, against a 120-second limit. It read all 20,507 groups, and every page stayed under the 512 MiB memory limit.
- **The fix round's full local suite at this code:**
  - Typecheck, lint and the copy and log checks passed.
  - 4,097 unit tests passed, and the 36 golden lines passed.
  - 8,773 database tests passed. The only failure is the test that waits for your signature.
  - The screening and reconciliation browser journeys passed.
- **GitHub:**
  - On this commit, the images, licenses and approval-of-record checks passed.
  - The main check and the capacity test were still running when this was written.
  - The capacity runs on the Docker images at `8f6e4d5` and `7bcb5fc` passed, with time marked "open until PR 6b". In the first of them, the worst-shape upload took 69.7 seconds from a cold start on GitHub's runner. That runner is not Fargate, so the 60-second promise is judged after PR 6b.

## What stays open

- **Counsel:**
  - The 11-claim-line floor: the number, claim lines or patients, whether a left-out total under 11 may be shown, and how wide "the same practice" is.
  - The wording of what is kept, which still says "the campaign codes ... of the link you came from" and could now say a campaign code is kept only when it is one we list.
  - The cookie disclosure.
  - The screening terms. Until counsel's review is done, a production server keeps the screening closed and neither sets nor reads the cookie.
- **PR 6b (before launch):**
  - ZIP+4 localities. Until then, a ZIP that spans two Medicare localities is refused with a clear message.
  - The screening's own task and its size and cost.
  - Turning on the 60-second time check.
- **Later pull requests:**
  - PR 6d: denials in the paid audit's triage.
  - PR 6e: consent capture, the withdrawal page and reminders.
  - PR 7: the campaign screen, the reports with their cohort of 11, and the lead list.
  - A later migration replaces the `not_recorded` fill-in for declines with a refusal, once the old website no longer runs.
- **The specialist:** the answer to Q21 on sequestration.

Real prospects can use the screening only after release 1 is published. All tests used synthetic data only.
