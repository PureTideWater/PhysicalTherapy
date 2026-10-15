# 0038. Triage runs into anomalies and cases, keep five stages, and release an audit report only once a reviewer signs

- **Status:** accepted
- **Date:** 2026-10-15
- **Deciders:** founder (engineering)
- **PRD sections:** 2 (Reimbursement reviewer), 4 (Audit v0), 5 (J8, J12), 6 (Reports and exports), 7 (Anomalies, Cases,
  Reports), 8 (`anomaly`, `line_status`, `case`, `case_line`; the status machine), 12, 15 (Documents), 17 (milestone 6);
  test matrix CAS-01 to CAS-07, PRC-14, PRC-15, MAP-04; ADRs 0018, 0019, 0028, 0029, 0035

## Context

Milestone 6 asks for "cohorts, the five stages, case grouping (report-only), pursuit-cost estimate, the audit report PDF
and CSV, the independent-reviewer checklist", with the gate "the three hand-run audits reproduce from the app line for
line; an independent reviewer signs the checklist". PRD 12 states the rules (cohort minimum, per-line and case
materiality, the window open on the triage date, case grouping by payer pattern from the traces, the headline of three
numbers). What it leaves open: how a cohort compares lines of different units, which mode wins a tie, what the
"dollar range" of an anomaly is, which adjustment behaviors a trace can show, how a write-off sits beside a monotonic
stage, who triages and when, where the reviewer stands in the tenancy model, and how a report stays as generated.

## Decision

- **Packages and tables.** `@tp/triage` is pure (no database, clock or network) and tested with fast-check:
  `screenAnomalies`, `judgeLine`, `detectBehavior`, `planCases`, `caseTotals`, `deadlineState`, `pursuitCost`,
  `headline`, `checkStageEvent`, `deriveCaseState`, the closed write-off list and `triageSettings`. One migration
  (`20261018120000_triage_cases_and_audit_reports.sql`) adds six PHI tables (`anomaly`, `line_status`, `case`,
  `case_line`, `audit_report`, `audit_report_download`), each with RLS on `app.practice_ids`, FORCE, registry rows, no
  DELETE or TRUNCATE for anyone, and column grants that let the application role touch only what a person or a job
  may set. Rules that read other rows run in AFTER triggers, so a row of another practice meets the tenant policy
  (42501) before any rule sees it.
- **Anomalies (investigatory).** Lines a run could not price for want of terms (`NO_AGREEMENT`, `NO_MAPPING`,
  `AMBIGUOUS_RATE`, `NO_RATE_FOR_CODE`, `NO_PFS_VALUE`, `UNSUPPORTED_METHOD`, `DATE_OUTSIDE_VERSIONS`,
  `UNITS_RULE_UNKNOWN`) are grouped by payer and plan, code and sorted modifier set, place of service and quarter;
  below the practice's minimum (default 30) there is no anomaly. Amounts are compared **per unit** (observed allowed
  over units, half up), so a cohort mixes one- and two-unit lines fairly; the mode is the most frequent per-unit amount,
  **the lowest on a tie**; a line is flagged when the mode for its units, less what it was paid, exceeds the threshold
  (`anomaly_threshold_cents`, default **$5**, the same as the line materiality, since the plan names none). The range is
  from the sum of (gap less threshold) to the sum of gaps. An anomaly is written once per run and cohort, carries its
  distribution (`tp-anomaly-stats/1`), is labelled investigatory everywhere and is never in a case or a report total.
  Its only actions are "mark reviewed" and "convert to a validation request" (which sends the person to Coverage).
- **Validated to actionable.** Every priced line paid below its expectation is validated; it is actionable on the
  triage date when its variance reaches the per-line materiality (default $5), its window is open on that date (else
  `WINDOW_PASSED`; none known, `NO_WINDOW`), its claim is neither reversed nor superseded, its version is still signed
  off (a Medicare Advantage non-contracted line needs none) and it is not written off. Negative variance is recorded and
  shown as overpaid, never a stage and never a case (PRC-15).
- **Payer patterns from the traces.** A pattern is payer, plan, mapping kind, contract version, rate record and the
  adjustment behavior detected from the trace by working the amount out again from the trace's own values:
  `MPPR_NOT_IN_CONTRACT` (the contract's flag is off, yet the paid amount is the base less a multiple-procedure cut of
  units or units less one, within a cent), `PRIOR_YEAR_CONVERSION_FACTOR` (percent-of-Medicare paid at the prior year's
  factor) or `BELOW_CONTRACT_RATE`. One open case per pattern (a unique index); a pattern opens a case once its
  actionable lines reach the case materiality (default $250), and until then it is held and accumulates across runs
  (CAS-04). A case's state, total, deadline and closing time are derived in SQL from its lines (the sum of the variance
  of lines not written off; the earliest of their windows); nobody sets them, and a case closes written off only when
  every line is.
