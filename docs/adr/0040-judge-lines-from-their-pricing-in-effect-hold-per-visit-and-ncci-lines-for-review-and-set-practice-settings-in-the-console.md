# 0040. Judge lines from their pricing in effect, hold per-visit and NCCI lines for review, and set practice settings in the console

- **Status:** accepted (amends 0038 for what triage and the audit report read and write, and 0039 for the daily
  monitor and the figure keys)
- **Date:** 2026-10-22
- **Deciders:** founder (engineering)
- **PRD sections:** 3 (Reimbursement reviewer), 4 (Audit v0), 5 (J6, J8, J11, J12, J17), 6 (Reports and exports), 7
  (Practice dashboard, Claims and lines, Cases, Anomalies, Reports), 8 (The status machine; notification and digest),
  11 (Inputs; step 2, PER_VISIT; NCCI), 12 (Anomalies; From validated to actionable; Deadlines and pursuit cost), 15
  (Email); test matrix CAS-01 to CAS-07, PRC-07, PRC-11, JOB-03; QUESTIONS Q41 and Q44; ADRs 0035, 0037, 0038, 0039

## Context

The review of milestones 6 and 7 found triage, the audit report and monitoring reading numbers a person had not
accepted, or reading a line on its own where the plan judges it with others:

- Triage took a line's validated candidate from `line_status.priced_line_id`, the run that first validated it. Stages
  never move back, so a line an accepted re-run priced again at zero variance still went into a case at its old
  variance (ADR 0037: a re-run is in effect only once accepted).
- A per-visit visit carries its whole amount on its first included line and the rest expect zero (PRD 11 step 2).
  Judged line by line, a payer that spreads the visit payment over the lines shows an "underpayment" on the carrier
  that the contract does not support, while the overpayments that offset it are dropped.
- The NCCI procedure-to-procedure flag (PRC-11) changes no price and reached nothing after pricing: a flagged line
  became actionable at full contract price.
- The report's headline actionable summed whole cases, which hold lines of other runs, while its line schedule and CSV
  listed this run's lines only: the reviewer attested figures that did not reconcile.
- Anomaly cohorts were the triaged run's lines only, a month under the monitoring chain, where PRD 12 says quarter.
- A case's lines past their window were struck only when triage next ran.
- The reviewer could write a free-text statement into the attestation, stored in plain text and shown to the viewer,
  and signed a CSV's SHA-256 they could not open.
- The database checked only that a stage event, a run or a report request was in the actor's name, not that the actor's
  role may make it.
- The monitoring figures' CHECKs accepted any lowercase key, so a name- or date-of-birth-shaped key fit.
- Nothing in the application set the practice settings pricing and triage read (ZIP, place-of-service split, rounding,
  materiality, anomaly and pursuit-cost settings): the e2e suite wrote them as superuser.

## Decision

**Pricing in effect, everywhere.** `PRICED_IN_EFFECT` (`apps/worker/src/price/in-effect.ts`) gives each service line
its priced line in the run in effect that took effect last (`RUN_IN_EFFECT`, ordered by `IN_EFFECT_SINCE`). Triage
judges the run's lines and the lines earlier triage validated (patterns below the case materiality accumulate) from
that, never from the priced line a stage event names; a line whose pricing in effect validates nothing joins no case.
The monthly summary, the digest's validated figure and coverage, and the Claims and lines status read the same rule.
Triage and reports still refuse a run that is not in effect (ADR 0037).

**A per-visit line is judged with its visit.** `priced_line_visit_variance_cents(line)` sums the variance of the run's
lines of the same claim whose traces carry the same visit (the `per_visit` step's service date and carrying line) under
the same rate record; `priced_line_shortfall_cents(line)` is the line's variance when positive, at most the visit's net
shortfall for a line of a visit, and nothing when the visit as a whole was paid in full. `@tp/triage` holds the same rule
(`shortfallOf`, `judgeLine`), and a database test compares the two on PRC-07. Until the specialist answers Q44, a line of
a visit stays validated with the reason `PER_VISIT_REVIEW` and joins no case; the golden claims G141, G145 and G150 are
judged by `tools/golden-worksheet/triage.golden.test.ts`.

**An NCCI review flag holds a line for review.** Triage reads `trace.outcome.review_flags`; a flagged line stays
validated with the reason `NCCI_REVIEW` (Q41) and joins no case. The flag is shown on the line, in the report's line
schedule and in the CSV (`review_flags`, as `NCCI_PTP:<column-one line>`). Golden G184 and PRC-11 test it.

**The report reconciles.** Each case in the report shows this run's share (its lines priced by this run and not written
off, their actionable total and deadline) beside the whole case; the headline's actionable is the sum of the shares. The
line schedule says of a line in a case through another run's pricing `CASE_LINE_FROM_OTHER_RUN`. The line CSV gains
`validated`, `visit_variance` and `review_flags`. The report test asserts that the headline actionable equals the CSV's
and never exceeds the validated total; the independent worksheet (`tools/audit-worksheet`) computes the new columns.

**Quarter cohorts, daily windows.** Anomaly screening reads the practice's lines that cannot be priced in effect whose
service dates fall in the quarters the run's period touches, across runs; an anomaly is still written once per run and
cohort. The daily `monitor` job of each active practice (ADR 0039) first writes off, window passed, every open case's
line whose window closed (`closePassedWindows`), so a case's actionable total and deadline never keep a passed line for
want of a new upload.

