ACTING Lane B (W36, https://claude.ai/code/session_019i9ifBWTdAErWCMzjfhzn3) holds this item from 2026-11-12 07:40 UTC; before it W21, W18 and W17; Lane B: read lanes/lane-b.md's latest entries before resuming.

# Queues item 26 (MOD-23): K-1, the two name forms, P6's stored numbers: status

## RESUME-BLOCK, current (W36, session_019i9ifBWTdAErWCMzjfhzn3, 2026-11-12 about 10:50 UTC; draft PR #158 OPEN on e013634b, CI by subscription; verified locally; NOT merged)

- **Where it stands.** `co-001/redact-item-26` = WIP `co-001/wip-redact-item-26` = **e013634b** (the base adaf7897
  contained; a85ea22d the merge and the readings on the counter, a447958e MOD-23 in the registry, e013634b review D's
  row and the ADR). Draft PR **#158** into `claude/build-platform`, description from the template; W36 is subscribed.
- **Proof, all on e013634b's reader.** Gate (`designs/lane-b-redact-item-26/gate/report-ab-*.md`, `report-fb-*.md`):
  against adaf7897, 975,489 letters, 13 differ (each the recorded cost of a name whose letters are ordinary words apart),
  no PHI class, 462,984 refused on both sides: **0 real-shaped letters newly refused by the count**; against c52f262a 0
  differ. Battery (`battery-{hr,rr,hf,rf}-e013634b.out`): head and base-as-head the same answers on recorded and fresh
  seeds. Review D (`reviews/d/report.md`): no blocking finding; no fix round. Full local suite once, Node 24: unit with
  coverage 14,350 passed, db 10,287 (PostgreSQL 18: `DATABASE_URL=postgres://postgres:test@localhost:5433/postgres`;
  the servers had stopped and were started with `pg_ctl` as in `tools/setup-container.sh`), golden 381, e2e 87,
  typecheck, lint, lint:logs, verify-content. MOD-15 (Queues item 38) did not fail locally.
- **Left to do.** On green required checks: ready the PR, `git fetch origin refs/pull/156/head` and look for the
  founder's commit on `docs/product/domain-model.md` (if it is there and #156 is not merged: do NOT merge, tell the
  orchestrator, wait); if the base moved, merge it and push first; merge; verify with `git ls-remote`; final state here.
- **For the queue (lesser findings; ADR 0054's new amendment holds each):** D-TIME-1 (the dearest letter left read,
  57,972 characters with one CR LF, 1.7 to 2.0 s; a row now); D-TIME-3 (two letters with nothing of item 26's refused at
  the budget's edge); the cost table (letters refused at a third to two thirds of the base's length); C-PHI-1 to
  C-PHI-3 as they stand; the reviewer's stated limits (the first reading's charge shown >= the base's by counts, not
  per site; no search at the budget's edge). The orchestrator's seat moved at 08:00 UTC by a peer note; W36 reports to
  both sessions.

## RESUME-BLOCK of W36 at 08:20 UTC (superseded by the block above; W36, session_019i9ifBWTdAErWCMzjfhzn3, 2026-11-12 about 08:20 UTC; BUILT on the counter, tests green, the gate and the battery RUNNING, the delta review NOT yet run; no PR)

- **Where it stands.** WIP `co-001/wip-redact-item-26` = **a85ea22d** (the base adaf7897 merged into c52f262a, item
  26's readings on the base's counter, the character bound removed); local branch `co-001/redact-item-26` is one
  commit past it, a447958e (MOD-23 in `packages/synth`'s matrix mirror and registry, fixtures regenerated; not pushed
  yet). Typecheck and lint pass on a85ea22d; the five redaction test files pass (4,206 tests, Node 24, no coverage).
- **What was built** (ADR 0054, the new amendment "item 26's readings on the check's work budget"):
  - `CHECK_WORK_BUDGET`, `WORK`, `work`, `someOf` and the two entries are the base's to the character. The gate's
    check (`holdsAsFirstRead` through `refusedAsFirstRead`) and K-1's second reading run inside the entries and charge
    as a check of its own does (`WORK.character` per character, `workOfIdentifiers`, every counted site).
  - `WIDER_WORK_BOUND`, `widerWorkOf`, `unreadPastTheBound` removed. `redactionSpans`/`redactLetter` (no counter on the
    base) count only what item 26 adds, from nothing, and past the budget write the first reading's text and the mark.
  - The shared stores (`inOneReading`) stay, with each stored answer's cost kept (`Stored`, `takenAgain`): a first
    reading is charged as on the base, only the wider reading takes a stored answer for nothing. Without the stores four
    of the base's own time rows were refused (the wider reading charged for dates and views it need not read again).
  - The wider reading skips the initials search when it found no name (it returns none then): without it the base's row
    "a long gap after a name and many initials" was refused (468M units; now 403M, the base 339M, the budget 420M).