- **Five stages, monotonic, with explicit reopens.** `line_status` is an append-only event log; SQL refuses a move to
  the same or an earlier stage unless it is a reopen that names the stage the line is at, says why (encrypted) and is a
  person's. Payer approved and recovered are refused until the recovery ledger (milestone 9) writes them. **The stage is
  the furthest a line has reached; a write-off is an exclusion on the case line**, not a stage: the line stays visible,
  struck through, out of the total, with its reason from the closed list (`window_passed`, `payer_correct_on_review`,
  `not_worth_pursuit`, `duplicate`, `other` with words, encrypted). Reopening clears the write-off, records who, when
  and why (encrypted) and a reopen event on the stage log, and is refused past the window. When a window closes,
  **triage writes the line off itself** (`window_passed`, in no one's name), which SQL allows a job only for a window
  that has passed.
- **Who triages and when.** Triage is not chained to the price job: a person who works cases triages a complete run
  from the Cases screen (the triage job), and the report job triages its run again on the day it prints, so a report's
  windows are judged on its own date. Triage is idempotent (an advisory lock per practice; anomalies once per run and
  cohort; stages only forward; a line in at most one case).
- **Only the run in effect is triaged or reported on** (ADR 0037: a complete first run, or a re-run once a person
  accepts it). The Cases and Reports screens offer only runs in effect and their actions refuse any other; the triage
  job leaves a re-run nobody has accepted, or a run an accepted re-run replaced (`not_in_effect`, logged); the report
  job marks a report failed (`run_not_in_effect`) when its run was replaced after the request, and a new report is
  requested of the run in effect. The database refuses a report requested of any other run, and refuses to make one
  ready once its run is no longer in effect (`pricing_run_in_effect()`, `20261021090000_run_diffs_and_runs_in_effect.sql`).
  So cases and a releasable report are built only from numbers that went through acceptance, as the digest's are.
- **The audit report.** The report job (`audit_report`, three attempts with an alert on the third, ADR 0019) gathers
  `tp-audit-report/1`: coverage, anomalies, validated discrepancies by pattern with why each that is not actionable is
  not, actionable cases with deadline, pursuit cost (from the practice's staff rate and minutes; **no default**, so an
  unset practice gets "not estimated" and an evidence gap) and net expected value, payer approved and recovered (zero
  until the ledger), and evidence gaps. The headline is actionable, payer approved and recovered, with flagged
  (count and range) and validated below; every figure carries its stage label and links to its stage's section and
  screen. The PDF is printed by Playwright's Chromium from self-contained HTML (JavaScript off, every request refused);
  the line CSV names claim control numbers, so it is line-level PHI. Both are stored sealed with the practice's key
  under **keys of their own for each attempt** (the store writes an object once), and the report records their SHA-256;
  once ready its numbers and files never change (CAS-07: a reopen after it leaves it as it was; a new report shows the
  change). Downloads check the stored bytes against the SHA-256, are recorded in `audit_report_download` and audited; the
  PDF is for every reader of reports, the CSV only for roles that export PHI.
- **The independent reviewer.** The reimbursement reviewer reaches a practice the way a specialist does: an internal
  role carried in by a four-hour support grant (ADR 0028 extended: `support_grant_role` now admits the reviewer), so
  `audit_finding.validate` becomes a practice permission. It still does not count as a write: the reviewer edits nothing;
  the only record they sign is the attestation, once, while the report is ready, in their own name, naming the checklist
  items and **the SHA-256 of the PDF and CSV they reviewed, which SQL requires to be the report's own**. A report is
  released by a person who works cases, once, and SQL refuses a release without an attestation.
- **The synthetic end-to-end audit.** `fixtures/synthetic/audit/AUDIT-01/inputs.json` is declarative (settings, payer,
  plans with contracts or no agreement, groups of lines); `packages/synth` builds its 835 (with the oracle's
  expectations, so pyx12 reads it too); `tools/audit-worksheet` (Python, standard library) computes the expected report
  and line CSV from the inputs alone. `apps/web/src/lib/routes/audit-e2e.db.test.ts` runs upload, parse, mapping,
  signed-off contracts, a run, triage, the report (Chromium), the attestation and the release through the routes and
  the jobs, and compares the report figure by figure and the CSV line for line. Its windows close on 2026-05-06 or stay
  open until 2036-04-03, so the result holds on any day between.

## Consequences

- The milestone's gate is only half met: "the three hand-run audits reproduce from the app line for line" needs the
  three real audits and a reimbursement specialist, neither of which is in this repository; the synthetic audit is the
  rehearsal of the same path, and the golden lines stay `specialist_verified: false`.
- A practice's materiality and pursuit settings are read from `practice.settings` and have no screen yet (the Settings
  screen comes later); the defaults apply until then, and pursuit cost is not estimated until they are set.
- Case states other than open and closed written off arrive with submissions (milestone 8); the CHECK already lists
  them. Case lines are not re-judged when a claim is reversed after it joined; the workbench will.
- Triage and reports read the run in effect for a period; lines already in a case stay there, judged from the priced
  line they joined with, until the workbench re-judges them (milestone 8).
- The worker image carries Chromium (`playwright-core` external in the bundle, the headless shell installed in the
  runtime stage); the Dockerfile change is not built here (no Docker).
