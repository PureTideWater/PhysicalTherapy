# Lane B item: SSN and phone leaks (`co-001/redact-ssn-phone-leaks`; MOD-21, MOD-22)

Must land before any real PHI is processed (ruling A, 2026-11-07 10:53 UTC; the founder owns launch). Two adversarial reviews.
Counters MOD-21 and MOD-22 are allocated (2026-11-06 21:03 UTC); no new ADR is expected (an ADR 0054 amendment). Any other
counter comes from the orchestrator.

## RESUME-BLOCK (W5, session_019i9ifC8ouxG6CLPdZtgAcJ; current at 2026-11-11 09:55 UTC)
- **State:** WIP `co-001/wip-redact-ssn-phone-leaks` on origin = **ecb89c5b** (the code is 0ddfa078's, unchanged since;
  1a8355bc added test-matrix rows MOD-21 and MOD-22 and MOD-16's six-digit birth filter; ecb89c5b added the two cases to
  `packages/synth/src/cases/matrix.ts` and `registry.ts` with `fixtures/synthetic/MOD-21|22/expected.json`, which the
  registry's test requires word for word). Worktree `/home/user/leaks`, branch `co-001/redact-ssn-phone-leaks`, not on
  origin; no PR. Reports (the merge, a blocker, a founder ask) go to the orchestrator of record in `lanes/STATE.md`
  (session_019i9ifBCrxfV35CFDVHLTad from 2026-11-11 09:15 UTC).
- **Owed before the merge: two adversarial reviews of the fix round's delta (aea2852d to 0ddfa078) that run to their
  report.** The two of 07:35 UTC were cut off by the usage limit with no report (no review). Two narrow ones (PHI,
  findings D1-n; must-stay and logic, D2-n; about 20 tool calls each, the report as the final message) were started at
  09:40 UTC in this session and read `/home/user/fix` and `/home/user/work/p9/fixround.diff`; if this session ends before
  they report, they do not count and are run again.
- **Measured on 0ddfa078's code:** pinned rows ruling A 697 of 697 (632 refused, 65 redacted), ruling A' 406 of 406 (200
  redacted, 206 refused), ruling B 5 of 5. The four reviews' reproduction scripts (`reviews/b1`, `b2`, `c1`, `c2`): b1 and
  c1 as ef3e8d20 or safer on every row; b2 as ef3e8d20 but the leak forms refused and the recorded costs; c2 95 of 102
  rows as ef3e8d20, 7 recorded costs. **Every fuzzer, 09:44 to 09:50 UTC:** PHI: 0 letters ef3e8d20 refused that the head
  sends (20,000 + 20,000 + 10,000 + 10,000 generated letters and 88,256 of the cut-off reviewer's), 0 matches left as
  written and sent (130,624 letters). Must-stay (12,000 generated letters): 72 new refusals, 71 of them the one form
  `Contact <own name>, <city>, IL <ZIP+4>` (the recorded cost: a phone label read through the own name refuses what
  ef3e8d20 refuses without the name) and 1 a `TTY: 711` line with the own identifiers and a service row on the next line
  (the same rule); 8 letters redacted further (phone lists); names against 26,143 ordinary tokens: 1 of 651 names
  (`Week5` for WEEKS, recorded); `S83511A` for member 583511 (recorded). The old MOD-16 generator (ef3e8d20's), 20,000
  letters, seed 42: 359 refused, each a held letter (a local number with no label beside a held range, and the like).
  **Running:** the gate on 0ddfa078 against ef3e8d20 and cc3dd7f6 (`/home/user/gate-out/p9-*`, not kept).
- **Every example in the amendment draft was run** on the head, ef3e8d20 and cc3dd7f6
  (`designs/lane-b-redact-ssn-phone/gate/leaks-scripts/adr-examples.mts <label=redact.ts>...`); two sentences corrected
  (masked account numbers read as ef3e8d20 in both kinds of letter; the May residual `May 12 for review`).
- **The fold (#141, head 995380b7, not merged at 09:50 UTC) trial-merged into this branch:** `redact.ts` follows the
  rename to `packages/redact/src/` with no conflict; one conflict, `docs/product/test-matrix.md` (keep MOD-19, MOD-20,
  then MOD-21, MOD-22); the same order in `packages/synth/src/cases/matrix.ts` and `registry.ts`. By hand after the merge:
  `git mv` `confusables.ts` and `confusables.test.ts` to `packages/redact/src/`; `redact.leaks.test.ts` stays in
  model-gateway with its import of `./redact` changed to `@tp/redact` (as #141 left the other redaction tests); the
  registry's `assertedBy` path of `confusables.test.ts`; `packages/redact`'s description and `index.ts` comment say "no
  import" (now one data file beside it); `gen-residual6.mts` paths; check `vitest.mutation.config.ts` and `stryker/` for
  what they mutate (the look-alike table is data).
- **The rules as built:** `designs/lane-b-redact-ssn-phone-leaks/adr-0054-amendment-draft.md` (the text for ADR 0054, its
  measured section `@@MEASURED@@` still to fill from the gate); `design.md` beside it is the history.
- **Next, in order:** (1) read the gate (no PHI class on either tree; replay class changes against p8 with
  `leaks-scripts/revdiff.mjs` and `evalhits.mts`); (2) the two delta reviews: verify each finding by running it, fix, and a
  review of any fix's delta; (3) fill the amendment's measured section and put it in ADR 0054; (4) MOD-16's five seeds
  (1034253323, -1074798020, 383403599, -460602131, -594136649) and three fresh on the property and leaks files; (5) the
  final gate if the code moved; (6) the full suite once, the base merged once (above), the push through the hook, the
  draft PR from the template, CI, the merge under rule 2a, one line to the orchestrator.
- **MOD-23** (allocated 2026-11-11, `LANES.md` Queues item 26): `Zephy ra`, `Zephy. ra` and `Z e p h y r a` are sent in
  clear outside a held letter on cc3dd7f6, ef3e8d20 and this head alike; pinned in `redact.leaks.test.ts`. Reproduce:
  `cd designs/lane-b-redact-ssn-phone/gate/leaks-scripts && node --import ../ts-resolve.mjs name-forms.mts <redact.ts of each tree>`.
- **Container paths (not kept):** `/home/user/fix` (scratch copy of the head's `redact.ts`), `/home/user/gate` and
  `/home/user/gate-out`, `/home/user/tree-cc3`, `/home/user/tree-ef3`, `/home/user/work` (fuzzers `d1p6/`, `d2p6/`, `b1fix/`,
  `b2fix/`, `c1fix/`; `stress16.mts`; `p8/`, `p9/` outputs; `adrcheck/`), `/home/user/review-b1`, `-b2`, `-c1`, `-c2`, `-d1`,
  `-d2`, `/home/user/trial` (the trial merge, to remove).
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
