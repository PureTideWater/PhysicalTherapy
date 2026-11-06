# Lane B ci-findings-transport: fix round build (progress)

Started 2026-11-04 by the fix round's build (for ACTING S3). Worktree /home/user/ci-findings-transport, WIP
`co-001/wip-ci-findings-transport` at 1322c7cf… = origin at start; clean. Live base claude/build-platform c7bed0f7… (#117) then, 35422a92… (#116) since (checked 23:32 UTC, fix-repair-1.md);
the WIP holds 30871f72…, the base is not merged in this step.
Logs: /tmp/claude-0/-home-user-PhysicalTherapy/84980be8-4825-5e0c-971b-13455480b76c/scratchpad/cft/logs/fix/

Order: ci-infra S1, ci-infra S2, ci-infra N1, security S1, critic G2, critic G1, security N1, critic G3 (proof, ops), critic G4 (records).

## Findings

### ci-infra S1 (should): the per-try clearing held: DONE a62a0fa6…
- Test only. fakeGh refuses a findings.json already in -D ("file exists", exit 1), as gh 2.89/2.103 extract with O_EXCL;
  a fake/partial mode writes a cut findings.json then fails (zip checksum error); a stall writes a cut file before it
  sleeps. runNotify takes `partials`. New cases: notify partial=1 (filed on try 2, no "file exists"); handoff partial and stalled (exit 0, 2 tries).
- Red: mutant W1 (the clearing line deleted from both jobs) with the new tests: 2 failed, 10 passed (`ci-infra-S1-red.log`).
- Green: 12/12 content-calendar cases (`ci-infra-S1-green.log`); tools/test + tools/content-calendar 23 files, 353/353 (`ci-infra-S1-after.log`); pushed (fast-forward, hook).

### ci-infra S2 (should): the pause held: DONE 086d2953…
- Test only. A `sleep` stub beside the fake gh logs "sleep <s>" and returns at once; the fake's stall uses /bin/sleep
  (unlogged); runNotify no longer forces DOWNLOAD_PAUSE 0, so the step's own 10 is used. `paced()` holds the tries and
  pauses in order for notify (over, late, down, slow, stalled, partial) and handoff (reads, retried, failure rows): a
  pause between two tries, none after the last.
- Red: W2 (pause line deleted from both jobs) 2 failed (`ci-infra-S2-red.log`); C23 (`sleep 0`) 2 failed (`ci-infra-S2-red-C23.log`).
- Green: 12/12 (`ci-infra-S2-green.log`); 23 files 353/353 (`ci-infra-S2-after.log`); pushed.

### ci-infra N1 (nit): the exact bound: DONE fb29b355…
- Test only. `listOf(bytes)` builds a one-finding list of an exact size (Buffer.byteLength checked). MAX_FILE_BYTES 100:
  notify files a 100-byte list and files "check failing" on 101 (1 try each); handoff reads 100 bytes (count, size, SHA-256) and exits 1 on 101.
- Red: W3 (`-le` to `-lt`, both jobs) 2 failed (`ci-infra-N1-red.log`); W3b (`-le "$((MAX_FILE_BYTES + 1))"`) 2 failed (`ci-infra-N1-red-plus1.log`).
- Green: 12/12 (`ci-infra-N1-green.log`); tools/test + tools/content-calendar (`ci-infra-N1-after.log`); pushed.

### security S1 (should, a skeptic rated it nit): the size refusal held: DONE 44757e39…
- Test only. PAST_BOUND: a valid one-finding list + 200 spaces, and the same + 200 x's (MAX_FILE_BYTES 100): notify files
  "check failing" on 1 try; handoff rows exit 1. Static: in the download block the only line naming
  $RUNNER_TEMP/findings/findings.json is the head -c "$((MAX_FILE_BYTES + 1))" line, the wc refusal the next line (T-H carries both to handoff).
- Red: no-bound (wc line deleted) 3 failed (`security-S1-red.log`); cp-unbounded (head -c to cat) 1 failed (`security-S1-red-cp.log`); C4 (head -c "$MAX_FILE_BYTES") 3 failed (`security-S1-red-headc.log`).
- Green: 12/12 (`security-S1-green.log`); 23 files (`security-S1-after.log`); pushed.

### critic G2 (nit): the read's fallback held: DONE 5f45db7c…
- Test only. fakeGh names the artifact's file from fake/name (runNotify `artifactFile`); an artifact holding only other.txt:
  notify files "check failing" on 1 try (exit 0); handoff exits 1 with exactly the could-not-read message.
- Red: C20 (`2>/dev/null || : > findings.json` dropped from the head line, both jobs) 3 failed: notify exits 1 on head's error, handoff's stderr is head's (`critic-G2-red.log`).
- Green: 12/12 (`critic-G2-green.log`); 23 files (`critic-G2-after.log`); pushed.

### critic G1 (should): the read check inside the held block: DONE 1bf36150…
- Workflow: in both jobs the jq read check now sets `readable` inside the block (before "# End of the download."); after it
  each job only branches on `[ "$readable" != true ]`. Test: the block holds SHAPE_CHECK; after the marker neither job has
  `jq -e` or `readable=` and its first line is the branch; handoff rows `[{title:'x'}]` and `[{title:1,body:'b'}]` exit 1.
  ADR 0071 Amendment and ci.md's handoff row: the read check is among the lines handoff shares with notify.
- Red: the new test on the 1322c7cf workflow, 1 failed ("expected [ …(21) ] to include 'if jq -e …'") (`critic-G1-red.log`);
  after the fix, C1 (handoff's check weakened to `type == "array"`) 1 failed (`critic-G1-red-C1.log`).
- Green: 12/12 (`critic-G1-green.log`); 23 files (`critic-G1-after.log`); pushed.

### security N1 (nit): no signed address in the public log: DONE 6a3c9258… (the safer option: a fixed message)
- Workflow, both jobs word for word: `code=0; timeout -k 10 "$DOWNLOAD_LIMIT" gh run download … > /dev/null 2>&1 || code=$?`;
  on a failure `content-calendar: try N of 3 to download the findings failed (exit C)` (124 when stopped), then the pause.
  ADR 0071 Amendment, ci.md (notify row), content-updates.md (Check failing) updated. Test: fakeGh prints a synthetic signed
  address (blob.example.invalid, sig=synthetic-signature) on stdout and in every error; no notify or handoff output may hold it;
  the fixed lines asserted (exit 1 on 502, exit 124 on stalls); static assertion on the download and printf lines.
- Red: the new tests on the 1322c7cf download lines, 3 failed (`security-N1-red.log`); after the fix, the redirect removed 3 failed
  (`security-N1-red-leak.log`), stderr alone kept, 3 failed (`security-N1-red-stderr.log`: "not to contain 'blob.example.invalid'").
- Green: 12/12 (`security-N1-green.log`); 23 files (`security-N1-after.log`); pushed.

### critic G3 (should): the §7 proof regenerated: DONE (ops files, no repository commit)
- New `proof/scripts/extract.mjs` (b306eeb0…c186) takes notify's and handoff's step scripts from the workflow at WIP
  6a3c9258…: `work/proposed-notify.sh` 651d4854…6f20, `work/proposed-handoff.sh` 495a4dde…e6fe. `prove.mjs` (2e035f0a…006f,
  was 23394532…34ec) runs them with a stand-in gh modelling O_EXCL, a cut file, a stall past DOWNLOAD_LIMIT (timeout,
  exit 124), a signed address in its output, an artifact without findings.json, and a stand-in sleep. Output
  `proof/local-proof.txt` 6728e00c…55a9. Design §7 rewritten with the new table and hashes, §8's issue-text sentence
  edited for security N1, §16.8 added.
- Red: the old work scripts hold no `timeout` and differ from the built steps (`critic-G3-red.log`).
- Green: extract + prove exit 0, every case as expected, the counter-proof (clearing removed) "check failing" (`critic-G3-green.log`).

### critic G4 (nit): records name the live base: DONE (ops files)
- Status file RESUME-BLOCK: a Base line (live c7bed0f7… #117; the WIP holds 30871f72…; the base merge still to do) and the
  Live line's "base is 30871f72" corrected; merge.md and the build summary note it. The base was not merged in this step.

## Final checks (one lock hold, 2026-11-04 ~22:50-23:00 UTC, at 6a3c9258…)
- typecheck 0 (22 projects); lint 0 (1,792 files, 0 errors, 0 warnings); lint:logs 0 (1,135 files); workflows.test.ts
  142/142; actions:check --offline 0 (every action pinned; offline rules only). Logs `final-*.log`.
- actionlint 1.7.7: a bare run fails only on the unknown `ubuntu-26.04` label of every workflow (the installed version
  predates it); with the merge round's flags (`-shellcheck= -pyflakes= -ignore 'label "ubuntu-26.04" is unknown'`) exit 0
  (`final-actionlint.log`). Run just after the lock hold, not inside it.
- After each commit: tools/test + tools/content-calendar 23 files, 353/353, and a fast-forward push through the hook.
- WIP head 6a3c9258… = origin/co-001/wip-ci-findings-transport. Not pushed: co-001/ci-findings-transport. No PR action.
