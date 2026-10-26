# Fact check: the UX baseline review against the code at 4d99df8

Checked: `designs/lane-b-ux-review.md` (5,469 lines, 208 findings, 90 proposed PRs) and `synth/prs.json`. Every file:line below reads as it does at 4d99df8, read with `git show 4d99df8:<path>`. The main checkout moved to 7ef421b (PR #54 merged on top of 4d99df8) during the synthesis run. I changed nothing in it. Open pull requests were read with `gh api` GET only: #48 to #53 and #55, all drafts. #50's head moved to `ed85bcf3` at about 09:28 UTC, and its files were read again at that head.

**Result:** 1 blocking, 11 should fix, 14 nits. Most of what the document rests on holds:
- **The blocking findings:** all 12 causes hold at the cited lines, with three small line slips (N3, N5).
- **Migrations:** all 13 "needs a migration" claims hold. One "no migration" claim does not (S9).
- **#42 overlap:** every finding's "#42" claim matches its own Files list. No "now" PR lists a file from `pr42-files.txt`, and every "after #42" PR lists at least one. The freeze scan of all 90 PR file lists found no file under `packages/pricing`, `packages/ledger`, the content pipeline, the migrations or `packages/db/functions`.
- **Should-fix citations:** 36 findings checked across all themes (money and status, flows, words, accessibility, 390 px, brand). All hold, apart from S1, S2 and S3.
- **The earlier tour's five defects:** all five hold as section 8 reports them (N10 is wording only).

What does not hold is mostly in the PR plans. One PR is marked "now" but needs a #42 file and a Cognito permission it does not have. Several PRs miss files they need. The axe-coverage claims are wrong in three places. The "Depends on" column misses about 45 overlaps with open PRs.

## Blocking

### B1. PR 8 (`co-001/ux-second-factor-reset`) is marked "now", but its reset needs a #42 file, a Cognito permission the app does not have, and auth code it does not list

- **Evidence:**
  - **The authenticator reset is Cognito's.** The authenticator lives in Cognito: enrolment is `AssociateSoftwareTokenCommand` and `VerifySoftwareTokenCommand` (`apps/web/src/lib/auth/cognito-provider.ts:221,239`), and the pool has `mfa: cognito.Mfa.REQUIRED` (`infra/lib/constructs/identity.ts:71`). So a platform administrator can reset a person's authenticator only through a Cognito admin call such as `AdminSetUserMFAPreference`.
  - **The web role cannot make that call.** It may make three Cognito admin calls only: `USER_POOL_ADMIN_ACTIONS = ['cognito-idp:AdminCreateUser', 'cognito-idp:AdminGetUser', 'cognito-idp:AdminUserGlobalSignOut']` (`infra/lib/constructs/application-role.ts:14`, pinned by `infra/test/application-role.test.ts:20`). Both files are in `pr42-files.txt` (lines 94 and 107).
  - **No database table holds hardware keys.** They are Cognito passkeys, listed and registered with the user's own access token (`ListWebAuthnCredentialsCommand`, `StartWebAuthnRegistrationCommand`, `CompleteWebAuthnRegistrationCommand`, `cognito-provider.ts:284-299`; the pool's `signInPolicy` and `passkeyRelyingPartyId`, `identity.ts:73-75`). So UX-006's hedge, "if the hardware-key credential table refuses the platform administrator's delete, that part goes to Lane A", names a table that does not exist. Cognito offers an administrator no call to delete a user's passkey.
  - **The new account page needs the user's Cognito token.** Part (4), `/account/security` (change password, replace the authenticator, add a second key), needs the user's own Cognito access token for each call. Sign-in gives that token back once the app's session opens (`apps/web/src/lib/auth/sign-in.ts:139-153` calls `provider.release`, which revokes the refresh token, `cognito-provider.ts:309-313`). So the page needs a re-authentication step.
  - **The file list misses the auth code.** PR 8 lists four web files only: the console organization page, the new `account/security` page, `lib/routes/account.ts` and the devices page. It has none of `apps/web/src/lib/auth/provider.ts`, `cognito-provider.ts`, `dev-provider.ts` or `sign-in.ts`.
  - **The finding and the queue miss the #42 file.** UX-006's "#42" line names only `shell.tsx`. PR 8 is in the "now" group, against the rule that a fix changing a #42 file stays queued "after #42 merges".
