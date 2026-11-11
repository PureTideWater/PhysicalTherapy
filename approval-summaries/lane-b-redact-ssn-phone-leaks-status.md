# Lane B item: SSN and phone leaks (`co-001/redact-ssn-phone-leaks`; MOD-21, MOD-22)

Must land before any real PHI is processed (ruling A, 2026-11-07 10:53 UTC; the founder owns launch). Two adversarial reviews.
Counters MOD-21 and MOD-22 are allocated (2026-11-06 21:03 UTC); no new ADR is expected (an ADR 0054 amendment). Any other
counter comes from the orchestrator.

ACTING (Lane A's account, https://claude.ai/code/session_019i9ifADZcDuzjeUkfedYiW) holds this item from 2026-11-11 (the orchestrator's start, 16:40 UTC by its clock); Lane B: read lanes/lane-b.md's latest entries before resuming.

## MERGED: #146 as f3f5a642 (2026-11-11 20:04 UTC, W13). Nothing to resume; W13 holds nothing

- **The merge.** Pull request #146 (`co-001/redact-ssn-phone-leaks`, head 7bb7e7ac) merged into `claude/build-platform`
  as **f3f5a642** on green required checks (`all green`, `mutation`, `screening-capacity gate`, `approval-of-record`; all
  36 check runs passed, none re-run), the base ea8f200f an ancestor of the head. No migration. W13 is unsubscribed, its
  check-in is cancelled, and the orchestrator has the merge in one line.
