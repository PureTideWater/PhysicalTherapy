# Build A2 (slice A's last part: action-form.tsx, next.ts, tests, harness swap)
Started 2026-10-27. Worktree /home/user/ux-forms at 2982890.
## Read
- design 2,3,4.1,4.6,7.1,8.2,10,12; slice-a-api, build-2a-check, build-A, status. Code read: action-form.tsx (#50), next.ts, action-form.test.tsx, browser test, harness, form-issues.tsx.
## Plan / decisions
- noteRefusal lines: no labels now; read the summary's items from the DOM (names are placed after a re-render, so re-line the noted refusal in a layout effect when the named items render). Never a key.
## Files
- DONE next.ts: stale (csrf_refused + requestKey-only -> STALE), INVALID_LEAD, problems dropped, refusedInput shared by runAction/runSignInStep; guardMessage keeps rate limit only.
- DONE action-form.tsx: useGuardedSubmit, FormIssues, RefusalSummary first, PendingStatus in wrapper, aria-disabled, beforeSubmit, labels/problems gone, header comment (2.2's two conditions), RefreshAfterRefusal for stale (no takeover; once per state via ref), noted lines read lazily from the summary's items; summaryLead re-exported.
- DONE form-issues.tsx (outside list, needed for #50's naming): hiddenName(): a hidden field's data-error-name names its issue (no link, not placed). Pages: pricing-runs/[runId], pricing-runs/compare, releases: labels= -> data-error-name on hidden inputs.
- DONE e2e/pricing.spec.ts:321-322 generic-lead check now 'listed here, then try again.'
- DONE action-form.test.tsx: summaryLead (state, n|null) cases + static markup case.
- DONE forms-harness.tsx: HarnessForm = ActionForm; new forms screening (real ScreeningSplitForm), rerun (refreshOnError, hidden data-error-name), two; window.takeover; body[data-shown] response counter (MutationObserver).
- DONE browser.ts: FORMS_HARNESS_CHROMIUM (dev only) override.
- DONE action-form.browser.test.tsx: data-seq waits -> body[data-shown]; stale test asserts one refresh; 6 todos -> 5 new tests + stale test extended.
- DONE settings/defaults.test.tsx: static summary has no names (browser names them): asserts label + Error: + message, never a key.
## Runs
- pnpm typecheck: all 22 pass (split-form errors gone).
## Left
- eslint on all changed files: clean.
- vitest unit apps/web/src/components + lib/http (browser skipped, no pinned chromium): 310 passed, 21 skipped, 0 failed.
- browser tests, FORMS_HARNESS_CHROMIUM=chromium-1243 (dev signal, not of record): 21 passed, 0 todo.
- vitest unit components + lib/http + packages/ui with dev Chromium: 34 files, 348 passed.
- packages/synth unit: 185 passed (registry test now green). lint:copy, lint:logs clean. typecheck 22/22 again after harness/test changes. eslint clean.
## Status: DONE, result returned.
