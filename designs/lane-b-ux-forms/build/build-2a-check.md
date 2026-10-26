# Build 2a integration check
Started 2026-10-26. Checks: 1 ownership, 2 API, 3 checks, 4 return.
## Check 1: file ownership (done)
- 19 modified + 8 new (untracked) files; all in slices A (7.1), C1 (7.3: cases, reports, reports review, pricing-runs, version-form, export-status), C2 (7.4: regulations, versions, agreements, proof-level, settings/pricing, contracts/forms, template-mapper).
- None is action-form.tsx, next.ts, action-form.test.tsx; none a #42 file (grep -Fxf: no match); no #49/#51/#52 page. OK.
## Check 2: API (in progress)
- form-issues.tsx, field.tsx, password-field.tsx read in full: every spec signature and markup in slice-a-api.md matches (FieldError, PendingStatus, emptied note + describedby order, data-secret, checkbox-field/data-invalid, group fieldset, PasswordField toggle, RefusalSummary data-slot overrides Alert's (props spread after), tabIndex -1, classes, data-state, key seq, titles, leads, focus rule 3.6).
- Alert's data-slot="alert" is overridden by RefusalSummary's (Alert spreads props last). Design self-conflict: 3.5 (:473) sets data-slot="refusal-summary"; 3.3 (:413) and 11.3 (:1621) rely on e2e/helpers.ts refusal() = [data-slot="alert"]. helpers.ts is in no slice -> blocking proposal (A's 1), not edited.
## Check 3 (in progress)
- pnpm typecheck: exactly 4 errors, all #50: export-status.tsx:106 (ActionState.invalid), split-form.tsx:139 x2, :148 (ActionForm beforeSubmit). All other projects clean.
- eslint, 25 uncommitted TS files (A, C1, C2): clean.
- eslint, 42 TS files of 0c0ea22 (B, D, E): only the 4 expected no-unsafe-* at split-form.tsx:148 (#50: beforeSubmit).
- lint:copy clean (498 files); lint:logs clean (1008 files).
- vitest unit (apps/web/src/components, packages/ui, packages/synth): 319 passed, 6 todo, 3 failed:
  - synth fixtures 'points only at tests that exist': FRM-04 -> action-form.test.tsx (#50 creates it). EXPECTED.
  - form-hints: abstraction/ledger/page.tsx:31 (waits for #51, slice C2). EXPECTED.
  - billing.test.tsx:104 regex matched class text 'disabled:pointer-events-none'. FIXED (slice D file, untouched in worktree): /<button[^>]*\sdisabled(=|\s|\/?>)/ ; billing 13/13 pass, eslint clean.
- C's consumers read: version-form (shared inFlight across two useGuardedSubmit, send(), RefusalSummary/FormIssues), export-status (local ref guard, PendingStatus, aria-disabled), template-mapper (useFieldIssue('template'), Field/SelectField controlled) all match the spec.
- refusal(page) users today: contracts, onboarding, sign-in specs -> all ActionForm pages, which still render data-slot="alert" until action-form adopts RefusalSummary (after #50). packets.spec does not call refusal(). So helpers.ts fix lands with the #50 wave; nothing breaks now.
- #50's action-form also exports takesOrphanedRefusal and RefusalFallback (not in the task's keep list): keep them too.
- labels= callers outside the design (from #54): settings/defaults.tsx:57,:102 (+MATERIALITY_LABELS/PURSUIT_LABELS, defaults.test.tsx:114,:155), console/models/page.tsx:77 (labels equal visible labels), console/practices/[practiceId]/page.tsx:118 (SETTINGS_LABELS). Compile now; break when labels is removed.
## Check 2 done. Check 3 done. Check 4: result returned.
