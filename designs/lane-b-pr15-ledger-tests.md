# PR 15 (Lane B, item 2): ledger tests LED-12 and LED-13, the design contract

Base: `claude/build-platform` at 49514e8 (main checkout, clean). Design step only: nothing was built, committed, pushed
or posted. Date 2026-10-25. Lane B's claim: `LANES.md:104` (test-matrix LED-12 and LED-13; `packages/synth` case LED-12).
Branch, once the build may start: `co-001/pr-15-ledger-tests`, cut from the latest `claude/build-platform`, worked in
`/home/user/pr-15-ledger-tests` (LANES rule 5).

**Status: STOPPED on the owner's question L1 (section 3).** LED-12 as written fails against the frozen ledger
(section 2). reconciliation-001 item 15 (`docs/product/reconciliation-001.md:223-227`) says that work then stops and the
owner is asked, because the ledger's semantics are frozen. Nothing in this design changes the ledger. Sections 4 to 12
are the build contract for the recommended answer, L1 (a). Section 13 says what PR 15 becomes under (b) or (c).

Sources:
- CO-09's wording: `docs/product/change-order-001.md:83`;
- reconciliation-001:
  - item 15 at `:223-227`;
  - section 18's row at `:28` ("LED-13 is LED-06");
  - the ledger checks at `:435-440`;
- PRD 13 (`docs/product/PRD.md:522-560`), "Recoupments and reversals" at `:546-548`;
- ADR 0042 (`docs/adr/0042-*.md:88-97`, and "Revisit when" at `:170-172`);
- combined audit #12 (`/home/user/ops/audits/combined/combined-report.md:299-307`);
- `LANES.md` rules 1-12; the CI design (`designs/lane-b-ci.md`, ci-mutation at `:99`, `:1104-1129`, `:1198`, `:1323`);
- the code at 49514e8, cited `file:line`:
  - `packages/ledger/src`;
  - `apps/worker/src/reconcile/{remittances,postings,ledger}.ts`;
  - `apps/worker/src/parse/loader.ts:528-590`;
  - `packages/edi835/src/transaction.ts:91-104, 860-871`.
- The author's probe and notes: `/tmp/claude-0/-home-user-PhysicalTherapy/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad/pr15-design/author.md`.
  - The pre-validated patch for L1 (a) is `pr15-design.patch` in the same folder (SHA-256 `2e223d05...85d3c2f`).
  - Those scratchpad paths do not survive the session. Appendix A therefore carries the code, and Appendix B the numbers.

---

## 0. In one screen

- **LED-12 as written fails.** The probe sets a case line's recovery at 30.00 (approved, posted and deposited, proved by
  deposit). It then loads a later remittance that reverses the corrected claim and offsets the reversal with a PLB
  naming that claim, so the remittance moves no cash.
  - The frozen ledger writes `recouped -30.00` at once, and recovered goes from 30.00 to 0.00.
  - The line goes from recovered to actionable, the case leaves resolved, and two people are told of a recoupment.
  - Posted and deposited stay 30.00, and the PLB is never an entry.
  - That holds with a forward balance (FB), with an authorized return (72), inside a check that pays other claims, and
    at both proof levels.
  - It is the rule PRD 13 and ADR 0042 state: "a reversal claim against a case line creates a `recouped` entry at
    once"; "a forward balance (FB) is recorded but not counted".
- **So CO-09's sentence and the frozen rule disagree on "no cash change".**
  - Read plainly, the reversal and its offsetting adjustment net to nothing in the ledger. That fails.
  - Read narrowly, the ledger writes no cash entry. That passes, but asserts nothing about the take-back.
- **L1 to the founder (through the co-founder, LANES rule 8). Recommended: (a).** Keep the ledger as frozen and restate
  LED-12's assertion as what the ledger does and should do: "Moves no cash: no `posted` or `deposited` entry and the
  adjustment never an entry; the reversal `recouped` once, at once, for what the reversed claim approved".
  - That is conservative: recovered never counts money the payer has formally taken back.
  - (b) needs a ledger change, which goes to Lane A. (c) is weaker than (a) for no gain.
- **LED-13 passes as written.** LED-06's tests assert "a later recoupment is a negative event against net recovery".
  Two clauses are only implied, and two additive assertions close them:
  - one new `it` in `ledger.db.test.ts`;
  - one property in `packages/ledger/src/totals.test.ts`.
  - Both pass on the frozen ledger.
- **Under (a), PR 15 is tests only:**
  - seven source files, all test or synth files;
  - two fixture directories (generated);
  - three documents.
  - No migration, no ADR, no non-test file under `packages/ledger/src` or `apps/worker/src/reconcile`, nothing in
    `packages/pricing` or `packages/edi835`.
- **Pre-validated at 49514e8 (Appendix B).**
  - The ledger DB tests and the ledger oracle: 48 of 48 (base 42).
  - `pnpm test`: 4,530 passed and 3 skipped, ledger branches 100%.
  - The pyx12 oracle agrees on all 637 835s.
  - `pnpm synth --all` is idempotent, and only LED-12 and LED-13 are new.
  - typecheck, and eslint on the changed files.
  - Two regression mutants of the matching rules are each killed by the new tests.

---

## 1. What the ledger does today (the frozen semantics PR 15 tests)

| Rule | Where |
|---|---|
| Seven stages. Recovered is the proof level's stage (posted or deposited) plus recouped, each net of its corrections. Approved and interest are never in recovered | `packages/ledger/src/stages.ts:10`, `totals.ts:107-136` |
| A reversal (CLP02 22) of a claim attached to a case line by an approving match, with no correction of it in the same remittance, writes `recouped` at once. It takes what that match approved, at most the approval still standing, evidence the reversal claim | `apps/worker/src/reconcile/remittances.ts:371-408`; PRD 13 `:548`; ADR 0042 `:88-90` |
| A PLB WO naming a case line's claim takes back, in line order, at most each line's approval standing | `remittances.ts:453-486` |
| A PLB L6 is interest. A PLB FB "is never an entry: it counts nothing until a recoupment resolves it". A PLB 72 (authorized return) and other codes are never read by the ledger | `remittances.ts:33, 442, 488-492`; ADR 0042 `:97` |
| The parser records FB with `counted = false`, and 72 as `authorized_return` | `packages/edi835/src/transaction.ts:91-104, 870` |
| A deposit or posting writes each case line's share of its remittance only when that share is positive. A remittance whose only claim of the line is a reversal has a negative share and writes nothing | `apps/worker/src/reconcile/postings.ts:240-290, 372` |
| The loader links a reversal to the claim it reverses by payer claim control number, patient control number and the negated charge | `apps/worker/src/parse/loader.ts:528-545` |

---

## 2. The probe: LED-12 as written, against the frozen ledger

### 2.1 What "as written" was taken to mean

CO-09 says: "LED-12 reversal with a provider-level adjustment nets to no cash change."

- A **reversal** is an 835 claim reversal (CLP02 22). A **provider-level adjustment** is an 835 PLB.
- The pair that "nets to no cash change" is the standard one:
  - a reversal of a paid claim (CLP04 -X);
  - a PLB of -X naming it (a negative PLB adds to the payment, docs/adr/0021);
  - so BPR02 is unchanged by the pair.
- Payers send two such PLBs:
  - **FB** (forward balance): the negative balance is carried forward and withheld from a later check;
  - **72** (authorized return): the refund the provider already sent is acknowledged.
- The meaningful case is a reversal of the claim that recovered a case line's money. A reversal of a claim with
  nothing approved writes nothing under any rule (probe P4).
- **Plain reading** of the assertion: the ledger nets the pair to no change. Posted, deposited, recouped, recovered and
  the line's stage are what they were before the remittance.

### 2.2 How it was run

The probe ran in a detached worktree at 49514e8 against PG18 on `localhost:5433`, with heavy runs under
`flock /tmp/laneb-heavy.lock`.

- **The fixture:** a temporary LED-12 synth case built on LED-06's recovery pair (`workflow.ts:115-137`), generated by
  `pnpm synth --case LED-12`.
- **The test:** a temporary DB test through `LedgerWorld`.
- **The recovered state each variant starts from:** the original payment is a case line (97110 x 2, allowed 70.00
  against 100.00 expected). The adjusted remittance approves 30.00. The posting export posts 30.00 and the EFT export
  deposits 30.00. The proof level is deposited, so recovered is 30.00 and the line is recovered.
- **Each variant** then loads one remittance, reconciles, and asserts the plain reading with `expect.soft`.

