# ci-findings-transport: adversarial review, CI and test infrastructure

Reviewed 2026-11-04 (UTC) on a fresh clone at WIP head 1322c7cf… (= origin/co-001/wip-ci-findings-transport), base
claude/build-platform 30871f72… (merge-base = base). Change: `git diff 30871f72… 1322c7cf…`, 13 files, +681 -212.
Install with `--frozen-lockfile` under the lock, exit 0. Logs: scratchpad `cft/logs/rv-ci-*.log`; mutation driver and
per-mutation logs: scratchpad `cft/rvci/` (`mutate.py`, `results.jsonl`, `<mutation>.log`).

Verdict: nothing blocking. The transport delivers every finding or ends in "Content calendar check failing" in every
scenario I ran. Two lines that matter to that guarantee, the per-try `rm -rf` and the pause between tries, are not held
by any test: delete either one and the suite stays green (S1, S2). Two nits.

## Findings

### S1 (should): no test holds the per-try `rm -rf "$RUNNER_TEMP/findings"`, and the retry depends on it, because the fake gh overwrites where the real gh refuses
- **Where:** `.github/workflows/content-calendar.yml` handoff and notify download blocks (`rm -rf "$RUNNER_TEMP/findings"`);
  `tools/test/workflows.test.ts` `fakeGh` (`mkdir -p "$dest"; cp …`).
- **Scenario:** gh 2.89.0 writes the zip to a temp file, then extracts it with `os.OpenFile(…, O_WRONLY|O_CREATE|O_EXCL)`
  (`internal/zip/zip.go`, `extractZipFile`). Suppose a try leaves `findings.json` behind and then fails, for example
  a CRC error at the end of `io.Copy`, or `timeout` killing gh during extraction. Without the `rm -rf`, every later try
  fails with "file exists", so a failure that a retry would have recovered becomes "check failing".
- **Evidence:**
  - Scenario run with a fake gh that models O_EXCL (try 1 leaves 10 bytes and a checksum error), on notify's real
    script extracted from the YAML (`logs/rv-ci-excl.log`). As written: 2 downloads, then `issue create --title Finding 1`.
    With the `rm -rf` line removed: 3 downloads, two of them `open $RUNNER_TEMP/findings/findings.json: file exists`,
    then `issue create --title Content calendar check failing`.
  - Mutation W1, the line deleted from both jobs: `tools/test/workflows.test.ts` and `tools/content-calendar`, run with
    `-t 'content-calendar|one environment string|job timeouts'`, 20 passed, 0 failed (`rvci/W1-no-rm-rf.log`).
    The fake gh's `cp` overwrites the leftover file, so the line is never exercised.
- **Fix:** make `fakeGh` behave like gh 2.89's extraction: refuse when `$dest/findings.json` already exists (print
  gh's "file exists" message and exit 1). Add a mode in which a try writes a partial file and then fails. Then add a
  notify case and a handoff case, "a failed try's partial file is cleared before the next try", expecting one
  `issue create --title Finding 1` after 2 tries. W1 then goes red. Cite gh's `O_EXCL` in the fake's comment.

### S2 (should): no test holds the pause between tries; deleting the `sleep` leaves the suite green
- **Where:** both download blocks (`if [ "$try" -lt 3 ]; then sleep "$DOWNLOAD_PAUSE"; fi`); `runNotify` forces
  `DOWNLOAD_PAUSE: '0'` after notifyEnv's values.
- **Scenario:** the design's resilience to a brief artifact-service error is "three tries 10 s apart" (ADR 0071
  Amendment, the step's comment, ci.md). Delete the sleep and the three tries happen back to back within about a
  second, so one 5xx blip lasting a few seconds becomes "check failing". The test checks that
  `env.DOWNLOAD_PAUSE` is `'10'`, but no case checks that the script ever sleeps for it.
- **Evidence:** mutation W2, the sleep line deleted from both jobs: 20 passed, 0 failed (`rvci/W2-no-pause.log`).
- **Fix:** put a stub `sleep` on the fake's PATH that logs its argument and then runs `/bin/sleep "$@"`, so the
  stall cases keep working. Let `runNotify` take the pause from the case, with 0 as the default. In the
  "two failed tries" and "three failed tries" cases, expect the log to hold `sleep <pause>` exactly twice, between the
  tries and not after the last one.

### N1 (nit): no notify or handoff case checks a file of exactly MAX_FILE_BYTES, so an off-by-one in the comparison passes
- **Where:** `[ "$(wc -c < findings.json)" -le "$MAX_FILE_BYTES" ]` in both blocks.
- **Scenario:** with `-le` changed to `-lt`, notify refuses a file of exactly 2,000,000 bytes, which `findingsJson`
  accepts (content-calendar.test.ts checks `MAX_FILE_BYTES - empty` as accepted). The check would pass and notify would
  file "check failing".
- **Evidence:** mutation W3, `-le` changed to `-lt` in both jobs: 20 passed, 0 failed (`rvci/W3-bound-lt.log`). The only
  over-bound case uses `MAX_FILE_BYTES: '100'` with a file of about 220 bytes.
- **Fix:** with `MAX_FILE_BYTES: '100'`, run notify and handoff on a 100-byte list (expect it filed or read) and on a
  101-byte list (expect "check failing" or exit 1). This is the same at-the-bound pair content-calendar.test.ts
  already uses for findingsJson.
