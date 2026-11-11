# Lane B item: SSN and phone leaks (`co-001/redact-ssn-phone-leaks`; MOD-21, MOD-22)

Must land before any real PHI is processed (ruling A, 2026-11-07 10:53 UTC; the founder owns launch). Two adversarial reviews.
Counters MOD-21 and MOD-22 are allocated (2026-11-06 21:03 UTC); no new ADR is expected (an ADR 0054 amendment). Any other
counter comes from the orchestrator.

## RESUME-BLOCK (W5, session_019i9ifC8ouxG6CLPdZtgAcJ; current at 2026-11-11 15:39 UTC)
- **State:** WIP `co-001/wip-redact-ssn-phone-leaks` on origin = **74c32149** (f2f9f05e plus the fix round after review
  J). The six redaction test files pass (4,096 tests); typecheck and lint clean; the pinned rows read ruling A 697 of
  697 (632 refused, 65 redacted), A' 406 of 406 (200 redacted, 206 refused), B 5 of 5, and the residual table needs no
  change. Branch `co-001/redact-ssn-phone-leaks` not on origin; no PR. Reports go to the orchestrator of record in
  `lanes/STATE.md` (session_019i9ifBCrxfV35CFDVHLTad).
- **Reviews so far:** design x2; build x2 (B1, B2); C1 and C2 cut off (no review; their rows re-run and fixed); D1 and D2
  on 0ddfa078; E1 and E2 on 5d685267; G1 and G2 on 8e599038; H1 and H2 on a66fee45; I1 and I2 on 24ad1075; **J (one
  reviewer, three lenses) ran to its report on f2f9f05e** (`reviews/j`): no blocking finding in about 33,400 letters,
  five major (J-1 to J-5), four of them in the reading of a label that stands over its number, which had now failed a
  review four rounds running. **Owed: a review of the delta f2f9f05e to 74c32149 (130 diff lines of `redact.ts`, most
  of them removals): one reviewer, K (brief `reviews/brief-k.md`, recorded list
  `reviews/recorded-for-the-eighth-review.md`).** It was started at 15:41 UTC in this session and reads `/home/user/fix`
  (= 74c32149); if this session ends before it reports, it does not count and is run again. A finding that the base and
  the tree before send too, beside a rule and not a regression, is a residual to record in the amendment, not a new round.
- **What 74c32149 changed (the decision and why):** the layout reading is withdrawn, not patched a fifth time. One rule
  stands: a listed noun names its number with one line break at most inside the label and one at most between the
  label's last word and the number. A rule drawn under a label, a blank line, a third line, a mark alone on a line: the
  number is read as any other, so such a letter is refused where its number asks for a name (eleven digits or more with
  a decimal suffix, a dashed shape with digits glued). That is the safer reading and its must-stay cost goes into ADR
  0054's amendment. With it: a CR LF is one line break (J-3); a "+" is no connector (J-5; a time bound is pinned for
  every connector repeated); after a spaced year only an amount's cents make it an amount, a comma ends the date (J-1);
  the date after a number's last four is read eight characters further; the label right before a number is read with
  two number words and two signs ("Phone #:", "Medicare ID No."). Over the 16,985 letters of every review so far, none
  that ef3e8d20 refuses is sent, and what is sent again that f2f9f05e refused is the CR LF labels and an amount after
  "September.," alone.