### 2.3 What happened

| Probe | The later remittance | Ledger after (as written: no change) | Verdict |
|---|---|---|---|
| P1 | The corrected claim reversed (-100.00) and PLB FB -100.00 naming it. BPR02 0.00, NON | Adds `recouped -3000` (evidence: the reversal claim). Recovered 3000 to 0. Posted and deposited 3000 unchanged. Line recovered to actionable. Case resolved to awaiting_response. Two `recoupment` notifications. The FB is recorded, `counted = false`, with no entry and no match | **Fails** (recouped, recovered, line stage) |
| P2 | The same with PLB 72 -100.00. BPR02 0.00 | Identical to P1 | **Fails** |
| P3 | P1's pair beside another patient's claim paying 50.00. BPR02 50.00, ACH | Identical to P1 | **Fails** |
| P3b | P3, then its 50.00 deposit | The deposit matches its remittance and writes no entry for the case line. Deposited stays 3000 | Passes (cash stage) |
| P5 | P1, then a later check withholding the FB (PLB FB +100.00) from a claim paying 150.00 | No further entry. Recouped stays -3000, so the money is taken back once overall | Passes (no double count) |
| P6 | Not a reversal: PLB WO 100.00 and FB -100.00 naming the corrected claim, no claim. BPR02 0.00 | Identical to P1 (the WO's take-back, capped at 30.00) | Fails (same rule) |
| P4 | The original claim reversed with FB -70.00 before any approval | No entry; nothing was approved | Passes, vacuously |
| P1, posted proof level | P1 at the posted proof level | Recovered 3000 to 0 | **Fails** |

Result: 5 failed, 2 passed. The observations are in `author.md`.

### 2.4 Why

- PRD 13 (`:548`) and ADR 0042 (`:88-90`) make a reversal of the attached claim a take-back at once, whatever else the
  remittance holds.
- The offsetting PLB is never read:
  - FB by rule (`remittances.ts:33`);
  - 72 because the ledger reads only WO and L6 (`remittances.ts:442`).
- So the ledger counts the reversal and not its offset, and recovered falls by the approval (30.00) though the
  remittance moved no cash.
- Any LED-12 that keeps recovered level needs a different matching rule. That would be a ledger semantics change,
  which the freeze forbids (reconciliation-001 `:435-440`).

### 2.5 Verdict

**LED-12 fails as written** under its plain reading. It passes only under a narrow reading: no `posted` or `deposited`
entry, and the cash stages unchanged. That reading asserts nothing about the take-back. Work stops and the owner is
asked (L1).

---

## 3. The owner's question (L1)

**L1. CO-09's LED-12 says "a reversal with a provider-level adjustment nets to no cash change". The frozen ledger
(PRD 13, ADR 0042) takes back a reversed recovery at once, even when a PLB in the same remittance offsets the
reversal, so recovered falls though the remittance moved no cash. What does LED-12 assert?**

**(a) Recommended. Keep the ledger as frozen, and restate LED-12 as what it does.**

- The row reads: `| LED-12 | Reversal with a provider-level adjustment | Moves no cash: no posted or deposited entry and
  the adjustment never an entry; the reversal recouped once, at once, for what the reversed claim approved |` (stage
  names in backticks).
- PR 15 then asserts five things:
  - no cash entry;
  - the PLB (FB or 72) never an entry or a match;
  - one `recouped` entry, for exactly what the reversed claim approved, dated by its remittance;
  - the line reopened and its people told;
  - no second take-back on replay or when the forward balance is withheld later.
- PR 15 is built as sections 4 to 12 say: tests only, no ADR.
- **Why this is the best option:**
  - "Recovered" is the figure buyers audit first and must never overstate. Once the payer has reversed the payment it
    is no longer secure.
  - For a 72, the refund has already left the practice, by a check no ledger evidence shows. Holding recovered level
    would overstate it for good.
  - It is PRD 13's own rule, so nothing frozen moves, and the test pins the two properties that matter: no cash entry
    and a single take-back.
- **What it gives up:**
  - CO-09's plain wording: recovered does change, by the approval.
  - Timing for an FB: recovered falls on the reversal's date (2026-08-03 in the fixture), while the cash leaves when
    the payer withholds the forward balance (2026-09-07). That month's digest and the quarter's statement show the
    take-back early. It is never late and never doubled.
  - CO-09's sentence is amended in the matrix by ruling (recorded in reconciliation-001), not by the change order.

**(b) Keep CO-09's plain reading: recovered unchanged until the cash leaves.**

- An FB-offset reversal is taken back only when a later FB withholds it. A 72 is still taken back at once, because the
  refund already left.
- That is a ledger semantics change:
  - a new matching rule in `apps/worker/src/reconcile/remittances.ts`;
  - a way to tie a later withholding to the reversal;
  - PRD 13 and ADR 0042 amended (its "Revisit when" names exactly this);
  - a freeze exception from the founder;
  - built by Lane A beside 15b. It is not a test PR, and Lane B does not design it.
- PR 15 then ships LED-13 only, and LED-12 waits for that change.
- **What it gives up:**
  - the freeze;
  - money-path code;
  - mixed semantics: FB is deferred, 72 at once.
  - FB references on real 835s often carry a balance number, not the claim's control number. A withholding that cannot
    be tied to its reversal would leave recovered overstated indefinitely.
  - Meanwhile the seal can show over money the payer has formally reversed.

**(c) Narrow LED-12 to the cash stages: no posted or deposited entry, nothing about the take-back.**

- It passes today.
- **What it gives up:** the test no longer pins the take-back. A regression that drops it (probe mutant m3) or doubles
  it passes, so (c) is strictly weaker than (a), whose assertions contain (c)'s.

**What each answer starts:**
- (a): this design is built.
- (b): Lane B records "Handed to Lane A: the LED-12 ledger change" in `LANES.md`, and PR 15 shrinks to section 13's
  LED-13-only form.
- (c): PR 15 is built with section 5.2's assertions on the take-back removed. Not recommended.

**Recording:** the ruling goes, with who made it and when (LANES rule 8):
- in `lanes/lane-b.md`;
- in PR 15's amendment of reconciliation-001 item 15 (section 8).

---

## 4. Scope under L1 (a): tests only

| File | Change | Diff at 49514e8 |
|---|---|---|
| `packages/synth/src/cases/workflow.ts` | New `led12(b)` builder (Appendix A.1). Adds `type Cents` to the `@tp/money` import | +60 / -1 (the import line) |
| `packages/synth/src/cases/registry.ts` | `'LED-12'` (build `workflow.led12`) and `'LED-13'` (`none(9, ...)`), after `'LED-11'` (A.2) | +9 / 0 |
| `packages/synth/src/cases/matrix.ts` | Two rows after LED-11, word for word as `test-matrix.md` (A.3) | +2 / 0 |
| `docs/product/test-matrix.md` | Two rows after LED-11 (`:134`) | +2 / 0 |
| `fixtures/synthetic/LED-12/**` (11 files), `fixtures/synthetic/LED-13/expected.json` | Generated by `pnpm synth --all`, never written by hand | new |
| `apps/worker/src/reconcile/ledger.db.test.ts` | Two new `describe` blocks between LED-06's (`:200-295`) and LED-07's (`:297`), section 5.2 and 6.3 (A.4). Two import lines widened (`entriesById`, `periodEntries`, `negateCents`). Header comment `LED-02 to LED-11` becomes `LED-02 to LED-13` | +163 / -3 (the 2 imports, the comment) |
| `apps/worker/src/reconcile/ledger-oracle.db.test.ts` | One new element of `CASES` (`:63-103`), before "a reversed manual match" (A.5). The header comment's list of scenarios gains "a reversal a forward balance offsets" | +12 / 0, plus the comment line |
| `packages/ledger/src/totals.test.ts` | One new `it` in "ledger properties", before "nothing is recovered without..." (`:190`) (A.6) | +17 / 0 |
| `README.md` | `:357-359`: "runs LED-01 to LED-13" and "six synthetic export scenarios" | 2 lines |
| `docs/product/reconciliation-001.md` | Item 15 (`:223-227`) gains "*Amended <date> (PR 15):*" with the founder's ruling quoted and what landed | additions |

**Never touched:**
- every non-test file under `packages/ledger/src` and `apps/worker/src/reconcile`, including `test-support/`;
- `packages/edi835`, `packages/pricing`, `packages/db`, any migration or `domain-model.md`;
- `content/releases/**`;
- `CLAUDE.md`, `.claude/**`, any workflow;
- `docs/product/change-order-001.md`, which stays as the founder issued it.

---

## 5. LED-12

### 5.1 The fixture (`packages/synth` case LED-12)

**How it is generated:**
- `pnpm synth --all` (or `--case LED-12`) runs `led12(b)` in `CaseBuilder`.
- The builder's world is seeded by the case ID (`builder.ts:97`, `tp-synth/LED-12`), so the bytes are deterministic
  and independent of every other case.
- ISA06 is SYNTHSENDER and GS02 is SYNTH (`packages/synth/src/identity`), and every CSV data row carries SYNTHSENDER.
  `assertSyntheticFixture` checks each file as it is written.
- The builder reuses LED-06's `recoveryPair(b, 'ACH')` and `recoveryScenario(b)` (`workflow.ts:115-137, 167-169`), so
  LED-12 starts from exactly LED-06's recovery.

**The files** (n is the control-number and trace index; dates are calendar dates):

| File | Content |
|---|---|
| `original.835` (n1) | 97110 x 2 allowed 70.00 (AMT B6), no patient share: the case line |
| `adjusted.835` (n2, ACH) | The original reversed and the corrected claim (SYNCCNLED120002) allowed and paid 100.00, paid 2026-06-08 |
| `posting-export.csv` | The adjusted check posted 2026-06-10 |
| `eft-export.csv` | The adjusted check deposited 2026-06-09 |
| `reversal.835` (n3, NON) | The corrected claim reversed (CLP02 22, -100.00) and PLB FB -100.00 naming it. BPR02 0.00, BPR01 H, 2026-08-03 |
| `reversal-refunded.835` (n4, NON) | The same with PLB 72 -100.00. BPR02 0.00 |
| `reversal-in-check.835` (n5, ACH) | The same reversal and FB beside another patient's 97110 claim paying 50.00. BPR02 50.00 |
| `reversal-in-check-eft-export.csv` | That check deposited, 50.00, 2026-08-04 |
| `forward-balance-withheld.835` (n6, ACH) | Another patient's claim paying 150.00 and PLB FB +100.00 naming SYNCCNLED120002. BPR02 50.00, 2026-09-07 |
| `adjustments-alone.835` (n7, ACH) | No claim. PLB FB -100.00 and 72 -100.00 naming SYNCCNLED120002. BPR02 200.00. It isolates the rule "the adjustment is never an entry" while an approval stands that could absorb it |
| `expected.json` | Generated (A.1). `scenario` is LED-06's plus `reversal.reverses` and `offsetBy` |

`expected.json`'s outcome:
- `entries`: approved, posted and deposited 3000, then `recouped -3000` with evidence `reversal.835 transaction 0 claim 0`;
- `recoveredCents: "0"`;
- `cash`: `reversalPaidCents -10000`, `adjustmentCents -10000`, `paymentCents 0`, `inCheckPaymentCents 5000`;
- one sentence each for `adjustment`, `refunded`, `inCheck`, `withheld`, `alone` and `case`.

**Choices:**
- No patient share on any line, so allowed and paid coincide. This is the boundary with 15b (section 10).
- The adjustments name the reversed claim's own control number. That is the hardest case for a double count: if the
  ledger ever matched an FB by reference, this fixture would catch it.
- The pyx12 oracle reads every new 835: `pnpm test:oracle` agreed on all 637 fixtures with these 7 included.

### 5.2 The test (`apps/worker/src/reconcile/ledger.db.test.ts`, `describe('a reversal that a provider-level adjustment offsets (LED-12)')`)

Each `it` starts from LED-12's recovered state. It loads `original.835` and `adjusted.835` through `scenario('LED-12')`,
reconciles the posting and EFT exports, and asserts the line is recovered.

**1. `it.each` over FB (`reversal.835`, then `forward-balance-withheld.835`) and 72 (`reversal-refunded.835`): "moves no
cash when ... offsets the reversal, and takes back what the reversed claim approved, once, at once".**
- **At the source, before reconciling:**
  - the remittance just loaded carries exactly one PLB of the code and amount `expected.json` gives;
  - its reversal claim's paid is `cash.reversalPaidCents`;
  - BPR02 is `cash.paymentCents`, so the pair moves no cash.
- **No cash entry:** posted and deposited are unchanged. They are read with plain SQL sums by stage, net of their
  corrections, and share no code with `@tp/ledger`.
- **An event, not an edit:** the earlier entries are unchanged (`after.slice(0, before.length)` equals `before`,
  whole rows). Exactly one entry is added:
  - `recouped`, evidence kind `claim`, evidence the reversal claim;
  - dated by its remittance's BPR16;
  - the case line's, by no one, not allocated.
  - The stages equal `expected.json`'s entries.
- **The adjustment never counts:** no `ledger_entry` names the PLB as evidence, and no `ledger_match` names it.
- **Totals through the reconcile's own `practiceLedgerTotals`:**
  - approved, posted, deposited, interest and payer approved are unchanged;
  - recouped is minus the approval;
  - recovered is `expected.json`'s.
- **PRD 13's consequences:**
  - the line is actionable, reopened from recovered with `REOPEN_NOTES.recoupment`;
  - the case is not resolved;
  - each of the practice's people (administrator and billing manager) is told once, with
    `{recouped_lines: 1}` and `{recouped: <expected>}`.
- **Once:**
  - a replay writes nothing;
  - for FB, the withholding check's PLB (FB +100.00) is recorded, the reconcile reports `recoupments: 0`, and no entry
    names it;
  - the entries equal those after the take-back, and the notifications are still two.

**2. "never counts the adjustments themselves, even while an approval stands that could absorb them".**
- `adjustments-alone.835` is loaded on the recovered state and carries FB and 72.
- Entries, matches and every total (`toEqual`) are unchanged, and the line stays recovered.
- This `it` exists because in `it` 1 the reversal exhausts the approval first. The cap would then hide a regression
  that read FB or 72 as interest. Probe mutant m1 (FB and 72 read as interest) survives `it` 1 and is killed here.

**3. "deposits nothing for the case line from a check that holds the reversal and its adjustment beside another
payment".**
- `reversal-in-check.835`: its BPR02 is `cash.inCheckPaymentCents`, and its reconcile gives `expected.json`'s entries
  (the same take-back).
- Then its 50.00 EFT row: loaded, one standing deposit match of that remittance, no entry added, cash unchanged.

**Why it pins the cash invariant without depending on implementation details:**
- It reads only:
  - stored rows through the app role in the practice's request scope (the data dictionary's `ledger_entry`,
    `ledger_match`, `provider_adjustment`, `remittance`, `claim`, `line_status` and `notification`);
  - plain SQL sums by stage;
  - the reconcile's public outcome (`practiceLedgerTotals`, `ReconcileSummary.remittances`).
