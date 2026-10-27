# dlr-capture-before progress (UX PR 5, co-001/ux-download-refusals, BEFORE screenshots, base e908c21)

## Status
- [ ] read README + design
- [ ] spec edits
- [ ] commit/push build-ops
- [ ] before run
- [ ] tiles

## Commands and results
- 14:3xZ read README (whole), design §1 §3 §6, tour.spec.ts (cap/snap/attempt/coverage/packet/reports sections), route map entries. Lock free, PG18 up, /opt/pw-browsers ok. /home/user/screens absent (setup.sh will create). /home/user/ops is shared with another session (HEAD moved 6eee1580 -> 886a707c while reading): commit only my files.
- Findings for spec: e2e reports.spec.ts:225 forbidden CSV persona = reports-viewer (RP report /csv -> 403). Packet PDF needs phi.export: other-admin (practice_admin) forbidden (and also denied the packet page). ROI CSV needs report.read (viewer has it) -> only internal CS forbidden; not added. LAYOUT has payer N (no contract) + payer Q with contract (route map) -> letter-contract reachable.
- Plan: edit error-letter-codes (noValidate, either URL, dark), add p.coverage error-letter-contract, error-letter-payer (URL), p.report refused-forbidden (reports-viewer), p.packet refused-forbidden (other-admin PDF), p.packet refused-not-found (packet-approver, NO_UUID version PDF). Route map: README requires entries only for new routes -> no change.
- Spec edits made (uncommitted yet) in /home/user/ops/tools/lane-b-screen-tour/capture/tour.spec.ts: helpers downloadRefusal(), LETTER_FORM, sendLetter() after refused(); error-letter-codes (noValidate, either URL, dark, note); new p.coverage error-letter-contract (DB pre-check -> notReached), error-letter-payer (URL NO_UUID payer); p.report refused-forbidden (reports-viewer /csv); p.packet refused-forbidden (other-admin /pdf), refused-not-found (packet-approver NO_UUID /pdf). All new with dark: true.
- Next: setup.sh (bg, TOUR_REF=e908c21) then tsc check of spec, commit+push, cp spec, build, serve, run.
- CMD TOUR_DIR=.../screens-before TOUR_REF=e908c21 bash tools/lane-b-screen-tour/setup.sh (bg) -> exit 0, ready at e908c214, install 9.7s
- CMD tsc -p scratchpad/tsc-check/tsconfig.json (extends /home/user/screens/tsconfig.base.json, strict) on the spec -> exit 0 (before and after merge)
- COMMIT a5c50b1f (spec change) on claude/build-ops; pull --no-rebase merged upstream (another session's spec hunks: notice dark, abstraction-version model codes, contracts no-kind) -> merge 0ca9dd5b; push -> 3a094d35..0ca9dd5b ok (pre-push: gitleaks no secret)
- Copied merged specs into TOUR_DIR/capture.
- Next: build (bg, under flock), then serve + run.
- CMD (bg bx30ymwej) cd TOUR_DIR && TOUR_MINUTES=45 flock /tmp/laneb-heavy.lock bash build.sh > build.log  (started ~14:4xZ)
- CMD (bg b0ws9xou6) cd TOUR_DIR && TOUR_ONLY='p.coverage.*,p.packet.default.*,p.packet.refused-*,p.packet-review.default.*,p.upload.default.*,p.uploads.default.*,p.reports.default.*,p.report.default.*,p.report.refused-*,p.report-review.default.*,p.roi-statement.default.*,p.report-document.default.*,p.monthly.default.*,p.reconciliation.default.*,p.contracts.default.*,console.compliance.default.*' bash run.sh > run.log
- If interrupted: check TOUR_DIR/build.log, run.log, progress.log, shots.json; touch TOUR_DIR/stop when run ends; then README step 5/6.
- build: lock acquired 14:35:53, build done 14:37:37, server ready 14:38:07; populate running
- capture started 14:41:03; populate 11 passed (2.9m); RECORDS 46 found, grants SYN-TOUR-1..4 made
- capture exit 0 at 14:43:33: 70 shots, 2 skipped (p.coverage.refused-and-unconfirmed.1280/.390, existing notReached); letter pair: payer N with a contract of payer Q
- touched stop at 14:44:24
- server stopped 14:44:25 (build.log), build.sh bg exit 0; fuser 3297/tcp empty; lock was then taken at 14:44:25 by the builders' tsc (pid 10158, /home/user/ux-download-refusals), not by this run.
- cleanup: DROP DATABASE tp_e2e_screens -> DROP DATABASE; rm -rf /tmp/tp-e2e-tp_e2e_screens-* -> none left
- Found tile.py fault: step by image width (<=500 -> 844) tiles 390 shots wider than 500 px (contracts 664, report 502, roi 502, uploads 534, report-document 539, report-review 506, JSON 980) at 800, README says 844 at 390. Fixing to use the shot's viewport width. /opt/py312-ci python3 has no PIL; /usr/bin/python3 has PIL 12.3.0.
- tile.py: 70 shots tiled into 246 tiles at TOUR_DIR/tiles/index.json (/usr/bin/python3 -I, fixed tile.py)
- COMMIT af2f6ec8 (tile.py + README) ; pull merged; push a914619d..8234bd0e ok (gitleaks no secret)
- DONE. Return: 70 shots, 2 skips (pre-existing notReached), tiles index TOUR_DIR/tiles/index.json, spec commit a5c50b1f (merged in 0ca9dd5b).