- **Fix:** split PR 8.
  - **(a) Now:** `/account/security`, with a re-authentication step. The person gives their password and code again, through the provider, for a fresh token; then change password, replace the authenticator and add a second key run on that token. Add the four `lib/auth` files to the list.
  - **(b) After #42 merges:** the console's "Reset two-step verification". Add `cognito-idp:AdminSetUserMFAPreference` to `USER_POOL_ADMIN_ACTIONS` and its test, take the security reviewer, and set `user.mfa_enrolled` false (already allowed: `GRANT UPDATE (... mfa_enrolled ...)` at `packages/db/migrations/20261015140000_tenancy.sql:599`, under the `user_self_and_platform_admin_update` policy at :509).
  - **(c) A lost hardware key:** state that no administrator path exists in Cognito. Make a second registered key (part 4) the recovery for staff, and give the security reviewer the open question.
  - **The finding:** correct UX-006's "#42" line, and drop the credential-table sentence from UX-006 and PR 7.

## Should fix

### S1. UX-085 and section 9: axe already runs after a refusal, and axe runs in 12 specs, not 13

- **Evidence:**
  - **Refused states are covered.** UX-085 and section 9 say `expectAccessible` never runs "after a refusal". It does: on the pricing settings page after a refused ZIP, an ActionForm refusal with the field marked and focused (`apps/web/e2e/onboarding.spec.ts:536-542`), and on the screening page with its ZIP refused (`apps/web/e2e/screening.spec.ts:715-727`). It also runs after a refused export (`packets.spec.ts:251`).
  - **12 specs call it.** `expectAccessible` is called in 12 spec files (66 calls). The 13th spec that imports `a11y.ts`, `contracts.spec.ts`, uses only `atPhoneWidth` with `{ axe: false }` (`contracts.spec.ts:167`).
  - **The rule tags.** These read right, from the installed axe-core 4.13.0:
    - `label-content-name-mismatch` and `td-has-header` are tagged `experimental`, so they stay off unless enabled by rule id, as the fix says;
    - `empty-table-header`, `heading-order`, `region`, `landmark-unique` and `page-has-heading-one` are `best-practice`;
    - `target-size` is `wcag22aa`.
  - **`a11y.ts`'s own comment.** It says the gate checks "landmarks, headings" (`apps/web/e2e/a11y.ts:5-7`). The landmark and heading rules are `best-practice`, so the tags at `:12` never run them. That is worth stating in UX-085 too.
- **Fix:**
  - **The gap, reworded:** "after a refusal on all but two forms (`onboarding.spec.ts:542`, `screening.spec.ts:727`)" and "12 specs".
  - **The comment:** add that the `a11y.ts:5-7` comment overstates what runs.
  - **The hand-over:** carry the same correction into section 5's #103 hand-over list, so Lane A's PR 7 does not count the two covered states as gaps.

### S2. UX-011: the 390 px guard runs in five specs, three of them on UX-011's own routes

- **Evidence:**
  - **The claim.** UX-011 says `atPhoneWidth` "runs in only four specs, none on these routes".
  - **Five specs call it:** `contracts.spec.ts:167`, `onboarding.spec.ts:502,524`, `packets.spec.ts:115,210,341,414`, `screening.spec.ts:402` and `unattested.spec.ts:94`.
  - **Three are on UX-011's routes:**
    - the packet builder, `/p/[practiceId]/cases/[caseId]/packet` (`packets.spec.ts:115`);
    - pricing settings, `/p/[practiceId]/settings/pricing` (`onboarding.spec.ts:524`), whose bare wrapper UX-011 cites at `settings/pricing/page.tsx:137`;
    - the contract version, `/p/[practiceId]/contracts/versions/[versionId]` (`contracts.spec.ts:167`, axe off).
  - **A second helper.** `screening.spec.ts:728` has its own `noSidewaysScroll`.
  - **The table count.** "92 tables" reads 89 `<table` elements at 4d99df8 (nit).
- **Fix:** reword UX-011: "runs in five specs. Three visit UX-011's routes, but only in states where the wide tables at `cases/[caseId]/packet/page.tsx:546` and `settings/pricing/page.tsx:137` are absent or fit." The PR 5 guard (every page route from the registry) stands.

### S3. UX-004: the console card's "with the reason" is already true

