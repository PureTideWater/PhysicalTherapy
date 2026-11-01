# hom-capture-before progress (UX PR 9, co-001/ux-home-figures, BEFORE, base 83d71fd)
## Status
- [x] read README, design §5 + dispositions, dlr notes
- [ ] decide spec edits (no-BAA home?)
- [ ] setup / build / run / stop / cleanup / tile
## Log
- Spec: §5 states p.home.default/tiles/empty/error-last-run-failed/support-access, p.cases/case/packet/reconciliation/roi-statement/roi default all taken by tour.spec.ts (ops HEAD 05db1da8). No-BAA home not reachable: every seeded practice (packages/db/src/seed.ts:109) and journey practice (apps/web/e2e/journeys.ts:90) gets a BAA; nothing on screen removes one -> NO spec change, noted for after run.
- Dark ids for non-default home states named in full: p.home.{tiles,empty,error-last-run-failed,support-access}.1280-dark
- Lock free, PG18 up, /home/user/screens absent at start.
- setup.sh TOUR_REF=83d71fd -> exit 0, ready at 83d71fd6 (install 4.6s)
- CMD (bg) cd TOUR_DIR && TOUR_MINUTES=45 flock /tmp/laneb-heavy.lock bash build.sh > build.log
- CMD (bg) TOUR_ONLY='p.home.*,p.home.{tiles,empty,error-last-run-failed,support-access}.1280-dark,p.cases.default.*,p.case.default.*,p.reconciliation.default.*,p.packet.default.*,p.roi-statement.default.*,p.roi.default.*' bash run.sh > run.log
- If interrupted: check TOUR_DIR build.log/run.log/progress.log; touch TOUR_DIR/stop; README step 5/6; tile.
- build: lock acquired 17:01:44
- run: populate 11 passed (2.6m) 17:03:59-17:06:35; capture 17:06:35-17:07:47 exit 0, 35 shots 0 skipped; touched stop 17:07:57
- build: build done 17:03:24, server ready 17:03:59, server stopped 17:08:01 (build.log), build.sh exit 0; fuser 3297/tcp empty. Lock then taken by builders' tsc (pid 4476, cwd /home/user/ux-home-figures/apps/worker), not ours.
- cleanup: DROP DATABASE ok; no /tmp/tp-e2e-tp_e2e_screens-* left
- tile.py (/usr/bin/python3 -I): 35 shots -> 115 tiles, TOUR_DIR/tiles/index.json
- DONE. No spec change, no push.
