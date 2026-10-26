# PR 15b design contract: ledger amounts in payment terms (combined audit #12)

- **Lane:** B. **Branch:** `co-001/pr-15b-ledger-payment-terms`, cut from the latest `claude/build-platform` (6ddd587 at design). **Worktree:** `/home/user/pr15b`.
- **Reserved (LANES.md claims):** ADR 0067; test-matrix LED-14 to LED-18; `packages/synth` cases LED-14 to LED-18.
- **Design review:** `/tmp/claude-0/-home-user-PhysicalTherapy/60beef46-8756-559c-bbb4-ddf67ef623a2/scratchpad/pr15b-design/review.md` (2026-10-26); every finding's disposition is in section 9.
- **Design author's evidence:** probes and their exact commands and outputs in
  `/tmp/claude-0/-home-user-PhysicalTherapy/60beef46-8756-559c-bbb4-ddf67ef623a2/scratchpad/pr15b-design/author.md`; the four scouts' notes beside it (`scout-{remittances,cash,screens,tests}.md`).
- **Short names:** `rem` = `apps/worker/src/reconcile/remittances.ts`, `post` = `apps/worker/src/reconcile/postings.ts`, `ldb` = `apps/worker/src/reconcile/ledger.db.test.ts`, `orc` = `apps/worker/src/reconcile/ledger-oracle.db.test.ts`, `pay` = the new `packages/ledger/src/payment.ts`.

---

## 0. Summary, the ruling it records, and the migration question

### 0.1 The ruling

On 2026-10-20 at about 15:10 UTC the founder, Tyler Williams, adopted the combined audit as a whole ("**Adopt all of it.** The 19 freeze exceptions are granted; the ruling changes the report lists are accepted as it recommends"; `/home/user/ops/HANDOFF.md`, "Founder rulings of 2026-10-20 ~15:10 UTC (combined audit)"). Item #12's ledger freeze exception is one of the 19, and PRD 13's two definitions of "approved" are one of the ruling changes. Item #12's best option, in the report's words (combined-report.md, item 12):

> Keep deciding the outcome on the allowed amount (approved, confirmed, decreased, no change), as PRD 13 says, but measure every ledger amount in what the payer actually pays: 'approved' is the payer's payment increase on the line, a posting share is net of the reversal it replaced, and a reversal takes back what was paid. A correction a deductible absorbed is recorded with no entry and the case closes as 'payer corrected; balance is the patient's', never as recovered and never as no change. The allowed increase and the patient's share are shown beside it as 'billable to the patient', never counted. The definition of recovered, the proof cap and the seven entry types do not change. New ledger fixtures cover coinsurance, a deductible and a copay.

The exception covers what matching writes (the approved amount, the posting and deposit share), what a reversal takes back, and the deductible-absorbed outcome. `LEDGER_STAGES`, the seven entry types, the definition of recovered and the proof cap stay as they are.

### 0.2 What this PR does

The outcome is still decided on the allowed amount. Every amount the ledger writes becomes the payer's cash:

- `approved` is the paired line's paid amount less what the remittances have paid the line so far.
- A posted or deposited share is what a claim paid on the line less the payment it replaced.
- A reversal takes back the payment it removes above the original.
- When the patient's share takes the whole increase, the correction writes no entry. It is shown as "Payer corrected; balance is the patient's".
- The allowed baseline the outcome is decided against stays in allowed terms (it is translated, not reduced by cash take-backs), and the two baselines are carried within a reconcile pass as today's `baseline` is.
- A higher allowed amount that pays less takes the payment decrease back from what is approved (Q2), or, with nothing approved, is recorded as decreased with no entry.
- "Billable to the patient" (the allowed increase, and the patient's share by deductible, coinsurance and copay) is worked out from stored line data and shown beside the figures, never counted.
- New cases LED-14 to LED-18 cover coinsurance, a deductible, a copay, a line holding two approvals with a reversal (N-5) and a payer response accepted before payment.
- The arithmetic goes into one new pure file, `packages/ledger/src/payment.ts`, which is mutation-tested. `reprocessing()` and every LED-01 to LED-13 test and expected amount stay as they are.

### 0.3 Migration: none for anything 15b builds. The stored case close is Lane A's.

**Nothing 15b builds needs a migration** (`migration_needed = false` for 15b): the payment-terms amounts, the no-entry outcomes and "billable to the patient" all write through today's constraints. These are the CHECK constraints, enums and triggers the change writes through, all verified at 6ddd587:

| What is written | Constraint | Under 15b |
| --- | --- | --- |
| `ledger_entry.stage` | CHECK with the seven values (20261023120000) | Unchanged: approved, posted, deposited, recouped, interest, reversed, adjusted |
| `ledger_entry` sign | `ledger_entry_sign` (20261023120000:207): approved > 0, recouped < 0 | A zero amount is never written (no entry instead). Payment-terms amounts are smaller, never of the other sign |
| A recouped entry's match | `ledger_entry_rules` (20261027090000:50-139): a recouped entry from a claim needs `outcome = 'decreased'`; an approved one needs `'approved'` | The decreased path keeps outcome `'decreased'`. Q2's recommended answer also writes `'decreased'` |
| `ledger_match.outcome` | CHECK `approved | decreased | no_change` (20261023120000:140) | Only these three. The deductible-absorbed and confirmed outcomes are `'approved'` with no entry, which is legal today (rem:310 already writes it for a confirmation). A `'decreased'` match with no entry (section 1.2: a payment decrease of zero, or Q2 with nothing approved) is legal too: `ledger_match_rules` (20261023120000:158) needs only an outcome, and the entry rules (20261023120000:451-452; 20261027090000:125) bind an entry to its match, never a match to an entry |
| Posted/deposited bounds | `ledger_entry_within_evidence`, `ledger_entry_within_line` (20261027090000:147-271): a row never proves more than its amount, a line never more than its net approval | Net shares are at most today's gross shares, and the approval is at most today's |
| Line stage | `line_status_ledger_rules` (20261023120000:585), `ledger_line_stage` (20261026090000:216-241) | Unchanged. Recovered is now reachable on coinsurance lines, because approved equals what is paid |
| `payer_response` | Kinds CHECK; `payer_response_job_records_reprocessed` (20261023090000:259): the job records only `reprocessed_no_change` | The job records it only on a no-change outcome, as today. A deductible-absorbed correction records no response ("never as no change") |
| Acceptance bound | `payer_response_within_asked` (20261026090000:250-268): at most the packet's variance | Unchanged. The payer's payment is at most the allowed variance it accepted |
| `roi_statement` | Fixed columns; `roi_links_valid` pins four link keys (20261023120000:231-238) | Unchanged. Billable to the patient never enters a statement |
| Submissions | `submission` CHECKs | Untouched |
| Ledger tables | reconciliation-001 "Ledger semantics": no migration alters, or adds a trigger or policy to, `ledger_entry`, `ledger_match`, `posting_row`, `eft_row` or `roi_statement` | No DDL at all |

The figures come from stored rows: `service_line.paid_cents` (NOT NULL, 20261016120000:148), `observed_allowed_cents`, `patient_share_cents`, and the `adjustment` rows with their group and reason (PR-1 deductible, PR-2 coinsurance, PR-3 copay; 20261016120000:183-201). No new column is needed.

**The case closing by state as "payer corrected; balance is the patient's" cannot be stored without a migration.** That migration is Lane A's, handed over under Q1's ruling (0.5); 15b does not build it and needs none. Why the stored close needs one:

- `case.state` is derived only, by `case_rules` (20261023120000:615-683). Its CHECK is `open | submitted | awaiting_response | partially_resolved | resolved | closed_written_off` (20261019160000:166).
- The case derives `resolved` only from lines at `payer_approved` or `recovered` (`line_status`), or from an accepting payer response. A line with no approved entry has ledger stage NULL (`ledger_line_stage`, `WHEN t.approved <= 0 ... THEN NULL`), so the line stays at `actionable` and the case never closes.
- The only close reasons are `case_line.written_off_reason` IN `window_passed | payer_correct_on_review | not_worth_pursuit | duplicate | other` (20261019160000:194), and the job may set only `window_passed` (CHECK at :213; `case_line_rules` at :471-486). `payer_correct_on_review` says the payer was right, which is false here. `other` needs a person, and both read as a write-off.
- `case_activity.kind` IN `note | assigned | approval_requested` needs a person (20261024110000:35,42). The only payer response the job may record is `reprocessed_no_change`, which the ruling forbids here.
- The consequence is visible on screens. The line stays in the **actionable** headline (`apps/web/src/lib/dashboard/queries.ts:93-103` counts lines whose latest stage is `actionable`), in `case.actionable_cents`, in deadlines and in follow-ups.

**The narrowest migration** (Lane A's, under CO-02 and LANES rule 2) would add:

- a close the reconcile job may write on a case line (a `case_line` close reason, for example `payer_corrected_patient_balance`, allowed with `written_off_by` NULL), which takes the line out of the actionable total;
- a case state that `case_rules` and `@tp/triage deriveCaseState` derive from it ("closed: payer corrected; balance is the patient's"), not counted as a written-off loss;
- `docs/product/domain-model.md` regenerated and the founder's SHA-256 approval.

It touches `case`/`case_line` only, none of the frozen ledger tables. Its natural home is Lane A's next case-schema migration: PR 8, beside #11's per-line payer decisions, whose derived case outcome it resembles.

**What 15b builds instead (ruled, Q1, 0.5):**

- The correction is recorded as the ruling says: a standing claim match with outcome `'approved'`, no ledger entry, no payer response, never recovered and never "no change".
- The words "Payer corrected; balance is the patient's" are worked out in code from stored rows (section 2.3) and shown on the line, the case, Reconciliation and the audit report.
- Until Lane A's migration lands, the case does not close by state, and the line stays in the actionable figures, deadlines and follow-ups (it is labelled there). That gap is sequencing, not a 15b design choice, and the stored close completes it in Lane A's PR; the interim gap is recorded in ADR 0067 and 7.1. **15b's ruled end state departs from the best option on one edge only, Q2's** (`departs_from_best_option = true`, ruled): where the allowed amount rises or stays and the payment falls, the stored outcome is `'decreased'`, following the payment rather than the allowed amount (1.2). Everywhere else the outcome is decided on the allowed amount, as the best option says.

Per LANES.md rule 2 and its line 90, the stored close is "Handed to Lane A". Lane B does not open a migration. The entry for LANES.md's "Handed to Lane A", which the orchestrator adds (Lane B's sessions do not edit LANES.md):

> 2026-10-26, from Lane B's PR 15b design (#12): the case close "payer corrected; balance is the patient's" needs a stored value. Proposed: a case-line close the reconcile job writes when a correction's payment increase is zero because the patient's share took it (PR-1/2/3), which leaves the actionable total, and a case state derived from it; `deriveCaseState` mirrors it; not a write-off. With PR 8's case schema (beside #11). 15b records the outcome with no entry and shows the words; the migration makes the case close.

The rest of this contract is written as ruled (0.5). Only section 2.3's case-state paragraph and LED-15's case assertion depend on Q1's ruling.

### 0.4 The two questions as they were put (record)

Both were ruled on 2026-10-26 ~01:05 UTC (0.5); this is the record of what was asked, kept for ADR 0067.

- **Q1 (migration).** Ship 15b with the deductible-absorbed outcome recorded (no entry) and labelled from stored rows, with the stored case close handed to Lane A's next case-schema migration (PR 8). Alternatives put: (b) hold all of 15b until a Lane A migration lands, while the coinsurance overstatement and understatement continue; (c) a person writes the line off as `other` with text, which mislabels a payer correction as a write-off and needs a person. What the ruled answer gives up until the migration: the case does not close by state, and the line stays in actionable, deadlines and follow-ups (labelled).
- **Q2 (a case the ruling does not name).** The allowed amount and the payment can move in opposite directions. Put: when a reprocessing raises (or keeps) the allowed amount but pays **less** than the remittances paid before, on a line with an approval remaining, record the match `'decreased'` and take back the payment decrease, capped by what is approved and not yet taken back (for example, the payer re-applies a deductible); when the payment rises while the allowed amount stays or falls, decide by allowed as today (no approval) and show the payment change beside it. Why: recovered must never hold money the payer took back, and the asymmetry keeps every error on the side of understating. Alternative put: decide by allowed always, which writes no entry on a payment fall with a higher allowed, so a line already proved keeps counting cash the payer has withdrawn. Given up: on that edge, the stored outcome follows the payment, not the allowed amount; the words name both.

No cost or security question arises. Everything else is inside the ruling: engineering choices are pre-approved, and wording a person sees takes the recommended option (listed in section 5.3).

### 0.5 Rulings taken on Q1 and Q2 (2026-10-26 ~01:05 UTC)

Both questions take their recommended answers, under the co-founder's standing ruling of 2026-10-26 ~00:20 UTC, relayed by the Lane B orchestrator: "Don't ask for approvals anymore just build and optimize." Every choice takes the recommended option and is recorded with its reasons. Founder-kept matters stay out of Lane B's scope, so a migration is still never Lane B's (LANES.md rule 2).

- **Q1: yes.** 15b records the deductible-absorbed outcome as the ruling says: an 'approved' match with no entry and no payer response, never recovered and never "no change". It shows "Payer corrected; balance is the patient's" from stored rows. The stored case close goes to Lane A. The orchestrator adds the "Handed to Lane A" entry of section 0.3, because Lane B's sessions do not edit LANES.md. Why: it removes the coinsurance overstatement now, and the end state once the migration lands is exactly #12's best option. This sequences the founder's ruling; it reverses nothing.
- **Q2: the recommended rule.** A reprocessing whose allowed amount is the same or higher but whose payment falls below the paid baseline, on a line with an approval remaining, is matched 'decreased'. It takes back `min(P_b - paid(n), remaining)`. A payment rise with allowed the same or lower decides by allowed, as today. Why: recovered never holds money the payer withdrew, and every error understates.
  - **Completed at the design review (B2), inside the ruled rule:** when the allowed amount is **higher**, the payment falls (`g < 0`) and nothing is approved (`remaining = 0`), the match is `'decreased'` with **no entry** and no payer response. It is not an anchor, so neither baseline moves. Words: "higher allowed, lower payment: nothing approved to take back". Today's "as today" would have approved the allowed increase for a payment that fell, which #12 forbids ("'approved' is the payer's payment increase"), and an approving match with no entry would anchor P_b at the lower payment and overstate a later approval. With the allowed amount the **same** and nothing approved, the outcome stays `no_change` (as today: "no change" is defined on the allowed amount, and no money moves either way).
- **A recommended choice recorded (S10, N-5 case (a)).** LED-12's co-founder-approved row reads "`recouped` for what the reversed claim approved" (test-matrix.md:135), and N-5 asks for "a line holding two approvals, of which a reversal takes back only its own claim's" (lane-b-pr15-design-review.md, N-5, its Fix). In case (a) of 1.3, where every claim of the line is reversed and nothing stands, the last reversal takes **24.00**, more than the 16.00 its own claim approved. Reason: nothing the payer paid on the line stands, so keeping 8.00 approved would count money the payer withdrew; #12's "a reversal takes back what was paid" governs. Where an earlier payment stands (case (b)) the reversal takes only its own claim's approval, so N-5's clause holds there, and LED-12's and LED-13's amounts are unchanged (one approval, the original reversed beside the correction). Recorded in ADR 0067 with both texts quoted.

---

## 1. Semantics

### 1.1 Notation (all integer cents, bigint; no division unless stated)

For a case line L (the service line of a `case_line`):

- **p0, a0**: the paid and observed allowed amounts of L itself (the original claim's line).
- **The line's chain**: the standing `ledger_match` rows of L in ledger order (the order `ledgerMatches` returns, which `remittanceBaseline`'s `order` map already uses). Each claim match n has the **paired line** of its claim (`caseLinePair`, @tp/ledger `pairLines`), with `paid(n)` (`service_line.paid_cents`) and `allowed(n)` (`observed_allowed_cents`). It also has `outcome(n)`, and the recouped entries matched to L in the same order.
- **Paid baseline P_b** (new, `pay.paymentChain`): a walk over the chain in ledger order. It starts at p0. At each standing `'approved'` claim match n it sets P_b := paid(n). Each recouped entry of L matched after that point adds its (negative) amount, which is cash. `P_b⁻(n)` is the paid baseline just before claim match n, and `P_b` the baseline now.
- **Allowed baseline A_b** (walked in allowed terms beside P_b by the same `pay.paymentChain`; design review B1). Today's `remittanceBaseline` (rem:234-244) adds every recouped entry after the anchor to the anchor's allowed. Once take-backs are cash, that mixes terms: LED-14 after its reversal would read 100.00 − 24.00 = 76.00 where the allowed baseline is 70.00, and a reissue at allowed 75.00 / paid 60.00 would read "no change" (a false `reprocessed_no_change` on a payer correction, and the 4.00 payment increase never approved). So each event translates A_b instead of adding cash to it:
  - a standing `'approved'` claim match n (approved, confirmed, patient balance): A_b := allowed(n);
  - a `'decreased'` claim match n with a take-back `t` (≤ 0 written as its magnitude `taken`): A_b := allowed(n) + r, where r = (P_b⁻(n) − paid(n)) − taken is the part of the payment decrease the cap left (0 when the cap did not bind). Today's capped baseline is `A_b − remaining` = allowed(n) + (A_b − allowed(n) − remaining), which this equals term for term on share-free lines. A `'decreased'` match with no entry (B2) leaves A_b unchanged;
  - a recoupment match of a reversal of x (1.5) that took `taken` of an uncapped `u`: A_b := allowed(base) + (A_b⁻ − allowed(x)) + (u − taken), where base is S's claim (the latest earlier standing claim of the chain, 1.5) or the original (a0) when nothing stands, and (A_b⁻ − allowed(x)) carries the take-backs already applied after the anchor (a PLB WO). On share-free lines u = allowed(x) − allowed(base), so this is today's `A_b⁻ − taken` exactly (checked with a prior WO w: a0 − w + w = a0, today's x − w − (x − a0 − w) = a0);
  - a PLB WO recouped entry: A_b adds it, as today (it is cash; on share-free lines cash equals allowed; its coinsurance effect is listed under 7.2).
  - Every translation equals today's `remittanceBaseline` on share-free lines; `pay`'s share-free property (3.6 A1, A6) pins it. Where r or (A_b⁻ − allowed(x)) is non-zero on a line with a patient share, A_b reads higher than the true allowed baseline, so a later rise can only be classed lower (confirmed or no change rather than approved): an understatement, never an overstatement.
  - `remittanceBaseline` is replaced by `paymentChain` in `reprocessingOf`, the one helper `rem` and `manual.ts` share, and is removed once no caller remains, so no second baseline can drift (it is in `apps/worker`, not under the ledger freeze).
- **In one reconcile pass** (design review S3): `matchClaims` reads `matches` once before its loop (rem:300-345). `reprocessingOf` therefore takes A_b and P_b from `paymentChain` once per line, then updates both **pass-locally** after each candidate exactly as `baseline` is updated today: approved, confirmed and patient balance set A_b := allowed(n), P_b := paid(n); a decreased match with a take-back sets P_b += t and A_b by the rule above; a decreased match with no entry and a no-change leave both. `remaining` and `U` are read from the pass-local `ledgers` map, as today (`after()`).
- **remaining**: `approvedRemaining` (ledger.ts:253), the net approved less net recouped, at least 0. It reads entries, so it is in payment terms once approvals are.
- **Unpaid acceptance, payment terms** `U = max(0, remaining − (P_b − p0))`: what a payer response approved that no remittance has paid yet. It replaces `unpaidApproval` (rem:247), which subtracts an allowed difference from a ledger sum. `unpaidApproval` stays only inside `reprocessing()`'s outcome decision (1.2).
- **Patient's share of a paired line**, `PR(n)` by reason, from `adjustment` rows with `group_code = 'PR'`:
  - The line's own PR CAS rows.
  - If the line has none and its claim carries claim-level PR while no line of that claim carries any, the claim's PR is allocated over the claim's lines by charge, with `@tp/edi835 allocateProRata`, the parser's own rule (`packages/edi835/src/balance.ts:31, 81-98`). It is flagged "allocated from the claim". `allocateProRata` returns cents only, so the exact fraction (numerator `total × charge`, denominator `Σ charges`) is computed beside it in `apps/worker/src/reconcile/patient-share.ts`, which already may import `@tp/edi835` (apps/worker/package.json:43). `@tp/ledger` gains no dependency (design review N2): `pay.patientShareChange` receives the PR amounts already allocated, with the flag and fraction passed through.
  - This avoids the trap that `patient_share_cents` is 0 on an AMT B6 line whose PR is at claim level (`apps/worker/src/parse/plan.ts:312`). Allowed less paid is never used as the patient's share, because it can hold non-PR reductions (CO-253 and others).

Rounding: no amount the ledger writes is divided in 15b. Every payment-terms amount is a difference of stored integer cents. The divisions that exist are unchanged:

- the pro-rata partial posting (`partialShare`, half up once);
- the response split and the interest split (`allocateByWeight`, largest remainder, the parts summing exactly);
- the display-only claim-level PR allocation above, which keeps its exact fraction beside the rounded cents and is never counted.

### 1.2 Each amount, today and under #12

| Amount | Today (6ddd587) | Under #12 (formula) | Where |
| --- | --- | --- | --- |
| **Outcome of a reprocessing** | `reprocessing({A_b, unpaidApproval, allowed(n), remaining})` (matching.ts:47-67): approved / confirmed / decreased / no_change | **Unchanged** for the kind: `reprocessing()` is called exactly as today and decides higher (approved or confirmed), lower (decreased) or no change on allowed. The one exception is Q2 (below) | rem:304, manual.ts:159 |
| **Approved by reprocessing** | `allowed(n) − A_b − unpaidApproval` | Allowed higher: gain `g = paid(n) − P_b`. If `g > U`: an `approved` entry of `g − U` (it also confirms U). If `0 < g ≤ U`: confirmed (no entry; shortfall `U − g`). If `g == 0`: **no payment increase** (no entry; the match `'approved'`; counter `noPaymentIncrease`), shown as a patient balance when the patient's share rose (2.3). If `g < 0`: Q2 | `pay.paymentOutcome` |
| **Confirmed** | `allowed(n) − A_b`, no entry; shortfall `A_b + unpaid − allowed(n)` | Kind still from allowed ("higher"). The paid gain is split in payment terms: `min(g, U)` confirms, `g − U` (if > 0) is approved for the rest. Shortfall `U − min(g, U)` | `pay.paymentOutcome` |
| **Decreased / recouped by reprocessing** | `−min(A_b − allowed(n), remaining)` | Kind from allowed (lower, with remaining > 0). Amount `−min(P_b − paid(n), remaining)`. When `P_b − paid(n) ≤ 0` the match is `'decreased'` with no entry (the sign CHECK forbids zero) | `pay.paymentOutcome` |
| **No change** | allowed same, or lower with nothing approved: `recordReprocessedNoChange` | Unchanged | rem:322-325 |
| **Q2: allowed higher or same, paid lower** (`g < 0`) | approved by allowed (or no change) | Ruled (0.5): remaining > 0: `'decreased'`, `−min(P_b − paid(n), remaining)`. Remaining = 0 and allowed **higher**: `'decreased'` with **no entry**, no payer response, not an anchor (B2). Remaining = 0 and allowed the **same**: `no_change`, as today | `pay.paymentOutcome` |
| **Recouped by reversal** (v reverses claim x of L, no correction of x beside it: rem:381 unchanged) | `min(approvedByMatch(x) ?? confirmedBy(x), remaining)` (rem:393, allowed) | `pay.reversalTakeBack` (1.5): 0 if a claim matched to L after x in the chain still stands (no loaded reversal reverses it). Else `min(remaining, max(0, (paid(x) − p0) − max(0, S − p0)))`, where S = the paid of the latest earlier claim of L's chain (the original included) that no loaded reversal reverses, or 0 when none stands. `confirmedBy` (rem:358-362) is removed. The candidates x stay the standing approving matches (rem:372, as today); the reversals query is widened only to learn which chain claims stand | rem:372-408 |
| **Recouped by PLB WO** | `takeInOrder(WO, approvedRemaining per line)` | Unchanged code. Capacities are payment terms because they read entries (pinned on coinsurance lines by LED-16's two-line variant, 3.6 B) | rem:453-486 |
| **Interest** | `allocateByWeight(interest, approvedRemaining per line)` | Unchanged code. Weights are payment terms. The interest itself is cash (AMT I, PLB L6). Interest a claim pays on a line whose remaining is 0 (a patient-balance line) is dropped, because no weight is above zero (rem:526-528): an understatement, as today for any line with nothing approved (design review N6) | rem:513-560 |
| **Posting share, line level (byClaim)** | the paired line's **gross** `paid(n)` (post:282) | `net(n) = paid(n) − P_b⁻(n)` (`pay.paymentChain`). A share ≤ 0 proves nothing (post:372 unchanged). `net(n)` is measured against the last approving anchor, not against the claim a remittance actually reversed: with a no-change claim C (paid 90) between A (80) and n (88), n's share is +8 while that check lowered the line's cash by 2. The line's totals are right; the attribution per check is not, and ADR 0067 says so (design review N3) | post:244-290 |
| **Posting/deposit share, check level (byRemittance)** | Σ gross paid of L's claims in R + Σ L's reversals in R (post:281, 284-287) | `Σ net(n)` over L's claim matches n in remittance R. A remittance with no claim match for L gives L no share (today a negative one, skipped). The same function as byClaim, so a reversal is netted exactly once, against the claim that replaced it | post:244-290 |
| **Proof cap / room** | `room = approved − proved`; part `min(share, room, row left)` | Unchanged code (post:304-402). It is now a cap in payment terms | post |
| **Payer-response approval** | `allocateByWeight(response, allowed variances)`, each ≤ its variance, less standing approvedCents | Unchanged code (responses.ts:44-85). The **amount** is the payer's payment: the form asks for "the amount the payer will pay" (section 5.3). Variances stay the weights and the cap (payment ≤ allowed variance). `standing` is in payment terms | responses.ts |
| **Shortfall** | `unpaidApproval` on the allowed baseline (shortfalls.ts:34) | `U` (payment terms), for a line with a response approval and a standing approving claim match | shortfalls.ts |
| **Manual claim match** | same compare as matchClaims (manual.ts:152-176) | Same as matchClaims through **one shared helper** in rem (`reprocessingOf`), so the two cannot drift | manual.ts |
| **payerApproved, approvedNotProved, ROI approved-unposted, lineLedgerStage, recovered** | read entries (totals.ts:89-197; roi.ts:80) | Unchanged code. Now 0 approved-not-proved once proved on coinsurance lines, and recovered reachable | totals.ts, roi.ts |

Every money input is a stored integer. Every output is `cents()`. `pay` throws `LedgerError` on a negative `remaining` or `U` (as `reprocessing()` does).

### 1.3 Worked cases (payment terms; original allowed 70.00 unless stated)

| Case | Stored data | Approved | Posted/deposited | Billable to the patient | Other |
| --- | --- | --- | --- | --- | --- |
| Coinsurance 20% | paid 56.00 → 80.00; PR-2 14.00 → 20.00 | 24.00 (today 30.00) | 24.00 from a line row of 80.00 or a check of 24.00; recovered 24.00 | 6.00 coinsurance | Allowed increase 30.00 shown beside |
| Deductible absorbs all | allowed 70 → 100; PR-1 30 → 60; paid 40 → 40 | none (match `'approved'`, no entry) | nothing (net 0; today a 40.00 line row posts 30.00 of money never paid) | 30.00 deductible | "Payer corrected; balance is the patient's"; no payer response |
| Deductible absorbs part | PR-1 50 → 70; paid 20 → 30 | 10.00 | 10.00 | 20.00 deductible | |
| Copay, unchanged | PR-3 20 → 20; paid 50 → 80 | 30.00 (= the allowed increase) | 30.00 | 0 | Kills a ratio-scaling implementation (it would give 24.00) |
| Denied, then paid | allowed 0 (CO-50), paid 0 → allowed 100, PR-2 20, paid 80 | 80.00 | 80.00 | 20.00 coinsurance | A unit case in `pay`; triage decides whether such a line is a case line |
| Reversal, no correction (LED-12 shape) | A paid 100 above p0 70, then A reversed alone; the original reversed beside A | 30.00, then recouped −30.00 | — | — | S = 0 (nothing stands): `30 − 0 = 30` |
| **Two approvals (N-5)**, coinsurance chain: 56 → A 64 → B 80 | approvals 8.00 + 16.00 | | Line rows 64.00 → 8.00 and 80.00 → 16.00 (today's gross share proves 24.00 from the first row) | | Three cases follow |
| (a) A reversed beside B, then B reversed alone | nothing stands | | | | takes **24.00** (today 16.00 in payment terms, 20.00 in allowed): every claim reversed, so the payer took back all of it |
| (b) B corrects A with no reversal of A; B reversed alone | A stands | | | | takes **16.00**, B's own (m7 takes 24.00) |
| (c) B corrects A with no reversal of A; A's reversal arrives late and alone | B stands | | | | takes **0** (today's rule 10.00 as built in allowed terms, 8.00 read in payment terms; m7 24.00): B's payment carries both approvals. R3's deposit proves 16.00 net of the late reversal |
| Interest on two lines | weights = remaining in payment terms | | | | Split by what the payer pays |
| PLB WO capacity | capacity = remaining in payment terms | | | | A WO never takes back the patient's share |
| Reversed, then reissued (B1) | LED-14 reversed (A_b back to 70.00, P_b to 56.00); reissue allowed 75.00, PR-2 15.00, paid 60.00 | 4.00 | — | 1.00 coinsurance | The mixed baseline (76.00) would read no change and record a false `reprocessed_no_change` |
| Allowed higher, payment lower, nothing approved (B2) | allowed 70 → 100, paid 56 → 50 | none (`'decreased'`, no entry, no response) | — | — | A later 80.00 at allowed 100 approves 24.00 against P_b 56.00 (not 30.00 against 50.00) |
| Response accepted before payment (coinsurance) | accepted 24.00 (the payer's payment); then paid 56 → 80 | 24.00 from the response; the remittance confirms 24.00 | 24.00 | 6.00 | No shortfall. Had the person typed the allowed 30.00, the shortfall would read 6.00, with the patient's 6.00 named beside it (section 5) |

This reading of N-5 settles the clause "takes back only its own claim's approval" as true where the earlier approval's payment still stands, case (b). Where nothing stands, case (a), "a reversal takes back what was paid" (#12) takes every approval the reversed payment carried. LED-12's row, "for what the reversed claim approved", is read as "what the reversed claim's payment carried": B's approval in (b), both approvals in (a). That reading of case (a) is a recommended choice recorded in 0.5 and ADR 0067 (design review S10); LED-12's and LED-13's amounts do not move. Recovered can go negative in the interim when a recoupment is matched before the proof (`totals.ts:131`, recovered = proved + recouped; probe 2a shows −2000 today); this is existing, frozen behaviour, and case (a) makes the interim value larger (−24.00 rather than −16.00) until the deposits are matched. ADR 0067 says so (design review N5). The probe in author.md shows today's rule and m7 on the share-free twins (2a, 2b, 2c), and that all 85 existing ledger database tests pass with m7 applied.

### 1.4 The deductible-absorbed and partly absorbed corrections

- **Recorded:** the claim match is stored with outcome `'approved'`, because the allowed amount is higher. It has no entry, because `g = 0` and the sign CHECK forbids zero, and no payer response (unlike no_change). `RemittanceOutcome` gains `noPaymentIncrease: number` and `decreasedNoEntry: number` (B2), both additive: tests read the outcome with `toMatchObject`. A patient-balance correction is a `noPaymentIncrease` whose patient's share rose (2.3).
- **The baseline moves:** `A_b := allowed(n)` and `P_b := paid(n)`, so a later reprocessing compares with this one, as the confirmed path does at rem:318.
- **The line stage:** no approved entry, so `ledger_line_stage` is NULL and the line stays at `actionable` (Q1).
- **Partly absorbed:** `0 < g` gives an ordinary approval of `g − U`.
- **A later reversal of that correction** takes back nothing more than was paid: `paid(x) − p0 = 0`.

### 1.5 The reversal rule as code reads it

`reversalTakeBack({ originalPaid, reversedPaid, standingEarlierPaid | null, laterClaimStands, remaining })`:

- `laterClaimStands` is true when a claim matched to the line after x (in ledger order) has no loaded reversal claim (`claim_status_code = '22'`, `reversal_of_claim_id = it`).
- `standingEarlierPaid` is the paid of the latest claim before x among L's own claim and its matched claims that has no loaded reversal, or null when every one has one.
- Result: `laterClaimStands ? 0 : min(remaining, max(0, (reversedPaid − originalPaid) − max(0, (standingEarlierPaid ?? 0) − originalPaid)))`.
- Each clamp is live (design review S2): the inner clamp on `reversedPaid − originalPaid` of the earlier draft was equivalent beside the outer one and is dropped. The outer `max(0, …)` is reached when the reversed claim paid less than an earlier claim that stands; through `rem` that is, for example, a no-change claim C (paid 90, allowed the same as anchor A at 80) followed by an approved x (paid 85, +5), then x reversed alone: S = 90, so `29 − 34 < 0` takes 0. Its unit case is 3.6 A7's "a claim paid 70 reversed alone while A paid 80 stands" (0).
- The function also returns `uncapped = max(0, (reversedPaid − originalPaid) − max(0, S − originalPaid))` and the base (S's match, or the original) for A_b's translation (1.1).

The query is `rem`'s existing reversals query (rem:376-384), widened to every reversal of L's chain claims. No new column is read.

### 1.6 LED-01 to LED-13 and the oracle stay unchanged

- **Share-free:** every LED-01..LED-13 case line and every paired line has `paid == observed allowed` and only CAS CO-45. Case lines come from `recoveryPair` and `multiLineRecovery` with `share: 'none'` (`packages/synth/src/cases/workflow.ts:118,119,129,147`). The tests scout scanned every 835 line in `fixtures/synthetic/LED-*/expected.json`, and the hand-built variants in ldb (:230-261, :639-660, :777-783) are share-free too. LED-06's coinsurance claim (`SYNPCNLED06003`) is another patient's and never a candidate.
- **Each new formula equals today's on share-free lines:**
  - `P_b` is today's `remittanceBaseline` term for term, because each anchor's paid equals its allowed and the recouped entries are the same; and the translated A_b (1.1) equals it too, so the outcome kinds are today's.
  - So `g = allowed(n) − A_b` and `U = unpaidApproval`. `paymentOutcome` returns exactly `reprocessing()`'s amounts (a property test in `pay` pins it).
  - **Check-level share:** every LED correction shares its remittance with the reversal of the claim it replaced, so `net(n) = paid(n) − paid(replaced)` equals today's `paid(n) + paid(reversal)`.
  - **Line-level share:** today's gross share is capped by room (one approval per line), and the net share equals that cap: LED-09 line level `min(100, 30) = 30 = 100 − 70`; LED-04 same-day `30` and `0`.
  - **LED-12:** the remittances holding only the reversal and the adjustments carry no claim match of the line, so the line gets no share there (today a negative share, skipped). Its −100.00 posting row matches the reversal claim, whose `byClaim` is undefined, as today.
  - **Reversal take-back:** LED-12 and ldb:230 hold one approval with the original reversed beside the correction, so the take-back is `100 − 70 − 0 = 30`.
- **LED-12 and LED-13 expected amounts are unchanged:** 30.00 approved, posted, deposited; −30.00 recouped; −18.00 (LED-13/LED-06's PLB WO, already cash). Nothing goes to the co-founder on that count.
- **The ledger oracle** (`orc`, not `tools/test-oracle`, which is the parser's) passes unchanged: its six cases are share-free, every posting row is check-level, and every correction sits beside its reversal. 15b only **appends** four cases (section 3.6) with hand-stated known totals. The harness and the six cases are byte-identical, following PR 15's precedent (reconciliation-001.md:241).
- **ldb stays byte-identical**, including LED-06's "not resolved" check at ldb:221. New tests go in a new file.

---

## 2. "Billable to the patient" and the patient-balance outcome

### 2.1 The figures

For each standing claim match n of a case line, `pay.patientShareChange(before, after)` takes two paired lines, each as `{ allowedCents, paidCents, pr: { deductible, coinsurance, copay, otherPr }, prAllocated }`:

- `before` = the line the baselines stood on just before n: the anchor of `P_b⁻(n)` (the latest standing approving claim match before n), or, after a reversal's take-back, that reversal's base (S's claim, or the original when nothing stands; 1.1);
- `after` = n's paired line.

It returns:

- `allowedIncreaseCents = after.allowed − before.allowed`;
- `paymentIncreaseCents = net(n)`, the ledger's own figure (`paid(n) − P_b⁻(n)`), so the screen and `paymentOutcome` read one number (design review S13); the paired lines' own paid amounts are shown beside it when a recoupment sits between and they differ;
- `patientShareChange` by reason (PR-1, PR-2, PR-3, other PR), each after minus before, **signed**;
- `otherReductionCents = allowedIncrease − paymentIncrease − Σ patientShareChange` (shown only when non-zero: "reduced by the payer for other reasons, not billable");
- `allocatedFromClaim: boolean`, with the exact fraction when allocated.

Billable to the patient = `max(0, Σ patientShareChange)`, the net of the signed changes (design review N1): when the deductible falls 10.00 and coinsurance rises 16.00 the patient owes 6.00 more, not 16.00. The signed changes are shown by reason beside it ("coinsurance +$16.00, deductible −$10.00"). It is never added to any total, statement, link, CSV, digest or headline.

### 2.2 Computed and shown where

- **Computed:**
  - in a new worker read, `apps/worker/src/reconcile/patient-share.ts`, `lineCorrections(scope, practiceId, serviceLineIds)`, exported through `apps/worker/src/reconcile/public.ts` (as `approvalShortfalls` is);
  - over `ledgerMatches`, `ledgerEntries`, `claimLines` and the PR `adjustment` rows (read with the same scope; the web reads them inside `readWithAudit` for `service_line`, purpose `reconciliation`);
  - the arithmetic in `pay`.
- **Shown:** Reconciliation's line item (beside the shortfall paragraph), the case page (a Fact and a line paragraph), and the ERA match words (section 5).
- **Also shown:** the specialist's ledger review page (`/p/[practiceId]/abstraction/ledger`, `page.tsx:133-135`), where an approval shortfall is corrected (design review S7). Its shortfall item names the patient's share of the correction in amounts only (the route reads with `phi = false`, so no reason words).
- **Kept off:** the headline (PRD 12: three numbers, never one), the ROI statement (fixed columns and links), the digest, and the audit report's columns. The report shows only the patient-balance words beside the case's state (2.3).
- **Who sees what:** amounts go to every ledger reader. The reason words (deductible, coinsurance, copay) and codes follow `queries.ts`'s rule for codes (PHI roles only). Other readers see "the patient's share".

### 2.3 "Payer corrected; balance is the patient's"

- **One definition, from stored rows** (design review S13): a line has a **no-payment-increase correction** when its latest standing approving claim match n has no entry with that `match_id` and `net(n) == 0` (`pay.paymentChain` over the stored chain). This is exactly `paymentOutcome`'s `g == 0` (g is `net(n)`), and it tells it apart from a confirmation, which is also `'approved'` with no entry but has `net(n) > 0`. `lineCorrections` returns `correction`:
  - `'patient_balance'` when the patient's share rose (`Σ patientShareChange > 0`): "Payer corrected; balance is the patient's";
  - `'other_reductions'` when it did not (the increase went to non-PR reductions, CO-253 and others): "Payer corrected; it pays nothing more (other reductions)". Never billable to the patient, never recovered, never "no change".
- **A case shows "Payer corrected; balance is the patient's" when** at least one of its lines is a `'patient_balance'` line and every other line not written off is a `'patient_balance'` line or at `payer_approved` or `recovered`.
- **Shown** in the case page's state area beside the stored state badge, and on the Reconciliation line. In the audit report, `content.ts` keeps `state: row.state` exactly as stored (content.ts:643, read by the `openCases` count at :664 and by the CSV) and adds a separate field `patient_balance: true` (present only when true, as `unattested_submissions` is at :665); `html.ts caseStateText` (:76-79) renders it after the state, "{state}; payer corrected, balance is the patient's" (design review S6).
- **Interim (Q1, ruled):** the stored `case.state` stays as `case_rules` derives it. The line stays in actionable, labelled, until Lane A's stored close.
- **Never** "recovered" and never "no change". No new ledger stage and no change to `LEDGER_STAGES` or the line stages.

---

## 3. Records: PRD 13, ADR 0067, reconciliation-001, the test matrix, synth cases, tests

### 3.1 PRD 13 (and PRD 12's headline), exact text

`docs/product/PRD.md`, section 13, Entries table, `approved` row, column "Created when":

> A payer response accepts an amount the payer will pay, or an adjusted remittance arrives for a case line with a higher allowed amount than the remittances so far: the payer's payment increase on the line, never the patient's share

Section 13, Matching step 1, the sentence from "A match with a higher observed allowed":

> A match with a higher observed allowed than the remittances so far is approved: an `approved` entry for the payer's payment increase on the line (its paid amount less what the remittances paid it so far), and no entry when the patient's share took the whole increase, which the case shows as "payer corrected; balance is the patient's", never recovered and never no change. The allowed increase and the patient's share (deductible, coinsurance, copay) are shown beside it as billable to the patient, never counted. A match with the same allowed amount, or a lower one on a line with nothing approved, is recorded as a payer response of kind "reprocessed, no change"; a lower one on an approved line takes back the payment decrease. Every ledger amount is the payer's cash: a line's share of a remittance is what it paid on the line net of the payment it replaced.

Section 13, Recoupments and reversals, first sentence, append:

> A reversal takes back the payment it removes above the original: its own claim's approval while an earlier payment of the line stands, every approval its payment carried when nothing stands, and nothing while a later claim of the line stands.

Section 12, "What a customer sees as the headline": `payer approved (what has been accepted)` → `payer approved (what payers have agreed to pay)` (wording; recommended).

Under Q2 as ruled (0.5), step 1 also gains: "A reprocessing that raises or keeps the allowed amount but pays less takes back the payment decrease from what is approved; when nothing is approved and the allowed amount is higher, it is recorded as decreased with no entry: higher allowed, lower payment, nothing approved to take back."

### 3.2 ADR 0067

- **Filename:** `docs/adr/0067-measure-every-ledger-amount-in-what-the-payer-pays-decide-the-outcome-on-the-allowed-amount-show-the-patients-share-beside-and-take-back-on-a-reversal-the-payment-it-removes.md`
- **Title:** `# 0067. Measure every ledger amount in what the payer pays, decide the outcome on the allowed amount, show the patient's share beside, and take back on a reversal the payment it removes`
- **Header:**
  - Status: accepted (amends 0042 and 0046 for the amounts matching writes, the cash shares, the reversal take-back and the payer-response amount).
  - Date: the build's date.
  - Deciders: founder (the combined audit adopted 2026-10-20 ~15:10 UTC); Q1 and Q2 ruled on 2026-10-26 ~01:05 UTC under the co-founder's standing ruling of ~00:20 UTC ("Don't ask for approvals anymore just build and optimize"), relayed by the Lane B orchestrator.
  - PRD sections: 12, 13.
  - Test matrix: LED-14 to LED-18.
- **Sections:**
  - **Context:** audit #12's finding, with the probe numbers.
  - **Decision:** sections 1 and 2 of this contract, with each formula.
  - **The founder's ruling:** quoted as 0.1.
  - **Q1 and Q2:** the questions as put (0.4) and their rulings (0.5), including Q2's completion at the design review (B2) and the recorded choice on N-5 case (a), quoting LED-12's row (test-matrix.md:135) and N-5 (S10).
  - **Known limits, stated:** `net(n)` is measured against the last approving anchor, so the per-check attribution can differ from the claim a check reversed while the line's totals are right (N3); recovered can go negative in the interim when a recoupment is matched before the proof, existing and frozen behaviour, larger in N-5 case (a) (N5); a PLB WO followed by a resend of the same correction approves the withdrawn amount again, as today (N4, 7.2); where a WO or a capped take-back sits on a line with a patient share, A_b can read above the true allowed baseline, which can only understate (1.1).
  - **What does not change:** stages, recovered, the proof cap, `reprocessing()`, LED-01 to LED-13, the oracle's six cases.
  - **Consequences**, including that no customer data exists to convert: synthetic only, no ROI statement sent.
  - **Handed to Lane A:** the stored close.

### 3.3 reconciliation-001

- **Where:** a new item **15b** in "Proposed pull requests, in order", directly after item 15's amendment (before "16. Milestone 11 exit"). Exact words:

> 15b. **Ledger amounts in payment terms (combined audit #12).**
>     - **Covers:** the combined audit's item #12, adopted by the founder, Tyler Williams, with the whole audit on October 20, 2026, about 15:10 UTC ("Adopt all of it": the 19 freeze exceptions granted, #12's ledger exception among them, and the ruling changes accepted, PRD 13's two definitions of "approved" among them). Lane B; no migration.
>     - **Contents:** the outcome of a reprocessing is still decided on the allowed amount; every amount the ledger writes is the payer's cash: `approved` is the payer's payment increase on the line, a posting or deposit share is net of the payment it replaced, and a reversal takes back the payment it removes. A correction the patient's share took whole writes no entry and is shown as "payer corrected; balance is the patient's"; the allowed increase and the patient's share are shown beside as billable to the patient, never counted. The arithmetic is `packages/ledger/src/payment.ts` (an addition); `reprocessing()`, `LEDGER_STAGES`, the seven entry types, the definition of recovered and the proof cap are unchanged. Recorded in `docs/adr/0067`.
>     - **Acceptance:** LED-14 to LED-18 in `test-matrix.md`, `matrix.ts` and the registry, asserted by `apps/worker/src/reconcile/payment-terms.db.test.ts`, `packages/ledger/src/payment.test.ts` and four appended oracle cases; LED-01 to LED-13, their fixtures and `ledger.db.test.ts` unchanged; the mutation gate above 85% with no unexplained survivor.
>     - **Handed to Lane A:** the stored case close (a case-line close the job writes, and a case state derived from it), with PR 8's case schema; until it lands the case shows the words from stored rows and keeps its derived state. *(Q1 and Q2 ruled on 2026-10-26 ~01:05 UTC under the co-founder's standing ruling of ~00:20 UTC ("Don't ask for approvals anymore just build and optimize"), relayed by the Lane B orchestrator.)*

- **"What must not change, as checks", Ledger semantics**, amend two bullets (exact):
  - "LED-01 to LED-11 and the ledger oracle pass unchanged." → append: "*Amended (PR 15b, combined audit #12):* the oracle's six cases and its harness are unchanged; PR 15b appends four cases (LED-14 to LED-17)."
  - "Changes under `packages/ledger/src` are additions only: …" → append: "*Amended (PR 15b, combined audit #12, the founder's adoption of 2026-10-20):* PR 15b adds `payment.ts` (payment-terms amounts, the posting share net of the payment it replaced, the reversal take-back, billable to the patient) and its export; the amounts the reconcile step writes follow it under #12's freeze exception. `LEDGER_STAGES`, the seven entry types, `reprocessing()`, the recovered total and the proof cap are untouched."
- **Item 15's boundary paragraph** (reconciliation-001.md:244): append: "PR 15b's LED-17 pins the line holding two approvals (section 1.5 of its design)."

### 3.4 Test matrix rows (exact; `docs/product/test-matrix.md` after LED-13, and word for word in `packages/synth/src/cases/matrix.ts`)

```
| LED-14 | Adjusted remittance on a line with coinsurance | `approved` for the payer's payment increase, posted and deposited net of the payment it replaced, and recovered; the patient's share shown as billable to the patient, counted in no total; a later reversal `recouped` for what was paid, and a reissue after it `approved` for its payment over the original; a partial check-level posting proves the line's share net of the payment it replaced; a lower reprocessing in the same reconcile takes back the payment decrease |
| LED-15 | Correction a deductible absorbed | No entry: shown as payer corrected, balance the patient's, never recovered and never no change; a correction the deductible absorbed in part `approved` for what the payer paid; a higher allowed amount paying less with nothing approved recorded as decreased with no entry, and a later correction `approved` against the payment before it |
| LED-16 | Adjusted remittance on a line with a copay | `approved` for the payment increase, the allowed increase when the copay is unchanged; beside a coinsurance line of the same claim, interest split and a provider-level withholding taken in order by what the payer pays |
| LED-17 | A line holding two approvals, then a reversal | Each posting share net of the claim it replaced; the reversal `recouped` for the payment it removes: its own claim's approval while the earlier payment stands, every approval when nothing stands, nothing while a later claim stands |
| LED-18 | Payer response accepted before the remittance pays it, on a line with coinsurance | The acceptance is the payer's payment; the remittance confirms it with no shortfall; approved but not yet posted reaches zero once proved; billable to the patient in no figure |
```

The paragraph after the table (test-matrix.md:138) gains:

> LED-14 to LED-18 were added by PR 15b under the founder's adoption of the combined audit on 2026-10-20 (item #12, ledger amounts in payment terms; docs/adr/0067). LED-17 is the line holding two approvals that PR 15's review handed on (N-5). LED-01 to LED-13 are share-free, so their amounts are the same in payment terms.

None of the five assertions contains " | ", so the registry regex (`fixtures.test.ts:36`) reads them.

### 3.5 Synth cases LED-14 to LED-18

All are in `packages/synth/src/cases/workflow.ts`:

- new generators `led14` to `led18`, using the existing `ShareKind`s (`common.ts:55, 81-106`) and `overrides.patientShare` for the deductible amounts;
- the reversal side from `reversalOf`, which negates PR too (`packages/synth/src/x12/factory.ts:272-290`);
- `recoveryScenario(b)` (proof level deposited, required by `orc`:157);
- plan `SYNPLAN-FIX-LED`, 97110 × 2, service date 2026-03-09, payer basics 'L' (so `LedgerWorld.caseFor` opens the case);
- control numbers unique per case (`common.ts:24-29`), with SYNTHSENDER in an identifier column of every export row (synth-fixture skill).

`recoveryPair` and `multiLineRecovery` stay byte-identical, so LED-02..LED-12's bytes cannot move. A reversal alone sits beside another patient's claim paying more, because `bpr02_cents >= 0` (20261016120000:65). A 0.00 check uses BPR01 H / NON (LED-12's precedent).

Registry (`packages/synth/src/cases/registry.ts`, after LED-13):

- LED-14 to LED-18 each `completesIn: 9`, with `build: workflow.ledNN`;
- `assertedBy`: `apps/worker/src/reconcile/payment-terms.db.test.ts` and `packages/ledger/src/payment.test.ts`, plus `apps/worker/src/reconcile/ledger-oracle.db.test.ts` for LED-14 to LED-17 and `apps/web/e2e/ledger-patient-share.spec.ts` for LED-14 and LED-15.

| Case | Files | Amounts | `expected.json` `outcome` |
| --- | --- | --- | --- |
| LED-14 coinsurance | `original.835` (allowed 70.00, CAS CO-45 80.00, PR-2 14.00, paid 56.00, BPR 56.00); `adjusted.835` (reversal of the original with PR-2 −14.00, and the correction: allowed 100.00, CO-45 50.00, PR-2 20.00, paid 80.00, REF F8; BPR 24.00); `lines-posting-export.csv` (one line-level row: claim ref, 97110, 03/09/2026, 80.00, the correction's trace); `posting-export.csv` (check level, 24.00); `eft-export.csv` (24.00); `reversal.835` (the correction reversed alone beside another patient's claim paying 150.00; BPR 70.00); `reissued.835` (B1: after the reversal, a reissue allowed 75.00, CO-45 75.00, PR-2 15.00, paid 60.00; BPR 60.00); `shared-adjusted.835` (S9: `adjusted.835`'s reversal and correction beside another patient's claim paying 150.00; BPR 174.00) with `shared-posting-export.csv` (one check-level row of 87.00 on that trace); `lowered.835` (S3: the correction's reversal and D: allowed 87.50, CO-45 62.50, PR-2 17.50, paid 70.00, beside another patient's claim paying 150.00; BPR 140.00) | approved 2400; posted 2400 (either export); deposited 2400; reversal −2400; reissue approved 400; shared check posted 1200 (net 24.00 × 87/174; a gross 80.00 share gives 40.00, capped to 24.00); `adjusted.835` and `lowered.835` in one reconcile: approved 2400, recouped −1000 | `entries` [approved 2400, posted 2400, deposited 2400, recouped −2400]; `recoveredCents` "0" (after the reversal), `recoveredBeforeReversalCents` "2400"; `billableToPatient` { allowedIncreaseCents "3000", paymentIncreaseCents "2400", coinsuranceCents "600" }; `postedEntries` 1; variants `reissued` { approvedCents "400", coinsuranceCents "100" }, `shared` { postedCents "1200" }, `onePass` { entries [approved 2400, recouped −1000] }. The top-level `outcome` is the oracle steps' path (S12): entries [approved 2400, posted 2400, deposited 2400, recouped −2400], `recoveredCents` "0" |
| LED-15 deductible | `original.835` (allowed 70.00, PR-1 30.00, paid 40.00); `adjusted.835` (reversal −40.00 and correction allowed 100.00, PR-1 60.00, paid 40.00; BPR 0.00, H/NON); `lines-posting-export.csv` (the correction's 40.00 row); `reversal.835` (the correction reversed alone beside another claim); `partial-original.835` (allowed 70.00, PR-1 50.00, paid 20.00); `partial-adjusted.835` (correction allowed 100.00, PR-1 70.00, paid 30.00; BPR 10.00); `partial-eft-export.csv` (10.00); `partial-lowered.835` (Q2: a second reprocessing, allowed 100.00, PR-1 80.00, paid 20.00, beside another claim); `raised-lower.835` (B2, its own practice: from `original.835`, the reversal and a correction allowed 100.00, CO-45 50.00, PR-1 66.00, paid 34.00, beside another patient's claim paying 150.00; BPR 144.00); `raised-after.835` (B2: that correction's reversal and a later one, allowed 100.00, CO-45 50.00, PR-1 50.00, paid 50.00; BPR 16.00) | whole: no entry; part: approved 1000; Q2: recouped −1000; B2: `'decreased'` with no entry, then approved 1000 (against P_b 40.00, not 1600 against 34.00) | The top-level `outcome` (S12): `entries` [] and no `recoveredCents` key; `matches` [{kind claim, outcome approved}]; `correction` "patient_balance"; `billableToPatient` { allowedIncreaseCents "3000", paymentIncreaseCents "0", deductibleCents "3000" }; `partial` { entries [approved 1000, deposited 1000], billable deductible "2000", `lowered` entries [+ recouped −1000] }; `raisedLower` { matches [{outcome decreased}], entries [], `after` entries [approved 1000] } |
| LED-16 copay | `original.835` (allowed 70.00, PR-3 20.00, paid 50.00); `adjusted.835` (correction allowed 100.00, PR-3 20.00, paid 80.00; BPR 30.00); `posting-export.csv` (30.00); `eft-export.csv` (30.00); S9's two-line variant, its own case of two lines on one claim, 97110 × 2 and 97110-59 × 2 on one day (the `multiLineRecovery` same-day precedent, workflow.ts:197-199, so `pairLines` pairs them by modifier), built by `led16` itself so `multiLineRecovery` stays byte-identical: `two-lines-original.835` (L1 allowed 70.00, CO-45 80.00, PR-2 14.00, paid 56.00; L2 allowed 70.00, CO-45 80.00, PR-3 20.00, paid 50.00; BPR 106.00), `two-lines-adjusted.835` (the reversal and the correction: L1 allowed 100.00, PR-2 20.00, paid 80.00; L2 allowed 100.00, PR-3 20.00, paid 80.00; claim AMT I 5.40; BPR 59.40), `two-lines-wo.835` (PLB WO −30.00 naming the corrected claim, beside another patient's claim paying 150.00; BPR 120.00) | approved 3000; posted 3000; deposited 3000; two lines: approved 2400 and 3000, interest 240 and 300 (by payment; by allowed 270 and 270), WO −2400 and −600 (in order by payment capacity; by allowed −3000 and 0) | `entries` [approved 3000, posted 3000, deposited 3000]; `recoveredCents` "3000"; billable 0; `twoLines` { L1 [approved 2400, interest 240, recouped −2400], L2 [approved 3000, interest 300, recouped −600] } |
| LED-17 two approvals | `original.835` (allowed 70.00, PR-2 14.00, paid 56.00); `adjusted.835` (R2: reversal of the original and A: allowed 80.00, PR-2 16.00, paid 64.00; BPR 8.00); `second.835` (R3: reversal of A and B: allowed 100.00, PR-2 20.00, paid 80.00; BPR 16.00); `lines-posting-export.csv` (A's 64.00 row on R2's trace, B's 80.00 row on R3's); `eft-export.csv` (8.00 on R2, 16.00 on R3); `reversal.835` (R4: B reversed alone beside another claim); `second-alone.835` (R3': B correcting A with no reversal of A; BPR 80.00); `second-alone-eft-export.csv` (8.00 on R2, 80.00 on R3'); `retracted.835` (R4': B reversed alone beside another claim); `late-reversal.835` (R4'': A reversed alone beside another claim) | (a) approved 800 + 1600; posted 800 + 1600; deposited 800 + 1600; recouped −2400; (b) recouped −1600; (c) no recoupment | The top-level `outcome` is variant (a), the oracle steps' path (S12): `entries` [approved 800, approved 1600, posted 800, posted 1600, deposited 800, deposited 1600, recouped −2400] (sums: approved 2400, deposited 2400, recouped −2400), `recoveredCents` "0". Variants `standing` { recouped −1600, recoveredCents "800" }, `late` { recoveredCents "2400", recoupments 0 } |
| LED-18 response accepted | `original.835` (as LED-14's original, its own control numbers); `adjusted.835` (as LED-14's correction); `eft-export.csv` (24.00). The response is recorded by the test (`LedgerWorld.respond`, accepted 24.00, 2026-05-20), so the case's `scenario` says so | approved 2400 (from the response); confirmed by the remittance; deposited 2400 | `entries` [approved 2400 (payer_response), deposited 2400]; `shortfallCents` null; `roi` { approvedUnpostedCents "0", recoveredCents "2400" } |

### 3.6 The tests: what each assertion pins, and the mutant it kills

**A. `packages/ledger/src/payment.test.ts`** (unit and fast-check; the mutation gate runs only these). Each item is the test, then what it kills:

1. `paymentOutcome` on share-free inputs equals `reprocessing()` for every kind and amount (property over `allowed == paid`). It pins "LED-01 to LED-13 unchanged" as arithmetic. The same property runs `paymentChain` over generated share-free chains (anchors, confirmations, decreases capped and uncapped, reversal take-backs with and without a prior WO) and asserts the translated A_b equals today's additive allowed walk at every step (B1). Kills: an off-by-one or sign mutant on `g`, `U` or the decrease, and a sign or term mutant in A_b's translation.
2. Coinsurance gives approved 2400. Copay gives 3000. Deductible whole gives `no_payment_increase` with no amount. Part gives 1000. Denied-then-paid gives 8000. Kills: `g − U` → `g`, `> U` → `>= U`, a `no_payment_increase` branch removed, and any scaling by allowed.
3. Confirmed: `U = 2400, g = 2400` gives confirmed 2400, shortfall 0. `U = 3000, g = 2400` gives confirmed 2400, shortfall 600. `U = 1000, g = 2400` gives approved 1400 that confirms 1000. Kills: the split boundaries and the shortfall arithmetic.
4. Decreased: `P_b − paid(n)` capped by remaining. Zero gives no entry. Allowed lower with remaining 0 gives no_change. Kills: the cap, a sign change, and `> 0` → `>= 0`.
5. Q2 (as ruled): allowed higher with paid lower and remaining > 0 gives decreased −1000; allowed the same with paid lower gives decreased capped by remaining. **B2:** allowed higher (70 → 100), paid lower (56 → 50), remaining 0 gives `decreased` with amount 0 (no entry) and no anchor: a following `paymentChain` step at paid 80 gives approved 2400, not 3000; allowed the same, paid lower, remaining 0 gives `no_change`. Kills: the outcome-on-allowed-only reading, "else as today" (an approval of 3000), and treating the no-entry decrease as an anchor (3000 on the next step).
6. `paymentChain`: the paid baselines and `net(n)` over the chain, with recouped entries after an anchor, a no_change and a decreased claim (not anchors), and an early reversal recouped before the correction (`net(B) = 80 − (64 − 8)`). Property: on share-free chains, `P_b` equals the allowed walk. **A_b in allowed terms (B1):** LED-14's chain after its reversal gives A_b 7000 and P_b 5600 (the additive walk would give 7600), and the next step at allowed 7500 / paid 6000 gives approved 400; a decreased step capped by remaining gives A_b = allowed(n) + r; a decreased step with no entry and a no-change leave both baselines. Kills: the anchor test (`'approved'`), the recouped-after-anchor filter, the order, adding a cash take-back to A_b (7600 reads no change), and r's sign.
7. `reversalTakeBack`: (a) 2400, (b) 1600, (c) 0, LED-12 3000, the cap by remaining, the original standing (`S = p0`). Kills: **m7's analogue** (`return remaining`: (b) gives 2400, not 1600), the `laterClaimStands` guard removed ((c) gives 800 or 2400), and the clamp `max(0, S − p0)` → `S − p0`. The clamp is pinned by a case whose remaining exceeds what the reversal removes (an unpaid acceptance beside it): with S = 0 the mutant takes the whole remaining. **The outer clamp (S2):** "a claim paid 70 reversed alone while A paid 80 stands" (originalPaid 5600, reversedPaid 7000, S 8000, remaining 2400) expects 0; without the outer `max(0, …)` it gives −1000. The formula has no inner clamp, so no equivalent mutant is left to record. The returned `uncapped` and base are asserted for (a), (b) and the capped case.
8. `patientShareChange`: the reasons, `otherReduction` non-zero (a CO-253-like reduction), the claim-level allocation flag and its exact fraction. Property: the parts sum to `allowedIncrease − paymentIncrease`. Kills: a mutant adding a reason to the wrong bucket, or dropping the allocated flag.

**B. `apps/worker/src/reconcile/payment-terms.db.test.ts`** (new; LedgerWorld; one practice per `it`; ldb untouched):

- **LED-14:**
  - "approves the payer's payment increase, not the allowed increase": stages `[approved 2400]`, `remittances.approved` 1, the match `'approved'`. Kills today's allowed amount.
  - "posts the gross line-level row net of the payment it replaced": `lines-posting-export.csv` gives posted 2400. With one approval the cap also gives 2400, so this pins the outcome and LED-17 pins the share.
  - "deposits the check net and recovers the line": recovered 2400, `lineStage` `recovered`, `approvedUnproved` 0, `payerApprovedCents` 2400. Today it is payer_approved with 600 (probe 1a).
  - "a later reversal takes back what was paid": recouped −2400, recovered 0, line reopened. Today −3000 and −600 (probe 1b).
  - "billable to the patient beside, in no total": `lineCorrections` gives { allowedIncrease 3000, paymentIncrease 2400, coinsurance 600 }; `ledgerTotals` and the ROI statement contain no 600.
  - "a claim matched by hand compares as the reconcile does": `matchClaimByHand` gives approved 2400. It pins the shared helper.
  - (B1) "a reissue after the reversal approves its payment over the original": `reversal.835` then `reissued.835` gives a second approved entry of 400, the match `'approved'`, no `payer_response`. Kills the mixed baseline (76.00 reads no change and records `reprocessed_no_change`).
  - (S9) "a partial check-level posting proves the line's net share": `shared-adjusted.835`, then `shared-posting-export.csv` (87.00 of a 174.00 check) gives posted 1200. Kills a gross `paid(n)` share (40.00, capped to 24.00).
  - (S3) "two candidates in one reconcile compare with the pass's own baselines": `adjusted.835` and `lowered.835` loaded, then one reconcile: approved 2400, then `'decreased'` recouped −1000. Kills a P_b rebuilt from stored matches inside the pass (56.00 gives no take-back).
- **LED-15:**
  - "a correction the deductible took whole writes no entry and no response": `w.entries` `[]`; the claim match `'approved'`; `payer_response` count 0; `remittances.noPaymentIncrease` 1; line `actionable`; `lineCorrections` `correction` `'patient_balance'`, deductible 3000. Kills no_change recording and an approved entry of the allowed increase.
  - The line-level 40.00 row proves nothing, and the later reversal writes nothing (today 3000 posted, then −3000).
  - "in part: approved for what the payer paid": approved 1000, deposited 1000, recovered, billable 2000.
  - (Q2) "a reprocessing that lowers the payment takes the decrease back": `'decreased'`, recouped −1000.
  - (B2) "a higher allowed amount paying less with nothing approved is decreased with no entry": `raised-lower.835` gives a `'decreased'` match, no entry, no `payer_response`, `remittances.decreasedNoEntry` 1, and the ERA words "higher allowed, lower payment: nothing approved to take back"; then `raised-after.835` gives approved 1000. Kills "as today" (approved 3000) and an anchor at 34.00 (1600).
  - (S13) "a correction other reductions took whole is shown as such": a hand-built variant (the correction's CO-253 rises by the increase, PR unchanged) gives no entry and `correction` `'other_reductions'`, never billable.
  - The case's state is asserted as `case_rules` derives it (unchanged), and the words come from `lineCorrections`. Q1.
- **LED-16:**
  - "a copay unchanged approves the allowed increase": 3000 approved, posted and deposited. Kills ratio scaling (2400) and subtracting the new share (1000).
  - (S9) "interest and a withholding across two lines go by what the payer pays": `two-lines-original.835`, `two-lines-adjusted.835`: approved 2400 and 3000, interest 240 and 300 (`allocated` true). Then `two-lines-wo.835`: recouped −2400 and −600. Kills weights or capacities in allowed terms (270/270; −3000/0).
- **LED-17:**
  - "(a) each line row proves its own claim's net, and the reversal of the last takes back every approval when nothing stands": the line rows load **before** the EFT. Posted 800 then 1600: today's gross share posts 2400 from the first row, killed. Recouped −2400: today's rule gives −1600 in payment terms and −2000 in allowed. Recovered 0.
  - "(b) the reversal of a correction takes back only its own approval while the earlier payment stands": −1600. Kills **m7** (−2400).
  - "(c) a late reversal of a superseded claim takes back nothing while the later claim stands": no recoupment match or entry, no notice, the line not reopened. R3's 80.00 deposit proves 1600 (net of the late reversal). Kills today's rule (−1000 as built, −800 read in payment terms) and m7's −2400.
  - (S3) "R2 and R3 loaded before one reconcile": `adjusted.835` and `second.835`, then one reconcile: approved 800 then 1600 (the second compared with the pass's P_b 64.00, not the stored 56.00, which would give 2400).
- **LED-18:**
  - "an acceptance of the payer's payment is confirmed by the remittance with no shortfall": approved 2400 from `payer_response`; `remittances.confirmed` 1; `approvalShortfalls` empty; deposit gives recovered 2400.
  - `generateRoiStatement` then `recomputeStatement`: approved_unposted 0. The statement, its links and `roiStatementCsv` hold no 600.
  - A variant: an acceptance typed as the allowed 3000 gives shortfall 600, with `lineCorrections` coinsurance 600 beside it. It pins that the shortfall is in payment terms and names the patient's share.

**C. `orc`** (append to `CASES` only; harness and six cases byte-identical). Known totals by hand:

- LED-14 [posting `lines-posting-export.csv`, eft, remittance `reversal.835`]: approved 2400, posted 2400, deposited 2400, recouped −2400, interest 0, recovered 0, postedEntries 1, lineStage `actionable`.
- LED-15 [posting `lines-posting-export.csv`]: all 0, postedEntries 0, lineStage `actionable`. Its `expected.json` top-level `outcome` holds `entries` [] and no `recoveredCents` key, so the harness's self-check (orc:177-195) agrees with these known totals (S12).
- The harness compares each fixture's top-level `outcome` with `known` (orc:177-195), so LED-14's and LED-17's top levels are the paths these steps take (3.5): LED-17's is variant (a).
- LED-16 [eft]: approved 3000, deposited 3000, recovered 3000, postedEntries 0, lineStage `recovered`.
- LED-17 [remittance `second.835`, posting `lines-posting-export.csv`, eft, remittance `reversal.835`]: approved 2400, posted 2400, deposited 2400, recouped −2400, recovered 0, postedEntries 2, lineStage `actionable`.

**D. Screens:**

- `apps/web/src/lib/routes/reconciliation-routes.db.test.ts`, new `it`s on LED-14 and LED-15: the linkage item carries `data-billable` with the figures and the reason (a PHI role) and without the reason (a non-PHI reader); the patient-balance words; the ERA words with the payment increase.
- `apps/web/e2e/ledger-patient-share.spec.ts` (new; helpers in `e2e/ledger.ts`, not #42's): loads LED-14 and LED-15 through the product, then asserts the Reconciliation paragraph, `?case=`, the case page's Fact and line words, and that the dashboard's three headline figures exclude 600.
- Existing assertions whose words change (all four; design review S4):
  - `apps/web/src/components/reports/display.test.tsx:83`: the reports note;
  - `apps/web/e2e/packets.spec.ts:431`: the form label; and `:434`: `'$60.00 accepted'` → `'$60.00 the payer will pay'` (the response listing);
  - `apps/worker/src/report/report.test.ts:156`: html.ts:143's note.
- New assertions for the other changed words: `report.test.ts` gains the `approvedNone` note (html.ts:143) and the patient-balance State text from `caseStateText` with `state` unchanged (S6); `packages/triage/src/headline.test.ts` gains the payer approved note (headline.ts:54); a new `apps/web/src/components/reconciliation/display.test.tsx` asserts `correctionWords` for the Q2, decreased-with-no-entry, patient-balance and other-reductions matches, and `outcomeWords` stays 'higher allowed: approved' for an ordinary approval (reconciliation.spec.ts:125 unchanged; S5).
- The specialist's ledger review page (S7): `apps/web/src/lib/routes/reconciliation-routes.db.test.ts` (or the specialist route's test beside it) asserts the LED-18 variant's 600 shortfall names "the patient's share of the correction is $6.00" and no reason word (`phi = false`).
- The audit report's State words are asserted in `apps/worker/src/report/report-ledger.db.test.ts` (an added `it` on LED-15): `cases[0].state` is the stored state, `patient_balance` true, and the `openCases` count unchanged.

---

## 4. Files

**A** = addition (new file, or new lines only). **X** = exception-change (changes behaviour under #12's freeze exception). **W** = wording. None of these files is on `/tmp/claude-0/pr42-files.txt` except the three shared documents and `matrix.ts` (marked †).

| File | Change | Kind |
| --- | --- | --- |
| `packages/ledger/src/payment.ts` | new: `paymentChain`, `paymentOutcome`, `reversalTakeBack`, `patientShareChange` and their types | A |
| `packages/ledger/src/payment.test.ts` | new: section 3.6 A | A |
| `packages/ledger/src/index.ts` | one `export { … } from './payment'` | A |
| `stryker/shards.json` | `packages/ledger/src/payment.ts` added to money-ledger's `ledger` list (sorted) | A |
| `apps/worker/src/reconcile/remittances.ts` | `reprocessingOf` (one helper for matchClaims and manual) uses `paymentChain` and `paymentOutcome`; `noPaymentIncrease` and `decreasedNoEntry` counters; A_b and P_b from `paymentChain`, carried pass-locally (1.1); recoupReversals uses `reversalTakeBack` (query widened to learn which chain claims stand); `confirmedBy` removed; `unpaidApproval` kept for `reprocessing()`'s direction only; `remittanceBaseline` no longer called; docblocks | X |
| `apps/worker/src/reconcile/postings.ts` | `shares()`: byClaim and byRemittance from `net(n)`; reversals no longer added by remittance; docblock (lines 20-30, 230-243) | X |
| `apps/worker/src/reconcile/manual.ts` | `matchClaimByHand` through `reprocessingOf`; writes the payment-terms amount; the no-payment-increase and decreased-with-no-entry outcomes write the match only | X |
| `apps/worker/src/reconcile/shortfalls.ts` | `U` in payment terms | X |
| `apps/worker/src/reconcile/responses.ts` | docblock: the amount is the payer's payment | W |
| `apps/worker/src/reconcile/patient-share.ts` | new: `lineCorrections` (one definition of the correction kind, 2.3), the claim-level PR allocation with its exact fraction (N2) | A |
| `apps/worker/src/reconcile/public.ts` | export `lineCorrections` and its type | A |
| `apps/worker/src/reconcile/payment-terms.db.test.ts` | new: section 3.6 B | A |
| `apps/worker/src/reconcile/ledger-oracle.db.test.ts` | four `CASES` entries appended | A |
| `apps/worker/src/report/html.ts`, `apps/worker/src/report/content.ts` | both Payer approved notes, including `approvedNone` (W); `content.ts` adds `patient_balance` beside the stored `state` from `lineCorrections`, and `caseStateText` renders it (A; S6) | W/A |
| `apps/worker/src/report/report-ledger.db.test.ts`, `apps/worker/src/report/report.test.ts` | one `it`; :156's note and the new assertions (3.6 D) | A/W |
| `packages/triage/src/headline.ts`, `packages/triage/src/headline.test.ts` | the payer approved note (:54); one assertion | W |
| `apps/web/src/lib/reconciliation/queries.ts` | `LinkageLine` gains `correction` (figures, reason words gated, its kind `'patient_balance' | 'other_reductions' | null`); `MatchView` gains `paymentIncreaseCents` and the match's correction words key (S5) | A |
| `apps/web/src/app/p/[practiceId]/reconciliation/page.tsx` | the billable and patient-balance paragraphs; the ERA payment words | A/W |
| `apps/web/src/components/reconciliation/display.tsx` (+ a new `display.test.tsx` beside it; none exists at 6ddd587) | LedgerTotals approved note; `correctionWords()`, which replaces `outcomeWords` for the Q2, decreased-with-no-entry, patient-balance and other-reductions matches (S5) | W/A |
| `apps/web/src/app/p/[practiceId]/abstraction/ledger/page.tsx` | the shortfall item names the patient's share of the correction, amounts only (S7) | W |
| `apps/web/src/lib/routes/triage.ts` | CaseLedger gains the case's billable total and `patientBalance` (the case qualifies, 2.3) | A |
| `apps/web/src/app/p/[practiceId]/cases/[caseId]/page.tsx` | "Billable to the patient" Fact; line paragraph; patient-balance words beside the state; `PROOF_TEXT` replaced by `proofLevelWords` (improvement) | A/W |
| `apps/web/src/app/p/[practiceId]/cases/[caseId]/submissions/page.tsx` | form label and the response's listing words | W |
| `apps/web/src/app/p/[practiceId]/page.tsx` | dashboard tile note (the data comes through `lib/dashboard/queries.ts`, unchanged; the route `lib/routes/practice.ts` is #42's and untouched) | W |
| `apps/web/src/components/reports/display.tsx` (+ `display.test.tsx:83`) | the payer approved note | W |
| `apps/web/src/lib/routes/reconciliation-routes.db.test.ts` | new `it`s | A |
| `apps/web/e2e/ledger-patient-share.spec.ts`, `apps/web/e2e/ledger.ts` | new spec; helpers added | A |
| `apps/web/e2e/packets.spec.ts` | the form label at :431 and the listing words at :434 | W |
| `packages/synth/src/cases/workflow.ts` | `led14` to `led18` | A |
| `packages/synth/src/cases/registry.ts` † | five entries after LED-13 | A |
| `packages/synth/src/cases/matrix.ts` † | five rows after LED-13 | A |
| `fixtures/synthetic/LED-14..LED-18/**` | generated by `pnpm synth` | A |
| `docs/product/test-matrix.md` † | five rows and the paragraph | A |
| `docs/product/reconciliation-001.md` † | item 15b; two check amendments; item 15's boundary sentence | A |
| `docs/product/PRD.md` | section 13 (three places), section 12's parenthetical | W |
| `docs/adr/0067-…md` | new | A |

- **Additions-only check for `packages/ledger/src`:** the only non-test change is the new `payment.ts` and one export line in `index.ts`. `matching.ts` (with `reprocessing()`), `allocation.ts`, `totals.ts`, `roi.ts`, `stages.ts` and `statement.ts` are byte-identical (`git diff --exit-code <base> -- packages/ledger/src ':!packages/ledger/src/payment*.ts' ':!packages/ledger/src/index.ts'`). The behaviour that changes is the worker's use of `pay` in `rem`, `post`, `manual.ts` and `shortfalls.ts`: exactly the amounts matching writes, the posting share, the reversal take-back and the deductible-absorbed outcome, which #12's exception covers. `LEDGER_STAGES`, the seven entry types, recovered (totals.ts) and the proof cap (post's room) are untouched.
- **Engine freeze:** nothing under `packages/pricing`; `fixtures/golden` and the rule releases untouched.
- **#42:** beyond the three shared documents, 15b touches `matrix.ts` (†). It mirrors `test-matrix.md` word for word (`fixtures.test.ts:33-44`), so 15b cannot add rows without it. 15b's hunks (after LED-13, matrix.ts:141) do not overlap #42's (after SEC-17 and SCR/JOB). **Decided (S1):** `matrix.ts` is the synth registry's mirror and is shared under LANES rule 6 (LANES.md:90 names "the synth registry"). Precedent: f4d125b (PR 15's merge of #44, "both sides kept (LANES.md rule 6)", matrix.ts +3) and da4d7e9 (ci-mutation's merge of #43, "resolved under rule 6", matrix.ts +10). The PR merged second keeps both sides and runs `pnpm synth --all` with a clean diff.

---

## 5. Screens

### 5.1 Routes whose figures or words change (for the before/after tour, at 1280 and 390 px)

| Route | What changes |
| --- | --- |
| `/p/[practiceId]` | Payer approved and recovered values; tile note |
| `/p/[practiceId]/reconciliation` | totals values and the approved note; per line: ERA payment words, billable paragraph, patient-balance words, shortfall in payment terms |
| `/p/[practiceId]/reconciliation?case=[caseId]` | the same for one case |
| `/p/[practiceId]/cases/[caseId]` | Payer approved, Recovered, the new "Billable to the patient" Fact, line paragraphs, patient-balance words beside the state |
| `/p/[practiceId]/cases/[caseId]/submissions` | form label; response listing words |
| `/p/[practiceId]/reports/roi` and `/p/[practiceId]/reports/roi/[statementId]` (+ `/pdf`, `/csv`) | values only, for new statements (approved-unposted 0 once proved) |
| `/p/[practiceId]/abstraction/ledger` | totals values; the shortfall item names the patient's share of the correction, amounts only (S7) |
| the audit report PDF (`apps/worker/src/report`) | both payer approved notes; the patient-balance words after the stored state |
| `/p/[practiceId]/reports` | values only: the reports list's payer approved figure (`reports/page.tsx:138-140`), for reports generated after 15b (S8) |
| `/p/[practiceId]/cases` | values only: line stage chips and buckets (coinsurance lines now reach `recovered`) (S8) |
| `/p/[practiceId]/claims` | values only: line stage chips (`lib/remittances/queries.ts:411-415`) (S8) |
| `/p/[practiceId]/remittances` and `/p/[practiceId]/remittances/[remittanceId]` | values only: line stages and summary buckets (`lib/remittances/queries.ts:411-415`) (S8) |
| `/p/[practiceId]/reports/monthly` and `/p/[practiceId]/digests/[digestId]` | values only: the monitoring stage buckets (`lib/monitoring/queries.ts:153`, a #42 file, read and not edited). There is no `/monitoring` route at 6ddd587: `lib/routes/monitoring.ts` serves these two pages (S8, corrected); a digest shows new values only in digests written after 15b |

**Populate:** today's tour data (LED-06, share-free) gives identical before and after figures. Recommended: a tour-side populate spec in `/home/user/ops/tools/lane-b-screen-tour` that loads the head's LED-14 to LED-18 fixture files through the product's e2e helpers, run against both the base build (6ddd587 or the merge base) and the head, so the same data drives both shots. The repo's `apps/web/e2e/ledger-patient-share.spec.ts` does the same for the head and is added to the tour's `testMatch`. Shots: the routes above for the LED-14, LED-15 and LED-18 practices, plus an ROI statement generated on demand (a tour action), and one shot each of the values-only routes (reports list, cases, claims, a remittance, the monthly report) on the LED-14 practice after its deposit (S8). The tour data is regenerated from the head's fixtures, never reused from a database seeded before 15b (N7).

### 5.2 Brand and copy rules met

- Every figure in `<Money>` (mono, tabular).
- Expected, paid and short keep their order where they appear. The billable paragraph names allowed, then the payer's payment, then the patient's share.
- "Recovered" never appears in new copy. "Counted in no total" is used instead, so `pnpm lint:copy` (tools/brand-copy/scan.ts) passes.
- No AI or intelligence words (CO-11).
- Status colours only with text.
- Billable to the patient never on the headline (PRD 12; BRAND.md s1: "never a projected dollar presented as recovered") and never on the ROI statement.

### 5.3 The words (recommended; reported as wording choices)

| Where | Today | Recommended |
| --- | --- | --- |
| Reconciliation, new paragraph (`data-billable`) | none | "Billable to the patient: {$6.00} ({coinsurance +$6.00}). The payer raised the allowed amount by {$30.00} and pays {$24.00} of it; the rest is the patient's share, counted in no total." With more than one reason, each signed change is listed ("coinsurance +$16.00, deductible −$10.00") and the figure is their net (N1). (Non-PHI readers: "the patient's share" in place of the reasons.) |
| Reconciliation, patient-balance line | none | "Payer corrected; balance is the patient's. The payer raised the allowed amount by {$30.00} and pays nothing more: the patient's {deductible} took all of it. No ledger entry is written; counted in no total." |
| ERA match words (display.tsx:133; `correctionWords` replaces `outcomeWords` in the four cases below, S5) | "higher allowed: approved" | Ordinary approval: "higher allowed: approved; the payer pays {$24.00} more" (the 'higher allowed: approved' prefix stays, so reconciliation.spec.ts:125 holds). Patient balance: "higher allowed: payer corrected; balance is the patient's". Other reductions: "higher allowed: payer corrected; it pays nothing more (other reductions)". Q2 with a take-back: "higher allowed, lower payment: approval taken back" (the same allowed amount: "same allowed, lower payment: approval taken back"). B2: "higher allowed, lower payment: nothing approved to take back". A lower allowed whose payment did not fall (a decreased match with no entry): "lower allowed: nothing taken back, the payment did not fall". A lower allowed with a take-back keeps "lower allowed: approval taken back" |
| Shortfall paragraph, when the line's patient share rose | "the payer accepted $X more than its remittance paid" | the same, then "; the patient's share of the correction is {$6.00}, billable to the patient if the letter accepted the allowed amount" |
| Specialist's ledger review shortfall (abstraction/ledger/page.tsx:133-135, S7) | "The payer accepted $X more than its remittance paid on this case line. Correct the approval, or leave it for the practice to dispute." | the same, then, when the patient's share of the correction is positive: "The patient's share of the correction is {$6.00}; if the approval was typed as the allowed amount, correct it to what the payer will pay." (amounts only; the route reads with `phi = false`, so no reason words) |
| LedgerTotals approved note (display.tsx:74) | "accepted by the payer, net of reversals and of what was taken back before it posted; recovered only once it is posted or deposited" | "what payers have agreed to pay on the lines they corrected, never the patient's share, net of reversals and of what was taken back before it posted; recovered only once it is posted or deposited" |
| Dashboard tile (page.tsx:213), reports display (display.tsx:73) | "what payers accepted, from the recovery ledger; not cash until it posts" | "what payers have agreed to pay on the lines they corrected, from the recovery ledger; not cash until it posts" |
| Audit report (html.ts:143), with approvals | "accepted by the payer, from the ledger's entries; not cash until it posts" | "what payers have agreed to pay on the lines they corrected, from the ledger's entries; not cash until it posts" |
| Audit report (html.ts:143), `approvedNone` (S4) | "accepted by the payer; no payer approval is recorded yet" | "what payers have agreed to pay on the lines they corrected; no payer approval is recorded yet" |
| Headline note (`packages/triage/src/headline.ts:54`, S4) | "accepted by the payer" | "what payers have agreed to pay on the lines they corrected" |
| Response form label (submissions/page.tsx:320) | "Amount accepted (accepted or partial only, dollars)" | "Amount the payer will pay (accepted or partial only, dollars)", with the hint "The additional payment the letter states, not the allowed amount; the patient's share is never part of it." |
| Response listing (submissions/page.tsx:419) | "$X accepted (Payer approved once the recovery ledger approves it)" | "$X the payer will pay (Payer approved once the recovery ledger approves it)" |
| Case page Fact | none | "Billable to the patient" {$6.00}, note "the patient's share of the payer's corrections; counted in no total" |
| Case state (beside the badge) | the stored state | the stored state, then "Payer corrected; balance is the patient's" when the case qualifies (section 2.3) |
| Audit report State (`caseStateText`, S6) | "{state}" | "{state}; payer corrected, balance is the patient's", the `state` field unchanged |
| Reconciliation, other-reductions line (S13) | none | "Payer corrected; it pays nothing more (other reductions). The payer raised the allowed amount by {$30.00} and reduced its payment by the same for other reasons, not billable to the patient. No ledger entry is written; counted in no total." |

Each visible change has a test: the route test and the e2e spec (Reconciliation, case, ERA words, dashboard exclusion, the specialist's shortfall), the reports `display.test.tsx` (the reports note), the new reconciliation `display.test.tsx` (every `correctionWords` case and the LedgerTotals note), `packets.spec.ts` (the label and the listing), `report.test.ts` (both notes and the State text), `headline.test.ts` (the headline note), and `copy.spec.ts`/`lint:copy` for the lint.

---

## 6. Checks

Environment for every command: `export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH; export DATABASE_URL=postgres://postgres:test@localhost:5433/postgres`. Every heavy command runs under `flock /tmp/laneb-heavy.lock`.

**Builders** (each checks what they touch, per the efficient pipeline):

```
flock /tmp/laneb-heavy.lock pnpm typecheck
flock /tmp/laneb-heavy.lock pnpm lint
pnpm lint:copy; pnpm lint:logs
flock /tmp/laneb-heavy.lock pnpm -s exec vitest run --project unit packages/ledger packages/synth/src/fixtures.test.ts
flock /tmp/laneb-heavy.lock pnpm synth --case LED-14   # .. LED-18; then:
flock /tmp/laneb-heavy.lock pnpm synth --all && git diff --exit-code -- fixtures/synthetic ':!fixtures/synthetic/LED-1[4-8]'
flock /tmp/laneb-heavy.lock pnpm -s exec vitest run --project db apps/worker/src/reconcile apps/web/src/lib/routes/reconciliation-routes.db.test.ts apps/worker/src/report/report-ledger.db.test.ts
```

**Verifier and fix round** (full suite once; CI reads the rest):

```
flock /tmp/laneb-heavy.lock pnpm test            # unit + property
flock /tmp/laneb-heavy.lock pnpm test:golden
flock /tmp/laneb-heavy.lock pnpm test:oracle     # the parser oracle (unchanged)
flock /tmp/laneb-heavy.lock pnpm test:db         # CI: db (1/4)..(4/4); catalog and cross-tenant included; the ledger oracle is in it
flock /tmp/laneb-heavy.lock pnpm build && flock /tmp/laneb-heavy.lock pnpm test:e2e
pnpm verify-content
pnpm -s exec tsx tools/engine-freeze/check.ts "$(git merge-base origin/claude/build-platform HEAD)"   # Problems: None
export TP_MUTATION_SHARD=money-ledger
flock /tmp/laneb-heavy.lock pnpm stryker run tools/stryker/canary/stryker.config.mjs
pnpm -s exec tsx tools/stryker/canary/verdict.ts --shard money-ledger
flock /tmp/laneb-heavy.lock pnpm -s exec tsx tools/stryker/shards.ts money-ledger
pnpm -s exec tsx tools/stryker/gate.ts reports/mutation --expected money-ledger
pnpm -s exec vitest run tools/stryker/shards.test.ts
```

**Unchanged checks (against the merge base):**

- `git diff --exit-code <base> -- apps/worker/src/reconcile/ledger.db.test.ts apps/worker/src/reconcile/chain.db.test.ts apps/worker/src/reconcile/lines.db.test.ts packages/ledger/src/matching.ts packages/ledger/src/matching.test.ts packages/ledger/src/totals.ts packages/ledger/src/roi.ts packages/ledger/src/statement.ts packages/ledger/src/stages.ts packages/ledger/src/allocation.ts fixtures/synthetic/LED-0? fixtures/synthetic/LED-1[0-3] fixtures/golden packages/pricing/src packages/db/migrations`
- `orc`'s diff is additions inside `CASES` only.
- The LED-01..LED-13 rows in test-matrix.md, matrix.ts and registry.ts are unchanged.
- `docs/product/domain-model.md` is unchanged.

**Expected test-count changes:**

- `payment.test.ts`: about 24 to 30 `it` and property blocks.
- `payment-terms.db.test.ts`: about 25 `it`s (the review added B1, B2, S3 ×2, S9 ×2 and S13).
- The oracle: +4 `it.each` rows.
- reconciliation-routes: +3 (LED-14, LED-15, the specialist's shortfall).
- report: +1 db `it`; `report.test.ts` +2 assertions; `headline.test.ts` +1; the new reconciliation `display.test.tsx`: 1 file of about 3 `it`s.
- e2e: +1 spec of 2 to 3 tests.
- The fixtures test: same count (it iterates the registry).
- No existing test is removed. Four existing assertions change words only (S4): `apps/web/src/components/reports/display.test.tsx:83`, `apps/web/e2e/packets.spec.ts:431` and `:434`, and `apps/worker/src/report/report.test.ts:156`.

**Mutation plan:**

- `payment.ts` adds about 120 to 180 mutants to money-ledger. Section 3.6 A names the killer for each family.
- The gate must stay above 85% for ledger (baseline 98.13%, 1633 of 1664 with 31 recorded equivalents) and money (96.58%), with no unrecorded survivor.
- No existing file's text moves, so no recorded equivalent goes stale (gate.ts matches by occurrence). The equivalent records in `tools/stryker/equivalent/ledger.json` are not edited.
- `reversalTakeBack` has no redundant clamp (S2), and each clamp has a killing case (3.6 A7). A new equivalent in `payment.ts`, if one still proves unavoidable, is recorded with `reviewedBy` empty, for a reviewer who is not the proposer.
- `apps/worker/src/reconcile` is not mutation-tested, so all of its arithmetic moves into `pay`. The glue left in `rem`/`post` is pinned by the LED-14..18 db tests: LED-17 for the shares and the reversal, LED-15 for the no-entry branches (patient balance, other reductions, B2), LED-14 and LED-17's one-pass variants for the pass-local baselines (S3), LED-14's reissue for the allowed baseline (B1), and LED-16's two-line variant for the WO and interest glue.

---

## 7. Risks, and proposals outside this PR

### 7.1 Risks

1. **Q1 interim.** Until Lane A's stored close, a patient-balance line stays in actionable and follow-ups (labelled). If Lane A's PR 8 slips, the label carries the meaning for longer. Mitigation: the handover entry, and ADR 0067 naming the gap.
2. **Q2 (ruled).** On that edge the stored outcome follows the payment. A reader who expects "decreased" to mean a lower allowed amount is told otherwise by the words ("higher allowed, lower payment: …"), on the ERA list and in ADR 0067.
3. **Response amounts.** The acceptance is the payer's payment only if the person types it so (the label and hint). A person typing the allowed amount produces a shortfall equal to the patient's share, now named beside it. #11 (Lane A, per-line decisions) replaces the case-level amount later.
4. **The `matrix.ts` overlap with #42.** Decided under rule 6 (section 4); the hunks do not overlap, and the PR merged second keeps both.
5. **The parallel Lane B sessions** (superseded re-run, db-function diffs, release content checks) may also edit reconciliation-001 and test-matrix: rule 6 applies, and the PR merged second keeps both.
6. **#46 (Verified seal)** will touch `apps/worker/src/report` and the ROI pages later. 15b's report edits are two strings and one derived column word, a small conflict surface.
7. **Gross versus net on a line with one approval** is masked by the proof cap. Only LED-17's order (line rows before the EFT) and LED-18 catch a regression to gross shares.
8. **A reversal and its correction in different remittances** (early or late) is handled by the chain's order. A bug there shows only in LED-17 (c) and the `pay` early-reversal unit, so both are mandatory.
9. **Stored data is synthetic only**, so no existing entry needs converting. If any environment had real allowed-terms entries, they would stay as written (append-only), and a person's `adjusted` entry would correct them. Stated in ADR 0067. Synthetic development data seeded before 15b holds approvals in allowed terms, and mixing them with P_b gives false shortfalls (`U = remaining − (P_b − p0)`), so `pnpm db:seed` and the screen tour's data are regenerated after 15b, never reused (N7).

### 7.2 Proposals outside this PR

- **Lane A:** the stored close (0.3), with PR 8 beside #11.
- **A PLB WO, then the same correction sent again** (design review N4): P_b and A_b subtract the WO, so the resend's `g = 80 − 56 = 24` is approved again, and its net share can prove it. This happens today too and 15b does not change it. Decide whether a WO lowers the payment baseline at all (a ledger rule change: a later exception or ruling), with a fixture.
- **A PLB WO on a line with a patient share** keeps subtracting cash from A_b (1.1), which can read above the true allowed baseline and only understate a later rise. Decide with the item above.
- **`takeInOrder`'s `rest`** (rem:460): a PLB WO amount no line absorbs is dropped silently. List it on Reconciliation (a ledger rule change: a later exception or ruling).
- **The unmatched adjusted-payments list** (`unmatched.ts:116-141`) shows observed allowed only. Add the paired paid amount and the patient's share for the person matching by hand.
- **A PM posting the net (24.00) as a line-level row** matches nothing, because `postsLine` requires paid == row (matching.ts:108). Changing it is a matching-rule change outside #12. Propose it with a fixture.
- **Mutation-test the worker's money glue**, or keep moving its arithmetic into `packages/ledger`, so m7-type survivors cannot hide in `apps/worker`.
- **A synth lint** that refuses a case-line generator with `share: 'none'` unless the case says why, so "no ledger test has a patient share" cannot recur.
- **Add LED-12 and LED-14 to `chain.db.test.ts`**, so its "every LED case" docstring holds.
- **The screen tour:** add the case ledger `?case=`, the ledger case's page, submissions, the ROI list and the audit report PDF to `tour.spec.ts`, and keep the LED-14..18 populate spec for later ledger PRs.
- **`STAGE_WORDS`** (statement-html.ts:45-53) duplicates `ENTRY_STAGE_WORDS` (display.tsx:15-23). Move them to `@tp/ledger` beside `recoveredLabel` in a later PR.

---

## 8. Build plan (one worktree `/home/user/pr15b`, branch `co-001/pr-15b-ledger-payment-terms` from the latest `claude/build-platform`)

Setup (lead): `git -C /home/user/PhysicalTherapy worktree add -b co-001/pr-15b-ledger-payment-terms /home/user/pr15b origin/claude/build-platform`; `pnpm install --frozen-lockfile --prefer-offline`. Each builder commits only its own files. Commits are made in order, and no two builders edit the same file.

1. **Builder 1, the ledger core** (first; the others build against its API):
   - Files: `packages/ledger/src/payment.ts`, `payment.test.ts`, `index.ts` (export line), `stryker/shards.json`.
   - The API is exactly section 1's: `paymentChain(originalPaid, events) → { before: Map<matchId, Cents>, net: Map<matchId, Cents>, current: Cents }`, `paymentOutcome`, `reversalTakeBack`, `patientShareChange`.
   - Runs the unit tests, typecheck, lint, and the money-ledger mutation shard with the gate.
2. **Builder 2, fixtures and records** (parallel with 1):
   - Files: `packages/synth/src/cases/workflow.ts`, `registry.ts`, `matrix.ts` (rule 6, section 4), `fixtures/synthetic/LED-14..18`, `docs/product/test-matrix.md`, `docs/product/reconciliation-001.md`, `docs/product/PRD.md`, `docs/adr/0067-…md`.
   - Runs `pnpm synth --all` with a clean diff outside LED-14..18, and the fixtures test. Q1 and Q2's rulings (0.5) are written into ADR 0067 and item 15b as recorded here.
3. **Builder 3, the worker** (after 1's commit):
   - Files: `rem`, `post`, `manual.ts`, `shortfalls.ts`, `responses.ts`, `patient-share.ts`, `public.ts`, `payment-terms.db.test.ts`, `orc` (append).
   - Runs the reconcile db suites, then confirms ldb, chain, lines and orc's six cases pass unchanged.
4. **Builder 4, screens** (after 3's `lineCorrections` signature; may start against section 2's types):
   - Files: `apps/web/src/lib/reconciliation/queries.ts`, `reconciliation/page.tsx`, `components/reconciliation/display.tsx`, `lib/routes/triage.ts`, `cases/[caseId]/page.tsx`, `submissions/page.tsx`, `app/p/[practiceId]/page.tsx`, `components/reports/display.tsx` and its test, `apps/worker/src/report/{html,content}.ts` and its test, `reconciliation-routes.db.test.ts`, `e2e/ledger-patient-share.spec.ts`, `e2e/ledger.ts`, `e2e/packets.spec.ts`.
   - Runs typecheck, lint, `lint:copy`, the route test and the e2e spec.
5. **The lead:**
   - Opens the draft PR from `.github/pull_request_template.md` (into `claude/build-platform`) and subscribes.
   - Reviews follow: the payment-engine reviewer (`.claude/agents/payment-engine-reviewer.md`), and UX and brand with the before/after tour at 1280 and 390 px.
   - Then the fix round with the full local suite, and the fresh-clone verification that reads CI.

---

## 9. Design review (2026-10-26)

The review (`/tmp/claude-0/-home-user-PhysicalTherapy/60beef46-8756-559c-bbb4-ddf67ef623a2/scratchpad/pr15b-design/review.md`) read the design as ruled (0.5). Each finding was checked against the code at 6ddd587 before it was applied. No finding argued a ruled answer wrong; B2 completes Q2's ruled rule on a case it did not name, inside the rule. After the revision nothing 15b builds needs a migration, and no section waits on a question.

| ID | Severity | Disposition | Where applied |
| --- | --- | --- | --- |
| B1 | blocking | **Accepted.** Verified: `remittanceBaseline` adds every recouped entry after the anchor (rem:234-244), so a cash take-back mixes terms (LED-14 reversed reads 76.00). A_b is now walked in allowed terms beside P_b. One correction to the review's fix: a capped decrease sets A_b to allowed(n) **plus** the remainder the cap left, not less (today's capped baseline is `A_b − remaining` = allowed(n) + (A_b − allowed(n) − remaining)); the reversal's translation also carries a prior WO, checked equal to today's on share-free lines | 0.2, 1.1, 1.3, 1.6, 3.5 LED-14 `reissued.835`, 3.6 A1, A6, B (LED-14) |
| B2 | blocking | **Accepted.** Verified: no trigger requires an entry for a `'decreased'` match (20261023120000:158, 451-452; 20261027090000:125). Allowed higher, payment lower, nothing approved: `'decreased'`, no entry, no response, not an anchor. With the allowed amount the same and nothing approved the outcome stays `no_change`, as today | 0.3, 0.5, 1.2, 1.3, 3.1, 3.4 LED-15, 3.5 LED-15, 3.6 A5, B, 5.3 |
| S1 | should_fix | **Accepted.** All ten places rewritten as ruled on 2026-10-26 ~01:05 UTC under the standing ruling of ~00:20 UTC. 0.3 states 15b needs no migration and the stored close is Lane A's. 0.4 is a record. `matrix.ts` decided under rule 6 (LANES.md:90; precedent f4d125b and da4d7e9, both verified to change `matrix.ts`) | 0.3, 0.4, 3.1, 3.2, 3.3, 3.6 A5, 4, 7.1, 8 |
| S2 | should_fix | **Accepted.** The inner clamp is dropped (it was equivalent); the outer clamp gains its killing case, and the design names a real path through `rem` that reaches it | 1.2, 1.5, 3.6 A7, 6 |
| S3 | should_fix | **Accepted.** Verified at rem:300-345. A_b and P_b are carried pass-locally; two one-pass db tests added | 1.1, 3.6 B (LED-14, LED-17), 3.5 LED-14 `lowered.835` |
| S4 | should_fix | **Accepted.** Verified all four assertions and both notes. Words and tests listed; `headline.ts` and its test added to the files | 3.6 D, 4, 5.3, 6 |
| S5 | should_fix | **Accepted.** `correctionWords` replaces `outcomeWords` in the Q2, decreased-with-no-entry, patient-balance and other-reductions cases; the ordinary approval keeps "higher allowed: approved" | 4, 5.3, 3.6 D |
| S6 | should_fix | **Accepted.** `state` stays as stored; a separate `patient_balance` field, rendered by `caseStateText` | 2.3, 4, 5.3, 3.6 D |
| S7 | should_fix | **Accepted.** The specialist's ledger review page added, amounts only | 2.2, 4, 5.1, 5.3, 3.6 D |
| S8 | should_fix | **Accepted, one route corrected.** There is no `/p/[practiceId]/monitoring` route at 6ddd587; the monitoring buckets render on `/reports/monthly` and `/digests/[digestId]` (`lib/routes/monitoring.ts`), which are listed instead. `lib/monitoring/queries.ts` is a #42 file and is not edited | 5.1 |
| S9 | should_fix | **Accepted.** A shared-check partial posting (LED-14) and a two-line claim with interest and a WO (LED-16). Two notes: today's check-level share already nets a reversal in the same remittance, so the partial case pins a regression to a gross share rather than today's code; and the two lines are coinsurance and copay rather than two coinsurance lines, because equal coinsurance lines split interest the same way by allowed and by payment | 3.4, 3.5, 3.6 B |
| S10 | should_fix | **Accepted.** Recorded as a recommended choice in 0.5 and ADR 0067, quoting LED-12's row and N-5 | 0.5, 1.3, 3.2 |
| S11 | should_fix | **Accepted.** "what payers have agreed to pay on the lines they corrected" everywhere | 5.3 |
| S12 | should_fix | **Accepted.** LED-14's and LED-17's top-level outcomes are the oracle steps' path (LED-17 variant (a)); LED-15's holds `entries` [] and no `recoveredCents` | 3.5, 3.6 C |
| S13 | should_fix | **Accepted.** One definition from the stored no-entry approving match with `net(n) == 0`; `paymentIncreaseCents` is the ledger's `net(n)`; the other-reductions words added; the counter is `noPaymentIncrease` | 1.2, 1.4, 2.1, 2.3, 3.6 B, 5.3 |
| N1 | nit | **Accepted.** `max(0, net sum)`, signed changes shown by reason | 2.1, 5.3 |
| N2 | nit | **Accepted.** The allocation and its exact fraction are computed in `patient-share.ts` (the worker already depends on `@tp/edi835`); `@tp/ledger` gains no dependency | 1.1, 4 |
| N3 | nit | **Accepted.** Noted in 1.2 and ADR 0067 | 1.2, 3.2 |
| N4 | nit | **Accepted.** Added to 7.2 with the WO's coinsurance effect | 3.2, 7.2 |
| N5 | nit | **Accepted.** Stated in 1.3 and ADR 0067 | 1.3, 3.2 |
| N6 | nit | **Accepted.** Stated in the interest row | 1.2 |
| N7 | nit | **Accepted.** `db:seed` and the tour data are regenerated | 5.1, 7.1 |