- **Measured** (`designs/lane-b-redact-item-26/scripts/dear.mts`, output `dear-a85ea22d.out`; no coverage): CT-1's rows
  all refused by the count in 0.67 to 1.00 s; the dearest letter still read 0.90 to 1.30 s (the base's own row).
  Costs (letters read on the base, refused now) are the table in the ADR's new amendment.
- **Running / next.** (1) The gate: `/home/user/gate` (the count handed on in `worker.mts`), A = adaf7897
  (`/home/user/snapA`), F = c52f262a, B = a85ea22d: `/home/user/gate-out/ab`, then `fb`. (2) The battery: four roots
  laid under `/home/user/bt` (`hr`, `hf` the head; `rr`, `rf` the base as head), run as `tools/chain.sh` runs them.
  (3) One adversarial review of the delta since c52f262a (report under `reviews/d/`). (4) The full local suite once
  with coverage, the base merged right before the last push, the PR from the template on `co-001/redact-item-26`.
- **Queue item 38** (MOD-15, seed 1596478644): not met yet in this session's runs.

## RESUME-BLOCK of W21 (superseded by the block above; W21, session_019i9ifCPJnxuf8XPM3RFrt8, 2026-11-12 about 02:15 UTC; STOPPED at its token limit with review C's TIME findings BLOCKING and run; the fix is designed below, NOT built; no PR)

- **Where it stands.** WIP `co-001/wip-redact-item-26` = **c52f262a** (f0d415e2, then 69e00b48 the work bound and its
  tests, 6f7029d9 ADR 0054 and the matrix row, c52f262a review C-PHI's three recorded findings pinned). Local branch
  `co-001/redact-item-26`. Typecheck, lint, the seven redaction test files and `denial-letter.test.ts` passed on
  69e00b48 (Node 24). **No PR, no subscription, no check-in. The gate, the battery and the full suite were NOT run.**
- **What was built (the ruling's step 2).** `WIDER_WORK_BOUND = 100_000` characters on `widerWorkOf(first text)` (its
  length, plus its length with CR LF as LF where it holds one): past it, where the wider reading has a match to apply,
  the gate check is not run and the letter is returned as the first reading wrote it with U+0001 at its end, which
  `holdsAsFirstRead` refuses at its first line (`unreadPastTheBound`; both paths). Step 1 (a cheaper way): none; the
  time is the first reading's check run again, not the wider reading.
- **Review C (the one adversarial review; reports `reviews/c-phi/report.md`, `reviews/c-time/report.md`).**
  - **PHI: no blocking finding** (47,891 fuzzed letters on four trees and both paths, 104 letters at the bound, 9,510
    store comparisons). C-PHI-1 to C-PHI-3 run by me, recorded and pinned in `redact.leaks.test.ts` (c52f262a); they
    still need their rows in ADR 0054's "Left, each recorded" for Queues item 34.
  - **TIME: BLOCKING, run by me and confirmed** (`scripts/review-c-time-rows.mts`, output beside it; Node 24, at the
    reference calibration, three runs):
    - **CT-1 (item 26's own): still-read letters of at most 100,000 characters over the budget.** The bound counts
      characters, and a letter of one digit and one line break per line costs about twice per character what the
      rows the bound was set on cost; the base itself takes 1.9 to 2.6 s on them. A wider match and no CR LF, at the
      bound: head 3.2 to 3.8 s (base 2.1 to 2.4). A CR LF and no wider match, which meets no bound at all (K-1's second
      reading): head 3.0 to 3.6 s (base 1.9 to 2.6). Both, at the bound (49,984 characters): head 2.8 to 2.9 s (base
      1.2). My figure "dearest still read 2.0 to 2.2 s" is WRONG and is in ADR 0054 on the WIP ref: rewrite it.
    - **CT-2 (the merged base's own, not item 26's): quadratic time.** `'Vantree' + ' J'.repeat(49990) + ' \u0445'`
      (initials beside a name, and one look-alike character anywhere): base 3.0 to 4.3 s, head 4.0 to 4.6 s; with a
      name joiner as well the reviewer measured 5.6 to 8.3 s on the base. `matchesIn` searches a list once per match
      (`plain.some`, `base.some`; base lines 1090 and 1094). The merged base breaks the 3 s budget on a letter of
      100,000 characters; no budget row holds this letter. **The orchestrator's to rule:** curing it changes the first
      reading's code, which item 26's construction leaves unchanged by one character.
    - CT-3, CT-4 (not blocking): a letter past the bound still pays its redaction (0.3 to 1.3 s; the base's quadratic
      letter 3.6 to 4.4 s before it is refused); the base's dearest letters with nothing of item 26's are 2.3 to 2.7 s.
- **The fix for CT-1, designed and not built (this item's one allowed fix; its delta is then reviewed once, and if that
  review is not clean of blocking findings, stop and tell the orchestrator).**
  1. The bound must cover BOTH re-readings item 26 adds, each counted the same way: the gate's (as now) and K-1's
     second reading in `holdsIdentifier`: a text that holds a CR LF and whose writing with line feeds is over the
     bound is REFUSED (return true) and not read again. In `holdsIdentifier` the first reading of the text as written
     runs first, as on the base.
  2. The bound falls to about **50,000** characters. Measured cost of one more check on the dearest content: 1.1 to
     1.4 s per 100,000 characters, on a base of 2.1 to 2.5 s. At 50,000: a wider match alone (50,000 characters) about
     1.25 + 0.7 = 1.95 s; a CR LF alone (LF writing 50,000) about 1.9 s; both (25,000 characters, three more checks)
     about 1.5 s. Measure, do not trust these sums: rerun `scripts/review-c-time-rows.mts` with each row trimmed to
     the new bound, with U+2028 and U+0085 as the line break too (`nel`, `ls` arguments) and the reviewer's rows L1 to
     L12, K1 to K11 (`reviews/c-time/adv.mts`). The dearest letter still read should then be the base's own (2.3 to
     2.7 s, no part of item 26).
  3. Must-stay cost to state plainly: every letter with CR LF line endings over about 50,000 characters is refused,
     whatever it holds; a letter with a wider match over 50,000 (25,000 with CR LF) is refused. Measured so far: the
     gate's letters are at most 1,780 characters and the repository's prose at most 9,933, so none of either.
     Rerun `scripts/bound-refusals.mts` (it reads the bound from the head).
  4. Tests first: `denial-letter.test.ts`' two CR LF rows of 100,000 characters with no wider match turn to refused
     (they are over the new bound) and rows at the new bound are added, among them the reviewer's dear units (`5\n`,
     U+0665 with U+2028) with a CR LF, with a name apart, and with both; `redact.leaks.test.ts`: "reads a letter of
     any length that holds nothing for the wider reading" keeps its LF half and its CR LF half turns to refused; a
     boundary row for K-1's count; the pins of C-PHI-1 to C-PHI-3 are rebuilt on the new value (C-PHI-3's letter is
     tuned to 100,000). Then ADR 0054 (the count, the bound, the costs, the time, review C) and the matrix row.
