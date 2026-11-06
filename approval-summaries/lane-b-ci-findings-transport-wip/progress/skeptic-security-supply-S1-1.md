# Skeptic 2 of 3, security-supply S1 (download size refusal untested)

Clone /home/user/sk-cft-security-supply-S1-1 at origin/co-001/wip-ci-findings-transport (1322c7cf...), read only; removed after.

## Reproduction
- The only over-bound fixtures in tools/test/workflows.test.ts (notify case, handoff loop) are one finding with a 200-byte body and MAX_FILE_BYTES=100. head -c 101 cuts that into invalid JSON, so the jq gate fails whether or not the wc line is there. No static assertion names the wc line or the head -c read.
- I took the two run blocks from content-calendar.yml (notify and handoff), made a no-bound copy of each (wc line deleted), and ran them with a fake gh and MAX_FILE_BYTES=100:
  - padded (a one-finding list plus 200 spaces, 237 bytes): handoff exit 1 / no-bound exit 0; notify "Content calendar check failing" / no-bound "Finding 1".
  - the test's fixture (236 bytes): exit 1 / check failing both ways, so it cannot tell them apart.
- cp in place of head -c changes nothing anyone can see (the wc line still refuses), so only a static assertion catches it.
- Scratch: /tmp/claude-0/-home-user-PhysicalTherapy/84980be8-4825-5e0c-971b-13455480b76c/scratchpad/cft/sk2s1

## Verdict
Not refuted. Real test-coverage gap: the test title says the step refuses a file over MAX_FILE_BYTES, but no test fails if that refusal goes. Severity: should. The check's findingsJson already bounds what it writes, so this is defense in depth with no live exploit.
Fix: as the finding says. Add the padded valid-list case to both the notify case and the handoff loop. Add a static assertion that the download block reads $RUNNER_TEMP/findings/findings.json only through the head -c "$((MAX_FILE_BYTES + 1))" line, and that the wc -le line follows it.
