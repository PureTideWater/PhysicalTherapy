# Slice D build progress
Started 2026-10-26. Design read in full.
## Files
(none done yet)
## Tests
## Assumed slice-A API
- DONE packages/ui/src/states/loading-state.tsx, loading-announcement.tsx (new), states.test.tsx -> vitest states: 8 passed
- DONE app/console/status/page.tsx (CheckboxGroup), console/billing (under Billing), console/compliance hint, console/organizations hints, account/notifications (CheckboxField x2), app/support (hints, card sentence moved)
- DONE components/hardware-key.tsx (local inFlight ref, CeremonyButton + status, Problem title + focus)
- DONE components/uploads/uploader.tsx (tabIndex -1, aria-hidden)
- DONE components/screening/split-form.tsx (splitFaults, status region, beforeSubmit, data-issue-for) + forms.test.tsx cases (cannot run until slice A: renders ActionForm w/ beforeSubmit)
- DONE components/billing/stripe-payment-method.tsx (Problem focus, ConfirmForm aria-disabled+inFlight+PendingStatus, start button guard) + billing.test.tsx one assertion (needs slice A's form-issues to run)
- forms.test.tsx run: 10 passed (runs against current ActionForm; beforeSubmit ignored at runtime)
- DONE components/form-hints.test.ts (new): 2 pass, 1 fails only on slice C2's pending files (ledger:31, versions:204/213/214)
- @tp/ui typecheck clean; packages/ui vitest 16 passed
- loading-announcement.tsx reworked: setState in a 100 ms timer (lint react-hooks/set-state-in-effect); eslint clean on my files except split-form's any-typed beforeSubmit param (resolves with slice A)
- pnpm lint:copy: clean
## Assumed slice-A API
- field.tsx: CheckboxGroup({ legend: string; issueKey: string; options: { name; value?; label; defaultChecked?; required? }[]; hint? }) -- used without className
- field.tsx: CheckboxField({ name; label: ReactNode; errorName: string; defaultChecked? ... })
- field.tsx: Field/TextAreaField accept hint (exists today)
- action-form.tsx: ActionForm prop beforeSubmit?: (form: HTMLFormElement) => boolean
- form-issues.tsx: PendingStatus({ pending: boolean }) renders <p role="status" data-slot="pending-status">{pending ? 'Working…' : ''}</p>
STATUS: all slice D files done.