- **Then, as before:** the gate (`/home/user/gate` is laid out in this container with `/home/user/snapA` = the base's
  reader, `snapF` = f0d415e2's, `snapB` = the head's: copy the final `redact.ts` in; A against B, and F against B for
  the letter-for-letter figure) and the battery (`tools/lay.sh`; `tree-ef3`, `tree-cc3` exist) on recorded and fresh
  seeds; the full local suite once on Node 24; the base merged right before the last push and the gate again; a draft
  PR from the template naming every cost and residual; subscribe; merge on green; one line to the orchestrator.

## RESUME-BLOCK, earlier (W20, session_019i9ifCRAB5iyShfYuBtnA3, 2026-11-11 about 23:25 UTC; part A MERGED; part B STOPPED at a blocker before its delta review, waiting on the orchestrator)

- **Part A: merged.** #148 as 83e30973 (the base now). The time helper is not W18's: review T-1 showed W18's build
  passed a 3.4 to 3.8 s reader, so it was rebuilt (first run against the budget itself; a calibration only for
  over-budget work: fastest of five, reference 144 ms on Node 24, counted above 5 %; 60 s hang guard on the timed
  blocks). Review and scripts: `designs/time-budget-bound/`. Run every test with `PATH=/opt/node24/bin:$PATH` (the
  container's default node is 22; CI is 24).
- **Part B, done so far:** WIP `co-001/wip-redact-item-26` = **f0d415e2** (b29e611a, the base 83e30973 merged in as c6037bd9
  with the base's helper and call sites, ADR 0054 keeping both amendments and item 26's citing the time bound's; then
  the duplicate import removed). Local branch `co-001/redact-item-26`.
- **THE BLOCKER (told to the orchestrator 23:25 UTC): item 26's dearest letters are over the 3 s budget.** B-5 was
  accepted at "2.2 to 2.5 s of 3 s"; that figure was read under W18's helper. Against the plain 3 s, on this machine at
  the reference speed (calibration 140 to 148 ms):
  - in the suite on Node 24 (`vitest run src/functions/denial-letter.test.ts`): the row "dates written with spaces
    alone and a CR LF, then the name with a part written apart" FAILS at 3.06 s (its best of three runs); "a digit and
    a CRLF, repeated, then the name with a part written apart" passed (test duration 2.2 s);
  - in a bare script (`designs/time-budget-bound/scripts/b5.mts`, five runs each): 3.39 to 3.88 s and 3.60 to 3.97 s
    on Node 24; 4.04 to 4.33 s and 3.75 to 4.12 s on Node 22; the base's own dearest row beside them 1.2 s (1.7 on 22).
  The number is not to be raised and no row skipped, so the cure is in the reader (W18's note: one more check before a
  wider match is applied, and a CR LF letter checked in both writings: four checks; "I found no way that keeps the
  composition"). That is a design decision and would be this item's one remaining fix round. Nothing else of part B
  was started: no delta review, no gate, no battery, no full suite, no PR.
- **The orchestrator's ruling (23:08 UTC):** the B-5 acceptance is withdrawn; the 3 s budget stands. W21 takes the
  item from here: first a plain saving if one exists, otherwise a deterministic work bound in the wider reading that
  REFUSES a letter past it (a count, not a clock; fail closed); then the review, the gate, the PR and the merge.
  W20 has stood down and holds nothing.
- **The two letters and how they were measured** (Node v24.22.0 at `/opt/node24/bin`, CI's major version; the
  container's default `node` is v22.23.4, so set the PATH first; four cores, idle, calibration 140 to 148 ms):
  - the fixtures are rows of `packages/model-gateway/src/functions/denial-letter.test.ts` on f0d415e2, in the block
    "redacts a letter crafted to be slow in time linear in its length" (`N = 100_000`, `fill(unit)` repeats the unit to
    N characters): `['JANE Q VANTREE']`, `` `${fill('1 1 11 ')}\r\nVant ree` ``, claim `SYN555001` ("dates written
    with spaces alone and a CR LF, then the name with a part written apart"), and `` `${fill('5\r\n')}Vant ree` ``
    ("a digit and a CRLF, repeated, then the name with a part written apart");
  - in the suite: `cd packages/model-gateway && PATH=/opt/node24/bin:$PATH pnpm exec vitest run
    src/functions/denial-letter.test.ts src/redact.leaks.test.ts src/test-support/time-budget.test.ts
    --reporter=json --outputFile=<file>` (the first row's message: 3.06 s of processor time against 3.00 s allowed,
    no allowance for the machine; run once on c6037bd9, where the leaks file did not load for a doubled import, fixed
    in f0d415e2 and NOT rerun since);
  - bare: `cd /home/user/ops/designs/time-budget-bound/scripts && /opt/node24/bin/node
    /home/user/PhysicalTherapy/node_modules/tsx/dist/cli.mjs b5.mts` (five runs of each letter and of the base's
    `fill('1 1 11 ')`, with the calibration; the same with `/opt/node22/bin/node` for Node 22). The bare script reads
    higher than the suite for the same letter (review T-9; cause not found): the suite's figure is the one CI holds.
- **After the reader's change, the order is W18's block below** (delta review of round 1 with the time bound in its
  scope, now meaning the base's helper; gate; battery; full suite; base merge; draft PR), after the reader's cure if
  one is ordered.
- No PR is open for part B, no subscription and no check-in is held. Nothing runs in the container.

## RESUME-BLOCK, earlier (W18 at its token limit, 2026-11-11 about 21:50 UTC; fix round 1 is built and green, NOT yet reviewed on its delta; no PR is open)

- **WIP ref:** `co-001/wip-redact-item-26` at **b29e611a** (on f3f5a642). Local branch name `co-001/redact-item-26`.
  Reviews A and B: `designs/lane-b-redact-item-26/reviews/review-a.md`, `review-b.md` (scripts beside them; rerun
  lines at the end of each). Tools: `designs/lane-b-redact-item-26/tools/`. The first gate's report and the four
  battery summaries (on 2ab3e0dd, before round 1): `designs/lane-b-redact-item-26/gate-report-2ab3e0dd.md`,
  `battery-{hr,rr,hf,rf}-2ab3e0dd.out` (h = head, r = the base run as head; second letter r = recorded seeds, f = fresh).
- **Done (the brief's steps 1 to 3, the two reviews of step 4, and fix round 1):**
  - Time and run count fixed at their causes (`inOneReading`: views, dates and forms stored once per exported
    reading; `formsOf`): dates rows back at the base's time; run count 2,110 against 2,389 (88.3, bar 90 unmoved).
  - The orchestrator's addition (21:16 UTC): the 3 s bound made sound. `packages/model-gateway/src/test-support/
    time-budget.ts`: the work in its own thread's processor time (`process.threadCpuUsage`), the bound `budget x
    max(1, calibration / 40 ms)` with the calibration (a fixed regex workload, none of the reader's code) right before
    and after, the faster counting, the work's fastest of three. 40 ms is the idle median of 200 on this container
    class (`tools/cal.mts`). Under a load of six on four cores the rows read what they read idle (`tools/track.mts`).
    The four wall-clock assertions (denial-letter.test.ts twice, redact.leaks.test.ts twice) go through it. A first
    try that calibrated by wall clock over-read load by 2 to 4 times and was dropped. **Not yet reviewed.**
  - Gate on 2ab3e0dd against f3f5a642: no PHI class, 462,984 refused on both, 13 letters changed (`in a` for INA),
    slowest 994 ms. Batteries on 2ab3e0dd: head equals the base run as head but for CR LF letters now refused; fuzz
    flips 0, DEPART 0; every fz flip is patient M's (ruling B), and the one FLIP-OWN of the fresh seed is sent the same
    way by f3f5a642 (run by hand).
  - Review A: A-1 BLOCKING on the path without the screen (`redactLetter`, no production caller; the gateway exports
    it): wider placeholders un-refused letters. **Fixed in round 1:** `redactionSpans` applies wider matches only
    where `refusedAsFirstRead` does not refuse the first reading's text; that guard reads the CR LF writing as LF too
    (A-2), on both paths; U+0085 joins a part (`GAP.apart`, A-4 in part); a stored `[` or `]` is read as `(` `)` (A-5
    in part); `\r+\n` is one line ending (`asLineFeeds`, A-6 in part). Recorded and pinned: A-3, A-4's other marks,
    A-5's other separator, A-6's LF CR, A-2's one shape.
  - Review B: nothing blocking; B-1 to B-5 are costs the design did not state, each pinned in
    `redact.leaks.test.ts` (`describe('review B, the recorded costs')`) and written into ADR 0054's amendment. No code
    change for them: the blunt rule is kept (the safer side), and each is handed to Queues item 34.
  - Six files on b29e611a: gateway 4,165, packets' `verifier-identifiers.test.ts` 107, `@tp/redact` 46; typecheck and
    lint clean. ADR 0054's amendment and the test matrix's MOD-23 row are written and committed.
- **FIRST, by the orchestrator's change of order (21:52 UTC; W18 was past its limit and did not start it): the time
  bound as its own small PR, cut from the base (356914e2 or later), not from this WIP.** Everything it needs is in
  b29e611a; extract just this:
  1. `git checkout -b co-001/time-budget-bound origin/claude/build-platform`, then
     `git checkout b29e611a -- packages/model-gateway/src/test-support/time-budget.ts`.
  2. `packages/model-gateway/src/functions/denial-letter.test.ts`: the import of `timed`, the constant `BUDGET_MS`,
     and the two assertion bodies (`git diff f3f5a642 b29e611a -- <file>` shows them: the two hunks that replace
     `performance.now()`; leave out the MOD-23 rows and the recorded-cost test, which are item 26's).
  3. `packages/model-gateway/src/redact.leaks.test.ts`: the import and the two 1-second rows (I1-1, J-5), the same way.
  4. ADR 0054: the paragraph "*How the budget is proved.*" of item 26's amendment, as a short amendment of its own
     (the ratio 3,000 ms to 40 ms and why; 40 ms is the idle median of 200 runs on this container class,
     `designs/lane-b-redact-item-26/tools/cal.mts`). Item 26's amendment then cites it instead of repeating it.
  5. Run the two test files; one review (tests and time: can a loaded or slow runner flip it; can a slower reader
     hide under it; `max(1, .)` with the faster calibration; thread time's 4 ms grain on short rows; the work's fastest
     of three); the draft PR; merge on green. Then item 26 merges the base and drops its own copy of these hunks.
  Measured by W18: under a load of six on four cores the 100,000-character rows read 0.7 to 1.4 s of processor time
  with the factor at 1.00 (`tools/track.mts`); idle the calibration reads 32 to 48 ms (median 40.0, three runs of 200).
- **OPEN, in this order:**
  1. **The delta review of round 1** (one subagent, about 20 tool calls, report
     `designs/lane-b-redact-item-26/reviews/review-c.md`): the delta is `git diff 2ab3e0dd b29e611a --
     packages/redact/src/redact.ts` (the guard `refusedAsFirstRead` in `redactionSpans` and `screenAsBothRead`,
     `asLineFeeds`, `GAP.apart`, the stored bracket) and `test-support/time-budget.ts` with its four call sites (the
     orchestrator asked for the time bound in the time reviewer's scope: can a slow or loaded runner flip it; can a
     slower reader hide under it; is `max(1, .)` with the faster calibration sound; the 4 ms grain of thread time).
     Rerun review A's fuzzer on the new head first (`reviews/a/fuzz.mts`, after copying the new `redact.ts` to
     `/home/user/rev/head/`): expect base-refuses-head-sends 0 on BOTH paths now. This is fix round 1 of at most two.
  2. The gate and the battery on the final tree: copy `packages/redact/src/{redact,confusables}.ts` into
     `/home/user/snapB/packages/model-gateway/src/`, `bash /home/user/gate/run.sh /home/user/snapA /home/user/snapB
     <out> --workers 4`; `tools/lay.sh /home/user/bt/hr <dir of the head's redact.ts>` (and `hf`), then
     `O=<root>/out PREV=<root>/none bash <root>/work/battery.sh` (`battery-fresh.sh` for `hf`); compare with the kept
     `battery-rr` and `battery-rf` summaries (the reference does not change). A fresh container needs `tools/lay.sh`'s
     layout, the worktrees `tree-ef3`, `tree-cc3`, `tree-base` and `/home/user/gate` (README of the battery).
  3. **One thing to weigh before the PR:** the two dearest budget rows (a CR LF letter of dates or digits with one name
     written apart) read 2.2 to 2.5 s of processor time idle against 3 s, and 2.2 to 3.3 s of test duration inside the
     parallel suite: they pass, with the least room of any row. The cost is the design's own (one more check before a
     wider match is applied, and a CR LF letter checked in both writings: four checks). If CI shows them near the bound,
     the cure is in the reader (fewer checks), not in the number; I found no way that keeps the composition.
  4. The full local suite once (to a file); `git merge origin/claude/build-platform` right before the last push; the
     gate again on the merged tree; the draft PR from `.github/pull_request_template.md` naming every residual and cost
     in plain words (ADR 0054's amendment lists them); subscribe; merge on green; one line to the orchestrator.
- **For the orchestrator (Queues item 34), from the reviews:** A-3 and B-1 (two families of new refusals), A-4 (a part
  split by `, ` `: ` `; ` `(` or another script's full stop), A-5 (a stored number with another separator), A-6 (LF CR),
  A-2's recorded shape, B-2 and B-3 (names of ordinary words; a deadline's month, a hyphenated word, `P.O.`), B-4 (an
  amount that is a stored number's writing), B-5 (the dearest letter's time).
- No PR is open, no subscription and no check-in is held. Nothing runs in the container.

## RESUME-BLOCK (written by W17 at its 250k-token limit; the build is not finished, nothing is reviewed, no PR is open)

- **WIP ref:** `co-001/wip-redact-item-26` at **7cbdd33d**, one commit on the base f3f5a642. Local branch name
  `co-001/redact-item-26`. The design note: `designs/lane-b-redact-item-26/design.md` (sent to the orchestrator before
  building; no answer came, so it stands). Read it first: it is one page.
- **What is built** (`packages/redact/src/redact.ts`; `matchesIn`, `appliedMatches`, `merge`, the patterns and the scan
  are unchanged):
  - `nameForm(parts, apart)`, `numberForm(value, kind, claim, asStored)`, `formsOf(subject, wider)` (only the forms
    whose pattern differs from the first reading's), `ownMatchesIn(normal, subject, wider)`, `widerMatchesIn`.
  - `redactLetterForScreen` = `screenAsFirstRead` (the base's body) plus the wider matches, applied only where
    `holdsAsFirstRead` (the base's check, body unchanged) does not refuse the base's text; candidates are the base's
    plus the sent text's. `redactionSpans` applies every match of both readings.
  - `holdsIdentifier` = the base's check or any wider match, read as written and, where the text holds a CR LF, once
    more with CR LF as LF.
- **Verified by running:** `name-forms.mts` (all four MOD-23 forms redacted alone, refused in a held letter as on the
  base); `scripts/p6.mts` (each stored separator read as stored; amounts and unlabeled whole dates kept); `k1.txt` on
  base and head (7 of 29 turn from sent to refused, each the LF row's answer; none the other way);
  `scripts/cost-names.mts` (the note's cost table). `@tp/redact` typechecks; its own tests (46) and packets'
  `verifier-identifiers.test.ts` (107) pass unchanged: the narrative's reading is the base's.
- **Tests** (`packages/model-gateway/src`): the pinned "sent today" rows of MOD-23 and K-1 are rewritten as closed; a new
  `describe('MOD-23: ...')` in `redact.leaks.test.ts` holds the name forms, the recorded cost rows, P6, K-1 and two
  properties; four older tests that asserted the pieces rule now assert the recorded cost (`denial-letter.test.ts`,
  `redact.property.test.ts`'s phrase property, `redact.test.ts`'s screen property). Last run (before three small
  expectation fixes of my own new rows, which are in 7cbdd33d but **not rerun**): 4,113 of 4,119 pass.
- **OPEN, to do next, in this order:**
  1. **Time (a real defect, do not raise the budget).** Two crafted 100 kB letters of `denial-letter.test.ts` ("dates
     written with slashes, one after another", "dates written with spaces alone") take 3.8 s and 3.1 s against 3 s. The
     wider reading calls `ownMatchesIn` again, which reads the letter's dates again (`datesOf` is cached only inside a
     check). Likely fix: open the check's caches (`viewsOfCheck`, `datesOfCheck`) around the whole of
     `redactLetterForScreen` and of each `holds` reading in `holdsIdentifier`, so both readings share one date reading;
     and skip the wider reading when the text's letters and digits hold none of the wider forms' compact strings in
     order (the filter `nameOrNumberMatches` already uses). Measure on those two rows and the gate's timing table.
  2. `redact.test.ts` "reads a letter with no invisible run on one reading" compares regular-expression run counts
     (3,254 against 3,545: 91.8 in 100, the bar is 90). The wider reading adds the same runs to both sides. Re-measure
     after (1); if it still fails, the bar moves with a comment saying why (it guards 98 in 100).
  3. Rerun the six files: `pnpm --filter @tp/model-gateway exec vitest run src/redact.leaks.test.ts src/redact.test.ts
     src/redact.residuals.test.ts src/redact.property.test.ts src/functions/denial-letter.test.ts`, packets'
     `verifier-identifiers.test.ts`, `@tp/redact`. Failing-first evidence for the description: run the new describe
     against the base's `redact.ts` copied in (not done).
  4. The gate against f3f5a642: `/home/user/gate` is the gate's folder copied; A is `/home/user/snapA`, B
     `/home/user/snapB` (each `packages/model-gateway/src` plus `redact.ts` and `confusables.ts` copied into it from
     `packages/redact/src`). A run on the first prototype was started (`/home/user/gate-out/i26-1`) and **not read**;
     it predates the forms filter, so run it again on the final tree. Then W5's and W13's battery with their seeds and
     fresh ones (`designs/lane-b-redact-ssn-phone-leaks/battery/README.md`; "head" is the new `redact.ts`).
  5. The records in the product repository: ADR 0054's amendment (the construction, the three rules, the measured
     cost, what is left), `docs/product/test-matrix.md` MOD-23, and the residual sentences of the 2026-10-27 and
     2026-11-11 amendments that this closes (`jo ann`, K-1, MOD-23).
  6. Two adversarial reviews (PHI: what is sent; must-stay and the other-patient screen), at most two fix rounds, the
     full suite once, the base merged, the gate again, the draft PR, CI, the merge (the brief's steps 3 and 4).
- **Decisions taken, each for the safer reading, to carry into ADR 0054:**
  - The blunt name rule (a space or a period joins anywhere inside a part). It replaces "in a" for a patient INA, "is a"
    for ISA, "as a" for ASA, "to be" for TOBE: two words of a letter, never a refusal. MOD-13's phrase property used
    exactly those names; it now uses names no phrase writes, and the cost is pinned beside it.
  - The wider reading is the letter reader's only; the narrative's check and the packet verifier read as the base does.
  - N-1 and N-2 are not closed (no rule here touches what the base offers the screen); they stay recorded.
- **Handed to the orchestrator for the queue (told at 20:5x UTC with the design note):** the digits-only ID glued to a
  letter (not in this PR: it needs a floor on the number's length and its own measurement; W17's view is that it should
  land before real PHI); a name the records hold with a plus sign; one piece of a stored number alone; the narrative
  drafter's check not reading stored separators.
- **Container paths (may be gone):** `/home/user/tree-base` (f3f5a642, detached), `/home/user/work` (`cmp.mts`,
  `name-forms.mts`, `p6.mts`, `cost-names.mts`, `k1.txt`, `ts-resolve.mjs`; run with
  `export PATH=/opt/node24/bin:$PATH NODE_OPTIONS="--import /home/user/work/ts-resolve.mjs"`). If `@tp/redact` is not
  found by vitest, run `pnpm install --frozen-lockfile --prefer-offline` with `/opt/node24/bin` and `/opt/pnpm-bin` first.
- **The orchestrator approved the design as written** (its message queued 2026-11-11 20:16 UTC: one construction, the
  wider reading only on a letter the base's check sends, refuse on either reading; the costs accepted as the safer
  side). The glued-letter ID is Queues item 34, with the plus-sign name, the single piece of a stored number and the
  drafter's check; none of them is this item's.
- **Commands.** Gate: `cd /home/user/gate && bash run.sh /home/user/snapA /home/user/snapB /home/user/gate-out/<name>
  --workers 4` (copy the final `redact.ts` and `confusables.ts` into `/home/user/snapB/packages/model-gateway/src`
  first; read `report.md`'s counts and the `PHI.*` rows only). Battery: `designs/lane-b-redact-ssn-phone-leaks/battery/
  battery.sh` after its README's layout, "head" being the final `redact.ts`.
- **Review scopes, ready to launch once the open items 1 to 4 are done** (each about 20 tool calls, a report file under
  `designs/lane-b-redact-item-26/reviews/`, every finding run before any fix):
  - *Review A, PHI: what is sent.* Scope: the composition in `redactLetterForScreen`, `screenAsFirstRead`,
    `holdsAsFirstRead`, `holdsIdentifier`, `widerMatchesIn` and `redactionSpans`. Find a synthetic letter that
    f3f5a642 refuses and the head sends, or a span f3f5a642 replaces that the head shows (a differential fuzzer over
    both `redact.ts` files); then forms of the three gaps the head still sends (name pieces with other white space,
    a stored separator the class escape misreads, a CR beside other line endings).
  - *Review B, must-stay and the other-patient screen.* Scope: new refusals and new redactions against f3f5a642 (the
    gate's `KEEP.*` rows, names that split into words, CR LF letters, a wider match that makes the check refuse a
    letter the base sent), time on crafted letters, and that every candidate f3f5a642 offers the screen is offered.
- **The gate on the first prototype, read after the hand-over** (`designs/lane-b-redact-item-26/gate/report-prototype.md`;
  A is f3f5a642, B the prototype before the forms filter and the last test fixes, so it is an indication, not the
  run of record): 975,489 letters, 13 differ; **no PHI class**, nothing unplaced, no letter newly refused (462,984
  refused on both trees); 13 letters with ordinary text newly replaced (`KEEP.changed.text`) and 3 with a short name
  part, the recorded cost; slowest crafted letter 1,616 ms against 1,050 ms on the base (budget 3,000 ms), so the two
  rows over 3 s in vitest are that test's heavier path (it also runs `mentionsIdentifier`) on a loaded machine, and
  open item 1 is still to fix and measure. The corpus holds 6,861 CR LF letters, none newly refused by the second
  line-ending reading, and no patient with a stored separator between digits (0 of 5,292, counted): P6 rests on its own
  rows, and K-1's closing on its rows and property; review A's fuzzer covers both.
- No PR is open, no subscription and no check-in is held.

## Log (UTC)
- 2026-11-11T20:06Z (W17): started; read STATE.md, item 26 and its citations, ADR 0054 and 0047.
- 2026-11-11 (W17): design note pushed (cee084c6) and sent to the orchestrator; prototype built; cost measured; tests
  written; WIP 7cbdd33d pushed. Stopped at the token limit with the items above open.
- 2026-11-11T20:28Z (W18): started from 7cbdd33d; time and run-count fixed at their causes; six files pass; WIP d67775d0; gate and batteries running.
- 2026-11-11T21:50Z (W18): reviews A and B in, every finding run; fix round 1 built and green (WIP b29e611a); the time bound made sound; stopped at the token limit before the delta review.