- Every amount comes from `expected.json`, so the fixture states the numbers once.
- It never calls `recoupReversals`, `providerAdjustments` or `shares`. It never depends on match order, entry IDs or
  which function writes, and it holds the outcome under any implementation of PRD 13's rule.
- **Checked against two regressions of the matching rules,** each applied temporarily to `remittances.ts` in the
  author's worktree and reverted:
  - **m3** (do not take back a reversal whose remittance carries a negative PLB, that is, reading (b) without a
    ruling): kills four, namely `it` 1 for FB and for 72, `it` 3, and the oracle case.
  - **m1** (read FB and 72 as interest): killed by `it` 2.

### 5.3 The oracle (`apps/worker/src/reconcile/ledger-oracle.db.test.ts`)

**Yes, LED-12 gets an oracle case.**
- The ledger oracle is PRD 18's third oracle. It states each scenario's known outcome by hand, checks it against the
  fixture's `expected.json` (approved, deposited and recouped sums, `recoveredCents`, `proofLevel`), runs the steps,
  replays the whole reconcile, and compares plain SQL sums by stage with the known outcome and with the reconcile's
  totals.
- LED-12 is a cash scenario with a known outcome, so it belongs there.
- **The case** (A.5), fixture LED-12:
  - steps: the posting export, the EFT export, the remittance `reversal.835`, the remittance
    `forward-balance-withheld.835`;
  - known: approved 3000, posted 3000, deposited 3000, recouped -3000, interest 0, recovered 0, one posted entry,
    line `actionable`.
- **It is an addition only.** The five existing cases and the harness are byte-identical, so "the ledger oracle passes
  unchanged" (reconciliation-001 `:439`) holds: the existing five run and pass as before. Section 9 gives the check.