**An attestation holds no words.** The reviewer confirms the checklist items and the two SHA-256 under a fixed sentence
(`ATTESTATION_TEXT`); `audit_report.attestation` holds the format, the item codes and the hashes, and a CHECK refuses
anything else. The reviewer opens the line CSV through `practice.reports.review_csv` (`audit_finding.validate`), which is
recorded as a download and audited like every other.

**Writes are the roles' who make them, in SQL.** Restrictive INSERT policies for `tp_app`: a person's stage event is a
person with `case.work` in their own name, a job's is in no one's; a person creates a run with `mapping.edit` (the
monitoring job creates its own); a person requests a report with `case.work`. The setter's own-name check moved to the
AFTER trigger, so a row of another practice meets the tenant policy first. The row factory writes these rows as a
billing manager of their world.

**Figures keyed by a closed list.** `monitoring_figure_codes(leaf)` lists the figure codes a notification or a digest may
hold; only a `_by_payer` figure nests, keyed by UUIDs. JOB-03 refuses lowercase name- and DOB-shaped keys.

**Practice settings in the console.** The internal console's practice page (`/console/practices/<practice>`, platform
administrators, `organization.manage`) sets the billing ZIP, the place-of-service split, the default rounding, the line
and case materiality, the anomaly cohort minimum and threshold, and the staff rate and minutes of the pursuit-cost
estimate. The form is checked as the engine and triage read it (a blank field returns a setting to its default; the
pursuit-cost fields go together), written by `console_set_practice_settings()` (SECURITY DEFINER, platform administrators
only, the practice's one scope, keys from `practice_setting_keys()`, the rest of `practice.settings` kept) and audited
(`practice_settings_set`). The e2e pricing journey sets them there. The practice's own Settings screen stays milestone
11's.

**Screens.** Claims and lines show the line's latest stage (`lineStatusOf`), "unpriced" only from the pricing in effect
and "priced, not triaged yet" for a line priced but not judged. The practice dashboard shows coverage of the latest run
in effect, open cases by state and the cases whose deadline falls within 14 days (the digest's window), each linking to
its screen, and recovered as $0.00, labelled, until the ledger exists. Writing off a line states the consequence and asks
for a confirmation. Cases (by state, payer and deadline), Anomalies (by run and payer), Reports, the export history,
Notifications and a case's lines are paged (`apps/web/src/lib/http/paging.ts`); the runs offered for triage are the 100
newest in effect. The digest and notification-preference screens have loading states. Both CSV exports encode fields with
one encoder (`csvText`): a text field starting with `=`, `+`, `-`, `@`, a tab or a carriage return gets a leading
apostrophe; amounts, built from cents, stay unquoted numbers.

**Digest email.** The application task role may `ses:SendEmail` from the account's SES identities in its region
(`DigestEmail`), since the digest is a practice job.

**Pulled forward, recorded.** Milestone 7's prompt asks for the monitoring jobs and digests. ADR 0039 also built in-app
notifications, each person's notification preferences (in `user.settings`, a column the data dictionary's user table does
not list) and the monthly variance summary (screen and CSV), which PRD 6 places with the v1 reports and milestone 11 with
notifications and settings. They stay: the digest's figures link to the summary and the notifications are the in-app
half of the same chain step. The summary's PDF export comes with the other v1 reports (the ROI statement and the
coverage report), which share the PDF pipeline the audit report uses.

**The migration order.** The triage migration was renamed `20261019160000_triage_cases_and_audit_reports.sql`, after
`20261019150000_reruns_and_release_withdrawal.sql`, before anything was pushed or deployed; a database that applied
the old name (only local scratch databases did) is recreated.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| Store review flags and visit variance as columns of `priced_line` | A complete run's lines never change (ADR 0035); the trace holds both, and the database functions read it. Switch if reading them becomes slow |
| Validate a per-visit carrier at its own variance | Claims a shortfall the contract does not support when the payer spreads the visit; revisit with the specialist's answer to Q44 |
| Key anomalies by quarter rather than by run | Changes the table's identity; one anomaly per run and cohort keeps a run's report self-contained. Revisit if quarters repeat anomalies across month runs in a way people find noisy |
| Encrypt the reviewer's statement | The checklist and the hashes are what the reviewer attests; a statement adds nothing the report can check and is PHI-shaped free text |
| The materiality control on Cases | Only part of the settings; pricing needs the ZIP and place-of-service split before any run. The practice's Settings screen comes with milestone 11 |
| A Playwright journey for each of J8, J11 and J12 now | The route-level audit (`audit-e2e.db.test.ts`) and the worker-loop chain (`monitor.db.test.ts`) run the same handlers; the browser journeys come with the end-to-end pass over J2 and J4 to J12, once packets and the ledger (J9, J10) exist |

## Consequences

Every number a person sees or attests is read from pricing a person accepted. A case's lines that are per-visit or
flagged wait for the specialist's answers (Q41, Q44) and show why; answering them is a change to `@tp/triage` and the
database function together, with the db comparison test. The settings a run reads are set through the application. A
later milestone's Settings screen calls the same validation (`apps/web/src/lib/console/practice-settings.ts`).

## Revisit when

The specialist answers Q41 or Q44; milestone 11 builds the practice's Settings screen and the v1 reports.
