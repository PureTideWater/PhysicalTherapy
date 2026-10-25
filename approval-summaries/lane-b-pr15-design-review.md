# PR 15 design review: ledger tests LED-12 and LED-13 under L1 (a)

Reviewer: the one adversarial design reviewer (payment-engine-reviewer checklist, ledger). Date 2026-10-25.
Design: `/home/user/ops/designs/lane-b-pr15-ledger-tests.md`. Patch: `/home/user/ops/designs/lane-b-pr15/pr15-design.patch`
(SHA-256 2e223d05...85d3c2f, as the design says). Base: `claude/build-platform` at 9c57d2d (ci-speed #43 merged).
Worktree: a detached worktree at origin/claude/build-platform, `pnpm install --frozen-lockfile --prefer-offline`, the
patch applied there, every heavy run under `flock /tmp/laneb-heavy.lock`, PG18 at localhost:5433. Synthetic data only.
No commit was pushed and nothing was posted. Every mutant was restored (`git diff` empty after each), and the worktree
was removed at the end.

## Verdict: revise (no blocking finding)

The design holds where it matters most:
- nothing in it changes ledger semantics, LED-01 to LED-11 or the oracle's five cases;
- the fixture is synthetic and generated;
- LED-13 is really LED-06, and its two additions close the implied clauses;
- m3 and m1 are killed as the design claims.

Four should_fix items keep it from passing as written:
1. LED-12's cash clause and its "once" clause are each shielded by a cap. Within LED-12's own tests, a single-point
   regression of either one survives. Two measured mutants, s1 and m4, show it. The other tests in the file kill
   both mutants, so the suite still catches them.
2. The row text, the relayed ruling and the pre-validated patch are three different strings. Verifier step 4 would
   fail as written.
3. Section 10 gives 15b to Lane A. LANES.md (1f35d71) now puts 15b in Lane B's queue, next after PR 15, under the
   co-founder's delegation.
4. The design's ownership words predate the delegation of 2026-10-25.

None of the four needs a new ruling. The builder folds them in and records them.

## What I ran (at 9c57d2d)

| Check | Result |
|---|---|
| `git apply` of the patch | Fails on `packages/synth/src/cases/registry.ts:231`: ci-speed changed SEC-02's `assertedBy` context line. `git apply -3` applies all 19 files cleanly |
| `pnpm synth --all` with the patch's own text | 189 cases: 0 written, 468 unchanged. The patch's fixtures are exactly what synth writes |
| Row text changed to the design's "Moves no cash: ... and the adjustment never an entry; ..." | First run: 1 file written (LED-12 `expected.json`, the title and assertion). Second run: 0 written. `git status` shows only the 3 wording files |
| `pnpm typecheck` | Passes (21 projects) |
| eslint on the 6 changed source files | Passes |
| `pnpm check:fixtures` | Passes (244 files read, 2,764 searched, all synthetic) |
| `vitest --project unit totals.test.ts fixtures.test.ts` | 39 passed. The rows, the registry and the fixtures hold word for word and in order |
| `vitest --project db ledger.db.test.ts ledger-oracle.db.test.ts` | 48 of 48 (base 37 + 5). The 6 new tests take 0.6-0.7 s each. With my 4 probes: 52 of 52 |
| `pnpm test:oracle` (pyx12 4.0.0, after `synth --large`) | All 637 835s agree (626 valid, 11 malformed as expected). packages/edi835 agrees with pyx12 on every summary |
| pyx12 on the 7 LED-12 835s alone | All valid. `adjustments-alone.835`: balanced, payment 20000, PLB total -20000, claims 0 |
| Freeze and scope (design 9.8) | The non-test diff is empty under `packages/ledger/src`, `remittances.ts`, `postings.ts`, `ledger.ts`, `test-support/`, `packages/{pricing,edi835,db}`, `content/releases`. `--numstat packages/ledger/src`: `17 0 totals.test.ts`. Deleted lines: the 2 import lines and 1 header line |
| `git merge-tree` of PR 15 with PR #44's head 9099fac | The conflicted files are the same with and without PR 15: they are ci-speed against ci-mutation's CI rows, since #44 lacks 9c57d2d. PR 15's LED rows, registry entries and `totals.test.ts` hunk merge cleanly |
| Model identifiers, floats | None in the diff |

### Mutants

Each mutant was applied to a frozen source file, run against `ledger.db.test.ts`, `ledger-oracle.db.test.ts` and my
probe file, then restored.

| Mutant | What it does | Killed by (design tests) | Killed by (others) |
|---|---|---|---|
| m3 (design) | an offset reversal is never taken back (reading (b) without a ruling) | LED-12 FB, LED-12 72, LED-12 in-check, oracle LED-12 | probe P-a |
| m1 (design) | FB and 72 read as interest | LED-12 adjustments-alone | none |
| m6 | the reversal takes back the 100.00 reversed, not the 30.00 approved | LED-12 FB, 72, in-check, oracle LED-12 | LED-06's reversal test |
| **m5: takes back twice** | m4 plus `approvedRemaining` ignoring recoupments, so the withheld FB takes back a second 30.00 | **LED-12 FB, oracle LED-12** | LED-06 FB test, LED-07 |
| **c1: moves cash** | the reversal's share counted positive, and the deposited room not reduced by deposits, so the in-check check's 50.00 deposits 30.00 to the case line | **LED-12 in-check** | LED-09 (×2), probes P-a, P-c |
| **m4** | a positive FB (the withheld forward balance) read as a take-back, like a WO | **none** | LED-06's "records a forward balance ... counts nothing" (`ledger.db.test.ts:263`); probe P-b |
| **s1** | the reversal's share of its check counted with its sign flipped (`postings.ts:286`) | **none** | LED-09 (×2); probe P-a |
| m7 | the reversal takes back the line's whole standing approval, not the reversed claim's | none | none (62 tests, chain included) |
| period | `periodEntries`' lower bound made exclusive | the new LED-13 property | none |

So the tests catch a ledger change that moves cash (c1) or takes back twice (m5). Both mutants were restored.

The design's claim that the tests pin "moves no cash" and "once" independently of the caps does not hold for
single-point regressions:
- **Cash.** In `it` 1, no posting or EFT row is ever loaded, so its cash assertion cannot fail. In `it` 3, the
  in-check deposit arrives after the line's room (approved less proved) is already 0. `postings.ts:369-382` then caps
  any share to nothing, which hides s1.
- **Once.** The withheld FB arrives after the reversal exhausted the approval. `takeInOrder` over
  `approvedRemaining` (`remittances.ts:460`) then hides m4. This is the same masking the design found for m1 and
  fixed with `it` 2, but on the other path.

### Probes (all pass on the frozen ledger)

The probe fixtures came from 2 temporary `b.addFile` lines in `led12` and `pnpm synth --case LED-12`. Both were removed
afterwards, and `synth --all` restored the fixtures.

- **P-a.** LED-12 is approved (30.00) but not yet proved. Load `reversal-in-check.835` (taken back at once). Then load
  its 50.00 EFT row, then a check-level posting row of the same check, 50.00 under SYNEFTLED12005. No entry is added.
  This kills s1, c1 and m3.
- **P-b.** On the recovered state, load `forward-balance-withheld.835` (PLB FB +100.00 naming the claim) while the
  30.00 approval stands. Entries, totals and the line stage are unchanged. This kills m4 and m5.
- **P-c.** The design's `it` 3, plus the posting row of the in-check check. No entry is added. This kills c1.
- **P-d.** After the take-back, load the reversal as a practice-management system posts it: -100.00 against the
  corrected claim under reversal.835's trace, as LED-06's `recoupment-posting-export.csv` does.
  - The row loads (stored 1, problems 0) and matches: a check-level and a claim-level posting match.
  - No posted entry is written.
  - This is the realistic "no `posted` entry" case. The design never exercises the posted stage on a remittance that
    carries the reversal.

## Findings

### SF-1 (should_fix): LED-12's cash clause is pinned only behind the room cap; "no `posted` entry" is never exercised

- **Where:** design 5.2 (`it` 1's "No cash entry", `it` 3), 5.1's file table, A.1, A.4.
- **Issue:**
  - `it` 1 (FB and 72) loads no posting or EFT row, so `cash(practice)` cannot change whatever the ledger does.
  - `it` 3 loads the in-check deposit only after the line is fully proved, and loads no posting row at all.
  - s1, a single-point regression of the reversal's share (`postings.ts:286`), passes every LED-12 test. Only LED-09
    catches it.
  - No LED-12 test posts anything after the reversal, so "no `posted` ... entry" in the row is asserted vacuously.
- **Fix:**
  - Have synth generate two more LED-12 files:
    - `reversal-in-check-posting-export.csv`: check-level, 50.00, SYNEFTLED12005;
    - `reversal-posting-export.csv`: the reversal as the PM posts it, -100.00 against the corrected claim under
      SYNEFTLED12003, as LED-06's `recoupment-posting-export.csv` does.
  - Then make three test changes:
    - `it` 3 also stages the in-check posting row and asserts no entry (P-c).
    - Add an `it` that runs the in-check check's deposit and posting while the line can still prove, before
      `eft-export.csv` (P-a). It kills s1.
    - `it` 1 (or a new `it`) stages `reversal-posting-export.csv` after the take-back. It asserts the row loaded and
      matched, and that no posted entry exists (P-d).
  - All three pass on the frozen ledger (measured).
  - The db count becomes base + 7 or + 8, depending on whether P-d is its own `it`. The fixture gains 2 generated
    files.

### SF-2 (should_fix): "once" is pinned only behind the approval cap; m4 survives every LED-12 test

- **Where:** design 5.2 `it` 1's "Once", `it` 2; section 3's five assertions ("no second take-back ... when the forward
  balance is withheld later").
- **Issue:**
  - When `forward-balance-withheld.835` is loaded, the reversal has already taken the whole 30.00. A rule that read
    the positive FB as a take-back (m4) therefore finds nothing standing to take.
  - m4 passes `it` 1, `it` 2, `it` 3 and the oracle case. It is killed only by LED-06's injected-FB test.
  - The row says "recouped once". It should be pinned by LED-12's own tests, as the design did for m1.
- **Fix:**
  - In `it` 2 ("while an approval stands"), also load `forward-balance-withheld.835` on the recovered state. Assert
    that entries, matches and totals are unchanged and the line stays recovered (P-b).
  - This passes on the frozen ledger and kills m4 and m5.
  - `expected.json`'s `alone` sentence then names both files. No new fixture.

### SF-3 (should_fix): three different LED-12 texts; verifier step 4 cannot pass as written

- **Where:** design 3 (a), 7, 9 (verifier step 4); the patch's `matrix.ts` and `test-matrix.md`.
- **Issue:**
  - The design's text is "Moves no cash: no `posted` or `deposited` entry **and** the adjustment never an
    entry**;** the reversal ...".
  - The relayed ruling, as LANES.md, `lanes/lane-b.md` and the brief quote it, is "moves no cash: no posted or
    deposited entry**,** the adjustment never an entry**,** the reversal ...".
  - The pre-validated patch is "No cash change: ...**,** the adjustment never an entry; ...".
  - Section 7 says the patch differs only in the lead phrase, but it also differs in ", the adjustment".
  - Verifier step 4 checks the rows "against the founder's ruling word for word", so it fails on "and", on the
    punctuation and on the backticks.
  - Section 7 still calls the wording "the founder's to word". By the delegation of 2026-10-25 it is the co-founder's.
- **Fix:**
  - Keep the design's text: it is accurate to what the tests pin, and I found no better wording.
  - Record it in item 15's amendment as the row text the co-founder approved under the delegation. Quote the founder's
    ruling as he gave it ("whatever is recommended as long as it is optimized for the business and the app": (a)).
  - Change verifier step 4 to compare the three places and `expected.json` with that recorded text.
  - Fix section 7's sentence on the patch.

### SF-4 (should_fix): the 15b boundary names the wrong lane and the wrong escalation

- **Where:** design 3 (b) ("built by Lane A beside 15b"), 10 ("15b (Lane A, after PR 14 in its queue)", "which Lane A
  reserves", "it goes to the founder"), 12.
- **Issue:**
  - Since 1f35d71, LANES.md:94-96 makes PR 15b Lane B's third item, landing beside PR 15. Its freeze exception and
    PRD 13 ruling are decisions the co-founder may answer.
  - The design predates that change. It assigns 15b's fixtures, rows and escalation to Lane A and the founder.
- **Fix:**
  - Restate section 10's contract: 15b is Lane B's next design, after PR 15 merges. Lane B reserves its coinsurance,
    deductible and copay rows in 15b's claim.
  - Any change to an LED-12 or LED-13 expected amount on a share-free line is a semantics change beyond #12. It goes
    to the co-founder, who takes it to the founder unless the delegation covers it.
  - Keep the substance: share-free lines, 15b keeps LED-01 to LED-13 passing unchanged, and the list of what PR 15
    does not assert. All of it holds: every LED-12 line is `share: 'none'`, and the 835s carry only CAS CO 45.

### N-1 (nit): the patch is stale at 9c57d2d, and Appendix B's numbers are 49514e8's

- **Where:** design header ("Base 49514e8"), Appendix B.
- **Issue:**
  - `git apply` fails on the registry hunk, because ci-speed changed SEC-02's `assertedBy`. `-3` applies.
  - Synth now has 189 cases, not 179, and the unit and db bases moved with ci-speed. The 48 of 48 still holds.
- **Fix:** the builder writes the files on the latest base, as check 9.1 says. Restate the counts from the new base in
  the PR description.

### N-2 (nit): record the oracle reading in item 15's amendment

- **Where:** design 5.3, 8, 12; reconciliation-001 `:446`.
- **Issue:**
  - Adding one oracle case is consistent with "the ledger oracle pass[es] unchanged": the five cases and the harness
    are byte-identical, and the addition strengthens the oracle without relaxing it.
  - But only the design records that reading. The planned amendment text does not mention the oracle.
- **Fix:** the amendment adds one clause: "the ledger oracle gains one case (LED-12); its five cases and harness are
  unchanged".

### N-3 (nit): rule-6 table omits two shared files

- **Where:** design 11.
- **Issue:** PR #44 also edits `README.md` (`:288-293`) and `reconciliation-001.md` (`:456-460`). Both are disjoint
  from PR 15's `README.md:359-360` and item 15 (`:230-234`).
- **Fix:** add both rows ("different hunks; keep both"). Correct README's line numbers (357-359 becomes 359-360).

### N-4 (nit): count and patch-content slips

- **Where:** design 0 ("seven source files"), 4, 9.8; patch.
- **Issue:**
  - There are six changed source files, as Appendix B itself says.
  - The patch lacks the oracle header-comment edit that A.5 specifies. Check 9.8 expects four deleted lines; the
    patch has three until that edit is made.
- **Fix:** correct the count. Note that the oracle header line is still to be written.

### N-5 (nit): "for what the reversed claim approved" versus the line's other approvals is pinned nowhere

- **Where:** row text; design 5.2.
- **Issue:**
  - m7 survives all 62 tests of `ledger.db`, the oracle, `chain` and the probes. m7 takes back the line's whole
    standing approval, not the reversed claim's match.
  - Every fixture has a single approval, so the two readings coincide.
  - m6 does pin the distinction the row was written for: what was approved (30.00) against what was reversed
    (100.00).
- **Fix:** none needed in PR 15. Hand it to 15b's design, which rewrites what a reversal takes back. 15b should include
  a line holding two approvals, of which a reversal takes back only its own claim's.

### N-6 (nit): "whole rows"

- **Where:** design 5.2 and 6.2.
- **Issue:** `w.entries` reads 11 columns, not `reason`, `seq` or `created_at`.
- **Fix:** say "every column the reconcile writes", or leave it. No correction rows are involved.

## Checklist (payment-engine-reviewer, ledger)

- **Floats:** none. Amounts are `Cents` or bigint throughout, and `negateCents` replaces a unary minus.
- **Rounding:** none involved.
- **Flags and Medicare rules:** none involved. The fixed-schedule commercial contract is LED-06's.
- **Windows and dates:**
  - `effective_on` comes from BPR16. The test asserts it and the database trigger enforces it.
  - Calendar dates are compared as text.
- **Traces:**
  - The recouped entry's evidence is the reversal claim (LED-12), or the WO (LED-13).
  - No PLB is ever evidence or a match.
- **Totals and approved-but-unposted:** recovered excludes approved in every assertion (approved 3000, recovered 0).
- **Model output:** none.
- **Property test:** the LED-13 period property is added, and it kills the period-boundary mutant.
- **Golden line:** not applicable. There is no new pricing behaviour.
- **Synthetic data:** the identifiers are SYNTH*, and `check:fixtures` passes.
- **Model identifiers:** none outside attribution.
