# PR #85 (co-001/ux-payer-response): before shots (base 83d71fd6)

Started 2026-11-01. Head of the PR's own work 29dded52 (merge-base 165c599). TOUR_DIR=/home/user/screens85-before.

## Sample (each at .1280, .390 and .1280-dark)
- design 6.2: p.submissions.default, p.submissions.error, p.submissions.notice, p.submissions.letter-scanning (new),
  p.submissions.empty, p.submissions.attestation-waiting, p.submissions.loading, p.case.write-off-open, p.case.error,
  p.abstraction.default, p.contracts.default, p.uploads.default
- the shared uploader (components/uploads/uploader.tsx: Uploads, Contracts, Reconciliation): p.reconciliation.default
  (Uploads and Contracts defaults already in)
- UX-035 screens: p.case.write-off-open, p.submissions.default, p.submissions.notice (in)
- UX-007 screens: + p.uploads.era-format (the rest in)

## Steps
- [x] spec edits (tour.spec.ts): LETTER_IN_RESPONSE (response-letter.tsx exists in /home/user/screens); p.submissions.error
  act scoped to the 'Log a payer response' region, chooses 'Payer’s letter' index 1 when the field is there, then
  Partially accepted, and throws if any select[required] is still '' before the press; new cap
  p.submissions.letter-scanning after the notice (head only; each width uploads its own bytes; notReached letter-chosen
  and no-letter); at the base the three letter-scanning ids are skipped with the reason; p.abstraction.default's note
  by ref.
- [x] route-map edits: submissions (error, empty, interactions, notes), abstraction, case, contracts.
- [x] setup.sh, build, run
- [x] stop, cleanup, tiles, check
- [ ] commit and push

## Run log
- 2026-11-01T17:04:47Z: setup.sh at 83d71fd6 ok (/home/user/screens). TOUR_ONLY = the 42 ids above (/tmp/tour85-only.txt).
  build.sh (TOUR_MINUTES=40) under the lock and run.sh started in the background.
- First run.sh exited at once ("SERVER NOT READY"): it started before build.sh had the lock (another session's
  typecheck/vitest held it) and so before server.pid. Re-run after server.pid appeared.
- Lock 17:05:17 to 17:15:45 (build 4.2 min, prepare 0.8 min, populate 11 passed 17:10:22-17:14:03, capture 1.2 min).
- Result: 39 shots, 3 skips (p.submissions.letter-scanning.{1280,390,1280-dark}: not at this ref, by design). No failure.
- server stopped (build.log), fuser 3297/tcp empty, tp_e2e_screens dropped, /tmp/tp-e2e-tp_e2e_screens-* removed.
- tile.py: 39 shots, 107 tiles in /home/user/screens85-before/tiles.
- Checked tiles: p.submissions.error.1280 (Not done on the amount; Document pre-chosen), p.case.write-off-open.1280
  (Reason on Window passed, window to 2036-04-05), p.submissions.notice.1280-dark, p.submissions.loading.390,
  p.abstraction.default.1280 (payer letter awaiting abstraction), p.uploads.era-format.390, p.reconciliation.default.1280,
  p.submissions.attestation-waiting.1280: each shows its state; no sign-in or error page. No retake needed.

## Folders
- TOUR_DIR /home/user/screens85-before (png/, shots.json, progress.log); tiles /home/user/screens85-before/tiles
