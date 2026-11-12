# Lane B: the letter check's work budget (CT-2 on the merged base) — status

## RESUME-BLOCK, current (W25, session_019i9ifCzDkV481emXJMM26J, 2026-11-12; reviews done, fix round 1 pushed, its delta review and the gate and battery on the fixed head running; no PR yet)

- **Where it stands.** WIP `co-001/wip-check-work-budget` = **7a5a26bb** on base 58fb29e5 (the base is now fd14d89f,
  #150, said not to touch packages/redact: merge it right before the last push). Local branch `co-001/check-work-budget`.
  Commits on W24's 33380cd5: 70b1eb0f the MOD-24 row; c5fc89a8 fix round 1; 7a5a26bb a lint fix in a test.
  Typecheck and lint pass; `denial-letter.test.ts` 1,038 pass (Node 24). Orchestrator's seat: session_019i9ifCaMokBYHaARonYamS
  (as its former session said on 2026-11-12 01:24 UTC; check it exists before reporting there).
- **Reviews** (`reviews/lane-b-check-work-budget-review-phi.md`, `-time.md`; scripts in
  `designs/lane-b-check-work-budget/review-*`). PHI: no blocking finding; P-1 (a `null` count switched the counter
  off) fixed; P-2, P-3, P-4 recorded in the ADR. TIME: **T-1 blocking** (a letter still read took 3.5 to 5.9 s with 400
  to 1,000 claim numbers) **fixed in round 1**: `WORK.formCharacter` = 2 per character per name, member ID and claim
  number at the top of `ownMatchesIn` and `confusedMatchesIn` (now 0.85 to 1.34 s at reference with 1,000); T-2 (the
  dearest letter still read is 2.1 to 2.4 s at reference, U+33FE and `;` repeated, NOT the builder's 1.35 s) is under
  the 3 s and RECORDED in the ADR, with the NFKC-length charge added; T-3 fixed (`typeof spent !== 'number'`); T-4,
  T-5 recorded. **For the orchestrator's line: the dearest read letter is about 2.3 s, not 1.35 s.**
- **Fix round 1's delta review**: `reviews/lane-b-check-work-budget-review-fix1-delta.md` (running; one more round is
  allowed after it, reviewed on its delta only).
- **Gate** (`/home/user/gate`, the kept gate with the check called as `prepare` calls it: `checkWorkOf` handed on;
  trees given as `packages/redact/src` directories). On 33380cd5: 975,489 letters, same 975,489, differ 0
  (`designs/lane-b-check-work-budget/gate/run1-33380cd5-report.md`). Fixtures (`gate/repo.mts`, `repo.out`): 10,830
  strings x 2 patients, no text differs, newly refused only the 729,000-character ZIP table read whole. **To do: the
  same two on the fixed head (run2 started), and again after the base merge.**
- **Battery** (`battery/`: `shim-head-redact.ts` goes to `/home/user/fix/packages/model-gateway/src/redact.ts`; it runs
  every call on the head, `/home/user/headsrc`, and on the base, `/home/user/tree-base`, and appends totals to
  `/home/user/battery-out/shim.jsonl`, differences to `shim-bad.jsonl`; every other tree of the leaks battery's layout
  is a copy of the base's two files; `recorded.sh` is the leaks battery less its gate and audit lines, `fresh.sh` the
  seeded generators on fresh seeds). On 33380cd5, recorded seeds, 63 scripts before a container restart: 567,753
  redactions, 516,552 checks, 0 texts differ, 0 base-refused-head-sent, 0 newly refused. **To do: both scripts on the
  fixed head (started), then total `shim.jsonl`.**
- **Then:** fix what the delta review finds (at most one more round); the full local suite once on Node 24 (output to
  a file); merge the base, gate again; the ADR's battery line and the PR text take the final counts; draft PR into
  claude/build-platform from the template, saying in plain words what is newly refused (crafted letters past the
  budget; long letters on a call with hundreds of claim numbers) and why; subscribe; merge on green; one line to the
  orchestrator (merge commit; hook: `checkWorkSpent` / `work()`, item 26's readings inside the two entries, hand
  `checkWorkOf(redacted)` to `holdsIdentifier`; the 2.3 s).

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