- **What W13 changed, each by a ruling.** ac412151: OPEN 1 fixed by the one condition in `matchesIn` (a pattern's match
  is withheld only for a glued run that no match of the call's own covers whole); K-1 and review K's lesser forms pinned.
  247a53e3: review L-1 (ruling 17:23 UTC), the other-patient screen reads the letter once more with the call's own
  matches alone replaced. c9dddaa7: review M-1 (ruling 18:02 UTC, the last change to `redact.ts`), that reading follows
  `merge`'s rule R6b. 052ff9e5: review N's N-1 and N-2 recorded and pinned, with ADR 0054's amendment. d06e772d: the
  worker's bundle test and the watched list name the look-alike table. cc6a914c and 7bb7e7ac: the base merged at
  91bc6b7c, then ea8f200f.
- **Still open, for `LANES.md` Queues item 26, before any real PHI** (each recorded in ADR 0054's amendment of
  2026-11-11 and pinned in `packages/model-gateway/src/redact.leaks.test.ts` as it behaves today): review K-1 (a CR LF
  counts two against a label's reach); MOD-23's two name forms; review N-1 and N-2 (the screen is asked about an own
  identifier inside a hidden number, joined to what follows or in another script's digits); and, recorded since the
  amendment of 2026-10-27, a digits-only member ID or claim number glued to a word.
- **Records.** Reviews L, M, N: `designs/lane-b-redact-ssn-phone-leaks/reviews/l/VERIFIED.md` and the reports beside it.
  The battery, the gates, the suite and the description as sent: `designs/lane-b-redact-ssn-phone-leaks/w13/`. The WIP
  ref `co-001/wip-redact-ssn-phone-leaks` and the branch are merged history and may be deleted by whoever tidies refs.

## RESUME-BLOCK (written by W5, session_019i9ifC8ouxG6CLPdZtgAcJ, for a successor; current at 2026-11-11 16:37 UTC; W5 has stood down)

W5 stood down under the orchestrator's limit of 15:40 UTC (no further fix round in that session): the battery on the
last round found one letter that needs a fix or a ruling (below). Nothing else is open. Everything named here is on
`claude/build-ops` under `designs/lane-b-redact-ssn-phone-leaks/` unless a path says otherwise.

- **State.** WIP `co-001/wip-redact-ssn-phone-leaks` on origin = **74c32149** (cut from `claude/build-platform` at
  ef3e8d20; the file is still `packages/model-gateway/src/redact.ts`, the base's fold #141 moved it to
  `packages/redact/src/`). Branch `co-001/redact-ssn-phone-leaks` is not on origin; no pull request; nothing is
  subscribed and no check-in is scheduled. On 74c32149: the six redaction test files pass (4,096 tests; `cd
  packages/model-gateway && npx vitest run src/redact.test.ts src/redact.property.test.ts
  src/functions/denial-letter.test.ts src/redact.residuals.test.ts src/redact.leaks.test.ts src/confusables.test.ts`);
  typecheck and eslint clean; the pinned rows read ruling A 697 of 697 (632 refused, 65 redacted), A' 406 of 406 (200
  redacted, 206 refused), B 5 of 5 (`node rows.mts <redact.ts>` from the gate's `leaks-scripts/`), and the residual table
  needs no change (`designs/lane-b-redact-ssn-phone/gate/residual-scripts`: `node --import ../ts-resolve.mjs
  gen-residual6.mts --check`). The base is 3bff4fd6 (#142), unchanged since the merge rehearsal.
- **What is built** (the rules, their counts, costs and residuals: `adr-0054-amendment-draft.md`, current for
  74c32149). Two tiers (every letter: what a shape's structure decides; a held letter: the strict reading, as cc3dd7f6
  refused it). ef3e8d20's reading stands and this one only adds: its own matches are settled, a fresh match is applied
  only where the letter is not refused without it (`appliedMatches`), and the survivor scan reads a text once more as
  ef3e8d20 read it wherever its own reading may hold less (`survivorIn`, `departs`). Round K (74c32149) withdrew the
  reading of a label that stands over its number, which had failed four reviews running, for one rule: a listed noun
  names its number with one line break at most inside the label and one at most before the number (`named()` in
  `gluedShape`); a CR LF is one line break; a `+` is no connector; after a spaced year only an amount's cents make it an
  amount; `Phone #:` and `Medicare ID No.` are a label right before its number.
- **Reviews.** Design x2; build x2 (B1, B2); C1 and C2 cut off (no review; rows re-run and fixed); then each fix
  round's delta: D1 and D2, E1 and E2, G1 and G2, H1 and H2, I1 and I2, J (one reviewer, three lenses), and **K on
  74c32149, which ran to its report** (`reviews/k`, `reviews/README.md`): no letter ef3e8d20 refuses sent and no digit
  shown that it redacts in 192,590 generated letters, no must-stay finding outside the recorded costs, no slow letter;
  one major by its brief's definition, K-1, and five minor forms, all recorded as residuals in the amendment draft
  (finding 2 below). So 74c32149 has its review. **Any further change to `redact.ts` needs a review of its delta**
  (one reviewer with the three lenses is enough for a few lines; briefs to copy: `reviews/brief-k.md` and
  `reviews/recorded-for-the-eighth-review.md`, the recorded list to hand it). A dead or empty agent never counts.
- **OPEN 1, to be FIXED before the merge (the orchestrator's ruling, 16:30 UTC): the withheld match** (`open-findings/README.md`,
  with `pe.mts`, `pe2.mts` and their outputs). For a patient whose one member ID ends another (`ZZ7654321` and
  `7654321`), with the ID written with a look-alike, ef3e8d20's own SSN match that begins in the ID's last digit is
  withheld (`matchesIn`'s last loop) on the assumption that the check refuses the run, but the longer ID's placeholder
  replaces the whole run: `"ID ZZ76543\ua6ef1\n01-02-2020"` is sent as `ID [MEMBER_ID]\n01-02-2020` where ef3e8d20
  sends `ID ZZ76543<U+A6EF>[SSN]`. The head shows a date ef3e8d20's redaction replaced (and hides the ID ef3e8d20 shows
  seven characters of): the one known exception to "ef3e8d20's reading stands". On every head since 91e1527a at least,
  not from round K; in 7,600 probes no real SSN or phone is shown that way. Found by `fz.mts 120 5923`
  (`SENT_WITHHELD 1, SHOWS 1`; 0 on every earlier run). The fix is one condition (the recipe and what to check are in
  the README); W5 did not build it. The ruling: fixed, not recorded (a date the base redacts must not be shown by this
  pull request), by the one-condition fix in `matchesIn`, with a test from that seed that fails first, and one review
  of the delta.
- **OPEN 2, recorded, no change proposed: K-1.** A label's reach (`LABEL_REACH`, 24) is counted in characters and a CR
  LF counts two, so `"SSN on file. Statement\r\nNo. 900-12-3456150.00"` is named by its noun and sent while its LF
  writing is refused. ef3e8d20, cc3dd7f6 and every head of the build but f2f9f05e send it
  (`open-findings/k1-on-seven-trees.txt`); f2f9f05e refused it only through the defect J-3. It is in the amendment
  draft's residuals. Rows to pin with the next test change are in `open-findings/README.md`. The orchestrator ruled at
  16:30 UTC that it stays recorded, and queued it in `LANES.md` Queues item 26 (before any real PHI).
- **The battery and the gate on 74c32149 (15:38 to 16:27 UTC): clean but OPEN 1.** `battery/battery.sh` is the command
  with its seeds, `battery/README.md` the container layout it needs, how to rebuild it and what a clean run reads.
  Reproduction scripts: no line differs from f2f9f05e's run. Every PHI fuzzer: 0 letters ef3e8d20 refuses that the head
  sends but the month-named patient's (ruling B). The audit copy: `DEPART` 0 (368,640 letters over the last four
  heads). The reviewers' generators: base flags 0; what changed against f2f9f05e's run is the layouts given up, now
  refused. Must-stay: 72 of 12,000 and 359 of 20,000 as before. **The gate: no PHI class against ef3e8d20 or
  cc3dd7f6** (the acceptance: SSN 0, phone 0); every class letter for letter as on 24ad1075 but one more SSN letter
  closed (`revdiff.mjs`). Against ef3e8d20: SSN 16,325, phone 10,703, name 12,645, initial 635, date of birth 44 letters
  more redacted or refused; must-stay refused 3,877 with identifiers, 603 after an SSN or phone word, 3,359 others;
  changed: date 308, number 17, amount 1; unrefused 32 and 1. Against cc3dd7f6: 2,882, 7,479 and 573; unplaced 385;
  slowest letter 1,035 ms (cc3dd7f6 514 ms; budget 3,000 ms). The amendment draft carries these numbers; read them
  again after any further round. Start the gate with no lock around it (`run.sh` takes `/tmp/laneb-heavy.lock` itself).
- **What remains to the merge, in order.**
  1. OPEN 1: a row in `redact.leaks.test.ts` for the seed-5923 letter with the two member IDs that fails first, then
     the fix in the worktree, rows on both sides and the K-1 rows; the six files, typecheck, eslint, the pinned rows, the residual table's
     check; commit; push the WIP ref (`git push -q origin HEAD:refs/heads/co-001/wip-redact-ssn-phone-leaks` from the
     worktree, through the hook).
  2. A review of that delta; the battery with fresh seeds and the gate on both trees (`battery/battery.sh`); replay
     the gate's classes against the numbers above. Verify every finding before fixing; a finding ef3e8d20 and the tree
     before send too, beside a rule, is a residual to record.
  3. The docs commit: put `adr-0054-amendment-draft.md` at the end of `docs/adr/0054-*.md` (no placeholder is left
     in it; to bring current: the last round's rule and its review in the *Reviews* paragraph, and the gate's and
     fuzzers' numbers if they moved. The counts of gate letters that turn on a number in parentheses after a label, 275
     and 237, were measured on 74c32149 by `docs-scripts/paren.mts` against a copy of the head whose `listNumberAt`
     reads `(n)` only before a colon: in its line `opened ? /^(?:ST|ND|RD|TH)?[ \t]?\)/u.test(after)` the pattern ends
     `\)[ \t]?:/u`); bring MOD-21's row to the rules with `docs-scripts/rows.py` (run in the worktree; it
     edits `docs/product/test-matrix.md` and `packages/synth/src/cases/matrix.ts`), then `pnpm -s synth --case MOD-21`
     and `--case MOD-22` for the fixture records; settle review K's comment notes.
  4. The eight seeds on the property and leaks files: `FC_SEED=<n> npx vitest run --config
     <docs-scripts/seed>/vitest.seed.config.mts src/redact.property.test.ts src/redact.leaks.test.ts` for 1034253323,
     -1074798020, 383403599, -460602131, -594136649, 7777777, -31415926, 271828182 (the config names absolute paths:
     set them first).
  5. The base merged once, right before the last push: `base-merge/base-merge.sh` in the worktree on the branch
     (rehearsed at 13:10 UTC on 3bff4fd6: clean; fetch first; it stops before the commit). After it, by hand:
     `gen-residual6.mts`'s paths in ops (the file moves to `packages/redact/src/`).
  6. The full local suite once on the merged head: `docs-scripts/suite.sh` (PostgreSQL 18 on 5433: `su postgres -c
     "/opt/pg18/bin/pg_ctl -D /root/pgdata18 -l /tmp/pg18.log -w start"`; pyx12 4.0.0 in a venv named by
     `TP_ORACLE_PYTHON`; paths at its top).
  7. `git push -u origin co-001/redact-ssn-phone-leaks` through the hook; the draft pull request into
     `claude/build-platform` from `.github/pull_request_template.md` (`pr-body-draft.md`; its `@@CHECKS@@` is the
     suite's table, its `@@REVIEWS@@` is `pr-reviews-draft.md`, whose K row and any later round's row are to write);
     subscribe to it and end the turn while CI runs; merge under rule 2a when verified, the required checks green and
     `origin/claude/build-platform` an ancestor of the head; one line to the orchestrator; stand down.
- **MOD-23** (allocated 2026-11-11, `LANES.md` Queues item 26): `Zephy ra`, `Zephy. ra` and `Z e p h y r a` are sent in
  clear outside a held letter on cc3dd7f6, ef3e8d20 and this head alike; pinned in `redact.leaks.test.ts`. Reproduce:
  `cd designs/lane-b-redact-ssn-phone/gate/leaks-scripts && node --import ../ts-resolve.mjs name-forms.mts <redact.ts of each tree>`.
- **Rules that bind the successor as they bound W5.** Only synthetic twins anywhere. Every commit ends with
  `Co-Authored-By: Claude <noreply@anthropic.com>` and the session's `Claude-Session:` line; no model is named in a
  file, commit, pull request or comment; nothing already pushed is rewritten. Never `--no-verify`, never a forced push,
  never `.gitleaksignore`, never a file written through the GitHub connector; push `claude/build-ops` from the hooked
  main checkout (`git pull --rebase` in the ops worktree on a refused push). At most two subagents at a time, each with
  a named scope and its report as its last message; gate and suite output to files. Reports go to the orchestrator of
  record in `lanes/STATE.md` (session_019i9ifBCrxfV35CFDVHLTad): merges, blockers and founder asks, one line each.
- **Container paths (not kept; W5's container may be gone):** the worktree `/home/user/leaks`, `/home/user/fix` (the
  head's two files for the reviewers' scripts), `/home/user/fix3` (the audit copy), `/home/user/snap16`,
  `/home/user/gate`, `/home/user/gate-out/p16-*` and `p14-*`, `/home/user/tree-ef3`, `/home/user/tree-cc3`,
  `/home/user/work` (`p16/` holds this round's outputs), `/home/user/review-*`. `battery/README.md` rebuilds them.

## W1's hand-over block (written by W1, session_019i9if9bThP3wWKpHBiU3m8, 2026-11-11 02:50 UTC, for the builder)
- **State:** not cut, no PR, no live WIP ref. Cut `co-001/redact-ssn-phone-leaks` from `claude/build-platform` at or after
  **ef3e8d20** (#138, MOD-16's fix). `co-001/redact-ssn-phone` (d333d70d) and `co-001/wip-redact-ssn-phone` (ef901af6) belong
  to the merged #127, and `co-001/wip-redact-range-glued` / `-b` to the merged #138: none is a base for this item.
- **The module after #138** (`packages/model-gateway/src/redact.ts`, about 3,500 lines; `denial-letter.ts`'s `prepare` calls
  `redactLetterForScreen`, then `holdsIdentifier` refuses a letter that still holds an identifier):
  - Each letter's digit chains are scanned with two sets of barriers: "kept" (what cc3dd7f6 read: currency amounts, dates as
    written, same-kind ranges) and "held" (the range fix's: a date-amount range, a date read with a glued word blanked, other
    dashes). A letter whose chain only the held barriers break is a **held letter**; `heldOwnIdentifier` then refuses it if
    any form of the call's own identifiers a rule reads stands in it (name parts, initials together or split, the date of
    birth with gaps, birth labels, member and claim cores).
  - Outside held letters, `ownIdentifierGlued` (`nameGlued`, `numberGlued`) refuses an own identifier glued where no pattern
    reads the boundary; `numberSuffix` and `numberLetter` exempt a number's own letters (units, ordinals, times, a code's
    modifier, an ICD-10-CM code's last character).
  - ADR 0054's amendment of 2026-11-04 holds every rule and count, review rounds 1 to 5 and the re-review at its end.
- **Acceptance (rulings A and A'):** every pinned row of `redact.residuals.json` classes `ssnPhone` (697 rows: ruling A,
  the gate's SSN 385 and phone 171 letters plus the review rounds' rows) and `ownIdentifierA` (406 rows: ruling A') flips to
  redacted or refused, with the generator and the patterns changed together; never by weakening MOD-16 or a test.
  `redact.residuals.test.ts` asserts each row as sent today, so each flip fails there and is regenerated by the scripts,
  never by hand. Ruling A' asks for an OCR and homoglyph fold before own-identifier matching: NFKC, a TR39-style confusable
  skeleton, and O/0, l/1, I/1, S/5, B/8, with must-stay damage measured on the gate. Ruling B (`monthWordName`, 5 rows: a
  name part that is a month's word next to a date) is a named case for the design. `loneInitial` (938) and `failSafe` (243)
  are recorded classes, not this item's acceptance.
- **Reproduce the pinned rows:**
  - The rows themselves: `cd packages/model-gateway && npx vitest run src/redact.residuals.test.ts` (2,291 assertions).
  - The gate (on `claude/build-ops`, `designs/lane-b-redact-ssn-phone/gate/`; read `README.md` and `KEEP.md`):
    `bash run.sh <checkout of cc3dd7f6> <checkout of the head> <outdir> --workers 4`, about 7 minutes cold, under
    `/tmp/laneb-heavy.lock`. At ef3e8d20 its summary reads `PHI: ssn 385, phone 171, name 5`, refusals 60 / 7,014 / 598,
    changed 0, unplaced 523; the rows are in `<outdir>/hits/PHI.ssn.*.jsonl` and `PHI.phone.*.jsonl`. Copy the gate out of
    the ops worktree before a run (it writes `cache/` and `trees/` beside itself). Keep cc3dd7f6 as tree A for the acceptance,
    and run ef3e8d20 as tree A too: this item must send nothing ef3e8d20 protects.
  - `tests.sh <tree> <outdir>` runs the redaction files under MOD-16's seeds; it expects a checkout with `node_modules` at
    `/home/user/redact-range-glued` (a symlink to the worktree does). `residual-scripts/` wrote the table (the round-5
    re-tag is `gen-residual5.mts` and `write-residuals5.py`); the scripts carry absolute paths to set first.
- **Findings from MOD-16's rounds that bear on SSN and phone:**
  - An own name glued between an SSN or phone label and its number cuts the label, so the number is not read (PHI3-1,
    PHI3-2; candidate A regressed 65,000 gate letters this way). Any new label rule is checked against it.
  - A date read over a label or a glued word can end in the first digits of an SSN written after it, leaving the rest
    unread ("3rd—01|90 0-12-3456", "150.00-$10-<LF>SSN 9.00 12 3456Paid"): cc3dd7f6 sends these; #138 refuses 12 such
    gate letters by not marking those dates as barriers, at the cost of clean-letter refusals in a neighbouring family
    (ADR 0054, "F6's neighbours": 784 and 170 of 6,000; 83 of 70,000). Once these shapes are read as SSNs, that barrier
    decision can be taken again.
  - The fail-safe after an SSN or phone word (7 or more digits after the word, no placed number) refuses 7,014 gate
    letters cc3dd7f6 sent, and 523 letters are "unplaced" (GATEWAY2-1): both move when the patterns widen; report them.
  - The MOD-15 generator no longer draws a fixed survivor's digits as the call's own member ID or claim number
    (`notASurvivor`); a generator change here keeps that filter.
  - The initials rule refuses most held letters of patients with common initials (ADR 0054, "PHI5-1's cost"); this item
    designs own-identifier matching and may narrow it with its own measurement.
- **The read-only hunt** (wf_8da6dd19-398, at cc3dd7f6, 2026-11-06): round 1 reported 52 candidate classes (digit-glued 13,
  letter or mask-glued 13, barriers 10, characters 16). Only those counts were recorded: its `rg-leaks/verified.md` was in
  the scratchpad of a session that ended, its round-2 skeptics, rounds 3 and 4 and the synthesis never ran, and no file on
  `claude/build-ops` holds the classes. The pinned residual rows and the gate's hit files are the recorded evidence; a new
  hunt, if wanted, starts from them.
- **Running the suites in a container:** `test:db` and `test:e2e` need
  `DATABASE_URL=postgres://postgres:test@localhost:5433/postgres` (PostgreSQL 18; the default port 5432 is 16 and fails the
  `line_status_heads` migration). Push `claude/build-ops` from the hooked main checkout, not from the ops worktree.

## Log (UTC)
- 2026-11-11T02:50Z (W1): this file created with the RESUME-BLOCK, after #138 merged as ef3e8d20. The build is W5's.
- 2026-11-11T02:53Z (W5): started 02:37Z; branch cut at ef3e8d20; the gate and the pinned rows reproduced; the rows classed by shape.
- 2026-11-11T03:22Z (W5): prototype pushed as WIP; ruling A and B rows flip; the gate run on both trees; ruling A' next.
- 2026-11-11T03:34Z (W5): the fold built (ruling A' rows flip); the design written; two design reviews and the gate running. The orchestrator: finish the item in this session.
- 2026-11-11T04:53Z (W5): both design reviews delivered and fixed; the gate on f7da95fe reads no PHI class against either tree.
- 2026-11-11T05:47Z (W5): the gate on 04c2d4a5 read no PHI class but closed fewer leaks than f7da95fe; the narrowing withdrawn and two naming faults fixed in 5d10e0de; MOD-23 pinned; a builder writes the tests. (The four entries above first carried clock times that were estimates and wrong; they now carry their commits' times.)
- 2026-11-11T06:05Z (W5): the gate on 5d10e0de reads no PHI class against either tree, letter for letter as f7da95fe; a currency amount glued to a shape closed in aea2852d (111 gate letters). The builder still writes the tests.
- 2026-11-11T07:06Z (W5): the builder's tests in (WIP 360824db); both build reviews delivered and reproduced: four regressions against ef3e8d20 and two claimed-closed forms (review 1), five major must-stay findings (review 2). The fix round is in progress in a scratch worktree.
- 2026-11-11T07:31Z (W5): the fix round for both build reviews is built (WIP 405314b4): every regression row reads as ef3e8d20 or safer, review 1's fuzzers find 0 un-refusals, the pinned rows hold; 26 tests wait for their expectations; the gate runs.
- 2026-11-11T09:12Z (W5): the usage limit stopped the two delta reviewers and the test builder at about 07:50Z, with no reports; the container restarted at 09:00Z. The gate on the fix round read no PHI class; three corrections from its replay (0105cd96); the stopped PHI reviewer's reproductions re-run and fixed (f0d6e914). The delta review is still owed.
- 2026-11-11T09:38Z (W5): the cut-off must-stay reviewer's reproductions re-run and fixed too; the tests brought to the code (six files pass at 19454724); WIP 0ddfa078; the fuzzers and the gate run on it. The delta review is still owed.
- 2026-11-11T12:19Z (W5): E1 and E2 reported on 5d685267 (eight PHI findings, six must-stay; one a fault: a label's list number counted in the chain); each run first, fixed in 8e599038 (six test files pass, pinned rows hold). The review of that delta (G1, G2), the fuzzers and the gate run.
- 2026-11-11T13:05Z (W5): the fuzzers on 8e599038 found 22 letters ef3e8d20 refuses that it sent, and G1 the same as its blocking finding; G2 found three must-stay regressions. Fixed in d3657ba2 and a66fee45: the scan now keeps ef3e8d20's reading by construction, and the round narrows what the one before over-broadened (six test files pass, pinned rows hold). The review of that delta (H1, H2), the fuzzers and the gate run.
- 2026-11-11T13:56Z (W5): H1 and H2 reported on a66fee45: the scan's by-construction claim held; one older letter family the base refuses for its own control character, four give-backs wider than recorded, three new must-stay regressions. Fixed in 24ad1075 (six test files pass, pinned rows hold). The review of that delta (I1, I2), the fuzzers and the gate run.
- 2026-11-11T14:44Z (W5): I1 and I2 reported on 24ad1075: no PHI regression; the check hung on a long rule of underscores (both), five must-stay and consistency findings. The gate on 24ad1075 read no PHI class on either tree. Fixed in f2f9f05e (six test files pass, pinned rows hold). One reviewer reads that delta; the fuzzers and the gate run.
- 2026-11-11T15:39Z (W5): reviewer J reported (five major, none blocking); round K, 74c32149, withdraws the label-over-number
  layouts for one rule and records the cost; its delta review (K), the battery and the gate are running.
- 2026-11-11T16:37Z (W5): review K ran to its report on 74c32149 (K-1 recorded); the gate reads no PHI class on either tree; the battery's
  instrumented fuzzer found the withheld match (open, a one-condition fix not built). W5 stood down under the
  orchestrator's limit; the RESUME-BLOCK is the hand-over.
