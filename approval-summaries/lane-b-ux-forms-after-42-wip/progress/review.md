# Review progress: lane-b-ux-forms-after-42 design (adversarial)
- Started 2026-11-07. Design 590 lines. Worktree at 31a7345f.
- Status: design read fully; verified 2.1 against upload-form.tsx, form-issues.tsx, version-form.tsx, field.tsx.
## Findings so far
R1 (blocking) upload form has no method/action: a press before hydration or without JS GETs /screening?practiceName=..&contactEmail=..&zip=.. (email in URL). Design 2.1/9 claims "never posted without JavaScript". Fix: method="post" + SSR test + no-JS e2e.
R2 (should) 2.1 change 5 says "The button's aria-describedby becomes screening-template-hint" in the submit-button item; the describedby is on the Download button (:337), submit has none.
R3 (should) markByHand vs React-managed aria-describedby on the file input: design must set aria-invalid on server 'upload' issue too, else markByHand mutates a React-owned attribute.
R4 (should) inFlight never cleared if parse throws inside startPreparing; need try/finally.
## Next
console support page, users page, ZIP sites, messages, shell, e2e line refs, PR #126/#129 files, 4b branch.
R5 (blocking) server upload reasons (lib/screening/messages.ts reasonMessage :93,:95,:104,:115) carry their own colons; on the core they read "File to screen: Row 3, Units: it must be..." -- 2.7 table and guard scope miss them (guard scans only InputError literals + exported constants).
R6 (should) guard test scope misses zod message args (console.ts:116 'at most 500 characters' etc.) -- must scan zod string args/{message} too.
R7 (should) support.ts:249 'a ticket takes no patient information: remove ...' missing from 2.7; tests e2e/forms-keep-input.spec.ts:481, onboarding-routes.db.test.ts:538 not listed.
R8 (should) settings.ts:752 shownZipPlusFour 'four digits' missed by ZIP pass.
R9 (should) correspondence form half-converted: settings.ts:435 min 'a name or office', phone, extension, state keep old style; packets CORRESPONDENCE_FIELD_RULES only address_zip changed; guard does not scan packages/packets.
R10 (nit) 2.6 'requiredText(200)' is a zod schema; the screening/convert checks are hand-written; say "the same words, split the empty and too-long checks".
R5 corrected: the colon-bearing upload reasons are lib/screening/routes.ts:240-275 screeningReasonMessage (invalid_value, band_holds_date, band_in_future, band_outside_content, too_few_claim_lines x2); routes.db.test.ts:225.
R11 (should) 2.7 account.ts row cites :289; the message is :349 (issueAuditInvoice; billing.db.test.ts:665 regex survives). :290 has no colon.
R12 (should) convert-form route words (routes.ts:1272,1278, payers) show on the screening RESULT page (tour screening-result.error-name, tour.spec.ts:1800/1847) -- shot list omits it and section 8 claims no result-screen surface; coordinate with 4b.
R13 (should) stale on the public route = failed origin check; RefreshAfterRefusal + "It is up to date now: press again" is untrue (refresh cannot fix origin), loops.
R14 (should) CI-19 is "Header controls named by visible text" (2.5.3); skip link (2.4.1) is a different behaviour -> COUNTER REQUEST FRM-<1> or a11y row, not overloading CI-19.
R15 (should) upload-form.test "one field reads field" cannot fail first statically (summaryLead already singular); put in browser harness.
R16 (nit) ADR 0077 :265-267 sentence is about StackedRows; users page is a hand-written two-copy list/table, amend wording accordingly.
R17 (nit) #129 head is f4fef908 not 34927fd0; shell branch lines are :325/:332 not :326/:347.
R18 (nit) noFile as FieldError "Error: Choose the file to screen." breaks the design's own lower-case-clause rule.
R19 (nit) skip link only in AppShell; /screening, /request-audit, sign-in render own <main> with PublicHeader -- state out of scope.
Status: verified most claims; remaining: status file Left-for-others coverage, then StructuredOutput.
R20 (should) aria-disabled while `reading` contradicts the design's own case "press while reading sends once read": the button is announced unavailable yet works. aria-disabled for pending only.
R21 (should) awaiting pendingRead after a new file is chosen mid-prepare could send the previous file's rows; re-check chosen.current === file after the await.
R22 (nit) form-hints.test.ts :20-23 is ALLOWED (pattern hints), not SMALL_ALLOWED; section 4 does not place the status file's SETTINGS_LABELS proposal (console practices page is changed by this PR).
Status: DONE -- findings returned via StructuredOutput.
