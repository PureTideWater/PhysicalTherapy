# 0043. Reconcile after every batch, map posting templates in the browser, and print ROI statements in the worker

- **Status:** accepted (amends 0042 for who maps the posting template and when the reconcile runs, and 0039 for
  the chain's last step)
- **Date:** 2026-10-24
- **Deciders:** founder (engineering)
- **PRD sections:** 5 (J10, J11, J12 quarterly ROI), 6 (Recovery ledger and reconciliation; Reports and exports), 7
  (Reconciliation; Reports), 13 in full, 15 (Documents: Playwright in the worker), 20 (Proof level; Posting-export
  templates); Data dictionary, roi_statement and practice.settings; test matrix LED-01 to LED-11, JOB-01; ADRs 0026,
  0033, 0038, 0039, 0042

## Context

Milestone 9's first part (ADR 0042) built the ledger, its matching and the reconcile job; its screens, the template
mapping, the ROI statement's document and the browser journey were left for this part. Four things were open:

1. The reconcile ran after triage of a run the chain created, after an export was stored, and daily. A batch whose
   months price nothing (a PLB-only take-back, a month waiting on a mapping, no rule release in force) reached the
   ledger only on the next day's schedule, though PRD 13 says a recoupment is taken "at once".
2. ADR 0042 left the posting template to the practice administrator (`setLedgerSettings`), who does not reconcile
   postings (PRD 3: the billing manager "reconciles postings") and cannot upload a sample export. PRD 20 maps one
   template per practice-management system once, at onboarding, and PRD 7 asks for a preview on a sample.
3. `roi_statement.document_key` existed, but nothing printed a statement and the statement's rules refused every update.
4. The CSV of a statement and its "every figure links to its entries" had no format.

## Decision

**The chain reconciles every batch.** `monitor`, after a document, queues `reconcile` keyed by that document
(`reconcile:<practice>:<document>`) whenever its plan queues no price job: nothing to price, a month waiting on a
mapping, or no rule release in force. When it prices a run, triage queues the reconcile of the run as before. A batch
still waits while its files are on their way. So a remittance that reprocesses a case line, or takes money back by PLB
WO, is matched after its parse, and the daily reconcile only catches up.

**The posting template is the billing manager's, mapped in the browser.** A person with `posting.reconcile` maps the
practice's posting template through `set_practice_posting_template(practice, template)` (migration
`20261024120000_reconciliation_and_roi_documents.sql`), a definer's-rights function that checks the person again in the
database and changes the `posting_export_template` key of `practice.settings` and nothing else
(`setPostingTemplate`, `@tp/worker/ledger`, audited as `posting_template_mapped`). The practice administrators' update
policy on the practice row is not widened. The proof level stays the administrator's (`setLedgerSettings`): it decides
what "recovered" counts, and a firm reconciling postings under a grant must not move it. The mapping screen
(`/p/<practice>/reconciliation/template`) offers the built-in templates or the practice's own mapping of its system's
columns (the system's name, a column for each field, the date format). A sample export the person chooses is read in
the browser with `@tp/ledger`'s own reader (`exportColumns`, `readPostingExport`) for its headers and a preview of its
first rows. The sample's file input has no name, so the form carries the mapping alone, and the web app never parses
an uploaded document (ADR 0033). Saving queues the reconcile for each posting export waiting for a template.

**The worker prints ROI statements.** A new job type, `roi_statement` (`{practice_id, roi_statement_id}`, one practice per
job, three attempts), prints a statement with the audit report's Chromium pipeline. In one transaction it reads the
statement locked and recomputes its figures from the entries it links (`recomputeStatement`), refusing to print one
that does not recompute. It prints the figures with each linked entry beneath its figure, stores the PDF sealed under
`practices/<practice>/reports/<statement>/<object>.pdf`, and records the key with the PDF's SHA-256. The database lets a
job, never a person, record that once, under the statement's own practice and ID; nothing else about a statement ever
changes, and a statement is never written with a document. A person who generates a statement on demand queues its
print in the same request. The daily reconcile queues the print of the quarterly statement it writes, and of any
statement not printed yet.

**The CSV is computed from the stored statement and its entries.** `roiStatementCsv` (`@tp/ledger`, CRLF) gives the
period, the proof level, fees, each figure's total row and, beneath recovered, interest and approved-but-not-posted,
each linked entry. Each entry row has its amount, entry and case IDs, stage, the date the money moved and the allocated
flag. Beneath actionable come its open cases. Statements and entries never change, so the CSV is the same on every
download, and no stored copy is needed. It holds opaque IDs, codes, dates of payment and amounts, no line-level PHI,
so it is `report.read` like the PDF. Every download is audited (`roi_statement_downloaded`, purpose `report_pdf` or
`report_csv`).

**The screens.**

- Reconciliation (`/p/<practice>/reconciliation`, `report.read`) shows:
  - the ledger's totals, each its own stage, with recovered and its proof level;
  - the posting template's state, and the embedded uploader for posting and EFT exports (the existing scanned intake,
    `file.upload`);
  - each export with what became of it;
  - the unmatched adjusted payments, posting rows and deposit rows, each beside its candidates, in no total;
  - each case line's linkage, from the remittance that reprocessed it (ERA) to its posting and its deposit, with
    recoupments, interest and its entries;
  - the ledger's entries, newest first.

  `?case=<case>` narrows the screen to one case's ledger. Matching by hand (`match-posting`, `match-deposit`,
  `match-claim`) and reversing a match (`reverse`: a reason and a confirmation that states the consequence) are
  `posting.reconcile`. A match repeated is the one standing, and a reversal repeated changes nothing. Dates of service,
  codes and the people's reasons show only to roles that read PHI.
