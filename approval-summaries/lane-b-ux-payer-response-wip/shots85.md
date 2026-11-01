# PR #85 shots: tour sample gaps, before retake, after run, gallery

Started 2026-11-01. Base 83d71fd6, head 90ec40ab. Before dir /home/user/screens85-before (39 shots from wf_174c3c87-c25),
after dir /home/user/screens85-after. Gallery /home/user/gallery85 (not published).

## Steps
- [x] pull build-ops
- [ ] read design 6.2, spec, route map, diff
- [ ] spec + route-map edits for gaps 1-10
- [ ] commit + push build-ops
- [ ] before retake (new/changed ids only)
- [ ] after run (whole sample)
- [ ] tiles, checks, retakes
- [ ] gallery files

## Log
- Read design 6.2, spec (submissions 2486-2544, case 2312-2339, contracts 2611-2680, writes test 3390+), route map,
  head code (response-letter.tsx, uploader single mode: input not `multiple`, so the refusal uses a zip; uploadGate:
  NO_BAA or practice_run_refusal of the practice's OWN organization, so the firm's suspension gates nothing; letter
  statuses beyond scanning need the worker's intake (receipt status set by the worker)).
- Plan per gap: 1 three new error-unchosen ids (press only where a required select is empty, so the base, whose selects
  start on a choice, is shot as it starts and nothing is written); 2 notReached window-passed refusal, unknown-window
  hint by a DB query (shot if PACKETS has such a line); 3 notReached x4 (+ existing letter-chosen); 4 zip refused,
  noUploadRequest guard; 5 select size; 6 no-letter by DB query over the other practices, paused via 9; 7 kind select
  payer_letter, guard; 8 p.contracts.packets; 9 PACKETS' own organization suspended in the writes test, shot on
  submissions/contracts/reconciliation, reinstated in finally; 10 notice=recorded.
- Spec edits done (uncommitted in /home/user/ops until the runs pass): sendEmptyChoices + notReachedAll helpers;
  p.case.error-unchosen, p.case.error-window-passed (notReached), p.case.write-off-unknown-window (DB check);
  p.submissions.error-unchosen-response, .error-unchosen-channel, .letter-list, .notice (now ?notice=recorded),
  .letter-refused (head), notReachedAll letter-chosen/-uploaded-here/-duplicate-chosen/-duplicate-other-case/
  -duplicate-unusable/-held, .no-letter (DB search); p.contracts.kind-letter, .packets; writes test:
  p.{submissions,contracts,reconciliation}.uploads-paused (PACKETS' org suspended, reinstated in finally).
  Route map: submissions, case, contracts, reconciliation entries amended. esbuild syntax check ok.
- Before retake plan: reuse the 83d71fd6 build (BUILD_ID 17:09) with reserve.sh, fresh prepare, populate, TOUR_ONLY
  = new/changed ids (/tmp/tour85-before-retake.txt).
- 2026-11-01T17:39:32Z: before retake started (/tmp/tour85-run-before.sh: reserve.sh TOUR_MINUTES=30, run.sh TOUR_ONLY 60 ids, logs run-retake.out, serve.log)
- Before retake done: lock 17:39:36-17:43:25 (re-serve of the 17:09 build at 83d71fd6, fresh prepare, populate 11
  passed 17:40:07-17:42:28, capture 53 s). 30 shots taken, shots.json 66 shots / 33 skips. No failure.
  Skips: p.case.error-window-passed.* and p.case.write-off-unknown-window.* (0 lines with an unknown window),
  p.submissions.no-letter.* (no practice but PACKETS has a case with a submission), the 8 head-only letter variants
  (not at this ref). Base notes: write-off, response and submission forms start on a choice, so not pressed (logged NOTE).
  PACKETS' org suspended 17:43:09, reinstated 17:43:22. serve.log "server stopped", fuser empty, DB dropped, tmp removed.
- 2026-11-01T17:43:59Z: after run started (setup.sh at 90ec40ab confirmed; build.sh TOUR_MINUTES=40; TOUR_ONLY = /tmp/tour85-after.txt, 99 ids: the before's 42 + the 60 gap ids less duplicates of p.submissions.notice)
- Before tiles: tile.py with the six route prefixes: 66 shots, 195 tiles in /home/user/screens85-before/tiles. Read:
  p.submissions.notice.1280 (recorded notice), p.submissions.letter-list.1280 (Document as a list box, one letter),
  p.contracts.packets.1280 (the PACKETS payer letter listed to tag), p.contracts.kind-letter.1280 ("Payer letter"),
  p.submissions.uploads-paused.390 (page as usual: the base shows no pause on submissions). All as intended.
- After run done: TOUR_REF resolved to 90ec40ababcf98a81519ff30e5208186065b88c8 (setup.sh, /home/user/screens HEAD).
  Lock 17:44:03-17:50:14 (build 17:44:03-17:44:32, prepare, populate 11 passed 17:45:04-17:48:06, capture 2.1 min).
  72 shots, 27 skips (= 99 ids). Skips: error-window-passed x3, write-off-unknown-window x3, no-letter x3, and the
  six letter states after intake x3 (worker). No failure. build.log "server stopped", fuser empty, DB dropped, tmp removed.
  tile.py: 72 shots, 211 tiles in /home/user/screens85-after/tiles.
- Retake needed: p.submissions.letter-list.* (both runs): the select's fixed one-row height clipped the list box (after: only 'Choose the payer’s letter' and the group label showed). Spec now sets style.height=auto. Other after tiles read and fine: error-unchosen-response/-channel, p.case.error-unchosen, letter-refused, letter-scanning, uploads-paused (submissions hint + 'Uploads are paused', contracts, reconciliation 390), contracts.packets (letter not listed), kind-letter ('Payer’s terms or policy letter').
- After letter-list retake: lock 17:51:09-17:54:17 (re-serve of the head build, fresh prepare, populate), 3 shots taken; tile shows the group 'Letters of this case’s earlier responses' and its letter. Cleanup done.
- After tiles re-cut whole (72 shots, 211 tiles). Also read: p.case.write-off-open.1280-dark (Choose the reason + withheld hint), p.submissions.notice.390/.1280 (recorded notice; log line links the letter's receipt), p.submissions.error.1280 (letter chosen, refused on the amount). Fine.
- Before letter-list retake: rebuild of 83d71fd6 (lock 17:54:42-17:58:18, build done 17:55:09), fresh prepare, populate; 3 shots; tile shows the base's flat Document list box (one letter). Cleanup done. Before tiles re-cut whole: 66 shots, 195 tiles. Next: commit + push, galleries.
- Committed ab0f4fd4 (spec, route map, this file) on claude/build-ops; merged upstream (d429abca, ed3e2f7d; no conflict, spec syntax ok); pushed 22aa8a93..ed3e2f7d through the pre-push hook (gitleaks clean). Next: galleries.
- Galleries built (not published) with /tmp/gallery85.py (filters each run's shots.json into light 1280, light 390 and
  dark 1280; convert.py + build.py, title "PR #85 payer response", the lede leads with the width label and names the
  commit): /home/user/gallery85/{before,after}-{1280,390,1280-dark}/gallery/pub{1280|390}/index.html with s/*.webp.
  Before 22 shots each, after 24 each. None scaled.
- DONE. Before: /home/user/screens85-before (66 shots, 33 skips; tiles/ 195). After: /home/user/screens85-after
  (72 shots, 27 skips; tiles/ 211).
- 2026-11-01T18:02:39Z resumed: verified ab0f4fd4 on origin/claude/build-ops, both tile folders, six gallery index.html, port 3297 free, no tp_e2e_screens DB or tmp dirs. Nothing left to do.
