# fix-check D8-1 (adversarial verify of D8: the content-calendar check row's UTF-16 wording)

Started 2026-11-02 (UTC). Clone: /home/user/fx-imgdigest-D8-1 (read only, never pushed).
Logs: /tmp/claude-0/-home-user-PhysicalTherapy/fcfc578e-dd4f-58f4-94e2-9bcf8baab1a3/scratchpad/imgdigest/logs/D8-1-*.log

## Steps
- [x] clone, fetch WIP ref, check out d257fe6d…, confirm = origin/co-001/wip-ci-images-digest
- [x] pnpm install --frozen-lockfile
- [x] read the D8 diff (91910da1…) and row
- [x] (1) finding's scenario red
- [x] (2) harmless variants green
- [x] (3) b2a41a00 red cases still red
- [x] (4) documents match code
- [x] remove clone

## Log
- C0 heads (git ls-remote, 02:03 UTC): wip = d257fe6d…, PR branch 83167b8f…, build-platform 43565235…, #42 6c28d6a2….
  Clone checked out at d257fe6d… (= origin/co-001/wip-ci-images-digest). pnpm install --frozen-lockfile exit 0
  (D8-1-install.log). Lockfile identical b2a41a00…d257fe6d. Worktrees: /home/user/fx-imgdigest-D8-1-old (b2a41a00…,
  old rule) and /home/user/fx-imgdigest-D8-1-mut (d257fe6d…, for in-place tool-code mutations; never committed).
