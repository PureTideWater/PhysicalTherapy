# Lane B: the letter check's work budget (CT-2 on the merged base) — status

## RESUME-BLOCK, current (W25, session_019i9ifCzDkV481emXJMM26J, 2026-11-12 about 04:00 UTC; HANDED ON AT THE TOKEN LIMIT; no PR; the full suite found two failures CI would show too)

- **Where it stands.** WIP `co-001/wip-check-work-budget` = **493be1b2**: W24's 33380cd5, 70b1eb0f (MOD-24 row),
  c5fc89a8 (fix round 1), 7a5a26bb, 0289304f (fix round 2, the last), b00e7cfc and a4749c87 (ADR 0054: the two
  rulings), 493be1b2 (the base fd14d89f merged). Local branch name `co-001/check-work-budget`.
  **CAUTION: `tools/setup-container.sh` checks the main checkout out onto claude/build-platform; check the branch out
  again after it, and run the database tests with `DATABASE_URL=postgres://postgres:test@localhost:5433/postgres`
  (PostgreSQL 18; the default port 5432 is 16 and fails a migration).** `designs/lane-b-check-work-budget/suite/suite.sh`
  is the suite as run.
- **The orchestrator's rulings (session_019i9ifCaMokBYHaARonYamS), both recorded in ADR 0054:** (A) the weight of an
  identifier's character is for a WARM process; the cold first check (4.1 s at 1,000 nine-character numbers, 15.7 to
  17.4 s near the ceiling) is an open residual, not within the 3 s. And: NO THIRD FIX ROUND; G-1 (thousands of short
  identifiers: 3.1, 6.9, 11.1, 18.4 s warm) is a second open residual; both under **Queues item 39**, which must merge
  before the first caller of the check is wired (no caller in apps/ today: v1.5 behind `model.read_denial_letter`).
  The PR description must say both, with the figures, in plain words. **For item 39's design, the interim option not
  built:** a charge per identifier at each entry beside the charge per character (about 50,000 units, a ceiling of
  about 4,000 identifiers; 3,000 of 9 characters measured 1.4 to 1.8 s): `reviews/lane-b-check-work-budget-review-fix2-delta.md`.
- **The full local suite on 493be1b2, Node 24** (`suite/suite.done`): typecheck, lint, lint:copy, lint:logs,
  check:fixtures, verify-content, test:db (10,273 pass), test:golden (381), test:e2e (87) pass. **`pnpm test` FAILS, 3
  of 14,248:**
  1. `packages/synth/src/fixtures.test.ts` "the case registry holds every row of docs/product/test-matrix.md": the
     MOD-24 row needs its entries in `packages/synth/src/cases/matrix.ts` (word for word, as MOD-22 at line 655) and
     `registry.ts` (as MOD-22 at line 844: `none(...)`, letters written in memory by the tests). Mechanical.
  2. and 3. `denial-letter.test.ts` "refuses a letter past the check's work budget ... within the 3 s", the two CT-2
     rows refused in the REDACTION: **5.4 to 5.6 s and 4.0 to 4.1 s of processor time against 3.9 s allowed, WITH
     COVERAGE ON** (`pnpm test` runs `--coverage`, and so does CI; alone without coverage they take about 1.2 s and
     pass, which is how W24 and I ran the file). Reproduce: `pnpm exec vitest run --project unit --coverage
     packages/model-gateway/src/functions/denial-letter.test.ts -t "refuses a letter past the check"`. Cause: under
     coverage one comparison in `someOf` (a closure called per item) costs about 13 ns, not 3, and the letter makes 420
     million before it is refused. This is W24's build, not a fix round's. **Not fixed: it needs the orchestrator's
     word, since two fix rounds are spent.** The fix I would make, fail closed and one constant: `WORK.comparison` from
     1 to 4 (the letter is refused after 105 million comparisons: about 1.4 s under coverage, 0.3 s without; only
     letters of CT-2's shape are refused sooner, at about half the length; nothing in the gate's letters comes near),
     then the ADR's "one unit is one comparison" and the table re-stated, its delta reviewed, the gate again. Never the
     test's 3 s.
