# Skeptic 2 of 3, ci-infra S1 (the per-try clearing of the findings directory is untested; fakeGh overwrites)

Clone /home/user/sk-cft-ci-infra-S1-1 at origin/co-001/wip-ci-findings-transport = 1322c7cf... (moved on from b9a83bd3...; the download blocks and fakeGh are unchanged in substance). Read only; clone removed after.

## Reproduction
- gh 2.89.0 source (cli/cli v2.89.0): internal/zip/zip.go extractZipFile opens each file with os.O_WRONLY|O_CREATE|O_EXCL; pkg/cmd/run/download/http.go downloads the zip whole into a temp file, then extracts into -D. So an existing findings.json in the destination makes gh fail ("file exists"). The local gh is 2.89.0.
- When a try can leave a partial file: only if extraction fails part-way (a CRC or decompression error on a body corrupted in transit, a full disk, or timeout killing gh during the extraction itself). A truncated download fails earlier, at zip.NewReader, before anything is written. The window is narrow but real, and the line in the workflow is what covers it.
- fakeGh (tools/test/workflows.test.ts:1256) does mkdir -p and cp, which overwrites; it never leaves a file behind on a failed try. No test names the clearing line (grep over tools/: none).
- Mutation W1 (both clearing lines removed from content-calendar.yml by a script): `vitest run --project unit tools/test/workflows.test.ts -t content-calendar`: base 12 passed; W1 12 passed, 0 failed. Logs: scratchpad cft/logs/sk-s1-1-base.log, sk-s1-1-W1.log.

## Verdict
Not refuted. Severity: should (the workflow is correct today; a covered retry path no test holds, and a fake that differs from real gh on exactly that path).
Fix: fakeGh refuses with "open <dest>/findings.json: file exists" and exit 1 when the file is already there (as gh 2.89 does); a fail mode that writes a partial findings.json into $dest before exiting 1; notify and handoff cases (one partial-then-fail try, then success) expecting the finding filed / the list read after 2 tries. W1 then fails in both jobs.
