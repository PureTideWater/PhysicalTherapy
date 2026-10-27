# fix-refix (re-fixer round) — worktree /home/user/ux-forms
Items: S-A11Y-2, U-UX-2, U-UX-3, U-A11Y-1, U-A11Y-2. No file edited by anyone else is reverted; targeted Edits only.

## Plan (decided after reading the code)
A. S-A11Y-2 + U-UX-3 (expired invitation, records): server flag `final` (no press of this form can succeed):
   routes/sign-in.ts StepResult + invitation_expired; next.ts ActionState + runSignInStep "could not continue";
   form-issues.tsx RefusalState.final, context field locked -> final (= locked || final); EmptiedNote reads final.
   Not on no_account/credentials (enumeration: their words are the same). Tests: fields.test (FormIssues mapping),
   action-form.browser.test (expired invitation), next.test (could-not-continue), onboarding-routes.db.test (expired -> final),
   sign-in.spec e2e lockout asserts the password's description. Records: ADR D2; design 2.3, 2.7?, 8.2 #3, 10.2 (dup clause), 12.2 rows.
B. U-UX-2: styles.css `:where(:has(> select)) { min-width: 0; max-width: 100% }`; uploads.spec atPhoneWidth (835 and ERA kinds);
   ADR D6; design 12.2 row.
C. U-A11Y-1: Hint in defaults.tsx, uploader.tsx (+ wrapper cap), reference-search.tsx, share.tsx; defaults.test update;
   form-hints.test D9 source scan (allowlist #42 upload-form.tsx); ADR D9 names the exception; design 12.2 row + follow-up 5.
D. U-A11Y-2: ADR line 187 example -> real collision path (03 while typing 31).

## Status
- A code DONE (20:3xZ): routes/sign-in.ts (StepResult.final, invitation_expired final), next.ts (ActionState.final, runSignInStep could-not-continue final),
  form-issues.tsx (RefusalState.final; context locked->final = locked||final; EmptiedNote). Tests edited: fields.test (inForm final + FormIssues mapping case),
  action-form.browser.test (expired invitation in the locked test), next.test (new describe), onboarding-routes.db.test (toEqual final), e2e sign-in.spec (lockout description).
- B code DONE: styles.css base `:where(:has(> select)) { min-width:0; max-width:100% }` (repro refix/uploads: 441 -> 390 at 390, no change at 1280).
- C code DONE: field.tsx Hint takes className (layout only); Hint in uploader (upload-format-hint, className max-w-prose; unconfirmed note text-sm),
  defaults.tsx (pursuit-hint) + defaults.test, reference-search.tsx, share.tsx (-who -> -hint; status text-sm). form-hints.test.ts: D9 scan (+ Hint size rule).
- NEXT: uploads.spec atPhoneWidth; then run unit tests; then records (ADR, design).
- B test DONE: uploads.spec.ts atPhoneWidth (835 kind, then ERA export chosen with its hint as the description); registry FRM-08 + uploads.spec.ts,
  `pnpm synth --case FRM-08` rewrote fixtures/synthetic/FRM-08/expected.json only.
- unit quick run: form-hints, fields, defaults, next.test: 48/48 pass.
- NEXT: records: ADR D2, D6, D9, line 187; design 2.3, 2.7, 8.2#3, 10.2 (dup clause + expired), 12.2 rows (S-A11Y-2, U-UX-2, U-UX-3, U-A11Y-1, U-A11Y-2), open item 5.
- RECORDS DONE: ADR D2 (final), D6 (box max-width, uploads measured; D6 bullet reflowed, backup refix/records/adr.before-d6-reflow.md), D9 (Hint everywhere, exception #42 upload-form, test holds it), split-form alternative example (03 collision; 0 of 02).
  Design (backup refix/records/design.before.md): 2.3 (+2 paragraphs), 2.7 (final + duplicate), 5.1, 8.2#3, 9.3 row, 10.2 (password row + dropped-connection row dedup), 12.2 rows S-A11Y-2, U-UX-2, U-UX-3, U-A11Y-1, U-A11Y-2, open item 5.
- NEXT: checks under lock: typecheck, lint, lint:copy, unit (touched + synth), db (onboarding-routes, sign-in-routes), e2e (sign-in, uploads, forms-keep-input, packets, layout-1280, reports, contracts) db tp_e2e_refix port 4793.
- CHECKS (logs refix/logs): typecheck PASS 22/22; lint PASS 1,624 files 0/0; lint:copy PASS 517; lint:logs PASS 1059;
  unit apps/web+ui+synth PASS 87 files 1068 tests (browser tests ran in Chromium 1194, verbose run of touched files 80/80);
  db onboarding-routes + sign-in-routes PASS 2 files 25 tests (no tp_test_* left).
- NEXT: e2e (own db tp_e2e_refix, port 4793): sign-in, uploads, forms-keep-input, packets, layout-1280, reports, contracts.
- Design open proposals 9 (four console pages overflow at 390, non-form causes) and 10 (split form says a mouse press twice; pointer-only skip candidate) added.
- e2e r1 RUNNING (background bdrz3wdpt): sign-in uploads forms-keep-input packets layout-1280 reports contracts era-exports, --workers=2; log refix/logs/e2e-r1.log
- gitleaks 8.24.3 (repo config) on my 20 changed files: no leaks.
- e2e r1 started 20:45Z (building). After it: check:fixtures under the lock; cleanup tp_e2e_refix + /tmp/tp-e2e-tp_e2e_refix-*.
- e2e r1 PASS 25/25 in 5.8 min (sign-in 6, uploads 3, forms-keep-input 6, packets 2, layout-1280 1, reports 3, contracts 1, era-exports 3), none skipped or flaky; server built from the dirty tree.
- check:fixtures PASS.
- CLEANUP done: tp_e2e_refix dropped, /tmp/tp-e2e-tp_e2e_refix-* removed, port 4793 free. apps/web/.next is a dirty-tree build (E2E_PREBUILT needs a fresh build + stamp after the commit).
## STATUS: COMPLETE
