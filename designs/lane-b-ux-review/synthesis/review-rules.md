# Adversarial review of the UX baseline review and its queue

Lane B, 2026-10-26. Reviewed: `designs/lane-b-ux-review.md` (5,469 lines) and `scratchpad/ux/synth/prs.json` (90 PRs). Code read at `4d99df8` with `git show 4d99df8:<path>` (the main checkout now sits at `7ef421b`, PR #54's merge, so a plain read would see #54's tree). GitHub read with `gh api` GET only. Synthetic data only.

Judged against: `.claude/rules/brand.md`, `docs/brand/BRAND.md`, ADR 0056, ADR 0058, CO-06 and CO-11 in `docs/product/change-order-001.md`, `docs/product/PRD.md:256-302`, WCAG 2.1 AA with audit #103's 2.2 rules, the freezes in `docs/product/reconciliation-001.md:440-470`, `LANES.md` rules 1 to 12, the Claims table and "Handed to Lane A", and `HANDOFF.md`'s counsel list.

**Result: 5 blocking, 13 should fix, 12 nits.** The blocking ones each put a PR in the queue that, built as written, breaks a lane rule, a change-order rule or an ADR, or decides a founder matter. Each has a fix below that keeps the rest of the document.

## What holds (checked, no finding)

- **No migration, engine, ledger or content-pipeline file** in any PR's file list: no path under `packages/db/migrations`, `packages/pricing`, `packages/ledger`, `content/`, `tools/verify-content`, and no domain-model file (script over `prs.json`).
- **Every listed #42 file sits in an after-#42 PR.** Each of the 143 paths in `pr42-files.txt` that a PR lists is in PRs 66 to 85 or 88. (B1 is a file a PR needs but does not list.)
- **Completeness.** All 208 canonical findings in `canon-a.json` and `canon-b.json` have a home. `prs.json`'s `cids` equal the document's "Closes" lines PR by PR. 43 findings are split across PRs or a PR and a fold, and every split names its part. The 13 migration parts match section 5. The five founder questions match section 6.2. The table in section 3 matches `prs.json` on branch, title, size and the #42 column for all 90 rows.
- **PR states are right.** #42, #48, #49, #50, #51, #52, #53 and #55 are open drafts. #46, #47 and #54 are merged.
- **The founder questions carry options and a recommendation.** F3's contrast figures recompute exactly: #7A8594 is 3.34:1 on `--pw-unpriced-bg` and 3.74:1 on White, and #5F6A79 is 4.9:1 and 5.49:1.
- **Proposals that follow the brand's written rules.** These were checked line by line:
  - UX-040 puts the investigatory anomaly in the unpriced tone (ADR 0056:80).
  - UX-104 makes tiles Slate 12 px over Plex Mono 500 (`BRAND.md:125`), and UX-114 sets figures at 400 and 500 only (`BRAND.md:94`).
  - UX-117 makes native controls Ink, never Brass (`brand.md:32-33`).
  - UX-208 sets unpriced chip text in Slate (ADR 0056:87-88).
  - Every fix that prints "recovered" carries posted or deposited: UX-015, UX-024, UX-031, UX-165 and UX-173 (`brand.md:37-38`, CO-11).
- **The PRD 9 ledger-freeze question.** The narrow reading the document asks the reviewer to confirm holds:
  - `packages/ledger` is untouched, and there is no DDL.
  - `roi_statement_rules()` checks only the recovered and interest sums, not actionable (migration `20261024120000_reconciliation_and_roi_documents.sql:35-80`).
  - The wider consequences are in S6.
- **CLAUDE.md's never-list holds in the fixes.** URLs and cookies carry opaque IDs only (UX-010, UX-045, UX-058, UX-102, UX-013). File names stay in the browser (UX-181). Titles carry no PHI (UX-144). Code computes every figure (UX-031, UX-124, UX-202). The drafter cannot approve (UX-069).

## Findings

### Blocking

**B1. PR 8 (`co-001/ux-second-factor-reset`) is marked "now" but needs two #42 files.**
- **The reset route.** The fix puts the reset "beside Unlock" (UX-006's Fix). Unlock is `unlockUser` at `apps/web/src/lib/routes/console.ts:579`, a #42 file. PR 8 lists `lib/routes/account.ts` instead, and gives no reason for moving a platform route out of the console module.
- **The Cognito call.** Resetting a Cognito TOTP factor needs an administrator call that the web app's role does not have. `infra/lib/constructs/application-role.ts:14` grants only `cognito-idp:AdminCreateUser`, `AdminGetUser` and `AdminUserGlobalSignOut`. `:10-12` says the passkey calls are made with the user's own tokens. That file and `infra/test/application-role.test.ts` are both #42 files.
- **The email.** "Emailing them" would go out through #42's mail streams.
- **The security trade-off is not named.** Widening the internet-facing web task's IAM so it can strip any user's second factor is a trade-off the security reviewer must weigh. Section 6.1 does not list it.
- **Fix: split PR 8.**
  - Now: `/account/security` (change password, replace the authenticator with the current code, add a second key), which uses the person's own tokens.
  - After #42: the console reset, in `lib/routes/console.ts`, with its IAM grant. Put the grant on the narrowest role that can hold it, and ask the security reviewer whether that is the web task or the operator role.
  - At design: confirm that Cognito offers an administrator path for a passkey at all. If it does not, a staff member's lost key is a re-invitation, and the help line must not promise a key reset.
  - Mark the console part "after #42 merges". PR 66 already waits on it.

**B2. PR 46 (`co-001/ux-payer-copy-cover`, UX-124) rewrites the payer's copy against CO-06, and its wording belongs to Lane A's PR 12.**
- **CO-06.** The fix adds "Amount in dispute: $90.00 on 3 lines ..." to the cover of a document the practice sends to its payer. CO-06 (`change-order-001.md`, Exports) requires the export's neutral language: "our review indicates a payment difference under the following terms".
- **Lane A's PR 12.** ADR 0058:53-54 gives the packet's neutral wording to PR 12. `reconciliation-001.md:201-209` lists in PR 12 "the packet heading and requested action rewritten". That is the "reprocess underpaid claims" line this finding quotes, in the same file (`apps/worker/src/packets/html.ts`).
- **The document never mentions PR 12.** UX-124's Notes discuss only #38.
- **Fix: hand the cover summary to Lane A's PR 12.** Add a line under section 5's "To tell Lane A". The figures to add are the amount, the lines and claims, the service-date span, the deadline relied on and the reply-to contact, all built by code from the stored version. PR 12 rewrites the cover once, in CO-06's neutral words. Drop PR 46 from Lane B's queue.
- **If Lane B keeps any part,** it is the figures alone, worded "payment difference". The split with PR 12 must be stated.
- **The baseline line is wrong too.** "Regenerate the cover baseline under ADR 0058" names a baseline that does not exist: ADR 0058's covers are the ROI statement's. PR 46 also edits the shared frame `apps/worker/src/report/brand.ts`, which can move those ROI cover baselines.

**B3. UX-136 (PR 64) moves a legal surface, which the document's own F4 reserves for the founder.**
- **The surface.** The closed-link page is the legal surface `screening-kept-closed-link` (`docs/product/legal-surfaces.md:20`, counsel with decisions 7 and 17). It is on `HANDOFF.md`'s counsel list (`HANDOFF.md:89-95`).
- **What the fix does.** It puts new paragraphs and links ahead of the kept paragraph, so the notice moves from first to third.
- **The inconsistency.** F4 says "even a reshaping is the founder's before counsel". UX-134's and UX-135's Notes say the kept notice's "text and placement" are F4's. UX-136's Notes call the move "not the founder's" because the span's words are kept. The document cannot hold both readings.
- **Fix:**
  - Add the closed-link page's order to F4 as a third option part: keep the notice first, or put the next steps first with the notice unchanged.
  - Until the founder answers, PR 64 changes only the non-legal sentences in place, without moving the span.

**B4. UX-014 (PR 35) renames a column that ADR 0056 records and the brand journey pins, and it collides with CO-06's second variance.**
- **ADR 0056 and the brand journey.** ADR 0056:55-58 names the line table's columns "Expected allowed, Observed allowed and Short (variance)". `apps/web/e2e/brand.spec.ts:362-374` pins that header list, with 'Short (variance)' at :371. PR 35 renames it 'Short'. Its tests list neither the brand journey nor an amendment to ADR 0056.
- **CO-06 and D31.** CO-06 ("allowed-amount variance is the headline; insurer-payment variance second") and D31 (`reconciliation-001.md:412-415`) add a second variance in Lane A's PR 13. One bare 'Short' would then name two different figures.
- **The proposed lint.** PR 35's lint rule refuses 'Variance' as a column word, so it would also fail CO-06's own label.
- **BRAND.md.** PR 35 adds a glossary to `docs/brand/BRAND.md`. ADR 0058:243-244 records that additions to BRAND.md are the brand owner's call.
- **Fix:**
  - Keep 'Short (variance)' on the line tables, as ADR 0056 records, or amend ADR 0056 in the same PR with the brand journey updated.
  - Fold the other four names into it: 'Underpaid (validated)' and 'Variance' become 'Short (variance)', with the stage where one applies.
  - Reserve a qualified name for D31's insurer-payment variance, and tell Lane A's PR 13.
  - Drop the 'Variance' lint rule.
  - Put the glossary in `apps/web/src/lib/copy/words.ts` and the reviewer checklist (#55), not in BRAND.md. Or ask the brand owner in 6.2.

**B5. PR 10 (UX-007) removes payer letters from contract abstraction by their kind, cutting a designed path and missing a definer function.**
- **What the fix does.** "Keep payer letters out of the contract-tagging and abstraction lists (those lists take contract and exhibit only)."
- **Why that cuts a designed path.** The data model admits a payer letter as a contract version's source, for example a payer's fee-schedule or policy letter:
  - `contract_version_documents_ok()` (migration `20261016160000_contracts_and_mapping.sql:291-297`);
  - `CONTRACT_KINDS` (`apps/web/src/lib/contracts/contract-queries.ts:16`);
  - `CONTRACT_DOCUMENT_KINDS` (`apps/web/src/lib/routes/contracts.ts:47`);
  - the payer-letter source in `models-routes.db.test.ts:183-193`.
- **What it misses.** The specialist's "documents awaiting abstraction" count is `console_contract_queue()`, a SECURITY DEFINER function (`packages/db/functions/console_contract_queue.sql`; migration `20261016200000_contract_questions_and_queue.sql:118-140`). It counts every clean payer letter that no version names. Changing that count is a migration.
- **Fix:**
  - Exclude only letters that a payer response links. The finding's Notes already say the response row links the letter. Do it in the web queries now.
  - Keep a payer's terms letter abstractable.
  - Hand the same exclusion in `console_contract_queue()` to Lane A, and record it in section 5.

### Should fix

**S1. Numbers collide, so a reader cannot tell which "PR 12" is meant.**
- **This document's PRs against Lane A's.** It numbers its proposals PR 1 to 90 and also uses reconciliation-001's Lane A numbers in the same sections:
  - "For PR 7 (#103 ...)" (line 1231);
  - "PR 13 (#125) keeps only the bulk case work, because PR 33 moves ..." (line 1235);
  - "the case state vocabulary (#89, PRs 8, 10 and 13)";
  - "#90 (PR 14)";
  - "PR 12's practice time zone".
  This document's PRs 7, 8, 10, 12, 13 and 14 are other things.
- **Audit numbers against GitHub numbers.** Bare audit numbers sit beside GitHub PR numbers:
  - "#46" (audit, the seal) beside merged PR #46;
  - "#48" (audit, the narrative) beside open PR #48 (ci-deps);
  - "#49" (audit, the access log, in PR 76's Depends) beside PR #49 (release content checks);
  - "#51" (audit, the legal-text tables, in PR 86's Depends) beside PR #51 (15b);
  - "#38", "#12" and "#32" beside this document's PRs 38, 12 and 32.
- **Fix:**
  - Write "audit #n" for every audit item and "Lane A's PR n (reconciliation-001)" for Lane A.
  - Name this review's proposals by branch, or as "UX PR n", in sections 4 and 5, in `prs.json`'s `dependsOn` and `leavesOut`, and in the Claims rows that will copy them.

**S2. "Depends on" omits overlaps with open Lane B PRs for 28 PRs, including the one in flight.** Checked against `work/pr49-files.txt` to `pr53-files.txt`:
- PR 1 (`ux-forms`, running now) shares the case, reconciliation and abstraction-ledger pages with #51, and the line page with #52. Only #50 is named.
- PRs 12, 13, 60, 63, 65, 68 and 86 change `apps/web/src/lib/http/next.ts` or `components/action-form.tsx`, which #50 changes.
- PRs 28 and 29 change `tools/brand-copy/scan.ts`, which #49 changes.
- PRs 9, 12 and 18 change `reports/roi/[statementId]/page.tsx`, inside audit #46's scope ("the ROI pages", `LANES.md:108`). Only PRs 25 and 56 name it.
- Others: 5, 10, 16 to 19, 27, 31, 35, 36, 38, 42, 49, 54, 55, 70, 76 and 81.
- **Fix:** generate the overlaps from the PR file lists (the script is a few lines) and print them in each PR's Depends line. Tell PR 1's session now.

**S3. Severity is not honest at the boundary: the harm classes repeat the blocking definition.**
- **The definition.** `reviewer-common.md:52` defines blocking as "a person cannot complete a task, loses data, or is misled about money or status, or an accessibility failure that blocks use".
- **The mismatch.** The document's four harm classes use those same words. Yet 87 should-fix findings and 15 polish findings carry one of them.
- **Re-grade to blocking.** Each meets the definition on its own evidence:
  - UX-024 (C-084): a partial answer reads 'Resolved'. $30.00 is never stated and leaves the working queue.
  - UX-020 (C-124): a case reopened by a recoupment reads 'Awaiting response' while the practice must act.
  - UX-035 (C-065): 'Log a payer response' defaults to 'Accepted', so a hurried save records an approval the payer never gave, and it feeds the ledger's matching.
  - UX-039 (C-086): shortfalls past case line 25 never appear, under a false 'No shortfall on this page'.
  PRs 34 and 36 then join the blocking group, or their parts move into an early PR.
- **Over-graded.** UX-083 is "should fix, an accessibility block" while its own Rule line says 2.4.1 is met through landmarks. UX-005 (blocking) hides columns a touch user can still scroll to: should fix fits better.
- **Fix:** rename the harm classes so they do not restate the blocking test, for example "money or status: partial", or re-grade. Say which.

**S4. Taste is presented as a rule in places, and rules as taste in others.**
- **A rule that does not exist.** "The brief's consistent-terms rule" is cited in 11 Rule lines (lines 1726, 1954, 2087, 2277, 3455, 4082, 4158, 4557, 4614, 4633 and 4766). The brief contains no such rule; "consistent" does not appear in it. UX-043 and UX-166 cite nothing else.
- **Ruled items listed as choices.** Section 6.1's "Brand choices where the rules are silent" (line 1243) lists items the rules do decide:
  - danger only on failures (ADR 0056:89-92);
  - success notices with no status colour (`brand.md:26-28`, status colours are for data only);
  - the settings tabs without Brass (`BRAND.md:120-121`);
  - the dark sign-in ground (`BRAND.md:84-86`).
  Line 1241 adds that "the co-founder may change any of them". He cannot change a ruled one without amending the rule.
- **A wrong citation.** UX-003 cites `PRD.md:258`, which is a heading, for "a figure and its count describe the same lines", which the PRD does not say. The rules that fit are `PRD.md:242` and `:331` (a case total equals the sum of its actionable lines) and `:520` (actionable is what the packets ask for). `PRD.md:258` is cited twice more.
- **Fix:**
  - Rewrite those Rule lines as "No written rule; recommended (the brief's goal: one product)".
  - Split 6.1 into "ruled, applied" and "silent, chosen".
  - Correct UX-003's citation.

**S5. PR 6 and PR 85: the stated limit, WCAG 2.2.1 and "the safer".**
- **The stated limit.** Today the enrolment, new-password and code steps live inside Cognito's 3-minute sign-in session (`infra/lib/constructs/identity.ts:14`). The pending cookie is 5 minutes, or 15 for key registration (`apps/web/src/lib/auth/pending.ts:8`). PR 6 lands first and "says the limit on each step". It must say and time 3 minutes until PR 85 raises Cognito's session, and both must read one constant.
- **WCAG 2.2.1.** UX-012's Rule line cites 2.2.1, but the fix does not meet it:
  - "Start again" re-types the password and a code, which is not the simple action 2.2.1's Extend asks for.
  - 15 minutes is five times the 3-minute default, and Adjust asks for ten.
  The finding should say what 2.2.1 leaves unmet under Cognito's 15-minute cap, as a known limit for #103's manual checks.
- **"The safer".** Section 6.1 files the 15 minutes under "Security and cost trade-offs (the safer)". It is the less strict setting, chosen for accessibility. State it as a trade-off for the security reviewer, with the reason in C-007's Notes.
- **PR 85 holds two unrelated things.** It bundles that infrastructure security change with a new QR dependency on the enrolment page. Split them, so each takes its own review.

**S6. PRs 9 and 56 change `apps/worker/src/reconcile/statements.ts`, where "Recovered ... is computed from entries here and nowhere else" (`:10-12`).**
- **PR 9: one stored figure, two meanings.** PR 9 changes what `actionable_open_cents` means for statements generated after it. Earlier statements keep the stored column's sum. The statement page must not present the two as one definition, for example by dating the change on the page.
- **PR 9: the shared module.** It must name where the shared `ACTIONABLE_NOW` module lives. The worker cannot import from `apps/web`, and #137's boundary guard extends a #42 file.
- **PR 9: Lane A's PR 11.** It should say how it relates to Lane A's PR 11, which refreshes the stored column (`apps/web/src/lib/triage/queries.ts:348-352`).
- **PR 9: reviews and tests.** It needs the payment-engine review, and a test that LED-11 passes unchanged.
- **PR 56: the stored hours.** `roi_statement.pursuit_hours` is `NOT NULL` (migration `20261023120000_recovery_ledger.sql:254`), and the table is frozen: "No migration alters ... `roi_statement`". So "decided in code from the source" cannot tell a stored 0.00 that meant "not tracked" from a real 0.00 once a time log exists.
- **Fix for PR 56:** write the code-side rule. Every statement generated before the time log's release reads "not tracked". Or name the stored marker as a ledger-freeze question for the founder.

**S7. PR 79 (UX-058): "A ticket carries the page it came from" needs storage the table does not have.**
- **The table.** `support_ticket.screen` admits only a key (`CHECK (screen ~ '^[a-z][a-z0-9_]{0,63}$')`, migration `20261030090000_customer_sign_in_and_readiness.sql:368`). The later migration adds only `source` and `mail_ref` (`20261101120000_support_mail.sql:18-21`).
- **The gap.** The desk cannot see the record the ticket is about unless the path is stored.
- **Fix:** a nullable, CHECK-constrained path column with opaque IDs only. That is DDL, so it goes to Lane A with the replies table. Or say plainly that the path is written into the message body, which the PHI screen reads (worse). The Notes' "need no migration" should change.

**S8. Shared pieces land after the PRs that use them, so some work is done twice.**
- **Stacked rows.** PR 3 builds stacked rows for the screening tables and wraps `components/screening/coverage.tsx` in `ScrollTable`. PR 5 also lists `coverage.tsx`. PR 32 builds stacked record lists. That is two stacking patterns.
- **The step warning.** PR 6's `step-timer.tsx` warning is a notice that PR 12's `Notice` then replaces.
- **The uploader.** `components/uploads/uploader.tsx` changes in PRs 10, 48, 49 and 50.
- **Dates.** PRs 9, 11, 34, 38 and 52 write their new words with ISO dates ('2026-Q4', 'since 2026-06-09') that PR 27 then rewrites to 'Q4 2026 (Oct–Dec)' and 'Oct 26, 2026'.
- **The home page.** It changes in 17 PRs.
- **Fix:**
  - Put one stacked-row primitive in PR 5 and use it in PRs 3 and 32.
  - Move PR 27's formatter, which is small, ahead of PR 9, or have PRs 2 to 11 print dates only through today's `utc()` and `utcDate()` (`apps/web/src/components/format.ts:2,10`), so PR 27 changes one place.
  - State the rule for the blocking group: use today's components, add no local component that PRs 12 to 31 replace.

**S9. PR 66's tests omit the header baselines.** It adds a 32 px second header row at 390 px and changes the switcher's text (UX-021, UX-094). UX-021's own fix says "regenerate ADR 0058's 390 px header baseline", and ADR 0058:225-228 requires new baselines in the same PR. **Fix:** add "regenerate and inspect `header-390` (and `header-1280` if the switcher's text moves) under ADR 0058" to PR 66's tests.

**S10. PRs 33 and 34 rebuild the case screen that Lane A's PR 13 rebuilds.**
- **The overlap.** Lane A's PR 13 (`reconciliation-001.md:211-220`, CO-06) restructures the case screen into six tabs with the stage totals. Section 5's "To tell Lane A" admits that audit #89's states later replace UX-020's and UX-024's wording, yet PR 34 still builds it as display wording. The same work is done twice.
- **Fix:**
  - Build UX-024's asked, accepted and not-accepted figures in one shared helper that PR 13's Overview tab reuses, and say so in PR 34.
  - Keep PR 34's wording to what PR 13 will keep.
  - Tell Lane A in section 5.

**S11. A new sentence in PR 29 (UX-101) promises an action the page does not offer.**
- **The sentence.** 'No billing firm can reach this practice. A firm reaches it only through a grant you approve here.'
- **Why it is untrue.** `apps/web/src/app/p/[practiceId]/settings/agreements/page.tsx:18` says approving a firm's grant is milestone 12's firm flow, which is not built.
- **Fix:** drop "here". Say "through a grant you approve", or name how a grant is asked for today.

**S12. UX-205 (PR 84) rewords the screening's left-out line, a matter on counsel's list.**
- **The counsel list.** `HANDOFF.md:92` lists "the 11-claim-line floor (the number, lines or patients, a left-out total under 11, ...)".
- **What the rewrite touches.** The line states both the floor and the left-out total. The Notes argue the rewrite changes only grammar.
- **Fix:** the safer handling costs one line. Add it to F5 as a second sentence for the founder, so the founder sees every screening sentence held for counsel in one question.

**S13. PR 30 adds an alias token, which ADR 0058 D9's precedent sends to the brand owner.**
- **What PR 30 adds.** `--pw-bg-sign-in` in `tokens.css` and `tailwind-theme.css`.
- **The precedent.** ADR 0058:59-67 (D9 item 6) sent the alias `--pw-danger-bg` to the brand owner, "who alone changes the palette".
- **The document's claim.** UX-160's Notes (line 4510) call it "Not a palette change".
- **Fix:** the sign-in ground matters only once dark is reachable. Move that part into PR 90 behind F1, and list it under F3 as an alias with no new colour. The rest of PR 30 (`color-scheme`, the print block, `accent-color`, the unpriced class) stays.

### Nits

**N1. A count is off by one.** Line 11 says "10 fold into work already in flight". There are 11: 8 findings marked "none; folded" plus UX-001, UX-074 and UX-081 in `ux-forms`.

**N2. "Merged" reads two ways.** "PR #52 merged" in the Depends column means "after #52 merges", while "PR #54 (merged; ...)" means it is done. Write "after PR #52 merges".

**N3. The dropped list misnames a check.** It calls rewording `docs/product/unpriced-reasons.md` a "content-pipeline change". It is the engine-arithmetic check ("`docs/product/unpriced-reasons.md` and the engine's unpriced reason list are unchanged", `reconciliation-001.md:448`). The decision is right; the reason is mislabelled.

**N4. ADR edits should be dated.** PRs 31, 32 and 90 edit ADR 0056, whose decider is the founder. Make each a dated "*Amended ...*" line, as ADR 0056:104 does, not an in-place rewrite.

**N5. F3's hue barely changes what a person sees.** #5F6A79 is 1.17:1 from Slate (#526070), so "unpriced chips may set their text in their own hue" changes almost nothing visible. Say so in F3, so the brand owner weighs the hue's job as the border.

**N6. F1 states user facts without evidence.** "Many already set their devices to dark, some for light sensitivity" cites nothing, and ADR 0056:129 records that no user has asked. Present it as a judgement.

**N7. Two wordings promise more than the product does.**
- UX-163 labels a 2 GiB limit "2 GB", so a 2.1 GB file is taken under a "2 GB" maximum. Say "2.1 GB" or enforce 2,000,000,000 bytes.
- UX-110's 'does not price secondary claims yet' implies a roadmap promise. Drop "yet".

**N8. PR 7 leaves two things unnamed.**
- It names no security event for a reset request.
- It names no rate bucket. Reuse `sign_in` or `public_form`. A new bucket edits `apps/web/src/lib/http/rate-limit.ts`, a #42 file.

**N9. The #46 fold creates a hidden dependency.** UX-183 places the seal in PR 20's header slot. That makes the queued #46 (`co-001/verified-seal`) depend on PR 20, which is not in flight. Say which lands first. Until then the seal moves without the slot.

**N10. The agreements' names should come from counsel.** UX-026 renames the two agreements ('Terms of use (yours)', 'Practice terms of service'). Names of legal instruments should match the documents' own titles. Take them from audit #51's legal-surfaces work, not from a label choice.

**N11. PR 90 is in the wrong place and is not really "now".**
- It puts Appearance on `account/notifications/page.tsx`. It belongs on an account preferences page, or on PR 8's `/account/security`.
- Its option (c) edits `packages/db/src/schema/tenancy.ts`, a #42 file. So "now (waits on founder)" is also "after #42".

**N12. PR 68 sets its cookie where Next.js cannot.** It sets the kept-practice cookie "when a `/p/<id>` page renders". In Next 16 a server component cannot set a cookie. It belongs in `apps/web/src/proxy.ts`, a server action or a route handler. Add the file to PR 68's list.
