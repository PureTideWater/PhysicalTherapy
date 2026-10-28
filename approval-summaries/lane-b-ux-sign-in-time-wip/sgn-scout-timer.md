# Scout B (timer) progress: co-001/ux-sign-in-time
Started 2026-10-28. Output: /home/user/ops/designs/lane-b-ux-sign-in-time/scout-timer.md
## Status
- [x] read requirements (review sec 3 order 6, UX-012, UX-128, C-007, C-042, prs.json order 6)
- [x] read code (pending.ts, sign-in routes, pages, action-form, form-issues, alert, harness, e2e, personas, a11y)
- [x] Q1 WCAG
- [x] Q2 component
- [x] Q3 tests
- [x] report written (scout-timer.md, 2026-10-28)
## Notes
- [x] requirements read: UX-012 fix text (review l.1808): 'This step stays open for 3 minutes.'; warning at 1 min left
  'This step closes in 1 minute. Start it again to get more time.' + 'Start again' -> password step, email filled;
  constant beside pendingSeconds = min(Cognito 3 min, cookie 5 min); email in sealed HttpOnly cookie, step+15 min,
  never in URL. UX-128 part: step marker 'Step 1 of 2: choose a password' / 'Step 2 of 2: set up two-step verification'.
- code facts: pending.ts pendingSeconds 5 min (15 register_key); Pending (lib/auth/sign-in.ts:44) has NO timestamp;
  settle() rewrites pending on invalid_password with SAME challenge (cookie gets fresh 5 min; Cognito session does not)
  -> deadline must live in Pending, kept across same-challenge rewrites. dev-provider CHALLENGE_MS = 3 min (mirrors
  Cognito) with injectable now. Expiry paths: cookie gone -> RESTART; provider 'expired' -> settle clears + redirect.
- Alert (@tp/ui alert.tsx) default role='alert' (assertive); notice.tsx passes role='status'. RefusalSummary = Alert
  role=alert, focused on refusal; PendingStatus role=status beside button. Next 16.4.3, React catalog, PW 1.64.1, axe 4.14.0.
- #42 OPEN (REST, 2026-10-28). #42 files relevant: infra identity.ts (authSession: Duration.minutes(3) at :14, read-only OK),
  apps/web/src/lib/server/{services,config}.ts (no e2e clock knob there), e2e/{env,prepare}.ts, routes/index.ts +
  registry.test.ts (a NEW route touches index.ts? check), test-matrix.md + synth matrix.ts/registry.ts (shared docs:
  LANES rule 6 allows, merged-second resolves; SGN = synth module 19 reserved; CASE_MODULES in synth expected/types.ts).
- harness: browser.ts open(form,{width}) does newPage+goto: page.clock.install must precede goto -> add an option.
  unit project = node env, *.test.tsx incl. *.browser.test.tsx (Chromium via Playwright). e2e prepare resets dev auth
  store each run (personas can complete new-password once per run). e2e = prod build + local providers.
- dev-provider CHALLENGE_MS 3 min, DevAuthOptions.now injectable (db route tests can expire the provider path).
- PW 1.64.1 clock verified in coreBundle: setSystemTime moves Date only (performance.now ticks unchanged); fastForward
  moves both, fires due timers once ("laptop lid"); install before goto; context-wide clock. clearCookies({name}) ok.
  Pending cookie name 'tp_sign_in' (sessions.ts:20). No clock use in repo yet.
- Pin precedent: primitives.test.ts:66-77 reads infra identity.ts TEXT (toContain). Use same for authSession.
- e2e helpers refusal(page) = [data-slot=alert],[data-slot=refusal-summary] -> timer Alert must set its own data-slot.
- Next 16: router cache reused on back/forward -> stale closesIn on remount; fix = module Map keyed by closesAt.
## Decisions so far (Q2)
- No ticking clock (2.2.2 Pause/Stop/Hide would apply to a per-second countdown; COGA pressure). Phases open/warning/closed.
- remaining = min(dateDeadline-Date.now(), perfDeadline-performance.now()) anchored at first mount per closesAt.
- 1 s interval + visibilitychange/pageshow/focus check; text set only when visible; skip warning if already closed.
- Region role=status from SSR, empty; inner Alert role=none? data-slot=step-timer; never focus; outside <form>, after it.
- At zero: no disable, no auto-redirect; closed message + Start again; press -> server RESTART (app-side closesAt check).
- Start again = link to /sign-in (email cookie written at writePending) -> no new route, works w/o JS, no GET side effect.
- Route db test sign-in-routes.db.test.ts injects clock (services now + DevAuthOptions.now): path (2) testable there.
- Decided e2e expiry: page.clock (browser) + context.clearCookies({name:'tp_sign_in'}) = Max-Age drop (path 1);
  provider path (2) in db route test. Rejected: real 3-min wait; dev-store per-persona short challenge (test-only branch).
- Wrapper API: <StepTimer limitSeconds closesAt closesIn restartHref restartNote?>{card content}</StepTimer>:
  sentence first, children, then status region (insert below submit -> no layout shift above).
- Flags: enroll restart issues NEW key (words must say so); register-key 15-min limit out of PR file list (gap);
  locked state leaves timer running (accept, minor).
- Next 16 layout-router.js: "This handler intentionally leaves focus untouched" -> after Start again (client nav) focus
  falls to body; recommend the /sign-in notice take focus on reason=step_expired (RefusalTakeover pattern).
- Next 16 restore-reducer.js: history traversal restores from segment cache (FreshnessPolicy.HistoryTraversal) -> unsure
  whether props refetch; Map-by-closesAt makes it irrelevant.
- words helper: counted(3,'minute') in lib/copy/words.ts.
- Region: one persistent div role=status aria-atomic, className alertVariants() when speaking (no nested role=alert),
  data-slot=step-timer, data-phase set after mount (tests wait on it). Server answer after zero = redirect (not refusal).
- [x] Q1 [x] Q2 [x] Q3 decided. NEXT: write report to /home/user/ops/designs/lane-b-ux-sign-in-time/scout-timer.md
- DONE: report at /home/user/ops/designs/lane-b-ux-sign-in-time/scout-timer.md; nothing left.