---

## 6. LED-13

### 6.1 Do LED-06's tests assert "a later recoupment is a negative event against net recovery"?

| CO-09's clause | Asserted where (49514e8) | Verdict |
|---|---|---|
| **later**: after the money was proved | `ledger.db.test.ts:201-227`: the recoupment (2026-08-03) after the deposit (2026-06-09), the line recovered before it. The oracle's "a recoupment after deposit" (`ledger-oracle.db.test.ts:77-86`) | Yes |
| **negative**: a negative `recouped` entry | `:210` (stages equal `expected.json`'s, `recouped -1800`); `totals.test.ts:35-42`; `reconciliation-routes.db.test.ts:390` | Yes |
| **event**: a new entry, never an edit; it lands in its own period | Append-only by the database (LED-10, `:675`). The stages list keeps the earlier entries (stage and amount only). The month: digest August -1800, June still 3000 (`ledger.db.test.ts:791-808`; `chain.db.test.ts:244-250`). The quarter: Q3 statement -1800, Q2-Q3 1200 (`chain.db.test.ts:306-335`) | Mostly. The recouped row's own evidence and date, and the earlier rows' identity, are only implied |
| **against net recovery**: reduces recovered by exactly its amount; nothing else moves | `:212-214` (before minus after is 1800; approved unchanged); the property `totals.test.ts:166-174`; the ROI statement 1200 (`:733-777`); the routes' totals and dashboard (`reconciliation-routes.db.test.ts:390-397`) | Yes |

**Two gaps,** neither a semantics question:
1. For the PLB path, no test asserts the recouped entry's own row: evidence kind `provider_adjustment`, evidence the
   WO, `effective_on` the recoupment remittance's BPR16. Nor does any test assert that the earlier entries are
   identical rows, beyond their stage and amount. The claim-reversal path asserts its date (`:248`). The PLB path
   shows it only through the digest month.
2. No pure property says a later recoupment leaves every earlier period's totals unchanged and lands in its own
   period. The existing property covers the whole ledger only.

### 6.2 The assertions that close them (additive, no semantics change)

**1. `ledger.db.test.ts`, `describe('a later recoupment (LED-13)')`, one `it`** (A.4). It runs on LED-06's scenario up
to the deposit, then loads `recoupment.835`, and asserts:
- the earlier entries are identical, whole rows;
- exactly one entry is added: `recouped`, evidence kind `provider_adjustment`, evidence the WO's `provider_adjustment`
  ID, the case line's, by no one, dated by the WO's remittance's BPR16, negative;
- it is dated after every earlier entry;
- `practiceLedgerTotals` recovered equals before plus its amount;
- with `ledgerTotals(periodEntries(...))`, recovered through the latest earlier entry's date equals before, and
  recovered from the recoupment's date equals its amount.

**2. `totals.test.ts`, one property** in "ledger properties" (A.6). For any ledger, any later recoupment and either
proof level:
- the totals of every period ending before it are unchanged (`toEqual`, entry IDs included);
- its own period's recovered and the whole ledger's recovered fall by exactly its amount.
- Calendar dates are generated as zero-padded `2026-MM-DD` text, with no `Date` arithmetic, as the ledger stores them.

Both pass on the frozen ledger (Appendix B).

### 6.3 The registry entry

The entry names exactly LED-06's five tests. The two new assertions live in two of those files.

`'LED-13': none(9, 'LED-06: its recoupment after the deposit is the later recoupment; no file of its own.', [...])`,
listing:
- `apps/worker/src/reconcile/ledger.db.test.ts`;
- `apps/worker/src/reconcile/ledger-oracle.db.test.ts`;
- `packages/ledger/src/totals.test.ts`;
- `apps/worker/src/reconcile/chain.db.test.ts`;
- `apps/web/src/lib/routes/reconciliation-routes.db.test.ts`.

`pnpm synth --all` writes `fixtures/synthetic/LED-13/expected.json`, with `noFileReason` and no file, as for LED-01,
LED-10 and LED-11. `completesIn` is 9, which is at or below `CODE_BUILT_THROUGH_MILESTONE` (10, `registry.ts:52`), so
`fixtures.test.ts` requires `assertedBy`, and it is given.

---

## 7. Rows

Each row appears identically in three places:
- `docs/product/test-matrix.md`, after `:134`;
- `packages/synth/src/cases/matrix.ts`, after LED-11;
- `packages/synth/src/cases/registry.ts`.

`fixtures.test.ts:33-43` holds the three to each other word for word and in order.

| ID | Title | Assertion | Registry `assertedBy` |
|---|---|---|---|
| LED-12 | Reversal with a provider-level adjustment | Moves no cash: no `posted` or `deposited` entry and the adjustment never an entry; the reversal `recouped` once, at once, for what the reversed claim approved | `apps/worker/src/reconcile/ledger.db.test.ts`, `apps/worker/src/reconcile/ledger-oracle.db.test.ts` |
| LED-13 | Later recoupment | Negative event against net recovery | LED-06's five (section 6.3) |

- LED-12's assertion text is L1 (a)'s and is the founder's to word. A different wording changes only the three rows and
  the regenerated `expected.json`'s `title` and `assertion`.
- The pre-validated run used "No cash change: ..." in place of "Moves no cash: ...".
- LED-13 keeps CO-09's words, because it passes as written.
- Each row is also covered at the unit level: LED-12's take-back changes no other stage (`totals.test.ts:166-174`), and
  LED-13 has the new property. Neither is a new `assertedBy` file for LED-12, because the unit property does not
  exercise the reversal-with-offset path.

---

## 8. Documents, and why no ADR

**Documents:**
- `README.md:357-359`.
- The two test files' header comments.
- reconciliation-001 item 15, amended in the house form: "*Amended <date> (PR 15):* <the founder's ruling on L1,
  quoted, with name, date and time>. LED-12 asserts ...; LED-13 is LED-06's recoupment, with one assertion of its row
  and one property added."

**Not edited:**
- reconciliation-001's status rows `:18`, `:28` and `:42`, which stay as their review dates state them (PR 6's rows
  left `:42` too);
- CO-09 in `change-order-001.md`, the founder's issued text.

**No ADR, because:**
- PR 15 asserts behavior that PRD 13 (`:548`) and ADR 0042 (`:88-97`) already decide: a reversal of the attached claim
  with no correction beside it writes `recouped` at once, and a PLB FB writes no entry. A 72 is in neither list of
  what writes an entry.
- No architecture, process or semantics changes.
- ADR 0042's "Revisit when ... a payer recoups ... by forward balance in a way PRD 13 does not describe" is not
  triggered under (a): LED-12's FB is recorded and not counted, as PRD 13 says.
- The ruling on CO-09's wording is a product decision. LANES rule 8 records it in the lane log and reconciliation-001.
- Under (b), the ADR 0042 amendment belongs to Lane A's ledger change.

---

## 9. Checks

**The builder** (in `/home/user/pr-15-ledger-tests`, `export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH`; heavy runs
under `flock /tmp/laneb-heavy.lock` while another workflow runs). `<mb>` is
`git merge-base HEAD origin/claude/build-platform`.

1. Before writing any test, re-run the probe's core on the new base, as the design's tests: they must pass. If the base
   moved and any fails, stop and ask.
2. `pnpm synth --all`:
   - it writes only `fixtures/synthetic/LED-12/**` and `LED-13/expected.json`;
   - a second run writes 0 files;
   - `git status` shows no other fixture change.
3. `pnpm check:fixtures`.
4. `pnpm test`: all pass, the coverage thresholds hold (`packages/ledger/src/**` branches 100%), and the unit count is
   base + 1.
5. `pnpm db:migrate && pnpm test:db`: all pass, and the db count is base + 6:
   - LED-12 `it.each` ×2;
   - the adjustments-alone `it`;
   - the in-check `it`;
   - LED-13's `it`;
   - the oracle case.

   Focused first: `vitest run --project db apps/worker/src/reconcile/ledger.db.test.ts
   apps/worker/src/reconcile/ledger-oracle.db.test.ts` gives 48, of which 42 are the base's.
6. `pnpm test:oracle` with pyx12 (`TP_ORACLE_PYTHON=/opt/py312-ci/bin/python3`, after `pnpm synth --large`): every 835
   agrees, the 7 new ones included.
