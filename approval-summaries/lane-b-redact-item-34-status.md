# Queues item 34 (MOD-25): build status

Design of record: `designs/lane-b-redact-item-34/design.md` (ops 163894a9). Rulings of 2026-11-12 12:10 UTC: floor 5,
one constant; (d) the verifier keeps its reading; A-4's costs accepted; a digit beside the number stays recorded.
WIP ref: `co-001/wip-redact-item-34`, cut from claude/build-platform a97d73e4. No PR is open.

## RESUME-BLOCK (W39, 2026-11-12, after stage 1)

- **Built:** stage 1, A-5 and (c), commit d438ce76 on the WIP ref. `packages/redact/src/redact.ts` only:
  `runOfMarks` (the run of marks, a function: stage 3's A-4 takes the same class for `GAP.apart`),
  `WIDER_NUMBER_FLOOR = 5` (the one constant: (c)'s pieces now, (a)'s digits in stage 2), `numberForm` (with `asStored`,
  a run of marks where the records write a separator; what the records write there still joins too, so the form is a
  superset of MOD-23's), `piecesOf` and `addPieces` in `formsBuiltOf` (wider only).
- **Green on d438ce76:** the MOD-25 block in `redact.leaks.test.ts` (44 rows; 40 failed on a97d73e4 first), the whole
  file 767 of 767; the redaction suites (`packages/model-gateway/src/redact*`, `functions/denial-letter.test.ts`,
  `functions/narrative.test.ts`, `packages/redact`): 8 files, 4,308 tests; `pnpm typecheck` 24 projects; `pnpm lint` 0 errors.
- **Pinned rows that turned, as the note names:** `redact.leaks.test.ts` the piece `ZZ12345` (was line 861) and A-5's
  recorded row (was 1109). No other pinned row turned.
- **Small things decided, the safer side for privacy, and why:**
  1. A-5 keeps what the records themselves write in the joining class beside the run of marks, so nothing MOD-23 read is lost.
  2. A piece is split at an APOSTROPHE_LETTER too (U+02BC, U+02B9, U+02CA: apostrophes in every number here).
  3. Where two numbers share a piece the first in the call's order gives the placeholder: claims in order, then member IDs.
- **A cost the note's A-5 cell does not state, pinned in the tests:** for a claim number held `1234/56`, `$1234.56` is
  replaced too (`Paid $[CLAIM_1] on the claim`), not only `1234.56` with no currency sign: `isAmount` asks for cents
  *after* the number, exactly as the base does for a claim held `1234.56`. A placeholder, never a leak; left so.
- **Exact next step:** stage 2, (a) in `holdsIdentifier`'s `holds`: tests first (the (a) block in the MOD-25 describe,
  the row at `redact.property.test.ts` "Room AB99887766", the timed rows, the crafted refused row and the count on the
  stored view in `functions/denial-letter.test.ts`), then one function beside `widerMatchesIn` reading
  `masked(read, claims.length)` (the text whose view the wider reading stored), then the suites, then the gate.
- **The gate (not yet run):** `designs/lane-b-redact-ssn-phone/gate/run.sh A B out --workers 4`, A the `base` tree of
  `designs/lane-b-redact-item-34/scripts/proto.sh <root>`, B the head laid the same way. Expected: PHI classes 0,
  `refusedB` 462,984, no change from stages 1 and 2. Output path: recorded here when it runs.
