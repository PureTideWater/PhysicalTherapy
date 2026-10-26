# Build E progress (co-001/ux-forms, slice E)
Started 2026-10-26. Design read in full (sections 1-12).
## Files
- [x] apps/web/e2e/forms-keep-input.spec.ts (6 tests; typechecks: tsc hook shows no error in e2e)
- [x] synthetic-personas.ts: forms-signin, forms-invited, forms-manager, forms-admin + header clause
- [x] apps/web/e2e/triage.spec.ts (write-off step: refused Other first, then Other with Why; data-reason="other"; header FRM-01)
- [SKIP] packets.spec.ts: #51 (label to "Amount the payer will pay (accepted or partial only, dollars)") and #52 change it at their heads; step recorded for after they merge
- [x] apps/web/e2e/contracts.spec.ts comment (:146-147 rewritten)
- [x] docs/adr/0077-...md (written)
- [x] docs/adr/0056 (status + italic note after Chrome paragraph) + BRAND.md section 5 row
- [x] test-matrix.md (section + intro), matrix.ts, registry.ts (FRM-01..08 none(1)); ALSO packages/synth/src/expected/types.ts CASE_MODULES += FRM, cases/common.ts MODULE_NUMBER FRM: 16 (13 DBF,14 RCC #49,15 BIL; 16 free on every branch). packages.spec.ts left out of FRM-01 assertedBy until its step lands
## Checks
## Slice-A API assumed
## Left undone / proposals
- synthetic-personas: seed.ts:32 and seed.db.test.ts:37 map SYNTHETIC_PERSONAS, follow automatically
- pnpm synth --all: 8 written (fixtures/synthetic/FRM-01..08/expected.json), 486 unchanged, 0 removed
- vitest packages/synth: 157 pass, 1 fail EXPECTED ("points only at tests that exist": FRM-01 action-form.browser.test.tsx, slice A's; also action-form.test.tsx (#50), form-issues.test.ts, fields.test.tsx)
- eslint on all changed TS files: clean
- pnpm lint:copy: clean (496 files)
- vitest --project db apps/web/scripts/seed.db.test.ts: 1 passed (new personas seed and sign in)
- verify-content: not run (reads content releases only, not the matrix)
- prettier: not enforced (HEAD versions of the same files already differ)
## Slice-A API / selectors the spec relies on (no direct imports of slice-A exports in slice E)
- [data-slot="refusal-summary"] first non-hidden child of the form; contains AlertTitle "Not done"/"Not confirmed"; focusable (tabIndex -1); items are <a> links "{name}: {message}"
- [data-slot="pending-status"] inside the form, "" idle, "Working…" pending; button aria-disabled="true" while pending, words unchanged
- Field id default `field-{name}`-style id; `[id="{id}-error"]` holds message alone; wrapper [data-field-error] contains "Error:"
- emptied note in aria-describedby (accessible description) "Emptied for your security: type it again." / "Emptied for your security."; no note before a refusal (New password description == hint exactly)
- PasswordField toggle: button named "Show new password" (exact), aria-pressed; input spellcheck=false autocorrect=off autocapitalize=none; type back to password after submit
- CheckboxGroup: fieldset role group named by legend, data-invalid attr, [data-field-error] inside; first checkbox focused
- [data-slot="app-header"] (shell, exists)
- styles: refused control border-top-width 2px, color == var(--destructive); font-size >=16 at 390, ==14 at 1280
## DONE: all slice E files written and checked; result returned to orchestrator