- **Evidence:**
  - **The claim.** UX-004 says the console card "promises runs are refused 'with the reason'" (`apps/web/src/app/console/organizations/[organizationId]/page.tsx:60`), and the fix says that promise "becomes true".
  - **Runs already carry a reason.** `organization_run_refusal()` returns one for a suspended organization: "the organization is suspended: its data stays readable, and new runs start again once a platform administrator reinstates it" (`packages/db/functions/organization_run_refusal.sql:14-18`). `runAction` shows it as "Not started: <reason>" (`apps/web/src/lib/http/next.ts:170-171`).
  - **What is really missing** is why PaidWhole suspended the organization. No column holds that, and #42's migration adds none.
  - **The rest holds:** the badge reads `billing.standing` alone (`settings/billing/[organizationId]/page.tsx:19,43`), and the alert's words come from `suspensionNotice` (`apps/web/src/lib/routes/billing.ts:156-158`). One slip: the console's UPDATE is at `console.ts:107`, not :106.
- **Fix:** drop the "promise is false" argument from UX-004, PR 2 and section 5. Base the Lane A hand-over (the stored reason, note and time) on what the customer needs to act: the reason and its next step. The migration claim itself stands.

### S4. PR 4 (`co-001/ux-download-refusals`) misses the route type, and its planned test sits in a #42 file

- **Evidence:**
  - **The route type.** The fix registers a `formPage` "on the route". The `Route` interface is `apps/web/src/lib/http/route.ts:375`, and the route specs are built in `apps/web/src/lib/http/invoke.ts` (`practiceRoute` at :462). Neither is in PR 4's files.
  - **The test.** `downloadHandler`'s unit tests are in `apps/web/src/lib/http/http.test.ts:305-342`, which is in `pr42-files.txt` (line 20). The planned unit test ("downloadHandler answers a navigation refusal with 303") would naturally go there.
- **Fix:** add `lib/http/route.ts` and `lib/http/invoke.ts` to PR 4. Name a new test file, for example `apps/web/src/lib/http/download-refusal.test.ts`, so PR 4 stays clear of #42.

### S5. PR 7 (`co-001/ux-sign-in-recovery`) lists the local store but not the auth provider it extends

- **Evidence:**
  - **The provider files.** A password reset is a new provider call: Cognito's `ForgotPassword` and `ConfirmForgotPassword`. Those are public client calls, so no IAM change and no #42 file are needed, which is right. But the call goes through the `AuthProvider` interface and its two implementations (`apps/web/src/lib/auth/provider.ts`, `cognito-provider.ts`, `dev-provider.ts`) and the sign-in service (`apps/web/src/lib/auth/sign-in.ts`). PR 7 lists only `lib/auth/dev-store.ts`.
  - **The rate limit.** "Is rate limited" has to reuse an existing bucket. `RateBucket` and `RATE_LIMITS` are in `apps/web/src/lib/http/rate-limit.ts:18-56`, a #42 file (`pr42-files.txt` line 21).
- **Fix:** add the four `lib/auth` files to PR 7. State that the reset reuses the `sign_in` bucket (`rate-limit.ts:39`) until #42 merges.

### S6. PR 6 cannot say "15 minutes" while Cognito still allows 3; the 15-minute cookie belongs in PR 85

