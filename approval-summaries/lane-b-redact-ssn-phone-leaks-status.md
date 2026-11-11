# Lane B item: SSN and phone leaks (`co-001/redact-ssn-phone-leaks`; MOD-21, MOD-22)

Must land before any real PHI is processed (ruling A, 2026-11-07 10:53 UTC; the founder owns launch). Two adversarial reviews.
Counters MOD-21 and MOD-22 are allocated (2026-11-06 21:03 UTC); no new ADR is expected (an ADR 0054 amendment). Any other
counter comes from the orchestrator.

## RESUME-BLOCK (W5, session_019i9ifC8ouxG6CLPdZtgAcJ; current at 2026-11-11 07:31 UTC)
- **State:** the fix round for the two build reviews is built: WIP `co-001/wip-redact-ssn-phone-leaks` = **405314b4** on
  origin (typecheck and lint clean; worktree `/home/user/leaks`, branch `co-001/redact-ssn-phone-leaks`, not on origin; no
  PR). **26 tests fail there on purpose**: expectations pinned to the code before the fix round (the residual table to
  regenerate with `residual-scripts/gen-residual6.mts`; nine rows of `redact.leaks.test.ts`; four "recorded residual" rows
  of `denial-letter.test.ts` that are now refused; one timing row whose near miss `6103034` is now a hit). The base's own
  property tests (MOD-13, MOD-15, MOD-16) pass.
- **Measured on the fix round's code:** pinned rows ruling A 697 of 697 (632 refused, 65 redacted), ruling A' 406 of 406
  (191 redacted, 215 refused), ruling B 5 of 5. Review 1's reproductions: every regression row reads as ef3e8d20 or
  safer; its fuzzers find no letter ef3e8d20 refused that the head sends (0 of 20,000 each on `fuzz1` and `fuzz2`, 0 of
  30,000 on `fuzz3`; the earlier reviewer's two: 0 of 10,000 on two seeds each). Review 2's reproductions: 114 of 141 rows
  read as ef3e8d20 again; the rest are the leak forms now refused and the recorded costs. **The gate, the must-stay
  fuzzers and the old generator's stress are running on it.**
- **How the fix round works (design note on this branch, `designs/lane-b-redact-ssn-phone-leaks/design.md`):** the
  look-alike fold is for the call's own identifiers only; a match ef3e8d20 did not make (a number a label names through
  the own identifier or a list number; an identifier in a form only this reading reads) is applied by the letter reader
  only where the scan read as ef3e8d20 read it does not refuse the letter without it; structure decides the glued shape;
  digit-for-letter forms need five characters.
- **Next:** read the gate and fuzzers; a review of the fix round's delta (two reviewers: it touches PHI) and the tests
  brought to the code (a builder); fix what the delta review finds; the final gate; ADR 0054's amendment (draft in
  `/home/user/work/adr-amendment.md`, not kept, written before the fix round) and the test matrix; the full suite once; the
  base merged; the push; the draft PR; CI; the merge.
- **Build review 1, PHI and regressions** (scratch `/home/user/review-b1`, `repro.mts` reproduces every row; all
  reproduced by W5): four regressions against ef3e8d20, two claimed-closed forms still sent, seven major, one minor.
  - B1-1: an invisible character hides the joined digit from the "stands alone" test, so a label read through the own
    identifier redacts one number of a chain ef3e8d20 refused (`Call Zephyra at 555-0123/<ZWSP>555-0124`). Fix: no
    syntactic test; the read-through redacts only in a letter the scan does not refuse without it.
  - B1-2: a name only the head reads (look-alike letters, a middle dot) ends the label window ef3e8d20 read through, so
    the number after a line break or with a digit after it is sent. Fix: the identifier is transparent across the one line
    break a plain label reads, and a number such a label names that is left in the sent text refuses the letter.
  - B1-3 and B1-14: the look-alike fold reaches the pattern and scan views, so a Cyrillic letter that looks like a digit
    cuts a label, and a keep-noun spelled in look-alikes keeps a number ef3e8d20 redacted. Fix: the look-alike reading is
    for the call's own identifiers only; every other view folds as ef3e8d20 folds.
  - B1-4: a literal U+0003 in a letter is the scan's own-identifier mark. Fix: the working text never holds the marks.
  - B1-5: a member ID read through a digit-for-letter form no longer chains with the number beside it. Fix: such an ID
    with a digit joined beside it is left for the check to refuse.
  - B1-6, B1-7: glued Social Security labels other than SSN and SOC SEC; the masked SSN glued in the gaps the masked
    pattern reads. B1-8 to B1-13: the phone's usual writing and a line wrap in the glued shape, a mirrored amount, list
    numbers after `Tel.` or in parentheses, digit look-alikes of letters, forms with a joiner inside, more date-of-birth
    writings in a held letter, a mark after a placeholder.