7. `pnpm test:golden`, `pnpm typecheck`, `pnpm lint`, `pnpm lint:logs` and `pnpm verify-content`.
8. The freeze and scope checks:
   - `git diff --stat <mb> -- packages/ledger/src ':!**/*.test.ts'` is empty, and so is the same for
     `apps/worker/src/reconcile` (`test-support/` included), `packages/pricing/src`, `packages/edi835/src`,
     `packages/db` and `content/releases`.
   - `git diff --numstat <mb> -- packages/ledger/src` shows 0 deletions.
   - `git diff -U0 <mb> -- apps/worker/src/reconcile/ledger.db.test.ts apps/worker/src/reconcile/ledger-oracle.db.test.ts | grep '^-[^-]'`
     lists only the two widened import lines and the two header-comment lines. Every existing `it` and every existing
     oracle case is byte-identical.
   - `git diff --name-only <mb>` equals section 4's list.
9. **The regression probes:** in a scratch worktree, apply m3 and then m1 (section 5.2) to `remittances.ts`, see the
   named tests fail, and revert. The commands are in `author.md`.
10. The PR description comes from `.github/pull_request_template.md`. The ruling is quoted in it.

**The fresh-clone verifier** (LANES rule 1):
1. Clone at the PR's head, then `pnpm install --frozen-lockfile`.
2. Steps 2, 3 and 8, and the focused DB run of step 5.
3. Read CI with `get_job_logs`:
   - every job green, and `mutation` green if ci-mutation has merged (PR 15 touches `packages/ledger`);
   - the unit and db counts equal base + 1 and base + 6, which equal the union of the db shards' "Files this shard ran"
     if ci-speed has merged.
4. Check the three row texts against the founder's ruling word for word.
5. Check reconciliation-001's amendment: name, date and quoted words.
6. Check that the LED-12 fixture's 835s pass the pyx12 oracle job.

---

## 10. The boundary with 15b (combined audit #12, Lane A)

**PR 15 is tests of today's rules on lines with no patient share. 15b changes what amounts matching writes.**

**PR 15:**
- Every LED-12 and LED-13 line has no patient share (`share: 'none'`, no CAS PR), so allowed and paid coincide.
  Every amount PR 15 asserts therefore holds whether the ledger measures approvals in allowed amounts (today) or in
  the payer's payment (15b's best option): the approval is 30.00, the take-back 30.00, the deposit 30.00.
- PR 15 asserts nothing about:
  - coinsurance, a deductible or a copay;
  - a posting share net of the reversal it replaced;
  - a reversal taking back "what was paid" when that differs from what was approved;
  - "billable to the patient";
  - the outcome "payer corrected; balance is the patient's".
- It changes no non-test file anywhere.

**15b** (Lane A, after PR 14 in its queue) owns:
- the amounts `remittances.ts` and `postings.ts` write;
- PRD 13's two definitions of "approved";
- the new coinsurance, deductible and copay fixtures and their test-matrix rows, which Lane A reserves;
- any migration and its domain-model approval.

**The contract between them:**
- 15b must keep LED-12 and LED-13 (and LED-01 to LED-11) passing unchanged for share-free lines. #12 itself says
  recovered's definition, the proof cap and the entry types do not change.
- If 15b needs to change any LED-12 or LED-13 expected amount, that is a semantics change beyond #12, and it goes to
  the founder.
- If 15b merges before PR 15 (not planned), PR 15 merges it in, regenerates, and must pass as designed. Otherwise it
  stops and asks.

---

## 11. Conflicts (LANES rule 6: the PR merged second resolves, keeping both)

| File | ci-mutation (`co-001/ci-mutation`), and ci-speed before it | PR 15 | Resolution |
|---|---|---|---|
| `docs/product/test-matrix.md` | CI-01 to CI-20 in a new "Continuous integration" section (ci-speed CI-01 to 10, ci-deps CI-11 to 14, ci-mutation CI-15 to 17, ci-browser CI-18 to 20) | LED-12 and LED-13 after LED-11 | Different hunks. Keep both |
| `packages/synth/src/cases/matrix.ts` | CI rows in the document's order | LED-12 and LED-13 after LED-11 | Keep both, in the document's order (`fixtures.test.ts:33-43` checks it) |
| `packages/synth/src/cases/registry.ts` | CI entries. ci-speed also edits `assertedBy` for SEC-02, SEC-15, SCR-08 and SCR-19 | `'LED-12'`, `'LED-13'` after `'LED-11'` | Keep both |
| `packages/synth/src/expected/types.ts` | ci-speed adds module `CI` | not touched | none |
| `fixtures/synthetic/*` | `CI-01/` to `CI-20/` | `LED-12/`, `LED-13/` | Disjoint. After resolving, `pnpm synth --all` with a clean diff. LED-12's bytes depend only on its own seed |
| `packages/ledger/src/totals.test.ts` | M3's survivor-killing `it` blocks (new blocks only, 0 deletions) | One `it` before "nothing is recovered..." | If the hunks touch, keep every `it`. The numstat stays 0 deletions on `packages/ledger/src` |
| `tools/stryker/equivalent/ledger.json` | Equivalents recorded by ci-mutation | not touched | If ci-mutation merged first and PR 15's property kills a mutant recorded there as equivalent (a `periodEntries` boundary), the gate fails ("a recorded equivalent ... no longer exists", `lane-b-ci.md:1100`). PR 15 then removes that entry with a line in the PR saying which test kills it |
| ci-speed's counts (A2) | db shards sum to the base's count | +6 db, +1 unit | Whichever merges second states its own base + delta |
| Lane A's PR 6b-4 (#42, mail streams) | (Lane A) | LED-12 asserts the `recoupment` notification's rows as LED-06 does | If #42 changes that notification's shape, LED-06's tests change with it, and PR 15's LED-12 assertion follows the same way, as the second-merged PR. Keep both |

---

## 12. Risks

| Risk | Mitigation |
|---|---|
| L1 is answered (b) | PR 15 becomes LED-13 only (section 13). The ledger change is recorded under "Handed to Lane A" |
| The base moves before the build | Check 9.1 re-runs the design's tests on the new base first |
| The cap hides an adjustment-read-as-entry regression in LED-12's main `it` | The adjustments-alone `it` kills it (m1, measured) |
| `adjustments-alone.835` (a PLB-only remittance paying 200.00) is an isolating construction, not a common payer pattern | It is valid 005010X221A1 (pyx12 agrees), its description says what it isolates, and its assertions are rules, not a payer's habit |
| Real FB references often name a balance number, not the claim | The fixture names the claim, the hardest case. Under the frozen rule no FB reference is ever read |
| A matrix-row wording change after review | It changes three text rows and the regenerated `expected.json` only. The tests read no row text |
| A reader takes "the ledger oracle passes unchanged" to forbid a new case | Check 9.8 shows the existing five cases byte-identical, and the new case is an addition. If the founder reads it otherwise, the LED-12 `it` already carries plain-SQL sums, and the oracle case can be dropped without losing an assertion |
| DB test time | About +5 s in one file (6 tests at 0.5-1.3 s each, measured). Sharding (ci-speed) is by path, so no shard map changes |

---

## 13. Under L1 (b) or (c)

**(b):**
- PR 15 ships LED-13 alone: section 6's rows, registry entry and assertions, the README line (LED-01 to LED-11 and
  LED-13), and the reconciliation-001 amendment recording the ruling and that LED-12 waits.
- No LED-12 fixture or row.
- Lane B records the handover in `LANES.md` under "Handed to Lane A", with this design's section 2 as the evidence.
  Lane B does not design that change.

**(c):**
- The same build as (a), with the LED-12 row reading "No `posted` or `deposited` entry; the adjustment never an entry".
- `it` 1 drops its recouped, recovered, line-stage, note, notification and replay assertions, keeping the source,
  cash, no-edit and adjustment checks.
- The oracle case states the same known totals (it cannot avoid the take-back).
- Not recommended: it pins less than (a) for no gain.

---

## Appendix A. The pre-validated code (L1 (a), at 49514e8)

All of it is in `pr15-design.patch` (scratchpad). Below is what the builder writes.

### A.1 `packages/synth/src/cases/workflow.ts`

Change the import line to: `import { type Cents, centsToString, cents, formatCents, negateCents, subtractCents, sumCents } from '@tp/money';`.

Insert `led12` before `export function job01`:

```ts
/**
 * LED-12 (CO-09): a reversal that a provider-level adjustment offsets, so the pair moves no cash. LED-06's
 * recovery (30.00 approved, posted and deposited, proved by deposit); then a later remittance reverses the
 * corrected claim (CLP02 22, -100.00) and offsets the reversal with a PLB of -100.00 naming that claim: a
 * forward balance (FB, BPR02 0.00), the provider's refund acknowledged (72, BPR02 0.00), or the forward
 * balance inside a check that pays another patient's claim (BPR02 50.00, deposited). A later check then
 * withholds the forward balance (FB 100.00). The ledger takes back what the reversed claim approved once,
 * at once (PRD 13, Recoupments and reversals; docs/adr/0042), and no adjustment is ever an entry.
 */
export function led12(b: CaseBuilder): void {
  const pair = recoveryPair(b, 'ACH');
  const reference = pair.corrected.payerClaimControlNumber;
  b.add835('original.835', pair.originalFile, 'The original payment (a case line).');
  b.add835('adjusted.835', pair.adjustedFile, 'The adjusted remittance paying the difference.');
  b.addFile('posting-export.csv', postingExport([{ postedOn: addDays(pair.later, 2), checkOrTrace: pair.trace, payerName: pair.base.payer.name, amount: pair.check, batch: 'SYNBATCH-1201' }]), 'csv', 'The posting export for the adjusted payment.');
  b.addFile('eft-export.csv', eftExport([{ depositedOn: addDays(pair.later, 1), description: `${pair.base.payer.name} HCCLAIMPMT`, trace: pair.trace, amount: pair.check }]), 'csv', 'The bank export for the adjusted payment.');
  const reversedOn = calendarDate(2026, 8, 3);
  const reversal = reversalOf(pair.corrected);
  // A negative PLB amount adds to the payment (docs/adr/0021): the reversal's -100.00 offset exactly.
  const offset = negateCents(pair.corrected.paid);
  const plb = (code: 'FB' | '72', amount: Cents) => [{ providerId: pair.base.payee.id.value, fiscalPeriodDate: calendarDate(2026, 12, 31), items: [{ code, reference, amount }] }];
  const forward = oneRemittance(b, { ...pair.base, paid: reversedOn }, [reversal], 3, { method: 'NON', providerAdjustments: plb('FB', offset) });
  b.add835('reversal.835', file(b, forward, 3, reversedOn), `The corrected claim (${reference}) reversed, -100.00, and the balance carried forward by a PLB FB of -100.00 naming it: BPR02 0.00, no payment.`);
  const refunded = oneRemittance(b, { ...pair.base, paid: reversedOn }, [reversal], 4, { method: 'NON', providerAdjustments: plb('72', offset) });
  b.add835('reversal-refunded.835', file(b, refunded, 4, reversedOn), `The corrected claim (${reference}) reversed, -100.00, against the refund the provider sent (PLB 72 -100.00 naming it): BPR02 0.00, no payment.`);
  const other = therapyClaim(b.world, { caseId: b.info.id, n: 5, plan: 'SYNPLAN-FIX-LED', lines: [allowedLine(b, calendarDate(2026, 7, 6), 1, 5000n, 'none')] });
  const inCheck = oneRemittance(b, { ...pair.base, paid: reversedOn }, [reversal, other], 5, { method: 'ACH', providerAdjustments: plb('FB', offset) });
  b.add835('reversal-in-check.835', file(b, inCheck, 5, reversedOn), "The same reversal and forward balance beside another patient's claim paying 50.00: BPR02 50.00, that claim's payment.");
  b.addFile('reversal-in-check-eft-export.csv', eftExport([{ depositedOn: addDays(reversedOn, 1), description: `${pair.base.payer.name} HCCLAIMPMT`, trace: traceNumber(b.info.id, 5), amount: other.paid }]), 'csv', 'The bank export of that check: one deposit of 50.00.');
  const withheldOn = calendarDate(2026, 9, 7);
  const paying = therapyClaim(b.world, { caseId: b.info.id, n: 6, plan: 'SYNPLAN-FIX-LED', lines: [allowedLine(b, calendarDate(2026, 8, 10), 3, 15000n, 'none')] });
  const withheld = oneRemittance(b, { ...pair.base, paid: withheldOn }, [paying], 6, { method: 'ACH', providerAdjustments: plb('FB', pair.corrected.paid) });
  b.add835('forward-balance-withheld.835', file(b, withheld, 6, withheldOn), `A later check withholding the forward balance (PLB FB 100.00 naming ${reference}) from another patient's claim paying 150.00: BPR02 50.00.`);
  // The two adjustments alone, while the approval stands: whatever could absorb them, neither is ever an entry.
  const alone = oneRemittance(b, { ...pair.base, paid: reversedOn }, [], 7, {
    method: 'ACH',
    providerAdjustments: [{ providerId: pair.base.payee.id.value, fiscalPeriodDate: calendarDate(2026, 12, 31), items: [{ code: 'FB', reference, amount: offset }, { code: '72', reference, amount: offset }] }],
  });
  b.add835('adjustments-alone.835', file(b, alone, 7, reversedOn), `The same two adjustments with no claim (PLB FB -100.00 and 72 -100.00 naming ${reference}): BPR02 200.00.`);
  recoveryScenario(b);
  b.scenario({ reversal: { reverses: 'adjusted.835 transaction 0 claim 1', offsetBy: { 'reversal.835': 'FB', 'reversal-refunded.835': '72', 'reversal-in-check.835': 'FB' } } });
  b.outcome({
    entries: [
      { stage: 'approved', amountCents: centsToString(pair.difference) },
      { stage: 'posted', amountCents: centsToString(pair.difference) },
      { stage: 'deposited', amountCents: centsToString(pair.difference) },
      { stage: 'recouped', amountCents: centsToString(negateCents(pair.difference)), evidence: 'reversal.835 transaction 0 claim 0' },
    ],
    recoveredCents: centsToString(subtractCents(pair.difference, pair.difference)),
    cash: { reversalPaidCents: centsToString(reversal.paid), adjustmentCents: centsToString(offset), paymentCents: centsToString(subtractCents(reversal.paid, offset)), inCheckPaymentCents: centsToString(other.paid) },
    adjustment: 'recorded; never an entry or a match, and no posted or deposited entry is written',
    refunded: 'the same entries as reversal.835',
    inCheck: 'the same entries; its 50.00 deposit matches its remittance and deposits nothing for the case line',
    withheld: 'takes nothing back again',
    alone: 'loaded while the approval stands, the adjustments write no entry and no match',
    case: 'reopened with a note; the owner is notified',
  });
}
```

`paymentCents` is derived here as `subtractCents(reversal.paid, offset)`, the same `"0"` the validated run wrote as a
literal, so the bytes are unchanged.

### A.2 `packages/synth/src/cases/registry.ts`, after `'LED-11'`

```ts
  'LED-12': { completesIn: 9, build: workflow.led12, assertedBy: ['apps/worker/src/reconcile/ledger.db.test.ts', 'apps/worker/src/reconcile/ledger-oracle.db.test.ts'] },
  // CO-09's LED-13 is LED-06's recoupment after the deposit (reconciliation-001, section 18 and item 15).
  'LED-13': none(9, 'LED-06: its recoupment after the deposit is the later recoupment; no file of its own.', [
    'apps/worker/src/reconcile/ledger.db.test.ts',
    'apps/worker/src/reconcile/ledger-oracle.db.test.ts',
    'packages/ledger/src/totals.test.ts',
    'apps/worker/src/reconcile/chain.db.test.ts',
    'apps/web/src/lib/routes/reconciliation-routes.db.test.ts',
  ]),
```

### A.3 `matrix.ts`, after LED-11 (and the same two rows in `test-matrix.md`)

```ts
  { id: 'LED-12', title: 'Reversal with a provider-level adjustment', assertion: 'Moves no cash: no `posted` or `deposited` entry and the adjustment never an entry; the reversal `recouped` once, at once, for what the reversed claim approved' },
  { id: 'LED-13', title: 'Later recoupment', assertion: 'Negative event against net recovery' },
