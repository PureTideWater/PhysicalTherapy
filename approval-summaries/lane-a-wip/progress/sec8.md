## 8. Tests

Every test below is written first and fails on e908c21 where marked "fails today"; the build makes it pass. IDs are
the reserved LED-23 to LED-25.

### 8.0 The prototypes (author, 2026-10-27)

**Run 1** (`scratchpad/probes/author/interest-author-proto.mts`, database `tp_design_interest_3`, dropped) applied the
first draft after e908c21's 44 migrations and #42's, on rows the current code had written. Still true of run 2: both
CHECKs validate against stored rows, `seq` numbers the 8 stored matches 1 to 8, an INSERT naming no `seq` (the
previous image's) is numbered next, every refusal fires at its boundary and not before, and the plans read
`claim_by_superseded`, `ledger_match_by_seq` and `ledger_entry_by_evidence`
(`scratchpad/probes/author/interest-author-plans.mts`, `tp_design_interest_4`, dropped). What the review changed (the
skip, the claim reach, the per-sign bound) is what run 2 checks.

**Run 2** (`scratchpad/probes/author/run2/proto2.mts` on its own database `tp_design_interest_41`): migrated from
empty through e908c21's 44 migrations and #42's `20261107090000_mail_streams.sql` at 6f23c42b; three practices given
interest by the current code (Z: LED-16's AMT I alone; H: AMT I with an L6 of +5.40); then section 5.3's SQL applied
by the real runner as `20261110090000`; then the previous image's reconcile (this checkout's worker) run for real; then
the checks below as the job (`withJobScope`) or as the billing manager, each job block in a rolled-back transaction;
then dropped. Output (`scratchpad/probes/author/run2/proto2.out`), abridged only by dropping IDs:

```
RUN2_RESULTS_PLACEHOLDER
```

What it shows: RUN2_SHOWS_PLACEHOLDER

### 8.1 Test matrix rows (exact; `docs/product/test-matrix.md` after LED-18, and word for word in `packages/synth/src/cases/matrix.ts`)

| ID | Case | Expected |
|---|---|---|
| LED-23 | A remittance's interest reported on its claims (AMT I) and paid at the provider level (PLB L6) | Credited once per line, from the PLB L6: to the claim its reference names, whole or among other identifiers, or shared by the remittance's AMT I netted per claim and its reversals and corrections, exactly when the PLB L6s equal that AMT I and never past what each reports otherwise; a named PLB L6 above its claim's AMT I first pays the remittance's other reported interest. AMT I with no PLB L6 in its check counts nowhere and is shown as reported. A reversal and correction whose AMT I nets to zero add no interest, beside another claim or not, and a PLB L6 in a later remittance naming the claim is credited once |
| LED-24 | One PLB L6 over lines approved at different times, or attributed again after a later upload; then interest taken back | Its entries never sum past what its attribution gives it, however many reconciles run and whatever a later upload changes about the claim it names, and every reconcile completes; an entry is flagged allocated only when its amount is one of two or more parts of a pro-rata split. Interest taken back, by a reversal alone, after a restatement, or netted in one PLB L6 with interest paid, is a negative interest entry against the lines holding that claim's interest, never below zero on a line, and the interest total is net of it. Postgres refuses an interest match without its PLB L6 and claim, an entry past its PLB L6's bound either way, and a line's interest below zero; it skips the reconcile job's interest match that carries only one of them |
| LED-25 | A line's chain read back | Its matches in the order the ledger made them, within one reconcile and across reconciles, never by their IDs; the claims a correction supersedes found by index at 50,000 claims |

### 8.2 `packages/synth` cases (module 6, LED; `registry.ts` and the generated `fixtures/synthetic`)

On LED-16's two-line case (allowed 70.00 to 100.00 on 97110 and 97110-59; the correction pays 24.00 and 30.00 more),
one practice per variant; "another patient's claim" is a claim on no case line.
- **LED-23** (`workflow.led23`):
  - `paired.835`: the correction with AMT I 5.40 and `PLB L6:<its CLP07>*-5.40`, BPR02 59.40 (V07's shape). Expected:
    interest 2.40 and 3.00 from the L6, allocated; total 5.40.
  - `unnamed.835`: the same with another patient's claim reporting AMT I 2.00 and one `PLB L6*-7.40` naming nothing.
    Expected: 2.40 and 3.00 from the L6; the other 2.00 on no case line.
  - `named-net.835`: as `unnamed.835`, the L6 naming the correction (`L6:<its CLP07>*-7.40`). Expected: 2.40 and 3.00;
    the other 2.00 is the other claim's (today 7.40 reaches the case lines, and 5.40 more from AMT I).
  - `identifiers.835`: as `paired.835`, the L6's reference `"<CLP01> <CLP07> <TRN02>"`. Expected: 2.40 and 3.00.
  - `reported-only.835`: AMT I 5.40 and no L6, BPR02 54.00. Expected: no interest entry; the reported sentence.
  - `net-zero.835` after `paired.835`: the correction reversed (AMT I -5.40) and corrected again, line 1 allowed 2.00
    more and paid 2.00 more (AMT I 5.40), with no L6 (RFI 1324's shape). Expected: line 1 approved 2.00 more; no new
    interest entry (today the new correction's AMT I is credited again). The allowed amount moves too, because the
    same allowed amount paying more is "no change" (`packages/ledger/src/payment.ts:388-392`).
  - `net-zero-beside.835` after `paired.835`: the same pair beside another patient's claim reporting AMT I 2.00, and
    one `PLB L6*-2.00` naming nothing. Expected: no new interest on the case lines.
  - `later-l6.835` after `reported-only.835`: a later remittance whose `PLB L6:<the correction's CLP07>*-5.40` pays it.
    Expected: 2.40 and 3.00, dated by the later remittance.
- **LED-24** (`workflow.led24`):
  - `first.835` then `second.835`, probe R's shape: the first raises line 1's payment and line 2's allowed amount but
    not its payment, with `PLB L6:<CLP07>*-5.40`; a month later the second, a correction with the same CLP07, pays
    line 2 more. Expected: 5.40 on line 1, not allocated; nothing on line 2, after any number of reconciles, each
    completing.
  - `paired.835` then `taken-back.835`: the correction reversed alone (AMT I -5.40, paid -160.00) with
    `PLB L6*5.40` naming nothing, beside another patient's claim so the check stays positive. Expected: interest
    -2.40 and -3.00, total 0.00; the principal recouped as LED-12.
  - `paired.835`, `restated.835` (the correction reversed and corrected again with the same allowed and paid amounts:
    "no change" on both lines; AMT I -5.40 and 5.40; no L6), then `restated-taken-back.835` (the restatement reversed
    alone, AMT I -5.40, `PLB L6*5.40`). Expected: -2.40 and -3.00.
  - `paired.835` then `both-ways.835`: the correction reversed alone (AMT I -5.40) and another patient's claim
    reporting AMT I 2.00, with one `PLB L6*3.40` naming nothing. Expected: -2.40 and -3.00 on the case lines.
  - `short.835`: AMT I 5.40 on the correction and 2.00 on another patient's claim, `PLB L6*-5.00` naming nothing.
    Expected: 3.65 for the correction (1.62 and 2.03 by payment), allocated.
  - `out-of-order-2.835` uploaded before `out-of-order-1.835`: the second carries the correction with AMT I 5.40 and
    `PLB L6:<the CLP07 of another patient's claim in the first>*-5.40`; the first carries that claim. Expected: 2.40
    and 3.00 after the second; after the first is uploaded, nothing more, and the reconcile completes.
- **LED-25**: a registry entry with no file (`none(9, ...)`): database tests.
- **LED-16's fixture** takes its own design's shape (lane-b-pr15b.md section 3.5): `two-lines-adjusted.835` gains
  `PLB L6:<the corrected claim's CLP07>*-5.40` and BPR02 59.40. Its expected interest (2.40 and 3.00, allocated) is
  unchanged; the evidence becomes the L6. Without it, LED-16 would assert 5.40 of interest the check never paid.

### 8.3 What each test proves

| Test | ID | Proves | Today |
|---|---|---|---|
| `packages/ledger/src/interest.test.ts`, unit | LED-23, LED-24 | Each worked case of section 4.1 by hand, and `referenceCandidates` on the whole reference, its tokens, hyphens kept | new file |
| `interest.test.ts`, fast-check properties | LED-23, LED-24 | For any remittance of one to four L6s (either sign; naming nothing, a chain in the remittance or a chain outside it) and one to five chains (either sign, some a reversal and correction that net): every draw names one L6; each L6's draws, its unattributed rest and nothing else add up to its cash; in the exact case each chain draws exactly its reported interest, otherwise every draw has the net's sign and none passes its chain's report; each L6's draws of each sign stay within the Postgres bound, computed separately from the remittance's claims; an AMT I with no L6 gives nothing. Over any sequence of reconciles, with weights, held amounts and the attribution itself changing between them (a named set growing, a pooled L6 becoming named): nothing is written past what is left, a second call with the first call's writes gives nothing, no take-back passes what a line holds, and `allocated` holds exactly when two or more nonzero parts were split | new file |
| Mutation, `money-ledger` shard | LED-23, LED-24 | `interest.ts` at 100% (every surviving mutant killed or recorded as equivalent) | new file |
| `packages/ledger/src/stages.test.ts`, `rules.test.ts` | LED-24 | `STAGE_SIGN.interest` is `'signed'`; a negative interest entry has no problem, a zero one has "an interest entry moves an amount" | fails today (positive) |
| `apps/worker/src/reconcile/interest.db.test.ts` (new) | LED-23 | The eight LED-23 variants as their expected outcomes; every interest match the reconcile wrote carries the L6 and a claim, and every entry's evidence is the L6 (the guard that the skip of D16 can never hide the current image's own match) | fails today: 1080, 540 credited from AMT I alone, +540 on net zero, 1080 for the later L6, the reference with identifiers never credited |
| `interest.db.test.ts` | LED-24 | The six LED-24 variants; a second and third reconcile write nothing and complete; then by hand: as the job, a claim-only and an L6-only interest match return no row and no error; as the billing manager, a claim-only one is refused; an L6 of another remittance, a claim the line has no standing match to, a positive entry past its L6's bound, a negative entry on an L6 whose remittance reports no paid interest and an entry whose evidence is a claim are refused; a claim reached through a standing interest match after a person reversed the line's approval is accepted; and, as a specialist through `adjustEntry`, an adjustment taking a line below zero after a take-back is refused with its sentence | fails today: 840, allocated on one line, every take-back dropped, every refusal accepted |
| `apps/worker/src/reconcile/ledger-oracle.db.test.ts` | LED-23, LED-24 | Two appended cases from the synth `expected.json`; the original six and LED-14 to LED-17 unchanged (LED-16 against its corrected fixture) | appended |
| `payment-terms.db.test.ts:537-552`, `ledger.db.test.ts:279-294` (LED-06's PAR-18 block) | LED-16, PAR-18 | Same amounts; the evidence and the match's claim asserted | updated |
| `apps/worker/src/reconcile/chain.db.test.ts` | LED-25 | Two matches inserted in one transaction whose UUIDs sort against their order read back in insertion order from `ledgerMatches`, `CHAIN_ORDER` and the web's line query; an update of `seq` is refused; an INSERT that names no `seq` (the previous image's) is numbered next | fails today: UUID order |
| `apps/worker/src/reconcile/chain.large.db.test.ts` (new) | LED-25 | 50,000 synthetic claims bulk-inserted as the owner (one in twenty superseded) and 100,000 ledger entries, analysed: `claimLines`' recursive lookup, `unmatched.ts:187`'s EXISTS and the attribution's walk back use `claim_by_superseded`; a practice's matches in order use `ledger_match_by_seq`; the new trigger's reads use `ledger_entry_by_evidence`, `claim_once` and `ledger_entry_by_line`, and `ledger_match_rules`' new lookup `ledger_match_by_line` (EXPLAIN) | fails today: sequential scan of `claim`; no `seq` |
| `apps/worker/src/report/brand.test.ts:144` | LED-24 | The printed statement's new interest sentence | fails today (old sentence) |
| `apps/web/src/lib/routes/reconciliation-routes.db.test.ts` | LED-23, LED-24 | The line view's interest words, `takesBack` by the entry's sign, the reported-interest rows and the reverse route's refusal on `matchId`; the route world's interest reseeded as an L6 | fails today |
| `apps/web/e2e/ledger-interest.spec.ts` (new) | LED-23 | A billing manager opens Reconciliation for `paired.835`: the line's "interest paid in this check (PLB L6)", entries 2.40 and 3.00, the totals tile's Interest 5.40 (10.80 today); for `reported-only.835` the reported sentence and "No interest paid."; the period's ROI statement, generated as J10 does (`reconciliation.spec.ts:235`), shows the new interest note; axe passes | fails today |
| Catalog, cross-tenant, `pnpm db:domain-model --check --require-approval` | (CI) | No list changes; the regenerated model and function files are current and approved | must pass |

The screening-capacity gate runs on this PR (`tools/screening-capacity/watched-paths.txt` lists
`apps/worker/src/reconcile/*` and `packages/ledger/src/*`); its result goes in the PR description.

---
