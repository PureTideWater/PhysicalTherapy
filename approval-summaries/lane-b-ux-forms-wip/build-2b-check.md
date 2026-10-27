# build-2b-check progress
Worktree /home/user/ux-forms at 2982890e, 23 files modified (A2 + C3).
## Checks
- 1 status: 23 modified files, all A2 or C3; only #42-list hit is packages/synth/src/cases/registry.ts (shared doc, LANES rule 6 allows). OK
- typecheck: 22/22 pass (EXIT 0)
- leftovers: no labels=, no ActionState.problems, raw controls inside ActionForm only on #42 users page (deferred) and a unit test; raw selects on cases/pricing-runs/coverage are GET forms. e2e helpers.ts refusal() covers both alert and refusal-summary. OK
- fixes by me: next.ts guardMessage unexported (only used in file); workbench-routes.db.test.ts:236 fixture lead -> new words
- 2 API: action-form/next/form-issues match slice-a-api.md; pages use Field/SelectField/TextAreaField/CheckboxField/CheckboxGroup per signatures (typecheck). packets.spec FRM-01 step: label, route message (submissions.ts:237), amount-hint id consistent. attest/report CheckboxGroup issueKey="confirm" never matches confirm_<id> (per-box issues placed on boxes; group message never shows) = known proposal (per-box message), same as committed report page.
- running: pnpm lint (bg)
- pnpm lint: pass, 1622 files 0 errors 0 warnings (after my edits)
- typecheck re-run after my edits: 22/22 pass
- lint:copy 517 clean; lint:logs 1059 clean; verify-content pass
- next: unit apps/web packages/ui packages/synth with FORMS_HARNESS_CHROMIUM (dev signal)
- unit apps/web+packages/ui+packages/synth with FORMS_HARNESS_CHROMIUM=chromium-1243 (dev signal, not of record): 85 files, 1032 passed, 0 skipped
- db: sign-in, onboarding, billing, console, workbench, models route db tests: 6 files 81 passed
- db: route-tests (13 generated files) 6870 passed
- DONE; left: e2e (browser of record + stack), PR pipeline
