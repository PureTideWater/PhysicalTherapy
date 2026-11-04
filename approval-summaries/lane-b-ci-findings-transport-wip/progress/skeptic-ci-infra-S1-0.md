# Skeptic 1 of 3, ci-infra finding S1 (per-try rm -rf not held by a test; fakeGh overwrites where gh refuses)

Checked at origin/co-001/wip-ci-findings-transport 1322c7cf… (newer than b9a83bd3…), fresh clone /home/user/sk-cft-ci-infra-S1-0 (removed).

## Reproduction
- gh v2.89.0 source (internal/zip/zip.go extractZipFile): os.OpenFile(dest, O_WRONLY|O_CREATE|O_EXCL). pkg/cmd/run/download/http.go downloads to a temp zip first and extracts afterwards; download.go has no existence check on the -D dir. So a file left by a failed extraction (CRC "zip: checksum error" raised by io.Copy after the file is created, or a kill during extraction) makes every later try fail "file exists". Installed gh is 2.89.0.
- notify's real script (YAML-extracted), with a fake gh that models O_EXCL and one partial-then-fail try (logs/sk1-excl.log):
  as written: 2 tries, issue create --title Finding 1; rm -rf removed: 3 tries, 2 "file exists", issue create --title Content calendar check failing.
- Tests: no assertion in tools/test/workflows.test.ts names rm -rf "$RUNNER_TEMP/findings"; downloadBlock only holds notify and handoff equal (deleting from both passes); fakeGh's fail and stall modes write nothing, its success path is mkdir -p; cp (overwrites); each runNotify gets a fresh RUNNER_TEMP. So W1 cannot go red. (Did not rerun vitest: the mutation's survival follows from the fake by reading.)

## Verdict
Not refuted. Real, reachable on a rare path (failed extraction then retry); the guard is present and correct, the gap is coverage. Severity: should.
Fix: fakeGh refuses with gh's message and exit 1 when $dest/findings.json exists (no overwrite); a "partial" mode writing a truncated findings.json then exiting 1; notify and handoff cases (partial=1) expecting 2 tries and the finding filed / handoff exit 0, so deleting the line from both jobs goes red. Workflow unchanged.
