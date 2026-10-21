# Reconciliation 001: the build against the Build Plan and Change Order 001

**Status:** approved by the owner on October 17, 2026, with every recommendation accepted (see Approval at the end).

This is the reconciliation report that Change Order 001 (issued October 16, 2026) requires before any code changes, dated October 17, 2026. It compares the repository with the Build Plan (`docs/product/PRD.md` and its tabs) and the change order, milestone by milestone and for each section the change order amends. The evidence comes from `claude/build-platform` at `2582768` (39 migrations, head `20261101120000_support_mail.sql`), checked in a clone, and from the unmerged `brand/paidwhole` at `7994f15`. The first draft was written at `0b1c32c`; since then the fix pass has committed the support-mail migration (`c220f82`) and ADR 0055 (`2582768`), and every row below is corrected to that head. The fix pass may still commit, so step 0 re-checks the head before PR 1. Effort is given in the plan's hours (PRD 17). The report ends with the pull requests proposed, in order, and stops for the owner's approval.

| Build Plan section or milestone | Built | Diverges from plan | Change order items that touch it | Proposed action | Effort |
| --- | --- | --- | --- | --- | --- |
| Milestone 0: Repository, configuration and global content | partial | **What passes:** at `2582768`, install, `pnpm typecheck`, `pnpm test` (3,185 of 3,185, with the coverage thresholds) and `pnpm verify-content` pass. **Release 1:** "release 1 loads into an empty database" cannot be met. There is no `content/releases`; `content/drafts` holds 10 records, all at L1; only the SYNTHETIC releases 900001 to 900004 exist. Loading the real content needs a person who can reach the CMS, X12 and state sources (README:537). **Unit tests:** the 3 infra failures the first draft found at `0b1c32c` (`infra/test/encryption.test.ts:75`, 21 data stores expected, 22 found) were fixed in `d54660f`. **Hooks:** `.claude/settings.json` is not in the repository, so `fixture-guard.sh`, `protect-content.sh` and `typecheck.sh` are not wired as hooks. **ADRs that depart from the plan:** 0004 (three attempts), 0006, 0008 (only L2 and higher are released; `denial_category`), 0010 and 0011. | CO-02, CO-03 (the fixture guard and hooks), CO-09, CO-10 | No change to milestone 0's code. PR 2 adds the domain model and the CLAUDE.md gate rule. PR 3 commits `.claude/settings.json` if the owner approves (D14). Release 1 stays with the owner. | 0 (counted in PR 2 and PR 3) |
| Milestone 1: Tenancy and security foundation | partial | **What passes:** on synthetic data the audit-row check passes (SEC-10, `audit.db.test.ts`). **Cross-tenant at HEAD:** at `2582768` (as at `0b1c32c`), the catalog, cross-tenant and migrate tests run 1,142 cases and 4 fail. All 4 are the `practice` INSERT probe in `packages/db/src/cross-tenant.db.test.ts`: `RowFactoryError` on CHECK `practice_deleted_at`, which `20261101090000_billing_review.sql` (commit `dbdb712`) added. This is a gap in the test harness, not a leak, but CLAUDE.md requires the suite to pass on every PR. **Staging:** "the restore job runs on staging" needs staging credentials (README:472). **ADRs:** 0013, 0015 to 0019, 0028 (support grants extended to contract specialists), 0050 and 0053 (the `tp_billing` and `tp_esign` roles). **Roles:** `reviewer` is internal-only (trigger `membership_role_fits_organization`), but PRD 3 says "internal or contracted". | CO-02 (milestone 1 has started, so the second branch applies), CO-06 and CO-12 (roles), CO-08 (grants are built here) | The fix pass repairs the row factory before the domain model is generated. PR 2 generates `docs/product/domain-model.md`, marks the divergences and stops for approval. The roles land in PR 14. | 0 (PR 2: 6 to 10) |
| Milestone 2: Synthetic data and the 835 parser | partial | **What passes:** on synthetic data, the oracle comparison to the cent, the held and duplicate cases, and 10,000 claims a minute (PAR-29) all pass. **Code sets:** "code-set validation against release 1" waits on release 1 (README:531). **Registry:** `packages/synth/src/cases/registry.ts` holds all 113 test-matrix cases (`BUILT_THROUGH_MILESTONE = 5`, `CODE_BUILT_THROUGH_MILESTONE = 10`). **ADRs:** 0021 to 0025, 0027, and 0031 (a resend under a new ISA13 is a duplicate). **Fixture guard:** the guard reads only content that starts with `ISA`. `assertSyntheticX12` in `packages/synth/src/write.ts` and `fixture-guard.sh` let a CSV through, and no CSV fixture carries `SYNTHSENDER`. | CO-03 (its generators live in `packages/synth`; the guard) | PR 3 adds the vendor format registry and generators, and extends the guard to every tabular fixture. | counted in milestone 3 |
| Milestone 3: Intake, documents and mapping | complete | **Milestone check:** met on synthetic data. A 2 GiB zip queued per file in 166 s (README:525-530), and an unmapped plan blocks pricing (MAP-01). ADRs 0026, 0030, 0032 and 0033. **CO-01** was due "milestone 3 at the latest" and is late. It is partial and lives only on `brand/paidwhole` (10 commits on merge-base `07d2670`, 232 files). Its `packages/brand` is the drop-in with additions: two colors in `tokens.css` (`--pw-input-border`, #808996 and #5A6E8E in dark mode, and `--pw-danger-bg`), `name.ts`, `tailwind-theme.css`, `tsconfig.json`, and package exports and scripts (D9). The paths follow this repository (`apps/web/src`, `apps/worker/src/report`, `apps/worker/src/mail`), it uses a Tailwind v4 theme and `next/font/local`, and the brand ADRs record all three. Its ADRs 0054 and 0055 collide with main's 0054 and 0055, which applied migrations cite (`20261031090000` cites 0054; `20261101090000` to `20261101120000` cite 0055). Three CO-01 acceptance items are missing: pixel baselines, an exact-file hex allowlist, and a static guard against the Google font hosts. **CO-11:** the tagline and the printed definition are on the branch. The descriptor, the independence claim, seal and badge text constants, and a copy lint are missing. About 23 user-facing strings say "recovered" without posted or deposited, and `reports/page.tsx:154` shows a stored bare "Recovered". **CO-03** is not started. `remittance_once` and `DOCUMENT_KINDS` assume an 835. An `.xlsx` posting export passes intake (`apps/worker/src/intake/classify.ts`), but the reader decodes only text (`apps/worker/src/reconcile/exports.ts:57-68`). | CO-01, CO-11, CO-03 | PR 1 (CO-01 and CO-11), then PR 3 and PR 4 (CO-03). | 16 to 24 (PR 1); 57 to 89 (PR 3 and PR 4) |
| Milestone 4: Contract repository | complete | **Milestone check:** met on synthetic data (CON-01 to CON-07, `contracts.db.test.ts`, `e2e/contracts.spec.ts`). ADRs 0028, 0030 and 0033. "Contract calendar" is already the term in use. **CO-06 gaps:** gate 1 ("exact payer, plan, legal entity and provider match") needs a structured legal entity and NPI or TIN, but `contract.billing_entity` is free text. Gate 7 needs a dispute route, but `contract_version.appeal_levels` holds days only. CO-12 lists neither. | CO-06 (gates 1, 2 and 7 read these records) | No change to milestone 4's code. The contract-side records come in PR 8 if the owner approves (D33). | 0 |
| Milestone 5: Expected-payment engine, phase one | partial | **Golden lines:** `pnpm test:golden` passes 35 of 35. `fixtures/golden` holds 326 lines, every one `specialist_verified: false`, so "the specialist's golden lines" waits on a reimbursement specialist (README:516). **ADRs:** 0020 (an independent worksheet stands in for the specialist), 0029 (a silent contract falls back to the release's `commercial_default` window, `packages/pricing/src/windows.ts:47`), 0033 and 0034. | CO-04 (screening calls `price()`), CO-06 (deadline status and insurer-payment variance) | None. The engine's arithmetic is frozen. Screening and the case numbers are computed outside `packages/pricing`. | 0 |
| Milestone 6: Anomaly screening, status model and the audit report | partial | **What passes:** the synthetic audit AUDIT-01 reproduces (`apps/web/src/lib/routes/audit-e2e.db.test.ts`), and the reviewer checklist is built. **What is missing:** the three real audits and the specialist (README:484). **ADRs:** 0038 (the anomaly threshold defaults to $5 "since the plan names none"; cases are report-only), 0040 and 0045. **Packets:** PRD 4's Audit v0 excludes packets, which "are produced by hand from the report". CO-05 adds one, and milestone 8 has since built a superset. What it lacks: a deadline verification status, and evidence for a contract's own window to verify it against; a verifier run at export (`apps/worker/src/packets/export.ts` checks only approved, current and case-unchanged); and a path for the founder to approve, because internal users approve nothing (ADR 0041). **CO-04** is not started, and "screening" in the code means anomaly screening only. **CO-07** has not been run. CO-10 adds the red team as an exit condition. | CO-04, CO-05, CO-07, CO-09 (SCR, SEC-17), CO-10, CO-12 (screening tables, `deadline_verification_status`) | PR 5 (CO-05, as changes to the milestone 8 packet), PR 6 (CO-04), and PR 7 (the red team at milestone 6, `gates.md`, `scorecard.md`). | 123 to 214 |
| Milestone 7: Engine phase two and monthly runs | partial | **What passes:** under SYNTHETIC release 900004, a re-run lists exactly the changed lines (PRC-19, `apps/worker/src/price/rerun.db.test.ts`). **What is missing:** a real release 2 and the specialist (README:504). PRC-18 has one exception, waiting on QUESTIONS Q44. **ADRs:** 0034 (NCCI edits are review flags), 0035, 0037 (a re-run is accepted by hand), 0039 and 0040. **Gap for CO-06:** accepting a re-run does not touch open cases or packet approvals. | CO-06 (invalidation listens for the run in effect) | No change to milestone 7's code. PR 11 brings re-pricing to cases from triage and the monitor, without touching pricing tables. | 0 |
| Milestone 8: Workbench, cases and packets | complete | **Milestone check:** met on synthetic data. CAS-08 is the verifier, CAS-09 means the drafter cannot approve, and CAS-12 stores the export hash; the tests are `packets.db.test.ts`, `workbench-routes.db.test.ts` and `e2e/packets.spec.ts`. ADRs 0041, 0044 and 0047. **Against CO-06, none of it is built.** `case.state` is derived and takes six values. There is no readiness grade, no gate evaluator and no transition log. An export is five columns on `packet_version`, written once per version, and it inserts all four identifier kinds (`IDENTIFIER_KINDS`, `packages/packets/src/format.ts:30`). **Single-user approval:** `approved_alone` lets the drafter of a single-user practice approve after 24 hours (CAS-10; PRD 20 line 839). That conflicts with gate 8 and with CLAUDE.md's "Never mark a packet approved by the person who drafted it". **Wording:** the packet cover reads "Request to reprocess underpaid claims" (`apps/worker/src/packets/html.ts:153`). **Case screen:** one page plus `/packet` and `/submissions`, not six tabs. **Stale approvals:** an accepted re-run, a superseded contract version or a withdrawn rule release never reaches an open case or an approval. **Late corrections:** a correction or reversal that arrives after a case opens does not stop its export. | CO-05, CO-06, CO-09 (PKT-01 to PKT-10, CAS-16 to CAS-25), CO-12 | PR 8 (the CO-12 schema) through PR 14. | 327 to 557 |
| Milestone 9: Recovery ledger and reconciliation | complete | **Milestone check:** met on synthetic data. LED-01 to LED-11 are in `apps/worker/src/reconcile/ledger.db.test.ts`, alongside `ledger-oracle.db.test.ts` and `e2e/reconciliation.spec.ts`. **ADRs:** 0042, 0043, 0046 and 0047 (pursuit hours stay at zero because no milestone schedules a time log). Mutation scores for pricing and the ledger are not measured under Vitest 5. **Brand branch:** it adds pure, read-only `reportReconciliation()` and `recoveredLabel()` to `packages/ledger`. Entry types and the definition of recovered (posted or deposited) do not change. | CO-01 (the Verified gate reads the ledger), CO-09 (LED-12, LED-13) | PR 15 adds LED-12 as a new test, and LED-13 as a registry entry naming the LED-06 tests. | 5 to 9 |
| Milestone 10: Model gateway | partial | **State:** in its last fix pass. The lint passes. Quote verification and the 300-case narrative gate pass only on the local deterministic provider; the real-model run waits on credentials and on counsel's read of the model path (README:455). ADRs 0048, 0051, 0052, 0054 and 0055. **Model boundaries:** of the uses CO-06 lists, four exist as purposes (`MODEL_PURPOSES`, `packages/model-gateway/src/purposes.ts:6`: `proposeContractTerms`, `readDenialLetter`, `draftPacketNarrative`, `suggestEvidenceRequests`). "Explain a variance" is not a purpose, although CO-06 says these are "already in packages/model-gateway". | CO-06 (model boundaries) | Wait until the fix pass is committed and green. D34 decides whether to add a purpose. | 0 (5 to 20 if a purpose is added) |
| Milestone 11: Customer sign-in, roles, billing and production readiness | partial | **State:** in its last fix pass. HEAD moved from `c519650` to `2582768` during this review, and the support-mail migration `20261101120000_support_mail.sql` (a new table, `support_mail_receipt`, and two `support_ticket` columns) landed in `c220f82`. **Sign-up check:** passes on local providers only. Stripe test ACH, Cognito email through SES and an e-signature vendor have not been reached (README:438). **Type I checklist:** not green. The policies wait on the security official, and no restore drill has run in an environment. **ADRs:** 0049, 0050, 0053 and 0055 (written in `2582768`). | CO-07 (the red team at milestone 11), CO-10 | Let the fix pass finish green (step 0), then PR 16. | 16 to 30, plus any fixes |
| Milestone 11b: Firm grants and minimal portfolio (inserted by CO-08) | not started | **Database side, built:** `grant` has scope roles, `ends_at`, an approver and `agreement_id NOT NULL`; `grant_rules` freezes a grant after approval apart from one revocation; restrictive policies require a practice administrator. SEC-03 and SEC-04 cover it (`packages/db/src/access.db.test.ts:136`, `apps/web/src/lib/routes/revocation.db.test.ts:85`), though the test revokes by an owner UPDATE, not through a route. **Firm flows, built:** platform administrators create firm organizations in the console (`apps/web/src/lib/routes/console.ts:69`), and a firm's users are invited with the firm roles at `/settings/organizations/[organizationId]/users` (`ROLES_BY_KIND.firm`, `apps/web/src/lib/routes/settings.ts:517`). **Missing:** client invitations; routes and screens to approve and revoke a grant (the agreements page says "milestone 12's firm flow"); firm settings; the Portfolio (`portfolio.read` exists but nothing uses it); and the J13 list of cases left without an owner. | CO-08, CO-09 (SEC-16) | PR 17. | 34 to 60 |
| Milestone 12: Firm organizations and portfolio | not started | **Missing:** `legal_hold`, `deletion_request` and `export_job` are in no migration, and `/p/[practiceId]/settings/data` shows placeholders. **Built earlier than planned:** the access log, in milestone 11 (`practice_access_log()`, `/settings/access-log`). **Elsewhere:** `usage_snapshot` counts granted practices nightly. The Verified badge exists only on the brand branch. **Scope:** CO-08 moves the firm flows and the portfolio to 11b. | CO-08 (reduced scope) | Start after PR 17, under rule 6 of the change order. | about 40 to 60 (PRD 17: 60 to 90, less CO-08's share) |
| Milestone 13: "Intelligence and hardening" (PRD 17's name; kept out of product copy) | not started | **Existing precursors:** the contract calendar (milestone 4) and the digest's list of contracts expiring within 90 days (`apps/worker/src/digest/view.ts`). **Not built:** the negotiation workspace, payer-behavior scorecards, and the OT and SLP rule extensions. Type II and the penetration test need people. **Naming clash:** "scorecard" means two things, CO-09's business measures and milestone 13's payer-behavior scorecards. | CO-11 (the milestone's name stays out of copy) | None now. | 0 |
| Section 3: Users, roles and tenancy | partial | **Built:** the model is built. **Roles:** there are 10 roles, held as a text CHECK (`membership_role_check`, `role_permission_role_check`) and as `MEMBERSHIP_ROLES` in `packages/db/src/schema/tenancy.ts`. There is no `financial_reviewer` and no `auditor`. **Permissions:** the persona matrix is data (`role_permission`, ADR 0017), and a test proves it equal to `packages/db/src/authz/permissions.ts`. **Approval:** the drafter cannot approve (CAS-09), except on the single-user path (CAS-10). **Scope:** "auditor (read-only on authorized cases)" implies per-case authorization, but RLS is per practice. | CO-06, CO-08, CO-12 | PR 14 adds the roles and independent sign-off; PR 17 adds the firm flows. | counted in PR 14 and PR 17 |
| Section 7: Screens | partial | **Built:** 74 `page.tsx` routes, covering all 17 customer-workspace screens of PRD 7. **Missing:** the Portfolio and Firm settings. **Case screen:** spread over `/cases/[caseId]`, `/packet`, `/submissions` and `/reconciliation?case=`. **Labels:** main still shows a bare "Recovered" (`packages/triage/src/headline.ts:42` and others). PRD 7 allows it, and CO-11 forbids it. | CO-01, CO-03 (Coverage flag), CO-04 (screening pages), CO-06 (six tabs), CO-08 (Portfolio), CO-11 | PR 1 first, then the screen work of PR 4, PR 6, PR 13 and PR 17. | counted in those PRs |
| Section 8: Domain model | partial | **Size:** 39 migrations create 79 tables (including `schema_migrations`) and 1 view. 44 tables are in `phi_table_registry`, and there are 0 PostgreSQL enum types. **Against the Data dictionary:** of the 53 tables the dictionary names, 4 are absent. `job` is pg-boss's own table, kept in schema `pgboss`; `legal_hold`, `deletion_request` and `export_job` are milestone 12. 31 relations are not in the dictionary (the newest is `support_mail_receipt`, from `20261101120000`). `domain-model.md` lists 22 schema divergences, 7 policy notes and 5 disagreements inside the plan documents, each with its ADR. Two need a ruling: `denial_category` (A1, ADR 0008) and the remittance key the plan documents disagree on (C1). C2 to C5 are change-order proposals, decided here and not by approving the document. **Cross-checks:** Drizzle against the live schema shows 78 against 78 tables and 0 column differences; `catalogProblems()` reports 0; an independent comparison of 27 table sections with the catalog found no difference. **CO-12:** none of it is built. `practice_settings` and `packet_export` are not tables in the plan or the build, and "enum" can only mean text with a CHECK. | CO-02, CO-12 | PR 2. The CO-12 rows land in PR 5, PR 6, PR 8 and PR 14. PR 4 and PR 17 add schema that CO-12 does not list (D12, D35). Each of these PRs regenerates the document for approval. | counted in PR 2 (6 to 10) |
| Section 12: Triage, cases and packets | partial | **Built:** PRD 12 as written. Anomaly cohorts need at least 30 lines; materiality is $5 per line and $250 per case (ADR 0038). The deadline is the earliest open window. Identifiers are inserted at export, and the closed write-off list and reopen exist (ADRs 0040, 0041 and 0044). **Conflicts with CO-06:** (1) E0 makes "anomaly" a case grade, but PRD 12 and CAS-02 say an anomaly never enters a case. (2) CAS-18 presumes a case without a governing contract, but triage opens cases only under a signed-off version or the MA regulation. (3) "An unverified deadline blocks actionability" would take out every line whose window comes from the release's `commercial_default`, and every synthetic and draft window record is at L1. A contract's own window (`contract_version.dispute_window_days`) carries no page, quote or hash, so no commercial deadline can be verified today. (4) There is one export per version, but CO-06 wants scoped exports in several parts. "Recovered is a ledger outcome, never a grade" agrees with ADR 0042. | CO-05, CO-06, CO-09, CO-12 | PR 5 and PR 8 to PR 13, after D17, D24, D25 and D26. | counted in milestones 6 and 8 |
| Section 18: Testing and release | partial | **At `2582768`:** `typecheck`, `verify-content`, `pnpm test` (3,185 of 3,185 in 207 files, with the coverage thresholds) and `pnpm test:golden` (35 of 35) pass; catalog plus cross-tenant plus migrate fail 4 of 1,142 (the `practice` probe). `pnpm test:e2e` was not run in this review. **Test matrix:** 113 cases (PAR 30, MAP 5, CON 7, PRC 20, CAS 15, LED 11, SEC 15, JOB 4, MOD 6). `packages/synth/src/fixtures.test.ts` requires `matrix.ts` to match the matrix word for word, and requires `assertedBy` for cases up to milestone 10. **Mutation:** the verifier scored 86.17%; pricing and the ledger are not measured. **CI:** `ci.yml` runs only on `pull_request`, and no CI run can be confirmed from here. **Lints:** there is no copy lint anywhere. The hex lint is only on the brand branch, and `brand.spec.ts` saves screenshots but compares no baseline. **CO-09's 30 new rows:** some are already covered. CAS-19 is CON-06, LED-13 is LED-06, CAS-25 is PRC-14 plus the second-level window tests, SEC-16 extends SEC-04, and CAS-17 is CAS-03 with two plans where it needs two payers. | CO-01, CO-07, CO-09, CO-11 | Each matrix row lands in the PR whose test asserts it. The copy lint and the hex lint go in PR 1, the red teams in PR 7 and PR 16. | counted in those PRs |

## Change order items

| Item | Status today | Where it lands | Schema change |
| --- | --- | --- | --- |
| CO-01 Brand drop-in | partial: built on `brand/paidwhole` at `7994f15`, not merged; pixel baselines, the exact-file hex allowlist and the static font guard missing | PR 1 (milestone 3 follow-up) | no |
| CO-02 Domain model approval gate | partial: the generator and the draft `domain-model.md` (regenerated at `2582768`) exist in scratch; nothing is in the repository; the CLAUDE.md line is absent | PR 2 (milestones 0 to 1) | no (it gates every schema change after it) |
| CO-03 EMR export fixtures | not started; milestone 9's posting-template mapper is reusable | PR 3 and PR 4 (milestone 3) | yes (PR 4) |
| CO-04 Free screening | not started; `prospect_request`, `rate_limit_take()` and `price()` are reusable | PR 6 (milestone 6) | yes |
| CO-05 Packet v0 export | partial: the milestone 8 packet already carries lines, citation, hashes and approval; there is no deadline status, no evidence for a contract's own window, no verifier at export and no founder path | PR 5 (milestone 6) | yes (`deadline_verification_status`, contract-window evidence) |
| CO-06 Packet and case workbench | not started on top of milestone 8's complete base | PR 8 to PR 14 (milestone 8) | yes |
| CO-07 Red team | not started; `.claude/agents/qa-fixture-builder.md` exists (maxTurns 20) | PR 7 (milestone 6), PR 16 (milestone 11) | no |
| CO-08 Firm grants and minimal portfolio | partial: grants, scope, expiry and revocation in the database, tested; firm organizations and firm user invitations built; no client invitations, grant approval or revocation flows, firm settings or portfolio | PR 17 (11b) | yes (`client_invitation`) |
| CO-09 Test matrix and scorecard | partial: none of the 30 rows is in `test-matrix.md`; CAS-19 and LED-13 are already asserted by existing tests; no `scorecard.md` | with the work they test: PR 6, PR 7, PR 9, PR 10, PR 11, PR 13, PR 15, PR 17 | no |
| CO-10 Gates | not started: there is no `docs/product/gates.md`; PRD 17 holds the gates only as table rows | PR 7, updated in PR 16 | no |
| CO-11 Positioning and copy | partial: tagline and printed definition on the brand branch; descriptor, independence claim, seal and badge constants and the copy lint missing | PR 1 | no |
| CO-12 Data model changes | not started; three rows name things that do not exist (`practice_settings`, `packet_export`, a roles enum) | PR 5, PR 6, PR 8, PR 14 | yes |

## Proposed pull requests, in order

**Step 0, before PR 1 (not a change-order PR).** The milestone 10 and 11 fix pass finishes and is committed. `pnpm test`, `pnpm test:db` (catalog and cross-tenant) and `pnpm test:e2e` must be green at its head. Of what this review found, one item is left at `2582768`: the cross-tenant `practice` probe (`RowFactoryError` on CHECK `practice_deleted_at`, 4 of 1,142 cases). The infra test passes since `d54660f`, and ADR 0055 exists since `2582768`. Every PR below targets `claude/build-platform` (D4) and is done when its check passes in CI.

PR 1 comes before PR 2 although CO-02 belongs to an earlier milestone (rule 6 of the change order). PR 1 changes no schema; CO-01 is overdue ("milestone 3 at the latest") and must come before any further screen work; and `PROMPT.md` asks only that CO-01 precede further screen work and CO-02 precede further schema work, which this order keeps. Both wait on step 0.

1. **Brand and copy: merge `brand/paidwhole`, add the CO-11 copy and the copy lint.**
   - **Covers:** CO-01 and CO-11, as one PR as `PROMPT.md` requires. Milestone 3 follow-up; it comes before any further screen work.
   - **Contents:**
     - Merge `7994f15`, renumbering its ADRs 0054 and 0055 to 0056 and 0057 (main's 0055 now exists) and updating their about 28 citations.
     - Resolve the 17 files both branches changed at `2582768`: `apps/web/src/components/shell.tsx` (the header CO-01 restyles); `apps/web/src/lib/http/security-headers.ts` and `apps/web/next.config.ts` (the branch's `/brand/*` header rule against `d54660f`'s static asset origin; D7); `apps/web/src/components/help.ts`, `apps/web/src/components/models/display.tsx`, `apps/web/src/lib/http/readiness.test.ts`, `apps/web/e2e/models.spec.ts`, `apps/web/scripts/synthetic-personas.ts`; the console organization, specialist-queue and tickets pages, `/support` and `abstraction/versions/[versionId]`; `README.md`, `apps/worker/build.ts`, `apps/worker/package.json` and `apps/worker/src/platform/wiring.ts`.
     - Add `docs/product/change-order-001.md` and the approved `reconciliation-001.md`.
     - Narrow the hex allowlist to `tokens.css`, `tokens.ts` and `mark.ts` in `packages/brand/src`, plus `apps/worker/src/mail/template.ts` (today `tools/brand-colors/scan.ts:21` allows the whole `packages/brand/src/` prefix; D9).
     - Add an ESLint `no-restricted-imports` rule for `next/font/google` and a source scan for the two font hosts.
     - Commit `toHaveScreenshot` baselines for the header at 1280 and 390 px and the report cover with and without the seal, built in the CI image; upload the screenshots as a CI artifact.
     - Add `descriptor`, `independenceClaim`, `sealText` and `badgeText` to `packages/brand/src/tokens.ts` and use them in both renderers.
     - Rewrite the about 23 "recovered" strings and `proofLevelWords` to say posted or deposited, and render today's label at `reports/page.tsx:154`.
     - Add `tools/brand-copy`, an AST copy lint run in `pnpm test` that does not scan `docs/`.
   - **Acceptance (CO-01, CO-11):** "a lint check fails on any hex color outside `packages/brand/src/tokens.css` and email templates; `VerifiedSeal` and `VerifiedBadge` render nothing when `reconciledToCash` is false; no page requests `fonts.googleapis.com` or `fonts.gstatic.com`; visual tests of the header at 1280 and 390 px and the report cover with and without the seal". And: "a copy lint fails on the forbidden terms in `apps/web` and report templates". The full CI must also be green, including `test:e2e`.
   - **Effort:** 16 to 24 hours. **Decisions:** D6 to D11.

2. **Domain model: generated, tested and approved.**
   - **Covers:** CO-02 (milestones 0 to 1; section 8). It comes before any further schema work.
   - **Contents:**
     - Port `generate-domain-model.mjs`, with `areas.json`, `divergence-explanations.json` and `check-drizzle-and-catalog.mts` (the document's cross-check section), into `packages/db` as `pnpm db:domain-model`.
     - Regenerate `docs/product/domain-model.md` at the head step 0 leaves.
     - Add a db-project test that migrates a scratch database, regenerates the document and fails on any difference other than the "Approved by" line and the provenance line, so a pull request that changes no schema passes whatever its commit. It runs with `--strict` (every divergence explained, no stale explanation).
     - Run it with `--require-approval`, which fails unless the approval line carries a name, a date and the SHA-256 of the text as approved, so an approval never carries over to a regenerated document.
     - Add the CLAUDE.md rule from D1.
   - **Acceptance (CO-02):** "the file exists, matches the schema, and carries an approval line with a date". `pnpm test:db` fails when a migration is added without regenerating the document. (Checked in scratch: the generator exits 2 when a migration adds a table the area map does not place, as `20261101120000_support_mail.sql` did, and 1 on any changed line; a different commit alone passes; a stale or blank approval fails `--require-approval`.)
   - **Then stop for the founder's approval.**
   - **Effort:** 6 to 10 hours. **Decisions:** D1, D2.

3. **EMR export fixtures and the tabular fixture guard.**
   - **Covers:** CO-03, first part; milestone 3 follow-up; no schema change.
   - **Contents:**
     - A declarative vendor format registry for WebPT Billing, Prompt, SPRY and Raintree, each marked `FORMAT_UNCONFIRMED`.
     - Generators for ERA and posting exports from the case registry.
     - Four built-in posting templates with a confirmed or unconfirmed status.
     - The four templates are data beside the one SYNTHETIC template in `BUILT_IN_POSTING_TEMPLATES` (`packages/ledger/src/templates.ts`). `posting_row.template` is a free name (`posting_row_template_check`), so there is no ledger DDL, and matching does not change.
     - `.xlsx` posting exports either read through the existing sheet reader or refused at intake.
     - `assertSyntheticFixture` for CSV, TSV and XLSX, with `fixture-guard.sh` and a CI step applying the same rule.
     - `.claude/settings.json`, if the owner approves (D14).
   - **Acceptance (CO-03):** "no file without the `SYNTHSENDER` marker can enter fixtures": the writer, the hook and the CI step each refuse a CSV fixture without it. The four vendor posting fixtures load into `posting_row` through their templates.
   - **Effort:** 18 to 28 hours. **Decisions:** D14.

4. **EMR ERA exports as first-class intake.**
   - **Covers:** CO-03, second part; milestone 3 follow-up; schema change; regenerate and approve the domain model.
   - **Contents:**
     - An `era_export` document kind with a `format_id` on `source_document`.
     - Provenance on `remittance`: envelope fields required only for X12, plus a duplicate key for exports. The CLAUDE.md idempotency convention is amended to match.
     - One normalizer into the typed load model the 835 loader uses. Observed allowed always uses the existing `paid_plus_pr` basis, so the engine does not change.
     - An export that lacks a field a line needs is held with a reason.
     - The cross-format duplicate rule.
     - The Coverage flag for unconfirmed formats.
   - **Acceptance (CO-03):** "each of the four formats round-trips through intake into canonical claim lines on synthetic data; an unconfirmed format is flagged in the Coverage screen". The same payment sent as an 835 and as an export loads once.
   - **Effort:** 39 to 61 hours. **Decisions:** D12, D13.

5. **Packet v0: deadline verification and the verifier at export.**
   - **Covers:** CO-05 and CO-12 (`deadline_verification_status`); milestone 6 follow-up, applied to the milestone 8 packet (D15); schema change (`deadline_verification_status`, and the contract-window evidence D17 needs); regenerate and approve the domain model.
   - **Contents:**
     - A pure `deadlineVerification()` in `@tp/triage` that reads the trace's window source and the record's level, and a not-actionable reason `DEADLINE_UNVERIFIED` (not an unpriced reason).
     - Packet content `tp-packet/2` with the deadline, its status and a calculation summary per line.
     - The export job re-runs `verifyNarrative` over what it renders and refuses an unverified deadline, in SQL and in the worker.
     - The founder's attestation over the export hash (D16).
     - Contract-window evidence. `contract_version.dispute_window_days` (`20261016160000_contracts_and_mapping.sql:159`) carries no page, quote or hash, so the version gains its window's evidence additively, as rate records carry theirs, frozen with the other terms once signed off (`contract_version_rules`). Until a version has it, its lines are `DEADLINE_UNVERIFIED` (D17).
     - A new SYNTHETIC release 900005 whose dispute-window records carry the agreed level, as 900004 was added for PRC-19. Releases 900001 to 900004 stay as they are: 110 of the 150 golden claims pin 900001's `manifest_sha256`, and a record's level is part of that hash.
     - AUDIT-01 keeps reproducing. Its two contract windows (3,650 and 30 days, `fixtures/synthetic/audit/AUDIT-01/inputs.json`) gain their evidence, and `tools/audit-worksheet` applies the same deadline rule, so `audit-e2e.db.test.ts` still matches the worksheet line for line.
     - The best-option audit's items #4, #5, #26 and #61, their "PR 5 before merge" parts (the owner's ruling of 2026-10-18; ADR 0061), in the same migration:
       - #4: one database check of whether a version's pricing is still current (every line on its pricing in effect, its rule release not withdrawn, the plan's mapping it priced under still in force, its contract version signed off and covering the service date), serialized with the writes that make pricing stale, refusing the approval, the export request, the export job, the export guard and the attestation; a submission that already happened is logged and flagged (`submission.pricing_check`), never refused; the pages show each stale line's figures then and now; MAPPING_NOT_IN_FORCE, VERSION_NOT_IN_FORCE and RELEASE_WITHDRAWN take such lines out of the actionable totals; no audit report on a withdrawn release.
       - #5: the contract window's unit and start (`dispute_window_unit`, `dispute_window_measured_from`), chosen from fixed lists against the quote; a window is verified only when that is the rule the product computes (calendar days after the payment date, BPR16), and the screens show the computed rule beside the quote; a window counted another way has no end judged or stated until PR 6c. No Medicare Advantage non-contracted deadline is verified until the route is confirmed (Q34), so no such packet exports until then.
       - #26: the export's readiness checked before anything is queued; every refusal and failure of the export job an audit event with a code and no patient data; the packet page shows the latest attempt.
       - #61: the drafter's Approve button disabled with its reason beside Request approval, and one form for the builder with unique IDs.
       - Not here: refreshing cases on an accepted re-run or a withdrawal, the withdrawal's fan-out and the sent-packet alert (PR 11); the engine's window computation and the Medicare Advantage route lookup (PR 6c, the audit's engine corrections under one freeze exception); each plan's dispute policy and an optional attempts table (PR 8); the accessibility gate (PR 7).
     - The combined audit's item #37 part 1, the payer's copy (the founder's rulings of 2026-10-20, Q1 to Q6 (a); ADR 0061, "Audit item #37, part 1"): the export's PDF and CSV print only what the payer's examiner needs and code knows, closing with "Approved for submission by <practice> on <date>, reference <REF>." and the practice's correspondence contact; no login, record ID, SHA-256, verification, specialist line, audit flag, evidence gap, version number or footer (all of it on the reviewer's review page, the Internal record card); the patient control number neither printed nor named in a narrative; the dispute window's dates only, and above the first level the level's own window alone; interest only where code computed it above $0.00; no code printed, a code without its words refusing the copy; the payer by its name with its ID in words and the plan by its name, or "plan identifier <id>" when none is known, never in its remittance-key form (`2U:`, `CE:`; ADR 0061, Verification fix (2026-10-21)); the reference from the approved SHA-256, naming the files, leading every row of the CSV schedule (its `packet_reference` column, the founder's ruling of 2026-10-21) and found from Cases; the correspondence contact in `practice.settings`, set by the practice administrator, without which no packet is exported (`contact_missing`, in the refusal codes and the export guard of the unmerged migration); the reviewer's seven-item checklist, its schema built from the list, saying what each file carries; CAS-26 to CAS-28.
       - Not here: the payee, TIN, remark codes and the route's form and fields (part 2, PR 8); the check (part 4, PR 9); the two outputs, the cover letter, the per-claim payer terms, scoped exports, the model prompt's wording and CMS terms for release numbers (part 3, PR 12).
     - A submission sent without sign-off (the founder's ruling of 2026-10-20; ADR 0061, "Owner rulings (2026-10-20)"): an export whose pricing went stale after it was made and before its attestation is never attested, and its submission is logged unattested with its reason ("sent without sign-off: pricing went stale after export"; `submission.unattested_reason`, `packet_version_unattested_reason()`, the audit event `submission_logged_unattested`, in the unmerged migration), only with the person's confirmation, so reconciliation tracks the payer's answer; every other submission still needs the attestation. The pages say to log an export already sent first, before any line is written off or a new version written; a replaced export is still offered as sent before the edit, and a closed case says how to log one. CAS-29.
     - "The remittance date" is the remittance advice's own date, not the payment date (BPR16) (the founder's ruling of 2026-10-20; ADR 0061): a contract window counted from it stays unverified until PR 6c computes it, and the line page's trace says beside the engine's `remittance_date` that it is the payment date.
   - **Acceptance (CO-05):** "a packet cannot be exported with a figure, date, code, count or identifier absent from its inputs; the stored hash matches the exported file; an unverified deadline blocks export". `pnpm test:golden` passes with `fixtures/golden` unchanged, and AUDIT-01 still reproduces.
   - **Effort:** 46 to 80 hours. **Decisions:** D15, D16, D17.

6. **Free screening.**
   - **Covers:** CO-04, CO-12 (the four screening tables), and CO-09 rows SCR-01 to SCR-06 and SEC-17; milestone 6 follow-up; schema change; regenerate and approve the domain model.
   - **Contents:**
     - Four screening tables built as `prospect_request` is: no `practice_id`, RLS forced, writes only through SECURITY DEFINER functions, 30-day expiry by a platform job.
     - The browser parses the upload. The server checks the header names and the typed rows, and stores no bytes.
     - An adapter calls `price()` unchanged and multiplies the rounded per-line amount by the row count outside the engine.
     - A `screening` rate-limit bucket.
     - The conversion to `prospect_request` logged as an audit event.
     - Screening outputs carry no tagline, and the copy lint gains the screening paths with owed, underpaid and recovered.
     - Real prospects wait for release 1; tests use SYNTHETIC releases.
   - **Acceptance (CO-04):** "an upload with a date-of-service or member-ID column is rejected with the column named; a clean upload returns a result in under 60 seconds for 50,000 rows; no screening output contains the words owed, underpaid or recovered; conversion from screening to audit is logged as an event". SEC-17 also passes.
   - **Effort:** 49 to 82 hours. **Decisions:** D11, D18 to D21.

7. **Milestone 6 exit: the red team, the gates and the scorecard.**
   - **Covers:** CO-07 at milestone 6, CO-10, and CO-09's scorecard; no schema change.
   - **Contents:**
     - Run `qa-fixture-builder` in batches against the CO-07 brief, to at least 100 adversarial synthetic cases.
     - Write the prioritized defect list in `docs/product/redteam-m6.md`, with a reproducing test for each defect in a quarantined `redteam` Vitest project (D22).
     - Create `docs/product/gates.md` (D23) with Gate 1 (July 15, 2027) and Gate 2 (March 31, 2028), the CO-10 additions, and the red team as an exit condition of milestones 6 and 11.
     - Create `docs/product/scorecard.md` with the five moat measures and the nine commercial measures, each with its query and owner, reported monthly from the first audit (CO-09). A measure that cannot be computed yet says what is missing.
   - **Acceptance:** "a prioritized defect list and the tests that reproduce each, never a pass rate". No defect rated high is open (CO-07: "Defects rated high block the gate"). A db test runs every scorecard query on the synthetic seed.
   - **Effort:** 28 to 52 hours, plus fixing what the red team finds.

8. **Workbench schema.**
   - **Covers:** CO-06 and CO-12; milestone 8 follow-up; schema change; regenerate and approve the domain model.
   - **Contents:**
     - `case.readiness_grade` (text CHECK E0 to E3, derived in `case_rules`, granted to no role).
     - `case.independent_signoff_required` (derived).
     - `case.workflow_state` (D25).
     - `case_transition_log`, with `practice_id`, a registry row, FORCE RLS and append-only triggers.
     - On `packet_version`: `disclosure_scope`, `invalidated_by` and `invalidated_at`.
     - `packet_export` and `packet_export_part`, backfilled from the existing export columns, which stay (D26).
     - An append-only `case_line_pricing` history (D30).
     - Two `practice.settings` keys under a CHECK and `practice_setting_keys()` (D29).
     - The contract-side legal entity, NPI or TIN, and dispute route record, if approved (D33).
   - **Acceptance:** the catalog and cross-tenant tests pass with the new tables. A test per derived column shows that writing it as `tp_app` is refused. A guard test finds no DDL on a ledger or pricing table after the approval head.
   - **Effort:** 20 to 32 hours. **Decisions:** D25, D26, D29, D30, D33.

9. **Readiness grade and the eight E3 gates.**
   - **Covers:** CO-06, and CO-09 rows PKT-01 to PKT-10, CAS-18, CAS-19, CAS-20 and CAS-22.
   - **Contents:**
     - A SQL `case_readiness()`, with a pure mirror in `@tp/triage` and a parity test.
     - Recompute on every relevant case-side write.
     - A pure `checkGates()` in `@tp/packets` with codes E3_G1 to E3_G8, and a SQL `packet_gate_failures()` in the export branch of `packet_version_rules`.
     - The gate report stored on the version.
   - **Acceptance (CO-06):** "readiness grade recomputes on every relevant write and cannot be set through any API; E3 export is refused when any gate fails, with the failing gate named". PKT-01 to PKT-10 pass.
   - **Effort:** 95 to 165 hours. **Decisions:** D24, D27, D32, D33.

10. **Case transitions.**
    - **Covers:** CO-06, and CO-09 rows CAS-23 and CAS-25.
    - **Contents:**
      - A SECURITY DEFINER `case_transition()` that logs a refused transition and returns the refusal without raising, so the refused row persists. The route answers 409.
      - Record-driven transitions logged from triggers.
      - History backfilled from the append-only records.
    - **Acceptance (CO-06):** "`case_transition_log` holds a rejected transition from a test". CAS-23 and CAS-25 pass.
    - **Effort:** 33 to 57 hours. **Decisions:** D25.

11. **Invalidation and re-pricing that reach cases.**
    - **Covers:** CO-06, and CO-09 rows CAS-16, CAS-21 and CAS-24.
    - **Contents:**
      - Triage and the daily monitor detect a re-judged line, a superseded contract version or a withdrawn rule release, with no trigger on a pricing table. They set `invalidated_by` and `invalidated_at` once, and the case returns to calculation verification.
      - An invalidated version is refused for approval and export.
      - A sent version is preserved.
    - **Acceptance (CO-06):** "editing an approved calculation invalidates the review". A submitted version and its exports stay unchanged. CAS-16, CAS-21 and CAS-24 pass.
    - **Effort:** 33 to 55 hours. **Decisions:** D30.

12. **Exports: five parts, disclosure scopes and neutral language.**
    - **Covers:** CO-06.
    - **Contents:**
      - An evidence bundle, a calculation manifest (rule releases with manifest hashes, engine version, each line's trace hash and recompute result) and an approval and submission record, each hashed into `packet_export_part`.
      - An identifier set per scope (D26).
      - The packet heading and requested action rewritten to "our review indicates a payment difference under the following terms".
      - The executive summary and the internal audit manifest as separate exports.
    - **Acceptance:** the stored hash of every part matches its file; an export that lacks a part is refused; an export under the payer scope carries only the identifiers that scope admits; the copy lint covers the packet templates.
    - **Effort:** 57 to 96 hours. **Decisions:** D26.

13. **Case screen: numbers, six tabs and drill-down.**
    - **Covers:** CO-06, and CO-09 row CAS-17.
    - **Contents:**
      - Allowed-amount variance as the headline and insurer-payment variance second (D31). Patient responsibility is shown and never counted. The five stage totals stay separate, with recovered labelled posted or deposited.
      - Six tabs: Overview, Calculations, Evidence, Affected claims, Review and submission, Recovery ledger.
      - Every amount drills from case total to line, trace, rate record and evidence.
      - Invoices carry no stage figure today (nothing in `packages/billing` or `apps/worker/src/billing` reads a stage), so CO-06's "on invoices" holds by construction; a test pins it.
      - An ADR records the model boundaries.
    - **Acceptance (CO-06):** "the six tabs render for a synthetic case". A loader test shows that the stage totals never sum. CAS-17 passes with two payers.
    - **Effort:** 61 to 104 hours. **Decisions:** D31, D34.

14. **Roles and independent sign-off.**
    - **Covers:** CO-06 and CO-12 (roles); schema change; regenerate and approve the domain model; reviewed by the security-reviewer agent.
    - **Contents:**
      - The role lists widened everywhere they are enforced: `membership_role_check`, `role_permission_role_check`, the grant's `grant_scope` (`GRANT_SCOPE_ROLES`, `packages/db/src/schema/tenancy.ts:30`) and the organization-kind rule in `membership_role_fits_organization`. The role-listing functions replaced, and `role_permission` rows added for `financial_reviewer` and `auditor` (D28), with the TypeScript matrix, labels and generated route tests.
      - `packet_version_rules` refuses the single-user path when the case requires independent sign-off, re-reading the settings at approval.
    - **Acceptance:** the permission-matrix test, the generated route tests and the cross-tenant test pass. An auditor's write is refused in the handler and in Postgres. A case at or above the threshold cannot be approved by its drafter even after 24 hours.
    - **Effort:** 28 to 48 hours. **Decisions:** D27, D28, D29.

15. **Ledger tests LED-12 and LED-13.**
    - **Covers:** CO-09; milestone 9 follow-up; tests only.
    - **Contents:** LED-12 gets a new synthetic fixture and test. LED-13's registry entry names the existing LED-06 tests. If LED-12 fails as written, work stops and the owner is asked, because the ledger's semantics are frozen.
    - **Acceptance:** both rows are in `test-matrix.md` and `matrix.ts` with `assertedBy`, and their tests pass.
    - **Effort:** 5 to 9 hours.

16. **Milestone 11 exit: the red team.**
    - **Covers:** CO-07 at milestone 11 and CO-10; after step 0.
    - **Contents:** the same brief, aimed at tenant leaks across routes, PHI in logs, CSRF, rate limits and the billing and e-signature roles.
    - **Acceptance:** the defect list with a reproducing test for each defect; no high defect open; `gates.md` records the result.
    - **Effort:** 16 to 30 hours, plus fixes.

17. **Firm grants and minimal portfolio (11b).**
    - **Covers:** CO-08 and CO-09 row SEC-16; schema change outside CO-12's list (a `client_invitation` table, D35); regenerate and approve the domain model; reviewed by the security-reviewer agent. Firm organizations and firm user invitations already exist (the 11b row); this PR adds what is missing.
    - **Contents:**
      - Client invitations that the practice administrator accepts (D35).
      - Grant approval and revocation routes and screens, each with a Zod schema, a role check, a practice-scoped transaction and an audit event.
      - A firm settings page.
      - The Portfolio in CO-08's minimal form: client practices, contract coverage, short dollars in window, open cases and a practice switcher. It is built from one multi-practice scope inside the same policies, shows counts and dollars only, and never sums the stages.
      - The J13 "needs an owner" list (D36).
    - **Acceptance (CO-08):** "a firm user sees only granted practices; revocation takes effect on the next request; the portfolio aggregates no PHI (counts and dollars only); a firm with five practices works from one login". SEC-16 passes, showing that the practice keeps its rows.
    - **Effort:** 34 to 60 hours. **Decisions:** D35, D36.

**After PR 17**, milestone 12 starts with its reduced scope, then milestone 13.

**Total for PR 1 to PR 17:** about 585 to 995 hours, before fixing what the two red teams find. PRD 17 estimates 900 to 1,300 for the whole plan (see D5).

## Decisions needed from the owner

Each decision names the pull request it blocks.

**Process and the domain model**

- **D1. When does the CO-02 schema freeze start, and what does CLAUDE.md say?** Blocks PR 2.
  - **Options:** (a) approve the schema at the head step 0 leaves, which includes the fix pass's `20261101120000_support_mail.sql` (committed in `c220f82`, after the change order was issued), then freeze; (b) read CO-02 literally: the schema froze on October 16, 2026, so `20261101120000` waits for your approval with the document, and the fix pass adds no further migration until then.
  - **Recommendation:** (a). PR 2 adds CO-02's sentence to CLAUDE.md as written ("Milestone 1 does not start until the founder approves `docs/product/domain-model.md`."), and beneath it the rule that makes it bite now that milestone 1 is built: "No migration merges unless `docs/product/domain-model.md` is regenerated in the same pull request and its approval line carries the founder's name, a date and the hash of that text (`pnpm db:domain-model --check --require-approval`)."
  - **Why:** the fix pass corrects reviewed defects in built milestones, and the one migration it added after the change order (a support-inbox table that holds no PHI) is in the document you approve. HEAD moved from `c519650` to `2582768` during this review, so the approval names the document's hash, not a commit.
- **D2. Do you approve the divergences recorded in `domain-model.md` (sections A and B, and C1)?** Blocks merging PR 2. C2 to C5 are change-order proposals, not part of this approval: C2 is decided by D26 and D29, C4 by D25 and C5 by D18, and C3 follows the schema's rule that every enumeration is a text CHECK.
  - **Options:** (a) approve all of them, including `denial_category` as a sixteenth `rule_record.record_type` (A1; ADR 0008 has waited on this since milestone 0) and the dictionary's remittance key `(practice_id, sender_id, isa13, trn02, bpr02_cents)` (C1); PRD.md and `data-dictionary.md` stay verbatim as the imported plan, and only CLAUDE.md's idempotency line, which names the payee where the key names the sender, is corrected to the key and ADR 0031's resend rule; (b) approve all but `denial_category`; (c) reject some, which then become migrations.
  - **Recommendation:** (a). The approved domain model is where each accepted divergence is recorded.
  - **Why:** every divergence has an ADR. The schema passes the catalog and Drizzle checks. Rewriting the plan's tabs to match the build would erase the record of what was decided, while CLAUDE.md is the repository's working instruction and should state the key the code enforces.
- **D3. May 11b and milestone 12 start while milestones 0, 1, 2, 5, 6, 7, 10 and 11 wait only on outside people and accounts?** Blocks PR 17 and milestone 12.
  - **Options:** (a) count "built, reviewed and green, with the README's blocked note" as done for sequencing; (b) wait until those checks are met.
  - **Recommendation:** (a).
  - **Why:** release 1, staging credentials, the specialist, real audits, model access, Stripe and the security official cannot come from the repository. Waiting on them would stall every follow-up.
- **D4. Where are the pull requests opened?** Blocks PR 1.
  - **Options:** (a) against `claude/build-platform` on origin; (b) merge `claude/build-platform` into `main` first.
  - **Recommendation:** (a). Merging into `main` is your call.
  - **Why:** all 111 commits since the plan import are on `claude/build-platform`, `main` holds only the plan import (`a28d530`), and `ci.yml` runs only on `pull_request`.
- **D5. The change-order work is about 585 to 995 plan hours, against 900 to 1,300 for the whole plan. The change order fixes the gates' dates and the 13-hours-a-week pace. How should this be handled?** Blocks nothing now; review after PR 7.
  - **Options:** (a) keep the dates and the pace, and track PR 1 to PR 7 (about 200 to 340 hours) as the Gate 1 path and PR 8 to PR 14 (about 330 to 560 hours) against Gate 2; (b) defer parts of CO-06 that Gate 2 does not need (the executive summary, the internal audit manifest, the drill-down) until after Gate 2; (c) change the pace, which the change order says not to do without asking.
  - **Recommendation:** (a), and decide on (b) once PR 7 is merged.
  - **Why:** the hours are estimates in the plan's unit. The build has run far faster than 13 hours a week so far (110 commits between 2026-10-15 and 2026-10-17), so the calendar risk is real only if that pace stops.

**Brand and copy (PR 1)**

- **D6. When does `brand/paidwhole` merge, and how are its ADRs numbered?**
  - **Options:** (a) after step 0 and before any further screen work, with its ADRs renumbered to the next free numbers; (b) now, while the fix pass is running.
  - **Recommendation:** (a). The brand ADRs become 0056 and 0057.
  - **Why:** main's 0054 and 0055 exist and are cited by applied migrations (`20261031090000` cites 0054; `20261101090000` to `20261101120000` cite 0055), which cannot be edited. The brand's about 28 citations are comments and docs. The two branches changed 17 of the same files, the app header among them, so merging while the fix pass commits would mean resolving them twice.
- **D7. Email art needs `Cross-Origin-Resource-Policy: cross-origin`, and the application answers `same-origin` on every response (ADR 0053; `apps/web/src/lib/http/security-headers.ts`). How should email art be served?** Every option changes the security program, so each needs your consent.
  - **Options:** (a) the application answers `cross-origin` on `/brand/*` (what the branch does, in `apps/web/next.config.ts`); (b) serve `/brand/*` from the CloudFront static host too: since `d54660f` that host answers `cross-origin` for `/_next/static/*` (`STATIC_PATH_PATTERN` in `infra/lib/constructs/edge.ts`), so its path list widens and the mail template takes its art URL from `STATIC_ASSET_ORIGIN`; (c) embed the lockup in each email.
  - **Recommendation:** (b).
  - **Why:** the application's own headers stay as ADR 0053 and 0055 set them, and the exception lives where one already exists and is tested (`infra/test/edge.test.ts`). The files are published brand art with no data either way. Under (b), a local build with no static host sends email without its art.
- **D8. Should a dispute packet carry the practice's name as letterhead (what the branch does) or the PaidWhole cover?**
  - **Options:** (a) the practice's letterhead, with no PaidWhole lockup; (b) the PaidWhole Paper cover.
  - **Recommendation:** the practice's letterhead.
  - **Why:** a packet is the practice's own letter to its payer, which fits CO-06's minimised export. BRAND.md section 7 speaks only of reports.
- **D9. Accept six smaller brand choices as the branch made them, with two tightenings?**
  - **The six:** (1) the stacked lockup on Paper at sign-in, with BRAND.md section 3 corrected; (2) Slate text on unpriced chips until the brand owner darkens `--pw-unpriced` to 4.5:1; (3) dark mode stays off; (4) the hex allowlist becomes four exact files (`tokens.css`, `tokens.ts` and `mark.ts` in `packages/brand/src`, and `apps/worker/src/mail/template.ts`), although CO-01's check names only `tokens.css` and email templates: the drop-in's own `tokens.ts` (12 hex values) and `mark.ts` (5) would fail a literal reading; (5) committed pixel baselines and CI artifacts; (6) the branch adds a color that BRAND.md section 4 does not list to the drop-in's `tokens.css`: `--pw-input-border` (#808996, and #5A6E8E in dark mode) for form-field outlines (WCAG 1.4.11), plus the alias `--pw-danger-bg`.
  - **Options:** accept all six, or decide each.
  - **Recommendation:** accept all six, and send (2) and (6) to the brand owner, who alone changes the palette.
  - **Why:** each is either recorded in the brand ADR or needed for the CO-01 acceptance to mean anything. The current `--pw-unpriced` (3.7:1) fails the brand's own contrast rule.
- **D10. CO-11 says "recovered" is always labelled posted or deposited, so every user-facing string changes: about 23, plus `proofLevelWords` (`apps/web/src/components/reconciliation/display.tsx:39`). Does "always" also reach the stage code `recovered`?** It is a value of `line_status.stage`, one of CLAUDE.md's five stages, and appears in the API and in CSV columns.
  - **Options:** (a) codes are exempt, and the copy lint reads labels and text only; (b) rename the code too.
  - **Recommendation:** (a).
  - **Why:** a code is not a label, and renaming it would change the five-stage status model and a CHECK on a triage table, which the change order does not ask for.
- **D11. Where do the descriptor and the independence claim appear, and what do screening outputs show, given that the tagline contains "owed"?**
  - **Options:** (a) the descriptor in the page metadata, the manifest and the request-audit lede, and the independence claim on request-audit and the audit report cover; screening shows the lockup without the tagline; (b) metadata and manifest only.
  - **Recommendation:** (a).
  - **Why:** those are the only prospect-facing surfaces. CO-11 says screening never says owed. Sign-in stays undecorated.

**EMR exports (PR 3, PR 4)**

- **D12. How do ERA exports become canonical claim lines?** `remittance` requires X12 envelope fields, refuses non-835 documents (`remittance_references_in_practice`) and is keyed on ISA13; CO-12 lists none of this.
  - **Options:** (a) provenance on `remittance` (envelope fields required only for X12, plus an export duplicate key on payee, TRN02, amount and payment date) and an `era_export` kind with `format_id`, with the CLAUDE.md idempotency rule amended; (b) a separate export table, which forks every consumer; (c) defer the loading until real format samples arrive.
  - **Recommendation:** (a), approved as an addition to CO-12 under CO-02.
  - **Why:** it is the only option that meets CO-03's acceptance without new code paths in pricing, triage and the ledger.
- **D13. When the same payment arrives as an 835 and as an export, which one loads?**
  - **Options:** (a) the 835 is authoritative: an export of a payment already loaded loads nothing, and a later 835 for a payment loaded from an export is held for review; (b) the first arrival wins; (c) load both and net them.
  - **Recommendation:** (a).
  - **Why:** double loading doubles variance and cases, and replacing priced lines silently would break rule 3.
- **D14. Where does `SYNTHSENDER` go in a tabular fixture, and may the Starter kit's `.claude/settings.json` be committed?**
  - **Options:** (a) the marker in a real identifier field (the payee or sender ID column), with the guard covering CSV, TSV and XLSX in the writer, the hook and CI, and `settings.json` added; (b) a marker comment row; (c) guard every file type.
  - **Recommendation:** (a).
  - **Why:** without `settings.json` no hook runs in a session. `fixture-guard.sh` gains the tabular rule CO-03 asks for; `protect-content.sh` and `typecheck.sh` are wired unchanged. The change order protects the content hooks, so you confirm.

**Packet v0 (PR 5)**

- **D15. Build a separate packet v0, or change the milestone 8 packet?**
  - **Options:** (a) apply CO-05 to the milestone 8 packet; (b) build a separate v0 export.
  - **Recommendation:** apply CO-05 as changes to the milestone 8 packet.
  - **Why:** milestone 8 already holds the lines, citation, hashes and verifier. A second export path would duplicate tested code.
- **D16. How does the founder approve a v0 packet, given that internal users approve nothing (ADR 0041; support grants carry only support, contract_specialist or reviewer)?**
  - **Options:** (a) the founder, as reimbursement reviewer under a support grant, attests over the export hash, as `audit_report` does; (b) give the founder a practice membership; (c) a practice user approves and the founder attests.
  - **Recommendation:** (a), plus (c) where the practice has users.
  - **Why:** it reuses a tested pattern and leaves the security program unchanged.
- **D17. What makes a deadline "verified"?**
  - **Options:** (a) for Medicare and MA, the window's rule record is at L2 or higher (L3 for E3); for commercial lines, a signed-off contract window with its own page, quote and hash; a release `commercial_default` is never verified; (b) a person confirms each case's deadline; (c) any known source counts.
  - **Recommendation:** (a), derived from the trace with the engine untouched. PR 5 adds the contract-window evidence and a new SYNTHETIC release 900005 at the agreed level; releases 900001 to 900004 and the golden claims stay as they are.
  - **Why:** only (a) makes "verified" mean a source a person signed off. What it costs: every synthetic and draft window record is at L1 today, and `contract_version.dispute_window_days` carries no page, quote or hash, so no deadline verifies yet. Actionable totals will fall until the evidence exists; AUDIT-01's falls to zero, since both its windows are contract windows. Regenerating release 900001 instead would change the manifest hash that 110 of the 150 golden claims pin.

**Screening (PR 6)**

- **D18. Where do the screening tables live, and are upload bytes stored?** The catalog test forbids an application-written table without RLS.
  - **Options:** (a) schema `public`, RLS forced, no `practice_id`, writes only through SECURITY DEFINER functions as `prospect_request` does; the browser parses; only the hash, the row count and the rejection reasons are stored; (b) a separate schema and role; (c) bytes in S3 under a platform key.
  - **Recommendation:** (a).
  - **Why:** the catalog test stays unchanged. A file with no practice has no practice data key. A mistaken upload holding PHI never reaches storage.
- **D19. Aggregate rows cannot reproduce the multiple procedure reduction across codes. Pricing rows one at a time overstates the worked example by 15.3%: golden claim G01 (PRD 11's example) prices at 7,474 cents as one claim and 8,617 cents line by line, run through the engine at `2582768`. How should screening treat this?**
  - **Options:** (a) price each row with the unchanged engine and label the Medicare figure "before the reduction across codes"; (b) show a range computed outside the engine; (c) ask for visit composition.
  - **Recommendation:** (a).
  - **Why:** every figure stays an engine output times a count. The overstatement is stated, not hidden.
- **D20. Which payer products may an upload declare, and how are place of service and locality handled?**
  - **Options:** (a) a closed product list (`medicare_ffs`, `ma_noncontracted`, `ma_contracted`, `commercial`, `medicaid`, `other`), a platform default place-of-service split that the specialist approves, and ZIP+4 asked only where `locality_map` requires it; (b) infer the product from payer names; (c) price everything as MA non-contracted.
  - **Recommendation:** (a).
  - **Why:** the engine raises `ENGINE_ERROR` without a place-of-service split or for a ZIP that needs ZIP+4, and MA contracted rows must not be priced as non-contracted.
- **D21. How are free-mail domains rate-limited, and how are results delivered?**
  - **Options:** (a) a per-domain limit for business domains, a per-address limit for listed free-mail domains, plus a per-IP limit; results at an unguessable link that expires in 30 days and is also emailed; (b) domain and IP only; (c) browser only.
  - **Recommendation:** (a).
  - **Why:** a flat domain limit would throttle every gmail.com prospect together, and the emailed link verifies the contact.

**Red team and gates (PR 7, PR 16)**

- **D22. Where do the red team's reproducing tests live while their defects are open?**
  - **Options:** (a) a quarantined `redteam` Vitest project outside the CI gate, each test `it.fails` until its fix lands; (b) commit tests only with their fixes.
  - **Recommendation:** (a), with the agent run in batches (maxTurns 20).
  - **Why:** the defect list stays reproducible without turning CI red.
- **D23. The Build Plan defers its gates to an execution plan that is not in the repository. Will you supply that plan's gate text?**
  - **Options:** (a) you paste it; (b) reconstruct the gates from PRD.md lines 29, 708, 714 and 732 plus CO-10, marked as reconstructed.
  - **Recommendation:** (b) now, replaced by your text when it arrives.
  - **Why:** "March 31, 2028" appears only in the change order.

**Workbench (PR 8 to PR 14)**

- **D24. Where do E0 and E1 live, given that PRD 12 and CAS-02 keep anomalies out of cases and only signed-off versions price (CON-07)?**
  - **Options:** (a) E0 and E1 grade records before a case (an anomaly cohort, a pattern on an unsigned version) and a case starts at E2; (b) internal-only E0 and E1 cases, excluded from every total by SQL, with CAS-02 reworded; (c) price under candidate versions.
  - **Recommendation:** (a).
  - **Why:** it keeps CAS-02, CON-07 and the engine as they are. Under (a), CAS-18 is asserted on the cohort.
- **D25. How is CO-06's transition machine added beside today's derived `case.state` (ADR 0041)?**
  - **Options:** (a) keep `case.state` and add `case.workflow_state` with CO-06's vocabulary, moved only by `case_transition()`; `case_transition_log` gets `practice_id`, a registry row and FORCE RLS, and its reason is a closed code; (b) replace the values of `case.state`.
  - **Recommendation:** (a).
  - **Why:** no column is lost. The unique index `case_open_pattern`, `deriveCaseState` and the CAS and LED tests keep working. CLAUDE.md rule 4 requires `practice_id`.
- **D26. How are exports recorded, and what disclosure scopes exist?**
  - **Options:** (a) new `packet_export` and `packet_export_part` tables (five parts, each hashed), several exports per version with one per scope, and the existing `packet_version` export columns kept; scopes `payer` (claim control number, patient name, member ID), `practice_internal` (all four), `auditor` (pseudonym and claim control number) and `executive` (none); (b) one export per version with columns only.
  - **Recommendation:** (a).
  - **Why:** CO-06 wants scoped exports in several parts with sent versions preserved, and no table may lose a column.
- **D27. The single-user path (`approved_alone` after 24 hours; CAS-10, PRD 20) conflicts with E3 gate 8 and CLAUDE.md. How should it be resolved?**
  - **Options:** (a) keep the path, but an `approved_alone` version never reaches E3 or a payer export, and single-user practices get independent sign-off from the reimbursement reviewer; (b) remove the path; (c) leave it.
  - **Recommendation:** (a).
  - **Why:** it satisfies gate 8 without stranding single-user practices.
- **D28. What can `financial_reviewer` and `auditor` do, and is the auditor scoped per case?**
  - **Options:** (a) both are customer roles that a grant can admit; `financial_reviewer` is viewer plus `phi.read` plus `posting.reconcile`, with no packet approval; `auditor` is practice-level read-only, never `phi.export`, and is not the internal reviewer; (b) the auditor is limited per case through a case access table and new restrictive policies; (c) fold the auditor into `reviewer`.
  - **Recommendation:** (a).
  - **Why:** per-case access needs new RLS policies on case and ledger tables, which changes the security program and the ledger tables CO-12 protects.
- **D29. For independent sign-off: who signs, what counts as "novel" and "overridden", what is the threshold, and where do the settings live?**
  - **Options:** (a) the signer is a reimbursement reviewer or any `packet.approve` holder other than the drafter and the approver; novel means no exported packet before on the same rate record and behavior; overridden means a specialist ledger adjustment or a re-run accepted by hand on the case's lines; the two settings are keys in `practice.settings`; you set the default threshold (suggested $2,500 per case); (b) other definitions you give.
  - **Recommendation:** (a).
  - **Why:** the engine has no override (`priced_line_immutable`), so "overridden" must name a record that exists. There is no `practice_settings` table.
- **D30. How do invalidation and re-pricing reach cases?**
  - **Options:** (a) triage and the daily monitor detect the change, the contract sign-off and supersede handlers call a refresh in the same transaction, there are no triggers on pricing or contract tables, case lines follow re-pricing through the append-only `case_line_pricing`, and a person writes the next version; (b) refresh triggers on `contract_version` and `rate_record`; (c) the system writes the new version itself.
  - **Recommendation:** (a).
  - **Why:** CO-12 says no pricing table changes, and versions stay person-written and verifier-gated.
- **D31. What exactly is "insurer-payment variance"?**
  - **Options:** (a) expected allowed minus `service_line.patient_share_cents`, compared with paid, in integer cents outside the engine, with allocated lines flagged, and QUESTIONS Q21 (sequestration against a B6 basis) sent to the specialist; (b) use the trace's own line share.
  - **Recommendation:** (a).
  - **Why:** it is the share observed allowed was derived from. On a `paid_plus_pr` line the CHECK `service_line_observed_from_paid_and_share` makes observed allowed equal paid plus patient share, so the two variances are equal by construction; on an `amt_b6` line they differ by exactly B6 minus paid minus patient share, which is what Q21 asks the specialist about.
- **D32. CAS-22 ("a payer reduction without authority in contract or policy is not alleged") reads against the convention that the adjustment flags default off on commercial contracts. Which reading is right?**
  - **Options:** (a) triage holds a shortfall that a reduction explains (for example `MPPR_NOT_IN_CONTRACT`) for review when the rate record quotes no authority, with the engine unchanged; (b) keep alleging them and reword CAS-22; (c) change the flag defaults, which would change the engine.
  - **Recommendation:** (a), pending your confirmation of what CAS-22 means.
  - **Why:** it honors CO-09 without touching the engine's flags.
- **D33. E3 gates 1 and 7 need contract-side records that CO-12 does not list: a structured legal entity with NPI or TIN on the contract version, and a dispute route (channel, levels, evidence quote). Should they be added?**
  - **Options:** (a) add them, additively, in PR 8 under the domain-model approval; (b) leave gates 1 and 7 checking only payer and plan, and days.
  - **Recommendation:** (a).
  - **Why:** `contract.billing_entity` is free text and `appeal_levels` holds days only, so the gates could not be met.
- **D34. Should "explain a variance from approved engine results" become a fifth gateway purpose?**
  - **Options:** (a) add it, with a prompt, an evaluation set and a verifier, which reopens milestone 10's gate; (b) cover it with `draftPacketNarrative`.
  - **Recommendation:** (b) for now.
  - **Why:** milestone 10's real-model gate is already blocked on credentials.

**Firms (PR 17)**

- **D35. May a firm invite a practice that is not on PaidWhole yet, and what does a grant rest on?**
  - **Options:** (a) existing practices only, invited by their administrator's email and accepted by that administrator; a new practice becomes a prospect request onboarded under J1; the grant rests on the firm-practice engagement agreement recorded at approval, with the firm's own BAA on file; default term 12 months, at most 36, and an extension is a new grant; (b) the firm creates the practice itself; (c) platform administrators create every grant.
  - **Recommendation:** (a).
  - **Why:** PRD 3 says the practice owns its workspace and agreements. `practice_owned_by_group` forbids a firm-owned practice, and `grant_rules` stays unchanged.
- **D36. When a grant is revoked, should 11b list the practice's open cases whose owner lost access (J13)?**
  - **Options:** (a) yes: a "needs an owner" list on Cases, with a notice to the practice administrator; (b) leave it to milestone 12.
  - **Recommendation:** (a).
  - **Why:** 11b makes revocation usable for the first time. Without the list, a revoked firm leaves cases that nobody can open.

## What must not change, as checks

Every pull request above passes these checks. A pull request that cannot pass one stops and asks the owner.

**Engine arithmetic**
- No pull request changes a non-test file under `packages/pricing/src`. To check: `git diff --stat <base> -- packages/pricing/src ':!**/*.test.ts'` is empty.
- `pnpm test:golden` passes with `fixtures/golden` unchanged, and `fixtures/synthetic/rules/release-synth-900001` to `900004` stay unchanged, because the golden claims pin their manifest hashes. A new fixture release takes a new number.
- `recompute(trace)` still equals every stored `expected_allowed_cents` (PRC-16).
- `docs/product/unpriced-reasons.md` and the engine's unpriced reason list are unchanged.
- The Medicare adjustment flag defaults are unchanged: false on commercial contracts, true for MA non-contracted lines.
- Screening, deadline status and insurer-payment variance call or read the engine; they never change it.

**Ledger semantics**
- No migration alters, or adds a trigger or policy to, `ledger_entry`, `ledger_match`, `posting_row`, `eft_row` or `roi_statement`. A guard test on the migration set enforces this after the approved head.
- The `ledger_entry.stage` CHECK keeps its seven values.
- Recovered counts only entries at stage posted or deposited.
- LED-01 to LED-11 and the ledger oracle pass unchanged.
- Changes under `packages/ledger/src` are additions only: the brand branch's `reportReconciliation()` and `recoveredLabel()`, and PR 3's posting templates. `LEDGER_STAGES`, the matching rules and the recovered total are untouched.

**Content pipeline**
- Nothing under `content/releases/**` is edited by hand; new content arrives only through `/load-release`.
- `tools/verify-content`, `.claude/hooks/protect-content.sh` and `.github/workflows/publish-content.yml` are unchanged.
- No DDL touches `rule_release`, `rule_record` or `rule_release_withdrawal`.
- `pnpm verify-content` passes.

**Security program**
- `pnpm test:db` (the catalog test and the cross-tenant test) passes on every pull request.
- The rules in `packages/db/src/catalog.ts` are unchanged. Only its reviewed lists grow, for new tables that meet them.
- Every new table that can hold PHI has `practice_id NOT NULL`, a `phi_table_registry` row, FORCE RLS and the tenant policy.
- No role gains BYPASSRLS, and the application role owns nothing.
- The response headers from ADR 0053 and 0055 change only as D7 allows.
- The role and permission matrix changes only in PR 14.
- PR 8, PR 14 and PR 17 are reviewed by the security-reviewer agent.

**Milestones and gate dates**
- The fourteen milestones and their checks in PRD 17 are unchanged, apart from 11b being inserted (CO-08) and the red-team exit added to milestones 6 and 11 (CO-10).
- AUDIT-01 (`apps/web/src/lib/routes/audit-e2e.db.test.ts`), the stand-in for milestone 6's check, keeps matching its worksheet line for line.
- Gate 1 stays July 15, 2027, and Gate 2 stays March 31, 2028.
- The pace assumption stays 13 hours a week until the full-time trigger.

**Applied migrations**
- No applied migration is edited, and every schema change arrives through `/new-migration`.
- Each schema change regenerates `docs/product/domain-model.md` in the same pull request, and its approval line carries the founder's name, a date and the document's hash (`--check --require-approval`).

## Approval

Approved by the owner on October 17, 2026, in the build session. Every recommendation, D1 to D36, is accepted as written, with these answers to the questions put to the owner:

- **Sequence (D5):** option (a). All of the change order, in its order: PR 1 to PR 17, then milestone 12 at its reduced scope, then milestone 13 and the final pass.
- **Delivery (D4):** option (a). One GitHub pull request per item above, opened against `claude/build-platform`. Each is merged once its acceptance check and the full CI are green, and each ends with a report of what changed, which check proves it and what the next pull request is.
  - *Amended 2026-10-20* (the founder's ruling on audit item #20, `docs/adr/0063`, "Amendment (2026-10-20)"): once the build agent works under its own GitHub account (`docs/runbooks/github-governance.md`, step 3i), each pull request into `claude/build-platform` or `main` also needs the founder's approval of its latest commit before it merges (the build waits for it from 3i, and GitHub requires it from step 5); the build still performs the merge, after that approval and green checks. Until the agent's account exists, option (a) stands as written. No pull request goes into `main` before launch unless the founder rules on it.
- **Independent sign-off (D29):** the default threshold is $2,500 per case (`250000` cents), held in `practice.settings` and changeable per practice.
- **Email art (D7):** option (b). `/brand/*` is served from the CloudFront static host, and the application's own response headers stay as ADR 0053 and ADR 0055 set them.
- **Gates (D23):** option (b). `docs/product/gates.md` is reconstructed from the plan and CO-10, marked as reconstructed, and replaced by the owner's text when it arrives.

The domain model (CO-02) is approved separately: PR 2 regenerates `docs/product/domain-model.md` and stops for the founder's name, date and the hash of the text approved.

Ruled by the owner, Tyler Williams, on October 18, 2026, on PR 5 (recorded in ADR 0061, Owner rulings):

- **PR 5's schema (D15, D16, D17):** approved as summarised (migration `20261103090000_deadline_verification_and_export_attestation`), with one addition before the pull request opens, in the owner's words: "the reimbursement reviewer may attest an export only after downloading BOTH its PDF and its CSV, each download having passed its fingerprint check (the bytes read from storage hash to the version's stored export_sha256 / export_csv_sha256). This closes ADR 0061's residual risk F9 (a job-scope write of a forged passing report and forged hashes would pass the SQL guard, and the attestation compares only stored hashes). It must hold in the attest route handler AND in Postgres (CLAUDE.md: never rely on one layer), and the evidence of a download must be something a compromised worker (the job-scope role) cannot forge for the reviewer: bind it to the reviewer's own actor in the web request that served the file, after the hash check, written in a way the job role cannot write (check the roles and grants: tp_app versus the job role, SET LOCAL app.actor_id, audit_event's append-only rules)." Build note (2026-10-18, not a ruling): no job role existed when the ruling came, and the web and the worker shared one login, so the evidence as first built could be forged by job code that set `app.actor_id` to the reviewer's ID. PR 5 gives the worker a login of its own (a member of `tp_app` and of the marker role `tp_job`), and Postgres refuses the evidence and the attestation on it by `session_user`. F9 is then closed against a compromised worker, and stays open against a process holding the web's own login (ADR 0061, What it does not hold against). The worker's login adds a sixth login and secret beyond the approved migration; the founder confirms it with the domain model's new hash, which the founder approved on October 21, 2026 (below).
- **D16 (a) for a practice with no other packet approver:** not built in PR 5. The analyst-only and lone billing manager cases are left to the pull request that carries D27 (the owner named PR 10 "or wherever D27's work lands"; this document lists D27 under PR 9 and PR 14), since the reviewer's attestation already blocks every payer submission.
- **Appeal-level evidence for contract disputes (D17, D33):** `contract_version.appeal_levels` with a page, quote and hash and a contract specialist's check, like the dispute window, lands in PR 8 (the workbench schema), not PR 5. Until then contract disputes stop at level 1.
- **The best-option audit's items #4, #5, #26 and #61:** folded into PR 5 before it merges, each item's "PR 5 before merge" part only (see PR 5's contents above; ADR 0061, Owner rulings), with the standing rule of the same day: choose the best option for accuracy, quality, user experience, security, compliance and dispute success, never weighted by build effort. The parts the items give to PR 6c, PR 7, PR 8 and PR 11 land there. The extended migration changes the domain model's text, whose new SHA-256 the founder approved on October 21, 2026 (below; CO-02).

Ruled by the owner, Tyler Williams, on October 21, 2026, on PR 5 (recorded in ADR 0061, Owner rulings (2026-10-21)):

- **The domain model's text (CO-02):** approved as regenerated from a fresh PostgreSQL 18 database at `20261103090000`, SHA-256 `6f72ea56563c379e05a601f3af019ad4ce3358f55cc02b06fcec17ea23d830a0`. The founder writes its approval line with a commit of their own.
- **The reviewer's checklist (Q5 (a)):** the seven items' wording confirmed as written (`PACKET_CHECKLIST`).
- **The payer's CSV schedule:** every row leads with the packet's reference (`packet_reference`), the same reference (10 Crockford digits, ADR 0061 D5) the PDF prints and the file names carry.
- **An export made before the export guard whose pricing went stale since:** no remedy, since no environment has sent a real export.
