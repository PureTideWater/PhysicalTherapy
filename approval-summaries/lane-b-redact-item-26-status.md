ACTING (Lane A's account, https://claude.ai/code/session_019i9ifAEQTFy4tvph8Cj9mD, W18; before it W17, session_019i9ifDNJ3ixNo2VHiiA93Y) holds this item from 2026-11-11 20:28 UTC; Lane B: read lanes/lane-b.md's latest entries before resuming.

# Queues item 26 (MOD-23): K-1, the two name forms, P6's stored numbers: status

## RESUME-BLOCK, current (W18, 2026-11-11 21:25 UTC; W17's block below is kept for its design decisions and review scopes)

- **WIP ref:** `co-001/wip-redact-item-26` at **d67775d0** (three commits on f3f5a642). Local branch `co-001/redact-item-26`.
- **Done since W17's block (its OPEN items 1 to 3):**
  - Time: the wider reading read the letter's dates a second time. `inOneReading` opens the check's stores around each
    exported reading (`redactLetterForScreen`, `redactionSpans`, `holdsIdentifier`; `holdsAsFirstRead` uses it too, it
    is re-entrant), so both readings share views and dates. The two 100 kB rows: 1.04 to 1.19 s on the head against
    1.04 to 1.16 s on the base on one machine (1.45 to 1.49 s before). Budget unchanged, no letter exempted. Five new
    timing rows for letters that hold a split name (`denial-letter.test.ts`).
  - The run-count row: the excess was the subject's forms rebuilt on every reader call (fixed work). `formsOf` now
    builds them once per reading for each subject, fold and width (`formsOfCheck`, the list frozen; no reader runs a
    form's own pattern object, each reads its source and flags). 2,106 runs against 2,385: 88.3 in 100, bar 90
    unchanged (the base: 2,385 against 2,662, 89.6).
  - Six files pass: gateway 4,127, packets `verifier-identifiers.test.ts` 107, `@tp/redact` 46; typecheck and lint
    clean. Two of the new rows' expectations were wrong and are corrected (two words of a three-word name are two
    placeholders, as on the base; `I'd a` is IDA under the blunt rule: an apostrophe always joined a part).
  - Failing-first: the MOD-23 describe on the base's `redact.ts`: 32 of 39 fail; on the head 39 pass.
  - `docs/product/test-matrix.md`: the MOD-23 row and its note (committed).
- **Running in this container (gone if the container is):** `/home/user/bt/chain.sh`: the gate A = `/home/user/snapA`
  (f3f5a642), B = `/home/user/snapB` (the head at 2ab3e0dd's `redact.ts`) into `/home/user/gate-out/i26-2`; then the
  battery four times in parallel under `/home/user/bt/{hr,hf,rr,rf}` (head and base-as-head, recorded and fresh
  seeds; `lay.sh <root> <dir of redact.ts>` builds one layout with every `/home/user/` path rewritten to the root;
  outputs in `<root>/out/fuzz-all.out`). Fresh seeds are in `<root>/work/battery-fresh.sh`.
- **OPEN, in this order:** read the gate's `report.md` counts and `PHI.*` rows; ADR 0054's amendment with the measured
  numbers (and a pointer at the three residual sentences it closes: line 455 `jo ann`, the K-1 sentence, the MOD-23
  sentence of the 2026-11-11 amendment); the two reviews (briefs: `designs/lane-b-redact-item-26/reviews/brief-*.md`;
  frozen copies for them in `/home/user/rev/{head,base}`, the diff in `/home/user/rev/redact.diff`); read the
  batteries (head against base-as-head, same seeds); at most two fix rounds; the full suite once; the base merge; the
  gate again; the draft PR; CI; the merge.
- No PR is open, no subscription and no check-in is held.

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
