# Lane B e2e run (PR #74, co-001/ux-forms @ 4f0b526) — progress
Started 2026-10-27. Worktree /home/user/ux-forms.

## Status
- [ ] read config / lane doc / design
- [ ] build + stamp
- [ ] run specs

## Setup (decided)
- Env per command: PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH; PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers (preset; chromium-1194 there)
- E2E_DATABASE=tp_e2e_uxforms E2E_PORT=4771 DATABASE_URL=postgres://postgres:test@localhost:5433/postgres (PG18, as CI)
- Dirs: /tmp/tp-e2e-tp_e2e_uxforms-* (clean at end), DB tp_e2e_uxforms on 5433 (drop at end)
- Flow: clean tree -> flock pnpm build -> stamp --write HEAD -> E2E_PREBUILT=1 playwright test <specs> --workers=2
  With uncommitted fixes the stamp refuses: leave E2E_PREBUILT unset (web server builds first).
- Logs: scratchpad/e2e-logs/
- NOTE: apps/web/test-results is NOT gitignored -> always pass --output=<scratchpad>/e2e-results/<run> so the stamp's clean-tree check holds.
- Build 1 (clean 4f0b526) started: log scratchpad/e2e-logs/build-1.log
- Build 1 done (exit 0), stamped 4f0b526 (apps/web/.next/BUILD_COMMIT). Runner: scratchpad/bin/e2e.sh <run> <prebuilt> <args>

## Runs
- run-1 (E2E_PREBUILT=1, 4f0b526, 7 specs, --workers=2): started; log scratchpad/e2e-logs/run-1.log
- run-1: 22 tests (forms 6, packets 2, pricing 1, triage 1, sign-in 6, onboarding 5, contracts 1). Early: forms-keep-input audit-request test FAILED (details pending end of run)
- F1 forms-keep-input.spec.ts audit-request test, FRM-06 step: `Request received` never shows. Cause (trace 0-trace.network): the no-JS success post sends
  Organization `SYNTHETIC FORMS CLINIC ${Date.now()}` = 13-digit run; textPhiFindings refuses "a run of nine or more digits", so the 2nd post is refused again (200, summary). TEST wrong (product screen is right, design 8.4 step 1 only needs a success).
  Fix (pending, after run-1 ends): use randomUUID().slice(0, 8).toUpperCase() like onboarding.spec.ts:69 (probe: 0/10000 flagged).
- run-1 DONE 14:19:53-14:25:18Z: 21 passed, 1 failed (5.3m). forms 5/6 (F1), packets 2/2, pricing 1/1, triage 1/1, sign-in 6/6, onboarding 5/5, contracts 1/1.
- F1 FIX APPLIED: apps/web/e2e/forms-keep-input.spec.ts: import randomUUID; success org = `SYNTHETIC FORMS CLINIC ${randomUUID().slice(0, 8).toUpperCase()}` (+2-line comment).
- run-2 (no prebuilt: tree dirty -> server builds first): forms-keep-input.spec.ts --workers=2: started
- run-2 in progress: audit-request test now PASSES (F1 fixed).
- run-2 DONE 14:25:42-14:27:14Z: forms-keep-input 6/6 passed.
- next: eslint + web typecheck on the changed spec (test-only change), then a final full run of all 7 specs as a second sample, then cleanup.
- eslint forms-keep-input.spec.ts: clean; apps/web typecheck (includes e2e): pass.
- run-3 (no prebuilt, dirty tree with F1 fix): all 7 specs --workers=2: started
- CORRECTION: test-results/ and playwright-report/ ARE gitignored (check-ignore missed them only because the dirs did not exist yet). --output to scratchpad kept anyway; no proposal.
- Probe phi2: an 8-hex tag that is all digits AND a valid YYYYMMDD is refused as a date (112 of 100301 8-digit samples; overall ~2.6e-5 per run). Decision: after run-3 ends, replace the random tag with a fixed digit-free name (nothing reads the prospect back, no uniqueness constraint) -> deterministic; then run-4 = forms-keep-input again.
- F1 FIX REVISED (after run-3's forms tests had all run): success org = fixed 'SYNTHETIC FORMS CLINIC' (no digits; randomUUID import removed). Final diff: forms-keep-input.spec.ts:201-203.
- run-3 DONE 14:28:56-14:33:38Z (random-tag version of F1 fix): 22/22 passed (forms 6, packets 2, pricing 1, triage 1, sign-in 6, onboarding 5, contracts 1).
- eslint on revised spec: clean. next: web typecheck, then run-4 = forms-keep-input with the fixed-name version.
- web typecheck after revision: pass. run-4 (forms-keep-input, no prebuilt) started.
- run-4 DONE 14:34:12-14:35:37Z: forms-keep-input 6/6 passed (final fixed-name version).
- CLEANUP done: DB tp_e2e_uxforms dropped (5433), /tmp/tp-e2e-tp_e2e_uxforms-* removed, scratchpad trace-1/probe removed, port 4771 free, no server left. Shared dev login roles left (cluster-wide, used by other runs).
- No product change, so no unit tests needed; eslint + web typecheck on the spec pass. Nothing needed proving on e908c21 (no failure left).
## STATUS: COMPLETE
