# PaidWhole best-option audit

*2026-10-18. Read-only review of claude/build-platform (PRs 1 to 4 merged), PR 5 (/home/user/pr5) and PR 6 (/home/user/pr6) against CLAUDE.md, change order 001, reconciliation 001, the PRD and ADRs 0056 to 0062.*

## Summary

I took the 105 proposals that survived an adversarial check against the code, merged the duplicates into 64 upgrades, used the checkers' corrections wherever a proposal was wrong, and kept only what is truly better for accuracy, trust, the user or growth. Eleven are critical: each one puts a wrong number in front of a customer or a payer, or lets patient data into the free screening. Most of them sit in the arithmetic around the pricing engine, not in the engine's core: denied lines counted as underpayments, Medicare sequestration compared against the wrong figure, bundled codes such as 97010 priced as if Medicare pays them, approved packets that keep exporting figures after a correction, and dispute deadlines marked 'verified' without knowing what date they run from. Several fixes (#4, #5, #6, #26, #61) can still go inside PR 5 and PR 6 before they merge, which is the cheapest moment there will be, and the GitHub governance fixes (#12) should land before either branch merges. Thirty-seven upgrades are high (a real user cannot do something important, or a large growth limit) and sixteen are medium. Twelve need an exception to the change order's freeze, and several need you to revisit a ruling or an accepted decision; they are listed under 'Decisions only you can make'. The honest cost is roughly 2,550 to 4,150 added hours, of which roughly 1,100 to 1,900 fall ahead of Gate 1. At the change order's 13 hours a week, Gate 1's July 15, 2027 date cannot hold with this list, so either the build's weekly capacity grows or the gate dates move; that choice is yours.

**Counts:** 11 critical, 37 high, 16 medium (64 in all); 12 need a freeze exception. **Added hours:** about 2,550-4,150 (critical 428-682, high 1,613-2,623, medium 521-829), plus 30-60 for each clearinghouse connector.

Critical means a wrong number, a privacy or trust failure, or a launch blocker. High means a real user cannot do something important, or a large limit on growth. Medium is a real improvement that blocks nothing.

## All upgrades at a glance

| # | Upgrade | Severity | Lands in | Added hours | Freeze exception |
|---|---|---|---|---|---|
| 1 | Denied lines are counted as contract underpayments | Critical | PR 6d (triage accuracy), before PR 7; template wording in PR 6 | 60-100 | no |
| 2 | Sequestration is compared against the wrong figure | Critical | PR 6c (engine corrections), before PR 7 and before PR 13 | 40-64 | yes |
| 3 | Bundled and non-payable codes are priced as if Medicare pays them | Critical | PR 6b (it already reopens this engine step under an approved exception), or PR 6c right after | 12-20 | yes |
| 4 | Approved packets keep exporting figures after a correction or a withdrawn release | Critical | PR 5 before merge (the check, copy, triage reason); PR 11 (refresh on accept, withdrawal fan-out, sent-packet alert, pattern-change rule) | 30-48 | no |
| 5 | A 'verified' deadline can be later than the real one | Critical | PR 5 before merge (guard, MA fail-closed); PR 6c (engine); PR 8 (MA plan policies, one route record per level) | 60-95 | yes |
| 6 | The free screening can receive one patient's service line | Critical | PR 6 before merge | 8-14 | no |
| 7 | The ledger compares payer approvals in allowed amounts and proof in cash | Critical | PR 15b beside PR 15; pull it earlier if ROI statements reach customers before PR 15 | 32-56 | yes |
| 8 | The payer's 835 that arrives after an EMR export is ignored | Critical | PR 4b for the adjustments, deposit, comparison and hold; PR 11 for the replace action | 80-120 | no |
| 9 | Claim-level copays create false underpayments | Critical | PR 6d, before PR 7 | 30-45 | no |
| 10 | The multiple-procedure reduction is applied per claim, not per patient-day | Critical | PR 6c, sequenced with PR 6b so one engine version bump covers both | 50-80 | yes |
| 11 | The insurer-payment figure and prompt-pay interest overstate what the payer owes | Critical | Interest basis before the first real packet (with PR 6d); the full insurer figure in PR 13 with D31 | 26-40 | no |
| 12 | Make your approval and the CI gate real | High | Governance PR now, before PR 5 and PR 6 are approved and merged | 20-34, plus about an hour of your settings | no |
| 13 | The Verified seal claims only what it proves | High | Small follow-up PR to PR 1, before PR 7's red team and before any ROI statement reaches a customer | 8-14 | no |
| 14 | The same payment under another trace number loads twice | High | PR 4b, before PR 7 | 34-56 | no |
| 15 | Excel-damaged files silently lose proof of recovery | High | The quick part first (PR 4b's first commits, or a small PR now); the fallback and .xlsx in PR 4b, before PR 7 | 55-90 | yes |
| 16 | Unit cuts are invisible | High | PR 6d, before PR 7 | 32-50 | no |
| 17 | Commercial reductions: allege only what the documents support | High | PR 8 (records) and PR 9 (holds and gates) | 40-64 | no |
| 18 | Therapists not yet credentialed with the payer | High | New PR before the first real audit (after PR 6b), or the front of PR 8; the gate in PR 9 | 55-85 | no |
| 19 | Name the payer's mistake in code | High | PR 9 with the authority review; the cause shown on the case screen in PR 13 | 50-85 | no |
| 20 | Small per-line shortfalls never become cases | High | PR 6d (or PR 7) | 12-24 | no |
| 21 | Warn people before a dispute deadline passes | High | Alerts PR right after PR 5 merges (the specialist-queue counts can go in PR 5); the approver choice in PR 14 | 50-80 | no |
| 22 | Runs nobody triages, and re-pricing one click at a time | High | Triage after every run: now, before PR 7 (a few hours). Review page and withdrawal re-runs: PR 11 or a PR 11b right after. Firm counts: PR 17 | 45-70 | no |
| 23 | One unmapped plan freezes a whole month | High | PR 6c, before PR 7 so the red team attacks it | 32-48 | yes |
| 24 | Multi-site groups are priced at one ZIP code | High | PR 6b stores ZIP+4 on the site record; resolution in a new PR right after PR 6b | 45-75 | no |
| 25 | Releasing packets: a reviewer queue now, a risk-based policy at scale | High | Reviewer queue: small PR right after PR 5 and PR 6b. Policy: PR 14, never before the single-user change (#35) | 58-100 | no |
| 26 | Export refusals are only written to a log | High | PR 5 before merge; optional table in PR 8 | 14-20 | no |
| 27 | Blind re-pricing that proves accuracy, and a benchmark buyers can reproduce | High | PR 7 (harness and definitions); PR 7b before the first real audit (the blind check); the public page after release 1 and the specialist's answers | 70-120 | no |
| 28 | One payer split in two between 835s and EMR exports | High | PR 4b (at the latest, the schema in PR 8 and the gate in PR 9) | 32-56 | no |
| 29 | EMR exports work only for four invented layouts | High | PR 4b | 80-130 | no |
| 30 | Rehab-agency and hospital outpatient claims cannot be priced | High | PR 6b's exception, or PR 6c right after | 24-40 | yes |
| 31 | Price Original Medicare lines and use them to check our own accuracy | High | PR 6b or PR 6c (outcome, participation); PR 7 (scorecard); PR 9 (export gate) | 50-80 | yes |
| 32 | Work that starts before a case exists | High | PR 8 (schema), PR 9 (grades), PR 10 (transitions), PR 13 (screens) | 30-50 | no |
| 33 | One case status, and a closed state for a case that was paid | High | PR 8 (vocabulary and rules), PR 10 (transitions), PR 13 (screens) | 26-44 | no |
| 34 | Every figure explained in words, and the drill-down guaranteed | High | Renderer: small PR right after PR 5 merges; acceptance tests in PR 12 and PR 13 | 38-60 | no |
| 35 | Owner-plus-biller practices are treated as one-person practices | High | PR 14 | 20-36 | no |
| 36 | The worker process cannot act as a person | High | New PR just before PR 16, so the red team attacks it | 32-56 | no |
| 37 | Being signed out mid-narrative loses the work | High | Small PR before PR 7 | 16-24 | no |
| 38 | An outside auditor sees only the cases under review | High | PR 14 | 45-70 | no |
| 39 | A free screening a practice can finish: drop the 835 files | High | PR 6e, after PR 6b, before the screening opens with release 1 | 90-140, plus 40-70 for the visit follow-on | no |
| 40 | The screening says something about the commercial and MA contracted book | High | PR 6e | 40-60 | no |
| 41 | Screening results visible to the business, with consent | High | PR 6e, before the screening opens; the conversion measures in PR 7's scorecard | 26-42 | no |
| 42 | Fee schedule exhibits entered in minutes, not hundreds of forms | High | New PR after PR 6b, before PR 7 (before design-partner contracts arrive) | 70-110 | no |
| 43 | Firm clients onboard without a founder call | High | PR 17; direct self-serve from a screening in a new PR after PR 17 | 55-85, plus 25-40 for screening self-serve | no |
| 44 | The firm's working surface: full portfolio, deadline queue, grant renewals | High | PR 17; the firm ROI and payer view in milestone 12 | 55-90 | no |
| 45 | A time log so pursuit cost and hours saved are real | High | PR 8 (table), PR 13 (screens), PR 17 (baseline); PR 7 marks the measures as missing until then | 36-60 | no |
| 46 | Billing that follows customer size and gets firm-paid practices right | High | PR 17 (who pays, consent); milestone 12 (invoicing, per-practice price, refusal) | 48-80 | no |
| 47 | Remittances that arrive by themselves, and knowing when one is missing | High | Freshness and gate: PR 9 and the dashboard. Secure drop: a new PR beside milestone 12. Connectors: per partner, after the design-partner interviews | 80-130, plus 30-60 per clearinghouse | yes |
| 48 | Screens that stay fast as history grows | High | New PR just before PR 17, or the start of PR 17 | 35-55 | no |
| 49 | The packet cover identifies the provider the way payers file disputes | Medium | PR 8 and PR 9 (records and check); PR 12 (cover) | 16-26 | no |
| 50 | Export-loaded claims are missing the patient name and member ID | Medium | PR 4b (fields and identity fill); PR 12 (readiness check) | 20-34 | no |
| 51 | A status page outside the app, and recovery from a regional outage | Medium | New infrastructure PR before the first production deploy | 35-55 | no |
| 52 | A contract calendar with cited notice terms that rolls forward | Medium | PR 8 (citations, rolling calendar, digest); milestone 13 (alerts) | 28-45 | no |
| 53 | Contract escalators | Medium | PR 6c | 26-40 | yes |
| 54 | Mutation testing that actually runs on the money code | Medium | PR 7 (or the governance PR) | 32-60 | no |
| 55 | The red team keeps every case it writes | Medium | PR 7; the same rules in PR 16 | 26-42 | no |
| 56 | Payer submission layouts for bulk disputes | Medium | PR 12 (columns in PR 8) | 28-44 | no |
| 57 | A capacity baseline and backlog alarms | Medium | New PR after PR 17, before Gate 1 and milestone 12 | 45-75 | no |
| 58 | Task-bound access for contract specialists | Medium | PR 14 | 40-64 | yes |
| 59 | Claims and lines: payer, reasons in words, filters that reach the remedy | Medium | Small PR after PR 6b; the export in milestone 12; the volume work in the final pass | 34-54 | no |
| 60 | Bulk mapping and bulk case work | Medium | Mapping in bulk: a small new PR; case lines and layout: PR 13; bulk assign: PR 17 | 40-55 | no |
| 61 | Packet builder: no dead Approve button, one form, accessibility everywhere | Medium | PR 5 before merge (the page); PR 7 (the accessibility gate) | 16-28 | no |
| 62 | Getting to your first finding | Medium | Inside PR 7 beside the scorecard, or a small PR after it | 20-32 | no |
| 63 | Single sign-on for firms and groups | Medium | Milestone 12 | 80-120 | no |
| 64 | Show customers that disputed patterns stay fixed | Medium | PR 13 (case screen) and milestone 12 (ROI page, firm roll-up) | 35-55 | no |

## Where the work lands

- Governance PR: new, now, before PR 5 and PR 6 are approved and merged.
- PR 5 / PR 6 before merge: changes inside the two open branches, while their migrations are still unmerged.
- PR 6b: the already-approved ZIP+4 engine exception.
- PR 6c: new. Engine corrections under one freeze exception, after PR 6b and before PR 7, so one engine version bump covers them.
- PR 6d: new. Triage accuracy (no engine change), before PR 7.
- PR 6e: new. Screening value, after PR 6b and before the free screening opens with release 1.
- PR 4b: new. EMR-export intake follow-up to PR 3 and PR 4, after PR 6b and before PR 7, so the red team attacks it.
- Alerts PR: new, right after PR 5 merges.
- PR 7b: new. Blind re-pricing check, after PR 7 and before the first real audit.
- PR 15b: new. Ledger amounts in payment terms, beside PR 15.
- PR 7 to PR 17, milestones 12 and 13 and the final pass are as planned in reconciliation 001.

## Critical (11)

### 1. Denied lines are counted as contract underpayments

**Critical** · Lands in: PR 6d (triage accuracy), before PR 7; template wording in PR 6 · Added hours: 60-100 · Freeze exception: no

- **Planned now:** When a payer denies a line (no authorization, visit limit reached, duplicate, filed late, not covered) it pays zero. The engine still prices the line at its full fee, so the whole fee shows as a shortfall, and triage never reads the payer's reason codes. The line becomes a validated, actionable 'paid below the contract rate' finding, and a packet would present a denial as an underpayment.
- **Best option:** Read every line's adjustment and remark codes and classify them through a versioned rule record, never a model. A line whose zero or reduced payment is explained by a denial keeps its price and trace but never becomes validated, never joins a case, and is reported as its own figure, 'Denied: not a rate variance', by category, with the fix for each (get the authorization, appeal medical necessity, correct and resubmit, bill the primary payer). A partly paid line with a denial code goes to review; a bundling denial on a contract without the NCCI flag goes to the reduction-authority review (#17); a code the release does not know holds the line instead of validating it. Store the remark codes the parser already reads, and widen the denial categories (duplicate, coordination of benefits, not covered). The screening template tells prospects to leave denied lines out of their totals.
- **Why it matters:** Denials are the most common zero-pay lines in a therapy 835. Today they inflate every audit's actionable headline and every case total, and a packet that calls an authorization denial an underpayment gets rejected whole and makes the payer distrust the next one.
- **What it changes:** Pricing engine: no (it still prices denied lines; only triage changes). Ledger: no. Database: yes, a new practice-scoped table for remark codes and wider denial categories (domain model approval), plus a synthetic rule release loaded through /load-release. Freeze exception: no.
- *Plan reference: Triage; QUESTIONS Q25; PRD 12*

### 2. Sequestration is compared against the wrong figure

**Critical** · Lands in: PR 6c (engine corrections), before PR 7 and before PR 13 · Added hours: 40-64 · Freeze exception: yes

- **Planned now:** Medicare Advantage lines lose 2% to sequestration. The engine's expected amount already has the 2% taken out, but the allowed amount the payer reports on the 835 is normally before sequestration. So a correctly paid line shows as overpaid by about 1.6%, small underpayments flip to overpayments, and every shortfall is understated. The repository's own golden line G01 line 3 is underpaid by 50 cents but recorded as overpaid by 31 cents. Your free-screening ruling compares before sequestration, so the screening and the paid audit disagree on the same rows.
- **Best option:** The engine produces two figures, each rounded once with its unrounded value kept: the expected allowed amount before sequestration, and the amount after it, with sequestration moved to the last adjustment step. The variance compares like with like: an 835 that reports the payer's allowed amount is compared with the before-sequestration figure; a line whose allowed amount is paid plus patient share (every EMR export) is compared with the after figure. Where the 835 lists the 2% on the line, code checks it and flags a mismatch for review without changing any price. New engine version and new runs, with a reviewed golden diff like D001. The insurer-payment figure (#11) reads the after-sequestration figure.
- **Why it matters:** The error sits on every Medicare Advantage non-contracted line, the product's lead offering: it hides small underpayments and puts an expected amount in the packet that a payer reviewer recomputing '100% of Medicare' will find wrong.
- **What it changes:** Pricing engine: yes (order of adjustments and the variance step). Ledger: no. Database: two new columns on priced lines, filled on new runs only (domain model approval). Freeze exception: yes, plus your ruling on moving sequestration last in PRD 11 step 4.
- *Plan reference: Engine steps 4c and 7; Q21; D31; PR 6 owner ruling 2*

### 3. Bundled and non-payable codes are priced as if Medicare pays them

**Critical** · Lands in: PR 6b (it already reopens this engine step under an approved exception), or PR 6c right after · Added hours: 12-20 · Freeze exception: yes

- **Planned now:** The engine prices any Medicare fee-schedule record whatever its status code. 97010 (hot or cold packs) is status B: Medicare bundles it into the visit and never pays it separately, yet it is billed on a large share of PT visits and its listed values come to about $5 to $6. Status I codes such as 97014 price the same way. Every Medicare Advantage visit with 97010 becomes an actionable 'underpayment', and the free screening tells prospects Medicare underpaid them on every visit.
- **Best option:** Price only status A. Every other status stops with the existing reason 'no fee-schedule value' and a named detail: bundled, carrier-priced, not valid for Medicare, not covered, deleted, or conditional (status T, until the specialist rules). A status the engine does not recognize also stops. Screens and the screening explain these rows ('Medicare bundles this code into the visit'). If the specialist finds a contract that pays a bundled code, that comes in as an explicit contract term, never a default. Bump the engine version and add golden claims.
- **Why it matters:** A billing person spots a 97010 allegation instantly: it is a false claim to a payer in the audit and a credibility-killing first impression in the free screening.
- **What it changes:** Pricing engine: yes (the fee-schedule step; the closed list of unpriced reasons is unchanged). Ledger: no. Database: no. Freeze exception: yes.
- *Plan reference: Engine step 2; QUESTIONS Q10*

### 4. Approved packets keep exporting figures after a correction or a withdrawn release

**Critical** · Lands in: PR 5 before merge (the check, copy, triage reason); PR 11 (refresh on accept, withdrawal fan-out, sent-packet alert, pattern-change rule) · Added hours: 30-48 · Freeze exception: no

- **Planned now:** Once a line is in a case it keeps the priced line it had when the case opened. When a re-run is accepted (a CMS or contract correction) or a rule release is withdrawn because its content was wrong, an approved packet still passes approval, export and attestation, because those checks compare against the frozen case line. PR 5's withdrawal check covers only Medicare deadline windows, so a percent-of-Medicare contract line priced under a withdrawn release still exports. The screen says 'the case is judged again first', but nothing re-judges it until PR 11, which comes after PR 8 to PR 10 and relies on the daily monitor.
- **Best option:** In PR 5 before it merges, add one database check, 'is this version's pricing still current': every line must still carry the pricing in effect, its release must not be withdrawn, and its contract version must still be signed off and cover the service date (this also catches a back-dated amendment). Enforce it at approval, export request, the export job, the export guard and attestation. Do not refuse to log a submission that already happened outside the product; flag it instead. Show the old and new expected figures and fix the copy. Add a triage reason so actionable totals drop on a withdrawal, and refuse an audit report built on a withdrawn release. In PR 11: accepting a re-run refreshes its cases in the same step; withdrawing a release queues every affected practice at once; packets already sent get an alert with a per-line difference so the practice can send the payer a correction; and a line whose re-pricing changes its pattern leaves the case with a coded reason.
- **Why it matters:** Re-runs are routine (CMS publishes corrections every quarter), so today an approved packet can ask a payer for an amount PaidWhole already knows is wrong, which is exactly Gate 1's 'unsupported owed claim'.
- **What it changes:** Pricing engine: no. Ledger: no. Database: replaced bodies of existing check functions, written into PR 5's unmerged migration (you reconfirm the domain-model hash). Freeze exception: no.
- *Plan reference: D30; ADR 0061; PR 5 export guard; PR 11*

### 5. A 'verified' deadline can be later than the real one

**Critical** · Lands in: PR 5 before merge (guard, MA fail-closed); PR 6c (engine); PR 8 (MA plan policies, one route record per level) · Added hours: 60-95 · Freeze exception: yes

- **Planned now:** A contract dispute window can only be 'N calendar days from the payment date'. The specialist records the number of days and a quote, but not what the window runs from or whether the days are business days, so 'within 180 days of the date of service' is verified with a deadline weeks too late, and PR 5's export gate trusts it. Medicare Advantage non-contracted lines are verified from Original Medicare's redetermination window at level L2 (read by a person, not confirmed by the specialist), while question Q34 still asks whether that window applies at all; MA payment disputes actually run through each plan's own dispute policy. The synthetic L2 records state no start date.
- **Best option:** In PR 5 before merge: the window citation also records its unit and what it runs from (date of service, remittance date, payment date, receipt), chosen from fixed lists and taken from the quote; 'verified' is refused unless the computed rule matches, and the abstraction screen shows the computed rule (for example 'ends 90 calendar days after the remittance date') beside the quote. Medicare Advantage non-contracted deadlines stay unverified until the specialist confirms the route (Q34); this means no MA packet exports until then. In PR 6c (freeze exception): the engine computes contract windows from the cited start and unit, and picks the MA route from the line's facts (payment dispute or reconsideration), each with its own record; after an upheld reconsideration the case waits for the independent reviewer instead of showing a provider deadline. In PR 8, with D33's dispute route: each plan's published dispute policy is cited on the MA mapping, and every dispute level uses one record shape. A contract that defers to the provider manual cites the manual's pages and revision date.
- **Why it matters:** A deadline marked verified that falls after the real one is the worst failure this product can have: the billing manager files on the stated date, the payer refuses it as late, the money is gone, and 'verified' stops meaning anything.
- **What it changes:** Pricing engine: yes, only the window calculation and the MA route lookup. Ledger: no. Database: new fields on the window evidence in PR 5, frozen at approval. Freeze exception: yes, for the engine part only. Expect MA actionable totals to drop until Q34 is answered.
- *Plan reference: D17; ADR 0061; engine dispute windows; Q34; D33*

### 6. The free screening can receive one patient's service line

**Critical** · Lands in: PR 6 before merge · Added hours: 8-14 · Freeze exception: no

- **Planned now:** A screening row may have a claim count of 1. A count-1 row with a calendar quarter, next to the practice's name and ZIP, is one patient's service line with a date finer than the year, which is not de-identified under HIPAA Safe Harbor. The prospect has no BAA, the screening tables are built and tested as non-PHI, and the public page promises 'no patient information'.
- **Best option:** Require at least 11 claim lines per row (the CMS small-cell standard), as one setting enforced in the browser, in the server's check and in a database rule. The browser leaves small rows out before sending and tells the person how many rows, claim lines and dollars it left out, and the result says so too. A request that bypasses the browser is refused with row numbers. The template states the floor. Counsel confirms the number and whether it counts lines or patients (a plan of care can give one patient 11 lines in a quarter; if counsel says patients, add a patient-count column).
- **Why it matters:** Your main lead channel would otherwise accept PHI from covered entities with no BAA into tables built as non-PHI: a privacy and legal failure that takes about a day to fix.
- **What it changes:** Pricing engine: no. Ledger: no. Database: one rule on the screening table, written into PR 6's own unmerged migration so it needs no extra approval round. Freeze exception: no.
- *Plan reference: D18 to D20; ADR 0062*

### 7. The ledger compares payer approvals in allowed amounts and proof in cash

**Critical** · Lands in: PR 15b beside PR 15; pull it earlier if ROI statements reach customers before PR 15 · Added hours: 32-56 · Freeze exception: yes

- **Planned now:** A payer 'approved' ledger entry is the increase in the allowed amount, while posted and deposited entries are cash. With 20% coinsurance, a $30.00 allowed increase pays $24.00: the line never reaches recovered and the ROI statement carries $6.00 'approved but not posted' forever. Worse, a line-level posting proves the gross payment rather than the payment net of the reversal it replaced, so recovered can include the patient's share, or money the payer never paid when a deductible absorbed the increase; and a later reversal takes back $30 against $24 posted. No ledger test has a patient share.
- **Best option:** Keep deciding the outcome on the allowed amount (approved, confirmed, decreased, no change), as PRD 13 says, but measure every ledger amount in what the payer actually pays: 'approved' is the payer's payment increase on the line, a posting share is net of the reversal it replaced, and a reversal takes back what was paid. A correction a deductible absorbed is recorded with no entry and the case closes as 'payer corrected; balance is the patient's', never as recovered and never as no change. The allowed increase and the patient's share are shown beside it as 'billable to the patient', never counted. The definition of recovered, the proof cap and the seven entry types do not change. New ledger fixtures cover coinsurance, a deductible and a copay.
- **Why it matters:** Recovered is the number buyers and firms audit first, and today it is wrong in both directions on every coinsurance line.
- **What it changes:** Pricing engine: no. Ledger: yes, the amounts matching writes (you also settle PRD 13, which defines 'approved' two different ways). Database: no new columns; the figures come from stored line data. Freeze exception: yes.
- *Plan reference: Ledger matching; PRD 13; LED-02, LED-09*

### 8. The payer's 835 that arrives after an EMR export is ignored

**Critical** · Lands in: PR 4b for the adjustments, deposit, comparison and hold; PR 11 for the replace action · Added hours: 80-120 · Freeze exception: no

- **Planned now:** When a practice's EMR export of a payment loads first, the payer's own 835 for the same payment arrives later, is held, and nothing from it loads; the receipt says to open a support ticket. An export never carries provider-level adjustments, so a recoupment in that 835 (the repository's own test PAR-16 has a $75 one) never reaches the ledger: recovered is overstated and the seal can appear over money the payer took back. The bank deposit, which is the 835's payment net of those adjustments, can never match, and corrected claims never reach the adjusted-payments queue.
- **Best option:** Keep the 835 authoritative and never replace priced lines silently (D13). When the 835 is held: add its provider-level adjustments to the export's remittance exactly once, with the 835 as evidence, so recoupments and interest flow through the ledger's unchanged rules; store the 835's net payment so the deposit matches; replace the support-ticket line with a code-computed comparison, claim by claim and line by line; hold any line where the 835 disagrees on allowed, paid or patient share, so no packet rests on figures the payer's own record contradicts; and link corrected claims. Then add a person-confirmed 'Replace with the payer's 835' action while nothing from the payment is in a case, ledger match or packet: the export's remittance is retired as a whole, the 835 loads, and a new pricing run prices it.
- **Why it matters:** Loading the EMR export first is normal for EMR-export practices and for firms loading a backlog, and today a payer's clawback in the later 835 never reduces recovered, so the ROI statement and the seal overstate.
- **What it changes:** Pricing engine: no. Ledger: no rule changes; the entries arrive through existing rules. Database: new columns (evidence, net payment, a 'replaced' status) and one shared 'claims in effect' rule that every reader uses (domain model approval). Freeze exception: no.
- *Plan reference: D13; ADR 0060*

### 9. Claim-level copays create false underpayments

**Critical** · Lands in: PR 6d, before PR 7 · Added hours: 30-45 · Freeze exception: no

- **Planned now:** When a payer reports a copay only at claim level, the parser spreads it over the claim's lines by charge and triage judges each line alone. On a claim paid to the cent with a $40 copay, 97110 shows a $26.04 'shortfall'. Another legal 835 shape makes the parser count the copay twice, which shows false overpayments and hides real underpayments.
- **Best option:** Fix the parser so the claim-level share is spread only over lines it actually reduced, and judge such claims as a whole against the claim's exact figures: the claim's lines validate at most the claim's net shortfall, nothing when it nets to zero, and a claim with an unpriced line goes to review. Store each case line's claimed amount so the case total, the packet and the ledger all use it. The packet schedule shows the claim-level share once and says the payer reported it at claim level.
- **Why it matters:** It manufactures tens of dollars of shortfall on correctly paid claims at exactly the payers that report copays at claim level, and one disproven line discredits the whole packet.
- **What it changes:** Pricing engine: no. Ledger: reads the new claimed amount. Database: one new column on case lines (domain model approval). Freeze exception: no.
- *Plan reference: ADR 0021; triage*

### 10. The multiple-procedure reduction is applied per claim, not per patient-day

**Critical** · Lands in: PR 6c, sequenced with PR 6b so one engine version bump covers both · Added hours: 50-80 · Freeze exception: yes

- **Planned now:** The engine applies the multiple-procedure reduction within each claim, while Medicare applies it across all of one patient's claims for the day. A clinic that bills PT and OT on separate claims keeps one unit whole on each, so the expected amount is too high by roughly $6 to $15 per extra claim. The same gap lets a coding-edit (NCCI) pair split across two claims slip through.
- **Best option:** Price a patient-day together: the worker groups one patient's claims in the run, the engine ranks the day's therapy units across them (by payee, payer, patient and date) and keeps exactly one whole, and the coding-edit check spans the same group. A primary and a secondary claim for the same services are never pooled. Triage caps pooled lines at the group's net shortfall, so a payer that kept a different unit whole raises no false allegation. No reads across runs are needed, because monthly runs already hold the whole day. Golden worksheet first.
- **Why it matters:** Multi-discipline clinics usually bill each discipline on its own claim, so every such visit becomes a false Medicare Advantage allegation, and the pattern logic groups them into a case of false lines.
- **What it changes:** Pricing engine: yes. Ledger: no. Database: no. Freeze exception: yes.
- *Plan reference: Engine step 4a; QUESTIONS Q15*

### 11. The insurer-payment figure and prompt-pay interest overstate what the payer owes

**Critical** · Lands in: Interest basis before the first real packet (with PR 6d); the full insurer figure in PR 13 with D31 · Added hours: 26-40 · Freeze exception: no

- **Planned now:** D31 plans the case's second figure as 'expected allowed minus the observed patient share, compared with paid'. That holds the patient's share fixed, so on a coinsurance line it charges the payer for the patient's coinsurance on the shortfall (in the worked example the payer owes $7.84 and D31 shows $9.80), and on most lines it simply repeats the headline. PR 5's prompt-pay interest is computed on the allowed shortfall, so the interest line in packets already built is too high by the patient's share.
- **Best option:** Compute what the payer owes in code from the line's own cost sharing: a copay and a met deductible stay fixed, coinsurance scales at its observed rate, sequestration applies to the payer's part, one rounding. Where it cannot be known (the deductible took the whole line, the line was denied, the share was reported only at claim level), show a range from zero to the shortfall with the reason, never one number. Show the change in the patient's share as its own figure, never counted. Use the payer's figure, or the low end of the range, as the interest basis.
- **Why it matters:** The interest line goes to the payer; overstating it on every coinsurance line makes the packet look careless and invites the reviewer to discount the rest.
- **What it changes:** Pricing engine: no. Ledger: no. Database: no. A packet format version bump for the interest section. Freeze exception: no. It must use the same basis as the sequestration fix (#2).
- *Plan reference: D31; PR 5 prompt-pay interest*

## High (37)

### 12. Make your approval and the CI gate real

**High** · Lands in: Governance PR now, before PR 5 and PR 6 are approved and merged · Added hours: 20-34, plus about an hour of your settings · Freeze exception: no

- **Planned now:** The domain-model approval is a line of text any session can type, and the approval of record was committed by the build agent. The agent works on GitHub as your own admin account, opening and merging pull requests. No branch is protected: PR #7 (PR 5's branch) went into main 51 seconds after it opened while CI was still running, and CI then failed; main, the default branch, now fails CO-02's own check, and Dependabot and scheduled jobs run against it. The protective hooks (approval line, fixtures, content releases) stay off until the final pass. Each approval asks you to re-read about 6,000 lines with no summary of what changed. The repository is public.
- **Best option:** Give the build agent its own GitHub identity (a machine user or app with write but not admin rights) and take your admin token out of agent sessions. Protect main and the integration branch: required checks, branches up to date before merge, no force pushes, administrators included; then require your review on migrations, the domain model, content releases, CLAUDE.md and the .claude and .github folders. Until the agent has its own identity, sign each approval with your own SSH key (ideally a hardware key) and have CI verify the signature. Switch on the hooks now (hooks only; the push block and sandbox stay for the final pass). Open each approval with 'changes since the last approved document', with row-level security, the PHI registry and grants first. Make the integration branch the default (or point Dependabot at it), repair main, and consider making the repository private (branch protection on a private repository needs a paid GitHub plan).
- **Why it matters:** CO-02 exists so you control the schema of a PHI system; today nothing shows you approved anything, and a failing change already reached the default branch, which is the first thing a SOC 2 auditor or an acquirer's diligence will find.
- **What it changes:** Pricing engine: no. Ledger: no. Database: no. GitHub settings (your clicks), the CI workflow, the approval check and a summary generator. Freeze exception: no.
- *Plan reference: D1, D4, D14; CO-02; ADR 0059*

### 13. The Verified seal claims only what it proves

**High** · Lands in: Small follow-up PR to PR 1, before PR 7's red team and before any ROI statement reaches a customer · Added hours: 8-14 · Freeze exception: no

- **Planned now:** The ROI statement's seal reads 'Verified by PaidWhole / Reconciled to cash' when every line is at the practice's proof level, and that level defaults to 'posted'. Posting rows are usually auto-posted from the same ERA, so they are not evidence of cash; virtual-card payments post in full but deposit 2 to 5% less. The printed definition says expected amounts trace to signed-off contract versions, which is false for Medicare Advantage non-contracted lines. At posted level the statement says 'this practice supplies no deposit data' even when bank files were uploaded.
- **Best option:** Award the seal and badge only at deposited proof, where every line is backed by a matched bank deposit; a posted statement carries no mark and says 'Recovered (posted): not yet matched to a bank deposit'. Use one always-true definition ('signed-off contract versions or the released Medicare fee schedule', in the brand owner's words) everywhere the mark appears. Make the posted wording true, and on the proof-level setting show the posted and deposited totals side by side once bank files exist.
- **Why it matters:** The ROI statement is how an owner judges PaidWhole against its fees; if its one trust mark overclaims, every figure under it loses credibility. The trade-off: practices that cannot supply deposit data never earn the seal.
- **What it changes:** Pricing engine: no. Ledger: an added refusal reason on the report (recovered, stages and matching unchanged). Database: no. You amend CO-11 and BRAND.md section 6, and the brand owner approves the words. Freeze exception: no.
- *Plan reference: ADR 0057; D9, D11; CO-11*

### 14. The same payment under another trace number loads twice

**High** · Lands in: PR 4b, before PR 7 · Added hours: 34-56 · Freeze exception: no

- **Planned now:** An EMR export and an 835 count as the same payment only when their trace numbers match. ADR 0060 accepts that the same payment under another trace 'loads twice, the second for no review'. All four export layouts are guesses, so a 'Check #' column may hold a deposit or batch number, and Excel turns a 15-digit trace into 1.23457E+14. Two exports that name the payee differently also load twice. A double load doubles variance, cases and report totals, and since priced lines are permanent it cannot be undone.
- **Best option:** At load, independent of the trace: when every claim of an incoming payment matches already-loaded claims of one other payment (claim number, patient account number, dates, charge and paid) and the amount agrees, hold it for review as 'same payment under another trace', linked to the earlier one; never drop it. A person can release it as a genuinely different payment, and that decision is recorded. Two 835s keep the existing reprocessing rules, so a payer's reprocessed claim still reaches the ledger. As a backstop, triage marks a line that repeats an open case line from another remittance, with no reversal between them, as not actionable, applied only to the non-authoritative copy so the real shortfall still counts once.
- **Why it matters:** A doubled payment doubles every shortfall and sends the payer two disputes for one claim, and it cannot be undone once priced.
- **What it changes:** Pricing engine: no. Ledger: no. Database: a small practice-scoped table recording release decisions (domain model approval). Freeze exception: no.
- *Plan reference: D13; ADR 0060 Consequences*

### 15. Excel-damaged files silently lose proof of recovery

**High** · Lands in: The quick part first (PR 4b's first commits, or a small PR now); the fallback and .xlsx in PR 4b, before PR 7 · Added hours: 55-90 · Freeze exception: yes

- **Planned now:** Posting, bank and EMR exports are accepted as CSV only. A workbook is refused with 'Save it as CSV and upload it again', and that advice causes the damage: Excel writes long trace numbers as 1.23457E+15, drops leading zeros and rewrites dates and dollar formats. The readers accept any text as a trace, and a posting or bank row with an unreadable field is silently dropped while the screen says 'Read into rows and reconciled' with zero rows. Rows match remittances by exact trace text, so damaged traces never match, and a damaged EMR export loads beside its own 835.
- **Best option:** First, quickly: record for every export how many rows were left out and why (column and row number, never values) and show it; refuse identifier cells written in scientific notation; change the advice to 'export again from your system; do not open and re-save it in Excel'; and accept '$1,234.56', accounting negatives and M/D/YYYY dates exactly. Then: when no exact trace matches, try the trace without leading zeros, but only with an exact amount match and never a partial one, and record how it matched. Then read .xlsx natively with a hardened reader built on the zip limits the contracts code already uses in production: dates from cell styles, amounts from their stored decimal text, numbers too long to be exact held for review.
- **Why it matters:** Proof of recovery silently disappears in a routine billing workflow, so the recovered total and the ROI statement understate with nothing on screen saying why, and the export path can double a payment.
- **What it changes:** Pricing engine: no. Ledger: readers gain additions, and matching gains the zero-tolerant fallback. Database: possibly a small table or report field for left-out rows. Freeze exception: yes, only for the trace-matching fallback, if you count matching rules as frozen.
- *Plan reference: ADR 0059, ADR 0060; D14*

### 16. Unit cuts are invisible

**High** · Lands in: PR 6d, before PR 7 · Added hours: 32-50 · Freeze exception: no

- **Planned now:** The engine prices the units the payer paid, not the units billed (stored and never read), although the plan and the trace both say 'units as billed'. A payer that pays 3 of 4 billed units shows zero variance, the medically-unlikely-units check can never fire, a lesser-of contract compares mismatched figures and can invent a variance, and a fully cut line (0 paid units) crashes as an engine error that pages the operator.
- **Best option:** Price the billed units. For claims with cut units, price a second time at the paid units through the unchanged engine (as the screening already prices twice), and split the variance exactly into a rate part and a units part. The rate part follows the normal rules; the units part is held for review until the treatment record supports the billed units (a reviewer can release it). Show the payer's reason code for the cut, label authorization cuts as such, and show billed and paid units side by side. Each export format states which units its column carries.
- **Why it matters:** Unit cuts are a frequent therapy underpayment, and today they read as zero on every screen and in the Gate 1 audits.
- **What it changes:** Pricing engine: methods unchanged (it is called twice, as the screening does). Ledger: no. Database: new columns on priced lines (domain model approval). Freeze exception: no.
- *Plan reference: PRD 2 point 6; ADR 0060*

### 17. Commercial reductions: allege only what the documents support

**High** · Lands in: PR 8 (records) and PR 9 (holds and gates) · Added hours: 40-64 · Freeze exception: no

- **Planned now:** D32 holds a commercial shortfall explained by a reduction (for example the multiple-procedure reduction) for review when the rate record 'quotes no authority', but rate records never store a quote for their reduction flags. So every commercial case of this kind would be held forever, or the default 'off' would be read as authority. Contracts that pull in the payer's reimbursement policies by reference are not modeled, nothing says what ends a hold, and your confirmation of what CAS-22 means is not recorded.
- **Best option:** For each reduction flag (multiple procedure, assistant, sequestration, NCCI), record its cited basis on the rate record once, at abstraction: a contract clause; an incorporated payer policy (the clause plus the policy document with its effective dates); the specialist's signed attestation that the contract is silent and incorporates nothing; or 'incorporation clause, policy not on file'. An incorporated policy that authorizes the reduction turns the flag on, so the engine prices it and nothing is alleged. Silence or an express exclusion makes the case actionable with a cited statement. A missing policy holds the case with 'obtain the payer's policy in force on these dates'. A payer policy that reduces differently from Medicare's method is shown, never alleged. Verifying refreshes the held lines at once, and Coverage shows 'waiting on authority review' by dollars and earliest deadline.
- **Why it matters:** Commercial multiple-procedure reductions are one of the most specific findings this product makes; as planned they are either frozen in review or alleged against payers whose own policy allows them.
- **What it changes:** Pricing engine: no (flags and defaults unchanged). Ledger: no. Database: added evidence fields and a new non-PHI document kind (domain model approval). Freeze exception: no. You confirm CAS-22's meaning in the PR 8 approval.
- *Plan reference: D32; CAS-22*

### 18. Therapists not yet credentialed with the payer

**High** · Lands in: New PR before the first real audit (after PR 6b), or the front of PR 8; the gate in PR 9 · Added hours: 55-85 · Freeze exception: no

- **Planned now:** Nothing records whether a therapist is credentialed with a payer. A new therapist's lines, paid out of network or denied, are priced at the in-network contract rate and become actionable. The rendering NPI is stored and never read, and rate records limited to a provider type can never price because the type is never passed in.
- **Best option:** A participation record per payer and NPI, with dates, status and cited evidence, confirmed by a person from a roster the app builds from the remittances. 'Not participating' takes lines out of validated and actionable. Lines with credentialing denial codes go to review. A concentration check flags one NPI being short where colleagues are paid at contract, which catches the problem in the first audit with no data entry. 'No record' blocks only the payer-ready gate and shows on Coverage. Pass the provider type to the contract lookup.
- **Why it matters:** In therapy groups the most common false underpayment is a therapist not yet credentialed; the payer rejects it, and the practice has sent an unsupported claim.
- **What it changes:** Pricing engine: no (it supplies an input the lookup already defines). Ledger: no. Database: one new practice-scoped table (domain model approval). Freeze exception: no.
- *Plan reference: D33; E3 gate 1*

### 19. Name the payer's mistake in code

**High** · Lands in: PR 9 with the authority review; the cause shown on the case screen in PR 13 · Added hours: 50-85 · Freeze exception: no

- **Planned now:** Triage names only two specific causes (a reduction not in the contract, last year's conversion factor); everything else is 'paid below the contract rate', and the detectors only work on percent-of-Medicare contracts. D34 deferred a model-written 'explain a variance' because the model gate is blocked on credentials.
- **Best option:** Explain causes in code: each detector re-prices the line with the unchanged engine with exactly one thing changed, and must explain the payer's figure to the cent. Add: paid at the Medicare rate where the contract pays more; facility rate applied; sequestration not in the contract; assistant reduction without the modifier or not in the contract; last year's fee schedule; the superseded contract version (fixed schedules too, grouped by version so one missing amendment is one case); and another locality (only when the same locality explains several codes, and checked first against our own locality). Two causes that both fit are held as ambiguous. Reduction causes feed the authority review (#17). The payer's reason code is quoted as corroboration, never used to decide.
- **Why it matters:** A packet that names exactly what the payer did ('paid the facility rate for place of service 11') is one system change for the payer to fix, while 'paid below the contract rate' invites a claim-by-claim review; different causes also stop sharing one case.
- **What it changes:** Pricing engine: no (called, not changed). Ledger: no. Database: no. Freeze exception: no.
- *Plan reference: D34; triage behaviors*

### 20. Small per-line shortfalls never become cases

**High** · Lands in: PR 6d (or PR 7) · Added hours: 12-24 · Freeze exception: no

- **Planned now:** A line counts as actionable only at a $5 shortfall. Systematic underpayments, such as last year's conversion factor (about 3.2%) or a schedule loaded a few percent low, come to 80 cents to about $5 a line, so 4,000 lines worth $8,000 show $0 actionable and never open a case. PRD 20 calls the $5 an estimate.
- **Best option:** Judge materiality on the pattern: a line counts when its shortfall is more than payer rounding can explain (more than a cent per billed unit; lines a detector explains to the cent need only clear one cent), and the $250 case threshold stays the dollar gate. The per-line dollar threshold becomes an optional practice setting. Cases and packets show the line count, median shortfall and percent of expected, so approvers can spot an input error. The anomaly screen keeps its own $5.
- **Why it matters:** In default settings, the patterns the product exists to find show $0 in every audit headline.
- **What it changes:** Pricing engine: no. Ledger: no. Database: no. You approve the PRD 12 and PRD 20 wording. Freeze exception: no.
- *Plan reference: PRD 12, PRD 20; CAS-05*

### 21. Warn people before a dispute deadline passes

**High** · Lands in: Alerts PR right after PR 5 merges (the specialist-queue counts can go in PR 5); the approver choice in PR 14 · Added hours: 50-80 · Freeze exception: no

- **Planned now:** No deadline notification exists. The digest is monthly and counts deadlines within 14 days of the digest day, so a deadline on the 16th to the 31st never reaches anyone by email, and second-level deadlines after a denial are left out. The daily monitor silently writes off every line whose window has closed. The 'waiting on deadline verification' figure is one total that mixes passed windows with other blockers, the specialist queue does not list contracts whose window needs citing, and 'Request approval' notifies no one.
- **Best option:** A daily alert ladder: at 30, 14, 7 and 2 days before a case's deadline, alert the owner (or every billing manager if it has no owner), add the approvers at 7 days if nothing is approved or exported, and the administrator at 2 days; stop once it is submitted. One daily roll-up email per person (counts, dollars, days left, one link; no dates or patient data). A morning notice when windows closed overnight. Alerts on unverified deadlines say the export is blocked and also reach the specialist queue, which lists the windows to cite sorted by earliest end. Split the waiting figure by cause. 'Request approval' notifies a chosen approver. The digest covers through the next digest, and the dashboard shows passed, 7, 14 and 30-day bands for cases not yet submitted.
- **Why it matters:** One missed deadline loses a whole case's money for good, and the product itself writes the line off without a word.
- **What it changes:** Pricing engine: no. Ledger: no. Database: new notification kinds and preference keys (domain model approval). Freeze exception: no.
- *Plan reference: PR 10, J11; D17; ADR 0039*

### 22. Runs nobody triages, and re-pricing one click at a time

**High** · Lands in: Triage after every run: now, before PR 7 (a few hours). Review page and withdrawal re-runs: PR 11 or a PR 11b right after. Firm counts: PR 17 · Added hours: 45-70 · Freeze exception: no

- **Planned now:** Only runs the monitor creates are triaged. A billing manager's own run prices and then nothing reaches Cases, and because the monitor now treats that month as covered, those lines never reach validated, a case or the digest while their windows run. Accepted re-runs are not triaged either. A correction or a withdrawn release must be re-run and accepted one run at a time, per month and per practice.
- **Best option:** Triage after every run that takes effect: a person's first run when it completes, and a re-run when it is accepted (with the case refresh from #4). A daily job spots a newer release, a mapping correction or a back-dated contract sign-off, and creates re-runs only where lines actually change. One review page per practice shows a combined difference by cause and what it will set off (cases sent back for checking, sign-offs required), and accepts the selected re-runs in one action by their exact IDs. A withdrawal queues its re-runs automatically. The firm portfolio shows pending counts.
- **Why it matters:** Validated shortfalls silently drop out of cases and digests today, and January and correction season turn into hundreds of clicks for firm analysts.
- **What it changes:** Pricing engine: no. Ledger: no. Database: one rule relaxed so a job may create a re-run after a withdrawal (domain model approval). Freeze exception: no.
- *Plan reference: ADR 0037, 0038, 0039; J17*

### 23. One unmapped plan freezes a whole month

**High** · Lands in: PR 6c, before PR 7 so the red team attacks it · Added hours: 32-48 · Freeze exception: yes

- **Planned now:** If any plan in a month has no mapping, the whole month's pricing run is refused and the monitor waits. A practice's first EMR export brings new plans, so every month it touches stops. Meanwhile the mapped payers' lines in that month go unpriced and their dispute windows run out unseen.
- **Best option:** Price the month anyway: lines of an unmapped plan get the existing 'no mapping' reason and everything else prices. Warn before a manual run instead of refusing it. When the plan is mapped, create at most one re-run per affected month and let them be accepted together. The dashboard shows the dollars waiting and the earliest window among them. You decide whether a re-run that only prices the newly mapped lines takes effect without a separate acceptance.
- **Why it matters:** Payers add plans all the time; one two-claim plan should not stop findings for every payer that month.
- **What it changes:** Pricing engine: no. Ledger: no. Database: no. Freeze exception: yes, because the milestone 3 check reads 'an unmapped plan blocks pricing'.
- *Plan reference: MAP-01; milestone 3 check; ADR 0060*

### 24. Multi-site groups are priced at one ZIP code

**High** · Lands in: PR 6b stores ZIP+4 on the site record; resolution in a new PR right after PR 6b · Added hours: 45-75 · Freeze exception: no

- **Planned now:** One ZIP per practice sets the Medicare locality for every line, although the plan treats locations as attributes of claims. North Carolina, the launch state, has one locality, so nothing is wrong today. In California, New York, Texas, Florida, Illinois, Pennsylvania or Missouri, a group with clinics in two localities gets every line priced at the billing office's locality: false allegations where the clinic's rate is higher, missed money where it is lower.
- **Best option:** A dated register of each practice's sites (address ZIP and ZIP+4, the NPIs each site bills under, which therapists work where). Code decides each site's locality on each date; single-locality practices see no change. In a multi-locality practice each claim is assigned to a site by its payee NPI, then by rendering NPI only when that therapist works at one site; a claim no rule resolves is held, counted but carrying no dollars in any total, until someone assigns the NPI on Coverage. The unchanged engine gets the site's ZIP, and each priced line records which site and which rule were used.
- **Why it matters:** Multi-site groups and their billing firms are the growth customers; this must be in place before onboarding any group outside a single-locality state.
- **What it changes:** Pricing engine: no (it already takes a ZIP per claim). Ledger: no. Database: a new practice-scoped table and new columns on priced lines (domain model approval). Freeze exception: no.
- *Plan reference: ADR 0062; QUESTIONS Q37; PR 6b*

### 25. Releasing packets: a reviewer queue now, a risk-based policy at scale

**High** · Lands in: Reviewer queue: small PR right after PR 5 and PR 6b. Policy: PR 14, never before the single-user change (#35) · Added hours: 58-100 · Freeze exception: no

- **Planned now:** PR 5 makes every payer submission, at every practice, wait for PaidWhole's reimbursement reviewer (you, in v0) to open a four-hour support grant (which another internal person must create, and which notifies the practice administrator), download both files and attest. There is no queue across practices and no alert, so a packet can sit until its window closes and the monitor writes it off; practices can already download the files, so the gate mainly blocks logging the submission. The Medicare Advantage regulation confirmation is repeated for every packet version, and D29 counts every re-run as an 'override', so the yearly CMS update would send every case to extra sign-off.
- **Best option:** Now, right after PR 5: a console reviewer queue across practices, sorted by deadline, with no patient data; the export job raises the access request automatically; reviewers get alerts, and the practice sees how long it has waited. In PR 14, after the payer-ready gates and D27: a review policy set from each practice's agreement. PaidWhole's attestation stays required for audit engagements, one-person practices, high-dollar, novel or overridden cases without a practice second signer, and practices that buy PaidWhole review; elsewhere a practice approver who did not draft it releases the packet, still downloading and hash-checking both files. Where review is required, the practice's own downloads wait for it too. A code-chosen sample of the other exports gets a non-blocking quality review that feeds the scorecard. 'Overridden' comes from what caused the re-run (mapping, contract, settings), not from a routine release update. The MA confirmation is kept per case and carried across versions until its citation, release or mapping changes.
- **Why it matters:** As built, PaidWhole headcount caps how many packets every customer can send, firms cannot run their own disputes, and an approved packet can miss its window in a queue nobody sees.
- **What it changes:** Pricing engine: no. Ledger: no. Database: a practice setting, a reviewer notification kind, a console read function and permission rows (domain model approval). Freeze exception: no. Your download-before-attest ruling is kept wherever attestation applies.
- *Plan reference: D16, D29; ADR 0061; ADR 0028*

### 26. Export refusals are only written to a log

**High** · Lands in: PR 5 before merge; optional table in PR 8 · Added hours: 14-20 · Freeze exception: no

- **Planned now:** When PR 5's export job refuses a packet (case changed, deadline not verified, inputs differ, verifier failed), it only writes a log line and finishes as a success. The page said 'Reload in a moment', and after reloading it shows the same notice and the same Export button with no reason. The most common refusal comes when a line's window closes after approval, exactly when the billing manager is racing the rest. A job that crashes is equally invisible.
- **Best option:** Check what can be checked before queuing (case unchanged, inputs current) and say no immediately with the remedy. Record every refusal or failure as a coded event with no patient data, and show the latest attempt on the packet page as in progress, refused with its fix, or failed. The payer-ready gates and invalidation refusals later use the same channel.
- **Why it matters:** A billing manager working against a 90-day window clicks Export, sees nothing happen, and retries, files a ticket or misses the deadline.
- **What it changes:** Pricing engine: no. Ledger: no. Database: none now (audit events); an optional attempts table in PR 8. Freeze exception: no.
- *Plan reference: PR 5 export job; ADR 0061*

### 27. Blind re-pricing that proves accuracy, and a benchmark buyers can reproduce

**High** · Lands in: PR 7 (harness and definitions); PR 7b before the first real audit (the blind check); the public page after release 1 and the specialist's answers · Added hours: 70-120 · Freeze exception: no

- **Planned now:** Gate 1 requires 200 lines independently re-priced with zero unsupported owed claims, and the change order promises 'a published benchmark'. Nothing in the product does either; the reviewer's attestation is one signature over the report, not a per-line, blind check.
- **Best option:** Build a blind re-pricing check into the reviewer's report review, before release: a seeded random sample across all priced lines (more owed lines, plus some correctly paid and some unpriced), shown with the remittance facts and the contract documents but not the engine's choices or figure. The reviewer enters the amount and cites the clause; code compares to the cent and checks the cited page; release is refused while a sampled owed line is unsupported. Results feed the gates and the scorecard and add up to Gate 1's 200. Add a fixed root-cause code to 'payer correct on review' write-offs. Publish a benchmark on public CMS data only, reproducible by anyone, with each line labelled specialist-verified or worksheet-consistent; never publish agreement on synthetic fixtures as proof of accuracy.
- **Why it matters:** It is the accuracy evidence for the funding gate and the answer to 'every EMR has a variance report'; done before release, it stops a wrong owed claim from reaching a customer.
- **What it changes:** Pricing engine: read only. Ledger: no. Database: two new practice-scoped tables and an attestation field (domain model approval). Freeze exception: no.
- *Plan reference: PR 7; CO-09; CO-10 Gate 1*

### 28. One payer split in two between 835s and EMR exports

**High** · Lands in: PR 4b (at the latest, the schema in PR 8 and the gate in PR 9) · Added hours: 32-56 · Freeze exception: no

- **Planned now:** An EMR export names the payer and plans by text, while the 835 identifies them by ID, so one payer's shortfalls split into separate patterns that each must reach $250 alone (for example $180 and $150: neither opens a case). The mapping screen only lets an export plan use a contract of its own text-named payer, so the export months cannot be priced under the payer's existing contract without abstracting that contract a second time. Your 'No payer aliasing' ruling assumed the plans could be mapped to one contract, which the app refuses.
- **Best option:** Let a person link payers and plans within a practice; code never links them by name. Suggestions come from evidence the loader already has (the same payment matched by claim numbers), with a name match only as a weak hint. Once a billing manager confirms (audited and reversible): the export plan uses the 835 plan's mapping, so there is no second contract; patterns, anomaly groups, digests, packets and the payer-ready check use the 835 payer; held patterns combine at the next triage; open cases keep their keys and a person decides any collision. A global payer directory (identifiers only) can come later for milestone 13.
- **Why it matters:** Shortfall goes unpursued without anyone noticing, and a billing manager with both kinds of file cannot price a payer's export months at all without duplicating the contract.
- **What it changes:** Pricing engine: no. Ledger: no. Database: two new practice-scoped link tables (domain model approval). Freeze exception: no. Needs your new ruling refining 'No payer aliasing'.
- *Plan reference: D12; ADR 0060 ruling 'No payer aliasing'*

### 29. EMR exports work only for four invented layouts

**High** · Lands in: PR 4b · Added hours: 80-130 · Freeze exception: no

- **Planned now:** The EMR-export reader knows four vendor layouts, all invented placeholders; a real file whose headers differ is held whole until a vendor description arrives and a developer changes code. Posting exports can be mapped in the browser, EMR remittance exports cannot. One export is limited to 4 MiB (you kept that limit on 2026-10-18).
- **Best option:** A per-practice column mapper that can add several columns into one field (deductible plus coinsurance plus copay) and refuses a column that is just a computed remainder. A preview runs the existing balance checks on the person's sample and flags a likely swapped patient-share column. In the worker, compare mapped lines with any matching 835: a layout becomes verified after enough lines agree, or after a second person checks sample lines against the EMR screen. Until then Coverage says 'not verified' and cases resting on those lines cannot export a payer packet (the same applies to the placeholder layouts). Verified layouts' headers can be shared with other practices. Optionally, if you reopen 'Both limits stand', a streaming reader lifts the 4 MiB limit.
- **Why it matters:** As built, the export path cannot load a single real customer file, and a swapped column passes every balance check and produces false shortfalls in payer packets; only the comparison with the 835 catches it.
- **What it changes:** Pricing engine: no. Ledger: no. Database: a new practice-scoped layout table and a reference on documents (domain model approval). Freeze exception: no; the size part needs your ruling.
- *Plan reference: D12; ADR 0059, ADR 0060*

### 30. Rehab-agency and hospital outpatient claims cannot be priced

**High** · Lands in: PR 6b's exception, or PR 6c right after · Added hours: 24-40 · Freeze exception: yes

- **Planned now:** A line billed on an institutional claim (rehab agency, CORF, hospital outpatient, Part B nursing facility or home health) has no place of service, so every percent-of-Medicare and Medicare Advantage line stops as an engine error and alerts the operator. On a mixed claim, a facility type of 22 or 23 can be misread as a place of service and priced at the lower facility rate.
- **Best option:** Decide once per claim whether it is institutional. Add a cited rule record, through the release pipeline, that maps the bill type to Medicare's non-facility fee-schedule setting (CMS manual chapter 5); critical access and Maryland waiver hospitals stop with a named reason; a contract that names its own setting wins. The trace records the basis. The screening accepts a facility type in place of a place of service.
- **Why it matters:** Many large multi-site PT groups bill as rehab agencies; today none of their Medicare-referenced lines can be priced, so the biggest accounts get the biggest coverage hole.
- **What it changes:** Pricing engine: yes (a new input in the fee-schedule step and a new rule type). Ledger: no. Database: no. Freeze exception: yes.
- *Plan reference: Parser; QUESTIONS Q08*

### 31. Price Original Medicare lines and use them to check our own accuracy

**High** · Lands in: PR 6b or PR 6c (outcome, participation); PR 7 (scorecard); PR 9 (export gate) · Added hours: 50-80 · Freeze exception: yes

- **Planned now:** Original Medicare maps as 'government', which means no agreement: its lines are unpriced with the remedy 'None'. The free screening prices those same rows, so a prospect sees Medicare anomalies and then the paid audit shows them unpriced.
- **Best option:** Add an Original Medicare mapping kind priced under the same Medicare terms, and treat it first as a benchmark: compare the engine's figure before sequestration with the Medicare contractor's allowed amount, leaving out lines with MIPS adjustments, and record the practice's Medicare participation status (non-participating providers are allowed 95%). A disagreement goes to the specialist, who attributes it to the contractor (then it is disputable under Medicare's own windows) or to us (a quality defect). Medicare Advantage packet lines export only when the same practice's Original Medicare lines agree for the same code, locality and quarter. Report the agreement as the scorecard's benchmark precision.
- **Why it matters:** The Medicare contractor's payment is the closest thing to ground truth the engine will ever get, so every customer file becomes a continuous test that catches a wrong release before it turns into a false Medicare Advantage allegation.
- **What it changes:** Pricing engine: yes (a new outcome; terms and arithmetic unchanged). Ledger: no. Database: the mapping-kind rule and a participation setting (domain model approval). Freeze exception: yes.
- *Plan reference: QUESTIONS Q01; mapping kinds; CO-09*

### 32. Work that starts before a case exists

**High** · Lands in: PR 8 (schema), PR 9 (grades), PR 10 (transitions), PR 13 (screens) · Added hours: 30-50 · Freeze exception: no

- **Planned now:** Anomalies (a group of lines paid below its usual amount) have no owner, due date or clock, and are recreated for every pricing run. Unpriced lines carry no dispute window, so a commercial underpayment waiting on a contract loses its window with nothing on screen.
- **Best option:** Keep D24 (no pre-case grades inside the case table) and add a lasting work item per payer, plan and fix (get the contract, map the plan, get the schedule, ask the specialist), with an owner, a next action, a checklist and a grade derived by code, carried across runs. Give it a clock computed from the default windows, labelled 'if your contract is silent; it may set an earlier date'. Coverage sorts these by dollars at risk, the digest warns 30 days out, and the item closes itself when the contract is signed off and the period re-priced.
- **Why it matters:** A new practice usually has most of its contracts missing, and the windows keep running while the documents are gathered.
- **What it changes:** Pricing engine: no. Ledger: no. Database: a new practice-scoped table (domain model approval). Freeze exception: no.
- *Plan reference: D24; anomalies*

### 33. One case status, and a closed state for a case that was paid

**High** · Lands in: PR 8 (vocabulary and rules), PR 10 (transitions), PR 13 (screens) · Added hours: 26-44 · Freeze exception: no

- **Planned now:** D25 adds a second status column using CO-06's vocabulary, which has no closed state for a case that was won and paid, and no path back for a second-level dispute. The two columns could disagree, four places already word case status differently, and readiness shows as codes.
- **Best option:** One database routine writes both columns, with a rule that they can never disagree. Add a success closed state ('reconciled': every line not written off is recovered), which a recoupment reopens. Write the transition table into PR 8's domain model, including the loop to a second-level dispute and 'expired'. Use one 'is this case open' rule for every count, one shared wording for status everywhere (step plus outcome, such as 'Reopened by a recoupment'), and readiness in words with the failing gates named.
- **Why it matters:** Every won case, the product's central outcome, would otherwise show as open forever in the billing manager's queue and the firm portfolio.
- **What it changes:** Pricing engine: no. Ledger: read only. Database: rules on the case table (domain model approval; you approve the extra state). Freeze exception: no.
- *Plan reference: D25*

### 34. Every figure explained in words, and the drill-down guaranteed

**High** · Lands in: Renderer: small PR right after PR 5 merges; acceptance tests in PR 12 and PR 13 · Added hours: 38-60 · Freeze exception: no

- **Planned now:** The line trace page prints each calculation step as raw computer text, viewers see no steps, unpriced reasons show as bare codes, and the packet review screen and the packet PDF word the calculation differently. D5 (b) leaves open deferring the drill-down, the executive summary and the audit manifest, and PR 12's and PR 13's acceptance checks never test them or the executive and auditor export scopes.
- **Best option:** One code-only renderer turns each line's stored trace into a plain sentence (for example '2 units x $50.00 = $100.00 under the contract's page 2 clause; rounded once; observed $70.00; short $30.00'), used on the line trace, the case Calculations tab, the packet review and the packet PDF, so the reviewer approves exactly what the payer reads. It says only what the trace records; a flag that is off is never worded as the contract's position. A test fails if any figure in a sentence is not in the trace or the rate record. Viewers get a version without dates. Close D5 (b) now, and add acceptance tests: a click path from case total to evidence, and each export scope's identifiers (the executive export carries none).
- **Why it matters:** CFOs, billing managers and payer reviewers trust a number only when they can follow it, and today an executive export carrying member IDs would pass every planned check.
- **What it changes:** Pricing engine: no. Ledger: no. Database: no. Freeze exception: no.
- *Plan reference: D34, D5 (b); PR 12, PR 13*

### 35. Owner-plus-biller practices are treated as one-person practices

**High** · Lands in: PR 14 · Added hours: 20-36 · Freeze exception: no

- **Planned now:** A drafter can approve their own packet alone after 24 hours when nobody else in the practice holds approval rights. The owner (practice administrator or viewer) cannot hold approval rights, so the common owner-plus-biller practice counts as single-user and every packet routes to PaidWhole.
- **Best option:** A free add-on 'packet approver' right that a person can hold on top of their existing role, so the owner approves in their own name and the practice gets ordinary two-person approval. For a truly one-person practice, record the drafter's act as the practice's authorization, not as the independent approval, which then comes only from PaidWhole's reviewer; drop the 24-hour wait. The approval card says 'Add approval to your owner's login, or send for PaidWhole review'.
- **Why it matters:** Small PT practices are common, and sending every one of their packets to PaidWhole staff caps growth and puts you on every small customer's critical path.
- **What it changes:** Pricing engine: no. Ledger: no. Database: roles and the one-membership-per-organization rule (domain model approval). Freeze exception: no.
- *Plan reference: D27*

### 36. The worker process cannot act as a person

**High** · Lands in: New PR just before PR 16, so the red team attacks it · Added hours: 32-56 · Freeze exception: no

- **Planned now:** The web app and the background worker share one database login, and each declares who is acting. The worker is the most exposed process (it parses untrusted files and runs a browser to print packets), and a compromise there could forge an approval, a contract sign-off or an attestation in any practice's name. ADR 0061 defers closing this.
- **Best option:** Give the worker its own database login and its own AWS role, which cannot read the web app's password. One database function then refuses any person's ID coming from a worker session, which covers every person-only step now and in future. A generated test runs each person-only step on the worker login and expects refusal.
- **Why it matters:** It makes the attested-packet trust story unforgeable from the most exposed process, which enterprise security reviews probe first.
- **What it changes:** Pricing engine: no. Ledger: no. Database: a new login role and one tightened function (row-level security unchanged). Freeze exception: no.
- *Plan reference: ADR 0061 residual risk F9*

### 37. Being signed out mid-narrative loses the work

**High** · Lands in: Small PR before PR 7 · Added hours: 16-24 · Freeze exception: no

- **Planned now:** PHI screens sign out after 30 minutes without a request to the server. Typing a packet narrative sends none, so on save the person lands on the sign-in page, the text is gone, and sign-in returns to the home page. There is no warning, and an unattended screen stays readable until the next click.
- **Best option:** Typing and clicking count as activity (a quiet touch every 5 minutes while working), shared across tabs; a warning at 25 minutes with 'Stay signed in'; at 30 minutes the screen itself locks; after signing back in the person returns to where they were; and a notice before the 12-hour hard limit. Nothing is saved in the browser, and the limits themselves do not change.
- **Why it matters:** Losing a carefully verified narrative is a trust failure people remember, and a PHI screen left readable past the idle limit fails a penetration test and the accessibility rule on time limits.
- **What it changes:** Pricing engine: no. Ledger: no. Database: no. Freeze exception: no.
- *Plan reference: Sessions; SEC-15*

### 38. An outside auditor sees only the cases under review

**High** · Lands in: PR 14 · Added hours: 45-70 · Freeze exception: no

- **Planned now:** D28 makes the auditor a practice-wide read-only role: an outside auditor would open every case in every practice of the group and could see patient names, although CO-06 says 'read-only on authorized cases' and D26's auditor export shows only a pseudonym.
- **Best option:** A practice administrator shares named cases with a named auditor, with an end date and revocation. The auditor role gets no route into the practice at all, so a direct query returns nothing; reads go through checked functions that return pseudonymized case data and are logged in the practice's access log. The auditor works in the case screen's tabs, read-only, with the full drill-down, and creating the share generates the auditor-scope export.
- **Why it matters:** HIPAA's minimum-necessary standard, and the compliance teams of groups and acquirers, will refuse practice-wide access for an outside reviewer.
- **What it changes:** Pricing engine: no. Ledger: no new rules on ledger or case tables. Database: two new practice-scoped tables and reviewed read functions (domain model approval; security review). Freeze exception: no.
- *Plan reference: D28*

### 39. A free screening a practice can finish: drop the 835 files

**High** · Lands in: PR 6e, after PR 6b, before the screening opens with release 1 · Added hours: 90-140, plus 40-70 for the visit follow-on · Freeze exception: no

- **Planned now:** A prospect must build a pivot table by hand: one row per code, modifier set, units, place of service, payer product and quarter, with an allowed total and a claim count. Most practice owners and office managers cannot.
- **Best option:** Let the prospect drop their own 835 files. A sandboxed worker in their browser, with no network access, parses them, removes duplicates, nets reversals, leaves out secondary-payer and denied lines, asks the person to choose the product for each payer and plan (never guessed), shows exactly which total rows will be sent, and sends only those through today's server checks. The minimum row size (#6) applies. EMR exports are added only once a format is confirmed. A follow-on sends each visit's combination of codes, so the unchanged engine prices the multiple-procedure reduction exactly instead of as a range.
- **Why it matters:** Every billing manager can download 835s in a minute; almost none can build that pivot, and this is the top of the sales funnel.
- **What it changes:** Pricing engine: no. Ledger: no. Database: the screening tables change only for the visit follow-on (domain model approval). Freeze exception: no. You and counsel confirm that reading 835s only in the browser meets CO-04's 'no-PHI screening flow'.
- *Plan reference: CO-04; D18*

### 40. The screening says something about the commercial and MA contracted book

**High** · Lands in: PR 6e · Added hours: 40-60 · Freeze exception: no

- **Planned now:** Commercial and Medicare Advantage contracted rows, most of a typical practice's dollars, only say 'N% cannot be priced without a contract'.
- **Best option:** Keep them unpriced as expected amounts, but compute a Medicare reference for each (the fee-schedule amount for the units billed, before reductions and sequestration) and show 'Allowed as a percent of the Medicare fee schedule' by code and product, never 'below', 'expected' or 'owed'. Show it by payer only through a fixed payer directory (free-text payer names are never stored, since they can hold patient names). List quarter-to-quarter drops only per payer, with at least 30 lines a quarter. Define the ratio exactly as milestone 13's negotiation workspace will.
- **Why it matters:** Percent of Medicare by code is the number owners negotiate with, so the screening says something useful about the part of the book they care about most, which raises conversion to a paid audit.
- **What it changes:** Pricing engine: no. Ledger: no. Database: screening tables and a global payer directory (domain model approval). Freeze exception: no. You approve the scope addition to CO-04 and D20.
- *Plan reference: D20; ADR 0062*

### 41. Screening results visible to the business, with consent

**High** · Lands in: PR 6e, before the screening opens; the conversion measures in PR 7's scorecard · Added hours: 26-42 · Freeze exception: no

- **Planned now:** The only output of a screening is an emailed link to the prospect. Your console shows only the place-of-service split, a conversion carries no figure, and everything is deleted after 30 days, so you start the scoping call blind and cannot follow up.
- **Best option:** An optional, unticked consent: 'PaidWhole may email me about this result and keep a summary of its totals for 12 months'. For consenting or converted prospects, keep a frozen summary of totals (with its release and the labels from your rulings); a console list shows those leads only, and other screenings only as counts; converted requests show 'From a screening' and the summary; consenting prospects get a reminder before deletion; and the scorecard gets screening-to-audit conversion.
- **Why it matters:** You walk into the scoping call knowing the prospect's Medicare Advantage exposure, and the channel the change order leads with becomes measurable.
- **What it changes:** Pricing engine: no. Ledger: no. Database: screening tables (domain model approval). Freeze exception: no. Keeping a summary past 30 days is a CO-04 amendment you approve, and the prospect-facing wording changes.
- *Plan reference: D21; ADR 0062*

### 42. Fee schedule exhibits entered in minutes, not hundreds of forms

**High** · Lands in: New PR after PR 6b, before PR 7 (before design-partner contracts arrive) · Added hours: 70-110 · Freeze exception: no

- **Planned now:** A fixed fee schedule has one amount per rate record, so a 150-code exhibit becomes 150 records with 5 approvals each: about 750 page reloads plus hand entry. The model-proposal path fails on schedules that size because its answer is cut off.
- **Best option:** A code-only importer: keep each spreadsheet or CSV row's cells in position at intake; the specialist maps the header (code, modifiers, place, amount, dates) once; code reads every row exactly, lists every exception (never rounds, never skips silently), refuses duplicates, flags amounts far from the Medicare amount for the same code, and builds draft records citing the row. A keyboard review table approves a row's fields in one step. For PDF exhibits, ask the model one page range at a time.
- **Why it matters:** Specialist hours per contract decide how many practices can onboard each month, and code-read amounts are more accurate than 150 retyped ones.
- **What it changes:** Pricing engine: no. Ledger: no. Database: no. Freeze exception: no.
- *Plan reference: PRD 7 rate-record review; ADR 0028, 0033*

### 43. Firm clients onboard without a founder call

**High** · Lands in: PR 17; direct self-serve from a screening in a new PR after PR 17 · Added hours: 55-85, plus 25-40 for screening self-serve · Freeze exception: no

- **Planned now:** A firm can invite only practices already on PaidWhole. Every new practice goes through your scoping call and a console setup by hand, and a converted screening also lands in that queue.
- **Best option:** A firm sends an invitation (one at a time or by CSV, with the NPI and last four of the TIN only); no workspace exists until the invited person accepts. That person enrolls MFA, creates their own group and practice, e-signs the BAA, data-rights addendum and engagement, and approves the firm's grant, so the practice still owns its workspace. Guards: the invitee may not be a member of the firm or on its email domain (a new check on grant approval), the NPI is checked against the public NPPES registry, and an NPI already on PaidWhole is never duplicated. When every check passes the practice opens at once; otherwise it waits in a console queue with uploads closed. There is no payment step when the firm pays.
- **Why it matters:** A firm with 30 clients needs 30 of your calls today, which caps 'practices per firm login' and 'hours to onboard' at your calendar.
- **What it changes:** Pricing engine: no. Ledger: no. Database: an invitation variant, a tighter grant-approval rule and an activation state (domain model approval; security review). Freeze exception: no.
- *Plan reference: D35; J1; ADR 0053*

### 44. The firm's working surface: full portfolio, deadline queue, grant renewals

**High** · Lands in: PR 17; the firm ROI and payer view in milestone 12 · Added hours: 55-90 · Freeze exception: no

- **Planned now:** PR 17 builds CO-08's minimal portfolio. The rest of the plan's portfolio (freshness, review queue, actionable and recovered kept apart, sorting, grant expiry, extension requests) is scheduled nowhere. Grants last 12 months with no warning before they end, so a firm can lose access mid-dispute, and an analyst with 40 clients switches between 40 workspaces to see what is due.
- **Best option:** Full practice cards; a cross-practice deadline queue of case rows with no patient fields (from a fixed list of columns), sorted by deadline, with bulk assign that checks each case; one inbox across practices; grant-end notices at 60, 30 and 7 days, a flag when a grant ends before an open case's deadline, and a renewal request the practice approves as a new grant; and 'needs an owner' derived for every cause, not only revocation. Milestone 12 adds the firm ROI per practice and in total, and a payer view for prioritizing (packets stay per practice).
- **Why it matters:** Missed deadlines and analyst minutes grow with every client, and a grant that lapses silently loses access in the middle of a dispute (and stops billing).
- **What it changes:** Pricing engine: no. Ledger: no. Database: notification kinds, a grant-extension request table and a permission for analysts (domain model approval). Freeze exception: no. You amend CO-08's 'counts and dollars only' wording to allow case rows with no patient data.
- *Plan reference: CO-08; PR 17; D35, D36*

### 45. A time log so pursuit cost and hours saved are real

**High** · Lands in: PR 8 (table), PR 13 (screens), PR 17 (baseline); PR 7 marks the measures as missing until then · Added hours: 36-60 · Freeze exception: no

- **Planned now:** The ROI statement prints 'Pursuit hours logged: 0.00' because no milestone builds a time log. Gate 2's 'analyst hours saved against the firm's baseline' and two scorecard measures cannot be computed.
- **Best option:** An append-only time log entered at the moments work is already recorded (exporting, submitting, recording a response, a follow-up), prefilled from the practice's defaults, plus 'Log time' for calls and portals; an optional timer that only suggests; no passive tracking of staff. Actual cost shows beside the original estimate, which never changes. The ROI statement fills its existing hours field and says how many cases have time logged. The firm's baseline is a dated record of who set it and how.
- **Why it matters:** Firms buy on analyst time saved, and Gate 2 cannot be passed or even measured without it.
- **What it changes:** Pricing engine: no. Ledger: no (the hours field already exists). Database: one new practice-scoped table (domain model approval). Freeze exception: no.
- *Plan reference: ADR 0042, 0047; PRD 12, 13; Gate 2*

### 46. Billing that follows customer size and gets firm-paid practices right

**High** · Lands in: PR 17 (who pays, consent); milestone 12 (invoicing, per-practice price, refusal) · Added hours: 48-80 · Freeze exception: no

- **Planned now:** There is one flat subscription per organization: a group with 12 practices pays the same as one with a single practice. Firms are billed per granted practice from counts only, and nothing records who pays for a firm's client, so a firm-paid practice's ROI statement shows $0 fees and no ratio, and a firm that stops paying keeps working on its clients. Every audit invoice is the catalog price whatever the scope.
- **Best option:** Keep a record of who pays for each practice on each day (proposed by the firm in its invitation, accepted by the practice, ended by either side from a date). Record per-practice daily usage with opaque IDs only; send firm invoices with one line per practice; attribute fees so each ROI statement is right (the firm decides whether its price is shown to its client). Refuse new work by a suspended firm's users on its grants; tell the practice and give it a grace period and a one-step takeover. Price group subscriptions per practice. Let the audit invoice take the scoped amount from the engagement letter.
- **Why it matters:** Under a flat fee the largest groups are the least profitable, and the ROI statements firms use to sell PaidWhole to their clients show no fees.
- **What it changes:** Pricing engine: no. Ledger: read only. Database: billing tables and a reviewed function that returns opaque IDs (domain model approval; security review). Freeze exception: no.
- *Plan reference: Milestone 12; ADR 0050*

### 47. Remittances that arrive by themselves, and knowing when one is missing

**High** · Lands in: Freshness and gate: PR 9 and the dashboard. Secure drop: a new PR beside milestone 12. Connectors: per partner, after the design-partner interviews · Added hours: 80-130, plus 30-60 per clearinghouse · Freeze exception: yes

- **Planned now:** Every 835, EMR export, posting export and bank file is uploaded by hand. The dashboard shows the last file but not whether a payer's remittances have stopped arriving, and nothing tells the payer-ready gate whether a newer remittance is missing, so a packet could ask for money that a later, un-uploaded remittance already paid.
- **Best option:** First, per-payer freshness computed from each payer's usual cadence, on the dashboard, portfolio and digest, and fed into the payer-ready gate: a case cannot become payer-ready until newer files are uploaded or a person records there are none. Then a copies-only delivery channel: a per-practice secure drop (AWS Transfer Family, keys only) where the clearinghouse sends copies of 835s and the PM system and bank send posting and deposit files. Files get generated names (the sender's filename, which can carry patient data, is never kept), go through the existing scanned intake and duplicate rules, and a firm's shared channel routes only to practices that registered that payee. Clearinghouses are then added one at a time through their official delivery; PaidWhole never holds a portal login, which could submit claims or change ERA routing.
- **Why it matters:** A monitoring subscription fed by a monthly manual chore loses data, then findings, then renewals, and automatic bank files make 'deposited', the seal's proof, the normal case.
- **What it changes:** Pricing engine: no. Ledger: no. Database: new practice-scoped channel tables, and a change to the document uploader rule so a delivered file has a lawful uploader (a row-level security change; security review). Freeze exception: yes, for that rule. Adding a new PR needs your agreement under D5.
- *Plan reference: PRD 4 deferrals; D12*

### 48. Screens that stay fast as history grows

**High** · Lands in: New PR just before PR 17, or the start of PR 17 · Added hours: 35-55 · Freeze exception: no

- **Planned now:** Every dashboard, Coverage, Contracts and report view works out 'which pricing is in effect' again from every priced line the practice has ever had. A mid-size practice with three years of history has about 288,000 priced lines, about half a second per query and four or more queries per dashboard, growing with every month and every re-run; a firm portfolio across 50 clients would take tens of seconds.
- **Best option:** Keep a pointer table of the pricing in effect, written at the only two moments it changes (a first run completes; a re-run is accepted, which must take the same lock), and a coverage snapshot written at the same moments. Stage figures, deadlines and short dollars stay live, but run over the narrow tables. Add a parity test and a nightly check against the current method, and a speed budget in CI.
- **Why it matters:** Firms will judge the product on its most-viewed screens, and the shared database would saturate as history grows.
- **What it changes:** Pricing engine: no. Ledger: no. Database: two new practice-scoped tables (the pricing tables themselves are unchanged; domain model approval). Freeze exception: no.
- *Plan reference: ADR 0037, 0040; PR 17*

## Medium (16)

### 49. The packet cover identifies the provider the way payers file disputes

**Medium** · Lands in: PR 8 and PR 9 (records and check); PR 12 (cover) · Added hours: 16-26 · Freeze exception: no

- **Planned now:** A dispute packet's 'From' line is the practice name, one NPI and 'tax ID ending ####'. The loader drops the payee's name, TIN and address from every 835, and the payer-ready check for the right legal entity has no remittance-side TIN to compare.
- **Best option:** Keep the payee's name, TIN (sealed) and address from the 835. Confirm the practice's legal entity and full TIN only when they match a loaded remittance. The payer-ready check compares the remittance payee with the contract's legal entity (D33). The cover prints the legal entity, the NPIs and TIN from the disputed remittances, a correspondence address and phone, the approver as contact, and 'prepared by <firm> on behalf of <practice>' under a firm grant; the TIN is masked in the auditor and executive scopes.
- **Why it matters:** Payers file disputes against TIN plus NPI and reply to an address; a cover that lacks them is easy to return as incomplete inside the dispute window.
- **What it changes:** Pricing engine: no. Ledger: no. Database: new columns on remittance and practice (domain model approval). Freeze exception: no.
- *Plan reference: D8; D33*

### 50. Export-loaded claims are missing the patient name and member ID

**Medium** · Lands in: PR 4b (fields and identity fill); PR 12 (readiness check) · Added hours: 20-34 · Freeze exception: no

- **Planned now:** No EMR export layout carries a patient name or member ID, so every export-loaded line in a packet prints 'not on the remittance' in those columns, and export patients never join their 835 records.
- **Best option:** Add optional name and member-ID fields to the layouts; key a patient as the 835 path does only when a member ID is present; when a held 835 matches, copy its names and member IDs onto the export claims (fill blanks only; list disagreements). At payer export, a readiness check names the rows lacking them and the remedy, and the approver can still send with an acknowledgement rather than a hard refusal.
- **Why it matters:** Payer dispute units identify claims by member ID and name, and a schedule full of 'not on the remittance' risks being returned inside the window.
- **What it changes:** Pricing engine: no. Ledger: no. Database: no new table. Freeze exception: no.
- *Plan reference: D12; ADR 0060*

### 51. A status page outside the app, and recovery from a regional outage

**Medium** · Lands in: New infrastructure PR before the first production deploy · Added hours: 35-55 · Freeze exception: no

- **Planned now:** The public status page is served by the same app and database, so it goes down with them, and staff must update it through the console that is also down. Production runs in one AWS region with no cross-region copies and no stated recovery time, and the practices' data keys sit under a single-region key that AWS cannot convert later.
- **Best option:** Before the first production deploy, create the environment key as a multi-region key (this cannot be added later without re-encrypting everything). Then replicate database backups and the document buckets to a second US region, state recovery-time and data-loss targets in a contingency plan mapped to HIPAA, and drill a regional restore every year. Use a hosted status service outside PaidWhole's account (no PHI on it), fed automatically by the uptime checks and the worker heartbeat, with email and webhook subscriptions and 90 days of history.
- **Why it matters:** Firm and group security questionnaires ask for uptime history and disaster recovery, and today a regional outage has no recovery path for practices in the middle of a deadline.
- **What it changes:** Pricing engine: no. Ledger: no. Database: a region column on the restore-drill record (domain model approval). Freeze exception: no.
- *Plan reference: ADR 0053; infrastructure*

### 52. A contract calendar with cited notice terms that rolls forward

**Medium** · Lands in: PR 8 (citations, rolling calendar, digest); milestone 13 (alerts) · Added hours: 28-45 · Freeze exception: no

- **Planned now:** The contract's notice period is stored as an uncited number of days. The calendar assumes every contract renews yearly on its start date, and its events are computed once at sign-off and never again, so after the first notice deadline an open-ended contract's calendar goes blank. The digest counts only contracts with an end date, so the usual auto-renewing contract reports zero.
- **Best option:** Cite the term, renewal and notice clauses (verified by the specialist, frozen like the dispute window), compute upcoming anniversaries and notice deadlines on read so they roll forward each year, and have the digest count notice deadlines, open-ended contracts included. Milestone 13 alerts at 120, 60, 30 and 7 days, linking to the negotiation workspace.
- **Why it matters:** Payer contracts often auto-renew and need 90 to 180 days' notice, and a calendar that goes blank in year two is trusted exactly when it is wrong.
- **What it changes:** Pricing engine: no. Ledger: no. Database: new fields on contract versions (domain model approval). Freeze exception: no.
- *Plan reference: Milestone 13; contract calendar*

### 53. Contract escalators

**Medium** · Lands in: PR 6c · Added hours: 26-40 · Freeze exception: yes

- **Planned now:** There is no escalator term ('increases 3% each anniversary'). The workaround needs a person to compute each year's factor, which rule 1 forbids, and on a lesser-of contract it produces a wrong number; an open-ended base record silently keeps pricing year two at the base rate, so the shortfall reads zero.
- **Best option:** An escalator parameter with its own citation (percent, cadence, anchor, compounding), applied by the engine before the lesser-of comparison, with one rounding. The abstraction screen requires 'escalation clause: none, modelled or index-linked' before sign-off; CPI-linked escalators stay unsupported rather than guessed. Refuse the wrong-number workaround in the meantime.
- **Why it matters:** Payers that fail to load escalators and keep paying the base-year rate are a classic underpayment pattern the product would otherwise miss entirely.
- **What it changes:** Pricing engine: yes (a new method parameter). Ledger: no. Database: no. Freeze exception: yes.
- *Plan reference: PRD 9 rate methods*

### 54. Mutation testing that actually runs on the money code

**Medium** · Lands in: PR 7 (or the governance PR) · Added hours: 32-60 · Freeze exception: no

- **Planned now:** Mutation testing (a check that the tests would catch a deliberate bug) has a CI job that can never run on schedule, and its runner reports results without running the tests. Only the packet verifier has a measured score; the plan requires 85% on the engine and the ledger.
- **Best option:** Check which runner reports truthfully, give the engine, the ledger and the verifier their own configurations, run on changed files in each pull request and in full every night, fail below 85% per package, keep a reviewed list of surviving mutants in the money arithmetic, and make it an exit condition of milestone 6 and Gate 1.
- **Why it matters:** Until the specialist's golden answers arrive, this is the strongest independent evidence that the tests really pin the arithmetic behind every dollar.
- **What it changes:** Pricing engine: no (tests only). Ledger: no (tests only). Database: no. Freeze exception: no.
- *Plan reference: Milestone 9 row; ADR 0047; PRD 18*

### 55. The red team keeps every case it writes

**Medium** · Lands in: PR 7; the same rules in PR 16 · Added hours: 26-42 · Freeze exception: no

- **Planned now:** The milestone 6 red team keeps only tests that reproduce a defect, in a quarantined suite outside CI, and the defect list is a markdown file someone reads. The agent cannot actually register a fixture, and nothing says where its expected answers come from.
- **Best option:** Keep every adversarial case as a permanent synthetic case checked by the external 835 validator; take expected amounts from the independent worksheet or a cited rule, never from the system under test; run the quarantine in CI so a fixed-but-still-quarantined defect turns it red; keep the defect list as data that a gate check reads; and run the agent on the most capable model.
- **Why it matters:** A red team whose expected answers are copied from the code cannot find money defects, and passed cases that are thrown away let old faults come back unseen.
- **What it changes:** Pricing engine: no. Ledger: no. Database: no. Freeze exception: no.
- *Plan reference: D22, D23; CO-07*

### 56. Payer submission layouts for bulk disputes

**Medium** · Lands in: PR 12 (columns in PR 8) · Added hours: 28-44 · Freeze exception: no

- **Planned now:** PR 12 plans one CSV line schedule for every payer, though CO-06 allows XLSX. Payers' bulk-dispute channels often require their own template, so analysts retype hundreds of lines, and the file sent is no longer the file that was hashed and attested.
- **Best option:** A registry of payer submission layouts per dispute route (D33), each column drawn from a fixed list of packet fields; a layout that needs a field the packet lacks, or one outside the payer scope, is refused for that packet. A deterministic XLSX writer produces the layout, reads it back to check every cell and splits files over the row limit, and the reviewer downloads and hash-checks each file before attesting.
- **Why it matters:** Retyping undoes the verifier and the hash chain and costs analyst minutes on every case.
- **What it changes:** Pricing engine: no. Ledger: no. Database: two columns on PR 8's export-part table. Freeze exception: no.
- *Plan reference: D26; PR 12*

### 57. A capacity baseline and backlog alarms

**Medium** · Lands in: New PR after PR 17, before Gate 1 and milestone 12 · Added hours: 45-75 · Freeze exception: no

- **Planned now:** Production runs one small worker task that handles every job type one at a time, with no autoscaling and no alarm when work backs up. Intake waits up to 10 minutes for the malware scan while holding its slot, printing shares memory with pricing, the screening queue sits behind other platform jobs, the worker has half the CPU the plan's own speed target assumes, and the database has no storage or memory alarms.
- **Best option:** A backlog metric and alarms per queue against stated targets; intake re-queues itself instead of waiting during the scan; fair per-practice concurrency for pricing, triage and reconciliation; size the worker to the plan's own figure and move printing to its own service; autoscale on backlog age; add database alarms and a runbook threshold for a bigger class; and run a staging load test at three times the Gate 1 target before Gate 1 and milestone 12. No read replica or connection proxy until there is a measured need.
- **Why it matters:** A slow backlog is invisible today, and month-start uploads at scale would leave billing managers waiting hours for findings.
- **What it changes:** Pricing engine: no. Ledger: no. Database: no schema change. Freeze exception: no.
- *Plan reference: PRD 15 sizing; infrastructure*

### 58. Task-bound access for contract specialists

**Medium** · Lands in: PR 14 · Added hours: 40-64 · Freeze exception: yes

- **Planned now:** Each contract specialist session needs a four-hour support grant, created by a second internal person and announced to the practice administrator, and during it the database exposes every PHI table of that practice, narrowed only by the app. PR 5 adds window citation for every contract to the same queue.
- **Best option:** A contract-review access opened by the practice's own upload or request, while a practice setting allows it, and closed at sign-off or after 14 idle days. The specialist claims the item without a second person. The database admits only the contract tables and the contract documents named by that item, so every other PHI table refuses by default. One notice per review, and every read logged. Payer letters, ledger adjustments and attestation stay on the break-glass support grant.
- **Why it matters:** Specialist throughput limits onboarding, and the narrower scope exposes less patient data than today's support path.
- **What it changes:** Pricing engine: no. Ledger: no. Database: a new scope setting and policies (a row-level security change; security review). Freeze exception: yes. It amends ADR 0019, ADR 0028 and PRD 3.
- *Plan reference: ADR 0028*

### 59. Claims and lines: payer, reasons in words, filters that reach the remedy

**Medium** · Lands in: Small PR after PR 6b; the export in milestone 12; the volume work in the final pass · Added hours: 34-54 · Freeze exception: no

- **Planned now:** The Claims and lines table has no payer column (the query already returns it), shows unpriced reasons as bare codes, has no sort or export, and cannot filter to unpriced lines or to a reason, so the Coverage screen's remedy link lands on every line.
- **Best option:** Show payer and plan, unpriced reasons in words with their remedy, an Unpriced filter and a reason filter that Coverage links to, and sorts by largest shortfall, date and payer. Add a logged line export for PHI roles as a background job in milestone 12, and a volume test on a million synthetic lines before adding any index.
- **Why it matters:** This is the billing manager's working table, and today the 12 lines that need review cannot be found among thousands.
- **What it changes:** Pricing engine: no. Ledger: no. Database: none unless the volume test needs a column (then domain model approval). Freeze exception: no.
- *Plan reference: PRD 7 Claims and lines*

### 60. Bulk mapping and bulk case work

**Medium** · Lands in: Mapping in bulk: a small new PR; case lines and layout: PR 13; bulk assign: PR 17 · Added hours: 40-55 · Freeze exception: no

- **Planned now:** Mapping offers one 'Map this plan' page per plan (50 to 150 at onboarding), case lines are written off one at a time, there is no bulk assign, and on the Cases screen the case list sits below three setup panels.
- **Best option:** Map many plans of one payer to one signed-off version in one step, with a per-plan preview of what will price and what falls outside the dates; never preselect a version, and hold Medicare Advantage or out-of-network plans out unless ticked. Select case lines across pages and write off or reopen them under one reason, with the count and total shown. Put the case list first. Add bulk assign with D36's 'needs an owner' list. Each item keeps its own audit event.
- **Why it matters:** When a payer answers 'correct on review' for 120 lines, today that is 120 separate forms.
- **What it changes:** Pricing engine: no. Ledger: no. Database: no. Freeze exception: no.
- *Plan reference: PRD 7; ADR 0044*

### 61. Packet builder: no dead Approve button, one form, accessibility everywhere

**Medium** · Lands in: PR 5 before merge (the page); PR 7 (the accessibility gate) · Added hours: 16-28 · Freeze exception: no

- **Planned now:** The drafter sees a working Approve button that the database then refuses. The packet's prompt-pay and evidence fields appear three times with the same IDs, and a choice made in one copy is silently dropped when another button submits (the interest line can disappear). Accessibility checks skip the packet builder and most core screens.
- **Best option:** Show the drafter a disabled button with the reason, next to 'Request approval'; use one form with one set of fields and three submit buttons, with unique IDs. Run the accessibility check automatically after every page and form in every test journey, and fail the run if a screen in the route list was never checked.
- **Why it matters:** A button that always fails says the product is broken, the dropped interest choice understates the claim, and health-system buyers check accessibility.
- **What it changes:** Pricing engine: no. Ledger: no. Database: no. Freeze exception: no.
- *Plan reference: PR 5 packet builder; ADR 0044, 0045*

### 62. Getting to your first finding

**Medium** · Lands in: Inside PR 7 beside the scorecard, or a small PR after it · Added hours: 20-32 · Freeze exception: no

- **Planned now:** Settings has a 'Getting started' list that ends at the first upload and that only administrators see. Nothing shows the rest of the path to a first finding (contracts tagged, abstraction, sign-off, mapping, first run, triage) or who each step waits on.
- **Best option:** One live 'Getting to your first finding' card on the dashboard, computed from existing records, with each step naming who acts (the practice, the specialist, PaidWhole) and a link. It completes when the first run is triaged, reporting what was found, not when a case opens. The same step times feed the scorecard's onboarding measures.
- **Why it matters:** A new administrator does not know that the contract they never uploaded is why nothing is priced.
- **What it changes:** Pricing engine: no. Ledger: no. Database: no. Freeze exception: no.
- *Plan reference: PRD 7 dashboard; CO-09*

### 63. Single sign-on for firms and groups

**Medium** · Lands in: Milestone 12 · Added hours: 80-120 · Freeze exception: no

- **Planned now:** Sign-in is Cognito with MFA, and single sign-on waits for the first firm's security review; ADR 0055 wrongly says it would force a change of identity vendor.
- **Best option:** Per-organization SAML or OIDC sign-on on the same Cognito pool, with verified domains, invitation-only first sign-in, MFA asserted by the customer's identity provider or an in-app passkey step, enforcement that closes the password route for that domain, deprovisioning through SCIM so a disabled user is signed out on the next request, and an audit export.
- **Why it matters:** Firms and PE-backed groups require SSO in procurement, and offboarded staff otherwise keep app accounts until someone removes them by hand.
- **What it changes:** Pricing engine: no. Ledger: no. Database: new non-PHI configuration tables (domain model approval). Freeze exception: no.
- *Plan reference: ADR 0055; PRD 20*

### 64. Show customers that disputed patterns stay fixed

**Medium** · Lands in: PR 13 (case screen) and milestone 12 (ROI page, firm roll-up) · Added hours: 35-55 · Freeze exception: no

- **Planned now:** Nothing measures whether a payer keeps paying a disputed pattern correctly after the dispute; only cash recovered is counted, and it falls in year two, when renewal is decided.
- **Best option:** A separately labelled measure, never added to any stage or called recovered: for lines of the same payer, plan and agreement exposed to the same cause and paid after the first submission (by payment date), how many are paid at contract and how many are still short, and the per-line shortfall before and after; the case's own lines are excluded. Store it as a written-once snapshot and show it on the case, on a separate page of the ROI statement and in the firm roll-up, in observational wording.
- **Why it matters:** It proves ongoing value with numbers the engine computed, which supports gross retention, one of the change order's moat measures.
- **What it changes:** Pricing engine: no. Ledger: no. Database: a new practice-scoped snapshot table (domain model approval). Freeze exception: no.
- *Plan reference: ROI statement; CO-09 gross retention*

## Decisions only you can make

- Freeze exceptions (twelve): #2 sequestration, #3 fee-schedule status codes, #5 deadline calculation (engine part only), #7 ledger amounts, #10 multiple-procedure reduction across claims, #15 trace-matching fallback, #23 unmapped plans, #30 institutional claims, #31 Original Medicare outcome, #47 uploader rule for delivered files, #53 escalators, #58 contract-review access.
- Rulings to revisit: 'No payer aliasing' (#28 adds a person-confirmed link, never by name); 'Both limits stand' for the 4 MiB export limit (#29, optional); reading 835s only in the browser as meeting CO-04's no-PHI screening flow, with counsel (#39); keeping consenting prospects' screening summaries past 30 days (#41); the seal wording fixed in CO-11 and BRAND.md (#13); what CAS-22 means (#17); moving sequestration last in PRD 11 step 4 (#2); PRD 13's two conflicting definitions of 'approved' (#7); CO-08's 'counts and dollars only' portfolio wording (#44).
- Accepted decisions that change: D16 and D29 (#25), D27 (#35), D28 (#38), D35 (#43), D31 (#11), D17 for Medicare Advantage (#5), and new pull requests inserted into the D5 order (PR 4b, 6c, 6d, 6e, 7b and 15b, the alerts PR and the governance PR).
- GitHub settings only you can change (#12): a separate identity for the build agent, branch protection, the default branch, repairing main, and whether the repository stays public.
- The schedule: the gate dates and the 13-hours-a-week pace are fixed in the change order, and this list adds roughly 1,100 to 1,900 hours ahead of Gate 1.

## Reviewed and found already best

- D12 (a), EMR exports loaded as remittances with their provenance, and D13 (a), the 835 stays authoritative and priced lines are never silently replaced. Every related upgrade (#8, #14, #28, #29) keeps both.
- D24 (a), no pre-case grades inside the case table. The upgrade (#32) builds the pre-case work item beside it instead.
- D25 (a), two case status columns. They only need one writer and one vocabulary (#33).
- D30 (a), no triggers on pricing or contract tables and corrected versions written by people. The upgrades (#4, #22) only add read-only checks.
- D34 (b), no model writing 'explain a variance'. Code explains causes instead (#19).
- D8, the packet is the practice's own letter, not a PaidWhole cover. Only the provider identification is added (#49).
- D26, the four disclosure scopes. Only tests and the TIN rules are added (#34, #49).
- D29, the $2,500 independent sign-off threshold stays yours. Only the meaning of 'overridden' changes (#25).
- D35's principle that the practice, not the firm, owns its workspace and approves the grant. Self-serve onboarding (#43) keeps it and adds the checks that protect it.
- D5 (a), build the whole change order in its order. Option (b) should be closed (#34).
- Your 2026-10-18 rulings: download before attest; D16 (a) for practices with no other approver left to D27; appeal-level evidence in PR 8; price twice and flag below the fully reduced figure; compare before sequestration (#2 extends it to the audit); conversion allowed with notice; ZIP+4 in PR 6b. All confirmed. On 'No payer aliasing', the ban on matching by name stands; only a person-confirmed link is new (#28).
- Billing stays a price per practice. A success fee on recovered money was considered and rejected, because it would give PaidWhole a financial stake in the very figure its seal certifies (#46).
- Considered and not recommended: holding customers' clearinghouse portal logins (#47), passive tracking of staff time (#45), standing access for specialists (#58), a read replica or connection proxy before there is a measured need (#57), a global payer directory holding dispute addresses (D33 rightly puts the route on the contract), and publishing agreement on synthetic fixtures as proof of accuracy (#27).
