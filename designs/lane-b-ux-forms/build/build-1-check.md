# Build 1 integration check
Started 2026-10-26. Checks: 1 file ownership, 2 API spec, 3 checks, 4 return.

## Check 1: file ownership (done)
- 54 changed/new paths (42 modified + new files incl. 8 FRM fixtures). All map to slices B, D, E of design 7.
- #42 intersection: only test-matrix.md, synth matrix.ts, registry.ts (rule-6 shared docs). OK.
- No slice-A file touched. OK.
- Outside the listed slices but justified (E): packages/synth/src/expected/types.ts ('FRM' in CASE_MODULES), packages/synth/src/cases/common.ts (FRM: 16), fixtures/synthetic/FRM-01..08 (generated). Not #42 files.
## Check 2: API spec (done)
- Written to progress/slice-a-api.md. B, D, E consistent with each other and with design; no slice edit needed.
- One flagged decision: D's local inFlight refs (hardware key, Stripe) instead of "useGuardedSubmit's inFlight guard" (7.1). Kept; reason in spec.
- eslint on 50 changed TS files: only the 4 expected no-unsafe-* at split-form.tsx:148 (beforeSubmit not yet declared)
- lint:copy clean (496 files); lint:logs clean (1004 files)
- tsc: packages/ui, packages/synth, apps/worker clean
- tsc apps/web: exactly 8 errors, all missing slice-A exports or the beforeSubmit prop (notifications CheckboxField, status CheckboxGroup, 2x password-field, stripe form-issues, 3x split-form beforeSubmit)
- vitest unit (ui, synth, words, cognito-provider, forms, form-hints, billing): 203 passed, 2 failed + 1 file not loaded, all expected: synth 'points only at tests that exist' (FRM registry names slice-A/#50 tests), form-hints (C2's 4 fields), billing.test.tsx cannot import form-issues
- pnpm synth --all: 0 written, 494+16 unchanged (deterministic)
- FIX (slice B file): onboarding.ts:118 referringFirm raw-length message 'at most 200 characters' -> 'enter at most 200 characters' (requiredText's instruction form; no test asserts it)
- Collision checks: ADR 0077 not on any of 53 remote branches; synth module 16 unused on every remote.
- Stale-string sweep: no test or page still asserts a reworded string. Proposals recorded for other files' "at most {n} characters" messages.
## Check 3 done. Check 4: result returned.