- **Evidence:**
  - **Cognito's limit.** Cognito's sign-in session is 3 minutes (`infra/lib/constructs/identity.ts:14,108`, a #42 file), and it moves to 15 only in PR 85, after #42.
  - **The app's limit.** The app's pending cookie is 5 minutes, or 15 for key registration (`apps/web/src/lib/auth/pending.ts:15-17`).
  - **The conflict.** PR 6 lands first ("no Cognito change") and lists `pending.ts`. UX-012's fix tells it to state "This step stays open for 15 minutes" and to set the cookie "to match". Before PR 85, that sentence is false in production, and the warning would fire after the challenge has already died.
  - **PR 85's list.** It misses `apps/web/src/lib/auth/pending.ts` and `infra/test/identity.test.ts`, a #42 file and the test that pins `authSession`.
- **Fix:**
  - **PR 6:** states the limit that binds today (3 minutes in production, from Cognito; 5 minutes app-side), times its warning from the shorter one, and leaves the cookie lengths alone.
  - **PR 85:** moves both limits to 15 together, and lists `pending.ts` and `infra/test/identity.test.ts`.

### S7. Eleven files that do not exist at 4d99df8 are listed without "(new)"

- **Evidence:** checked with `git ls-tree 4d99df8`.
  - **New files with no marker:**
    - `apps/web/src/components/brand/stat-tile.tsx` (PR 16);
    - `apps/web/src/lib/copy/labels.ts` (PR 17);
    - `apps/web/src/components/page-header.tsx` (PR 20);
    - `apps/web/src/lib/copy/actor.ts` (PR 43);
    - `apps/web/src/components/figures.tsx` (PR 52);
    - `apps/web/src/components/public-layout.tsx` (PR 62);
    - `apps/web/src/app/console/page.tsx` (PR 72);
    - `apps/web/src/components/settings/getting-started.tsx` (PR 81).
  - **Files that only an open PR adds:**
    - `apps/web/src/components/action-form.test.tsx` (PR 1; added by PR #50);
    - `packages/packets/src/explain.ts` (PR 41; added by PR #52);
    - `apps/web/src/components/monitoring/display.test.tsx` (PR 80; added by #42).
  - The same paths appear unmarked in each finding's own Files line, in section 7.
- **Fix:** mark each one "(new)" or "(from PR #50 / #52 / #42)", in `prs.json` and in sections 3 and 7.

### S8. "Depends on" misses about 45 overlaps with open pull requests, in 35 proposed PRs

- **Evidence:** each listed file is changed by the open PR named, at its current head, and the proposed PR does not name that PR. A selection:
  - **PR 1** (in flight) overlaps #51 on `cases/[caseId]/page.tsx`, `reconciliation/page.tsx` and `abstraction/ledger/page.tsx`, and #52 on `lines/[lineId]/page.tsx`. It also names #50 only for `action-form.tsx`, though #50 changes `lib/http/next.ts` too.
  - **PR 12** overlaps #50 (`components/action-form.tsx`), #51 (the case page) and #52 (`components/packets/display.tsx`).
  - **PR 13** overlaps #50 (`lib/http/next.ts`) and #52 (the packet page).
  - **PR 19** says "nothing" but overlaps #51 (`app/p/[practiceId]/page.tsx`).
  - **PR 17** overlaps #49 (`apps/worker/src/report/html.ts`) and #52 (`lib/copy/words.ts`).
  - **PRs 28 and 29** overlap #49 (`tools/brand-copy/scan.ts`). **PRs 29 and 59** overlap #48 (`packages/compliance/src/controls.ts`). **PR 85** overlaps #48 (`pnpm-lock.yaml`).
  - **PRs 14, 31, 42 and 55** overlap #50's newest file, `pricing-runs/page.tsx`, added at head `ed85bcf3`.
  - **PRs 60, 63, 65, 68 and 86** overlap #50 (`lib/http/next.ts`).
  - The full list is in `synth/factcheck/open_overlap.txt`.
- **Fix:** regenerate the "Depends on" cells from the open PRs' file lists, at their current heads, and name each overlapping PR. LANES.md rule 6 already says the PR merged second keeps both, so a missing name is a planning gap, not a rule break.

### S9. PR 79's "a ticket carries the page it came from" needs a stored value the ticket cannot hold

- **Evidence:**
  - **The ticket's column.** `support_ticket.screen` is `CHECK (screen ~ '^[a-z][a-z0-9_]{0,63}$')`, a section key only (`packages/db/migrations/20261030090000_customer_sign_in_and_readiness.sql:368`). It cannot hold a path with opaque IDs.
  - **The plan.** UX-058's fix (1) carries the page path into the form, and PR 79's title promises the ticket carries it. If the desk is to see it, it has to be stored. Yet PR 79 is marked "no migration", and section 5 hands Lane A only the replies table.
- **Fix:** add the page path to UX-058's Lane A part: a checked `page_path` column that keeps opaque IDs only, checked against the route registry. Keep PR 79's Lane B part to showing the path on the customer's form and the ticket's age. Writing the path into the free-text message is not the best option, because nothing would check it.

### S10. PR 18 closes UX-128's copy button without the page that shows the key

- **Evidence:** PR 18 "closes UX-128 (C-042) (the copy button only)". The 32-character key is on `apps/web/src/app/sign-in/enroll/page.tsx`, which is not in PR 18's files. Only PR 85, after #42, lists it.
- **Fix:** add `apps/web/src/app/sign-in/enroll/page.tsx` to PR 18. The enrolment page is not a #42 file. Or move the copy button to PR 85 and say so in UX-128.

### S11. PR 9's "one shared SQL module both apps import" names no file

- **Evidence:**
  - **Where the predicates live.** `ACTIONABLE_NOW` and `ACTIONABLE_NOW_LINES` are in `apps/web/src/lib/triage/queries.ts:354-363`. The ROI statement's query is in `apps/worker/src/reconcile/statements.ts:72-75`.
  - **Why the module's place matters.** The dependency runs one way: `@tp/web` depends on `@tp/worker` (`apps/web/package.json:37`), and the worker has no dependency on `@tp/web` (`apps/worker/package.json:35-51`). So the worker cannot take the predicate from `apps/web`.
  - **Where it can go.** The module must sit either in a package both apps already import (`@tp/triage`: `apps/web/package.json:35`, `apps/worker/package.json:51`) or behind a `@tp/worker` export. The second needs `apps/worker/package.json`'s exports and falls under #42's new `apps/worker/src/web-entries.test.ts`. PR 9 lists neither.
- **Fix:** name the module in `@tp/triage`, which is outside every freeze, for example `packages/triage/src/actionable-sql.ts`, and add it to PR 9's files. Keep the adversarial reviewer's check that `packages/ledger` is untouched.

## Nits

- **N1.** UX-001: `<ActionForm` is used 112 times in 60 files at 4d99df8, not 61.
- **N2.** UX-001 says the comment at `action-form.tsx:9-11` "assumes a refusal keeps the form". The comment says success redirects; it says nothing of a refusal. (PR #50's new comment does claim "the form keeps its state", which PR 1 should correct when the two meet.)
- **N3.** UX-004: the console's update is at `apps/web/src/lib/routes/console.ts:107`, not :106.
- **N4.** UX-008's Lane A part: #42's migration sets `notification_kind_check` again (`20261107090000_mail_streams.sql:797-800`, adding `support_notice_undelivered`). The new kinds build on that, not on 20261027090000:418.
- **N5.** UX-020: the body in force is `packages/db/functions/case_rules.sql:59-60`. The cited `20261023120000_recovery_ledger.sql:662-663` is an earlier copy. Cite the function file (ADR 0068).
- **N6.** UX-011: "92 tables" reads 89 `<table` elements in `apps/web/src` (S2).
- **N7.** Section 1 says "10 fold into work already in flight". Section 4 and the findings' "In flight" lines name 11: UX-001, UX-002, UX-016, UX-037, UX-045, UX-059, UX-074, UX-081, UX-085, UX-091 and UX-183.
- **N8.** "Depends on" cells such as "PR #52 merged" and "PRs #50 and #52 merged" read as facts, beside "PR #54 (merged; ...)", which is one. Write "after PR #52 merges".
- **N9.** "What passed" says the sign-in email field carries `autocomplete="username webauthn"`. That is the hardware-key form's email (`apps/web/src/components/hardware-key.tsx:79`). The password sign-in's field is `autoComplete="username"` (`apps/web/src/app/sign-in/page.tsx:27`).
- **N10.** Section 8, item 4: the tour wrote "To check" and "none blocks" (`lanes/lane-b.md:442-447`). Say that this review re-ranked it to blocking (UX-003) on the two definitions it found.
- **N11.** UX-102 says "When a `/p/<id>` page renders, set an HttpOnly cookie". A Next server component cannot set a cookie during render, and there is no middleware at 4d99df8. Name where it is set: the practice routes' handler path in `lib/http/next.ts`, or a new middleware.
- **N12.** PR 85's files lack `infra/test/identity.test.ts`, a #42 file, which its own test line names (S6).
- **N13.** UX-118 and UX-179's Lane A parts change `packages/db/src/schema/tenancy.ts`, a #42 file (`pr42-files.txt` line 132). Say "after #42 merges" in the hand-over.
- **N14.** PR 3's new `apps/web/e2e/screening-phone.spec.ts` uses `apps/web/e2e/screening.ts`, which #42 changes (`pr42-files.txt` line 7). Say that the PR merged second updates the new spec if #42 changes a helper it calls.

## Checked and found right (no change)

- **Blocking causes, line by line:**
  - UX-001: `action-form.tsx:32,65`; `next.ts:124-129,161-173`; `reports/roi/page.tsx:53-54`; `settings/pricing/page.tsx:107`; `console/practices/[practiceId]/page.tsx:82`; `components/billing/payment-method-card.tsx:101`; `components/screening/upload-form.tsx:117-142,159`.
  - UX-002: `settings.ts:271-275,292,295,299,314`; `settings/defaults/page.tsx:40,48-49,62,70`; `cases/page.tsx:177,181`; `console/models/page.tsx:81`; `console-models.ts:158`.
  - UX-003: `triage/queries.ts:354-363`; `dashboard/queries.ts:93-97`; `statements.ts:73`; `p/[practiceId]/page.tsx:199-205`.
  - UX-005: `anomalies.tsx:286,359`; `screening/coverage.tsx:61`.
  - UX-006: `sign-in/page.tsx:26-48`; `sign-in/mfa/page.tsx:20-25`; `notice.tsx:17`; `users/page.tsx:69`; console organization page `:155`; `shell.tsx:281-294`; `identity.ts:84`.
  - UX-007: `submissions/page.tsx:290,293-297`; `uploads/page.tsx:40-48`; `contracts.ts:47,123`; `packets.spec.ts:421-423`; `contract-queries.ts:16`.
  - UX-008: `workbench.ts:111-130`; migration 20261027090000:418; `p/[practiceId]/page.tsx:120-130`.
  - UX-009: `next.ts:65-66`; `terms/page.tsx:34-41,53,61,64`; `console-onboarding.ts:312-327,331`.
  - UX-010: `coverage/page.tsx:347,379-380`; `letter/route.ts:7`; `handler.ts:255,272-273`; `coverage.ts:189`.
  - UX-011: all 27 cited wrappers; `scroll-table.tsx`, used by four files.
  - UX-012: `pending.ts:15-17`; `sign-in.ts:94,116`; `identity.ts:8,14,108`.
- **The 13 migration parts** each match the schema:
  - UX-004: no reason column;
  - UX-008: the kind CHECK;
  - UX-009: `terms_version` holds a reference and a hash only;
  - UX-027: the closed `practice_setting_keys()`;
  - UX-047: `feature_flag`'s key and value CHECKs, and no expected end on `status_incident`;
  - UX-055 and UX-058: `support_ticket` has no request or reply;
  - UX-071: `practice_access_log`'s five parameters;
  - UX-072: `end_support_grant`'s actor check;
  - UX-118 and UX-179: `user_settings_valid` takes `notifications` only;
  - UX-131: `screening_lead` has only the owner policy;
  - UX-143: `user_device` has `label` only.
- **"No migration" claims checked and right:**
  - UX-070: `anomaly.validation_requested_by` is stored (`lib/routes/triage.ts:166`);
  - UX-017: `support_grant_tenant` lets the practice read grants;
  - UX-019: `row_number()` in the query;
  - UX-007: kind `payer_letter` exists;
  - UX-013 and UX-102: cookies only;
  - PR 74's Locked badge: `user.locked_at` is under the administrators' select policy.
- **The 36 should-fix findings whose root-cause lines were opened:** UX-013, 014, 015, 016, 018, 019, 020, 021, 025, 027, 029, 030, 031, 032, 035, 038, 039, 044, 052, 064, 074, 076, 080, 082, 084, 085, 086, 089, 090, 093, 095, 099, 104, 117, 127 and 132.
  - The computed contrasts match: Brass on the raised rail 2.42:1, placeholder 3.3:1, `.pw-status-unpriced` 3.34:1.
- **The earlier tour (`lanes/lane-b.md:434-449`):**
  - `reports/roi/[statementId]/page.tsx:74`: still one unbroken span;
  - the home's agreements table: still a bare wrapper (`p/[practiceId]/page.tsx:438`);
  - the screening template already sits in `ScrollTable` (`screening/page.tsx:94`), as section 8 updates it;
  - `monitoring/display.tsx:55`: still "on {n} lines";
  - `counted()` is imported only by `reports/roi.tsx` and `screening/result-summary.tsx`.
- **The open PRs' claimed overlaps:**
  - #49 changes `coverage/page.tsx` and `lib/routes/coverage.ts`;
  - #50 adds `refreshOnError` to `action-form.tsx`;
  - #51 changes five pages (home, case, submissions, ledger, reconciliation) plus the reports and reconciliation displays;
  - #51 does not touch `statements.ts`;
  - #54 left `lib/routes/settings.ts` alone.
