# Review 2 of 2 (security + accessibility), PR #74 at 4f0b526, base e908c21
Clone: scratchpad/rev-sec (checked out 4f0b526). No install yet.

## Files reviewed
- design sec 2, 3, 4, 5, 6, 12, 12.1; build-2b summary
- action-form.tsx, form-issues.tsx, field.tsx, password-field.tsx: read
- lib/http/next.ts, form.ts, invoke.ts (request key claim in txn; refusal rolls back): read
- form-keys.tsx (hidden inputs use value=, so refresh updates DOM)
- export-status.tsx, version-form.tsx, hardware-key.tsx: read
- sign-in pages (page, mfa, enroll, new-password), routes sign-in.ts, schemas.ts, cognito-provider.ts, support.ts, onboarding.ts, billing.ts, compliance.ts: read
- packages/ui styles.css, button.tsx, input.tsx, loading-state.tsx, loading-announcement.tsx, alert.tsx: read
- test-support/browser.ts: read (not shipped; only tests import)
- grep: no style=, innerHTML, console.*, storage in added lines

## Candidate findings (verify / decide)
- SEC-1 (should-fix, new): "Not confirmed... press again" relies on replaying the same requestKey, but any router.refresh on the page between the drop and the retry (ExportStatus polls every 5 s on the packet page, which also holds VersionForm and the approval ActionForms; another form's refreshOnError/stale refresh; the uploader) re-renders FormKeys with a NEW randomUUID -> retry after a committed-but-dropped save saves twice. Fix: useGuardedSubmit remembers the requestKey it sent when the result is unconfirmed and sets it on the retry's FormData.
- A11Y: VersionForm's two hooks share seq numbering independently -> write seq1 then draft seq1 reuses the Summary instance (same key), not re-inserted (polish)
- Notes: Alert role=alert + focus double read: pre-existing (e908c21 also focused summary Alert); design defers to Notice PR.
- enroll page <p data-secret={secret}> pre-existing, outside form, selector is input[data-secret]: no issue.

## Findings (final)
(pending)

## Progress 2
- Read: stripe-payment-method, uploader, contracts/forms, template-mapper, split-form diffs; next.test.ts; fixtures FRM-01; e2e typed values (synthetic).
- Field ids per page: tools/fields-ids.cjs -> fields-ids.txt; no duplicate default ids found within a page.
- XSS: names via textContent rendered as React text; fine. CSP: no style attr added. No console/log added.
- SEC-1 confirmed: packet page has VersionForm + ExportStatus (5 s router.refresh while live) + approval ActionForms; reconciliation page has Uploader refresh + row ActionForms; pricing-runs refreshOnError rows refresh whole page. FormKeys = randomUUID per render. Retry after unconfirmed then uses new key.
- Pre-existing: summary Alert role=alert + focus (base also focused it).

## Progress 3
- Read pages: submissions, coverage, report/packet review, notifications, status, agreements, proof-level, support, ledger, defaults.tsx, money-field, narrative-editor (fallback marking), personas, e2e helpers, ADR 0077 D1/D2/Not covered.
- FormKeys scan (tools/formkeys-scan.cjs): every practice ActionForm has keys (versions page via hidden()); public forms (sign-in, request-audit, screening convert) have none by design.
- Vite 8 harness, test only; no dep change.
- SEC-2 (should-fix, new): stale path adopts a DIFFERENT user's session. csrf.ts: "with another session's [token], is refused" -> csrf_refused -> STALE -> router.refresh renders the page for whoever is signed in now (shared workstation: A's tab with typed note, B signs in in another tab) -> A's typed values kept in uncontrolled fields under B's fresh token -> "It is up to date now: press X again" -> saved as B (audit actor B). Before PR the refusal reset the form. Fix: identity-aware stale: render an opaque actor tag with FormKeys (data attr), compare before/after refresh; on change, reset form and say signed in as someone else.
- Polish candidates: PasswordField {...props} after spellCheck/autoCorrect/autoCapitalize (caller can undo); emptied note says "type it again" on Account locked; VersionForm two seq counters share key; split-form live status + focus double.

## Findings (final, before StructuredOutput)
- SEC-1 should-fix: unconfirmed retry after a page refresh sends a NEW requestKey (form-issues.tsx:201,214-231; form-keys.tsx:14; export-status.tsx:28-38 polling on packet page with VersionForm :358 and model draft). Fix: pin the sent key across an unconfirmed retry in useGuardedSubmit.send.
- SEC-2 should-fix: stale refresh adopts another user's session, keeps A's typed values, invites press (next.ts:153; action-form.tsx:78,217-229; form-issues.tsx:445-446; csrf.ts:13; sign-in page no redirect). Fix: identity tag in FormKeys, compare before/after refresh, reset form on change.
- SEC-3 polish: PasswordField {...props} after spellCheck/autoCorrect/autoCapitalize (password-field.tsx:80-84).
- A11Y-1 polish: CheckboxGroup boxes never aria-invalid; markByHand skips inside [data-invalid] (form-issues.tsx:342; field.tsx:222-231).
- A11Y-2 polish: emptied note "type it again" on Account locked; unconfirmed lead "What you typed is still here" while secrets emptied (form-issues.tsx:129-135,440).
- A11Y-3 polish: VersionForm two seq counters -> same Summary key across actions (version-form.tsx:97-98,121; form-issues.tsx:376).
- Not raised (decided/pre-existing): Alert role=alert + focus double read (base did it; design 3.5 defers to Notice PR); Show toggle text not changing (5.3); fieldset aria-describedby pattern (GOV.UK).
Status: ready to report.