- ROI statements (`/p/<practice>/reports/roi`) list the quarterly and on-demand statements and generate one for a
  period. A statement's page shows each figure stored and recomputed from its linked entries, each entry linking to its
  case's ledger. It states the proof level, says that billing records no fees yet (so no ratio is given) and shows
  the print state, the PDF with its SHA-256, and the CSV.

The dashboard's recovered figure and a recoupment's notification link to the ledger.

**The browser journey.** `apps/web/e2e/reconciliation.spec.ts` runs PRD 5 J10 in the browser in a practice of its own
(created by the spec, under the other group). The adjusted remittance creates a payer-approved amount, the posting export
moves it to posted, the EFT export to deposited, and the recoupment reduces recovered by its amount. The ROI statement
recomputes from its entries, its PDF printed by the worker; a confirmed reversal nets posted to zero. The e2e worker
runs the real reconcile and print jobs (they act only where the ledger has work). The monitoring chain's planning step
stays a placeholder there (each spec's pricing runs are its own), so after each 835 the spec queues the reconcile the
chain queues for a document.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| Queue the reconcile from every parse_835 | A zip of 500 files would run 500 whole-practice reconciles; monitor already waits for the batch to land, so it queues one |
| Keep the template the administrator's | The administrator neither reconciles postings nor uploads; the generated route tests (and the persona matrix) need a permission that says who does |
| Let posting.reconcile set the proof level too | It decides what recovered counts; a firm under a grant could raise the practice's recovered by choosing posted |
| Preview on an export already uploaded, read by the web app | ADR 0033: the web app never parses an uploaded document; the worker would have to store a sample, which holds PHI, for a screen used once |
| Store the CSV beside the PDF | Both inputs never change, so the CSV recomputes identically; a stored copy adds a key, a hash and a second write the job could fail between |
| Print in the reconcile job | The reconcile holds the practice's ledger lock for its whole pass; a Chromium print inside it would hold every reconcile of the practice behind a browser |

## Consequences

The chain test (`apps/worker/src/reconcile/chain.db.test.ts`) runs every LED case through the worker loop and intake
on SYNTHETIC files, the quarterly statement and its print, and the digest's recoveries.
`apps/web/src/lib/routes/reconciliation-routes.db.test.ts` runs the screens' routes. The generated route tests cover
the twelve new routes with a ledger seeded in every world. A practice-management system without a template waits for
its mapping, stored. The administrator still sets the proof level only through `setLedgerSettings` until the
practice's Settings screen (milestone 11): a change of proof level after entries exist needs a rule for the lines
already moved to recovered, which that screen settles. Fees and pursuit hours stay behind ADR 0042's seams. The
migration's timestamp follows the workbench's (`20261024110000_case_workbench.sql`), since the runner refuses a new
file that sorts before one already applied. With milestones 8 and 9 built, `packages/synth` requires every case
through milestone 9 to name the tests that assert it (`CODE_BUILT_THROUGH_MILESTONE`).

## Revisit when

Billing supplies fees (milestone 11); the first customers' practice-management systems need templates the column
mapping cannot express (fixed-width files, several rows per payment); a practice asks to prove recovery by a mix of
posting and deposit.
