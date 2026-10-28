# PR #74 after-the-fix-round shots (progress)
Started 2026-10-27 ~21:3x. No earlier shots-fixed.md: fresh start.
Head: a57fbf5d… (/home/user/ux-forms, 'Forms: the fix verifiers' follow-ups', the polish commit; not pushed).
TOUR_DIR: scratchpad/screens-fixed. TOUR_ONLY: shots-work/tour-only.txt (153 ids) + uploads page 390/1280 if the tour takes it.
## Steps
- branch ux-forms-shots (local only, /home/user/PhysicalTherapy) -> a57fbf5d… at 21:31:54. DELETE when done.
- TOUR_ONLY file: shots-work/tour-only-fixed.txt = the 153 ids + p.uploads.default.{1280,1280-dark,390} (the tour takes p.uploads.default as pricing-manager on LAYOUT; dark added per the sample rule) = 156 ids
- setup.sh OK at 21:32:32: /home/user/screens at a57fbf5d (TOUR_REF=ux-forms-shots), pnpm install up to date. TOUR_DIR=scratchpad/screens-fixed. Spec = claude/build-ops 223c257 copy (newer than the after run's: download-refusal and header-slot helpers, both sides of their PRs).
- next: build.sh (TOUR_MINUTES=45, under the lock) + run.sh with TOUR_ONLY=$(cat shots-work/tour-only-fixed.txt), both in background.
- build.sh (bg b9ocz8kqp) + run.sh (bg bl3y533l6) started 21:32:44; logs screens-fixed/build.log, serve.log, run.log, populate.log, capture.log, progress.log
- post script ready: shots-work/post-fixed.sh (tile.py with sample prefixes + p.uploads.default.; convert.py + build.py into scratchpad/gallery-fixed, title 'PR #74 forms, after the fix round', lede names a57fbf5). Run under the lock after the stop.
- lock acquired 21:32:42; build done 21:34:05; server ready 21:34:41; populate start 21:34:42
- populate 11 passed (3.5 min, exit 0 at 21:38:12); capture started
- capture exit 0 at 21:43:14 (5.0 min): 156 shots, 0 skipped; RECORDS 46 found, none missing; VIEWPORT fixes on 5 shots at 390 (at the top after scrollIntoView); feature_flag count 0. uploads 1280/1280-dark/390 taken (390 is 534 px wide: the receipts table).
- stop: server stopped 21:43:40 (lock held 21:32:42-21:43:40, ~11 min), fuser 3297 empty; tp_e2e_screens dropped; /tmp/tp-e2e-tp_e2e_screens-* removed (tp_e2e_uxforms pre-existed, left alone). RUN DONE. next: post-fixed.sh under the lock
- post-fixed.sh OK: 156 shots -> 431 tiles (screens-fixed/tiles/index.json); WebP 10.4 MB, 1 scaled (console.compliance.error.390); pub1280 104 shots, pub390 52; titles 'PR #74 forms, after the fix round, <w> px'; no placeholders left.
- gallery render check (Chromium under the lock, shots-work/galcheck/check-runs.cjs <S> fixed): 1280 104 cards, 390 52 cards, 0 broken, 0 errors, verdict filter hidden.
- branch ux-forms-shots DELETED at 21:47:41. /home/user/screens left detached at a57fbf5d (clean).
## Outputs
- PNGs: scratchpad/screens-fixed/png (shots.json: 156 shots, 0 skipped)
- tiles: scratchpad/screens-fixed/tiles (index.json: 156 ids, 431 tiles)
- galleries: scratchpad/gallery-fixed/gallery/pub1280 (104), pub390 (52); not published.
ALL STEPS DONE; remaining: final return.
