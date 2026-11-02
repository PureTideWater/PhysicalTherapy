# fix-check D4-1 (adversarial verify of D4: findings sites)

Started 2026-11-02 (UTC). Clone: /home/user/fx-imgdigest-D4-1 (read only, never pushed).

## Steps
- [x] clone, fetch WIP ref, check out d257fe6d…, confirm = origin/co-001/wip-ci-images-digest
- [x] pnpm install --frozen-lockfile
- [x] read the D4 code and rows
- [x] (1) finding's scenario red
- [x] (2) harmless variants green
- [x] (3) b2a41a00 fixtures still red
- [x] (4) documents match code
- [x] remove clone

## Log
- C0 heads (git ls-remote): wip = d257fe6d…, PR branch 83167b8f…, build-platform 43565235…, #42 6c28d6a2…. Checked out
  d257fe6d… (= origin/co-001/wip-ci-images-digest). pnpm install --frozen-lockfile: exit 0. Lockfile unchanged
  b2a41a00…d257fe6d. Worktrees: /home/user/fx-imgdigest-D4-1-old (b2a41a00…, old rule), /home/user/fx-imgdigest-D4-1-d3
  (c1e80912…, D3 only, before D4).
- C1 read D4 (9ac28806…): FoundValue gains where; BoundedValue gains sites; refProblems compares sorted wheres of
  every found (file, job, value) to sites; T6 asserts the over row's sites; the old pin
  `notify.steps.map(s => s.env?.FINDINGS_B64).filter(defined) == ['${{ needs.check.outputs.findings }}']` is removed.
  NOTE: that old pin held the over string's exact VALUE as well as its name. D3's environmentProblems skips any string
  whose reading holds the over row (`if (reading.over) continue;`), before its unbounded and sum checks. So after D4
  nothing holds what else the one over string carries. To test (M6/M7).
- C2 harness: /tmp/claude-0/-home-user-PhysicalTherapy/fcfc578e-dd4f-58f4-94e2-9bcf8baab1a3/scratchpad/imgdigest/d4mut/
  (mutate.py builds a copy of CI_FILES with content-calendar.yml edited; run.sh runs that worktree's whole
  workflows.test.ts with CI_TREE on it). content-calendar.yml is byte-identical at b2a41a00… and d257fe6d….
  Logs: imgdigest/logs/D4-1-<tree>-<mutation>.log. Baseline d257fe6d… whole file (no CI_TREE): 124 passed
  (D4-1-baseline-whole.log). Control copies: new none 123 passed + 1 skipped (self test); old none 120+1; d3 none 122+1.
- (1) DONE. M1 (critic-2's m-a2: a step appended to notify, if: always(), env FINDINGS_COPY:
  ${{ needs.check.outputs.findings }}, run: echo copied): new RED, one test, T6 "hands a step another step's or job's
  output only from the list below…" (workflows.test.ts:3989), message: `content-calendar.yml notify
  needs.check.outputs.findings: read at job notify step "Copy the findings" env.FINDINGS_COPY, job notify step "Open an
  issue for each finding not already open" env.FINDINGS_B64, not exactly at its sites, …`. old (b2a41a00…) GREEN
  120+1; d3 (c1e80912…) GREEN 122+1. So D4 alone closes it.
- C3 live heads (D4's sites depend on content-calendar.yml's notify step name and env key): fetched #42
  (6c28d6a2…) and all 98 co-001 heads; none changes .github/workflows/content-calendar.yml against its merge base
  with d257fe6d…. The sites strings survive every trial merge.
- (3a) assertions removed b2a41a00…d257fe6d (whole file, 7 lines): D4's two are the accepted-values fixture (now with
  where and step, same values) and the real-workflow pin
  `notify.steps.map(s => s.env?.FINDINGS_B64).filter(defined) == ['${{ needs.check.outputs.findings }}']`; the rest
  are D1 (line refs), D5 (toHaveLength(7)), D6 (GITHUB_ENV closed list). Every other old expect line is verbatim in the
  new file, and the new file is green (124), so those red fixtures are still red. The N32 describe keeps every old
  test title (T5 renamed by D7).
- (1b) more second uses, new tree, each RED in T6 with "not exactly at its sites": M2 with.path in an
  upload-artifact step (also 2 other tests), M3 job-level env FINDINGS_JOB, M4 `echo "${{…findings}}"` in a run
  (also the content-calendar notify test), M5 the value twice in FINDINGS_B64's own string (duplicate where counted).
- POSSIBLE LOOSENING, new tree GREEN (whole file 123 passed + 1 skipped): M6 FINDINGS_B64:
  `${{ needs.check.outputs.findings }}${{ vars.A }}${{ vars.B }}${{ vars.C }}` and M6b
  `${{ needs.check.outputs.findings }}${{ env.NOT_SET_ANYWHERE }}` (a value D3 itself calls unbounded). Old-tree
  runs queued to confirm the old pin turned these red.
