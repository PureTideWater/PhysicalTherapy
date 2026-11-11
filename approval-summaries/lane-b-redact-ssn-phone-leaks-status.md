# Lane B item: SSN and phone leaks (`co-001/redact-ssn-phone-leaks`; MOD-21, MOD-22)

Must land before any real PHI is processed (ruling A, 2026-11-07 10:53 UTC; the founder owns launch). Two adversarial reviews.
Counters MOD-21 and MOD-22 are allocated (2026-11-06 21:03 UTC); no new ADR is expected (an ADR 0054 amendment). Any other
counter comes from the orchestrator.

## RESUME-BLOCK (W5, session_019i9ifC8ouxG6CLPdZtgAcJ; current at 2026-11-11 04:10 UTC)
- **State:** branch `co-001/redact-ssn-phone-leaks` cut locally at ef3e8d20 in `/home/user/leaks` (installed); nothing
  committed or pushed yet, no PR. Design in progress; no reviews yet.
- **Reproduced:** the gate at ef3e8d20 against cc3dd7f6 reads `PHI: ssn 385, phone 171, name 5`; refusals 598 / 7,014;
  the residual rows are all sent as pinned (697 / 406 / 5); MOD-16's generator, 20,000 letters on seed 42, 0 refused or
  changed. Container paths (not kept): `/home/user/gate` (a copy of the gate), `/home/user/gate-out/base`, detached trees
  `/home/user/tree-cc3` and `/home/user/tree-ef3`, scripts in `/home/user/work` (`rows.mts`: the pinned rows of a tree;
  `stress16.mts` with `mkprop.sh`: MOD-16's generator against a tree; `classify.py`, `examples.py`: the rows by shape).
- **The rows by shape** (ruling A, 697): amount-shaped (`900.12 3456`, `900 12 34.56`, `202 555 01.23`, about 330); a group
  of five digits or more (`90012-3456`, `900-123456`, `202-5550123`, `20255 50123`, about 200); a local number (`555-0123`
  behind `Call 1:` or with no label, 92); date-shaped (`9 01-12-1985`, 30); digit-glued (`900123456150.00`, a ten after
  `Ref`, 20); nine single digits (8). Ruling A' (406): digit-for-letter names and numbers (`S1MONE`, `VANTR3E`,
  `SYNMEMBERO042`, `7654321O`, `ZZ765432l`), Cyrillic, Greek and small-capital look-alikes, date writings (`III/14/1980`,
  `2-XI-1975`, `1980年3月14日`, `Mar 14th`, a year in words) and 135 two-digit-year compacts of four or five digits.
- **Direction (not yet reviewed):** only add redactions and refusals, so nothing ef3e8d20 protects can be sent. (1) In
  every letter: the shapes structure decides (an SSN or phone with its own separators glued digit to digit; a masked SSN
  glued to a word or a digit; a label glued to the word before it; a label read past the patient's own placeholder; a label
  behind its own list number), and the call's own identifiers through a look-alike fold (non-Latin letters that read as
  Latin ones, then digit-for-letter). (2) In a held letter only, where cc3dd7f6 refused: the shapes no structure decides
  (amount-shaped, five-four, a local number with no label, date-shaped), refused as cc3dd7f6 refused them, with MOD-16's
  generator changed in step only where a must-stay shape is the same shape. (3) Ruling B: a month word that is a name part
  is a date's month only in a whole date with its day and year.
- **Next:** prototype against `rows.mts` and `stress16.mts`, then the gate with ef3e8d20 as tree A (must-stay cost) and
  cc3dd7f6 as tree A (acceptance); two adversarial reviews of the design; build; two of the build.
- **Decision recorded:** commits carry the trailer naming the model this session is configured and served as (as W2's and
  W4's records do), not the brief's template line; no repository check reads it.

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
- 2026-11-11T04:10Z (W5): started 02:37Z; branch cut at ef3e8d20; the gate and the pinned rows reproduced; the rows classed by shape; direction above.
