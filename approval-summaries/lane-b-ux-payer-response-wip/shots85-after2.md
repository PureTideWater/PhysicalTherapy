# PR #85 after2 shots (after fix rounds 1-2)

Started 2026-11-01T20:07Z. TOUR_REF = worktree local HEAD cf6d0f42a25e93d250718076f4169ebc36b0d182 (reachable: shared
object store). TOUR_DIR=/home/user/screens85-after2. Galleries /home/user/gallery85/after2-{1280,390,1280-dark}.
Note: the worktree holds fix pass 3's uncommitted edits (pay-fix3.md, in progress at 19:59Z); they are NOT in this ref.

## Steps
- [x] pull build-ops (ff)
- [ ] check spec vs head (Received on empty+required, letter grouping, uploads-paused title)
- [ ] spec edits, commit + push build-ops (if needed)
- [ ] setup + build + run (TOUR_ONLY)
- [ ] cleanup (fuser, DB, tmp)
- [ ] tiles, read
- [ ] galleries

## Log
- 2026-11-01T20:07:18Z: setup.sh at cf6d0f42 ok; build.sh started (TOUR_MINUTES=40). TOUR_ONLY in scratchpad tour-only.txt = 45 listed ids (response-form ids and bare p.submissions.uploads-paused are not tour ids) + p.submissions.*, p.contracts.*, p.case.*. Spec needs no edit (error step fills Received on if empty; unchosen steps use noValidate).
- 20:08:42 server up (build ok, fresh prepare); populate started 20:08:45.
- Run 1 done: lock 20:07:xx-20:15:01 (build, fresh prepare, populate 11 passed 20:08:45-20:11:25, capture 20:11:25-20:14:49). 79 shots, 38 skips. server stopped, fuser empty, DB dropped, tmp removed. FAILED p.submissions.error.* (refused() not visible): Received on now has min = submission date, the spec's fixed 2026-10-01 is below it so the browser stopped the press. Spec fixed (fill the field's own min). Next: retake p.submissions.error.* via reserve.sh fresh prepare, then commit+push spec.
- Retake: lock 20:15:26-20:19:03 (re-serve of the cf6d0f42 build, fresh prepare, populate, capture). p.submissions.error.{1280,1280-dark,390} taken. shots.json 82 shots / 35 skips. server stopped, fuser empty, DB dropped, tmp removed. Tiles re-cut whole.
- Spec fix committed 48fe70ae, merged upstream a2d62189 (10871e99; auto-merge, syntax ok), pushed a2d62189..10871e99 through the hook. Next: galleries.
- Galleries built (not published) with /tmp/gallery85.py after2: /home/user/gallery85/after2-1280 (32 shots),
  after2-390 (35), after2-1280-dark (15), each gallery/pub{1280|390}/index.html; none scaled.
- Tiles read: submissions default, error, error-unchosen-response (Response, Payer's letter, Received on refused),
  letter-list (group "Letters of this case's earlier responses"), uploads-paused 1280; contracts uploads-paused 390. Fine.
- DONE. /home/user/screens85-after2: 82 shots, 35 skips; tiles/ 245 tiles.
  Not captured: p.submissions.response-form(.390) and bare p.submissions.uploads-paused are not tour ids (the form is in
  p.submissions.default.*; uploads-paused taken at 1280/390/1280-dark). Skips by design: letter states after intake (x18),
  no-letter x3, case error-window-passed x3, write-off-unknown-window x3, struck-lines x2, contracts no-kind/held-ready x6.
  Fix pass 3's uncommitted worktree edits (hint reword, contracts h3, 'Uploads are stopped') are not in cf6d0f42.