- **Build review 2, must-stay and logic** (scratch `/home/user/review-b2`, `repro.mts`; all reproduced by W5): no
  blocking finding, five major, four minor.
  - B2-1: the digit-for-letter rule takes ordinary tokens for names of four letters (`11am` for LIAM, `CO13` for COLE,
    `JAN31` refused for JANE). Fix: forms of five characters or more; a month and digits with no space is a date.
  - B2-2: the masked-SSN rule refuses masked account numbers in every letter (`Acct#XXXX1234`). Fix: outside a held letter
    only the SSN's own mask shape with both joiners.
  - B2-3, B2-4, B2-6: the glued-shape rule refuses references a noun does not name exactly (`Case No. A123-45-678901`,
    `Confirmation code 802-91-69413`) and lets any word with "#" or "No." un-refuse a leak form. Fix: structure decides
    (cents or a joined group after it, a currency amount or a joined group before it); a reference's noun names; an SSN,
    phone or Medicare label never does; with no structure the shape is read as cc3dd7f6 read it.
  - B2-5: in a held letter the verb "may" after the patient's day of birth is read as the month. B2-7: short Russian and
    Greek words fold to short names. B2-8: the held letter's placed structures miss ordinary writings. B2-9: a comment.
- **The builder's report** (tests at aea2852d): every form asked for is pinned; the residual table regenerated by
  `residual-scripts/gen-residual6.mts`; MOD-16's generator changed in three places (the second wider than briefed: a date
  not written year first is such a range end too); fifteen seeds pass; seven behaviour questions, the ones that change code
  taken into the fix round (an amount with a thousands separator glued after a run; a digit-for-letter form glued inside
  a longer run that a pattern redacts part of).
- **What 5d10e0de changed, and why (found by comparing two gate runs, 2026-11-11 05:40 UTC):** the commit before it
  (04c2d4a5) had narrowed the read-through of a label over the call's own identifier to "no word but a connecting one
  between the identifier and the number" and taken it out of the scan's read over numbers. Against ef3e8d20 that build
  still read no PHI class, but it closed 3,980 SSN, 2,641 phone and 186 name letters fewer than the build before it, and
  sent `Phone (Jane Zephyra, home): 555.0123` and `SSN (Jane Zephyra, patient): 90012-3456` with the number in clear, where
  ef3e8d20 redacts or refuses the same line without the name. 5d10e0de withdraws the narrowing (the safer reading: the
  identifier is transparent to a label, so the line reads as it does without it), and fixes two faults of 04c2d4a5's naming
  rule: "Paid" and "Medicaid" read as a word and "ID", and an SSN or phone label with "#" or "No." naming a reference
  (`SSN No. 900-12-3456150.00` is refused now). It also takes the middle dot and the hyphenation point as name joiners.
- **Design reviews (two adversarial, both delivered, every finding reproduced before it was fixed):**
  - PHI and regressions: two blocking (a label read through the patient's own placeholder or a list number let the patterns
    redact part of a chain ef3e8d20 refused whole). Fixed: such a label redacts a number only where its own words say
    nothing, it is written on one line and stands alone, a list number only before a colon; else the scan refuses under
    that label. The reviewer's fuzzers found 0 after the fix; they run again on 5d10e0de.
  - Must-stay damage and logic: three blocking (the glued-shape rule refused citations such as `29 CFR 2590.715-2719`; the
    fold mapped look-alikes before folding case; the read-through overrode a number a noun names) and six lesser. All fixed.
- **aea2852d, one rule more:** an SSN's or a phone's shape that starts inside a currency amount (`$150.00900-12-3456`,
  `$514451/293-6215`) is refused in every letter. The design said so and the build did not do it (a currency amount is a
  barrier, so the glued-shape rule never read it); found by running the ADR's recorded residual forms on the head. On the
  gate's corpus it changes 111 letters, each a reviewer's leak form now refused; MOD-16's old generator reads the same 359
  of 20,000 before and after. Its recorded cost: `$1500-12-2026` and `$1000/250/5000` are refused.