- C1 read D8 (91910da1…): test diff is 2 lines: the check row's bound text reworded exactly as the disposition says
  (no over:), and in T6 `expect(2 * FINDINGS_BYTES).toBe(1_866_672)` with the comment "(the row's words)".
  FINDINGS_BYTES = 4·ceil(MAX_FILE_BYTES/3) = 933,336 (imported from render.ts). The assertion does NOT read the
  row's text: it pins a number only. ADR N32's over-limit sentence names `ci-findings-transport` and gives 933,336
  characters, 1,866,672 bytes (UTF-16), over 1 MB. Arithmetic checked: 700,000/3 -> 233,334 · 4 = 933,336; ·2 =
  1,866,672. Source of the UTF-16 rule: design §2.5 quotes output-limitations.md:1 "Outputs can be a maximum of 1 MB
  per job. ... Size is approximated based on UTF-16 encoding." check has one output (findings) so per-job = this one.
  Outside #86's files still saying the opposite: render.ts:10 ("its base64 fits a job output"), render.ts:17
  ("stays under 1 MB, GitHub's limit on a job output"), content-calendar.test.ts:583-584 ("Its base64 fits GitHub's 1
  MB job output", ceil(MAX/3)*4 < 1_000_000).
- C2 harness: imgdigest/d8mut/{mutate.py,run.sh,summary.py}: each mutation applied in place to a worktree (render.ts,
  workflows.test.ts or content-calendar.yml), whole workflows.test.ts run, then `git checkout -- .`. Logs
  imgdigest/logs/D8-1-<label>-<mutation>.log.
- C3 live heads (about 02:05 UTC): 99 co-001 heads + #42 fetched; only co-001/wip-ci-findings-transport (b9a83bd3…) changes
  tools/content-calendar/ or content-calendar.yml against its merge base with d257fe6d…, and its merge base IS
  d257fe6d… (built on this head). It sets MAX_FILE_BYTES 2,000,000, moves the findings to an artifact, and removes
  both findings rows and D8's `toBe(1_866_672)` with them (its T6 has no over row). So D8's assertion turns red only
  on the branch whose job is to rewrite it, which already does. #42 and the other 97 heads touch none of these files.
- Other documents still saying the base64 fits a job output (outside #86's files): render.ts:10 and :17,
  content-calendar.test.ts:583-584, and ADR 0071:242 ("bounded at 700,000 bytes so its base64 fits a job output").
  The builder's proposal names the first two only.
- Row text = disposition's text exactly (apostrophes normalised), no over: on the check row, one literal over row.
  Arithmetic 4·ceil(700,000/3) = 933,336; ·2 = 1,866,672 (python).
- C4 baseline new d257fe6d… whole workflows.test.ts: 124 passed (D8-1-new-none.log).
- (1) FINDING'S OWN SCENARIO STAYS GREEN: F1-old-words (the check row's tail restored to b2a41a00's "so 933,336
  characters: a job output, under GitHub’s 1 MB, which reaches no process in this job") on d257fe6d…: vitest exit 0,
  124 passed (D8-1-new-F1-old-words.log). The new `toBe(1_866_672)` pins a number only; nothing reads the row's
  words, though its comment says "(the row's words)". Trial fix written (imgdigest/d8mut/trial-fix.py, never
  committed): figures read from MAX_FILE_BYTES must appear in both rows, check's row must say over ... 1 MB and never
  "under", and 2·FINDINGS_BYTES > 1,048,576. Worktree /home/user/fx-imgdigest-D8-1-fix (d257fe6d…) for it.
- Runs queued (02:08 UTC): new / old / fix(PRE=trial-fix) over F1b-under, F1c-wrong-figure, B760000, B375000,
  B98000, B1000000, B700002, H-render-comment, H-reword, H-cal-comment, R-check-over, R-notify-no-over.
- new F1b-under (one word, "over GitHub’s 1 MB job-output limit" -> "under ..."): GREEN 124 (D8-1-new-F1b-under.log).
- (3a) D8's commit removed one line of the test (the row's old bound string) and no assertion; later commits change
  only the describe's header comment. So no b2a41a00 assertion was dropped by D8.
- (4) docs: ADR N32 sentence matches code (FINDINGS_BYTES 933,336; 2x 1,866,672; over tag ci-findings-transport).
  ci.md:151-153 and :429 say the test refuses any environment string over 131,072 bytes, with no word of the one
  exception the test makes (notify's FINDINGS_B64, the over row); the ADR says "but for the one value named over the
  limit". BoundedValue.over's doc "The one value known to be over the limit" is now ambiguous beside a check row that
  is over GitHub's 1 MB without over: (nit).
- new F1c-wrong-figure (row says "933,336 bytes counted as UTF-16"): GREEN 124. new B760000: RED in T6 (and the
  CI_TREE self test that reruns it) "expected 2026672 to be 1866672" (reproduces the builder's D8-bound-red). old
  none: 121 passed. old B760000: GREEN 121 (so before D8 a bound change left the row silently stale).
- Trial-fix runs 02:09-02:13 were invalid (Python wrote \b as a backspace into the regex); fixed with a raw string,
  fix runs restarted 02:16 UTC. Patch: imgdigest/d8mut/trial-fix.patch (24 lines).
- Trial fix static (02:13 UTC, applied to the clone, restored): tsc -p tools exit 0, eslint workflows.test.ts exit 0
  (prettier --check fails at d257fe6d… too: the repo does not format this file with prettier; ignored).
- new B375000 (UTF-16 exactly 1,000,000: "over 1 MB" false): RED "expected 1000000 to be 1866672"; old GREEN 121.
  B98000 (env string 130,682, under 131,072: the over row false): old RED "expected 130682 to be greater than 131072"
  (old :3365), new RED same (new :3997): the old red case stays red.
- fix none: 124 passed. fix F1-old-words: RED "to contain '1,866,672 bytes'".
- ALL RUNS DONE (02:27 UTC; whole workflows.test.ts each; logs D8-1-{new,old,fix}-<mutation>.log):
  | mutation | old b2a41a00… | new d257fe6d… | trial fix |
  | none | 121 green | 124 green | 124 green |
  | F1-old-words (finding's scenario) | (is the old text) | GREEN | RED contain '1,866,672 bytes' |
  | F1b-under | - | GREEN | RED match /\bover\b[^,;]*\b1 MB\b/ |
  | F1c-wrong-figure | - | GREEN | RED contain '1,866,672 bytes' |
  | B760000 | GREEN | RED 2026672 vs 1866672 | RED |
  | B375000 (UTF-16 = 1,000,000) | GREEN | RED 1000000 | RED |
  | B1000000 | GREEN | RED 2666672 | - |
  | B98000 (env string 130,682) | RED >131072 | RED >131072 | - |
  | B700002 (same FINDINGS_BYTES) | GREEN | GREEN (row's 700,000 stale) | RED contain '700,002 bytes' |
  | H-render-comment | GREEN | GREEN | GREEN |
  | H-reword (same facts) | - | GREEN | GREEN |
  | H-cal-comment | GREEN | GREEN | GREEN |
  | R-check-over | RED | RED | RED |
  | R-notify-no-over | RED (2) | RED (3) | RED (3) |
  Every red failure also fails the CI_TREE self test that reruns T6 (the second FAILED line).
- (1) NOT MET: the finding's own scenario and two near variants stay green on d257fe6d…; D8's assertion catches bound
  changes only. (2) harmless variants green on new and on the trial fix. (3) every old red case (B98000,
  R-check-over, R-notify-no-over) still red; D8 removed no assertion. (4) ADR sentence right; ci.md omits the
  exception (environmentProblems `if (reading.over) continue;` at :3406).
- Worktrees mut/old/fix clean after runs.
- Clone and worktrees removed (02:29 UTC); remote heads unchanged (wip d257fe6d…, PR branch 83167b8f…). Kept:
  imgdigest/d8mut/{mutate.py,run.sh,summary.py,trial-fix.py,trial-fix.patch,heads.txt}.

## DONE. Verdict: D8's words (row and ADR) are right and nothing is loosened, but the finding's own scenario is not
held: the old "under GitHub’s 1 MB" wording passes 124/124 at d257fe6d…, and the new assertion's comment "(the row's
words)" claims a check it does not make. Trial patch (24 lines) makes all three wording mutations red and keeps the
harmless ones green; tsc and eslint clean.
