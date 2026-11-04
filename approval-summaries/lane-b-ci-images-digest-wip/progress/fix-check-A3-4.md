# Fix check round 4, area A3 (D5/D7, D6, D9, D10; repair-3 A3.1, A3.2a, A3.2b)
Started 2026-11-04. Live heads (ls-remote): wip 2648ccf0... (= repair report), PR 83167b8f..., claude/build-platform 4846f043....
## Checks
- Clone /home/user/fx-imgdigest-A3-4 at 2648ccf0... (= origin wip); install ok. Area commits: 0b720a92+2648ccf0 (A3.1 options), 09351c17 (A3.2a), b3196a08 (A3.2b); 6eec71ce/3ec9349c docs touch. Harness scratchpad imgdigest/a34/mut.sh, logs A3-4-<m>.log.
- Regex probe (node, SETS_ENV/NAMES_BUILD as at head): refuse -e, --env, --env=, --env-file(=), -ie, -te, -eX=1, tab; admit --cpus, --entrypoint, --label env=1, --label=-e, -w, --hostname e. Admit quoted flags: "-e" FOO=1, '-e' FOO=1, "--env" "DOCKER_BUILD"_SUMMARY=false (runner joins options into docker create's argument string, which .NET splits stripping quotes: NIT).
- Batch 1 (container/service options, CI_TREE copies) running: m1opt red, c1e red so far.