- **Gate (975,489 letters) on 5d10e0de:** against cc3dd7f6: no PHI class (SSN 0, phone 0, name 0); dates changed 298
  (ruling B); refused that cc3dd7f6 sent: 659 clean, 7,195 after an SSN or phone word, 2,096 with identifiers; unplaced
  386; slowest 727 ms (cc3dd7f6 438 ms; budget 3,000 ms). Against ef3e8d20: no PHI class; dates changed 308; refused that
  ef3e8d20 sent: 3,445 clean (about 3,400 an amount, a dash and a date as one range), 318 after an SSN or phone word,
  3,092 with identifiers; sent that ef3e8d20 refused: 48, each with every identifier redacted; leaks ef3e8d20 sent, now
  refused or redacted: SSN 13,479, phone 9,060, name 12,293, initials 669, date of birth 22. Letter for letter the same
  as the build f7da95fe. The narrowed build 04c2d4a5 had read 2,159 with identifiers and 197 after a word, and SSN 9,499,
  phone 6,419, name 12,107. **The final gate, on the PR's last code, is still to run.** Outputs in
  `/home/user/gate-out/p4-*`, `p5-*`, `p6-*` (not kept).
- **Fuzzers on 5d10e0de:** the PHI reviewer's two (a letter ef3e8d20 refused, now sent with a number in clear or digits
  beside a placeholder): 0 of 10,000 on each of three seeds. The must-stay reviewer's 12,000 ordinary letters: 72 newly
  refused, 71 of them one form (`Contact <name>, <city>, IL <ZIP+4>`) and one a row that begins with the call's identifiers
  after a line ending `(TTY: 711).`; ef3e8d20 refuses each with the identifiers taken out. 6 changed (a ten after `Phone
  1:` is `[PHONE]`).
- **Pinned rows on aea2852d:** ruling A 697 of 697 (634 refused, 63 redacted), ruling A' 406 of 406 (200 redacted, 206
  refused), ruling B 5 of 5 (the month word redacted as the name); the 938 lone-initial rows and 243 fail-safe rows as recorded.
- **MOD-16's generator** changes in three places, each pinned on both sides: no unlabeled local number in a letter with a
  held range (about 320 per 20,000), no word glued to a held range's end before a bare nine or ten (about 20), no run of
  digits that begins or ends with the patient's birth date run together (1 in 100,000).
- **MOD-23** (allocated by the orchestrator 2026-11-11, `LANES.md` Queues item 26): two name forms this PR leaves, sent in
  clear outside a held letter on cc3dd7f6, ef3e8d20 and this head alike: a lower-case piece after a space or a period
  (`Zephy ra`, `Zephy. ra`) and a name written letter by letter (`Z e p h y r a`). Reproduce:
  `cd designs/lane-b-redact-ssn-phone/gate/leaks-scripts && node --import ../ts-resolve.mjs name-forms.mts <redact.ts of each tree>`.
- **The packets verifier's fold (W7)** moves `packages/model-gateway/src/redact.ts` whole to `packages/redact/src/redact.ts`
  (`@tp/redact`). Whichever PR merges second takes the base merge: git follows the rename; `confusables.ts` and this PR's new
  test files move by hand beside it, and a test's `./redact` import becomes `@tp/redact`.
- **Container paths (not kept):** `/home/user/gate` (a copy of the kept gate), `/home/user/gate-out`, `/home/user/tree-cc3`,
  `/home/user/tree-ef3`, `/home/user/fix` (a scratch worktree), `/home/user/work` (the reviewers' fuzzers `d1re/`, `d2re/`
  and their copies `d1p6/`, `d2p6/`; `stress16.mts`, `mkprop.sh`). The scripts worth keeping are in the gate folder's
  `leaks-scripts/` and `residual-scripts/gen-residual6.mts`.
- **Trailers:** from 04c2d4a5 on, every commit ends with `Co-Authored-By: Claude <noreply@anthropic.com>` and the session's
  `Claude-Session:` line (the orchestrator's ruling, STATE.md). Nothing already pushed is rewritten: the PR branch keeps its
  WIP history, whose first commits and three ops commits (95c22f19, a6609b82, dcd462a0) carry the harness's line.

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
