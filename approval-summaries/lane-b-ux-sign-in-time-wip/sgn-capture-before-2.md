# sgn-capture-before-2 progress
started 2026-11-01 20:24; read sgn-capture-after.md.
- pull ops: ok, HEAD 10871e99 (contains a2d62189). ready check ok, lock free, port 3297 free.
- rm -rf screens-before-2; setup.sh (TOUR_REF=bce57f16, TOUR_DIR exported): exit 0 "ready at bce57f16"
- next: build.sh bg under flock TOUR_MINUTES=60, then run.sh once server.pid exists
- 20:25 build.sh started bg (server.pid 13366, task bcgk3h9d5); run.sh started bg > run.log. If interrupted: touch screens-before-2/stop, check fuser 3297, clean up (step 6).
## attempt 3 (20:26)
- found previous bg build/run dead (no node procs; build.log stops at "preparing tp_e2e_screens 20:25:25"). ops pulled: ceabc9a2 (contains a2d62189). Cleaning up, then redo from rm -rf + setup.sh.
- 20:2x attempt3: setup.sh exit 0 ready at bce57f16; build.sh bg under flock TOUR_MINUTES=60; server.pid 14495; starting run.sh bg
- run.sh bg started (task bfzwowq7q), build task b6i3ctnrt. If interrupted: touch stop, fuser 3297, step 6 cleanup.
- 20:32 run.sh exit 0: populate 11 passed; capture 7 passed; 48 shots 33 skipped. touching stop.
- 20:3x stop; build.log 'server stopped'; fuser empty; DB dropped; tmp dirs removed; tiled. DONE
