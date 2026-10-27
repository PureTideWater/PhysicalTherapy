# shots progress (UX and brand before/after for PR #79, co-001/ux-table-scroll)

Base e908c214 (screens-before), head 35b14cd5 (screens-after). Started fresh 2026-10-27 (no earlier file).
S = /tmp/claude-0/-home-user-PhysicalTherapy/13d6f1ba-32aa-5d43-bbf7-78e9ac9db9c8/scratchpad

## The sample (TOUR_ONLY, both runs)
(a) design 8.1 + (b) UX-011/UX-079 screens + (c) one per layout; each at 1280, 1280-dark, 390:
p.cases.default, p.claims.default, p.home.default, p.packet.default, p.remittance.default, console.prospects.default,
settings.billing-org.default, console.rule-releases.notes-open, p.contract-version.default (the cited page shows in
its default), p.contracts.default, p.cases.deadline-14, p.claims.viewer, screening.default, console.screening.default,
p.anomalies.cohort, status.default (public layout with a changed table).
Plus request-audit.sent.1280 (the write that gives /console/prospects its one request).
Layouts: practice = p.*, console = console.prospects / console.rule-releases / console.screening, account =
settings.billing-org, public = status.default / screening.default.

(d) capture spec $S/capture/lane-b-ux-table-scroll-capture.spec.ts, output in <TOUR_DIR>/extra (shots.json, png/):
tbl.cases-default.390-dark; tbl.cases-scrolled-middle.390, tbl.cases-scrolled-end.390; tbl.cases-tab-focus.390 (+detail);
tbl.cases-forced-colors.390 (+detail); tbl.claims-fits-link-focus.1280 (+detail); release notes box and cited page box
(rest 1280/1280-dark/390, end 1280, focus 1280); tbl.stacked-rows (after only: 390, 390-dark, 1280, 1280-dark).
Not reachable: the content checker's problems box (the tour server has no CONTENT_ROOT, as in e2e).

## Steps
- [x] 0. Read README (From another lane, Set-up and a run), design 8.1 and 12, findings UX-011/UX-079, PR body, builders' reports, tour spec ids.
- [x] 1. Capture spec written: $S/capture/lane-b-ux-table-scroll-capture.spec.ts (parses: --list ok) and $S/capture/stacked-rows-harness.mts (tsx from /home/user/screens/apps/web; Playwright's own JSX transform is its component-testing runtime, so the harness body is rendered by tsx, then served by the spec)
- [ ] 2. Run 1 (before, e908c214): setup, build, run.sh, capture spec, stop, server check
- [ ] 3. Run 2 (after, 35b14cd5): setup, build, run.sh, capture spec (+ stacked rows harness), stop, server check
- [ ] 4. Clean up tour database and /tmp dirs
- [ ] 5. Tile both runs (tour + extra)
- [ ] 6. screens-index.md

## Log
- 16:5x setup.sh TOUR_REF=e908c214 TOUR_DIR=$S/screens-before: ok (worktree /home/user/screens at e908c214). TOUR_ONLY list in $S/tour-only.txt (49 ids).
- build.sh (TOUR_MINUTES=60) and run.sh started for the before run (logs screens-before/build.log, run.log).
- before: build done 16:54:48, server ready 16:55:18, populate 11 passed 16:57:39, tour capture started 16:57:39.
- before: tour capture 49 shots, 0 skipped (16:57:39-16:59:18). Running the capture spec next.
