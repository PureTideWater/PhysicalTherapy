# fix-F1 progress (S-SEC-1, S-SEC-2, S-A11Y-2 / U-UX-3, U-UX-4) -- DONE, all checks green
Worktree /home/user/ux-forms at 4f0b526 + e2e fix (not mine).

## Final shape
- SEC-1: useGuardedSubmit options.heldKey (form-issues.tsx:209-247); ActionForm owns one (action-form.tsx:68-70),
  VersionForm shares one across both hooks (version-form.tsx:101-103). Pin on a drop AND on a duplicate; keep through
  refusals; clear on redirect/failure and on a person change. Departure from verifier: verifier cleared on any answer.
- SEC-2: mark in next.ts (pageMark cache :95, formActorTag :98, pageFormActor :103, loadPage sets :127) -- moved there
  from a new form-actor.ts so the screening-capacity watched-paths list (tools/, not mine) needs no regen;
  FormKeys renders <span hidden data-form-actor> (form-keys.tsx:20); usePersonChange/useClearedForAnotherPerson
  (form-issues.tsx:270-334); keyed Fragment remount in ActionForm (:76) and VersionForm (:128); export form drops
  pressedHere on a person change (export-status.tsx:84). Departure: any in-place refresh, not only stale.
- A11Y-2/UX-3: context locked (form-issues.tsx:58,67,144); emptySecrets returns bool (:436-441), placement.secrets,
  lead (:609).
- UX-4: next.ts duplicate flag + words (:163,:238); SummaryKind/SUMMARY_TITLES 'Already sent' (form-issues.tsx:473-495);
  export form title (export-status.tsx:115).

## Checks (all under the lock)
- pnpm typecheck: passed (22 projects). eslint on my 10 files: clean. pnpm lint:copy: clean.
- vitest unit: lib/http/*, action-form.test, action-form.browser.test (Chromium 1194), fields.test, screening/*,
  defaults, billing, registry, tools/screening-capacity/watched.test, tools/brand-copy: 18 files, 496 tests passed.
