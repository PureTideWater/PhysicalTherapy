# review-ux progress (PR #74, 4f0b526, UX and brand reviewer 1 of 2)
Started 2026-10-27. Fresh start (no earlier file).
## Steps
- [ ] clone rev-ux at 4f0b526
- [ ] read agent spec, brand, design 10.2, baseline findings
## Shot pairs reviewed
## Findings
- [x] clone rev-ux at 4f0b526 (scratchpad/rev-ux)
- [x] read agent spec, brand.md, tokens, design 1, 10-12.1, baseline's 31 findings
- [x] read code: form-issues.tsx, action-form.tsx, field.tsx, password-field.tsx, ui styles/input/button/loading
- tools: scratchpad/revux-tools/locate.py -> revux-work/locate.json (danger-colour rows per shot); compose.py next
## Code notes (to verify on shots)
- Show toggle: text stays "Show" when pressed (aria-pressed only); visible pressed state? check button styling
- LoadingState visible label sits inside aria-hidden row (by design)
- PendingStatus role=status always present beside each ActionForm button
## Shot pairs reviewed (B=before, A=after)
- sign-in.error-wrong-password.390/.1280/-dark: A email kept, pw emptied + note, Show, summary first. OK. dark: h1 "Sign in" white on Paper in B and A (pre-existing, advisory)
- sign-in.error-locked.390: A note "Emptied for your security: type it again." under Password while locked -> FINDING (next step wrong when locked)
- sign-in.default.390: Show button, no visible pressed style (code: button.tsx has no aria-pressed style) -> polish
- sign-in-mfa.error.390, sign-in-enroll.error.390: fixed (field marked, Error:, lead, item name, hint). enroll: no QR/copy (baseline a11y-other-06 open)
- sign-in-new-password.default/mismatch/policy.390: fixed; policy moved from 16px card text to 12px hint (text-xs) -> FINDING type scale; double colons in items -> polish
- sign-in-hardware-key.loading/error-no-credential.390, register-key.error.390: fixed (status line, "Not registered"); Problem still between field and button (polish)
- request-audit.error.390/.1280: fixed, values kept; triple colon item (polish)
- support.error.390: fixed; apostrophes mixed (record’s in error vs record's in hint), "opaque ID" vs "ID" (polish); 12px no-PHI hints (type-scale finding)
- support.error-unconfirmed.390 / error-stale.390: fixed as designed. CODE: after "Not confirmed" the invited 2nd press on a saved form -> outcome duplicate -> summary title "Not done" + "This form was already submitted..." (next.ts:206) -> FINDING should-fix (title false)
- console.status.error.390: fixed (group marked, message, Title kept). A width 391 (1px sideways)
- console.status.error-row.390: improved (B 476 wide -> A 391), summary on own line, "Set" below select
- p.submissions.error.390: A page 613 px wide (B 390). CAUSE CONFIRMED in Chromium repro (scratchpad/revux-repro): styles.css `form:has(> [data-slot=refusal-summary]){flex-wrap:wrap}` on a flex-col form -> multi-line column flex, line = widest child's max-content -> overflow. FINDING (should-fix/blocking?) UX-1
- 390 widths B->A: settings.users.error 667->686; p.submissions.error 390->613; p.coverage.checklist-review(-sent) 390->408; console.status.error 390->391; error-row 476->391
- p.coverage.checklist-review(-sent).390: A 408 wide: raw selects in letter form (coverage/page.tsx:420-447, grid, no max-w) widened by the 16px rule -> FINDING UX-2 (16px rule widens raw selects w/o max-width; also console.status 391)
- settings.users.error.390: fixed (email kept, named, marked); table overflow pre-existing (667->686); words-other-19 ("change their role below") still open
- console.compliance.error.390: fixed; "What" select chosen text clipped at 16px ("...security officia") -> polish (baseline class: select's chosen text readable)
- console.models/practice/terms/organization.error.390, settings.billing-org.error.390: fixed (values kept, names, marks). terms hint still symbols vs new error words (polish)
- CODE support/page.tsx: no-PHI sentence removed from card; email channel ("write to support@") now has no warning -> FINDING should-fix (PHI; name security reviewer)
- p.case.error.390: fixed (Other kept, ticked, Why marked); quote style "other" vs “Other” (pre-existing server words)
- p.abstraction-ledger.error-adjust-zero.390: fixed (amount, reason, tick kept, hint)
- p.roi.error.390: fixed (typed period kept); table overflow pre-existing (599)
- p.pricing-settings.error.390, p.correspondence.error.390: fixed
- p.contracts.error.1280/.390: fixed (summary spans grid, fields keep columns, values kept). 390 Contract select chosen text clipped at 16px (polish, with compliance)
- CODE uploader: tabIndex -1 + aria-hidden: a11y-practice-1-20 fixed (by code)
- settings.billing.loading.390, p.cases.loading.1280-dark: label shown beside bar, both themes; still no shell (pre-existing, design 11.2.4)
- console.screening.error.390: fields now aria-invalid + 2px border; problem list below both fields w/o "Error:" pattern (polish); CODE split-form.tsx:171 role=status list recomputed each keystroke -> announces while typing (should-fix per brief 4.1.3; baseline asked for status region)
- p.coverage.checklist-review-sent.390: fixed (now submits; B showed "requestKey: reload the page and try again")
- defaults (account.notifications, p.cases, console.billing "under Billing", p.contracts): no regressions seen beyond 16px
- REPRO variants (Chromium 141 = pw 1194): wrap rule overflows with a long-option select (390->573), not with long label/hint alone; nested row + select -> 501. UX-1 trigger = any SelectField with long option in a refused flex-col form
- console.status.error(.390): A Set buttons cross card's right border (to 384px), page 391; B inside card -> UX-2 (16px widens select in non-wrapping row form, status/page.tsx:68)
## FINDINGS (draft)
UX-1 should-fix: flex-wrap rule on flex-col forms -> overflow (p.submissions.error.390 613px)
UX-2 should-fix: 16px rule widens raw/row selects -> overflow (p.coverage.checklist-review.390 408, console.status.error.390 391, settings.users 667->686)
UX-3 should-fix: Emptied note "type it again" on locked/rate-limited; "What you typed is still here" on unconfirmed sign-in while pw emptied
UX-4 should-fix: duplicate after "Not confirmed" press -> "Not done" title, false
UX-5 should-fix: /support email route lost no-PHI warning (security reviewer)
UX-6 should-fix: 12px hints carry policy/no-PHI/format (type scale ADR 0056)
UX-7 should-fix: split form role=status speaks on each keystroke
UX-8 polish: Show toggle no visible pressed state
UX-9 polish: double/triple colons in items
UX-10 polish: select chosen text clipped at 390 (compliance What, contracts Contract)
UX-11 polish: apostrophes mixed (support hint vs error; SHA hint); terms hint symbols vs new error words
UX-12 polish: hardware key Problem not first; split problems lack Error: pattern
- p.cases.default.390: Pricing run select chosen text clipped more at 16px (UX-8 polish)
- baseline open on these screens: a11y-other-06 (enroll QR), words-other-19 (role below), flows-practice-07 (pre-answered Reason/Response; PR rewrote both selects -> change's own by touching cause), narrow-other-03 (console/settings tables sideways), a11y-other-19/brand-01 (dark sign-in), brand-02 (color-scheme), a11y-other-15 (#42), words-other-22 (impact 'minor'). narrow-practice-1-13 fixed by code (scroll-padding).
## STATUS: all shot pairs reviewed; final StructuredOutput next