- Related and sound: deleting `head -c "$((MAX_FILE_BYTES + 1))"` (mutation W13) also survives, but nothing
  observable changes because the `wc` check still refuses the file. The `head` only avoids copying an oversized file.
  No action needed.

### N2 (nit): after a failed download, the "check failing" body says "(the check: success)", and handoff's log lines name the notify job
- **Scenario:** after three failed downloads, or notify re-run after the 1-day artifact has expired, the issue body
  reads "The content calendar check did not hand on its findings (the check: success)". The reader sees a failure
  issue that reports the check as successful, and nothing in the body says the download is what failed. gh's error
  appears only in the run log. Handoff prints "the notify job reads …" / "the notify job could not read …".
- **Evidence:** the body.md from the O_EXCL scenario run above:
  `The content calendar check did not hand on its findings (the check: success) on b at s: u`. The handoff strings
  are in the workflow at lines 118 and 121, and the handoff test asserts them.
- **Fix (optional):** when `CHECK_RESULT` is success, say "the notify job could not download or read this run's
  findings artifact" and point to the run log. Content-updates' "Check failing" row already lists this cause. In
  handoff, say "this run's findings read as …", and update the two asserted strings to match.

## What I checked and found sound
- **gh semantics (gh 2.89.0 source, read only):**
  - Expired artifacts are skipped, so an expired artifact ends in "no valid artifacts found to download" with exit 1,
    and a name with no match ends in "no artifact matches …" with exit 1. Both are retried and then become "check failing".
  - With one `-n`, gh extracts straight into `-D`, so `$RUNNER_TEMP/findings/findings.json` is the right path.
  - The zip is written to a temp file before extraction, and archive/zip checks the CRC, so a gh exit 0 means a whole file.
  - The artifact list is paginated.
  - The upload pin's `archive` input defaults to true (action.yml at cf430e03…), so the artifact holds `findings.json`
    at its root. A change to `archive: false` would rename the artifact; the exact `with:` assertion catches it.
- **Run id and attempts:**
  - `$GITHUB_RUN_ID` covers every attempt of the run.
  - On a re-run, `overwrite: true` replaces the artifact.
  - If a re-run's check fails before uploading, attempt 1's artifact is never read, because the download is gated on
    `CHECK_RESULT == success` (mutation W4 removes the gate and goes red).
  - Re-running notify alone more than a day later fails closed (the expired artifact is skipped). This is documented
    in content-updates' "Check failing" row.
- **Collisions and concurrency:** artifacts belong to one run, and one name is uploaded once per attempt. Concurrency
  is unchanged. On a pull request, a cancelled or failed check skips handoff. On push, schedule and dispatch, notify
  runs `always()` and turns cancelled or failure into "check failing" (the existing S8 cases pass).
- **Time:** `timeout -k 10 60` on each try, so three tries plus two pauses take at most 230 s, inside notify's 5 minutes.
  The stall cases, run with the timeout's real behaviour, pass.
- **Bounds:**
  - 6 bytes for each escaped unit, computed over all 65,536 units.
  - 41 findings: the property test, plus the calendar schema refusing a family listed twice.
  - Each entry takes at most 39 + 6 × 6,256 = 37,575 bytes, and the worst file is 1,540,660 bytes, under 2,000,000.
  - MAX_TITLE 256 is checked at run time.
  - The "not filed" body is at most 52,120 of 65,536 characters. MAX_LISTED 200 is not reachable at 41 findings
    (at most 21 unfiled), as the ADR says.
- **Mutations that turned the suite red (they hold behaviour):**
  - W4: the check gate removed.
  - W5: retention changed to 7 days.
  - W6: handoff exits 0.
  - W8: notify without `actions: read`.
  - W9: the check step exits 0.
  - W10: no MAX_LISTED cut.
  - W11: FINDINGS_B64 put back. Five tests go red, #86's value table and the environment-string sum among them.
  - W12: a `$GITHUB_ENV` write in the check. #86's closed map refuses it.
  - W14: a weaker jq shape check.
  - W15: the upload made `if: always()`.
  - W16: no `overwrite`.
  - Tool code: T1, no title check. T2, the summary written after the bound. T3, MAX_FILE_BYTES set below the worst
    file. T4, no surrogate trim. T5, the `maxBytes` argument ignored.
- **#86's value rule** holds the new workflow: content-calendar declares no outputs, has no FINDINGS_B64 and no file
  command, and no row is exempt. W11 and W12 confirm the rule is live and not merely satisfied by an absence.
- **Tooling:** actionlint 1.7.7 reports nothing on content-calendar.yml (shellcheck off, the 26.04 label ignored).
  Baseline: 3 files, 177/177 passed (`logs/rv-ci-baseline.log`). The notify cases spawn real bash with a 45 s per-case
  limit, and none came near it here.
- **Docs and code agree:**
  - ADR 0066 N32 says there is no exception and that the findings travel as an artifact.
  - ADR 0071's Amendment gives the numbers, the tries and the timeout as the code has them.
  - ci.md's handoff and notify rows and both value-rule passages, and content-updates' rows, also match the code.
  - The `<merge date, UTC>` placeholders are planned (design §11 step 7, with a grep that must print nothing before
    the merge).