- new tree, more: M7 (a 140,000-byte literal after the value in FINDINGS_B64's string) GREEN (123+1). RED with
  "not exactly at its sites": M8 FINDINGS_B64 renamed FINDINGS, M9 a second step of the same name with FINDINGS_B64
  (duplicate where counted), M10 a notify job output, M12 a second use of steps.calendar.outputs.findings in check
  (plus D3's sum). M11 a new job notify2 reading it: red by T6's set and D3's "no row bounds" (5 tests).
- Trial fix (scratch worktree /home/user/fx-imgdigest-D4-1-fix at d257fe6d…, never committed): environmentProblems
  exempts a string holding the over value only when it is that value alone (one ${{ }} naming the over row's value,
  nothing beside it), else "holds the value over the limit with more beside it"; D3's fixture that asserted
  `${{ steps.web.outputs.size }}${{ vars.A }}` exempt now expects that refusal, plus a literal and an `||` case.
  tsc (tools) exit 0. Mutation runs on it queued.
- new tree, the rest: RED at T6's sites check: M13 toJSON(needs) in notify (no row: T6 set + D3), M14
  `needs['check'].outputs['findings']` (normalised to the same key, caught as a second site), M15 notify
  strategy.matrix.f[0], M17 working-directory, M19 fromJSON(findings) in a second step. GREEN: M18 (`if:` on the
  site's step reading the findings; if/name reach no process: harmless).
- (2) DONE, harmless variants all GREEN on new (123+1 each): H1 quoted, H2 `${{needs.check.outputs.findings}}`, H3
  `…outputs.FINDINGS`, H4 FINDINGS_B64 moved first in the env map, H5 an unrelated step appended to notify, H6 a comment
  above the site, H7 a comment at the file's top, H8 the site's run script edited, H9 check's calendar step renamed (id
  kept). (Old rule turned H2 and H3 red: D4 removes that over-strictness.)
- (3) old rule (b2a41a00…) on the same mutations: RED M5, M6, M6b, M7, M8, M9, M2 (other tests), M4 (other test), H2,
  H3; GREEN M3 and M1 (the finding). D3 commit (c1e80912…, pin still there): M6, M6b, M7 RED at the pin
  (workflows.test.ts:3950: expected ['${{ needs.check.outputs.findings }}'], received '…findings }}${{ vars.A }}…').
  So **M6, M6b, M7 are red before D4 and green after it: D4 LOOSENED the over site's string.** The removed assertion
  was not only a name pin: it held FINDINGS_B64's exact value, and D3's environmentProblems skips the whole string
  holding the over value (`if (reading.over) continue;`, before the unbounded and sum checks), so after D4 the one over
  string may carry any number of vars/secrets (48 KB each), an env.X D3 itself calls unbounded, or any literal.
- Trial fix runs (fix worktree): none 123+1 (the new D3 fixture lines pass); M1 still RED (sites); M6, M6b, M7 RED in
  D3's test with `content-calendar.yml job notify step "Open an issue for each finding not already open"
  env.FINDINGS_B64: holds the value over the limit with more beside it`; H1-H4 GREEN. tsc exit 0, eslint exit 0.
  Patch: imgdigest/d4mut/trial-fix-over-alone.patch (45 lines).
- (4) documents at d257fe6d…: ADR 0066 N32 :1022-1023 "held to the one place each job reads them, so no second use
  joins them": TRUE of the code (both rows carry sites; M1-M5, M8-M10, M12, M14, M15, M17, M19 red). ADR :1021 "refuses
  one over 131,072 bytes, or one holding a value with no bound, but for the one value named over the limit": the code
  exempts the whole string holding that value, whatever else it holds (M6, M6b, M7 green): the sentence says less than
  the code exempts. ci.md :152-153 "sums each environment string … and refuses one over 131,072 bytes, or one holding a
  value it does not list with its bound": names no exception, yet FINDINGS_B64 (up to 933,349 bytes) is not refused;
  ci.md never names the over value or its sites. Test comments :3263 and :3470 say the over string is "the table's (its
  sites)": sites hold where, not what else the string holds. reconciliation-001's entry ("the content calendar's
  findings recorded over the limit, their transport its own item"): true. D4's commit message: true.
- Cleanup: worktrees and clone /home/user/fx-imgdigest-D4-1 removed; mutated trees removed (logs, reports, harness
  and patch kept under imgdigest/). Remote refs unchanged (wip d257fe6d…, PR branch 83167b8f…); nothing pushed,
  commented or reviewed.

## Result: NOT RESOLVED (loosened)
D4 closes C2-F1: every second use of the findings, under any name, key or place a value reaches a process, is red;
every harmless variant is green; the sites survive every live head. But removing the FINDINGS_B64 pin dropped its
exact-value hold, and with D3's whole-string exemption the one over string now admits anything beside the findings
(M6, M6b, M7: red at b2a41a00… and c1e80912…, green at d257fe6d…). Fix: exempt the over string only when it is the
value alone (trial patch, tested), and say so in ADR :1021, ci.md :152-153 and the test comments.
## DONE