- **Reviews** (`reviews/lane-b-check-work-budget-review-{phi,time,fix1-delta,fix2-delta}.md`; scripts under
  `designs/lane-b-check-work-budget/review-*`): no PHI finding in any (nothing the base refuses is sent, no text
  differs). Fixed: T-1, P-1/T-3, F-1 (warm), F-2, F-3, F-4, F-5. Recorded in ADR 0054: T-2 (the dearest read letter
  with one claim is 2.1 to 2.4 s, not W24's 1.35 s), T-4, T-5, P-2, P-3, P-4, G-1 to G-7.
- **Gate** (`/home/user/gate` = the kept gate with `checkWorkOf` handed on, see `git diff` against
  `designs/lane-b-redact-ssn-phone/gate`: one sed on `holdsIdentifier(r.text, ...)` in gate.mts, worker.mts,
  prepare-check.mts; trees given as directories holding redact.ts). 33380cd5, c5fc89a8 and 0289304f (= 493be1b2's
  reader): 975,489 letters, same 975,489, differ 0, 462,984 refused by both (`gate/run*-report.md`). Fixtures
  (`gate/repo.mts`, on 33380cd5): no text differs; newly refused only the 729,000-character ZIP table; NOT re-run on
  the round-2 reader (`/home/user/headsrc-x` wants the reader copied with the `__last` export, see the script's head).
- **Battery** (`battery/`): 33380cd5 63 scripts, 567,753 redactions, 0 differences; c5fc89a8 14 scripts, 211,711, 0;
  0289304f 46 scripts of the recorded pass, 0 differences (`shim-0289304f-recorded-partial.jsonl`), stopped for the
  suite. **To do on the final reader: `recorded.sh` whole, then `fresh.sh`, then total `shim.jsonl` and put the counts
  in the ADR's battery line (it says "the counts are in the pull request") and the PR.**
- **Next, in order:** the orchestrator's word on 2 and 3; the registry entries (1); if the weight changes: its delta
  review, the gate, the unit suite with coverage; the battery and the fixtures on the final reader; merge the base
  again if it moved; the draft PR from `.github/pull_request_template.md` (newly refused, in plain words: crafted
  letters past the budget; long letters on a call with hundreds of claim numbers; every letter of a call with more
  than about 60,000 characters of identifiers; the two residuals and item 39; MOD-15's known seed 1596478644 on the
  base, Queues item 38, re-run once if the unit job is red on that alone); subscribe; merge on green; one line to the
  orchestrator (merge commit; hook: `checkWorkSpent` / `work()`, item 26's readings inside the two entries,
  `checkWorkOf(redacted)` handed to `holdsIdentifier`).

## STOPPED 2026-11-12 (W25): a blocking finding after the second fix round; the orchestrator told, no third round without its word

- WIP `co-001/wip-check-work-budget` = **b00e7cfc** (0289304f fix round 2, then the ADR's record of the ruling (A)).
- `reviews/lane-b-check-work-budget-review-fix2-delta.md`: **G-1 BLOCKING (time, warm process)**: many SHORT identifiers
  on the call, under the ceiling of characters, are read past 3 s with a 19-character letter: 6,300 claim numbers of 9
  characters 3.1 s, 9,400 of 6 digits 6.9 s, 14,000 of 4 11.1 s, 18,500 of 3 18.4 s at reference. The time grows with
  the square of the COUNT of identifiers (said to be `viewsOfCheck.find` per identifier inside `holdsIdentifier`; not
  profiled); the charge is per CHARACTER. No PHI finding: nothing the base refuses is sent, no text differs.
- Proposed, NOT built (it would be a third round): one more constant, a charge per identifier at each entry beside the
  charge per character (about 50,000 units each, a ceiling of about 4,000 identifiers on a call, where 3,000 x 9
  measured 1.4 to 1.8 s), a warm timed row at 3 or 4 characters, and its delta reviewed. G-2 (a call of 60,000 to
  120,000 identifier characters is refused only after the redaction ran, 0.6 to 0.7 s), G-3 (empty identifiers are
  charged nothing: the per-identifier charge covers it), G-4, G-5, G-6 (tests), G-7 (a name of 14,000 words throws a
  SyntaxError whose message begins with the pattern built from the name: the base's own, to be run on the base; for
  the queue) are recorded there.
- Running when stopped, on 0289304f's code: gate run3, battery `recorded.sh` then `fresh.sh`, lint. Valid for the PR
  only if no code changes after them.

## RESUME-BLOCK of W25 before the stop (superseded: W25, session_019i9ifCzDkV481emXJMM26J, 2026-11-12 about 02:40 UTC; fix round 2 pushed, its delta review running, a ruling asked; no PR yet)

- **Where it stands.** WIP `co-001/wip-check-work-budget` = **0289304f** on base 58fb29e5 (the base is now fd14d89f,
  #150: merge it right before the last push). Local branch `co-001/check-work-budget`. Commits on W24's 33380cd5:
  70b1eb0f MOD-24 row; c5fc89a8 fix round 1; 7a5a26bb a test's lint; 0289304f fix round 2 (THE LAST ALLOWED).
  Orchestrator's seat: session_019i9ifCaMokBYHaARonYamS (exists, child of the former one).
- **RULING ASKED of the orchestrator (02:00 UTC, no answer yet): warm or cold.** The base builds a pattern per
  identifier of the CALL at every reading, whatever the letter: the first check of a fresh process takes 1.8 s with 300
  claim numbers of 15 characters, 4.1 s with 1,000 of nine, 15.7 s with 1,250 of 40 (0.11, 0.25, 1.05 s warm). Built:
  (A) `WORK.identifierCharacter` = 3,500 per character of every name, member ID and claim number at each entry, charged
  before anything is read: warm-safe, calls read to about 60,000 identifier characters, over that refused in 1 ms.
  (B) cold-safe would be about seven times the weight (refuses every letter of a patient with more than about 250
  claims): one constant to change, then the tests' 1,000-claim rows and the ADR's pinned paragraph ("The first check of
  a fresh process...") change with it. **No PR before the orchestrator's word on this.**
- **Reviews.** `reviews/lane-b-check-work-budget-review-phi.md`, `-time.md` (build), `-fix1-delta.md` (F-1 the above;
  F-2 name forms, fixed: the per-character charge counts forms; F-3 NaN, fixed in `work`; F-4, F-5 tests, fixed),
  `-fix2-delta.md` (RUNNING; a blocking finding in it means STOP and tell the orchestrator: no third round).
  PHI in every review: nothing the base refuses is sent, no text differs.
- **Recorded, not fixed (ADR 0054, "Left"):** the dearest read letter with one claim is 2.1 to 2.4 s at reference
  (U+33FE and `;`), not W24's 1.35 s; a copy of the result has no count (time only); T-4, T-5, P-3, P-4.
- **Gate** (`/home/user/gate`; trees as directories holding redact.ts; A = `/home/user/tree-base/packages/redact/src`,
  cached). 33380cd5 and c5fc89a8: 975,489 letters, same 975,489, differ 0 (`designs/lane-b-check-work-budget/gate/`).
  Fixtures (`gate/repo.mts`): no text differs; newly refused only the 729,000-character ZIP table. **Running on
  0289304f: run3 (B = `/home/user/headsrc`, a copy of the head's two files). To do: `repo.mts` on it, and both again
  after the base merge.**
- **Battery** (`battery/`; the shim in `/home/user/fix/...` runs every call on `/home/user/headsrc` and on the base and
  totals to `/home/user/battery-out/shim.jsonl`, differences to `shim-bad.jsonl`). 33380cd5: 63 scripts, 567,753
  redactions, 0 differences. c5fc89a8: 14 scripts, 211,711, 0. **Running on 0289304f: `recorded.sh` then `fresh.sh`
  (`CHAIN-DONE` in `/home/user/battery-out/fresh.log`); then total `shim.jsonl`.**
- **Then:** typecheck and lint (running: `/home/user/gate-out/checks2.done`); the full local suite once on Node 24
  (output to a file); merge fd14d89f, gate again; the ADR's battery line and the PR text take the final counts; draft
  PR into claude/build-platform from the template, saying in plain words what is newly refused (crafted letters past
  the budget; long letters on a call with hundreds of claim numbers; every letter of a call with more than about
  60,000 characters of identifiers) and why; subscribe; merge on green; one line to the orchestrator (merge commit;
  hook: `checkWorkSpent` / `work()`, item 26's readings inside the two entries, `checkWorkOf(redacted)` handed to
  `holdsIdentifier`; the 2.3 s; the cold first check).

## Earlier block (W24), kept for the build's detail

## RESUME-BLOCK of W24 (superseded: W24, session_019i9ifDwfF9A5adSZApZYdY, 2026-11-12; BUILD DONE and green locally, handed on at the token limit BEFORE the reviews; no PR)

- **Where it stands.** WIP `co-001/wip-check-work-budget` = **33380cd5** (two commits on base 58fb29e5: bdf7b62b the
  counter, the budget and the tests; 33380cd5 ADR 0054's amendment). Local branch name `co-001/check-work-budget`.
  On Node 24: typecheck and lint pass; `denial-letter.test.ts` 1,036 pass; the 12 redaction test files (gateway
  `src/redact*`, `src/functions`, `packages/redact`, packets' `verifier-identifiers.test.ts`) 4,829 pass.
  **Not done: the two adversarial reviews, the gate, the battery, the full local suite, the PR, the test-matrix row.**
- **What was built** (`packages/redact/src/redact.ts`, right after `BARRIER`):
  - `CHECK_WORK_BUDGET = 420_000_000` units; the counter is the module variable **`checkWorkSpent`**, counted by
    **`work(units)`** (no-op when no letter check runs; throws `PastCheckWorkBudget` past the budget).
  - Sites (`WORK`): `someOf` (a counting `Array.prototype.some`) replaces the five `.some` searches of a list of matches
    in `matchesIn` (4) and `redactLetterForScreen` (1), one unit per comparison; fixed weights at the head of
    `buildView` (per character), `labelWindow`, `scanLabeled`, `readings`, `firstIndex`, `digitAcross`, `letterJoins`,
    `fold`, `mayBe`; and each entry charges 350 per character of its text.
  - Entries: `redactLetterForScreen` (now a wrapper of `redactedForScreen`) counts from 0, and past the budget returns
    `{ text: BARRIER, replaced: 0, candidates: [] }` (no character of the letter); what it spent is kept beside the
    returned object (`checkWorkOf(redacted)`, a WeakMap; budget + 1 when refused). `holdsIdentifier(text, patient,
    claims, spent = 0)` counts on from `spent`, refuses a `spent` that is NaN, negative or past the budget, and
    returns true on `PastCheckWorkBudget`. `denial-letter.ts` `prepare` passes `checkWorkOf(redacted)`.
  - No counter in `redactLetter`, `redactionSpans`, `holdsNameOrNumber`, `nameOrNumberMatches` (no refusal to give).
  - The file has no `catch` but the two new ones; module state (`ownFold`, `viewsOfCheck`, `datesOfCheck`) is restored
    by `finally`, so stopping mid-reading leaves nothing behind (pinned: "counts the same work ... in every run").
- **Where item 26 hooks in:** its wider reading and its second reading call the same helpers, so they count in
  `checkWorkSpent` as long as they run INSIDE the two entries (inside `redactedForScreen` / inside `holdsIdentifier`'s
  `try`); a new loop of its own calls `work(WORK.<site>)`; its own entry points must hand the count on with
  `checkWorkOf` as `prepare` does. W21's `WIDER_WORK_BOUND` is then not needed.
- **Measured** (Node 24; this container's calibration 122 ms against the reference 144, so reference = 1.18 x here):
  CT-2 on the base 2.8 to 3.2 s, with a joiner 4.7 to 6.7 s; one digit per line 1.5 to 2.1 s. Time per unit 1.1 to
  2.9 ns over 52 crafted letters. Each of 51 families sized to just under the budget: dearest still read **1.14 s
  here = 1.35 s at reference** (`designs/lane-b-check-work-budget/dearest.out`); cheapest 0.54 s.
- **Tests changed** (`denial-letter.test.ts`): the three rows "a digit and a bare line break / a CRLF / a dash and a
  bare line break, repeated" are read at 50,000 characters and REFUSED at 100,000 (new table "refuses a letter past
  the check's work budget", 8 rows, each within the plain 3 s and equal on a second run); the linear-time table's body
  now hands the count on as `prepare` does; five new tests (same count every run; one budget for both halves, through
  `prepare`; a bad count refuses; `redactLetter` runs no counter).
- **Scripts** (`designs/lane-b-check-work-budget/`, run from the repository root with
  `PATH=/opt/node24/bin:$PATH node_modules/.bin/tsx <script>`; they write a scratch copy `x/redact.ts` beside
  themselves with the budget lifted, so copy `packages/redact/src/confusables.ts` into `x/` first): `rows.mts` (the
  reproduction on whatever tree is checked out), `measure.mts` (ns per unit per row), `dearest.mts` (each family at
  the budget), `calib.mts` (this machine's calibration).
- **Next, in order** (the orchestrator's brief for W24 holds):
  1. Ask the orchestrator for the test-matrix number (next free was MOD-24) and add the row; nothing in the tree uses
     a number yet.
  2. The gate and the battery on recorded and fresh seeds, output to files (layout: `designs/lane-b-redact-ssn-phone-
     leaks/battery/README.md`; the gate in `designs/lane-b-redact-ssn-phone/gate`; A = 58fb29e5's reader, B = the
     head's). To prove: no letter's sent text changes, the refused set only grows, and by how many (expected none over
     the gate's letters, at most 1,780 characters, and the repository's prose; ADR 0054's "at most 9,933 characters"
     is W21's figure, NOT re-measured here: re-measure or reword). NOTE the gate must call the check as `prepare`
     does (with `checkWorkOf`); without the count each half has its own budget.
  3. Two adversarial reviews, at most two at a time, about 20 tool calls each, a report file each: PHI (can the
     budget turn a refusal into a send, let a partial reading through, or be used to get a letter with PHI sent;
     look at: the BARRIER-only return, the `spent` argument, a throw inside a `replace`/`filter` callback, the
     WeakMap, a caller without the count) and TIME (the budget on Node 24; another driver: a family with more than
     about 6 ns per unit here would pass 3 s at reference while still read; letters longer than 100,000 characters,
     now read up to about 600,000; the uncounted regular-expression passes). Every finding run before any fix; at
     most two fix rounds, each reviewed on its delta.
  4. Full local suite once on Node 24; base merged right before the last push; draft PR into claude/build-platform
     from `.github/pull_request_template.md`; subscribe; merge on green required checks; one line to the orchestrator
     (counter `checkWorkSpent` / `work()`, hook as above); stand down.
- **Known and recorded in the ADR ("Left, each recorded"):** the quadratic comparison is not cured (optional
  follow-up); a caller that drops the fourth argument gets one budget per half (time only); the weights are a fit.
