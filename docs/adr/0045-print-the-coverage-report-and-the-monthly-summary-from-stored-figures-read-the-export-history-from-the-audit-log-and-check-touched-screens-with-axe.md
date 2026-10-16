# 0045. Print the coverage report and the monthly summary from stored figures, read the export history from the audit log, and check touched screens with axe

- **Status:** accepted
- **Date:** 2026-10-25
- **Deciders:** founder (engineering)
- **PRD sections:** 5 (J8 to J12), 6 (Reports and exports; Cross-cutting requirements: accessibility), 7 (Practice
  dashboard, Reports, Information architecture rules), 12 (What a customer sees as the headline), 13 (Recovered);
  test matrix JOB-01 to JOB-03, CAS-03 to CAS-07, LED-01; ADRs 0019, 0038, 0039, 0040, 0042, 0043, 0044

## Context

Milestones 6 to 9 built the audit report, the monthly summary, the ROI statement and the ledger. What was left open
for the practice dashboard and the Reports screen:

- the coverage report, a new report: "PDF and CSV of the Coverage screen";
- a PDF of the monthly summary, which until now was a screen and a CSV;
- an export history across every kind of report. The only record of a download is its audit event, and `audit_event`
  is readable by practice administrators alone;
- what "share within the organization" does;
- the dashboard's figures. The headline is "three numbers, never one", and every number links to the stage it came
  from;
- how the end-to-end journeys run the monitoring chain and the monthly digest without disturbing the other specs;
- how the e2e suite checks accessibility.

## Decision

**Report documents (migration `20261025090000_report_documents_and_export_history.sql`).** `report_document` is a PHI
table: practice_id, forced tenant policy, registry row, no truncate. A person with `case.work` generates a document in
their own name (a restrictive insert policy and a trigger). The web app reads its figures with the screens' own
queries and stores them as JSON in one of two checked formats:

- `tp-coverage-report/1`: the run in effect's priced share, the closed list of unpriced reasons in the Coverage
  screen's order, and every plan waiting on a mapping;
- `tp-monthly-summary/1`: the month's lines by stage and by payer, as the summary screen counts them.

Generating a document queues the worker's `report_document` job with opaque IDs only. The job prints the PDF from the
stored figures through the audit report's Chromium pipeline and seals it under
`practices/<practice>/reports/<document>/<object>.pdf`. It records the key and the SHA-256 once; the trigger allows one
update, by a job. After the third failed attempt the document is marked failed (`print_failed`) and the operator
alert of ADR 0019 fires. The CSV is computed from the stored figures each time it is downloaded, so it is ready while
the PDF is still printing. Both files hold counts, totals, codes and payer and plan names: `report.read`. The figures
never change once stored; generating again makes a new document.

**The monthly summary keeps payer approved and recovered as counts.** Their dollars belong to the recovery ledger
(ADR 0042), not to a line's variance, so the summary, its CSV and its document leave those two dollar cells blank, as
they already did for flagged.

**The export history is read from the audit log through two definer functions.** `practice_export_history(practice,
size, offset)` and `practice_export_count(practice)` return download events only. Five actions count:
`audit_report_downloaded`, `roi_statement_downloaded`, `report_document_downloaded`, `monthly_summary_downloaded` and
`packet_export_downloaded`. Each event comes with its object, purpose, actor and time. The caller needs the practice
in scope and `report.read`. A purpose of `line_export` marks a line-level export: an audit report's line CSV or a
packet's export. These stay `phi.export` (billing manager, firm principal) or, for the reviewer's copy,
`audit_finding.validate`. A viewer's refused request exports nothing, so it is not in the history. Every download of
every report file now records its event, the monthly summary's CSV included.

**Sharing is a link.** Each report page shows its own URL, with opaque IDs only, and a copy button. Whoever opens the
link signs in and reaches the report under their own role: through the practice's group, or through a support grant in
force. Nothing is sent and nothing new is stored.

**The dashboard's figures are each read the way the screen they link to reads them** (`apps/web/src/lib/dashboard`):