- **The gate last ran to its end on 24ad1075 (13:54 to 14:52 UTC): no PHI class against ef3e8d20 or cc3dd7f6.** Against
  ef3e8d20: SSN 16,324 letters more redacted or refused, phone 10,703, name 12,645, initial 635, date of birth 44;
  must-stay refused: 3,877 with identifiers, 603 after an SSN or phone word, 3,359 others; changed: date 308, number 17,
  amount 1; unrefused 32 and 1. Against cc3dd7f6: 2,882, 7,479 and 573; unplaced 385; slowest letter 1,019 ms (cc3dd7f6
  548 ms; budget 3,000 ms). On f2f9f05e the battery read clean (every PHI fuzzer 0 letters the base refuses that the
  head sends but the month-named patient's; the audit copy 0); its gate was stopped when round K was decided.
  **Running since 15:38 UTC on 74c32149:** the reproduction scripts, every fuzzer and every reviewer's generators
  (J's among them), the audit copy, then the gate on both trees (`/home/user/work/p16/fuzz-all.out`,
  `/home/user/gate-out/p16-*`, not kept; start the gate with no lock around it: `run.sh` takes the heavy-step lock
  itself). The must-stay "refused: others" class is expected to rise by the layouts given up; replay it against p14.
- **The scan keeps ef3e8d20's reading by construction (d3657ba2, 24ad1075):** `survivorIn` over `survivorRead`; wherever
  the strict reading reads a label ef3e8d20 did not or may hold less in a chain (`departs`), the text is read once more
  with `strict` false, which is ef3e8d20's scan line for line, and the worse answer is taken. The audit copy
  (`/home/user/fix3`) has printed nothing on any run, the reviewers' included.
- **The rules as built:** `designs/lane-b-redact-ssn-phone-leaks/adr-0054-amendment-draft.md` (current for f2f9f05e; to
  be brought to 74c32149's one rule and its cost and the final gate's numbers, then put at the end of ADR 0054 in the
  worktree).
- **Next, in order:** (1) reviewer K's report: run each finding, fix a regression, record a residual; (2) read the
  fuzzers and the gate on 74c32149 (no PHI class on either tree; replay class changes against p14); (3) the amendment
  into ADR 0054, the test-matrix row MOD-21 brought to the rules (`/home/user/work/p13/docs/rows.py`, its words on a
  rule or a blank line under a label taken out first; then `pnpm -s synth --case MOD-21`); commit; (4) the eight seeds
  (1034253323, -1074798020, 383403599, -460602131, -594136649, 7777777, -31415926, 271828182) on the property and
  leaks files; (5) the base merged once (below; rehearsed at 13:10 UTC on 3bff4fd6: clean), the full suite once on the
  merged head (`/home/user/work/p15/suite.sh`), the push through the hook, the draft PR from the template
  (`pr-body-draft.md` beside the amendment draft), CI, the merge under rule 2a, one line to the orchestrator.
- **The base merge (the fold, #141, merged at 11:20 UTC; the base is edab4d4d or later):** scripted and rehearsed from
  91e1527a in a scratch worktree at 11:30 UTC: `designs/lane-b-redact-ssn-phone-leaks/base-merge/base-merge.sh` (run in
  the worktree on the branch; it merges, resolves the three conflicts with `resolve.py` (test-matrix, `matrix.ts`,
  `registry.ts`: the base's MOD-19 and MOD-20, then MOD-21 and MOD-22), moves `confusables.ts` and its test to
  `packages/redact/src/`, points `redact.leaks.test.ts` at `@tp/redact`, corrects the package's "no import" words,
  installs offline and regenerates the two fixture records; it stops before the commit). After it, in the rehearsal:
  typecheck clean in redact, model-gateway, packets and synth; `packages/redact` 46 tests, the packets verifier's 108
  (its test that pins what the matcher does not read among them: that is why the joiners are the letter reader's),
  the registry's 23 and the gateway's redaction and narrative files 3,823, all passed. Still by hand after the real
  merge: `gen-residual6.mts`'s paths in ops. The mutation run covers ledger, money, packets and pricing.
- **MOD-23** (allocated 2026-11-11, `LANES.md` Queues item 26): `Zephy ra`, `Zephy. ra` and `Z e p h y r a` are sent in
  clear outside a held letter on cc3dd7f6, ef3e8d20 and this head alike; pinned in `redact.leaks.test.ts`. Reproduce:
  `cd designs/lane-b-redact-ssn-phone/gate/leaks-scripts && node --import ../ts-resolve.mjs name-forms.mts <redact.ts of each tree>`.
- **Container paths (not kept):** `/home/user/fix` (scratch copy of the head's `redact.ts`, = 74c32149), `/home/user/snap16`
  (the gate's snapshot), `/home/user/gate` and `/home/user/gate-out`, `/home/user/tree-cc3`, `/home/user/tree-ef3`,
  `/home/user/work` (fuzzers `d1p6/`, `d2p6/`, `b1fix/`, `b2fix/`, `c1fix/`, `d2fix/`; `stress16.mts`; `p9/`, `p10/` outputs;
  `p9/beforeF/` = 0ddfa078's `redact.ts`; `adrcheck/`), `/home/user/review-b1`, `-b2`, `-c1`, `-c2`, `-d1`, `-d2`.
- **Trailers:** every commit ends with `Co-Authored-By: Claude <noreply@anthropic.com>` and the session's
  `Claude-Session:` line. Nothing already pushed is rewritten.

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
