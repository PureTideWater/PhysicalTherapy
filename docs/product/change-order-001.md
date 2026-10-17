# PaidWhole Change Order 001

Amendments to the Architecture and Build Plan, issued October 16, 2026. Sources: the finalized brand, the Moat Research Review and Competitive Advantage Plan, and the adopted ProofPack specification.

## How to use this document (instructions to Claude Code)

1. **Recon first, then stop.** Inventory what the repository already contains against the Build Plan and this change order. Produce `docs/product/reconciliation-001.md` in the format at the end of this document: one row per Build Plan section or milestone touched, what is built, where it diverges, and the proposed action. Do not change code until the reconciliation is approved.
2. **The Build Plan remains the specification.** This change order amends the sections it names. Where the two conflict, this document wins. Where this document is silent, the Build Plan stands.
3. **One vocabulary.** In code, schema, UI and documents: `packet`, `packet_version`, `rate_record`, `rule_release`, `case`, `ledger_entry`, `contract calendar`, `readiness grade`. Never `ProofPack`, `proof pack`, `intelligence` (in product copy), or `recovered` without `posted` or `deposited` in the label.
4. **Nothing here changes the engine's arithmetic, the ledger's semantics, the content pipeline, the security program, or the fourteen milestones and their gates.** If a change below seems to require that, stop and ask.
5. **Every change has an acceptance check.** A change is done when its check passes in CI, not when the code exists.
6. **Work in milestone order.** A change attached to a milestone that is already complete is applied as a follow-up pull request against that milestone's code before the next milestone starts.

## What changed, in one paragraph

The name is PaidWhole and the brand is final (keystone mark, Ink and Brass, Schibsted Grotesk and IBM Plex; the brand drop-in folder ships beside this file). Independent competitive research established that every major therapy EMR already ships a variance report, that a free contingency audit and a $99 public-rate screen set the entry price, and that the data moat is legally conditional; the response is to make screening free, lead with Medicare Advantage non-contracted pricing, pull the billing-firm portfolio forward, and prove accuracy with a published benchmark. The ProofPack specification was adopted as the engineering spec for the packet and the case workbench, which adds readiness grades, hard export gates, deadline verification, export versioning and a six-tab case screen. The seal wording changed to "Verified by PaidWhole / Reconciled to cash" and the Verified marks are gated in code by the ledger.

## Changes

### CO-01 · Brand drop-in · before the first screen is built (milestone 3 at the latest)

Copy the `paidwhole-brand` folder's contents into the repository root. Follow its `README.md` wiring steps 1 to 8: `@paidwhole/brand` as a workspace dependency of `apps/web` and `apps/worker`; Tailwind preset; `tokens.css` and `brand.css` in `globals.css`; shadcn/ui CSS variables mapped to tokens; fonts only through `apps/web/lib/fonts.ts` (next/font, self-hosted); `PaidWholeLockup` at 20 px in the app header with a single brass underline on the active navigation item; `PaidWholeMark` for every small placement; `app/icon.svg`, `app/apple-icon.png`, `app/manifest.ts`; the report renderer inlines `tokens.css` and `reports/brand.css` with the font directory resolved through `assetPath("fonts")`. `.claude/rules/brand.md` applies from this point on.

Acceptance: a lint check fails on any hex color outside `packages/brand/src/tokens.css` and email templates; `VerifiedSeal` and `VerifiedBadge` render nothing when `reconciledToCash` is false; no page requests `fonts.googleapis.com` or `fonts.gstatic.com`; visual tests of the header at 1280 and 390 px and the report cover with and without the seal.

### CO-02 · Domain model approval gate · milestone 0 to 1

Add to `CLAUDE.md`: "Milestone 1 does not start until the founder approves `docs/product/domain-model.md`." If milestone 1 has already started, generate `docs/product/domain-model.md` from the current Drizzle schema and migrations (tables, keys, PHI flag, RLS policy, invariants), mark divergences from the Data dictionary tab, and stop for approval before any further schema change.