```

### A.4 `apps/worker/src/reconcile/ledger.db.test.ts`

**Imports:**
- `import { type LedgerEntry, SYNTHETIC_PM_EXPORT_V1, entriesById, ledgerTotals, periodEntries, roiStatement } from '@tp/ledger';`
- `import { cents, negateCents, parseCents } from '@tp/money';`

**Header:** `test matrix LED-02 to LED-13`.

**Insert before `describe('manual matching and its reversal (LED-07)'`:**

```ts
describe('a reversal that a provider-level adjustment offsets (LED-12)', () => {
  /** LED-12's case line recovered: the adjusted payment approved, posted and deposited, proved by deposit. */
  async function recovered(): Promise<{ readonly practice: Practice; readonly caseId: string; readonly serviceLineId: string }> {
    const found = await scenario('LED-12');
    await w.reconcile(found.practice, { documentId: await w.stageExport(found.practice, 'LED-12/posting-export.csv', 'posting_export') });
    await w.reconcile(found.practice, { documentId: await w.stageExport(found.practice, 'LED-12/eft-export.csv', 'eft_export') });
    expect(await w.lineStage(found.practice, found.serviceLineId)).toBe('recovered');
    return found;
  }

  /** The cash the ledger holds, by plain SQL sums sharing no code with @tp/ledger: posted and deposited, net of their corrections. */
  async function cash(practice: Practice): Promise<{ readonly posted: bigint; readonly deposited: bigint }> {
    const sum = (stage: string) =>
      w.sum(practice, 'SELECT sum(e.amount_cents)::text AS total FROM ledger_entry e LEFT JOIN ledger_entry t ON t.id = e.evidence_id AND e.evidence_kind = $2 WHERE e.stage = $1 OR t.stage = $1', [stage, 'ledger_entry']);
    return { posted: await sum('posted'), deposited: await sum('deposited') };
  }

  /** The practice's latest remittance (the one just loaded), its payment and its provider-level adjustments. */
  async function latest(practice: Practice) {
    const [remittance] = await w.rows<{ id: string; bpr02_cents: string; bpr16_date: string }>(practice, 'SELECT id, bpr02_cents::text, bpr16_date::text FROM remittance ORDER BY bpr16_date DESC, created_at DESC LIMIT 1');
    const adjustments = await w.rows<{ id: string; reason_code: string; amount_cents: string }>(practice, 'SELECT id, reason_code, amount_cents::text FROM provider_adjustment WHERE remittance_id = $1 ORDER BY position', [remittance?.id]);
    const [reversal] = await w.rows<{ id: string; paid_cents: string }>(practice, "SELECT id, paid_cents::text FROM claim WHERE remittance_id = $1 AND claim_status_code = '22'", [remittance?.id]);
    return { remittance, adjustments, reversal };
  }

  const cashOf = () => (outcomeOf('LED-12') as unknown as { cash: { reversalPaidCents: string; adjustmentCents: string; paymentCents: string; inCheckPaymentCents: string } }).cash;

  it.each([
    { offset: 'a forward balance (PLB FB)', file: 'reversal.835', code: 'FB', withheld: true },
    { offset: 'the provider’s refund (PLB 72)', file: 'reversal-refunded.835', code: '72', withheld: false },
  ])('moves no cash when $offset offsets the reversal, and takes back what the reversed claim approved, once, at once', async ({ file, code, withheld }) => {
    const { practice, caseId, serviceLineId } = await recovered();
    const before = await w.entries(practice);
    const cashBefore = await cash(practice);
    const totalsBefore = await jobTotals(practice);
    await w.load(practice, `LED-12/${file}`);
    // At its source the pair nets to no cash change: the reversal and its adjustment cancel, and the remittance pays nothing.
    const { remittance, adjustments, reversal } = await latest(practice);
    expect(adjustments.map((item) => ({ reason_code: item.reason_code, amount_cents: item.amount_cents }))).toEqual([{ reason_code: code, amount_cents: cashOf().adjustmentCents }]);
    expect(reversal?.paid_cents).toBe(cashOf().reversalPaidCents);
    expect(remittance?.bpr02_cents).toBe(cashOf().paymentCents);
    await w.reconcile(practice);
    // No cash entry: posted and deposited stay what the cash proved.
    expect(await cash(practice)).toEqual(cashBefore);
    // The earlier entries are untouched; one entry is added: the reversal's take-back of what the reversed claim approved, dated by its remittance.
    const after = await w.entries(practice);
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.slice(before.length)).toEqual([
      expect.objectContaining({ stage: 'recouped', evidence_kind: 'claim', evidence_id: reversal?.id, case_id: caseId, service_line_id: serviceLineId, effective_on: remittance?.bpr16_date, created_by: null, allocated: false }),
    ]);
    expect(await w.stages(practice)).toEqual(expectedStages('LED-12'));
    // The adjustment is recorded, and is never an entry's evidence or a match.
    const adjustmentIds = adjustments.map((item) => item.id);
    expect(await w.rows(practice, 'SELECT id FROM ledger_entry WHERE evidence_id = ANY ($1::uuid[])', [adjustmentIds])).toEqual([]);
    expect(await w.rows(practice, 'SELECT id FROM ledger_match WHERE provider_adjustment_id = ANY ($1::uuid[])', [adjustmentIds])).toEqual([]);
    // Recovered falls by exactly what the reversed claim approved (never the 100.00 reversed); every other stage, and payer approved, stand.
    const totalsAfter = await jobTotals(practice);
    expect(totalsAfter).toMatchObject({
      approvedCents: totalsBefore.approvedCents,
      postedCents: totalsBefore.postedCents,
      depositedCents: totalsBefore.depositedCents,
      interestCents: totalsBefore.interestCents,
      payerApprovedCents: totalsBefore.payerApprovedCents,
      recoupedCents: negateCents(totalsBefore.approvedCents),
      recoveredCents: parseCents(outcomeOf('LED-12').recoveredCents ?? ''),
    });
    // PRD 13: the line goes back to actionable with the ledger's note, the case leaves resolved, and its people are told once.
    expect(await w.lineStage(practice, serviceLineId)).toBe('actionable');
    const [reopen] = await w.rows<{ reason: string; reopened_from: string }>(practice, 'SELECT reason, reopened_from FROM line_status WHERE service_line_id = $1 ORDER BY seq DESC LIMIT 1', [serviceLineId]);
    expect(reopen?.reopened_from).toBe('recovered');
    expect(practice.cipher.decrypt('line_status.reason', reopen?.reason ?? '')).toBe(REOPEN_NOTES.recoupment);
    expect(await w.caseState(practice, caseId)).not.toBe('resolved');
    const told = () => asOwner(w.owner, [practice.practiceId], () => w.owner.query("SELECT user_id, counts, totals_cents FROM notification WHERE practice_id = $1 AND kind = 'recoupment' ORDER BY user_id", [practice.practiceId]));
    const recouped = (outcomeOf('LED-12').entries ?? []).find((entry) => entry.stage === 'recouped')?.amountCents;
    expect((await told()).rows).toEqual([practice.world.adminUserId, practice.manager].sort().map((user) => ({ user_id: user, counts: { recouped_lines: 1 }, totals_cents: { recouped: recouped } })));
    // Once: a replay takes nothing back again, nor does the forward balance withheld from a later check.
    await w.reconcile(practice);
    if (withheld) {
      await w.load(practice, 'LED-12/forward-balance-withheld.835');
      const later = await latest(practice);
      expect(later.adjustments.map((item) => ({ reason_code: item.reason_code, amount_cents: item.amount_cents }))).toEqual([{ reason_code: 'FB', amount_cents: (-BigInt(cashOf().adjustmentCents)).toString() }]);
      expect((await w.reconcile(practice)).remittances.recoupments).toBe(0);
      expect(await w.rows(practice, 'SELECT id FROM ledger_entry WHERE evidence_id = ANY ($1::uuid[])', [later.adjustments.map((item) => item.id)])).toEqual([]);
    }
    expect(await w.entries(practice)).toEqual(after);
    expect((await told()).rowCount).toBe(2);
  });

  it('never counts the adjustments themselves, even while an approval stands that could absorb them', async () => {
    const { practice, serviceLineId } = await recovered();
    const before = await w.entries(practice);
    const totalsBefore = await jobTotals(practice);
    await w.load(practice, 'LED-12/adjustments-alone.835');
    const { adjustments } = await latest(practice);
    expect(adjustments.map((item) => item.reason_code)).toEqual(['FB', '72']);
    await w.reconcile(practice);
    expect(await w.entries(practice)).toEqual(before);
    expect(await w.rows(practice, 'SELECT id FROM ledger_match WHERE provider_adjustment_id = ANY ($1::uuid[])', [adjustments.map((item) => item.id)])).toEqual([]);
    expect(await jobTotals(practice)).toEqual(totalsBefore);
    expect(await w.lineStage(practice, serviceLineId)).toBe('recovered');
  });

  it('deposits nothing for the case line from a check that holds the reversal and its adjustment beside another payment', async () => {
    const { practice } = await recovered();
    await w.load(practice, 'LED-12/reversal-in-check.835');
    const { remittance } = await latest(practice);
    expect(remittance?.bpr02_cents).toBe(cashOf().inCheckPaymentCents);
    await w.reconcile(practice);
    expect(await w.stages(practice)).toEqual(expectedStages('LED-12'));
    const before = await w.entries(practice);
    const cashBefore = await cash(practice);
    const summary = await w.reconcile(practice, { documentId: await w.stageExport(practice, 'LED-12/reversal-in-check-eft-export.csv', 'eft_export') });
    expect(summary.exports).toMatchObject([{ kind: 'eft_export', outcome: 'loaded', stored: 1, problems: 0 }]);
    // The deposit matches its remittance (the other claim's 50.00), and none of it is the case line's.
    expect(await w.rows(practice, "SELECT remittance_id FROM ledger_match WHERE kind = 'deposit' AND remittance_id = $1 AND reversed_at IS NULL", [remittance?.id])).toEqual([{ remittance_id: remittance?.id }]);
    expect(await w.entries(practice)).toEqual(before);
    expect(await cash(practice)).toEqual(cashBefore);
  });
});

