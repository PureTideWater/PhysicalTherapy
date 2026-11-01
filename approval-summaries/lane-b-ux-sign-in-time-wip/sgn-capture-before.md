# sgn-capture-before progress

started 2026-11-01; no earlier run.

## Step 1 (spec), uncommitted edits in /home/user/ops (as of now)
- tour.spec.ts: Cap.clock + install in cap(); toStepPhase (+100 ms real pause per jump); emailKept (clear skip reason);
  passwordTo (unseeded persona -> "not seeded on this ref"); reasonShown (404 -> clear reason); (b) restarted + hw-key step_expired;
  (c) mfa warning/closed, restarted-kept, step-expired-kept after mfaShots; (d) invitedShots all[]+signInMeta+temporary/enroll warning-closed (IN COPIES)/chosen;
  (e) invited-staff after invitedShots; (f) register-key warnIds in copies.
- route-map.json (g) done; README (h) bullet done.
- tsc (bundler resolution, scratchpad/tsconfig.tour.json) on the copied spec: exit 0, no errors.
- COMMITTED e4ff97a4 (spec, route map, README); pulled (merge e1fa5659); pushed f4d70f9d..e1fa5659 to claude/build-ops.
## Step 2
- setup.sh TOUR_REF=bce57f16 TOUR_DIR=scratchpad/screens-before: exit 0, "ready at bce57f16".
- TOUR_ONLY in scratchpad/sgn-tour-only.txt (81 ids).
- next: build.sh under flock (background) -> run.sh -> stop -> check -> cleanup -> tile.
- build.sh started (bg b8f56adjr, TOUR_MINUTES=60); run.sh started (bg b2la1fxpr)
- populate exit 0 (11 passed, 3.0m); capture started 17:59:05
- capture exit 0 18:00:43: 48 shots, 33 skipped. touch stop; build.log "server stopped at 18:00:58"; fuser 3297 empty; lock free.
- cleanup: DROP DATABASE tp_e2e_screens; rm /tmp/tp-e2e-tp_e2e_screens-*.  tile.py run.
- pushed b957c80f (andDark fix) 888e949f..b957c80f
- DONE: 48 shots, 33 skipped, tiles 66 at screens-before/tiles/index.json. Returned.
