# sgn-refix progress (PR #92, worktree /home/user/ux-sign-in-time)
- SEC-01-R1: REAL. Fix: lib/routes/sign-in.ts restartSignIn wraps restartRoute; on rate_limited clears SIGN_IN_COOKIE. DB test 'a Start again its rate limit refuses...' added. ADR 0081 D6 text updated.
- UXC-01: REAL (limitPhrases took latest closesIn). Fix: step-timer keeps first closesIn per closesAt in state (not a module map: server modules serve every request). Harness assertion added.
- UXC-02: REAL. Fix: staff e2e reaches closed on register-key, asserts the closed note, Start again, signs in again (chosen password + next-window code), registers.
- UXC-03: REAL. Fix: onSubmit guard (ref + state), aria-disabled, PendingStatus in data-slot=restart-pending outside the region. Harness: two clicks in one frame -> 1 restart.
- Incident: ran prettier --write (repo has no prettier config) on 5 files; rebuilt them from HEAD + checkers' recorded git diff (tool-results/bmo50121j.txt, wf_aabddb31 a332af diff) + recover/reapply.py; verified prettier(rebuilt)==prettier snapshot except deliberate tweaks. Never run prettier --write here.
- Checks: tsc apps/web exit 0; pnpm lint 1,686 files 0 errors; unit+browser 15 files 412 PASS (incl step-timer.browser, next.test); db 2 files 29 PASS (incl new SEC-01-R1 test). e2e sign-in-time.spec.ts 4 passed (4.4m); step-timer.browser verbose 14 passed (not skipped). DONE.
