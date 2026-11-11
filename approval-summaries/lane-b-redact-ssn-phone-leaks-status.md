# Lane B item: SSN and phone leaks (`co-001/redact-ssn-phone-leaks`; MOD-21, MOD-22)

Must land before any real PHI is processed (ruling A, 2026-11-07 10:53 UTC; the founder owns launch). Two adversarial reviews.
Counters MOD-21 and MOD-22 are allocated (2026-11-06 21:03 UTC); no new ADR is expected (an ADR 0054 amendment). Any other
counter comes from the orchestrator.

## RESUME-BLOCK (W5, session_019i9ifC8ouxG6CLPdZtgAcJ; current at 2026-11-11 09:12 UTC)
- **State:** the code is at **f0d6e914** = WIP `co-001/wip-redact-ssn-phone-leaks` on origin (typecheck and lint clean;
  worktree `/home/user/leaks`, branch `co-001/redact-ssn-phone-leaks`, not on origin; no PR). Not merged, not reviewed
  to the end: **the review of the fix round's delta is owed** (below), and **the tests are not yet brought to the code**.
- **Blocker met at about 07:50 UTC:** the account's usage limit stopped the two delta reviewers and the test builder
  mid-run (each ended with "out of usage credits"; none wrote a report), and the container restarted at 09:00 UTC. The
  files survived. A stopped agent counts as no review. The session itself kept running.
- **What is done since the two build reviews** (their findings and reproductions: `designs/lane-b-redact-ssn-phone-leaks/
  reviews/b1` and `b2` on this branch; the design note beside them states every rule):
  - The fix round (405314b4, a64cc9af): the look-alike fold for the call's own identifiers only; a match ef3e8d20 did not
    make applied by the letter reader only where the scan as ef3e8d20 read it does not refuse the letter without it;
    structure decides the glued shape; digit-for-letter forms of five characters or more; the smaller fixes.
  - Three corrections from replaying the gate on it (0105cd96): a person's label refuses the glued shape only with a clean
    start or structure before it; a number in parentheses is a list number only before a colon; the year of a date written
    with its month's word, glued before the shape, is another number's.
  - **f0d6e914, from the stopped PHI reviewer's own files** (`reviews/c1`: its reproduction script, triage and fuzzers; every
    row re-run by W5, all 33 now read as ef3e8d20 or safer): the call's own identifiers are read as ef3e8d20 read them
    first (the plain fold), and the look-alike reading only adds, each addition a fresh match; the patterns read the
    settled matches alone; the glued checks run on both folds in the strict check; the glued-label space is a second
    reading, never a replacement; the check's patterns read through the call's own placeholders, so whatever redaction
    left as written is found again and the letter refused.
- **Measured on f0d6e914:** pinned rows ruling A 697 of 697 (632 refused, 65 redacted), ruling A' 406 of 406 (200 redacted,
  206 refused), ruling B 5 of 5; the three reviews' reproduction scripts (b1, b2, c1) read as before or safer.
  **Not yet run on it:** the reviewers' fuzzers, the must-stay fuzzers, MOD-16's stress, the gate, the six test files.
- **Gate on 405314b4 (before the corrections; outputs `/home/user/gate-out/p8-*`, not kept):** no PHI class against either
  tree; against ef3e8d20: dates changed 309, refused that ef3e8d20 sent 3,435 clean, 605 after an SSN or phone word, 7,697
  with identifiers (a64cc9af turned 3,815 of these back into redactions; 0105cd96 the 287 parenthesised list numbers);
  slowest 1,134 ms against cc3dd7f6's 752 ms on a loaded machine (budget 3,000 ms).
- **Tests:** the earlier builder's six files pass at aea2852d (3,675 tests). At f0d6e914 they are NOT brought to the code:
  about 26 expectations pinned before the fix round fail on purpose (nine rows of `redact.leaks.test.ts`, four "recorded
  residual" rows and one timing row of `denial-letter.test.ts`, eleven residual rows fixed by the regenerated table, which
  is committed), and the fix round's rules have no tests of their own yet. The base's property tests (MOD-13, MOD-15,
  MOD-16) passed at a64cc9af.
- **Next, in order:** (1) the fuzzers and the gate on f0d6e914; (2) the tests brought to the code and new fixed tests per
  rule (B1-1 to B2-9, C1-1 to C1-4), the five MOD-16 seeds; (3) **two adversarial reviews of the fix round's delta
  (aea2852d to the head), each with a narrow scope, about 20 tool calls, its report as its final message**, every finding
  verified before it is fixed; (4) the final gate; (5) ADR 0054's amendment (draft `/home/user/work/adr-amendment.md`, not
  kept; its text predates f0d6e914) and test-matrix rows MOD-21 and MOD-22; (6) the full suite once, the base merged
  (the packets verifier's fold may have moved `redact.ts` to `packages/redact/src/`: `confusables.ts` and the new tests move
  beside it by hand), the push, the draft PR from the template, CI, the merge under rule 2a, one line to the orchestrator.
- **MOD-23** (allocated 2026-11-11, `LANES.md` Queues item 26): `Zephy ra`, `Zephy. ra` and `Z e p h y r a` are sent in
  clear outside a held letter on cc3dd7f6, ef3e8d20 and this head alike. Reproduce:
  `cd designs/lane-b-redact-ssn-phone/gate/leaks-scripts && node --import ../ts-resolve.mjs name-forms.mts <redact.ts of each tree>`.
- **Container paths (not kept):** `/home/user/fix` (scratch copy of the head's `redact.ts`), `/home/user/gate` and
  `/home/user/gate-out`, `/home/user/tree-cc3`, `/home/user/tree-ef3`, `/home/user/work` (fuzzers `d1p6/`, `d2p6/`, `b1fix/`,
  `b2fix/`; `stress16.mts`; `p8/` outputs), `/home/user/review-b1`, `-b2`, `-c1`, `-c2` (the reviewers' scratch).
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