describe('a later recoupment (LED-13)', () => {
  it('is a negative event against net recovery: a new entry dated by its own remittance, the earlier entries and periods unchanged', async () => {
    const { practice, serviceLineId } = await scenario('LED-06');
    await w.reconcile(practice, { documentId: await w.stageExport(practice, 'LED-06/posting-export.csv', 'posting_export') });
    await w.reconcile(practice, { documentId: await w.stageExport(practice, 'LED-06/eft-export.csv', 'eft_export') });
    const before = await w.entries(practice);
    const recoveredBefore = (await jobTotals(practice)).recoveredCents;
    await w.load(practice, 'LED-06/recoupment.835');
    await w.reconcile(practice);
    const after = await w.entries(practice);
    // A new entry, never an edit of an earlier one.
    expect(after.slice(0, before.length)).toEqual(before);
    const [wo] = await w.rows<{ id: string; paid_on: string }>(practice, "SELECT a.id, r.bpr16_date::text AS paid_on FROM provider_adjustment a JOIN remittance r ON r.id = a.remittance_id WHERE a.reason_code = 'WO'");
    const [recoupment, ...rest] = after.slice(before.length);
    expect(rest).toEqual([]);
    expect(recoupment).toMatchObject({ stage: 'recouped', evidence_kind: 'provider_adjustment', evidence_id: wo?.id, service_line_id: serviceLineId, effective_on: wo?.paid_on, created_by: null });
    const amount = parseCents(recoupment?.amount_cents ?? '0');
    expect(amount).toBeLessThan(0n);
    // Later: dated after every entry before it, the deposit it takes back from included.
    const lastBefore = before.map((entry) => entry.effective_on).sort().at(-1) ?? '';
    expect((recoupment?.effective_on ?? '') > lastBefore).toBe(true);
    // Against net recovery: by exactly its amount, in its own period; the periods before it are not restated.
    expect((await jobTotals(practice)).recoveredCents).toBe(recoveredBefore + amount);
    const ledger: LedgerEntry[] = after.map((entry) => ({
      id: entry.id,
      caseId: entry.case_id,
      serviceLineId: entry.service_line_id,
      stage: entry.stage as LedgerEntry['stage'],
      amountCents: parseCents(entry.amount_cents),
      evidenceKind: entry.evidence_kind as LedgerEntry['evidenceKind'],
      evidenceId: entry.evidence_id,
      allocated: entry.allocated,
      effectiveOn: entry.effective_on,
    }));
    const byId = entriesById(ledger);
    expect(ledgerTotals(periodEntries(ledger, '2026-01-01', lastBefore), 'deposited', byId).recoveredCents).toBe(recoveredBefore);
    expect(ledgerTotals(periodEntries(ledger, recoupment?.effective_on ?? '', '2026-12-31'), 'deposited', byId).recoveredCents).toBe(amount);
  });
});
```

### A.5 `apps/worker/src/reconcile/ledger-oracle.db.test.ts`

Insert in `CASES`, before `name: 'a reversed manual match'`:

```ts
  {
    name: 'a reversal a forward balance offsets, after deposit, and the forward balance withheld later',
    fixture: 'LED-12',
    steps: [
      { kind: 'export', file: 'posting-export.csv', as: 'posting_export' },
      { kind: 'export', file: 'eft-export.csv', as: 'eft_export' },
      { kind: 'remittance', file: 'reversal.835' },
      { kind: 'remittance', file: 'forward-balance-withheld.835' },
    ],
    // The 30.00 the corrected claim approved is taken back once, at the reversal; neither forward balance moves a figure.
    known: { approved: 3000n, posted: 3000n, deposited: 3000n, recouped: -3000n, interest: 0n, recovered: 0n, postedEntries: 1, lineStage: 'actionable' },
  },
```

The header comment's list becomes: "(a recovery, a partial, a recoupment after deposit, a reversal a forward balance
offsets, a reversed match, a duplicate export)".

### A.6 `packages/ledger/src/totals.test.ts`

Insert in "ledger properties", before "nothing is recovered without a posted or deposited entry":

```ts
  it('a later recoupment is a negative event against net recovery: no earlier period changes, and its own period and the whole ledger fall by exactly its amount (LED-13)', () => {
    // Calendar dates of 2026 as the ledger stores them (zero-padded, so their order is the text's).
    const day = fc.tuple(fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 28 })).map(([month, date]) => `2026-${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')}`);
    fc.assert(
      fc.property(fc.array(fc.tuple(counted, amount, day), { maxLength: 12 }), amount, day, day, proofLevel, (items, value, a, b, level) => {
        fc.pre(a !== b);
        const [until, on] = a < b ? [a, b] : [b, a];
        const base = items.map(([stage, figure, at]) => make(stage, figure, { on: at }));
        const all = [...base, make('recouped', value, { on })];
        const totalsOf = (entries: readonly LedgerEntry[], from: string, to: string) => ledgerTotals(periodEntries(entries, from, to), level, entriesById(entries));
        expect(totalsOf(all, '2026-01-01', until)).toEqual(totalsOf(base, '2026-01-01', until));
        expect(totalsOf(all, on, '2026-12-31').recoveredCents).toBe(totalsOf(base, on, '2026-12-31').recoveredCents - value);
        expect(ledgerTotals(all, level).recoveredCents).toBe(ledgerTotals(base, level).recoveredCents - value);
      }),
    );
  });
```

## Appendix B. Numbers (measured at 49514e8, 2026-10-25)

| Check | Result |
|---|---|
| `ledger.db.test.ts` + `ledger-oracle.db.test.ts` (db project, PG18) | 48 passed. The base has 42 (37 + 5). New: LED-12 ×4 (`it.each` ×2, alone, in-check), LED-13 ×1, the oracle case ×1 |
| `vitest list` difference | db: the 4 new entries in `ledger.db.test.ts` (`it.each` listed once). unit: +1, the property |
| `pnpm test` (unit, coverage) | 298 files; 4,530 passed, 3 skipped; `packages/ledger/src` branches 100% (415/415) |
| `packages/synth` + `packages/ledger` unit | 25 files, 271 passed; `fixtures.test.ts` holds rows, registry and fixtures |
| `pnpm synth --all` | 179 cases. First run: 11 files written (LED-12 and LED-13), 446 unchanged. Final run: 0 written, 458 unchanged; EMR 0 written |
| `pnpm check:fixtures` | 244 files read, 2,719 searched; all synthetic |
| `pnpm test:oracle` (pyx12 4.0.0) | All 637 835s agree (626 valid with identical summaries, 11 malformed as expected) |
| `pnpm typecheck` | Passes (workspace) |
| eslint on the 6 changed source files | Passes, after `negateCents` replaced a unary minus on `Cents` (`@typescript-eslint/no-unsafe-unary-minus`) |
| m3 (offset reversal not taken back) | 4 tests fail: LED-12 FB, 72, in-check, oracle |
| m1 (FB and 72 read as interest) | 1 test fails: the adjustments-alone `it` |
| Fixture SHA-256 (LED-12) | `reversal.835` 45515285...; `reversal-refunded.835` 8ab25748...; `reversal-in-check.835` c83dbdd9...; `forward-balance-withheld.835` 8838a76c...; `adjustments-alone.835` 2697b001...; `original.835` 5c821057...; `adjusted.835` eb7c3bb0... (full hashes in `author.md`). `expected.json` changes with the final row text |