- Actionable is the Cases screen's figure. It links to Cases.
- Payer approved and recovered are the ledger's totals at the practice's proof level. They link to Reconciliation.
- Flagged and validated are shown below the three, with their labels. They are counted across every month and link to
  Claims and lines filtered to the stage (Claims gains a stage filter on each line's latest `line_status`).
- Recovered this quarter is the ledger's figure for entries dated in the quarter.
- Deadlines in 14 days use the Cases screen's own filter (`?deadline=14`).
- The queues are held files, plans waiting on a mapping, open questions, unreviewed anomalies, unassigned cases and
  unmatched postings, deposits and adjusted payments. Each opens its screen.

With no file yet, the dashboard shows "Upload your first 835 files" and a link to Uploads.

**The journeys run in practices of their own.** Each journey works in its own practice in the other group, so no
other spec's counts move:

- J8 is `triage.spec.ts`;
- J11 is `monitoring.spec.ts`;
- J12 is the reporting test in `reports.spec.ts`;
- J10's payer response is a step in `packets.spec.ts`;
- J4 to J7, J9 and the rest of J10 stay in their existing specs.

A payer's schedule is signed off beside the browser, through `@tp/contracts` (`e2e/journeys.ts`), as J5 does on screen
in its own spec. The e2e worker runs the real `monitor` and `digest` handlers for the monitoring journey's practice
only, emailing the digest to a local outbox directory; every other practice gets the placeholders. A month cannot end
during a test, so the J11 spec dates its line events back into the month before (test setup only, triggers off) and
asks for that month's digest.

**Accessibility is checked by axe-core in the e2e suite.** `@axe-core/playwright` 4.13.0 runs the WCAG 2.0 and 2.1 A
and AA rules on each screen the journeys touch: the dashboard, Cases, a case, Notifications, a digest, Reports, an
audit report, the reviewer checklist, the monthly summary, Coverage and a report document. Any violation fails the
spec. Keyboard navigation is checked by tabbing from the top of the page to a control, with its focus visible, and
using it with Enter (`e2e/a11y.ts`). axe is injected by Playwright for the test alone; the page never loads a script
from another origin.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| Rendering the coverage and monthly PDFs in the web request | A request would hold a browser for seconds; the worker already prints audit reports and ROI statements, with retries and the operator alert |
| Storing the CSV beside the PDF | The figures are stored already; the CSV computed from them is the same file, and it is ready before the print |
| Granting the application role a read on `audit_event` for the history | It would expose every audited read, not only downloads, to every report reader |
| A table of downloads beside the audit log | Two records of one event that could disagree; the audit log is append-only and already written in each download's transaction |
| Emailing a report to colleagues to share it | Email carries no PHI by rule; a link with opaque IDs reaches the report under the reader's own role |
| One headline figure summing the stages | PRD 12 forbids it: three numbers, never one |
| Running the real monitoring chain for every e2e practice | The chain would price, triage and notify in every other spec's practice and move their counts |

## Consequences

- `pnpm test:db` gains `apps/web/src/lib/routes/report-documents-routes.db.test.ts`, run through the routes:
  - generating the coverage report and the month's document, with the screens' own figures;
  - the job's payload, which holds opaque IDs only;
  - the CSV before the print and the PDF after it;
  - another practice refused;
  - a viewer refused the line CSV, with nothing exported;
  - the export history, with its line-level marks;
  - the dashboard's headline and queues.
- `apps/worker/src/report/documents.db.test.ts` covers the print job, and the catalog, migration and cross-tenant tests
  cover `report_document`. The route-test world gains a printed coverage report.
- The e2e suite gains the J8, J11 and J12 specs and J10's payer response, each with the axe check, and new synthetic
  personas: `triage-manager`, `monitoring-manager`, `reports-manager`, `reports-viewer` and `reports-reviewer`.
- The monthly summary's payer approved and recovered dollar cells are blank where they were zero.

## Revisit when

A customer wants a report scheduled or emailed with a link; a report document needs a figure no screen shows; the
e2e suite gains screens outside the journeys (each then gets the axe check); the digest's month can be set by a
clock the test controls.
