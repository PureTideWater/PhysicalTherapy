# Build A (slice A minus action-form.tsx, next.ts, action-form.test.tsx)
Started 2026-10-26. Worktree /home/user/ux-forms, base 0c0ea22 (clean at start).
## Files
- DONE (draft 1) components/form-issues.tsx, components/field.tsx, components/password-field.tsx. Typecheck hook: only action-form/next errors remain (export-status invalid, split-form beforeSubmit).
## Runs
## API as built
## Waits for #50
- DONE packages/ui button.tsx (aria-disabled classes), input.tsx (aria-invalid class dropped), styles.css (4 unlayered rules), components.test.tsx (aria-disabled case); lib/http/form.ts comment.
- DONE tests form-issues.test.ts (fieldName, summaryLead), fields.test.tsx (static markup).
- RUN 09:35 vitest unit fields.test.tsx + form-issues.test.ts + packages/ui: all pass (38).
- NEXT: test-support/{browser.ts, forms-harness.tsx, forms-harness.html}, action-form.browser.test.tsx; then eslint, tsc ui+web.
- DONE test-support/browser.ts (startHarness/withHarness/chromiumInstalled), forms-harness.html, forms-harness.tsx (HarnessForm = ActionForm body via useGuardedSubmit; forms keep/submitters/grid/row/adjustments/header/split; window.harness steps/calls/release/allow/refreshes; AppRouterContext stand-in).
- RUN 09:38 smoke browser test under lock: harness boots in vitest, Chromium /opt/pw-browsers/chromium-1194, 1 passed (33.7 s cold).
- NEXT: full action-form.browser.test.tsx (8.2 tests 1-12; todos for new ActionForm), static RefusalSummary tests in fields.test.tsx.
- DONE action-form.browser.test.tsx: 15 tests (8.2 tests 1,2,3,4-lead,5,6,7,8,9,10,11,12) on HarnessForm + 6 it.todo for the new ActionForm.
- RUN 09:42 browser tests under lock: 15 passed, 6 todo, 8.3 s warm.
- DECISION: summary root = Alert with data-slot="refusal-summary" (as API spec/E's e2e: focused, first child). This REPLACES data-slot="alert" on it (Alert spreads props), so e2e/helpers.ts refusal() ([data-slot="alert"]) no longer finds a refusal: BLOCKING PROPOSAL helpers.ts:64 -> '[data-slot="alert"], [data-slot="refusal-summary"]'. Test 8 counts [role=alert] insertions.
- Harness CSS: tokens.css + styles.css imported from forms-harness.tsx (an html link cannot climb above the Vite root).
- RUN 09:43 unit: fields.test.tsx (18, incl. static RefusalSummary), form-issues.test.ts, browser (16 + 6 todo, incl. FRM-08 font sizes), packages/ui: 58 passed. Harness utilities now in @layer utilities (fidelity).
- FIX password-field: mounted via useSyncExternalStore (react-hooks/set-state-in-effect refused setState in effect).
- RUN 09:44 eslint on all 12 slice-A TS files: clean. tsc packages/ui: clean. tsc apps/web: 4 errors, all #50-bound (export-status.tsx:106 ActionState.invalid; split-form.tsx:139 x2 + :148 beforeSubmit prop).
- RUN 09:45 vitest unit apps/web (61 files): 716 passed, 6 todo, 2 failed, neither slice A's: form-hints.test.ts (ledger page :31, a #51-wait page, C2) and billing.test.tsx:104 (D's regex /<button[^>]*\sdisabled/ matches the class text "disabled:pointer-events-none", which predates slice A; the test could not load before).
- RUN lint:copy clean (498 files), lint:logs clean (1008 files).
## API as built (form-issues.tsx), beyond slice-a-api.md
- RefusalState {error?, invalid?, issues?, locked?, stale?} (ActionState read structurally); FormState = RefusalState & {seq?, unconfirmed?: true}.
- FormIssues({state, children}): memoised FormIssuesContext provider (refused = error || unconfirmed).
- useGuardedSubmit(action, {beforeSubmit?, inFlight?}) -> {state, fromBrowser, pending, formAction, onSubmit, send}. version-form (C1) already uses it with a shared inFlight and send().
- RefusalSummary({state, fromBrowser, submit, formRef}): keys itself by state.seq; Alert root carries data-slot="refusal-summary", data-state, tabIndex -1, col-span-full basis-full w-full; layout effect: empty secrets, resolve+name targets, fallback marks, focus.
- summaryLead(state, placed: number | null): string | null (#50's, extended; lives here now).
- Also exported: useEmptied, EmptiedNote, describedBy, SecretKind, GuardedSubmit, RefusalSummaryProps; field.tsx exports controlMarks, Hint (used by password-field).
## Waits for #50
- action-form.tsx: adopt useGuardedSubmit + FormIssues + RefusalSummary + PendingStatus (wrapper div flex flex-wrap items-center gap-2, aria-disabled button), beforeSubmit prop, drop labels/problems, RefreshAfterRefusal also for state.stale (no takeover note), header comment with 2.2's two conditions; re-export summaryLead from form-issues (#50's own replaced: its tests become summaryLead(state, 1|0), lead words change with next.ts).
- next.ts: ActionState invalid/stale, problems removed, lead words, csrf_refused + requestKey-only -> stale.
- action-form.test.tsx: summaryLead cases.
- action-form.browser.test.tsx: 6 it.todo; switch the harness's HarnessForm to ActionForm.