Acceptance: the file exists, matches the schema, and carries an approval line with a date.

### CO-03 · EMR export fixtures · milestone 3

`packages/synth` gains generators for synthetic twins of the ERA and payment-posting exports of WebPT Billing, Prompt, SPRY and Raintree. Until the design-partner firm supplies real format samples (never real files; format descriptions and redacted headers only), each generator is a placeholder that produces a plausible CSV with the vendor's column vocabulary and a `FORMAT_UNCONFIRMED` marker. The intake pipeline (milestone 3) treats these as first-class input formats beside raw 835 files. The `fixture-guard.sh` hook rules apply.

Acceptance: each of the four formats round-trips through intake into canonical claim lines on synthetic data; an unconfirmed format is flagged in the Coverage screen; no file without the `SYNTHSENDER` marker can enter fixtures.

### CO-04 · Free screening layer · milestone 6

A no-PHI screening flow for prospects. Input: an aggregate upload with one row per code, modifier set, units, place of service, payer product and service-date band, carrying allowed-amount total and claim count; no names, dates of birth, member IDs, dates of service or claim numbers (reject any upload containing them). Pricing: the Medicare fee schedule (locality from the practice's ZIP) and the Medicare Advantage non-contracted rule, with the standard therapy adjustments. Output: anomalies by code and payer product, missing-contract coverage, and the dollars that cannot be priced without a contract. Never a dollar labelled "owed" or "underpaid."

Design: `screening_prospect` (practice name, state, ZIP, contact email), `screening_upload` (file hash, row count, rejection reasons), `screening_run` (release pinned), `screening_result` (per row: expected under Medicare, observed, difference, reason). No `practice_id`; these tables are not PHI tables and sit outside the RLS catalog, with a test asserting they hold no PHI-shaped columns. Results expire after 30 days. Rate-limited by email domain and IP.

Acceptance: an upload with a date-of-service or member-ID column is rejected with the column named; a clean upload returns a result in under 60 seconds for 50,000 rows; no screening output contains the words owed, underpaid or recovered; conversion from screening to audit is logged as an event.

### CO-05 · Packet v0 export · milestone 6

A minimal packet for the first three audits: affected lines with expected, observed and difference; the governing rate record's page, quote and hash; the calculation trace per line; the deadline with its verification status; the reviewer's approval. PDF and CSV, hashed and stored. No workbench, no two-person UI; the founder is the reviewer and the verifier runs on every export.

Acceptance: a packet cannot be exported with a figure, date, code, count or identifier absent from its inputs; the stored hash matches the exported file; an unverified deadline blocks export.

### CO-06 · Packet and case workbench amendments · milestone 8

Adopt the ProofPack mechanics with the Build Plan's names.

- **Readiness grade** on `case`, computed and never set by hand: `E0` unsubstantiated (anomaly, or no governing contract; internal only), `E1` preliminary (candidate contract version and matched remittance; analyst review), `E2` contract_verified (approved terms, complete reproducible calculation, reconciled affected lines; actionability review), `E3` payer_ready (E2 plus attachments, verified route and deadline, final authorized approval; export permitted). Recovered is a ledger outcome, never a grade.
- **The eight E3 gates**, enforced by the verifier and by the server, not by a checkbox: exact payer, plan, legal entity and provider match; approved governing contract version with the correct effective date; matched original and subsequent claim and remittance records; reproducible calculation with every adjustment explained; source-linked evidence for every disputed line; coordination of benefits, corrected claims, reversals and duplicates addressed; dispute route, reviewer authority and deadline documented; final approval of the frozen version by an authorized reviewer who is not the drafter.
- **Numbers on a case**: allowed-amount variance is the headline; insurer-payment variance second; patient responsibility shown and never counted; the five stage totals (flagged, validated, actionable, payer_approved, recovered net) kept separate on screen, in the API, in reports and on invoices.
- **Case screen**: six tabs. Overview (stage totals, cause, readiness grade, next action); Calculations (expected against actual with every approved rule); Evidence (documents, clauses, remittance values, omissions); Affected claims (sortable lines, matching exceptions, transactions); Review and submission (deadlines, approvals, packet versions, payer interactions); Recovery ledger (corrected payments, postings, deposits, recoupments). Clicking an amount follows it from case total to line to trace to governing rule to evidence.
- **Transitions**: anomaly_detected, evidence_collection, calculation_verification, actionability_review, reviewer_approval, exported, submitted, response_review, reconciliation; closed states no_underpayment, not_actionable, rejected, expired, withdrawn. The server enforces the machine and writes rejected transitions to `case_transition_log`. An unverified deadline blocks actionability and export; the Medicare redetermination window is the worked example; no commercial deadline is hard-coded.
- **Exports**: stable packet ID, version, hash, created time, `disclosure_scope`, approving actor. Parts: PDF narrative with calculation summary; CSV or XLSX line schedule; contract excerpts and evidence; calculation manifest with rule versions and hashes; approval and submission record. Neutral language ("our review indicates a payment difference under the following terms"). Identifiers inserted at export, minimized to the recipient. A change to source evidence or an approved rule invalidates the review (`invalidated_by`) and produces a new version; sent versions are preserved. The executive summary and the internal audit manifest are separate outputs.
- **Roles**: add `financial_reviewer` (reconciles cash) and `auditor` (read-only on authorized cases) to the roles enum. The drafter cannot approve; high-dollar, novel and overridden calculations require independent sign-off (threshold in practice settings).
- **Model boundaries** (already in `packages/model-gateway`): propose contract terms, extract denial fields, explain a variance from approved engine results, draft correspondence from source-linked assertions, suggest attachments. Never compute reimbursement, decide recovery, override an E3 gate or submit.

Acceptance: readiness grade recomputes on every relevant write and cannot be set through any API; E3 export is refused when any gate fails, with the failing gate named; editing an approved calculation invalidates the review; the six tabs render for a synthetic case; `case_transition_log` holds a rejected transition from a test.

### CO-07 · Red-team step · end of milestones 6 and 11

Run the `qa-fixture-builder` agent with the brief: 100 or more adversarial synthetic cases covering patient-responsibility false positives, plan and product mismatch, expired contracts, duplicate and reversed remittances, modifier traps, missing allowed amounts, tenant leaks and PHI in logs. Output is a prioritized defect list and the tests that reproduce each, never a pass rate. Defects rated high block the gate.

### CO-08 · Firm grants and minimal portfolio · milestone 11b, before milestone 12

Practice grants already land in milestone 1. Add: the firm organization and membership flows, client invitations accepted by the practice administrator, grants with scope, expiry, approval and revocation effective on the next request, and the Portfolio screen in its minimal form (client practices, contract coverage, short dollars in window, open cases, a practice switcher). Milestone 12 keeps per-practice billing from nightly grant counts, the Verified badge on white-label reports, the practice-visible access log, and export and deletion workflows.

Acceptance: a firm user sees only granted practices; revocation takes effect on the next request; the portfolio aggregates no PHI (counts and dollars only); a firm with five practices works from one login.

### CO-09 · Test matrix and scorecard

Add to the Test matrix (`docs/product/test-matrix.md`):

- PKT-01 to PKT-10: readiness grades and the eight E3 gates (one test per gate, plus grade recomputation and the no-API-write rule).
- CAS-16 approved calculation edited invalidates the prior review. CAS-17 the same issue across payers yields separate cases. CAS-18 missing contract never exceeds E1. CAS-19 multiple plausible terms block validation. CAS-20 secondary payer requires coordination-of-benefits logic or review. CAS-21 corrected claim links versions without double counting. CAS-22 payer reduction without authority in contract or policy is not alleged as an error. CAS-23 already corrected underpayment closes without erasing history. CAS-24 changed patient responsibility recalculates exposure. CAS-25 outside the window is non-actionable absent another route.
- LED-12 reversal with a provider-level adjustment nets to no cash change. LED-13 a later recoupment is a negative event against net recovery.
- SEC-16 revoked grant removes access while the practice keeps its data. SEC-17 screening tables hold no PHI-shaped columns.
- SCR-01 to SCR-06: screening upload rejection, pricing, expiry, rate limit, wording, conversion event.

Add `docs/product/scorecard.md`: the five moat measures (contracts under verification, practices per firm login, benchmark precision, gross retention, hours to onboard) and the nine commercial measures (verification accuracy, false-positive rate, coverage across priced lines, analyst minutes per completed case, time from first import to validated finding, payer acceptance rate, net cash reconciled, cost per validated discrepancy, partner-client adoption), each with its query and its owner. Report monthly from the first audit.

### CO-10 · Gates

Update `docs/product/gates.md`. Gate 1 (July 15, 2027) adds: 200 lines independently re-priced with zero unsupported owed claims; at least one submitted correction with a documented payer decision; two EMR export formats processed without bespoke engineering. Gate 2 (March 31, 2028) adds: one firm with five or more practices on one login; analyst hours saved measured against the firm's baseline; recovered cash tracked separately from payer-approved dollars for 90 days. Milestone 6 and milestone 11 each gain the red-team step as an exit condition.

### CO-11 · Positioning and product copy

In `packages/brand/src/tokens.ts` and the copy constants of `apps/web`: tagline "Know what you're owed. Verify what you're paid."; descriptor "Contract-verified payment for therapy groups"; independence claim "independent of the EMR and the payer," never "independent verification platform"; seal text "VERIFIED BY PAIDWHOLE" over "RECONCILED TO CASH"; the printed definition "Verified: recovered amounts reconcile to posted or deposited remittance; expected amounts trace to signed-off contract versions."; screening never says owed, underpaid or recovered; "recovered" is always labelled posted or deposited; no "AI", "intelligence" or "ProofPack" in product copy.

Acceptance: a copy lint fails on the forbidden terms in `apps/web` and report templates.

### CO-12 · Data model changes (for the Data dictionary)

| Table | Change |
| --- | --- |
| `case` | add `readiness_grade` enum (E0, E1, E2, E3), computed; add `independent_signoff_required` boolean derived from settings |
| `case_transition_log` | new: case_id, from_state, to_state, actor_id, allowed boolean, reason, at |
| `packet_version` | add `deadline_verification_status` enum (verified, unverified, not_applicable); `disclosure_scope`; `invalidated_by` (evidence_change, rule_change, null); `invalidated_at` |
| `packet_export` | ensure parts are recorded: narrative_pdf, line_schedule, evidence_bundle, manifest, approval_record, each with hash |
| roles enum | add `financial_reviewer`, `auditor` |
| `screening_prospect`, `screening_upload`, `screening_run`, `screening_result` | new, no PHI, outside the RLS catalog, 30-day expiry |
| `practice_settings` | add `independent_signoff_threshold_cents`, `novel_rule_requires_signoff` boolean |

No table loses a column. No ledger or pricing table changes.

## What must not change

The expected-payment engine's methods, flags, rounding and unpriced reasons. The ledger's entry types and the definition of recovered. The content release pipeline and the hooks that protect it. Row-level security, the PHI table registry, the catalog test. The fourteen milestones, their checks and the gates' dates, except as amended in CO-10. The schedule's pace assumption of 13 hours a week until the full-time trigger.

## Reconciliation report format (`docs/product/reconciliation-001.md`)

| Build Plan section or milestone | Built | Diverges from plan | Change order items that touch it | Proposed action | Effort |
| --- | --- | --- | --- | --- | --- |

Rows for every milestone 0 to 13 and for the sections amended here (7 Screens, 8 Domain model, 12 Triage, cases and packets, 3 Users, roles and tenancy, 18 Testing). "Built" is one of: not started, partial, complete. End the report with the ordered list of pull requests you propose, each with its acceptance check, and stop.
