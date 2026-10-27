# critic-2b progress (started)
Read: design 2-12, action-form.tsx, form-issues.tsx, next.ts, field.tsx, password-field.tsx (core ok vs 2.1/2.3/3.5/3.5a/3.6 at first pass)
GAP1 (should-fix) attest pages (packet review, report review): CheckboxGroup issueKey="confirm" but route keys confirm_<id>; useFieldIssue keyMatches needs '.' so group never shows message/data-invalid; summary item named by box's whole sentence label (nameOf->labels[0]) not "Confirmation"/legend; violates 3.3/3.8/10.2.
GAP2 (should-fix bug) stale state outside ActionForm: version-form.tsx (RefusalSummary says "It is up to date now: press X again" but no RefreshAfterRefusal/router.refresh -> second press re-sends stale token, refused again, loop; false words). export-status.tsx ExportRequestForm shows bare "This page was out of date, so nothing was saved." no next step, no refresh (regression from "Reload the page and try again"). #42 upload-form.tsx same (proposal).
GAP3 (nit, pre-existing) version-form no-JS/pre-hydration model-draft refusal: shown=write when clicked null, draft server state never shown.
GAP4 (nit) action-form.test.tsx has no FRM-04 in any title (registry names it for FRM-04; 8.1 "every test names the row's id in its title"); sign-in-routes.db.test.ts FRM-07 only in comments.
GAP5 (nit) defaults.tsx keeps MATERIALITY_LABELS/PURSUIT_LABELS tables (only a test reads MATERIALITY_LABELS) and its comment says fields take labels from them (MoneyField "Per line" does not): design 3.4 "no per-form table".
GAP6 (nit) hidden inputs' data-error-name naming (hiddenName) departs from 3.4/3.5 "hidden input never a target / message alone" — undocumented in design/ADR (checker proposal 1).
GAP7 (nit) helpers.ts refusal() changed though 8.5 says unchanged (needed because Alert's prop spread overrides data-slot) — record in design.
Checked OK: slice tables all files changed; 10.2 strings slice B; 5.4 hints; ADR/0056/BRAND; matrix rows exact; registry; e2e spec vs 8.4; triage/packets steps; coverage FormKeys; hardware key; stripe; split form; template mapper; loading.
GAP8 (should-fix) FRM-02 row asserts three redirect kinds (same page, same address, another page); only forms-keep-input support step (same path ?sent=) asserts it.
GAP9 (nit) FRM-01 "the action's state carries no value the person typed" asserted only against harness-scripted states, never a real runAction state.
GAP10 (nit) LoadingAnnouncement adds a 100 ms delay not in 4.3 (design: label after mount).
DONE - ready to report.
