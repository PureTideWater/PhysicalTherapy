# UX PR 4b fix round (PR #131)
Worktree /home/user/ux-screening-result-words, branch co-001/ux-screening-result-words. Origin head 03ec41f5 (task names c2725961; 03ec41f5 = c2725961 + "#121"->"PR 121" comment/test titles). Base 31a7345f.
Started 2026-11-07 (fresh; no earlier 4b-fix.md). Tree clean at start.
## Items
- [x] 4B-UX-03: test first (result-tables.test.tsx one-group cases end at ANOMALY_RULE) red 1 -> anomalies.tsx `order` only when groups > 1 + doc comment -> green (components/screening + labels.test: 7 files 87 tests). commit e01d96bc
- [x] 4B-UX-02: ADR 0062 amendment lead cites "proposal P5 of the `co-001/ux-screening-result-tables` design"; ruling split (2026-10-28 three changes; acting Lane A 2026-11-07 four figure labels); first paragraph rewrapped at 118; labels.test.ts:47-50 comment (hash unchanged). commit 9e577017
- [x] 4B-UX-01: PR #131 description PATCHed 02:15:41Z (read back = fix4b/pr131-body-draft.md; before = fix4b/pr131-body-before.md): P5 paragraph replaced with the ruling + 3 conditions (task's text); 'What changes' count bullet says the order sentence comes with more than one group; Departures retitled with the review's rulings (line labels, $5, TBL-08 confirmed; One group overruled -> departure from design 3.4, 4B-UX-03); fix round's fast checks sentence under the Checks table. Reviewer table left for the orchestrator (status file Next 2).
- [x] checks (lock, before commits; logs scratchpad/fix4b/): typecheck 23 projects pass; eslint 3 changed files clean; lint:copy 595 files pass; vitest unit components/screening + lib/screening 13 files 156 tests pass. No import change => watched.ts --write not needed. No label string changed => no re-pin, no synth.
- [x] shots .fix: 3 taken (screening-result-harness.one-group.{1280,390}.fix, .one-group.anomalies-description-2x.1280.fix), 60 shots / 422 tiles in 4b-shots-after; description ends at the rule ($5 mono); old text at 03ec41f5 ends with the order sentence. 4b-shots-index.md: 'Fix round' section appended with per-finding statements. /home/user/screens left clean at 9e577017; port, db, tmp clean.
- [x] commits e01d96bc (4B-UX-03), 9e577017 (4B-UX-02); not pushed (origin still 03ec41f5); git status --porcelain empty. DONE.
## Shots (.fix)
- No existing after shot has one group (one-anomaly 4, no-anomaly 3, several 5, one-other 51, others 20,507: capture-measures.json), so no existing shot's state changes. New after-only harness state `one-group` (onePage([GROUPS[0]])) added to scratch 4b-capture harness + spec (backups *.pre-fix); ids screening-result-harness.one-group.{1280,390}.fix and .one-group.anomalies-description-2x.1280.fix.
- 4b-capture/fix-retake.sh: harness text at 03ec41f5 (no server) into fix4b/harness-old; then setup at 9e577017 into 4b-shots-after, build, serve, harness-fix, spec with PR131_ONLY, stop, cleanup, tile. Launched in background:
- [fix 02:13:13] harness at 03ec41f5 exit 0: {"several":{"bytes":76435,"groups":5,"pageOf":"1 of 1","others":0},"one-other":{"bytes":263442,"groups":51,"pageOf":"1 of 2","others":1},"others":{"bytes":81397,"groups":20507,"pageOf":"2 of 411","others":20457},"one-group":{"bytes":60559,"groups":1,"pageOf":"1 of 1","others":0}}
- [fix 02:13:13] setup start (ref 9e577017748fc4f91967cacaaa5c3639a190d2bf)
- [fix 02:13:33] build: lock acquired for build at 02:13:14 / build done; lock released at 02:13:33 (serve it with reserve.sh)
- [fix 02:14:03] server ready (lock acquired for re-serve at 02:13:33)
- [fix 02:14:03] harness exit 0: {"several":{"bytes":76435,"groups":5,"pageOf":"1 of 1","others":0},"one-other":{"bytes":263442,"groups":51,"pageOf":"1 of 2","others":1},"others":{"bytes":81397,"groups":20507,"pageOf":"2 of 411","others":20457},"one-group":{"bytes":60510,"groups":1,"pageOf":"1 of 1","others":0}}
- [fix 02:14:21] pr131 spec fix exit 0:  3 passed (17.1s);
- [fix 02:14:25] serve ended: server stopped at 02:14:25
- [fix 02:14:25] port 3297 free
- [fix 02:14:26] tp_e2e_screens count after drop: 0; tmp dirs left: 0
- [fix 02:14:34] tiled: 60 shots tiled into 422 tiles
- [fix 02:14:34] FIX RETAKE DONE
