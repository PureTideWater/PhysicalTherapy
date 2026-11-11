# Lane B item: SSN and phone leaks (`co-001/redact-ssn-phone-leaks`; MOD-21, MOD-22)

Must land before any real PHI is processed (ruling A, 2026-11-07 10:53 UTC; the founder owns launch). Two adversarial reviews.
Counters MOD-21 and MOD-22 are allocated (2026-11-06 21:03 UTC); no new ADR is expected (an ADR 0054 amendment). Any other
counter comes from the orchestrator.

## RESUME-BLOCK (W5, session_019i9ifC8ouxG6CLPdZtgAcJ; current at 2026-11-11 11:26 UTC)
- **State:** WIP `co-001/wip-redact-ssn-phone-leaks` on origin = **5d685267** (cf5094a0, the fix round after the two
  reviews of the delta and the gate's replay, plus two additions from the gate on cf5094a0: a date with a four-digit year
  glued after a bare nine or ten, and a word glued before a dated month; and the test-matrix rows MOD-21 and MOD-22
  reworded to the final rules with their registry copy and fixture records). The six redaction test files pass (3,848
  tests); typecheck and lint clean. Branch `co-001/redact-ssn-phone-leaks` not on origin; no PR. Reports go to the
  orchestrator of record in `lanes/STATE.md` (session_019i9ifBCrxfV35CFDVHLTad).
- **Reviews so far:** design x2; build x2 (B1, B2); the fix round's delta: C1 and C2 cut off (no review; their rows re-run
  and fixed), then **D1 (PHI) and D2 (must-stay) ran to their reports on 0ddfa078** (`reviews/d1`, `reviews/d2`): D1-1 and
  a note; D2-1 to D2-7. Every finding was run first; all fixed in cf5094a0 but what `reviews/recorded-for-the-third-review.md`
  lists as a cost. **Owed: a review of the delta 0ddfa078 to 5d685267 (`git diff` of `redact.ts`, 341 lines), two narrow
  reviewers (E1 PHI; E2 must-stay; briefs `reviews/brief-e1.md`, `brief-e2.md`), about 20 tool calls each, the report as
  the final message.** Both were started at 11:24 UTC in this session and read `/home/user/fix` (= 5d685267); if this
  session ends before they report, they do not count and are run again.
- **What cf5094a0 changed** (commit message has the list): ef3e8d20's own matches are the settled ones (its reading taken
  on the text with the new name joiners written as U+30FB); a pattern's match inside a glued look-alike run is withheld
  only where a check follows; digits before a shape are another number's only as a currency amount's, cents after a
  point, or a date's end (a four-digit year after its month and day too): a bare run before it is a reference's own; a
  noun nearer the number than a label names it; Medicare labels an SSN's shape only; the verb may; the masked rules; a
  range after cents; a date after a labeled number's usual writing; an area code in parentheses with no label; a number
  in parentheses right after a label is its list number whatever follows.
- **Why the last four:** the gate on 0ddfa078 read no PHI class on either tree, but replayed against the run before it
  (`leaks-scripts/lostcheck.mts`, `lostcat.mts`, `setcheck.mts`, `withoutn.mts`) it showed 483 letters with a number
  written as an SSN, a phone or a name that the earlier build refused and 0ddfa078 sent again as ef3e8d20 and cc3dd7f6
  send them; 317 are refused again by cf5094a0 (measured on those letters), the rest are the residual classes as at
  cc3dd7f6. Of the must-stay letters released since that run, 236 with a number in parentheses after a label are refused
  again; ef3e8d20 refuses every one of them with the "(n)" taken out.
- **Measured on cf5094a0 so far:** pinned rows ruling A 697 of 697 (632 refused, 65 redacted), A' 406 of 406 (200 redacted,
  206 refused), B 5 of 5; the residual table needs no change; the four earlier reviews' reproduction scripts read line
  for line as on 0ddfa078; D1's rows are refused as ef3e8d20 refuses them and `redactLetter` reads as ef3e8d20; D2's rows
  read as ef3e8d20 but the recorded costs. **On cf5094a0 (10:41 to 11:15 UTC):** every PHI fuzzer 0 letters ef3e8d20
  refused that the head sends (but a patient whose names are months, where the head redacts the month word ef3e8d20's
  own check then finds: ruling B, as D1 judged it) and 0 matches left as written and sent; the must-stay fuzzers as on
  0ddfa078; **the gate: no PHI class against ef3e8d20 or cc3dd7f6**; against the run on 0ddfa078, 536 more letters with a
  number written as an SSN or phone refused or redacted, 21 sent again (15 of them closed in 5d685267, the rest residual
  classes), 115 fewer must-stay letters refused in the class D2 fixed, 235 more refused after a number in parentheses
  (ef3e8d20 refuses each without it); slowest letter 873 ms (cc3dd7f6 447 ms; budget 3,000 ms). **Running since 11:23
  UTC on 5d685267:** the reproduction scripts, fuzzers with fresh seeds and the gate (`/home/user/work/p11/fuzz-all.out`,
  `/home/user/gate-out/p11-*`, not kept).
- **The rules as built:** `designs/lane-b-redact-ssn-phone-leaks/adr-0054-amendment-draft.md` (current for cf5094a0; three
  placeholders `@@...@@` to fill from the gate: the measured section and the two counts of the number in parentheses).
- **Next, in order:** (1) read the fuzzers and the gate (no PHI class on either tree; replay class changes against p9);
  (2) the two reviews of the delta; verify each finding by running it, fix, and a review of any fix's delta; (3) fill the
  amendment and put it in ADR 0054; commit with the matrix rows; (4) MOD-16's five seeds (1034253323, -1074798020,
  383403599, -460602131, -594136649) and three fresh on the property and leaks files; (5) the final gate if the code
  moved; (6) the full suite once, the base merged once (below), the push through the hook, the draft PR from the
  template, CI, the merge under rule 2a, one line to the orchestrator.
- **The fold (#141, head 995380b7; check whether it has merged) trial-merged into this branch at 09:50 UTC:** `redact.ts`
  follows the rename to `packages/redact/src/` with no conflict; one conflict, `docs/product/test-matrix.md` (keep MOD-19,
  MOD-20, then MOD-21, MOD-22); the same order in `packages/synth/src/cases/matrix.ts` and `registry.ts`. By hand after
  the merge: `git mv` `confusables.ts` and `confusables.test.ts` to `packages/redact/src/`; `redact.leaks.test.ts` stays in
  model-gateway with its import of `./redact` changed to `@tp/redact`; the registry's `assertedBy` path of
  `confusables.test.ts`; `packages/redact`'s description and `index.ts` comment say "no import" (now one data file beside
  it); `gen-residual6.mts` paths. The mutation run covers ledger, money, packets and pricing, not this module.
- **MOD-23** (allocated 2026-11-11, `LANES.md` Queues item 26): `Zephy ra`, `Zephy. ra` and `Z e p h y r a` are sent in
  clear outside a held letter on cc3dd7f6, ef3e8d20 and this head alike; pinned in `redact.leaks.test.ts`. Reproduce:
  `cd designs/lane-b-redact-ssn-phone/gate/leaks-scripts && node --import ../ts-resolve.mjs name-forms.mts <redact.ts of each tree>`.
- **Container paths (not kept):** `/home/user/fix` (scratch copy of the head's `redact.ts`, = cf5094a0), `/home/user/snap10`
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
