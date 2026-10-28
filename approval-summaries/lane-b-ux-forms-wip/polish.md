# polish progress

Started 2026-10-27. Tree clean at ab197e4.

## Items

Candidates (from fix1-result.json verdicts' remaining + fixer/refix proposals). Status: TODO / APPLIED (file:line) / SKIPPED (why).

1. S-SEC-1 (1) ADR "Not covered" + design ~1463: export form does not pin — TODO
2. S-SEC-1 (2) + U-UX-4 (1) ADR D1 + design 12.2 U-UX-4 row: refreshOnError forms do read the page again after duplicate — TODO
3. U-UX-1 (1) browser unit test: refused column form stays nowrap — TODO
4. U-UX-1 (2) static test: ActionForm column classNames never flip at a breakpoint — TODO
5. U-UX-4 (2) RefusalFallback hard-codes "Not done" — TODO (check)
6. U-UX-4 (3) runAction explicit duplicate check + generic fallback — TODO
7. U-UX-5 e2e assertion of /support card mail warning — TODO
8. U-UX-5 optional aria-describedby on mailto link — TODO (check)
9. U-UX-8 (1) reset measure via setTimeout/rAF — TODO
10. U-UX-8 (2) e2e no-line-at-1280 after hydration — TODO
11. U-UX-8 (3) shape only when showChosen; matchMedia not resize — TODO
12. U-UX-9 (1) billing/page.tsx:92 apostrophe — TODO
13. U-UX-9 (2) compliance.ts:141 bare punctuation (console.ts:615 not in PR) — TODO
14. U-UX-9 (5) straight apostrophes compliance/page.tsx:128,:156; organizations page :86,:127,:303 — TODO
15. U-A11Y-3 forced-colours pressed look + "Ink rule" comment — TODO
16. F1 proposal 4: VersionForm shows other hook's old refusal while working — TODO (verify in harness)
17. S-SEC-2 edge (a): touched before hydration (value vs default) — TODO (check)
18. S-SEC-3 note: one-time-code Field spellCheck/data-secret order — TODO (check)
19. U-UX-10 proposal: HardwareKeySignIn form no method -> GET ?email= — TODO (check)
20. U-UX-10 nits: design 4.4 bullet, 12.2 row "children", test label FRM-04 — TODO
21. F3: support.ts publicText names both fields at once — TODO (check)
22. F3: move split-form test from action-form.browser.test.tsx to split-form.browser.test.tsx — TODO (check)
23. F2: organizations upload note "an opaque key" — TODO (check)
24. S-SEC-3 design 5.3 data-secret wording loose — TODO
25. refix open item 9: console tables overflow at 390 — TODO (check scope)
Not in PR files (proposals): support-mail.ts:57 "opaque ID"; console.ts:615 punctuation; /status and /maintenance mail rule; support hint "from the page's address" (needs ruling); upload-form.tsx (#42); settings/users table (#42); hardware-key e2e step (server answers normally).

Decisions so far (after reading code):
- 16: real per code reading (shown flips to the other hook at press time; same seq key -> focus jumps to the summary). Plan: shared seq ref across the two hooks + shown = higher seq; label from the answered press. Test first in action-form.browser.test.tsx.
- 17 SKIP (not plainly correct: value-vs-default check risks false "Form cleared" on untouched row forms/controlled controls; reasoning-only note, remaining "none").
- 22 SKIP (moving duplicates harness helpers in a second file; no behavioural gain; keep proposal 8).
- 25 SKIP (table/badge overflow, not forms; the atPhoneWidth steps belong in onboarding.spec.ts, not a PR file; scroll regions need an axe-safe focusable pattern decided across pages).
- 16 VERIFIED REAL in harness (before fix): while the model press was held the summary showed the model's older refusal ('SYNTHETIC first refusal...') instead of the save's. log polish-logs/v16-before.log
- 16 APPLIED: form-issues.tsx useGuardedSubmit seq option (numbered at answer); version-form.tsx shared seq, shown = last numbered, label of the answered press; test action-form.browser.test.tsx 'while the version form’s other button works' (fails before: shows model's older refusal; passes after; 4/4 version tests)
- 6 APPLIED: next.ts runAction explicit duplicate check + plain fallback 'Reload the page and try again.'; next.test.ts new case
- 5 APPLIED: action-form.tsx noteRefusal/RefreshAfterRefusal keep the refusal's kind; takesOrphanedRefusal returns {lines, kind}; RefusalFallback titles by SUMMARY_TITLES[kind]. Tests: action-form.test.tsx (new duplicate case, shape), action-form.browser.test.tsx rerun test (+duplicate step; Takeover type).
- 3 APPLIED: action-form.browser.test.tsx FRM-04 test: refused 'keep' column form computes nowrap.
- 19 APPLIED: hardware-key.tsx HardwareKeySignIn form method="post" (+comment); browser test 'submitted natively ... never puts it in the address' (POST, search unchanged, email in body).
- 20 APPLIED (test part): hardware-key browser test label 'FRM-04, FRM-05:'. Design 4.4 bullet + 12.2 row wording: TODO with records.
- 15 APPLIED: styles.css @media (forced-colors: active) button[aria-pressed='true'] {Highlight/HighlightText}; button.tsx comment 'a rule in the text's colour'; browser test FRM-07 forced colours. ADR D8/design: TODO with records.
- 9 APPLIED: field.tsx afterReset -> setTimeout(measure, 0) (+comment); harness 'chosen' form (narrow column, reset button, RUNS) + .narrow in forms-harness.html; browser test FRM-08 'follows a change and a reset button'. TODO: prove it fails with queueMicrotask.
- 11 APPLIED: field.tsx shape only when showChosen; matchMedia('(width < 48rem)') change in place of window resize (doc comment updated).
- MUTATION PROOF: 5 new/extended browser tests fail under their mutation (queueMicrotask; no method=post; forced-colours selector off; old wrap selector; kind hard-coded 'error'); files restored (cmp same). log polish-logs/mutation.log
- 18 APPLIED: field.tsx Field: a one-time code writes data-secret, spellCheck false, autoCorrect off, autoCapitalize none after the caller's props; fields.test.tsx new case.
- 7 APPLIED: forms-keep-input.spec.ts support test asserts the card's mail rule and the link's accessible description. 8 APPLIED: support/page.tsx MAIL_RULE constant, span#support-mail-rule, mailto link aria-describedby.
- 10 APPLIED: packets.spec.ts FRM-08 step: after the 390 line shows (page live), 1280 -> count 0, back to 390 -> line again.
- 12 APPLIED: billing/page.tsx:92 organization’s. 14 APPLIED: compliance/page.tsx:128 Plan’s, :156 official’s; organizations/[organizationId]/page.tsx :86 group’s, :127 user’s, :303 firm’s/practice’s.
- 13 APPLIED: compliance.ts:141 format in words; compliance/page.tsx Document reference hint with the same words; onboarding-routes.db.test.ts asserts the issue whole. console.ts:615 not a PR file -> proposal.
- 21 APPLIED: support.ts publicText names every refused field at once (openIncident title+message; updateIncident message); onboarding-routes.db.test.ts asserts both issues.
- 23 APPLIED: organizations/[organizationId]/page.tsx upload note: 'PaidWhole records its SHA-256 and keeps the file under the organization’s and the agreement’s IDs, never a name; ...' (was 'The server hashes it and keeps it under an opaque key'). Checked agreementDocumentKey = agreements/<org>/<id>.pdf.
- 4 APPLIED: form-hints.test.ts new describe 'column forms that never wrap' (TS scan: no form/ActionForm/*Form className sets flex direction behind a variant); header doc updated. TODO: prove it bites.
- 4 PROVEN: mutation md:flex-row on support form -> 1 failed; restored (cmp); clean 9/9.
- ADR 0077 EDITED: D1 (duplicate wording; version form one count; RefusalFallback title; unknown outcome), D2 (code spelling marks), D3 (form-hints scan; hardware-key post), D8 (rule in the text's colour; forced colours), Consequences (support link; incident fields at once), Not covered (export form needs no pin).
- DESIGN EDITED (/home/user/ops/designs/lane-b-ux-forms.md; backup polish-mutation/design.before.md): 4.2, 4.4, 5.3, 9.1, 10.2, 10.3, 12.2 rows (U-UX-4, U-UX-8, U-UX-10, U-A11Y-3, S-A11Y-3), open list 3/4/8/9, new 12.3.
- CHECK typecheck: PASS 22/22 (polish-logs/typecheck.log)
- CHECK lint: PASS 1,624 files 0/0 (polish-logs/lint.log)
- CHECK lint:copy: PASS 517 files
- CHECK unit+browser (action-form.browser, action-form, next, fields, form-hints, screening/*, ui components, brand-colors scan): PASS 12 files 164 tests, none skipped (polish-logs/unit.log)
- CHECK db onboarding-routes.db.test.ts (PG18 5433): PASS 18/18
- CHECK db route-tests 2,10,11 -t console.status_incident|console.compliance_record: PASS 96 (1622 filtered)
- e2e runner: scratchpad/bin/e2e-polish.sh (tp_e2e_polish, port 4799). Cleanup after: drop DB, rm /tmp/tp-e2e-tp_e2e_polish-*.
- e2e-1 STARTED (background b9eanob52): forms-keep-input + packets, --workers=2, log polish-logs/e2e-1.log
- REGISTRY: FRM-04 + form-hints.test.ts; FRM-08 + action-form.browser.test.tsx, form-hints.test.ts (tests labelled so). TODO: pnpm synth --case FRM-04/FRM-08, check:fixtures, synth fixtures test (after e2e frees the lock).
- ADR reflow fixed (a short 'resets the' line). Waiting on e2e-1 (monitor bmxhfeao0).
- gitleaks 8.24.3 (repo config) on the 25 changed files: no leaks.
- CHECK e2e-1 (tp_e2e_polish, 4799; server built 21:27 from this tree): PASS 8/8 (forms-keep-input 6, packets 2) in 3.1 min
- CLEANUP: tp_e2e_polish dropped, /tmp/tp-e2e-tp_e2e_polish-* removed, port 4799 free, no tp_test_* left (tp_e2e_uxforms pre-existed, left alone).
- REGISTRY done: pnpm synth --case FRM-04/FRM-08 rewrote only their expected.json (assertedBy); check:fixtures PASS; synth unit 13 files 185 PASS; eslint registry.ts clean
- COMMITTED a57fbf5 'Forms: the fix verifiers' follow-ups' (28 files, not pushed). STATUS: COMPLETE
