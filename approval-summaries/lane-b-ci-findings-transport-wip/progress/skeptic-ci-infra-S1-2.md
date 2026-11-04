# Skeptic 3 of 3, ci-infra S1 (per-try rm -rf unpinned; fakeGh overwrites where gh refuses)

Clone /home/user/sk-cft-ci-infra-S1-2 at origin/co-001/wip-ci-findings-transport = 1322c7cf… (read only; removed after).

## Reproduction
- gh 2.89.0 source (raw.githubusercontent.com, tag v2.89.0): internal/zip/zip.go extractZipFile opens each file
  O_WRONLY|O_CREATE|O_EXCL; pkg/cmd/run/download/http.go downloads the zip to a temp file and then ExtractZip into
  -D. So a leftover file is reachable only when a try fails during extraction (timeout -k kill mid-write, a zip
  checksum error raised after the bytes are written, a write error), rare but real.
- Notify's and handoff's real scripts (parsed from the workflow) run under a fake gh modelling O_EXCL whose first
  try writes 5 bytes then fails "zip: checksum error" (logs/sk-S1-2-excl.log):
  - as written: notify 2 tries, issue create --title Finding 1; handoff 2 tries, exit 0, reads 1 findings.
  - rm -rf line removed: notify 3 tries (two "file exists"), "Content calendar check failing"; handoff 3 tries, exit 1.
- Tests: tools/test/workflows.test.ts has no assertion on `rm -rf "$RUNNER_TEMP/findings"`; downloadBlock equality
  holds if the line is removed from both jobs; fakeGh does mkdir -p; cp (overwrites) and no failure mode leaves a file.
  So mutation W1 survives (confirmed statically; vitest not rerun).

## Verdict
Not refuted. Severity should (test gap on the item's own retry guard; production code is correct today).
Fix: fakeGh refuses an existing $dest/findings.json with gh's "file exists" message, exit 1; a fake/partial mode
writes a truncated file then fails; notify and handoff cases with one partial try expect 2 tries and the finding
filed / read; optionally the stall mode writes a partial file before sleeping so the timeout cases cover it too.
